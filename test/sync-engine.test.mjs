// Two simulated devices syncing through the real server-side sync handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSync, MAX_SYNC_BYTES } from '../src/sync.js';
import { listSynced, getSynced, putSynced, deleteSynced } from '../netlify/lib/sync.mjs';

const T0 = Date.UTC(2026, 0, 1);
const user = { uid: 'u1', email: 'a@example.com' };
const para = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

function fakeStore() {
  const m = new Map();
  let n = 0;
  return {
    m,
    get: async (k) => (m.has(k) ? structuredClone(m.get(k).v) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k).v), etag: m.get(k).etag } : null),
    setJSON: async (k, v, o = {}) => {
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch && m.get(k)?.etag !== o.onlyIfMatch) return { modified: false };
      m.set(k, { v: structuredClone(v), etag: `"e${++n}"` });
      return { modified: true };
    },
  };
}

function cloud({ subscribed = true } = {}) {
  const deps = {
    store: fakeStore(), docs: fakeStore(), index: fakeStore(), now: T0,
    stripe: { subscriptions: { list: async () => ({ data: subscribed ? [{ status: 'active' }] : [] }) } },
  };
  deps.store.m.set('u1', { v: { email: user.email, trialStart: T0, customerId: 'cus_1' }, etag: '"u"' });
  return {
    deps,
    async request(path, { method = 'GET', body } = {}) {
      const q = new URL(path, 'https://x').searchParams;
      try {
        if (method === 'PUT') return structuredClone(await putSynced(user, body, deps));
        if (method === 'DELETE') return structuredClone(await deleteSynced(user, q.get('id'), q.get('baseRev'), deps));
        return structuredClone(q.has('id') ? await getSynced(user, q.get('id'), deps) : await listSynced(user, deps));
      } catch (e) {
        const err = new Error(e.message);
        err.status = e.status;
        throw err;
      }
    },
  };
}

let ids = 0;
function device(server, uid = 'u1') {
  const docs = new Map();
  let meta = { owner: null, docs: {}, purge: {}, last: 0 };
  const d = {
    docs, uid,
    get meta() { return meta; },
    deps: {
      uid,
      now: () => T0,
      newId: () => `copy-${++ids}`,
      request: (...a) => d.onRequest(...a),
      allDocs: async () => [...docs.values()].map((x) => structuredClone(x)),
      writeDoc: async (doc) => { docs.set(doc.id, structuredClone(doc)); },
      deleteDoc: async (id, { sync = true } = {}) => { if (sync) d.purged(id); docs.delete(id); },
      readSync: () => structuredClone(meta),
      writeSync: (m) => { meta = structuredClone(m); },
    },
    onRequest: (...a) => server.request(...a),
    // What storage.js does when the person edits: save, then mark it changed (once syncing).
    edit(id, patch) {
      docs.set(id, { id, title: id, content: para(''), settings: {}, created: T0, ...docs.get(id), ...patch, updated: T0 });
      if (meta.owner) meta.docs[id] = { ...meta.docs[id], dirty: true };
    },
    purged(id) {
      const rev = meta.docs[id]?.rev;
      delete meta.docs[id];
      if (rev) meta.purge[id] = rev;
    },
    sync: (mode) => runSync(d.deps, mode),
    text: (id) => docs.get(id)?.content.content[0].content[0].text,
  };
  return d;
}

test('documents written on one device appear on the other', async () => {
  const server = cloud();
  const laptop = device(server);
  const phone = device(server);
  laptop.edit('cv', { title: 'CV', content: para('Draft 1') });
  laptop.edit('letter', { content: para('Dear') });
  await laptop.sync();
  const r = await phone.sync();
  assert.deepEqual(r.changed.sort(), ['cv', 'letter']);
  assert.equal(phone.text('cv'), 'Draft 1');
  assert.equal(phone.docs.get('cv').title, 'CV');
  assert.equal(phone.docs.get('cv').rev, undefined, 'revisions are not stored in documents');

  phone.edit('cv', { content: para('Draft 2') });
  await phone.sync();
  assert.deepEqual((await laptop.sync()).changed, ['cv']);
  assert.equal(laptop.text('cv'), 'Draft 2');
  assert.deepEqual((await laptop.sync()).changed, [], 'nothing left to do');
});

test('edits on both devices: nothing is lost, a conflict copy keeps this device\'s version', async () => {
  const server = cloud();
  const laptop = device(server);
  const phone = device(server);
  laptop.edit('cv', { title: 'CV', content: para('base') });
  await laptop.sync();
  await phone.sync();
  laptop.edit('cv', { content: para('laptop edit') });
  phone.edit('cv', { content: para('phone edit') });
  await laptop.sync();
  const r = await phone.sync();
  assert.equal(r.conflicts, 1);
  assert.equal(phone.text('cv'), 'laptop edit');
  const copy = [...phone.docs.values()].find((x) => x.title === 'CV (conflict copy)');
  assert.equal(copy.content.content[0].content[0].text, 'phone edit');
  await laptop.sync();
  assert.ok([...laptop.docs.values()].some((x) => x.title === 'CV (conflict copy)'), 'the copy reaches the other device');
});

test('the same edit on both devices is not a conflict', async () => {
  const server = cloud();
  const a = device(server);
  const b = device(server);
  a.edit('x', { content: para('same') });
  b.edit('x', { content: para('same') });
  await a.sync();
  assert.equal((await b.sync()).conflicts, 0);
  assert.equal(b.docs.size, 1);
});

test('Recycle Bin and deleting forever sync, and a later edit elsewhere brings a document back', async () => {
  const server = cloud();
  const a = device(server);
  const b = device(server);
  a.edit('x', { content: para('one') });
  a.edit('y', { content: para('two') });
  await a.sync();
  await b.sync();

  a.edit('x', { deleted: T0 });
  await a.sync();
  await b.sync();
  assert.equal(b.docs.get('x').deleted, T0, 'moved to the Recycle Bin on the other device');

  await a.deps.deleteDoc('x');
  await a.sync();
  assert.deepEqual((await b.sync()).changed, ['x']);
  assert.equal(b.docs.has('x'), false, 'deleted forever on the other device');

  // b edits y while a deletes it forever without having seen the edit.
  await a.deps.deleteDoc('y');
  b.edit('y', { content: para('kept') });
  await b.sync();
  await a.sync();
  assert.equal(a.text('y'), 'kept');
  assert.equal(b.text('y'), 'kept');
});

test('a lapsed subscriber can still download but not upload', async () => {
  const live = cloud();
  const a = device(live);
  a.edit('x', { content: para('mine') });
  await a.sync();
  const lapsed = cloud({ subscribed: false });
  lapsed.deps.docs = live.deps.docs;
  lapsed.deps.index = live.deps.index;
  const b = device(lapsed);
  b.edit('new', { content: para('offline') });
  const r = await b.sync('full');
  assert.equal(r.notSubscribed, true);
  assert.equal(b.text('x'), 'mine');
  assert.equal(b.meta.docs.new, undefined, 'the unsent document stays waiting to upload');
  assert.deepEqual((await device(lapsed).sync('pull')).changed, ['x']);
});

test('a device that synced with another account refuses to mix documents', async () => {
  const server = cloud();
  const a = device(server);
  a.deps.writeSync({ owner: 'someone-else', docs: {}, purge: {}, last: 0 });
  await assert.rejects(a.sync(), (e) => e.code === 'OTHER_ACCOUNT');
});

test('typing during an upload keeps the document marked as changed', async () => {
  const server = cloud();
  const a = device(server);
  await a.sync();
  a.edit('x', { content: para('v1') });
  a.onRequest = async (path, init) => {
    if (init?.method === 'PUT') a.edit('x', { content: para('v2') });
    return server.request(path, init);
  };
  await a.sync();
  assert.equal(a.meta.docs.x.dirty, true);
  a.onRequest = (...args) => server.request(...args);
  await a.sync();
  assert.equal(a.meta.docs.x.dirty, false);
  const b = device(server);
  await b.sync();
  assert.equal(b.text('x'), 'v2');
});

test('documents too large to sync are reported and skipped', async () => {
  const server = cloud();
  const a = device(server);
  a.edit('big', { title: 'Photos', content: para('x'.repeat(MAX_SYNC_BYTES)) });
  a.edit('small', { content: para('ok') });
  const r = await a.sync();
  assert.deepEqual(r.tooLarge, ['Photos']);
  assert.deepEqual((await listSynced(user, server.deps)).docs.map((d) => d.id), ['small']);
});

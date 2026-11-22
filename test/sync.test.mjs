import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listSynced, getSynced, putSynced, deleteSynced, MAX_DOC_BYTES, PLAN_CHECK_MS } from '../netlify/lib/sync.mjs';

const T0 = Date.UTC(2026, 0, 1);
const user = { uid: 'u1', email: 'a@example.com' };
const other = { uid: 'u2', email: 'b@example.com' };
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] };
const doc = (id, extra = {}) => ({ id, title: `Doc ${id}`, content, settings: {}, created: T0, updated: T0, ...extra });

// An in-memory Netlify Blobs store with ETags and conditional writes.
function fakeStore() {
  const m = new Map();
  let n = 0;
  return {
    m,
    get: async (k) => (m.has(k) ? structuredClone(m.get(k).v) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k).v), etag: m.get(k).etag, metadata: {} } : null),
    setJSON: async (k, v, o = {}) => {
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch && m.get(k)?.etag !== o.onlyIfMatch) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: structuredClone(v), etag });
      return { modified: true, etag };
    },
  };
}

function setup({ subscribed = true } = {}) {
  const stripeCalls = [];
  const deps = {
    store: fakeStore(),
    docs: fakeStore(),
    index: fakeStore(),
    now: T0,
    stripe: {
      subscriptions: {
        list: async () => { stripeCalls.push(1); return { data: subscribed ? [{ status: 'active' }] : [] }; },
      },
    },
  };
  deps.store.m.set('u1', { v: { email: user.email, trialStart: T0, customerId: 'cus_1' }, etag: '"u"' });
  deps.store.m.set('u2', { v: { email: other.email, trialStart: T0, customerId: 'cus_2' }, etag: '"u"' });
  return { deps, stripeCalls };
}
const put = (u, d, baseRev, deps) => putSynced(u, JSON.stringify({ doc: d, baseRev }), deps);

test('upload, list and download a document', async () => {
  const { deps } = setup();
  const { rev } = await put(user, doc('a', { jobDescription: 'DE' }), null, deps);
  assert.match(rev, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await listSynced(user, deps), { docs: [{ id: 'a', rev }] });
  const { doc: back } = await getSynced(user, 'a', deps);
  assert.deepEqual(back, { ...doc('a', { jobDescription: 'DE' }), rev });
});

test('people only see their own documents', async () => {
  const { deps } = setup();
  await put(user, doc('a'), null, deps);
  assert.deepEqual(await listSynced(other, deps), { docs: [] });
  await assert.rejects(getSynced(other, 'a', deps), { status: 404 });
});

test('an edit based on an older revision is refused, so nothing is overwritten', async () => {
  const { deps } = setup();
  const r1 = (await put(user, doc('a'), null, deps)).rev;
  const r2 = (await put(user, doc('a', { title: 'Laptop edit', updated: T0 + 1 }), r1, deps)).rev;
  await assert.rejects(put(user, doc('a', { title: 'Phone edit' }), r1, deps), { status: 409 });
  await assert.rejects(put(user, doc('a', { title: 'New on phone' }), null, deps), { status: 409 }, 'creating over an existing id');
  assert.equal((await getSynced(user, 'a', deps)).doc.title, 'Laptop edit');
  assert.deepEqual((await listSynced(user, deps)).docs, [{ id: 'a', rev: r2 }]);
});

test('deleting forever leaves a marker other devices can see', async () => {
  const { deps } = setup();
  const r1 = (await put(user, doc('a'), null, deps)).rev;
  await assert.rejects(deleteSynced(user, 'a', 'stale', deps), { status: 409 });
  const { rev } = await deleteSynced(user, 'a', r1, deps);
  assert.deepEqual((await getSynced(user, 'a', deps)).doc, { id: 'a', purged: true, updated: T0, rev });
  // Edited on another device after it was deleted: that device can bring it back.
  const back = await put(user, doc('a', { title: 'Kept' }), rev, deps);
  assert.equal((await getSynced(user, 'a', deps)).doc.title, 'Kept');
  assert.deepEqual((await listSynced(user, deps)).docs, [{ id: 'a', rev: back.rev }]);
});

test('only subscribers can upload; Stripe is asked at most every 10 minutes', async () => {
  const { deps, stripeCalls } = setup();
  await put(user, doc('a'), null, deps);
  await put(user, doc('b'), null, deps);
  assert.equal(stripeCalls.length, 1);
  deps.now = T0 + PLAN_CHECK_MS;
  await put(user, doc('c'), null, deps);
  assert.equal(stripeCalls.length, 2);

  const lapsed = setup({ subscribed: false }).deps;
  await assert.rejects(put(user, doc('a'), null, lapsed), { status: 402 });
  await assert.rejects(deleteSynced(user, 'a', null, lapsed), { status: 402 });
  assert.deepEqual(await listSynced(user, lapsed), { docs: [] }, 'reading still works');
});

test('bad input is rejected', async () => {
  const { deps } = setup();
  await assert.rejects(putSynced(user, 'not json', deps), { status: 400 });
  await assert.rejects(put(user, { id: '../x', content }, null, deps), { status: 400 });
  await assert.rejects(put(user, { id: 'a', content: { type: 'p' } }, null, deps), { status: 400 });
  await assert.rejects(put(user, doc('a'), 42, deps), { status: 400 });
  await assert.rejects(getSynced(user, '../../u2/a', deps), { status: 400 });
  await assert.rejects(putSynced(user, 'x'.repeat(MAX_DOC_BYTES + 1), deps), { status: 413 });
  const stored = (await put(user, { ...doc('z'), evil: 1, rev: 'forged' }, null, deps)).rev;
  const { doc: d } = await getSynced(user, 'z', deps);
  assert.equal(d.evil, undefined);
  assert.equal(d.rev, stored);
});

test('two devices saving different documents at once both land in the index', async () => {
  const { deps } = setup();
  await Promise.all([put(user, doc('a'), null, deps), put(user, doc('b'), null, deps), put(user, doc('c'), null, deps)]);
  assert.deepEqual((await listSynced(user, deps)).docs.map((d) => d.id).sort(), ['a', 'b', 'c']);
});

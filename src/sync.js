// Cloud sync for subscribers. runSync() compares this device with the cloud and moves changes both ways;
// it takes its storage and network functions as arguments so it can be tested without a browser.
//
// Rules: a document changed only in the cloud is downloaded; changed only here, uploaded; changed in
// both places, the cloud version is kept under its name and this device's version is saved alongside
// as a "conflict copy", so no edit is ever lost. Deleting forever is synced; an edit made elsewhere
// after a document was deleted forever brings it back.
//
// The sync record (readSync/writeSync) is also written when documents are saved, possibly while a sync
// is waiting on the network, so it is always re-read and updated in one step, never held across an await.

export const MAX_SYNC_BYTES = 4_400_000;
const SYNC_FIELDS = ['title', 'content', 'settings', 'deleted', 'jobDescription'];

const withoutRev = (d) => {
  const { rev, ...doc } = d;
  return doc;
};
const sameDoc = (a, b) => SYNC_FIELDS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/**
 * deps: { request(path, { method, body }) → body (throws an Error with .status), allDocs, writeDoc,
 *         deleteDoc(id, { sync: false }), readSync, writeSync, uid, now, newId }
 * mode: 'full' (download and upload) or 'pull' (download only, for lapsed subscribers).
 * Returns { changed: [ids changed on this device], conflicts, tooLarge: [titles], notSubscribed }.
 */
export async function runSync(deps, mode = 'full') {
  const update = (fn) => { const m = deps.readSync(); fn(m); deps.writeSync(m); return m; };
  const owner = deps.readSync().owner;
  if (owner && owner !== deps.uid) {
    const e = new Error('This device syncs with another account.');
    e.code = 'OTHER_ACCOUNT';
    throw e;
  }
  update((m) => { m.owner = deps.uid; });

  const result = { changed: [], conflicts: 0, tooLarge: [], notSubscribed: false };
  for (let round = 0; round < 3; round++) {
    await pull(deps, update, result);
    if (mode !== 'full' || !(await push(deps, update, result))) break;
  }
  update((m) => { m.last = deps.now(); });
  return result;
}

const localDoc = async (deps, id) => (await deps.allDocs()).find((d) => d.id === id);
const isDirty = (meta, id, exists) => exists && (!meta.docs[id] || !!meta.docs[id].dirty);

async function pull(deps, update, result) {
  const { docs: remote } = await deps.request('/api/sync');
  for (const r of remote) {
    const known = deps.readSync();
    // Unchanged since we last synced it, or since we deleted it forever here (that delete is sent next).
    if (known.docs[r.id]?.rev === r.rev || known.purge[r.id] === r.rev) continue;
    const { doc } = await deps.request(`/api/sync?id=${encodeURIComponent(r.id)}`);
    // Decide with the latest local state: the person may have kept typing while we downloaded.
    const mine = await localDoc(deps, r.id);
    const meta = deps.readSync();
    const dirty = isDirty(meta, r.id, !!mine);
    const rev = doc.rev;

    if (doc.purged) {
      if (mine && dirty) {
        update((m) => { delete m.purge[r.id]; m.docs[r.id] = { rev, dirty: true }; }); // edited here after it was deleted elsewhere
        continue;
      }
      if (mine) { await deps.deleteDoc(r.id, { sync: false }); result.changed.push(r.id); }
    } else if (!mine || !dirty || sameDoc(mine, doc)) {
      if (!mine || !sameDoc(mine, doc)) { await deps.writeDoc(withoutRev(doc)); result.changed.push(r.id); }
    } else {
      const copy = { ...mine, id: deps.newId(), title: `${mine.title} (conflict copy)`, created: deps.now() };
      await deps.writeDoc(copy);
      await deps.writeDoc(withoutRev(doc));
      result.changed.push(r.id, copy.id);
      result.conflicts++;
    }
    // An edit made elsewhere after we deleted it forever wins: drop our pending delete.
    update((m) => { delete m.purge[r.id]; m.docs[r.id] = { rev, dirty: false }; });
  }
}

// Uploads this device's changes. Returns true when the cloud changed meanwhile and another round is needed.
async function push(deps, update, result) {
  let retry = false;
  const send = async (path, init) => {
    try { return await deps.request(path, init); } catch (e) {
      if (e.status === 409) { retry = true; return 'conflict'; }
      if (e.status === 402) { result.notSubscribed = true; return 'notSubscribed'; }
      if (e.status === 413) return 'tooLarge';
      throw e;
    }
  };

  for (const [id, rev] of Object.entries(deps.readSync().purge)) {
    const res = await send(`/api/sync?id=${encodeURIComponent(id)}&baseRev=${encodeURIComponent(rev)}`, { method: 'DELETE' });
    if (res === 'notSubscribed') return false;
    update((m) => {
      delete m.purge[id];
      if (res?.rev) m.docs[id] = { rev: res.rev, dirty: false };
    });
  }

  for (const d of await deps.allDocs()) {
    const known = deps.readSync().docs[d.id];
    if (known && !known.dirty) continue;
    const body = JSON.stringify({ doc: withoutRev(d), baseRev: known?.rev ?? null });
    if (body.length > MAX_SYNC_BYTES) { result.tooLarge.push(d.title); continue; }
    const res = await send('/api/sync', { method: 'PUT', body });
    if (res === 'notSubscribed') return false;
    if (res === 'tooLarge') { result.tooLarge.push(d.title); continue; }
    if (!res?.rev) continue;
    // Edited again while uploading? Then it stays marked as changed for the next sync.
    const now = await localDoc(deps, d.id);
    update((m) => { m.docs[d.id] = { rev: res.rev, dirty: !!m.docs[d.id]?.dirty && !!now && !sameDoc(now, d) }; });
  }
  return retry;
}

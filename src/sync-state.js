// What this device knows about cloud sync, kept apart from the documents so saving a document can never
// overwrite it: which account the device syncs with, the cloud revision each document was last synced
// at, which documents changed since, and which were deleted forever and still need deleting in the cloud.
const KEY = 'dw-sync';

export function readSync() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  return { owner: null, docs: {}, purge: {}, last: 0, ...(s && typeof s === 'object' ? s : {}) };
}

export function writeSync(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

/** A document was edited, moved to or from the Recycle Bin, or restored from a backup. */
export function markChanged(id) {
  const s = readSync();
  if (!s.owner) return;
  s.docs[id] = { ...s.docs[id], dirty: true };
  writeSync(s);
}

/** A document was deleted forever on this device: delete it in the cloud too, if it was ever uploaded. */
export function markPurged(id) {
  const s = readSync();
  const rev = s.docs[id]?.rev;
  delete s.docs[id];
  if (rev) s.purge[id] = rev;
  writeSync(s);
}

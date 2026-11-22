// Keeping documents safe: Recycle Bin rules, backup files and restore. No browser APIs here, so it is unit-tested.

const DAY = 864e5;
export const TRASH_DAYS = 30;
// Remind people without protected storage to back up when their last backup is older than this.
export const BACKUP_REMINDER_DAYS = 14;
export const BACKUP_KIND = 'dynoword-backup';
export const BACKUP_FILE = 'dynoword-backup.json';

export const isTrashed = (doc) => Number.isFinite(doc?.deleted);
export const trashExpired = (doc, now = Date.now()) => isTrashed(doc) && now - doc.deleted >= TRASH_DAYS * DAY;
export const trashDaysLeft = (doc, now = Date.now()) =>
  Math.max(0, Math.ceil((doc.deleted + TRASH_DAYS * DAY - now) / DAY));

export function backupDue({ persisted, lastBackup, docCount, now = Date.now() }) {
  if (persisted || !docCount) return false;
  return !lastBackup || now - lastBackup >= BACKUP_REMINDER_DAYS * DAY;
}

export function makeBackup(docs, now = Date.now()) {
  return { kind: BACKUP_KIND, version: 1, exported: now, docs: docs.map(cleanDoc).filter(Boolean) };
}

// Keeps only the fields a document has, with the right types, so a damaged or hand-edited backup can't
// put anything unexpected into storage. Returns null for something that isn't a document.
export function cleanDoc(d) {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.id !== 'string' || !/^[\w-]{1,100}$/.test(d.id)) return null;
  if (!d.content || typeof d.content !== 'object' || d.content.type !== 'doc') return null;
  const num = (v) => (Number.isFinite(v) ? v : undefined);
  const doc = {
    id: d.id,
    title: (typeof d.title === 'string' && d.title.trim() ? d.title : 'Untitled document').slice(0, 300),
    content: d.content,
    settings: d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {},
    created: num(d.created),
    updated: num(d.updated) ?? 0,
    deleted: num(d.deleted),
    jobDescription: typeof d.jobDescription === 'string' ? d.jobDescription : undefined,
  };
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  return doc;
}

// Parses a backup file's JSON. Throws if it isn't a Dynoword backup; skips entries that aren't documents.
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('NOT_A_BACKUP'); }
  if (data?.kind !== BACKUP_KIND || !Array.isArray(data.docs)) throw new Error('NOT_A_BACKUP');
  const docs = data.docs.map(cleanDoc).filter(Boolean);
  return { docs, skipped: data.docs.length - docs.length, exported: data.exported };
}

// Decides what a restore writes: documents missing on this device, and ones the backup has a newer
// version of. Nothing newer on the device is ever overwritten.
export function planRestore(incoming, existing) {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const write = [];
  let upToDate = 0;
  for (const doc of incoming) {
    const have = byId.get(doc.id);
    if (have && (have.updated || 0) >= doc.updated) upToDate++;
    else write.push(doc);
  }
  return { write, upToDate };
}

// File names for the documents inside a backup: no characters that file systems reject, no duplicates.
export function uniqueNames(titles, ext) {
  const used = new Set();
  return titles.map((t) => {
    const base = (t || 'Document').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80) || 'Document';
    let name = `${base}.${ext}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

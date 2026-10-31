// Tiny IndexedDB wrapper for documents, with a localStorage fallback.
const DB_NAME = 'dynoword';
const STORE = 'docs';
let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  }));
}

const lsKey = (id) => `dw-doc-${id}`;
const lsIndex = () => { try { return JSON.parse(localStorage.getItem('dw-index') || '[]'); } catch { return []; } };

export async function saveDoc(doc) {
  doc.updated = Date.now();
  try {
    await tx('readwrite', (s) => s.put(doc));
  } catch {
    try {
      localStorage.setItem(lsKey(doc.id), JSON.stringify(doc));
      const idx = lsIndex().filter((i) => i !== doc.id);
      localStorage.setItem('dw-index', JSON.stringify([doc.id, ...idx]));
    } catch (e) { console.warn('Could not save', e); throw e; }
  }
  return doc;
}

export async function getDoc(id) {
  try {
    return await tx('readonly', (s) => s.get(id));
  } catch {
    try { return JSON.parse(localStorage.getItem(lsKey(id))); } catch { return null; }
  }
}

export async function listDocs() {
  let docs;
  try {
    docs = await tx('readonly', (s) => s.getAll());
  } catch {
    docs = lsIndex().map((id) => { try { return JSON.parse(localStorage.getItem(lsKey(id))); } catch { return null; } }).filter(Boolean);
  }
  return docs.sort((a, b) => b.updated - a.updated);
}

export async function deleteDoc(id) {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    localStorage.removeItem(lsKey(id));
    localStorage.setItem('dw-index', JSON.stringify(lsIndex().filter((i) => i !== id)));
  }
}

export function newId() {
  return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

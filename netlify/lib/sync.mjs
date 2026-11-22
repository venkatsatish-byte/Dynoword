// Cloud sync for subscribers: each document is one blob under the user's id, plus a small index of
// { documentId: revision } so a device can see what changed in one request. Every write names the
// revision it was based on; a write based on an older revision is refused (409) so no edit is lost.
// The handlers take their dependencies (stores, Stripe client, clock) as arguments so they can be tested.
import { cleanDoc } from '../../src/safety.js';
import { HttpError, loadRecord, activeSubscription } from './billing.mjs';

// Netlify Functions accept request bodies up to 6 MB; leave room for the JSON around the document.
export const MAX_DOC_BYTES = 4_500_000;
export const MAX_DOCS = 2000;
// How long a "this person is subscribed" answer from Stripe is trusted before asking again.
export const PLAN_CHECK_MS = 10 * 60 * 1000;

const ID = /^[\w-]{1,100}$/;
const docKey = (user, id) => `${user.uid}/${id}`;
const newRev = () => globalThis.crypto.randomUUID();

function checkId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'Unknown document.');
  return id;
}

/** Only subscribers can upload; the answer is cached on the user's record so syncing stays quick. */
export async function assertCanSync(user, deps) {
  const record = await loadRecord(user, deps);
  if (!record.plan || deps.now - record.plan.checkedAt >= PLAN_CHECK_MS) {
    const sub = await activeSubscription(record, deps.stripe);
    record.plan = { subscribed: !!sub, checkedAt: deps.now };
    await deps.store.setJSON(user.uid, record);
  }
  if (!record.plan.subscribed) throw new HttpError(402, 'Cloud sync is included with a subscription.');
}

async function readIndex(user, { index }) {
  return (await index.get(user.uid, { type: 'json' })) || {};
}

async function updateIndex(user, { index }, id, rev) {
  // Two devices can save at the same moment: retry the read-modify-write until it lands.
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await index.getWithMetadata(user.uid, { type: 'json' });
    const next = { ...(cur?.data || {}), [id]: rev };
    const res = await index.setJSON(user.uid, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return;
  }
  throw new HttpError(503, 'Sync is busy. Please try again.');
}

/** GET /api/sync → every synced document's id and current revision. */
export async function listSynced(user, deps) {
  const idx = await readIndex(user, deps);
  return { docs: Object.entries(idx).map(([id, rev]) => ({ id, rev })) };
}

/** GET /api/sync?id= → one document (or { id, rev, purged: true } once deleted forever). */
export async function getSynced(user, id, { docs }) {
  const doc = await docs.get(docKey(user, checkId(id)), { type: 'json' });
  if (!doc) throw new HttpError(404, 'That document isn’t in your cloud storage.');
  return { doc };
}

async function writeSynced(user, id, baseRev, data, deps) {
  const key = docKey(user, id);
  const cur = await deps.docs.getWithMetadata(key, { type: 'json' });
  const curRev = cur?.data?.rev ?? null;
  if (curRev !== (baseRev ?? null)) throw new HttpError(409, 'This document changed on another device.');
  if (!cur) {
    const count = Object.keys(await readIndex(user, deps)).length;
    if (count >= MAX_DOCS) throw new HttpError(413, `Cloud sync holds up to ${MAX_DOCS} documents.`);
  }
  const rev = newRev();
  const res = await deps.docs.setJSON(key, { ...data, rev }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
  if (!res.modified) throw new HttpError(409, 'This document changed on another device.');
  await updateIndex(user, deps, id, rev);
  return { rev };
}

/** PUT /api/sync { doc, baseRev } → { rev }. baseRev is the revision the device last had (null for new). */
export async function putSynced(user, bodyText, deps) {
  if (bodyText.length > MAX_DOC_BYTES) throw new HttpError(413, 'This document is too large to sync, usually because of large pictures.');
  let body;
  try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, 'Invalid request.'); }
  const doc = cleanDoc(body?.doc);
  if (!doc) throw new HttpError(400, 'That isn’t a Dynoword document.');
  if (body.baseRev != null && typeof body.baseRev !== 'string') throw new HttpError(400, 'Invalid request.');
  await assertCanSync(user, deps);
  return writeSynced(user, doc.id, body.baseRev, doc, deps);
}

/** DELETE /api/sync?id=&baseRev= → { rev }. Leaves a small marker so other devices delete it too. */
export async function deleteSynced(user, id, baseRev, deps) {
  checkId(id);
  await assertCanSync(user, deps);
  return writeSynced(user, id, baseRev || null, { id, purged: true, updated: deps.now }, deps);
}

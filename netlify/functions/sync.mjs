import { listSynced, getSynced, putSynced, deleteSynced } from '../lib/sync.mjs';
import { deps, respond, verifyUser } from '../lib/runtime.mjs';

// Cloud sync for subscribers.
// GET /api/sync → { docs: [{ id, rev }] }   GET /api/sync?id= → { doc }
// PUT /api/sync { doc, baseRev } → { rev }   DELETE /api/sync?id=&baseRev= → { rev }
export default (req) => respond(async () => {
  const user = await verifyUser(req);
  const d = deps(req);
  const q = new URL(req.url).searchParams;
  switch (req.method) {
    case 'PUT': return putSynced(user, await req.text(), d);
    case 'DELETE': return deleteSynced(user, q.get('id'), q.get('baseRev'), d);
    default: return q.has('id') ? getSynced(user, q.get('id'), d) : listSynced(user, d);
  }
});

export const config = { path: '/api/sync', method: ['GET', 'PUT', 'DELETE'] };

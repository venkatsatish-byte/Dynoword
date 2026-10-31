import { getAccount } from '../lib/billing.mjs';
import { deps, respond, verifyUser } from '../lib/runtime.mjs';

// GET /api/account → the signed-in user's plan: trial, active or expired.
export default (req) => respond(async () => getAccount(await verifyUser(req), deps(req)));

export const config = { path: '/api/account', method: 'GET' };

import { openPortal } from '../lib/billing.mjs';
import { deps, respond, verifyUser } from '../lib/runtime.mjs';

// POST /api/portal → Stripe's billing portal to update the card or cancel.
export default (req) => respond(async () => openPortal(await verifyUser(req), deps(req)));

export const config = { path: '/api/portal', method: 'POST' };

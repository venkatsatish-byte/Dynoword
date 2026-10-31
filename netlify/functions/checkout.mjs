import { startCheckout } from '../lib/billing.mjs';
import { deps, respond, verifyUser } from '../lib/runtime.mjs';

// POST /api/checkout → a Stripe Checkout page for the $5/month plan.
export default (req) => respond(async () => startCheckout(await verifyUser(req), deps(req)));

export const config = { path: '/api/checkout', method: 'POST' };

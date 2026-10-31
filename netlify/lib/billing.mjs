// Subscription logic shared by the Netlify Functions.
// The handlers take their dependencies (user store, Stripe client, clock) as arguments so they can be tested.

export const TRIAL_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;
// Stripe statuses that still grant access. past_due keeps access while Stripe retries the card.
const PAID = ['active', 'trialing', 'past_due'];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function periodEnd(sub) {
  const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return end ? end * 1000 : null;
}

/** What the user may do right now: { status: 'trial' | 'active' | 'expired', until, trialEndsAt, ... } */
export function accessFor(record, subscription, now) {
  const trialEndsAt = record.trialStart + TRIAL_DAYS * DAY;
  if (subscription && PAID.includes(subscription.status)) {
    return {
      status: 'active',
      until: periodEnd(subscription),
      trialEndsAt,
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      paymentIssue: subscription.status === 'past_due',
    };
  }
  if (now < trialEndsAt) return { status: 'trial', until: trialEndsAt, trialEndsAt };
  return { status: 'expired', until: null, trialEndsAt };
}

async function loadRecord(user, { store, now }) {
  let record = await store.get(user.uid, { type: 'json' });
  if (!record) {
    // The free trial starts the first time someone signs in.
    record = { email: user.email, trialStart: now, customerId: null };
    await store.setJSON(user.uid, record);
  }
  return record;
}

async function activeSubscription(record, stripe) {
  if (!record.customerId) return null;
  const { data } = await stripe.subscriptions.list({ customer: record.customerId, status: 'all', limit: 10 });
  return data.find((s) => PAID.includes(s.status)) || null;
}

export async function getAccount(user, deps) {
  const record = await loadRecord(user, deps);
  const sub = await activeSubscription(record, deps.stripe);
  return { email: record.email, ...accessFor(record, sub, deps.now) };
}

export async function startCheckout(user, { origin, priceId, ...deps }) {
  if (!priceId) throw new HttpError(500, 'Subscriptions are not set up yet (missing STRIPE_PRICE_ID).');
  const record = await loadRecord(user, deps);
  if (await activeSubscription(record, deps.stripe)) throw new HttpError(409, 'You already have an active subscription.');
  if (!record.customerId) {
    const customer = await deps.stripe.customers.create({ email: user.email, metadata: { uid: user.uid } });
    record.customerId = customer.id;
    await deps.store.setJSON(user.uid, record);
  }
  const session = await deps.stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: record.customerId,
    client_reference_id: user.uid,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { uid: user.uid } },
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=cancel`,
  });
  return { url: session.url };
}

export async function openPortal(user, { origin, ...deps }) {
  const record = await loadRecord(user, deps);
  if (!record.customerId) throw new HttpError(404, 'No billing account yet. Subscribe first.');
  const session = await deps.stripe.billingPortal.sessions.create({ customer: record.customerId, return_url: `${origin}/` });
  return { url: session.url };
}

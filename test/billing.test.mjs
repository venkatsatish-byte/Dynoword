import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessFor, getAccount, startCheckout, openPortal, HttpError, TRIAL_DAYS } from '../netlify/lib/billing.mjs';

const DAY = 864e5;
const T0 = Date.UTC(2026, 0, 1);
const user = { uid: 'u1', email: 'a@example.com' };

function fakeStore() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, setJSON: async (k, v) => { m.set(k, structuredClone(v)); } };
}

function fakeStripe(subs = []) {
  const calls = [];
  return {
    calls,
    subscriptions: { list: async (q) => { calls.push(['subs', q]); return { data: subs }; } },
    customers: { create: async (q) => { calls.push(['customer', q]); return { id: 'cus_1' }; } },
    checkout: { sessions: { create: async (q) => { calls.push(['checkout', q]); return { url: 'https://checkout.stripe.test/s' }; } } },
    billingPortal: { sessions: { create: async (q) => { calls.push(['portal', q]); return { url: 'https://billing.stripe.test/p' }; } } },
  };
}

test('trial lasts 7 days from first sign-in, then expires', async () => {
  const store = fakeStore();
  const day0 = await getAccount(user, { store, stripe: fakeStripe(), now: T0 });
  assert.equal(day0.status, 'trial');
  assert.equal(day0.trialEndsAt, T0 + TRIAL_DAYS * DAY);
  const day6 = await getAccount(user, { store, stripe: fakeStripe(), now: T0 + 6 * DAY });
  assert.equal(day6.status, 'trial');
  assert.equal(store.m.get('u1').trialStart, T0, 'trial start is not reset by later visits');
  const day8 = await getAccount(user, { store, stripe: fakeStripe(), now: T0 + 8 * DAY });
  assert.equal(day8.status, 'expired');
  assert.equal(day8.until, null);
});

test('an active Stripe subscription grants access until the period end', () => {
  const sub = { status: 'active', items: { data: [{ current_period_end: (T0 + 30 * DAY) / 1000 }] }, cancel_at_period_end: true };
  const a = accessFor({ trialStart: T0 - 100 * DAY }, sub, T0);
  assert.equal(a.status, 'active');
  assert.equal(a.until, T0 + 30 * DAY);
  assert.equal(a.cancelAtPeriodEnd, true);
  assert.equal(accessFor({ trialStart: T0 - 100 * DAY }, { ...sub, status: 'past_due' }, T0).paymentIssue, true);
  assert.equal(accessFor({ trialStart: T0 - 100 * DAY }, { ...sub, status: 'canceled' }, T0).status, 'expired');
});

test('checkout creates one Stripe customer and a $5/month subscription session', async () => {
  const store = fakeStore();
  const stripe = fakeStripe();
  const r = await startCheckout(user, { store, stripe, now: T0, priceId: 'price_5', origin: 'https://dynoword.netlify.app' });
  assert.equal(r.url, 'https://checkout.stripe.test/s');
  const session = stripe.calls.find(([k]) => k === 'checkout')[1];
  assert.equal(session.mode, 'subscription');
  assert.equal(session.customer, 'cus_1');
  assert.deepEqual(session.line_items, [{ price: 'price_5', quantity: 1 }]);
  assert.equal(session.success_url, 'https://dynoword.netlify.app/?checkout=success');
  assert.equal(store.m.get('u1').customerId, 'cus_1');
  await startCheckout(user, { store, stripe, now: T0, priceId: 'price_5', origin: 'x' });
  assert.equal(stripe.calls.filter(([k]) => k === 'customer').length, 1, 'customer is reused');
});

test('checkout is refused when already subscribed or not configured', async () => {
  const store = fakeStore();
  await store.setJSON('u1', { email: user.email, trialStart: T0, customerId: 'cus_1' });
  const stripe = fakeStripe([{ status: 'active', items: { data: [{ current_period_end: 1 }] } }]);
  await assert.rejects(startCheckout(user, { store, stripe, now: T0, priceId: 'p', origin: 'x' }), (e) => e instanceof HttpError && e.status === 409);
  await assert.rejects(startCheckout(user, { store, stripe, now: T0, priceId: '', origin: 'x' }), (e) => e.status === 500);
});

test('billing portal needs an existing customer', async () => {
  const store = fakeStore();
  await assert.rejects(openPortal(user, { store, stripe: fakeStripe(), now: T0, origin: 'x' }), (e) => e.status === 404);
  await store.setJSON('u1', { email: user.email, trialStart: T0, customerId: 'cus_1' });
  const stripe = fakeStripe();
  const r = await openPortal(user, { store, stripe, now: T0, origin: 'https://d.app' });
  assert.equal(r.url, 'https://billing.stripe.test/p');
  assert.equal(stripe.calls[0][1].return_url, 'https://d.app/');
});

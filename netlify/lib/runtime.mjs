// Wiring for the deployed functions: Firebase sign-in verification, the user store and Stripe.
import { getStore } from '@netlify/blobs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import Stripe from 'stripe';
import { HttpError } from './billing.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const firebaseKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Verifies the Firebase ID token sent by the app and returns { uid, email }. */
export async function verifyUser(req) {
  if (!projectId) throw new HttpError(500, 'Sign-in is not set up yet (missing FIREBASE_PROJECT_ID).');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub || !payload.email) throw new Error('token without user');
    return { uid: payload.sub, email: payload.email };
  } catch {
    throw new HttpError(401, 'Your sign-in has expired. Please sign in again.');
  }
}

export function deps(req) {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(500, 'Payments are not set up yet (missing STRIPE_SECRET_KEY).');
  return {
    store: getStore({ name: 'users', consistency: 'strong' }),
    stripe: new Stripe(process.env.STRIPE_SECRET_KEY),
    now: Date.now(),
    priceId: process.env.STRIPE_PRICE_ID,
    origin: process.env.URL || new URL(req.url).origin,
  };
}

/** Runs a handler and turns its result or error into a JSON response. */
export async function respond(fn) {
  try {
    return Response.json(await fn(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return Response.json({ error: e instanceof HttpError ? e.message : 'Something went wrong. Please try again.' }, { status });
  }
}

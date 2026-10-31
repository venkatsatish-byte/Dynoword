// Sign-in (Firebase email links) and subscription status from the /api functions.
// Billing is only switched on when the Firebase settings are present at build time;
// without them Dynoword stays free to use.

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const BILLING_ENABLED = !!(config.apiKey && config.projectId);
export const PRICE = '$5/month';
export const TRIAL_DAYS = 7;

const DAY = 864e5;
const ACCESS_KEY = 'dw-access';
const EMAIL_KEY = 'dw-signin-email';
// Subscribers keep editing for a few days offline or while a renewal is processed.
const GRACE = 3 * DAY;

let fb;
let auth;

async function firebase() {
  if (!fb) {
    const [{ initializeApp }, authModule] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    fb = authModule;
    auth = fb.getAuth(initializeApp(config));
  }
  return fb;
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** The access state to start with, before the network answers. */
export function initialAccess() {
  if (!BILLING_ENABLED) return { status: 'free' };
  return read(ACCESS_KEY) || { status: 'loading' };
}

/** Whether the user may edit. While loading or when the check itself fails, editing stays allowed. */
export function canEdit(access) {
  switch (access?.status) {
    case 'free': case 'loading': case 'error': return true;
    case 'trial': return !access.until || Date.now() < access.until;
    case 'active': return !access.until || Date.now() < access.until + GRACE;
    default: return false;
  }
}

export const daysLeft = (access) => Math.max(0, Math.round((access.until - Date.now()) / DAY));

async function api(path, method = 'GET') {
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, { method, headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/** Asks the server for the signed-in user's plan; falls back to the last known plan when offline. */
export async function refresh() {
  if (!auth) return initialAccess();
  const user = auth.currentUser;
  if (!user) return { status: 'signedOut' };
  try {
    const access = { ...(await api('/api/account')), signedIn: true };
    write(ACCESS_KEY, access);
    return access;
  } catch (e) {
    const cached = read(ACCESS_KEY);
    if (cached?.email === user.email && !navigator.onLine) return { ...cached, offline: true };
    return { status: 'error', signedIn: true, email: user.email, error: e.message };
  }
}

/**
 * Starts listening for sign-in changes.
 * onChange(access) runs with every new plan; needEmail(link) runs when a sign-in link was opened
 * on a device that doesn't know which email it was sent to.
 */
export async function start({ onChange, needEmail }) {
  if (!BILLING_ENABLED) return;
  await firebase();
  if (fb.isSignInWithEmailLink(auth, location.href)) {
    const link = location.href;
    history.replaceState(null, '', location.pathname);
    if (read(EMAIL_KEY)) await finishSignIn(link).catch(() => needEmail(link));
    else needEmail(link);
  }
  fb.onAuthStateChanged(auth, async (user) => {
    if (!user) { write(ACCESS_KEY, null); onChange({ status: 'signedOut' }); return; }
    onChange(await refresh());
  });
}

export async function sendSignInLink(email) {
  await firebase();
  await fb.sendSignInLinkToEmail(auth, email, { url: `${location.origin}/?signin=1`, handleCodeInApp: true });
  write(EMAIL_KEY, email);
}

/** Completes sign-in from the emailed link (opened directly, or pasted into an installed app). */
export async function finishSignIn(link, email = read(EMAIL_KEY)) {
  await firebase();
  if (!fb.isSignInWithEmailLink(auth, link)) throw new Error('That isn’t a Dynoword sign-in link. Copy the whole link from the email.');
  await fb.signInWithEmailLink(auth, email, link);
  write(EMAIL_KEY, null);
}

export async function subscribe() {
  const { url } = await api('/api/checkout', 'POST');
  location.href = url;
}

export async function manageBilling() {
  const { url } = await api('/api/portal', 'POST');
  location.href = url;
}

export async function signOut() {
  await firebase();
  write(ACCESS_KEY, null);
  await fb.signOut(auth);
}

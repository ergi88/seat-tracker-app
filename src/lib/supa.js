/* The Supabase client. The URL and the publishable key come from the
 * extension's core/config.js: the key is public by design and opens
 * nothing without a team member's login (see the extension's
 * supabase/schema.sql). */
import { createClient } from '@supabase/supabase-js';
import { SK } from './sk.js';

export const supa = createClient(SK.config.supabaseUrl, SK.config.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sk-app-auth', detectSessionInUrl: false }
});

/* Throws a readable error from a supabase-js { data, error } answer. */
export async function must(promise) {
  let res;
  try {
    res = await promise;
  } catch (e) {
    throw unreachable(e);
  }
  if (res.error) {
    const msg = res.error.message || String(res.error);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) throw unreachable(res.error);
    const err = new Error(/invalid login/i.test(msg) ? 'Wrong email or password.' : msg);
    err.code = res.error.code;
    err.status = res.status;
    throw err;
  }
  return res.data;
}

function unreachable(e) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const err = new Error(offline ? 'You are offline.' : 'The Seat Tracker server (Supabase) did not answer.');
  err.network = true;
  err.offline = offline;
  err.detail = (e && e.message) || String(e);
  return err;
}

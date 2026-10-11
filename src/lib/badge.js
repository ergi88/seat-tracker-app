/* ------------------------------------------------------------------
 * The number on the app's home-screen icon.
 *
 * iPhone (iOS 16.4+) shows it only for an app added to the home screen
 * whose notifications were allowed; Android Chrome shows it once the app
 * is installed, often as a dot. Neither says when it is refused: the call
 * succeeds and nothing appears, so status() reports what can be known.
 * ------------------------------------------------------------------ */

export const canBadge = () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator;

/* opened from the home screen, not in a browser tab */
export const installed = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);

/* 'granted' | 'denied' | 'default' | 'unsupported' */
export const permission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/* must run from a tap: iOS ignores the request otherwise */
export async function askPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
}

/* 0 clears it; throws only when the browser has no badge at all */
export async function setBadge(n) {
  if (!canBadge()) throw new Error('This browser has no app icon badge.');
  if (n > 0) await navigator.setAppBadge(n);
  else await navigator.clearAppBadge();
}

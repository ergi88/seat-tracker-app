/* ------------------------------------------------------------------
 * A notification shown by the app itself, through its service worker.
 *
 * iPhone (iOS 16.4+) shows them only for an app opened from the home
 * screen with notifications allowed, and only through the service
 * worker: `new Notification()` does nothing there. They come from the
 * app while it runs; with the app closed only a push server could send
 * one, so the alerts themselves stay on ntfy.
 * ------------------------------------------------------------------ */

const ICON = 'icons/icon-192.png';

/* where a tap on it goes: a hash route of this app, e.g. '#/inbox' */
export async function showNotification(title, body, route) {
  if (typeof Notification === 'undefined') throw new Error('This browser has no notifications.');
  if (Notification.permission !== 'granted') throw new Error('Notifications are not allowed.');
  const url = new URL(route || '#/', location.href.split('#')[0]).href;
  const opts = { body, icon: ICON, badge: ICON, tag: 'sk-' + Date.now(), data: { url } };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg && reg.showNotification) return reg.showNotification(title, opts);
  /* a desktop browser without the service worker (npm run dev) */
  new Notification(title, opts);
}

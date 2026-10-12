/* ------------------------------------------------------------------
 * Getting the app onto the Home Screen.
 *
 * iPhone and iPad have no install prompt a page can call: the person adds
 * it from the Share menu, so they get the steps. Chrome and Edge (Android,
 * desktop) fire `beforeinstallprompt`: it is kept, and the browser's own
 * install popup opens when the person taps Install (it may only open from
 * a tap). Nothing shows once the app runs from the Home Screen, after it
 * is installed, or for a week after "Not now".
 *
 * Imported first thing in main.js: the event can fire before the app is
 * on the screen.
 * ------------------------------------------------------------------ */

const KEY = 'sk.installDismissedAt';
const WEEK = 7 * 86400000;

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
/* iPadOS says it is a Mac; a Mac has no touch screen */
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
/* Instagram, Facebook and the like open links in their own view, which cannot add to the Home Screen */
const inApp = /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|TikTok/i.test(ua);

function standalone() {
  if (typeof window === 'undefined') return false;
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < WEEK; }
  catch (e) { return false; }
}

class Install {
  ios = ios;
  inApp = inApp;
  installed = $state(standalone());
  dismissed = $state(dismissedRecently());
  deferred = $state.raw(null);           // the browser's install prompt, kept for the tap

  /* the iPhone steps, or the Install button; null = nothing to show */
  get mode() {
    if (this.installed || this.dismissed) return null;
    if (this.ios) return 'ios';
    return this.deferred ? 'prompt' : null;
  }

  async prompt() {
    const e = this.deferred;
    if (!e) return false;
    this.deferred = null;                // a prompt can be shown once
    e.prompt();
    const choice = await e.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') this.installed = true;
    return !!(choice && choice.outcome === 'accepted');
  }

  dismiss() {
    this.dismissed = true;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* hidden for this visit only */ }
  }
}

export const install = new Install();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                  // ours, shown with the app's own card
    install.deferred = e;
  });
  window.addEventListener('appinstalled', () => { install.installed = true; install.deferred = null; });
  matchMedia('(display-mode: standalone)').addEventListener?.('change', e => { if (e.matches) install.installed = true; });
}

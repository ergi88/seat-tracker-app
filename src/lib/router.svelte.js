/* ------------------------------------------------------------------
 * Hash routes (GitHub Pages serves one index.html and nothing else):
 *
 *   #/            Now          #/events         Events
 *   #/event/<key> one event    #/add?event=<key> add a request
 *   #/map/<key>   the stadium  #/add?event=<key>&sec=<code> prefilled
 *   #/money       Money        #/inbox          Inbox
 *   #/settings    Settings     #/accounts       your buying accounts
 *
 * Changing route runs inside a view transition, sliding forward into a
 * detail page and back out of it, cross-fading between tabs. Sheets put
 * an entry in the history, so the phone's back gesture closes them.
 *
 * A sheet opened from another sheet (swapSheet) keeps that one as `back`:
 * closing it, by any means, brings the one under it back, as a native
 * stack would. Going to the sheet it came from just goes back, so moving
 * between a sector and its request never piles up.
 * ------------------------------------------------------------------ */
import { flushSync } from 'svelte';

export const TABS = ['now', 'events', 'money', 'inbox'];
const DEPTH = { now: 0, events: 0, money: 0, inbox: 0, settings: 1, event: 1, add: 2, map: 2, accounts: 2 };

/* the same sheet, whatever tab it was on */
const sameSheet = (a, b) => !!a && !!b && a.kind === b.kind && (a.id ?? null) === (b.id ?? null) &&
  (a.eventKey ?? null) === (b.eventKey ?? null) && String(a.sectorId ?? '') === String(b.sectorId ?? '');
/* at most `n` sheets remembered under this one */
const keep = (s, n) => (s && n > 0 ? Object.assign({}, s, { back: keep(s.back, n - 1) }) : null);

function parse(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const name = parts[0] || 'now';
  return { name: DEPTH[name] === undefined ? 'now' : name, arg: parts[1] || '', params };
}

class Router {
  route = $state(parse(typeof location === 'undefined' ? '' : location.hash));
  sheet = $state(null);                         // { kind, ...props, back: the sheet under it }
  dropBack = false;                             // the next close goes all the way out
  lastTab = $state('now');

  /* the hashes visited in this session, so Back knows whether there is
   * anything in the app to go back to */
  stack = [typeof location === 'undefined' ? '' : location.hash];

  start() {
    addEventListener('hashchange', () => {
      const h = location.hash;
      if (this.stack.length > 1 && this.stack[this.stack.length - 2] === h) this.stack.pop();
      else this.stack.push(h);
      this.apply(parse(h));
    });
    addEventListener('popstate', e => {
      if (this.sheet && !(e.state && e.state.sheet)) this.restore();
    });
  }

  apply(next) {
    const prev = this.route;
    const nav = TABS.includes(next.name) && TABS.includes(prev.name) ? 'tab'
      : DEPTH[next.name] > DEPTH[prev.name] ? 'forward' : 'back';
    const swap = () => {
      this.route = next;
      if (TABS.includes(next.name)) this.lastTab = next.name;
      flushSync();
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce || document.hidden) { swap(); return; }
    document.documentElement.dataset.nav = nav;
    const t = document.startViewTransition(swap);
    t.finished.finally(() => { delete document.documentElement.dataset.nav; });
  }

  go(hash) {
    if (location.hash === hash) return;
    location.hash = hash;
  }

  back(fallback) {
    /* opened straight from a link, there is nothing in the app to go back to */
    if (this.stack.length > 1) history.back();
    else location.replace(fallback || '#/' + this.lastTab);
  }

  openSheet(sheet) {
    this.sheet = sheet;
    history.pushState({ sheet: true }, '');
  }

  /* Open `next` over the current sheet, which comes back when `next` closes.
   * `remember` is merged into the one kept (e.g. the tab it was on). */
  swapSheet(next, remember) {
    const cur = this.sheet;
    if (!cur) { this.openSheet(next); return; }
    if (sameSheet(cur.back, next)) { this.sheet = cur.back; return; }
    this.sheet = Object.assign({}, next, { back: keep(Object.assign({}, cur, remember), 3) });
  }

  /* all: close for good, not back to the sheet underneath (e.g. on the way to another page) */
  closeSheet(opts) {
    if (!this.sheet) return;
    if (opts && opts.all) this.dropBack = true;
    if (history.state && history.state.sheet) history.back();   // popstate restores or clears
    else this.restore();
  }

  /* the sheet under the one that closed, or none */
  restore() {
    const back = this.dropBack ? null : this.sheet && this.sheet.back;
    this.dropBack = false;
    if (!back) { this.sheet = null; return; }
    this.sheet = back;
    history.pushState({ sheet: true }, '');
  }
}

export const router = new Router();
export const href = {
  event: key => '#/event/' + encodeURIComponent(key),
  add: key => '#/add' + (key ? '?event=' + encodeURIComponent(key) : ''),
  map: key => '#/map/' + encodeURIComponent(key),
  accounts: () => '#/accounts'
};

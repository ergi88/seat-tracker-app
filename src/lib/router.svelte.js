/* ------------------------------------------------------------------
 * Hash routes (GitHub Pages serves one index.html and nothing else):
 *
 *   #/            Now          #/events         Events
 *   #/event/<key> one event    #/add?event=<key> add a request
 *   #/map/<key>   the stadium  #/add?event=<key>&sec=<code> prefilled
 *   #/money       Money        #/inbox          Inbox
 *   #/settings    Settings
 *
 * Changing route runs inside a view transition, sliding forward into a
 * detail page and back out of it, cross-fading between tabs. Sheets put
 * an entry in the history, so the phone's back gesture closes them.
 * ------------------------------------------------------------------ */
import { flushSync } from 'svelte';

export const TABS = ['now', 'events', 'money', 'inbox'];
const DEPTH = { now: 0, events: 0, money: 0, inbox: 0, settings: 1, event: 1, add: 2, map: 2 };

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
  sheet = $state(null);                         // { kind, ...props }
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
      if (this.sheet && !(e.state && e.state.sheet)) this.sheet = null;
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

  closeSheet() {
    if (!this.sheet) return;
    if (history.state && history.state.sheet) history.back();   // popstate clears it
    else this.sheet = null;
  }
}

export const router = new Router();
export const href = {
  event: key => '#/event/' + encodeURIComponent(key),
  add: key => '#/add' + (key ? '?event=' + encodeURIComponent(key) : ''),
  map: key => '#/map/' + encodeURIComponent(key)
};

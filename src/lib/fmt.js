import { SK } from './sk.js';

export const ago = ts => SK.util.ago(ts);
export const lek = (n, signed) => SK.profit.formatLek(n, signed);
export const money = (n, cur) => SK.profit.formatMoney(n, cur);
export const win = x => SK.profit.winRateText(x);
export const plural = (n, w) => SK.util.plural(n, w);

export function clock(ts) {
  return ts ? new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}

export function when(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? clock(ts) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + clock(ts);
}

/* an event's day, short: "Thu 15 Oct", with the year only when it is not this one */
export function day(t, now = Date.now()) {
  if (t === null || t === undefined) return '';
  const d = new Date(t);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts).replace(',', '');
}

/* an event's day against today: "today", "tomorrow", "in 12 days", "3 days ago" */
export function fromToday(t, now = Date.now()) {
  if (t === null || t === undefined) return '';
  const day = x => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const n = Math.round((day(t) - day(now)) / 86400000);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/* "updated just now" under a page title */
export function freshness(store) {
  if (!store.online) return `Offline · data from ${ago(store.view ? store.view.pulledAt : 0)}`;
  if (store.sync.error) return 'Not syncing · ' + store.sync.error;
  return store.view && store.view.pulledAt ? `Updated ${ago(store.view.pulledAt)}` : 'Loading…';
}

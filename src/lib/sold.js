/* ------------------------------------------------------------------
 * viagogo's last sales of one event, for the maps: a period, tickets per
 * section, and what one section's sales come to.
 * ------------------------------------------------------------------ */

export const PERIODS = [['all', 'All'], ['today', 'Today'], ['week', '7 days']];

/* section codes compared without spaces, dashes or case: "E 106" = "e106" */
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* the section a sale is drawn in: the tracked sector's code, else viagogo's own name */
export const saleCode = s => normCode(s.code || s.section);

/* the sales first read since the start of the period */
export function inPeriod(sales, period, now = Date.now()) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const from = period === 'today' ? midnight.getTime() : period === 'week' ? now - 7 * 86400000 : 0;
  return (sales || []).filter(s => s.firstSeen >= from);
}

/* { <code>: { tickets, sales } } — what StadiumMap's `sold` takes */
export function bySection(sales) {
  const out = {};
  for (const s of sales || []) {
    const x = out[saleCode(s)] || (out[saleCode(s)] = { tickets: 0, sales: 0 });
    x.tickets += Number(s.tickets) || 0;
    x.sales++;
  }
  return out;
}

/* sales whose section the drawing has no place for */
export function offMap(sales, venue) {
  if (!venue) return [];
  const drawn = new Set(venue.sections.map(x => normCode(x.code)));
  return (sales || []).filter(s => !drawn.has(saleCode(s)));
}

/* tickets, sales and what one ticket went for (lowest, average, highest),
 * per currency when they differ: { tickets, sales, each: { USD: { min, avg, max } }, last } */
export function stats(sales) {
  let tickets = 0, last = 0;
  const per = {};
  for (const s of sales || []) {
    const n = Number(s.tickets) || 0;
    tickets += n;
    last = Math.max(last, s.firstSeen || 0);
    if (!(Number(s.price) > 0) || !n) continue;
    const each = Number(s.price) / n;
    const c = s.currency || 'USD';
    const x = per[c] || (per[c] = { min: Infinity, max: 0, sum: 0, n: 0 });
    x.min = Math.min(x.min, each); x.max = Math.max(x.max, each); x.sum += Number(s.price); x.n += n;
  }
  const each = {};
  for (const [c, x] of Object.entries(per)) each[c] = { min: x.min, avg: x.sum / x.n, max: x.max };
  return { tickets, sales: (sales || []).length, each, last };
}

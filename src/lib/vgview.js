/* ------------------------------------------------------------------
 * A saved viagogo event scan, filtered the way the extension's event
 * drawer filters the live one: By section or By price, search, only my
 * listings, only instant download, sort, stands, tickets and sector price;
 * and what changed between the two saved scans. The figures are the
 * drawer's own (core/market.js).
 * ------------------------------------------------------------------ */
import { SK } from './sk.js';

const M = () => SK.market;

/* the ticket choices: any, exactly one, 1 to 10, more than 10 */
export const QTYS = [0, 'single', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 'over10'];
export const qtyLabel = n => ({ 0: 'Any', single: 'Single', over10: '10+' })[n] || String(n);

export const SORTS = [['section', 'Section'], ['gap', 'Biggest gap'], ['cheapest', 'Cheapest'], ['listings', 'Most listings']];

export const DIFF_KINDS = [
  ['all', 'All changes', () => true],
  ['new', 'New', c => c.kind === 'new'],
  ['gone', 'Removed', c => c.kind === 'gone'],
  ['down', 'Cheaper', c => c.delta < 0],
  ['up', 'Dearer', c => c.delta > 0],
  ['qty', 'Tickets', c => !!c.qty]
];
export const kindTest = k => (DIFF_KINDS.find(x => x[0] === k) || DIFF_KINDS[0])[2];

/* ---------------- stands (eBileta at Air Albania) ----------------- */
export const STAND_LABEL = { N: 'N', E: 'E', S: 'S', V: 'V', W: 'W', corner: 'Corners', other: 'Other' };
export const standKey = label => (SK.ebileta && SK.ebileta.standOf(label)) || 'other';
export const inStands = (stands, label) => !(stands || []).length || stands.includes(standKey(label));

/* on a tracked eBileta event, or when most sections are named like its sectors */
export function standsHere(list, ev) {
  if (!SK.ebileta || !list.length) return false;
  const named = list.filter(s => standKey(s.label) !== 'other').length;
  if (ev && ev.site === 'ebileta') return named > 0;
  return list.length >= 4 && named >= list.length * 0.6;
}

/* the stand chips: every stand, how many sections each has here */
export function standChoices(list) {
  const keys = [...SK.ebileta.STANDS, 'corner'];
  if (list.some(s => standKey(s.label) === 'other')) keys.push('other');
  return keys.map(k => ({ key: k, label: STAND_LABEL[k], sections: list.filter(s => standKey(s.label) === k).map(s => s.label) }));
}

/* ---------------- the tracked event's sector for a viagogo section --- */
export function sectorOf(ev, label) {
  if (!ev) return null;
  const r = SK.viagogo.sectorFor({ site: ev.site, sectors: ev.sectors, viagogo: { sectors: ev.vgSectors || {} } }, label);
  return ['matched', 'remembered'].includes(r.how) ? ev.sectors.find(x => x.code === r.code) || null : null;
}

/* the sector prices of the sections shown, cheapest first, and the
 * sections without one last: [{ amount, currency, sections }] */
export function sectorPrices(list, ev) {
  if (!ev) return [];
  const by = new Map(), none = [];
  for (const s of list) {
    const sec = sectorOf(ev, s.label);
    const p = sec && sec.price && sec.price.amount > 0 ? sec.price : null;
    if (!p) { none.push(s); continue; }
    const k = `${p.amount} ${p.currency}`;
    if (!by.has(k)) by.set(k, { amount: p.amount, currency: p.currency, sections: [] });
    by.get(k).sections.push(s);
  }
  const out = [...by.values()].sort((a, b) => a.amount - b.amount);
  if (none.length && out.length) out.push({ amount: -1, currency: '', sections: none });
  return out;
}

/* the sections whose name, or one of whose listing IDs, has what was typed */
export function search(list, query) {
  const q = String(query || '').trim();
  if (!q) return list;
  const k = SK.util.normKey(q);
  const id = q.replace(/\D/g, '');
  return list.filter(s => SK.util.normKey(s.label).includes(k) || (id.length >= 3 && s.rows.some(r => String(r.id).includes(id))));
}

/* One saved scan through the drawer's filters.
 * opts = { layout, q, onlyMine, instant, sort, qty, price, stands }
 * ctx  = { ev (the tracked event, or null), bought (listing ids whose request is Bought) }
 * -> { totals, all, sections, standsOn, stands, groups, group, found } */
export function listingsOf(scan, opts, ctx = {}) {
  const store = M().storeOf(scan);
  const bought = ctx.bought || new Set();
  const shown = opts.instant ? M().onlyInstant(store, r => !!r.mine && bought.has(String(r.id))) : store;
  const totals = M().totals(shown);
  const all = opts.instant ? M().totals(store) : null;
  const list = M().sectionsView(shown, { onlyMine: !!opts.onlyMine, sort: opts.sort || 'section' });
  const matched = search(list, opts.q);
  const standsOn = standsHere(matched, ctx.ev);
  const sections = standsOn ? matched.filter(s => inStands(opts.stands, s.label)) : matched;
  const out = { totals, all, matched, sections, standsOn, stands: standsOn ? standChoices(matched) : [], groups: [], group: null, found: [] };
  if (opts.layout === 'price') {
    out.groups = sectorPrices(sections, ctx.ev);
    out.group = opts.price ? out.groups.find(g => g.amount === opts.price) || null : null;
    out.found = M().byPrice(out.group ? out.group.sections : sections, opts.qty || 0);
  }
  return out;
}

/* What changed from the older saved scan to the newer, filtered.
 * opts = { kind, onlyChanged, stands } -> diffScans' answer plus { sections, standsOn, stands, counts } */
export function changesOf(older, newer, opts, ctx = {}) {
  const d = M().diffScans(older, newer);
  const test = kindTest(opts.kind);
  const standsOn = standsHere(d.sections, ctx.ev);
  let sections = standsOn ? d.sections.filter(s => inStands(opts.stands, s.label)) : d.sections;
  const all = (opts.kind || 'all') === 'all';
  if (opts.onlyChanged !== false || !all) sections = sections.filter(s => d.changes.some(c => c.k === s.key && test(c)) || (all && s.status));
  const counts = Object.fromEntries(DIFF_KINDS.map(([k, , t]) => [k, d.changes.filter(t).length]));
  const order = { new: 0, gone: 1, changed: 2 };
  const changesIn = key => d.changes.filter(c => c.k === key && test(c))
    .sort((x, y) => order[x.kind] - order[y.kind] || (x.b || x.a).price - (y.b || y.a).price);
  return Object.assign({}, d, { shown: sections, standsOn, stands: standsOn ? standChoices(d.sections) : [], counts, changesIn });
}

/* "1–4" or "6"; "?" when it was not read */
export const qtyText = r => (r.qtyMax ? (r.qtyMin && r.qtyMin !== r.qtyMax ? `${r.qtyMin}–${r.qtyMax}` : String(r.qtyMax)) : '?');
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
export const currencyOf = scan => ((scan && scan.rows || []).find(r => r.currency) || {}).currency || 'USD';

/* "sell 2 tickets", "are single tickets", "sell more than 10 tickets" */
export const qtyWords = n => SK.market.qtyWords(n);

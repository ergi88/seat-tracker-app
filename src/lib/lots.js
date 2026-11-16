/* ------------------------------------------------------------------
 * Inventory: the tickets you bought, lot by lot, and where they went.
 *
 * A lot is a purchase (the purchases table): so many tickets, for one event,
 * at one price. Only lots are inventory. A listing or a sale with no lot
 * behind it is not stock you hold; it is a ticket you still have to buy
 * (you often sell first and buy after), so it goes on the "To buy" list.
 *
 * A lot's tickets are put on viagogo listings by hand: purchase.assigned
 * = { listings: { [listingId]: qty }, sales: { [saleId]: qty } }. A lot of
 * 10 can sit on one listing or be split over several. A listing sells in
 * pieces (3 now, 2 later); the tickets its sales took come off its lots,
 * oldest lot first. A sale with no listing (or none the app knows) is put on
 * a lot by hand, in `sales`.
 *
 * The rest of `assigned` is typed in the lot's sheet too:
 *   seats  the lot's seats, as a note ("row 5, 10-20")
 *   notes  { [saleId]: "16-20" }: which of the lot's seats a sale took
 *   other  [{ id, qty, price, currency, on, where, seats }]: tickets sold
 *          outside viagogo (cash, a friend, another site); they count as sold
 *
 * Per lot:  bought = qty, sold, listed (still on an active listing),
 *           free = in your hands and on no listing.
 * Once the event's day has passed, what is left is unsold: no longer in
 * hand, listed or free, and its cost is lost.
 *
 * Back the other way, for the listing and sale sheets and their money:
 *   cover[listingId] = { lots: [{ lot, qty, sold, listed }], sold, listed }
 *                      (sold / listed: tickets of it no lot covers)
 *   saleLots[saleId] = [{ lot, qty }]: which lots a sale's tickets came from
 *   buyOfLots(parts)  what those tickets cost, from the lots' paid prices
 * All money in lek.
 * ------------------------------------------------------------------ */

const ACTIVE = new Set(['active', 'pending']);
const norm = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const digits = v => String(v || '').replace(/\D/g, '');
const fin = n => Number.isFinite(n);

/* oldest lot first: they sell in the order they were bought */
const byAge = (a, b) => String(a.p.boughtOn).localeCompare(String(b.p.boughtOn)) || (a.p.createdAt || 0) - (b.p.createdAt || 0) || String(a.p.id).localeCompare(String(b.p.id));

export const assignedOf = p => {
  const a = (p && p.assigned) || {};
  return {
    listings: Object.assign({}, a.listings), sales: Object.assign({}, a.sales),
    seats: String(a.seats || ''), notes: Object.assign({}, a.notes),
    other: (Array.isArray(a.other) ? a.other : []).map(x => Object.assign({}, x))
  };
};

/* tickets of a lot put anywhere: on listings, on sales by hand, sold outside viagogo */
export const placedOf = p => {
  const a = assignedOf(p);
  return [...Object.values(a.listings), ...Object.values(a.sales), ...a.other.map(x => x.qty)].reduce((n, q) => n + (Number(q) || 0), 0);
};

/* Which event something belongs to: a tracked event, else viagogo's event
 * (vg:<id>), else its title and date. A viagogo event a tracked event is
 * sold on counts as that tracked event. */
export function groupKeyer(events) {
  const byVg = {};
  for (const ev of events || []) if (ev.vgEventId) byVg[ev.vgEventId] = ev.key;
  return x => {
    if (x.eventKey) return x.eventKey;
    const id = digits(x.vgEventId);
    if (id) return byVg[id] || 'vg:' + id;
    return 't:' + norm(`${x.title || x.eventTitle || ''} ${x.when || ''}`);
  };
}

/* -> { groups: [group], byKey: { [key]: group }, total, toBuy: [entry], uploaded: [entry] }
 * group = { key, eventKey, vgEventId, name, num, time, past, archived, tracked,
 *           lots, listings, sales, toBuy, total }
 * lekOf(amount, currency, at) -> lek or null when there's no rate */
export function lotsOf({ events, purchases, listings, sales, lekOf, rateNow, isPaid = s => /^complete/i.test(String(s.status || '')), now = Date.now() }) {
  const keyOf = groupKeyer(events);
  const evByKey = Object.fromEntries((events || []).map(e => [e.key, e]));
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const groups = new Map();
  const group = (key, x) => {
    if (!groups.has(key)) {
      const ev = evByKey[key] || null;
      groups.set(key, {
        key, eventKey: ev ? ev.key : null, vgEventId: ev ? ev.vgEventId || '' : key.startsWith('vg:') ? key.slice(3) : '',
        name: ev ? (ev.info && ev.info.name) || ev.title || '' : '', num: ev ? ev.num : null,
        time: ev ? ev.time ?? null : null, archived: !!(ev && ev.archived), tracked: !!ev,
        lots: [], listings: [], sales: [], toBuy: []
      });
    }
    const g = groups.get(key);
    if (x) {
      if (!g.name) g.name = x.title || x.eventTitle || '';
      if (g.time === null && x.time != null) g.time = x.time;
    }
    return g;
  };

  for (const l of listings || []) group(keyOf(l), l).listings.push(l);
  for (const s of sales || []) group(keyOf(s), s).sales.push(s);

  /* the lots, with what one ticket of each cost */
  const lots = (purchases || []).map(p => {
    const key = keyOf(p);
    const g = group(key, { title: p.eventTitle });
    const ev = evByKey[key];
    const sec = ev && p.sectorId ? (ev.sectors || []).find(s => s.id === String(p.sectorId)) : null;
    let each = null;
    let priceFrom = null;
    if (Number(p.price) > 0) { each = lekOf(Number(p.price), p.currency, Date.parse(p.boughtOn) || 0); priceFrom = 'paid'; }
    else if (sec && sec.price) { each = lekOf(sec.price.amount, sec.price.currency, 0); priceFrom = 'list'; }
    const a = assignedOf(p);
    const lot = {
      id: p.id, p, key, qty: Number(p.qty) || 0, each, priceFrom,
      code: sec ? sec.code : p.section || '', seats: a.seats.trim(), notes: a.notes,
      on: [], hand: [], sales: [], other: [], sold: 0, listed: 0, payoutL: 0, listedL: 0, unpaidL: 0,
      elsewhere: 0, noPrice: 0, unsold: 0
    };
    g.lots.push(lot);
    return lot;
  }).sort(byAge);

  const payEach = s => {
    const p = s.money && s.money.payoutL;
    return fin(p) && Number(s.tickets) > 0 ? p / Number(s.tickets) : null;
  };

  /* sales put on lots by hand: those tickets are theirs, whatever listing they came from */
  const saleById = Object.fromEntries((sales || []).map(s => [s.id, s]));
  const handLeft = {};                       // saleId -> tickets no lot took
  const saleLots = {};                       // saleId -> [{ lot, qty }]
  const byHand = new Set();
  for (const lot of lots) {
    for (const [sid, q] of Object.entries(assignedOf(lot.p).sales)) {
      const s = saleById[sid];
      if (!s || !(Number(q) > 0)) continue;
      byHand.add(sid);
      if (handLeft[sid] === undefined) handLeft[sid] = Number(s.tickets) || 0;
      const take = Math.min(Number(q), handLeft[sid]);
      handLeft[sid] -= take;
      const each = payEach(s);
      lot.sold += take;
      if (each !== null) { lot.payoutL += take * each; if (!isPaid(s)) lot.unpaidL += take * each; }
      lot.hand.push({ sale: s, qty: Number(q), took: take });
      if (take) { lot.sales.push({ sale: s, qty: take, via: 'hand', note: String(lot.notes[sid] || '') }); (saleLots[sid] = saleLots[sid] || []).push({ lot, qty: take }); }
    }
  }

  /* tickets sold outside viagogo, typed on the lot */
  for (const lot of lots) {
    for (const x of assignedOf(lot.p).other) {
      const q = Math.round(Number(x.qty)) || 0;
      if (q <= 0) continue;
      const each = Number(x.price) > 0 ? lekOf(Number(x.price), x.currency || 'ALL', Date.parse(x.on) || 0) : null;
      lot.sold += q;
      lot.elsewhere += q;
      if (each !== null && fin(each)) lot.payoutL += q * each; else lot.noPrice += q;
      lot.other.push(Object.assign({}, x, { qty: q, eachL: each }));
    }
  }

  /* each listing: its sales come off its lots oldest first, then what is
   * still listed; what no lot covers is still to buy */
  const listingById = Object.fromEntries((listings || []).map(l => [l.id, l]));
  const soldOf = {};
  for (const s of sales || []) {
    if (!s.listingId || byHand.has(s.id) || !listingById[s.listingId]) continue;
    (soldOf[s.listingId] = soldOf[s.listingId] || []).push(s);
  }
  const cover = {};                          // listingId -> { sold, listed } no lot covers
  const bySold = (a, b) => String(a.soldOn || '').localeCompare(String(b.soldOn || '')) || String(a.id).localeCompare(String(b.id));
  for (const l of listings || []) {
    /* the lots on this listing, oldest first, and how many of theirs it sold */
    const on = lots.map(lot => ({ lot, a: Number(assignedOf(lot.p).listings[l.id]) || 0, s: 0 })).filter(x => x.a > 0);
    let restSold = 0;
    for (const s of (soldOf[l.id] || []).slice().sort(bySold)) {
      let left = Number(s.tickets) || 0;
      const each = payEach(s);
      for (const x of on) {
        const take = Math.min(left, x.a - x.s);
        if (take <= 0) continue;
        x.s += take;
        left -= take;
        x.lot.sold += take;
        if (each !== null) { x.lot.payoutL += take * each; if (!isPaid(s)) x.lot.unpaidL += take * each; }
        x.lot.sales.push({ sale: s, qty: take, via: 'listing', listing: l, note: String(x.lot.notes[s.id] || '') });
        (saleLots[s.id] = saleLots[s.id] || []).push({ lot: x.lot, qty: take });
      }
      restSold += left;
    }
    let restListed = ACTIVE.has(l.statusKind) ? Number(l.tickets) || 0 : 0;
    const listEach = l.money && fin(l.money.payoutL) ? l.money.payoutL : null;
    const lotsHere = [];
    for (const x of on) {
      const k = Math.min(restListed, x.a - x.s);
      restListed -= k;
      x.lot.listed += k;
      if (listEach !== null) x.lot.listedL += k * listEach;
      x.lot.on.push({ listing: l, qty: x.a, sold: x.s, listed: k });
      lotsHere.push({ lot: x.lot, qty: x.a, sold: x.s, listed: k });
    }
    cover[l.id] = { lots: lotsHere, sold: restSold, listed: restListed };
  }
  /* an assignment to a listing the app no longer has: those tickets are back in hand */
  for (const lot of lots) {
    for (const [lid, q] of Object.entries(assignedOf(lot.p).listings)) {
      if (!listingById[lid] && Number(q) > 0) lot.on.push({ listing: null, listingId: lid, qty: Number(q), sold: 0, listed: 0 });
    }
  }

  for (const g of groups.values()) g.past = g.time !== null && g.time < t0.getTime();
  for (const lot of lots) {
    lot.sales.sort((a, b) => bySold(a.sale, b.sale));
    lot.inHand = Math.max(0, lot.qty - lot.sold);
    lot.free = Math.max(0, lot.qty - lot.sold - lot.listed);
    /* the event is over: what did not sell is lost */
    if (groups.get(lot.key).past) { lot.unsold = lot.inHand; lot.inHand = 0; lot.free = 0; lot.listed = 0; lot.listedL = 0; }
    lot.placed = placedOf(lot.p);
    lot.costL = lot.each !== null ? lot.each * lot.qty : null;
  }

  /* what you sold or listed with no lot behind it, until the event is over */
  const toBuy = [];
  const uploaded = [];
  for (const g of groups.values()) {
    if (g.past) continue;
    for (const l of g.listings) {
      const c = cover[l.id];
      if (!c || !(c.sold + c.listed)) continue;
      const e = { kind: 'listing', key: 'l:' + l.id, group: g, listing: l, sold: c.sold, listed: c.listed, qty: c.sold + c.listed };
      g.toBuy.push(e);
      toBuy.push(e);
      if (l.uploaded === true && ACTIVE.has(l.statusKind)) uploaded.push(e);
    }
    for (const s of g.sales) {
      const known = s.listingId && listingById[s.listingId];
      const left = byHand.has(s.id) ? handLeft[s.id] || 0 : known ? 0 : Number(s.tickets) || 0;
      if (!left) continue;
      const e = { kind: 'sale', key: 's:' + s.id, group: g, sale: s, sold: left, listed: 0, qty: left };
      g.toBuy.push(e);
      toBuy.push(e);
    }
  }

  for (const g of groups.values()) g.total = totalOf(g.lots, g, listings, rateNow);
  const held = [...groups.values()].filter(g => g.lots.length);
  /* nearest first, the past after what is coming, no date last */
  const rank = g => (g.time === null ? 2 : g.past ? 1 : 0);
  held.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.time - a.time : (a.time || 0) - (b.time || 0)) || a.name.localeCompare(b.name));
  return {
    groups: held,
    byKey: Object.fromEntries([...groups.values()].map(g => [g.key, g])),
    total: sumOf(held.map(g => g.total)),
    toBuy, uploaded, keyOf, cover, saleLots
  };
}

/* What tickets taken from lots cost a ticket, from the lots' paid prices:
 * parts = [{ lot, qty }]. In the lots' own currency when they share one,
 * else in lek. Lots with no paid price are left out (counted in `unpriced`).
 * -> { amount, currency, qty, unpriced } or null when no part has a price */
export function buyOfLots(parts) {
  const priced = (parts || []).filter(x => x.qty > 0 && x.lot && x.lot.priceFrom === 'paid');
  const unpriced = (parts || []).filter(x => x.qty > 0 && !(x.lot && x.lot.priceFrom === 'paid')).reduce((n, x) => n + x.qty, 0);
  const qty = priced.reduce((n, x) => n + x.qty, 0);
  if (!qty) return null;
  const curs = new Set(priced.map(x => x.lot.p.currency || 'ALL'));
  if (curs.size === 1) {
    const amount = priced.reduce((n, x) => n + x.qty * Number(x.lot.p.price), 0) / qty;
    return { amount: Math.round(amount * 100) / 100, currency: [...curs][0], qty, unpriced };
  }
  return { amount: Math.round(priced.reduce((n, x) => n + x.qty * x.lot.each, 0) / qty), currency: 'ALL', qty, unpriced };
}

/* one event's lots added up, and what the tickets left must bring */
function totalOf(lots, g, listings, rateNow) {
  const sum = f => lots.reduce((n, x) => n + (x[f] || 0), 0);
  const t = {
    lots: lots.length, bought: sum('qty'), sold: sum('sold'), listed: sum('listed'), free: sum('free'), inHand: sum('inHand'),
    unsold: sum('unsold'), elsewhere: sum('elsewhere'), noPrice: sum('noPrice'),
    spentL: lots.reduce((n, x) => n + (x.costL || 0), 0),
    unpriced: lots.filter(x => x.each === null).reduce((n, x) => n + x.qty, 0),
    payoutL: sum('payoutL'), unpaidL: sum('unpaidL'), listedL: sum('listedL'),
    leftCostL: lots.reduce((n, x) => n + (x.each !== null ? x.each * x.inHand : 0), 0),
    toBuy: g ? g.toBuy.reduce((n, e) => n + e.qty, 0) : 0
  };
  finish(t);
  /* the viagogo price each ticket left must be listed at to break even:
   * the payout it needs, over the share viagogo pays out (from a listing of yours) */
  t.ask = null;
  const ref = g && g.listings.find(l => ACTIVE.has(l.statusKind) && l.money && l.money.ratio && l.money.sellRate);
  if (ref && t.toGoEachL) t.ask = { amount: t.toGoEachL / ref.money.sellRate / ref.money.ratio, currency: ref.currency || ref.money.currency };
  else if (t.toGoEachL && rateNow) {
    const r = rateNow('USD');
    if (r) t.ask = { amount: t.toGoEachL / r, currency: 'USD', payoutOnly: true };
  }
  return t;
}

function finish(t) {
  t.netL = t.payoutL - t.spentL;                 // < 0: still that much to win back
  t.toGoL = Math.max(0, -t.netL);
  t.toGoEachL = t.toGoL && t.inHand ? t.toGoL / t.inHand : 0;
  /* still to win back with tickets in hand, or lost for good (nothing left to sell) */
  t.riskL = t.inHand ? t.toGoL : 0;
  t.lostL = t.inHand ? 0 : t.toGoL;
  /* if every listed ticket sells at its price today */
  t.ifListedL = t.listed ? t.netL + t.listedL : null;
  return t;
}

/* several events' totals added up */
export function sumOf(totals) {
  const keys = ['lots', 'bought', 'sold', 'listed', 'free', 'inHand', 'unsold', 'elsewhere', 'noPrice', 'spentL', 'unpriced', 'payoutL', 'unpaidL', 'listedL', 'leftCostL', 'toBuy'];
  const t = Object.fromEntries(keys.map(k => [k, totals.reduce((n, x) => n + (x[k] || 0), 0)]));
  finish(t);
  /* an event's loss stays its own: a finished event's is not spread over another's tickets */
  t.riskL = totals.reduce((n, x) => n + (x.riskL || 0), 0);
  t.lostL = totals.reduce((n, x) => n + (x.lostL || 0), 0);
  t.toGoEachL = t.riskL && t.inHand ? t.riskL / t.inHand : 0;
  return t;
}

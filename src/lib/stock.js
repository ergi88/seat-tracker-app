/* ------------------------------------------------------------------
 * Your stock for one event: tickets bought, listed on viagogo and sold,
 * per section, and the money: what they cost, what came back, and what the
 * rest must bring to break even.
 *
 * Bought = your purchases, plus requests marked bought that no purchase
 * covers. A sold or listed ticket was bought too, even when no purchase was
 * saved for it, so a section holds at least sold + listed; those extra
 * tickets cost what their sale's or listing's buy price says.
 * All money in lek.
 * ------------------------------------------------------------------ */

const ACTIVE = new Set(['active', 'pending']);
const norm = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* lekOf(amount, currency, at) -> lek or null when there's no rate */
export function stockOf({ ev, purchases, requests, listings, sales, lekOf, isPaid, rateNow }) {
  const secs = new Map();
  const byCode = new Map((ev.sectors || []).map(s => [norm(s.code), s]));
  const sectorOf = id => (ev.sectors || []).find(s => s.id === String(id));
  const bucket = (sectorId, label) => {
    const s = (sectorId && sectorOf(sectorId)) || byCode.get(norm(label)) || null;
    const k = s ? 's:' + s.id : 'v:' + (norm(label) || '?');
    if (!secs.has(k)) {
      secs.set(k, {
        key: k, sectorId: s ? s.id : null, code: s ? s.code : String(label || '?'), price: s ? s.price : null,
        bought: 0, boughtL: 0, boughtPriced: 0, sold: 0, soldCostL: 0, soldPriced: 0, payoutL: 0, unpaidL: 0, unpaid: 0,
        listed: 0, listedL: 0, listedCostL: 0, listedPriced: 0
      });
    }
    return secs.get(k);
  };
  for (const p of purchases || []) {
    if (p.eventKey !== ev.key) continue;
    const x = bucket(p.sectorId, '');
    const qty = Number(p.qty) || 0;
    const sp = x.price;
    const each = Number(p.price) > 0 ? lekOf(Number(p.price), p.currency, Date.parse(p.boughtOn) || 0)
      : sp ? lekOf(sp.amount, sp.currency, 0) : null;
    x.bought += qty;
    if (each !== null) { x.boughtL += each * qty; x.boughtPriced += qty; }
  }
  for (const r of requests || []) {
    if (r.eventKey !== ev.key || !r.bought) continue;
    const short = Math.max(0, (Number(r.qty) || 0) - (Number(r.purchased) || 0));
    if (!short) continue;
    const x = bucket(r.sec, r.code);
    const each = r.buy ? lekOf(r.buy.amount, r.buy.currency, 0) : null;
    x.bought += short;
    if (each !== null) { x.boughtL += each * short; x.boughtPriced += short; }
  }
  for (const s of sales || []) {
    if (s.eventKey !== ev.key) continue;
    const x = bucket(s.sectorId, s.section);
    const n = Number(s.tickets) || 0;
    const m = s.money || {};
    x.sold += n;
    if (Number.isFinite(m.payoutL)) {
      x.payoutL += m.payoutL;
      if (!isPaid(s)) { x.unpaidL += m.payoutL; x.unpaid++; }
    }
    if (m.missing === null && n) { x.soldCostL += m.costL; x.soldPriced += n; }
  }
  for (const l of listings || []) {
    if (l.eventKey !== ev.key || !ACTIVE.has(l.statusKind)) continue;
    const x = bucket(l.sectorId, l.section);
    const n = Number(l.tickets) || 0;
    const m = l.money || {};
    x.listed += n;
    if (Number.isFinite(m.payoutL)) x.listedL += m.payoutL * n;
    if (Number.isFinite(m.costL)) { x.listedCostL += m.costL * n; x.listedPriced += n; }
  }

  const rows = [...secs.values()].map(x => {
    const held = Math.max(x.bought, x.sold + x.listed);
    const extra = held - x.bought;               // sold or listed with no purchase saved
    /* what one ticket here cost: the purchases', else the sales' and listings' buy price, else the price list */
    const perSaved = x.boughtPriced ? x.boughtL / x.boughtPriced : null;
    const otherPriced = x.soldPriced + x.listedPriced;
    const perOther = otherPriced ? (x.soldCostL + x.listedCostL) / otherPriced : null;
    const list = x.price ? lekOf(x.price.amount, x.price.currency, 0) : null;
    const each = perSaved ?? perOther ?? list;
    const extraEach = perOther ?? perSaved ?? list;
    const unpricedSaved = x.bought - x.boughtPriced;
    let spentL = x.boughtL + (unpricedSaved && each !== null ? unpricedSaved * each : 0);
    let unpriced = each === null ? unpricedSaved : 0;
    if (extra) {
      if (extraEach !== null) spentL += extra * extraEach;
      else unpriced += extra;
    }
    const inHand = held - x.sold;
    return {
      key: x.key, sectorId: x.sectorId, code: x.code,
      held, bought: x.bought, extra, sold: x.sold, listed: x.listed,
      inHand, unlisted: Math.max(0, inHand - x.listed),
      each, spentL, unpriced,
      leftCostL: each !== null ? inHand * each : null,
      payoutL: x.payoutL, unpaidL: x.unpaidL, unpaid: x.unpaid, listedL: x.listedL
    };
  }).sort((a, b) => b.held - a.held || a.code.localeCompare(b.code, 'en', { numeric: true }));

  if (!rows.length) return null;
  const sum = f => rows.reduce((n, r) => n + (r[f] || 0), 0);
  const t = {
    held: sum('held'), bought: sum('bought'), extra: sum('extra'), sold: sum('sold'), listed: sum('listed'),
    inHand: sum('inHand'), unlisted: sum('unlisted'), unpriced: sum('unpriced'),
    spentL: sum('spentL'), payoutL: sum('payoutL'), unpaidL: sum('unpaidL'), unpaid: sum('unpaid'),
    listedL: sum('listedL'), leftCostL: sum('leftCostL')
  };
  t.netL = t.payoutL - t.spentL;                 // < 0: still that much to win back
  t.toGoL = Math.max(0, -t.netL);
  t.toGoEachL = t.toGoL && t.inHand ? t.toGoL / t.inHand : 0;
  /* if every listing sells at its price today */
  t.ifListedL = t.listed ? t.netL + t.listedL : null;

  /* the viagogo price each ticket left must be listed at to break even:
   * the payout it needs, over the share viagogo pays out (from a listing of yours) */
  const ref = (listings || []).find(l => l.eventKey === ev.key && ACTIVE.has(l.statusKind) && l.money && l.money.ratio && l.money.sellRate);
  t.ask = null;
  if (ref && t.toGoEachL) {
    t.ask = { amount: t.toGoEachL / ref.money.sellRate / ref.money.ratio, currency: ref.currency || ref.money.currency };
  } else if (t.toGoEachL && rateNow) {
    const r = rateNow('USD');
    if (r) t.ask = { amount: t.toGoEachL / r, currency: 'USD', payoutOnly: true };
  }
  return { rows, total: t };
}

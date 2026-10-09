/* ------------------------------------------------------------------
 * Seat Tracker - viagogo sales (my.viagogo.com/sales)
 *
 * My Sales loads its list from its own JSON endpoint, /sales/getSales,
 * page by page; the page then draws five cards at a time. Reading that
 * endpoint (same site, same cookies, exactly what the page itself asks for)
 * gives every sale with its listing ID and exact sale date, without clicking
 * through pages or opening every card.
 *
 * As captured on 2026-10-04:
 *   GET /sales/getSales?filters=STATUS%3AOPEN%7CCOMPLETED&sort=SALEDATE%20desc&page=N&pageSize=5
 *   -> { NumFound, Sale: [{ SaleId, ListingId, EventId, EventDescription, Section, Seats,
 *        Quantity, TotalPayout, TotalTicketPrice, SaleDate, Status, SubStatus, Buyer… }] }
 *   TotalPayout is what the card shows as "Total price": the seller's payout for
 *   the whole sale, not per ticket. Status "Complete" is paid, "Get Paid" is not
 *   paid yet — every card says "Completed" either way.
 *   The response also carries the buyer's name, email and phone: saleFromApi
 *   copies only the fields below, so none of it is ever kept.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  function isSalesPage(loc) {
    return !!loc && /^my\.viagogo\.com$/i.test(loc.hostname || '') && /^\/sales/i.test(loc.pathname || '');
  }

  /* newest sale first: what lets a scan stop at the sales it already has */
  function apiUrl(page, size) {
    return `/sales/getSales?filters=STATUS%3AOPEN%7CCOMPLETED&sort=SALEDATE%20desc&page=${page}&pageSize=${size}`;
  }

  const listOf = json => (json && (json.Sale || json.Sales || json.sales || json.Items)) || [];
  const totalOf = json => Number(json && (json.NumFound !== undefined ? json.NumFound : json.numFound));

  const num = v => {
    if (v && typeof v === 'object') v = v.Amount !== undefined ? v.Amount : v.amount;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v, n) => String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
  const digits = v => str(v, 30).replace(/\D/g, '');
  const currencyOf = x => {
    const c = (x.TotalPayout && x.TotalPayout.Currency) || x.Currency || x.CurrencyCode || x.PayoutCurrency || '';
    return /^[A-Z]{3}$/.test(String(c)) ? String(c) : 'USD';
  };

  /* "Section L34 • Row 16" may come as one string or as fields */
  function sectionParts(x) {
    const raw = str(x.Section || x.SectionName, 60);
    const m = /^(?:section\s+)?(.*?)(?:\s*[•·,]\s*row\s+(.+))?$/i.exec(raw) || [];
    return { section: str(m[1] || raw, 40), row: str(x.Row || x.RowName || m[2] || '', 20) };
  }

  /* one sale from the endpoint -> only what Seat Tracker keeps, or null */
  function saleFromApi(x) {
    if (!x) return null;
    const id = digits(x.SaleId || x.saleId || x.Id);
    if (id.length < 4) return null;
    const { section, row } = sectionParts(x);
    const when = str(x.EventDate || x.EventDateLocal || x.EventDateUTC || '', 40);
    const sold = str(x.SaleDate || x.saleDate || '', 40);
    const status = str(x.Status || '', 30);
    return {
      id,
      listingId: digits(x.ListingId || x.listingId) || null,
      vgEventId: digits(x.EventId || x.eventId),
      title: str(x.EventDescription || x.EventName || '', 200),
      when,
      venue: str(x.VenueDescription || x.VenueName || x.Venue || '', 120).replace(/\bnull\b,?\s*/g, '').replace(/,\s*,/g, ','),
      section, row,
      tickets: num(x.Quantity),
      currency: currencyOf(x),
      amount: num(x.TotalPayout),
      status,
      soldOn: /^\d{4}-\d{2}-\d{2}/.test(sold) ? sold.slice(0, 10) : '',
      soldAt: sold
    };
  }

  const isPaid = s => /^complete/i.test(String((s && s.status) || ''));

  /* One sale's money in lek, at the rates of the day it sold.
   * buy = { amount, currency } per ticket, or null.
   * -> { missing: null | 'sale' | 'rate' | 'buy', payoutL, costL, profitL, winRate } */
  function saleMoney(sale, buy, rates) {
    const P = SK.profit;
    const tickets = Number(sale && sale.tickets) || 0;
    if (!(Number(sale && sale.amount) > 0) || !tickets) return { missing: 'sale' };
    const sellRate = P.rateOf(rates, sale.currency || 'USD');
    if (!sellRate) return { missing: 'rate', currency: sale.currency };
    const payoutL = sale.amount * sellRate;
    if (!buy || !(Number(buy.amount) > 0)) return { missing: 'buy', payoutL };
    const buyRate = P.rateOf(rates, buy.currency || P.BASE);
    if (!buyRate) return { missing: 'rate', currency: buy.currency, payoutL };
    const costL = buy.amount * buyRate * tickets;
    return { missing: null, payoutL, costL, profitL: payoutL - costL, winRate: costL > 0 ? payoutL / costL : null };
  }

  function emptySum() {
    /* sold: what the sales paid, in the currency viagogo paid it in — { USD: 162 } */
    return { sales: 0, tickets: 0, payoutL: 0, costL: 0, profitL: 0, counted: 0, noBuy: 0, noRate: 0, unpaid: 0, unpaidL: 0, sold: {} };
  }
  function addTo(sum, s) {
    const m = s.money || {};
    sum.sales++;
    sum.tickets += Number(s.tickets) || 0;
    if (Number(s.amount) > 0) { const c = s.currency || 'USD'; sum.sold[c] = Math.round(((sum.sold[c] || 0) + Number(s.amount)) * 100) / 100; }
    if (Number.isFinite(m.payoutL)) sum.payoutL += m.payoutL;
    if (!isPaid(s)) { sum.unpaid++; if (Number.isFinite(m.payoutL)) sum.unpaidL += m.payoutL; }
    if (m.missing === null) { sum.counted++; sum.costL += m.costL; sum.profitL += m.profitL; }
    else if (m.missing === 'buy') sum.noBuy++;
    else if (m.missing === 'rate') sum.noRate++;
  }

  /* Sales grouped by event, then by section, with totals at every level.
   * Each sale carries .money from saleMoney.
   * -> { total, events: [{ key, title, when, venue, lastSold, total, sections: [{ section, total, sales }] }] } */
  function groupSales(sales) {
    const events = new Map();
    const total = emptySum();
    for (const s of sales || []) {
      const key = s.vgEventId || 'title:' + String(s.title || '').toLowerCase();
      if (!events.has(key)) events.set(key, { key, title: s.title, when: s.when, venue: s.venue, lastSold: '', total: emptySum(), byLabel: new Map() });
      const ev = events.get(key);
      const label = s.section || '?';
      if (!ev.byLabel.has(label)) ev.byLabel.set(label, { section: label, total: emptySum(), sales: [] });
      const sec = ev.byLabel.get(label);
      sec.sales.push(s);
      addTo(sec.total, s);
      addTo(ev.total, s);
      addTo(total, s);
      if (String(s.soldOn || '') > ev.lastSold) ev.lastSold = String(s.soldOn || '');
    }
    const byDate = (a, b) => String(b.soldAt || b.soldOn || '').localeCompare(String(a.soldAt || a.soldOn || ''));
    const list = [...events.values()].map(ev => {
      const sections = [...ev.byLabel.values()]
        .map(x => Object.assign(x, { total: rate(x.total), sales: x.sales.sort(byDate) }))
        .sort((a, b) => a.section.localeCompare(b.section, 'en', { numeric: true }));
      delete ev.byLabel;
      return Object.assign(ev, { total: rate(ev.total), sections });
    }).sort((a, b) => b.lastSold.localeCompare(a.lastSold) || String(a.title).localeCompare(String(b.title)));
    return { total: rate(total), events: list };
  }
  /* win rate over the sales that have a cost: what they paid ÷ what they cost */
  function rate(sum) {
    const paidOfCounted = sum.costL + sum.profitL;
    sum.winRate = sum.costL > 0 ? paidOfCounted / sum.costL : null;
    return sum;
  }

  /* Where a scan of newest-first sales may stop: at the first sale already
   * saved — unless a saved sale was still unpaid, in which case it reads on
   * until it is past the oldest unpaid one, so a payout that came in since is
   * picked up too. -> (sale) => true when the scan can stop here */
  function stopRule(saved) {
    const list = Object.values(saved || {});
    const unpaid = list.filter(s => !isPaid(s) && s.soldOn).map(s => s.soldOn).sort();
    const oldestUnpaid = unpaid.length ? unpaid[0] : '';
    return sale => {
      const had = saved && saved[sale.id];
      if (!had) return false;
      if (!oldestUnpaid) return true;
      return !!sale.soldOn && sale.soldOn < oldestUnpaid;
    };
  }

  SK.sales = { isSalesPage, apiUrl, listOf, totalOf, saleFromApi, isPaid, saleMoney, groupSales, stopRule };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

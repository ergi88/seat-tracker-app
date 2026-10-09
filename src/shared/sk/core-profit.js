/* ------------------------------------------------------------------
 * Seat Tracker - buy price, viagogo payout and profit, in lek
 *
 * Lek (ALL) is the base currency: every amount is converted to lek at the
 * rate of the day it was read. Pure functions, shared by the service worker
 * (which computes) and the screens (which format).
 *
 * win rate = what viagogo pays you ÷ what the tickets cost, shown as (x1.6);
 * under x1 is a loss.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const BASE = 'ALL';
  const CURRENCIES = ['ALL', 'USD', 'EUR', 'RSD', 'GBP'];
  const SIGNS = { USD: '$', EUR: '€', GBP: '£' };

  /* "$", "US$", "€", "Lekë", "RSD" … -> ISO code, or null */
  function currencyOf(token) {
    const t = String(token || '').trim().replace(/\.$/, '');
    if (!t) return null;
    if (/^(US\$|\$|USD)$/i.test(t)) return 'USD';
    if (/^(€|EUR)$/i.test(t)) return 'EUR';
    if (/^(£|GBP)$/i.test(t)) return 'GBP';
    if (/^(Lekë|Leke|Lek|L|ALL)$/i.test(t)) return 'ALL';
    if (/^(RSD|дин|din)$/i.test(t)) return 'RSD';
    return null;
  }

  /* "1,045.00", "1.045,00", "84", "84,50", "1 045" -> number, or null */
  function parseNumber(raw) {
    let s = String(raw == null ? '' : raw).replace(/[\s  ]/g, '');
    if (!/\d/.test(s)) return null;
    const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    if (dot > -1 && comma > -1) {
      s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (comma > -1) {
      s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, '');
    }
    const n = Number(s.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  const MONEY = /(US\$|\$|€|£|Lekë|Leke|Lek|RSD|USD|EUR|GBP|ALL)?\s*(\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(US\$|\$|€|£|Lekë|Leke|Lek|L\b|RSD|USD|EUR|GBP|ALL|дин\.?)?/i;

  /* "$84.00" -> { amount: 84, currency: 'USD' }; currency null when the text has no sign */
  function parseMoney(text) {
    const m = MONEY.exec(String(text == null ? '' : text).replace(/ /g, ' '));
    if (!m) return null;
    const amount = parseNumber(m[2]);
    if (amount === null) return null;
    return { amount, currency: currencyOf(m[1]) || currencyOf(m[3]) };
  }

  /* "Rates from Lekë1,045.00 to Lekë1,500.00" -> { min, max, currency } */
  function priceRange(text, currency) {
    const re = new RegExp(MONEY.source, 'gi');
    const found = [];
    let cur = null, m;
    const t = String(text == null ? '' : text).replace(/ /g, ' ');
    while ((m = re.exec(t))) {
      const n = parseNumber(m[2]);
      if (n > 0) found.push(n);
      cur = cur || currencyOf(m[1]) || currencyOf(m[3]);
      if (m[0] === '') re.lastIndex++;
    }
    if (!found.length) return null;
    return { min: Math.min(...found), max: Math.max(...found), currency: currency || cur || BASE };
  }

  /* ---------------- rates ------------------------------------------- */

  const dayOf = at => new Date(at || Date.now()).toISOString().slice(0, 10);

  /* fxByDay: { '2026-09-17': { USD: 83.36, EUR: 97.5, RSD: 0.833 } } (lek per unit).
   * The rates of the day `at` was read (else the closest earlier day, else the
   * oldest known), with the team's manual rates on top. */
  function pickRates(fxByDay, override, at) {
    const days = Object.keys(fxByDay || {}).sort();
    const want = dayOf(at);
    let day = null;
    for (const d of days) if (d <= want) day = d;
    if (!day && days.length) day = days[0];
    const rates = Object.assign({}, day ? fxByDay[day] : {});
    const manual = [];
    for (const [k, v] of Object.entries(override || {})) {
      if (Number(v) > 0) { rates[k] = Number(v); manual.push(k); }
    }
    return { rates, day, manual };
  }

  function rateOf(rates, currency) {
    if (!currency || currency === BASE) return currency === BASE ? 1 : null;
    const r = Number((rates || {})[currency]);
    return r > 0 ? r : null;
  }

  /* ---------------- buy price --------------------------------------- */

  /* Where a request's ticket price comes from, most specific first:
   * a price typed on the request, Posttick's price categories, eFinity's
   * sector price, the price range a scan read (eBileta). */
  function buyPriceOf(x) {
    const r = x.request || {};
    const l = x.listing || {};
    /* A price typed on the listing wins over everything. It is the only buy
     * price a listing on an event nobody tracks can have, and it is the one
     * you meant when you typed it there. */
    if (Number(l.buyPrice) > 0) return { amount: Number(l.buyPrice), currency: l.buyCurrency || BASE, source: 'typed on the listing' };
    if (Number(r.buyPrice) > 0) return { amount: Number(r.buyPrice), currency: r.buyCurrency || BASE, source: 'typed' };
    const s = x.summary || {};
    if (x.site === 'posttick' && x.event) {
      const picked = (r.cats || []).map(String);
      const cats = picked.length ? picked : (s.cats || []).map(String);
      const prices = cats.map(k => Number(x.event.cats && x.event.cats[k] && x.event.cats[k].price)).filter(p => p > 0);
      if (prices.length) {
        return {
          amount: Math.max(...prices), currency: 'EUR', source: picked.length ? 'picked price' : 'section price',
          range: prices.length > 1 ? [Math.min(...prices), Math.max(...prices)] : null
        };
      }
    }
    const meta = (x.sector && x.sector.meta) || {};
    if (x.site === 'efinity' && Number(meta.price) > 0) return { amount: Number(meta.price), currency: 'RSD', source: 'sector price' };
    if (s.price && Number(s.price.max) > 0) {
      return {
        amount: Number(s.price.max), currency: s.price.currency || BASE, source: 'section price',
        range: Number(s.price.min) > 0 && s.price.min !== s.price.max ? [Number(s.price.min), Number(s.price.max)] : null
      };
    }
    return null;
  }

  /* ---------------- profit ------------------------------------------ */

  /* listing: { price, payout, tickets, currency, recommended } as read on viagogo.
   * -> { missing: 'listing' | 'rate' | 'buy' | null, tickets, ratio, payoutL, costL,
   *      perTicket, total, winRate, breakEven, atRecommended } — all money in lek,
   *      breakEven in the listing's currency */
  function profitOf(listing, buy, rates) {
    const tickets = Number(listing && listing.tickets) || 0;
    const price = Number(listing && listing.price) || 0;
    const payout = Number(listing && listing.payout) || 0;
    if (!tickets || !price || !payout) return { missing: 'listing' };
    const sellRate = rateOf(rates, listing.currency);
    if (!sellRate) return { missing: 'rate', currency: listing.currency || null };
    const ratio = payout / (price * tickets);
    const payoutL = (payout / tickets) * sellRate;
    const out = { missing: null, tickets, ratio, payoutL, sellRate, currency: listing.currency || '' };
    if (!buy) return Object.assign(out, { missing: 'buy' });
    const buyRate = rateOf(rates, buy.currency);
    if (!buyRate) return Object.assign(out, { missing: 'rate', currency: buy.currency });
    const costL = buy.amount * buyRate;
    const perTicket = payoutL - costL;
    Object.assign(out, {
      costL, perTicket, total: perTicket * tickets,
      winRate: costL > 0 ? payoutL / costL : null,
      breakEven: costL / sellRate / ratio
    });
    if (Number(listing.recommended) > 0) {
      const recL = Number(listing.recommended) * ratio * sellRate;
      out.atRecommended = {
        price: Number(listing.recommended), perTicket: recL - costL,
        total: (recL - costL) * tickets, winRate: costL > 0 ? recL / costL : null
      };
    }
    return out;
  }

  /* What the same listing would earn at another price, without changing it.
   * viagogo keeps back the same share whatever the price, so its payout ratio
   * carries over: payout per ticket = price x ratio.
   * -> { price, payoutPerTicket, payout, payoutL, perTicket, total, winRate } */
  function atPrice(money, price) {
    const p = Number(price);
    if (!money || money.missing === 'listing' || money.missing === 'rate' || !(p > 0) || !money.ratio || !money.sellRate) return null;
    const payoutPerTicket = p * money.ratio;
    const payoutL = payoutPerTicket * money.sellRate;
    const out = { price: p, payoutPerTicket, payout: payoutPerTicket * money.tickets, payoutL, tickets: money.tickets, currency: money.currency };
    if (money.costL === undefined || money.costL === null) return out;
    const perTicket = payoutL - money.costL;
    return Object.assign(out, {
      costL: money.costL, perTicket, total: perTicket * money.tickets,
      winRate: money.costL > 0 ? payoutL / money.costL : null
    });
  }

  /* The share of the ask viagogo hands over, learned from the listings of
   * yours it has already paid out on (the middle one, so one odd listing
   * cannot move it). -> 0..1, or null when there is nothing to learn from */
  function keepRatio(listings) {
    const rs = (listings || [])
      .map(l => l && l.money && l.money.ratio)
      .filter(r => Number.isFinite(r) && r > 0 && r <= 1)
      .sort((a, b) => a - b);
    if (!rs.length) return null;
    const mid = rs.length >> 1;
    return rs.length % 2 ? rs[mid] : (rs[mid - 1] + rs[mid]) / 2;
  }

  /* A price worked out by hand, with no listing behind it: what the tickets
   * cost, what you would ask, and the share viagogo hands over. The same
   * arithmetic a real listing goes through, so the two always agree.
   * q = { buy, buyCurrency, sell, sellCurrency, tickets, keep } */
  function quote(q, rates) {
    const tickets = Math.max(1, Math.round(Number(q.tickets) || 1));
    const sell = Number(q.sell);
    const buy = Number(q.buy);
    const keep = Number(q.keep);
    const ratio = keep > 0 && keep <= 1 ? keep : 1;
    if (!(sell > 0)) return { missing: 'sell', tickets, ratio };
    const listing = { price: sell, payout: sell * ratio * tickets, tickets, currency: q.sellCurrency || BASE };
    const cost = Number.isFinite(buy) && buy > 0 ? { amount: buy, currency: q.buyCurrency || BASE } : null;
    return Object.assign(profitOf(listing, cost, rates), { tickets, ratio, sell, buy: cost ? buy : null });
  }

  /* the multiples of their cost worth asking for, as references */
  const WIN_TARGETS = [1.5, 2, 2.5, 3];

  /* The ask at which the tickets neither win nor lose, worked out from their
   * cost alone — no listing and no ask needed, so it is there as soon as a
   * buy price is. */
  function breakEvenAsk(q, rates) {
    const buy = Number(q && q.buy);
    const keep = Number(q && q.keep);
    const ratio = keep > 0 && keep <= 1 ? keep : 1;
    if (!(buy > 0)) return null;
    const buyRate = rateOf(rates, (q && q.buyCurrency) || BASE);
    const sellRate = rateOf(rates, (q && q.sellCurrency) || BASE);
    if (!buyRate || !sellRate) return null;
    return (buy * buyRate) / sellRate / ratio;
  }

  /* what to ask for a win rate of x1.5, x2 …: break-even is the same sum at
   * x1, so a target is a multiple of it, rounded up so it is really reached */
  function askFor(breakEven, winRate) {
    const b = Number(breakEven), w = Number(winRate);
    if (!(b > 0) || !(w > 0)) return null;
    return Math.ceil(b * w * 100) / 100;
  }

  /* ---------------- formatting -------------------------------------- */

  /* (x1.6); near x1 two decimals, so a small loss never reads as "x1.0" */
  function winRateText(x) {
    if (!(x > 0)) return '';
    return `(x${Math.abs(x - 1) < 0.05 ? x.toFixed(2) : x.toFixed(1)})`;
  }

  const group = n => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  /* 13812.1 -> "13,812 L"; signed: "+13,812 L" / "−593 L" */
  function formatLek(n, signed) {
    if (!Number.isFinite(n)) return '—';
    const sign = n < 0 && Math.round(Math.abs(n)) > 0 ? '−' : signed && Math.round(n) > 0 ? '+' : '';
    return `${sign}${group(n)} L`;
  }

  function formatMoney(n, currency) {
    if (!Number.isFinite(n)) return '—';
    if (!currency || currency === BASE) return formatLek(n);
    const fixed = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = n < 0 ? '−' : '';
    return SIGNS[currency] ? `${sign}${SIGNS[currency]}${fixed}` : `${sign}${fixed} ${currency}`;
  }

  SK.profit = {
    BASE, CURRENCIES, currencyOf, parseNumber, parseMoney, priceRange,
    dayOf, pickRates, rateOf, buyPriceOf, profitOf, atPrice, keepRatio, quote, WIN_TARGETS, breakEvenAsk, askFor,
    winRateText, formatLek, formatMoney
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

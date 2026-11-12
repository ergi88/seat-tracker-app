/* ------------------------------------------------------------------
 * Seat Tracker - the viagogo market of one event, as scanned
 *
 * Pure functions over the rows read on a viagogo event page. Prices are
 * viagogo's display prices: every seller sees a different "relative" price,
 * so nothing here tries to turn them back into real prices. A section is
 * ranked on every listing in it, whatever the quantity.
 *
 * store = { eventId, sections: { <key>: { key, sprite, zone, label, readAt,
 *           complete, rows: [row] } }, own: { <listingId>: row } }
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  /* a section's key: its map id when the row carries one, else its name */
  const keyOf = x => (x.sprite ? String(x.sprite) : 'name:' + String(x.section || x.label || '').trim().toUpperCase());

  function emptyStore(eventId) {
    return { v: 1, eventId: String(eventId || ''), sections: {}, own: {} };
  }

  /* The rows of one section. Your own listings are pinned into every section
   * view, so rows are filtered by their own section, never by the view. */
  function rowsOfSection(rows, section) {
    const key = keyOf(section);
    return rows.filter(r => keyOf(r) === key);
  }

  /* keep a scanned section; a re-scan replaces it whole */
  function putSection(store, section, rows, complete, at) {
    const key = keyOf(section);
    const own = rowsOfSection(rows, section);
    store.sections[key] = {
      key, sprite: section.sprite || '', zone: section.zone || '', label: section.label || (own[0] && own[0].section) || '',
      readAt: at || Date.now(), complete: !!complete, rows: own
    };
    rememberOwn(store, rows);
    return store.sections[key];
  }

  /* The whole list read in one pass (no section picked): every row goes to
   * its own section, and everything read before is replaced. */
  function putAll(store, rows, complete, at, footer) {
    at = at || Date.now();
    const byId = new Map();
    for (const r of rows) if (r && r.id && !byId.has(r.id)) byId.set(r.id, r);
    const groups = new Map();
    for (const r of byId.values()) {
      const key = keyOf(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    store.sections = {};
    store.own = {};
    for (const [key, list] of groups) {
      const first = list[0];
      store.sections[key] = { key, sprite: first.sprite || '', zone: first.zone || '', label: first.section || '', readAt: at, complete: !!complete, rows: list };
    }
    rememberOwn(store, [...byId.values()]);
    store.scan = { at, complete: !!complete, listings: byId.size, shown: footer ? footer.shown : null, total: footer ? footer.total : null };
    return store.scan;
  }

  /* your listings are visible in every view: keep the latest of each */
  function rememberOwn(store, rows) {
    for (const r of rows) if (r.mine) store.own[r.id] = r;
  }

  /* 1 + how many are strictly cheaper: ties share a rank */
  function rankOf(price, prices) {
    return 1 + prices.filter(p => p < price).length;
  }

  /* One section, summed up. The gap is the distance to the nearest seller who
   * is not you: above them it is what you would have to come down, and below
   * them (you are the cheapest) it is negative — the room you have to go up.
   * Tickets count each listing at its largest quantity ("1-8 together" is 8).
   * -> { listings, tickets, myTickets, prices, cheapest, cheapestOther, highest, mine: [{ row, rank, gap }], verdict, kind } */
  function summarize(section) {
    const live = section.rows.filter(r => !r.sold && r.price > 0);
    const prices = live.map(r => r.price).sort((a, b) => a - b);
    const cheapest = prices.length ? prices[0] : null;
    const others = live.filter(r => !r.mine).map(r => r.price).sort((a, b) => a - b);
    const cheapestOther = others.length ? others[0] : null;
    const mine = live.filter(r => r.mine)
      .map(r => ({ row: r, rank: rankOf(r.price, prices), gap: cheapestOther === null ? null : r.price - cheapestOther }))
      .sort((a, b) => a.row.price - b.row.price);
    let kind = 'none', verdict = '';
    if (mine.length) {
      const best = mine[0];
      if (live.length === mine.length) { kind = 'alone'; verdict = live.length === 1 ? 'only listing' : 'only your listings'; }
      else if (best.gap <= 0) {
        kind = 'cheapest';
        verdict = best.gap === 0 ? 'tied cheapest'
          : `cheapest by ${money(-best.gap, best.row.currency)}`;
      } else {
        kind = 'above';
        verdict = `${money(best.gap, best.row.currency)} above the cheapest`;
      }
    }
    const qty = r => r.qtyMax || 0;
    const tickets = live.reduce((n, r) => n + qty(r), 0);
    const myTickets = mine.reduce((n, m) => n + qty(m.row), 0);
    return { listings: live.length, tickets, myTickets, sold: section.rows.length - live.length, prices, cheapest, cheapestOther, highest: prices.length ? prices[prices.length - 1] : null, mine, kind, verdict };
  }

  function money(n, currency) {
    return SK.profit ? SK.profit.formatMoney(n, currency || 'USD') : String(n);
  }

  /* every scanned section with its summary, sorted */
  function sectionsView(store, opts) {
    opts = opts || {};
    let list = Object.values(store.sections).map(s => Object.assign({}, s, { sum: summarize(s) }));
    if (opts.onlyMine) list = list.filter(s => s.sum.mine.length);
    const by = {
      section: (a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }),
      gap: (a, b) => gapOf(b) - gapOf(a) || a.label.localeCompare(b.label, 'en', { numeric: true }),
      cheapest: (a, b) => (a.sum.cheapest === null) - (b.sum.cheapest === null) || (a.sum.cheapest || 0) - (b.sum.cheapest || 0),
      listings: (a, b) => b.sum.listings - a.sum.listings
    }[opts.sort || 'section'];
    return list.sort(by);
  }
  const gapOf = s => (s.sum.mine.length ? s.sum.mine[0].gap : -Infinity);

  /* totals for the drawer's header */
  function totals(store) {
    const all = Object.values(store.sections);
    let listings = 0, tickets = 0, cheapestFor = 0, withMine = 0, oldest = null;
    for (const s of all) {
      const sum = summarize(s);
      listings += sum.listings;
      tickets += sum.tickets;
      if (sum.mine.length) withMine++;
      if (sum.kind === 'cheapest' || sum.kind === 'alone') cheapestFor++;
      if (oldest === null || s.readAt < oldest) oldest = s.readAt;
    }
    return { sections: all.length, listings, tickets, withMine, cheapestFor, ownListings: Object.keys(store.own).length, oldest };
  }

  /* A listing viagogo marks "Instant Download": the label shows among the
   * card's details or its tags, whichever the page puts it in. */
  const INSTANT = /instant\s*download/i;
  const isInstant = r => [...(r.features || []), ...(r.tags || [])].some(t => INSTANT.test(t));

  /* the store with only instant-download listings, plus any row `keep(r)`
   * says yes to (yours with the tickets in hand), and only the sections that
   * still have one; what you own is kept as it is */
  function onlyInstant(store, keep) {
    const sections = {};
    for (const [k, s] of Object.entries(store.sections)) {
      const rows = s.rows.filter(r => isInstant(r) || (!!keep && keep(r)));
      if (rows.length) sections[k] = Object.assign({}, s, { rows });
    }
    return Object.assign({}, store, { sections });
  }

  /* Can a buyer take `n` tickets from this listing? "1 - 10 tickets together"
   * sells any number from 1 to 10, so 2 fits; "4 tickets" sells 4 and only 4.
   * A listing whose quantity was not read never fits a number. n = 0: any.
   * Two more choices: 'single' is a listing of exactly one ticket (not a
   * "1 - 4" that also sells one), 'over10' one that sells more than 10. */
  function fitsQty(r, n) {
    if (!n) return true;
    if (r.qtyMax === null || r.qtyMax === undefined) return false;
    if (n === 'single') return r.qtyMax === 1;
    if (n === 'over10') return r.qtyMax > 10;
    const min = r.qtyMin === null || r.qtyMin === undefined ? r.qtyMax : r.qtyMin;
    return n >= min && n <= r.qtyMax;
  }

  /* the quantity choice in words: "sell 2 tickets", "are single tickets", "sell more than 10 tickets" */
  function qtyWords(n) {
    if (n === 'single') return 'are single tickets';
    if (n === 'over10') return 'sell more than 10 tickets';
    return `sell ${n} ticket${n === 1 ? '' : 's'}`;
  }

  /* Every listing still for sale, every section together, cheapest first;
   * `qty` keeps only the ones that sell that many tickets.
   * -> [{ ...row, label, sectionKey }] */
  function byPrice(sections, qty) {
    const out = [];
    for (const s of sections) {
      for (const r of s.rows) {
        if (r.sold || !(r.price > 0) || !fitsQty(r, qty)) continue;
        out.push(Object.assign({}, r, { label: s.label, sectionKey: s.key }));
      }
    }
    return out.sort((a, b) => a.price - b.price || a.label.localeCompare(b.label, 'en', { numeric: true }) || (a.index || 0) - (b.index || 0));
  }

  /* a price axis with round ticks, for the graphs */
  function axis(min, max, count) {
    if (!(max >= min)) return { min: 0, max: 1, ticks: [0, 1] };
    if (max === min) { min = Math.max(0, min - 1); max += 1; }
    const raw = (max - min) / Math.max(1, (count || 5) - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || raw;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 100) / 100);
    return { min: lo, max: hi, ticks };
  }

  /* ---------------- one scan, compared on another page --------------- *
   *
   * A scan made while signed in to viagogo knows which listings are yours.
   * It is handed to the listings page (where each listing learns its rank)
   * and to the same event signed out (where your listings carry no ID and
   * must be recognised by what they show). It lives for COMPARE_TTL only:
   * an event page changes all the time, so an old scan would mislead.
   *
   * compare = { v, eventId, name, start, at, expiresAt, complete,
   *             sections: [{ key, label, rows: [slim row] }] }            */

  const COMPARE_TAG = 'SEAT-TRACKER-COMPARE v1';
  const COMPARE_TTL = 30 * 60000;

  const norm = s => String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

  /* What a listing shows a signed-out buyer, apart from its price — which
   * viagogo shows each viewer differently, so it can never be part of it. */
  function fingerprintOf(r) {
    const feats = (r.features || []).map(norm).filter(Boolean).sort();
    return [norm(r.section), norm(r.row), `${r.qtyMin || ''}-${r.qtyMax || ''}`, feats.join('+')].join('|');
  }

  /* only the sections you list in, and only what the other pages need */
  function compareFrom(store, info, at) {
    at = at || Date.now();
    const slim = r => ({
      id: r.mine ? String(r.id) : '', i: Number(r.index) || 0, sprite: r.sprite || '', section: r.section || '', row: r.row || '',
      price: r.price, currency: r.currency || '', qtyMin: r.qtyMin, qtyMax: r.qtyMax,
      features: (r.features || []).slice(), mine: !!r.mine, sold: !!r.sold
    });
    const sections = Object.values(store.sections || {})
      .filter(s => s.rows.some(r => r.mine))
      .map(s => ({ key: s.key, label: s.label, rows: s.rows.map(slim) }));
    return {
      v: 1, eventId: String(store.eventId || ''), name: (info && info.name) || '', start: (info && info.start) || '',
      at, expiresAt: at + COMPARE_TTL, complete: !!(store.scan && store.scan.complete), sections
    };
  }

  const compareLive = (c, now) => !!c && Number(c.expiresAt) > (now || Date.now());
  const packCompare = c => `${COMPARE_TAG}\n${JSON.stringify(c)}`;

  /* -> compare, or throws with a message that says what to do */
  function unpackCompare(text, now) {
    const t = String(text || '');
    const at = t.indexOf(COMPARE_TAG);
    if (at < 0) throw new Error('That is not a Seat Tracker event scan. Press "Copy for compare" in the event page drawer, then paste.');
    let c;
    try { c = JSON.parse(t.slice(at + COMPARE_TAG.length).trim()); } catch (e) { throw new Error('The pasted scan is cut short. Copy it again.'); }
    if (!c || c.v !== 1 || !c.eventId || !Array.isArray(c.sections)) throw new Error('The pasted scan is from another version of Seat Tracker. Scan the event again.');
    if (!compareLive(c, now)) throw new Error('That scan has expired: the event page has moved on since. Scan the event again and copy it.');
    return c;
  }

  /* every listing of yours in a compare -> [{ row, section }] */
  function compareMine(c) {
    const out = [];
    for (const s of (c && c.sections) || []) for (const r of s.rows) if (r.mine && r.id) out.push({ row: r, section: s });
    return out;
  }

  /* Where one of your listings stood in the scan: its rank among every
   * listing of its section and the gap to the cheapest seller who is not you,
   * in the display prices that scan saw. -> null when the scan never saw it */
  function compareStanding(c, listingId) {
    const id = String(listingId);
    for (const s of (c && c.sections) || []) {
      if (!s.rows.some(r => r.mine && r.id === id)) continue;
      const sum = summarize({ rows: s.rows });
      const me = sum.mine.find(m => m.row.id === id);
      if (!me) return { section: s.label, sold: true, listings: sum.listings };
      return {
        section: s.label, rank: me.rank, listings: sum.listings, gap: me.gap, price: me.row.price,
        currency: me.row.currency, cheapestOther: sum.cheapestOther, alone: sum.kind === 'alone'
      };
    }
    return null;
  }

  /* The key a confirmation is kept under on a signed-out page: what the row
   * shows, its price, and how many rows before it show exactly the same. */
  const confirmKey = (r, nth) => `${fingerprintOf(r)}|${r.price}|${nth || 0}`;

  /* Your listings, recognised on a signed-out page of the same event.
   *   rows:    what that page shows, every section
   *   confirm: { <confirmKey>: 'yes' | 'no' } — what you said by hand
   * A row is "mine" when you said so, or when its fingerprint is very strong
   * (row and quantity known) and it and one listing of yours match only each
   * other. Anything else that matches is "possible"; a listing of yours that
   * nothing matches is "hidden" (once the page was read to the end).
   * -> { rows: { <row id>: { status, key, listings: [ids] } },
   *      listings: [{ id, row, section, status, matches: [row] }] }        */
  function matchSignedOut(c, rows, confirm, complete) {
    confirm = confirm || {};
    const keys = new Set(((c && c.sections) || []).map(s => s.key));
    const page = (rows || []).filter(r => keys.has(keyOf(r)));
    const seen = new Map();
    const pageKey = new Map();
    for (const r of page) {
      const base = `${fingerprintOf(r)}|${r.price}`;
      const nth = seen.get(base) || 0;
      seen.set(base, nth + 1);
      pageKey.set(r.id, confirmKey(r, nth));
    }
    const mine = compareMine(c).map(x => ({ id: x.row.id, row: x.row, section: x.section.label, fp: fingerprintOf(x.row), status: 'hidden', matches: [], how: '' }));
    const out = {};
    const said = r => confirm[pageKey.get(r.id)] || '';
    for (const r of page) out[r.id] = { status: 'other', key: pageKey.get(r.id), listings: [] };

    /* 1. what you confirmed, and a listing ID shown as is */
    for (const r of page) {
      const fp = fingerprintOf(r);
      const byId = mine.find(l => l.id === String(r.id));
      if (said(r) === 'no') continue;
      if (byId || said(r) === 'yes') {
        const l = byId || mine.find(x => x.status === 'hidden' && x.fp === fp) || null;
        out[r.id] = { status: 'mine', key: pageKey.get(r.id), listings: l ? [l.id] : [], how: byId ? 'id' : 'you' };
        if (l) Object.assign(l, { status: 'mine', matches: [r], how: byId ? 'id' : 'you' });
      }
    }
    /* 2. the rest, by fingerprint */
    const open = page.filter(r => out[r.id].status === 'other' && said(r) !== 'no');
    for (const l of mine) {
      if (l.status !== 'hidden') continue;
      l.matches = open.filter(r => fingerprintOf(r) === l.fp);
    }
    for (const l of mine) {
      if (l.status !== 'hidden' || !l.matches.length) continue;
      const r = l.matches[0];
      const rivals = mine.filter(x => x.status === 'hidden' && x.fp === l.fp).length;
      const strong = l.matches.length === 1 && rivals === 1 && norm(l.row.row) && l.row.qtyMax;
      if (strong) {
        l.status = 'mine';
        l.how = 'fingerprint';
        out[r.id] = { status: 'mine', key: pageKey.get(r.id), listings: [l.id], how: 'fingerprint' };
      } else {
        l.status = 'possible';
        for (const m of l.matches) {
          const o = out[m.id];
          if (o.status === 'mine') continue;
          o.status = 'possible';
          if (!o.listings.includes(l.id)) o.listings.push(l.id);
        }
      }
    }
    if (!complete) for (const l of mine) if (l.status === 'hidden') l.status = 'unseen';
    return { rows: out, listings: mine };
  }

  /* Where one row stands on the page it was read from: its place in
   * viagogo's own list, its price rank in the section, and the gap to the
   * cheapest row that is neither yours nor possibly yours. */
  function placeOf(row, rows, match) {
    const sec = (rows || []).filter(r => keyOf(r) === keyOf(row) && !r.sold && r.price > 0);
    const prices = sec.map(r => r.price);
    const others = sec.filter(r => !match.rows[r.id] || match.rows[r.id].status === 'other').map(r => r.price).sort((a, b) => a - b);
    const order = (rows || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
    return {
      position: order.indexOf(row) + 1, of: order.length,
      rank: rankOf(row.price, prices), listings: sec.length,
      gap: others.length ? row.price - others[0] : null, cheapestOther: others.length ? others[0] : null,
      unsure: sec.filter(r => match.rows[r.id] && match.rows[r.id].status === 'possible').length
    };
  }

  /* ---------------- saved scans, and what changed between two -------- *
   *
   * A scan is saved only when you press Save. Two saved scans of one event
   * (or a saved one and the scan on screen) are compared listing by listing:
   * new, removed, price moved, ticket count moved.
   *
   * Signed in, every row has its listing ID and that is what pairs them.
   * Signed out, rows have no ID: a row is paired with one that looks the
   * same (section, row, features), the same price and quantity first, then
   * in price order. Such a pair is a guess, marked how: 'look'.
   *
   * saved = { v, id, eventId, name, start, at, savedAt, complete, signedIn,
   *           shown, total, rows: [{ id, anon, k, label, row, price,
   *           currency, qtyMin, qtyMax, features, mine, sold }] }          */

  const SAVED_V = 1;
  const numOrNull = v => (v === null || v === undefined || v === '' ? null : Number(v));

  function snapshotOf(store, info, savedAt) {
    savedAt = savedAt || Date.now();
    const rows = [];
    for (const s of Object.values((store && store.sections) || {})) {
      for (const r of s.rows) {
        rows.push({
          id: String(r.id), anon: !!r.anon, k: s.key, label: s.label || r.section || '', row: r.row || '',
          price: r.price, currency: r.currency || '', qtyMin: numOrNull(r.qtyMin), qtyMax: numOrNull(r.qtyMax),
          features: (r.features || []).slice(), mine: !!r.mine, sold: !!r.sold,
          ...(r.tags && r.tags.length ? { tags: r.tags.slice() } : {})
        });
      }
    }
    const scan = (store && store.scan) || {};
    const at = scan.at || savedAt;
    return {
      v: SAVED_V, id: String(at), eventId: String((store && store.eventId) || ''),
      name: (info && info.name) || '', start: (info && info.start) || '',
      at, savedAt, complete: !!scan.complete,
      /* signed out, viagogo shows no listing ID on any row */
      signedIn: rows.some(r => !r.anon),
      shown: scan.shown === undefined ? null : scan.shown, total: scan.total === undefined ? null : scan.total,
      rows
    };
  }

  const forSale = r => !r.sold && r.price > 0;
  const lookOf = r => [r.k, norm(r.row), (r.features || []).map(norm).filter(Boolean).sort().join('+')].join('|');
  const qtyOf = r => r.qtyMax || 0;
  const sameQty = (a, b) => (a.qtyMin || null) === (b.qtyMin || null) && (a.qtyMax || null) === (b.qtyMax || null);

  /* one section on one side: listings, tickets, cheapest */
  function sideOf(rows) {
    const prices = rows.map(r => r.price).sort((a, b) => a - b);
    return { listings: rows.length, tickets: rows.reduce((n, r) => n + qtyOf(r), 0), cheapest: prices.length ? prices[0] : null };
  }

  /* -> [[a, b, how]] and what was left on each side */
  function pairRows(A, B) {
    const pairs = [];
    const usedA = new Set(), usedB = new Set();
    const idsA = new Map();
    for (const r of A) if (!r.anon && !idsA.has(r.id)) idsA.set(r.id, r);
    for (const b of B) {
      if (b.anon) continue;
      const a = idsA.get(b.id);
      if (!a || usedA.has(a)) continue;
      pairs.push([a, b, 'id']);
      usedA.add(a);
      usedB.add(b);
    }
    /* by what they show, only where a side has no ID: two IDs that differ are two listings */
    const buckets = new Map();
    const put = (r, side) => {
      const k = lookOf(r);
      if (!buckets.has(k)) buckets.set(k, { a: [], b: [] });
      buckets.get(k)[side].push(r);
    };
    for (const r of A) if (!usedA.has(r)) put(r, 'a');
    for (const r of B) if (!usedB.has(r)) put(r, 'b');
    const byPriceThenIndex = (x, y) => x.price - y.price;
    for (const { a, b } of buckets.values()) {
      if (!a.length || !b.length) continue;
      a.sort(byPriceThenIndex);
      b.sort(byPriceThenIndex);
      const can = (x, y) => (x.anon || y.anon) && !usedA.has(x) && !usedB.has(y);
      /* the same price and quantity: nothing changed */
      for (const x of a) {
        const y = b.find(z => can(x, z) && z.price === x.price && sameQty(x, z));
        if (y) { pairs.push([x, y, 'look']); usedA.add(x); usedB.add(y); }
      }
      /* the rest in price order */
      const ra = a.filter(x => !usedA.has(x)), rb = b.filter(y => !usedB.has(y));
      for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
        if (!can(ra[i], rb[i])) continue;
        pairs.push([ra[i], rb[i], 'look']);
        usedA.add(ra[i]);
        usedB.add(rb[i]);
      }
    }
    return { pairs, onlyA: A.filter(r => !usedA.has(r)), onlyB: B.filter(r => !usedB.has(r)) };
  }

  /* What changed from saved scan `a` to the later scan `b`.
   * -> { comparable, warnings, from, to, totals, sections: [...], changes: [...] }
   * change = { kind: 'new' | 'gone' | 'changed', k, label, a, b, how,
   *            delta (price, b - a), qty: { from, to } | null }
   * Only listings for sale count; a sold row is as good as gone. */
  function diffScans(a, b) {
    const A = ((a && a.rows) || []).filter(forSale);
    const B = ((b && b.rows) || []).filter(forSale);
    const { pairs, onlyA, onlyB } = pairRows(A, B);
    const changes = [];
    const labelOf = r => r.label || '';
    for (const r of onlyB) changes.push({ kind: 'new', k: r.k, label: labelOf(r), a: null, b: r, how: '', delta: 0, qty: null });
    for (const r of onlyA) changes.push({ kind: 'gone', k: r.k, label: labelOf(r), a: r, b: null, how: '', delta: 0, qty: null });
    let same = 0;
    for (const [x, y, how] of pairs) {
      const delta = x.currency === y.currency || !x.currency || !y.currency ? Math.round((y.price - x.price) * 100) / 100 : 0;
      const qty = sameQty(x, y) ? null : { from: x, to: y };
      if (!delta && !qty) { same++; continue; }
      changes.push({ kind: 'changed', k: y.k, label: labelOf(y) || labelOf(x), a: x, b: y, how, delta, qty });
    }

    const keys = new Map();
    for (const r of A.concat(B)) if (!keys.has(r.k)) keys.set(r.k, labelOf(r));
    const sections = [...keys].map(([k, label]) => {
      const sa = sideOf(A.filter(r => r.k === k)), sb = sideOf(B.filter(r => r.k === k));
      const mine = changes.filter(c => c.k === k);
      return {
        key: k, label, a: sa, b: sb,
        status: !sa.listings ? 'new' : !sb.listings ? 'gone' : '',
        added: mine.filter(c => c.kind === 'new').length,
        removed: mine.filter(c => c.kind === 'gone').length,
        down: mine.filter(c => c.delta < 0).length,
        up: mine.filter(c => c.delta > 0).length,
        qty: mine.filter(c => c.qty).length,
        changes: mine.length
      };
    }).sort((x, y) => x.label.localeCompare(y.label, 'en', { numeric: true }));

    const sum = (list, f) => list.reduce((n, c) => n + f(c), 0);
    const qtyMove = c => (c.qty ? qtyOf(c.b) - qtyOf(c.a) : 0);
    const totals = {
      from: sideOf(A), to: sideOf(B),
      added: changes.filter(c => c.kind === 'new').length,
      addedTickets: sum(changes.filter(c => c.kind === 'new'), c => qtyOf(c.b)),
      removed: changes.filter(c => c.kind === 'gone').length,
      removedTickets: sum(changes.filter(c => c.kind === 'gone'), c => qtyOf(c.a)),
      down: changes.filter(c => c.delta < 0).length,
      up: changes.filter(c => c.delta > 0).length,
      qty: changes.filter(c => c.qty).length,
      /* tickets fewer on listings still there: sold, or taken off */
      qtyLess: -sum(changes.filter(c => qtyMove(c) < 0), qtyMove),
      qtyMore: sum(changes.filter(c => qtyMove(c) > 0), qtyMove),
      same,
      guessed: pairs.filter(p => p[2] === 'look').length,
      newSections: sections.filter(s => s.status === 'new').length,
      goneSections: sections.filter(s => s.status === 'gone').length
    };
    const warnings = [];
    if (a && b && a.signedIn !== b.signedIn) warnings.push('signed');
    if (a && !a.complete) warnings.push('fromPartial');
    if (b && !b.complete) warnings.push('toPartial');
    return { comparable: !warnings.includes('signed'), warnings, from: a, to: b, totals, sections, changes };
  }

  /* ---------------- a saved scan, anywhere ---------------------------- *
   * Saved scans go to Supabase (vg_scans, the newest two per person and
   * event) so another PC and the app see them. These turn one into a row
   * and back, and a saved scan back into a store the views above take. */

  const isoOf = ms => new Date(Number(ms) || 0).toISOString();

  function scanToRow(saved, extra) {
    extra = extra || {};
    return {
      vg_event_id: String(saved.eventId || ''), event_key: extra.eventKey || null,
      name: saved.name || '', start_text: saved.start || '',
      scanned_at: isoOf(saved.at), signed_in: !!saved.signedIn, complete: !!saved.complete,
      shown: saved.shown === null || saved.shown === undefined ? null : saved.shown,
      total: saved.total === null || saved.total === undefined ? null : saved.total,
      listings: (saved.rows || []).filter(forSale).length,
      rows: saved.rows || [], saved_by: extra.by || ''
    };
  }

  /* a row, with or without its rows (the app's list leaves them out) */
  function scanFromRow(r) {
    const at = Date.parse(r.scanned_at) || 0;
    return {
      v: SAVED_V, id: String(at), dbId: r.id === undefined ? null : String(r.id), eventId: String(r.vg_event_id || ''), eventKey: r.event_key || null,
      name: r.name || '', start: r.start_text || '', at, savedAt: Date.parse(r.created_at) || at,
      complete: !!r.complete, signedIn: !!r.signed_in,
      shown: r.shown === null || r.shown === undefined ? null : Number(r.shown),
      total: r.total === null || r.total === undefined ? null : Number(r.total),
      listings: Number(r.listings) || 0, by: r.saved_by || '',
      rows: Array.isArray(r.rows) ? r.rows : null
    };
  }

  /* The newest `cap` of two lists of saved scans, one per scan time, oldest
   * first: what this PC kept and what Supabase has. */
  function mergeSaved(a, b, cap) {
    const by = new Map();
    for (const x of (a || []).concat(b || [])) if (x && x.rows && !by.has(x.at)) by.set(x.at, x);
    const list = [...by.values()].sort((x, y) => x.at - y.at);
    return cap ? list.slice(Math.max(0, list.length - cap)) : list;
  }

  /* a saved scan as a store: sections by their key, your listings in own */
  function storeOf(saved) {
    const store = emptyStore(saved && saved.eventId);
    const at = (saved && saved.at) || 0;
    for (const r of (saved && saved.rows) || []) {
      const k = r.k || keyOf(r);
      const s = store.sections[k] || (store.sections[k] = { key: k, label: r.label || '', readAt: at, complete: !!(saved && saved.complete), rows: [] });
      const row = Object.assign({}, r, { section: r.label || '' });
      s.rows.push(row);
      if (row.mine) store.own[row.id] = row;
    }
    store.scan = { at, complete: !!(saved && saved.complete), listings: ((saved && saved.rows) || []).length,
      shown: saved ? saved.shown : null, total: saved ? saved.total : null };
    return store;
  }

  SK.market = {
    scanToRow, scanFromRow, mergeSaved, storeOf,
    keyOf, emptyStore, rowsOfSection, putSection, putAll, rememberOwn, rankOf, summarize, sectionsView, totals, axis, isInstant, onlyInstant, fitsQty, qtyWords, byPrice,
    COMPARE_TTL, fingerprintOf, compareFrom, compareLive, packCompare, unpackCompare, compareMine, compareStanding, confirmKey, matchSignedOut, placeOf,
    snapshotOf, diffScans
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

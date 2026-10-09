/* ------------------------------------------------------------------
 * Seat Tracker - the seat rules every site shares
 *
 * A site adapter only hands over plain seats:
 *   { row, label, x, y, free, cat, id }
 * Everything after that happens here, once, for every site: ordering a
 * row, finding aisles, packing the scan, blocks for a price filter,
 * options and the OK / LOW / SPLIT / SHORT status.
 *
 * Exposed as SK.rules. No chrome.*, no DOM.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const GAP_FACTOR = 1.75;

  const STATUS = { OK: 'OK', LOW: 'LOW', SPLIT: 'SPLIT', SHORT: 'SHORT', NONE: 'NOT SCANNED' };

  const DOT = {
    'OK': '\u{1F7E2}',
    'LOW': '\u{1F7E0}',
    'SPLIT': '\u{1F534}',
    'SHORT': '\u{1F534}',
    'NOT SCANNED': '⚪'
  };

  /* worst first when ranking several requests together */
  const RANK = { 'OK': 0, 'LOW': 1, 'NOT SCANNED': 2, 'SPLIT': 3, 'SHORT': 4 };

  const FILLABLE = new Set([STATUS.OK, STATUS.LOW]);
  const isFillable = s => FILLABLE.has(s);

  /* ---------------- reminders --------------------------------------- */

  /* Which warning a status is, or null when there is nothing to warn about. */
  function warnTypeOf(status) {
    if (status === STATUS.LOW) return 'low';
    if (status === STATUS.SPLIT || status === STATUS.SHORT) return 'gone';
    return null;
  }

  /* A warning keeps coming back until someone presses Stop, because a problem
   * that lasts is worse than one that starts. This works out what the reminder
   * should look like after a scan.
   *
   *   nag  = { type, since, lastAt, count, stopped } or null
   *   -> { nag, repeat }   repeat = send that warning again now
   *
   * Stop does not clear the reminder, it marks it stopped: the request is
   * still low, so a cleared one would start again on the next scan. It ends
   * by itself when the status recovers, or starts afresh if the warning turns
   * into a worse one. */
  function nagAfter(nag, status, opts) {
    const o = opts || {};
    const every = Number(o.everyMs) || 0;
    const now = o.now || Date.now();
    const type = warnTypeOf(status);
    if (!type || !every) return { nag: null, repeat: false };
    if (!nag || nag.type !== type) {
      return { nag: { type, since: now, lastAt: now, count: 0, stopped: false }, repeat: false };
    }
    if (nag.stopped) return { nag, repeat: false };
    if (now - (nag.lastAt || 0) < every) return { nag, repeat: false };
    return { nag: Object.assign({}, nag, { lastAt: now, count: (nag.count || 0) + 1 }), repeat: true };
  }

  function median(arr) {
    if (!arr.length) return 0;
    const b = arr.slice().sort((p, q) => p - q);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  function cmpRow(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  /* ---------------- row ordering ------------------------------------
   * 'x'    : sort by x, gap = x distance. eBileta always opens a sector
   *          laid out horizontally, so this is exact there.
   * 'axis' : project onto the row's own principal axis (rotated stands,
   *          diagonal and curved rows), gap = straight-line distance
   *          between neighbours.
   * Returns [{ s, gap }] where gap is the distance to the previous seat.
   * ------------------------------------------------------------------ */

  function orderByX(seats) {
    const list = seats.slice().sort((a, b) => a.x - b.x);
    return list.map((s, i) => ({ s, gap: i ? s.x - list[i - 1].x : 0 }));
  }

  function orderByAxis(seats) {
    const n = seats.length;
    if (n < 2) return seats.map(s => ({ s, gap: 0 }));
    let mx = 0, my = 0;
    for (const p of seats) { mx += p.x; my += p.y; }
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of seats) {
      const dx = p.x - mx, dy = p.y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(th), uy = Math.sin(th);
    const list = seats
      .map(p => ({ p, t: (p.x - mx) * ux + (p.y - my) * uy }))
      .sort((a, b) => a.t - b.t)
      .map(o => o.p);
    return list.map((s, i) => ({
      s, gap: i ? Math.hypot(s.x - list[i - 1].x, s.y - list[i - 1].y) : 0
    }));
  }

  /* ---------------- the packed scan ---------------------------------
   *   { sec, at, total, available, cats: { <cat>: { total, avail } },
   *     rows: [ { r, s: [ [label, cat, avail, breakBefore, id], ... ] } ] }
   * Small enough to store, and blocks can be recomputed for any price
   * filter without another network call.
   * ------------------------------------------------------------------ */

  function packScan(sec, seats, rowOrder) {
    const byRow = new Map();
    for (const s of seats || []) {
      const key = s.row == null || s.row === '' ? '?' : String(s.row);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key).push(s);
    }

    const rows = [];
    const cats = {};
    let total = 0, available = 0;

    for (const [r, list] of byRow) {
      const ordered = rowOrder === 'x' ? orderByX(list) : orderByAxis(list);
      const gaps = ordered.slice(1).map(o => o.gap).filter(g => g > 0);
      const pitch = median(gaps);
      const maxGap = pitch > 0 ? pitch * GAP_FACTOR : Infinity;

      const packed = [];
      ordered.forEach((o, i) => {
        const s = o.s;
        const av = s.free ? 1 : 0;
        const brk = i > 0 && o.gap > maxGap ? 1 : 0;
        const cat = s.cat === undefined || s.cat === null ? null : s.cat;
        packed.push([String(s.label == null ? '' : s.label), cat, av, brk, s.id == null ? null : String(s.id)]);
        total++; if (av) available++;
        const ck = String(cat);
        const c = cats[ck] || (cats[ck] = { total: 0, avail: 0 });
        c.total++; if (av) c.avail++;
      });
      rows.push({ r, s: packed });
    }

    rows.sort((a, b) => cmpRow(a.r, b.r));
    return { sec: String(sec), at: Date.now(), total, available, cats, rows };
  }

  function unmappedScan(sec, note) {
    return { sec: String(sec), at: Date.now(), unmapped: true, note: note || 'no seat map' };
  }

  /* ---------------- blocks for a price filter ------------------------
   * catFilter: array of category keys, empty/null = every price.
   * A seat at another price breaks a run exactly like a taken seat.
   * ------------------------------------------------------------------ */

  function blocksFor(scan, catFilter) {
    if (!scan || scan.unmapped) return null;
    const filter = catFilter && catFilter.length ? new Set(catFilter.map(String)) : null;
    const blocks = [];
    let total = 0, available = 0;

    for (const row of scan.rows) {
      let run = [];
      const flush = () => {
        if (run.length) {
          blocks.push({
            row: row.r,
            len: run.length,
            first: run[0][0],
            last: run[run.length - 1][0],
            seats: run.map(p => p[4] || `${scan.sec}-${row.r}-${p[0]}`)
          });
        }
        run = [];
      };
      for (const p of row.s) {
        const [, cat, av, brk] = p;
        const inFilter = !filter || filter.has(String(cat));
        if (inFilter) { total++; if (av) available++; }
        if (brk) flush();
        if (inFilter && av) run.push(p); else flush();
      }
      flush();
    }

    blocks.sort((a, b) => b.len - a.len || cmpRow(a.row, b.row));
    return { total, available, taken: total - available, longest: blocks.length ? blocks[0].len : 0, blocks, at: scan.at };
  }

  function optionsFor(view, qty, together) {
    qty = Math.max(1, Number(qty) || 1);
    if (!view) return { options: 0, fitting: [], perRow: [] };
    if (!together) return { options: Math.floor(view.available / qty), fitting: [], perRow: [] };

    let options = 0;
    const fitting = [];
    const perRowMap = new Map();
    for (const b of view.blocks) {
      const n = Math.floor(b.len / qty);
      if (n > 0) {
        options += n;
        fitting.push(b);
        perRowMap.set(b.row, (perRowMap.get(b.row) || 0) + n);
      }
    }
    const perRow = [...perRowMap.entries()]
      .map(([row, n]) => ({ row, n }))
      .sort((a, b) => b.n - a.n || cmpRow(a.row, b.row));
    return { options, fitting, perRow };
  }

  /* ---------------- status -------------------------------------------
   * SHORT : available < qty
   * SPLIT : enough seats but no block fits the group (together only)
   * LOW   : fillable, and options <= opts (opts 0 = rule off), or exactly
   *         one block fits and it has <= qty + warn seats
   *         (together off: available <= qty + warn)
   * OK    : fillable and not LOW
   * ------------------------------------------------------------------ */

  function evaluate(req, scan) {
    const qty = Math.max(1, Number(req.qty) || 1);
    const warn = Math.max(0, Number(req.warn) || 0);
    const opts = Math.max(0, Number(req.opts) || 0);
    const together = req.together !== false;

    const view = blocksFor(scan, req.cats);
    if (!view) return { status: STATUS.NONE, options: 0, perRow: [], view: null };
    if (view.available < qty) return { status: STATUS.SHORT, options: 0, perRow: [], view };

    const o = optionsFor(view, qty, together);

    if (together) {
      if (!o.fitting.length) return { status: STATUS.SPLIT, options: 0, perRow: [], view };
      const byOptions = opts > 0 && o.options <= opts;
      const byTightBlock = o.fitting.length === 1 && o.fitting[0].len <= qty + warn;
      return { status: byOptions || byTightBlock ? STATUS.LOW : STATUS.OK, options: o.options, perRow: o.perRow, view };
    }

    const byOptions = opts > 0 && o.options <= opts;
    const byTightTotal = view.available <= qty + warn;
    return { status: byOptions || byTightTotal ? STATUS.LOW : STATUS.OK, options: o.options, perRow: [], view };
  }

  function worst(statuses) {
    let w = null;
    for (const s of statuses) if (w === null || RANK[s] > RANK[w]) w = s;
    return w;
  }

  /* ---------------- prices -------------------------------------------
   * cats registry: { <key>: { key, label, color, price } }
   * ------------------------------------------------------------------ */

  function priceText(cats, key, currency) {
    const c = cats && (cats[key] || cats[String(key)]);
    if (c && c.price !== null && c.price !== undefined) return `${c.price}${currency || ''}`;
    if (c && c.label) return c.label;
    return 'cat ' + key;
  }

  function priceTag(req, cats, currency) {
    const sel = (req && req.cats) || [];
    if (!sel.length) return '';
    return [...new Set(sel.map(k => priceText(cats, k, currency)))].join(' + ');
  }

  /* the prices present in one sector, dearest first */
  function sectorPrices(scan, cats, currency) {
    if (!scan || scan.unmapped) return [];
    const out = [];
    for (const key of Object.keys(scan.cats || {})) {
      if (key === 'null') continue;
      const c = (cats && cats[key]) || {};
      out.push({
        key, label: c.label || '', text: priceText(cats, key, currency),
        price: c.price === undefined ? null : c.price, color: c.color || null,
        total: scan.cats[key].total, avail: scan.cats[key].avail
      });
    }
    out.sort((a, b) => {
      const ap = a.price === null ? -1 : a.price, bp = b.price === null ? -1 : b.price;
      return bp - ap || String(a.label).localeCompare(String(b.label));
    });
    return out;
  }

  /* ---------------- formatting ---------------------------------------
   * One line per request, used by every notification and command reply:
   *   🟢 #2 A1 65€ ×4 OK — 12 options
   * ------------------------------------------------------------------ */

  function line(req, num, ev, code, tag) {
    const dot = DOT[ev.status] || DOT[STATUS.NONE];
    const qty = Math.max(1, Number(req.qty) || 1);
    const head = `${dot} #${num} ${code}${tag ? ' ' + tag : ''} ×${qty}`;
    if (ev.status === STATUS.NONE) return `${head} NOT SCANNED`;
    return `${head} ${ev.status} — ${ev.options} option${ev.options === 1 ? '' : 's'}`;
  }

  function optionsPhrase(ev, maxRows) {
    const n = ev.options;
    const word = `${n} option${n === 1 ? '' : 's'}`;
    if (!ev.perRow || !ev.perRow.length) return word;
    const rows = ev.perRow;
    const shown = rows.slice(0, maxRows || 6).map(r => `${r.row}×${r.n}`).join(', ');
    const more = rows.length > (maxRows || 6) ? `, +${rows.length - (maxRows || 6)} more` : '';
    return `${word} in ${rows.length} row${rows.length === 1 ? '' : 's'} (${shown}${more})`;
  }

  /* 37 free of 41 · longest block 20 · 3 options in 2 rows (F×2, C×1) */
  function detail(ev, scan) {
    if (scan && scan.unmapped) return scan.note || 'no seat map';
    const view = ev.view;
    if (!view) return 'not scanned yet';
    return [`${view.available} free of ${view.total}`, `longest block ${view.longest}`, optionsPhrase(ev)].join(' · ');
  }

  SK.rules = {
    GAP_FACTOR, STATUS, DOT, RANK, isFillable, median, cmpRow, warnTypeOf, nagAfter,
    orderByX, orderByAxis, packScan, unmappedScan,
    blocksFor, optionsFor, evaluate, worst,
    priceText, priceTag, sectorPrices,
    line, optionsPhrase, detail
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

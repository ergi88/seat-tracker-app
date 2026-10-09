/* ------------------------------------------------------------------
 * Site adapter: efinity.rs
 *
 * One public GET returns the whole venue:
 *   https://findloyalty-api.oblaci.rs/api/Map?cardTypeId=<id>&purchaseCode=null
 *   -> { Svg, Articles, ... }
 * Articles are the sectors (SvgMapId, ArticleName, Price). The Svg holds
 * every seat as a <rect> with row / number / state / x / y / transform.
 * A seat is free only when state="Available"; Purchased, Excluded (red)
 * and Unavailable (grey) are all taken.
 *
 * The event id is the number at the end of the page slug:
 *   https://efinity.rs/event-map/senidah_cair_32286  ->  32286
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const API = id => `https://findloyalty-api.oblaci.rs/api/Map?cardTypeId=${encodeURIComponent(id)}&purchaseCode=null`;
  const AVAILABLE = 'Available';

  /* one response covers every sector, so a load followed by a scan
   * (or a burst of phone commands) reuses it instead of refetching */
  let payloadCache = { id: null, at: 0, json: null };

  async function payload(siteId, ctx, maxAgeMs) {
    if (payloadCache.id === siteId && Date.now() - payloadCache.at < maxAgeMs) return payloadCache.json;
    const json = await ctx.net.json(API(siteId));
    if (!json || !Array.isArray(json.Articles) || !json.Articles.length) throw new Error('venue API returned no sectors');
    payloadCache = { id: siteId, at: Date.now(), json };
    return json;
  }

  /* ---------------- SVG parsing (single linear scan, no DOMParser) --- */

  const ATTR = {};
  function attr(tag, name) {
    const re = ATTR[name] || (ATTR[name] = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"'));
    const m = re.exec(tag);
    return m ? m[1] : null;
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  /* -> Map<sectorName, { name, svgId, price, seated, seats: [{ id, row, num, state, x, y }] }> */
  function parseMapPayload(json) {
    const svg = (json && json.Svg) || '';
    const wanted = Object.create(null);
    const sectors = new Map();

    for (const a of (json && json.Articles) || []) {
      if (!a || !a.SvgMapId || !a.ArticleName) continue;
      const sec = { name: String(a.ArticleName).trim(), svgId: a.SvgMapId, price: a.Price, maxQty: a.MaximumQuantityPerTransaction || null, seated: false, seats: [] };
      wanted[a.SvgMapId] = sec;
      sectors.set(sec.name, sec);
    }

    /* keep a stack of open <svg> ids so each rect belongs to its innermost sector */
    const re = /<svg\b([^>]*)>|<\/svg\s*>|<rect\b([^>]*)>/g;
    const stack = [];
    let m;
    while ((m = re.exec(svg)) !== null) {
      if (m[0].charCodeAt(1) === 47) { stack.pop(); continue; }            // </svg>
      if (m[1] !== undefined) {                                            // <svg ...>
        if (!/\/\s*$/.test(m[1])) stack.push(attr(m[1], 'id'));
        continue;
      }
      const tag = m[2];                                                    // <rect ...>
      if (tag.indexOf('state=') < 0) continue;

      let owner = null;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] && wanted[stack[i]]) { owner = wanted[stack[i]]; break; }
      }
      if (!owner) continue;

      let cx = num(attr(tag, 'x')) + num(attr(tag, 'width')) / 2;
      let cy = num(attr(tag, 'y')) + num(attr(tag, 'height')) / 2;
      const tr = attr(tag, 'transform');
      const rot = tr && /rotate\(\s*(-?[\d.]+)/.exec(tr);
      if (rot) {
        const th = parseFloat(rot[1]) * Math.PI / 180;
        const c = Math.cos(th), s = Math.sin(th);
        [cx, cy] = [cx * c - cy * s, cx * s + cy * c];
      }

      owner.seats.push({ id: attr(tag, 'id'), row: attr(tag, 'row') || '?', num: attr(tag, 'number') || '?', state: attr(tag, 'state'), x: cx, y: cy });
    }

    sectors.forEach(s => { s.seated = s.seats.length > 0; });
    return sectors;
  }

  /* ---------------- the bar tables, as one sector -------------------- *
   * eFinity sells every barski sto as its own article, so a request for a
   * table means picking one of a dozen sectors and hoping. This gathers them
   * into one sector: one row per table, and a table counts only when all six
   * seats are free.
   *
   * Whole tables are the only thing to count, because the site will not sell
   * fewer than four of the six — the two or one left at a part-sold table
   * cannot be bought by anyone, so they are not free to you.
   *
   * Seats sit one step apart inside their table. The real coordinates are a
   * ring, and the aisle rule would read that as gaps and cut a free table into
   * pieces; at a table, being next to someone is not the point.
   * ------------------------------------------------------------------ */

  const BAR = 'BAR TABLES';
  const BAR_RE = /^BARSKI\s+STO\b/i;
  const tableNo = name => Number((/(\d+)\s*$/.exec(name) || [])[1]) || 0;

  function barTables(map) {
    return [...map.values()]
      .filter(sec => BAR_RE.test(sec.name) && sec.seats.length)
      .sort((a, b) => tableNo(a.name) - tableNo(b.name) || a.name.localeCompare(b.name, 'en'));
  }

  const wholeTable = t => t.seats.every(s => s.state === AVAILABLE);

  /* every table's seats, one row per table -> the shape every site returns */
  function barSeats(map) {
    const out = [];
    for (const t of barTables(map)) {
      const row = String(tableNo(t.name) || t.name);
      const free = wholeTable(t);
      t.seats.forEach((seat, i) => out.push({ row, label: seat.num, x: i, y: 0, free, cat: null, id: seat.id }));
    }
    return out;
  }

  function slugOf(url) {
    const m = /^https?:\/\/(?:www\.)?efinity\.rs\/event-map\/([^/?#]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function humanize(slug) {
    return String(slug || '').replace(/_?\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  SK.registerSite({
    id: 'efinity',
    label: 'eFinity',
    origin: 'https://efinity.rs',
    rowOrder: 'axis',
    priceCurrency: 'RSD',               // what a sector's price is in
    can: { prices: false, listEvents: false },
    pages: [{ key: 'map', label: 'seat map page' }],
    badges: 'badges on the map',
    sectorMaxAgeMs: 10 * 60 * 1000,

    eventFromUrl(url) {
      const slug = slugOf(url);
      const m = slug && /(\d+)$/.exec(slug);
      return m ? m[1] : null;
    },

    extraFromUrl(url) {
      const slug = slugOf(url);
      return slug ? { slug } : {};
    },

    eventUrl(ev) {
      const slug = ev.extra && ev.extra.slug;
      return slug ? `https://efinity.rs/event-map/${slug}` : 'https://efinity.rs/';
    },

    sectorUrl() { return null; },          // every sector is on the one map page

    /* "a" -> "A TRIBINE", "bs12" -> "BARSKI STO 12" */
    aliasSector(input) {
      const q = String(input).toUpperCase().replace(/\s+/g, ' ').trim();
      let m;
      if ((m = /^([A-Z])$/.exec(q))) return m[1] + ' TRIBINE';
      if ((m = /^([A-Z])\s*TRIB[A-Z]*$/.exec(q))) return m[1] + ' TRIBINE';
      if ((m = /^(?:BS|STO|BARSKI|BARSKI STO|B STO)\s*(\d+)$/.exec(q))) return 'BARSKI STO ' + m[1];
      /* every table at once */
      if (/^(?:BAR ?TABLES?|TABLES?|BARSKI ?STO|STO|BS)$/.test(q)) return BAR;
      return q;
    },

    sectorHint(sector) {
      const m = sector.meta || {};
      if (m.bar) return `${m.tables} tables · ${m.perTable} seats each · ${m.price} RSD · a table counts only when every seat is free`;
      return m.seated ? `${m.seats} seats · ${m.price} RSD` : 'standing area';
    },

    async loadEvent(ev, ctx) {
      const json = await payload(ev.siteId, ctx, 20000);
      const map = parseMapPayload(json);
      const sectors = [...map.values()].map(s => ({
        id: s.name, code: s.name, name: s.name,
        meta: { svgId: s.svgId, price: s.price, seated: s.seated, seats: s.seats.length }
      }));
      const tables = barTables(map);
      if (tables.length) {
        /* one sector standing for all of them, next to the tables themselves:
         * asking for a table is not asking for table nine */
        const per = Math.max(...tables.map(t => t.seats.length));
        sectors.push({
          id: BAR, code: 'Bar Table', name: 'Bar Table · every barski sto',
          meta: { bar: true, seated: true, tables: tables.length, perTable: per,
            seats: tables.reduce((n, t) => n + t.seats.length, 0), price: tables[0].price }
        });
      }
      return { title: ev.title || humanize(ev.extra && ev.extra.slug) || `eFinity ${ev.siteId}`, sectors };
    },

    async scan(ev, ids, ctx) {
      const map = parseMapPayload(await payload(ev.siteId, ctx, 5000));
      const results = {};
      const errors = [];
      for (const id of ids) {
        if (id === BAR) {
          const seats = barSeats(map);
          results[id] = seats.length
            ? { seats }
            : { unmapped: true, note: 'this event has no bar tables' };
          continue;
        }
        const sec = map.get(id);
        if (!sec) { errors.push(`${id}: no longer on the map`); continue; }
        results[id] = sec.seated
          ? { seats: sec.seats.map(s => ({ row: s.row, label: s.num, x: s.x, y: s.y, free: s.state === AVAILABLE, cat: null, id: s.id })) }
          : { unmapped: true, note: 'standing area — the site publishes no seat data' };
      }
      return { results, errors };
    }
  });

  SK.efinity = { parseMapPayload, barTables, barSeats, BAR };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

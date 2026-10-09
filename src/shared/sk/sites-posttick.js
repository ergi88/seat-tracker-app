/* ------------------------------------------------------------------
 * Site adapter: posttick.com (seats.io charts)
 *
 * The event page carries the chart config inline:
 *   new seatsio.SeatingChart({ publicKey: "<workspace>", event: "<event>",
 *                              pricing: { prices: [{ category, price }] } })
 * From there three public seats.io endpoints give everything:
 *   rendering-info    chartKey, drawingVersion, format, categories, channels, for-sale config
 *   published/<drawingVersion>/format/<n>
 *                     sections -> rows -> seats with x, y, label, category
 *   object-statuses/format/<n>   booked / held / free
 * Those two are served as application/vnd.seatsio: JSON obfuscated with the
 * chartKey as the key. <n> is rendering-info's `format`; the URLs without
 * the /format/<n> suffix return 404 since seats.io's October 2026 change.
 *
 * Buyable = not booked/held, not excluded by the for-sale config and not
 * fenced inside a private sales channel (seats.io's own `selectable`).
 * On posttick taken seats are grey; CAT 1 is drawn crimson but is free.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const REGIONS = ['eu', 'na', 'sa', 'oc'];
  const cdn = region => `https://cdn-${region}.seatsio.net`;

  /* Events that were tracked before the merge. Their price table was
   * checked by hand and wins over the page's own list; the keys are a
   * fallback if the event page ever cannot be read. */
  const KNOWN = {
    'maxamini2027/2026_11_27_max_amini_pallati_i_kongreseve_albania_930pm': {
      title: 'Max Amini - 27.11.2026 - 9:30 PM - Pallati i Kongreseve, Tirana',
      workspaceKey: 'cafb000b-bff5-4bf9-a7eb-d512c5a0f067',
      eventKey: '09f5be25-8592-4859-a572-b8cbf099687b',
      region: 'eu',
      currency: '€',
      prices: { cat1: 182, cat2: 145, cat3: 119, cat4: 95, cat5: 85, cat6: 75, cat7: 65, cat8: 55, cat9: 35, roastfree: 245 }
    }
  };

  /* seats.io's deobfuscators, by format, as in their chart renderer */
  const FORMATS = {
    /* every byte shifted by a 0-63 hash of the key */
    0(src, key) {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (29 * h % 10007 + key.charCodeAt(i)) % 10007;
      const n = h & 63;
      return src.map(b => (b - n) & 0xff);
    },
    /* xor with a 256-byte table seeded by FNV-1a of the key, chained on the previous plain byte */
    1(src, key) {
      let seed = 0x811c9dc5;
      for (const b of new TextEncoder().encode(key)) { seed ^= b; seed = Math.imul(seed, 0x1000193); }
      const table = new Uint8Array(256);
      for (let x = 0; x < 256; x++) {
        let i = Math.imul(x ^ seed ^ 0x811c9dc5, 0x1000193);
        i ^= i >>> 13; i ^= i << 7; i ^= i >>> 11;
        table[x] = i & 0xff;
      }
      const out = new Uint8Array(src.length);
      let prev = 0;
      for (let i = 0; i < src.length; i++) { out[i] = src[i] ^ table[prev]; prev = out[i]; }
      return out;
    }
  };

  function formatOf(info) {
    const f = Number((info && info.format) || 0);
    if (!FORMATS[f]) throw new Error(`seats.io switched to data format ${f}, which the tracker cannot read yet`);
    return f;
  }

  function decodeSeatsio(buffer, key, format = 0) {
    const out = FORMATS[format](new Uint8Array(buffer), String(key));
    return JSON.parse(new TextDecoder('utf-8').decode(out));
  }

  async function fetchSeatsio(ctx, path, x, format) {
    const [base, query] = path.split('?');
    const url = `${cdn(x.region)}/system/public/${x.workspaceKey}/${base}/format/${format}${query ? '?' + query : ''}`;
    return decodeSeatsio(await ctx.net.buffer(url), x.chartKey, format);
  }

  /* "CAT 7", "cat 7", "c7" and "cat7" are the same category */
  function catSlug(label) {
    return String(label == null ? '' : label).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^c(?=\d)/, 'cat');
  }

  function shortSec(full) { return String(full || '').replace(/^Block\s+/i, '').trim(); }

  /* ---------------- the event page ---------------------------------- */

  function parsePrices(html) {
    const m = String(html).match(/prices\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
    if (!m) return null;
    let list;
    try { list = JSON.parse(m[1]); } catch (e) { return null; }
    const out = {};
    for (const row of Array.isArray(list) ? list : []) {
      if (row && row.category != null && Number.isFinite(Number(row.price))) out[String(row.category)] = Number(row.price);
    }
    return Object.keys(out).length ? out : null;
  }

  function parsePage(html) {
    const uuid = key => (new RegExp(`\\b${key}\\s*:\\s*["']([0-9a-f-]{36})["']`, 'i').exec(html) || [])[1] || null;
    const title = ((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '')
      .replace(/\s*-\s*posttick\.com\s*$/i, '').replace(/\s+/g, ' ').trim();
    return { workspaceKey: uuid('publicKey') || uuid('workspaceKey'), eventKey: uuid('event'), prices: parsePrices(html), title: SK.util.decodeHtml(title) };
  }

  /* ---------------- seats.io ---------------------------------------- */

  async function renderingInfo(ctx, workspaceKey, eventKey, preferred) {
    const order = [preferred, ...REGIONS.filter(r => r !== preferred)].filter(Boolean);
    let lastErr = null;
    for (const region of order) {
      try {
        const info = await ctx.net.json(`${cdn(region)}/system/public/${workspaceKey}/rendering-info?event_key=${eventKey}`);
        return { info, region };
      } catch (e) {
        lastErr = e;
        if (!/HTTP 40[034]/.test(e.message)) throw e;   // only a wrong region moves on
      }
    }
    throw lastErr || new Error('seats.io chart not found');
  }

  /* [{ label, rows: [{ label, seats: [{ label, x, y, cat, id }] }] }] */
  function buildLayout(drawing) {
    const out = [];
    for (const sec of (drawing && drawing.subChart && drawing.subChart.sections) || []) {
      const rows = [];
      for (const row of (sec.subChart && sec.subChart.rows) || []) {
        const seats = (row.seats || []).map(s => ({
          label: String(s.label), x: Number(s.x), y: Number(s.y),
          cat: s.categoryKey === null || s.categoryKey === undefined ? sec.categoryKey : s.categoryKey,
          id: `${sec.label}-${row.label}-${s.label}`
        }));
        if (seats.length) rows.push({ label: String(row.label), seats });
      }
      if (rows.length) out.push({ label: sec.label, rows });
    }
    return out;
  }

  /* the drawing only changes when seats.io publishes a new version */
  async function layoutFor(ctx, x, info) {
    const drawingVersion = info.drawingVersion;
    const cached = await ctx.cacheGet('layout');
    if (cached && cached.version === drawingVersion && cached.chartKey === x.chartKey && cached.sectors) return cached.sectors;
    const drawing = await fetchSeatsio(ctx, `charts/${x.chartKey}/published/${drawingVersion}`, x, formatOf(info));
    const sectors = buildLayout(drawing);
    await ctx.cacheSet('layout', { version: drawingVersion, chartKey: x.chartKey, sectors });
    return sectors;
  }

  function unavailableSet(info, statuses, eventKey) {
    const bad = new Set();
    let onlyForSale = null;
    for (const k of Object.keys(statuses || {})) {
      const e = statuses[k];
      if (e && e.objectLabelOrUuid && e.status !== 'free') bad.add(e.objectLabelOrUuid);
    }
    const cfg = ((info && info.forSaleConfigsPerEvent) || {})[eventKey];
    if (cfg && Array.isArray(cfg.objects)) {
      if (cfg.forSale === false) cfg.objects.forEach(o => bad.add(o));
      else if (cfg.forSale === true) onlyForSale = new Set(cfg.objects);
    }
    for (const ch of (info && info.channels) || []) (ch.objects || []).forEach(o => bad.add(o));
    return id => !bad.has(id) && (!onlyForSale || onlyForSale.has(id));
  }

  /* { <key>: { key, label, color, price } }: the known table wins, then the page.
   * rendering-info sends categories as a plain array, the drawing wraps it in { list }. */
  function buildCategories(info, pagePrices, table) {
    const out = {};
    const raw = info && info.categories;
    const list = Array.isArray(raw) ? raw : (raw && raw.list) || [];
    for (const c of list) {
      let price = table ? table[catSlug(c.label)] : undefined;
      if (price === undefined && pagePrices && pagePrices[c.label] !== undefined) price = pagePrices[c.label];
      out[String(c.key)] = { key: String(c.key), label: c.label, color: c.color || null, price: price === undefined ? null : Number(price) };
    }
    return out;
  }

  function eventUrl(ev) { return `https://posttick.com/c/${ev.siteId}/en/`; }

  SK.registerSite({
    id: 'posttick',
    label: 'Posttick',
    origin: 'https://posttick.com',
    rowOrder: 'axis',
    can: { prices: true, listEvents: false },
    pages: [{ key: 'map', label: 'seat map page' }],
    badges: 'badge strip under the map',
    sectorMaxAgeMs: 12 * 3600 * 1000,

    /* https://posttick.com/c/<organiser>/<show>/<lang>/ -> "<organiser>/<show>" */
    eventFromUrl(url) {
      const m = /^https?:\/\/(?:www\.)?posttick\.com\/c\/([^/?#]+)\/([^/?#]+)/.exec(String(url || ''));
      if (!m || /^[a-z]{2}$/i.test(m[2])) return null;
      return `${m[1]}/${m[2]}`;
    },

    eventUrl,
    sectorUrl() { return null; },
    currency(ev) { return (ev.extra && ev.extra.currency) || '€'; },

    aliasSector(input) { return shortSec(input); },

    async loadEvent(ev, ctx) {
      const known = KNOWN[ev.siteId] || {};
      let page = {};
      try { page = parsePage(await ctx.net.text(eventUrl(ev))); }
      catch (e) { if (!known.workspaceKey) throw e; }

      const workspaceKey = page.workspaceKey || known.workspaceKey || (ev.extra && ev.extra.workspaceKey);
      const eventKey = page.eventKey || known.eventKey || (ev.extra && ev.extra.eventKey);
      if (!workspaceKey || !eventKey) throw new Error('no seats.io chart on the event page');

      const { info, region } = await renderingInfo(ctx, workspaceKey, eventKey, (ev.extra && ev.extra.region) || known.region);
      const extra = {
        workspaceKey, eventKey, region, chartKey: info.chartKey,
        currency: known.currency || '€',
        pagePrices: page.prices || (ev.extra && ev.extra.pagePrices) || null
      };
      const layout = await layoutFor(ctx, extra, info);
      return {
        title: page.title || known.title || ev.title,
        sectors: layout.map(s => ({ id: s.label, code: shortSec(s.label), name: s.label, meta: { seats: s.rows.reduce((n, r) => n + r.seats.length, 0) } })),
        extra,
        cats: buildCategories(info, extra.pagePrices, known.prices)
      };
    },

    async scan(ev, ids, ctx) {
      const x = ev.extra || {};
      if (!x.workspaceKey || !x.eventKey) throw new Error('event not loaded yet');
      const { info, region } = await renderingInfo(ctx, x.workspaceKey, x.eventKey, x.region);
      const keys = Object.assign({}, x, { region, chartKey: info.chartKey });
      const layout = await layoutFor(ctx, keys, info);
      const statuses = await fetchSeatsio(ctx, `events/object-statuses?event_key=${x.eventKey}`, keys, formatOf(info));
      const isFree = unavailableSet(info, statuses, x.eventKey);

      const bySec = new Map(layout.map(s => [s.label, s]));
      const results = {};
      const errors = [];
      for (const id of ids) {
        const sec = bySec.get(id);
        if (!sec) { errors.push(`${shortSec(id)}: no longer on the chart`); continue; }
        const seats = [];
        for (const row of sec.rows) {
          for (const s of row.seats) seats.push({ row: row.label, label: s.label, x: s.x, y: s.y, free: isFree(s.id), cat: s.cat, id: s.id });
        }
        results[id] = { seats };
      }
      const known = KNOWN[ev.siteId] || {};
      return { results, errors, cats: buildCategories(info, x.pagePrices, known.prices), extra: { region, chartKey: info.chartKey } };
    }
  });

  SK.posttick = { decodeSeatsio, parsePage, parsePrices, buildLayout, shortSec, catSlug };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

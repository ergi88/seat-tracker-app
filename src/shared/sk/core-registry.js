/* ------------------------------------------------------------------
 * Seat Tracker - site registry
 *
 * Every supported website is one adapter file in sites/ that calls
 * SK.registerSite({...}). The rest of the extension only talks to sites
 * through this contract:
 *
 *   id, label, origin            'ebileta', 'eBileta', 'https://al.ebileta.al'
 *   rowOrder                     'x' | 'axis'   (see core/rules.js)
 *   can: { prices, listEvents }  optional features
 *   pages: [{ key, label }]      on-site pages that can show the sidebar
 *   badges: 'label' | null       on-site badges, switchable in Settings
 *   pushSelectors: 'css'         fixed site elements to shift in push mode
 *   sectorMaxAgeMs               how long a loaded sector list stays fresh
 *
 *   eventFromUrl(url)            -> siteId | null
 *   eventUrl(event)              -> url of the event / seat map
 *   sectorUrl(event, sector)     -> url of one sector, or null
 *   aliasSector(input)           -> optional rewrite of a typed sector name
 *   scanAllFilter(sector)        -> optional, false = skip in "scan all"
 *   sectorHint(sector, event)    -> optional short text for autocomplete
 *   currency(event)              -> optional currency sign for prices
 *
 *   async loadEvent(event, ctx)  -> { title?, date?, sectors, extra?, cats? }
 *   async scan(event, ids, ctx)  -> { results: { [sectorId]: { seats } |
 *                                    { unmapped, note } }, errors, cats?, extra? }
 *   async listEvents(ctx)        -> [{ siteId, title, date, venue, status }]
 *
 * ctx = { net, cacheGet(name), cacheSet(name, value) }  (service worker only)
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};
  SK.sites = SK.sites || {};

  function registerSite(def) {
    SK.sites[def.id] = Object.assign({
      can: {}, pages: [], badges: null, rowOrder: 'axis',
      sectorMaxAgeMs: 10 * 60 * 1000, pushSelectors: ''
    }, def);
  }

  function site(id) { return SK.sites[id] || null; }

  function siteList() {
    return Object.values(SK.sites).sort((a, b) => a.label.localeCompare(b.label));
  }

  function eventKey(siteId, id) { return `${siteId}:${id}`; }

  function splitEventKey(key) {
    const i = String(key).indexOf(':');
    return { site: String(key).slice(0, i), siteId: String(key).slice(i + 1) };
  }

  /* which site and event does this page belong to? */
  function eventForUrl(url) {
    for (const s of Object.values(SK.sites)) {
      let id = null;
      try { id = s.eventFromUrl(url); } catch (e) { id = null; }
      if (id) return { site: s.id, siteId: String(id), key: eventKey(s.id, id) };
    }
    return null;
  }

  /* Loose sector lookup: "n105", "N 105", "TRIBUNA_N105", "a1", the id.
   * Returns { sector } or { error }. */
  function resolveSector(siteId, input, sectors) {
    const U = SK.util;
    const raw = String(input == null ? '' : input).replace(/_/g, ' ').trim();
    if (!raw) return { error: 'missing sec=' };
    if (!sectors || !sectors.length) return { error: 'no sector list yet — open the event page or run a scan first' };

    const s = site(siteId);
    const queries = [raw];
    if (s && s.aliasSector) {
      const a = s.aliasSector(raw);
      if (a && a !== raw) queries.unshift(a);
    }

    for (const q of queries) {
      const k = U.normKey(q);
      if (!k) continue;
      const byId = sectors.filter(x => String(x.id) === q);
      if (byId.length === 1) return { sector: byId[0] };
      const byCode = sectors.filter(x => U.normKey(x.code) === k);
      if (byCode.length === 1) return { sector: byCode[0] };
      const byName = sectors.filter(x => U.normKey(x.name) === k);
      if (byName.length === 1) return { sector: byName[0] };
    }

    const k = U.normKey(queries[queries.length - 1]);
    const ends = sectors.filter(x => U.normKey(x.name).endsWith(k));
    if (ends.length === 1) return { sector: ends[0] };
    const starts = sectors.filter(x => U.normKey(x.name).startsWith(k) || U.normKey(x.code).startsWith(k));
    if (starts.length === 1) return { sector: starts[0] };

    const cand = starts.length > 1 ? starts : ends;
    if (cand.length > 1) {
      return { error: `"${input}" matches ${cand.length} sectors: ${cand.slice(0, 6).map(x => x.code).join(', ')}${cand.length > 6 ? ', …' : ''}` };
    }
    return { error: `unknown sector "${input}"` };
  }

  Object.assign(SK, { registerSite, site, siteList, eventKey, splitEventKey, eventForUrl, resolveSector });

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

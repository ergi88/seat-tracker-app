/* ------------------------------------------------------------------
 * Seat Tracker - viagogo listing pages
 *
 * viagogo is where the tickets are sold, not a ticket site: nothing is
 * scanned there. On the "Listing confirmed" page the sidebar reads the
 * listing (event, tickets, section, listing ID) and fills Add a request.
 *
 * viagogo's class names are generated and change with every release, so
 * the page is read by its visible text only, never by class.
 *
 * Matching a listing to a tracked event: a remembered pairing first, then
 * the date (+ time) and the words of the title. Titles differ between
 * sites ("Albania vs San Marino - Nations League" / "Shqiperi - San
 * Marino"), so a few Albanian names are folded to English.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const HOST = /(^|\.)viagogo\.com$/i;
  const PAGE = /^\/secure\/pipeline\/sell\/confirmed/i;

  /* the step of selling where the price is set: Secure/Pipeline/Sell/PriceDetails… */
  function isPricePage(loc) {
    return !!loc && HOST.test(loc.hostname || '') && /^\/secure\/pipeline\/sell\/pricedetails/i.test(loc.pathname || '');
  }

  function isConfirmedPage(loc) {
    return !!loc && HOST.test(loc.hostname || '') && PAGE.test(loc.pathname || '');
  }

  /* ---------------- text ------------------------------------------ */

  /* lower case without accents: "Nëntor" -> "nentor" */
  function fold(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /* the first three letters of a month: English (viagogo), Albanian (eBileta), Serbian (eFinity) */
  const MONTHS = {
    jan: 1, feb: 2, shk: 2, mar: 3, apr: 4, pri: 4, may: 5, maj: 5, jun: 6, qer: 6,
    jul: 7, kor: 7, aug: 8, avg: 8, gus: 8, sep: 9, sht: 9, oct: 10, okt: 10, tet: 10,
    nov: 11, nen: 11, dec: 12, dhj: 12
  };

  /* Day, month and time of day in a text. The month is the word right after
   * the day number: eBileta's "Mar 06 tet 2026" starts with a weekday (Mar =
   * Tuesday) and "Sht 26 sht" uses the same letters for Saturday and September. */
  function parseWhen(text) {
    const t = fold(text);
    let day = null, month = null, minutes = null, m;
    if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) {
      month = +m[2]; day = +m[3];
    } else if ((m = /(?:^|\D)(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?!\d)/.exec(t))) {
      day = +m[1]; month = +m[2];
    } else {
      const re = /(?:^|\D)(\d{1,2})\.?\s*([a-z]{3})/g;
      while ((m = re.exec(t))) {
        if (MONTHS[m[2]]) { day = +m[1]; month = MONTHS[m[2]]; break; }
        re.lastIndex = m.index + 1;
      }
    }
    if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) { day = null; month = null; }
    if ((m = /(?:^|\D)(\d{1,2}):(\d{2})(?!\d)\s*(am|pm)?/.exec(t))) {
      let h = +m[1];
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      if (h <= 23 && +m[2] <= 59) minutes = h * 60 + +m[2];
    }
    return { day, month, minutes };
  }

  const STOP = new Set(['vs', 'the', 'and', 'of', 'fc', 'nations', 'league', 'uefa', 'fifa', 'cup', 'world',
    'qualifier', 'qualifiers', 'friendly', 'tickets', 'ticket', 'tour', 'live']);
  const SYNONYMS = {
    shqiperi: 'albania', shqiperia: 'albania', shqiperise: 'albania',
    kosova: 'kosovo', srbija: 'serbia', bjellorusi: 'belarus', bjellorusia: 'belarus'
  };

  function titleWords(text) {
    const out = new Set();
    for (const w of fold(text).split(/[^a-z0-9]+/)) {
      if (w.length < 3 || /^\d+$/.test(w) || STOP.has(w)) continue;
      out.add(SYNONYMS[w] || w);
    }
    return out;
  }

  /* stable name of a viagogo event, used to remember which tracked event it is */
  function listingKey(listing) {
    const w = parseWhen(listing.when);
    const name = fold(listing.title).replace(/[^a-z0-9]/g, '').slice(0, 120);
    return w.day ? `${name}|${w.day}.${w.month}` : name;
  }

  /* how a section is remembered: "S103", "s 103" -> "s103" */
  function sectionKey(section) {
    return fold(section).replace(/[^a-z0-9]/g, '');
  }

  /* ---------------- which tracked event ---------------------------- */

  function scoreEvent(listing, ev) {
    const a = parseWhen(listing.when);
    const b = parseWhen(`${ev.date || ''} ${ev.title || ''}`);
    const mine = titleWords(ev.title);
    const words = [...titleWords(listing.title)].filter(w => mine.has(w));
    let score = words.length * 2;
    let dated = false;
    if (a.day && b.day) {
      if (a.day !== b.day || a.month !== b.month) return { score: -1, words, dated: false, rejected: true };
      dated = true;
      score += 4;
      if (a.minutes !== null && b.minutes !== null) score += Math.abs(a.minutes - b.minutes) <= 30 ? 1 : -3;
    }
    return { score, words, dated, rejected: false };
  }

  /* -> { key, how } or null when it is not clear */
  function pickEvent(listing, events) {
    const key = listingKey(listing);
    const remembered = events.filter(e => e.viagogo && Array.isArray(e.viagogo.events) && e.viagogo.events.includes(key));
    if (remembered.length === 1) return { key: remembered[0].key, how: 'remembered' };

    const pool = remembered.length > 1 ? remembered : events;
    const ranked = pool
      .map(ev => Object.assign({ ev }, scoreEvent(listing, ev)))
      .filter(r => !r.rejected && (r.dated ? r.words.length >= 1 : r.words.length >= 2))
      .sort((x, y) => y.score - x.score);
    if (!ranked.length) return null;
    if (ranked.length > 1 && ranked[1].score === ranked[0].score) return null;
    return { key: ranked[0].ev.key, how: ranked[0].dated ? 'date and title' : 'title' };
  }

  /* ---------------- which sector ---------------------------------- */

  /* -> { code, how }: how is remembered | matched | pick (filter the list) |
   *    waiting (sectors not loaded yet) | no event */
  function sectorFor(ev, section) {
    const raw = String(section || '').trim();
    if (!raw) return { code: '', how: '' };
    if (!ev) return { code: raw, how: 'no event' };
    const sectors = ev.sectors || [];
    if (!sectors.length) return { code: raw, how: 'waiting' };

    const learned = ev.viagogo && ev.viagogo.sectors && ev.viagogo.sectors[sectionKey(raw)];
    const known = learned && sectors.find(s => String(s.id) === String(learned));
    if (known) return { code: known.code, how: 'remembered' };

    const hit = SK.resolveSector ? SK.resolveSector(ev.site, raw, sectors) : {};
    if (hit.sector) return { code: hit.sector.code, how: 'matched' };

    /* never guess from the digits alone ("103" may be N103 or S103): filter the list instead */
    const digits = raw.replace(/\D/g, '');
    return { code: digits || raw, how: 'pick' };
  }

  /* ---------------- reading the page ------------------------------ */

  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg']);
  const LISTING = /listing\s*id\s*:?\s*(\d{5,})/i;
  const SECTION = /^(?:section|sector|block)\s*:?\s+(.+)$/i;
  const QTY = /(\d{1,3})\s*[x×]\s*(?:e-?tickets?|mobile|paper|tickets?)\b/i;
  const QTY_WORDS = /^(?:\d{1,3}\s*[x×]?|e-?tickets?|mobile(?: tickets?)?|paper(?: tickets?)?|tickets?)$/i;

  /* the visible text of a node; separate text nodes are separate words
   * ("06 Oct<span></span>Tue" reads "06 Oct Tue", not "06 OctTue") */
  function textOf(node) {
    const parts = [];
    const walk = n => {
      if (n.nodeType === 3) { parts.push(n.nodeValue); return; }
      if (n.nodeType !== 1 || SKIP.has(n.tagName.toLowerCase())) return;
      for (const c of n.childNodes) walk(c);
    };
    walk(node);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /* the smallest pieces of text, in page order */
  function blocksOf(rootEl) {
    const out = [];
    const visit = el => {
      if (SKIP.has(el.tagName.toLowerCase())) return;
      const kids = [...el.children].filter(c => textOf(c));
      const ownText = [...el.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim());
      if (!kids.length || ownText) {
        const t = textOf(el);
        if (t) out.push({ el, text: t });
        return;
      }
      kids.forEach(visit);
    };
    visit(rootEl);
    return out;
  }

  /* climb from the "Listing ID" label to the whole card: the smallest box that
   * also holds the date and the tickets, never one holding a second listing */
  function cardOf(label) {
    let best = label;
    for (let e = label, depth = 0; e && e.tagName && e.tagName.toLowerCase() !== 'body' && depth < 12; e = e.parentElement, depth++) {
      const t = textOf(e);
      if ((t.match(/listing\s*id/gi) || []).length > 1) break;
      best = e;
      if (parseWhen(t).day && (QTY.test(t) || /\bsection\b/i.test(t))) return e;
    }
    return best;
  }

  /* a date line with no real words: "06 Oct Tue 20:45", "Mar 06 tet 2026 20:45" */
  const dateOnly = t => !!parseWhen(t).day && (fold(t).match(/[a-z]{4,}/g) || []).length <= 1;

  function parseCard(card) {
    const texts = blocksOf(card)
      .filter(b => !b.el.closest('button, a[role="button"], [role="button"]'))
      .map(b => b.text);
    const joined = texts.join(' ');

    let listing = '', section = '', m;
    for (const t of texts) {
      if (!listing && (m = LISTING.exec(t))) listing = m[1];
      else if (!section && (m = SECTION.exec(t))) section = m[1].trim();
    }
    if (!listing && (m = LISTING.exec(joined))) listing = m[1];
    if (!listing) return null;

    const q = QTY.exec(joined) || /(\d{1,3})\s+tickets?\b/i.exec(joined);
    const qty = q ? parseInt(q[1], 10) : 0;

    const rest = texts.filter(t => !/listing\s*id/i.test(t) && !SECTION.test(t) && !QTY_WORDS.test(t) && !/^\d+$/.test(t));
    const when = rest.find(dateOnly) || '';
    const words = rest.filter(t => t !== when && /[a-z]{3}/i.test(fold(t)));
    const title = words[0] || '';
    return {
      listing, qty, section, title,
      venue: words[1] || '',
      when: when || (parseWhen(title).day ? title : '')
    };
  }

  function readListings(doc) {
    const body = doc && doc.body;
    if (!body) return [];
    const labels = [];
    const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (p && /listing\s*id/i.test(n.nodeValue) && !p.closest('script, style, noscript, template')) labels.push(p);
    }
    const seen = new Set();
    const out = [];
    for (const label of labels) {
      const card = cardOf(label);
      if (seen.has(card)) continue;
      seen.add(card);
      const l = parseCard(card);
      if (l && !out.some(x => x.listing === l.listing)) out.push(l);
    }
    return out;
  }

  /* ---------------- my.viagogo.com/listings ------------------------- */

  function isListingsPage(loc) {
    return !!loc && /^my\.viagogo\.com$/i.test(loc.hostname || '') && /^\/listings/i.test(loc.pathname || '');
  }

  /* Every listing, in every state, with no search narrowing it: what a sweep
   * has to be looking at before it can say anything about what is missing.
   * `search` filters the list, so a sweep run under one would call every
   * listing it hides "gone". */
  const SWEEP_TABS = 'ACTIVE|PENDING|DEACTIVATED|EXPIRED';

  function sweepUrl(loc) {
    const u = new URL((loc && loc.href) || 'https://my.viagogo.com/listings/');
    u.pathname = '/listings/';
    u.searchParams.delete('search');
    u.searchParams.set('activeTab', SWEEP_TABS);
    u.hash = '';
    return u.toString();
  }

  /* is this address already the one a sweep needs? */
  const sweepReady = loc => !!loc && !new URLSearchParams(loc.search || '').get('search');

  const LISTING_NO = /listing\s*no\.?\s*:?\s*(\d{5,})/i;
  const STATUS = /^(active|pending|inactive|deactivated|expired|sold(?: out)?|paused|draft|unavailable|live|on hold)$/i;

  /* viagogo writes a listing's state as the first line of its card ("Active").
   * It uses more words than it has states, so they are folded to the four the
   * listings page itself filters by, and anything new lands in "other" rather
   * than being dropped. */
  const LISTING_STATUSES = [
    { key: 'active', label: 'Active', re: /^(active|live)\b/i },
    { key: 'pending', label: 'Pending', re: /^(pending|draft|paused|on hold)\b/i },
    { key: 'deactivated', label: 'Deactivated', re: /^(deactivated|inactive|expired|unavailable)\b/i },
    { key: 'sold', label: 'Sold', re: /^sold\b/i },
    { key: 'other', label: 'Other', re: /(?:)/ }
  ];

  function listingStatus(status) {
    const s = String(status || '').trim();
    if (!s) return 'other';
    return (LISTING_STATUSES.find(x => x.key !== 'other' && x.re.test(s)) || { key: 'other' }).key;
  }

  /* from "Listing No." up to the card: the first box that also has the price,
   * and one more level (status, "Listing performance") while it still holds only this listing */
  function listingCardOf(label) {
    let withPrice = null;
    for (let e = label, depth = 0; e && e.tagName && e.tagName.toLowerCase() !== 'body' && depth < 14; e = e.parentElement, depth++) {
      const t = textOf(e);
      if ((t.match(/listing\s*no\.?/gi) || []).length > 1) break;
      if (/price\s+per\s+ticket|tickets?\s+available|you.ll\s+get/i.test(t)) { withPrice = e; break; }
    }
    if (!withPrice) return null;
    const up = withPrice.parentElement;
    if (up && up.tagName.toLowerCase() !== 'body' && (textOf(up).match(/listing\s*no\.?/gi) || []).length === 1) return up;
    return withPrice;
  }

  /* "$28.00", "€1.234,50", "Lekë2,800" — an amount and its sign, nothing else */
  const AMOUNT_ONLY = /^\s*(?:US\$|[$€£]|Lekë|Leke|Lek|RSD|USD|EUR|GBP|ALL)?\s*\d[\d.,\s ]*\s*(?:US\$|[$€£]|Lekë|Leke|Lek|L|RSD|USD|EUR|GBP|ALL|дин\.?)?\s*$/i;

  /* one listing card -> { id, status, title, venue, when, currency, price, payout, tickets,
   *                        section, row, performance, recommended, vgEventId } */
  function parseListingCard(card) {
    const money = t => (SK.profit ? SK.profit.parseMoney(t) : null);
    /* buttons are skipped, except one holding just an amount: viagogo puts the
     * price in an edit button ("$28.00 ✎") on listings whose price can be changed */
    const texts = blocksOf(card)
      .filter(b => !b.el.closest('[data-sk-line]')
        && (!b.el.closest('button, [role="button"]') || AMOUNT_ONLY.test(b.text)))
      .map(b => b.text);
    const joined = texts.join(' | ');
    const idm = LISTING_NO.exec(joined);
    if (!idm) return null;
    const at = texts.findIndex(t => LISTING_NO.test(t));
    const indexOf = re => texts.findIndex(t => re.test(t));
    const before = re => { const i = indexOf(re); return i > 0 ? texts[i - 1] : ''; };
    const after = re => { const i = indexOf(re); return i >= 0 && i + 1 < texts.length ? texts[i + 1] : ''; };

    /* Above "Listing No." sit the status and the event's name. viagogo leaves
     * the status line out altogether on a deactivated listing, so nothing
     * there means Deactivated — but only when nothing is there. A word we do
     * not recognise is kept as it is and counted as Other, because a status
     * viagogo invents later must not silently read as deactivated. */
    const head = texts.slice(0, Math.max(at, 0));
    const known = head.find(t => STATUS.test(t)) || '';
    const title = head.filter(t => t !== known).pop() || '';
    const spare = head.filter(t => t !== known && t !== title);
    const status = known || spare[0] || 'Deactivated';
    const rest = texts.slice(at + 1);
    const when = rest.find(t => parseWhen(t).day && t.length < 40) || '';
    const venue = rest.find(t => t !== when && /[a-z]{3}/i.test(fold(t)) && !/^[$€£]|price|section|tickets?\s+available/i.test(t)) || '';
    /* only a bare amount: never a number out of the date or the seats */
    const priceText = before(/^price\s+per\s+ticket$/i);
    const price = AMOUNT_ONLY.test(priceText) ? money(priceText) : null;
    const payout = money(after(/^you.ll\s+get$/i)) || money((/you.ll\s+get\s*\|?\s*([^|]+)/i.exec(joined) || [])[1]);
    const sec = texts.map(t => /^section\s+(.+?)(?:\s*[•·|,]\s*row\s+(.+))?$/i.exec(t)).find(Boolean);
    const tickets = /(\d+)\s+tickets?\s+available/i.exec(joined);
    const perf = indexOf(/^listing\s+performance$/i);
    const recommended = money((/recommended\s+price:?\s*([^|]+)/i.exec(joined) || [])[1]);
    const link = card.querySelector('a[href*="/E-"]');
    const vg = link ? /\/E-(\d+)/.exec(link.getAttribute('href') || '') : null;
    return {
      id: idm[1], status, title, venue, when,
      currency: (price && price.currency) || (payout && payout.currency) || '',
      price: price ? price.amount : null,
      payout: payout ? payout.amount : null,
      tickets: tickets ? Number(tickets[1]) : null,
      section: sec ? sec[1].trim() : '',
      row: sec && sec[2] ? sec[2].trim() : '',
      performance: perf >= 0 && texts[perf + 1] && texts[perf + 1].length <= 40 ? texts[perf + 1] : '',
      recommended: recommended ? recommended.amount : null,
      vgEventId: vg ? vg[1] : ''
    };
  }

  /* every listing card on the page -> [{ data, el }], in page order */
  function readListingCards(doc) {
    const body = doc && doc.body;
    if (!body) return [];
    const labels = [];
    const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (p && LISTING_NO.test(n.nodeValue) && !p.closest('script, style, noscript, template, [data-sk-line]')) labels.push(p);
    }
    const out = [];
    const seen = new Set();
    for (const label of labels) {
      const card = listingCardOf(label);
      if (!card || seen.has(card)) continue;
      seen.add(card);
      const data = parseListingCard(card);
      if (data && !out.some(x => x.data.id === data.id)) out.push({ data, el: card });
    }
    return out;
  }

  /* ---------------- my.viagogo.com/listings: the pages ---------------- */
  /* The listings page paginates in the browser — the address never changes —
   * and labels none of it: the arrows are <span>s with no aria, no rel, no
   * href, no disabled and pointer-events left on in both states, and every
   * class is a build hash that rotates. The one thing that is structural is
   * the row of numbered buttons, so everything is found from those. */

  const pageNo = el => (/^\d{1,4}$/.test(textOf(el)) ? Number(textOf(el)) : null);

  /* -> { row, pages, last, prev, next } or null when the list has one page */
  function paginationOf(doc) {
    const byParent = new Map();
    for (const b of (doc || document).querySelectorAll('button')) {
      if (pageNo(b) === null || !b.parentElement) continue;
      const list = byParent.get(b.parentElement) || [];
      list.push(b);
      byParent.set(b.parentElement, list);
    }
    let row = null, pages = [];
    for (const [parent, list] of byParent) {
      /* page numbers only ever rise, left to right, even when elided as 1 2 … 7 8 */
      const nums = list.map(pageNo);
      if (list.length < 2 || nums.some((n, i) => i && n <= nums[i - 1])) continue;
      if (list.length > pages.length) { row = parent; pages = list; }
    }
    if (!row) return null;

    const kids = [...row.children];
    const at = n => kids.indexOf(n);
    const firstPage = Math.min(...pages.map(at));
    const lastPage = Math.max(...pages.map(at));
    /* the arrows are the row's non-numeric bookends, and the only ones with an icon */
    const arrows = kids.filter(k => !pages.includes(k) && k.querySelector('svg'));
    return {
      row, pages,
      last: Math.max(...pages.map(pageNo)),
      prev: arrows.find(a => at(a) < firstPage) || null,
      next: arrows.filter(a => at(a) > lastPage).pop() || null
    };
  }

  const TRANSPARENT = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i;

  /* Which page is open. viagogo fills the current button and leaves the others
   * clear, so the filled one wins; without a window to ask, the button holding
   * a class no other page button has is the same button. -> number or null */
  function currentPage(pag, win) {
    if (!pag || !pag.pages.length) return null;
    const style = win && win.getComputedStyle ? win.getComputedStyle.bind(win) : null;
    if (style) {
      const filled = pag.pages.filter(b => !TRANSPARENT.test(style(b).backgroundColor || 'transparent'));
      if (filled.length === 1) return pageNo(filled[0]);
    }
    const seen = new Map();
    const tokens = pag.pages.map(b => String(b.className || '').split(/\s+/).filter(Boolean));
    for (const list of tokens) for (const t of new Set(list)) seen.set(t, (seen.get(t) || 0) + 1);
    const odd = tokens.map(list => list.some(t => seen.get(t) === 1));
    return odd.filter(Boolean).length === 1 ? pageNo(pag.pages[odd.indexOf(true)]) : null;
  }

  /* A dead arrow keeps its classes and its pointer events; only the icon inside
   * fades, from opacity 1 to 0.25. Without a window to ask, an arrow that is
   * not there is dead too. */
  function arrowDead(arrow, win) {
    if (!arrow) return true;
    const icon = arrow.querySelector('svg') || arrow;
    const style = win && win.getComputedStyle ? win.getComputedStyle.bind(win) : null;
    if (!style) return false;
    const o = Number(style(icon).opacity);
    return Number.isFinite(o) && o < 0.5;
  }

  /* ---------------- www.viagogo.com event pages ---------------------- */
  /* The map is WebGL: nothing on it is readable. Everything comes from the
   * listing rows (data-listing-id, data-feature-id = "<zone>_<sprite>",
   * data-price, data-is-sold) and the map's hidden sprite sheet of sections. */

  function isEventPage(loc) {
    return !!loc && /^www\.viagogo\.com$/i.test(loc.hostname || '') && /\/E-\d+(?:[/?#]|$)/.test(loc.pathname || '');
  }

  const eventIdOf = loc => ((/\/E-(\d+)/.exec((loc && loc.pathname) || '') || [])[1] || '');

  /* the section picked on the map, from the URL: ?sections=<sprite>&ticketClasses=<zone> */
  function selectedSectionOf(loc) {
    const p = new URLSearchParams((loc && loc.search) || '');
    const sprite = (p.get('sections') || '').split(',')[0].trim();
    return /^\d+$/.test(sprite) ? { sprite, zone: (p.get('ticketClasses') || '').split(',')[0].trim() } : null;
  }

  /* the event page URL with one section selected, or none */
  function sectionUrl(loc, section) {
    const u = new URL(loc.href);
    u.searchParams.set('sections', section ? section.sprite : '');
    u.searchParams.set('ticketClasses', section ? section.zone : '');
    return u.toString();
  }

  /* name, start and venue from the page's SportsEvent ld+json, else the header */
  function readEventInfo(doc) {
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch (e) { continue; }
      for (const d of [].concat(data, (data && data['@graph']) || [])) {
        if (d && /Event$/.test(String(d['@type'] || '')) && d.name) {
          return { name: String(d.name), start: String(d.startDate || ''), venue: String((d.location && d.location.name) || '') };
        }
      }
    }
    const h1 = doc.querySelector('#event-detail-header h1') || doc.querySelector('h1');
    return { name: h1 ? textOf(h1) : '', start: '', venue: '' };
  }

  /* every section of the venue map -> [{ sprite, zone, label }] */
  function readSections(doc) {
    const out = [];
    const seen = new Set();
    for (const g of doc.querySelectorAll('g[sprite-identifier]')) {
      const sprite = String(g.getAttribute('sprite-identifier') || '').replace(/^s/, '');
      const text = g.querySelector('text');
      const label = text ? text.textContent.trim() : '';
      if (!/^\d+$/.test(sprite) || !label || seen.has(sprite)) continue;
      seen.add(sprite);
      const shape = g.querySelector('[eid]');
      out.push({ sprite, zone: shape ? shape.getAttribute('eid') : '', label });
    }
    return out;
  }

  /* Signed out, a row carries no listing ID: the card itself is the row then */
  const ROWS = ['#listings-container', '[data-testid="listings-container"]']
    .map(c => `${c} [data-listing-id], ${c} a.ensemble_listingCard__root`).join(', ');

  const rowCount = doc => new Set(doc.querySelectorAll(ROWS)).size;
  /* cheap "has the top of the list changed" for waiting on the page */
  const firstRowSig = doc => { const a = doc.querySelector(ROWS); return a ? (a.getAttribute('data-listing-id') || textOf(a).slice(0, 80)) : ''; };

  /* the listing rows loaded so far, in list order */
  function readRows(doc) {
    const money = t => (SK.profit ? SK.profit.parseMoney(t) : null);
    const out = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll(ROWS)) {
      if (seen.has(a)) continue;
      seen.add(a);
      /* no ID shown (signed out): a stand-in, unique on this page only */
      const id = String(a.getAttribute('data-listing-id') || '').replace(/\D/g, '') || `x${a.getAttribute('data-index') || out.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const aria = a.getAttribute('aria-label') || '';
      const feature = String(a.getAttribute('data-feature-id') || '');
      const [zone, sprite] = /^\d+_\d+$/.test(feature) ? feature.split('_') : ['', ''];
      const h3 = a.querySelector('h3[data-listing-cta-id]');
      const section = (h3 ? textOf(h3) : ((/Section\s+([^,]+)/i.exec(aria) || [])[1] || '')).replace(/^Section\s+/i, '').trim();
      const next = h3 && h3.nextElementSibling;
      const rowText = next && next.tagName === 'P' ? textOf(next) : '';
      const row = rowText ? rowText.replace(/^Row\s+/i, '') : ((/Row\s+([^,]+)/i.exec(aria) || [])[1] || '').trim();
      const price = money(a.getAttribute('data-price')) || money((/,\s*([^,]*\d[^,]*)$/.exec(aria) || [])[1]);
      const struck = a.querySelector('s');
      const was = struck ? money(textOf(struck)) : null;
      const details = [...a.querySelectorAll('.ensemble_listingCardTicketDetails__label')].map(textOf).filter(Boolean);
      const qtyText = details.find(t => /ticket/i.test(t)) || '';
      const range = /(\d+)\s*(?:-|–|to)\s*(\d+)/.exec(qtyText);
      const single = /(\d+)\s+tickets?/i.exec(qtyText);
      const kind = a.querySelector('.ensemble_listingCard__kindLabel');
      const all = textOf(a);
      const left = /only\s+(\d+)\s+left/i.exec(all);
      out.push({
        id, index: Number(a.getAttribute('data-index')) || 0, sprite, zone, section, row,
        price: price ? price.amount : null, currency: price ? price.currency || '' : '',
        was: was ? was.amount : null,
        qtyMin: range ? Number(range[1]) : single ? Number(single[1]) : null,
        qtyMax: range ? Number(range[2]) : single ? Number(single[1]) : null,
        features: details.filter(t => t !== qtyText),
        tags: [...a.querySelectorAll('.ensemble_listingCardTags__tagLabel')].map(textOf).filter(t => t && !/^only\s+\d+\s+left$/i.test(t)),
        left: left ? Number(left[1]) : null,
        mine: !!kind && /^your listing/i.test(textOf(kind)),
        anon: !a.hasAttribute('data-listing-id'),
        sold: a.getAttribute('data-is-sold') === '1'
      });
    }
    return out;
  }

  /* "Show more": the only pagination; it leaves the page when everything is loaded */
  function showMoreButton(doc) {
    return [...doc.querySelectorAll('#listings-container button, [data-testid="listings-container"] button, [data-testid="ExpandableScrollContainer"] button')]
      .find(b => /^(show|load)\s+more$/i.test(textOf(b))) || null;
  }

  /* "Showing 20 of 39" */
  function listFooter(doc) {
    const c = doc.querySelector('#listings-container, [data-testid="listings-container"]');
    const m = c ? /showing\s+(\d+)\s+of\s+(\d+)/i.exec(textOf(c)) : null;
    return m ? { shown: Number(m[1]), total: Number(m[2]) } : null;
  }

  /* ---------------- a listing next to its request ------------------ */

  const DIFF_RANK = { bad: 0, warn: 1, info: 2 };
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const sameCode = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  /* Where a listing, as its card shows it now, says something its Seat
   * Tracker request does not. Never guesses why: a listing with fewer
   * tickets may have sold some or been edited, so it only says it differs.
   * card: { tickets, section, title, when, status }
   * req:  { num, qty, code, eventKey, done }
   * -> [{ key, level: bad|warn|info, short, text, fixQty? }], most serious first */
  function listingDiffs(card, req, events) {
    const out = [];
    if (!card || !req) return out;
    const evs = events || [];
    const label = ev => (ev ? `[${ev.num}] ${ev.title}` : 'another event');

    const t = Number(card.tickets), q = Number(req.qty);
    if (card.tickets !== null && card.tickets !== undefined && Number.isFinite(t) && Number.isFinite(q) && t !== q) {
      const n = Math.abs(t - q);
      out.push(t < q
        ? { key: 'tickets', level: 'warn', short: `${t} vs ${q} tickets`, fixQty: t,
            text: `The listing has ${plural(n, 'ticket')} fewer than request #${req.num}: ${t} listed, the request is for ${q}.` }
        : { key: 'tickets', level: 'bad', short: `${t} vs ${q} tickets`, fixQty: t,
            text: `The listing has ${plural(n, 'ticket')} more than request #${req.num} covers: ${t} listed, the request is for ${q}.` });
    }

    const ev = evs.find(e => e.key === req.eventKey) || null;
    const sf = sectorFor(ev, card.section);
    if ((sf.how === 'matched' || sf.how === 'remembered') && req.code && !sameCode(sf.code, req.code)) {
      out.push({ key: 'section', level: 'bad', short: 'other section',
        text: `The listing's section ${card.section} is ${sf.code} here; request #${req.num} is for ${req.code}.` });
    }

    const pick = pickEvent(card, evs);
    if (pick && req.eventKey && pick.key !== req.eventKey) {
      out.push({ key: 'event', level: 'bad', short: 'other event',
        text: `The listing looks like ${label(evs.find(e => e.key === pick.key))}; request #${req.num} is on ${label(ev)}.` });
    }

    const kind = listingStatus(card.status);
    if (!req.done && (kind === 'sold' || kind === 'deactivated')) {
      out.push({ key: 'status', level: 'warn', short: 'listing not active',
        text: `The listing is "${card.status}" on viagogo, but request #${req.num} is still open and scanned.` });
    } else if (req.done && kind === 'active') {
      out.push({ key: 'status', level: 'info', short: 'request done',
        text: `Request #${req.num} is marked done, but the listing is still active on viagogo.` });
    }

    return out.sort((a, b) => DIFF_RANK[a.level] - DIFF_RANK[b.level]);
  }

  /* the most serious level in a list of differences, or '' */
  const worstDiff = diffs => (diffs && diffs.length ? diffs[0].level : '');

  /* The last time a field changed in a listing's saved history.
   * -> { from, to, at } | null */
  function lastChange(history, key) {
    const h = Array.isArray(history) ? history : [];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1][key], b = h[i][key];
      if (a !== undefined && b !== undefined && a !== null && b !== null && String(a) !== String(b)) return { from: a, to: b, at: h[i].at };
    }
    return null;
  }

  /* ---------------- My listings, from viagogo's own JSON ------------ *
   * The listings page loads its list from /listings/getListings, page by
   * page, with the seller's cookies only — the same way My Sales uses
   * /sales/getSales. Reading it gives every listing in every status in a few
   * requests, without turning a single page.
   *
   * As captured on 2026-10-08:
   *   GET /listings/getListings?filters=STATUS:ACTIVE|PENDING|DEACTIVATED|EXPIRED
   *       &sort=action_date asc&page=N&pageSize=N&isMLBLinked=false
   *   -> { NumFound, Listing: [{ Id, Status, EventId, EventDescription,
   *        EventDateSimplifiedStr, VenueDescription, City, Country, Section,
   *        Rows, Quantity, QuantityRemain, PricePerTicket{Amount,Currency},
   *        PayoutPerTicket{Amount,Currency}, PriceDetails{TotalProceeds} … }] }
   *   Pages start at 1; a page past the end is empty. The "Sold" choice on
   *   the page sends EXPIRED. Unknown filter values are ignored, not refused —
   *   a typo would quietly return everything. PricePerTicket is the price the
   *   seller set; DisplayPricePerTicket and PricingRecommendation hold
   *   placeholders and are never read.
   *   "Recommended price" is not in it: each card asks
   *   /recommendedListing/isListingRecommended?listingId=<id> on its own
   *   (RecommendedMidPrice). "Listing performance" is in neither — the page
   *   works it out itself — so a listing read here keeps the one its card
   *   showed. ------------------------------------------------------------- */

  const API_STATUSES = 'ACTIVE|PENDING|DEACTIVATED|EXPIRED';

  /* every status, page N; q narrows to one listing number (or an event name) */
  function listingsApiUrl(page, size, q) {
    const filters = `STATUS:${API_STATUSES}` + (q ? `,Q:${String(q).replace(/[,|]/g, ' ').trim()}` : '');
    return `/listings/getListings?filters=${encodeURIComponent(filters)}&sort=${encodeURIComponent('action_date asc')}&page=${page}&pageSize=${size}&isMLBLinked=false`;
  }

  const recommendationUrl = id => `/recommendedListing/isListingRecommended?listingId=${encodeURIComponent(id)}&isRiskManagementEnabled=true`;

  const apiList = json => (json && Array.isArray(json.Listing) ? json.Listing : []);
  const apiTotal = json => {
    const n = Number(json && json.NumFound);
    return Number.isFinite(n) ? n : null;
  };

  /* one item of getListings -> the same shape parseListingCard gives */
  function listingFromApi(x) {
    if (!x) return null;
    const id = String(x.Id === null || x.Id === undefined ? '' : x.Id).replace(/\D/g, '');
    if (id.length < 5) return null;
    const str = (v, n) => String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
    const amount = m => {
      const n = Number(m && typeof m === 'object' ? (m.Amount !== undefined ? m.Amount : m.amount) : m);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const money = x.PricePerTicket || {};
    const currency = /^[A-Z]{3}$/.test(String(money.Currency || '')) ? String(money.Currency)
      : /^[A-Z]{3}$/.test(String((x.PayoutPerTicket || {}).Currency || '')) ? String(x.PayoutPerTicket.Currency) : '';
    const left = x.QuantityRemain !== null && x.QuantityRemain !== undefined ? Number(x.QuantityRemain) : Number(x.Quantity);
    const tickets = Number.isFinite(left) ? Math.max(0, Math.round(left)) : null;
    /* the card's "You'll get" is for the tickets still listed */
    const per = amount(x.PayoutPerTicket);
    const proceeds = amount(x.PriceDetails && x.PriceDetails.TotalProceeds);
    const payout = per !== null && tickets !== null ? Math.round(per * tickets * 100) / 100 : proceeds;
    return {
      id,
      status: str(x.Status, 30),
      title: str(x.EventDescription, 200),
      venue: [x.VenueDescription, x.City, x.Country].map(v => str(v, 80)).filter(v => v && v !== 'null').join(', '),
      when: str(x.EventDateSimplifiedStr || x.EventDateStr, 60),
      currency,
      price: amount(x.PricePerTicket),
      payout,
      tickets,
      section: str(x.Section, 40),
      row: str(x.Rows, 20),
      performance: '',
      recommended: null,
      vgEventId: String(x.EventId === null || x.EventId === undefined ? '' : x.EventId).replace(/\D/g, '')
    };
  }

  /* isListingRecommended -> the card's "Recommended price", or null */
  function recommendedFromApi(json) {
    if (!json) return null;
    const n = Number(json.RecommendedMidPrice);
    if (Number.isFinite(n) && n > 0) return n;
    const msg = json.RecommendedPriceMessage && json.RecommendedPriceMessage.Message;
    const m = SK.profit && msg ? SK.profit.parseMoney(String(msg).replace(/^[^$€£\d]*/, '')) : null;
    return m && m.amount > 0 ? m.amount : null;
  }

  SK.viagogo = {
    listingDiffs, worstDiff, lastChange,
    isEventPage, eventIdOf, selectedSectionOf, sectionUrl, readEventInfo, readSections, readRows, rowCount, firstRowSig, showMoreButton, listFooter,
    isListingsPage, isPricePage, readListingCards, parseListingCard, listingStatus, LISTING_STATUSES,
    paginationOf, currentPage, arrowDead, sweepUrl, sweepReady, SWEEP_TABS,
    isConfirmedPage, readListings, parseCard, parseWhen, titleWords,
    listingKey, sectionKey, scoreEvent, pickEvent, sectorFor,
    listingsApiUrl, recommendationUrl, apiList, apiTotal, listingFromApi, recommendedFromApi, API_STATUSES
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

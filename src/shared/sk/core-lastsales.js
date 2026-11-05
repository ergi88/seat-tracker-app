/* ------------------------------------------------------------------
 * Seat Tracker - viagogo's "just sold" toast on the sell pages
 *
 * While you list tickets (sell.viagogo.com/…/Secure/Pipeline/Sell/…)
 * viagogo shows the event's last sale in a toast, bottom right:
 *
 *   "Tickets for Albania vs Finland - Nations League were just purchased!"
 *   "S205 • 3 tickets"   "$82.24"   "Just sold!"
 *
 * It has no time and no ID, so a sale is told apart from the one before
 * only by what it shows: the same section, tickets and price as the last
 * one saved for that event is the same sale seen again (its last_seen
 * moves on); anything else is a new sale. The class names are generated,
 * so the toast is read by its text alone.
 *
 * Pure: used by the sell-page watcher, the service worker, the drawers
 * and (copied by sync-core) the phone app.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const HOST = /(^|\.)viagogo\.com$/i;
  const LOCALE = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i;

  /* every step of listing tickets except the confirmation at the end */
  function isSellPage(loc) {
    if (!loc || !HOST.test(loc.hostname || '')) return false;
    const path = String(loc.pathname || '').replace(LOCALE, '');
    return /^\/secure\/pipeline\/sell\//i.test(path) && !/^\/secure\/pipeline\/sell\/confirmed/i.test(path);
  }

  /* the sell flow's own ID (…/TicketDetails/Quantity?ID=<guid>): the same across reloads */
  const pipelineIdOf = loc => {
    try { return new URLSearchParams((loc && loc.search) || '').get('ID') || ''; } catch (e) { return ''; }
  };

  /* a viagogo event ID somewhere in the URL (?EventId=161613530) */
  function eventIdIn(loc) {
    let p;
    try { p = new URLSearchParams((loc && loc.search) || ''); } catch (e) { return ''; }
    for (const [k, v] of p) if (/^eventid$/i.test(k) && /^\d{5,}$/.test(v)) return v;
    return '';
  }

  /* ---------------- text --------------------------------------------- */

  const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* which viagogo event, by its name: "Albania vs Finland - Nations League" -> "albaniavsfinlandnationsleague".
   * The date is kept on the sale but not in the key: the sell page does not always show it. */
  const vgKeyOf = title => fold(title).replace(/[^a-z0-9]/g, '').slice(0, 120);

  const SOLD = /\bwere just purchased\b|\bwas just purchased\b|\bjust sold\b/i;
  const TITLE = /tickets?\s+for\s+(.+?)\s+(?:were|was)\s+just\s+purchased/i;
  const TICKETS = /^(\d{1,3})\s*(?:e-?)?tickets?$/i;
  const BULLET = /\s*[•·|]\s*/;

  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg']);
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

  /* the smallest pieces of text inside a box, in page order */
  function blocksOf(rootEl) {
    const out = [];
    const visit = el => {
      if (SKIP.has(el.tagName.toLowerCase())) return;
      const kids = [...el.children].filter(c => textOf(c));
      const own = [...el.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim());
      if (!kids.length || own) { const t = textOf(el); if (t) out.push(t); return; }
      kids.forEach(visit);
    };
    visit(rootEl);
    return out;
  }

  const moneyOf = t => (SK.profit && SK.profit.parseMoney ? SK.profit.parseMoney(t) : null);
  /* a line that is a price and nothing else: "$82.24", "€ 1,045.00", "84 Lek" */
  const priceOnly = t => /^[^\d\s]{0,4}\s*\d[\d.,\s]*\s*[^\d\s]{0,5}$/.test(t) && !TICKETS.test(t);

  /* What the toast's lines say -> { title, section, row, tickets, price, currency } | null.
   * lines: the toast's text pieces, in order. */
  function parseToast(lines) {
    const all = lines.join(' ');
    const t = TITLE.exec(all);
    let section = '', row = '', tickets = null, price = null, currency = '';
    for (const line of lines) {
      const parts = line.split(BULLET).map(s => s.trim()).filter(Boolean);
      const q = parts.findIndex(p => TICKETS.test(p));
      if (q < 0 || tickets !== null) continue;
      tickets = Number(TICKETS.exec(parts[q])[1]);
      for (const p of parts.slice(0, q)) {
        const r = /^row\s+(.+)$/i.exec(p);
        if (r) row = r[1];
        else if (!section) section = p.replace(/^(?:section|sector|block)\s*:?\s*/i, '');
      }
    }
    for (const line of lines) {
      if (price !== null || !priceOnly(line)) continue;
      const m = moneyOf(line);
      if (m && m.amount > 0) { price = m.amount; currency = m.currency || ''; }
    }
    if (!t || !section || !(tickets > 0) || price === null) return null;
    return { title: t[1].trim(), section, row, tickets, price, currency };
  }

  /* the toast on the page -> { title, section, row, tickets, price, currency, el } | null */
  function readToast(doc) {
    const body = doc && doc.body;
    if (!body) return null;
    const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || !SOLD.test(n.nodeValue) || p.closest('script, style, noscript, template, [data-sk-panel], [data-sk-line]')) continue;
      /* climb to the smallest box holding the title, the tickets and a price */
      for (let e = p, depth = 0; e && e !== body && depth < 8; e = e.parentElement, depth++) {
        const text = textOf(e);
        if ((text.match(/just purchased/gi) || []).length > 1) break;
        if (!TITLE.test(text) || !/\d\s*tickets?\b/i.test(text)) continue;
        const sale = parseToast(blocksOf(e));
        if (sale) return Object.assign(sale, { el: e });
      }
    }
    return null;
  }

  /* The event's date, from the sell page's own heading: the closest box to
   * the event's name (outside the toast) that also shows a date. */
  function whenNear(doc, title, skip) {
    const body = doc && doc.body;
    const want = vgKeyOf(title);
    const parse = SK.viagogo && SK.viagogo.parseWhen;
    if (!body || !want || !parse) return '';
    const walker = doc.createTreeWalker(body, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || (skip && skip.contains(p)) || p.closest('script, style, noscript, template, [data-sk-panel]')) continue;
      if (vgKeyOf(n.nodeValue) !== want) continue;
      for (let e = p, depth = 0; e && e !== body && depth < 5; e = e.parentElement, depth++) {
        if (skip && e.contains(skip)) break;
        const text = textOf(e);
        if (text.length > 400) break;
        if (parse(text).day) {
          const line = blocksOf(e).find(b => parse(b).day && vgKeyOf(b) !== want);
          return line || '';
        }
      }
    }
    return '';
  }

  /* a link to the event on the page: …/E-161613530 */
  function eventIdOnPage(doc) {
    for (const a of (doc && doc.querySelectorAll ? doc.querySelectorAll('a[href*="/E-"]') : [])) {
      const m = /\/E-(\d{5,})(?:[/?#]|$)/.exec(a.getAttribute('href') || '');
      if (m) return m[1];
    }
    return '';
  }

  /* viagogo's "you look like a bot" page: stop everything when it shows */
  const BLOCKED = /access (?:temporarily )?(?:restricted|denied)|automated \(bot\) activity|unusual (?:traffic|activity)|verify (?:that )?you are (?:a )?human|are you a robot|press (?:&|and) hold/i;
  function isBlockPage(doc) {
    if (!doc) return false;
    const t = `${doc.title || ''} ${doc.body ? String(doc.body.innerText || doc.body.textContent || '').slice(0, 4000) : ''}`;
    return BLOCKED.test(t);
  }

  /* ---------------- one sale ---------------------------------------- */

  const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  /* what a page sends, cleaned -> sale | null */
  function clean(x) {
    if (!x) return null;
    const title = String(x.title || '').trim().slice(0, 200);
    const section = String(x.section || '').trim().slice(0, 40);
    const tickets = num(x.tickets);
    const price = num(x.price);
    if (!title || !section || !(tickets > 0 && tickets < 1000) || !(price > 0)) return null;
    const cur = String(x.currency || '').toUpperCase();
    return {
      vgKey: vgKeyOf(title), title, section, row: String(x.row || '').trim().slice(0, 20),
      tickets: Math.round(tickets), price: Math.round(price * 100) / 100,
      currency: /^[A-Z]{3}$/.test(cur) ? cur : '',
      when: String(x.when || '').trim().slice(0, 80),
      vgEventId: /^\d{5,}$/.test(String(x.vgEventId || '')) ? String(x.vgEventId) : ''
    };
  }

  /* what makes two sightings the same sale */
  const fingerprint = s => [s.vgKey || vgKeyOf(s.title), fold(s.section).replace(/[^a-z0-9]/g, ''), fold(s.row).replace(/[^a-z0-9]/g, ''),
    Number(s.tickets) || 0, (Number(s.price) || 0).toFixed(2), s.currency || ''].join('|');

  /* The newest sale saved for the same event, and whether `sale` is it.
   * -> { latest, same } */
  function compare(saved, sale) {
    const key = sale.vgKey || vgKeyOf(sale.title);
    const latest = (saved || []).filter(s => (s.vgKey || vgKeyOf(s.title)) === key)
      .sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0))[0] || null;
    return { latest, same: !!latest && fingerprint(latest) === fingerprint(sale) };
  }

  /* Is this sale one of `ev`'s? ev: { vgEventId?, eventKey?, title?, when? }.
   * The viagogo event ID first, then the tracked event, then the name (and the
   * date, when both show one). */
  function sameEvent(sale, ev) {
    if (!sale || !ev) return false;
    if (sale.vgEventId && ev.vgEventId) return sale.vgEventId === String(ev.vgEventId);
    if (ev.eventKey && sale.eventKey) return sale.eventKey === ev.eventKey;
    if (!ev.title || (sale.vgKey || vgKeyOf(sale.title)) !== vgKeyOf(ev.title)) return false;
    const parse = SK.viagogo && SK.viagogo.parseWhen;
    if (!parse || !sale.when || !ev.when) return true;
    const a = parse(sale.when), b = parse(ev.when);
    return !(a.day && b.day) || (a.day === b.day && a.month === b.month);
  }

  /* an event's sales, newest first */
  const forEvent = (list, ev) => (list || []).filter(s => sameEvent(s, ev)).sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0));

  /* ---------------- refreshing the page ------------------------------ */

  /* minutes between reloads a person can pick; 0 is off */
  const EVERY = [5, 10, 15, 30, 60];
  const DEFAULT_EVERY = 15;
  /* never two reloads of viagogo pages (any tab) closer than this */
  const MIN_GAP_MS = 90 * 1000;
  /* after a block page, nothing reloads for this long */
  const BLOCK_PAUSE_MS = 6 * 3600 * 1000;

  /* the next wait: `minutes` ± 20 %, so reloads never fall on a beat */
  function nextDelay(minutes, rand) {
    const r = typeof rand === 'number' ? rand : Math.random();
    const base = Math.max(EVERY[0], Number(minutes) || DEFAULT_EVERY) * 60000;
    return Math.round(base * (0.8 + 0.4 * r));
  }

  /* ---------------- every event's sell page ------------------------ */

  /* viagogo's own Sell button: it starts a selling session for the event and
   * sends you on to …/Sell/TicketDetails/Quantity?ID=<session> */
  function sellUrl(vgEventId) {
    const id = String(vgEventId || '').replace(/\D/g, '');
    return id.length >= 5 ? `https://www.viagogo.com/ww/Secure/Pipeline/Sell/Initialise?EventID=${id}` : '';
  }

  /* viagogo's sign-in page, where a sell page sends a browser that is signed out */
  function isLoginPage(loc) {
    if (!loc || !HOST.test(loc.hostname || '')) return false;
    return /(^|\/)(login|signin|sign-in|logon)(\/|$|\?)/i.test(String(loc.pathname || '').replace(LOCALE, '') + '/');
  }

  /* An event date with no year ("Sat, 18 Oct · 20:45") is past when it fell
   * 2 to 200 days ago this year: an older one is next year's. Unreadable = not past. */
  function isPastWhen(when, now) {
    const parse = SK.viagogo && SK.viagogo.parseWhen;
    if (!parse || !when) return false;
    const d = parse(when);
    if (!d.day || !d.month) return false;
    const at = new Date(now || Date.now());
    const day = new Date(at.getFullYear(), d.month - 1, d.day).getTime();
    const ago = (at.getTime() - day) / 86400000;
    return ago >= 2 && ago <= 200;
  }

  /* The viagogo events the last-sales scan visits: every one the team has a
   * listing on, or saved a last sale for, seen in the last `days` days, and
   * not already over.
   * src: { listings, teamPrices, lastSales } (arrays) -> [{ vgEventId, title, when, eventKey }] */
  function scanTargets(src, now, days) {
    const t = now || Date.now();
    const since = t - (days || 14) * 86400000;
    const out = new Map();
    const add = (id, title, when, eventKey, at) => {
      const key = String(id || '').replace(/\D/g, '');
      if (key.length < 5 || !(at >= since)) return;
      const had = out.get(key) || { vgEventId: key, title: '', when: '', eventKey: null };
      out.set(key, {
        vgEventId: key, title: had.title || title || '', when: had.when || when || '', eventKey: had.eventKey || eventKey || null
      });
    };
    for (const l of (src && src.listings) || []) add(l.vgEventId, l.title, l.when, l.eventKey, l.seenAt);
    for (const l of (src && src.teamPrices) || []) add(l.vgEventId, l.title, l.when, l.eventKey, l.seenAt);
    for (const s of (src && src.lastSales) || []) add(s.vgEventId, s.title, s.when, s.eventKey, s.lastSeen);
    return [...out.values()].filter(x => !isPastWhen(x.when, t));
  }

  /* The event to visit next: not visited for `everyMs`, not set aside, the
   * longest-waiting first. history: { <vgEventId>: { at, skipUntil } } */
  function nextTarget(targets, history, everyMs, now) {
    const t = now || Date.now();
    const h = history || {};
    return (targets || [])
      .filter(x => { const y = h[x.vgEventId] || {}; return !(y.skipUntil > t) && t - (y.at || 0) >= everyMs; })
      .sort((a, b) => ((h[a.vgEventId] || {}).at || 0) - ((h[b.vgEventId] || {}).at || 0))[0] || null;
  }

  /* between two sell pages of the scan: 3 to 4 minutes */
  const SCAN_GAP_MS = [180 * 1000, 240 * 1000];
  const scanGap = rand => Math.round(SCAN_GAP_MS[0] + (SCAN_GAP_MS[1] - SCAN_GAP_MS[0]) * (typeof rand === 'number' ? rand : Math.random()));
  /* no event is visited more often than this, whatever the setting says */
  const SCAN_MIN_EVERY = 30;

  SK.lastSales = {
    isSellPage, pipelineIdOf, eventIdIn, eventIdOnPage, vgKeyOf, parseToast, readToast, whenNear, isBlockPage,
    clean, fingerprint, compare, sameEvent, forEvent, nextDelay, EVERY, DEFAULT_EVERY, MIN_GAP_MS, BLOCK_PAUSE_MS,
    sellUrl, isLoginPage, isPastWhen, scanTargets, nextTarget, scanGap, SCAN_GAP_MS, SCAN_MIN_EVERY
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

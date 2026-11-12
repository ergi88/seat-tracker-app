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
 * one saved for that event is the same sale, and is skipped; anything else
 * is a new sale, saved with the time it was first read. The class names
 * are generated, so the toast is read by its text alone.
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
      vgEventId: /^\d{5,}$/.test(String(x.vgEventId || '')) ? String(x.vgEventId) : '',
      /* the listing it sold from: only viagogo's own answer has it, the toast on the page does not */
      listingId: /^\d{4,}$/.test(String(x.listingId || '')) ? String(x.listingId) : ''
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
    /* two listings never make the same sale, whatever else they share */
    const other = !!latest && !!latest.listingId && !!sale.listingId && String(latest.listingId) !== String(sale.listingId);
    return { latest, same: !!latest && !other && fingerprint(latest) === fingerprint(sale) };
  }

  /* The price split over the tickets: the toast's price is taken to be for
   * all of them. -> { total, each } (each = null without a ticket count) */
  function priceSplit(s) {
    const total = Number(s && s.price);
    const n = Number(s && s.tickets);
    if (!(total > 0)) return { total: null, each: null };
    return { total, each: n > 0 ? Math.round((total / n) * 100) / 100 : null };
  }

  /* "$100 | $25/pc"; one ticket is just "$21.75". fmt: (amount, currency) -> text */
  function priceText(s, fmt) {
    const { total, each } = priceSplit(s);
    if (total === null) return '?';
    const cur = (s && s.currency) || 'USD';
    return Number(s.tickets) > 1 && each !== null ? `${fmt(total, cur)} | ${fmt(each, cur)}/pc` : fmt(total, cur);
  }

  /* Sales by the day they were first read (this computer's days), newest
   * day first, each keeping its sales' order.
   * -> [{ day: 'YYYY-MM-DD', at, sales, tickets }] */
  function byDay(list) {
    const out = [];
    const index = new Map();
    for (const s of list || []) {
      const d = new Date(s.firstSeen || 0);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      let g = index.get(key);
      if (!g) { g = { day: key, at: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), sales: [], tickets: 0 }; index.set(key, g); out.push(g); }
      g.sales.push(s);
      g.tickets += Number(s.tickets) || 0;
    }
    return out.sort((a, b) => b.at - a.at);
  }

  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* "Today · 6 Nov", "Yesterday · 5 Nov", "Tue 3 Nov" (a year only when it is not this one) */
  function dayLabel(at, now) {
    const d = new Date(at);
    const t = new Date(now || Date.now());
    const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    const date = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}${d.getFullYear() !== t.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
    return days === 0 ? `Today · ${date}` : days === 1 ? `Yesterday · ${date}` : `${DAY_ABBR[d.getDay()]} ${date}`;
  }

  /* "Today · 6 Nov · 20 tickets · 5 sales" */
  const dayLine = (g, now) => `${dayLabel(g.at, now)} · ${g.tickets} ticket${g.tickets === 1 ? '' : 's'} · ${g.sales.length} sale${g.sales.length === 1 ? '' : 's'}`;

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

  /* The viagogo events the last-sales scan visits, and the ones set aside.
   *   on its own: every event someone in the team has a listing on, seen in
   *               the last `days` days and not over yet ('yours' / 'team');
   *   by hand:    the team's list (team setting lastSaleEvents):
   *               { <vgEventId>: { mode: 'add' | 'off', every, title, when } }
   *               'add' scans an event nobody lists on (research), 'off'
   *               leaves out one that would be scanned on its own, and
   *               `every` gives one event its own interval.
   * src: { listings, teamPrices, watch }, `listings` being your own
   * -> { on: [target], off: [target] }, target = { vgEventId, title, when, eventKey, source, every } */
  function scanPlan(src, now, days) {
    const t = now || Date.now();
    const since = t - (days || 14) * 86400000;
    const watch = (src && src.watch) || {};
    const found = new Map();
    const add = (id, title, when, eventKey, at, source) => {
      const key = String(id || '').replace(/\D/g, '');
      if (key.length < 5 || !(at >= since)) return;
      const had = found.get(key) || { vgEventId: key, title: '', when: '', eventKey: null, source };
      found.set(key, {
        vgEventId: key, title: had.title || title || '', when: had.when || when || '', eventKey: had.eventKey || eventKey || null,
        source: had.source === 'yours' || source === 'yours' ? 'yours' : 'team'
      });
    };
    for (const l of (src && src.listings) || []) add(l.vgEventId, l.title, l.when, l.eventKey, l.seenAt, 'yours');
    for (const l of (src && src.teamPrices) || []) add(l.vgEventId, l.title, l.when, l.eventKey, l.seenAt, 'team');
    for (const [k, x] of found) if (isPastWhen(x.when, t)) found.delete(k);
    for (const [id, w] of Object.entries(watch)) {
      if (!w || w.mode !== 'add' || !/^\d{5,}$/.test(id) || found.has(id)) continue;
      found.set(id, { vgEventId: id, title: w.title || '', when: w.when || '', eventKey: null, source: 'added' });
    }
    const on = [], off = [];
    for (const x of found.values()) {
      const w = watch[x.vgEventId] || {};
      const every = Number(w.every) > 0 ? Math.max(SCAN_MIN_EVERY, Number(w.every)) : null;
      const target = Object.assign(x, { every, title: x.title || w.title || '', when: x.when || w.when || '' });
      (w.mode === 'off' ? off : on).push(target);
    }
    const byTitle = (a, b) => (a.title || a.vgEventId).localeCompare(b.title || b.vgEventId);
    return { on: on.sort(byTitle), off: off.sort(byTitle) };
  }
  const scanTargets = (src, now, days) => scanPlan(src, now, days).on;

  /* The event to visit next: not visited for its interval (its own, else
   * `everyMs`), not set aside, the longest-waiting first.
   * history: { <vgEventId>: { at, skipUntil } } */
  function nextTarget(targets, history, everyMs, now) {
    const t = now || Date.now();
    const h = history || {};
    return (targets || [])
      .filter(x => { const y = h[x.vgEventId] || {}; return !(y.skipUntil > t) && t - (y.at || 0) >= (x.every ? x.every * 60000 : everyMs); })
      .sort((a, b) => ((h[a.vgEventId] || {}).at || 0) - ((h[b.vgEventId] || {}).at || 0))[0] || null;
  }

  /* When each event's next turn should come, as the scan would take them:
   * one request every `gapMs` (the middle of scanGap), starting at `startAt`
   * (the next tick, or the end of a block or pause), and a turn of its own to
   * start a sell session for an event that has none yet.
   * -> { <vgEventId>: time } — a guess, the gaps are random. */
  function scanQueue(targets, history, everyMs, opts) {
    const o = opts || {};
    const list = targets || [];
    const gap = o.gapMs || (SCAN_GAP_MS[0] + SCAN_GAP_MS[1]) / 2;
    const h = {};
    for (const [k, v] of Object.entries(history || {})) h[k] = Object.assign({}, v);
    const has = new Set(o.withSession || []);
    const out = {};
    const intervalOf = y => (y.every ? y.every * 60000 : everyMs);
    let t = Math.max(o.now || Date.now(), o.startAt || 0);
    for (let i = 0; i < list.length * 3 + 5 && Object.keys(out).length < list.length; i++) {
      let x = nextTarget(list, h, everyMs, t);
      if (!x) {
        const dues = list.filter(y => !(y.vgEventId in out)).map(y => {
          const z = h[y.vgEventId] || {};
          return Math.max((z.at || 0) + intervalOf(y), z.skipUntil || 0);
        });
        if (!dues.length) break;
        t = Math.max(t, Math.min(...dues));
        x = nextTarget(list, h, everyMs, t);
        if (!x) break;
      }
      if (!has.has(x.vgEventId)) { has.add(x.vgEventId); t += gap; }
      if (!(x.vgEventId in out)) out[x.vgEventId] = t;
      h[x.vgEventId] = Object.assign({}, h[x.vgEventId], { at: t });
      t += gap;
    }
    return out;
  }

  /* about how many requests an hour the scan makes: one per event per
   * interval, never more than one every SCAN_GAP_MS allows */
  function requestsPerHour(targets, everyMin) {
    const n = (targets || []).reduce((a, x) => a + 60 / Math.max(SCAN_MIN_EVERY, x.every || everyMin || 30), 0);
    return Math.round(Math.min(n, 3600000 / ((SCAN_GAP_MS[0] + SCAN_GAP_MS[1]) / 2)));
  }

  /* a viagogo event number from what someone pastes: a link (…/E-161613530,
   * ?EventID=161613530) or the number itself */
  function eventIdFrom(text) {
    const t = String(text || '').trim();
    const m = /\/E-(\d{5,})/i.exec(t) || /[?&]EventID=(\d{5,})/i.exec(t) || /^(\d{5,})$/.exec(t);
    return m ? m[1] : '';
  }

  /* what the scan's last answer for an event was, in words */
  const RESULT_TEXT = {
    sale: 'saved a new sale', same: 'the same sale as before', none: 'no sale to show',
    session: 'started a sell session for it', renew: 'its sell session had expired',
    'no-sell': 'viagogo has no sell page for it (over?)', error: 'no answer', 'signed-out': 'viagogo was signed out',
    blocked: 'viagogo refused (bot check)', recent: 'asked a moment ago already'
  };
  /* who asked last */
  const BY_TEXT = { scan: 'by the scan', hand: 'by you, with Get last sale now', page: 'by a sell page you opened' };
  const SOURCE_TEXT = { yours: 'you list on it', team: 'the team lists on it', added: 'added by hand' };

  /* the intervals one event can have; null = the team's */
  const EVENT_EVERY = [15, 30, 60, 120, 240];

  /* ---------------- asking viagogo, with no page open ---------------- */

  /* What the sell page itself asks for its toast (found 2026-11-06). It needs
   * a sell session ID: the event number alone gets {}. */
  function recentSoldUrl(sessionId) {
    const id = String(sessionId || '').trim();
    return /^[0-9a-f-]{20,}$/i.test(id) ? `https://sell.viagogo.com/Secure/Pipeline/Sell/GetRecentlySoldListingForEvent?ID=${id}` : '';
  }

  /* Its answer -> { title, section, tickets, price, currency, listingId } | null.
   * {"listingId":14514628268,"quantity":1,"section":"N207","price":"$21.75","eventName":"…"}, or {} for none. */
  function parseRecentSold(json) {
    if (!json || typeof json !== 'object' || !json.listingId) return null;
    const m = typeof json.price === 'number' ? { amount: json.price, currency: '' } : moneyOf(String(json.price || ''));
    const out = {
      title: String(json.eventName || '').trim(), section: String(json.section || '').trim(), row: '',
      tickets: Number(json.quantity), price: m ? m.amount : null, currency: (m && m.currency) || '',
      listingId: String(json.listingId)
    };
    return out.title && out.section && out.tickets > 0 && out.price > 0 ? out : null;
  }

  /* The sell sessions viagogo keeps in the browser (localStorage on
   * sell.viagogo.com, PIPELINE_STATES_REF_STORAGE_KEY):
   * {"161613530":{"pipelineStateId":"50e4a792-…","lastUpdated":1793949954985}, …},
   * maybe wrapped in something. -> { <vgEventId>: { id, at } } */
  const SESSION_KEY = 'PIPELINE_STATES_REF_STORAGE_KEY';
  function sessionsFrom(raw) {
    let data = raw;
    if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch (e) { return {}; } }
    const out = {};
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 4) return;
      for (const [k, v] of Object.entries(o)) {
        if (/^\d{5,}$/.test(k) && v && typeof v === 'object' && /^[0-9a-f-]{20,}$/i.test(String(v.pipelineStateId || ''))) {
          const at = Number(v.lastUpdated) || 0;
          if (!out[k] || out[k].at < at) out[k] = { id: String(v.pipelineStateId), at };
        } else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(data, 0);
    return out;
  }

  /* viagogo's bot wall (DataDome) answering instead of the data */
  const BOT_TEXT = /captcha-delivery|datadome|automated \(bot\) activity|access temporarily restricted/i;
  const isBotAnswer = (status, text) => status === 403 || status === 429 || BOT_TEXT.test(String(text || '').slice(0, 5000));

  /* between two requests of the scan: 45 to 75 seconds */
  const SCAN_GAP_MS = [45 * 1000, 75 * 1000];
  const scanGap = rand => Math.round(SCAN_GAP_MS[0] + (SCAN_GAP_MS[1] - SCAN_GAP_MS[0]) * (typeof rand === 'number' ? rand : Math.random()));
  /* no event is asked about more often than this, whatever the setting says */
  const SCAN_MIN_EVERY = 15;
  /* a sell session older than this is renewed when it answers {} */
  const SESSION_FRESH_MS = 24 * 3600 * 1000;

  SK.lastSales = {
    isSellPage, pipelineIdOf, eventIdIn, eventIdOnPage, vgKeyOf, parseToast, readToast, whenNear, isBlockPage,
    clean, fingerprint, compare, sameEvent, forEvent, priceSplit, priceText, byDay, dayLabel, dayLine, nextDelay, EVERY, DEFAULT_EVERY, MIN_GAP_MS, BLOCK_PAUSE_MS,
    sellUrl, isLoginPage, isPastWhen, scanPlan, scanTargets, nextTarget, scanQueue, requestsPerHour, eventIdFrom, EVENT_EVERY, RESULT_TEXT, SOURCE_TEXT, BY_TEXT, scanGap, SCAN_GAP_MS, SCAN_MIN_EVERY,
    recentSoldUrl, parseRecentSold, sessionsFrom, SESSION_KEY, isBotAnswer, SESSION_FRESH_MS
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

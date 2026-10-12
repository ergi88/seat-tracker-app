/* ------------------------------------------------------------------
 * Seat Tracker - small helpers
 *
 * Loaded by every context (service worker, popup, content scripts, and
 * the Node tests). No chrome.* calls and no DOM. Exposed as SK.util.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  function clampInt(v, dflt, lo, hi) {
    let n = parseInt(String(v == null ? '' : v).trim(), 10);
    if (!Number.isFinite(n)) n = dflt;
    if (lo !== undefined && n < lo) n = lo;
    if (hi !== undefined && n > hi) n = hi;
    return n;
  }

  function boolValue(v, dflt) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (['on', 'yes', 'true', '1'].includes(s)) return true;
    if (['off', 'no', 'false', '0'].includes(s)) return false;
    return dflt;
  }

  /* "TRIBUNA N105", "n 105" and "N105" all squash to "TRIBUNAN105" / "N105" */
  function normKey(s) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function newId(prefix) {
    return (prefix || 'r') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }

  /* how long something has been going on: "45 min", "3 h", "2 d" */
  function since(ts) {
    if (!ts) return 'a while';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'less than a minute';
    if (s < 3600) return `${Math.round(s / 60)} min`;
    if (s < 86400) return `${Math.round(s / 3600)} h`;
    return `${Math.round(s / 86400)} d`;
  }

  function fmtTime(ts) {
    if (!ts) return 'never';
    return new Date(ts).toLocaleString(undefined, {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /* "23:30" -> 1410 minutes after midnight, or null */
  function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /* is `now` inside [from, to)? Handles windows that cross midnight. */
  function inDailyWindow(date, from, to) {
    const f = parseHM(from), t = parseHM(to);
    if (f === null || t === null || f === t) return false;
    const n = date.getHours() * 60 + date.getMinutes();
    return f < t ? (n >= f && n < t) : (n >= f || n < t);
  }

  function dayStamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function decodeHtml(s) {
    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
      euml: 'ë', Euml: 'Ë', ccedil: 'ç', Ccedil: 'Ç' };
    return String(s || '')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, name) => (name in ENT ? ENT[name] : m));
  }

  /* ---------------- ntfy message splitting ------------------------- */

  const NTFY_LIMIT = 3900;   // ntfy turns longer messages into attachments

  function byteLength(s) { return new TextEncoder().encode(s).length; }

  function splitMessage(message, limit) {
    const max = limit || NTFY_LIMIT;
    const text = String(message == null ? '' : message);
    if (byteLength(text) <= max) return [text];
    const parts = [];
    let cur = '';
    for (const rawLine of text.split('\n')) {
      const candidate = cur ? cur + '\n' + rawLine : rawLine;
      if (byteLength(candidate) <= max) { cur = candidate; continue; }
      if (cur) { parts.push(cur); cur = ''; }
      if (byteLength(rawLine) <= max) { cur = rawLine; continue; }
      let chunk = '';
      for (const ch of rawLine) {
        if (byteLength(chunk + ch) > max) { parts.push(chunk); chunk = ''; }
        chunk += ch;
      }
      cur = chunk;
    }
    if (cur) parts.push(cur);
    return parts;
  }

  function titleParts(title, n) {
    if (n <= 1) return [title];
    const out = [];
    for (let i = 1; i <= n; i++) out.push(`${title} (${i}/${n})`);
    return out;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ---------------- viagogo listing ---------------------------------- */

  /* "12345678", or a pasted my.viagogo.com link -> its search value */
  function listingId(v) {
    let s = String(v == null ? '' : v).trim();
    const m = /[?&]search=([^&#]*)/.exec(s);
    if (m && /viagogo\./i.test(s)) {
      try { s = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { s = m[1]; }
    }
    return s.trim();
  }

  function viagogoUrl(listing) {
    const id = listingId(listing);
    return id ? `https://my.viagogo.com/listings/?search=${encodeURIComponent(id)}&activeTab=ACTIVE%7CPENDING%7CDEACTIVATED%7CEXPIRED` : '';
  }

  /* ---------------- event titles ------------------------------------ */

  const MONTH_WORDS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
    june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
    janar: 1, shkurt: 2, mars: 3, prill: 4, maj: 5, qershor: 6, korrik: 7, gusht: 8,
    shtator: 9, tetor: 10, nentor: 11, dhjetor: 12
  };
  const MONTH_RE = Object.keys(MONTH_WORDS).sort((a, b) => b.length - a.length).join('|');
  const DATE_RES = [
    { re: /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/, y: 1, m: 2, d: 3 },                       // 2026-11-27
    { re: /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/, d: 1, m: 2, y: 3 },           // 27.11.2026
    { re: new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(\\d{4}))?`, 'i'), m: 1, d: 2, y: 3 }, // November 12, 2026
    { re: new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${MONTH_RE})\\b\\.?(?:,?\\s+(\\d{4}))?`, 'i'), d: 1, m: 2, y: 3 } // 12 Nov 2026
  ];
  const TIME_RES = [
    /(?<![\d.])(\d{1,2})[:h](\d{2})(?!\d)(?:\s*([ap])\.?m\.?)?/i,                               // 20:45, 8:45 PM, 20h45
    /(?<![\d.])(\d{1,2})\s*([ap])\.?m\b\.?/i                                                     // 9 PM
  ];
  const WEEKDAY_RE = /(?<!\p{L})(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?|(?:e\s+)?(?:h[eë]n[eë]|mart[eë]|m[eë]rkur[eë]|enjte|premte|shtun[eë]|diel))(?!\p{L})\.?/giu;
  const FILLER_RE = /(^|\s)(at|ora|@)(?=\s|$)/gi;
  /* ë and ç folded one character for one, so match positions stay put */
  const foldSame = s => s.replace(/[ëË]/g, 'e').replace(/[çÇ]/g, 'c');
  const pad2 = n => String(n).padStart(2, '0');
  const trimJunk = s => s.replace(/\s+/g, ' ').replace(/^[\s,;:·•|/-]+|[\s,;:·•|/-]+$/g, '').trim();
  /* "AIR ALBANIA STADIUM" -> "Air Albania Stadium"; mixed case is left alone */
  const tidyCaps = s => (/[A-Z]{4}/.test(s) && s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    : s);

  function cut(text, start, len) {
    return text.slice(0, start) + ' ' + text.slice(start + len);
  }

  function readDate(text, now) {
    const t = foldSame(text);
    for (const p of DATE_RES) {
      const m = p.re.exec(t);
      if (!m) continue;
      const month = /\d/.test(m[p.m]) ? +m[p.m] : MONTH_WORDS[m[p.m].toLowerCase()];
      const day = +m[p.d];
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
      let year = m[p.y] ? +m[p.y] : 0;
      if (year && year < 100) year += 2000;
      if (!year) {
        /* no year: the coming one (more than 60 days past is next year's) */
        const n = new Date(now);
        year = n.getFullYear();
        if (new Date(year, month - 1, day).getTime() < now - 60 * 86400000) year++;
      }
      return { iso: `${year}-${pad2(month)}-${pad2(day)}`, rest: cut(text, m.index, m[0].length) };
    }
    return null;
  }

  function readTime(text) {
    for (const re of TIME_RES) {
      const m = re.exec(text);
      if (!m) continue;
      let h = +m[1];
      const mi = m.length > 3 ? +m[2] : 0;
      const ap = String((m.length > 3 ? m[3] : m[2]) || '').toLowerCase();
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      if (h > 23 || mi > 59) continue;
      return { hm: `${pad2(h)}:${pad2(mi)}`, rest: cut(text, m.index, m[0].length) };
    }
    return null;
  }

  /* A site's event title, split into what the lists show. Sites put the day,
   * time and place in the title, each its own way:
   *   eBileta   "Shqiperi - Finlande - November 12, 2026, 8:45 PM - Air Albania Stadium"
   *   Posttick  "Max Amini - 27.11.2026 - 9:30 PM - Pallati i Kongreseve, Tirana"
   *   eFinity   "SENIDAH - SC Cair, 22.10.2026"
   * The parts are cut on " - "; whatever comes before the first part with a
   * date or time is the name, whatever is left after it is the venue.
   * opts: { date, venue, now } - a date or venue the site gave on its own,
   * used when the title has none.
   * -> { name, date: 'YYYY-MM-DD' | '', time: 'HH:MM' | '', venue } */
  function splitEventTitle(title, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const full = String(title || '').replace(/\s+/g, ' ').trim();
    let date = '', time = '';
    const bits = full.split(/(\s+[-–—|]\s+)/);       // part, separator, part...
    const parts = bits.filter((x, i) => i % 2 === 0).map(text => {
      let rest = text, found = false;
      const d = date ? null : readDate(rest, now);
      if (d) { date = d.iso; rest = d.rest; found = true; }
      const t = time ? null : readTime(rest);
      if (t) { time = t.hm; rest = t.rest; found = true; }
      return { text, found, rest: found ? trimJunk(rest.replace(WEEKDAY_RE, ' ').replace(FILLER_RE, ' ')) : text };
    });

    const first = parts.findIndex(p => p.found);
    let name = full, venue = '';
    if (first >= 0) {
      name = bits.slice(0, 2 * first - 1).join('');      // as the site wrote it, dashes and all
      const after = parts.slice(first).map(p => p.rest).filter(Boolean);
      if (!name) name = after.shift() || full;
      venue = after.join(', ');
    }
    if (opts.date && (!date || !time)) {
      const side = splitEventTitle(opts.date, { now });
      date = date || side.date;
      time = time || side.time;
    }
    return { name, date, time, venue: tidyCaps(venue || String(opts.venue || '').trim()) };
  }

  /* What the lists show for an event: the split saved on it when it was
   * created or last loaded, else split now (an event older than the split). */
  function eventInfo(ev) {
    const saved = ev && ev.extra && ev.extra.info;
    if (saved && saved.name) return saved;
    return splitEventTitle(ev && ev.title, { date: ev && ev.date });
  }

  SK.util = {
    splitEventTitle, eventInfo,
    listingId, viagogoUrl,
    clampInt, boolValue, normKey, newId, plural,
    ago, since, fmtTime, fmtClock, parseHM, inDailyWindow, dayStamp,
    esc, decodeHtml, NTFY_LIMIT, byteLength, splitMessage, titleParts, sleep
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

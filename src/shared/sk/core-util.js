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

  SK.util = {
    listingId, viagogoUrl,
    clampInt, boolValue, normKey, newId, plural,
    ago, since, fmtTime, fmtClock, parseHM, inDailyWindow, dayStamp,
    esc, decodeHtml, NTFY_LIMIT, byteLength, splitMessage, titleParts, sleep
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

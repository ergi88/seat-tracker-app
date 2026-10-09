/* ------------------------------------------------------------------
 * Seat Tracker - what the team lists, section by section
 *
 * Pure functions over the team's viagogo prices (every member's sell price
 * per section, never their payout) and the rows read on a viagogo event page.
 *
 * viagogo shows every viewer its own "display" price, so a teammate's row on
 * the page cannot be found by its price. It is found by what does carry over:
 * the section, the row label and how many tickets are left. Teammates whose
 * row cannot be pinned down are then counted against the rows left over, so
 * "only our team is here" still holds when a match was not possible.
 *
 * A price is only as fresh as the last time its owner opened their listings
 * page, so a stale one may name a row but never counts as one.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const ACTIVE = /^(active|pending|live)/i;
  const FRESH_MS = 7 * 24 * 3600 * 1000;      // older than this: a hint, not a count

  /* "Section E105" / " e105 " -> "E105" */
  const norm = s => String(s == null ? '' : s).trim().toUpperCase().replace(/^SECTION\s+/, '');

  /* Teammates' listings in one section of one event, cheapest first.
   * where = { eventKey, section, sectorId? }. Without an event key nothing
   * matches: the same section name exists in every stadium. */
  function teamAt(state, where, now) {
    const w = where || {};
    if (!w.eventKey) return [];
    const at = now || Date.now();
    return ((state && state.teamPrices) || [])
      .filter(t => {
        if (!ACTIVE.test(t.status || 'active')) return false;
        if (t.eventKey !== w.eventKey) return false;
        if (w.sectorId && t.sectorId) return String(t.sectorId) === String(w.sectorId);
        return !!norm(w.section) && norm(t.section) === norm(w.section);
      })
      .map(t => Object.assign({}, t, { stale: !t.seenAt || at - t.seenAt > FRESH_MS }))
      .sort((a, b) => (a.price || 0) - (b.price || 0));
  }

  /* the page says one row, the listing says another: it cannot be theirs */
  function conflicts(row, listing) {
    const a = norm(row.row), b = norm(listing.row);
    return !!a && !!b && a !== b;
  }

  /* how well a scanned row could be this teammate's listing, -1 = not enough.
   * The row label is the strongest sign, then "only N left"; the "1 - N
   * together" range is a hint only, since it is about buying, not stock. */
  function score(row, listing) {
    if (conflicts(row, listing)) return -1;
    let n = 0;
    if (norm(row.row) && norm(listing.row)) n += 3;
    if (listing.tickets) {
      if (row.left === listing.tickets) n += 2;
      else if (row.qtyMax === listing.tickets) n += 1;
    }
    return n >= 2 ? n : -1;
  }

  /* Who is in this section: your rows, teammates' rows, and everyone else.
   * rows = the section's scanned rows, team = teamAt(...)
   * -> { mine, byRow, matched, unmatched, others, teamOnly, assumed, cheapestOutside } */
  function whoIsHere(rows, team) {
    const live = (rows || []).filter(r => !r.sold && r.price > 0);
    const mine = live.filter(r => r.mine);
    const pool = live.filter(r => !r.mine);
    const byRow = {};

    /* every possible pairing, best first, each row and listing used once */
    const pairs = [];
    for (const listing of team || []) {
      for (const row of pool) {
        const n = score(row, listing);
        if (n > 0) pairs.push({ row, listing, n });
      }
    }
    pairs.sort((a, b) => b.n - a.n);
    const usedRows = new Set(), usedListings = new Set();
    for (const p of pairs) {
      if (usedRows.has(p.row.id) || usedListings.has(p.listing.listingId)) continue;
      usedRows.add(p.row.id);
      usedListings.add(p.listing.listingId);
      byRow[p.row.id] = p.listing;
    }

    const unmatched = (team || []).filter(t => !usedListings.has(t.listingId));
    /* A teammate we could not pin down is taken to be one of the rows left
     * over — but only while their price is fresh (a sold-out listing from last
     * week must not make a busy section look like ours), and only where a row
     * could be theirs at all. */
    const rest = pool.filter(r => !usedRows.has(r.id));
    const free = new Set(rest.map(r => r.id));
    let assumed = 0;
    for (const t of unmatched) {
      if (t.stale) continue;
      const maybe = rest.find(r => free.has(r.id) && !conflicts(r, t));
      if (!maybe) continue;
      free.delete(maybe.id);
      assumed++;
    }
    const others = free.size;
    const outside = rest.filter(r => free.has(r.id)).map(r => r.price).sort((a, b) => a - b);
    return {
      mine, byRow, matched: usedRows.size, unmatched, assumed, others,
      teamOnly: others === 0 && mine.length + usedRows.size + assumed > 0,
      cheapestOutside: outside.length ? outside[0] : null
    };
  }

  /* "Ana Krasniqi $22 · Ben $25" — full names, as the team knows each other */
  function priceText(team, money) {
    const fmt = money || (t => `${t.currency || ''}${t.price}`);
    return (team || []).map(t => `${t.owner} ${fmt(t)}${t.stale ? ' (old)' : ''}`).join(' · ');
  }

  SK.team = { ACTIVE, FRESH_MS, norm, teamAt, whoIsHere, score, conflicts, priceText };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

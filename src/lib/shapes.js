/* ------------------------------------------------------------------
 * Database rows -> the shapes the app works with.
 *
 * The same mapping as the extension's bg/remote.js, so a request or a
 * listing looks the same on the phone as in the popup. When the job queue
 * lands (phase 3) this moves to the extension's core/shapes.js and both
 * sides import it from there.
 * ------------------------------------------------------------------ */

export const time = v => (v ? Date.parse(v) : 0);
const numOr = v => (v === null || v === undefined || v === '' ? null : Number(v));
const first = rows => (Array.isArray(rows) ? rows[0] : rows) || null;

export const toEvent = r => ({
  key: r.key, num: r.num, site: r.site, siteId: r.site_id, title: r.title || '', date: r.date || '',
  sectors: r.sectors || [], extra: r.extra || {}, cats: r.cats || {},
  autoMin: r.auto_min === undefined ? null : r.auto_min, createdBy: r.created_by, createdAt: time(r.created_at)
});

export const toRequest = r => ({
  id: r.id, userId: r.user_id, eventKey: r.event_key, num: r.num, sec: r.sec, qty: r.qty,
  cats: (r.cats || []).map(String), client: r.client || '', listing: r.listing || '',
  warn: r.warn, opts: r.opts, together: r.together !== false, done: !!r.done, createdAt: time(r.created_at),
  buyPrice: r.buy_price === null || r.buy_price === undefined ? null : Number(r.buy_price), buyCurrency: r.buy_currency || 'ALL'
});

export const toListing = r => ({
  id: r.listing_id, userId: r.user_id, eventKey: r.event_key || null, sectorId: r.sector_id || null, vgEventId: r.vg_event_id || '',
  title: r.title || '', when: r.event_when || '', section: r.section || '', row: r.row_label || '', status: r.status || '',
  currency: r.currency || '', price: numOr(r.price), payout: numOr(r.payout), tickets: numOr(r.tickets),
  recommended: numOr(r.recommended), performance: r.performance || '', history: r.history || [],
  seenAt: time(r.seen_at), seenBy: r.seen_by || '', venue: r.venue || '',
  track: r.track === 'off' ? 'off' : 'auto',
  lastSweepAt: time(r.last_sweep_at),
  buyPrice: numOr(r.buy_price), buyCurrency: r.buy_currency || 'ALL'
});

export const toSale = r => ({
  id: r.sale_id, userId: r.user_id, eventKey: r.event_key || null, sectorId: r.sector_id || null,
  vgEventId: r.vg_event_id || '', listingId: r.listing_id || null, title: r.title || '', when: r.event_when || '',
  venue: r.venue || '', section: r.section || '', row: r.row_label || '', tickets: numOr(r.tickets),
  currency: r.currency || 'USD', amount: numOr(r.amount), status: r.status || '',
  soldOn: r.sold_on ? String(r.sold_on).slice(0, 10) : '',
  buyPrice: numOr(r.buy_price), buyCurrency: r.buy_currency || 'ALL', seenAt: time(r.seen_at)
});

export const toTeamPrice = r => ({
  id: r.listing_id, userId: r.user_id, eventKey: r.event_key || null, sectorId: r.sector_id || null, section: r.section || '',
  row: r.row_label || '', status: r.status || '', currency: r.currency || '', price: numOr(r.price), tickets: numOr(r.tickets),
  seenAt: time(r.seen_at)
});

export const toState = r => ({
  status: r.status, options: r.options, free: r.free, pendingGone: !!r.pending_gone,
  alertLog: r.alert_log || {}, scanAt: time(r.scan_at), version: r.version
});

export const toScanMeta = r => ({ at: time(r.scanned_at), summary: r.summary || {}, by: r.scanned_by || '' });
export const toLease = r => ({ deviceId: r.device_id, userId: r.user_id, expiresAt: time(r.expires_at) });
export const toDevice = r => ({ id: r.id, userId: r.user_id, name: r.name || '', lastSeen: time(r.last_seen), version: r.version || '' });

export const toAlert = r => ({
  id: Number(r.id), userId: r.user_id, eventKey: r.event_key || null, requestId: r.request_id || null,
  type: r.type, title: r.title || '', message: r.message || '', click: r.click || '', createdAt: time(r.created_at)
});

/* Every table the app mirrors, keyed by its name in sync_status(). Never the
 * full `scans` rows here: they are large and fetched per sector on demand. */
export const SPECS = [
  { name: 'team', table: 'team_settings', select: 'data', replace: (m, rows) => { m.team = (first(rows) || {}).data || {}; } },
  { name: 'profiles', table: 'profiles', ts: 'updated_at', clear: m => { m.profiles = {}; },
    put: (m, r) => { m.profiles[r.user_id] = { displayName: r.display_name || '', settings: r.settings || {}, snoozeUntil: time(r.snooze_until) }; } },
  { name: 'events', table: 'events', ts: 'updated_at', clear: m => { m.events = {}; },
    put: (m, r) => { m.events[r.key] = toEvent(r); } },
  { name: 'requests', table: 'requests', ts: 'updated_at', clear: m => { m.requests = {}; },
    put: (m, r) => { m.requests[r.id] = toRequest(r); } },
  { name: 'state', table: 'request_state', ts: 'updated_at', clear: m => { m.state = {}; },
    put: (m, r) => { m.state[r.request_id] = toState(r); } },
  { name: 'scans', table: 'scans', select: 'event_key,sector_id,summary,scanned_at,scanned_by', ts: 'scanned_at', clear: m => { m.scanMeta = {}; },
    put: (m, r) => { (m.scanMeta[r.event_key] = m.scanMeta[r.event_key] || {})[r.sector_id] = toScanMeta(r); } },
  { name: 'health', table: 'event_health', ts: 'updated_at', clear: m => { m.health = {}; },
    put: (m, r) => { m.health[r.event_key] = r.data || {}; } },
  { name: 'leases', table: 'leases', ts: 'updated_at', clear: m => { m.leases = {}; },
    put: (m, r) => { m.leases[r.name] = toLease(r); } },
  { name: 'listings', table: 'listings', ts: 'updated_at', clear: m => { m.listings = {}; },
    put: (m, r) => { m.listings[r.listing_id] = toListing(r); } },
  { name: 'sales', table: 'sales', ts: 'updated_at', optional: true, clear: m => { m.sales = {}; },
    put: (m, r) => { m.sales[r.sale_id] = toSale(r); } },
  { name: 'teamPrices', table: 'team_prices', ts: 'seen_at', clear: m => { m.teamPrices = {}; },
    put: (m, r) => { m.teamPrices[r.listing_id] = toTeamPrice(r); } },
  { name: 'fx', table: 'fx_rates', ts: 'updated_at', clear: m => { m.fx = {}; },
    put: (m, r) => { m.fx[String(r.day).slice(0, 10)] = r.lek_per || {}; } }
];

export const specOf = name => SPECS.find(s => s.name === name);

export function emptyMirror() {
  return {
    team: {}, profiles: {}, events: {}, requests: {}, state: {}, scanMeta: {}, health: {}, leases: {},
    listings: {}, sales: {}, teamPrices: {}, fx: {}, members: [], devices: [], alerts: [],
    fingerprints: {}, serverOffset: 0, pulledAt: 0
  };
}

/* drop what belongs to events or requests that no longer exist */
export function prune(m) {
  for (const [id, r] of Object.entries(m.requests)) if (!m.events[r.eventKey]) delete m.requests[id];
  for (const id of Object.keys(m.state)) if (!m.requests[id]) delete m.state[id];
  for (const key of Object.keys(m.scanMeta)) if (!m.events[key]) delete m.scanMeta[key];
  for (const key of Object.keys(m.health)) if (!m.events[key]) delete m.health[key];
}

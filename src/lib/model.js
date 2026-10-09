/* ------------------------------------------------------------------
 * What the screens show, worked out from the mirror.
 *
 * The same rules as the extension's buildState() and bg/events.js
 * helpers: a request's status is the shared state written by the last
 * evaluation, unless the app holds a newer scan of that sector; buy
 * price, profit and rates go through core/profit.js. Pure: no network,
 * no DOM.
 * ------------------------------------------------------------------ */
import { SK } from './sk.js';

export const ONLINE_MS = 2 * 60000;
const ACTIVE_LISTING = /^(active|pending|live)/i;

export function settingsFor(m, uid, deviceSettings) {
  const profile = m.profiles[uid] || {};
  return SK.settings.normalize(Object.assign({},
    SK.settings.userPart(profile.settings || {}),
    SK.settings.teamPart(m.team || {}),
    SK.settings.devicePart(deviceSettings || {})));
}

export const sectorOf = (ev, secId) => ((ev && ev.sectors) || []).find(s => String(s.id) === String(secId)) || null;

export function currencyOf(ev) {
  const site = ev && SK.site(ev.site);
  return site && site.currency ? site.currency(ev) : '';
}

export function eventUrlOf(ev) {
  const site = ev && SK.site(ev.site);
  try { return site ? site.eventUrl(ev) : ''; } catch (e) { return ''; }
}

function sectorUrlOf(ev, sector) {
  const site = ev && SK.site(ev.site);
  try { return sector && site && site.sectorUrl ? site.sectorUrl(ev, sector) : null; } catch (e) { return null; }
}

export function codeOf(m, r) {
  const sec = sectorOf(m.events[r.eventKey], r.sec);
  return sec ? sec.code : String(r.sec);
}

export function priceTagOf(m, r) {
  const ev = m.events[r.eventKey];
  const site = ev && SK.site(ev.site);
  return site && site.can.prices ? SK.rules.priceTag(r, ev.cats, currencyOf(ev)) : '';
}

export function autoMinutesOf(ev, team) {
  const dflt = team && team.autoMin !== undefined && team.autoMin !== null ? Number(team.autoMin) : 5;
  const mins = ev && ev.autoMin !== null && ev.autoMin !== undefined ? Number(ev.autoMin) : dflt;
  return mins > 0 ? Math.max(1, mins) : 0;
}

/* scans: full scans this app fetched, { [eventKey]: { [sectorId]: scan } } */
export function evalOf(m, r, scans) {
  const scan = ((scans || {})[r.eventKey] || {})[r.sec];
  const st = m.state[r.id];
  if (scan && (!st || scan.at > (st.scanAt || 0))) {
    const e = SK.rules.evaluate(r, scan);
    return { status: e.status, options: e.options, free: e.view ? e.view.available : null, note: scan.unmapped ? scan.note : '', preview: !st };
  }
  if (st) return { status: st.status, options: st.options, free: st.free, note: '' };
  const meta = (m.scanMeta[r.eventKey] || {})[r.sec];
  const note = meta && meta.summary && meta.summary.unmapped ? meta.summary.note || 'no seat map' : '';
  return { status: SK.rules.STATUS.NONE, options: 0, free: null, note };
}

export function muffled(m, r) {
  const l = r.listing ? m.listings[r.listing] : null;
  return !!l && l.userId === r.userId && l.track === 'off';
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/* parseWhen (core/viagogo.js) knows "14 Nov", "14.11.2026" and
 * "2026-11-14", but not the month first, which is how eBileta writes it in
 * its titles: "Shqiperi - Finlande - November 12, 2026, 8:45 PM - Air
 * Albania Stadium". This adds that, and keeps parseWhen's answer otherwise. */
function readDate(text) {
  const w = SK.viagogo.parseWhen(text);
  if (w.month) return w;
  const m = /(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)/i.exec(text);
  if (!m || +m[2] < 1 || +m[2] > 31) return w;
  return { day: +m[2], month: MONTHS[m[1].toLowerCase()], minutes: w.minutes };
}

/* When an event is, as a time. The date is read the way the viagogo
 * listings page reads it (core/viagogo.js parseWhen: "2026-11-14 20:45",
 * "Sat 14 Nov", "22.10.2026"...), plus month-first dates ("November 12,
 * 2026") and the year when the text has one; without a year, the coming
 * occurrence (one more than 60 days past is next year's).
 * -> ms, or null when the text holds no date */
export function eventTime(text, now = Date.now()) {
  text = String(text || '');
  const w = readDate(text);
  if (!w.month) return null;
  const y = /(?:^|\D)(20\d{2})(?!\d)/.exec(String(text));
  const h = w.minutes === null ? 0 : Math.floor(w.minutes / 60), mi = w.minutes === null ? 0 : w.minutes % 60;
  const at = year => new Date(year, w.month - 1, w.day, h, mi).getTime();
  if (y) return at(+y[1]);
  const t = at(new Date(now).getFullYear());
  return t < now - 60 * 86400000 ? at(new Date(now).getFullYear() + 1) : t;
}

/* Nearest first: what is coming (today included), soonest first; then
 * what is over, most recent first; then whatever has no date. */
export function byNearest(now = Date.now()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const rank = t => (t === null || t === undefined ? 2 : t >= start ? 0 : 1);
  return (a, b) => {
    const ra = rank(a.time), rb = rank(b.time);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.time - b.time;
    if (ra === 1) return b.time - a.time;
    return 0;
  };
}

/* OK / LOW / SPLIT / SHORT / NOT SCANNED -> the class the UI colours by */
export function tone(status) {
  if (status === 'OK') return 'ok';
  if (status === 'LOW') return 'low';
  if (status === 'SPLIT' || status === 'SHORT') return 'bad';
  return 'none';
}

function ratesAt(m, at) {
  return SK.profit.pickRates(m.fx, SK.settings.normalize(m.team || {}).fxOverride, at);
}

function buyOf(m, r, ev, sectorId, listing) {
  if (!ev) return null;
  const summary = ((m.scanMeta[ev.key] || {})[String(sectorId)] || {}).summary;
  return SK.profit.buyPriceOf({ site: ev.site, request: r || {}, listing: listing || {}, event: ev, sector: sectorOf(ev, sectorId), summary });
}

function moneyOf(m, listing, buy) {
  const at = ratesAt(m, listing.seenAt);
  return Object.assign(SK.profit.profitOf(listing, buy, at.rates), {
    rateDay: at.day, manualRates: at.manual,
    listing: {
      id: listing.id, price: listing.price, payout: listing.payout, tickets: listing.tickets, currency: listing.currency,
      recommended: listing.recommended, status: listing.status, performance: listing.performance, seenAt: listing.seenAt
    }
  });
}

function listingState(l, request, event) {
  if (l.track === 'off') return 'ignored';
  if (request && !request.done) return 'tracked';
  if (request) return 'done';
  return event ? 'linkable' : 'untracked';
}

/* -> everything the screens need, for the signed-in person `me` */
export function buildView(m, me, opts = {}) {
  const now = opts.now || Date.now();
  const scans = opts.scans || {};
  const hidden = opts.hidden || {};                   // request ids waiting for their delete (undo window)
  const settings = settingsFor(m, me, opts.deviceSettings);
  const archived = new Set(settings.archivedEvents);
  const ownerName = uid => (m.profiles[uid] || {}).displayName || 'someone';
  const allRequests = Object.values(m.requests).filter(r => !hidden[r.id]);

  /* When each event is. Sites rarely fill `date` (eBileta and Posttick put
   * it in the title, eFinity nowhere), so: the date and title together, as
   * the extension's viagogo matching reads them; else the date viagogo gives
   * on a listing or sale of yours linked to the event. */
  const timeOf = {};
  for (const x of [...Object.values(m.listings), ...Object.values(m.sales || {})]) {
    if (!x.eventKey || x.userId !== me || timeOf[x.eventKey]) continue;
    const t = eventTime(x.when, now);
    if (t !== null) timeOf[x.eventKey] = t;
  }
  for (const ev of Object.values(m.events)) {
    const t = eventTime(`${ev.date || ''} ${ev.title || ''}`, now);
    if (t !== null) timeOf[ev.key] = t;
  }
  const evTime = key => (timeOf[key] === undefined ? null : timeOf[key]);

  const teamPricesAt = (eventKey, sectorId) => Object.values(m.teamPrices)
    .filter(t => t.userId !== me && t.eventKey === eventKey && String(t.sectorId) === String(sectorId) && ACTIVE_LISTING.test(t.status || 'active'))
    .map(t => ({ owner: ownerName(t.userId), price: t.price, currency: t.currency, tickets: t.tickets, seenAt: t.seenAt }));

  const requests = allRequests.filter(r => r.userId === me).map(r => {
    const ev = m.events[r.eventKey];
    const e = evalOf(m, r, scans);
    const sector = sectorOf(ev, r.sec);
    const listing = r.listing ? m.listings[r.listing] : null;
    const buy = buyOf(m, r, ev, r.sec, listing);
    return Object.assign({}, r, {
      buy,
      profit: listing ? moneyOf(m, listing, buy) : null,
      teamPrices: teamPricesAt(r.eventKey, r.sec),
      code: codeOf(m, r),
      sectorName: sector ? sector.name : String(r.sec),
      priceTag: priceTagOf(m, r),
      status: e.status, options: e.options, free: e.free, scanNote: e.note, preview: !!e.preview,
      tone: tone(e.status),
      scannedAt: ((m.scanMeta[r.eventKey] || {})[r.sec] || {}).at || 0,
      pendingGone: !!(m.state[r.id] || {}).pendingGone,
      muffled: muffled(m, r),
      eventNum: ev ? ev.num : 0,
      eventTitle: ev ? ev.title || ev.key : r.eventKey,
      time: ev ? evTime(ev.key) : null,
      listingUrl: r.listing ? SK.util.viagogoUrl(r.listing) : '',
      sectorUrl: sectorUrlOf(ev, sector)
    });
  }).sort((a, b) => byNearest(now)(a, b) || a.eventNum - b.eventNum
    || (SK.rules.RANK[b.status] || 0) - (SK.rules.RANK[a.status] || 0) || a.num - b.num);

  const devices = m.devices.map(d => ({
    id: d.id, name: d.name || 'unnamed PC', owner: ownerName(d.userId), lastSeen: d.lastSeen,
    online: now - d.lastSeen < ONLINE_MS
  })).sort((a, b) => b.lastSeen - a.lastSeen);
  const deviceName = id => ((devices.find(d => d.id === id) || {}).name) || 'another PC';

  const events = Object.values(m.events).map(ev => {
    const site = SK.site(ev.site);
    const all = allRequests.filter(r => r.eventKey === ev.key);
    const mine = requests.filter(r => r.eventKey === ev.key);
    const metas = Object.values(m.scanMeta[ev.key] || {});
    const newest = metas.reduce((a, b) => (!a || b.at > a.at ? b : a), null);
    const lease = m.leases['scan:' + ev.key];
    const wanted = {};
    for (const r of all) if (!r.done) wanted[r.sec] = (wanted[r.sec] || 0) + Number(r.qty || 0);
    return {
      key: ev.key, num: ev.num || 0, site: ev.site, siteLabel: site ? site.label : ev.site,
      siteId: ev.siteId, title: ev.title || ev.key, date: ev.date || '', time: evTime(ev.key), url: eventUrlOf(ev),
      archived: archived.has(ev.key), currency: currencyOf(ev), cats: ev.cats || {},
      canPrices: !!(site && site.can.prices),
      autoEvery: autoMinutesOf(ev, m.team),
      sectors: (ev.sectors || []).map(sec => {
        const meta = (m.scanMeta[ev.key] || {})[sec.id];
        return {
          id: String(sec.id), code: sec.code, name: sec.name, meta: sec.meta || {},
          url: sectorUrlOf(ev, sec),
          summary: meta ? Object.assign({}, meta.summary, { at: meta.at }) : null,
          wanted: wanted[String(sec.id)] || 0
        };
      }),
      open: mine.filter(r => !r.done).length,
      total: mine.length,
      teamOpen: all.filter(r => !r.done).length,
      otherOwners: [...new Set(all.filter(r => !r.done && r.userId !== me).map(r => ownerName(r.userId)))],
      worst: SK.rules.worst(mine.filter(r => !r.done).map(r => r.status)),
      lastScanAt: newest ? newest.at : 0,
      lastScanBy: newest ? newest.by : '',
      scanner: lease && lease.expiresAt > now ? deviceName(lease.deviceId) : '',
      health: m.health[ev.key] || null
    };
  }).sort((a, b) => byNearest(now)(a, b) || a.num - b.num);
  for (const ev of events) ev.tone = tone(ev.worst);

  const listings = Object.values(m.listings).filter(l => l.userId === me).map(l => {
    const r = allRequests.find(x => x.userId === me && x.listing === l.id) || null;
    const ev = m.events[r ? r.eventKey : l.eventKey] || null;
    const sectorId = r ? r.sec : l.sectorId;
    const buy = Number(l.buyPrice) > 0
      ? SK.profit.buyPriceOf({ listing: l })
      : (ev && sectorId ? buyOf(m, r, ev, sectorId, l) : null);
    const req = r ? requests.find(x => x.id === r.id) : null;
    return {
      id: l.id, title: l.title, when: l.when, section: l.section, row: l.row, status: l.status,
      sectorId: sectorId || null, requestId: r ? r.id : null, num: r ? r.num : null, done: r ? r.done : false,
      code: r ? codeOf(m, r) : ((sectorOf(ev, sectorId) || {}).code || l.section),
      reqStatus: req ? req.status : null,
      eventKey: ev ? ev.key : null, eventNum: ev ? ev.num : null, eventTitle: ev ? ev.title : '',
      time: ev ? evTime(ev.key) ?? eventTime(l.when, now) : eventTime(l.when, now),
      track: l.track, seenAt: l.seenAt, venue: l.venue,
      currency: l.currency, price: l.price, tickets: l.tickets, payout: l.payout, recommended: l.recommended,
      buyPrice: l.buyPrice, buyCurrency: l.buyCurrency,
      state: listingState(l, r, ev),
      statusKind: SK.viagogo.listingStatus(l.status),
      url: SK.util.viagogoUrl(l.id),
      buy, money: moneyOf(m, l, buy)
    };
  });

  const sales = Object.values(m.sales || {}).filter(s => s.userId === me).map(s => {
    const l = s.listingId ? m.listings[s.listingId] : null;
    const r = s.listingId ? allRequests.find(x => x.userId === me && x.listing === s.listingId) : null;
    const ev = m.events[r ? r.eventKey : (l && l.eventKey) || s.eventKey] || null;
    const sectorId = r ? r.sec : (l && l.sectorId) || s.sectorId;
    let buy = ev && sectorId ? buyOf(m, r, ev, sectorId, l) : l ? SK.profit.buyPriceOf({ listing: l }) : null;
    if (!buy && Number(s.buyPrice) > 0) buy = { amount: s.buyPrice, currency: s.buyCurrency || 'ALL', source: 'typed on the section' };
    const at = ratesAt(m, Date.parse(s.soldOn) || s.seenAt);
    return Object.assign({}, s, {
      time: ev ? evTime(ev.key) ?? eventTime(s.when, now) : eventTime(s.when, now),
      eventNum: ev ? ev.num : null, eventTitle: ev ? ev.title : '', requestNum: r ? r.num : null,
      buy, money: Object.assign(SK.sales.saleMoney(s, buy, at.rates), { rateDay: at.day })
    });
  }).sort((a, b) => String(b.soldOn).localeCompare(String(a.soldOn)));

  const team = [...new Set(m.members.map(x => x.userId).concat(Object.keys(m.profiles)))]
    .map(uid => ({ userId: uid, name: ownerName(uid), me: uid === me }))
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name));

  /* the toolbar badge's rule: open, not muffled, and LOW / SPLIT / SHORT */
  const open = requests.filter(r => !r.done && !r.muffled);
  const attention = open.filter(r => r.tone === 'low' || r.tone === 'bad');
  const today = ratesAt(m, now);

  return {
    me, settings, events, requests, listings, sales, devices, team,
    open, attention,
    pcsOnline: devices.filter(d => d.online),
    snoozeUntil: (m.profiles[me] || {}).snoozeUntil || 0,
    displayName: ownerName(me),
    alerts: m.alerts || [],
    fx: { day: today.day, rates: today.rates, manual: today.manual },
    pulledAt: m.pulledAt || 0
  };
}

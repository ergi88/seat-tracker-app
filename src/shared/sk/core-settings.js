/* ------------------------------------------------------------------
 * Seat Tracker - settings defaults and validation
 * Exposed as SK.settings. No chrome.*, no DOM.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  /* Every kind of notification. Priorities are ntfy's 1-5. */
  const NOTIFY_TYPES = [
    { key: 'available', title: 'Tickets available now', label: 'Tickets available now', priority: 5, tags: ['tada'], desktop: true, phone: true },
    { key: 'low', title: 'Running low', label: 'Running low', priority: 4, tags: ['warning'], desktop: true, phone: true },
    { key: 'backOk', title: 'Back to OK', label: 'Back to OK (no longer low)', priority: 3, tags: ['white_check_mark'], desktop: true, phone: true },
    { key: 'gone', title: 'No longer fillable', label: 'No longer fillable', priority: 4, tags: ['x'], desktop: true, phone: true },
    { key: 'failing', title: 'Scan failing', label: 'Scan failing', priority: 4, tags: ['rotating_light'], desktop: true, phone: true },
    { key: 'recovered', title: 'Scan working again', label: 'Scan working again', priority: 3, tags: ['white_check_mark'], desktop: true, phone: true },
    { key: 'newEvent', title: 'New event', label: 'New event on a site', priority: 4, tags: ['calendar'], desktop: true, phone: true },
    { key: 'sectorsOpen', title: 'Sectors on sale', label: 'A sector with no seats now has some', priority: 5, tags: ['unlock'], desktop: true, phone: true },
    { key: 'teamNote', title: 'Message from the team', label: 'Message from a teammate', priority: 4, tags: ['speech_balloon'], desktop: true, phone: true },
    { key: 'summary', title: 'Summary', label: 'Summary', priority: 2, tags: ['clipboard'], desktop: false, phone: true }
  ];

  const DEFAULTS = {
    /* appearance */
    theme: 'system',            // system | light | dark
    sidebarMode: 'push',        // push | overlay
    listSort: 'options',        // options | number — how request lists are ordered

    /* on-site panels: master switch, then per site { <pageKey>: bool, badges: bool } */
    panels: { enabled: true, sites: {} },

    /* Letting the extension hold seats on eBileta. Off until you turn it on:
     * until then it only reads the sites, as it always has. This PC only,
     * because it is this PC that would be doing the clicking. */
    selectSeats: false,

    /* Desktop alerts on this PC. A PC starts silent: signing in on a machine
     * should not make it start shouting, least of all a shared one. Turn it on
     * where you are actually sitting.
     *   off     nothing about requests appears here
     *   follow  whatever your account's switches say
     *   custom  this PC's own switches and its own quiet hours
     * Phone pushes are untouched by all of this — a phone is not a PC, and the
     * push goes out once from whichever PC found the change. */
    pcNotify: { mode: 'off', desktop: {}, quiet: { enabled: false, from: '23:00', to: '08:00', allowAvailable: true } },

    /* scanning */
    autoMin: 5,                 // auto-check interval, 0 = off
    together: true,             // default for new requests
    defaultWarn: 2,
    defaultOpts: 3,
    eventCheckMin: 30,          // new-event check for sites with an event list, 0 = off
    /* A full scan of every sector, including the ones nobody has a request in
     * and the ones the site calls sold out. It is how a sector that was empty
     * and is now on sale gets noticed. 0 = off. */
    sweepMin: 30,

    /* notifications */
    notify: {},                 // { <type>: { desktop, phone } }, filled from NOTIFY_TYPES
    quiet: { enabled: false, from: '23:00', to: '08:00', allowAvailable: true },
    cooldownMin: 10,            // same alert for the same request, 0 = off
    repeatWarnMin: 15,          // a warning comes back every N min until Stop, 0 = off
    confirmGone: true,          // "No longer fillable" only after 2 scans agree
    buttons: true,              // action buttons on notifications
    summaryMode: 'off',         // off | every | daily
    summaryTime: '09:00',

    /* phone */
    ntfyServer: 'https://ntfy.sh',
    phoneTopic: '',
    cmdTopic: '',

    /* money (team): lek per unit typed by hand, over the daily rates, e.g. { USD: 83.36 } */
    fxOverride: {}
  };

  function fxOverrideOf(v) {
    const out = {};
    for (const c of ['USD', 'EUR', 'RSD', 'GBP']) {
      const n = Number(v && v[c]);
      if (Number.isFinite(n) && n > 0) out[c] = Math.round(n * 10000) / 10000;
    }
    return out;
  }

  function num(v, dflt, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  function pick(v, allowed, dflt) { return allowed.includes(v) ? v : dflt; }

  function hm(v, dflt) { return SK.util.parseHM(v) === null ? dflt : String(v).trim().padStart(5, '0'); }

  function normalize(raw) {
    const s = Object.assign({}, DEFAULTS, raw || {});
    const out = {
      theme: pick(s.theme, ['system', 'light', 'dark'], 'system'),
      sidebarMode: pick(s.sidebarMode, ['push', 'overlay'], 'push'),
      listSort: pick(s.listSort, ['options', 'number'], 'options'),
      selectSeats: s.selectSeats === true,
      autoMin: num(s.autoMin, 5, 0, 1440),
      together: s.together !== false,
      defaultWarn: num(s.defaultWarn, 2, 0, 9999),
      defaultOpts: num(s.defaultOpts, 3, 0, 9999),
      eventCheckMin: num(s.eventCheckMin, 30, 0, 1440),
      sweepMin: num(s.sweepMin, 30, 0, 1440),
      cooldownMin: num(s.cooldownMin, 10, 0, 1440),
      repeatWarnMin: num(s.repeatWarnMin, 15, 0, 1440),
      confirmGone: s.confirmGone !== false,
      buttons: s.buttons !== false,
      summaryMode: pick(s.summaryMode, ['off', 'every', 'daily'], 'off'),
      summaryTime: hm(s.summaryTime, '09:00'),
      ntfyServer: String(s.ntfyServer || DEFAULTS.ntfyServer).trim().replace(/\/+$/, '') || DEFAULTS.ntfyServer,
      phoneTopic: String(s.phoneTopic || '').trim(),
      cmdTopic: String(s.cmdTopic || '').trim(),
      fxOverride: fxOverrideOf(s.fxOverride)
    };

    const q = Object.assign({}, DEFAULTS.quiet, s.quiet || {});
    out.quiet = {
      enabled: !!q.enabled,
      from: hm(q.from, '23:00'),
      to: hm(q.to, '08:00'),
      allowAvailable: q.allowAvailable !== false
    };

    out.notify = {};
    for (const t of NOTIFY_TYPES) {
      const cur = (s.notify || {})[t.key] || {};
      out.notify[t.key] = {
        desktop: cur.desktop === undefined ? t.desktop : !!cur.desktop,
        phone: cur.phone === undefined ? t.phone : !!cur.phone
      };
    }

    const pc = s.pcNotify || {};
    const pq = Object.assign({}, DEFAULTS.pcNotify.quiet, pc.quiet || {});
    out.pcNotify = {
      mode: pick(pc.mode, ['off', 'follow', 'custom'], 'off'),
      desktop: {},
      quiet: { enabled: !!pq.enabled, from: hm(pq.from, '23:00'), to: hm(pq.to, '08:00'), allowAvailable: pq.allowAvailable !== false }
    };
    for (const t of NOTIFY_TYPES) {
      if (pc.desktop && pc.desktop[t.key] !== undefined) out.pcNotify.desktop[t.key] = !!pc.desktop[t.key];
    }

    out.archivedEvents = Array.isArray(s.archivedEvents) ? s.archivedEvents.map(String) : [];

    const p = s.panels || {};
    out.panels = { enabled: p.enabled !== false, sites: {} };
    for (const site of Object.values(SK.sites || {}).concat(helperPages())) {
      const cur = (p.sites || {})[site.id] || {};
      const row = {};
      for (const page of site.pages) row[page.key] = cur[page.key] !== false;
      if (site.badges) row.badges = cur.badges !== false;
      out.panels.sites[site.id] = row;
    }
    return out;
  }

  function panelOn(settings, siteId, pageKey) {
    const p = settings && settings.panels;
    if (!p || !p.enabled) return false;
    const row = p.sites[siteId];
    return !row || row[pageKey] !== false;
  }

  function badgesOn(settings, siteId) { return panelOn(settings, siteId, 'badges'); }

  /* pages that show the sidebar but are not ticket sites: nothing is scanned there */
  function helperPages() {
    return [{ id: 'viagogo', label: 'viagogo', pages: [{ key: 'confirmed', label: 'listing confirmed page' }, { key: 'listings', label: 'my listings page' }, { key: 'sales', label: 'my sales page' }, { key: 'price', label: 'setting a price (sell)' }, { key: 'event', label: 'event page drawer' }], badges: null }];
  }

  function notifyType(key) { return NOTIFY_TYPES.find(t => t.key === key); }

  /* Does this PC put this alert on its own screen? Asked wherever a desktop
   * notification would be shown — both for one this PC found and one another
   * PC found and synced across — so a PC behaves the same either way.
   * -> { show, why } */
  function showsHere(cfg, type, at) {
    const pc = (cfg && cfg.pcNotify) || DEFAULTS.pcNotify;
    const route = ((cfg && cfg.notify) || {})[type] || {};
    if (pc.mode === 'off') return { show: false, why: 'desktop alerts are off on this PC' };
    if (pc.mode !== 'custom') return { show: !!route.desktop, why: route.desktop ? '' : 'switched off for this kind' };

    const on = pc.desktop[type] === undefined ? !!route.desktop : !!pc.desktop[type];
    if (!on) return { show: false, why: 'switched off on this PC' };
    const q = pc.quiet;
    const quiet = q.enabled && SK.util.inDailyWindow(at || new Date(), q.from, q.to)
      && !(type === 'available' && q.allowAvailable);
    return quiet ? { show: false, why: 'quiet hours on this PC' } : { show: true, why: '' };
  }

  /* Where each setting lives:
   *   team   - shared by everyone (how often events are scanned)
   *   device - this PC only (look and on-site panels)
   *   user   - each person (notifications, topics, defaults for new requests) */
  const TEAM_KEYS = ['autoMin', 'eventCheckMin', 'sweepMin', 'fxOverride'];
  const DEVICE_KEYS = ['theme', 'sidebarMode', 'panels', 'listSort', 'selectSeats', 'pcNotify'];

  function scopeOf(key) {
    if (TEAM_KEYS.includes(key)) return 'team';
    if (DEVICE_KEYS.includes(key)) return 'device';
    return 'user';
  }

  function partOf(raw, scope) {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) if (scopeOf(k) === scope) out[k] = v;
    return out;
  }

  function splitChanges(changes) {
    return { team: partOf(changes, 'team'), device: partOf(changes, 'device'), user: partOf(changes, 'user') };
  }

  SK.settings = {
    NOTIFY_TYPES, DEFAULTS, normalize, panelOn, badgesOn, notifyType, showsHere, helperPages,
    TEAM_KEYS, DEVICE_KEYS, scopeOf, splitChanges,
    teamPart: raw => partOf(raw, 'team'),
    devicePart: raw => partOf(raw, 'device'),
    userPart: raw => partOf(raw, 'user')
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

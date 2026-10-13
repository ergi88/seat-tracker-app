/* ------------------------------------------------------------------
 * Everything the app writes, with the extension's own rules
 * (bg/events.js, background.js saveSettingsFor, bg/alerts.js teamMessage).
 *
 * What the app never writes: scans, leases, event_health, catalog, devices,
 * and request_state rows. The one touch on request_state is the
 * extension's own "reset the baseline" (a DELETE) after you change what a
 * request needs, so your own edit never alerts you. tests/boundary.test.js
 * holds this file to that.
 * ------------------------------------------------------------------ */
import { SK } from './sk.js';
import { supa, must } from './supa.js';
import { store } from './store.svelte.js';
import { toRequest, toListing, toTeamPrice, toAccount, toPurchase, toSectorPrice } from './shapes.js';
import { settingsFor, eventUrlOf } from './model.js';

const U = SK.util;
const REQUEST_FIELDS = ['sec', 'qty', 'cats', 'client', 'listing', 'warn', 'opts', 'together', 'done', 'bought', 'buyPrice', 'buyCurrency'];
/* bought too: switching it either way starts the alerts afresh, so no old reminder carries over */
const CRITERIA = ['sec', 'qty', 'cats', 'warn', 'opts', 'together', 'done', 'bought'];

const me = () => {
  if (!store.user) throw new Error('Sign in first.');
  return store.user.id;
};
const normalizeCats = v => (Array.isArray(v) ? v.map(String).filter(x => x && x !== 'null') : []);
const mySettings = () => settingsFor(store.mirror, me(), store.deviceSettings);

function isPlain(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function deepMerge(base, changes) {
  const out = Object.assign({}, base);
  for (const [k, v] of Object.entries(changes || {})) out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

function ownRequest(id) {
  const r = store.mirror && store.mirror.requests[id];
  if (!r) throw new Error('That request no longer exists.');
  if (r.userId !== me()) throw new Error('That request belongs to someone else.');
  return r;
}

/* ---------------- requests ------------------------------------------ */

export async function addRequest(fields) {
  const userId = me();
  const ev = store.mirror.events[fields.eventKey];
  if (!ev) throw new Error('Pick an event first.');
  const hit = SK.resolveSector(ev.site, fields.sec, ev.sectors);
  if (hit.error) throw new Error(hit.error);
  const cfg = mySettings();
  const row = await must(supa.from('requests').insert([{
    id: U.newId('r'),
    user_id: userId,
    event_key: ev.key,
    sec: String(hit.sector.id),
    qty: U.clampInt(fields.qty, 1, 1, 9999),
    cats: normalizeCats(fields.cats),
    client: String(fields.client || '').trim(),
    listing: U.listingId(fields.listing),
    warn: U.clampInt(fields.warn, cfg.defaultWarn, 0, 9999),
    opts: U.clampInt(fields.opts, cfg.defaultOpts, 0, 9999),
    together: fields.together === undefined || fields.together === null ? cfg.together : !!fields.together,
    done: false
  }]).select().single());
  const req = toRequest(row);
  store.mutate(m => { m.requests[req.id] = req; });
  if (cfg.archivedEvents.includes(ev.key)) await setArchived(ev.key, false);
  /* the team's last scan of that sector gives a status straight away; the
   * shared one comes with the next scan any PC makes */
  store.fetchScans(ev.key, [req.sec]).catch(() => {});
  return req;
}

export async function updateRequest(id, changes) {
  const r = ownRequest(id);
  const clean = {};
  for (const k of REQUEST_FIELDS) {
    if (changes[k] === undefined) continue;
    const v = changes[k];
    if (k === 'sec') {
      const ev = store.mirror.events[r.eventKey];
      const hit = SK.resolveSector(ev.site, v, ev.sectors);
      if (hit.error) throw new Error(hit.error);
      clean.sec = String(hit.sector.id);
    } else if (k === 'qty') clean.qty = U.clampInt(v, r.qty, 1, 9999);
    else if (k === 'warn' || k === 'opts') clean[k] = U.clampInt(v, r[k], 0, 9999);
    else if (k === 'cats') clean.cats = normalizeCats(v);
    else if (k === 'client') clean.client = String(v || '').trim();
    else if (k === 'listing') clean.listing = U.listingId(v);
    else if (k === 'buyPrice') clean.buy_price = v === null || v === '' || !(Number(v) > 0) ? null : Math.round(Number(v) * 100) / 100;
    else if (k === 'buyCurrency') clean.buy_currency = SK.profit.CURRENCIES.includes(v) ? v : 'ALL';
    else clean[k] = !!v;
  }
  if (!Object.keys(clean).length) return r;
  const rebase = CRITERIA.some(k => k in clean && JSON.stringify(clean[k]) !== JSON.stringify(r[k]));

  /* show it now, put it back if the server says no */
  const before = store.mirror.requests[id];
  store.mutate(m => { m.requests[id] = Object.assign({}, before, toRequest(Object.assign(fromRequest(before), clean))); });
  try {
    const row = await must(supa.from('requests').update(clean).eq('id', id).select().maybeSingle());
    if (!row) throw new Error('That request no longer exists.');
    store.mutate(m => { m.requests[id] = toRequest(row); });
    if (rebase) {
      await must(supa.from('request_state').delete().eq('request_id', id));
      store.mutate(m => { delete m.state[id]; });
    }
    if ('sec' in clean || 'cats' in clean || 'qty' in clean) store.fetchScans(r.eventKey, [clean.sec || r.sec]).catch(() => {});
    return toRequest(row);
  } catch (e) {
    store.mutate(m => { m.requests[id] = before; });
    throw e;
  }
}

/* a request back into row form, so an optimistic change goes through toRequest */
function fromRequest(r) {
  return {
    id: r.id, user_id: r.userId, event_key: r.eventKey, num: r.num, sec: r.sec, qty: r.qty, cats: r.cats,
    client: r.client, listing: r.listing, warn: r.warn, opts: r.opts, together: r.together, done: r.done, bought: r.bought,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null, buy_price: r.buyPrice, buy_currency: r.buyCurrency
  };
}

/* The number is retired for good, so a delete cannot be undone on the
 * server. It waits out the undo window here first, and only then goes. */
export function deleteRequestWithUndo(id, label) {
  ownRequest(id);
  store.hidden = Object.assign({}, store.hidden, { [id]: true });
  let undone = false;
  const unhide = () => { const h = Object.assign({}, store.hidden); delete h[id]; store.hidden = h; };
  store.toast(`Deleted ${label}`, {
    action: { label: 'Undo', run: () => { undone = true; unhide(); } }
  });
  setTimeout(async () => {
    if (undone) return;
    try {
      await must(supa.from('requests').delete().eq('id', id));
      store.mutate(m => { delete m.requests[id]; delete m.state[id]; });
    } catch (e) {
      store.toast(`Could not delete: ${e.message}`, { tone: 'bad' });
    }
    unhide();
  }, 5200);
}

/* Inbox alerts, yours only. Hidden at once, deleted for good once the undo
 * window is over, so they are gone on your other phones too. `all` also
 * takes the older ones the app does not keep (it holds the newest 100):
 * everything up to the newest id given. */
export function deleteAlertsWithUndo(ids, label, all = false) {
  const userId = me();
  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return;
  const set = (on) => {
    const h = Object.assign({}, store.hiddenAlerts);
    for (const id of ids) { if (on) h[id] = true; else delete h[id]; }
    store.hiddenAlerts = h;
  };
  set(true);
  let undone = false;
  store.toast(label, { action: { label: 'Undo', run: () => { undone = true; set(false); } } });
  setTimeout(async () => {
    if (undone) return;
    try {
      const top = Math.max(...ids);
      const q = supa.from('alerts').delete().eq('user_id', userId);
      await must(all ? q.lte('id', top) : q.in('id', ids));
      const gone = new Set(ids);
      store.mutate(m => { m.alerts = (m.alerts || []).filter(a => (all ? a.id > top : !gone.has(a.id))); });
    } catch (e) {
      store.toast(`Could not delete: ${e.message}`, { tone: 'bad' });
    }
    set(false);
  }, 5200);
}

export const setDone = (id, done) => updateRequest(id, { done });
export const setBought = (id, bought) => updateRequest(id, { bought });

export async function bumpQty(id, delta) {
  const r = ownRequest(id);
  const qty = Number(r.qty) + delta;
  if (qty < 1) return r;
  return updateRequest(id, { qty });
}

/* ---------------- settings ------------------------------------------ */

export async function saveSettings(changes) {
  const userId = me();
  const parts = SK.settings.splitChanges(changes);
  if (Object.keys(parts.device).length) store.saveDeviceSettings(deepMerge(store.deviceSettings, parts.device));
  if (Object.keys(parts.team).length) {
    const data = deepMerge(store.mirror.team || {}, parts.team);
    const row = await must(supa.from('team_settings').update({ data }).eq('id', 1).select().maybeSingle());
    store.mutate(m => { m.team = (row && row.data) || data; });
  }
  if (Object.keys(parts.user).length) {
    const now = SK.settings.userPart((store.mirror.profiles[userId] || {}).settings || {});
    await patchProfile({ settings: deepMerge(now, parts.user) });
  }
}

async function patchProfile(body) {
  const userId = me();
  const row = await must(supa.from('profiles').update(body).eq('user_id', userId).select().maybeSingle());
  if (!row) throw new Error('Profile not found.');
  store.mutate(m => {
    m.profiles[userId] = { displayName: row.display_name || '', settings: row.settings || {}, snoozeUntil: row.snooze_until ? Date.parse(row.snooze_until) : 0 };
  });
}

export const setDisplayName = name => patchProfile({ display_name: String(name || '').trim() });

/* mute every alert for N minutes; 0 = unmute */
export function setSnooze(minutes) {
  const until = minutes > 0 ? Date.now() + minutes * 60000 : 0;
  return patchProfile({ snooze_until: until ? new Date(until).toISOString() : null });
}

/* archiving hides an event for you only */
export async function setArchived(key, archived) {
  const list = new Set(mySettings().archivedEvents);
  if (archived) list.add(key); else list.delete(key);
  await saveSettings({ archivedEvents: [...list] });
}

/* ---------------- listings ------------------------------------------ */

export async function setListingBuy(id, price, currency) {
  const l = store.mirror.listings[String(id)];
  if (!l) throw new Error('That listing is not saved yet: read your viagogo listings page on a PC first.');
  if (l.userId !== me()) throw new Error('That listing belongs to someone else.');
  const n = Number(price);
  const body = {
    buy_price: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null,
    buy_currency: SK.profit.CURRENCIES.includes(currency) ? currency : 'ALL'
  };
  const row = await must(supa.from('listings').update(body).eq('listing_id', l.id).select().maybeSingle());
  if (row) store.mutate(m => { m.listings[row.listing_id] = toListing(row); m.teamPrices[row.listing_id] = toTeamPrice(row); });
}

/* Your saved copy of one listing, gone: hidden at once, deleted once the
 * undo window is over. viagogo is not touched, so a listing still there
 * (active, pending, deactivated, expired) is saved again by the next read of
 * your listings page on a PC; a sold one stays gone. unlink: the request
 * that carries its ID, which then counts as not listed. */
export function deleteListingWithUndo(id, label, opts = {}) {
  const l = store.mirror.listings[String(id)];
  if (!l) throw new Error('That listing is no longer saved.');
  if (l.userId !== me()) throw new Error('That listing belongs to someone else.');
  const set = on => {
    const h = Object.assign({}, store.hiddenListings);
    if (on) h[l.id] = true; else delete h[l.id];
    store.hiddenListings = h;
  };
  set(true);
  let undone = false;
  store.toast(`Deleted ${label}`, { action: { label: 'Undo', run: () => { undone = true; set(false); } } });
  setTimeout(async () => {
    if (undone) return;
    try {
      if (opts.unlink) await updateRequest(opts.unlink, { listing: '' });
      await must(supa.from('listings').delete().eq('listing_id', l.id).eq('user_id', l.userId));
      store.mutate(m => { delete m.listings[l.id]; delete m.teamPrices[l.id]; });
    } catch (e) {
      store.toast(`Could not delete: ${e.message}`, { tone: 'bad' });
    }
    set(false);
  }, 5200);
}

/* What you changed on viagogo from your phone, saved before a PC reads it:
 * price (a ticket), tickets and status. viagogo stays the truth: the next
 * read of your listings page on a PC writes its own numbers over these.
 * The change goes into the listing's history as a PC read would put it,
 * and "You'll get" is scaled to the new price and tickets until viagogo
 * says the exact amount. -> { before, after } */
export async function editListing(id, fields) {
  const l = store.mirror.listings[String(id)];
  if (!l) throw new Error('That listing is not saved yet: read your viagogo listings page on a PC first.');
  if (l.userId !== me()) throw new Error('That listing belongs to someone else.');
  const price = Number(fields.price);
  if (!(price > 0)) throw new Error('Type a price above 0.');
  const tickets = U.clampInt(fields.tickets, l.tickets ?? 1, 0, 9999);
  const status = String(fields.status || l.status || '').trim();
  const next = { price: Math.round(price * 100) / 100, tickets, status };
  if (next.price === l.price && next.tickets === l.tickets && next.status === l.status) return { before: l, after: l };

  /* the fee as a share of the price stays what it was */
  const sold = (l.price || 0) * (l.tickets || 0);
  const payout = l.payout !== null && sold > 0 ? Math.round(l.payout * (next.price * next.tickets) / sold * 100) / 100 : l.payout;
  const history = (Array.isArray(l.history) ? l.history.slice() : []).concat([{ at: Date.now(), price: next.price, tickets: next.tickets, status: next.status, by: 'app' }]).slice(-30);
  const body = { price: next.price, tickets: next.tickets, status: next.status, payout, history };
  const row = await must(supa.from('listings').update(body).eq('listing_id', l.id).eq('user_id', l.userId).select().maybeSingle());
  if (!row) throw new Error('That listing is no longer saved.');
  const after = toListing(row);
  store.mutate(m => { m.listings[row.listing_id] = after; m.teamPrices[row.listing_id] = toTeamPrice(row); });
  return { before: l, after };
}

/* ---------------- phone (ntfy) -------------------------------------- */

async function publish(cfg, msg) {
  if (!cfg.phoneTopic) return { ok: false, reason: 'no ntfy topic set' };
  const bodies = U.splitMessage(msg.message || '', U.NTFY_LIMIT);
  const titles = U.titleParts(msg.title, bodies.length);
  let ok = true, reason = '';
  for (let i = 0; i < bodies.length; i++) {
    const body = { topic: cfg.phoneTopic, title: titles[i], message: bodies[i], priority: msg.priority || 3 };
    if (msg.tags && msg.tags.length) body.tags = msg.tags;
    if (typeof msg.click === 'string' && /^https?:\/\//i.test(msg.click)) body.click = msg.click;
    try {
      const res = await fetch(cfg.ntfyServer + '/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { ok = false; reason = `ntfy HTTP ${res.status}`; }
    } catch (e) {
      ok = false; reason = String(e.message || e);
    }
    if (i < bodies.length - 1) await U.sleep(300);
  }
  return { ok, reason };
}

export async function testPhone() {
  const cfg = mySettings();
  if (!cfg.phoneTopic) throw new Error('Set your ntfy topic first.');
  const res = await publish(cfg, { title: 'Seat Tracker', message: 'Test from the Seat Tracker app. Phone alerts work.', priority: 3, tags: ['white_check_mark'] });
  if (!res.ok) throw new Error(`The test did not go out: ${res.reason}`);
}

/* A message to teammates: an alert row each (their PCs show it, and the
 * app's inbox lists it) and a push to their ntfy topic, following their
 * own switches, mute and quiet hours, as the extension does. */
export async function messageTeam({ text, to, eventKey, section }) {
  const fromId = me();
  const m = store.mirror;
  const from = (m.profiles[fromId] || {}).displayName || 'A teammate';
  const body = String(text || '').trim().slice(0, 500);
  if (!body) throw new Error('Nothing to send.');
  const everyone = m.members.length ? m.members.map(x => x.userId) : Object.keys(m.profiles);
  const targets = (to && to.length ? to : everyone).filter(uid => uid && uid !== fromId);
  if (!targets.length) throw new Error('There is nobody else on the team to tell.');
  const ev = eventKey ? m.events[eventKey] : null;
  /* as the extension words it: the event's own name, the section in the title, no ids */
  const where = ev ? SK.util.eventInfo(ev).name || ev.title || ev.key : '';
  const message = [where, body].filter(Boolean).join('\n');
  const def = SK.settings.notifyType('teamNote');
  const click = ev ? eventUrlOf(ev) : undefined;
  const sent = [];
  for (const userId of targets) {
    const profile = m.profiles[userId];
    const name = (profile || {}).displayName || 'someone';
    if (!profile) { sent.push({ name, skipped: 'no such user' }); continue; }
    if (profile.snoozeUntil > Date.now()) { sent.push({ name, skipped: 'muted' }); continue; }
    const cfg = settingsFor(m, userId, {});
    const route = cfg.notify.teamNote || {};
    const title = `${from} says${section ? ' · ' + section : ''}`;
    if (route.desktop) {
      await must(supa.from('alerts').insert([{
        user_id: userId, event_key: eventKey || null, request_id: null, type: 'teamNote',
        title, message, click: click || null, data: { buttons: [] }, created_by: 'app'
      }])).catch(() => {});
    }
    const quiet = cfg.quiet.enabled && U.inDailyWindow(new Date(), cfg.quiet.from, cfg.quiet.to);
    let push = { ok: false, reason: 'switched off' };
    if (route.phone && cfg.phoneTopic && !quiet) push = await publish(cfg, { title, message, priority: def.priority, tags: def.tags, click });
    else if (quiet) push = { ok: false, reason: 'quiet hours' };
    sent.push({ name, ok: push.ok, skipped: push.ok ? null : push.reason });
  }
  return sent;
}

/* ---------------- buy tracker ------------------------------------------
 * Your ticket-site accounts and what each bought: yours alone (the database
 * shows them to nobody else). Limits are team settings, as they are the
 * sites' rules: buyLimits per site, eventBuyLimits for one event. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveAccount(fields) {
  const userId = me();
  const email = String(fields.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Type a valid email.');
  const taken = Object.values(store.mirror.accounts || {}).find(a => a.userId === userId && a.email === email && a.id !== fields.id);
  if (taken) throw new Error(`${email} is already saved.`);
  const row = {
    email,
    first_name: String(fields.firstName || '').trim(),
    last_name: String(fields.lastName || '').trim(),
    birthday: DATE.test(fields.birthday || '') ? fields.birthday : null,
    notes: String(fields.notes || '').trim()
  };
  const saved = fields.id
    ? await must(supa.from('buy_accounts').update(row).eq('id', fields.id).select().maybeSingle())
    : await must(supa.from('buy_accounts').insert([Object.assign({ id: U.newId('a'), user_id: userId }, row)]).select().single());
  if (!saved) throw new Error('That account no longer exists.');
  const a = toAccount(saved);
  store.mutate(m => { (m.accounts = m.accounts || {})[a.id] = a; });
  return a;
}

/* its purchases go with it (the database cascades) */
export async function deleteAccount(id) {
  me();
  await must(supa.from('buy_accounts').delete().eq('id', id));
  store.mutate(m => {
    delete (m.accounts || {})[id];
    for (const [pid, p] of Object.entries(m.purchases || {})) if (p.accountId === id) delete m.purchases[pid];
  });
}

/* A purchase linked to a request makes it Bought once its purchases cover
 * its tickets, and gives it the price paid when it has none typed. */
async function followRequest(requestId, purchase) {
  const r = requestId && store.mirror.requests[requestId];
  if (!r || r.userId !== me()) return;
  const got = Object.values(store.mirror.purchases || {}).filter(p => p.requestId === requestId).reduce((n, p) => n + p.qty, 0);
  const changes = {};
  if (got >= Number(r.qty) && !r.bought && !r.done) changes.bought = true;
  if (purchase && Number(purchase.price) > 0 && !(Number(r.buyPrice) > 0)) {
    changes.buyPrice = purchase.price;
    changes.buyCurrency = purchase.currency;
  }
  if (Object.keys(changes).length) await updateRequest(requestId, changes);
}

/* The event's price list: one sector's price, shared with the team. An empty
 * amount takes it off the list (the site's own price shows again). */
export async function setSectorPrice(eventKey, sectorId, amount, currency) {
  me();
  const n = Math.round(Number(amount) * 100) / 100;
  const sid = String(sectorId);
  if (!(n > 0)) {
    await must(supa.from('sector_prices').delete().eq('event_key', eventKey).eq('sector_id', sid));
    store.mutate(m => { delete ((m.sectorPrices || {})[eventKey] || {})[sid]; });
    return null;
  }
  const row = await must(supa.from('sector_prices').upsert([{
    event_key: eventKey, sector_id: sid, amount: n,
    currency: SK.profit.CURRENCIES.includes(currency) ? currency : 'ALL', updated_by: me()
  }]).select().single());
  const price = toSectorPrice(row);
  store.mutate(m => { ((m.sectorPrices = m.sectorPrices || {})[eventKey] = m.sectorPrices[eventKey] || {})[sid] = price; });
  return price;
}

export async function savePurchase(fields) {
  const userId = me();
  const account = (store.mirror.accounts || {})[fields.accountId];
  if (!account || account.userId !== userId) throw new Error('Pick an account.');
  if (!store.mirror.events[fields.eventKey]) throw new Error('That event is no longer tracked.');
  const price = fields.price === '' || fields.price === null || fields.price === undefined || !(Number(fields.price) > 0)
    ? null : Math.round(Number(fields.price) * 100) / 100;
  const row = {
    account_id: account.id,
    event_key: fields.eventKey,
    request_id: fields.requestId || null,
    sector_id: fields.sectorId ? String(fields.sectorId) : null,
    qty: U.clampInt(fields.qty, 1, 1, 999),
    price,
    currency: SK.profit.CURRENCIES.includes(fields.currency) ? fields.currency : 'ALL',
    bought_on: DATE.test(fields.boughtOn || '') ? fields.boughtOn : new Date().toISOString().slice(0, 10),
    order_ref: String(fields.orderRef || '').trim(),
    notes: String(fields.notes || '').trim()
  };
  const before = fields.id ? (store.mirror.purchases || {})[fields.id] : null;
  const saved = fields.id
    ? await must(supa.from('purchases').update(row).eq('id', fields.id).select().maybeSingle())
    : await must(supa.from('purchases').insert([Object.assign({ id: U.newId('p'), user_id: userId }, row)]).select().single());
  if (!saved) throw new Error('That purchase no longer exists.');
  const p = toPurchase(saved);
  store.mutate(m => { (m.purchases = m.purchases || {})[p.id] = p; });
  /* a price paid where the list and the site know none: the list learns it */
  if (p.sectorId && p.price > 0 && !((store.mirror.sectorPrices || {})[p.eventKey] || {})[p.sectorId]) {
    const ev = store.mirror.events[p.eventKey];
    const sec = ev && (ev.sectors || []).find(s => String(s.id) === p.sectorId);
    const summary = ((store.mirror.scanMeta[p.eventKey] || {})[p.sectorId] || {}).summary;
    if (sec && !SK.profit.buyPriceOf({ site: ev.site, event: ev, sector: sec, summary })) {
      await setSectorPrice(p.eventKey, p.sectorId, p.price, p.currency).catch(() => {});
    }
  }
  await followRequest(p.requestId, p);
  if (before && before.requestId && before.requestId !== p.requestId) await followRequest(before.requestId, null);
  return p;
}

export async function deletePurchase(id) {
  me();
  await must(supa.from('purchases').delete().eq('id', id));
  store.mutate(m => { delete (m.purchases || {})[id]; });
}

/* the site's default (null clears it), or one event's own limit (null = back to the site's) */
export const setSiteBuyLimit = (site, n) => saveSettings({ buyLimits: { [site]: Number(n) > 0 ? Number(n) : 0 } });
export const setEventBuyLimit = (eventKey, n) => saveSettings({ eventBuyLimits: { [eventKey]: Number(n) > 0 ? Number(n) : 0 } });

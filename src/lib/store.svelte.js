/* ------------------------------------------------------------------
 * The app's state: who is signed in, the mirror of the team's data (kept
 * in IndexedDB so the app opens instantly and offline), and the sync loop.
 *
 * The mirror is replaced whole on every change ($state.raw), never edited
 * in place, so the screens recompute once per change.
 * ------------------------------------------------------------------ */
import { untrack } from 'svelte';
import { get, set, del } from 'idb-keyval';
import { supa, must } from './supa.js';
import { pull, supaDb } from './sync.js';
import { buildView } from './model.js';

const DEVICE_KEY = 'sk-app-device';
const SYNC_MS = 15000;

function readJson(key, dflt) {
  try { return JSON.parse(localStorage.getItem(key)) || dflt; } catch (e) { return dflt; }
}

class Store {
  ready = $state(false);
  user = $state.raw(null);                 // { id, email }
  mirror = $state.raw(null);
  scans = $state.raw({});                  // full scans fetched on demand: { [eventKey]: { [sectorId]: scan } }
  hidden = $state.raw({});                 // requests waiting out their undo window
  deviceSettings = $state(readJson(DEVICE_KEY, {}));
  sync = $state({ busy: false, at: 0, error: null, notMember: false });
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  toasts = $state([]);
  now = $state(Date.now());                // ticks every 5 s, so "synced 40 s ago" and staleness stay true
  update = $state({ ready: false, checking: false, checkedAt: 0 });
  applyUpdate = null;                      // set by main.js: installs the waiting version and reloads
  swRegistration = null;

  /* the data is stale when the last good sync is older than 3 missed syncs */
  get stale() { return !!this.user && !this.demo && (!this.sync.at || this.now - this.sync.at > 3 * SYNC_MS + 5000); }

  view = $derived(this.user && this.mirror
    ? buildView(this.mirror, this.user.id, { scans: this.scans, hidden: this.hidden, deviceSettings: this.deviceSettings, now: this.sync.at || Date.now() })
    : null);

  /* ---------------- toasts ---------------------------------------- */

  toast(text, opts = {}) {
    const id = Math.random().toString(36).slice(2);
    const t = { id, text, tone: opts.tone || '', action: opts.action || null };
    this.toasts = [...this.toasts.slice(-2), t];
    setTimeout(() => this.dismiss(id), opts.ms || (opts.action ? 5000 : 3200));
    return id;
  }

  dismiss(id) { this.toasts = this.toasts.filter(t => t.id !== id); }

  /* ---------------- the mirror ------------------------------------ */

  /* apply a change to a copy and keep it */
  mutate(fn) {
    if (!this.mirror) return;
    const m = structuredClone(this.mirror);
    fn(m);
    this.mirror = m;
    this.persist();
  }

  persist() {
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      if (this.user && this.mirror) set('mirror:' + this.user.id, $state.snapshot(this.mirror)).catch(() => {});
    }, 300);
  }

  /* untracked: an effect that saves something must not come to depend on
   * everything else saved here, or each save would run it again */
  saveDeviceSettings(changes) {
    untrack(() => {
      const next = Object.assign({}, $state.snapshot(this.deviceSettings), changes);
      this.deviceSettings = next;
      try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
    });
  }

  /* ---------------- session --------------------------------------- */

  async start() {
    /* npm run dev, then /?demo: a made-up team, nothing sent anywhere */
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
      const d = await import('./demo.js');
      this.demo = d;
      this.user = { id: d.ME, email: 'demo@example.com' };
      this.mirror = d.demoMirror();
      this.sync.at = Date.now();
      this.ready = true;
      setInterval(() => { this.now = Date.now(); this.sync.at = Date.now(); }, 5000);
      return;
    }
    const { data } = await supa.auth.getSession();
    if (data.session) await this.useSession(data.session);
    this.ready = true;

    supa.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { this.user = null; this.mirror = null; }
      else if (session && (!this.user || this.user.id !== session.user.id)) this.useSession(session);
    });

    setInterval(() => { this.now = Date.now(); }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.now = Date.now(); this.syncNow(); this.checkForUpdate(true); } });
    addEventListener('online', () => { this.online = true; this.syncNow(); });
    addEventListener('offline', () => { this.online = false; });
    setInterval(() => { if (!document.hidden) this.syncNow(); }, SYNC_MS);
  }

  async useSession(session) {
    this.user = { id: session.user.id, email: session.user.email };
    if (!this.mirror) {
      try { this.mirror = (await get('mirror:' + this.user.id)) || null; } catch (e) { this.mirror = null; }
    }
    await this.syncNow({ full: !this.mirror });
  }

  async signIn(email, password) {
    const data = await must(supa.auth.signInWithPassword({ email: String(email).trim(), password }));
    this.sync.notMember = false;
    await this.useSession(data.session);
    if (this.sync.notMember) { await this.signOut(); throw new Error(this.sync.error); }
    /* the extension makes a profile on first sign-in; so does the app */
    await must(supa.from('profiles').upsert([{ user_id: this.user.id, display_name: String(this.user.email || '').split('@')[0] }],
      { onConflict: 'user_id', ignoreDuplicates: true })).catch(() => {});
  }

  async signOut() {
    const id = this.user && this.user.id;
    await supa.auth.signOut().catch(() => {});
    if (id) await del('mirror:' + id).catch(() => {});
    this.user = null;
    this.mirror = null;
    this.scans = {};
  }

  /* ---------------- sync ------------------------------------------ */

  syncNow(opts = {}) {
    if (!this.user || this.demo) return Promise.resolve();
    if (this._pulling) return this._pulling;
    this.sync.busy = true;
    this._pulling = (async () => {
      try {
        const res = await pull(supaDb(supa, must), this.mirror, this.user.id, opts);
        if (res.changed || !this.mirror) { this.mirror = res.mirror; this.persist(); }
        else this.mirror = Object.assign({}, this.mirror, { devices: res.mirror.devices, pulledAt: res.mirror.pulledAt, serverOffset: res.mirror.serverOffset });
        this.sync.error = null;
        this.sync.at = Date.now();
        for (const a of res.newAlerts.slice(0, 3).reverse()) this.toast(`${a.title}: ${a.message.split('\n')[0]}`, { tone: 'alert', ms: 6000 });
      } catch (e) {
        this.sync.error = e.message;
        if (e.notMember) this.sync.notMember = true;
      } finally {
        this.sync.busy = false;
        this._pulling = null;
      }
    })();
    return this._pulling;
  }

  /* Sync now, from the start: every table again, not only what changed.
   * What pull-to-refresh and "Sync now" do. */
  async syncFull() {
    await this.syncNow({ full: true });
    this.now = Date.now();
    return !this.sync.error;
  }

  /* Is there a newer version of the app? quiet = only say something when there is */
  async checkForUpdate(quiet) {
    const reg = this.swRegistration;
    if (!reg || this.update.checking) return;
    if (quiet && Date.now() - this.update.checkedAt < 30 * 60000) return;
    this.update.checking = true;
    try { await reg.update(); } catch (e) { /* offline: next time */ }
    this.update.checking = false;
    this.update.checkedAt = Date.now();
    /* onNeedRefresh (main.js) flips update.ready when one is waiting */
    if (!quiet && !this.update.ready && !reg.installing && !reg.waiting) this.toast('You have the latest version.');
  }

  /* reload the whole app, installing a waiting version first */
  reloadApp() {
    if (this.update.ready && this.applyUpdate) this.applyUpdate();
    else location.reload();
  }

  /* the full scan of a few sectors, for a status preview or a sector's blocks */
  async fetchScans(eventKey, sectorIds) {
    if (this.demo) {
      const all = this.demo.demoScans()[eventKey] || {};
      const got = Object.fromEntries(Object.entries(all).filter(([k]) => !sectorIds || sectorIds.map(String).includes(k)));
      this.scans = Object.assign({}, this.scans, { [eventKey]: Object.assign({}, this.scans[eventKey], got) });
      return Object.keys(got).length;
    }
    let q = supa.from('scans').select('sector_id,scan,scanned_at').eq('event_key', eventKey);
    if (sectorIds && sectorIds.length) q = q.in('sector_id', sectorIds.map(String));
    const rows = await must(q);
    if (!rows || !rows.length) return 0;
    const scans = Object.assign({}, this.scans);
    scans[eventKey] = Object.assign({}, scans[eventKey]);
    for (const r of rows) scans[eventKey][r.sector_id] = r.scan;
    this.scans = scans;
    return rows.length;
  }
}

export const store = new Store();

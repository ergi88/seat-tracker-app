<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { saveSettings, setDisplayName, testPhone } from '../lib/actions.js';
  import { ago } from '../lib/fmt.js';

  const v = $derived(store.view);
  const s = $derived(v ? v.settings : null);
  const theme = $derived(store.deviceSettings.theme || 'system');

  async function save(changes, ok) {
    try { await saveSettings(changes); if (ok) store.toast(ok); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  async function rename(name) {
    if (!name.trim() || name.trim() === v.displayName) return;
    try { await setDisplayName(name); store.toast('Name saved'); } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  async function test() {
    try { await testPhone(); store.toast('Test sent. Check your phone.'); } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  function route(type, where, on) {
    save({ notify: { [type]: { [where]: on } } });
  }
  async function signOut() {
    await store.signOut();
    location.hash = '#/';
  }
  let syncing = $state(false);
  async function syncNow() {
    syncing = true;
    const ok = await store.syncFull();
    syncing = false;
    store.toast(ok ? 'Up to date' : `Not synced: ${store.sync.error}`, { tone: ok ? '' : 'bad' });
  }
  const builtAt = new Date(__BUILT_AT__);
  const syncedText = $derived.by(() => {
    store.now;
    if (!store.sync.at) return 'not yet';
    const s = Math.max(0, Math.round((store.now - store.sync.at) / 1000));
    return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : ago(store.sync.at);
  });
  const phoneLink = $derived(s && s.phoneTopic ? `${s.ntfyServer}/${encodeURIComponent(s.phoneTopic)}` : '');
</script>

<Page title="Settings" back={() => router.back('#/')} refresh={false}>
  {#if s}
    <h2 class="section-title">You</h2>
    <div class="group pad">
      <label class="field"><span>Display name (what teammates see)</span>
        <input class="input" value={v.displayName} onchange={e => rename(e.currentTarget.value)} /></label>
      <p class="muted small">Signed in as {store.user.email}</p>
    </div>

    <h2 class="section-title">This app</h2>
    <div class="group">
      <div class="row static">
        <span class="grow"><span class="title">Team data</span>
          <span class="sub" class:bad={store.stale || store.sync.error}>{store.sync.error ? 'Not syncing: ' + store.sync.error : 'Synced ' + syncedText}</span></span>
        <button class="btn small" onclick={syncNow} disabled={syncing || !store.online}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
      <div class="row static">
        <span class="grow"><span class="title">Version {__APP_VERSION__}</span>
          <span class="sub">{store.update.ready ? 'A newer version is ready' : 'Built ' + builtAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + builtAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
        {#if store.update.ready}
          <button class="btn small primary" onclick={() => store.reloadApp()}>Update</button>
        {:else}
          <button class="btn small" onclick={() => store.checkForUpdate(false)} disabled={store.update.checking || !store.online}>{store.update.checking ? 'Checking…' : 'Check'}</button>
        {/if}
      </div>
      <div class="row static">
        <span class="grow"><span class="title">Reload the app</span>
          <span class="sub">Starts it again, like refreshing a browser tab</span></span>
        <button class="btn small" onclick={() => store.reloadApp()}>Reload</button>
      </div>
    </div>
    <p class="muted small hint">New team data arrives by itself every 15 seconds while the app is open, and the moment you open it again. Pull down on any list to sync from scratch.</p>

    <h2 class="section-title">Appearance</h2>
    <div class="seg">
      {#each [['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']] as [k, label]}
        <button class:on={theme === k} onclick={() => store.saveDeviceSettings({ theme: k })}>{label}</button>
      {/each}
    </div>

    <h2 class="section-title">Phone alerts (ntfy)</h2>
    <div class="group pad">
      <label class="field"><span>Your ntfy topic</span>
        <input class="input" value={s.phoneTopic} autocapitalize="off" autocomplete="off" spellcheck="false"
          onchange={e => save({ phoneTopic: e.currentTarget.value.trim() }, 'Topic saved')} placeholder="a long, hard-to-guess name" /></label>
      <div class="buttons">
        <button class="btn small" onclick={test} disabled={!s.phoneTopic}>Send a test</button>
        {#if phoneLink}<a class="btn small" href={phoneLink} target="_blank" rel="noopener"><Icon name="external" size={16} /> Open in ntfy</a>{/if}
      </div>
      <p class="muted small">The extension pushes every alert to this topic from whichever PC finds the change, so alerts reach you with this app closed. Install the ntfy app and subscribe to the same topic.</p>
    </div>

    <h2 class="section-title">Which alerts</h2>
    <div class="group">
      <div class="row head"><span class="grow"></span><span class="col">Phone</span><span class="col">PCs</span></div>
      {#each SK.settings.NOTIFY_TYPES as t}
        <div class="row static">
          <span class="grow">{t.label}</span>
          <span class="col"><input type="checkbox" checked={s.notify[t.key].phone} onchange={e => route(t.key, 'phone', e.currentTarget.checked)} aria-label="{t.label} on the phone" /></span>
          <span class="col"><input type="checkbox" checked={s.notify[t.key].desktop} onchange={e => route(t.key, 'desktop', e.currentTarget.checked)} aria-label="{t.label} on PCs" /></span>
        </div>
      {/each}
    </div>

    <h2 class="section-title">Quiet hours (phone)</h2>
    <div class="group pad">
      <label class="switch"><span>Quiet at night</span>
        <input type="checkbox" checked={s.quiet.enabled} onchange={e => save({ quiet: { enabled: e.currentTarget.checked } })} /></label>
      {#if s.quiet.enabled}
        <div class="two">
          <label class="field"><span>From</span><input class="input" type="time" value={s.quiet.from} onchange={e => save({ quiet: { from: e.currentTarget.value } })} /></label>
          <label class="field"><span>To</span><input class="input" type="time" value={s.quiet.to} onchange={e => save({ quiet: { to: e.currentTarget.value } })} /></label>
        </div>
        <label class="switch"><span>Still tell me when tickets become available</span>
          <input type="checkbox" checked={s.quiet.allowAvailable} onchange={e => save({ quiet: { allowAvailable: e.currentTarget.checked } })} /></label>
      {/if}
    </div>

    <h2 class="section-title">New requests</h2>
    <div class="group pad">
      <label class="switch"><span>Side by side by default</span>
        <input type="checkbox" checked={s.together} onchange={e => save({ together: e.currentTarget.checked })} /></label>
      <div class="two">
        <label class="field"><span>Block warn</span><input class="input" type="number" inputmode="numeric" value={s.defaultWarn} onchange={e => save({ defaultWarn: Number(e.currentTarget.value) })} /></label>
        <label class="field"><span>Options warn</span><input class="input" type="number" inputmode="numeric" value={s.defaultOpts} onchange={e => save({ defaultOpts: Number(e.currentTarget.value) })} /></label>
      </div>
    </div>

    <h2 class="section-title">Scanning (whole team)</h2>
    <div class="group pad">
      <label class="field"><span>Auto-check every (minutes, 0 = off)</span>
        <input class="input" type="number" inputmode="numeric" min="0" max="1440" value={s.autoMin}
          onchange={e => save({ autoMin: SK.util.clampInt(e.currentTarget.value, 5, 0, 1440) }, 'Saved for the whole team')} /></label>
      <p class="muted small">Each event can still have its own interval, set on a PC.</p>
    </div>

    <h2 class="section-title">PCs</h2>
    <div class="group">
      {#each v.devices as d (d.id)}
        <div class="row static">
          <span class="dot {d.online ? 'ok' : ''}"></span>
          <span class="grow"><span class="title">{d.name}</span><span class="sub">{d.owner} · {d.online ? 'online' : 'seen ' + ago(d.lastSeen)}</span></span>
        </div>
      {:else}
        <div class="row static muted">No PC has signed in yet.</div>
      {/each}
    </div>

    <button class="btn block danger out" onclick={signOut}>Sign out</button>
    <p class="muted tiny center">Seat Tracker app {__APP_VERSION__} · shared code from extension {SK.config.version}</p>
  {/if}
</Page>

<style>
  .pad { padding: 14px 16px; display: grid; gap: 12px; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; border-radius: 11px; background: var(--softer); }
  .seg button { min-height: 34px; border: 0; border-radius: 9px; background: none; font-weight: 600; font-size: 14px; color: var(--muted); cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  .head { min-height: 36px; font-size: 12px; color: var(--muted); font-weight: 600; }
  .col { width: 52px; text-align: center; flex: none; }
  .col input, .switch input { width: 22px; height: 22px; accent-color: var(--accent); }
  .static { cursor: default; }
  .static:active { background: none; }
  .row .title, .row .sub { display: block; }
  .switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .out { margin-top: 28px; }
  .center { text-align: center; margin-top: 14px; }
  .hint { margin: 8px 4px 0; }
  .sub.bad { color: var(--bad); }
</style>

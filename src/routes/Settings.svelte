<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { saveSettings, setDisplayName, testPhone } from '../lib/actions.js';
  import { ago } from '../lib/fmt.js';
  import { canBadge, installed, permission, askPermission } from '../lib/badge.js';

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
  /* notifications from the app itself, and the icon badge: what this phone allows */
  let perm = $state(permission());
  const autoCount = $derived(v ? v.attention.length : 0);
  const appNotify = $derived(store.deviceSettings.appNotify !== false);
  const PERM_TEXT = {
    granted: 'Notifications allowed',
    denied: 'Notifications blocked',
    default: 'Notifications not asked yet',
    unsupported: 'This browser has no notifications'
  };
  const notifyHint = $derived(
    !installed() ? 'Open the app from its home-screen icon (Share → Add to Home Screen), not from Safari: notifications and the badge only work on an installed app.'
      : perm === 'denied' ? 'Notifications were refused. Turn them on in the iPhone Settings → Notifications → Seat Tracker, then come back.'
        : perm !== 'granted' ? 'Allow notifications to get alerts as notifications and the count on the app icon.'
          : appNotify ? 'New alerts show as notifications while the app is open or just left. With the app closed, ntfy still brings them.'
            : 'New alerts show as a message inside the app. ntfy still brings them with the app closed.');
  async function ask() {
    perm = await askPermission();
    store.toast(PERM_TEXT[perm], { tone: perm === 'granted' ? '' : 'bad' });
  }

  const phoneLink = $derived(s && s.phoneTopic ? `${s.ntfyServer}/${encodeURIComponent(s.phoneTopic)}` : '');

  /* ---------------- section tabs ----------------
   * The strip sticks under the top bar. Scrolling moves the active tab to
   * the section under it; a tap scrolls to that section. */
  const SECTIONS = [
    { key: 'you', label: 'You' }, { key: 'alerts', label: 'Alerts' }, { key: 'buying', label: 'Buying' },
    { key: 'team', label: 'Team' }, { key: 'app', label: 'App' }
  ];
  let strip = $state();
  let active = $state('you');
  let scroller = null;
  let lockUntil = 0;                       // while a tap's smooth scroll runs, the tapped tab stays on

  /* where a section's top sits once the strip has stuck: just under it */
  function line() {
    return scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(strip).top) + strip.offsetHeight;
  }
  function setActive(k) {
    if (active === k) return;
    active = k;
    const b = strip && strip.querySelector(`[data-k="${k}"]`);
    if (b) strip.scrollTo({ left: b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  }
  function spy() {
    if (!scroller || !strip || performance.now() < lockUntil) return;
    const at = line() + 16;
    let cur = SECTIONS[0].key;
    for (const t of SECTIONS) {
      const el = document.getElementById('s-' + t.key);
      if (el && el.getBoundingClientRect().top <= at) cur = t.key;
    }
    /* the last sections may be too short to reach the top: the end of the page is theirs */
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].key;
    setActive(cur);
  }
  function go(k) {
    const el = document.getElementById('s-' + k);
    if (!el || !scroller) return;
    setActive(k);
    lockUntil = performance.now() + 800;
    scroller.scrollTo({ top: scroller.scrollTop + el.getBoundingClientRect().top - line() - 8, behavior: 'smooth' });
  }
  $effect(() => {
    if (!strip || scroller) return;
    scroller = strip.closest('.scroll');
    if (!scroller) return;
    const onScroll = () => spy();
    const onEnd = () => { lockUntil = 0; spy(); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', onEnd);
    return () => { scroller.removeEventListener('scroll', onScroll); scroller.removeEventListener('scrollend', onEnd); scroller = null; };
  });
</script>

<Page title="Settings" back={() => router.back('#/')} refresh={false}>
  {#if s}
    <!-- one tab per section; it follows the scroll, and a tap scrolls to its section -->
    <nav class="tabs" bind:this={strip} aria-label="Settings sections">
      {#each SECTIONS as t (t.key)}
        <button data-k={t.key} class:on={active === t.key} aria-current={active === t.key ? 'true' : undefined} onclick={() => go(t.key)}>{t.label}</button>
      {/each}
    </nav>

    <section class="sec you" id="s-you">
      <header class="sec-head"><span class="sec-icon"><Icon name="user" size={20} /></span><span><h2>You</h2><p>Your name, how the app looks, and defaults for new requests</p></span></header>
      <h3 class="section-title">Profile</h3>
      <div class="group pad">
        <label class="field"><span>Display name (what teammates see)</span>
          <input class="input" value={v.displayName} onchange={e => rename(e.currentTarget.value)} /></label>
        <p class="muted small">Signed in as {store.user.email}</p>
      </div>
      <h3 class="section-title">Appearance</h3>
      <div class="seg">
        {#each [['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']] as [k, label]}
          <button class:on={theme === k} onclick={() => store.saveDeviceSettings({ theme: k })}>{label}</button>
        {/each}
      </div>
      <h3 class="section-title">Requests order</h3>
      <div class="seg two-way">
        {#each [['options', 'Fewest options first'], ['number', 'By number']] as [k, label]}
          <button class:on={s.listSort === k} onclick={() => save({ listSort: k })}>{label}</button>
        {/each}
      </div>
      <h3 class="section-title">New requests</h3>
      <div class="group pad">
        <label class="switch"><span>Side by side by default</span>
          <input type="checkbox" checked={s.together} onchange={e => save({ together: e.currentTarget.checked })} /></label>
        <div class="two">
          <label class="field"><span>Block warn</span><input class="input" type="number" inputmode="numeric" value={s.defaultWarn} onchange={e => save({ defaultWarn: Number(e.currentTarget.value) })} /></label>
          <label class="field"><span>Options warn</span><input class="input" type="number" inputmode="numeric" value={s.defaultOpts} onchange={e => save({ defaultOpts: Number(e.currentTarget.value) })} /></label>
        </div>
      </div>
    </section>

    <section class="sec alerts" id="s-alerts">
      <header class="sec-head"><span class="sec-icon"><Icon name="bell" size={20} /></span><span><h2>Alerts</h2><p>What reaches your phone and this app, and when</p></span></header>
      <h3 class="section-title">Notifications and badge</h3>
      <div class="group">
        <div class="row static">
          <span class="grow"><span class="title">{PERM_TEXT[perm]}</span>
            <span class="sub">{installed() ? 'Opened from the home screen' : 'Opened in the browser'} · {canBadge() ? 'badge supported' : 'no badge here'}</span></span>
          {#if perm === 'default'}
            <button class="btn small primary" onclick={ask}>Ask for permission</button>
          {:else if perm !== 'unsupported'}
            <button class="btn small" onclick={ask}>Ask again</button>
          {/if}
        </div>
        <div class="pad">
          <label class="switch"><span>Show alerts as notifications</span>
            <input type="checkbox" checked={appNotify} disabled={perm !== 'granted'}
              onchange={e => store.saveDeviceSettings({ appNotify: e.currentTarget.checked })} /></label>
        </div>
        <div class="row static">
          <span class="grow"><span class="title">Badge on the app icon</span>
            <span class="sub">{autoCount} request{autoCount === 1 ? '' : 's'} needing you</span></span>
        </div>
      </div>
      <p class="muted small hint">{notifyHint}</p>
      <h3 class="section-title">Phone alerts (ntfy)</h3>
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
      <h3 class="section-title">Which alerts</h3>
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
      <h3 class="section-title">Quiet hours (phone)</h3>
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
    </section>

    <section class="sec buying" id="s-buying">
      <header class="sec-head"><span class="sec-icon"><Icon name="ticket" size={20} /></span><span><h2>Buying</h2><p>Your buying accounts and how many tickets each may buy</p></span></header>
      <h3 class="section-title">Accounts</h3>
      <div class="group">
        <a class="row" href={href.accounts()}>
          <span class="grow"><span class="title">Buying accounts</span>
            <span class="sub">{v.accounts.length ? `${v.accounts.length} saved · only you see them` : 'Save the emails you buy tickets with'}</span></span>
          <Icon name="chev" size={18} />
        </a>
      </div>
      <h3 class="section-title">Tickets per account, by site (whole team)</h3>
      <div class="group pad">
        <div class="limits">
          {#each SK.siteList() as site (site.id)}
            <label class="field"><span>{site.label}</span>
              <input class="input num" type="number" inputmode="numeric" min="0" value={s.buyLimits[site.id] || ''} placeholder="none"
                onchange={e => save({ buyLimits: { [site.id]: Number(e.currentTarget.value) || 0 } }, 'Saved for the whole team')} /></label>
          {/each}
        </div>
        <p class="muted small">The default for every event on that site. An event that differs gets its own on its page, under Buys.</p>
      </div>
    </section>

    <section class="sec team" id="s-team">
      <header class="sec-head"><span class="sec-icon"><Icon name="pc" size={20} /></span><span><h2>Team</h2><p>Shared by everyone: scanning and the PCs that do it</p></span></header>
      <h3 class="section-title">Scanning</h3>
      <div class="group pad">
        <label class="field"><span>Auto-check every (minutes, 0 = off)</span>
          <input class="input" type="number" inputmode="numeric" min="0" max="1440" value={s.autoMin}
            onchange={e => save({ autoMin: SK.util.clampInt(e.currentTarget.value, 5, 0, 1440) }, 'Saved for the whole team')} /></label>
        <p class="muted small">Each event can still have its own interval, set on a PC.</p>
      </div>
      <h3 class="section-title">PCs</h3>
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
    </section>

    <section class="sec app" id="s-app">
      <header class="sec-head"><span class="sec-icon"><Icon name="settings" size={20} /></span><span><h2>App</h2><p>Syncing, updates and signing out</p></span></header>
      <h3 class="section-title">Sync and updates</h3>
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
      <button class="btn block danger out" onclick={signOut}>Sign out</button>
      <p class="muted tiny center">Seat Tracker app {__APP_VERSION__} · shared code from extension {SK.config.version}</p>
    </section>

  {/if}
</Page>

<style>
  .pad { padding: 14px 16px; display: grid; gap: 12px; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; border-radius: 11px; background: var(--softer); }
  .seg button { min-height: 34px; border: 0; border-radius: 9px; background: none; font-weight: 600; font-size: 14px; color: var(--muted); cursor: pointer; }
  .seg.two-way { grid-template-columns: 1fr 1fr; }
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
  /* the tabs: stuck under the top bar while the page scrolls */
  .tabs {
    position: sticky; top: calc(48px + var(--safe-t)); z-index: 4;
    display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
    margin: 14px calc(-16px - var(--safe-r)) 0 calc(-16px - var(--safe-l));
    padding: 8px calc(16px + var(--safe-r)) 10px calc(16px + var(--safe-l));
    background: var(--bar); border-bottom: 1px solid var(--line);
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
  }
  .tabs::-webkit-scrollbar { display: none; }
  a.row { color: inherit; }
  .tabs button {
    flex: none; min-height: 36px; padding: 0 16px; border: 0; border-radius: 99px;
    background: var(--panel); box-shadow: 0 1px 0 var(--line); color: var(--ink);
    font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s, color .2s;
  }
  .tabs button.on { background: var(--ink); color: var(--bg); box-shadow: none; }

  /* each section: its own coloured header, set apart from the next */
  .sec { --tint: var(--accent); --tintbg: var(--accent-soft); padding-top: 26px; scroll-margin-top: 110px; }
  .sec + .sec { margin-top: 18px; border-top: 1px solid var(--line); }
  .sec.alerts { --tint: var(--low); --tintbg: var(--lowbg); }
  .sec.buying { --tint: var(--bought); --tintbg: var(--boughtbg); }
  .sec.team { --tint: var(--ok); --tintbg: var(--okbg); }
  .sec.app { --tint: var(--none); --tintbg: var(--nonebg); }
  .sec-head { display: flex; align-items: center; gap: 12px; margin: 0 2px 4px; }
  .sec-icon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--tintbg); color: var(--tint); }
  .sec-head h2 { margin: 0; font-size: 22px; font-weight: 750; letter-spacing: -.01em; }
  .sec-head p { margin: 1px 0 0; font-size: 13.5px; color: var(--muted); }
  .sec :global(.section-title) { margin-top: 18px; }
  .limits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
</style>

<script>
  /* "● Online | 2" in the top bar of every screen: how many PCs are online,
   * and so whether alerts can go out. Tap for which ones.
   *
   * Phone alerts are sent by whichever PC finds the change, and a PC scans
   * every event of the team, so one online PC (anyone's) is enough. With
   * none online, nothing is scanned and nothing is sent. */
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { store } from '../lib/store.svelte.js';
  import { ago, clock } from '../lib/fmt.js';

  let { compact = false } = $props();
  let open = $state(false);
  let root = $state();

  const v = $derived(store.view);
  const online = $derived(v ? v.pcsOnline : []);
  const offline = $derived(v ? v.devices.filter(d => !d.online) : []);
  /* stale numbers are worse than none: say we can't tell */
  const unknown = $derived(!v || !store.online || !!store.sync.error || store.stale);
  let syncing = $state(false);
  async function syncNow() {
    syncing = true;
    const ok = await store.syncFull();
    syncing = false;
    if (!ok) store.toast(`Not synced: ${store.sync.error}`, { tone: 'bad' });
  }
  const syncedText = $derived.by(() => {
    store.now;                                      // re-read every tick
    if (!store.sync.at) return 'Not synced yet';
    const s = Math.max(0, Math.round((store.now - store.sync.at) / 1000));
    return `This phone synced ${s < 10 ? 'just now' : s < 60 ? s + ' s ago' : ago(store.sync.at)}`;
  });
  const tone = $derived(unknown ? 'unknown' : online.length ? 'on' : 'off');
  const muted = $derived(v && v.snoozeUntil > Date.now());
  const headline = $derived(unknown
    ? (!store.online ? 'You are offline, so this may be out of date'
      : store.stale && !store.sync.error ? 'Not synced for a while, so this may be out of date'
      : 'Not syncing, so this may be out of date')
    : online.length ? `Alerts are going out: ${online.length === 1 ? '1 PC is' : online.length + ' PCs are'} online`
    : 'No PC online: nothing is scanned and no alerts are sent');

  onMount(() => {
    const away = e => { if (open && root && !root.contains(e.target)) open = false; };
    const esc = e => { if (e.key === 'Escape') open = false; };
    document.addEventListener('pointerdown', away, true);
    addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc); };
  });
</script>

<div class="pcs" bind:this={root}>
  <button class="pill-btn {tone}" onclick={() => (open = !open)} aria-expanded={open} aria-haspopup="true"
    aria-label="{unknown ? 'PCs online: unknown' : `${online.length} PC${online.length === 1 ? '' : 's'} online`}">
    <span class="led"></span>
    {#if compact}
      <span class="num">{unknown ? '?' : online.length}</span>
    {:else}
      <span>{unknown ? 'Online' : online.length ? 'Online' : 'Offline'}</span><span class="sep">|</span><span class="num">{unknown ? '?' : online.length}</span>
    {/if}
    <svg class="caret" class:up={open} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </button>

  {#if open}
    <div class="menu" role="dialog" aria-label="PCs" transition:fly={{ y: -6, duration: 160 }}>
      <p class="head {tone}">{headline}</p>
      <div class="sync">
        <span class:bad={store.stale || store.sync.error}>{syncedText}</span>
        <button class="btn small" onclick={syncNow} disabled={syncing || !store.online}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
      {#if muted}<p class="note">Your alerts are muted until {clock(v.snoozeUntil)}.</p>{/if}

      {#if online.length}
        <div class="label">Online</div>
        {#each online as d (d.id)}
          <div class="pc"><span class="dot ok"></span><span class="grow"><b>{d.name}</b><span class="sub">{d.owner}</span></span><span class="when">{ago(d.lastSeen)}</span></div>
        {/each}
      {/if}
      {#if offline.length}
        <div class="label">Offline</div>
        {#each offline as d (d.id)}
          <div class="pc off"><span class="dot"></span><span class="grow"><b>{d.name}</b><span class="sub">{d.owner}</span></span><span class="when">{ago(d.lastSeen)}</span></div>
        {/each}
      {/if}
      {#if v && !v.devices.length}<p class="note">No PC has signed in to the extension yet.</p>{/if}

      <p class="foot">Online = seen in the last 2 minutes. Any one online PC scans every event and sends everyone's phone alerts. Desktop alerts only show on PCs where they are switched on.</p>
    </div>
  {/if}
</div>

<style>
  .pcs { position: relative; }
  .pill-btn {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px 0 9px; margin-left: 8px;
    border: 0; border-radius: 99px; font-size: 13px; font-weight: 650; cursor: pointer;
    background: var(--soft); color: var(--ink);
  }
  .pill-btn:active { filter: brightness(.95); }
  .pill-btn.on { background: var(--okbg); color: var(--ok); }
  .pill-btn.off { background: var(--badbg); color: var(--bad); }
  .pill-btn.unknown { color: var(--muted); }
  .sep { opacity: .45; font-weight: 400; }
  .led { width: 8px; height: 8px; border-radius: 50%; background: var(--s-none); flex: none; }
  .on .led { background: var(--s-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--s-ok) 25%, transparent); animation: pulse 2.4s ease-in-out infinite; }
  .off .led { background: var(--s-bad); }
  @keyframes pulse { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--s-ok) 8%, transparent); } }
  .caret { opacity: .6; transition: transform .2s; }
  .caret.up { transform: rotate(180deg); }

  .menu {
    position: absolute; top: calc(100% + 8px); left: 8px; z-index: 30;
    width: min(320px, calc(100vw - 24px)); max-height: 70vh; overflow-y: auto;
    background: var(--panel); border-radius: 14px; padding: 12px 14px;
    box-shadow: 0 12px 40px var(--shadow), 0 0 0 1px var(--line);
  }
  .head { margin: 0 0 6px; font-weight: 650; font-size: 14px; }
  .head.on { color: var(--ok); } .head.off { color: var(--bad); } .head.unknown { color: var(--low); }
  .sync { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0 2px; font-size: 13px; color: var(--muted); }
  .sync .bad { color: var(--bad); }
  .note { margin: 4px 0; font-size: 13px; color: var(--low); }
  .label { margin: 10px 0 2px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .pc { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
  .pc + .pc { border-top: 1px solid var(--line); }
  .pc.off { opacity: .65; }
  .grow { flex: 1; min-width: 0; display: grid; }
  .grow b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 12px; color: var(--muted); }
  .when { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .foot { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); line-height: 1.4; }
</style>

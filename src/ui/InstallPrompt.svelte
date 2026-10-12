<script>
  /* "Install Seat Tracker": the Add to Home Screen steps on iPhone and iPad,
   * the browser's own install popup elsewhere (lib/install.svelte.js). */
  import Icon from './Icon.svelte';
  import { install } from '../lib/install.svelte.js';

  /* tabbar: the card sits above the tab bar when there is one */
  let { tabbar = true } = $props();
  let busy = $state(false);

  async function go() {
    busy = true;
    try { await install.prompt(); } finally { busy = false; }
  }
</script>

{#if install.mode}
  <div class="install" class:tabbar role="dialog" aria-label="Install Seat Tracker">
    <div class="top">
      <img src="./icons/icon-192.png" alt="" width="40" height="40" />
      <div class="ttl">
        <b>Install Seat Tracker</b>
        <span>Opens full screen, stays signed in, and counts what needs you on its icon.</span>
      </div>
      <button class="icon-btn x" onclick={() => install.dismiss()} aria-label="Not now"><Icon name="close" size={18} /></button>
    </div>

    {#if install.mode === 'ios'}
      {#if install.inApp}
        <p class="warn">This app's own browser can't add it. Open this page in Safari first: tap <b>•••</b>, then <b>Open in Safari</b>.</p>
      {:else}
        <ol>
          <li><span class="n">1</span><span class="txt"><span>Tap <b class="key"><Icon name="share" size={16} /> Share</b></span><small>at the bottom in Safari, or by the address in Chrome</small></span></li>
          <li><span class="n">2</span><span class="txt"><span>Choose <b class="key"><Icon name="plussq" size={16} /> Add to Home Screen</b></span><small>scroll the list down if you don't see it</small></span></li>
          <li><span class="n">3</span><span class="txt"><span>Tap <b>Add</b>, then open Seat Tracker from your Home Screen</span></span></li>
        </ol>
      {/if}
      <button class="btn block small" onclick={() => install.dismiss()}>Not now</button>
    {:else}
      <div class="acts">
        <button class="btn" onclick={() => install.dismiss()}>Not now</button>
        <button class="btn primary block" disabled={busy} onclick={go}>Install</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .install {
    position: fixed; z-index: 30; left: 0; right: 0; margin: 0 auto; max-width: 520px;
    bottom: calc(12px + var(--safe-b));
    margin-left: max(12px, var(--safe-l)); margin-right: max(12px, var(--safe-r));
    display: grid; gap: 12px; padding: 14px; border-radius: 18px;
    background: var(--panel); box-shadow: 0 10px 40px var(--shadow), 0 0 0 1px var(--line);
    animation: rise .35s var(--ease);
  }
  .install.tabbar { bottom: calc(var(--tabbar-h) + var(--safe-b) + 10px); }
  @media (min-width: 544px) { .install { margin-left: auto; margin-right: auto; } }
  @keyframes rise { from { transform: translateY(16px); opacity: 0; } }
  .top { display: flex; align-items: flex-start; gap: 12px; }
  .top img { border-radius: 10px; flex: none; }
  .ttl { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .ttl b { font-size: 16px; }
  .ttl span { font-size: 13px; color: var(--muted); }
  .x { margin: -8px -8px 0 0; color: var(--muted); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; }
  .txt { display: grid; gap: 2px; padding-top: 1px; }
  li small { font-size: 12px; color: var(--muted); }
  .n { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; }
  .key { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 7px; background: var(--soft); font-weight: 650; vertical-align: -3px; }
  .key :global(svg) { color: var(--accent); }
  .warn { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--lowbg); color: var(--low); font-size: 14px; }
  .acts { display: flex; gap: 10px; }
  .acts .btn { white-space: nowrap; }
</style>

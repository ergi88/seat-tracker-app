<script>
  import { store } from './lib/store.svelte.js';
  import { router } from './lib/router.svelte.js';
  import TabBar from './ui/TabBar.svelte';
  import Toasts from './ui/Toasts.svelte';
  import SignIn from './routes/SignIn.svelte';
  import Now from './routes/Now.svelte';
  import Events from './routes/Events.svelte';
  import Event from './routes/Event.svelte';
  import AddRequest from './routes/AddRequest.svelte';
  import MapPage from './routes/MapPage.svelte';
  import Money from './routes/Money.svelte';
  import Inbox from './routes/Inbox.svelte';
  import Settings from './routes/Settings.svelte';
  import RequestSheet from './routes/RequestSheet.svelte';
  import SectorSheet from './routes/SectorSheet.svelte';
  import MuteSheet from './routes/MuteSheet.svelte';
  import MessageSheet from './routes/MessageSheet.svelte';
  import ListingSheet from './routes/ListingSheet.svelte';

  const route = $derived(router.route);
  const sheet = $derived(router.sheet);

  /* theme: this phone's choice, else the phone's own */
  $effect(() => {
    const t = store.deviceSettings.theme;
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1115' : '#f2f3f6');
  });

  /* the icon badge counts what needs you, like the extension's toolbar badge */
  $effect(() => {
    const n = store.view ? store.view.attention.length : 0;
    if (!('setAppBadge' in navigator)) return;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  });
</script>

{#if !store.ready}
  <div class="boot"></div>
{:else if !store.user}
  <SignIn />
{:else}
  <div class="screen">
    {#key route.name + route.arg}
      {#if route.name === 'now'}<Now />
      {:else if route.name === 'events'}<Events />
      {:else if route.name === 'event'}<Event key={route.arg} />
      {:else if route.name === 'add'}<AddRequest eventKey={route.params.event || ''} sec={route.params.sec || ''} />
      {:else if route.name === 'map'}<MapPage key={route.arg} />
      {:else if route.name === 'money'}<Money />
      {:else if route.name === 'inbox'}<Inbox />
      {:else if route.name === 'settings'}<Settings />
      {/if}
    {/key}
  </div>
  {#if route.name !== 'add' && route.name !== 'map'}<TabBar />{/if}

  {#if sheet}
    {#key sheet}
      {#if sheet.kind === 'request'}<RequestSheet id={sheet?.id} />
      {:else if sheet.kind === 'sector'}<SectorSheet eventKey={sheet?.eventKey} sectorId={sheet?.sectorId} table={sheet?.table} />
      {:else if sheet.kind === 'mute'}<MuteSheet />
      {:else if sheet.kind === 'message'}<MessageSheet eventKey={sheet?.eventKey} section={sheet?.section} />
      {:else if sheet.kind === 'listing'}<ListingSheet id={sheet?.id} />
      {/if}
    {/key}
  {/if}
{/if}
<Toasts />

<style>
  .boot { height: 100%; background: var(--bg); }
  .screen { position: fixed; inset: 0; }
</style>

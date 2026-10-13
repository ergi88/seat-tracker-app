<script>
  import { canBadge, setBadge } from './lib/badge.js';
  import { store } from './lib/store.svelte.js';
  import { router } from './lib/router.svelte.js';
  import TabBar from './ui/TabBar.svelte';
  import Toasts from './ui/Toasts.svelte';
  import InstallPrompt from './ui/InstallPrompt.svelte';
  import SignIn from './routes/SignIn.svelte';
  import Now from './routes/Now.svelte';
  import Events from './routes/Events.svelte';
  import Event from './routes/Event.svelte';
  import AddRequest from './routes/AddRequest.svelte';
  import MapPage from './routes/MapPage.svelte';
  import Money from './routes/Money.svelte';
  import Inbox from './routes/Inbox.svelte';
  import Settings from './routes/Settings.svelte';
  import DealSheet from './routes/DealSheet.svelte';
  import SectorSheet from './routes/SectorSheet.svelte';
  import MuteSheet from './routes/MuteSheet.svelte';
  import MessageSheet from './routes/MessageSheet.svelte';
  import DeleteRequestSheet from './routes/DeleteRequestSheet.svelte';
  import DeleteListingSheet from './routes/DeleteListingSheet.svelte';
  import Accounts from './routes/Accounts.svelte';
  import AccountSheet from './routes/AccountSheet.svelte';
  import PurchaseSheet from './routes/PurchaseSheet.svelte';
  import PricesSheet from './routes/PricesSheet.svelte';

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
    if (!canBadge()) return;
    setBadge(n).catch(() => {});
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
      {:else if route.name === 'accounts'}<Accounts />
      {/if}
    {/key}
  </div>
  {#if route.name !== 'add' && route.name !== 'map' && route.name !== 'accounts'}<TabBar />{/if}

  {#if sheet}
    {#key sheet}
      {#if sheet.kind === 'request'}<DealSheet requestId={sheet?.id} tab={sheet?.tab} />
      {:else if sheet.kind === 'sector'}<SectorSheet eventKey={sheet?.eventKey} sectorId={sheet?.sectorId} table={sheet?.table} />
      {:else if sheet.kind === 'mute'}<MuteSheet />
      {:else if sheet.kind === 'message'}<MessageSheet eventKey={sheet?.eventKey} section={sheet?.section} to={sheet?.to} />
      {:else if sheet.kind === 'listing'}<DealSheet listingId={sheet?.id} tab={sheet?.tab} />
      {:else if sheet.kind === 'deleteRequest'}<DeleteRequestSheet id={sheet?.id} />
      {:else if sheet.kind === 'deleteListing'}<DeleteListingSheet id={sheet?.id} />
      {:else if sheet.kind === 'account'}<AccountSheet id={sheet?.id} />
      {:else if sheet.kind === 'prices'}<PricesSheet eventKey={sheet?.eventKey} />
      {:else if sheet.kind === 'purchase'}<PurchaseSheet id={sheet?.id} eventKey={sheet?.eventKey} requestId={sheet?.requestId} />
      {/if}
    {/key}
  {/if}
{/if}
{#if store.ready && !sheet}<InstallPrompt tabbar={!!store.user && route.name !== 'add' && route.name !== 'map' && route.name !== 'accounts'} />{/if}
<Toasts />

<style>
  .boot { height: 100%; background: var(--bg); }
  .screen { position: fixed; inset: 0; }
</style>

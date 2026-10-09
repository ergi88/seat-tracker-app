<script>
  /* What the person must know before trusting the numbers: offline, not
   * syncing, or no PC online (with every PC closed nothing is scanned). */
  import Icon from './Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { ago } from '../lib/fmt.js';

  const v = $derived(store.view);
  const lastPc = $derived(v && v.devices.length ? v.devices[0] : null);
</script>

{#if !store.online}
  <div class="banner low"><Icon name="wifioff" size={20} /><span><b>You are offline</b>Showing the last data. Changes are off until you are back.</span></div>
{:else if store.sync.error}
  <div class="banner bad"><Icon name="wifioff" size={20} /><span><b>Not syncing</b>{store.sync.error}</span></div>
{/if}

{#if v && v.open.length && !v.pcsOnline.length}
  <div class="banner bad">
    <Icon name="pc" size={20} />
    <span><b>No PC online: nothing is being scanned</b>
      {lastPc ? `${lastPc.name} (${lastPc.owner}) was last seen ${ago(lastPc.lastSeen)}.` : 'No PC has signed in yet.'}
      Open Chrome with the extension on one PC.</span>
  </div>
{/if}

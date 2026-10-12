<script>
  /* The last alerts sent to you (the database keeps a week), newest first,
   * and team messages. Opening the tab marks them read on this phone.
   * Swipe one left to delete it; Clear all deletes every one (both undoable). */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import AlertItem from '../ui/AlertItem.svelte';
  import { deleteAlertsWithUndo } from '../lib/actions.js';

  const v = $derived(store.view);
  const alerts = $derived(v ? v.alerts.filter(a => !store.hiddenAlerts[a.id]) : []);
  function clearAll() {
    const ids = alerts.map(a => a.id);
    deleteAlertsWithUndo(ids, `Cleared ${ids.length} alert${ids.length === 1 ? '' : 's'}`, true);
  }
  const seenBefore = Number(store.deviceSettings.inboxSeen || 0);

  $effect(() => {
    const top = v && v.alerts.length ? v.alerts[0].id : 0;
    if (top > Number(store.deviceSettings.inboxSeen || 0)) store.saveDeviceSettings({ inboxSeen: top });
  });

  const EMOJI = { available: '🎉', low: '⚠️', backOk: '✅', gone: '❌', failing: '🚨', recovered: '✅', newEvent: '📅', sectorsOpen: '🔓', teamNote: '💬', summary: '📋' };
</script>

<Page title="Inbox" subtitle="Alerts sent to you this week">
  {#snippet actions()}
    {#if alerts.length}<button class="btn small clear" onclick={clearAll}>Clear all</button>{/if}
    <button class="icon-btn" onclick={() => router.openSheet({ kind: 'message' })} aria-label="Message the team"><Icon name="send" /></button>
  {/snippet}

  {#if !v}
    <div class="skeleton"></div>
  {:else if !alerts.length}
    <div class="empty"><div class="big">📭</div><p>Nothing this week.</p></div>
  {:else}
    <div class="list">
      {#each alerts as a (a.id)}
        <AlertItem {a} emoji={EMOJI[a.type] || '🔔'} fresh={a.id > seenBefore} />
      {/each}
    </div>
    <p class="muted tiny hint">Swipe an alert left to delete it.</p>
  {/if}
</Page>

<style>
  .list { display: grid; gap: 8px; margin-top: 14px; }
  .clear { margin-right: 4px; }
  .hint { text-align: center; margin-top: 12px; }
</style>

<script>
  /* The last alerts sent to you (the database keeps a week), newest first,
   * and team messages. Opening the tab marks them read on this phone. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { when } from '../lib/fmt.js';

  const v = $derived(store.view);
  const seenBefore = Number(store.deviceSettings.inboxSeen || 0);

  $effect(() => {
    const top = v && v.alerts.length ? v.alerts[0].id : 0;
    if (top > Number(store.deviceSettings.inboxSeen || 0)) store.saveDeviceSettings({ inboxSeen: top });
  });

  const EMOJI = { available: '🎉', low: '⚠️', backOk: '✅', gone: '❌', failing: '🚨', recovered: '✅', newEvent: '📅', sectorsOpen: '🔓', teamNote: '💬', summary: '📋' };
</script>

<Page title="Inbox" subtitle="Alerts sent to you this week">
  {#snippet actions()}
    <button class="icon-btn" onclick={() => router.openSheet({ kind: 'message' })} aria-label="Message the team"><Icon name="send" /></button>
  {/snippet}

  {#if !v}
    <div class="skeleton"></div>
  {:else if !v.alerts.length}
    <div class="empty"><div class="big">📭</div><p>Nothing this week.</p></div>
  {:else}
    <div class="list">
      {#each v.alerts as a (a.id)}
        <svelte:element this={a.click ? 'a' : 'div'} class="item" class:new={a.id > seenBefore}
          href={a.click || undefined} target={a.click ? '_blank' : undefined} rel={a.click ? 'noopener' : undefined}>
          <span class="em" aria-hidden="true">{EMOJI[a.type] || '🔔'}</span>
          <span class="grow">
            <span class="top"><b>{a.title}</b><span class="tiny muted">{when(a.createdAt)}</span></span>
            <span class="msg">{a.message}</span>
          </span>
        </svelte:element>
      {/each}
    </div>
  {/if}
</Page>

<style>
  .list { display: grid; gap: 8px; margin-top: 14px; }
  .item { display: flex; gap: 12px; padding: 12px 14px; border-radius: var(--r-card); background: var(--panel); color: var(--ink); box-shadow: 0 1px 0 var(--line); }
  .item.new { box-shadow: inset 3px 0 0 var(--accent), 0 1px 0 var(--line); }
  .em { font-size: 22px; line-height: 1.2; }
  .grow { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .top { display: flex; justify-content: space-between; gap: 8px; }
  .msg { white-space: pre-line; font-size: 14px; }
</style>

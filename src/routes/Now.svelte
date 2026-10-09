<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import RequestCard from '../ui/RequestCard.svelte';
  import Banners from '../ui/Banners.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { freshness, plural, clock, ago, fromToday } from '../lib/fmt.js';

  const v = $derived(store.view);
  const muted = $derived(v && v.snoozeUntil > Date.now());
  const byEvent = $derived.by(() => {
    if (!v) return [];
    return v.events.filter(e => e.open > 0 && !e.archived);
  });
  const fine = $derived(v ? v.open.length - v.attention.length : 0);
</script>

<Page title="Now" subtitle={freshness(store)}>
  {#snippet actions()}
    <button class="icon-btn" onclick={() => router.openSheet({ kind: 'mute' })} aria-label={muted ? 'Muted' : 'Mute alerts'}>
      <Icon name={muted ? 'belloff' : 'bell'} />
    </button>
    <button class="icon-btn" onclick={() => router.go(href.add())} aria-label="Add a request"><Icon name="plus" /></button>
    <button class="icon-btn" onclick={() => router.go('#/settings')} aria-label="Settings"><Icon name="user" /></button>
  {/snippet}

  <Banners />

  {#if !v}
    <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
  {:else}
    {#if muted}
      <button class="banner info mute" onclick={() => router.openSheet({ kind: 'mute' })}>
        <Icon name="belloff" size={20} />
        <span><b>Alerts muted until {clock(v.snoozeUntil)}</b>Tap to change</span>
      </button>
    {/if}

    <div class="stats">
      <div class="stat"><span class="n num">{v.open.length}</span><span class="l">open</span></div>
      <div class="stat {v.attention.length ? 'warn' : ''}"><span class="n num">{v.attention.length}</span><span class="l">need you</span></div>
      <div class="stat"><span class="n num">{fine}</span><span class="l">fine</span></div>
    </div>

    {#if v.attention.length}
      <h2 class="section-title">Needs attention</h2>
      {#each v.attention as r (r.id)}<RequestCard {r} showEvent />{/each}
    {:else if v.open.length}
      <div class="calm"><Icon name="check" size={28} /><span>Every open request can be filled.</span></div>
    {/if}

    {#if byEvent.length}
      <h2 class="section-title">Your events</h2>
      <div class="group">
        {#each byEvent as e (e.key)}
          <a class="row" href={href.event(e.key)}>
            <span class="dot {e.tone}"></span>
            <span class="grow">
              <span class="title">[{e.num}] {e.title}</span>
              <span class="sub">{e.time !== null ? fromToday(e.time) + ' · ' : ''}{plural(e.open, 'open request')} · scanned {ago(e.lastScanAt)}</span>
            </span>
            <span class="chev"><Icon name="chev" size={18} /></span>
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty">
        <div class="big">🎟️</div>
        <p>No open requests.</p>
        <a class="btn primary" href={href.add()}>Add a request</a>
      </div>
    {/if}
  {/if}
</Page>

<style>
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .stat { background: var(--panel); border-radius: var(--r-card); padding: 12px 14px; display: grid; box-shadow: 0 1px 0 var(--line); }
  .stat .n { font-size: 26px; font-weight: 750; line-height: 1.1; }
  .stat .l { font-size: 13px; color: var(--muted); }
  .stat.warn .n { color: var(--bad); }
  .calm { display: flex; gap: 10px; align-items: center; padding: 16px; margin-top: 14px; border-radius: var(--r-card); background: var(--okbg); color: var(--ok); font-weight: 600; }
  .mute { width: 100%; border: 0; text-align: left; cursor: pointer; }
  .row .title, .row .sub { display: block; }
</style>

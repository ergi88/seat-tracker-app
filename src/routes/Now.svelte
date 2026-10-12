<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import RequestCard from '../ui/RequestCard.svelte';
  import Banners from '../ui/Banners.svelte';
  import DateTile from '../ui/DateTile.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { freshness, clock, ago, fromToday } from '../lib/fmt.js';

  const v = $derived(store.view);
  const muted = $derived(v && v.snoozeUntil > Date.now());
  const byEvent = $derived.by(() => {
    if (!v) return [];
    return v.events.filter(e => e.open > 0 && !e.archived);
  });
  /* how your open requests stand, per event: the only numbers a card shows */
  const counts = $derived.by(() => {
    const out = {};
    for (const r of v ? v.open : []) {
      const c = out[r.eventKey] || (out[r.eventKey] = { ok: 0, low: 0, bad: 0, none: 0 });
      c[r.tone]++;
    }
    return out;
  });
  const soon = t => t !== null && /today|tomorrow/.test(fromToday(t));
  const past = t => t !== null && /ago|yesterday/.test(fromToday(t));
</script>

<Page title="Now" subtitle={freshness(store)}>
  {#snippet aside()}
    {#if v}
      <!-- how many requests are open; what needs you is listed below -->
      <div class="tally-head" aria-label="{v.open.length} open requests">
        <b class="num">{v.open.length}</b><span>open</span>
      </div>
    {/if}
  {/snippet}
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


    {#if v.attention.length}
      <h2 class="section-title">Needs attention</h2>
      {#each v.attention as r (r.id)}<RequestCard {r} showEvent />{/each}
    {:else if v.open.length}
      <div class="calm"><Icon name="check" size={28} /><span>Every open request can be filled.</span></div>
    {/if}

    {#if byEvent.length}
      <h2 class="section-title">Your events</h2>
      <!-- nearest first; the event page has the rest -->
      <div class="cards">
        {#each byEvent as e (e.key)}
          {@const c = counts[e.key] || { ok: 0, low: 0, bad: 0, none: 0 }}
          <a class="evcard {e.tone}" href={href.event(e.key)}>
            <DateTile time={e.time} size="fill" />
            <span class="body">
              <span class="head">
                <span class="name">{e.info.name}</span>
                {#if e.time !== null}<span class="count" class:soon={soon(e.time)} class:past={past(e.time)}>{fromToday(e.time)}</span>{/if}
              </span>
              <span class="meta">
                {#if e.info.time}<b>{e.info.time}</b>{/if}
                <span class="scan" class:bad={e.health && e.health.failing}>
                  {e.health && e.health.failing ? 'scans failing' : e.lastScanAt ? `scanned ${ago(e.lastScanAt)}` : 'never scanned'}
                </span>
              </span>
              <span class="tally">
                {#if c.bad}<span class="pill bad num">{c.bad} short</span>{/if}
                {#if c.low}<span class="pill low num">{c.low} low</span>{/if}
                {#if c.ok}<span class="pill ok num">{c.ok} ok</span>{/if}
                {#if c.none}<span class="pill none num">{c.none} not scanned</span>{/if}
              </span>
            </span>
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
  .tally-head {
    display: grid; justify-items: center; min-width: 64px; padding: 6px 14px;
    background: var(--panel); border-radius: 12px; box-shadow: 0 1px 0 var(--line);
  }
  .tally-head b { font-size: 22px; font-weight: 750; line-height: 1.1; }
  .tally-head span { font-size: 11px; font-weight: 600; color: var(--muted); }
  .calm { display: flex; gap: 10px; align-items: center; padding: 16px; margin-top: 14px; border-radius: var(--r-card); background: var(--okbg); color: var(--ok); font-weight: 600; }
  .mute { width: 100%; border: 0; text-align: left; cursor: pointer; }

  /* event cards, one under the other */
  .cards { display: grid; gap: 10px; }
  .evcard {
    position: relative; display: flex; align-items: stretch; gap: 14px; min-width: 0;
    padding: 14px 14px 14px 18px; overflow: hidden;
    background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line); color: var(--ink);
  }
  .evcard:active { filter: brightness(.97); }
  /* the worst status of the event as the stripe on the left */
  .evcard::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--s-none); }
  .evcard.ok::before { background: var(--s-ok); }
  .evcard.low::before { background: var(--s-low); }
  .evcard.bad::before { background: var(--s-bad); }
  .body { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .name {
    font-size: 17px; font-weight: 700; line-height: 1.25; letter-spacing: -.01em; min-width: 0;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .count { flex: none; font-size: 12.5px; font-weight: 650; color: var(--accent); background: var(--accent-soft); padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
  .count.soon { background: var(--accent); color: var(--accent-ink); }
  .count.past { background: var(--nonebg); color: var(--muted); font-weight: 500; }
  .meta { display: flex; gap: 6px; font-size: 13.5px; color: var(--muted); min-width: 0; white-space: nowrap; }
  .meta b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; flex: none; }
  .meta b + .scan::before { content: '·'; margin-right: 6px; color: var(--muted); }
  .scan { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .scan.bad { color: var(--bad); font-weight: 600; }
  .tally { display: flex; flex-wrap: wrap; gap: 5px; padding-top: 2px; }
</style>

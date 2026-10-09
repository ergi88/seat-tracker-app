<script>
  /* One sector from the team's last scan: free seats, the longest block,
   * the blocks row by row (from the full scan, fetched on open), who wants
   * it, and a shortcut to add a request there. */
  import { untrack } from 'svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { ago } from '../lib/fmt.js';

  let { eventKey, sectorId } = $props();
  const ev = $derived(store.view ? store.view.events.find(e => e.key === eventKey) : null);
  const s = $derived(ev ? ev.sectors.find(x => x.id === sectorId) : null);
  const scan = $derived(((store.scans || {})[eventKey] || {})[sectorId] || null);
  let loading = $state(true);

  /* fetch on open; untracked, because fetching writes store.scans, which this sheet reads */
  $effect(() => {
    const [k, id] = [eventKey, sectorId];
    untrack(() => {
      loading = true;
      store.fetchScans(k, [id]).catch(() => {}).finally(() => { loading = false; });
    });
  });

  /* free runs per row, longest first: "Row 12 · 6 · 4" */
  const rows = $derived.by(() => {
    const view = SK.rules.blocksFor(scan, null);       // null when the sector has no seat map
    if (!view) return [];
    const byRow = new Map();
    for (const b of view.blocks) {
      if (!byRow.has(b.row)) byRow.set(b.row, []);
      byRow.get(b.row).push(b.len);                    // already longest first
    }
    return [...byRow.entries()].map(([row, runs]) => ({ row, runs }))
      .sort((a, b) => b.runs[0] - a.runs[0]).slice(0, 30);
  });

  function add() {
    router.closeSheet();
    setTimeout(() => router.go(href.add(eventKey)), 300);
  }
</script>

{#if s}
  <Sheet title={s.code}>
    {#if s.name !== s.code}<p class="muted small center">{s.name}</p>{/if}
    <div class="tiles">
      <div class="tile"><b class="num">{s.summary ? s.summary.available : '—'}</b><span>free</span></div>
      <div class="tile"><b class="num">{s.summary && s.summary.total ? s.summary.total : '—'}</b><span>seats</span></div>
      <div class="tile"><b class="num">{s.summary ? s.summary.longest ?? '—' : '—'}</b><span>longest block</span></div>
    </div>
    <p class="muted small center">{s.summary ? `Read ${ago(s.summary.at)}` : 'No PC has read this sector yet.'}{s.wanted ? ` · ${s.wanted} wanted by the team` : ''}</p>

    {#if loading && !scan}
      <div class="skeleton"></div>
    {:else if rows.length}
      <h3 class="section-title">Free blocks by row</h3>
      <div class="rows">
        {#each rows as row}
          <div class="r"><span class="muted">Row {row.row}</span><span class="runs">{#each row.runs as n}<span class="run num">{n}</span>{/each}</span></div>
        {/each}
      </div>
    {/if}

    {#snippet footer()}
      {#if s.url}<a class="btn" href={s.url} target="_blank" rel="noopener"><Icon name="external" size={18} /></a>{/if}
      <button class="btn primary block" onclick={add}><Icon name="plus" size={18} /> Request here</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .center { text-align: center; margin: 4px 0 10px; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }
  .tile { background: var(--soft); border-radius: 12px; padding: 12px; display: grid; text-align: center; }
  .tile b { font-size: 24px; }
  .tile span { font-size: 12px; color: var(--muted); }
  .rows { display: grid; gap: 4px; }
  .r { display: flex; justify-content: space-between; gap: 10px; padding: 8px 12px; background: var(--soft); border-radius: 10px; font-size: 14px; }
  .runs { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .run { min-width: 26px; padding: 1px 6px; border-radius: 6px; background: var(--okbg); color: var(--ok); font-weight: 700; text-align: center; }
</style>

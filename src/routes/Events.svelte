<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import Banners from '../ui/Banners.svelte';
  import DateTile from '../ui/DateTile.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { ago, plural, fromToday } from '../lib/fmt.js';

  let q = $state('');
  let showArchived = $state(false);
  const v = $derived(store.view);
  const match = e => !q.trim() || `${e.num} ${e.title} ${e.info.name} ${e.info.venue} ${e.siteLabel} ${e.date}`.toLowerCase().includes(q.trim().toLowerCase());
  const live = $derived(v ? v.events.filter(e => !e.archived && match(e)) : []);
  const archived = $derived(v ? v.events.filter(e => e.archived && match(e)) : []);
  /* already nearest first (model.js byNearest): cut it where the past starts */
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const sections = $derived.by(() => {
    const t0 = startOfToday();
    return [
      { label: 'Coming up', list: live.filter(e => e.time !== null && e.time >= t0) },
      { label: 'Past', list: live.filter(e => e.time !== null && e.time < t0) },
      { label: 'No date', list: live.filter(e => e.time === null) }
    ].filter(s => s.list.length);
  });

  /* the day is on the tile: here only how far it is */
  function sub(e) {
    const parts = [e.siteLabel];
    if (e.time !== null) parts.push(fromToday(e.time));
    parts.push(e.open ? plural(e.open, 'open') : 'none open');
    if (e.otherOwners.length) parts.push('also ' + e.otherOwners.join(', '));
    return parts.join(' · ');
  }
</script>

<Page title="Events" subtitle={v ? plural(v.events.length, 'tracked event') : ''}>
  {#snippet actions()}
    <button class="icon-btn" onclick={() => router.go(href.add())} aria-label="Add a request"><Icon name="plus" /></button>
  {/snippet}

  <Banners />

  <label class="search">
    <Icon name="search" size={18} />
    <input class="input" type="search" placeholder="Search events" bind:value={q} enterkeyhint="search" />
  </label>

  {#if !v}
    <div class="skeleton"></div><div class="skeleton"></div>
  {:else if !live.length && !archived.length}
    <div class="empty"><div class="big">📅</div><p>{q ? 'No event matches.' : 'No events yet. Track one from its page on a PC.'}</p></div>
  {:else}
    {#each sections as sec (sec.label)}
    {#if sections.length > 1 || sec.label !== 'Coming up'}<h2 class="section-title">{sec.label}</h2>{/if}
    <div class="group list">
      {#each sec.list as e (e.key)}
        <a class="row ev" href={href.event(e.key)}>
          <DateTile time={e.time} />
          <span class="grow">
            <span class="title"><span class="dot {e.open ? e.tone : ''}"></span><span class="num">[{e.num}]</span> {e.info.name}</span>
            {#if e.info.time || e.info.venue}
              <span class="where">
                {#if e.info.time}<b>{e.info.time}</b>{/if}
                {#if e.info.venue}<span class="venue"><Icon name="pin" size={13} />{e.info.venue}</span>{/if}
              </span>
            {/if}
            <span class="sub">{sub(e)}</span>
            <span class="sub tiny">
              {e.lastScanAt ? `scanned ${ago(e.lastScanAt)}` : 'never scanned'}{e.autoEvery ? ` · every ${e.autoEvery} min` : ' · auto-check off'}
              {#if e.health && e.health.failing}<b class="bad"> · scans failing</b>{/if}
            </span>
          </span>
          <span class="chev"><Icon name="chev" size={18} /></span>
        </a>
      {/each}
    </div>
    {/each}

    {#if archived.length}
      <button class="section-title toggle" onclick={() => (showArchived = !showArchived)}>
        Archived ({archived.length}) {showArchived ? '▾' : '▸'}
      </button>
      {#if showArchived}
        <div class="group">
          {#each archived as e (e.key)}
            <a class="row ev" href={href.event(e.key)}>
              <DateTile time={e.time} />
              <span class="grow"><span class="title"><span class="num">[{e.num}]</span> {e.info.name}</span><span class="sub">{sub(e)}</span></span>
              <span class="chev"><Icon name="chev" size={18} /></span>
            </a>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</Page>

<style>
  .search { position: relative; display: block; margin: 14px 0 12px; color: var(--muted); }
  .search :global(svg) { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); }
  .search .input { padding-left: 38px; background: var(--softer); border-color: transparent; }
  .row .title, .row .sub, .row .where { display: block; }
  .ev { align-items: flex-start; padding-top: 12px; padding-bottom: 12px; color: var(--ink); }
  .ev .chev { align-self: center; }
  .ev .title { display: flex; align-items: center; gap: 7px; font-size: 16.5px; letter-spacing: -.01em; }
  .ev .title .dot { width: 8px; height: 8px; }
  .num { color: var(--muted); font-weight: 500; font-variant-numeric: tabular-nums; }
  .where { display: flex; align-items: center; gap: 8px; margin: 2px 0 1px; font-size: 14px; min-width: 0; white-space: nowrap; }
  .where b { font-weight: 650; font-variant-numeric: tabular-nums; flex: none; }
  .venue { display: inline-flex; align-items: center; gap: 3px; color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .venue :global(svg) { flex: none; }
  .toggle { border: 0; background: none; padding: 0; cursor: pointer; }
</style>

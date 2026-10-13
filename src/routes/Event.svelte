<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import RequestCard from '../ui/RequestCard.svelte';
  import Banners from '../ui/Banners.svelte';
  import StadiumMap from '../ui/StadiumMap.svelte';
  import DateTile from '../ui/DateTile.svelte';
  import BuysCard from '../ui/BuysCard.svelte';
  import { venueFor } from '../lib/venues.js';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { setArchived } from '../lib/actions.js';
  import { ago, clock, plural, fromToday, longDay } from '../lib/fmt.js';

  let { key } = $props();
  let q = $state('');
  let showAllSectors = $state(false);

  const v = $derived(store.view);
  const ev = $derived(v ? v.events.find(e => e.key === key) : null);
  const mine = $derived(v ? v.requests.filter(r => r.eventKey === key) : []);
  const open = $derived(mine.filter(r => !r.done));
  const done = $derived(mine.filter(r => r.done));

  /* the requests: filtered by status */
  const TONES = [
    { key: 'bad', label: 'Short' }, { key: 'low', label: 'Low' },
    { key: 'ok', label: 'OK' }, { key: 'none', label: 'Not scanned' }, { key: 'bought', label: 'Bought' }
  ];
  let only = $state('all');
  const tally = $derived(Object.fromEntries(TONES.map(t => [t.key, open.filter(r => r.tone === t.key).length])));
  const present = $derived(TONES.filter(t => tally[t.key]));
  const shown = $derived(only === 'all' ? open : open.filter(r => r.tone === only));

  /* ---------------- tabs under the map ----------------
   * Requests, Buy and Sectors one at a time instead of one long page. The
   * strip sticks under the top bar; switching tabs while it is stuck brings
   * the new tab in from its top. The last tab is remembered on this phone. */
  const TAB_KEY = 'sk.eventTab';
  let tab = $state((() => { try { return localStorage.getItem(TAB_KEY) || 'requests'; } catch (e) { return 'requests'; } })());
  let strip = $state();
  let anchor = $state();
  function pick(k) {
    if (k === tab) return;
    const sc = strip && strip.closest('.scroll');
    const stuckAt = strip ? parseFloat(getComputedStyle(strip).top) + (sc ? sc.getBoundingClientRect().top : 0) : 0;
    const stuck = !!strip && strip.getBoundingClientRect().top <= stuckAt + 1;
    tab = k;
    try { localStorage.setItem(TAB_KEY, k); } catch (e) { /* this visit only */ }
    if (stuck && sc && anchor) requestAnimationFrame(() => { sc.scrollTop += anchor.getBoundingClientRect().top - stuckAt; });
  }
  /* a filter whose last request went away falls back to all */
  $effect(() => { if (only !== 'all' && !tally[only]) only = 'all'; });
  const venue = $derived(venueFor(ev));
  const myListings = $derived(v ? v.listings.filter(l => l.eventKey === key) : []);

  /* sectors: the searched ones, else the ones with free seats or wanted */
  const sectors = $derived.by(() => {
    if (!ev) return [];
    const needle = SK.util.normKey(q);
    let list = ev.sectors;
    if (needle) list = list.filter(s => SK.util.normKey(`${s.code} ${s.name}`).includes(needle));
    else if (!showAllSectors) list = list.filter(s => s.wanted || (s.summary && s.summary.available > 0));
    return list.slice().sort((a, b) => (b.wanted - a.wanted) || ((b.summary?.available || 0) - (a.summary?.available || 0)) || String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
  });

  async function archive() {
    try {
      await setArchived(key, !ev.archived);
      store.toast(ev.archived ? 'Event archived' : 'Event back in the list');
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
</script>

<Page title={ev ? ev.info.name : 'Event'} subtitle={ev ? `[${ev.num}] · ${ev.siteLabel}` : ''}
  back={() => router.back('#/events')}>
  {#snippet actions()}
    {#if ev}
      {#if ev.url}<a class="icon-btn" href={ev.url} target="_blank" rel="noopener" aria-label="Open on {ev.siteLabel}"><Icon name="external" /></a>{/if}
      <button class="icon-btn" onclick={() => router.go(href.add(key))} aria-label="Add a request"><Icon name="plus" /></button>
    {/if}
  {/snippet}

  <Banners />

  {#if !v}
    <div class="skeleton"></div>
  {:else if !ev}
    <div class="empty"><p>This event is no longer tracked.</p><a class="btn" href="#/events">All events</a></div>
  {:else}
    <!-- when and where, split from the site's title -->
    <div class="facts" title={ev.title}>
      <DateTile time={ev.time} size="lg" />
      <div class="facts-body">
        <b class="when">{ev.time !== null ? longDay(ev.time) : 'No date yet'}</b>
        {#if ev.info.time || ev.time !== null}
          <span class="line"><Icon name="clock" size={15} />
            {#if ev.info.time}<b class="hm">{ev.info.time}</b>{/if}
            {#if ev.time !== null}<span class="rel" class:past={/ago|yesterday/.test(fromToday(ev.time))}>{fromToday(ev.time)}</span>{/if}
          </span>
        {/if}
        {#if ev.info.venue}<span class="line venue"><Icon name="pin" size={15} /><span>{ev.info.venue}</span></span>{/if}
      </div>
    </div>

    <div class="chips">
      <span class="chip"><Icon name="refresh" size={14} /> {ev.lastScanAt ? `scanned ${ago(ev.lastScanAt)}` : 'never scanned'}{ev.lastScanBy ? ` by ${ev.lastScanBy}` : ''}</span>
      <span class="chip">{ev.autoEvery ? `auto-check every ${ev.autoEvery} min` : 'auto-check off'}</span>
      {#if ev.scanner}<span class="chip accent">{ev.scanner} is scanning</span>{/if}
    </div>

    {#if venue}
      <a class="stadium" href={href.map(key)} aria-label="Open the {venue.name} map">
        <div class="pic"><StadiumMap {venue} event={ev} requests={mine} listings={myListings} interactive={false} /></div>
        <div class="cap"><span><b>{venue.name}</b><span class="muted small">Free seats, your requests and listings by section</span></span><span class="open">Open map <Icon name="chev" size={16} /></span></div>
      </a>
    {/if}

    {#if ev.health && ev.health.failing}
      <div class="banner bad"><span><b>Scans failing since {clock(ev.health.firstFailAt)}</b>{ev.health.lastError || ''}</span></div>
    {/if}

    <div class="tab-anchor" bind:this={anchor}></div>
    <div class="tabs" bind:this={strip} role="tablist" aria-label="Event sections">
      {#each [['requests', 'Requests', open.length], ['buy', 'Buy', ev.buys.total], ['sectors', 'Sectors', ev.sectors.length]] as [k, label, n] (k)}
        <button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => pick(k)}>{label}{#if n}<span class="num">{n}</span>{/if}</button>
      {/each}
    </div>

    {#if tab === 'requests'}
      {#if present.length > 1}
        <div class="filters" role="group" aria-label="Show requests by status">
          <button class:on={only === 'all'} onclick={() => (only = 'all')}>All <span class="num">{open.length}</span></button>
          {#each present as t (t.key)}
            <button class="{t.key}" class:on={only === t.key} onclick={() => (only = only === t.key ? 'all' : t.key)}>
              {t.label} <span class="num">{tally[t.key]}</span>
            </button>
          {/each}
        </div>
      {/if}
      {#each shown as r (r.id)}<RequestCard {r} />{/each}
      {#if !open.length}
        <a class="add-card" href={href.add(key)}><Icon name="plus" size={20} /> Add a request</a>
      {/if}
      {#if ev.teamOpen > ev.open}
        <p class="muted small">Teammates have {plural(ev.teamOpen - ev.open, 'open request')} here too ({ev.otherOwners.join(', ')}).</p>
      {/if}
      {#if done.length}
        <h2 class="section-title">Done · {done.length}</h2>
        {#each done as r (r.id)}<RequestCard {r} />{/each}
      {/if}
    {:else if tab === 'buy'}
      <BuysCard {ev} />

      <!-- what a ticket costs in each sector: Add purchase fills its price from here -->
      <div class="group prices">
        <button class="row" onclick={() => router.openSheet({ kind: 'prices', eventKey: key })}>
          <span class="grow"><span class="title">Price list</span>
            <span class="sub">{ev.sectors.filter(s => s.price).length} of {ev.sectors.length} sectors priced</span></span>
          <Icon name="chev" size={18} />
        </button>
      </div>
    {:else}
      <div class="sectors-tab">
        <input class="input" type="search" placeholder="Find a sector (E106, tribuna…)" bind:value={q} enterkeyhint="search" />
        <div class="group sectors">
          {#each sectors as s (s.id)}
            <button class="row" onclick={() => router.openSheet({ kind: 'sector', eventKey: key, sectorId: s.id })}>
              <span class="code">{s.code}</span>
              <span class="grow">
                <span class="sub">{s.name !== s.code ? s.name : ''}</span>
              </span>
              {#if s.wanted}<span class="pill accent num">{s.wanted} wanted</span>{/if}
              <span class="free num {s.summary ? (s.summary.available ? 'ok' : 'muted') : 'muted'}">
                {s.summary ? (s.summary.unmapped ? 'no map' : `${s.summary.available} free`) : '—'}
              </span>
            </button>
          {:else}
            <div class="row muted small">{q ? 'No sector matches.' : 'No sector with free seats in the last scans.'}</div>
          {/each}
        </div>
        {#if !q}
          <button class="btn small linkish" onclick={() => (showAllSectors = !showAllSectors)}>
            {showAllSectors ? 'Only sectors with seats' : `Show all ${ev.sectors.length} sectors`}
          </button>
        {/if}
      </div>
    {/if}

    <button class="btn block archive" onclick={archive}><Icon name="archive" size={18} /> {ev.archived ? 'Unarchive' : 'Archive for me'}</button>
  {/if}
</Page>

<style>
  .facts {
    display: flex; align-items: center; gap: 14px; margin-top: 14px; padding: 14px 16px;
    background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line);
  }
  .facts-body { display: grid; gap: 4px; min-width: 0; }
  .when { font-size: 17px; font-weight: 650; letter-spacing: -.01em; }
  .line { display: flex; align-items: center; gap: 6px; font-size: 15px; color: var(--muted); min-width: 0; }
  .line :global(svg) { flex: none; }
  .hm { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
  .rel { color: var(--accent); font-weight: 600; }
  .rel.past { color: var(--muted); font-weight: 400; }
  .hm + .rel::before { content: '·'; color: var(--muted); margin-right: 6px; font-weight: 400; }
  .venue span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stadium { display: block; margin-top: 14px; border-radius: var(--r-card); overflow: hidden; background: var(--panel); box-shadow: 0 1px 0 var(--line); color: var(--ink); }
  .stadium:active { filter: brightness(.97); }
  .pic { height: 210px; background: var(--map-bg); padding: 6px; }
  .cap { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--line); }
  .cap > span:first-child { display: grid; }
  .open { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); font-weight: 650; font-size: 14px; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 99px; background: var(--panel); font-size: 13px; color: var(--muted); box-shadow: 0 1px 0 var(--line); }
  .chip.accent { background: var(--accent-soft); color: var(--accent); }
  /* the tabs under the map: stuck under the top bar while the page scrolls */
  .tabs {
    position: sticky; top: calc(48px + var(--safe-t)); z-index: 4;
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px;
    margin: 16px calc(-16px - var(--safe-r)) 12px calc(-16px - var(--safe-l));
    padding: 8px calc(16px + var(--safe-r)) 8px calc(16px + var(--safe-l));
    background: var(--bar); border-bottom: 1px solid var(--line);
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
  }
  .tabs button {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px;
    border: 0; border-radius: 10px; background: var(--softer); color: var(--muted);
    font: inherit; font-size: 15px; font-weight: 650; cursor: pointer; transition: background .2s, color .2s;
  }
  .tabs button .num { font-size: 12.5px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--panel); color: var(--muted); }
  .tabs button.on { background: var(--ink); color: var(--bg); }
  .tabs button.on .num { background: var(--bg); color: var(--ink); }
  .sectors-tab { display: grid; }
  .filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 0 10px; padding-bottom: 2px; }
  .filters::-webkit-scrollbar { display: none; }
  .filters button {
    flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px;
    border: 0; border-radius: 99px; background: var(--panel); box-shadow: 0 1px 0 var(--line);
    font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer;
  }
  .filters button .num { color: var(--muted); font-weight: 500; }
  .filters button.on { background: var(--ink); color: var(--bg); }
  .filters button.on .num { color: inherit; opacity: .7; }
  .filters button.bad.on { background: var(--badbg); color: var(--bad); box-shadow: inset 0 0 0 1.5px var(--bad); }
  .filters button.low.on { background: var(--lowbg); color: var(--low); box-shadow: inset 0 0 0 1.5px var(--low); }
  .filters button.ok.on { background: var(--okbg); color: var(--ok); box-shadow: inset 0 0 0 1.5px var(--ok); }
  .filters button.none.on { background: var(--nonebg); color: var(--none); box-shadow: inset 0 0 0 1.5px var(--none); }
  .filters button.bought.on { background: var(--boughtbg); color: var(--bought); box-shadow: inset 0 0 0 1.5px var(--bought); }
  .add-card { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px; border-radius: var(--r-card); border: 1.5px dashed var(--line); color: var(--accent); font-weight: 600; }
  .sectors { margin-top: 10px; }
  .prices { margin-top: 10px; }
  .prices .title, .prices .sub { display: block; }
  .code { font-weight: 700; min-width: 64px; }
  .free { font-weight: 600; font-size: 14px; }
  .linkish { margin-top: 10px; background: none; color: var(--accent); padding: 0; }
  .archive { margin-top: 28px; color: var(--muted); }
</style>

<script>
  /* The stadium, full screen, two ways:
   *  - Requests & listings: every section coloured by its free seats, your
   *    requests and listings on it, tap one for its sheet. "Together" fades
   *    out the sections whose longest block is shorter than the group.
   *  - Sales: viagogo's last sales, tickets sold per section; tap a section
   *    and the list under the map shows only its sales (tap it again, or
   *    All sections, for all of them). */
  import { untrack } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import StadiumMap from '../ui/StadiumMap.svelte';
  import LastSales from '../ui/LastSales.svelte';
  import { PERIODS, inPeriod, bySection, offMap as soldOffMap, saleCode, normCode, stats } from '../lib/sold.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { venueFor } from '../lib/venues.js';
  import { ago, fromToday, money, plural } from '../lib/fmt.js';

  let { key, view: startView = '' } = $props();
  const v = $derived(store.view);
  const ev = $derived(v ? v.events.find(e => e.key === key) : null);
  const venue = $derived(venueFor(ev));
  const requests = $derived(v ? v.requests.filter(r => r.eventKey === key) : []);
  const listings = $derived(v ? v.listings.filter(l => l.eventKey === key) : []);
  let minBlock = $state(Number(store.deviceSettings.mapBlock) || 0);
  let cats = $state([]);                              // picked prices (Posttick), none = every price
  let map = $state();

  /* where one block sells several prices, the map needs every block's full
   * scan to count seats per price: fetched once on open */
  const pricing = $derived(!!(ev && ev.canPrices && Object.keys(ev.cats || {}).length));
  let scansLoaded = $state(false);
  /* a grid of tables (Senidah's bar tables) is coloured table by table, also from the full scan */
  const tableGrid = $derived(!!(venue && venue.sections.some(s => s.shape === 'grid')));
  $effect(() => {
    if (!pricing && !tableGrid) return;
    const k = key;
    untrack(() => store.fetchScans(k, null).catch(() => {}).finally(() => { scansLoaded = true; }));
  });
  const scans = $derived((store.scans || {})[key] || {});

  /* every price of the event, dearest first, with what is free at it */
  const prices = $derived.by(() => {
    if (!pricing) return [];
    return Object.values(ev.cats).map(c => {
      let free = 0;
      for (const s of ev.sectors) { const v = scans[s.id] && SK.rules.blocksFor(scans[s.id], [c.key]); if (v) free += v.available; }
      return { key: String(c.key), label: c.label, color: c.color, price: c.price, text: SK.rules.priceText(ev.cats, c.key, ev.currency), free };
    }).filter(c => c.price !== null || c.free > 0).sort((a, b) => (b.price || 0) - (a.price || 0));
  });
  function toggleCat(k) { cats = cats.includes(k) ? cats.filter(x => x !== k) : [...cats, k]; navigator.vibrate?.(6); }

  const totals = $derived.by(() => {
    if (!ev) return null;
    const read = ev.sectors.filter(s => s.summary && !s.summary.unmapped);
    const newest = Math.max(0, ...read.map(s => s.summary.at || 0));
    if (cats.length) {
      let free = 0, sections = 0;
      for (const s of ev.sectors) {
        const v = scans[s.id] && SK.rules.blocksFor(scans[s.id], cats);
        if (v && v.available > 0 && (!minBlock || v.longest >= minBlock)) { free += v.available; sections++; }
      }
      return { free, sections, newest };
    }
    const withSeats = read.filter(s => s.summary.available > 0 && (!minBlock || s.summary.longest >= minBlock));
    return { free: withSeats.reduce((n, s) => n + s.summary.available, 0), sections: withSeats.length, newest };
  });
  /* sectors the drawing has no place for (VIP, skybox, accessible seats) */
  const offMap = $derived.by(() => {
    if (!ev || !venue) return [];
    const drawn = new Set(venue.sections.map(s => s.code));
    return ev.sectors.filter(s => !drawn.has(String(s.code).toUpperCase().replace(/\s+/g, '')) && !drawn.has(s.code)
      && !(venue.covered && venue.covered.test(s.code)));
  });

  function pick(code, sector, extra) {
    if (!sector) { store.toast(`${code} is not on sale for this event.`); return; }
    router.openSheet({ kind: 'sector', eventKey: key, sectorId: sector.id, table: extra && extra.table ? extra.table : null });
  }
  /* legend entries this venue needs */
  const hasStanding = $derived(!!(ev && ev.sectors.some(s => s.summary && s.summary.unmapped)));
  const hasOff = $derived(!!(venue && ev && venue.sections.some(sec => !ev.sectors.some(s => String(s.code).toUpperCase() === sec.code.toUpperCase()))));
  /* ---------------- which map: seats, or sales ---------------------- */
  // svelte-ignore state_referenced_locally
  let mode = $state(startView === 'sold' || startView === 'seats' ? startView : (store.deviceSettings.mapView === 'sold' ? 'sold' : 'seats'));
  function setMode(m) { mode = m; picked = ''; store.saveDeviceSettings({ mapView: m }); navigator.vibrate?.(6); }

  let period = $state('all');
  let picked = $state('');                           // a section code, '' = all of them
  const soldAll = $derived(ev ? ev.lastSales || [] : []);
  const soldList = $derived(inPeriod(soldAll, period));
  const soldMap = $derived(bySection(soldList));
  /* sold where the drawing has no place: chips, so they can be picked too */
  const soldOff = $derived.by(() => {
    const out = new Map();
    for (const s of soldOffMap(soldList, venue)) {
      const k = saleCode(s);
      const x = out.get(k) || { code: s.code || s.section, tickets: 0 };
      x.tickets += Number(s.tickets) || 0;
      out.set(k, x);
    }
    return [...out.values()];
  });
  const shownSales = $derived(picked ? soldList.filter(s => saleCode(s) === normCode(picked)) : soldList);
  const shownStats = $derived(stats(shownSales));
  const eachText = st => Object.entries(st.each).map(([c, x]) => (Math.abs(x.max - x.min) < 0.005
    ? `${money(x.avg, c)}/pc` : `${money(x.min, c)}–${money(x.max, c)}/pc, avg ${money(x.avg, c)}`)).join(' · ');

  function pickSold(code) {
    if (picked && normCode(picked) === normCode(code)) { picked = ''; return; }
    if (!soldMap[normCode(code)]) { store.toast(`No sale in ${code}${period === 'all' ? '' : ' in this period'}.`); return; }
    picked = code;
    navigator.vibrate?.(6);
  }

  function setBlock(n) { minBlock = n; store.saveDeviceSettings({ mapBlock: n }); navigator.vibrate?.(6); }
</script>

<div class="mappage">
  <header class="bar">
    <button class="icon-btn" onclick={() => router.back(href.event(key))} aria-label="Back"><Icon name="back" /></button>
    <div class="ttl">
      <b>{ev ? `[${ev.num}] ${ev.info.name}` : 'Stadium'}</b>
      <span>{venue ? venue.name : ''}{ev && ev.time !== null ? ' · ' + fromToday(ev.time) : ''}</span>
    </div>
    <span class="spacer" aria-hidden="true"></span>
  </header>

  {#if !v}
    <div class="skeleton big"></div>
  {:else if !ev || !venue}
    <div class="empty"><p>No stadium map for this event.</p><a class="btn" href={href.event(key)}>Back to the event</a></div>
  {:else}
    <div class="modes" role="tablist" aria-label="What the map shows">
      <button role="tab" aria-selected={mode === 'seats'} class:on={mode === 'seats'} onclick={() => setMode('seats')}>Requests &amp; listings</button>
      <button role="tab" aria-selected={mode === 'sold'} class:on={mode === 'sold'} onclick={() => setMode('sold')}>Sales{soldAll.length ? ` · ${soldAll.length}` : ''}</button>
    </div>

    {#if mode === 'sold'}
    <div class="tools">
      <div class="seg" role="radiogroup" aria-label="Period">
        {#each PERIODS as [k, label] (k)}
          <button role="radio" aria-checked={period === k} class:on={period === k} onclick={() => { period = k; navigator.vibrate?.(6); }}>{label}</button>
        {/each}
      </div>
      <span class="sum num">{plural(stats(soldList).tickets, 'ticket')} in {plural(soldList.length, 'sale')}</span>
    </div>

    <div class="stage sold">
      <StadiumMap bind:this={map} {venue} event={ev} sold={soldMap} {picked} onpick={pickSold} />
      <div class="zoom">
        <button onclick={() => map.zoomBy(1.6)} aria-label="Zoom in"><Icon name="plus" size={22} /></button>
        <button onclick={() => map.zoomBy(1 / 1.6)} aria-label="Zoom out"><Icon name="minus" size={22} /></button>
        <button onclick={() => map.reset()} aria-label="Whole stadium" class="fit">⤢</button>
      </div>
    </div>

    <section class="sales-panel" aria-label="Sales">
      <div class="ph">
        <div class="pt">
          <b>{picked || 'All sections'}</b>
          <span class="muted small num">
            {plural(shownStats.tickets, 'ticket')} · {plural(shownStats.sales, 'sale')}{eachText(shownStats) ? ` · ${eachText(shownStats)}` : ''}{shownStats.last ? ` · last ${ago(shownStats.last)}` : ''}
          </span>
        </div>
        {#if picked}<button class="chip on" onclick={() => (picked = '')}>All sections ✕</button>{/if}
      </div>
      {#if soldOff.length}
        <div class="off">
          {#each soldOff as x (x.code)}
            <button class="chip" class:on={picked && normCode(picked) === normCode(x.code)} onclick={() => pickSold(x.code)}>{x.code} · {x.tickets}</button>
          {/each}
        </div>
      {/if}
      {#if !soldAll.length}
        <p class="muted small none">No sale saved for this event yet. The extension asks viagogo for the latest sale of every event the team lists on.</p>
      {:else if !shownSales.length}
        <p class="muted small none">No sale {picked ? `in ${picked} ` : ''}in this period.</p>
      {:else}
        <LastSales sales={shownSales} />
      {/if}
      <div class="keys sold-keys">
        <span><i class="sw nosale"></i>No sale</span>
        <span><i class="sw grad"></i>Fewer → more tickets sold</span>
        <span>Tap a section for its sales</span>
      </div>
    </section>
    {:else}
    <div class="tools">
      <div class="seg" role="radiogroup" aria-label="Seats together">
        <span class="lbl">Together</span>
        {#each [0, 2, 4, 6] as n}
          <button role="radio" aria-checked={minBlock === n} class:on={minBlock === n} onclick={() => setBlock(n)}>{n ? n + '+' : 'Any'}</button>
        {/each}
      </div>
      <span class="sum num">{totals.free} free in {totals.sections}</span>
    </div>

    {#if prices.length}
      <div class="prices" role="group" aria-label="Prices">
        <button class="price" class:on={!cats.length} onclick={() => (cats = [])}>All prices</button>
        {#each prices as c (c.key)}
          <button class="price" class:on={cats.includes(c.key)} class:none={scansLoaded && !c.free} onclick={() => toggleCat(c.key)}
            aria-pressed={cats.includes(c.key)}>
            <i style:background={c.color}></i>{c.label} · {c.text}<small class="num">{scansLoaded ? `${c.free} free` : '…'}</small>
          </button>
        {/each}
      </div>
    {/if}

    <div class="stage">
      <StadiumMap bind:this={map} {venue} event={ev} {requests} {listings} {minBlock} {cats} {scans} onpick={pick} />
      <div class="zoom">
        <button onclick={() => map.zoomBy(1.6)} aria-label="Zoom in"><Icon name="plus" size={22} /></button>
        <button onclick={() => map.zoomBy(1 / 1.6)} aria-label="Zoom out"><Icon name="minus" size={22} /></button>
        <button onclick={() => map.reset()} aria-label="Whole stadium" class="fit">⤢</button>
      </div>
    </div>

    <footer class="legend">
      <div class="keys">
        <span><i class="sw l4"></i>Many free</span>
        <span><i class="sw l1"></i>Few free</span>
        <span><i class="sw zero"></i>None</span>
        <span><i class="sw sold"></i>Sold out</span>
        <span><i class="sw unread"></i>Not read</span>
        {#if hasStanding}<span><i class="sw standing"></i>Standing (no seat data)</span>{/if}
        {#if hasOff}<span><i class="sw off"></i>Not on sale</span>{/if}
        {#if tableGrid}<span><i class="sw l3"></i>Table free</span>{/if}
        <span><i class="sw req"></i>Your request</span>
        <span><i class="dotl"></i>Requested + listed</span>
        <span><i class="dotl req"></i>Requested only</span>
        <span><i class="dotl list"></i>Listed only</span>
        <span><i class="dotl held"></i>Bought</span>
      </div>
      {#if offMap.length}
        <div class="off">
          {#each offMap as s (s.id)}
            <button class="chip" onclick={() => pick(s.code, s)}>{s.code}{s.summary && !s.summary.unmapped ? ` · ${s.summary.available}` : ''}</button>
          {/each}
        </div>
      {/if}
      <p class="tiny muted">Scanned {ago(totals.newest)} · pinch or double-tap to zoom, tap a section</p>
    </footer>
    {/if}
  {/if}
</div>

<style>
  .mappage { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--bg); }
  .bar {
    flex: none; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px;
    padding: var(--safe-t) calc(8px + var(--safe-r)) 4px calc(4px + var(--safe-l)); min-height: calc(52px + var(--safe-t));
  }
  .spacer { width: 44px; }                           /* balances the back button, so the title stays centred */
  .ttl { display: grid; min-width: 0; text-align: center; }
  .ttl b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ttl span { font-size: 12px; color: var(--muted); }
  .tools { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px calc(12px + var(--safe-r)) 8px calc(12px + var(--safe-l)); }
  .seg { display: inline-flex; align-items: center; padding: 3px; border-radius: 11px; background: var(--softer); }
  .seg .lbl { font-size: 12px; color: var(--muted); padding: 0 8px 0 6px; }
  .seg button { min-width: 40px; min-height: 30px; border: 0; border-radius: 8px; background: none; font-weight: 650; font-size: 13px; color: var(--muted); cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }
  .sum { font-size: 13px; color: var(--muted); white-space: nowrap; }

  .prices { flex: none; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 0 calc(12px + var(--safe-r)) 8px calc(12px + var(--safe-l)); }
  .prices::-webkit-scrollbar { display: none; }
  .price {
    flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 99px;
    border: 1.5px solid var(--line); background: var(--panel); font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap;
  }
  .price i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .price small { font-weight: 500; color: var(--muted); }
  .price.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .price.none { opacity: .45; }
  .stage { position: relative; flex: 1; min-height: 0; margin: 0 8px; border-radius: 16px; overflow: hidden; background: var(--map-bg); box-shadow: 0 0 0 1px var(--line); }
  /* one row, bottom right: on a phone every venue leaves room under the
   * drawing, so no section hides under the buttons */
  .zoom { position: absolute; right: 10px; bottom: 10px; display: grid; grid-auto-flow: column; gap: 6px; }
  .zoom button {
    width: 44px; height: 44px; padding: 0; -webkit-appearance: none; appearance: none; border-radius: 12px; border: 0; display: grid; place-items: center; cursor: pointer;
    background: color-mix(in srgb, var(--panel) 88%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); color: var(--ink); box-shadow: 0 2px 10px var(--shadow); font-size: 20px;
  }
  .zoom button:active { transform: scale(.94); }

  .legend { flex: none; padding: 8px calc(12px + var(--safe-r)) calc(8px + var(--safe-b)) calc(12px + var(--safe-l)); display: grid; gap: 6px; }
  .keys { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
  .keys span { display: inline-flex; align-items: center; gap: 5px; }
  .sw { width: 14px; height: 10px; border-radius: 3px; display: inline-block; }
  .sw.l4 { background: var(--sec-l4); } .sw.l1 { background: var(--sec-l1); } .sw.zero { background: var(--sec-zero); }
  .sw.unread { background: var(--sec-unread); box-shadow: inset 0 0 0 1px var(--line); }
  .sw.sold { background: repeating-linear-gradient(45deg, var(--sec-zero) 0 3px, var(--sec-sold-line) 3px 5px); }
  .sw.standing { background: var(--sec-standing); } .sw.off { background: var(--sec-off); box-shadow: inset 0 0 0 1px var(--line); }
  .sw.l3 { background: var(--sec-l3); }
  .sw.req { background: transparent; box-shadow: inset 0 0 0 2px var(--s-ok); }
  .dotl { width: 10px; height: 10px; border-radius: 50%; background: var(--map-listing); display: inline-block; }
  .dotl.req { background: var(--badge-req); }
  .dotl.list { background: var(--badge-list); }
  .dotl.held { background: var(--s-bought); }
  .off { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .chip { flex: none; min-height: 32px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--line); background: var(--panel); font-size: 13px; font-weight: 600; cursor: pointer; }
  .legend p { margin: 0; }

  .modes { flex: none; display: grid; grid-template-columns: 1fr 1fr; padding: 3px; margin: 0 calc(12px + var(--safe-r)) 8px calc(12px + var(--safe-l)); border-radius: 11px; background: var(--softer); }
  .modes button { min-height: 32px; border: 0; border-radius: 8px; background: none; font-weight: 650; font-size: 13.5px; color: var(--muted); cursor: pointer; }
  .modes button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }
  /* sales: the map on top, its list under it, each scrolling on its own */
  .stage.sold { flex: 1 1 0; min-height: 300px; }
  .sales-panel {
    flex: 0 1 auto; max-height: 40%; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
    padding: 10px calc(12px + var(--safe-r)) calc(10px + var(--safe-b)) calc(12px + var(--safe-l)); display: grid; gap: 6px; align-content: start;
  }
  .ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .pt { display: grid; gap: 1px; min-width: 0; }
  .pt b { font-size: 16px; }
  .chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .none { margin: 4px 2px; }
  .sales-panel :global(.last) { margin-top: 0; }
  .sold-keys { padding-top: 4px; }
  .sw.nosale { background: var(--sec-unread); box-shadow: inset 0 0 0 1px var(--line); }
  .sw.grad { width: 34px; background: linear-gradient(90deg, color-mix(in srgb, var(--s-low) 35%, var(--sec-zero)), var(--s-low), var(--s-bad)); }
  .skeleton.big { margin: 16px; height: 60vh; }
</style>

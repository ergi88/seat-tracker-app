<script>
  /* Your viagogo listings and sales, as the PCs last read them, with the
   * profit in lek worked out exactly as the extension does. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import Calculator from './Calculator.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { lek, money, win, ago, fromToday } from '../lib/fmt.js';
  import { byNearest } from '../lib/model.js';

  let tab = $state(store.deviceSettings.moneyTab || 'listings');
  let all = $state(false);
  let q = $state('');
  const v = $derived(store.view);

  function setTab(t) { tab = t; store.saveDeviceSettings({ moneyTab: t }); }

  /* The listings page's own search (content/sites/viagogo.js panelMatches):
   * a section ("e10" finds E105 and E106), else a listing or sale number
   * (4+ digits), else a word of the event (3+ letters). */
  function matches(code, section, ids, title, text) {
    const k = SK.util.normKey(text);
    if (!k) return true;
    if (SK.util.normKey(code || section).includes(k) || SK.util.normKey(section).includes(k)) return true;
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 4 && ids.some(id => String(id || '').includes(digits))) return true;
    return k.length >= 3 && SK.util.normKey(title).includes(k);
  }
  const listingHit = l => matches(l.code, l.section, [l.id], `${l.title} ${l.eventTitle || ''}`, q);
  const saleHit = s => matches(s.section, s.section, [s.id, s.listingId], `${s.title} ${s.eventTitle || ''}`, q);

  const listings = $derived(v ? v.listings.filter(l => (all || l.statusKind === 'active' || l.statusKind === 'pending') && listingHit(l)) : []);
  /* what the search hides only because of the status switch, so it can say so */
  const hiddenByStatus = $derived(v && q.trim() && !all ? v.listings.filter(l => !(l.statusKind === 'active' || l.statusKind === 'pending') && listingHit(l)).length : 0);
  const listingTotals = $derived.by(() => {
    let profit = 0, counted = 0, losing = 0, tickets = 0;
    for (const l of listings) {
      const p = l.money;
      tickets += Number(l.tickets) || 0;
      if (p && !p.missing) { profit += p.total; counted++; if (p.atRecommended && p.atRecommended.total < 0) losing++; }
    }
    return { profit, counted, losing, tickets };
  });
  const listingGroups = $derived.by(() => {
    const map = new Map();
    for (const l of listings) {
      const k = l.eventKey || l.title || '?';
      if (!map.has(k)) map.set(k, { key: k, title: l.eventTitle ? `[${l.eventNum}] ${l.eventTitle}` : l.title, when: l.when, time: l.time, items: [] });
      map.get(k).items.push(l);
    }
    for (const g of map.values()) g.items.sort((a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
    return [...map.values()].sort((a, b) => byNearest()(a, b) || String(a.title).localeCompare(String(b.title)));
  });
  /* sales: grouped by core/sales.js, then put nearest event first like everything else */
  const sales = $derived.by(() => {
    if (!v) return { total: null, events: [] };
    const g = SK.sales.groupSales(v.sales.filter(saleHit));
    for (const e of g.events) {
      const first = e.sections[0] && e.sections[0].sales[0];
      e.time = first ? first.time : null;
    }
    g.events.sort((a, b) => byNearest()(a, b) || String(b.lastSold).localeCompare(String(a.lastSold)));
    return g;
  });
  const lastRead = $derived(v && v.listings.length ? Math.max(...v.listings.map(l => l.seenAt || 0)) : 0);
</script>

<Page title="Money" subtitle={lastRead ? `Listings read on viagogo ${ago(lastRead)}` : ''}>
  <div class="seg" role="tablist">
    <button role="tab" class:on={tab === 'listings'} aria-selected={tab === 'listings'} onclick={() => setTab('listings')}>Listings</button>
    <button role="tab" class:on={tab === 'sales'} aria-selected={tab === 'sales'} onclick={() => setTab('sales')}>Sales</button>
    <button role="tab" class:on={tab === 'calc'} aria-selected={tab === 'calc'} onclick={() => setTab('calc')}>Calculator</button>
  </div>

  {#if tab !== 'calc'}
  <label class="search">
    <Icon name="search" size={18} />
    <input class="input" type="search" bind:value={q} enterkeyhint="search" autocapitalize="characters" autocomplete="off"
      placeholder={tab === 'listings' ? 'Section, listing number or event' : 'Section, sale number or event'} />
  </label>
  {#if q.trim()}<p class="filtered muted small">Totals below count only what matches “{q.trim()}”.</p>{/if}
  {/if}

  {#if !v}
    <div class="skeleton"></div>
  {:else if tab === 'calc'}
    <Calculator />
  {:else if tab === 'listings'}
    <div class="hero">
      <div><span class="l">Profit if all sell</span><b class="num {listingTotals.profit >= 0 ? 'ok' : 'bad'}">{lek(listingTotals.profit, true)}</b></div>
      <div><span class="l">Tickets listed</span><b class="num">{listingTotals.tickets}</b></div>
      <div><span class="l">Lose at viagogo's price</span><b class="num {listingTotals.losing ? 'bad' : ''}">{listingTotals.losing}</b></div>
    </div>
    <label class="toggle small muted"><input type="checkbox" bind:checked={all} /> Show deactivated and sold</label>

    {#each listingGroups as g (g.key)}
      <h2 class="section-title">{g.title}{#if g.time !== null}<span class="days">{' · ' + fromToday(g.time)}</span>{/if}</h2>
      <div class="group">
        {#each g.items as l (l.id)}
          <button class="row" onclick={() => router.openSheet({ kind: 'listing', id: l.id })}>
            <span class="dot {l.reqStatus ? ({ OK: 'ok', LOW: 'low', SPLIT: 'bad', SHORT: 'bad' })[l.reqStatus] || '' : ''}"></span>
            <span class="grow">
              <span class="title">{l.code} <span class="muted num">× {l.tickets ?? '?'}</span></span>
              <span class="sub num">{money(l.price, l.currency)} · {l.status || '—'}{l.num ? ` · #${l.num}` : ''}</span>
            </span>
            {#if l.money && !l.money.missing}
              <span class="right num {l.money.total >= 0 ? 'ok' : 'bad'}">{lek(l.money.total, true)}<small>{win(l.money.winRate)}</small></span>
            {:else}
              <span class="right muted small">{l.money && l.money.missing === 'buy' ? 'no buy price' : '—'}</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      {#if q.trim()}
        <div class="empty"><p>No listing matches “{q.trim()}”.</p>
          {#if hiddenByStatus}<button class="btn small" onclick={() => (all = true)}>{hiddenByStatus} more among deactivated and sold</button>{/if}
        </div>
      {:else}
        <div class="empty"><div class="big">💸</div><p>No listings saved yet. Open your viagogo listings page on a PC with the extension.</p></div>
      {/if}
    {/each}
  {:else}
    {#if sales.total}
      <div class="hero">
        <div><span class="l">Profit</span><b class="num {sales.total.profitL >= 0 ? 'ok' : 'bad'}">{lek(sales.total.profitL, true)}</b></div>
        <div><span class="l">Tickets sold</span><b class="num">{sales.total.tickets}</b></div>
        <div><span class="l">Not paid yet</span><b class="num {sales.total.unpaid ? 'low' : ''}">{lek(sales.total.unpaidL)}</b></div>
      </div>
    {/if}
    {#each sales.events as e (e.key)}
      <h2 class="section-title">{e.title}{#if e.time !== null && e.time !== undefined}<span class="days">{' · ' + fromToday(e.time)}</span>{/if}</h2>
      <div class="group">
        {#each e.sections as sec (sec.section)}
          <div class="row static">
            <span class="grow">
              <span class="title">{sec.section} <span class="muted num">× {sec.total.tickets}</span></span>
              <span class="sub">{sec.total.sales} sale{sec.total.sales === 1 ? '' : 's'}{sec.total.unpaid ? ` · ${sec.total.unpaid} not paid yet` : ''}{sec.total.noBuy ? ` · ${sec.total.noBuy} without a buy price` : ''}</span>
            </span>
            <span class="right num {sec.total.profitL >= 0 ? 'ok' : 'bad'}">{sec.total.counted ? lek(sec.total.profitL, true) : '—'}<small>{win(sec.total.winRate)}</small></span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">
        {#if q.trim()}<p>No sale matches “{q.trim()}”.</p>
        {:else}<div class="big">🧾</div><p>No sales saved yet. Open My Sales on viagogo on a PC with the extension.</p>{/if}
      </div>
    {/each}
  {/if}
</Page>

<style>
  .seg { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 3px; margin-top: 14px; border-radius: 11px; background: var(--softer); }
  .seg button { min-height: 34px; border: 0; border-radius: 9px; background: none; font-weight: 600; font-size: 14px; color: var(--muted); cursor: pointer; transition: background .2s, color .2s; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }
  .hero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
  .hero div { background: var(--panel); border-radius: var(--r-card); padding: 12px; display: grid; gap: 2px; box-shadow: 0 1px 0 var(--line); }
  .hero .l { font-size: 12px; color: var(--muted); }
  .hero b { font-size: 18px; }
  .search { position: relative; display: block; margin-top: 12px; color: var(--muted); }
  .search :global(svg) { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); }
  .search .input { padding-left: 38px; background: var(--softer); border-color: transparent; }
  .filtered { margin: 6px 4px 0; }
  .days { text-transform: none; font-weight: 500; letter-spacing: 0; }
  .toggle { display: flex; align-items: center; gap: 8px; margin: 12px 4px 0; }
  .toggle input { width: 18px; height: 18px; accent-color: var(--accent); }
  .row .title, .row .sub { display: block; }
  .right { display: grid; justify-items: end; font-weight: 700; font-size: 15px; }
  .right small { font-weight: 500; font-size: 12px; opacity: .8; }
  .static { cursor: default; }
  .static:active { background: none; }
</style>

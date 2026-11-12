<script>
  /* Your saved viagogo event scans. With no id: every event you saved one
   * of. With an id: that event's newest two, as the PC drawer shows them —
   * Listings with the drawer's filters, and Changes from the older to the
   * newer. Scanning and saving happen on a PC (viagogo's page can only be
   * read there); a third save deletes the oldest. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { money, plural, when, day, fromToday } from '../lib/fmt.js';
  import { QTYS, qtyLabel, SORTS, DIFF_KINDS, listingsOf, changesOf, sectorOf, qtyText, qtyWords, ordinal, currencyOf } from '../lib/vgview.js';

  let { id = '' } = $props();

  const KEY = 'st:vgView';
  const DEFAULTS = { layout: 'sections', onlyMine: false, instant: false, sort: 'section', qty: 0, price: 0, stands: [], kind: 'all', onlyChanged: true };
  const read = () => { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULTS); } };
  let opts = $state(read());
  function set(changes) {
    opts = Object.assign({}, opts, changes);
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* private mode */ }
  }
  let q = $state('');
  let tab = $state('listings');
  let which = $state(0);                 // 0 the newer scan, 1 the older
  let open = $state(new Set());          // sections opened
  const toggle = key => { const n = new Set(open); n.has(key) ? n.delete(key) : n.add(key); open = n; };

  const v = $derived(store.view);
  const group = $derived(v && id ? v.vgEvents.find(g => g.vgEventId === id) || null : null);
  const ev = $derived(v && group && group.eventKey ? v.events.find(e => e.key === group.eventKey) || null : null);
  const full = $derived(store.vgFull[id] || null);
  const bought = $derived(new Set(v ? v.listings.filter(l => l.state === 'bought' || l.reqStatus === 'BOUGHT').map(l => String(l.id)) : []));

  /* the rows come on their own: again whenever a newer save arrives */
  let loading = $state(false);
  let failed = $state('');
  const stale = $derived(!!group && (!full || full.length !== group.scans.length || (full[0] && full[0].at) !== group.latest.at));
  $effect(() => {
    if (!stale || loading || failed) return;
    loading = true;
    failed = '';
    store.fetchVgScans(id).catch(e => { failed = e.message; }).finally(() => { loading = false; });
  });

  const scan = $derived(full && full[Math.min(which, full.length - 1)] || null);
  const cur = $derived(currencyOf(scan));
  const L = $derived(scan ? listingsOf(scan, Object.assign({}, opts, { q }), { ev, bought }) : null);
  const D = $derived(full && full.length > 1 ? changesOf(full[1], full[0], opts, { ev }) : null);

  const scanLine = x => `${plural(x.listings || (x.rows || []).filter(r => !r.sold && r.price > 0).length, 'listing')} · ${x.signedIn ? 'signed in' : 'signed out'}${x.complete ? '' : ' · partly read'}`;
  const apart = (a, b) => {
    const min = Math.round(Math.abs(b - a) / 60000);
    if (min < 60) return `${min} min`;
    if (min < 48 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
    return `${Math.round(min / 1440)} days`;
  };
  const signed = (n, f) => (n > 0 ? '+' : n < 0 ? '−' : '±') + (f ? f(Math.abs(n)) : String(Math.abs(n)));
  const price = n => money(n, cur);
  /* "12 → 10", or "12" when it did not move */
  const mv = (a, b, f = String) => { const t = x => (x === null || x === undefined ? '—' : f(x)); return a === b ? t(b) : `${t(a)} → ${t(b)}`; };
  const free = s => { const sec = ev && sectorOf(ev, s.label); return sec && sec.summary ? sec.summary.available : null; };
  const pickStand = k => {
    const on = new Set(opts.stands || []);
    on.has(k) ? on.delete(k) : on.add(k);
    set({ stands: [...on] });
  };
</script>

{#if !id}
  <Page title="viagogo scans" subtitle={v ? plural(v.vgEvents.length, 'event') : ''} back={() => router.back('#/events')}>
    {#if !v}
      <div class="skeleton"></div>
    {:else if !v.vgEvents.length}
      <div class="empty"><div class="big">🎟️</div><p>No saved scan yet. On a PC, open the event on viagogo, press Scan in the Seat Tracker drawer, then Save scan. The newest two of each event show here.</p></div>
    {:else}
      <div class="group list">
        {#each v.vgEvents as g (g.vgEventId)}
          <a class="row" href={href.vg(g.vgEventId)}>
            <span class="grow">
              <span class="title">{g.eventNum ? `[${g.eventNum}] ` : ''}{g.name || 'viagogo ' + g.vgEventId}</span>
              <span class="sub">{g.time !== null ? `${day(g.time)} · ${fromToday(g.time)} · ` : ''}{plural(g.scans.length, 'scan')} · newest {when(g.latest.at)} · {plural(g.latest.listings, 'listing')}</span>
            </span>
            <Icon name="chev" size={18} />
          </a>
        {/each}
      </div>
      <p class="muted small note">Scan and save on a PC, in the drawer at the bottom of the viagogo event page. Only the newest 2 of each event are kept: a third save deletes the oldest.</p>
    {/if}
  </Page>
{:else}
  <Page title={group ? group.name || 'viagogo event' : 'viagogo event'} subtitle={group ? [group.eventNum ? `[${group.eventNum}]` : '', group.start].filter(Boolean).join(' · ') : ''}
    back={() => router.back(ev ? href.event(ev.key) : href.vg())}>
    {#snippet actions()}
      {#if group}<a class="icon-btn" href={group.url} target="_blank" rel="noopener" aria-label="Open on viagogo"><Icon name="external" /></a>{/if}
    {/snippet}

    {#if !v}
      <div class="skeleton"></div>
    {:else if !group}
      <div class="empty"><div class="big">🎟️</div><p>No saved scan of this event. Save one from the drawer on a PC.</p></div>
    {:else}
      <!-- the two saved scans: which one Listings shows -->
      <div class="group scans">
        {#each group.scans as x, i (x.id)}
          <button class="row pick" class:on={which === i} onclick={() => (which = i)} aria-pressed={which === i}>
            <span class="dot" aria-hidden="true"></span>
            <span class="grow">
              <span class="title">{group.scans.length === 1 ? 'Saved' : i === 0 ? 'Newer' : 'Older'} · {when(x.at)}</span>
              <span class="sub">{scanLine(x)}{x.by ? ` · ${x.by}` : ''}</span>
            </span>
          </button>
        {/each}
      </div>
      <p class="muted small note">{group.scans.length > 1 ? `${apart(group.scans[1].at, group.scans[0].at)} apart. ` : ''}Saved from the PC drawer; a new save deletes the oldest.</p>

      <div class="tabs" role="tablist">
        <button role="tab" class:on={tab === 'listings'} aria-selected={tab === 'listings'} onclick={() => (tab = 'listings')}>Listings{#if scan}<span class="num">{L.totals.listings}</span>{/if}</button>
        <button role="tab" class:on={tab === 'changes'} aria-selected={tab === 'changes'} onclick={() => (tab = 'changes')}>Changes{#if D}<span class="num">{D.counts.all}</span>{/if}</button>
      </div>

      {#if !full}
        {#if failed}<div class="banner bad"><span>{failed}</span></div>{:else}<div class="skeleton"></div><div class="skeleton"></div>{/if}
      {:else if tab === 'listings' && scan}
        <div class="tiles">
          <div><b class="num">{L.totals.sections}</b><span>sections</span></div>
          <div><b class="num">{L.totals.listings}</b><span>listings</span></div>
          <div><b class="num">{L.totals.tickets}</b><span>tickets</span></div>
          <div class:good={L.totals.withMine && L.totals.cheapestFor === L.totals.withMine}><b class="num">{L.totals.cheapestFor} / {L.totals.withMine}</b><span>cheapest where you list</span></div>
        </div>

        <div class="seg" role="radiogroup" aria-label="Show the listings">
          <button role="radio" aria-checked={opts.layout !== 'price'} class:on={opts.layout !== 'price'} onclick={() => set({ layout: 'sections' })}>By section</button>
          <button role="radio" aria-checked={opts.layout === 'price'} class:on={opts.layout === 'price'} onclick={() => set({ layout: 'price' })}>By price</button>
        </div>

        <label class="search">
          <Icon name="search" size={18} />
          <input class="input" type="search" placeholder="Search a section or listing ID" bind:value={q} enterkeyhint="search" />
        </label>

        <div class="filters">
          <button class:on={opts.onlyMine} onclick={() => set({ onlyMine: !opts.onlyMine })}>My listings only</button>
          <button class:on={opts.instant} onclick={() => set({ instant: !opts.instant })} title="Listings viagogo marks Instant Download, and yours whose request is Bought">Instant download</button>
          {#if opts.layout !== 'price'}
            <select class="sort" value={opts.sort} onchange={e => set({ sort: e.currentTarget.value })} aria-label="Sort the sections">
              {#each SORTS as [k, label] (k)}<option value={k}>Sort: {label}</option>{/each}
            </select>
          {/if}
        </div>
        {#if opts.instant && L.all}
          <p class="small line"><b>{plural(L.totals.listings, 'listing')} · {plural(L.totals.tickets, 'ticket')}</b> <span class="muted">instant download or bought, of {L.all.listings} · {L.all.tickets}</span></p>
        {/if}

        {#if L.standsOn}
          <div class="filters">
            <span class="lab">Stand</span>
            <button class:on={!(opts.stands || []).length} onclick={() => set({ stands: [] })}>All</button>
            {#each L.stands as st (st.key)}
              <button class:on={(opts.stands || []).includes(st.key)} class:dim={!st.sections.length} onclick={() => pickStand(st.key)}>{st.label}{#if st.sections.length}<span class="num">{st.sections.length}</span>{/if}</button>
            {/each}
          </div>
        {/if}

        {#if opts.layout === 'price'}
          <div class="filters">
            <span class="lab">Tickets</span>
            {#each QTYS as n (n)}<button class:on={opts.qty === n} onclick={() => set({ qty: n })}>{qtyLabel(n)}</button>{/each}
          </div>
          {#if L.groups.length}
            <div class="filters">
              <span class="lab">Sector price</span>
              <button class:on={!L.group} onclick={() => set({ price: 0 })}>All</button>
              {#each L.groups as g (g.amount)}
                <button class:on={L.group && L.group.amount === g.amount} onclick={() => set({ price: g.amount })}>{g.amount > 0 ? money(g.amount, g.currency) : 'No price'}<span class="num">{g.sections.length}</span></button>
              {/each}
            </div>
          {/if}
          <p class="small line"><b>{plural(L.found.length, 'listing')}</b> <span class="muted">{opts.qty ? `that ${qtyWords(opts.qty)}` : `· ${plural(L.found.reduce((n, r) => n + (r.qtyMax || 0), 0), 'ticket')}`}{L.found.length ? ` · from ${price(L.found[0].price)}` : ''}</span></p>
          {#if L.found.length}
            <div class="group">
              {#each L.found.slice(0, 300) as r, i (r.id + ':' + i)}
                <div class="lst" class:mine={r.mine}>
                  <span class="n num">{i + 1}</span>
                  <span class="grow">
                    <span class="l1"><b class="num">{price(r.price)}</b> · {r.label}{r.row ? ` · Row ${r.row}` : ''}</span>
                    <span class="l2">{qtyText(r)} {r.qtyMax === 1 ? 'ticket' : 'tickets'}{[r.mine ? 'yours' : '', ...(r.features || []), ...(r.tags || [])].filter(Boolean).map(x => ' · ' + x).join('')}</span>
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-line muted">No listing {opts.qty ? qtyWords(opts.qty) : 'for sale here'}{opts.instant ? ' with instant download' : ''}{L.group ? ' at this sector price' : ''}.</p>
          {/if}
        {:else}
          {#if q.trim() && L.sections.length !== L.matched.length}<p class="small muted line">{plural(L.sections.length, 'section')} match "{q.trim()}".</p>{/if}
          {#if L.sections.length}
            <div class="group">
              {#each L.sections as s (s.key)}
                {@const sum = s.sum}
                {@const best = sum.mine[0]}
                {@const f = free(s)}
                <button class="sec k-{sum.kind}" class:open={open.has(s.key)} onclick={() => toggle(s.key)} aria-expanded={open.has(s.key)}>
                  <span class="caret">›</span>
                  <span class="grow">
                    <span class="l1"><b>{s.label}</b>{#if sum.verdict}<span class="pill">{sum.verdict}</span>{/if}</span>
                    <span class="l2">{sum.mine.length ? `${sum.mine.length}/${sum.listings} listings` : plural(sum.listings, 'listing')} · {plural(sum.tickets, 'ticket')}{sum.myTickets ? ` (${sum.myTickets} yours)` : ''}{best ? ` · you ${ordinal(best.rank)} of ${sum.listings}` : ''}{f !== null ? ` · ${f} free on ${ev.siteLabel}` : ''}</span>
                  </span>
                  <b class="num cheap">{sum.cheapest !== null ? price(sum.cheapest) : '—'}</b>
                </button>
                {#if open.has(s.key)}
                  <div class="ladder">
                    {#each s.rows.filter(r => !r.sold && r.price > 0).sort((a, b) => a.price - b.price) as r, i (r.id + ':' + i)}
                      <div class="lr" class:mine={r.mine}>
                        <b class="num">{price(r.price)}</b>
                        <span class="grow">{qtyText(r)} {r.qtyMax === 1 ? 'ticket' : 'tickets'}{r.row ? ` · Row ${r.row}` : ''}{[r.mine ? 'yours' : '', ...(r.features || []), ...(r.tags || [])].filter(Boolean).map(x => ' · ' + x).join('')}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <p class="empty-line muted">{q.trim() ? `No section matches "${q.trim()}".` : opts.instant ? 'No listing here has instant download, and none of yours is bought.' : opts.onlyMine ? 'No section has one of your listings.' : 'No section in the stands picked.'}</p>
          {/if}
        {/if}

      {:else if tab === 'changes'}
        {#if !D}
          <p class="empty-line muted">One scan saved. Scan again later on a PC and save it: this shows what changed between the two — new and removed listings, prices that moved, tickets.</p>
        {:else}
          {@const T = D.totals}
          {#if D.warnings.includes('signed')}<div class="banner bad"><span>One scan was signed in and the other signed out. viagogo shows every viewer its own prices, so prices can't be compared, and signed out no listing has an ID.</span></div>{/if}
          {#if D.warnings.includes('fromPartial') || D.warnings.includes('toPartial')}<p class="small muted line">A scan stopped before the end of the list: some "new" or "removed" may only be ones it did not reach.</p>{/if}
          <div class="tiles">
            <div><b class="num">{T.from.listings} → {T.to.listings}</b><span>listings ({signed(T.to.listings - T.from.listings)})</span></div>
            <div><b class="num">{T.from.tickets} → {T.to.tickets}</b><span>tickets ({signed(T.to.tickets - T.from.tickets)})</span></div>
            <div class:c-new={T.added}><b class="num">{T.added}</b><span>new · {plural(T.addedTickets, 'ticket')}</span></div>
            <div class:c-gone={T.removed}><b class="num">{T.removed}</b><span>removed · {plural(T.removedTickets, 'ticket')}</span></div>
            <div class:c-price={T.down || T.up}><b class="num">↓{T.down} ↑{T.up}</b><span>prices moved</span></div>
            <div class:c-qty={T.qty}><b class="num">{T.qtyLess || T.qtyMore ? `−${T.qtyLess} +${T.qtyMore}` : '0'}</b><span>tickets on listings still there</span></div>
          </div>
          {#if T.from.cheapest !== null || T.to.cheapest !== null}
            <p class="small line">Cheapest: <b class="num">{T.from.cheapest === null ? '—' : price(T.from.cheapest)} → {T.to.cheapest === null ? '—' : price(T.to.cheapest)}</b></p>
          {/if}
          {#if T.guessed}<p class="small muted line">{plural(T.guessed, 'listing')} paired by how they look (no listing ID signed out).</p>{/if}

          <div class="filters">
            {#each DIFF_KINDS as [k, label] (k)}
              <button class:on={(opts.kind || 'all') === k} class:dim={k !== 'all' && !D.counts[k]} onclick={() => set({ kind: k })}>{label}{#if k !== 'all'}<span class="num">{D.counts[k]}</span>{/if}</button>
            {/each}
          </div>
          <label class="check"><input type="checkbox" checked={opts.onlyChanged !== false} onchange={e => set({ onlyChanged: e.currentTarget.checked })} /> Only sections that changed</label>
          {#if D.standsOn}
            <div class="filters">
              <span class="lab">Stand</span>
              <button class:on={!(opts.stands || []).length} onclick={() => set({ stands: [] })}>All</button>
              {#each D.stands as st (st.key)}
                <button class:on={(opts.stands || []).includes(st.key)} class:dim={!st.sections.length} onclick={() => pickStand(st.key)}>{st.label}</button>
              {/each}
            </div>
          {/if}

          {#if D.shown.length}
            <div class="group">
              {#each D.shown as s (s.key)}
                {@const list = D.changesIn(s.key)}
                <button class="sec" class:open={open.has('d:' + s.key)} onclick={() => toggle('d:' + s.key)} aria-expanded={open.has('d:' + s.key)}>
                  <span class="caret">›</span>
                  <span class="grow">
                    <span class="l1"><b>{s.label || s.key}</b>{#if s.status === 'new'}<span class="pill c-new">new on viagogo</span>{:else if s.status === 'gone'}<span class="pill c-gone">nothing left</span>{/if}</span>
                    <span class="l2">{mv(s.a.listings, s.b.listings)} listings · {mv(s.a.tickets, s.b.tickets)} tickets · cheapest {mv(s.a.cheapest, s.b.cheapest, price)}</span>
                  </span>
                  <span class="counts">
                    {#if s.added}<span class="c-new">+{s.added}</span>{/if}
                    {#if s.removed}<span class="c-gone">−{s.removed}</span>{/if}
                    {#if s.down}<span class="c-down">↓{s.down}</span>{/if}
                    {#if s.up}<span class="c-up">↑{s.up}</span>{/if}
                    {#if s.qty}<span class="c-qty">#{s.qty}</span>{/if}
                  </span>
                </button>
                {#if open.has('d:' + s.key)}
                  <div class="ladder">
                    {#each list as c, i (i)}
                      {@const r = c.b || c.a}
                      <div class="chg k-{c.kind === 'changed' ? (c.delta < 0 ? 'down' : c.delta > 0 ? 'up' : 'qty') : c.kind}">
                        <span class="pill">{c.kind === 'new' ? 'New' : c.kind === 'gone' ? 'Removed' : c.delta < 0 ? 'Cheaper' : c.delta > 0 ? 'Dearer' : 'Tickets'}</span>
                        <span class="grow">
                          <span class="l1">{#if c.kind === 'changed' && c.delta}<b class="num">{price(c.a.price)} → {price(c.b.price)}</b> <span class={c.delta < 0 ? 'down' : 'up'}>{signed(c.delta, price)}</span>{:else}<b class="num">{price(r.price)}</b>{/if}</span>
                          <span class="l2">{c.qty ? `${qtyText(c.a)} → ${qtyText(c.b)} tickets` : `${qtyText(r)} ${r.qtyMax === 1 ? 'ticket' : 'tickets'}`}{[r.mine ? 'yours' : '', r.row ? `Row ${r.row}` : '', ...(r.features || [])].filter(Boolean).map(x => ' · ' + x).join('')}{c.how === 'look' ? ' · matched by look' : ''}</span>
                        </span>
                      </div>
                    {:else}
                      <p class="small muted line">No change of this kind here.</p>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <p class="empty-line muted">{D.changes.length ? 'No section has a change of this kind.' : 'Nothing changed between the two scans.'}</p>
          {/if}
        {/if}
      {/if}
    {/if}
  </Page>
{/if}


<style>
  .note { margin: 6px 4px 14px; }
  .scans .pick { width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .scans .dot { width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--line-strong, var(--muted)); flex: none; }
  .scans .pick.on .dot { box-shadow: inset 0 0 0 5px var(--accent); }

  .tabs { display: flex; gap: 6px; margin: 0 0 12px; }
  .tabs button {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 12px; padding: 9px 10px;
    background: var(--soft); color: var(--muted); font: inherit; font-weight: 650; font-size: 15px; cursor: pointer;
  }
  .tabs button .num { font-size: 12.5px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--panel); color: var(--muted); }
  .tabs button.on { background: var(--ink); color: var(--bg); }
  .tabs button.on .num { background: var(--bg); color: var(--ink); }

  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .tiles div { background: var(--panel); border-radius: var(--r-card); padding: 10px 12px; display: grid; gap: 2px; box-shadow: 0 1px 0 var(--line); min-width: 0; }
  .tiles b { font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tiles span { font-size: 12px; color: var(--muted); }
  .tiles .good { box-shadow: inset 3px 0 0 var(--s-ok), 0 1px 0 var(--line); }
  .tiles .c-new { box-shadow: inset 3px 0 0 var(--s-ok), 0 1px 0 var(--line); }
  .tiles .c-gone { box-shadow: inset 3px 0 0 var(--s-bad), 0 1px 0 var(--line); }
  .tiles .c-price { box-shadow: inset 3px 0 0 var(--accent), 0 1px 0 var(--line); }
  .tiles .c-qty { box-shadow: inset 3px 0 0 var(--s-low), 0 1px 0 var(--line); }

  .seg { display: flex; background: var(--soft); border-radius: 12px; padding: 3px; margin-bottom: 10px; }
  .seg button { flex: 1; border: 0; background: none; border-radius: 9px; padding: 8px; font: inherit; font-weight: 650; font-size: 14px; color: var(--muted); cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
  .search { position: relative; display: block; margin: 0 0 10px; color: var(--muted); }
  .search :global(svg) { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); }
  .search .input { padding-left: 38px; background: var(--softer); border-color: transparent; }

  .filters { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 0 10px; padding-bottom: 2px; }
  .filters::-webkit-scrollbar { display: none; }
  .filters button, .sort {
    flex: none; display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 99px; padding: 7px 12px;
    background: var(--soft); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  .filters button .num { color: var(--muted); font-weight: 500; font-size: 12px; }
  .filters button.on { background: var(--ink); color: var(--bg); }
  .filters button.on .num { color: inherit; opacity: .7; }
  .filters button.dim:not(.on) { opacity: .45; }
  .lab { flex: none; font-size: 12px; font-weight: 650; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 0 4px 10px; }
  .line { margin: 0 4px 10px; }
  .empty-line { padding: 16px 6px; margin: 0; }

  .group { overflow: hidden; }
  .sec {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--line);
    background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .sec:active { background: var(--soft); }
  .sec.k-cheapest, .sec.k-alone { box-shadow: inset 3px 0 0 var(--s-ok); }
  .sec.k-above { box-shadow: inset 3px 0 0 var(--s-low); }
  .caret { flex: none; width: 12px; color: var(--muted); font-size: 17px; line-height: 1; transition: transform .2s; }
  .sec.open .caret { transform: rotate(90deg); }
  .grow { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .l1 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 15px; }
  .l2 { font-size: 12.5px; color: var(--muted); }
  .cheap { font-size: 15px; white-space: nowrap; }
  .pill { font-size: 11.5px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: var(--soft); color: var(--muted); white-space: nowrap; }
  .k-cheapest .pill, .k-alone .pill { background: var(--okbg); color: var(--ok); }
  .k-above .pill { background: var(--lowbg); color: var(--low); }
  .pill.c-new { background: var(--okbg); color: var(--ok); }
  .pill.c-gone { background: var(--badbg); color: var(--bad); }
  .counts { display: flex; gap: 6px; font-size: 13px; font-weight: 700; flex: none; }
  .c-new { color: var(--ok); } .c-gone { color: var(--bad); } .c-down { color: var(--ok); } .c-up { color: var(--bad); } .c-qty { color: var(--low); }
  .down { color: var(--ok); font-weight: 700; } .up { color: var(--bad); font-weight: 700; }

  .ladder { background: var(--soft); border-bottom: 1px solid var(--line); padding: 4px 0; }
  .lr, .chg { display: flex; align-items: center; gap: 10px; padding: 7px 14px 7px 36px; font-size: 13.5px; }
  .lr b { min-width: 64px; }
  .lr.mine, .lst.mine { background: var(--accent-soft); }
  .lr .grow { display: block; color: var(--muted); }
  .chg .pill { min-width: 66px; text-align: center; }
  .chg.k-new .pill { background: var(--okbg); color: var(--ok); }
  .chg.k-gone .pill { background: var(--badbg); color: var(--bad); }
  .chg.k-down .pill { background: var(--okbg); color: var(--ok); }
  .chg.k-up .pill { background: var(--badbg); color: var(--bad); }
  .chg.k-qty .pill { background: var(--lowbg); color: var(--low); }

  .lst { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--line); }
  .lst .n { width: 26px; color: var(--muted); font-size: 12.5px; text-align: right; flex: none; }
</style>

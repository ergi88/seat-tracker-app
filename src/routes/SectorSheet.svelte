<script>
  /* One sector: what the team's last scan found (free seats, longest block,
   * the blocks row by row, the site's price), your requests and listings in
   * it, and what teammates list there. Opened from the stadium map or the
   * event's sector list. */
  import { untrack } from 'svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { ago, lek, money, win } from '../lib/fmt.js';

  let { eventKey, sectorId, table = null } = $props();
  const v = $derived(store.view);
  const ev = $derived(v ? v.events.find(e => e.key === eventKey) : null);
  const s = $derived(ev ? ev.sectors.find(x => x.id === String(sectorId)) : null);
  const scan = $derived(((store.scans || {})[eventKey] || {})[sectorId] || null);
  const sold = $derived(!!(s && s.meta && s.meta.status === 'soldout'));
  const price = $derived(s && s.summary && s.summary.price);
  const mine = $derived(v ? v.requests.filter(r => r.eventKey === eventKey && String(r.sec) === String(sectorId)) : []);
  const myListings = $derived(v ? v.listings.filter(l => l.eventKey === eventKey && String(l.sectorId) === String(sectorId)) : []);
  const team = $derived(v ? v.teamListings.filter(t => t.eventKey === eventKey && String(t.sectorId) === String(sectorId))
    .sort((a, b) => (a.price || 0) - (b.price || 0)) : []);
  /* Prices in this block (Posttick sells one block at several): per price,
   * the free seats out of all, and the longest run where only that price
   * sits side by side; dearest first. From the full scan. */
  const prices = $derived.by(() => {
    if (!ev || !ev.canPrices || !scan || scan.unmapped || !scan.rows) return [];
    const per = new Map();
    for (const row of scan.rows) for (const p of row.s) {
      const k = p[1] === null || p[1] === undefined ? '' : String(p[1]);
      const c = per.get(k) || { total: 0, free: 0 };
      c.total++; if (p[2]) c.free++;
      per.set(k, c);
    }
    const picked = new Set(mine.filter(r => !r.done).flatMap(r => r.cats.map(String)));
    return [...per.entries()].map(([k, c]) => {
      const cat = (ev.cats || {})[k] || {};
      return {
        key: k, color: cat.color || 'var(--muted)', label: cat.label || (k ? 'Price ' + k : 'No price'),
        price: cat.price ?? null, text: k ? SK.rules.priceText(ev.cats, k, ev.currency) : 'No price',
        free: c.free, total: c.total, longest: c.free ? SK.rules.blocksFor(scan, [k]).longest : 0, picked: picked.has(k),
        view: c.free ? SK.rules.blocksFor(scan, [k]) : null
      };
    }).sort((a, b) => (b.price || 0) - (a.price || 0));
  });
  /* ---------------- options for a group of N --------------------------
   * The question a request asks, without making one: how many groups of
   * N fit here, side by side or not, at the picked prices. Counted exactly
   * as the extension judges a request (core/rules.js optionsFor): every run
   * of free seats holds floor(run / N) groups, and on Posttick a seat at a
   * price you did not pick breaks a run. Starts from your open request here,
   * if there is one, else the last count you tried. */
  const start = untrack(() => (v ? v.requests.find(r => r.eventKey === eventKey && String(r.sec) === String(sectorId) && !r.done) : null));
  /* eFinity's bar tables: one sector, one row per table, a table free only
   * when every seat is (the site will not sell part of one) */
  const bar = $derived(!!(s && s.meta && s.meta.bar));
  const perTable = $derived(bar ? Number(s.meta.perTable) || 6 : 0);
  const startBar = untrack(() => !!(ev && ev.sectors.find(x => x.id === String(sectorId) && x.meta && x.meta.bar)));
  let qty = $state(start ? Number(start.qty) : startBar ? 6 : Number(store.deviceSettings.sheetQty) || 2);
  let together = $state(start ? start.together !== false : true);
  let pick = $state(start ? start.cats.map(String) : []);              // [] = every price
  const pickNames = $derived(pick.map(k => ((ev && ev.cats) || {})[k]).filter(Boolean).map(c => c.label));

  const view = $derived(scan && !scan.unmapped ? SK.rules.blocksFor(scan, pick.length ? pick : null) : null);
  const result = $derived(view ? SK.rules.optionsFor(view, qty, together) : null);
  const tables = $derived(bar && scan && scan.rows
    ? scan.rows.map(r => ({ n: Number(r.r) || r.r, free: r.s.length > 0 && r.s.every(p => p[2]) })).sort((a, b) => a.n - b.n) : []);
  const freeTables = $derived(tables.filter(t => t.free));
  const tapped = $derived(table && tables.length ? tables.find(t => String(t.n) === String(table)) || null : null);

  const verdict = $derived.by(() => {
    if (!view) return null;
    if (bar) {
      const sub = `${freeTables.length} of ${tables.length} tables free · ${perTable} seats each`;
      if (together && qty > perTable) return { tone: 'bad', text: `A table seats ${perTable}`, sub };
      if (!freeTables.length) return { tone: 'bad', text: 'No table free', sub };
      return { tone: 'ok', text: SK.util.plural(result.options, 'option'), sub };
    }
    if (view.available < qty) return { tone: 'bad', text: view.available ? `Only ${view.available} free` : 'Nothing free', sub: pick.length ? 'at the picked prices' : '' };
    if (together && !result.options) return { tone: 'bad', text: 'No block fits', sub: `${view.available} free, longest block ${view.longest}` };
    return { tone: 'ok', text: SK.util.plural(result.options, 'option'), sub: together ? `in ${SK.util.plural(result.perRow.length, 'row')}, longest block ${view.longest}` : `${view.available} free, anywhere in the block` };
  });

  function setQty(n) { qty = n; store.saveDeviceSettings({ sheetQty: n }); }
  function togglePrice(k) { pick = pick.includes(k) ? pick.filter(x => x !== k) : [...pick, k]; navigator.vibrate?.(6); }

  const othersWant = $derived(s ? s.wanted - mine.filter(r => !r.done).reduce((n, r) => n + Number(r.qty || 0), 0) : 0);
  let loading = $state(true);

  /* fetch on open; untracked, because fetching writes store.scans, which this sheet reads */
  $effect(() => {
    const [k, id] = [eventKey, sectorId];
    untrack(() => {
      loading = true;
      store.fetchScans(k, [id]).catch(() => {}).finally(() => { loading = false; });
    });
  });

  /* Free runs per row at the picked prices. Side by side, only the runs a
   * group fits stay, each with how many groups it holds; rows with none go. */
  const rowsAll = $derived.by(() => {
    if (!view) return [];
    const byRow = new Map();
    for (const b of view.blocks) {
      if (!byRow.has(b.row)) byRow.set(b.row, []);
      byRow.get(b.row).push({ len: b.len, fits: Math.floor(b.len / qty) });
    }
    return [...byRow.entries()].map(([row, runs]) => ({ row, runs, groups: runs.reduce((n, r) => n + r.fits, 0) }));
  });
  const rows = $derived((together ? rowsAll.filter(r => r.groups > 0).map(r => ({ ...r, runs: r.runs.filter(x => x.fits > 0) })) : rowsAll)
    .sort((a, b) => b.groups - a.groups || b.runs[0].len - a.runs[0].len || SK.rules.cmpRow(a.row, b.row)));
  const hiddenRows = $derived(rowsAll.length - rows.length);

  /* from one sheet to another: close this one first, as a native stack would */
  function then(fn) {
    router.closeSheet();
    setTimeout(fn, 320);
  }
  const add = () => then(() => router.go(href.add(eventKey) + '&sec=' + encodeURIComponent(s.code)));
  const openRequest = id => then(() => router.openSheet({ kind: 'request', id }));
  const openListing = id => then(() => router.openSheet({ kind: 'listing', id }));
</script>

{#if s}
  <Sheet title={s.code}>
    {#snippet head()}
      <div class="links">
        {#if s.url}<a class="link" href={s.url} target="_blank" rel="noopener"><Icon name="external" size={16} /><span>Seats<small>on {ev.siteLabel}</small></span></a>{/if}
        <button class="link" onclick={add}><Icon name="plus" size={16} /><span>Request<small>here</small></span></button>
        <button class="link" onclick={() => then(() => router.openSheet({ kind: 'message', eventKey, section: s.code }))}><Icon name="send" size={16} /><span>Tell<small>the team</small></span></button>
      </div>
    {/snippet}

    {#if s.name !== s.code}<p class="muted small center">{s.name}</p>{/if}
    <div class="tiles">
      <div class="tile"><b class="num">{s.summary && !s.summary.unmapped ? s.summary.available : '—'}</b><span>free</span></div>
      <div class="tile"><b class="num">{s.summary && s.summary.total ? s.summary.total : '—'}</b><span>seats</span></div>
      <div class="tile"><b class="num">{s.summary ? s.summary.longest ?? '—' : '—'}</b><span>longest block</span></div>
    </div>
    <p class="muted small center">
      {#if sold}<b class="bad">{ev.siteLabel} says sold out · </b>{/if}
      {s.summary ? `Read ${ago(s.summary.at)}` : 'No PC has read this sector yet.'}
      {#if price} · {price.min && price.min !== price.max ? `${money(price.min, price.currency)}–` : ''}{money(price.max, price.currency)} on {ev.siteLabel}{/if}
    </p>

    {#if bar && table}
      <div class="tapped {tapped ? (tapped.free ? 'ok' : 'bad') : ''}">
        <b>Table {table}</b>
        <span>{tapped ? (tapped.free ? `free · all ${perTable} seats` : 'taken (a part-sold table cannot be bought)') : 'not read yet'}</span>
      </div>
    {/if}

    {#if scan && !scan.unmapped}
      <div class="ask">
        <div class="ask-row">
          <span class="lbl">Tickets</span>
          <Stepper value={qty} onchange={setQty} max={99} />
        </div>
        <label class="ask-row">
          <span class="lbl">Side by side</span>
          <input type="checkbox" bind:checked={together} />
        </label>
        {#if verdict}
          <div class="verdict {verdict.tone}">
            <b class="num">{verdict.text}</b>
            <span>{verdict.sub}{pickNames.length ? ` · ${pickNames.join(' + ')}` : ''}</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if prices.length}
      <h3 class="section-title">Prices here{#if pick.length}<button class="reset" onclick={() => (pick = [])}>All prices</button>{/if}</h3>
      <div class="prices">
        {#each prices as c (c.key)}
          {@const n = c.view ? SK.rules.optionsFor(c.view, qty, together).options : 0}
          <button class="price" class:sold={!c.free} class:on={pick.includes(c.key)} onclick={() => togglePrice(c.key)}
            aria-pressed={pick.includes(c.key)} disabled={!c.key}>
            <span class="box" aria-hidden="true">{pick.includes(c.key) ? '✓' : ''}</span>
            <i style:background={c.color}></i>
            <span class="grow">
              <span class="name"><b>{c.label}</b><span class="muted">{c.key ? c.text : ''}</span>{#if c.picked}<span class="tag">your pick</span>{/if}</span>
              <span class="cnt num"><b>{c.free}</b>{' / ' + c.total + ' free'}</span>
            </span>
            <span class="opt num" class:zero={!n}>{n ? SK.util.plural(n, 'option') : '—'}</span>
          </button>
        {/each}
      </div>
      <p class="tiny muted note">Tap prices to count them together. Options per price are for {qty} ticket{qty === 1 ? '' : 's'}{together ? ' side by side' : ''}; another price between seats breaks a block.</p>
    {/if}

    {#if mine.length}
      <h3 class="section-title">Your requests</h3>
      <div class="list">
        {#each mine as r (r.id)}
          <button class="item {r.done ? 'none' : r.tone}" onclick={() => openRequest(r.id)}>
            <span class="grow"><span><b>#{r.num} ×{r.qty}</b>{#if r.priceTag}<span class="muted">{' · ' + r.priceTag}</span>{/if}{#if r.client}<span class="muted">{' · ' + r.client}</span>{/if}</span>
              <span class="sub">{r.free ?? '—'} free · {SK.util.plural(r.options, 'option')}</span></span>
            {#if r.profit && !r.profit.missing}<span class="num small {r.profit.total >= 0 ? 'ok' : 'bad'}">{lek(r.profit.total, true)}</span>{/if}
            <span class="pill {r.done ? 'none' : r.tone}">{r.done ? 'DONE' : r.status}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if myListings.length}
      <h3 class="section-title">Your listings</h3>
      <div class="list">
        {#each myListings as l (l.id)}
          <button class="item listing" onclick={() => openListing(l.id)}>
            <span class="grow"><b class="num">{l.tickets ?? '?'} × {money(l.price, l.currency)}</b>
              <span class="sub">{l.status || '—'} · read {ago(l.seenAt)}</span></span>
            {#if l.money && !l.money.missing}<span class="num small {l.money.total >= 0 ? 'ok' : 'bad'}">{lek(l.money.total, true)} {win(l.money.winRate)}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if team.length || othersWant > 0}
      <h3 class="section-title">Team here</h3>
      <div class="list">
        {#each team as t (t.id)}
          <div class="item static"><span class="grow">{t.owner}<span class="sub">{t.tickets ?? '?'} tickets · {ago(t.seenAt)}</span></span><b class="num">{money(t.price, t.currency)}</b></div>
        {/each}
        {#if othersWant > 0}<div class="item static"><span class="grow muted">Teammates want {othersWant} ticket{othersWant === 1 ? '' : 's'} here</span></div>{/if}
      </div>
    {/if}

    {#if loading && !scan}
      <div class="skeleton"></div>
    {:else if bar && tables.length}
      <h3 class="section-title">Free tables · {freeTables.length}</h3>
      {#if freeTables.length}
        <div class="tables">
          {#each freeTables as t (t.n)}<span class="tchip num" class:hit={String(t.n) === String(table)}>{t.n}</span>{/each}
        </div>
      {:else}
        <p class="muted small">Every table has someone at it.</p>
      {/if}
      <p class="tiny muted note">A table counts only when all {perTable} seats are free: eFinity will not sell fewer than four of them, so the seats left at a part-sold table cannot be bought.</p>
    {:else if view}
      <h3 class="section-title">{together ? `Rows that fit ${qty}` : 'Free seats by row'}{pickNames.length ? ' · ' + pickNames.join(' + ') : ''}</h3>
      {#if rows.length}
        <div class="rows">
          {#each rows as row (row.row)}
            <div class="r">
              <span class="muted">Row {row.row}</span>
              <span class="runs">
                {#each row.runs as run}<span class="run num" class:short={together && !run.fits} title="{run.len} side by side">{run.len}{#if run.fits > 1}<small>×{run.fits}</small>{/if}</span>{/each}
              </span>
              {#if together}<b class="grp num">{SK.util.plural(row.groups, 'option')}</b>{/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="muted small">No row has {qty} free seats side by side{pickNames.length ? ' at these prices' : ''}.</p>
      {/if}
      {#if together && hiddenRows > 0}<p class="tiny muted note">{SK.util.plural(hiddenRows, 'more row')} with free seats, but no block of {qty}.</p>{/if}
    {/if}
  </Sheet>
{/if}

<style>
  .center { text-align: center; margin: 4px 0 10px; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; }
  .tile { background: var(--soft); border-radius: 12px; padding: 12px; display: grid; text-align: center; }
  .tile b { font-size: 24px; }
  .tile span { font-size: 12px; color: var(--muted); }
  .links { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .link {
    flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 6px 12px; border-radius: 12px; border: 0; cursor: pointer;
    background: var(--accent-soft); color: var(--accent); font-weight: 650; font-size: 14px; text-align: left;
  }
  .link span { display: grid; line-height: 1.15; }
  .link small { font-weight: 500; font-size: 11px; opacity: .8; }
  .list { display: grid; gap: 6px; }
  .item {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; cursor: pointer;
    padding: 10px 12px; border: 0; border-radius: 12px; background: var(--soft); border-left: 4px solid transparent; color: var(--ink);
  }
  .item.ok { border-left-color: var(--s-ok); } .item.low { border-left-color: var(--s-low); } .item.bad { border-left-color: var(--s-bad); }
  .item.listing { border-left-color: var(--map-listing); }
  .item.static { cursor: default; }
  .item .grow { flex: 1; min-width: 0; display: grid; }
  .item .sub { font-size: 12px; color: var(--muted); }
  .tapped { margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--soft); border-left: 4px solid var(--s-none); display: grid; }
  .tapped.ok { border-left-color: var(--s-ok); } .tapped.ok b { color: var(--ok); }
  .tapped.bad { border-left-color: var(--s-bad); } .tapped.bad b { color: var(--bad); }
  .tapped span { font-size: 13px; color: var(--muted); }
  .tables { display: flex; flex-wrap: wrap; gap: 6px; }
  .tchip { min-width: 40px; padding: 6px 8px; border-radius: 8px; text-align: center; font-weight: 750; font-size: 14px; background: var(--okbg); color: var(--ok); }
  .tchip.hit { background: var(--ok); color: #fff; }
  .ask { margin-top: 12px; background: var(--soft); border-radius: 12px; padding: 4px 14px 12px; }
  .ask-row { display: flex; align-items: center; justify-content: space-between; min-height: 50px; }
  .ask-row + .ask-row { border-top: 1px solid var(--line); }
  .ask-row .lbl { font-weight: 600; }
  .ask-row input[type=checkbox] { width: 24px; height: 24px; accent-color: var(--accent); }
  .verdict { margin-top: 6px; padding: 10px 12px; border-radius: 10px; display: grid; gap: 2px; border-left: 4px solid var(--s-none); background: var(--panel); }
  .verdict b { font-size: 22px; }
  .verdict span { font-size: 13px; color: var(--muted); }
  .verdict.ok { border-left-color: var(--s-ok); } .verdict.ok b { color: var(--ok); }
  .verdict.bad { border-left-color: var(--s-bad); } .verdict.bad b { color: var(--bad); }
  .reset { margin-left: 10px; border: 0; background: none; color: var(--accent); font-weight: 650; font-size: 12px; text-transform: none; letter-spacing: 0; cursor: pointer; padding: 0; }
  .prices { display: grid; gap: 4px; }
  .price {
    display: grid; grid-template-columns: 20px 12px 1fr auto; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 9px 12px; border: 0; border-radius: 10px; background: var(--soft); color: var(--ink); font-size: 14px; cursor: pointer;
  }
  .price:disabled { cursor: default; }
  .price .box { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 13px; font-weight: 800; color: var(--accent-ink); }
  .price.on { box-shadow: inset 0 0 0 1.5px var(--accent); background: var(--accent-soft); }
  .price.on .box { background: var(--accent); border-color: var(--accent); }
  .price .opt { text-align: right; font-size: 12px; font-weight: 700; color: var(--ok); }
  .price .opt.zero { color: var(--muted); font-weight: 500; }
  .price i { width: 12px; height: 12px; border-radius: 50%; }
  .price.sold { opacity: .5; }
  .price .grow { display: grid; gap: 1px; min-width: 0; }
  .price .name { display: flex; align-items: center; gap: 6px; white-space: nowrap; min-width: 0; }
  .price .cnt { font-size: 12px; color: var(--muted); }
  .price .cnt b { color: var(--ink); }
  .price .tag { font-size: 11px; font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 1px 6px; border-radius: 99px; }
  .note { margin: 6px 4px 0; }
  .rows { display: grid; gap: 4px; }
  .r { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 10px; padding: 8px 12px; background: var(--soft); border-radius: 10px; font-size: 14px; }
  .runs { display: flex; flex-wrap: wrap; gap: 4px; }
  .run { min-width: 26px; padding: 1px 6px; border-radius: 6px; background: var(--okbg); color: var(--ok); font-weight: 700; text-align: center; }
  .run small { font-weight: 600; opacity: .75; margin-left: 2px; }
  .grp { font-size: 12px; color: var(--ok); white-space: nowrap; }
</style>

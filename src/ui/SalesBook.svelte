<script>
  /* Money → Sales: your viagogo sales as the extension's My Sales drawer
   * shows them — totals (profit, sold, spent, you get), then each event with
   * its sections or all its sales, every sale with its date, tickets, row,
   * sale number, buy price, what it sold for, profit and spent + profit.
   *
   * Sales are numbered per event, oldest first, so a number stays the same
   * when new sales come in. "Select" lets you tick any sales — say 1, 6 and 8
   * of one event — and the bar at the bottom adds them up. */
  import { SK } from '../lib/sk.js';
  import { lek, money, win, fromToday } from '../lib/fmt.js';
  import { byNearest } from '../lib/model.js';

  /* sales: the ones shown (the search may hide some); every: all of yours,
   * for the numbers and the ticked ones, so a search never changes them */
  let { sales = [], every = null, empty } = $props();
  const all = $derived(every || sales);

  const P = SK.profit;
  const S = SK.sales;

  /* ---------------- grouping and numbering --------------------------- */

  const g = $derived.by(() => {
    const out = S.groupSales(sales);
    for (const e of out.events) {
      const first = e.sections[0] && e.sections[0].sales[0];
      e.time = first ? first.time : null;
      e.num = first ? first.eventNum : null;
      e.all = e.sections.flatMap(x => x.sales).sort(byDate);
    }
    out.events.sort((a, b) => byNearest()(a, b) || String(b.lastSold).localeCompare(String(a.lastSold)));
    return out;
  });
  const byDate = (a, b) => String(b.soldAt || b.soldOn || '').localeCompare(String(a.soldAt || a.soldOn || '')) || String(b.id).localeCompare(String(a.id));
  /* sale id -> its number in its event, 1 = the oldest */
  const numbers = $derived.by(() => {
    const out = {};
    for (const e of S.groupSales(all).events) e.sections.flatMap(x => x.sales).sort(byDate).reverse().forEach((s, i) => { out[s.id] = i + 1; });
    return out;
  });

  /* ---------------- open, view, selection ---------------------------- */

  let openEv = $state(new Set());
  let openSec = $state(new Set());
  let openSale = $state('');
  let views = $state({});                          // event key -> 'sections' | 'all'
  let selecting = $state(false);
  let picked = $state(new Set());

  const flip = (set, k) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const viewOf = e => views[e.key] || 'sections';

  function tapSale(s) {
    if (selecting) { picked = flip(picked, s.id); navigator.vibrate?.(5); }
    else openSale = openSale === s.id ? '' : s.id;
  }
  /* a whole event or section at once: all on, or all off if they already are */
  const allPicked = list => list.length > 0 && list.every(s => picked.has(s.id));
  const somePicked = list => list.some(s => picked.has(s.id));
  function pickAll(list) {
    const n = new Set(picked);
    const on = !allPicked(list);
    for (const s of list) { if (on) n.add(s.id); else n.delete(s.id); }
    picked = n;
    navigator.vibrate?.(5);
  }
  function startSelect() { selecting = true; }
  function stopSelect() { selecting = false; picked = new Set(); }

  /* what the ticked sales come to, the same sums as everywhere else */
  const chosen = $derived(all.filter(s => picked.has(s.id)));
  const chosenTotal = $derived(chosen.length ? S.groupSales(chosen).total : null);
  /* "Albania vs Finland 1, 6, 8 · Kosovo 2" */
  const chosenNames = $derived(S.groupSales(chosen).events.map(e => {
    const ns = e.sections.flatMap(x => x.sales).map(s => numbers[s.id]).sort((a, b) => a - b);
    return `${shortTitle(e)} ${ns.join(', ')}`;
  }).join(' · '));

  /* ---------------- words -------------------------------------------- */

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* "2026-10-06T20:45:00" -> "Tue, 06 Oct 2026 · 20:45", as the drawer writes it */
  function fmtDate(v, withTime) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || ''));
    if (!m) return String(v || '');
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const day = `${DAYS[d.getUTCDay()]}, ${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
    return withTime && m[4] ? `${day} · ${m[4]}:${m[5]}` : day;
  }
  /* "06 Oct", with the year only when it is not this one */
  const shortDate = v => { const f = fmtDate(v); return f ? f.replace(/^\w+, /, '').replace(` ${new Date().getFullYear()}`, '') : '—'; };
  const soldText = sold => Object.entries(sold || {}).map(([c, n]) => money(n, c)).join(' + ') || '—';
  const bare = (n, signed) => lek(n, signed).replace(/\s*L$/, '');
  const tone = n => (n >= 0 ? 'ok' : 'bad');
  const titleOf = e => (e.num ? `[${e.num}] ${e.title || 'Unknown event'}` : e.title || 'Unknown event');
  const shortTitle = e => String(e.title || '?').split(/\s+-\s+|\s+·\s+/)[0];
</script>

{#snippet sumLine(t)}
  <span class="sum">
    <span class="sr1">
      <span>{t.tickets} ticket{t.tickets === 1 ? '' : 's'} · {t.sales} sale{t.sales === 1 ? '' : 's'}</span>
      {#if t.counted}<b class="num {tone(t.profitL)}">{lek(t.profitL, true)} <small>{win(t.winRate)}</small></b>
      {:else}<span class="muted">no buy price</span>{/if}
    </span>
    <span class="sr2 num">
      sold {soldText(t.sold)} · {t.counted ? `spent ${lek(t.costL)}${t.counted < t.sales ? ` (${t.counted} of ${t.sales})` : ''}` : 'spent —'}{#if t.counted} · <b class="nw">you get {lek(t.costL + t.profitL)}</b>{/if}
    </span>
  </span>
{/snippet}

{#snippet check(on, some)}
  <span class="tick" class:on class:some={!on && some} aria-hidden="true">{on ? '✓' : some ? '–' : ''}</span>
{/snippet}

{#snippet saleRow(s, withSection)}
  {@const m = s.money || {}}
  {@const paid = S.isPaid(s)}
  <button class="sale" class:unpaid={!paid} class:sel={picked.has(s.id)} aria-pressed={selecting ? picked.has(s.id) : undefined}
    aria-expanded={selecting ? undefined : openSale === s.id} onclick={() => tapSale(s)}>
    {#if selecting}{@render check(picked.has(s.id), false)}{/if}
    <span class="no num" title="Sale {numbers[s.id]} of this event, oldest first">{numbers[s.id]}</span>
    <span class="body">
      <span class="l1">
        <span class="sd num">{shortDate(s.soldOn)}</span>
        <span class="sq">{[withSection ? s.section : '', `${s.tickets || '?'} tkt`, s.row ? 'row ' + s.row : ''].filter(Boolean).join(' · ')}</span>
        <span class="sp num">{money(s.amount, s.currency)}</span>
      </span>
      <span class="l2">
        <span class="sn num">#{s.id} · {s.buy ? `bought ${money(s.buy.amount, s.buy.currency)} each` : 'no buy price'}</span>
        <b class="num {m.missing === null ? tone(m.profitL) : 'muted'}">{m.missing === null ? lek(m.profitL, true) : '—'}</b>
      </span>
      {#if m.missing === null}
        <span class="sg num">spent {bare(m.costL)} + profit {bare(m.profitL, true)} = <b class="nw">you get {lek(m.costL + m.profitL)}</b></span>
      {/if}
      {#if !paid}<span class="pill low">not paid yet</span>{/if}
      {#if !selecting && openSale === s.id}
        <span class="more">
          {#if s.soldAt}<span>Sold {fmtDate(s.soldAt, true)}</span>{/if}
          <span>Sale {s.id}{s.listingId ? ` · listing ${s.listingId}` : ''}{s.requestNum ? ` · request #${s.requestNum}` : ''}</span>
          <span>{s.status || 'status unknown'}{s.when ? ` · event ${fmtDate(s.when, true)}` : ''}</span>
          <span>{s.buy ? `Bought at ${money(s.buy.amount, s.buy.currency)} a ticket (${s.buy.source || 'buy price'})` : 'No buy price known: type one on the extension\'s sales drawer'}</span>
          {#if m.missing === null}<span>Sold {lek(m.payoutL)} − spent {lek(m.costL)} = {lek(m.profitL, true)} · {win(m.winRate)}</span>
          {:else if Number.isFinite(m.payoutL)}<span>Sold {lek(m.payoutL)} in lek</span>{/if}
          {#if m.rateDay}<span>Lek at the rates of {m.rateDay}</span>{/if}
        </span>
      {/if}
    </span>
  </button>
{/snippet}

{#if g.total.sales}
  {@const t = g.total}
  <div class="tiles">
    <div><b class="num {t.counted ? tone(t.profitL) : ''}">{t.counted ? lek(t.profitL, true) : '—'}</b><span>profit{t.counted ? ` · ${win(t.winRate).replace(/[()]/g, '')}` : ''}</span></div>
    <div class:warn={t.unpaid}><b class="num">{soldText(t.sold)}</b><span>sold · {t.tickets} tickets{t.unpaid ? ` · ${lek(t.unpaidL)} not paid` : ''}</span></div>
    <div><b class="num">{t.counted ? lek(t.costL) : '—'}</b><span>spent{t.noBuy ? ` · ${t.noBuy} no buy price` : ''}</span></div>
    <div><b class="num">{t.counted ? lek(t.costL + t.profitL) : '—'}</b><span>you get · spent + profit</span></div>
  </div>
  {#if t.noBuy}<p class="muted small note">{t.noBuy} sale{t.noBuy === 1 ? ' has' : 's have'} no buy price, so {t.noBuy === 1 ? 'it is' : 'they are'} left out of profit, spent and you get.</p>{/if}

  <div class="head">
    <h2 class="section-title">Events · {g.events.length}</h2>
    {#if selecting}
      <button class="btn small" onclick={stopSelect}>Done</button>
    {:else}
      <button class="btn small" onclick={startSelect} title="Tick sales to add them up">Select</button>
    {/if}
  </div>
  {#if selecting}<p class="muted small note">Tap sales to add them up. Numbers go 1, 2, 3… from each event's oldest sale.</p>{/if}
{/if}

{#each g.events as e (e.key)}
  {@const open = openEv.has(e.key) || selecting}
  <div class="ev group" class:open>
    <div class="evhead">
      {#if selecting}
        <button class="tickbtn" onclick={() => pickAll(e.all)} aria-label="Select every sale of {e.title}">{@render check(allPicked(e.all), somePicked(e.all))}</button>
      {/if}
      <button class="evtop" onclick={() => (openEv = flip(openEv, e.key))} aria-expanded={open}>
        <span class="caret" aria-hidden="true">▸</span>
        <span class="grow">
          <span class="title">{titleOf(e)}</span>
          <span class="sub">{e.when ? fmtDate(e.when, true) : ''}{e.time !== null && e.time !== undefined ? ` (${fromToday(e.time)})` : ''}{e.when ? ' · ' : ''}last sale {shortDate(e.lastSold)}</span>
        </span>
        {#if e.total.unpaid}<span class="pill low">{e.total.unpaid} unpaid</span>{/if}
      </button>
    </div>
    <div class="evsum">{@render sumLine(e.total)}</div>

    {#if open}
      <div class="tabs" role="tablist">
        {#each [['sections', 'By section'], ['all', 'All sales']] as [k, label] (k)}
          <button role="tab" aria-selected={viewOf(e) === k} class:on={viewOf(e) === k} onclick={() => (views = { ...views, [e.key]: k })}>{label}</button>
        {/each}
      </div>
      {#if viewOf(e) === 'all'}
        <div class="list">{#each e.all as s (s.id)}{@render saleRow(s, true)}{/each}</div>
      {:else}
        {#each e.sections as sec (sec.section)}
          {@const k = e.key + '|' + sec.section}
          {@const so = openSec.has(k) || selecting}
          <div class="sec" class:open={so}>
            <div class="sechead">
              {#if selecting}
                <button class="tickbtn" onclick={() => pickAll(sec.sales)} aria-label="Select every sale in {sec.section}">{@render check(allPicked(sec.sales), somePicked(sec.sales))}</button>
              {/if}
              <button class="sectop" onclick={() => (openSec = flip(openSec, k))} aria-expanded={so}>
                <span class="caret" aria-hidden="true">▸</span><b>{sec.section}</b>
                {@render sumLine(sec.total)}
              </button>
            </div>
            {#if so}<div class="list">{#each sec.sales as s (s.id)}{@render saleRow(s, false)}{/each}</div>{/if}
          </div>
        {/each}
      {/if}
    {/if}
  </div>
{:else}
  {@render empty?.()}
{/each}

{#if selecting}
  <div class="spacer" aria-hidden="true"></div>
  <div class="selbar" role="status" aria-live="polite">
    {#if chosenTotal}
      {@const t = chosenTotal}
      <div class="s1">
        <b>{t.sales} selected · {t.tickets} ticket{t.tickets === 1 ? '' : 's'}</b>
        <button class="btn small" onclick={() => (picked = new Set())}>Clear</button>
      </div>
      <p class="which">{chosenNames}</p>
      <div class="grid num">
        <span><small>sold</small>{soldText(t.sold)}</span>
        <span><small>spent</small>{t.counted ? lek(t.costL) : '—'}</span>
        <span class={t.counted ? tone(t.profitL) : ''}><small>profit {t.counted ? win(t.winRate) : ''}</small>{t.counted ? lek(t.profitL, true) : '—'}</span>
        <span class="get"><small>you get</small>{t.counted ? lek(t.costL + t.profitL) : '—'}</span>
      </div>
      {#if t.noBuy || t.unpaid}
        <p class="which">{t.noBuy ? `${t.noBuy} without a buy price left out of spent and profit` : ''}{t.noBuy && t.unpaid ? ' · ' : ''}{t.unpaid ? `${t.unpaid} not paid yet (${lek(t.unpaidL)})` : ''}</p>
      {/if}
    {:else}
      <div class="s1"><b>Tap sales to add them up</b><button class="btn small" onclick={stopSelect}>Done</button></div>
    {/if}
  </div>
{/if}

<style>
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
  .tiles div { background: var(--panel); border-radius: var(--r-card); padding: 12px; display: grid; gap: 2px; box-shadow: 0 1px 0 var(--line); min-width: 0; }
  .tiles div.warn { box-shadow: inset 3px 0 0 var(--s-low), 0 1px 0 var(--line); }
  .tiles b { font-size: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tiles span { font-size: 12px; color: var(--muted); }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .note { margin: 8px 4px 0; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
  .head .btn { margin-bottom: 6px; }

  .ev { margin-bottom: 10px; }
  .evhead, .sechead { display: flex; align-items: stretch; }
  .evtop, .sectop { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; }
  .evtop { padding: 12px 14px 4px; }
  .evtop .grow { flex: 1; min-width: 0; display: grid; }
  .evtop .title { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .evtop .sub { font-size: 12.5px; color: var(--muted); }
  .caret { flex: none; width: 14px; color: var(--muted); transition: transform .2s; display: inline-block; font-size: 15px; line-height: 1; text-align: center; }
  .open > .evhead .caret, .sec.open .caret { transform: rotate(90deg); }
  .evsum { padding: 0 14px 12px 36px; }

  .sum { display: grid; gap: 1px; min-width: 0; flex: 1; }
  .sr1 { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
  .sr1 small { font-weight: 500; opacity: .8; }
  .sr2 { font-size: 12.5px; color: var(--muted); }
  .sr2 b { color: var(--ink); font-weight: 650; }
  .nw { white-space: nowrap; }

  .tabs { display: grid; grid-template-columns: 1fr 1fr; margin: 0 14px 8px; padding: 3px; border-radius: 10px; background: var(--softer); }
  .tabs button { min-height: 30px; border: 0; border-radius: 8px; background: none; font-weight: 600; font-size: 13px; color: var(--muted); cursor: pointer; }
  .tabs button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }

  .sec { border-top: 1px solid var(--line); }
  .sectop { padding: 10px 14px; align-items: flex-start; }
  .sectop > b { min-width: 52px; }
  .list { border-top: 1px solid var(--line); background: var(--soft); }

  .sale { display: flex; gap: 10px; width: 100%; padding: 10px 14px; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; align-items: flex-start; }
  .sale + .sale { border-top: 1px solid var(--line); }
  .sale:active { background: var(--softer); }
  .sale.sel { background: var(--accent-soft); }
  .sale.unpaid { box-shadow: inset 3px 0 0 var(--s-low); }
  .no { flex: none; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 99px; background: var(--softer); display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--muted); }
  .sel .no { background: var(--accent); color: var(--accent-ink); }
  .body { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; justify-items: start; }
  .l1, .l2 { display: flex; gap: 8px; width: 100%; align-items: baseline; }
  .sd { font-weight: 650; flex: none; }
  .sq { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sp { font-weight: 650; flex: none; }
  .sn { flex: 1; min-width: 0; font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .l2 b { flex: none; font-size: 14px; }
  .sg { font-size: 12.5px; color: var(--muted); }
  .sg b { color: var(--ink); font-weight: 650; }
  .more { display: grid; gap: 2px; margin-top: 4px; padding: 8px 10px; border-radius: 10px; background: var(--panel); font-size: 12.5px; color: var(--muted); width: 100%; box-sizing: border-box; }

  .tickbtn { flex: none; border: 0; background: none; padding: 0 0 0 14px; cursor: pointer; display: grid; place-items: center; }
  .tick { flex: none; width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--line); display: grid; place-items: center; font-size: 13px; font-weight: 800; color: var(--accent-ink); background: var(--panel); margin-top: 1px; box-sizing: border-box; }
  .tick.on { background: var(--accent); border-color: var(--accent); }
  .tick.some { border-color: var(--accent); color: var(--accent); }

  .spacer { height: 150px; }
  .selbar {
    position: fixed; z-index: 6; left: calc(10px + var(--safe-l)); right: calc(10px + var(--safe-r));
    bottom: calc(var(--tabbar-h) + var(--safe-b) + 8px); max-width: 660px; margin: 0 auto;
    padding: 10px 14px; border-radius: 16px; display: grid; gap: 4px;
    background: color-mix(in srgb, var(--panel) 92%, transparent); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    box-shadow: 0 6px 24px var(--shadow), 0 0 0 1px var(--line);
  }
  .s1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .which { margin: 0; font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .grid span { display: grid; font-weight: 700; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grid small { font-weight: 500; font-size: 11.5px; color: var(--muted); }
  .grid .get { color: var(--accent); }
</style>

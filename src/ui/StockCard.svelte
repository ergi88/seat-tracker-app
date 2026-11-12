<script>
  /* An event's stock: the tickets you hold, how many are sold, listed on
   * viagogo or not listed yet, per section, and the money: spent, paid back,
   * and what the tickets left must bring to break even. See lib/stock.js. */
  import { lek, money, plural } from '../lib/fmt.js';

  let { ev } = $props();
  const st = $derived(ev.stock);
  const t = $derived(st ? st.total : null);
  const pct = n => (t && t.held ? (n / t.held) * 100 : 0);
  let showSections = $state(false);
</script>

{#if st}
  <h2 class="section-title">Stock · {plural(t.held, 'ticket')}</h2>
  <div class="card">
    <div class="bar" role="img" aria-label="{t.sold} sold, {t.listed} listed, {t.unlisted} not listed of {t.held}">
      <i class="sold" style:width="{pct(t.sold)}%"></i>
      <i class="listed" style:width="{pct(Math.min(t.listed, t.inHand))}%"></i>
      <i class="unlisted" style:width="{pct(t.unlisted)}%"></i>
    </div>
    <div class="legend">
      <span><i class="sold"></i>Sold <b class="num">{t.sold}</b></span>
      <span><i class="listed"></i>Listed <b class="num">{t.listed}</b></span>
      <span><i class="unlisted"></i>Not listed <b class="num">{t.unlisted}</b></span>
    </div>

    <div class="tiles">
      <div><span>Spent</span><b class="num">{lek(t.spentL)}</b><span>{plural(t.held - t.unpriced, 'ticket')}{t.unpriced ? ` · ${t.unpriced} no price` : ''}</span></div>
      <div class:warn={t.unpaid}><span>From sales</span><b class="num">{lek(t.payoutL)}</b><span>{t.unpaid ? `${lek(t.unpaidL)} not paid yet` : t.sold ? 'all paid' : 'nothing sold yet'}</span></div>
      <div><span>Still holding</span><b class="num">{plural(t.inHand, 'ticket')}</b><span>{t.inHand ? `cost ${lek(t.leftCostL)}` : 'all sold'}</span></div>
      {#if t.netL >= 0}
        <div class="good"><span>Covered</span><b class="num ok">{lek(t.netL, true)}</b><span>{t.inHand ? 'the rest is profit' : 'final result'}</span></div>
      {:else}
        <div class="warn"><span>To break even</span><b class="num bad">{lek(t.toGoL)}</b>
          <span>{t.inHand ? `${lek(t.toGoEachL)} per ticket left` : 'nothing left to sell'}</span></div>
      {/if}
    </div>

    {#if t.ask}
      <p class="line">List the {plural(t.inHand, 'ticket')} left at <b class="num">{money(t.ask.amount, t.ask.currency)}</b> or more each{t.ask.payoutOnly ? ' payout' : ''} to get your money back.</p>
    {/if}
    {#if t.ifListedL !== null}
      <p class="line">If the {plural(t.listed, 'listed ticket')} sell at today's price, you end at <b class="num" class:ok={t.ifListedL >= 0} class:bad={t.ifListedL < 0}>{lek(t.ifListedL, true)}</b>{t.unlisted ? `, with ${plural(t.unlisted, 'ticket')} still to list` : ''}.</p>
    {/if}
    {#if t.extra}
      <p class="line muted">{plural(t.extra, 'sold or listed ticket')} had no purchase saved; counted at the buy price their sale or listing shows.</p>
    {/if}
    {#if t.unpriced}
      <p class="line muted">{plural(t.unpriced, 'ticket')} have no buy price, so Spent leaves them out. Set one in the Price list.</p>
    {/if}

    <button class="more" onclick={() => (showSections = !showSections)} aria-expanded={showSections}>
      <span class="caret">›</span> By section · {st.rows.length}
    </button>
    {#if showSections}
      <div class="table" role="table">
        <div class="tr th" role="row"><span>Section</span><span>Held</span><span>Sold</span><span>Listed</span><span>Unlisted</span><span>Each</span></div>
        {#each st.rows as r (r.key)}
          <div class="tr" role="row">
            <span class="code">{r.code}</span>
            <span class="num">{r.held}</span>
            <span class="num">{r.sold || '–'}</span>
            <span class="num">{r.listed || '–'}</span>
            <span class="num" class:low={r.unlisted}>{r.unlisted || '–'}</span>
            <span class="num muted">{r.each !== null ? lek(r.each) : '?'}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .card { background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line); padding: 14px; margin-bottom: 14px; display: grid; gap: 10px; }
  .bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--softer); }
  .bar i { display: block; height: 100%; }
  .sold { background: var(--s-ok); }
  .listed { background: var(--accent); }
  .unlisted { background: var(--s-low); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
  .legend b { color: var(--ink); font-weight: 700; }

  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tiles div { background: var(--soft); border-radius: 12px; padding: 10px 12px; display: grid; gap: 2px; min-width: 0; }
  .tiles div.warn { box-shadow: inset 3px 0 0 var(--s-low); }
  .tiles div.good { box-shadow: inset 3px 0 0 var(--s-ok); }
  .tiles b { font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tiles span { font-size: 12px; color: var(--muted); }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .line { margin: 0; font-size: 13.5px; }
  .line.muted { font-size: 12.5px; }

  .more { display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 4px 0; font: inherit; font-size: 13.5px; font-weight: 650; color: var(--accent); cursor: pointer; text-align: left; }
  .caret { display: inline-block; font-size: 16px; line-height: 1; transition: transform .2s; }
  [aria-expanded='true'] .caret { transform: rotate(90deg); }
  .table { display: grid; font-size: 13.5px; }
  .tr { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr); gap: 6px; padding: 7px 0; border-top: 1px solid var(--line); align-items: center; }
  .tr > span:not(.code) { text-align: right; }
  .th { font-size: 11.5px; color: var(--muted); font-weight: 650; border-top: 0; padding-top: 0; }
  .code { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .low { color: var(--low); font-weight: 700; }
</style>

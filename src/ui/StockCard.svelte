<script>
  /* An event's stock: its lots (what you bought), how many of their tickets
   * are sold, listed on viagogo or not listed yet, and the money: spent,
   * back from their sales, and what the tickets left must bring to break
   * even. Listings and sales with no lot are not stock: they are counted
   * apart, as tickets still to buy. See lib/lots.js. */
  import Icon from './Icon.svelte';
  import { router, href } from '../lib/router.svelte.js';
  import { lek, money, plural } from '../lib/fmt.js';

  let { ev } = $props();
  const st = $derived(ev.stock);
  const t = $derived(st ? st.total : null);
  const pct = n => (t && t.bought ? (n / t.bought) * 100 : 0);
  let showLots = $state(false);
</script>

{#if st && (st.lots.length || t.toBuy)}
  <h2 class="section-title">Stock · {plural(t.inHand, 'ticket')} in hand</h2>
  <div class="card">
    {#if st.lots.length}
      <div class="bar" role="img" aria-label="{t.sold} sold, {t.listed} listed, {t.free} not listed of {t.bought}">
        <i class="sold" style:width="{pct(t.sold)}%"></i>
        <i class="listed" style:width="{pct(t.listed)}%"></i>
        <i class="unlisted" style:width="{pct(t.free)}%"></i>
        <i class="gone" style:width="{pct(t.unsold)}%"></i>
      </div>
      <div class="legend">
        <span><i class="sold"></i>Sold <b class="num">{t.sold}</b></span>
        <span><i class="listed"></i>Listed <b class="num">{t.listed}</b></span>
        <span><i class="unlisted"></i>Not listed <b class="num">{t.free}</b></span>
        {#if t.unsold}<span><i class="gone"></i>Unsold <b class="num">{t.unsold}</b></span>{/if}
      </div>

      <div class="tiles">
        <div><span>Spent</span><b class="num">{lek(t.spentL)}</b><span>{plural(t.bought, 'ticket')}{t.unpriced ? ` · ${t.unpriced} no price` : ''}</span></div>
        <div class:warn={t.unpaidL > 0}><span>From their sales</span><b class="num">{lek(t.payoutL)}</b><span>{t.unpaidL > 0 ? `${lek(t.unpaidL)} not paid yet` : t.sold ? 'all paid' : 'nothing sold yet'}</span></div>
        <div><span>Still holding</span><b class="num">{plural(t.inHand, 'ticket')}</b><span>{t.inHand ? `cost ${lek(t.leftCostL)}` : t.unsold ? `${t.unsold} unsold, event over` : 'all sold'}</span></div>
        {#if t.netL >= 0}
          <div class="good"><span>Covered</span><b class="num ok">{lek(t.netL, true)}</b><span>{t.inHand ? 'the rest is profit' : 'final result'}</span></div>
        {:else}
          <div class="warn"><span>{t.inHand ? 'At risk' : 'Lost'}</span><b class="num bad">{lek(t.toGoL)}</b>
            <span>{t.inHand ? `${lek(t.toGoEachL)} per ticket left` : t.noPrice ? `${plural(t.noPrice, 'ticket')} sold with no price` : 'nothing left to sell'}</span></div>
        {/if}
      </div>

      {#if t.ask}
        <p class="line">List the {plural(t.inHand, 'ticket')} left at <b class="num">{money(t.ask.amount, t.ask.currency)}</b> or more each{t.ask.payoutOnly ? ' payout' : ''} to get your money back.</p>
      {/if}
      {#if t.ifListedL !== null}
        <p class="line">If the {plural(t.listed, 'listed ticket')} sell at today's price, you end at <b class="num" class:ok={t.ifListedL >= 0} class:bad={t.ifListedL < 0}>{lek(t.ifListedL, true)}</b>{t.free ? `, with ${plural(t.free, 'ticket')} still to list` : ''}.</p>
      {/if}
      {#if t.unpriced}
        <p class="line muted">{plural(t.unpriced, 'ticket')} have no buy price, so Spent leaves them out. Open the lot to add it.</p>
      {/if}
    {:else}
      <p class="line">No lots for this event: you hold 0 tickets.</p>
    {/if}
    {#if t.toBuy}
      <p class="line muted">{plural(t.toBuy, 'ticket')} listed or sold here with no lot: still to buy. <a class="go" href={href.inventory()}>Inventory</a></p>
    {/if}

    {#if st.lots.length}
      <button class="more" onclick={() => (showLots = !showLots)} aria-expanded={showLots}>
        <span class="caret">›</span> Lots · {st.lots.length}
      </button>
      {#if showLots}
        <div>
          {#each st.lots as lot (lot.id)}
            <button class="lot" onclick={() => router.openSheet({ kind: 'purchase', id: lot.id })}>
              <span class="grow"><b>{lot.code || 'no section'}{lot.seats ? ` · ${lot.seats}` : ''} · {plural(lot.qty, 'ticket')}</b>
                <small class="num">
                  {#if lot.sold}<span class="c-sold">{lot.sold} sold</span> {/if}
                  {#if lot.listed}<span class="c-listed">{lot.listed} listed</span> {/if}
                  {#if lot.free}<span class="c-free">{lot.free} not listed</span> {/if}
                  {#if lot.unsold}<span class="c-gone">{lot.unsold} unsold</span>{/if}
                </small></span>
              <Icon name="chev" size={18} />
            </button>
          {/each}
        </div>
      {/if}
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
  .gone { background: var(--s-none); }
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
  .lot { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 6px 0; border: 0; border-top: 1px solid var(--line); background: none; font: inherit; font-size: 14px; color: inherit; text-align: left; cursor: pointer; }
  .lot .grow { flex: 1; min-width: 0; display: grid; }
  .lot small { font-size: 12.5px; color: var(--muted); }
  .lot :global(svg) { flex: none; color: var(--muted); }
  .c-sold { color: var(--ok); } .c-listed { color: var(--accent); } .c-free { color: var(--low); font-weight: 650; } .c-gone { color: var(--bad); }
  .go { color: var(--accent); font-weight: 650; }
</style>

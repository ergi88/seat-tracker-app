<script>
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { setListingBuy } from '../lib/actions.js';
  import { ago, lek, money, win } from '../lib/fmt.js';

  let { id } = $props();
  const l = $derived(store.view ? store.view.listings.find(x => x.id === id) : null);
  const p = $derived(l && l.money && !l.money.missing ? l.money : null);

  async function buy(price, currency) {
    try { await setListingBuy(id, price, currency); store.toast('Buy price saved'); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  function openRequest() {
    router.closeSheet();
    setTimeout(() => router.openSheet({ kind: 'request', id: l.requestId }), 350);
  }
</script>

{#if l}
  <Sheet title="{l.code} · {l.tickets ?? '?'} tickets">
    <p class="muted small">{l.eventNum ? `[${l.eventNum}] ` : ''}{l.eventTitle || l.title}{l.when ? ' · ' + l.when : ''}</p>
    <div class="facts">
      <div><span>Price</span><b class="num">{money(l.price, l.currency)}</b></div>
      <div><span>You'll get</span><b class="num">{money(l.payout, l.currency)}</b></div>
      <div><span>Status</span><b>{l.status || '—'}</b></div>
      {#if l.recommended}<div><span>viagogo suggests</span><b class="num">{money(l.recommended, l.currency)}</b></div>{/if}
    </div>

    {#if p}
      <div class="money">
        <div class="big num {p.total >= 0 ? 'ok' : 'bad'}">{lek(p.total, true)} <span class="small">{win(p.winRate)}</span></div>
        <div class="kv"><span>Break-even</span><b class="num">{money(p.breakEven, p.currency)}</b></div>
        {#if p.atRecommended}<div class="kv"><span>At viagogo's price</span><b class="num {p.atRecommended.total >= 0 ? 'ok' : 'bad'}">{lek(p.atRecommended.total, true)} {win(p.atRecommended.winRate)}</b></div>{/if}
        <div class="kv"><span>Cost a ticket</span><b class="num">{lek(p.costL)}{l.buy ? ` · ${l.buy.source}` : ''}</b></div>
      </div>
    {:else if l.money && l.money.missing === 'buy'}
      <p class="banner low">No buy price: type what one ticket cost.</p>
    {/if}

    <div class="two">
      <label class="field"><span>Buy price (a ticket)</span>
        <input class="input" type="number" inputmode="decimal" value={l.buyPrice ?? ''} placeholder={l.buy ? String(l.buy.amount) : '—'}
          onchange={e => buy(e.currentTarget.value, l.buyCurrency)} /></label>
      <label class="field"><span>Currency</span>
        <select class="input" value={l.buyCurrency} onchange={e => buy(l.buyPrice, e.currentTarget.value)}>
          {#each SK.profit.CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select></label>
    </div>
    <p class="tiny muted">Read on viagogo {ago(l.seenAt)}. Prices change only when a PC reads your listings page.</p>

    {#snippet footer()}
      <a class="btn" href={l.url} target="_blank" rel="noopener"><Icon name="external" size={18} /> viagogo</a>
      {#if l.requestId}<button class="btn primary block" onclick={openRequest}>Request #{l.num}</button>{/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
  .facts div { background: var(--soft); border-radius: 12px; padding: 10px 12px; display: grid; }
  .facts span { font-size: 12px; color: var(--muted); }
  .money { background: var(--soft); border-radius: 12px; padding: 12px 14px; display: grid; gap: 6px; margin-bottom: 12px; }
  .big { font-size: 26px; font-weight: 750; }
  .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .kv span { color: var(--muted); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>

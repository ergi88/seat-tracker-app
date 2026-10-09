<script>
  /* The extension's price calculator (ui/components.js priceCalculator):
   * what the tickets cost and what you would ask, in any two currencies,
   * give viagogo's payout, the profit, the win rate and the break-even.
   * A buy price alone is enough for what to ask at x1.5, x2, x2.5 and x3.
   * viagogo's share is learned from your own listings. Every figure comes
   * from core/profit.js, so it always agrees with a real listing. What you
   * type is kept on this phone. */
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import Stepper from '../ui/Stepper.svelte';

  const P = SK.profit;
  const v = $derived(store.view);
  const rates = $derived((v && v.fx && v.fx.rates) || {});
  const learned = $derived(v ? P.keepRatio(v.listings) : null);

  const saved = store.deviceSettings.calc || {};
  let buy = $state(saved.buy ?? '');
  let buyCurrency = $state(saved.buyCurrency || P.BASE);
  let sell = $state(saved.sell ?? '');
  let sellCurrency = $state(saved.sellCurrency || 'USD');
  let tickets = $state(Number(saved.tickets) || 1);
  /* null = follow what your listings say viagogo pays */
  let keepPct = $state(saved.keepPct ?? null);
  const keepShown = $derived(keepPct ?? (learned ? Math.round(learned * 1000) / 10 : 100));
  const keep = $derived(Number(keepShown) / 100);

  /* saved on every change, so closing the app straight after typing keeps it */
  $effect(() => {
    store.saveDeviceSettings({ calc: { buy, buyCurrency, sell, sellCurrency, tickets, keepPct } });
  });

  const q = $derived(P.quote({ buy, buyCurrency, sell, sellCurrency, tickets, keep }, rates));
  const breakEven = $derived(P.breakEvenAsk({ buy, buyCurrency, sellCurrency, keep }, rates));
  const targets = $derived(breakEven > 0 ? P.WIN_TARGETS.map(w => ({ w, price: P.askFor(breakEven, w) })) : []);
  const perTicket = $derived(Number(sell) * (q.ratio || 1));

  function swap() {
    [buy, sell] = [sell, buy];
    [buyCurrency, sellCurrency] = [sellCurrency, buyCurrency];
  }
  function clear() { buy = ''; sell = ''; tickets = 1; keepPct = null; }
</script>

<div class="calc">
  <div class="card">
    <label class="line">
      <span class="lbl">They cost (a ticket)</span>
      <span class="money">
        <input class="input num" type="number" inputmode="decimal" min="0" step="any" placeholder="0" bind:value={buy} />
        <select class="input cur" bind:value={buyCurrency} aria-label="Currency they cost in">
          {#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select>
      </span>
    </label>
    <label class="line">
      <span class="lbl">You ask (a ticket)</span>
      <span class="money">
        <input class="input num" type="number" inputmode="decimal" min="0" step="any" placeholder="0" bind:value={sell} />
        <select class="input cur" bind:value={sellCurrency} aria-label="Currency you ask in">
          {#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select>
      </span>
    </label>
    <div class="line two">
      <span class="lbl">Tickets</span>
      <Stepper value={tickets} onchange={n => (tickets = n)} />
    </div>
    <label class="line two">
      <span class="lbl">viagogo pays<small>{keepPct === null && learned ? 'learned from your listings' : keepPct === null ? 'no listings to learn from' : 'typed'}</small></span>
      <span class="pct">
        <input class="input num" type="number" inputmode="decimal" min="1" max="100" step="any" value={keepShown}
          onchange={e => { const n = Number(e.currentTarget.value); keepPct = n > 0 && n <= 100 ? n : null; }} />
        <span>%</span>
      </span>
    </label>
  </div>

  {#if targets.length}
    <h3 class="section-title">Ask for</h3>
    <div class="targets">
      {#each targets as t (t.w)}
        <button class="target" class:on={Number(sell) === t.price} onclick={() => { sell = t.price; navigator.vibrate?.(6); }}>
          <b>×{t.w}</b><span class="num">{P.formatMoney(t.price, sellCurrency)}</span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="out">
    {#if q.missing === 'sell'}
      <p class="muted">{targets.length ? 'Pick an ask above, or type one.' : 'Type what the tickets cost and what you would ask.'}</p>
    {:else if q.missing === 'rate'}
      <p class="low">No exchange rate for {q.currency} yet. The daily rates arrive with the next sync from a PC.</p>
    {:else}
      {#if q.missing !== 'buy'}
        <div class="big num {q.total >= 0 ? 'ok' : 'bad'}">{P.formatLek(q.total, true)} <small>{P.winRateText(q.winRate)}</small></div>
        <div class="sub muted">{P.formatLek(q.perTicket, true)} a ticket</div>
      {/if}
      <div class="kv"><span>viagogo pays you</span><b class="num">{P.formatMoney(perTicket, sellCurrency)} each · {P.formatMoney(perTicket * q.tickets, sellCurrency)} for {q.tickets}</b></div>
      <div class="kv"><span>That is</span><b class="num">{P.formatLek(q.payoutL)} each</b></div>
      {#if q.missing === 'buy'}
        <p class="muted small">Add what the tickets cost to see the profit.</p>
      {:else}
        <div class="kv"><span>They cost</span><b class="num">{P.formatLek(q.costL)} each</b></div>
        <div class="kv"><span>Break-even ask</span><b class="num {Number(sell) < q.breakEven ? 'bad' : ''}">{P.formatMoney(q.breakEven, sellCurrency)}</b></div>
      {/if}
    {/if}
  </div>

  <div class="actions">
    <button class="btn small" onclick={swap}>⇅ Swap</button>
    <button class="btn small" onclick={clear}>Clear</button>
  </div>
  {#if v && v.fx && v.fx.day}<p class="tiny muted rates">lek at the rates of {v.fx.day}{v.fx.manual && Object.keys(v.fx.manual).length ? ' (some typed by hand)' : ''}</p>{/if}
</div>

<style>
  .calc { margin-top: 14px; }
  .card { background: var(--panel); border-radius: var(--r-card); padding: 4px 14px; box-shadow: 0 1px 0 var(--line); }
  .line { display: grid; gap: 6px; padding: 12px 0; }
  .line + .line { border-top: 1px solid var(--line); }
  .line.two { grid-template-columns: 1fr auto; align-items: center; }
  .lbl { font-size: 14px; font-weight: 600; display: grid; }
  .lbl small { font-weight: 400; font-size: 12px; color: var(--muted); }
  .money { display: grid; grid-template-columns: 1fr 96px; gap: 8px; }
  .money .input { font-size: 20px; font-weight: 650; }
  .cur { font-weight: 600; }
  .pct { display: inline-flex; align-items: center; gap: 6px; }
  .pct .input { width: 92px; text-align: right; }

  .targets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .target { display: grid; justify-items: center; gap: 2px; padding: 10px 4px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--panel); cursor: pointer; }
  .target b { font-size: 15px; }
  .target span { font-size: 13px; color: var(--muted); }
  .target.on { border-color: var(--accent); background: var(--accent-soft); }
  .target.on span { color: var(--accent); }
  .target:active { transform: scale(.97); }

  .out { margin-top: 14px; background: var(--panel); border-radius: var(--r-card); padding: 14px; display: grid; gap: 8px; box-shadow: 0 1px 0 var(--line); }
  .out p { margin: 0; }
  .big { font-size: 30px; font-weight: 750; line-height: 1.1; }
  .big small { font-size: 16px; font-weight: 600; }
  .sub { margin-top: -4px; font-size: 14px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .kv span { color: var(--muted); }
  .kv b { text-align: right; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .rates { margin: 10px 4px 0; }
</style>

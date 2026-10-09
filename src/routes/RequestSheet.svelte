<script>
  /* One request: its status, the profit worked out, and every field,
   * saved as soon as it changes (as native settings screens do). */
  import Sheet from '../ui/Sheet.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { updateRequest, deleteRequestWithUndo, setDone } from '../lib/actions.js';
  import { ago, lek, money, win } from '../lib/fmt.js';

  let { id } = $props();
  let listingInput = $state();
  const r = $derived(store.view ? store.view.requests.find(x => x.id === id) : null);
  const ev = $derived(r && store.view ? store.view.events.find(e => e.key === r.eventKey) : null);
  const p = $derived(r && r.profit && !r.profit.missing ? r.profit : null);

  async function change(changes, okText) {
    try {
      await updateRequest(id, changes);
      if (okText) store.toast(okText);
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  function field(k, value) {
    if (String(value ?? '') === String(r[k] ?? '')) return;
    change({ [k]: value });
  }
  function del() {
    const label = `#${r.num} ${r.code}`;
    router.closeSheet();
    deleteRequestWithUndo(id, label);
  }
  async function toggleDone() {
    const was = r.done;
    try {
      await setDone(id, !was);
      router.closeSheet();
      store.toast(was ? `#${r.num} reopened` : `#${r.num} done`);
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  function tell() {
    router.closeSheet();
    setTimeout(() => router.openSheet({ kind: 'message', eventKey: r.eventKey, section: r.code }), 350);
  }
</script>

{#if r}
  <Sheet title="#{r.num} {r.code}">
    {#snippet head()}
      <div class="links">
        {#if r.listingUrl}
          <a class="link" href={r.listingUrl} target="_blank" rel="noopener">
            <Icon name="external" size={16} /><span>Listing<small class="num">{r.listing}</small></span>
          </a>
        {:else}
          <button class="link muted-link" onclick={() => listingInput?.focus()}><Icon name="plus" size={16} /><span>Listing<small>add its ID</small></span></button>
        {/if}
        {#if r.sectorUrl}
          <a class="link" href={r.sectorUrl} target="_blank" rel="noopener">
            <Icon name="external" size={16} /><span>{r.code}<small>on {ev ? ev.siteLabel : 'the site'}</small></span>
          </a>
        {/if}
        <button class="link" onclick={tell}><Icon name="send" size={16} /><span>Tell<small>the team</small></span></button>
      </div>
    {/snippet}
    <div class="status {r.done ? 'none' : r.tone}">
      <span class="pill {r.done ? 'none' : r.tone}">{r.done ? 'DONE' : r.status}</span>
      <span class="num">{r.free ?? '—'} free · {SK.util.plural(r.options, 'option')}</span>
      <span class="muted small">{r.scannedAt ? `scanned ${ago(r.scannedAt)}` : 'not scanned yet'}{r.preview ? ' · preview from the last scan' : ''}</span>
      {#if r.scanNote}<span class="muted small">{r.scanNote}</span>{/if}
      {#if r.muffled}<span class="muted small">Its listing is switched off: no scans, no alerts.</span>{/if}
    </div>
    <p class="where muted small">[{r.eventNum}] {r.eventTitle} · {r.sectorName}{r.priceTag ? ' · ' + r.priceTag : ''}</p>

    <div class="block">
      <div class="line"><span>Tickets</span><Stepper value={r.qty} onchange={n => change({ qty: n })} /></div>
      <label class="line"><span>Side by side</span><input type="checkbox" checked={r.together} onchange={e => change({ together: e.currentTarget.checked })} /></label>
    </div>

    {#if p}
      <h3 class="section-title">Profit</h3>
      <div class="block money">
        <div class="big {p.total >= 0 ? 'ok' : 'bad'} num">{lek(p.total, true)} <span class="small">{win(p.winRate)}</span></div>
        <div class="kv"><span>Sell price (a ticket)</span><b class="num">{money(p.listing.price, p.currency)}</b></div>
        <div class="kv"><span>You get a ticket</span><b class="num">{money(p.listing.payout / p.listing.tickets, p.currency)} · {lek(p.payoutL)}</b></div>
        <div class="kv"><span>A ticket cost</span><b class="num">{lek(p.costL)}{r.buy ? ` (${r.buy.source})` : ''}</b></div>
        <div class="kv"><span>Break-even</span><b class="num">{money(p.breakEven, p.currency)}</b></div>
        {#if p.atRecommended}
          <div class="kv"><span>At viagogo's {money(p.atRecommended.price, p.currency)}</span><b class="num {p.atRecommended.total >= 0 ? 'ok' : 'bad'}">{lek(p.atRecommended.total, true)} {win(p.atRecommended.winRate)}</b></div>
        {/if}
        <div class="tiny muted">Listing read {ago(p.listing.seenAt)} · rates of {p.rateDay || 'today'}</div>
      </div>
    {:else if r.profit && r.profit.missing === 'buy'}
      <p class="muted small">No buy price yet. Type one below to see the profit.</p>
    {/if}

    {#if r.teamPrices.length}
      <h3 class="section-title">Team in this sector</h3>
      <div class="block">
        {#each r.teamPrices as t}
          <div class="kv"><span>{t.owner}{t.tickets ? ` · ${t.tickets}` : ''}</span><b class="num">{money(t.price, t.currency)}</b></div>
        {/each}
      </div>
    {/if}

    <h3 class="section-title">Details</h3>
    <div class="block fields">
      <label class="field"><span>Client</span><input class="input" value={r.client} onchange={e => field('client', e.currentTarget.value)} placeholder="—" /></label>
      <label class="field"><span>viagogo Listing ID</span><input class="input" bind:this={listingInput} value={r.listing} inputmode="numeric" onchange={e => field('listing', e.currentTarget.value)} placeholder="—" /></label>
      <div class="two">
        <label class="field"><span>Buy price (a ticket)</span><input class="input" type="number" inputmode="decimal" value={r.buyPrice ?? ''} onchange={e => change({ buyPrice: e.currentTarget.value, buyCurrency: r.buyCurrency })} placeholder={r.buy ? String(r.buy.amount) : '—'} /></label>
        <label class="field"><span>Currency</span>
          <select class="input" value={r.buyCurrency} onchange={e => change({ buyCurrency: e.currentTarget.value })}>
            {#each SK.profit.CURRENCIES as c}<option value={c}>{c}</option>{/each}
          </select>
        </label>
      </div>
      <div class="two">
        <label class="field"><span>Block warn</span><input class="input" type="number" inputmode="numeric" value={r.warn} onchange={e => field('warn', e.currentTarget.value)} /></label>
        <label class="field"><span>Options warn</span><input class="input" type="number" inputmode="numeric" value={r.opts} onchange={e => field('opts', e.currentTarget.value)} /></label>
      </div>
    </div>


    {#snippet footer()}
      <button class="btn danger" onclick={del} aria-label="Delete"><Icon name="trash" size={18} /></button>
      <button class="btn {r.done ? '' : 'good'} block" onclick={toggleDone}><Icon name="check" size={18} /> {r.done ? 'Reopen' : 'Mark done'}</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px 14px; border-radius: 12px; background: var(--soft); border-left: 5px solid var(--s-none); }
  .status.ok { border-color: var(--s-ok); } .status.low { border-color: var(--s-low); } .status.bad { border-color: var(--s-bad); }
  .status .num { font-weight: 600; }
  .where { margin: 8px 2px 4px; }
  .block { background: var(--soft); border-radius: 12px; padding: 4px 14px; }
  .block.fields { display: grid; gap: 12px; padding: 14px; }
  .line { display: flex; align-items: center; justify-content: space-between; min-height: 52px; gap: 12px; }
  .line + .line { border-top: 1px solid var(--line); }
  .line input[type=checkbox] { width: 24px; height: 24px; accent-color: var(--accent); }
  .money { padding: 12px 14px; display: grid; gap: 6px; }
  .big { font-size: 26px; font-weight: 750; }
  .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .kv span { color: var(--muted); }
  .block:not(.money):not(.fields) .kv { padding: 10px 0; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .links { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .links::-webkit-scrollbar { display: none; }
  .link {
    flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 6px 12px; border-radius: 12px; border: 0; cursor: pointer;
    background: var(--accent-soft); color: var(--accent); font-weight: 650; font-size: 14px; text-align: left;
  }
  .link span { display: grid; line-height: 1.15; }
  .link small { font-weight: 500; font-size: 11px; opacity: .8; }
  .link:active { filter: brightness(.95); transform: scale(.98); }
  .muted-link { background: var(--soft); color: var(--muted); }
  :global(.sheet .section-title) { margin-top: 18px; }
</style>

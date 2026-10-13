<script>
  /* An event's price list: what a ticket costs in every sector. The site's
   * own price shows where it gives one (as the placeholder); a price typed
   * here beats it and is shared with the team. Add purchase fills its price
   * from this list when you pick the sector. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { setSectorPrice } from '../lib/actions.js';
  import { money } from '../lib/fmt.js';

  let { eventKey } = $props();
  const P = SK.profit;
  const ev = $derived(store.view ? store.view.events.find(e => e.key === eventKey) || null : null);
  /* the currency new prices are typed in: the one already on the list, else the site's */
  const typedCur = $derived(ev ? (ev.sectors.find(s => s.price && s.price.source === 'list') || { price: {} }).price.currency : null);
  let currency = $state(null);
  $effect(() => { if (!currency && ev) currency = typedCur || ev.priceCurrency; });

  let q = $state('');
  let onlyMissing = $state(false);
  const priced = $derived(ev ? ev.sectors.filter(s => s.price).length : 0);
  const rows = $derived.by(() => {
    if (!ev) return [];
    const needle = q.trim().toLowerCase();
    return ev.sectors.filter(s => (!needle || `${s.code} ${s.name}`.toLowerCase().includes(needle)) && (!onlyMissing || !s.price));
  });
  const SOURCE = { list: 'typed', site: 'site', paid: 'you paid' };
  /* "2,000–5,000 L": a range keeps one currency sign */
  const siteText = pr => (pr.range ? `${Number(pr.range[0]).toLocaleString('en')}–${money(pr.range[1], pr.currency)}` : money(pr.amount, pr.currency));

  let saving = $state(null);
  async function save(s, value) {
    const v = String(value).trim();
    const was = s.price && s.price.source === 'list' ? String(s.price.amount) : '';
    if (v === was) return;
    saving = s.id;
    try { await setSectorPrice(ev.key, s.id, v, currency); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); }
    finally { saving = null; }
  }
</script>

{#if ev}
  <Sheet title="Price list" fixed>
    {#snippet head()}
      <p class="muted small center">{ev.info.name} · {priced} of {ev.sectors.length} sectors priced</p>
      <div class="tools">
        <input class="input" type="search" placeholder="Find a sector" bind:value={q} enterkeyhint="search" />
        <select class="input cur" bind:value={currency} aria-label="Currency of typed prices">
          {#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select>
      </div>
      <label class="missing"><input type="checkbox" bind:checked={onlyMissing} /> Only sectors without a price</label>
    {/snippet}

    <div class="list">
      {#each rows as s (s.id)}
        {@const typed = s.price && s.price.source === 'list'}
        <div class="row-p">
          <span class="grow">
            <b>{s.code}</b>
            <small>{s.price ? (typed ? 'typed' : `${SOURCE[s.price.source]} ${siteText(s.price)}`) : 'no price yet'}{s.name !== s.code ? ` · ${s.name}` : ''}</small>
          </span>
          <input class="input num price" class:typed type="number" inputmode="decimal" min="0" step="any"
            value={typed ? s.price.amount : ''} placeholder={s.price && !typed ? String(s.price.amount) : '—'}
            onchange={e => save(s, e.currentTarget.value)} aria-label="Price for {s.code}" />
          <span class="unit">{typed ? s.price.currency : currency}</span>
          {#if saving === s.id}<span class="spin"><Icon name="refresh" size={14} /></span>{/if}
        </div>
      {:else}
        <p class="muted small pad">{q ? 'No sector matches.' : 'Every sector has a price.'}</p>
      {/each}
    </div>
    <p class="tiny muted pad">A typed price beats the site's and is shared with the team. Empty a box to go back to the site's. Prices you pay on a purchase fill sectors that have none.</p>

    {#snippet footer()}
      <button class="btn block" onclick={() => router.closeSheet()}><Icon name="down" size={18} /> Done</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .center { text-align: center; margin: 0 0 8px; }
  .tools { display: flex; gap: 8px; }
  .tools .input:first-child { flex: 1; min-width: 0; }
  .cur { width: 96px; flex: none; }
  .missing { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; color: var(--muted); }
  .missing input { width: 20px; height: 20px; accent-color: var(--accent); }
  .list { background: var(--soft); border-radius: 12px; overflow: hidden; }
  .row-p { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 12px 6px 14px; }
  .row-p + .row-p { border-top: 1px solid var(--line); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .grow b { font-weight: 700; }
  .grow small { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .price { width: 104px; min-height: 40px; padding: 6px 10px; text-align: right; }
  .price.typed { font-weight: 700; }
  .unit { width: 34px; font-size: 12.5px; color: var(--muted); }
  .spin { color: var(--muted); animation: spin .8s linear infinite; display: inline-flex; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pad { margin: 10px 4px 0; }
</style>

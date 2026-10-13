<script>
  /* One purchase: which of your accounts bought how many tickets for this
   * event. The accounts come in the order to use them (most left first,
   * full ones last), and a new email can be saved right here. Linked to a
   * request, enough tickets make it Bought and give it the price paid. */
  import Sheet from '../ui/Sheet.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { savePurchase, deletePurchase, saveAccount } from '../lib/actions.js';
  import { money } from '../lib/fmt.js';

  let { id = null, eventKey = null, requestId = null } = $props();
  const P = SK.profit;
  const v = $derived(store.view);
  const p = $derived(id && v ? v.purchases.find(x => x.id === id) || null : null);
  const key = $derived(p ? p.eventKey : eventKey);
  const ev = $derived(v && key ? v.events.find(e => e.key === key) || null : null);
  const rows = $derived(ev ? ev.buys.rows : []);
  const limit = $derived(ev ? ev.buys.limit : null);
  const requests = $derived(v && ev ? v.requests.filter(r => r.eventKey === ev.key && (!r.done || (f && r.id === f.requestId))) : []);

  let f = $state(null);
  $effect(() => {
    if (f || !v || !ev) return;
    if (p) {
      f = { accountId: p.accountId, qty: p.qty, sectorId: p.sectorId || '', requestId: p.requestId || '', price: p.price ?? '',
        currency: p.currency, boughtOn: p.boughtOn, orderRef: p.orderRef, notes: p.notes };
      return;
    }
    const r = requestId ? v.requests.find(x => x.id === requestId) : null;
    f = {
      accountId: ev.buys.next ? ev.buys.next.account.id : (rows[0] ? rows[0].account.id : ''),
      qty: r ? Math.max(1, Number(r.qty) - (r.purchased || 0)) : 1,
      sectorId: r ? String(r.sec) : '',
      requestId: r ? r.id : '',
      price: r && r.buy ? r.buy.amount : '',
      currency: (r && r.buy && r.buy.currency) || 'ALL',
      boughtOn: new Date().toISOString().slice(0, 10), orderRef: '', notes: ''
    };
    if (f.price === '' && f.sectorId) {
      const pr = (ev.sectors.find(s => s.id === f.sectorId) || {}).price;
      if (pr) { f.price = pr.amount; f.currency = pr.currency; }
    }
  });

  /* The price follows the sector (the event's price list, else the site's,
   * else what you last paid there) until you type one yourself. */
  let priceAuto = $state(true);
  const priceOfSector = sid => (ev && sid ? (ev.sectors.find(s => s.id === String(sid)) || {}).price || null : null);
  const autoPrice = $derived(f ? priceOfSector(f.sectorId) : null);
  const SOURCE = { list: 'from the price list', site: "the site's price", paid: 'what you paid last time' };
  function fillPrice() {
    if (!priceAuto && f.price !== '') return;
    const pr = priceOfSector(f.sectorId);
    if (pr) { f.price = pr.amount; f.currency = pr.currency; priceAuto = true; }
  }
  function pickSector(sid) { f.sectorId = sid; fillPrice(); }
  const typedPrice = val => { f.price = val; priceAuto = val === ''; };

  /* picking a request brings its sector and price along */
  function pickRequest(rid) {
    f.requestId = rid;
    const r = requests.find(x => x.id === rid);
    if (!r) return;
    f.sectorId = String(r.sec);
    if ((priceAuto || f.price === '') && r.buy) { f.price = r.buy.amount; f.currency = r.buy.currency || f.currency; priceAuto = true; }
    else fillPrice();
  }

  /* what the picked account would hold for this event after this purchase */
  const picked = $derived(f ? rows.find(r => r.account.id === f.accountId) || null : null);
  const after = $derived(picked ? picked.qty - (p && p.accountId === picked.account.id ? p.qty : 0) + Number(f.qty || 0) : 0);
  const over = $derived(!!limit && after > limit);

  let newEmail = $state('');
  let adding = $state(false);
  async function addEmail() {
    adding = true;
    try { const a = await saveAccount({ email: newEmail }); f.accountId = a.id; newEmail = ''; store.toast(`${a.email} saved`); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { adding = false; }
  }

  let busy = $state(false);
  async function save() {
    busy = true;
    try {
      await savePurchase(Object.assign({ id, eventKey: key }, f));
      const a = picked ? picked.account.email : 'the account';
      store.toast(`${f.qty} ticket${f.qty === 1 ? '' : 's'} on ${a}${limit ? ` · ${Math.max(0, limit - after)} left` : ''}`);
      router.closeSheet();
    } catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
  async function remove() {
    if (!confirm('Delete this purchase?')) return;
    busy = true;
    try { await deletePurchase(p.id); store.toast('Purchase deleted'); router.closeSheet(); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
  const usedText = r => (limit ? `${r.qty} / ${limit}` : `${r.qty} bought`);
</script>

{#if f && ev}
  <Sheet title={p ? 'Purchase' : 'Add purchase'}>
    <p class="muted small ev">{ev.info.name}{limit ? ` · ${limit} per account` : ''}</p>

    <h3 class="section-title">Account</h3>
    <div class="accounts" role="radiogroup" aria-label="Account">
      {#each rows as r (r.account.id)}
        <button type="button" role="radio" aria-checked={f.accountId === r.account.id} class="acc" class:on={f.accountId === r.account.id} class:full={r.full}
          onclick={() => (f.accountId = r.account.id)}>
          <span class="tick" aria-hidden="true">{f.accountId === r.account.id ? '✓' : ''}</span>
          <span class="grow"><b>{r.account.email}</b>{#if r.account.firstName || r.account.lastName}<small>{[r.account.firstName, r.account.lastName].filter(Boolean).join(' ')}</small>{/if}</span>
          <span class="used num" class:bad={r.over}>{usedText(r)}</span>
          {#if limit}<span class="left num" class:zero={r.full}>{r.full ? 'full' : `${r.left} left`}</span>{/if}
        </button>
      {/each}
      <div class="new">
        <input class="input" type="email" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false"
          placeholder={rows.length ? 'Another email' : 'Your first buying email'} bind:value={newEmail}
          onkeydown={e => { if (e.key === 'Enter' && newEmail.trim()) addEmail(); }} />
        <button class="btn" onclick={addEmail} disabled={adding || !newEmail.trim()}><Icon name="plus" size={18} /> Save</button>
      </div>
    </div>

    <div class="box">
      <div class="line"><span>Tickets</span><Stepper value={f.qty} max={999} onchange={n => (f.qty = n)} /></div>
      {#if over}<p class="warn">Over the limit: {picked.account.email} would have {after} of {limit}.</p>{/if}
      <label class="line"><span>Request</span>
        <select class="input mini" value={f.requestId} onchange={e => pickRequest(e.currentTarget.value)}>
          <option value="">none</option>
          {#each requests as r (r.id)}<option value={r.id}>#{r.num} {r.code} ×{r.qty}{r.client ? ' · ' + r.client : ''}</option>{/each}
        </select></label>
      <label class="line"><span>Sector</span>
        <select class="input mini" value={f.sectorId} onchange={e => pickSector(e.currentTarget.value)}>
          <option value="">—</option>
          {#each ev.sectors as s (s.id)}<option value={s.id}>{s.code}{s.price ? ` · ${money(s.price.amount, s.price.currency)}` : ''}</option>{/each}
        </select></label>
    </div>

    <div class="two">
      <label class="field"><span>Paid a ticket</span><input class="input num" type="number" inputmode="decimal" min="0" step="any" value={f.price} oninput={e => typedPrice(e.currentTarget.value)} placeholder="—" /></label>
      <label class="field"><span>Currency</span>
        <select class="input" bind:value={f.currency}>{#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>
    </div>
    {#if autoPrice && priceAuto && f.price !== ''}<p class="tiny muted src">{SOURCE[autoPrice.source]}{autoPrice.range ? ` (${money(autoPrice.range[0], autoPrice.currency)} – ${money(autoPrice.range[1], autoPrice.currency)})` : ''}</p>{/if}
    <div class="two">
      <label class="field"><span>Bought on</span><input class="input" type="date" bind:value={f.boughtOn} /></label>
      <label class="field"><span>Order number</span><input class="input" bind:value={f.orderRef} autocomplete="off" placeholder="—" /></label>
    </div>
    <label class="field"><span>Notes</span><input class="input" bind:value={f.notes} autocomplete="off" placeholder="—" /></label>
    {#if f.requestId}<p class="tiny muted pad">Once purchases cover the request's tickets it turns Bought{f.price !== '' ? ', and takes this price if it has none' : ''}.</p>{/if}

    {#snippet footer()}
      {#if p}<button class="btn danger" onclick={remove} disabled={busy} aria-label="Delete purchase"><Icon name="trash" size={18} /></button>{/if}
      <button class="btn primary block" onclick={save} disabled={busy || !f.accountId}>{busy ? 'Saving…' : p ? 'Save' : `Add ${f.qty} ticket${f.qty === 1 ? '' : 's'}`}</button>
      <button class="btn close" onclick={() => router.closeSheet()} aria-label="Close"><Icon name="down" size={18} /></button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .ev { margin: 0 0 4px; text-align: center; }
  .accounts { display: grid; gap: 6px; }
  .acc {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 8px 12px;
    border: 1.5px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink);
    font: inherit; text-align: left; cursor: pointer;
  }
  .acc.on { border-color: var(--accent); background: var(--accent-soft); }
  .acc.full:not(.on) { opacity: .55; }
  .tick { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--line); display: grid; place-items: center; font-size: 13px; font-weight: 800; color: var(--accent-ink); flex: none; }
  .acc.on .tick { background: var(--accent); border-color: var(--accent); }
  .grow { flex: 1; min-width: 0; display: grid; }
  .grow b { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grow small { color: var(--muted); font-size: 12.5px; }
  .used { font-size: 13.5px; color: var(--muted); white-space: nowrap; }
  .used.bad { color: var(--bad); font-weight: 700; }
  .left { font-size: 12.5px; font-weight: 700; color: var(--ok); background: var(--okbg); padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .left.zero { color: var(--muted); background: var(--nonebg); }
  .new { display: flex; gap: 8px; margin-top: 2px; }
  .new .input { flex: 1; min-width: 0; }
  .box { background: var(--soft); border-radius: 12px; padding: 0 14px; margin: 14px 0 12px; }
  .line { display: flex; align-items: center; justify-content: space-between; min-height: 52px; gap: 12px; }
  .line + .line, .warn + .line { border-top: 1px solid var(--line); }
  .input.mini { width: auto; max-width: 62%; min-height: 40px; padding: 6px 10px; }
  .warn { margin: 0 0 10px; padding: 8px 10px; border-radius: 10px; background: var(--badbg); color: var(--bad); font-size: 14px; font-weight: 600; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .pad { margin: 8px 4px 0; }
  .src { margin: -6px 4px 12px; }
  .close { flex: none; margin-left: auto; }
</style>

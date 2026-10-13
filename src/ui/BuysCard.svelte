<script>
  /* An event's buys: every account of yours that bought tickets for it,
   * against the limit per account, and which one to use next. Tap an
   * account for its purchases, a purchase to change it. The limit is the
   * site's default unless this event has its own (team settings). */
  import Icon from './Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { setEventBuyLimit, setSiteBuyLimit } from '../lib/actions.js';
  import { plural, money } from '../lib/fmt.js';

  let { ev } = $props();
  const b = $derived(ev.buys);
  const used = $derived(b.rows.filter(r => r.qty > 0));
  const unused = $derived(b.rows.length - used.length);
  const codeOf = id => ((ev.sectors.find(s => s.id === String(id)) || {}).code) || '';
  const day = iso => (iso ? new Date(iso + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

  let openId = $state(null);
  let editing = $state(false);
  let eventLimit = $state('');
  let siteLimit = $state('');
  function edit() {
    eventLimit = ev.buyLimit ? String(ev.buyLimit) : '';
    siteLimit = ev.siteBuyLimit ? String(ev.siteBuyLimit) : '';
    editing = !editing;
  }
  async function saveLimits() {
    try {
      if (String(ev.siteBuyLimit || '') !== siteLimit.trim()) await setSiteBuyLimit(ev.site, siteLimit.trim());
      if (String(ev.buyLimit || '') !== eventLimit.trim()) await setEventBuyLimit(ev.key, eventLimit.trim());
      editing = false;
      store.toast('Limit saved for the whole team');
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
  const add = () => router.openSheet({ kind: 'purchase', eventKey: ev.key });
  const openPurchase = id => router.openSheet({ kind: 'purchase', id });
</script>

<h2 class="section-title head">
  <span>Buys{b.total ? ` · ${plural(b.total, 'ticket')}` : ''}</span>
  <button class="limit" onclick={edit} aria-expanded={editing}>{b.limit ? `${b.limit} per account` : 'no limit set'}<Icon name="edit" size={14} /></button>
</h2>

{#if editing}
  <div class="card editor">
    <div class="two">
      <label class="field"><span>{ev.siteLabel} default</span>
        <input class="input num" type="number" inputmode="numeric" min="0" bind:value={siteLimit} placeholder="none" /></label>
      <label class="field"><span>This event</span>
        <input class="input num" type="number" inputmode="numeric" min="0" bind:value={eventLimit} placeholder={ev.siteBuyLimit ? `${ev.siteBuyLimit} (default)` : 'default'} /></label>
    </div>
    <p class="tiny muted">Tickets one account may buy for an event. The site's default covers every {ev.siteLabel} event; fill "This event" only when it differs. Empty = no limit. For the whole team.</p>
    <div class="row-btns"><button class="btn small" onclick={() => (editing = false)}>Cancel</button><button class="btn small primary" onclick={saveLimits}>Save</button></div>
  </div>
{/if}

<div class="card">
  {#if !b.rows.length}
    <p class="muted small empty">Save the emails you buy with, then add each purchase: this shows how many every account bought here and which to use next.</p>
  {/if}
  {#each used as r (r.account.id)}
    {@const pct = b.limit ? Math.min(100, Math.round((r.qty / b.limit) * 100)) : 0}
    <button class="acc" onclick={() => (openId = openId === r.account.id ? null : r.account.id)} aria-expanded={openId === r.account.id}>
      <span class="grow">
        <span class="email">{r.account.email}</span>
        {#if b.limit}<span class="bar" class:full={r.full} class:over={r.over}><i style:width="{pct}%"></i></span>{/if}
      </span>
      <span class="qty num" class:over={r.over}>{b.limit ? `${r.qty} / ${b.limit}` : r.qty}</span>
      {#if b.limit}<span class="state" class:full={r.full} class:over={r.over}>{r.over ? `${r.qty - b.limit} over` : r.full ? 'full' : `${r.left} left`}</span>{/if}
    </button>
    {#if openId === r.account.id}
      <div class="buys">
        {#each r.purchases as p (p.id)}
          <button class="buy" onclick={() => openPurchase(p.id)}>
            <span class="num">{day(p.boughtOn)}</span>
            <b class="num">×{p.qty}</b>
            <span class="grow muted">{[codeOf(p.sectorId), p.price ? money(p.price, p.currency) + ' each' : '', p.orderRef ? '#' + p.orderRef : ''].filter(Boolean).join(' · ')}</span>
            <Icon name="chev" size={16} />
          </button>
        {/each}
      </div>
    {/if}
  {/each}
  {#if b.rows.length}
    <div class="foot">
      {#if b.next}
        <span>Next: <b>{b.next.account.email}</b>{b.limit ? ` · ${b.next.left} left` : ''}</span>
      {:else}
        <span class="bad-text">Every account is full for this event.</span>
      {/if}
      {#if unused}<span class="muted">{plural(unused, 'account')} unused</span>{/if}
    </div>
  {/if}
</div>
<div class="actions">
  <button class="btn primary block" onclick={add}><Icon name="plus" size={18} /> Add purchase</button>
  <a class="btn" href={href.accounts()} aria-label="Buying accounts"><Icon name="user" size={18} /></a>
</div>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .limit {
    display: inline-flex; align-items: center; gap: 5px; border: 0; background: var(--accent-soft); color: var(--accent);
    padding: 4px 10px; border-radius: 99px; font: inherit; font-size: 12.5px; font-weight: 650; letter-spacing: 0; text-transform: none; cursor: pointer;
  }
  .card { background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line); overflow: hidden; }
  .editor { padding: 14px; display: grid; gap: 10px; margin-bottom: 10px; }
  .editor p { margin: 0; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .row-btns { display: flex; justify-content: flex-end; gap: 8px; }
  .empty { margin: 0; padding: 14px 16px; }
  .acc {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 8px 16px;
    border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .acc:active { background: var(--soft); }
  .grow { flex: 1; min-width: 0; display: grid; gap: 6px; }
  .email { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { display: block; height: 6px; border-radius: 3px; background: var(--softer); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--s-ok); border-radius: 3px; }
  .bar.full i { background: var(--s-none); }
  .bar.over i { background: var(--s-bad); }
  .qty { font-weight: 700; font-size: 15px; white-space: nowrap; }
  .qty.over { color: var(--bad); }
  .state { font-size: 12.5px; font-weight: 700; color: var(--ok); background: var(--okbg); padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .state.full { color: var(--muted); background: var(--nonebg); }
  .state.over { color: var(--bad); background: var(--badbg); }
  .buys { background: var(--soft); border-bottom: 1px solid var(--line); }
  .buy {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 6px 16px 6px 28px;
    border: 0; background: none; color: var(--ink); font: inherit; font-size: 14px; text-align: left; cursor: pointer;
  }
  .buy + .buy { border-top: 1px solid var(--line); }
  .buy .grow { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 12px 16px; font-size: 14px; }
  .foot b { font-weight: 650; }
  .bad-text { color: var(--bad); font-weight: 600; }
  .actions { display: flex; gap: 8px; margin-top: 10px; }
</style>

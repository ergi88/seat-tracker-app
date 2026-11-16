<script>
  /* One lot of the inventory: tickets you bought for an event, with which
   * account and at what price, and where they went: on which viagogo
   * listings (a lot can be split over several) and, for a sale with no
   * listing, on which sale. A listing's sales come off its lots on their own.
   *
   * Opened from Inventory with no event, it asks for one first: a tracked
   * event, or a viagogo event you list or sold on. Opened from a listing
   * (Add lot on "To buy" or on an uploaded listing) it comes filled in.
   *
   * An existing lot opens read-only: what it is, where its tickets went
   * (listings, sales, sold outside viagogo, each opening its own sheet),
   * the money, and two actions: Sell (sold outside viagogo, or a viagogo
   * sale with no lot) and Edit, which shows the form. A new lot opens on
   * the form.
   *
   * The lot's seats are a note; each sale that came off the lot gets one
   * too (which of its seats went). Tickets sold outside viagogo are typed
   * here and count as sold. */
  import Sheet from '../ui/Sheet.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { savePurchase, deletePurchase, saveAccount } from '../lib/actions.js';
  import { buysOf } from '../lib/model.js';
  import { assignedOf, placedOf } from '../lib/lots.js';
  import { money, lek, plural, fromToday } from '../lib/fmt.js';
  import { href } from '../lib/router.svelte.js';

  let { id = null, eventKey = null, vgEventId = null, requestId = null, listingId = null, saleId = null } = $props();
  const P = SK.profit;
  const v = $derived(store.view);
  const inv = $derived(v ? v.inventory : null);
  const p = $derived(id && v ? v.purchases.find(x => x.id === id) || null : null);
  const listing0 = $derived(listingId && v ? v.listings.find(l => l.id === listingId) || null : null);
  const sale0 = $derived(saleId && v ? v.sales.find(s => s.id === saleId) || null : null);

  /* the event: the lot's, the one asked for, the listing's or sale's, else picked here */
  let picked = $state(null);
  /* a viagogo event a tracked one is sold on counts as that one (lib/lots.js) */
  const keyOf = x => (inv ? inv.keyOf(x) : x.eventKey || null);
  const gkey = $derived(!inv ? null : p ? keyOf(p) : eventKey ? eventKey : vgEventId ? keyOf({ vgEventId }) : listing0 ? keyOf(listing0) : sale0 ? keyOf(sale0) : picked);
  const ev = $derived(v && gkey ? v.events.find(e => e.key === gkey) || null : null);
  const g = $derived(inv && gkey ? inv.byKey[gkey] || null : null);
  const evName = $derived(ev ? ev.info.name : g ? g.name : p ? p.eventTitle : '');
  const vgId = $derived(!ev && gkey && gkey.startsWith('vg:') ? gkey.slice(3) : '');

  /* events to pick from: tracked ones still to come, and viagogo ones you list or sold on */
  const t0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const choices = $derived(!v ? [] : [
    ...v.events.filter(e => !e.archived && (e.time === null || e.time >= t0)).map(e => ({ key: e.key, name: e.info.name, num: e.num, time: e.time, site: e.siteLabel })),
    ...Object.values(inv.byKey).filter(x => !x.tracked && x.key.startsWith('vg:') && !x.past).map(x => ({ key: x.key, name: x.name || 'viagogo event', num: null, time: x.time, site: 'viagogo' }))
  ].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.name.localeCompare(b.name)));

  const rows = $derived(!v || !gkey ? [] : ev ? ev.buys.rows
    : buysOf(v.accounts, v.purchases.map(x => Object.assign({}, x, { eventKey: keyOf(x) })), gkey, null).rows);
  const limit = $derived(ev ? ev.buys.limit : null);
  const requests = $derived(v && ev ? v.requests.filter(r => r.eventKey === ev.key && (!r.done || (f && r.id === f.requestId))) : []);

  let f = $state(null);
  /* a saved lot opens read-only; Edit shows the form */
  let editing = $state(!id);
  const fromP = x => ({ accountId: x.accountId, qty: x.qty, sectorId: x.sectorId || '', section: x.section || '', requestId: x.requestId || '', price: x.price ?? '',
    currency: x.currency, boughtOn: x.boughtOn, orderRef: x.orderRef, notes: x.notes, assigned: assignedOf(x) });
  function startEdit() { f = fromP(p); priceAuto = false; allSales = false; editing = true; }
  $effect(() => {
    if (f || !v || !gkey || (!ev && !g)) return;
    if (p) { f = fromP(p); return; }
    const r = requestId ? v.requests.find(x => x.id === requestId) : null;
    f = {
      accountId: ev && ev.buys.next ? ev.buys.next.account.id : (rows[0] ? rows[0].account.id : ''),
      qty: r ? Math.max(1, Number(r.qty) - (r.purchased || 0)) : 1,
      sectorId: r ? String(r.sec) : '',
      section: '',
      requestId: r ? r.id : '',
      price: r && r.buy ? r.buy.amount : '',
      currency: (r && r.buy && r.buy.currency) || (ev ? ev.priceCurrency : 'ALL'),
      boughtOn: new Date().toISOString().slice(0, 10), orderRef: '', notes: '',
      assigned: { listings: {}, sales: {}, seats: '', notes: {}, other: [] }
    };
    /* from a listing or a sale with no lot: its tickets, its section, its buy price */
    const from = listing0 || sale0;
    if (from) {
      const e = inv.toBuy.find(x => x.key === (listing0 ? 'l:' + listing0.id : 's:' + sale0.id));
      const n = e ? e.qty : Number(from.tickets) || 1;
      f.qty = Math.max(1, n);
      f.sectorId = ev && from.sectorId ? String(from.sectorId) : '';
      f.section = from.section || '';
      if (from.buy && from.buy.amount > 0) { f.price = from.buy.amount; f.currency = from.buy.currency || f.currency; }
      if (listing0) f.assigned.listings[listing0.id] = f.qty;
      else f.assigned.sales[sale0.id] = f.qty;
    }
    if (f.price === '' && f.sectorId) {
      const pr = priceOfSector(f.sectorId);
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

  /* what the picked account would hold for this event after this lot */
  const acct = $derived(f ? rows.find(r => r.account.id === f.accountId) || null : null);
  const after = $derived(acct ? acct.qty - (p && p.accountId === acct.account.id ? p.qty : 0) + Number(f.qty || 0) : 0);
  const over = $derived(!!limit && after > limit);

  /* ---- where the tickets went ---- */
  const code = $derived(f ? (ev && f.sectorId ? (ev.sectors.find(s => s.id === f.sectorId) || {}).code || '' : f.section) : '');
  const same = x => !!code && SK.viagogo.sectionKey && SK.viagogo.sectionKey(x.code || x.section || '') === SK.viagogo.sectionKey(code);
  const lotOf = $derived(g && p ? g.lots.find(x => x.id === p.id) || null : null);
  /* this event's listings: active ones, ones with sales, ones this lot is on; your section first */
  const lst = $derived(!g || !f ? [] : g.listings
    .filter(l => ['active', 'pending'].includes(l.statusKind) || f.assigned.listings[l.id] || g.sales.some(s => s.listingId === l.id))
    .map(l => {
      const e = g.toBuy.find(x => x.key === 'l:' + l.id);
      const on = lotOf ? lotOf.on.find(o => o.listing && o.listing.id === l.id) : null;
      return { l, open: e ? e.qty : 0, sold: g.sales.filter(s => s.listingId === l.id).reduce((n, s) => n + (s.tickets || 0), 0), on, near: same(l) };
    })
    .sort((a, b) => Number(b.near) - Number(a.near) || Number(!!f.assigned.listings[b.l.id]) - Number(!!f.assigned.listings[a.l.id]) || b.open - a.open));
  /* sales no listing of yours is known for, or this lot already took by hand */
  const loose = $derived(!g || !f ? [] : g.sales
    .filter(s => f.assigned.sales[s.id] || !s.listingId || !v.listings.some(l => l.id === s.listingId))
    .map(s => ({ s, open: (g.toBuy.find(x => x.key === 's:' + s.id) || {}).qty || 0, near: same(s), on: !!f.assigned.sales[s.id] }))
    .filter(x => x.open || x.on));
  /* the lot's own section first; other sections' sales only when asked */
  let allSales = $state(false);
  const looseShown = $derived(allSales || !code ? loose : loose.filter(x => x.near || x.on));
  const elsewhere = $derived(f ? f.assigned.other.reduce((n, x) => n + (Number(x.qty) || 0), 0) : 0);
  const onVg = $derived(f ? [...Object.values(f.assigned.listings), ...Object.values(f.assigned.sales)].reduce((n, q) => n + (Number(q) || 0), 0) : 0);
  const placed = $derived(onVg + elsewhere);
  const room = $derived(f ? Number(f.qty) - placed : 0);
  const setOn = (kind, k, n) => {
    const next = Object.assign({}, f.assigned[kind]);
    if (n > 0) next[k] = n; else delete next[k];
    f.assigned = Object.assign({}, f.assigned, { [kind]: next });
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const shortDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}.${m[2]}` : ''; };
  const listingLine = l => [l.code || l.section, l.row ? `row ${l.row}` : '', `#${String(l.id).slice(-5)}`].filter(Boolean).join(' · ');

  /* ---------------- the read-only view ---------------- */
  const base = () => ({ id, eventKey: ev ? ev.key : null, vgEventId: vgId, eventTitle: evName });
  /* save the lot as it is, with where its tickets went changed */
  async function persist(assigned, msg) {
    busy = true;
    try { await savePurchase(Object.assign(base(), fromP(p), { assigned })); store.toast(msg); return true; }
    catch (e) { store.toast(e.message, { tone: 'bad' }); return false; } finally { busy = false; }
  }
  const req = $derived(p && p.requestId && v ? v.requests.find(r => r.id === p.requestId) || null : null);
  const email = $derived(p && v ? (v.accounts.find(a => a.id === p.accountId) || {}).email || 'account deleted' : '');
  const sectorName = $derived(lotOf ? lotOf.code || (ev ? '' : p.section) : '');
  const pct = n => (lotOf && lotOf.qty ? (n / lotOf.qty) * 100 : 0);
  const netL = $derived(lotOf && lotOf.costL !== null ? lotOf.payoutL - lotOf.costL : null);
  const isPaid = s => (SK.sales.isPaid ? SK.sales.isPaid(s) : /^complete/i.test(String(s.status || '')));
  const listingOf = id => (v ? v.listings.find(l => l.id === id) || null : null);
  /* away from the sheets: the event's page */
  function goEvent() { router.closeSheet({ all: true }); setTimeout(() => router.go(href.event(ev.key)), 320); }
  /* over this one: closing it brings the lot back */
  const openListing = lid => router.swapSheet({ kind: 'listing', id: lid });
  const openRequest = () => router.swapSheet({ kind: 'request', id: req.id });

  /* What just opened or was just added scrolls into view and flashes, so
   * it is plain where it went: the Add sale and Change panels when they
   * open, a sale's row once it is saved. */
  let fresh = $state('');
  let freshTimer;
  function flashRow(key) { fresh = key; clearTimeout(freshTimer); freshTimer = setTimeout(() => (fresh = ''), 2500); }
  function reveal(node, on) {
    const go = v => {
      if (!v) return;
      requestAnimationFrame(() => {
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: v === 'start' ? 'start' : 'center' });
        node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
        setTimeout(() => node.classList.remove('flash'), 2000);
      });
    };
    go(on);
    return { update: go };
  }

  async function saveNote(sid, text) {
    const a = assignedOf(p);
    if ((a.notes[sid] || '') === text.trim()) return;
    a.notes[sid] = text.trim();
    if (!a.notes[sid]) delete a.notes[sid];
    await persist(a, 'Seats saved');
  }

  /* Sell: tickets not on any listing first; then ones listed and unsold,
   * which come off their listing (take them off viagogo too) */
  let selling = $state(false);
  let sell = $state(null);
  const freeRoom = $derived(p ? Math.max(0, p.qty - placedOf(p)) : 0);
  const offListings = $derived(lotOf ? lotOf.on.filter(o => o.listing).reduce((n, o) => n + Math.max(0, o.qty - o.sold), 0) : 0);
  const sellMax = $derived(freeRoom + offListings);
  /* viagogo sales of this event no lot covers: put on this lot in one tap */
  const openSales = $derived(!g || !p ? [] : g.toBuy.filter(e => e.kind === 'sale')
    .map(e => ({ e, near: same(e.sale) })).sort((a, b) => Number(b.near) - Number(a.near)));
  function startSell() {
    placing = false;
    sell = { qty: Math.max(1, Math.min(sellMax, freeRoom || (lotOf ? lotOf.listed : 0) || 1)), price: '', currency: p.currency, where: '', seats: '', on: today() };
    selling = true;
  }
  async function saveSell() {
    const q = Number(sell.qty) || 0;
    if (q < 1 || q > sellMax) return;
    const a = assignedOf(p);
    let over = q - freeRoom;
    const off = [];
    for (const o of (lotOf ? lotOf.on : []).filter(o => o.listing).slice().reverse()) {
      if (over <= 0) break;
      const d = Math.min(over, Math.max(0, o.qty - o.sold));
      if (!d) continue;
      const left = (Number(a.listings[o.listing.id]) || 0) - d;
      if (left > 0) a.listings[o.listing.id] = left; else delete a.listings[o.listing.id];
      over -= d;
      off.push(`${d} off #${String(o.listing.id).slice(-5)}`);
    }
    const oid = 'o' + Date.now().toString(36);
    a.other.push({ id: oid, qty: q, price: sell.price, currency: sell.currency, on: sell.on, where: sell.where, seats: sell.seats });
    if (await persist(a, `${plural(q, 'ticket')} sold${off.length ? ` · ${off.join(', ')}: take them off viagogo too` : ''}`)) { selling = false; flashRow('o:' + oid); }
  }
  async function takeSale(e) {
    const a = assignedOf(p);
    const n = Math.min(e.qty, freeRoom);
    if (n < 1) return;
    a.sales[e.sale.id] = (Number(a.sales[e.sale.id]) || 0) + n;
    if (await persist(a, `${plural(n, 'ticket')} of the sale put on this lot`)) { selling = false; flashRow('s:' + e.sale.id); }
  }

  /* Change: put the lot's tickets on listings (and sales with no listing) */
  let placing = $state(false);
  function startPlace() { f = fromP(p); allSales = false; selling = false; placing = true; }
  async function savePlace() {
    const a = assignedOf(p);
    a.listings = f.assigned.listings;
    a.sales = f.assigned.sales;
    if (await persist(a, 'Saved')) { placing = false; flashRow('on'); }
  }
  async function dropSale(o) {
    if (!confirm(`Remove this sale of ${plural(o.qty, 'ticket')}? They go back to the lot.`)) return;
    const a = assignedOf(p);
    a.other = a.other.filter(x => x.id !== o.id);
    await persist(a, 'Sale removed');
  }

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
      await savePurchase(Object.assign(base(), f));
      const a = acct ? acct.account.email : 'the account';
      store.toast(`Lot saved: ${plural(f.qty, 'ticket')} on ${a}${limit ? ` · ${Math.max(0, limit - after)} left` : ''}`);
      if (p) editing = false; else router.closeSheet();
    } catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
  async function remove() {
    if (!confirm('Delete this lot? Its tickets leave the inventory.')) return;
    busy = true;
    try { await deletePurchase(p.id); store.toast('Lot deleted'); router.closeSheet(); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
  const usedText = r => (limit ? `${r.qty} / ${limit}` : `${r.qty} bought`);
</script>

<!-- where the lot's tickets are on viagogo: a stepper per listing, and sales with no listing -->
{#snippet placement()}
  <h3 class="section-title">On viagogo · {onVg} of {f.qty}</h3>
    {#if lst.length || loose.length}
      <div class="box">
        {#each lst as x (x.l.id)}
          <div class="line on">
            <span class="grow"><b>{listingLine(x.l)}</b>
              <small>{x.l.tickets ?? 0} listed{x.sold ? ` · ${x.sold} sold` : ''}{x.l.statusKind !== 'active' && x.l.statusKind !== 'pending' ? ` · ${x.l.status.toLowerCase()}` : ''}{x.open ? ` · ${x.open} with no lot` : ''}{x.l.uploaded ? ' · uploaded' : ''}</small></span>
            <Stepper value={f.assigned.listings[x.l.id] || 0} min={0} max={(f.assigned.listings[x.l.id] || 0) + Math.max(0, room)} label="tickets on this listing"
              onchange={n => setOn('listings', x.l.id, n)} />
          </div>
        {/each}
        {#each looseShown as x (x.s.id)}
          <div class="line on">
            <span class="grow"><b>{x.s.section || '?'}{x.s.row ? ` row ${x.s.row}` : ''} · sale</b>
              <small>{x.s.tickets || 0} sold {shortDate(x.s.soldOn)} · no listing{x.open && x.open < (x.s.tickets || 0) ? ` · ${x.open} with no lot` : ''}</small></span>
            <Stepper value={f.assigned.sales[x.s.id] || 0} min={0} max={Math.min(x.s.tickets || 0, (f.assigned.sales[x.s.id] || 0) + Math.max(0, room))} label="tickets of this sale"
              onchange={n => setOn('sales', x.s.id, n)} />
          </div>
        {/each}
        {#if looseShown.length < loose.length}
          <button class="line more" onclick={() => (allSales = true)}>Sales of other sections · {loose.length - looseShown.length}<Icon name="chev" size={16} /></button>
        {/if}
      </div>
      {#if room < 0}<p class="warn">{-room} more placed than the lot has: lower a listing or a sale, or raise Tickets.</p>
      {:else}<p class="tiny muted pad">{room ? `${plural(room, 'ticket')} in your hands, on no listing.` : 'Every ticket is on a listing or a sale.'} When a listing sells, its tickets come off its lots, oldest first.</p>{/if}
    {:else}
      <p class="tiny muted pad">No viagogo listing for this event yet. Once one is read, put this lot's tickets on it here.</p>
    {/if}

{/snippet}

{#if v && !gkey}
  <Sheet title="Add lot">
    <p class="muted small ev">Which event are the tickets for?</p>
    <div class="picks">
      {#each choices as c (c.key)}
        <button class="pick" onclick={() => (picked = c.key)}>
          <span class="grow"><b>{c.num ? `#${c.num} ` : ''}{c.name}</b><small>{c.site}{c.time !== null ? ` · ${fromToday(c.time)}` : ''}</small></span>
          <Icon name="chev" size={18} />
        </button>
      {:else}
        <p class="muted small">No events to come. Track an event on a PC, or list on viagogo, and it shows here.</p>
      {/each}
    </div>
  </Sheet>
{:else if p && lotOf && !editing}
  {@const x = lotOf}
  <Sheet title="Lot">
    <div class="hero">
      {#if ev}
        <button class="evlink" onclick={goEvent}>{ev.num ? `#${ev.num} ` : ''}{evName}{g && g.time !== null ? ` · ${fromToday(g.time)}` : ''}<Icon name="chev" size={16} /></button>
      {:else}<p class="evlink plain">{evName || 'viagogo event'}{g && g.time !== null ? ` · ${fromToday(g.time)}` : ''} · viagogo</p>{/if}
      <h2 class="big">{sectorName || 'No section'} · {plural(x.qty, 'ticket')}</h2>
      {#if x.seats}<p class="seats">Seats {x.seats}</p>{/if}
      <div class="minibar" aria-hidden="true">
        <i class="sold" style:width="{pct(x.sold)}%"></i><i class="listed" style:width="{pct(x.listed)}%"></i>
        <i class="unlisted" style:width="{pct(x.free)}%"></i><i class="gone" style:width="{pct(x.unsold)}%"></i>
      </div>
      <p class="counts num">
        {#if x.sold}<span class="c-sold">{x.sold} sold{x.elsewhere ? ` (${x.elsewhere} outside viagogo)` : ''}</span>{/if}
        {#if x.listed}<span class="c-listed">{x.listed} listed</span>{/if}
        {#if x.free}<span class="c-unlisted">{x.free} not listed</span>{/if}
        {#if x.unsold}<span class="c-gone">{x.unsold} unsold, event over</span>{/if}
      </p>
    </div>

    {#if x.unsold && !selling}
      <p class="note">The event is over and {plural(x.unsold, 'ticket')} of this lot {x.unsold === 1 ? 'is' : 'are'} not counted as sold. Sold them? <button class="inl" onclick={startSell}>Add sale</button></p>
    {/if}

    {#if selling && sell}
      <div class="sellbox" use:reveal={'start'}>
        <h3 class="section-title">Add sale</h3>
        {#if openSales.length && freeRoom}
          <p class="tiny muted pad">Sold on viagogo? A sale of this event no lot covers:</p>
          <div class="box">
            {#each openSales.slice(0, 4) as o (o.e.key)}
              <div class="line">
                <span class="grow"><b>{o.e.sale.section || '?'}{o.e.sale.row ? ` row ${o.e.sale.row}` : ''} · {plural(o.e.qty, 'ticket')}</b>
                  <small>sold {shortDate(o.e.sale.soldOn)} · #{String(o.e.sale.id).slice(-5)}</small></span>
                <button class="btn small" onclick={() => takeSale(o.e)} disabled={busy}>Put {Math.min(o.e.qty, freeRoom)} here</button>
              </div>
            {/each}
          </div>
          <p class="tiny muted pad">Or sold outside viagogo:</p>
        {/if}
        <div class="box">
          <div class="line"><span>Tickets</span><Stepper value={sell.qty} min={1} max={Math.max(1, sellMax)} label="tickets sold" onchange={n => (sell.qty = n)} /></div>
        </div>
        {#if sell.qty > freeRoom}<p class="tiny muted pad">{plural(sell.qty - freeRoom, 'ticket')} come off this lot's viagogo listing: take them off viagogo too.</p>{/if}
        <div class="two">
          <label class="field"><span>Got a ticket</span><input class="input num" type="number" inputmode="decimal" min="0" step="any" bind:value={sell.price} placeholder="—" /></label>
          <label class="field"><span>Currency</span><select class="input" bind:value={sell.currency}>{#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>
          <label class="field"><span>Where</span><input class="input" bind:value={sell.where} autocomplete="off" placeholder="cash, a friend, a site" /></label>
          <label class="field"><span>Seats</span><input class="input" bind:value={sell.seats} autocomplete="off" placeholder={x.seats || 'e.g. 10-15'} /></label>
          <label class="field"><span>Sold on</span><input class="input" type="date" bind:value={sell.on} /></label>
        </div>
        <div class="sellbtns">
          <button class="btn" onclick={() => (selling = false)}>Cancel</button>
          <button class="btn primary grow1" onclick={saveSell} disabled={busy || sell.qty > sellMax}>{busy ? 'Saving…' : `Sold ${plural(sell.qty, 'ticket')}`}</button>
        </div>
      </div>
    {/if}

    <div class="box">
      {#if ev}<div class="line"><span>Sector</span><b>{sectorName || '—'}</b></div>{:else}<div class="line"><span>Section</span><b>{p.section || '—'}</b></div>{/if}
      <div class="line"><span>Seats</span><b>{x.seats || '—'}</b></div>
      {#if req}
        <button class="line link" onclick={openRequest}><span>Request</span><b>#{req.num} {req.code} ×{req.qty}{req.client ? ` · ${req.client}` : ''}<Icon name="chev" size={16} /></b></button>
      {:else if ev}<div class="line"><span>Request</span><b class="muted">none</b></div>{/if}
      <div class="line"><span>Account</span><b class="ell">{email}</b></div>
      <div class="line"><span>Paid</span><b class="num">{Number(p.price) > 0 ? `${money(p.price, p.currency)} each` : x.each !== null ? `${lek(x.each)} each (price list)` : 'no price'}</b></div>
      <div class="line"><span>Bought</span><b>{shortDate(p.boughtOn) || '—'}{p.orderRef ? ` · ${p.orderRef}` : ''}</b></div>
      {#if p.notes}<div class="line"><span>Notes</span><b class="wrap">{p.notes}</b></div>{/if}
    </div>

    <div class="tiles">
      <div><span>Spent</span><b class="num">{x.costL !== null ? lek(x.costL) : '—'}</b></div>
      <div><span>From its sales</span><b class="num">{lek(x.payoutL)}</b>{#if x.unpaidL > 0}<small>{lek(x.unpaidL)} not paid</small>{/if}</div>
      <div><span>{netL === null ? 'Result' : netL >= 0 ? 'Covered' : x.inHand ? 'At risk' : 'Lost'}</span>
        <b class="num" class:ok={netL !== null && netL >= 0} class:bad={netL !== null && netL < 0}>{netL === null ? '—' : lek(netL, true)}</b></div>
    </div>

    {#if placing && f}
      <div class="sellbox" use:reveal={'start'}>
        {@render placement()}
        <div class="sellbtns">
          <button class="btn" onclick={() => (placing = false)} disabled={busy}>Cancel</button>
          <button class="btn primary grow1" onclick={savePlace} disabled={busy || room < 0}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    {:else}
    <div class="sechead"><h3 class="section-title">On viagogo · {x.on.reduce((n, o) => n + o.qty, 0)}</h3>
      <button class="btn small" onclick={startPlace} disabled={busy || selling}>Change</button></div>
    {#if x.on.length}
      <div class="box" use:reveal={fresh === 'on'}>
        {#each x.on as o (o.listing ? o.listing.id : o.listingId)}
          {#if o.listing}
            <button class="line link" onclick={() => openListing(o.listing.id)}>
              <span class="grow"><b>{listingLine(o.listing)}</b>
                <small>{o.qty} of this lot{o.sold ? ` · ${o.sold} sold` : ''}{o.listed ? ` · ${o.listed} listed` : ''}{!['active', 'pending'].includes(o.listing.statusKind) ? ` · ${String(o.listing.status || '').toLowerCase()}` : ''}{o.listing.uploaded ? ' · uploaded' : ''}</small></span>
              <Icon name="chev" size={18} />
            </button>
          {:else}
            <div class="line"><span class="grow"><b>#{String(o.listingId).slice(-5)}</b><small>{o.qty} of this lot · listing no longer read</small></span></div>
          {/if}
        {/each}
      </div>
    {:else}<p class="tiny muted pad">On no listing. Change puts its tickets on a viagogo listing.</p>{/if}
    {/if}

    {#if x.sales.length}
      <h3 class="section-title">Sales · {x.sales.reduce((n, o) => n + o.qty, 0)}</h3>
      <div class="box">
        {#each x.sales as o, i (o.sale.id + ':' + o.via)}
          {@const lst = o.sale.listingId ? listingOf(o.sale.listingId) : null}
          <div class="line sale" use:reveal={fresh === 's:' + o.sale.id}>
            {#if lst}
              <button class="grow plainbtn" onclick={() => openListing(lst.id)}>
                <b>Sale {i + 1} · {plural(o.qty, 'ticket')}{o.qty < (o.sale.tickets || 0) ? ` of ${o.sale.tickets}` : ''}</b>
                <small>{shortDate(o.sale.soldOn) || '—'} · {o.sale.money && Number.isFinite(o.sale.money.payoutL) ? lek(o.sale.money.payoutL) : money(o.sale.amount, o.sale.currency)} · {isPaid(o.sale) ? 'paid' : 'not paid'} · #{String(lst.id).slice(-5)} ›</small>
              </button>
            {:else}
              <span class="grow">
                <b>Sale {i + 1} · {plural(o.qty, 'ticket')}{o.qty < (o.sale.tickets || 0) ? ` of ${o.sale.tickets}` : ''}</b>
                <small>{shortDate(o.sale.soldOn) || '—'} · {o.sale.money && Number.isFinite(o.sale.money.payoutL) ? lek(o.sale.money.payoutL) : money(o.sale.amount, o.sale.currency)} · {isPaid(o.sale) ? 'paid' : 'not paid'}{o.via === 'hand' ? ' · put here by hand' : ''}</small>
              </span>
            {/if}
            <input class="input seat" value={o.note} onchange={e => saveNote(o.sale.id, e.currentTarget.value)}
              autocomplete="off" placeholder="seats" aria-label="Seats of sale {i + 1}" />
          </div>
        {/each}
      </div>
      <p class="tiny muted pad">Type which seats each sale took; it saves when you leave the box.</p>
    {/if}

    {#if x.other.length}
      <h3 class="section-title">Sold outside viagogo · {x.elsewhere}</h3>
      <div class="box">
        {#each x.other as o (o.id)}
          <div class="line" use:reveal={fresh === 'o:' + o.id}>
            <span class="grow"><b>{plural(o.qty, 'ticket')}{o.where ? ` · ${o.where}` : ''}</b>
              <small>{o.on ? shortDate(o.on) + ' · ' : ''}{Number(o.price) > 0 ? `${money(o.price, o.currency)} each` : 'no price'}{o.seats ? ` · seats ${o.seats}` : ''}</small></span>
            <button class="x" onclick={() => dropSale(o)} disabled={busy} aria-label="Remove this sale"><Icon name="trash" size={16} /></button>
          </div>
        {/each}
      </div>
    {/if}

    {#snippet footer()}
      <button class="btn" onclick={startEdit} disabled={busy || placing || selling}><Icon name="edit" size={18} /> Edit</button>
      <button class="btn primary block" onclick={startSell} disabled={busy || selling || placing || (sellMax < 1 && !(openSales.length && freeRoom))}>{sellMax < 1 ? 'All sold' : 'Add sale'}</button>
      <button class="btn close" onclick={() => router.closeSheet()} aria-label="Close"><Icon name="down" size={18} /></button>
    {/snippet}
  </Sheet>
{:else if f && (ev || g)}
  <Sheet title={p ? 'Edit lot' : 'Add lot'}>
    <p class="muted small ev">{evName}{limit ? ` · ${limit} per account` : ''}{!ev ? ' · viagogo' : ''}</p>

    <div class="box">
      <div class="line"><span>Tickets</span><Stepper value={f.qty} max={999} onchange={n => (f.qty = n)} /></div>
      {#if ev}
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
      {:else}
        <label class="line"><span>Section</span><input class="input mini" bind:value={f.section} autocomplete="off" placeholder="as on viagogo" /></label>
      {/if}
      <label class="line"><span>Seats</span><input class="input mini" bind:value={f.assigned.seats} autocomplete="off" placeholder="e.g. row 5, 10-20" /></label>
    </div>

    <div class="two">
      <label class="field"><span>Paid a ticket</span><input class="input num" type="number" inputmode="decimal" min="0" step="any" value={f.price} oninput={e => typedPrice(e.currentTarget.value)} placeholder="—" /></label>
      <label class="field"><span>Currency</span>
        <select class="input" bind:value={f.currency}>{#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}</select></label>
    </div>
    {#if autoPrice && priceAuto && f.price !== ''}<p class="tiny muted src">{SOURCE[autoPrice.source]}{autoPrice.range ? ` (${money(autoPrice.range[0], autoPrice.currency)} – ${money(autoPrice.range[1], autoPrice.currency)})` : ''}</p>{/if}
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

    {#if over}<p class="warn top">Over the limit: {acct.account.email} would have {after} of {limit}.</p>{/if}
    <div class="two">
      <label class="field"><span>Bought on</span><input class="input" type="date" bind:value={f.boughtOn} /></label>
      <label class="field"><span>Order number</span><input class="input" bind:value={f.orderRef} autocomplete="off" placeholder="—" /></label>
    </div>
    <label class="field"><span>Notes</span><input class="input" bind:value={f.notes} autocomplete="off" placeholder="—" /></label>
    {#if !p}{@render placement()}
    {:else if room < 0}<p class="warn top">{plural(placed, 'ticket')} of this lot are on listings, sales or sold: Tickets can't go below that.</p>{/if}

    {#if f.requestId}<p class="tiny muted pad">Once lots cover the request's tickets it turns Bought{f.price !== '' ? ', and takes this price if it has none' : ''}.</p>{/if}

    {#snippet footer()}
      {#if p}<button class="btn danger" onclick={remove} disabled={busy} aria-label="Delete lot"><Icon name="trash" size={18} /></button>{/if}
      <button class="btn primary block" onclick={save} disabled={busy || !f.accountId || room < 0}>{busy ? 'Saving…' : p ? 'Save' : `Add ${plural(f.qty, 'ticket')}`}</button>
      {#if p}<button class="btn" onclick={() => (editing = false)} disabled={busy}>Cancel</button>
      {:else}<button class="btn close" onclick={() => router.closeSheet()} aria-label="Close"><Icon name="down" size={18} /></button>{/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .ev { margin: 0 0 4px; text-align: center; }
  .accounts, .picks { display: grid; gap: 6px; }
  .acc, .pick {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 8px 12px;
    border: 1.5px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--ink);
    font: inherit; text-align: left; cursor: pointer;
  }
  .pick { color: var(--ink); }
  .pick :global(svg) { color: var(--muted); flex: none; }
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
  .line + .line { border-top: 1px solid var(--line); }
  .line.on { padding: 4px 0; }
  .more { width: 100%; border: 0; border-top: 1px solid var(--line); background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--accent); cursor: pointer; justify-content: flex-start; gap: 6px; }
  .line.on :global(.stepper) { background: var(--panel); flex: none; }
  .input.mini { width: auto; max-width: 62%; min-height: 40px; padding: 6px 10px; }
  .warn { margin: 0 0 10px; padding: 8px 10px; border-radius: 10px; background: var(--badbg); color: var(--bad); font-size: 14px; font-weight: 600; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .pad { margin: 8px 4px 0; }
  .src { margin: -6px 4px 12px; }
  .close { flex: none; margin-left: auto; }
  .note { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--lowbg, var(--soft)); color: var(--ink); font-size: 13.5px; }
  .input.seat { flex: none; width: 34%; min-height: 40px; padding: 6px 10px; }
  .x { width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; background: none; color: var(--muted); cursor: pointer; }
  .warn.top { margin: 10px 0 0; }
  .line.sale { padding: 6px 0; }
  .sechead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 0 8px; }
  .sechead h3 { margin: 0; }
  .sechead .btn { min-height: 32px; }
  .inl { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; color: var(--accent); cursor: pointer; }
  .note { margin: 0 0 12px; }
  .accounts { margin-bottom: 14px; }
  .hero { text-align: center; display: grid; gap: 4px; justify-items: center; margin: 0 0 10px; }
  .evlink { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; padding: 0; font: inherit; font-size: 14px; font-weight: 650; color: var(--accent); cursor: pointer; }
  .evlink.plain { color: var(--muted); margin: 0; }
  .big { margin: 2px 0 0; font-size: 24px; font-weight: 750; }
  .seats { margin: 0; font-size: 15px; font-weight: 600; }
  .hero .minibar { width: 100%; display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--softer); margin: 8px 0 2px; }
  .minibar i { display: block; height: 100%; }
  .sold { background: var(--s-ok); } .listed { background: var(--accent); } .unlisted { background: var(--s-low); } .gone { background: var(--s-none); }
  .counts { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 12px; margin: 0; font-size: 13px; color: var(--muted); }
  .c-sold { color: var(--ok); } .c-listed { color: var(--accent); } .c-unlisted { color: var(--low); font-weight: 650; } .c-gone { color: var(--bad); }
  .line > span:first-child:not(.grow) { color: var(--muted); }
  .line > b { font-weight: 600; text-align: right; min-width: 0; display: inline-flex; align-items: center; gap: 4px; }
  .ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block !important; }
  .wrap { white-space: normal; }
  .link { width: 100%; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 0; }
  .link :global(svg) { color: var(--muted); flex: none; }
  .plainbtn { border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 4px; }
  .tiles div { background: var(--soft); border-radius: 12px; padding: 10px; display: grid; gap: 2px; min-width: 0; }
  .tiles span, .tiles small { font-size: 12px; color: var(--muted); }
  .tiles b { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .sellbox { background: var(--panel); border: 1.5px solid var(--accent); border-radius: 14px; padding: 4px 12px 12px; margin: 0 0 12px; }
  .sellbox .box { background: var(--soft); }
  .sellbox .two { grid-template-columns: 1fr 1fr; }
  .sellbtns { display: flex; gap: 8px; }
  .grow1 { flex: 1; }
</style>

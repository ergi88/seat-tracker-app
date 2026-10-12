<script>
  /* One deal: a request (the seats you watch on the ticket site), its
   * viagogo listing (what you sell), or both. Either half may be missing:
   * a request not listed yet, or a listing nobody tracks. The head stays put
   * (who, where to go, how it stands, the tabs); the tabs scroll. */
  import Sheet from '../ui/Sheet.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { updateRequest, setDone, setListingBuy, editListing, addRequest } from '../lib/actions.js';
  import { listingSyncPlan } from '../lib/model.js';
  import { ago, lek, money, day } from '../lib/fmt.js';

  let { requestId = null, listingId = null, tab: firstTab = null } = $props();
  const P = SK.profit;

  const v = $derived(store.view);
  /* a listing opened on its own still finds the request it belongs to, and the other way round */
  const r = $derived.by(() => {
    if (!v) return null;
    if (requestId) return v.requests.find(x => x.id === requestId) || null;
    const l0 = v.listings.find(x => x.id === listingId);
    return l0 && l0.requestId ? v.requests.find(x => x.id === l0.requestId) || null : null;
  });
  const l = $derived.by(() => {
    if (!v) return null;
    if (r) return r.listing ? v.listings.find(x => x.id === String(r.listing)) || null : null;
    return listingId ? v.listings.find(x => x.id === listingId) || null : null;
  });
  const ev = $derived(v && (r || l) ? v.events.find(e => e.key === (r ? r.eventKey : l.eventKey)) || null : null);
  const code = $derived(r ? r.code : l ? l.code : '');
  const count = $derived(l && l.tickets !== null ? l.tickets : r ? r.qty : 0);
  const mon = $derived(l && l.money && !l.money.missing ? l.money : null);
  const buy = $derived((l && l.buy) || (r && r.buy) || null);
  const team = $derived((r ? r.teamPrices : l ? l.teamPrices : null) || []);
  const viagogoUrl = $derived(l ? l.url : r && r.listingUrl ? r.listingUrl : '');
  const sectorUrl = $derived(r ? r.sectorUrl : l ? l.sectorUrl : '');
  const canTrack = $derived(!!(l && !r && l.eventKey && l.sectorId));

  let tab = $state(firstTab || (requestId ? 'seats' : 'listing'));
  let busy = $state(false);
  const tone = $derived(r ? (r.done ? 'none' : r.tone) : 'none');
  const winText = x => win(x).replace(/[()]/g, '');
  function win(x) { return P.winRateText(x); }

  /* ---------------- leaving the sheet ---------------- */
  function then(open) { router.closeSheet(); setTimeout(open, 350); }
  const tell = to => then(() => router.openSheet({ kind: 'message', eventKey: ev ? ev.key : null, section: code, to }));
  const del = () => then(() => router.openSheet({ kind: 'deleteRequest', id: r.id }));
  const delListing = () => then(() => router.openSheet({ kind: 'deleteListing', id: l.id }));

  async function act(run, okText) {
    busy = true;
    try { const out = await run(); if (okText) store.toast(typeof okText === 'function' ? okText(out) : okText); return out; }
    catch (e) { store.toast(e.message, { tone: 'bad' }); }
    finally { busy = false; }
  }
  function field(k, value) {
    if (String(value ?? '') === String(r[k] ?? '')) return;
    act(() => updateRequest(r.id, { [k]: value }));
  }
  async function toggleDone() {
    const was = r.done;
    const ok = await act(() => setDone(r.id, !was));
    if (ok !== undefined) { router.closeSheet(); store.toast(was ? `#${r.num} reopened` : `#${r.num} done`); }
  }
  const track = () => act(
    () => addRequest({ eventKey: l.eventKey, sec: l.sectorId, qty: Math.max(1, Number(l.tickets) || 1), listing: l.id }),
    req => `Tracking ${code} as #${req.num}`
  ).then(req => { if (req) tab = 'seats'; });

  let linkInput = $state('');
  const linkListing = () => act(() => updateRequest(r.id, { listing: linkInput }), 'Listing linked').then(() => { linkInput = ''; });

  /* one buy price for the deal: the listing's wins in every sum, so both get it */
  const typedBuy = $derived((l && l.buyPrice) ?? (r && r.buyPrice) ?? '');
  const buyCurrency = $derived((l && Number(l.buyPrice) > 0 ? l.buyCurrency : r && Number(r.buyPrice) > 0 ? r.buyCurrency : buy && buy.currency) || P.BASE);
  function setBuy(price, currency) {
    act(async () => {
      if (l) await setListingBuy(l.id, price, currency);
      if (r) await updateRequest(r.id, { buyPrice: price, buyCurrency: currency });
    }, 'Buy price saved');
  }

  /* ---------------- the listing: edit -> confirm -> linked request ---------------- */
  const STATUSES = SK.viagogo.LISTING_STATUSES.filter(x => x.key !== 'other');
  const kindOf = st => SK.viagogo.listingStatus(st);
  let step = $state('edit');            // edit | confirm | sync
  let draft = $state(null);
  let plan = $state([]);
  function resetDraft() {
    draft = l ? { price: l.price ?? '', tickets: l.tickets ?? 1, status: kindOf(l.status) === 'other' ? 'active' : kindOf(l.status) } : null;
  }
  $effect(() => { if (l && !draft) resetDraft(); });
  const statusOut = $derived(l && draft ? (draft.status === kindOf(l.status) ? l.status : (STATUSES.find(x => x.key === draft.status) || {}).label) : '');
  const diffs = $derived.by(() => {
    if (!l || !draft) return [];
    const out = [];
    if (Number(draft.price) !== Number(l.price)) out.push({ label: 'Price', from: money(l.price, l.currency), to: money(Number(draft.price), l.currency) });
    if (Number(draft.tickets) !== Number(l.tickets)) out.push({ label: 'Tickets', from: l.tickets ?? '?', to: draft.tickets });
    if (statusOut !== l.status) out.push({ label: 'Status', from: l.status || '—', to: statusOut });
    return out;
  });
  const priceOk = $derived(!!draft && Number(draft.price) > 0);
  async function saveListing() {
    const out = await act(() => editListing(l.id, { price: draft.price, tickets: draft.tickets, status: statusOut }));
    if (!out) { step = 'edit'; return; }
    plan = listingSyncPlan(store.mirror, store.user.id, out.before, out.after);
    resetDraft();
    if (plan.length) step = 'sync';
    else { step = 'edit'; store.toast('Listing saved'); }
  }
  async function syncRequests() {
    const done = await act(async () => {
      const nums = [];
      for (const p of plan) {
        const changes = {};
        for (const it of p.items) if (it.on) changes[it.key] = it.value;
        if (!Object.keys(changes).length) continue;
        await updateRequest(p.id, changes);
        nums.push('#' + p.num);
      }
      return nums;
    });
    if (done) { store.toast(done.length ? `Request ${done.join(', ')} updated` : 'Request left as it was'); step = 'edit'; }
  }

  /* ---------------- money ---------------- */
  const rates = $derived((v && v.fx && v.fx.rates) || {});
  const sellCurrency = $derived((l && l.currency) || 'USD');
  /* this listing's own share when it has one, else what your listings say viagogo pays */
  const keep = $derived((mon && mon.ratio) || P.keepRatio(v ? v.listings : []) || 1);
  const costL = $derived(buy ? buy.amount * (P.rateOf(rates, buy.currency) || NaN) : NaN);
  let ask = $state(null);
  const askShown = $derived(ask ?? (l && l.price ? String(l.price) : ''));
  const q = $derived(buy ? P.quote({ buy: buy.amount, buyCurrency: buy.currency, sell: askShown, sellCurrency, tickets: count || 1, keep }, rates) : null);
  const breakEven = $derived(buy ? P.breakEvenAsk({ buy: buy.amount, buyCurrency: buy.currency, sellCurrency, keep }, rates) : null);
  const targets = $derived(breakEven > 0 ? P.WIN_TARGETS.map(w => ({ w, price: P.askFor(breakEven, w), profit: costL * (w - 1) })) : []);
</script>

{#if r || l}
  <Sheet label={`${r ? '#' + r.num + ' ' : ''}${code}`}>
    {#snippet head()}
      <div class="hd">
        <div class="id">
          {#if r}<span class="no">#{r.num}</span>{/if}
          <span class="code">{code}</span>
          <span class="qty num">×{r ? r.qty : count}</span>
          {#if r && r.done}<span class="pill none">DONE</span>{/if}
        </div>
        <div class="muted small ev">
          {ev ? `[${ev.num}] ${ev.info.name}` : (l && l.title) || ''}{ev && ev.time !== null ? ' · ' + day(ev.time) : l && l.when ? ' · ' + l.when : ''}{r && r.client ? ' · ' + r.client : ''}
        </div>
      </div>

      <!-- every way out of the sheet, in one strip -->
      <nav class="links" aria-label="Open elsewhere">
        {#if viagogoUrl}<a class="link" href={viagogoUrl} target="_blank" rel="noopener"><Icon name="external" size={16} />viagogo</a>{/if}
        {#if sectorUrl}<a class="link" href={sectorUrl} target="_blank" rel="noopener"><Icon name="ticket" size={16} />{code} · {ev ? ev.siteLabel : 'site'}</a>{/if}
        <button class="link" onclick={() => tell(null)}><Icon name="send" size={16} />Tell team</button>
      </nav>

      <div class="sum">
        {#if r}
          <div class="cell seat {tone}">
            <span class="k">Seats</span>
            <b class="big {tone}">{r.done ? 'DONE' : r.status}</b>
            <span class="s num">{r.free ?? '—'} free · {r.options} opt.</span>
          </div>
        {:else}
          <button class="cell add" onclick={() => (tab = 'seats')}>
            <span class="k">Seats</span><b class="big muted">Not watched</b><span class="s plus">+ Track</span>
          </button>
        {/if}
        {#if l}
          <div class="cell">
            <span class="k">Listed</span>
            <b class="big num">{money(l.price, l.currency).replace(/\.00$/, '')} ×{l.tickets ?? '?'}</b>
            <span class="s accent">{l.status || '—'}</span>
          </div>
        {:else}
          <button class="cell add" onclick={() => (tab = 'listing')}>
            <span class="k">Listed</span><b class="big muted">{r && r.listing ? 'Not read' : 'Not yet'}</b><span class="s plus">{r && r.listing ? r.listing : '+ Add ID'}</span>
          </button>
        {/if}
        <div class="cell">
          <span class="k">Profit</span>
          {#if mon}
            <b class="big num {mon.perTicket >= 0 ? 'ok' : 'bad'}">{lek(mon.perTicket, true)}</b>
            <span class="s">a ticket · {winText(mon.winRate)}</span>
          {:else}
            <b class="big muted">—</b>
            <span class="s">{!l ? 'not listed yet' : l.money && l.money.missing === 'buy' ? 'no buy price' : 'no rate yet'}</span>
          {/if}
        </div>
      </div>

      <div class="tabs" role="tablist" aria-label="Sections">
        {#each [['seats', 'Seats'], ['listing', 'Listing'], ['money', 'Money'], ['details', 'Details']] as [key, label] (key)}
          <button role="tab" aria-selected={tab === key} class:on={tab === key} onclick={() => (tab = key)}>{label}</button>
        {/each}
      </div>
    {/snippet}

    <!-- ================= Seats ================= -->
    {#if tab === 'seats'}
      {#if r}
        <div class="status {tone}">
          <span class="pill {tone}">{r.done ? 'DONE' : r.status}</span>
          <span class="num strong">{r.free ?? '—'} free · {SK.util.plural(r.options, 'option')}</span>
          <span class="muted small">{r.sectorName}{r.priceTag ? ' · ' + r.priceTag : ''} · {r.scannedAt ? `scanned ${ago(r.scannedAt)}` : 'not scanned yet'}{r.preview ? ' · preview' : ''}</span>
          {#if r.scanNote}<span class="muted small">{r.scanNote}</span>{/if}
          {#if r.muffled}<span class="muted small">Its listing is switched off: no scans, no alerts.</span>{/if}
        </div>
        <div class="box">
          <div class="line"><span>Tickets wanted</span><Stepper value={r.qty} onchange={n => act(() => updateRequest(r.id, { qty: n }))} /></div>
          <label class="line"><span>Side by side</span><input type="checkbox" checked={r.together} onchange={e => act(() => updateRequest(r.id, { together: e.currentTarget.checked }))} /></label>
          <label class="line"><span>Block warn</span><input class="input mini num" type="number" inputmode="numeric" value={r.warn} onchange={e => field('warn', e.currentTarget.value)} /></label>
          <label class="line"><span>Options warn</span><input class="input mini num" type="number" inputmode="numeric" value={r.opts} onchange={e => field('opts', e.currentTarget.value)} /></label>
        </div>
      {:else}
        <div class="empty-card">
          <b>{code} is not watched</b>
          {#if canTrack}
            <span class="muted small">Track it to see free seats and get told when they run low. The request starts linked to this listing, for {Math.max(1, Number(l.tickets) || 1)} tickets: Track, below.</span>
          {:else}
            <span class="muted small">This listing's event or section is not one the team tracks yet. Track the event on a PC first, then it can be watched here.</span>
          {/if}
        </div>
      {/if}

      <h3 class="section-title">Team in {code}</h3>
      {#each team as t}
        <button class="mate" onclick={() => tell([t.userId])}>
          <span class="avatar">{(t.owner || '?').slice(0, 1).toUpperCase()}</span>
          <span class="grow"><b>{t.owner}{t.tickets ? ` · ${t.tickets} at ` : ' · '}{money(t.price, t.currency)}</b><span class="muted tiny">Tap to message {t.owner}</span></span>
          <Icon name="send" size={18} />
        </button>
      {:else}
        <p class="muted small pad">Nobody else on the team lists {code}.</p>
      {/each}
    {/if}

    <!-- ================= Listing ================= -->
    {#if tab === 'listing'}
      {#if l && draft}
        {#if step === 'sync'}
          <div class="confirm">
            <b><Icon name="check" size={16} /> Listing saved. Update the linked request too?</b>
            <p class="tiny muted">So it searches for what the listing now holds.</p>
            {#each plan as p (p.id)}
              <div class="req">
                <span class="rnum">#{p.num}</span>
                <div class="checks">
                  {#each p.items as it (it.key)}<label class="check"><input type="checkbox" bind:checked={it.on} /> {it.text}</label>{/each}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="editor" class:locked={step === 'confirm'}>
            <label class="field"><span>Price a ticket ({l.currency || '—'})</span>
              <input class="input num big-input" type="number" inputmode="decimal" min="0" step="0.01" bind:value={draft.price} disabled={step === 'confirm'} /></label>
            <div class="line-card"><span>Tickets listed</span>
              {#if step === 'confirm'}<b class="num">{draft.tickets}</b>{:else}<Stepper value={draft.tickets} min={0} onchange={n => (draft.tickets = n)} />{/if}
            </div>
            <div class="seg" role="radiogroup" aria-label="Status">
              {#each STATUSES as st (st.key)}
                <button type="button" role="radio" aria-checked={draft.status === st.key} class:on={draft.status === st.key}
                  disabled={step === 'confirm'} onclick={() => (draft.status = st.key)}>{st.key === 'deactivated' ? 'Off' : st.label}</button>
              {/each}
            </div>
            {#if !priceOk}<p class="small bad-text">Type a price above 0.</p>{/if}
          </div>
          {#if step === 'confirm'}
            <div class="confirm" role="alert">
              <b>Save these changes?</b>
              {#each diffs as d (d.label)}<div class="kv"><span>{d.label}</span><b class="num"><s>{d.from}</s> → {d.to}</b></div>{/each}
              <p class="tiny muted">Only the app's copy changes. Change it on viagogo too: the next read of your listings page on a PC writes viagogo's numbers over these.</p>
            </div>
          {/if}
          <div class="box">
            <div class="kv row"><span>You'll get</span><b class="num">{money(l.payout, l.currency)}{l.tickets ? ` · ${money(l.payout / l.tickets, l.currency)} a ticket` : ''}</b></div>
            <div class="kv row"><span>Listing</span><b class="num">{l.id}</b></div>
          </div>
          <p class="tiny muted pad">Read on viagogo {ago(l.seenAt)}.</p>
        {/if}
      {:else if r && r.listing}
        <div class="empty-card">
          <b>Listing {r.listing} is linked</b>
          <span class="muted small">Its price and tickets show once a PC reads your viagogo listings page. A wrong number can be changed under Details.</span>
        </div>
      {:else if r}
        <div class="empty-card">
          <b>Not listed on viagogo yet</b>
          <span class="muted small">Paste the listing ID or link once you list it. Price, tickets and profit then show here.</span>
          <input class="input" bind:value={linkInput} inputmode="text" placeholder="Listing ID or viagogo link" />
        </div>
      {/if}
    {/if}

    <!-- ================= Money ================= -->
    {#if tab === 'money'}
      <div class="totals">
        <div class="tot">
          <span>Spent</span>
          <b class="num">{Number.isFinite(costL) && count ? lek(costL * count) : '—'}</b>
          <small class="num">{buy && count ? `${count} × ${money(buy.amount, buy.currency)}` : 'no buy price'}</small>
        </div>
        <div class="tot">
          <span>You'll get</span>
          <b class="num">{mon ? lek(mon.payoutL * mon.tickets) : '—'}</b>
          <small class="num">{l ? money(l.payout, l.currency) : 'not listed'}</small>
        </div>
        <div class="tot {mon ? (mon.total >= 0 ? 'good' : 'loss') : ''}">
          <span>Profit</span>
          <b class="num">{mon ? lek(mon.total, true) : '—'}</b>
          <small>{mon ? winText(mon.winRate) : 'list to see'}</small>
        </div>
      </div>

      <div class="two">
        <label class="field"><span>Paid a ticket</span>
          <input class="input num" type="number" inputmode="decimal" value={typedBuy} placeholder={buy ? String(buy.amount) : '—'}
            onchange={e => setBuy(e.currentTarget.value, buyCurrency)} /></label>
        <label class="field"><span>Currency</span>
          <select class="input" value={buyCurrency} onchange={e => setBuy(typedBuy, e.currentTarget.value)}>
            {#each P.CURRENCIES as c}<option value={c}>{c}</option>{/each}
          </select></label>
      </div>
      <p class="tiny muted pad">{Number(typedBuy) > 0 ? 'Typed by you.' : buy ? `Empty uses the ${buy.source}: ${money(buy.amount, buy.currency)}.` : 'Type what one ticket cost to see the money.'}{l && r ? ' One price for the request and its listing.' : ''}</p>

      <h3 class="section-title">Calculator</h3>
      <div class="calc">
        <label class="ask"><span>Ask a ticket ({sellCurrency})</span>
          <input class="input num" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value={askShown} oninput={e => (ask = e.currentTarget.value)} /></label>
        <div class="muted tiny meta"><span>{count || 1} tickets · viagogo pays {Math.round(keep * 1000) / 10}%</span><span>rates of {(v && v.fx && v.fx.day) || 'today'}</span></div>
        <div class="res">
          <div><span class="muted tiny">You get a ticket</span><b class="num">{q && q.payoutL ? lek(q.payoutL) : '—'}</b></div>
          <div><span class="muted tiny">Profit a ticket</span><b class="num {q && q.perTicket >= 0 ? 'ok' : 'bad'}">{q && Number.isFinite(q.perTicket) ? lek(q.perTicket, true) : '—'}</b></div>
          <div><span class="muted tiny">All {count || 1}</span><b class="num {q && q.total >= 0 ? 'ok' : 'bad'}">{q && Number.isFinite(q.total) ? `${lek(q.total, true)} ${win(q.winRate)}` : '—'}</b></div>
        </div>
      </div>
      {#if targets.length}
        <div class="targets">
          <div class="th muted tiny"><span>Win</span><span>Ask a ticket</span><span>Profit a ticket</span></div>
          {#each targets as tg (tg.w)}
            <button class:on={Number(askShown) === tg.price} onclick={() => (ask = String(tg.price))}>
              <b class="w">x{tg.w}</b><b class="num">{money(tg.price, sellCurrency)}</b><span class="num ok">{lek(tg.profit, true)}</span>
            </button>
          {/each}
        </div>
        <p class="tiny muted pad">Break-even {money(breakEven, sellCurrency)}. Tap a row to try that price.</p>
      {:else}
        <p class="muted small pad">A buy price gives what to ask for x1.5, x2, x2.5 and x3.</p>
      {/if}
    {/if}

    <!-- ================= Details ================= -->
    {#if tab === 'details'}
      <div class="fields">
        {#if r}
          <label class="field"><span>Client</span><input class="input" value={r.client} onchange={e => field('client', e.currentTarget.value)} placeholder="—" /></label>
          <label class="field"><span>viagogo listing ID</span><input class="input" value={r.listing} inputmode="numeric" onchange={e => field('listing', e.currentTarget.value)} placeholder="—" /></label>
        {/if}
      </div>
      <div class="box">
        <div class="kv row"><span>Event</span><b>{ev ? `[${ev.num}] ${ev.info.name}` : (l && l.title) || '—'}</b></div>
        <div class="kv row"><span>Section</span><b>{r ? r.sectorName : l ? l.sectorName || l.section : '—'}</b></div>
        <div class="kv row"><span>Request</span><b>{r ? `#${r.num}${r.client ? ' · ' + r.client : ''}` : 'none'}</b></div>
        {#if l}<div class="kv row"><span>Listing</span><b class="num">{l.id}</b></div>{/if}
      </div>
    {/if}

    {#snippet footer()}
      {#if tab === 'listing' && l && step === 'confirm'}
        <button class="btn" disabled={busy} onclick={() => (step = 'edit')}>Back</button>
        <button class="btn primary block" disabled={busy} onclick={saveListing}>{busy ? 'Saving…' : 'Confirm and save'}</button>
      {:else if tab === 'listing' && l && step === 'sync'}
        <button class="btn" disabled={busy} onclick={() => { step = 'edit'; store.toast('Request left as it was'); }}>Skip</button>
        <button class="btn primary block" disabled={busy || !plan.some(p => p.items.some(i => i.on))} onclick={syncRequests}>{busy ? 'Updating…' : 'Update request'}</button>
      {:else if tab === 'listing' && l}
        <button class="btn danger" onclick={delListing} aria-label="Delete listing"><Icon name="trash" size={18} /></button>
        <button class="btn primary block" disabled={!priceOk || !diffs.length} onclick={() => (step = 'confirm')}>{diffs.length ? 'Save listing…' : 'Change price, tickets or status'}</button>
      {:else if tab === 'listing' && r && !r.listing}
        <button class="btn primary block" disabled={busy || !linkInput.trim()} onclick={linkListing}>Link listing</button>
      {:else if r}
        <button class="btn danger" onclick={del} aria-label="Delete request"><Icon name="trash" size={18} /></button>
        <button class="btn {r.done ? '' : 'good'} block" disabled={busy} onclick={toggleDone}><Icon name="check" size={18} /> {r.done ? 'Reopen' : 'Mark done'}</button>
      {:else if canTrack}
        <button class="btn primary block" disabled={busy} onclick={track}>Track {code} ×{Math.max(1, Number(l.tickets) || 1)}</button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .hd { display: grid; gap: 2px; }
  .id { display: flex; align-items: baseline; gap: 8px; }
  .no { font-size: 15px; font-weight: 650; color: var(--muted); }
  .code { font-size: 24px; font-weight: 750; letter-spacing: -.02em; }
  .qty { font-size: 17px; font-weight: 600; }
  .id .pill { align-self: center; }
  .ev { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .links { display: flex; gap: 6px; margin-top: 10px; }
  .link {
    flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 44px; padding: 0 8px; border: 0; border-radius: 12px; cursor: pointer;
    background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 14px; font-weight: 650;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .link :global(svg) { flex: none; }
  .link:active { filter: brightness(.95); transform: scale(.98); }

  .sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 10px; border-radius: 16px; background: var(--soft); overflow: hidden; }
  .cell { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 11px 10px; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
  .cell + .cell { border-left: 1px solid var(--line); }
  .cell .k { font-size: 11px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .cell .big { font-size: 17px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .s { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .s.accent, .cell .s.plus { color: var(--accent); font-weight: 600; }
  .cell.add { cursor: pointer; }
  .cell.seat { padding-left: 14px; box-shadow: inset 4px 0 0 var(--s-none); }
  .cell.seat.ok { box-shadow: inset 4px 0 0 var(--s-ok); }
  .cell.seat.low { box-shadow: inset 4px 0 0 var(--s-low); }
  .cell.seat.bad { box-shadow: inset 4px 0 0 var(--s-bad); }
  .big.ok { color: var(--ok); } .big.low { color: var(--low); } .big.bad { color: var(--bad); } .big.none { color: var(--muted); }

  .tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 10px; padding: 3px; border-radius: 11px; background: var(--softer); }
  .tabs button { min-height: 36px; border: 0; border-radius: 9px; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .2s, color .2s; }
  .tabs button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }

  .status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 12px 14px; border-radius: 12px; background: var(--soft); }
  .strong { font-weight: 650; }
  .box { background: var(--soft); border-radius: 12px; padding: 0 14px; margin-top: 12px; }
  .line { display: flex; align-items: center; justify-content: space-between; min-height: 52px; gap: 12px; }
  .line + .line { border-top: 1px solid var(--line); }
  .line input[type=checkbox] { width: 24px; height: 24px; accent-color: var(--accent); }
  .input.mini { width: 84px; min-height: 40px; padding: 6px 10px; text-align: right; }
  .kv { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .kv span { color: var(--muted); }
  .kv.row { padding: 11px 0; font-size: 15px; }
  .kv.row + .kv.row { border-top: 1px solid var(--line); }
  .kv b { text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pad { margin: 8px 4px 0; }

  .empty-card { display: grid; gap: 10px; padding: 16px; border-radius: 12px; border: 1.5px dashed var(--line); }
  .mate {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; margin-bottom: 8px; padding: 8px 14px;
    border: 0; border-radius: 12px; background: var(--soft); color: var(--accent); font: inherit; text-align: left; cursor: pointer;
  }
  .mate .grow { flex: 1; min-width: 0; display: grid; gap: 1px; color: var(--ink); }
  .mate b { font-weight: 650; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--softer); color: var(--ink); display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: none; }

  .editor { display: grid; gap: 12px; }
  .editor.locked { opacity: .55; }
  .big-input { font-size: 18px; font-weight: 650; }
  .line-card { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 6px 14px; border-radius: 12px; background: var(--soft); }
  .line-card b { font-size: 18px; padding-right: 10px; }
  .seg { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 3px; border-radius: 11px; background: var(--softer); }
  .seg button { min-height: 36px; padding: 0 4px; border: 0; border-radius: 9px; background: none; font: inherit; font-weight: 600; font-size: 13.5px; color: var(--muted); cursor: pointer; }
  .seg button.on { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px var(--shadow); }
  .bad-text { color: var(--bad); margin: 0; }
  .confirm { display: grid; gap: 8px; padding: 14px; margin-top: 12px; border-radius: 12px; background: var(--accent-soft); }
  .confirm s { color: var(--muted); font-weight: 500; }
  .confirm p { margin: 0; }
  .req { display: flex; gap: 10px; align-items: flex-start; padding-top: 4px; }
  .rnum { font-weight: 750; min-width: 34px; }
  .checks { display: grid; gap: 8px; }
  .check { display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .check input { width: 22px; height: 22px; accent-color: var(--accent); margin: 0; }

  .totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
  .tot { display: grid; gap: 2px; padding: 12px 10px; border-radius: 12px; background: var(--soft); min-width: 0; }
  .tot span { font-size: 12px; color: var(--muted); }
  .tot b { font-size: 16px; font-weight: 750; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tot small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tot.good { background: var(--okbg); } .tot.good span, .tot.good b, .tot.good small { color: var(--ok); }
  .tot.loss { background: var(--badbg); } .tot.loss span, .tot.loss b, .tot.loss small { color: var(--bad); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .calc { display: grid; gap: 10px; padding: 14px; border-radius: 12px; background: var(--soft); }
  .ask { display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .ask span { flex: 1; }
  .ask .input { width: 130px; text-align: right; font-size: 18px; font-weight: 650; }
  .meta { display: flex; justify-content: space-between; gap: 8px; }
  .res { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); }
  .res div { display: grid; gap: 2px; min-width: 0; }
  .res b { font-size: 15px; font-weight: 700; }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .targets { margin-top: 10px; border-radius: 12px; background: var(--soft); overflow: hidden; }
  .targets .th, .targets button { display: grid; grid-template-columns: 52px minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: center; padding: 0 14px; }
  .targets .th { padding-top: 10px; padding-bottom: 6px; }
  .targets .th span:last-child, .targets button span { text-align: right; }
  .targets button { width: 100%; min-height: 48px; border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
  .targets button.on { background: var(--accent-soft); }
  .targets .w { color: var(--accent); font-weight: 750; }
  .targets span.ok { font-weight: 600; }

  .fields { display: grid; gap: 12px; }
  .fields:empty { display: none; }
</style>

<script>
  /* Inventory: the tickets you bought, lot by lot. Nothing else counts:
   * no lots, 0 tickets and nothing to lose. A lot's tickets are put on
   * viagogo listings in the lot's sheet; a listing's sales come off them.
   *
   * Two short lists sit with it: listings whose tickets viagogo says are
   * uploaded but no lot covers (Add lot, after you confirm it), and, at the
   * bottom and folded, what you listed or sold with no lot: tickets still to
   * buy, until the event is over. The figures are lib/lots.js's.
   * Once an event is over, a lot's tickets not counted as sold are unsold
   * (lost); open the lot to say where they went. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import DateTile from '../ui/DateTile.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { lek, money, plural, fromToday, win } from '../lib/fmt.js';
  import { sumOf } from '../lib/lots.js';

  const KEY = 'st:inventory';
  const DISMISS = 'st:uploaded-ok';
  const FILTERS = [
    ['hand', 'In hand', g => g.total.inHand > 0],
    ['free', 'Not listed', g => g.total.free > 0],
    ['gone', 'Unsold', g => g.total.unsold > 0],
    ['all', 'All lots', () => true]
  ];
  const stored = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const keep = (k, x) => { try { localStorage.setItem(k, JSON.stringify(x)); } catch (e) { /* private mode */ } };
  let only = $state((() => { const x = stored(KEY, 'hand'); return FILTERS.some(f => f[0] === x) ? x : 'hand'; })());
  const pick = k => { only = k; keep(KEY, k); };
  let open = $state(new Set());
  const toggle = k => { const n = new Set(open); n.has(k) ? n.delete(k) : n.add(k); open = n; };
  let showToBuy = $state(false);
  let dismissed = $state(stored(DISMISS, {}));

  const v = $derived(store.view);
  const inv = $derived(v ? v.inventory : null);
  const counts = $derived(Object.fromEntries(FILTERS.map(([k, , t]) => [k, inv ? inv.groups.filter(t).length : 0])));
  const test = $derived((FILTERS.find(f => f[0] === only) || FILTERS[0])[2]);
  const shown = $derived(inv ? inv.groups.filter(test) : []);
  const t = $derived(inv ? (only === 'all' ? inv.total : sumOf(shown.map(g => g.total))) : null);
  const uploaded = $derived(inv ? inv.uploaded.filter(e => !dismissed[e.listing.id]) : []);
  /* "To buy", event by event */
  const toBuy = $derived.by(() => {
    if (!inv) return [];
    const by = new Map();
    for (const e of inv.toBuy) {
      if (!by.has(e.group.key)) by.set(e.group.key, { g: e.group, items: [], qty: 0 });
      const x = by.get(e.group.key);
      x.items.push(e);
      x.qty += e.qty;
    }
    return [...by.values()].sort((a, b) => (a.g.time ?? Infinity) - (b.g.time ?? Infinity));
  });
  const toBuyQty = $derived(toBuy.reduce((n, x) => n + x.qty, 0));

  const pct = (n, of) => (of ? (n / of) * 100 : 0);
  const accountOf = id => (v.accounts.find(a => a.id === id) || {}).email || 'account deleted';
  const shortDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}.${m[2]}` : '—'; };
  const timeLine = g => (g.time !== null ? fromToday(g.time) : 'no date');

  const addLot = () => router.openSheet({ kind: 'purchase' });
  const addFor = g => router.openSheet({ kind: 'purchase', eventKey: g.eventKey, vgEventId: g.eventKey ? null : g.vgEventId });
  const lotFrom = e => router.openSheet(e.kind === 'listing' ? { kind: 'purchase', listingId: e.listing.id } : { kind: 'purchase', saleId: e.sale.id });
  function dismiss(e) {
    dismissed = Object.assign({}, dismissed, { [e.listing.id]: true });
    keep(DISMISS, dismissed);
  }
  /* the seats each sale (and each sale outside viagogo) took, as noted on the lot */
  const soldSeats = lot => [...lot.sales.map(x => x.note), ...lot.other.map(x => x.seats)].map(x => String(x || '').trim()).filter(Boolean).join(', ');
  const where = x => [x.code || x.section || '?', x.row ? `row ${x.row}` : ''].filter(Boolean).join(' · ');
</script>

<Page title="Inventory" subtitle={inv ? `${plural(inv.total.inHand, 'ticket')} in hand · ${plural(inv.total.lots, 'lot')}` : ''}>
  {#if !v}
    <div class="skeleton"></div><div class="skeleton"></div>
  {:else}
    {#if uploaded.length}
      <!-- viagogo says these listings' tickets are uploaded, and no lot covers them -->
      <div class="card up">
        <h2 class="head"><Icon name="ticket" size={18} /> Uploaded on viagogo, no lot</h2>
        {#each uploaded as e (e.key)}
          <div class="uprow">
            <span class="grow"><b>{e.group.name}</b>
              <small>{where(e.listing)} · {plural(e.qty, 'ticket')}{e.group.time !== null ? ` · ${fromToday(e.group.time)}` : ''}</small></span>
            <button class="btn small primary" onclick={() => lotFrom(e)}>Add lot</button>
            <button class="x" onclick={() => dismiss(e)} aria-label="Not a lot of mine: hide"><Icon name="close" size={16} /></button>
          </div>
        {/each}
        <p class="tiny muted">Add lot opens it filled in from the listing; check the account and price, then save.</p>
      </div>
    {/if}

    {#if !inv.groups.length}
      <div class="card zero">
        <b class="num big">0 tickets</b>
        <p class="muted small">No lots. You hold nothing, so nothing is at risk. Add a lot when you buy tickets; listings and sales never add stock on their own.</p>
        <button class="btn primary block" onclick={addLot}><Icon name="plus" size={18} /> Add lot</button>
      </div>
    {:else}
      <div class="filters" role="group" aria-label="Show events">
        {#each FILTERS.filter(([k]) => k !== 'gone' || counts.gone || only === 'gone') as [k, label] (k)}
          <button class:on={only === k} onclick={() => pick(k)} aria-pressed={only === k}>{label} <span class="num">{counts[k]}</span></button>
        {/each}
      </div>

      {#if t}
        <div class="card">
          <div class="bar" role="img" aria-label="{t.sold} sold, {t.listed} listed, {t.free} not listed of {t.bought}">
            <i class="sold" style:width="{pct(t.sold, t.bought)}%"></i>
            <i class="listed" style:width="{pct(t.listed, t.bought)}%"></i>
            <i class="unlisted" style:width="{pct(t.free, t.bought)}%"></i>
            <i class="gone" style:width="{pct(t.unsold, t.bought)}%"></i>
          </div>
          <div class="legend">
            <span><i class="sold"></i>Sold <b class="num">{t.sold}</b></span>
            <span><i class="listed"></i>Listed <b class="num">{t.listed}</b></span>
            <span><i class="unlisted"></i>Not listed <b class="num">{t.free}</b></span>
            {#if t.unsold}<span><i class="gone"></i>Unsold <b class="num">{t.unsold}</b></span>{/if}
          </div>
          <div class="tiles">
            <div><span>In hand</span><b class="num">{plural(t.inHand, 'ticket')}</b><span>of {t.bought} bought{t.inHand ? ` · cost ${lek(t.leftCostL)}` : ''}</span></div>
            <div><span>Spent</span><b class="num">{lek(t.spentL)}</b><span>{t.unpriced ? `${plural(t.unpriced, 'ticket')} with no price left out` : `${plural(t.lots, 'lot')}`}</span></div>
            <div class:warn={t.unpaidL > 0}><span>From their sales</span><b class="num">{lek(t.payoutL)}</b><span>{t.unpaidL > 0 ? `${lek(t.unpaidL)} not paid yet` : t.sold ? 'all paid' : 'nothing sold yet'}</span></div>
            {#if t.netL >= 0}
              <div class="good"><span>Covered</span><b class="num ok">{lek(t.netL, true)}</b><span>{t.inHand ? 'the rest is profit' : 'final result'}{t.spentL > 0 ? ` · ${win(t.payoutL / t.spentL).replace(/[()]/g, '')}` : ''}</span></div>
            {:else}
              {#if t.riskL > 0}
                <div class="warn"><span>At risk</span><b class="num bad">{lek(t.riskL)}</b><span>{lek(t.toGoEachL)} per ticket left to break even{t.lostL ? ` · ${lek(t.lostL)} lost on events that are over` : ''}</span></div>
              {:else}
                <div class="warn"><span>Lost</span><b class="num bad">{lek(t.lostL || t.toGoL)}</b><span>{t.noPrice ? `${plural(t.noPrice, 'ticket')} sold with no price` : 'nothing left to sell'}</span></div>
              {/if}
            {/if}
          </div>
          {#if t.ifListedL !== null}
            <p class="line">If the {plural(t.listed, 'listed ticket')} sell at today's price, you end at <b class="num" class:ok={t.ifListedL >= 0} class:bad={t.ifListedL < 0}>{lek(t.ifListedL, true)}</b>{t.free ? `, with ${plural(t.free, 'ticket')} still to list` : ''}.</p>
          {/if}
        </div>
      {/if}

      <button class="btn primary block add" onclick={addLot}><Icon name="plus" size={18} /> Add lot</button>

      {#each shown as g (g.key)}
        {@const s = g.total}
        {@const isOpen = open.has(g.key)}
        <div class="ev">
          <button class="evtop" onclick={() => toggle(g.key)} aria-expanded={isOpen}>
            <DateTile time={g.time} />
            <span class="grow">
              <span class="title">{g.num ? `[${g.num}] ` : ''}{g.name}</span>
              <span class="sub">{timeLine(g)} · {plural(g.lots.length, 'lot')}{g.tracked ? '' : ' · viagogo'}{g.archived ? ' · archived' : ''}</span>
              <span class="minibar" aria-hidden="true">
                <i class="sold" style:width="{pct(s.sold, s.bought)}%"></i>
                <i class="listed" style:width="{pct(s.listed, s.bought)}%"></i>
                <i class="unlisted" style:width="{pct(s.free, s.bought)}%"></i>
                <i class="gone" style:width="{pct(s.unsold, s.bought)}%"></i>
              </span>
              <span class="counts num">
                <span>{s.inHand} in hand</span>
                {#if s.sold}<span class="c-sold">{s.sold} sold</span>{/if}
                {#if s.listed}<span class="c-listed">{s.listed} listed</span>{/if}
                {#if s.free}<span class="c-unlisted">{s.free} not listed</span>{/if}
                {#if s.unsold}<span class="c-gone">{s.unsold} unsold</span>{/if}
              </span>
            </span>
            <span class="right">
              <b class="num {s.netL >= 0 ? 'ok' : 'bad'}">{lek(s.netL, true)}</b>
              <small>{s.netL >= 0 ? 'covered' : s.inHand ? 'at risk' : s.noPrice ? 'price missing' : 'lost'}</small>
            </span>
          </button>

          {#if isOpen}
            <div class="detail">
              <p class="money num">Spent {lek(s.spentL)} · from their sales {lek(s.payoutL)}{s.unpaidL > 0 ? ` (${lek(s.unpaidL)} not paid yet)` : ''}</p>
              {#if s.ask}<p class="money">List the {plural(s.inHand, 'ticket')} left at <b class="num">{money(s.ask.amount, s.ask.currency)}</b> or more each{s.ask.payoutOnly ? ' payout' : ''} to get your money back.</p>{/if}
              {#each g.lots as lot (lot.id)}
                <button class="lot" onclick={() => router.openSheet({ kind: 'purchase', id: lot.id })}>
                  <span class="grow">
                    <b>{lot.code || 'no section'}{lot.seats ? ` · ${lot.seats}` : ''} · {plural(lot.qty, 'ticket')}</b>
                    <small>{Number(lot.p.price) > 0 ? money(lot.p.price, lot.p.currency) + ' each' : lot.each !== null ? `${lek(lot.each)} each (price list)` : 'no price'} · {shortDate(lot.p.boughtOn)} · {accountOf(lot.p.accountId)}</small>
                    <span class="minibar" aria-hidden="true">
                      <i class="sold" style:width="{pct(lot.sold, lot.qty)}%"></i>
                      <i class="listed" style:width="{pct(lot.listed, lot.qty)}%"></i>
                      <i class="unlisted" style:width="{pct(lot.free, lot.qty)}%"></i>
                      <i class="gone" style:width="{pct(lot.unsold, lot.qty)}%"></i>
                    </span>
                    <span class="counts num">
                      {#if lot.sold}<span class="c-sold">{lot.sold} sold{lot.elsewhere ? ` (${lot.elsewhere} elsewhere)` : ''}</span>{/if}
                      {#if lot.listed}<span class="c-listed">{lot.listed} listed</span>{/if}
                      {#if lot.free}<span class="c-unlisted">{lot.free} not listed</span>{/if}
                      {#if lot.unsold}<span class="c-gone">{lot.unsold} unsold · tap if you sold them</span>
                      {:else if !lot.on.length && !lot.hand.length && !lot.elsewhere}<span>on no listing yet</span>
                      {:else if lot.on.length || lot.hand.length}<span>on {plural(lot.on.length + lot.hand.length, lot.on.length ? 'listing' : 'sale')}</span>{/if}
                    </span>
                    {#if soldSeats(lot)}<small>Sold seats: {soldSeats(lot)}</small>{/if}
                  </span>
                  <Icon name="chev" size={18} />
                </button>
              {/each}
              <div class="evfoot">
                <button class="btn small" onclick={() => addFor(g)}><Icon name="plus" size={16} /> Add lot here</button>
                {#if g.tracked}<a class="go" href={href.event(g.eventKey)}>Open the event <Icon name="chev" size={16} /></a>{/if}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty"><p>No event like that right now.</p>
          <button class="btn small" onclick={() => pick('all')}>Show all lots</button>
        </div>
      {/each}
    {/if}

    {#if toBuyQty}
      <!-- listed or sold with no lot: still to buy, until the event is over -->
      <div class="tobuy">
        <button class="tbtop" onclick={() => (showToBuy = !showToBuy)} aria-expanded={showToBuy}>
          <span class="caret">›</span>
          <span class="grow">To buy · {plural(toBuyQty, 'ticket')}</span>
          <span class="muted small">listed or sold, no lot · {plural(toBuy.length, 'event')}</span>
        </button>
        {#if showToBuy}
          {#each toBuy as x (x.g.key)}
            <p class="tbev">{x.g.name}{x.g.time !== null ? ` · ${fromToday(x.g.time)}` : ''}</p>
            {#each x.items as e (e.key)}
              <div class="tbrow">
                <span class="grow">
                  {#if e.kind === 'listing'}
                    <button class="link" onclick={() => router.openSheet({ kind: 'listing', id: e.listing.id })}>{where(e.listing)}</button>
                    <small>{[e.sold ? `${e.sold} sold` : '', e.listed ? `${e.listed} listed` : ''].filter(Boolean).join(' · ')}{e.listing.uploaded ? ' · uploaded' : ''}</small>
                  {:else}
                    <span>{where(e.sale)}</span>
                    <small>{e.qty} sold {shortDate(e.sale.soldOn)} · no listing</small>
                  {/if}
                </span>
                <b class="num">{e.qty}</b>
                <button class="btn small" onclick={() => lotFrom(e)}>Add lot</button>
              </div>
            {/each}
          {/each}
          <p class="tiny muted pad">Tickets you sold or listed before buying them. Add the lot once you buy; each drops off this list after its event.</p>
        {/if}
      </div>
    {/if}
  {/if}
</Page>

<style>
  .filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 0 12px; padding-bottom: 2px; }
  .filters::-webkit-scrollbar { display: none; }
  .filters button { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border: 0; border-radius: 99px; background: var(--panel); box-shadow: 0 1px 0 var(--line); font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); cursor: pointer; }
  .filters button .num { color: var(--muted); font-weight: 500; }
  .filters button.on { background: var(--ink); color: var(--bg); }
  .filters button.on .num { color: inherit; opacity: .7; }

  .card { background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line); padding: 14px; margin-bottom: 12px; display: grid; gap: 10px; }
  .zero { text-align: center; justify-items: center; padding: 22px 16px 16px; }
  .zero .big { font-size: 30px; font-weight: 750; }
  .zero p { margin: 0; max-width: 34ch; }
  .add { margin-bottom: 14px; }
  .bar, .minibar { display: flex; border-radius: 6px; overflow: hidden; background: var(--softer); }
  .bar { height: 12px; }
  .minibar { height: 6px; margin: 6px 0 5px; border-radius: 3px; }
  .bar i, .minibar i { display: block; height: 100%; }
  .sold { background: var(--s-ok); }
  .listed { background: var(--accent); }
  .unlisted { background: var(--s-low); }
  .gone { background: var(--s-none); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
  .legend b { color: var(--ink); font-weight: 700; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tiles div { background: var(--soft); border-radius: 12px; padding: 10px 12px; display: grid; gap: 2px; min-width: 0; align-content: start; }
  .tiles div.warn { box-shadow: inset 3px 0 0 var(--s-low); }
  .tiles div.good { box-shadow: inset 3px 0 0 var(--s-ok); }
  .tiles b { font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tiles span { font-size: 12px; color: var(--muted); }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .line { margin: 0; font-size: 13.5px; }

  .up { box-shadow: inset 3px 0 0 var(--accent), 0 1px 0 var(--line); gap: 6px; }
  .up .head { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; font-size: 15px; }
  .uprow { display: flex; align-items: center; gap: 8px; min-height: 48px; border-top: 1px solid var(--line); }
  .uprow .grow, .tbrow .grow { display: grid; }
  .uprow b { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .uprow small, .tbrow small { font-size: 12.5px; color: var(--muted); }
  .x { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; background: none; color: var(--muted); cursor: pointer; }

  .ev { background: var(--panel); border-radius: var(--r-card); box-shadow: 0 1px 0 var(--line); margin-bottom: 10px; overflow: hidden; }
  .evtop { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 12px 14px; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .evtop:active, .lot:active { background: var(--soft); }
  .grow { flex: 1; min-width: 0; display: block; }
  .evtop .title { display: block; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .evtop .sub { display: block; font-size: 13px; color: var(--muted); }
  .counts { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12.5px; color: var(--muted); }
  .c-sold { color: var(--ok); } .c-listed { color: var(--accent); } .c-unlisted { color: var(--low); font-weight: 650; } .c-gone { color: var(--bad); }
  .right { flex: none; display: grid; justify-items: end; gap: 2px; }
  .right b { font-size: 15px; }
  .right small { font-size: 11.5px; color: var(--muted); }

  .detail { border-top: 1px solid var(--line); padding: 10px 14px 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .money { margin: 0; font-size: 13px; }
  .lot { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 0 8px; border: 0; border-top: 1px solid var(--line); background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .lot .grow { display: grid; }
  .lot b { font-weight: 650; }
  .lot small { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lot :global(svg) { flex: none; color: var(--muted); }
  .evfoot { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
  .go { display: inline-flex; align-items: center; gap: 4px; font-size: 13.5px; font-weight: 650; color: var(--accent); }

  .tobuy { margin: 18px 0 8px; border-top: 1px solid var(--line); padding-top: 4px; }
  .tbtop { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--muted); text-align: left; cursor: pointer; padding: 0 2px; }
  .tbtop .small { font-weight: 500; font-size: 12.5px; }
  .caret { display: inline-block; transition: transform .2s; }
  [aria-expanded='true'] .caret { transform: rotate(90deg); }
  .tbev { margin: 10px 2px 2px; font-size: 13px; font-weight: 650; }
  .tbrow { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 0 2px; border-top: 1px solid var(--line); font-size: 13.5px; }
  .tbrow b { flex: none; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-weight: 600; color: var(--ink); text-align: left; cursor: pointer; }
  .pad { margin: 10px 2px 0; }
</style>

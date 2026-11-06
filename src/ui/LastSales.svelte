<script>
  /* The team's last sales, from viagogo's "just sold" toast on its sell
   * pages: when it was first read (the closest there is to when it sold),
   * the section, tickets and the price it showed. The extension saves them;
   * the phone only reads. */
  import { href } from '../lib/router.svelte.js';
  import { ago, clock, money, plural } from '../lib/fmt.js';
  import { SK } from '../lib/sk.js';

  let { sales = [], showEvent = false, limit = 0 } = $props();
  const shown = $derived(limit ? sales.slice(0, limit) : sales);
  /* by day, newest first; a day's totals count all its sales, not only the ones shown */
  const days = $derived.by(() => {
    const all = SK.lastSales.byDay(sales);
    return SK.lastSales.byDay(shown).map(g => ({ ...g, line: SK.lastSales.dayLine(all.find(x => x.day === g.day) || g) }));
  });
  const sectionOf = s => s.section + (s.code && s.code.replace(/\W/g, '').toLowerCase() !== s.section.replace(/\W/g, '').toLowerCase() ? ` → ${s.code}` : '');
</script>

{#snippet body(s)}
  <span class="sec">{sectionOf(s)}</span>
  <span class="grow">
    {#if showEvent}<span class="ev">{s.eventNum ? `[${s.eventNum}] ${s.eventTitle}` : s.title}</span>{/if}
    <span class="sub">{plural(s.tickets, 'ticket')}{s.row ? ` · row ${s.row}` : ''} · {clock(s.firstSeen)} · {ago(s.firstSeen)}</span>
  </span>
  <span class="price num">
    <b>{money(s.price, s.currency || 'USD')}</b>
    {#if s.tickets > 1 && SK.lastSales.priceSplit(s).each !== null}<small>{money(SK.lastSales.priceSplit(s).each, s.currency || 'USD')}/pc</small>{/if}
  </span>
{/snippet}

<div class="last">
  {#each days as g (g.day)}
    <p class="day">{g.line}</p>
    <div class="group">
      {#each g.sales as s (s.id)}
        {#if showEvent && s.eventKey}
          <a class="row" href={href.event(s.eventKey)}>{@render body(s)}</a>
        {:else}
          <div class="row">{@render body(s)}</div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="group"><div class="row muted small">No sale saved yet. The extension asks viagogo for the latest sale of every event the team lists on, and saves the "just sold" toast of any sell page you open.</div></div>
  {/each}
</div>

<style>
  .last { margin-top: 10px; display: grid; gap: 6px; }
  .day { margin: 8px 4px 0; font-size: 13px; font-weight: 650; color: var(--muted); text-transform: none; }
  .day:first-child { margin-top: 0; }
  .row { color: var(--ink); }
  .sec { font-weight: 700; min-width: 64px; }
  .grow { display: grid; min-width: 0; }
  .ev { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .sub { font-size: 13px; color: var(--muted); white-space: normal; }
  .price { display: grid; justify-items: end; white-space: nowrap; }
  .price b { font-weight: 650; }
  .price small { font-size: 12.5px; color: var(--muted); }
</style>

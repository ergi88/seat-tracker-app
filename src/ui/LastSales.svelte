<script>
  /* The team's last sales, from viagogo's "just sold" toast on its sell
   * pages: when it was first read (the closest there is to when it sold),
   * the section, tickets and the price it showed. The extension saves them;
   * the phone only reads. */
  import { href } from '../lib/router.svelte.js';
  import { ago, clock, money, plural } from '../lib/fmt.js';

  let { sales = [], showEvent = false, limit = 0 } = $props();
  const shown = $derived(limit ? sales.slice(0, limit) : sales);
  const sectionOf = s => s.section + (s.code && s.code.replace(/\W/g, '').toLowerCase() !== s.section.replace(/\W/g, '').toLowerCase() ? ` → ${s.code}` : '');
</script>

<div class="group last">
  {#each shown as s (s.id)}
    {#snippet body()}
      <span class="sec">{sectionOf(s)}</span>
      <span class="grow">
        {#if showEvent}<span class="ev">{s.eventNum ? `[${s.eventNum}] ${s.eventTitle}` : s.title}</span>{/if}
        <span class="sub">{plural(s.tickets, 'ticket')}{s.row ? ` · row ${s.row}` : ''} · {clock(s.firstSeen)} · {ago(s.firstSeen)}{s.seenCount > 1 ? ` · seen ${s.seenCount}×` : ''}</span>
      </span>
      <b class="price num">{money(s.price, s.currency || 'USD')}</b>
    {/snippet}
    {#if showEvent && s.eventKey}
      <a class="row" href={href.event(s.eventKey)}>{@render body()}</a>
    {:else}
      <div class="row">{@render body()}</div>
    {/if}
  {:else}
    <div class="row muted small">No sale saved yet. Open a sell page for this event on viagogo with the extension: its "just sold" toast is saved for the team.</div>
  {/each}
</div>

<style>
  .last { margin-top: 10px; }
  .row { color: var(--ink); }
  .sec { font-weight: 700; min-width: 64px; }
  .grow { display: grid; min-width: 0; }
  .ev { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .sub { font-size: 13px; color: var(--muted); white-space: normal; }
  .price { font-weight: 650; white-space: nowrap; }
</style>

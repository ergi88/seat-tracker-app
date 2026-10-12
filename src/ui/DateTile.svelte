<script>
  /* An event's day as a small calendar leaf: NOV / 12 / Thu. Greyed once the
   * day is over, a dash when nothing says when the event is. */
  let { time = null, size = 'md' } = $props();

  const d = $derived(time === null || time === undefined ? null : new Date(time));
  const past = $derived.by(() => {
    if (!d) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  });
</script>

<span class="tile {size}" class:past class:none={!d} aria-hidden="true">
  {#if d}
    <span class="mon">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
    <span class="day">{d.getDate()}</span>
    <span class="wd">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
  {:else}
    <span class="mon">&nbsp;</span>
    <span class="day">–</span>
    <span class="wd">no date</span>
  {/if}
</span>

<style>
  .tile {
    flex: none; display: grid; width: 46px; text-align: center; line-height: 1.1;
    border-radius: 10px; background: var(--panel); overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .mon {
    font-size: 10px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase;
    padding: 3px 0 2px; background: var(--accent); color: var(--accent-ink);
  }
  .day { font-size: 19px; font-weight: 750; padding-top: 3px; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .wd { font-size: 10px; color: var(--muted); padding: 1px 0 4px; }

  .lg { width: 64px; border-radius: 14px; }
  .lg .mon { font-size: 12px; padding: 4px 0 3px; }
  .lg .day { font-size: 28px; padding-top: 4px; }
  .lg .wd { font-size: 12px; padding-bottom: 6px; }

  /* fill: as tall as whatever holds it (the Now cards), the day centred in the middle */
  .fill { width: 62px; align-self: stretch; grid-template-rows: auto 1fr auto; }
  .fill .mon { font-size: 11px; padding: 4px 0 3px; }
  .fill .day { display: grid; place-items: center; font-size: 26px; padding-top: 0; }
  .fill .wd { font-size: 11px; padding-bottom: 6px; }

  .past .mon { background: var(--none); }
  .past .day { color: var(--muted); }
  .none .mon { background: var(--softer); }
  .none .day { color: var(--muted); font-weight: 500; }
  .none .wd { font-size: 9px; }
</style>

<script>
  import Icon from './Icon.svelte';
  let { value, min = 1, max = 9999, onchange, label = 'tickets' } = $props();
  const set = n => { const v = Math.max(min, Math.min(max, n)); if (v !== value) { navigator.vibrate?.(6); onchange(v); } };
</script>

<div class="stepper" role="group" aria-label={label}>
  <button type="button" onclick={() => set(value - 1)} disabled={value <= min} aria-label="One less"><Icon name="minus" size={20} /></button>
  <span class="val num" aria-live="polite">{value}</span>
  <button type="button" onclick={() => set(value + 1)} disabled={value >= max} aria-label="One more"><Icon name="plus" size={20} /></button>
</div>

<style>
  .stepper { display: inline-flex; align-items: center; background: var(--soft); border-radius: 12px; }
  button { width: var(--tap); height: var(--tap); border: 0; background: none; color: var(--accent); display: grid; place-items: center; border-radius: 12px; cursor: pointer; }
  button:active { background: var(--softer); }
  button:disabled { color: var(--muted); opacity: .4; }
  .val { min-width: 36px; text-align: center; font-weight: 700; font-size: 18px; }
</style>

<script>
  import Sheet from '../ui/Sheet.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { setSnooze } from '../lib/actions.js';
  import { clock } from '../lib/fmt.js';

  const until = $derived(store.view ? store.view.snoozeUntil : 0);
  const muted = $derived(until > Date.now());
  const choices = [[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [480, '8 hours']];

  async function pick(min) {
    try {
      await setSnooze(min);
      router.closeSheet();
      store.toast(min ? `Muted for ${choices.find(c => c[0] === min)[1]}` : 'Alerts back on');
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
</script>

<Sheet title="Mute alerts">
  <p class="muted small">Every alert about your requests, on your phone and your PCs. Teammates' alerts are not touched.</p>
  {#if muted}<p><b>Muted until {clock(until)}</b></p>{/if}
  <div class="group">
    {#each choices as [min, label]}
      <button class="row" onclick={() => pick(min)}>{label}</button>
    {/each}
  </div>
  {#if muted}
    <button class="btn block good unmute" onclick={() => pick(0)}>Turn alerts back on</button>
  {/if}
</Sheet>

<style>
  .group { background: var(--soft); }
  .unmute { margin-top: 12px; }
</style>

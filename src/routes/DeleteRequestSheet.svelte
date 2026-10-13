<script>
  /* "Delete #12 E106?": asked before any request is deleted, from a swipe
   * or from its sheet. The number is retired for good, so this is the one
   * change in the app that asks first. Undo still follows for a few seconds. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { deleteRequestWithUndo } from '../lib/actions.js';

  let { id } = $props();
  const r = $derived(store.view ? store.view.requests.find(x => x.id === id) : null);

  function confirm() {
    const label = `#${r.num} ${r.code}`;
    router.closeSheet();
    deleteRequestWithUndo(id, label);
  }
</script>

{#if r}
  <Sheet title="Delete #{r.num} {r.code}?">
    <div class="card {r.done ? 'none' : r.tone}">
      <b>#{r.num} {r.code} · {r.qty} ticket{r.qty === 1 ? '' : 's'}</b>
      <span class="muted small">[{r.eventNum}] {r.eventTitle}</span>
      {#if r.client || r.listing}
        <span class="muted small">{[r.client ? '👤 ' + r.client : '', r.listing ? 'Listing ' + r.listing : ''].filter(Boolean).join(' · ')}</span>
      {/if}
    </div>
    <p class="muted small">The request and its history go for good, and its number is never used again. The listing on viagogo is not touched.</p>

    {#snippet footer()}
      <button class="btn block" onclick={() => router.closeSheet()}>Cancel</button>
      <button class="btn danger block" onclick={confirm}><Icon name="trash" size={18} /> Delete</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .card { display: grid; gap: 3px; padding: 12px 14px; border-radius: 12px; background: var(--soft); border-left: 5px solid var(--s-none); margin-bottom: 12px; }
  .card.ok { border-color: var(--s-ok); } .card.low { border-color: var(--s-low); } .card.bad { border-color: var(--s-bad); } .card.bought { border-color: var(--s-bought); }
</style>

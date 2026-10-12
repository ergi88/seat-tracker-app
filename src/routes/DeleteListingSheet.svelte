<script>
  /* "Delete listing E106?": asked before a saved listing goes. Only the
   * app's copy is deleted, never the listing on viagogo, and undo follows
   * for a few seconds, as with requests. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { deleteListingWithUndo } from '../lib/actions.js';
  import { money } from '../lib/fmt.js';

  let { id } = $props();
  const l = $derived(store.view ? store.view.listings.find(x => x.id === id) : null);
  /* the open or done request that carries this listing's ID */
  const r = $derived(l && l.requestId && store.view ? store.view.requests.find(x => x.id === l.requestId) || null : null);
  /* sold: viagogo's read never brings it back; anything else may return */
  const comesBack = $derived(l ? SK.viagogo.listingStatus(l.status) !== 'sold' : false);
  let unlink = $state(true);

  function confirm() {
    const label = `listing ${l.code}`;
    const opts = r && unlink ? { unlink: r.id } : {};
    router.closeSheet();
    try { deleteListingWithUndo(id, label, opts); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
</script>

{#if l}
  <Sheet title="Delete listing {l.code}?">
    <div class="card">
      <b>{l.code} · {l.tickets ?? '?'} ticket{l.tickets === 1 ? '' : 's'} · {money(l.price, l.currency)}</b>
      <span class="muted small">{l.eventNum ? `[${l.eventNum}] ${l.eventTitle}` : l.title}{l.status ? ' · ' + l.status : ''}</span>
      <span class="muted small num">Listing {l.id}</span>
    </div>

    {#if r}
      <label class="check">
        <input type="checkbox" bind:checked={unlink} />
        <span>Also take its ID off request #{r.num}<small class="muted">The request then shows as not listed.</small></span>
      </label>
    {/if}

    <p class="muted small">Only the app's saved copy goes, with its price history and buy price. The listing on viagogo is not touched.</p>
    {#if comesBack}
      <p class="small note">It is still {l.status ? l.status.toLowerCase() : 'there'} on viagogo, so the next read of your listings page on a PC saves it again. Deleting is for listings that are gone from viagogo.</p>
    {/if}

    {#snippet footer()}
      <button class="btn block" onclick={() => router.closeSheet()}>Cancel</button>
      <button class="btn danger block" onclick={confirm}><Icon name="trash" size={18} /> Delete</button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .card { display: grid; gap: 3px; padding: 12px 14px; border-radius: 12px; background: var(--soft); margin-bottom: 12px; }
  .check { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; background: var(--soft); margin-bottom: 12px; }
  .check input { width: 22px; height: 22px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
  .check span { display: grid; gap: 2px; font-size: 15px; }
  .check small { font-size: 12px; }
  .note { margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--lowbg); color: var(--low); }
</style>

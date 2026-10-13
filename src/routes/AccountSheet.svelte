<script>
  /* One buying account: the email, and what a site may ask for at checkout
   * (name, birthday), plus your own notes. A new one needs only the email. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { saveAccount, deleteAccount } from '../lib/actions.js';
  import { plural } from '../lib/fmt.js';

  let { id = null } = $props();
  const a = $derived(id && store.view ? store.view.accounts.find(x => x.id === id) || null : null);
  const bought = $derived(a && store.view ? store.view.purchases.filter(p => p.accountId === a.id) : []);
  let f = $state(null);
  $effect(() => {
    if (f) return;
    f = a ? { email: a.email, firstName: a.firstName, lastName: a.lastName, birthday: a.birthday, notes: a.notes }
      : { email: '', firstName: '', lastName: '', birthday: '', notes: '' };
  });
  let busy = $state(false);

  async function save() {
    busy = true;
    try {
      await saveAccount(Object.assign({ id }, f));
      store.toast(a ? 'Account saved' : `${f.email.trim().toLowerCase()} saved`);
      router.closeSheet();
    } catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
  async function remove() {
    const n = bought.reduce((s, p) => s + p.qty, 0);
    if (!confirm(`Delete ${a.email}?${n ? ` Its ${plural(n, 'ticket')} in ${plural(bought.length, 'purchase')} go with it.` : ''}`)) return;
    busy = true;
    try { await deleteAccount(a.id); store.toast(`${a.email} deleted`); router.closeSheet(); }
    catch (e) { store.toast(e.message, { tone: 'bad' }); } finally { busy = false; }
  }
</script>

{#if f && (!id || a)}
  <Sheet title={a ? 'Account' : 'New account'}>
    <div class="fields">
      <label class="field"><span>Email</span>
        <input class="input" type="email" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false"
          bind:value={f.email} placeholder="name@example.com" /></label>
      <div class="two">
        <label class="field"><span>Name</span><input class="input" bind:value={f.firstName} autocomplete="off" placeholder="—" /></label>
        <label class="field"><span>Surname</span><input class="input" bind:value={f.lastName} autocomplete="off" placeholder="—" /></label>
      </div>
      <label class="field"><span>Birthday</span><input class="input" type="date" bind:value={f.birthday} /></label>
      <label class="field"><span>Notes</span>
        <textarea class="input" rows="3" bind:value={f.notes} placeholder="Whose it is, the site's password hint, a blocked card…"></textarea></label>
    </div>
    {#if a}<p class="muted small">{bought.length ? `${plural(bought.reduce((s, p) => s + p.qty, 0), 'ticket')} bought in ${plural(new Set(bought.map(p => p.eventKey)).size, 'event')}.` : 'Nothing bought with it yet.'}</p>{/if}

    {#snippet footer()}
      {#if a}<button class="btn danger" onclick={remove} disabled={busy} aria-label="Delete account"><Icon name="trash" size={18} /></button>{/if}
      <button class="btn primary block" onclick={save} disabled={busy || !f.email.trim()}>{busy ? 'Saving…' : a ? 'Save' : 'Add account'}</button>
      <button class="btn close" onclick={() => router.closeSheet()} aria-label="Close"><Icon name="down" size={18} /></button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .fields { display: grid; gap: 12px; margin-bottom: 10px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  textarea { resize: none; }
  .close { flex: none; margin-left: auto; }
</style>

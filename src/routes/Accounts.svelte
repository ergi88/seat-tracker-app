<script>
  /* Your buying accounts: the ticket-site logins you buy with. One email is
   * the same account on every site. Yours alone: nobody else on the team
   * sees them. Tap one to edit it, + to save a new one. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { plural } from '../lib/fmt.js';

  const v = $derived(store.view);
  let q = $state('');
  /* tickets and events per account, over every event */
  const rows = $derived.by(() => {
    if (!v) return [];
    const needle = q.trim().toLowerCase();
    return v.accounts
      .filter(a => !needle || [a.email, a.firstName, a.lastName, a.notes].join(' ').toLowerCase().includes(needle))
      .map(a => {
        const mine = v.purchases.filter(p => p.accountId === a.id);
        return { a, tickets: mine.reduce((n, p) => n + p.qty, 0), events: new Set(mine.map(p => p.eventKey)).size };
      });
  });
  const name = a => [a.firstName, a.lastName].filter(Boolean).join(' ');
  const open = id => router.openSheet({ kind: 'account', id });
</script>

<Page title="Buying accounts" subtitle={v ? plural(v.accounts.length, 'account') : ''} back={() => router.back('#/settings')} refresh={false}>
  {#snippet actions()}
    <button class="icon-btn" onclick={() => open(null)} aria-label="Add an account"><Icon name="plus" /></button>
  {/snippet}

  {#if v}
    {#if v.accounts.length > 6}
      <input class="input search" type="search" placeholder="Find an email, name or note" bind:value={q} enterkeyhint="search" />
    {/if}
    <div class="group">
      {#each rows as { a, tickets, events } (a.id)}
        <button class="row" onclick={() => open(a.id)}>
          <span class="avatar">{(a.firstName || a.email).slice(0, 1).toUpperCase()}</span>
          <span class="grow">
            <span class="title">{a.email}</span>
            <span class="sub">{[name(a), a.birthday ? a.birthday.split('-').reverse().join('.') : '', a.notes].filter(Boolean).join(' · ') || 'no details yet'}</span>
          </span>
          <span class="count num">{tickets ? `${tickets} in ${plural(events, 'event')}` : 'unused'}</span>
        </button>
      {:else}
        <div class="empty">
          <p>{q ? 'No account matches.' : 'Save the emails you buy tickets with. Each event then shows how many every one of them bought, and which to use next.'}</p>
          {#if !q}<button class="btn primary" onclick={() => open(null)}><Icon name="plus" size={18} /> Add an email</button>{/if}
        </div>
      {/each}
    </div>
    <p class="muted small hint">Only you see these. The same email counts as one account on every site.</p>
  {/if}
</Page>

<style>
  .search { margin: 12px 0 10px; }
  .group { margin-top: 12px; }
  .row .title, .row .sub { display: block; }
  .row .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 14px; font-weight: 700; flex: none; }
  .count { font-size: 13px; color: var(--muted); white-space: nowrap; }
  .empty { display: grid; gap: 12px; justify-items: center; padding: 22px 16px; text-align: center; }
  .empty p { margin: 0; color: var(--muted); }
  .hint { margin: 8px 4px 0; }
</style>

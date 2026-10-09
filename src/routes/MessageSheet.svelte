<script>
  /* "Tell the team": a push to the teammates you pick, and a line in
   * their inbox, following their own switches, mute and quiet hours. */
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';
  import { router } from '../lib/router.svelte.js';
  import { messageTeam } from '../lib/actions.js';

  let { eventKey = null, section = '' } = $props();
  const others = $derived(store.view ? store.view.team.filter(t => !t.me) : []);
  const ev = $derived(eventKey && store.view ? store.view.events.find(e => e.key === eventKey) : null);
  let to = $state([]);
  let text = $state('');
  let busy = $state(false);

  $effect(() => { if (!to.length && others.length) to = others.map(t => t.userId); });

  async function send() {
    busy = true;
    try {
      const sent = await messageTeam({ text, to, eventKey, section });
      const ok = sent.filter(s => s.ok).map(s => s.name);
      const not = sent.filter(s => !s.ok).map(s => `${s.name} (${s.skipped})`);
      router.closeSheet();
      store.toast([ok.length ? `Sent to ${ok.join(', ')}` : '', not.length ? `Not pushed: ${not.join(', ')}` : ''].filter(Boolean).join(' · '));
    } catch (e) {
      store.toast(e.message, { tone: 'bad' });
    } finally { busy = false; }
  }
</script>

<Sheet title="Tell the team">
  {#if ev || section}<p class="muted small">{ev ? `[${ev.num}] ${ev.title}` : ''}{section ? ` · Section ${section}` : ''}</p>{/if}
  <div class="to">
    {#each others as t (t.userId)}
      <label class="chip" class:on={to.includes(t.userId)}>
        <input type="checkbox" value={t.userId} bind:group={to} /> {t.name}
      </label>
    {:else}
      <p class="muted small">Nobody else is on the team yet.</p>
    {/each}
  </div>
  <textarea class="input" rows="4" maxlength="500" placeholder="I raised E106 to $90…" bind:value={text}></textarea>

  {#snippet footer()}
    <button class="btn primary block" onclick={send} disabled={busy || !text.trim() || !to.length || !store.online}>
      <Icon name="send" size={18} /> {busy ? 'Sending…' : 'Send'}
    </button>
  {/snippet}
</Sheet>

<style>
  .to { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; }
  .chip { display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px; border-radius: 99px; border: 1.5px solid var(--line); font-weight: 600; cursor: pointer; }
  .chip input { position: absolute; opacity: 0; pointer-events: none; }
  .chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  textarea { resize: none; }
</style>

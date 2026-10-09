<script>
  import { store } from '../lib/store.svelte.js';
  import { fly } from 'svelte/transition';
</script>

<div class="toasts" aria-live="polite">
  {#each store.toasts as t (t.id)}
    <div class="toast {t.tone}" transition:fly={{ y: 24, duration: 220 }}>
      <span class="txt">{t.text}</span>
      {#if t.action}
        <button onclick={() => { t.action.run(); store.dismiss(t.id); }}>{t.action.label}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed; left: 0; right: 0; z-index: 60; pointer-events: none;
    bottom: calc(var(--tabbar-h) + var(--safe-b) + 10px);
    display: grid; justify-items: center; gap: 8px; padding: 0 12px;
  }
  .toast {
    pointer-events: auto; display: flex; align-items: center; gap: 12px; max-width: 560px; width: 100%;
    padding: 12px 14px; border-radius: 14px; background: #1f232b; color: #f2f4f8;
    box-shadow: 0 10px 30px rgba(0, 0, 0, .25); font-size: 15px;
  }
  .toast.bad { background: #5a1d19; }
  .toast.alert { background: #1d2b4a; }
  .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  button { border: 0; background: none; color: #8fb4ff; font-weight: 700; font-size: 15px; padding: 6px 4px; cursor: pointer; }
</style>

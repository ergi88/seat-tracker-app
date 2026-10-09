<script>
  /* A bottom sheet: slides up, drag the handle (or the header) down to
   * close, tap the dimmed page to close, Esc closes, the phone's back
   * gesture closes (the router put a history entry under it). */
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte.js';

  /* head: a strip under the title that never scrolls away (links, quick actions) */
  let { title = '', head, children, footer } = $props();

  let panel = $state();
  let dy = $state(0);
  let dragging = $state(false);
  let shown = $state(false);
  let start = null, lastY = 0, lastT = 0, speed = 0;

  onMount(() => {
    requestAnimationFrame(() => { shown = true; });
    const onKey = e => { if (e.key === 'Escape') router.closeSheet(); };
    addEventListener('keydown', onKey);
    const prev = document.activeElement;
    panel?.focus({ preventScroll: true });
    return () => { removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }); };
  });

  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    start = e.clientY; lastY = e.clientY; lastT = performance.now(); speed = 0;
    dragging = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (start === null) return;
    const now = performance.now();
    speed = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY; lastT = now;
    dy = Math.max(0, e.clientY - start);
  }
  function up() {
    if (start === null) return;
    start = null; dragging = false;
    const h = panel ? panel.offsetHeight : 600;
    if (dy > h * 0.3 || speed > 0.7) router.closeSheet();
    else dy = 0;
  }
</script>

<div class="scrim" class:shown onclick={() => router.closeSheet()} role="presentation"></div>
<div class="sheet" class:shown class:dragging bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-label={title}
  style:transform={shown ? `translateY(${dy}px)` : 'translateY(100%)'}>
  <!-- dragging is a shortcut; Esc, the scrim and Back close the sheet too -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="grab" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    <span class="handle"></span>
    {#if title}<div class="head">{title}</div>{/if}
  </div>
  {#if head}<div class="strip">{@render head()}</div>{/if}
  <div class="body">{@render children?.()}</div>
  {#if footer}<div class="foot">{@render footer()}</div>{/if}
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 40; background: var(--scrim);
    opacity: 0; transition: opacity .28s var(--ease);
  }
  .scrim.shown { opacity: 1; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 41;
    max-width: 680px; margin: 0 auto; max-height: calc(100dvh - var(--safe-t) - 24px);
    display: flex; flex-direction: column;
    background: var(--panel); border-radius: var(--r-sheet) var(--r-sheet) 0 0;
    box-shadow: 0 -8px 40px var(--shadow); outline: none;
    transition: transform .34s var(--ease);
    padding-bottom: var(--safe-b);
  }
  .sheet.dragging { transition: none; }
  .grab { touch-action: none; cursor: grab; padding: 8px 16px 4px; flex: none; }
  .handle { display: block; width: 38px; height: 5px; border-radius: 3px; background: var(--softer); margin: 0 auto 8px; }
  .head { font-size: 17px; font-weight: 700; text-align: center; padding-bottom: 6px; }
  .strip { flex: none; padding: 2px 16px 10px; border-bottom: 1px solid var(--line); }
  .body { overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px 16px; }
  .foot { flex: none; padding: 10px 16px 12px; border-top: 1px solid var(--line); display: flex; gap: 10px; }
</style>

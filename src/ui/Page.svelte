<script>
  /* One screen: a large title that folds into the bar as you scroll (iOS
   * style), optional back button and actions, and pull-to-refresh. */
  import Icon from './Icon.svelte';
  import PcStatus from './PcStatus.svelte';
  import { store } from '../lib/store.svelte.js';

  let { title, subtitle = '', back = null, actions, children, refresh = true } = $props();

  let scroller = $state();
  let folded = $state(false);
  let pull = $state(0);
  let spinning = $state(false);
  let startY = null;
  let buzzed = false;
  const THRESHOLD = 70;

  function onScroll() { folded = scroller.scrollTop > 34; }

  function onTouchStart(e) {
    if (!refresh || scroller.scrollTop > 0 || spinning) return;
    startY = e.touches[0].clientY;
  }
  function onTouchMove(e) {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pull = 0; return; }
    pull = Math.min(110, dy * 0.5);
    if (pull >= THRESHOLD && !buzzed) { buzzed = true; navigator.vibrate?.(8); }
  }
  async function onTouchEnd() {
    if (startY === null) return;
    startY = null;
    buzzed = false;
    if (pull >= THRESHOLD) {
      spinning = true;
      pull = THRESHOLD * 0.7;
      try {
        const ok = await store.syncFull();
        store.toast(ok ? 'Up to date' : `Not synced: ${store.sync.error}`, { tone: ok ? '' : 'bad', ms: 1600 });
      } finally { spinning = false; pull = 0; }
    } else pull = 0;
  }
</script>

<div class="page">
  <header class="bar" class:folded>
    <div class="bar-side">
      {#if back}
        <button class="icon-btn" onclick={back} aria-label="Back"><Icon name="back" /></button>
      {/if}
      <PcStatus compact={!!back} />
    </div>
    <div class="bar-title" aria-hidden={!folded}>{title}</div>
    <div class="bar-side right">{@render actions?.()}</div>
  </header>

  <!-- the touch handlers are pull-to-refresh, a gesture on top of normal scrolling -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scroll" bind:this={scroller} onscroll={onScroll}
    ontouchstart={onTouchStart} ontouchmove={onTouchMove} ontouchend={onTouchEnd} ontouchcancel={onTouchEnd}>
    {#if refresh}
      <div class="ptr" style:height="{pull}px" class:spinning>
        <span style:transform="rotate({pull * 4}deg)" style:opacity={Math.min(1, pull / THRESHOLD)}><Icon name="refresh" size={20} /></span>
      </div>
    {/if}
    <div class="large">
      <h1>{title}</h1>
      {#if subtitle}<p class="muted small">{subtitle}</p>{/if}
    </div>
    <div class="content">{@render children?.()}</div>
  </div>
</div>

<style>
  .page { position: absolute; inset: 0; display: flex; flex-direction: column; }
  .bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 5;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    padding: var(--safe-t) calc(4px + var(--safe-r)) 0 calc(4px + var(--safe-l));
    height: calc(48px + var(--safe-t));
    background: transparent; border-bottom: 1px solid transparent;
    transition: background .2s, border-color .2s;
  }
  .bar.folded {
    background: var(--bar); border-color: var(--line);
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
  }
  .bar-side { display: flex; align-items: center; }
  .bar-side.right { justify-content: flex-end; }
  .bar-title {
    font-weight: 600; font-size: 17px; opacity: 0; transform: translateY(6px);
    transition: opacity .2s, transform .2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 56vw;
  }
  .folded .bar-title { opacity: 1; transform: none; }

  .scroll {
    flex: 1; overflow-y: auto; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch;
    padding-top: calc(48px + var(--safe-t));
    padding-bottom: calc(var(--tabbar-h) + var(--safe-b) + 24px);
  }
  .large, .content {
    max-width: 680px; margin: 0 auto;
    padding-left: calc(16px + var(--safe-l)); padding-right: calc(16px + var(--safe-r));
  }
  .large h1 { margin: 2px 0 0; font-size: 32px; line-height: 1.15; font-weight: 750; letter-spacing: -.02em; }
  .large p { margin: 4px 0 0; }

  .ptr { display: grid; place-items: center; overflow: hidden; color: var(--muted); transition: height .2s var(--ease); }
  .ptr.spinning span { animation: spin .8s linear infinite; opacity: 1 !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

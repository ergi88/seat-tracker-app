<script>
  /* One inbox alert. Swipe left: delete (with Undo). Tap: its link, when
   * it has one. */
  import { when } from '../lib/fmt.js';
  import { deleteAlertsWithUndo } from '../lib/actions.js';

  let { a, emoji = '🔔', fresh = false } = $props();

  let dx = $state(0);
  let dragging = $state(false);
  let x0 = null, y0 = null, axis = null, moved = false;
  const TRIGGER = 88;

  function down(e) {
    x0 = e.clientX; y0 = e.clientY; axis = null; moved = false;
  }
  function move(e) {
    if (x0 === null) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (!axis && Math.hypot(ddx, ddy) > 8) axis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
    if (axis !== 'x') return;
    dragging = true; moved = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const before = dx <= -TRIGGER;
    dx = Math.max(-140, Math.min(0, ddx));
    if (!before && dx <= -TRIGGER) navigator.vibrate?.(10);
  }
  function up() {
    if (x0 === null) return;
    x0 = null; dragging = false;
    const d = dx;
    dx = 0;
    if (d <= -TRIGGER) deleteAlertsWithUndo([a.id], 'Alert deleted');
  }
  /* a swipe is not a tap: keep the link from opening */
  function click(e) {
    if (moved) { e.preventDefault(); moved = false; }
  }
</script>

<div class="wrap">
  <div class="under" class:hot={dx <= -TRIGGER} style:opacity={dx < 0 ? 1 : 0}>Delete</div>
  <svelte:element this={a.click ? 'a' : 'div'} class="item" class:new={fresh} class:dragging
    href={a.click || undefined} target={a.click ? '_blank' : undefined} rel={a.click ? 'noopener' : undefined}
    style:transform="translateX({dx}px)" role={a.click ? undefined : 'listitem'}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={click}>
    <span class="em" aria-hidden="true">{emoji}</span>
    <span class="grow">
      <span class="top"><b>{a.title}</b><span class="tiny muted">{when(a.createdAt)}</span></span>
      <span class="msg">{a.message}</span>
    </span>
  </svelte:element>
</div>

<style>
  .wrap { position: relative; border-radius: var(--r-card); overflow: hidden; }
  .under {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 22px;
    font-weight: 700; color: #fff; background: var(--s-none); transition: background .15s;
  }
  .under.hot { background: var(--s-bad); }
  .item {
    position: relative; display: flex; gap: 12px; padding: 12px 14px; border-radius: var(--r-card);
    background: var(--panel); color: var(--ink); box-shadow: 0 1px 0 var(--line);
    transition: transform .3s var(--ease); touch-action: pan-y; user-select: none; -webkit-user-select: none;
  }
  .item.dragging { transition: none; }
  .item.new { box-shadow: inset 3px 0 0 var(--accent), 0 1px 0 var(--line); }
  .em { font-size: 22px; line-height: 1.2; }
  .grow { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .top { display: flex; justify-content: space-between; gap: 8px; }
  .msg { white-space: pre-line; font-size: 14px; }
</style>

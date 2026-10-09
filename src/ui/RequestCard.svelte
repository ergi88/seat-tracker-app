<script>
  /* One request, its status as the stripe on the left (as in the
   * extension). Swipe right: done. Swipe left: delete (with Undo). Tap:
   * the request's sheet. */
  import { SK } from '../lib/sk.js';
  import { router } from '../lib/router.svelte.js';
  import { store } from '../lib/store.svelte.js';
  import { setDone, deleteRequestWithUndo } from '../lib/actions.js';

  let { r, showEvent = false } = $props();

  let dx = $state(0);
  let dragging = $state(false);
  let x0 = null, y0 = null, axis = null, moved = false;
  const TRIGGER = 88;

  const statusText = $derived(r.done ? 'DONE' : r.status === 'NOT SCANNED' ? 'NOT SCANNED' : r.status);
  const freeText = $derived(r.free === null || r.free === undefined ? (r.scanNote || 'no scan yet') : `${r.free} free · ${SK.util.plural(r.options, 'option')}`);
  const profit = $derived(r.profit && r.profit.total !== undefined && r.profit.total !== null ? r.profit : null);

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
    const before = Math.abs(dx) >= TRIGGER;
    dx = Math.max(-140, Math.min(140, ddx));
    if (!before && Math.abs(dx) >= TRIGGER) navigator.vibrate?.(10);
  }
  async function up() {
    if (x0 === null) return;
    x0 = null; dragging = false;
    const d = dx;
    dx = 0;
    if (d >= TRIGGER) {
      const { id, num, done: was } = r;
      try {
        await setDone(id, !was);
        store.toast(was ? `#${num} reopened` : `#${num} done`, {
          action: { label: 'Undo', run: () => setDone(id, was).catch(e => store.toast(e.message, { tone: 'bad' })) }
        });
      } catch (e) { store.toast(e.message, { tone: 'bad' }); }
    } else if (d <= -TRIGGER) {
      deleteRequestWithUndo(r.id, `#${r.num} ${r.code}`);
    }
  }
  function open() {
    if (moved) { moved = false; return; }
    router.openSheet({ kind: 'request', id: r.id });
  }
</script>

<div class="wrap">
  <div class="under left" class:hot={dx >= TRIGGER} style:opacity={dx > 0 ? 1 : 0}>{r.done ? 'Reopen' : 'Done'}</div>
  <div class="under right" class:hot={dx <= -TRIGGER} style:opacity={dx < 0 ? 1 : 0}>Delete</div>
  <button class="card {r.done ? 'none' : r.tone}" class:dragging class:faded={r.done || r.muffled}
    style:transform="translateX({dx}px)"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onclick={open}>
    <div class="line1">
      <span class="no">#{r.num}</span>
      <span class="code">{r.code}</span>
      {#if r.priceTag}<span class="muted small">{r.priceTag}</span>{/if}
      <span class="qty num">×{r.qty}</span>
      <span class="spacer"></span>
      <span class="pill {r.done ? 'none' : r.tone}">{statusText}</span>
    </div>
    <div class="line2">
      <span class="muted small num">{freeText}{r.preview ? ' · preview' : ''}{r.pendingGone ? ' · checking' : ''}</span>
      <span class="spacer"></span>
      {#if profit}
        <span class="small num profit {profit.total >= 0 ? 'ok' : 'bad'}">{SK.profit.formatLek(profit.total, true)} {SK.profit.winRateText(profit.winRate)}</span>
      {/if}
    </div>
    {#if showEvent || r.client}
      <div class="line3 tiny muted">
        {#if showEvent}<span>[{r.eventNum}] {r.eventTitle}</span>{/if}
        {#if r.client}<span>👤 {r.client}</span>{/if}
      </div>
    {/if}
  </button>
</div>

<style>
  .wrap { position: relative; margin-bottom: 8px; border-radius: var(--r-card); overflow: hidden; }
  .under {
    position: absolute; inset: 0; display: flex; align-items: center; padding: 0 22px;
    font-weight: 700; color: #fff; transition: background .15s;
  }
  .under.left { background: var(--s-none); justify-content: flex-start; }
  .under.right { background: var(--s-none); justify-content: flex-end; }
  .under.left.hot { background: var(--s-ok); }
  .under.right.hot { background: var(--s-bad); }

  .card {
    position: relative; display: block; width: 100%; text-align: left; cursor: pointer;
    border: 0; border-radius: var(--r-card); background: var(--panel);
    padding: 12px 14px 12px 18px; box-shadow: 0 1px 0 var(--line);
    transition: transform .3s var(--ease), background .15s;
    touch-action: pan-y;
  }
  .card.dragging { transition: none; }
  .card:active { background: var(--soft); }
  .card::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--s-none);
  }
  .card.ok::before { background: var(--s-ok); }
  .card.low::before { background: var(--s-low); }
  .card.bad::before { background: var(--s-bad); }
  .card.faded { opacity: .6; }

  .line1, .line2, .line3 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .line2 { margin-top: 3px; }
  .line3 { margin-top: 4px; gap: 12px; }
  .line3 span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .no { color: var(--muted); font-weight: 600; }
  .code { font-weight: 700; font-size: 17px; }
  .qty { color: var(--ink); }
  .profit { font-weight: 700; }
  .spacer { flex: 1; }
</style>

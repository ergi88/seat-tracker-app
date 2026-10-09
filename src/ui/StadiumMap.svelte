<script>
  /* A stadium, every section coloured by what the team's last scans found:
   * blue by how many seats are free, grey with none, hatched when the site
   * says sold out, pale when nobody has read it. Your requests outline their
   * section in their status colour; your listings put a pink count on it.
   *
   * Interactive: drag to pan, pinch / wheel / double-tap / + − to zoom, tap
   * a section to open it. As a preview (interactive=false) it is a picture
   * that does nothing.
   *
   * Where one block sells several prices (Posttick), `cats` picks some: each
   * section then counts only the seats at those prices, from its full scan,
   * and a block is "together" only within them, as the extension judges a
   * request with picked prices. Coloured dots show which prices a block
   * still has free. */
  import { untrack } from 'svelte';
  import { SK } from '../lib/sk.js';

  let { venue, event, requests = [], listings = [], minBlock = 0, cats = [], scans = {}, interactive = true, onpick = () => {} } = $props();

  // svelte-ignore state_referenced_locally
  const [VX, VY, VW, VH] = venue.viewBox;            // a venue never changes under a mounted map
  let vb = $state({ x: VX, y: VY, w: VW, h: VH });
  let svg = $state();
  const MAX_ZOOM = 6;

  /* ---------------- what each section shows -------------------------- */

  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sectorByCode = $derived(new Map((event ? event.sectors : []).map(s => [norm(s.code), s])));
  const TONE_RANK = { bad: 3, low: 2, ok: 1, none: 0 };

  /* the event's prices, dearest first: { key, color, price } */
  const priceOf = $derived(event && event.cats ? event.cats : {});
  const byPrice = (a, b) => ((priceOf[b] || {}).price || 0) - ((priceOf[a] || {}).price || 0);

  const info = $derived.by(() => {
    const out = {};
    const picked = cats && cats.length ? cats.map(String) : null;
    for (const sec of venue.sections) {
      const s = sectorByCode.get(norm(sec.code)) || null;
      const sum = s && s.summary;
      const sold = !!(s && s.meta && s.meta.status === 'soldout');
      const scan = s ? (scans || {})[s.id] : null;
      /* at the picked prices: from the full scan, or unknown until it arrives */
      const view = picked ? (scan ? SK.rules.blocksFor(scan, picked) : null) : null;
      const free = picked ? (view ? view.available : null) : (sum && !sum.unmapped ? Number(sum.available) || 0 : null);
      const longest = picked ? (view ? view.longest : 0) : (sum ? Number(sum.longest) || 0 : 0);
      const dots = (sum && Array.isArray(sum.cats) ? sum.cats.map(String) : [])
        .filter(k => priceOf[k] && (!picked || picked.includes(k))).sort(byPrice).slice(0, 6)
        .map(k => priceOf[k].color || 'var(--muted)');
      const mine = s ? requests.filter(r => !r.done && String(r.sec) === String(s.id)) : [];
      const tone = mine.reduce((t, r) => (TONE_RANK[r.tone] > TONE_RANK[t] ? r.tone : t), 'none');
      const lst = s ? listings.filter(l => String(l.sectorId) === String(s.id)) : [];
      let fill = 'unread';
      if (!s) fill = 'off';                                          // drawn, but not sold for this event
      else if (sum && sum.unmapped) fill = 'standing';               // the site publishes no seats for it
      else if (free === null) fill = sold ? 'sold' : 'unread';
      else if (free === 0) fill = sold ? 'sold' : 'zero';
      else fill = free < 10 ? 'l1' : free < 50 ? 'l2' : free < 200 ? 'l3' : 'l4';
      const fits = !minBlock || longest >= minBlock;
      /* a grid of tables: each table free (every seat) or not, from the full scan */
      let tables = null, perTable = 0;
      if (sec.shape === 'grid' && s) {
        perTable = Number(s.meta && s.meta.perTable) || 6;
        if (scan && scan.rows) {
          tables = {};
          for (const row of scan.rows) tables[String(row.r)] = row.s.length > 0 && row.s.every(p => p[2]);
        }
      }
      out[sec.code] = {
        sector: s, free, fill, sold, dots, tables, perTable, wanted: s ? s.wanted : 0,
        reqTone: mine.length ? tone : null, reqCount: mine.length,
        listings: lst.length, dim: !fits
      };
    }
    return out;
  });

  /* ---------------- pan and zoom ------------------------------------- */

  const clampVb = v => {
    const w = Math.min(VW, Math.max(VW / MAX_ZOOM, v.w));
    const h = w * VH / VW;
    const pad = w * 0.25;
    return {
      x: Math.min(VX + VW - w + pad, Math.max(VX - pad, v.x)),
      y: Math.min(VY + VH - h + pad, Math.max(VY - pad, v.y)),
      w, h
    };
  };

  /* client px -> drawing units, for a given viewBox (the svg letterboxes it) */
  function geometry(v) {
    const r = svg.getBoundingClientRect();
    const s = Math.min(r.width / v.w, r.height / v.h);
    return { r, s, ox: (r.width - v.w * s) / 2, oy: (r.height - v.h * s) / 2 };
  }
  function toSvg(cx, cy, v) {
    const g = geometry(v);
    return { x: v.x + (cx - g.r.left - g.ox) / g.s, y: v.y + (cy - g.r.top - g.oy) / g.s };
  }
  /* the viewBox of width w that puts drawing point p under client point (cx, cy) */
  function placing(p, cx, cy, w) {
    const h = w * VH / VW;
    const g = geometry({ x: 0, y: 0, w, h });
    return { x: p.x - (cx - g.r.left - g.ox) / g.s, y: p.y - (cy - g.r.top - g.oy) / g.s, w, h };
  }

  let anim = 0;
  function animateTo(target) {
    cancelAnimationFrame(anim);
    const from = { ...vb }, to = clampVb(target), t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3);
      vb = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  export function zoomBy(factor, cx, cy) {
    const r = svg.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2, py = cy ?? r.top + r.height / 2;
    animateTo(placing(toSvg(px, py, vb), px, py, vb.w / factor));
  }
  export function reset() { animateTo({ x: VX, y: VY, w: VW, h: VH }); }
  export const zoomed = () => vb.w < VW * 0.98;

  const pointers = new Map();
  let gesture = null;              // { kind: 'pan' | 'pinch', ... }
  let moved = 0;
  let lastTap = { t: 0, x: 0, y: 0 };

  function down(e) {
    if (!interactive) return;
    cancelAnimationFrame(anim);
    svg.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { moved = 0; gesture = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, vb0: { ...vb } }; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), p: toSvg(mid.x, mid.y, vb), w0: vb.w };
      moved = 99;
    }
  }
  function move(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.kind === 'pan' && pointers.size === 1) {
      const dx = e.clientX - gesture.start.x, dy = e.clientY - gesture.start.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      const s = geometry(gesture.vb0).s;
      vb = clampVb({ ...gesture.vb0, x: gesture.vb0.x - dx / s, y: gesture.vb0.y - dy / s });
    } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const w = Math.min(VW, Math.max(VW / MAX_ZOOM, gesture.w0 * gesture.d0 / Math.max(1, d)));
      vb = clampVb(placing(gesture.p, mid.x, mid.y, w));
    }
  }
  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {               // a pinch became a pan: start it from here
      const [p] = [...pointers.values()];
      gesture = { kind: 'pan', start: { ...p }, vb0: { ...vb } };
      return;
    }
    if (pointers.size) return;
    gesture = null;
    if (moved > 8) return;
    /* a tap: a section opens; a double tap elsewhere zooms in (or back out) */
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const code = hit && hit.closest && hit.closest('[data-code]') && hit.closest('[data-code]').dataset.code;
    /* a table is named only when it was big enough on screen to be tapped
     * on purpose; at full view a cell is a few pixels, and a finger covers
     * its neighbours too (the grid still opens) */
    const cell = hit && hit.closest ? hit.closest('[data-table]') : null;
    const table = cell && cell.getBoundingClientRect().width >= 16 ? cell.dataset.table : null;
    const now = performance.now();
    if (code) { onpick(code, info[code] && info[code].sector, table ? { table } : null); lastTap = { t: 0 }; return; }
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      if (vb.w <= VW / MAX_ZOOM * 1.05) reset(); else zoomBy(2.2, e.clientX, e.clientY);
      lastTap = { t: 0 };
    } else lastTap = { t: now, x: e.clientX, y: e.clientY };
  }
  function wheel(e) {
    if (!interactive) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
    cancelAnimationFrame(anim);
    vb = clampVb(placing(toSvg(e.clientX, e.clientY, vb), e.clientX, e.clientY, vb.w / factor));
  }

  /* a section opened from outside (the list below the map): bring it into view */
  export function focus(code) {
    const s = venue.sections.find(x => x.code === code);
    if (!s) return;
    const box = s.shape === 'rect' ? s : (() => {
      const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    })();
    const w = Math.max(VW / 3.5, box.w * 4);
    untrack(() => animateTo({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - (w * VH / VW) / 2, w }));
  }

  const p = $derived(venue.pitch || { x: 0, y: 0, w: 0, h: 0 });
</script>

<svg bind:this={svg} class="map" class:interactive viewBox="{vb.x} {vb.y} {vb.w} {vb.h}" preserveAspectRatio="xMidYMid meet"
  role={interactive ? 'application' : 'img'} aria-label="{venue.name} map"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}>
  <defs>
    <pattern id="hatch-{venue.id}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" class="sold-bg" />
      <line x1="0" y1="0" x2="0" y2="10" class="sold-line" />
    </pattern>
  </defs>

  <path d={venue.outline} class="outline" />

  {#if venue.stage}
    {@const st = venue.stage}
    <g class="stage">
      {#if st.points}
        <polygon points={st.points.map(q => q.join(',')).join(' ')} />
        <text x={st.lx} y={st.ly} font-size="34">{st.label}</text>
      {:else}
        <rect x={st.x} y={st.y} width={st.w} height={st.h} />
        <text x={st.x + st.w / 2} y={st.y + st.h / 2} font-size="34">{st.label}</text>
      {/if}
    </g>
  {/if}

  {#if venue.pitch}
  <!-- the pitch -->
  <g class="pitch">
    <rect x={p.x} y={p.y} width={p.w} height={p.h} class="grass" />
    <g class="lines">
      <rect x={p.x + 55} y={p.y + 40} width={p.w - 110} height={p.h - 80} />
      <line x1={p.x + p.w / 2} y1={p.y + 40} x2={p.x + p.w / 2} y2={p.y + p.h - 40} />
      <circle cx={p.x + p.w / 2} cy={p.y + p.h / 2} r="82" />
      <rect x={p.x + 55} y={p.y + 108} width="140" height="348" />
      <rect x={p.x + p.w - 195} y={p.y + 108} width="140" height="348" />
      <rect x={p.x + 55} y={p.y + 203} width="55" height="158" />
      <rect x={p.x + p.w - 110} y={p.y + 203} width="55" height="158" />
    </g>
  </g>
  {/if}

  {#each venue.sections as s (s.code)}
    {@const i = info[s.code]}
    <g class="sec {i.fill}" class:dim={i.dim} class:pick={!!i.sector} data-code={s.code}>
      {#if s.shape === 'grid'}
        {@const cw = s.w / s.cols}
        {@const ch = s.h / s.rows}
        <rect x={s.x - 6} y={s.y - 6} width={s.w + 12} height={s.h + 12} rx="6" class="shape grid-bg" />
        {#each Array(s.rows) as _, row}
          {#each Array(s.cols) as _, col}
            {@const n = s.table(row, col)}
            {@const st = i.tables ? (i.tables[String(n)] === true ? 'tfree' : i.tables[String(n)] === false ? 'ttaken' : 'tnone') : 'tunknown'}
            <g class="table {st}" data-table={n}>
              <rect x={s.x + col * cw + 1.5} y={s.y + row * ch + 1.5} width={cw - 3} height={ch - 3} rx="3" />
              <text x={s.x + col * cw + cw / 2} y={s.y + row * ch + ch / 2} font-size="11">{n}</text>
            </g>
          {/each}
        {/each}
        {#if i.reqTone}<rect x={s.x - 6} y={s.y - 6} width={s.w + 12} height={s.h + 12} rx="6" class="req {i.reqTone}" />{/if}
        <text x={s.label.x} y={s.label.y} font-size={s.label.size} class="code grid-title">
          Bar tables{i.free !== null ? ` · ${Math.round(i.free / (i.perTable || 6))} free` : ''}
        </text>
      {:else if s.shape === 'rect'}
        <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" class="shape" fill={i.fill === 'sold' ? `url(#hatch-${venue.id})` : null} />
        {#if i.reqTone}<rect x={s.x + 3} y={s.y + 3} width={s.w - 6} height={s.h - 6} rx="3" class="req {i.reqTone}" />{/if}
      {:else}
        <polygon points={s.points.map(q => q.join(',')).join(' ')} class="shape" fill={i.fill === 'sold' ? `url(#hatch-${venue.id})` : null} />
        {#if i.reqTone}<polygon points={s.points.map(q => q.join(',')).join(' ')} class="req {i.reqTone}" />{/if}
      {/if}
      {#if s.shape !== 'grid'}
      <text x={s.label.x} y={s.label.y} font-size={s.label.size} transform={s.label.rotate ? `rotate(${s.label.rotate} ${s.label.x} ${s.label.y})` : null}
        class="code" dy={(i.free !== null || i.fill === 'standing') && s.label.size >= 16 ? -6 : 0}>{s.code}</text>
      {/if}
      {#if i.fill === 'standing' && s.label.size >= 16}
        <text x={s.label.x} y={s.label.y} dy={s.label.size * 0.85} font-size={s.label.size * 0.6} class="note"
          transform={s.label.rotate ? `rotate(${s.label.rotate} ${s.label.x} ${s.label.y})` : null}>standing</text>
      {/if}
      {#if i.free !== null && s.label.size >= 16 && s.shape !== 'grid'}
        <text x={s.label.x} y={s.label.y} dy={s.label.size * 0.85} font-size={s.label.size * 0.72} class="free"
          transform={s.label.rotate ? `rotate(${s.label.rotate} ${s.label.x} ${s.label.y})` : null}>{i.free}</text>
      {/if}
      {#if i.dots.length && s.label.size >= 20}
        {#each i.dots as color, k}
          <circle cx={s.label.x + (k - (i.dots.length - 1) / 2) * s.label.size * 0.6} cy={s.label.y + s.label.size * 1.75}
            r={s.label.size * 0.22} fill={color} class="pdot" />
        {/each}
      {/if}
      {#if i.listings}
        {@const big = s.shape === 'poly' && s.label.size >= 20}
        {@const bx = s.shape === 'rect' || s.shape === 'grid' ? s.x + s.w - 10 : s.label.x + (big ? s.label.size * 1.4 : 14)}
        {@const by = s.shape === 'rect' ? s.y + 10 : s.shape === 'grid' ? s.y - 10 : s.label.y - (big ? s.label.size : 14)}
        {@const bny = by - 3}
        <circle cx={bx} cy={by} r="12" class="badge" />
        <text x={bx} y={bny} dy="5" font-size="14" class="badge-n">{i.listings}</text>
      {/if}
    </g>
  {/each}
</svg>

<style>
  .map { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-select: none; }
  .map.interactive { touch-action: none; cursor: grab; }
  .map.interactive:active { cursor: grabbing; }
  .outline { fill: var(--map-bg); stroke: var(--map-edge); stroke-width: 6; }
  .grass { fill: var(--map-grass); }
  .lines * { fill: none; stroke: rgba(255, 255, 255, .8); stroke-width: 2; }

  .sec .shape { stroke: var(--map-bg); stroke-width: 2; transition: opacity .2s; }
  .sec.unread .shape { fill: var(--sec-unread); }
  .sec.zero .shape { fill: var(--sec-zero); }
  .sec.l1 .shape { fill: var(--sec-l1); }
  .sec.l2 .shape { fill: var(--sec-l2); }
  .sec.l3 .shape { fill: var(--sec-l3); }
  .sec.l4 .shape { fill: var(--sec-l4); }
  .sold-bg { fill: var(--sec-zero); }
  .sold-line { stroke: var(--sec-sold-line); stroke-width: 4; }
  .sec.dim { opacity: .22; }
  .interactive .sec.pick { cursor: pointer; }
  .interactive .sec.pick:hover .shape { filter: brightness(.94); }

  .req { fill: none; stroke-width: 6; stroke-linejoin: round; }
  .req.ok { stroke: var(--s-ok); } .req.low { stroke: var(--s-low); } .req.bad { stroke: var(--s-bad); } .req.none { stroke: var(--s-none); }

  text { text-anchor: middle; dominant-baseline: middle; pointer-events: none; font-family: system-ui, -apple-system, sans-serif; }
  .code { fill: var(--sec-ink); font-weight: 650; }
  .free { fill: var(--sec-ink); font-weight: 800; }
  .l3 .code, .l3 .free, .l4 .code, .l4 .free { fill: #fff; }
  .unread .code { fill: var(--muted); font-weight: 500; }
  .stage rect, .stage polygon { fill: var(--map-stage); }
  .sec.off .shape { fill: var(--sec-off); }
  .sec.off .code { fill: var(--muted); opacity: .6; font-weight: 500; }
  .sec.standing .shape { fill: var(--sec-standing); }
  .note { fill: var(--muted); font-weight: 600; }
  .grid-bg { fill: var(--map-bg) !important; stroke: var(--map-edge); stroke-width: 2; }
  /* sits on the map background, not on the coloured section: never white */
  .sec .grid-title { font-weight: 750; fill: var(--sec-ink); }
  .table rect { fill: var(--sec-unread); stroke: var(--map-bg); stroke-width: 1; }
  .table text { fill: var(--muted); font-weight: 600; }
  .table.tfree rect { fill: var(--sec-l3); }
  .table.tfree text { fill: #fff; font-weight: 800; }
  .table.ttaken rect { fill: var(--sec-zero); }
  .table.ttaken text { opacity: .55; }
  .stage text { fill: var(--map-stage-ink); font-weight: 700; letter-spacing: .04em; }
  .pdot { stroke: var(--map-bg); stroke-width: 1.5; pointer-events: none; }
  .badge { fill: var(--map-listing); stroke: var(--map-bg); stroke-width: 2.5; }
  .badge-n { fill: #fff; font-weight: 800; }
</style>

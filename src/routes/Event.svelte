<script>
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import RequestCard from '../ui/RequestCard.svelte';
  import Banners from '../ui/Banners.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { setArchived } from '../lib/actions.js';
  import { ago, clock, plural, fromToday, day } from '../lib/fmt.js';

  let { key } = $props();
  let q = $state('');
  let showAllSectors = $state(false);

  const v = $derived(store.view);
  const ev = $derived(v ? v.events.find(e => e.key === key) : null);
  const mine = $derived(v ? v.requests.filter(r => r.eventKey === key) : []);
  const open = $derived(mine.filter(r => !r.done));
  const done = $derived(mine.filter(r => r.done));

  /* sectors: the searched ones, else the ones with free seats or wanted */
  const sectors = $derived.by(() => {
    if (!ev) return [];
    const needle = SK.util.normKey(q);
    let list = ev.sectors;
    if (needle) list = list.filter(s => SK.util.normKey(`${s.code} ${s.name}`).includes(needle));
    else if (!showAllSectors) list = list.filter(s => s.wanted || (s.summary && s.summary.available > 0));
    return list.slice().sort((a, b) => (b.wanted - a.wanted) || ((b.summary?.available || 0) - (a.summary?.available || 0)) || String(a.code).localeCompare(String(b.code), 'en', { numeric: true }));
  });

  async function archive() {
    try {
      await setArchived(key, !ev.archived);
      store.toast(ev.archived ? 'Event archived' : 'Event back in the list');
    } catch (e) { store.toast(e.message, { tone: 'bad' }); }
  }
</script>

<Page title={ev ? `[${ev.num}] ${ev.title}` : 'Event'} subtitle={ev ? [ev.siteLabel, ev.date || day(ev.time), ev.time !== null ? fromToday(ev.time) : ''].filter(Boolean).join(' · ') : ''}
  back={() => router.back('#/events')}>
  {#snippet actions()}
    {#if ev}
      {#if ev.url}<a class="icon-btn" href={ev.url} target="_blank" rel="noopener" aria-label="Open on {ev.siteLabel}"><Icon name="external" /></a>{/if}
      <button class="icon-btn" onclick={() => router.go(href.add(key))} aria-label="Add a request"><Icon name="plus" /></button>
    {/if}
  {/snippet}

  <Banners />

  {#if !v}
    <div class="skeleton"></div>
  {:else if !ev}
    <div class="empty"><p>This event is no longer tracked.</p><a class="btn" href="#/events">All events</a></div>
  {:else}
    <div class="chips">
      <span class="chip"><Icon name="refresh" size={14} /> {ev.lastScanAt ? `scanned ${ago(ev.lastScanAt)}` : 'never scanned'}{ev.lastScanBy ? ` by ${ev.lastScanBy}` : ''}</span>
      <span class="chip">{ev.autoEvery ? `auto-check every ${ev.autoEvery} min` : 'auto-check off'}</span>
      {#if ev.scanner}<span class="chip accent">{ev.scanner} is scanning</span>{/if}
    </div>

    {#if ev.health && ev.health.failing}
      <div class="banner bad"><span><b>Scans failing since {clock(ev.health.firstFailAt)}</b>{ev.health.lastError || ''}</span></div>
    {/if}

    <h2 class="section-title">Your requests · {open.length}</h2>
    {#each open as r (r.id)}<RequestCard {r} />{/each}
    {#if !open.length}
      <a class="add-card" href={href.add(key)}><Icon name="plus" size={20} /> Add a request</a>
    {/if}
    {#if ev.teamOpen > ev.open}
      <p class="muted small">Teammates have {plural(ev.teamOpen - ev.open, 'open request')} here too ({ev.otherOwners.join(', ')}).</p>
    {/if}

    <h2 class="section-title">Sectors</h2>
    <input class="input" type="search" placeholder="Find a sector (E106, tribuna…)" bind:value={q} enterkeyhint="search" />
    <div class="group sectors">
      {#each sectors as s (s.id)}
        <button class="row" onclick={() => router.openSheet({ kind: 'sector', eventKey: key, sectorId: s.id })}>
          <span class="code">{s.code}</span>
          <span class="grow">
            <span class="sub">{s.name !== s.code ? s.name : ''}</span>
          </span>
          {#if s.wanted}<span class="pill accent num">{s.wanted} wanted</span>{/if}
          <span class="free num {s.summary ? (s.summary.available ? 'ok' : 'muted') : 'muted'}">
            {s.summary ? (s.summary.unmapped ? 'no map' : `${s.summary.available} free`) : '—'}
          </span>
        </button>
      {:else}
        <div class="row muted small">{q ? 'No sector matches.' : 'No sector with free seats in the last scans.'}</div>
      {/each}
    </div>
    {#if !q}
      <button class="btn small linkish" onclick={() => (showAllSectors = !showAllSectors)}>
        {showAllSectors ? 'Only sectors with seats' : `Show all ${ev.sectors.length} sectors`}
      </button>
    {/if}

    {#if done.length}
      <h2 class="section-title">Done · {done.length}</h2>
      {#each done as r (r.id)}<RequestCard {r} />{/each}
    {/if}

    <button class="btn block archive" onclick={archive}><Icon name="archive" size={18} /> {ev.archived ? 'Unarchive' : 'Archive for me'}</button>
  {/if}
</Page>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 99px; background: var(--panel); font-size: 13px; color: var(--muted); box-shadow: 0 1px 0 var(--line); }
  .chip.accent { background: var(--accent-soft); color: var(--accent); }
  .add-card { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 16px; border-radius: var(--r-card); border: 1.5px dashed var(--line); color: var(--accent); font-weight: 600; }
  .sectors { margin-top: 10px; }
  .code { font-weight: 700; min-width: 64px; }
  .free { font-weight: 600; font-size: 14px; }
  .linkish { margin-top: 10px; background: none; color: var(--accent); padding: 0; }
  .archive { margin-top: 28px; color: var(--muted); }
</style>

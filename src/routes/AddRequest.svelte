<script>
  /* Add a request: event, sector (with the free seats from the last
   * scans), tickets, prices on Posttick, client and listing. The first
   * status comes from the team's last scan of that sector; the next scan
   * any PC makes judges it for real. */
  import Page from '../ui/Page.svelte';
  import Icon from '../ui/Icon.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import { SK } from '../lib/sk.js';
  import { store } from '../lib/store.svelte.js';
  import { router, href } from '../lib/router.svelte.js';
  import { addRequest } from '../lib/actions.js';

  let { eventKey = '', sec = '' } = $props();

  const v = $derived(store.view);
  const events = $derived(v ? v.events.filter(e => !e.archived || e.key === eventKey) : []);
  // svelte-ignore state_referenced_locally
  let evKey = $state(eventKey);                      // the route remounts this page, so the first value is the one
  const ev = $derived(events.find(e => e.key === evKey) || null);

  // svelte-ignore state_referenced_locally
  let secText = $state(sec);                         // "Request here" on a sector hands its code over
  let secId = $state('');
  let qty = $state(2);
  let cats = $state([]);
  let client = $state('');
  let listing = $state('');
  let together = $state(true);
  let more = $state(false);
  let warn = $state(null);
  let opts = $state(null);
  let busy = $state(false);
  let error = $state('');
  let focused = $state(false);

  $effect(() => {
    if (v && warn === null) { warn = v.settings.defaultWarn; opts = v.settings.defaultOpts; together = v.settings.together; }
  });
  /* the handed-over code, once the event's sectors are known */
  $effect(() => {
    if (sec && !secId && ev) { const hit = ev.sectors.find(s => s.code === sec); if (hit) secId = hit.id; }
  });

  const suggestions = $derived.by(() => {
    if (!ev || !focused) return [];
    const needle = SK.util.normKey(secText);
    const list = ev.sectors.filter(s => !needle || SK.util.normKey(`${s.code} ${s.name}`).includes(needle));
    return list.sort((a, b) => ((b.summary?.available || 0) - (a.summary?.available || 0))).slice(0, 8);
  });
  const picked = $derived(ev ? ev.sectors.find(s => s.id === secId) : null);
  const catList = $derived(ev && ev.canPrices ? Object.values(ev.cats || {}) : []);

  function pick(s) {
    secId = s.id; secText = s.code; focused = false;
    document.activeElement?.blur();
  }

  function toggleCat(k) { cats = cats.includes(k) ? cats.filter(x => x !== k) : [...cats, k]; }

  async function save() {
    error = '';
    if (!ev) { error = 'Pick an event.'; return; }
    if (!secText.trim()) { error = 'Type a sector.'; return; }
    busy = true;
    try {
      const req = await addRequest({ eventKey: ev.key, sec: secId && picked && picked.code === secText ? secId : secText, qty, cats, client, listing, together, warn, opts });
      navigator.vibrate?.(12);
      store.toast(`Added #${req.num}. A PC judges it at the next scan (every ${ev.autoEvery || '—'} min).`);
      router.back(href.event(ev.key));
    } catch (e) {
      error = e.message;
    } finally { busy = false; }
  }
</script>

<Page title="New request" back={() => router.back(eventKey ? href.event(eventKey) : '#/')} refresh={false}>
  {#if !v}
    <div class="skeleton"></div>
  {:else}
    <form class="form" onsubmit={e => { e.preventDefault(); save(); }}>
      <label class="field">
        <span>Event</span>
        <select class="input" bind:value={evKey} onchange={() => { secId = ''; secText = ''; cats = []; }}>
          <option value="" disabled>Pick an event</option>
          {#each events as e}<option value={e.key}>[{e.num}] {e.title}</option>{/each}
        </select>
      </label>

      {#if ev}
        <div class="field sector">
          <span>Sector</span>
          <input class="input" bind:value={secText} placeholder="E106, N105, tribuna…" autocomplete="off" autocapitalize="characters"
            onfocus={() => (focused = true)} onblur={() => setTimeout(() => (focused = false), 150)}
            oninput={() => (secId = '')} />
          {#if suggestions.length}
            <div class="suggest group">
              {#each suggestions as s (s.id)}
                <button type="button" class="row" onpointerdown={e => e.preventDefault()} onclick={() => pick(s)}>
                  <b>{s.code}</b>
                  <span class="grow sub">{s.name !== s.code ? s.name : ''}</span>
                  <span class="small num {s.summary?.available ? 'ok' : 'muted'}">{s.summary ? `${s.summary.available} free` : 'not read'}</span>
                </button>
              {/each}
            </div>
          {/if}
          {#if picked && picked.summary}
            <p class="hint">{picked.summary.available} free · longest block {picked.summary.longest ?? '—'}{picked.wanted ? ` · ${picked.wanted} already wanted by the team` : ''}</p>
          {/if}
        </div>

        <div class="field">
          <span>Tickets</span>
          <div><Stepper value={qty} onchange={n => (qty = n)} /></div>
        </div>

        {#if catList.length}
          <div class="field">
            <span>Prices (pick one or more)</span>
            <div class="cats">
              {#each catList as c (c.key)}
                <button type="button" class="cat" class:on={cats.includes(c.key)} onclick={() => toggleCat(c.key)}>
                  {SK.rules.priceText(ev.cats, c.key, ev.currency)}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <label class="switch">
          <span><b>Side by side</b><span class="muted small">The tickets must sit together</span></span>
          <input type="checkbox" bind:checked={together} />
        </label>

        <label class="field"><span>Client</span><input class="input" bind:value={client} placeholder="optional" /></label>
        <label class="field"><span>viagogo Listing ID</span><input class="input" bind:value={listing} inputmode="numeric" placeholder="optional" /></label>

        <button type="button" class="more" onclick={() => (more = !more)}>{more ? 'Fewer options' : 'Warnings…'}</button>
        {#if more}
          <div class="two">
            <label class="field"><span>Block warn</span><input class="input" type="number" inputmode="numeric" min="0" bind:value={warn} /></label>
            <label class="field"><span>Options warn</span><input class="input" type="number" inputmode="numeric" min="0" bind:value={opts} /></label>
          </div>
        {/if}
      {/if}

      {#if error}<div class="banner bad">{error}</div>{/if}
      <button class="btn primary block" type="submit" disabled={busy || !ev || !store.online}>
        {busy ? 'Adding…' : store.online ? 'Add request' : 'Offline'}
      </button>
    </form>
  {/if}
</Page>

<style>
  .form { display: grid; gap: 16px; margin-top: 16px; }
  .sector { position: relative; }
  .suggest { position: absolute; z-index: 4; top: 100%; left: 0; right: 0; margin-top: 4px; box-shadow: 0 10px 30px var(--shadow); }
  .suggest .row { min-height: 46px; }
  .hint { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
  .cats { display: flex; flex-wrap: wrap; gap: 8px; }
  .cat { min-height: 38px; padding: 0 14px; border-radius: 99px; border: 1.5px solid var(--line); background: var(--panel); font-weight: 600; cursor: pointer; }
  .cat.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
  .switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--panel); border-radius: 12px; }
  .switch > span { display: grid; }
  .switch input { width: 46px; height: 28px; accent-color: var(--accent); }
  .more { border: 0; background: none; color: var(--accent); font-weight: 600; justify-self: start; padding: 0; cursor: pointer; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>

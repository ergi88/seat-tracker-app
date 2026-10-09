<script>
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte.js';
  import { store } from '../lib/store.svelte.js';

  const tabs = [
    { name: 'now', label: 'Now', icon: 'now' },
    { name: 'events', label: 'Events', icon: 'events' },
    { name: 'money', label: 'Money', icon: 'money' },
    { name: 'inbox', label: 'Inbox', icon: 'inbox' }
  ];

  const active = $derived(['event', 'add', 'map'].includes(router.route.name) ? 'events'
    : router.route.name === 'settings' ? router.lastTab : router.route.name);
  const attention = $derived(store.view ? store.view.attention.length : 0);
  const unread = $derived.by(() => {
    const v = store.view;
    if (!v || !v.alerts.length) return 0;
    const seen = Number(store.deviceSettings.inboxSeen || 0);
    return v.alerts.filter(a => a.id > seen).length;
  });

  function pick(name) {
    if (active === name && router.route.name === name) {
      /* tapping the tab you are on scrolls back to the top, as native tabs do */
      document.querySelector('.scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    router.go(name === 'now' ? '#/' : '#/' + name);
  }
</script>

<nav class="tabbar" aria-label="Sections">
  {#each tabs as t}
    <button class="tab" class:on={active === t.name} onclick={() => pick(t.name)} aria-current={active === t.name ? 'page' : undefined}>
      <span class="ic">
        <Icon name={t.icon} size={24} />
        {#if t.name === 'now' && attention}<span class="badge">{attention}</span>{/if}
        {#if t.name === 'inbox' && unread}<span class="badge">{unread > 9 ? '9+' : unread}</span>{/if}
      </span>
      <span class="lbl">{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    display: grid; grid-template-columns: repeat(4, 1fr);
    height: calc(var(--tabbar-h) + var(--safe-b)); padding: 0 var(--safe-r) var(--safe-b) var(--safe-l);
    background: var(--bar); border-top: 1px solid var(--line);
    -webkit-backdrop-filter: saturate(180%) blur(20px); backdrop-filter: saturate(180%) blur(20px);
    view-transition-name: tabbar;
  }
  .tab {
    display: grid; justify-items: center; align-content: center; gap: 2px;
    border: 0; background: none; color: var(--muted); cursor: pointer; padding: 6px 0 0;
  }
  .tab.on { color: var(--accent); }
  .tab:active .ic { transform: scale(.88); }
  .ic { position: relative; display: grid; transition: transform .12s var(--ease); }
  .lbl { font-size: 11px; font-weight: 600; }
  .badge {
    position: absolute; top: -4px; left: 15px; min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 9px; background: var(--s-bad); color: #fff; font-size: 11px; font-weight: 700;
    display: grid; place-items: center; border: 2px solid var(--panel);
  }
</style>

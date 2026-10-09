import './lib/sk.js';
import './app.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { store } from './lib/store.svelte.js';
import { router } from './lib/router.svelte.js';

router.start();
store.start();
mount(App, { target: document.getElementById('app') });

/* a new version waits until the person says so, never mid-tap */
const update = registerSW({
  onNeedRefresh() {
    store.update.ready = true;
    store.toast('A new version of Seat Tracker is ready.', { ms: 60000, action: { label: 'Reload', run: () => update(true) } });
  },
  onRegisteredSW(url, registration) {
    store.swRegistration = registration || null;
  }
});
store.applyUpdate = () => update(true);

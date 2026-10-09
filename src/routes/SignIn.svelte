<script>
  import Icon from '../ui/Icon.svelte';
  import { store } from '../lib/store.svelte.js';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function go(e) {
    e.preventDefault();
    error = '';
    busy = true;
    try { await store.signIn(email, password); }
    catch (err) { error = err.message; }
    finally { busy = false; }
  }
</script>

<main class="signin">
  <form onsubmit={go}>
    <div class="logo"><Icon name="ticket" size={40} /></div>
    <h1>Seat Tracker</h1>
    <p class="muted">Sign in with the same team account as the extension.</p>
    <input class="input" type="email" autocomplete="username" placeholder="Email" bind:value={email} required />
    <input class="input" type="password" autocomplete="current-password" placeholder="Password" bind:value={password} required />
    {#if error}<div class="banner bad">{error}</div>{/if}
    <button class="btn primary block" type="submit" disabled={busy || !store.online}>{busy ? 'Signing in…' : store.online ? 'Sign in' : 'You are offline'}</button>
  </form>
</main>

<style>
  .signin {
    min-height: 100%; display: grid; place-items: center;
    padding: calc(24px + var(--safe-t)) 24px calc(24px + var(--safe-b));
  }
  form { width: 100%; max-width: 380px; display: grid; gap: 12px; text-align: center; }
  .logo { justify-self: center; width: 76px; height: 76px; border-radius: 22px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); box-shadow: 0 10px 30px var(--shadow); }
  h1 { margin: 8px 0 0; font-size: 28px; letter-spacing: -.02em; }
  p { margin: 0 0 12px; }
</style>

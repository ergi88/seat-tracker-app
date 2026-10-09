/* What the app may write. Scans, leases, health and the event lists
 * belong to the PCs doing the scanning, and "alert once" depends on
 * request_state being written only by them, with one exception: the
 * extension's own reset of a request's baseline after you change it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'shared') walk(p); }
    else if (/\.(js|svelte)$/.test(f)) files.push(p);
  }
})(new URL('../src', import.meta.url).pathname);

const NEVER = ['scans', 'leases', 'event_health', 'catalog', 'catalog_sites', 'devices', 'handled_commands', 'fx_rates', 'events', 'members'];
const WRITE = /\.(insert|update|upsert|delete)\(/;

function writesTo(table) {
  const out = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const re = new RegExp(`from\\('${table}'\\)([^;]*)`, 'g');
    let m;
    while ((m = re.exec(src))) if (WRITE.test(m[1])) out.push(`${f}: ${m[0].slice(0, 80)}`);
  }
  return out;
}

for (const t of NEVER) {
  test(`the app never writes ${t}`, () => assert.deepEqual(writesTo(t), []));
}

test('request_state: only the baseline reset (a delete of one request\'s row)', () => {
  const w = writesTo('request_state');
  assert.equal(w.length, 1);
  assert.match(w[0], /\.delete\(\)\.eq\('request_id'/);
});

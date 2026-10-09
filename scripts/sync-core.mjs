/* ------------------------------------------------------------------
 * Copies the extension's pure modules (no chrome.*, no DOM) into
 * src/shared/sk/, so the app judges requests, prices and profit with
 * exactly the same code as the extension.
 *
 *   node scripts/sync-core.mjs           copy, and write the hashes
 *   node scripts/sync-core.mjs --check   fail when a copy was edited by
 *                                        hand, or when the extension next
 *                                        door has a newer version
 *
 * The extension lives outside this repo (the repo is public and holds the
 * app only), so in CI only the hand-edit half of --check can run.
 * ------------------------------------------------------------------ */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, process.env.SK_EXTENSION || '../seat-tracker');
const TARGET = join(ROOT, 'src/shared/sk');
const MANIFEST = join(TARGET, 'manifest.json');

/* load order matters: util first, registry before the site adapters */
export const FILES = [
  'core/config.js', 'core/util.js', 'core/rules.js', 'core/registry.js', 'core/settings.js',
  'core/profit.js', 'core/viagogo.js', 'core/team.js', 'core/sales.js',
  'sites/ebileta.js', 'sites/efinity.js', 'sites/posttick.js'
];

const flat = f => f.replace('/', '-');
const hash = buf => createHash('sha256').update(buf).digest('hex');

function copy() {
  if (!existsSync(SOURCE)) {
    console.error(`No extension at ${SOURCE}. Set SK_EXTENSION to its folder.`);
    process.exit(1);
  }
  mkdirSync(TARGET, { recursive: true });
  const files = {};
  for (const f of FILES) {
    const buf = readFileSync(join(SOURCE, f));
    writeFileSync(join(TARGET, flat(f)), buf);
    files[f] = hash(buf);
  }
  const version = /version:\s*'([^']+)'/.exec(readFileSync(join(SOURCE, 'core/config.js'), 'utf8'));
  writeFileSync(MANIFEST, JSON.stringify({ extensionVersion: version ? version[1] : '', files }, null, 2) + '\n');
  console.log(`Copied ${FILES.length} files from the extension ${version ? version[1] : ''}.`);
}

function check() {
  if (!existsSync(MANIFEST)) { console.error('No copies yet: run npm run sync-core.'); process.exit(1); }
  const { files } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const problems = [];
  for (const f of FILES) {
    const copyPath = join(TARGET, flat(f));
    if (!files[f] || !existsSync(copyPath)) { problems.push(`${f}: missing, run npm run sync-core`); continue; }
    if (hash(readFileSync(copyPath)) !== files[f]) problems.push(`${f}: edited by hand. Change it in the extension, then run npm run sync-core`);
    const src = join(SOURCE, f);
    if (existsSync(src) && hash(readFileSync(src)) !== files[f]) problems.push(`${f}: the extension has a newer version, run npm run sync-core`);
  }
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('Shared core is in step with the extension.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check(); else copy();
}

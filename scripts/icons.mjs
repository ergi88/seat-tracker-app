/* ------------------------------------------------------------------
 * Draws the app icons (the extension's ticket icon, redrawn as a vector
 * so it stays sharp at 512 px) and renders them with headless Chrome.
 *
 *   node scripts/icons.mjs        (CHROME=/path/to/chrome to pick one)
 * ------------------------------------------------------------------ */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/icons');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.error(`No Chrome at ${CHROME}. Set CHROME.`); process.exit(1); }

const BG = '#121a2b', TICKET = '#2f6bf2', DOT = '#22a55a';

/* scale: how much of the canvas the drawing uses (maskable icons keep to the middle 80%) */
function svg({ rounded, scale }) {
  const k = scale, o = 256 * (1 - k);
  const t = v => o + v * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><mask id="notch"><rect width="512" height="512" fill="#fff"/>
    <circle cx="${t(92)}" cy="${t(256)}" r="${38 * k}" fill="#000"/><circle cx="${t(420)}" cy="${t(256)}" r="${38 * k}" fill="#000"/></mask></defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${BG}"/>
  <rect x="${t(92)}" y="${t(150)}" width="${328 * k}" height="${212 * k}" rx="${30 * k}" fill="${TICKET}" mask="url(#notch)"/>
  <circle cx="${t(404)}" cy="${t(404)}" r="${74 * k}" fill="${BG}"/>
  <circle cx="${t(404)}" cy="${t(404)}" r="${58 * k}" fill="${DOT}"/>
</svg>`;
}

const dir = mkdtempSync(join(tmpdir(), 'sk-icons-'));
function render(name, size, opts) {
  const html = join(dir, name + '.html');
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg(opts)}`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${size},${size}`, `--screenshot=${join(OUT, name + '.png')}`, 'file://' + html], { stdio: 'ignore' });
  console.log('icons/' + name + '.png');
}

render('icon-192', 192, { rounded: true, scale: 1 });
render('icon-512', 512, { rounded: true, scale: 1 });
render('icon-maskable-512', 512, { rounded: false, scale: 0.78 });
render('apple-touch-icon', 180, { rounded: false, scale: 0.86 });
writeFileSync(join(OUT, 'icon.svg'), svg({ rounded: true, scale: 1 }));

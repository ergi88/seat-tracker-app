/* ------------------------------------------------------------------
 * A made-up team, for looking at the screens without signing in.
 * Development only (`npm run dev`, then open /?demo): the production
 * build never includes it. Also the fixture of tests/model.test.js.
 * ------------------------------------------------------------------ */
import { emptyMirror } from './shapes.js';
import { VENUES } from './venues.js';
import { SK } from './sk.js';

export const ME = 'u-me';
export const MATE = 'u-mate';

/* a packed scan as the extension stores it: rows of [label, cat, free, break, id] */
function packed(sec, rows, at) {
  return {
    sec, at,
    /* 'o' free, '.' taken, '|' an aisle before the next seat */
    rows: rows.map(([r, pattern]) => {
      const s = [];
      let aisle = 0;
      for (const ch of pattern) {
        if (ch === '|') { aisle = 1; continue; }
        const n = s.length + 1;
        s.push([String(n), null, ch === 'o' ? 1 : 0, aisle, `${sec}-${r}-${n}`]);
        aisle = 0;
      }
      return { r, s };
    })
  };
}

/* every sector eBileta sells at Air Albania; E105, E106, W105, N101 and
 * S203 keep the ids the requests below point at */
const FIXED = { E105: '11', E106: '12', W105: '13', N101: '14', S203: '15' };
const SOLD = new Set(['E205', 'E206', 'E207', 'E104', 'V VIP', 'SKYBOX', 'MEDIA']);
function airAlbaniaSectors() {
  const v = VENUES.find(x => x.id === 'air-albania');
  return [...v.sections.map(s => s.code), ...v.offMap].map((code, i) => ({
    id: FIXED[code] || String(100 + i), code, name: code.length <= 5 ? 'TRIBUNA ' + code : code,
    meta: { idSM: '900', tipoM: '1', status: SOLD.has(code) ? 'soldout' : 'high' }
  }));
}
/* a made-up but steady spread of free seats: the same picture every time */
function freeSeats(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const pick = h % 10;
  return pick < 2 ? 0 : pick < 4 ? h % 9 + 1 : pick < 7 ? h % 40 + 10 : h % 300 + 50;
}

/* Max Amini at Pallati i Kongreseve: Posttick's real blocks and the real
 * price categories (27 Nov), each row of a block at one price */
const MAX_KEY = 'posttick:max-amini-tirana';
const MAX_CATS = {
  1: { key: '1', label: 'CAT 1', color: '#CD254A', price: 245 }, 2: { key: '2', label: 'CAT 2', color: '#E9803D', price: 219 },
  3: { key: '3', label: 'CAT 3', color: '#FCA700', price: 144 }, 4: { key: '4', label: 'CAT 4', color: '#05A588', price: 95 },
  11: { key: '11', label: 'CAT 5', color: '#86B737', price: 85 }, 5: { key: '5', label: 'CAT 6', color: '#3190ED', price: 75 },
  10: { key: '10', label: 'CAT 7', color: '#0D67BF', price: 65 }
};
const MAX_BLOCKS = { A1: ['2', '3', '4'], A2: ['1', '2', '3'], A3: ['2', '3', '4'], A4: ['3', '4'], A5: ['1', '2', '3'], A6: ['3', '4'],
  B: ['4', '11'], C: ['4', '11'], D1: ['11', '5', '10'], D2: ['11', '5', '10'], D3: ['11', '5', '10'] };
function maxScan(code, at) {
  const prices = MAX_BLOCKS[code];
  const rows = [];
  for (let r = 1; r <= 9; r++) {
    const cat = prices[Math.min(prices.length - 1, Math.floor((r - 1) / 3))];
    const s = [];
    /* runs of free and taken seats, as a real sale leaves them: a steady
     * pseudo-random walk, seeded by block and row */
    let seed = 7;
    for (const ch of code + '/' + r) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const keep = code === 'A2' && r <= 3 ? 0.88 : 0.72;                      // A2's dearest rows nearly gone
    let free = rnd() > 0.6;
    for (let n = 1; n <= 18; n++) {
      if (n > 1 && rnd() > keep) free = !free;
      s.push([String(n), cat, free ? 1 : 0, n === 10 ? 1 : 0, `Block ${code}-${r}-${n}`]);   // an aisle after seat 9
    }
    rows.push({ r: String(r), s });
  }
  return { sec: 'Block ' + code, at, rows };
}

/* Senidah on eFinity: the real stands, the standing areas, and 125 bar
 * tables gathered into "Bar Table" (one row per table, free only whole) */
const SEN_KEY = 'efinity:senidah';
const SEN_STANDS = ['A TRIBINE', 'B TRIBINE', 'C TRIBINE', 'D TRIBINE', 'E TRIBINE', 'F TRIBINE', 'F DOLE', 'G TRIBINE', 'H TRIBINE', 'I TRIBINE', 'J TRIBINE', 'K TRIBINE'];
const SEN_STANDING = ['PARTER', 'FAN PIT DESNO', 'FAN PIT LEVO'];
function senidahSectors() {
  return [
    ...SEN_STANDS.map(code => ({ id: code, code, name: code, meta: { seated: true, seats: 200, price: code.startsWith('F') ? 3290 : 2290 } })),
    ...SEN_STANDING.map(code => ({ id: code, code, name: code, meta: { seated: false, seats: 0, price: 2090 } })),
    { id: 'BAR TABLES', code: 'Bar Table', name: 'Bar Table · every barski sto', meta: { bar: true, seated: true, tables: 125, perTable: 6, seats: 750, price: 4000 } },
    ...Array.from({ length: 125 }, (_, i) => ({ id: 'BARSKI STO ' + (i + 1), code: 'BARSKI STO ' + (i + 1), name: 'BARSKI STO ' + (i + 1), meta: { seated: true, seats: 6, price: 4000 } }))
  ];
}
/* a steady spread of whole free tables, more of them away from the stage */
function barScan(at) {
  const rows = [];
  for (let n = 1; n <= 125; n++) {
    const free = ((n * 37) % 11) < (n > 75 ? 4 : 2);
    rows.push({ r: String(n), s: Array.from({ length: 6 }, (_, i) => [String(i + 1), null, free ? 1 : 0, 0, `BAR-${n}-${i + 1}`]) });
  }
  return { sec: 'BAR TABLES', at, rows };
}

export function demoMirror(now = Date.now()) {
  const min = 60000;
  const day = new Date(now).toISOString().slice(0, 10);
  const m = emptyMirror();
  m.team = { autoMin: 5 };
  m.profiles = {
    [ME]: { displayName: 'Sam', settings: { phoneTopic: 'demo-topic' }, snoozeUntil: 0 },
    [MATE]: { displayName: 'Alex', settings: {}, snoozeUntil: 0 }
  };
  m.members = [{ userId: ME, email: 'me@example.com' }, { userId: MATE, email: 'mate@example.com' }];
  m.events = {
    'ebileta:2160': {
      key: 'ebileta:2160', num: 1, site: 'ebileta', siteId: '2160', title: 'Albania – Serbia', date: '2026-11-14 20:45',
      sectors: airAlbaniaSectors(),
      extra: { idSM: '900' }, cats: {}, autoMin: null
    },
    [MAX_KEY]: {
      key: MAX_KEY, num: 2, site: 'posttick', siteId: 'max-amini-tirana', title: 'Max Amini - 27.11.2026 - 6:30 PM - Pallati i Kongreseve - Tirana - Albania', date: '',
      sectors: Object.keys(MAX_BLOCKS).map(code => ({ id: 'Block ' + code, code, name: 'Block ' + code, meta: { seats: 162 } })),
      extra: { currency: '€' }, cats: MAX_CATS, autoMin: 2
    },
    [SEN_KEY]: {
      key: SEN_KEY, num: 3, site: 'efinity', siteId: 'senidah', title: 'Senidah', date: '2026-10-22',
      sectors: senidahSectors(), extra: {}, cats: {}, autoMin: null
    }
  };
  const req = (id, userId, eventKey, num, sec, qty, extra) => ({
    id, userId, eventKey, num, sec, qty, cats: [], client: '', listing: '', warn: 2, opts: 3, together: true, done: false,
    createdAt: now - 3 * 86400000, buyPrice: null, buyCurrency: 'ALL', ...extra
  });
  m.requests = {
    r1: req('r1', ME, 'ebileta:2160', 7, '12', 6, { client: 'Ana K.', listing: '20000000001' }),
    r2: req('r2', ME, 'ebileta:2160', 8, '11', 4, { client: 'Besi' }),
    r3: req('r3', ME, 'ebileta:2160', 9, '14', 2, {}),
    r4: req('r4', ME, MAX_KEY, 10, 'Block A2', 3, { cats: ['1', '2'] }),
    r5: req('r5', ME, SEN_KEY, 11, 'C TRIBINE', 2, { done: true }),
    r7: req('r7', ME, SEN_KEY, 12, 'BAR TABLES', 6, { client: 'Drini' }),
    r6: req('r6', MATE, 'ebileta:2160', 2, '12', 5, {})
  };
  m.state = {
    r1: { status: 'OK', options: 36, free: 485, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 3 },
    r2: { status: 'LOW', options: 2, free: 14, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 5 },
    r3: { status: 'SPLIT', options: 0, free: 3, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 2 },
    r4: { status: 'OK', options: 9, free: 31, pendingGone: false, alertLog: {}, scanAt: now - 6 * min, version: 1 }
  };
  const meta = (available, total, longest, at, by, price) => ({ at, by, summary: Object.assign({ available, total, longest }, price ? { price } : {}) });
  const stadium = {};
  for (const s of m.events['ebileta:2160'].sectors) {
    if (s.meta.status === 'soldout' || ['N207', 'E201', 'S201', 'TETRAPLEGJIK V'].includes(s.code)) continue;   // never read
    const free = freeSeats(s.code);
    stadium[s.id] = meta(free, 300, free ? Math.max(1, Math.min(free, free % 14 + 1)) : 0, now - 2 * min, 'Office PC',
      { min: 2000, max: s.code.startsWith('E2') || s.code.startsWith('W') ? 5000 : 3000, currency: 'ALL' });
  }
  Object.assign(stadium, {
    11: meta(14, 320, 4, now - 2 * min, 'Office PC', { min: 3000, max: 4000, currency: 'ALL' }),
    12: meta(485, 900, 22, now - 2 * min, 'Office PC', { min: 3000, max: 4000, currency: 'ALL' }),
    13: meta(43, 420, 8, now - 2 * min, 'Office PC'),
    14: meta(3, 300, 1, now - 2 * min, 'Office PC')
  });
  const bar = barScan(now - 4 * min);
  const freeTables = bar.rows.filter(r => r.s[0][2]).length;
  const senidah = {
    'BAR TABLES': { at: bar.at, by: 'Office PC', summary: { available: freeTables * 6, total: 750, longest: freeTables ? 6 : 0 } }
  };
  for (const code of SEN_STANDS) { const f = freeSeats(code); senidah[code] = meta(f, 200, f ? Math.min(f, f % 12 + 1) : 0, now - 4 * min, 'Office PC'); }
  for (const code of SEN_STANDING) senidah[code] = { at: now - 4 * min, by: 'Office PC', summary: { unmapped: true, note: 'standing area' } };
  m.state.r7 = { status: 'OK', options: freeTables, free: freeTables * 6, pendingGone: false, alertLog: {}, scanAt: bar.at, version: 1 };
  m.scanMeta = {
    [SEN_KEY]: senidah,
    'ebileta:2160': stadium,
    [MAX_KEY]: Object.fromEntries(Object.keys(MAX_BLOCKS).map(code => {
      const scan = maxScan(code, now - 6 * min);
      const v = SK.rules.blocksFor(scan, null);
      const freeCats = [...new Set(scan.rows.flatMap(r => r.s.filter(p => p[2]).map(p => p[1])))];
      return ['Block ' + code, { at: scan.at, by: 'Laptop', summary: { available: v.available, total: v.total, longest: v.longest, cats: freeCats } }];
    }))
  };
  m.leases = { 'scan:ebileta:2160': { deviceId: 'pc1', userId: ME, expiresAt: now + 30000 } };
  m.listings = {
    20000000001: {
      id: '20000000001', userId: ME, eventKey: 'ebileta:2160', sectorId: '12', vgEventId: '1', title: 'Albania vs Serbia', when: 'Sat 14 Nov',
      section: 'E106', row: '', status: 'Active', currency: 'USD', price: 84, payout: 453.6, tickets: 6, recommended: 52,
      performance: '', history: [], seenAt: now - 20 * min, seenBy: 'pc1', venue: 'Air Albania', track: 'auto', lastSweepAt: 0, buyPrice: null, buyCurrency: 'ALL'
    },
    20000000002: {
      id: '20000000002', userId: ME, eventKey: 'ebileta:2160', sectorId: '13', vgEventId: '1', title: 'Albania vs Serbia', when: 'Sat 14 Nov',
      section: 'W105', row: '', status: 'Active', currency: 'USD', price: 61, payout: 158.6, tickets: 2, recommended: 58,
      performance: '', history: [], seenAt: now - 20 * min, seenBy: 'pc1', venue: 'Air Albania', track: 'auto', lastSweepAt: 0, buyPrice: 4000, buyCurrency: 'ALL'
    }
  };
  m.teamPrices = {
    20000000003: { id: '20000000003', userId: MATE, eventKey: 'ebileta:2160', sectorId: '12', section: 'E106', row: '', status: 'Active', currency: 'USD', price: 79, tickets: 4, seenAt: now - 60 * min }
  };
  m.sales = {
    s1: { id: 's1', userId: ME, eventKey: 'ebileta:2160', sectorId: '12', vgEventId: '1', listingId: null, title: 'Albania vs Serbia', when: 'Sat 14 Nov', venue: '', section: 'E106', row: '', tickets: 2, currency: 'USD', amount: 151.2, status: 'Complete', soldOn: day, buyPrice: null, buyCurrency: 'ALL', seenAt: now },
    s2: { id: 's2', userId: ME, eventKey: 'ebileta:2160', sectorId: '11', vgEventId: '1', listingId: null, title: 'Albania vs Serbia', when: 'Sat 14 Nov', venue: '', section: 'E105', row: '', tickets: 4, currency: 'USD', amount: 260, status: 'Get Paid', soldOn: day, buyPrice: null, buyCurrency: 'ALL', seenAt: now }
  };
  m.fx = { [day]: { USD: 83.36, EUR: 96.5, RSD: 0.82, GBP: 111.2 } };
  m.devices = [
    { id: 'pc1', userId: ME, name: 'Office PC', lastSeen: now - 20000, version: '3.0.0' },
    { id: 'pc2', userId: MATE, name: "Alex's laptop", lastSeen: now - 3 * 3600000, version: '3.0.0' }
  ];
  m.alerts = [
    { id: 41, userId: ME, eventKey: 'ebileta:2160', requestId: 'r2', type: 'low', title: 'Running low', message: '🟠 #8 E105 ×4 LOW — 2 options\n[1] Albania – Serbia', click: '', createdAt: now - 4 * min },
    { id: 40, userId: ME, eventKey: 'ebileta:2160', requestId: null, type: 'teamNote', title: 'Alex says', message: '[1] Albania – Serbia\nSection E106\nI dropped to $79', click: '', createdAt: now - 65 * min },
    { id: 39, userId: ME, eventKey: 'ebileta:2160', requestId: 'r3', type: 'gone', title: 'No longer fillable', message: '🔴 #9 N101 ×2 SPLIT\n[1] Albania – Serbia', click: '', createdAt: now - 5 * 3600000 }
  ];
  m.fingerprints = { demo: '1' };
  m.pulledAt = now;
  return m;
}

export const demoScans = (now = Date.now()) => ({
  [SEN_KEY]: { 'BAR TABLES': barScan(now - 4 * 60000) },
  [MAX_KEY]: Object.fromEntries(Object.keys(MAX_BLOCKS).map(code => ['Block ' + code, maxScan(code, now - 6 * 60000)])),
  'ebileta:2160': {
    12: packed('12', [['1', 'oooooo|ooooo..ooo'], ['2', 'oooo..oooooooooo'], ['3', '..oo.ooo|oooooo'], ['4', 'oooooooooooooooooooooo']], now - 2 * 60000)
  }
});

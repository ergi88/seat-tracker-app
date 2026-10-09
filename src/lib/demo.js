/* ------------------------------------------------------------------
 * A made-up team, for looking at the screens without signing in.
 * Development only (`npm run dev`, then open /?demo): the production
 * build never includes it. Also the fixture of tests/model.test.js.
 * ------------------------------------------------------------------ */
import { emptyMirror } from './shapes.js';

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
      sectors: [
        { id: '11', code: 'E105', name: 'TRIBUNA E105', meta: { idSM: '900', tipoM: '1' } },
        { id: '12', code: 'E106', name: 'TRIBUNA E106', meta: { idSM: '900', tipoM: '1' } },
        { id: '13', code: 'W105', name: 'TRIBUNA W105', meta: { idSM: '900', tipoM: '1' } },
        { id: '14', code: 'N101', name: 'TRIBUNA N101', meta: { idSM: '900', tipoM: '1' } },
        { id: '15', code: 'S203', name: 'TRIBUNA S203', meta: { idSM: '900', tipoM: '1' } }
      ],
      extra: { idSM: '900' }, cats: {}, autoMin: null
    },
    'posttick:max-amini-tirana': {
      key: 'posttick:max-amini-tirana', num: 2, site: 'posttick', siteId: 'max-amini-tirana', title: 'Max Amini · Tirana', date: '2026-11-27',
      sectors: [{ id: 'A', code: 'A', name: 'Block A', meta: {} }, { id: 'B', code: 'B', name: 'Block B', meta: {} }],
      extra: { currency: '€' }, cats: { 1: { key: '1', label: 'CAT 1', price: 65 }, 2: { key: '2', label: 'CAT 2', price: 55 } }, autoMin: 2
    },
    'efinity:senidah': {
      key: 'efinity:senidah', num: 3, site: 'efinity', siteId: 'senidah', title: 'Senidah', date: '2026-10-22',
      sectors: [{ id: 'C2', code: 'C2', name: 'C2', meta: { price: 4500 } }], extra: {}, cats: {}, autoMin: null
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
    r4: req('r4', ME, 'posttick:max-amini-tirana', 10, 'B', 3, { cats: ['1', '2'] }),
    r5: req('r5', ME, 'efinity:senidah', 11, 'C2', 2, { done: true }),
    r6: req('r6', MATE, 'ebileta:2160', 2, '12', 5, {})
  };
  m.state = {
    r1: { status: 'OK', options: 36, free: 485, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 3 },
    r2: { status: 'LOW', options: 2, free: 14, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 5 },
    r3: { status: 'SPLIT', options: 0, free: 3, pendingGone: false, alertLog: {}, scanAt: now - 2 * min, version: 2 },
    r4: { status: 'OK', options: 9, free: 31, pendingGone: false, alertLog: {}, scanAt: now - 6 * min, version: 1 }
  };
  const meta = (available, total, longest, at, by, price) => ({ at, by, summary: Object.assign({ available, total, longest }, price ? { price } : {}) });
  m.scanMeta = {
    'ebileta:2160': {
      11: meta(14, 320, 4, now - 2 * min, 'Office PC', { min: 3000, max: 4000, currency: 'ALL' }),
      12: meta(485, 900, 22, now - 2 * min, 'Office PC', { min: 3000, max: 4000, currency: 'ALL' }),
      13: meta(43, 420, 8, now - 2 * min, 'Office PC'),
      14: meta(3, 300, 1, now - 2 * min, 'Office PC')
    },
    'posttick:max-amini-tirana': { B: meta(31, 120, 6, now - 6 * min, 'Laptop') }
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
  'ebileta:2160': {
    12: packed('12', [['1', 'oooooo|ooooo..ooo'], ['2', 'oooo..oooooooooo'], ['3', '..oo.ooo|oooooo'], ['4', 'oooooooooooooooooooooo']], now - 2 * 60000)
  }
});

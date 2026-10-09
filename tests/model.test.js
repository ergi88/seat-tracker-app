/* The screens' numbers, from a made-up team (src/lib/demo.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildView, evalOf, eventTime, byNearest } from '../src/lib/model.js';
import { demoMirror, demoScans, ME } from '../src/lib/demo.js';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const view = (opts = {}) => buildView(demoMirror(NOW), ME, Object.assign({ now: NOW }, opts));

test('only my requests: nearest event first, fewest options first within it', () => {
  const v = view();
  /* Senidah 22 Oct (r7 open, r5 done last), then Albania – Serbia 14 Nov (r3 0 options, r2 2, r1 36), then Max Amini 27 Nov */
  assert.deepEqual(v.requests.map(r => r.id), ['r7', 'r5', 'r3', 'r2', 'r1', 'r4']);
  assert.ok(v.requests.every(r => r.userId === ME));
});

test('needs attention = open LOW / SPLIT / SHORT, like the toolbar badge', () => {
  const v = view();
  assert.deepEqual(v.attention.map(r => r.id).sort(), ['r2', 'r3']);
  assert.equal(v.open.length, 5);                    // r5 is done
});

test('profit of a request matches the README example (+13,812 L, x1.6)', () => {
  const r1 = view().requests.find(r => r.id === 'r1');
  assert.equal(r1.buy.amount, 4000);                 // eBileta section price, the higher one
  assert.equal(Math.round(r1.profit.total), 13812);
  assert.equal(r1.profit.winRate.toFixed(1), '1.6');
  assert.equal(Math.round(r1.profit.atRecommended.total), -593);
});

test('teammates in the same sector show their price, never their payout', () => {
  const r1 = view().requests.find(r => r.id === 'r1');
  assert.deepEqual(r1.teamPrices.map(t => [t.owner, t.price]), [['Alex', 79]]);
  assert.equal(r1.teamPrices[0].payout, undefined);
});

test('events: worst status of my open requests, who else is in, who scans', () => {
  const e = view().events.find(x => x.key === 'ebileta:2160');
  assert.equal(e.worst, 'SPLIT');
  assert.equal(e.tone, 'bad');
  assert.deepEqual(e.otherOwners, ['Alex']);
  assert.equal(e.scanner, 'Office PC');
  assert.equal(e.sectors.find(s => s.code === 'E106').wanted, 11);   // 6 mine + 5 Alex's, shown, never judged together
});

test('a PC seen in the last 2 minutes is online', () => {
  const v = view();
  assert.deepEqual(v.pcsOnline.map(d => d.name), ['Office PC']);
});

test('a request waiting out its undo window is hidden everywhere', () => {
  const v = view({ hidden: { r3: true } });
  assert.ok(!v.requests.some(r => r.id === 'r3'));
  assert.equal(v.events.find(x => x.key === 'ebileta:2160').worst, 'LOW');
});

test('a newer full scan beats the stored state, as in the extension', () => {
  const m = demoMirror(NOW);
  const scans = demoScans(NOW);
  scans['ebileta:2160']['12'].at = NOW;              // newer than r1's state
  const e = evalOf(m, m.requests.r1, scans);
  assert.equal(e.status, 'OK');
  assert.equal(e.free, 61);                          // 14 + 14 + 11 + 22 in demoScans
  assert.equal(e.preview, false);
});

test('a request with no state yet gets a preview from the last scan', () => {
  const m = demoMirror(NOW);
  delete m.state.r1;
  const e = evalOf(m, m.requests.r1, demoScans(NOW));
  assert.equal(e.preview, true);
  assert.equal(e.status, 'OK');
});

test('sales: profit at the rates of the day they sold', () => {
  const s1 = view().sales.find(s => s.id === 's1');
  assert.equal(Math.round(s1.money.payoutL), Math.round(151.2 * 83.36));
  assert.equal(Math.round(s1.money.costL), 8000);
});

test('events: nearest date first, like the viagogo listings page', () => {
  assert.deepEqual(view().events.map(e => e.num), [3, 1, 2]);
});

test('event dates as the sites write them, with or without a year', () => {
  /* local calendar day: an event is on the day the venue's clock says */
  const at = s => {
    const t = eventTime(s, NOW);
    if (t === null) return null;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  assert.equal(at('2026-11-14 20:45'), '2026-11-14');
  assert.equal(at('22.10.2026'), '2026-10-22');
  assert.equal(at('Sat 14 Nov'), '2026-11-14');
  assert.equal(at('Sat 3 Jan'), '2027-01-03');        // no year: the coming one
  assert.equal(at(''), null);
});

test('nearest first: coming (today included), then past most recent first, then no date', () => {
  const list = [['old', '2026-09-01'], ['none', ''], ['dec', '2026-12-01'], ['this morning', '2026-10-09 08:00'], ['nov', '2026-11-14'], ['last week', '2026-10-01']]
    .map(([n, d]) => ({ n, time: eventTime(d, NOW) }));
  assert.deepEqual(list.sort(byNearest(NOW)).map(x => x.n), ['this morning', 'nov', 'dec', 'last week', 'old', 'none']);
});

/* The team's real events on 2026-10-09: `date` is empty on all of them; the
 * date is in the title (eBileta month first, Posttick dd.mm.yyyy), and
 * Senidah has none, so a viagogo listing linked to it gives it. */
test('real events sort by the date in their titles, or their viagogo listing', () => {
  const m = demoMirror(NOW);
  const ev = (key, num, site, title) => ({ key, num, site, siteId: key.split(':')[1], title, date: '', sectors: [], extra: {}, cats: {}, autoMin: null });
  m.events = Object.fromEntries([
    ev('ebileta:2154', 2, 'ebileta', 'Shqiperi - San Marino - October 6, 2026, 8:45 PM - Air Albania Stadium'),
    ev('efinity:32286', 3, 'efinity', 'Senidah Cair'),
    ev('ebileta-ks:1216', 6, 'ebileta-ks', 'Kosova - Austria - October 4, 2026, 6:00 PM - FADIL VOKRRI STADIUM'),
    ev('ebileta:2174', 8, 'ebileta', 'EGNATIA - MIDTJYLLAND - October 15, 2026, 6:45 PM - Air Albania Stadium'),
    ev('posttick:a', 9, 'posttick', 'Max Amini - 27.11.2026 - 6:30 PM - Pallati i Kongreseve - Tirana - Albania'),
    ev('posttick:b', 10, 'posttick', 'Max Amini - 01.12.2026 - 6:30 PM - Pallati i Kongreseve - Tirana - Albania'),
    ev('ebileta:2182', 11, 'ebileta', 'Shqiperi - Finlande - November 12, 2026, 8:45 PM - Air Albania Stadium')
  ].map(e => [e.key, e]));
  m.requests = {}; m.state = {}; m.sales = {};
  m.listings = { 1: Object.assign({}, demoMirror(NOW).listings['20000000001'], { id: '1', eventKey: 'efinity:32286', when: '2026-10-22T20:00:00' }) };
  const v = buildView(m, ME, { now: NOW });
  assert.deepEqual(v.events.map(e => e.num), [8, 3, 11, 9, 10, 2, 6]);
  assert.equal(new Date(v.events[0].time).getHours(), 18);         // 6:45 PM read from the title
});

test('request order follows the setting, as in the extension: options or number; done last', () => {
  const m = demoMirror(NOW);
  m.state.r2.options = 40;                                 // r2 now has more options than r1 (36)
  const ids = sort => buildView(m, ME, { now: NOW, deviceSettings: { listSort: sort } }).requests
    .filter(r => r.eventKey === 'ebileta:2160').map(r => r.id);
  assert.deepEqual(ids('options'), ['r3', 'r1', 'r2']);    // 0, 36, 40
  assert.deepEqual(ids('number'), ['r1', 'r2', 'r3']);     // #7, #8, #9
});

test('needs attention: fewest options first across events', () => {
  const v = view();
  assert.deepEqual(v.attention.map(r => r.options), [...v.attention.map(r => r.options)].sort((a, b) => a - b));
});

test('Senidah: the bar tables are one sector, the standing areas have no seat data', () => {
  const e = view().events.find(x => x.key === 'efinity:senidah');
  const bar = e.sectors.find(s => s.id === 'BAR TABLES');
  assert.equal(bar.code, 'Bar Table');
  assert.equal(bar.summary.available % 6, 0);                       // whole tables only
  assert.ok(e.sectors.find(s => s.code === 'PARTER').summary.unmapped);
});

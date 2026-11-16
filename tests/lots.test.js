/* Inventory: only lots are stock; listings and sales draw on them, and what
 * no lot covers is still to buy. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lotsOf, sumOf, placedOf, buyOfLots } from '../src/lib/lots.js';
import { buildView } from '../src/lib/model.js';
import { demoMirror, ME } from '../src/lib/demo.js';

const NOW = Date.parse('2026-11-14T10:00:00');
const SOON = Date.parse('2026-11-20T20:00:00');
const ev = { key: 'e1', num: 1, vgEventId: '555', time: SOON, info: { name: 'Albania vs Serbia' },
  sectors: [{ id: '1', code: 'A1', price: null }, { id: '2', code: 'B2', price: { amount: 2000, currency: 'ALL' } }] };
const lekOf = (amount, currency) => (currency === 'USD' ? amount * 100 : amount);
const isPaid = s => s.status === 'Complete';
let n = 0;
const lot = (qty, price, assigned, extra) => ({ id: 'p' + (++n), eventKey: 'e1', sectorId: '1', qty, price, currency: 'ALL',
  boughtOn: '2026-11-0' + Math.min(9, n), createdAt: n, assigned: Object.assign({ listings: {}, sales: {} }, assigned), ...extra });
const listing = (id, tickets, extra) => ({ id, eventKey: 'e1', vgEventId: '555', sectorId: '1', section: 'A1', tickets, statusKind: 'active', time: SOON,
  currency: 'USD', money: { payoutL: 5000, ratio: 0.9, sellRate: 100 }, ...extra });
const sale = (id, tickets, payoutL, extra) => ({ id, eventKey: 'e1', vgEventId: '555', listingId: null, tickets, status: 'Complete', soldOn: '2026-11-10', time: SOON,
  money: { payoutL }, ...extra });
const run = x => lotsOf(Object.assign({ events: [ev], purchases: [], listings: [], sales: [], lekOf, isPaid, now: NOW }, x));

test('no lots: nothing held, nothing at risk, even with listings and sales', () => {
  const inv = run({ listings: [listing('L1', 4)], sales: [sale('S1', 2, 9000, { listingId: 'L1' })] });
  assert.equal(inv.groups.length, 0);
  assert.deepEqual([inv.total.bought, inv.total.inHand, inv.total.spentL, inv.total.toGoL], [0, 0, 0, 0]);
  assert.equal(inv.toBuy.length, 1);
  assert.deepEqual([inv.toBuy[0].sold, inv.toBuy[0].listed], [2, 4], 'the listing\'s sold and listed tickets are to buy');
});

test('a lot of 10 on one listing: its sales come off it, the rest is listed or free', () => {
  const p = lot(10, 3000, { listings: { L1: 7 } });
  const inv = run({ purchases: [p], listings: [listing('L1', 4)],
    sales: [sale('S1', 2, 9000, { listingId: 'L1' }), sale('S2', 1, 5000, { listingId: 'L1', status: 'Get Paid' })] });
  const x = inv.groups[0].lots[0];
  assert.deepEqual([x.qty, x.sold, x.listed, x.free, x.inHand], [10, 3, 4, 3, 7]);
  assert.equal(x.payoutL, 14000);
  assert.equal(x.unpaidL, 5000, 'the one-ticket sale is not paid yet');
  const t = inv.groups[0].total;
  assert.equal(t.spentL, 30000);
  assert.equal(t.toGoL, 16000);
  assert.equal(t.toGoEachL, 16000 / 7);
  assert.equal(t.ifListedL, -16000 + 4 * 5000);
  assert.ok(Math.abs(t.ask.amount - 16000 / 7 / 100 / 0.9) < 1e-9);
  assert.equal(inv.toBuy.length, 0, 'everything is covered');
});

test('two lots on one listing: the older one sells first; what no lot covers is to buy', () => {
  const a = lot(2, 1000, { listings: { L1: 2 } });
  const b = lot(3, 1000, { listings: { L1: 3 } });
  const inv = run({ purchases: [b, a], listings: [listing('L1', 4)], sales: [sale('S1', 3, 9000, { listingId: 'L1' })] });
  const [x, y] = inv.groups[0].lots.slice().sort((p, q) => p.p.createdAt - q.p.createdAt);
  assert.deepEqual([x.sold, x.listed], [2, 0]);
  assert.deepEqual([y.sold, y.listed], [1, 2]);
  assert.equal(inv.toBuy.length, 1);
  assert.deepEqual([inv.toBuy[0].sold, inv.toBuy[0].listed], [0, 2], 'the listing has 7 tickets in all, the lots 5');
});

test('a sale with no listing is put on a lot by hand; an ended listing gives its tickets back', () => {
  const p = lot(5, null, { sales: { S9: 2 }, listings: { L2: 3 } });
  const inv = run({ purchases: [p], listings: [listing('L2', 3, { statusKind: 'expired' })], sales: [sale('S9', 2, 8000), sale('S8', 1, 4000)] });
  const x = inv.groups[0].lots[0];
  assert.deepEqual([x.sold, x.listed, x.free], [2, 0, 3]);
  assert.equal(x.each, null, 'no price and no price list for A1');
  assert.equal(inv.groups[0].total.unpriced, 5);
  assert.deepEqual(inv.toBuy.map(e => [e.kind, e.qty]), [['sale', 1]], 'the other sale is still to buy');
  assert.equal(placedOf(p), 5);
});

test('the price list prices a lot with none; a past event drops off "To buy"', () => {
  const p = lot(2, null, {}, { sectorId: '2' });
  const past = Object.assign({}, ev, { key: 'e0', vgEventId: '444', time: Date.parse('2026-11-01T20:00:00') });
  const inv = lotsOf({ events: [ev, past], purchases: [p], listings: [listing('L3', 2, { eventKey: 'e0', vgEventId: '444' })], sales: [], lekOf, isPaid, now: NOW });
  assert.equal(inv.groups[0].lots[0].each, 2000);
  assert.equal(inv.toBuy.length, 0);
});

test('a viagogo event nobody tracks: its lot, listings and sales group by viagogo\'s id', () => {
  const p = { id: 'pv', eventKey: null, vgEventId: '777', eventTitle: 'Kosovo vs Sweden', section: 'Lindore', qty: 2, price: 25, currency: 'EUR',
    boughtOn: '2026-11-02', createdAt: 1, assigned: { listings: { LV: 2 }, sales: {} } };
  const inv = run({ purchases: [p], listings: [listing('LV', 1, { eventKey: null, vgEventId: '777', title: 'Kosovo vs Sweden', uploaded: true })],
    sales: [sale('SV', 1, 3000, { eventKey: null, vgEventId: '777', listingId: 'LV' })] });
  const g = inv.byKey['vg:777'];
  assert.equal(g.name, 'Kosovo vs Sweden');
  assert.deepEqual([g.total.sold, g.total.listed, g.total.free], [1, 1, 0]);
  assert.equal(inv.uploaded.length, 0, 'covered: nothing to confirm');
});

test('an uploaded listing no lot covers is offered as a lot; a viagogo id a tracked event is sold on counts as that event', () => {
  const inv = run({ listings: [listing('L5', 2, { eventKey: null, uploaded: true })] });
  assert.equal(inv.uploaded.length, 1);
  assert.equal(inv.uploaded[0].group.key, 'e1');
  assert.equal(inv.keyOf({ vgEventId: '555' }), 'e1');
});

test('sumOf adds events up', () => {
  const t = sumOf([{ bought: 2, inHand: 2, spentL: 100, payoutL: 0 }, { bought: 3, inHand: 1, spentL: 50, payoutL: 200 }]);
  assert.deepEqual([t.bought, t.inHand, t.netL, t.toGoL], [5, 3, 50, 0]);
});

test('the demo: lots on a listing and on a sale, the uploaded listing with no lot offered', () => {
  const v = buildView(demoMirror(NOW), ME, { now: NOW });
  const st = v.events.find(e => e.key === 'ebileta:2160').stock;
  assert.deepEqual([st.total.bought, st.total.sold, st.total.listed, st.total.free], [6, 2, 4, 0], '2 sold by hand, 4 on the E106 listing');
  assert.deepEqual(v.inventory.uploaded.map(e => e.listing.id), ['20000000002'], 'the W105 listing is uploaded, with no lot');
  assert.ok(v.inventory.toBuy.some(e => e.key === 'l:20000000001' && e.listed === 2), 'the E106 listing has 6, its lot covers 4');
});

test('each sale that came off a lot is listed on it, oldest first, with its seats note', () => {
  const a = lot(2, 1000, { listings: { L1: 2 }, seats: '10-11', notes: { S1: '10' } });
  const b = lot(3, 1000, { listings: { L1: 3 }, seats: '16-18', notes: { S2: '16-17' } });
  const inv = run({ purchases: [a, b], listings: [listing('L1', 0)],
    sales: [sale('S2', 3, 9000, { listingId: 'L1', soldOn: '2026-11-12' }), sale('S1', 1, 3000, { listingId: 'L1', soldOn: '2026-11-11' })] });
  const [x, y] = inv.groups[0].lots;
  assert.equal(x.seats, '10-11');
  assert.deepEqual(x.sales.map(e => [e.sale.id, e.qty, e.note]), [['S1', 1, '10'], ['S2', 1, '']]);
  assert.deepEqual(y.sales.map(e => [e.sale.id, e.qty, e.note]), [['S2', 2, '16-17']]);
  assert.equal(x.payoutL, 3000 + 3000, 'each sale pays what it paid a ticket');
});

test('tickets sold outside viagogo count as sold, with their money', () => {
  const p = lot(10, 1000, { listings: { L1: 4 }, other: [{ id: 'o1', qty: 5, price: 20, currency: 'USD', on: '2026-11-12', where: 'cash', seats: '15-19' }, { id: 'o2', qty: 1 }] });
  const inv = run({ purchases: [p], listings: [listing('L1', 4)] });
  const x = inv.groups[0].lots[0];
  assert.deepEqual([x.sold, x.elsewhere, x.listed, x.free, x.inHand, x.noPrice], [6, 6, 4, 0, 4, 1]);
  assert.equal(x.payoutL, 5 * 2000);
  assert.equal(placedOf(p), 10);
  assert.equal(inv.groups[0].total.elsewhere, 6);
});

test('once the event is over, what did not sell is unsold: not in hand, not at risk but lost', () => {
  const past = Object.assign({}, ev, { time: Date.parse('2026-11-12T20:00:00') });
  const p = lot(10, 1000, { listings: { L1: 4 } });
  const inv = lotsOf({ events: [past], purchases: [p], listings: [listing('L1', 4, { time: past.time })], sales: [], lekOf, isPaid, now: NOW });
  const g = inv.groups[0];
  assert.deepEqual([g.total.unsold, g.total.inHand, g.total.listed, g.total.free], [10, 0, 0, 0]);
  assert.equal(g.total.toGoL, 10000);
  assert.equal(g.total.toGoEachL, 0);
  /* sold them for cash after all: the lot is done */
  const q = lot(10, 1000, { other: [{ id: 'o', qty: 10, price: 1500, currency: 'ALL' }] });
  const t = lotsOf({ events: [past], purchases: [q], listings: [], sales: [], lekOf, isPaid, now: NOW }).groups[0].total;
  assert.deepEqual([t.sold, t.unsold, t.inHand], [10, 0, 0]);
  assert.equal(t.netL, 5000);
});

test('added up: a finished event\'s loss is lost, not spread over another event\'s tickets', () => {
  const t = sumOf([
    { inHand: 4, toGoL: 0, riskL: 12000, lostL: 0, payoutL: 0, spentL: 12000 },
    { inHand: 0, riskL: 0, lostL: 2000, payoutL: 28000, spentL: 30000 }
  ]);
  assert.deepEqual([t.riskL, t.lostL, t.toGoL, t.toGoEachL], [12000, 2000, 14000, 3000]);
});

test('coverage: which lots fill a listing and a sale, and what their tickets cost', () => {
  const a = lot(3, 3000, { listings: { L1: 3 } });
  const b = lot(2, 4000, { listings: { L1: 2 } });
  const inv = run({ purchases: [a, b], listings: [listing('L1', 3)], sales: [sale('S1', 3, 9000, { listingId: 'L1' })] });
  const c = inv.cover.L1;
  assert.deepEqual(c.lots.map(x => [x.lot.id, x.qty, x.sold, x.listed]), [[a.id, 3, 3, 0], [b.id, 2, 0, 2]]);
  assert.deepEqual([c.sold, c.listed], [0, 1], 'one listed ticket has no lot');
  assert.deepEqual(inv.saleLots.S1.map(x => [x.lot.id, x.qty]), [[a.id, 3]]);
  assert.deepEqual(buyOfLots(inv.saleLots.S1), { amount: 3000, currency: 'ALL', qty: 3, unpriced: 0 });
  /* weighted over the tickets, unpriced lots left out */
  const mixed = buyOfLots([{ lot: { priceFrom: 'paid', p: { price: 3000, currency: 'ALL' }, each: 3000 }, qty: 1 },
    { lot: { priceFrom: 'paid', p: { price: 4000, currency: 'ALL' }, each: 4000 }, qty: 3 },
    { lot: { priceFrom: 'list', p: { price: 0 }, each: 2000 }, qty: 5 }]);
  assert.deepEqual(mixed, { amount: 3750, currency: 'ALL', qty: 4, unpriced: 5 });
  assert.equal(buyOfLots([]), null);
});

test('the view: a sale and a listing on a lot cost what the lot paid', () => {
  const v = buildView(demoMirror(NOW), ME, { now: NOW });
  /* 4 of its 6 tickets are p1's: the lot's price for those, the section's for the other 2 */
  const l = v.listings.find(x => x.id === '20000000001');
  assert.equal(l.buy.source, 'your lot for 4, section price for 2');
  assert.equal(l.buy.fromLots, 4);
  const r1 = v.requests.find(r => r.id === 'r1');
  assert.equal(r1.profit.total, l.money.total, 'its request shows the same money');
  const s = v.sales.find(x => x.id === '1460021001');
  assert.match(s.buy.source, /your lot/);
  assert.equal(s.money.missing, null);
});

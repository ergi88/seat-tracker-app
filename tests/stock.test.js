/* An event's stock: bought against sold and listed, per section, and the
 * money left to win back. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stockOf } from '../src/lib/stock.js';
import { buildView } from '../src/lib/model.js';
import { demoMirror, ME } from '../src/lib/demo.js';

const ev = { key: 'e1', sectors: [{ id: '1', code: 'A1', price: null }, { id: '2', code: 'B2', price: { amount: 2000, currency: 'ALL' } }] };
const lekOf = (amount, currency) => (currency === 'USD' ? amount * 100 : amount);
const isPaid = s => s.status === 'Complete';
const buy = (sectorId, qty, price) => ({ eventKey: 'e1', sectorId, qty, price, currency: 'ALL', boughtOn: '2026-11-01' });
const sale = (sectorId, tickets, payoutL, costL, status = 'Complete') => ({ eventKey: 'e1', sectorId, section: '', tickets, status,
  money: costL === null ? { missing: 'buy', payoutL } : { missing: null, payoutL, costL, profitL: payoutL - costL } });
const listing = (sectorId, tickets, payoutEachL, costEachL) => ({ eventKey: 'e1', sectorId, section: '', tickets, statusKind: 'active', currency: 'USD',
  money: { payoutL: payoutEachL, costL: costEachL, ratio: 0.9, sellRate: 100 } });

test('held = bought, or sold + listed when more; not listed is what is left of the purchases', () => {
  const st = stockOf({ ev, lekOf, isPaid,
    purchases: [buy('1', 10, 3000)], requests: [],
    sales: [sale('1', 4, 20000, 12000)], listings: [listing('1', 3, 5000, 3000)] });
  const a = st.rows[0];
  assert.deepEqual([a.held, a.sold, a.listed, a.inHand, a.unlisted, a.extra], [10, 4, 3, 6, 3, 0]);
  assert.equal(st.total.spentL, 30000);
  assert.equal(st.total.payoutL, 20000);
  assert.equal(st.total.toGoL, 10000);
  assert.equal(st.total.toGoEachL, 10000 / 6);
  assert.equal(st.total.leftCostL, 18000);
  assert.equal(st.total.ifListedL, -10000 + 15000);
  /* 1,667 L of payout each = $16.67, over the 0.9 viagogo pays out */
  assert.ok(Math.abs(st.total.ask.amount - 10000 / 6 / 100 / 0.9) < 1e-9);
  assert.equal(st.total.ask.currency, 'USD');
});

test('sold with no purchase saved still counts as bought, at the sale\'s buy price; unpaid is kept apart', () => {
  const st = stockOf({ ev, lekOf, isPaid, purchases: [], requests: [], listings: [],
    sales: [sale('1', 2, 9000, 6000), sale('1', 2, 9000, 6000, 'Get Paid')] });
  const t = st.total;
  assert.deepEqual([t.held, t.extra, t.inHand, t.unlisted], [4, 4, 0, 0]);
  assert.equal(t.spentL, 12000);
  assert.equal(t.netL, 6000);
  assert.equal(t.unpaidL, 9000);
  assert.equal(t.ask, null, 'nothing to win back');
});

test('a bought request no purchase covers adds its tickets; the price list prices them when nothing else does', () => {
  const st = stockOf({ ev, lekOf, isPaid, purchases: [], sales: [], listings: [],
    requests: [{ eventKey: 'e1', sec: '2', code: 'B2', qty: 4, purchased: 1, bought: true, buy: null }, { eventKey: 'e1', sec: '2', qty: 2, bought: false }] });
  const b = st.rows[0];
  assert.equal(b.code, 'B2');
  assert.deepEqual([b.held, b.unlisted, b.each, b.spentL, b.unpriced], [3, 3, 2000, 6000, 0]);
});

test('no price anywhere: the tickets are counted, the money left out and flagged', () => {
  const st = stockOf({ ev, lekOf, isPaid, requests: [], listings: [], purchases: [buy('1', 2, 0)], sales: [sale('1', 1, 5000, null)] });
  assert.equal(st.total.unpriced, 2);
  assert.equal(st.total.spentL, 0);
  assert.equal(stockOf({ ev, lekOf, isPaid, purchases: [], requests: [], listings: [], sales: [] }), null, 'nothing held: no card');
});

test('the demo event: every sale and listing is counted in its section', () => {
  const v = buildView(demoMirror(Date.now()), ME, {});
  const st = v.events.find(e => e.key === 'ebileta:2160').stock;
  assert.equal(st.total.sold, v.sales.filter(s => s.eventKey === 'ebileta:2160').reduce((n, s) => n + s.tickets, 0));
  assert.equal(st.total.listed, 8);
  assert.deepEqual(st.rows.map(r => r.code).sort(), ['E105', 'E106', 'W105']);
});

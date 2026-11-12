/* viagogo's last sales on the map: the period, tickets per section, the
 * sections the drawing has no place for, and one section's figures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inPeriod, bySection, offMap, stats, saleCode } from '../src/lib/sold.js';

const NOW = new Date(2026, 10, 11, 15, 0).getTime();
const h = 3600000;
const sale = (section, tickets, price, ago, code) => ({ section, code: code || '', tickets, price, currency: 'USD', firstSeen: NOW - ago });
const list = [sale('E106', 2, 80, 1 * h), sale('E 106', 1, 45, 20 * h), sale('Tribuna VIP', 4, 400, 3 * 86400000), sale('Lower 105', 2, 100, 9 * 86400000, 'E105')];

test('the period: today from midnight, 7 days back, or all', () => {
  assert.equal(inPeriod(list, 'today', NOW).length, 1);
  assert.equal(inPeriod(list, 'week', NOW).length, 3);
  assert.equal(inPeriod(list, 'all', NOW).length, 4);
});

test('tickets per section, codes compared without spaces; the tracked code wins', () => {
  assert.deepEqual(bySection(list), { E106: { tickets: 3, sales: 2 }, TRIBUNAVIP: { tickets: 4, sales: 1 }, E105: { tickets: 2, sales: 1 } });
  assert.equal(saleCode(list[3]), 'E105');
});

test('sold where the drawing has no section', () => {
  const venue = { sections: [{ code: 'E106' }, { code: 'E105' }] };
  assert.deepEqual(offMap(list, venue).map(s => s.section), ['Tribuna VIP']);
  assert.deepEqual(offMap(list, null), []);
});

test('one section: tickets, sales, per-ticket low / average / high, the newest', () => {
  const st = stats(list.slice(0, 2));
  assert.equal(st.tickets, 3);
  assert.equal(st.sales, 2);
  assert.deepEqual(st.each.USD, { min: 40, avg: 125 / 3, max: 45 });
  assert.equal(st.last, NOW - h);
  assert.deepEqual(stats([]), { tickets: 0, sales: 0, each: {}, last: 0 });
});

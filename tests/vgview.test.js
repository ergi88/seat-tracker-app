/* A saved viagogo event scan in the app: the drawer's filters over it, and
 * what changed between the two saved scans. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildView } from '../src/lib/model.js';
import { demoMirror, demoVgScans, ME } from '../src/lib/demo.js';
import { listingsOf, changesOf, standKey } from '../src/lib/vgview.js';
import { SK } from '../src/lib/sk.js';

const NOW = new Date(2026, 10, 12, 14, 0).getTime();
const v = buildView(demoMirror(NOW), ME, { now: NOW });
const ev = v.events.find(e => e.key === 'ebileta:2160');
const [newer, older] = demoVgScans(NOW).filter(x => x.eventId === '161613530');

test('saved scans: one entry per viagogo event, newest first, on its tracked event too', () => {
  assert.deepEqual(v.vgEvents.map(g => [g.vgEventId, g.scans.length]), [['161613530', 2], ['161600003', 1]]);
  assert.equal(ev.vgScans.vgEventId, '161613530');
  assert.equal(ev.vgScans.latest.at, newer.at);
  assert.equal(v.vgEvents[0].latest.rows, null, 'the list syncs without the rows');
});

test('listings: the drawer\'s totals, then each filter narrows them', () => {
  const all = listingsOf(newer, { layout: 'sections' }, { ev });
  assert.equal(all.totals.listings, newer.rows.filter(r => !r.sold && r.price > 0).length);
  assert.equal(all.totals.ownListings, 2);
  assert.ok(all.standsOn, 'Air Albania codes on an eBileta event: stand chips');

  const mine = listingsOf(newer, { layout: 'sections', onlyMine: true }, { ev });
  assert.deepEqual(mine.sections.map(s => s.label).sort(), ['E106', 'W105']);

  const east = listingsOf(newer, { layout: 'sections', stands: ['E'] }, { ev });
  assert.ok(east.sections.length && east.sections.every(s => standKey(s.label) === 'E'));

  const found = listingsOf(newer, { layout: 'sections', q: 'e10' }, { ev });
  assert.ok(found.sections.every(s => /E10/.test(s.label)));
  assert.equal(listingsOf(newer, { layout: 'sections', q: '20000000001' }, { ev }).sections[0].label, 'E106', 'a listing ID finds its section');

  const instant = listingsOf(newer, { layout: 'sections', instant: true }, { ev, bought: new Set(['20000000001']) });
  assert.ok(instant.totals.listings < all.totals.listings && instant.all.listings === all.totals.listings);
  assert.ok(Object.values(SK.market.storeOf(newer).sections).some(s => s.label === 'E106'));
  assert.ok(instant.sections.some(s => s.label === 'E106'), 'yours whose request is Bought counts as in hand');
});

test('by price: cheapest first, tickets and sector price narrow it', () => {
  const any = listingsOf(newer, { layout: 'price' }, { ev });
  assert.ok(any.found.every((r, i) => !i || any.found[i - 1].price <= r.price));
  const single = listingsOf(newer, { layout: 'price', qty: 'single' }, { ev });
  assert.ok(single.found.length && single.found.every(r => r.qtyMax === 1));
  const ten = listingsOf(newer, { layout: 'price', qty: 'over10' }, { ev });
  assert.ok(ten.found.every(r => r.qtyMax > 10));
  assert.ok(any.groups.length > 1, 'sector prices from the event\'s price list');
  const g = any.groups.find(x => x.amount > 0);
  const at = listingsOf(newer, { layout: 'price', price: g.amount }, { ev });
  assert.ok(at.group && at.found.every(r => g.sections.some(s => s.key === r.sectionKey)));
  assert.equal(listingsOf(newer, { layout: 'price' }, { ev: null }).groups.length, 0, 'no tracked event, no sector prices');
});

test('changes: the older scan to the newer, by kind, only sections that changed', () => {
  const d = changesOf(older, newer, { kind: 'all', onlyChanged: true }, { ev });
  assert.equal(d.counts.all, d.changes.length);
  assert.ok(d.counts.new === 5 && d.counts.gone > 0 && d.counts.down > 0);
  const gone = changesOf(older, newer, { kind: 'gone' }, { ev });
  assert.ok(gone.shown.length && gone.shown.every(s => gone.changesIn(s.key).every(c => c.kind === 'gone')));
  const everything = changesOf(older, newer, { kind: 'all', onlyChanged: false }, { ev });
  assert.ok(everything.shown.length > d.shown.length, 'unticked, sections with no change show too');
  const mineMoved = d.changes.find(c => c.b && c.b.id === '20000000001');
  assert.equal(mineMoved.delta, -5, 'your E106 listing went from $84 to $79');
});

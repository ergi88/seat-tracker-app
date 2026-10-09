/* The stadium drawing: every Air Albania section once, matched to an event
 * by its sector codes (the real list eBileta gave on 2026-10-09). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VENUES, venueFor } from '../src/lib/venues.js';

const AIR = VENUES.find(v => v.id === 'air-albania');
/* the 60 sector codes of ebileta:2174 (EGNATIA - MIDTJYLLAND), as stored */
const REAL = ['E101', 'E102', 'E103', 'E104', 'E105', 'E106', 'E107', 'E108', 'E109', 'E201', 'E202', 'E203', 'E204', 'E205',
  'E206', 'E207', 'E208', 'E209', 'E210', 'E211', 'MEDIA', 'N101', 'N102', 'N103', 'N104', 'N105', 'N106', 'N201', 'N202',
  'N203', 'N204', 'N205', 'N206', 'N207', 'S101', 'S102', 'S103', 'S104', 'S201', 'S202', 'S203', 'S204', 'S205', 'SKYBOX',
  'TETRAPLEGJIK N', 'TETRAPLEGJIK S', 'TETRAPLEGJIK V', 'V VIP', 'V101', 'V102', 'V103', 'V201', 'V202', 'W101', 'W102',
  'W103', 'W104', 'W105', 'W106', 'W107'];
const event = codes => ({ sectors: codes.map((code, i) => ({ id: String(i), code })) });

test('every section of the stadium drawn exactly once', () => {
  const codes = AIR.sections.map(s => s.code);
  assert.equal(codes.length, 54);
  assert.equal(new Set(codes).size, 54);
});

test('every real sector is either drawn or listed under the map', () => {
  const placed = new Set([...AIR.sections.map(s => s.code), ...AIR.offMap]);
  assert.deepEqual(REAL.filter(c => !placed.has(c)), []);
});

test('an event is at Air Albania when its sectors say so, whatever its title', () => {
  assert.equal(venueFor(event(REAL)), AIR);
  assert.equal(venueFor(event(['A', 'B', 'C'])), null);                         // Posttick blocks
  assert.equal(venueFor(event(['E101', 'E102', 'W105'])), null);                // a few look-alikes are not a stadium
  assert.equal(venueFor({ sectors: [] }), null);
});

test('mirrored corners sit on the other side of the halfway line', () => {
  const at = code => AIR.sections.find(s => s.code === code);
  const cx = s => (s.shape === 'rect' ? s.x + s.w / 2 : s.label.x);
  for (const [west, east] of [['E203', 'E209'], ['E102', 'E108'], ['W102', 'W106'], ['E202', 'E210'], ['N206', 'S202']]) {
    assert.ok(Math.abs(cx(at(west)) + cx(at(east)) - 1352) < 1, `${west} / ${east}`);
  }
});

/* Max Amini on Posttick (both dates): the 11 blocks as stored, code = short name */
const KONG = VENUES.find(v => v.id === 'kongreseve');
const MAX = ['A3', 'A2', 'A5', 'A4', 'B', 'D1', 'D2', 'C', 'A1', 'A6', 'D3'];

test('Pallati i Kongreseve: every Max Amini block drawn exactly once', () => {
  const codes = KONG.sections.map(s => s.code).sort();
  assert.deepEqual(codes, [...MAX].sort());
});

test('a venue only matches its own ticket site', () => {
  assert.equal(venueFor(Object.assign(event(MAX), { site: 'posttick' })), KONG);
  assert.equal(venueFor(Object.assign(event(MAX), { site: 'ebileta' })), null);          // an "A1" elsewhere is another hall
  assert.equal(venueFor(Object.assign(event(REAL), { site: 'ebileta-ks' })), null);       // Kosovo plays at Fadil Vokrri
  assert.equal(venueFor(Object.assign(event(REAL), { site: 'ebileta' })), AIR);
});

/* Senidah on eFinity, as stored on 2026-10-09 */
const SEN = VENUES.find(v => v.id === 'senidah-arena');
const SENIDAH = ['A TRIBINE', 'B TRIBINE', 'C TRIBINE', 'D TRIBINE', 'E TRIBINE', 'F DOLE', 'F TRIBINE', 'G TRIBINE', 'H TRIBINE',
  'I TRIBINE', 'J TRIBINE', 'K TRIBINE', 'PARTER', 'FAN PIT DESNO', 'FAN PIT LEVO', 'Bar Table',
  ...Array.from({ length: 125 }, (_, i) => 'BARSKI STO ' + (i + 1))];

test('Senidah: every sector is drawn, or is a table inside the Bar Table grid', () => {
  const drawn = new Set(SEN.sections.map(s => s.code));
  assert.deepEqual(SENIDAH.filter(c => !drawn.has(c) && !SEN.covered.test(c)), []);
  assert.equal(venueFor(Object.assign(event(SENIDAH), { site: 'efinity' })), SEN);
});

test('the bar-table grid numbers 1..125 like viagogo: 1 to 25 along the stage, 101 at the back left', () => {
  const g = SEN.sections.find(s => s.shape === 'grid');
  const all = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) all.push(g.table(r, c));
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 125 }, (_, i) => i + 1));
  assert.equal(g.table(0, 0), 101);
  assert.equal(g.table(4, 0), 1);
  assert.equal(g.table(4, 24), 25);
});

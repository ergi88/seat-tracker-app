/* Pulling only what changed, the extension's way. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pull } from '../src/lib/sync.js';

function fakeDb(tables, status) {
  const calls = [];
  return {
    calls,
    status,
    rpc: async () => Object.assign({ member: true, now: new Date().toISOString() }, status),
    async select(table, cols, filter, extra) {
      calls.push({ table, filter, extra });
      let rows = tables[table] || [];
      if (filter && filter.gt) rows = rows.filter(r => r[filter.gt[0]] > filter.gt[1]);
      return rows;
    }
  };
}

const ev = (key, num, at) => ({ key, num, site: 'ebileta', site_id: key.split(':')[1], title: 't' + num, sectors: [], extra: {}, cats: {}, updated_at: at });

test('first pull is full; a second with nothing changed fetches only devices', async () => {
  const tables = { events: [ev('ebileta:1', 1, '2026-10-01T00:00:00Z')], requests: [], devices: [], members: [], alerts: [] };
  const status = { events: '2026-10-01T00:00:00Z|1', requests: '|0', alerts: 0 };
  const db = fakeDb(tables, status);
  const a = await pull(db, null, 'me');
  assert.equal(Object.keys(a.mirror.events).length, 1);
  db.calls.length = 0;
  const b = await pull(db, a.mirror, 'me');
  assert.deepEqual(db.calls.map(c => c.table), ['devices']);
  assert.equal(b.changed, false);
});

test('a moved fingerprint fetches only the newer rows', async () => {
  const tables = { events: [ev('ebileta:1', 1, '2026-10-01T00:00:00Z')], devices: [], members: [], alerts: [] };
  const db = fakeDb(tables, { events: '2026-10-01T00:00:00Z|1', alerts: 0 });
  const a = await pull(db, null, 'me');
  tables.events.push(ev('ebileta:2', 2, '2026-10-02T00:00:00Z'));
  db.status.events = '2026-10-02T00:00:00Z|2';
  db.calls.length = 0;
  const b = await pull(db, a.mirror, 'me');
  const call = db.calls.find(c => c.table === 'events');
  assert.deepEqual(call.filter, { gt: ['updated_at', '2026-10-01T00:00:00Z'] });
  assert.deepEqual(Object.keys(b.mirror.events).sort(), ['ebileta:1', 'ebileta:2']);
});

test('fewer rows than before (a delete) reloads the table whole', async () => {
  const tables = { events: [ev('ebileta:1', 1, '2026-10-01T00:00:00Z'), ev('ebileta:2', 2, '2026-10-02T00:00:00Z')], devices: [], members: [], alerts: [] };
  const db = fakeDb(tables, { events: '2026-10-02T00:00:00Z|2', alerts: 0 });
  const a = await pull(db, null, 'me');
  tables.events.shift();
  db.status.events = '2026-10-02T00:00:00Z|1';
  const b = await pull(db, a.mirror, 'me');
  assert.deepEqual(Object.keys(b.mirror.events), ['ebileta:2']);
});

test('new alerts are reported once, and only after the first pull', async () => {
  const tables = { devices: [], members: [], alerts: [{ id: 5, user_id: 'me', type: 'low', title: 'Running low', message: 'x', created_at: '2026-10-01T00:00:00Z' }] };
  const db = fakeDb(tables, { alerts: 5 });
  const a = await pull(db, null, 'me');
  assert.equal(a.newAlerts.length, 0);
  tables.alerts.unshift({ id: 6, user_id: 'me', type: 'gone', title: 'No longer fillable', message: 'y', created_at: '2026-10-01T01:00:00Z' });
  db.status.alerts = 6;
  const b = await pull(db, a.mirror, 'me');
  assert.deepEqual(b.newAlerts.map(x => x.id), [6]);
  const c = await pull(db, b.mirror, 'me');
  assert.equal(c.newAlerts.length, 0);
});

test('an account that is not on the team is told so', async () => {
  const db = fakeDb({}, {});
  db.rpc = async () => ({ member: false });
  await assert.rejects(pull(db, null, 'me'), e => e.notMember === true);
});

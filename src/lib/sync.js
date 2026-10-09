/* ------------------------------------------------------------------
 * Pulling the team's data, the way the extension does it.
 *
 * sync_status() returns one fingerprint per table ("max(updated_at)|count").
 * Only the tables whose fingerprint moved are fetched, and only their newer
 * rows when that is safe; every 20th pull is a full reload. Devices,
 * members and this person's alerts come along, because they are small.
 *
 * Pure apart from the network: it takes the old mirror and returns a new
 * one, so it can be tested without a browser.
 * ------------------------------------------------------------------ */
import { SPECS, emptyMirror, prune, toAlert, toDevice } from './shapes.js';

const splitFp = fp => {
  const s = String(fp || '');
  const i = s.lastIndexOf('|');
  return { max: i > 0 ? s.slice(0, i) : '', count: Number(s.slice(i + 1)) || 0 };
};

const ALERTS_KEPT = 100;
let pulls = 0;

export class NotMemberError extends Error {
  constructor() {
    super('This account is not on the Seat Tracker team. Ask whoever runs the team database to add your email to the members list.');
    this.notMember = true;
  }
}

/* db: { rpc(name), select(table, columns, { gt: [column, value] } | null, extra) }
 * -> { mirror, changed, newAlerts } */
export async function pull(db, old, meId, opts = {}) {
  const status = await db.rpc('sync_status');
  if (!status || status.member !== true) throw new NotMemberError();

  const prev = old && old.fingerprints ? old : null;
  const before = (prev && prev.fingerprints) || {};
  const full = !!opts.full || !prev || (++pulls % 20 === 0);

  const jobs = [];
  for (const spec of SPECS) {
    const now = status[spec.name];
    if (spec.optional && now === undefined) continue;
    if (!full && before[spec.name] === now) continue;
    const a = splitFp(before[spec.name]);
    const b = splitFp(now);
    const incremental = !full && spec.ts && a.max && before[spec.name] !== undefined && b.count >= a.count;
    jobs.push(db.select(spec.table, spec.select || '*', incremental ? { gt: [spec.ts, a.max] } : null)
      .then(rows => ({ spec, rows: rows || [], incremental })));
  }
  if (full || before.profiles !== status.profiles) {
    jobs.push(db.select('members', 'user_id,email', null).then(rows => ({ members: rows || [] })));
  }
  /* small, and "is a PC online" depends on it: every pull */
  jobs.push(db.select('devices', '*', null).then(rows => ({ devices: rows || [] })));

  const lastAlert = prev && prev.alerts && prev.alerts.length ? prev.alerts[0].id : 0;
  const alertsNow = Number(status.alerts) || 0;
  if (meId && (full || alertsNow !== lastAlert)) {
    jobs.push(db.select('alerts', '*', null, { eq: ['user_id', meId], order: ['id', false], limit: ALERTS_KEPT })
      .then(rows => ({ alerts: rows || [] })));
  }

  const results = await Promise.all(jobs);
  const m = Object.assign(emptyMirror(), prev ? structuredClone(prev) : {});
  let newAlerts = [];
  let changed = false;
  for (const r of results) {
    if (r.members) { m.members = r.members.map(x => ({ userId: x.user_id, email: x.email })); continue; }
    if (r.devices) { m.devices = r.devices.map(toDevice); continue; }
    if (r.alerts) {
      const list = r.alerts.map(toAlert);
      if (prev) newAlerts = list.filter(a => a.id > lastAlert);
      m.alerts = list;
      changed = changed || list.length !== (prev ? prev.alerts.length : 0) || newAlerts.length > 0;
      continue;
    }
    changed = true;
    if (r.spec.replace) { r.spec.replace(m, r.rows); continue; }
    if (!r.incremental) r.spec.clear(m);
    for (const row of r.rows) r.spec.put(m, row);
  }
  prune(m);
  const fingerprints = {};
  for (const spec of SPECS) fingerprints[spec.name] = status[spec.name];
  m.fingerprints = fingerprints;
  m.serverOffset = Date.parse(status.now) - Date.now();
  m.pulledAt = Date.now();
  return { mirror: m, changed: changed || !prev, newAlerts };
}

/* the db object pull() needs, over supabase-js */
export function supaDb(supa, must) {
  return {
    rpc: name => must(supa.rpc(name)),
    select(table, columns, filter, extra) {
      let q = supa.from(table).select(columns);
      if (filter && filter.gt) q = q.gt(filter.gt[0], filter.gt[1]);
      if (extra && extra.eq) q = q.eq(extra.eq[0], extra.eq[1]);
      if (extra && extra.order) q = q.order(extra.order[0], { ascending: extra.order[1] });
      if (extra && extra.limit) q = q.limit(extra.limit);
      return must(q);
    }
  };
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { normalizeBattleLog, createBattleLog, undoBattleLog } from '../src/battle-logging.js';
import { logRaidApi, undoRaidLogApi, raidActivityForUser } from '../src/index.js';

const sql = new DatabaseSync(':memory:');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = read('../schema.sql');
const migration = read('../migrations/0002_battle_logging.sql');
sql.exec(schema);
sql.exec(migration); // Idempotent on a fresh schema, including triggers/view.
const token = 'local-test-only';
sql.prepare(`INSERT INTO users(id,manage_hash,feed_hash,included_sources,created_at,updated_at)
  VALUES(?,?,?,?,?,?)`).run('user', createHash('sha256').update(token).digest('hex'), 'unused', '[]', 'now', 'now');
sql.prepare(`INSERT INTO users(id,manage_hash,feed_hash,included_sources,created_at,updated_at)
  VALUES(?,?,?,?,?,?)`).run('other', 'other', 'other', '[]', 'now', 'now');
sql.exec(`INSERT INTO targets(id,user_id,pokemon_name,target_type,current_value,expected_progress_per_raid,created_at,updated_at)
  VALUES('target','user','Gengar','candy',10,3,'now','now');
  INSERT INTO battle_resource_state VALUES('user',1500,'now');`);
const db = {
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
  prepare(query) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() { const result = sql.prepare(query).run(...args); return {meta: {changes: Number(result.changes)}}; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return {results: sql.prepare(query).all(...args)}; }
    };
  }
};
const env = { DB: db };
const target = () => sql.prepare('SELECT * FROM targets WHERE id = ?').get('target');
const held = () => sql.prepare('SELECT max_particles_held AS n FROM battle_resource_state WHERE user_id = ?').get('user').n;
const usage = (table, col, date = '2026-09-17') => sql.prepare(`SELECT ${col} AS n FROM ${table} WHERE user_id = ? AND local_date = ?`).get('user', date)?.n || 0;
sql.exec(`INSERT INTO targets(id,user_id,pokemon_name,target_type,battle_kind,current_value,created_at,updated_at)
  VALUES('dyn','user','Dynamax Gengar','candy','dynamax',0,'now','now'),
        ('gmax','user','Gigantamax Gengar','candy','gigantamax',0,'now','now');`);
const maxTarget = id => sql.prepare('SELECT * FROM targets WHERE id = ?').get(id);
let seq = 0;
const log = async (body, date = '2026-09-17') => createBattleLog(db, 'user', date, '2026-09-17T00:00:00Z', `test-${++seq}`, normalizeBattleLog({pokemon_name:'Gengar', raid_type:'local', raid_count:1, ...body}, sql.prepare('SELECT * FROM targets').all()));
const snapshot = () => JSON.stringify(['targets','battle_resource_state','battle_resource_daily','remote_raid_usage','battle_log','raid_log']
  .map(table => sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
const request = body => new Request('http://localhost/api/battle-log', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({token,...body})});

// Local and Remote Raids retain the old request contract and editable progress.
const local = await log({raid_count:3, progress_gained:7});
assert.equal(target().current_value,17);
assert.equal(usage('remote_raid_usage','raids_used'),0);
assert.equal(held(),1500);
const remote = await log({raid_type:'remote', raid_count:2, progress_gained:5});
assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(target().current_value,22);

// Local Max and Remote Max use the same MP price. Separate usage, shared pass spending.
const localMax = await log({battle_system:'max',battle_variant:'dynamax',max_particle_cost:250,raid_count:2,progress_gained:9});
assert.equal(held(),1000);
assert.equal(usage('remote_raid_usage','raids_used'),2);
const remoteMax = await log({battle_system:'max',battle_variant:'gigantamax',raid_type:'remote',max_particle_cost:800,progress_gained:4});
assert.equal(held(),200);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),1);
assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(usage('battle_resource_daily','max_particles_collected'),0);
assert.equal(target().current_value,22);
assert.equal(maxTarget('dyn').current_value,9);
assert.equal(maxTarget('gmax').current_value,4);

// Unknown/invalid cost, variant/form mismatch and invalid counts cause no writes.
const beforeInvalid = snapshot();
for (const body of [
  {battle_system:'max',battle_variant:'dynamax'},
  {battle_system:'max',battle_variant:'dynamax',max_particle_cost:''},
  {battle_system:'max',battle_variant:'dynamax',max_particle_cost:-1},
  {battle_system:'max',battle_variant:'dynamax',max_particle_cost:true},
  {battle_system:'max'}, {battle_system:'raid',battle_variant:'gigantamax'},
  {pokemon_name:'Gigantamax Gengar',battle_system:'max',battle_variant:'dynamax',max_particle_cost:800},
  {raid_count:0}, {raid_count:1.5}, {raid_count:100},
  {progress_gained:-1}, {target_id:'missing'}, {pokemon_name:'Mewtwo',target_id:'target'}
]) {
  await assert.rejects(() => log(body));
}
assert.equal(snapshot(),beforeInvalid);
await assert.rejects(() => log({battle_system:'max',battle_variant:'dynamax',max_particle_cost:250}), /Not enough recorded/);
assert.equal(snapshot(),beforeInvalid);

// Failed attempts spend no MP, but passes can be consumed; retries can reuse passes.
const failed = await log({battle_system:'max',battle_variant:'dynamax',raid_type:'remote',raid_count:3,wins:0,remote_passes_used:1,progress_gained:0});
assert.equal(held(),200);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);
const retry = await log({battle_system:'max',battle_variant:'dynamax',raid_type:'remote',max_particle_cost:100,remote_passes_used:0,progress_gained:1});
assert.equal(held(),100);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);
const free = await log({battle_system:'max',battle_variant:'dynamax',max_particle_cost:0,progress_gained:0});
assert.equal(free.max_particles_spent,0);

// Out-of-order and repeated Undo must restore deltas exactly, on the original date.
await undoBattleLog(db,'user',local.id,'2026-09-18T00:00:00Z');
assert.equal(target().current_value,15);
const afterUndo = snapshot();
await Promise.all([undoBattleLog(db,'user',local.id,'later'),undoBattleLog(db,'user',local.id,'later')]);
assert.equal(snapshot(),afterUndo);
await assert.rejects(() => undoBattleLog(db,'other',remote.id,'later'), /not found/);
await undoBattleLog(db,'user',remote.id,'2026-09-18T00:00:00Z');
assert.equal(usage('remote_raid_usage','raids_used'),0);
for (const row of [failed, retry, free, localMax, remoteMax]) await undoBattleLog(db,'user',row.id,'later');
assert.equal(held(),1500);
assert.equal(target().current_value,10);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),0);

// Atomic arithmetic prevents lost updates from concurrent logs; request replay is safe.
const concurrent = await Promise.all(Array.from({length:6},() => log({raid_type:'remote',progress_gained:1})));
assert.equal(usage('remote_raid_usage','raids_used'),6);
assert.equal(target().current_value,16);
const input = normalizeBattleLog({pokemon_name:'Gengar',raid_type:'remote',raid_count:1,progress_gained:2},[target()]);
await Promise.all(Array.from({length:3},() => createBattleLog(db,'user','2026-09-17','now','same-request',input)));
assert.equal(usage('remote_raid_usage','raids_used'),7);
assert.equal(target().current_value,18);
await assert.rejects(() => createBattleLog(db,'user','2026-09-17','now','same-request',{...input,progress_gained:3}), /different log/);
assert.equal(target().current_value,18);

// A manual correction which makes reversal impossible fails the ENTIRE transaction.
const conflict = await log({battle_system:'max',battle_variant:'dynamax',raid_type:'remote',max_particle_cost:250,progress_gained:20});
sql.exec("UPDATE targets SET current_value = 1 WHERE id = 'dyn'");
const targetConflict = snapshot();
await assert.rejects(() => undoBattleLog(db,'user',conflict.id,'later'), /Nothing was undone/);
assert.equal(snapshot(),targetConflict);
sql.exec("UPDATE targets SET current_value = 20 WHERE id = 'dyn'; UPDATE battle_resource_daily SET remote_max_passes_used = 0");
const passConflict = snapshot();
await assert.rejects(() => undoBattleLog(db,'user',conflict.id,'later'), /Nothing was undone/);
assert.equal(snapshot(),passConflict);
sql.exec("UPDATE battle_resource_daily SET remote_max_passes_used = 1; UPDATE battle_resource_state SET max_particles_held = 1500");
await undoBattleLog(db,'user',conflict.id,'later');
assert.equal(held(),1750,'Undo must not lose particles by clamping to storage cap');

// Historical Raid records stay visible and Undo uses their original date and delta.
sql.exec(`INSERT INTO raid_log VALUES('legacy','user','Gengar','remote',2,6,'target',18,24,'2026-09-16','old',NULL);
  INSERT INTO remote_raid_usage VALUES('user','2026-09-16',2,'old');
  UPDATE targets SET current_value = current_value + 6 WHERE id = 'target';`);
const legacyBefore = target().current_value;
const legacyResult = await undoRaidLogApi(request({log_id:'legacy'}),env);
assert.equal(legacyResult.status,200);
assert.equal(target().current_value,legacyBefore-6);
assert.equal(usage('remote_raid_usage','raids_used','2026-09-16'),0);
assert.equal((await undoRaidLogApi(request({log_id:'legacy'}),env)).status,200);
assert.equal(target().current_value,legacyBefore-6);
const beforeRerun = snapshot();
sql.exec(migration);
assert.equal(snapshot(),beforeRerun,'Migration rerun must not replay activity');

// A failed historical Undo rolls back the import as well as every resource effect.
sql.exec(`INSERT INTO raid_log VALUES('legacy-conflict','user','Gengar','remote',99,6,'target',18,24,'2026-09-16','old',NULL)`);
const legacyConflict = snapshot();
assert.equal((await undoRaidLogApi(request({log_id:'legacy-conflict'}),env)).status,409);
assert.equal(snapshot(),legacyConflict);

// The additive migration does not attach triggers to the old logger's table.
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='trigger' AND tbl_name='raid_log'").get().n,0);

// API auth, compatibility, both paths' payloads, no-target logs and activity/form safety.
assert.equal((await logRaidApi(request({token:'invalid'}),env)).status,401);
assert.equal((await logRaidApi(request({pokemon_name:'Gengar',raid_type:'local',raid_count:2,progress_gained:3}),env)).status,200);
const apiMax = await logRaidApi(request({pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax',participation:'remote',battle_count:1,max_particle_cost:800,update_target:false,request_id:'api-max-123456789'}),env);
assert.equal(apiMax.status,200);
assert.equal((await apiMax.json()).target_updated,false);
const activity = await raidActivityForUser(env,{id:'user',timezone:'Asia/Singapore'},[{pokemon_name:'Gengar',sprite_url:'wrong-base.png'}]);
assert.equal(activity.recent.find(r => r.id === 'api-max-123456789').sprite_url,null);
assert.equal(activity.migration_ready,true);
assert.equal(activity.recent.length,8);
const apiUndo = await undoRaidLogApi(request({log_id:'api-max-123456789',log_source:'battle'}),env);
assert.equal(apiUndo.status,200);
assert.equal((await undoRaidLogApi(request({log_id:'missing'}),env)).status,404);

// Deleted target never turns Undo into a partial resource refund.
const deleted = await log({progress_gained:1});
sql.exec("DELETE FROM targets WHERE id='target'");
const deletedSnapshot = snapshot();
await assert.rejects(() => undoBattleLog(db,'user',deleted.id,'later'),/Nothing was undone/);
assert.equal(snapshot(),deletedSnapshot);

// Old databases still display Raid activity; mutation fails with actionable migration error.
sql.exec('DROP VIEW unified_battle_log; DROP TABLE battle_log;');
const legacyActivity = await raidActivityForUser(env,{id:'user',timezone:'Asia/Singapore'},[]);
assert.equal(legacyActivity.migration_ready,false);
assert.ok(legacyActivity.recent.some(row => row.id === 'legacy-conflict'));
assert.equal((await logRaidApi(request({pokemon_name:'Gengar',raid_type:'local',raid_count:1}),env)).status,503);
assert.equal((await undoRaidLogApi(request({log_id:'legacy-conflict'}),env)).status,503);
sql.close();
console.log('Unified battle logging: SQL transactions, API, resources, progress, concurrency and Undo passed');

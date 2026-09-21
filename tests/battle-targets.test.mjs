import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {battleSpriteUrl,currentMaxBattleTiersFromPayload,maxBattleCostOverrideKey,updateMaxBattleCostOverrideApi,upsertTarget,findMatches,targetOptionsForUser,targetSpriteUrl,recommendationsForDate} from '../src/index.js';
import {normalizeBattleLog,createBattleLog,undoBattleLog} from '../src/battle-logging.js';
import {buildBattleResourcePlan} from '../src/resource-planning.js';
import {battleOpportunityMetadata} from '../src/battle-opportunities.js';
const T = globalThis.BattleTargets;
assert.deepEqual(
  currentMaxBattleTiersFromPayload({
    currentList: {
      tier_1: [{names:{English:'Rhyhorn'}}],
      tier_5: [
        {names:{English:'Articuno'}},
        {names:{English:'Zapdos'}}
      ]
    }
  }).sort((a,b)=>a.pokemon_name.localeCompare(b.pokemon_name)),
  [
    {pokemon_name:'Articuno',max_battle_tier:5},
    {pokemon_name:'Rhyhorn',max_battle_tier:1},
    {pokemon_name:'Zapdos',max_battle_tier:5}
  ]
);
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const sql = new DatabaseSync(':memory:');
// Upgrade an old database, including a historical FK, without rebuilding IDs.
sql.exec(read('../schema.sql').replace("  battle_kind TEXT CHECK (battle_kind IN ('raid', 'dynamax', 'gigantamax')),\n",''));
const token='targets-test-only';
sql.prepare('INSERT INTO users(id,manage_hash,feed_hash,included_sources,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('u',createHash('sha256').update(token).digest('hex'),'unused','[]','now','now');
sql.exec("INSERT INTO targets(id,user_id,pokemon_name,target_type,current_value,created_at,updated_at) VALUES('legacy','u','Gengar','candy',10,'old','old'); CREATE TABLE historical_fk_probe(target_id TEXT REFERENCES targets(id) ON DELETE SET NULL); INSERT INTO historical_fk_probe VALUES('legacy');");
sql.exec(read('../migrations/0003_target_battle_kind.sql'));
assert.equal(sql.prepare('SELECT target_id FROM historical_fk_probe').get().target_id,'legacy');
assert.equal(sql.prepare('SELECT current_value FROM targets').get().current_value,10);
const db={prepare(query){let args=[];return {bind(...a){args=a;return this;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}};}};
const env={DB:db};
const all=()=>sql.prepare('SELECT * FROM targets').all();
const post=body=>new Request('http://localhost/api/targets',{method:'POST',body:JSON.stringify({token,...body})});
async function save(body,status=200){const r=await upsertTarget(post(body),env);const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;}
const base={pokemon_name:'Gengar',target_type:'candy',target_value:100,current_value:10,expected_progress_per_raid:3,priority:'high'};
const raid=await save(base);
assert.equal(raid.id,'legacy','Editing a legacy identity retains its ID');
const dyn=await save({...base,battle_kind:'dynamax'});
const gmax=await save({...base,battle_kind:'gigantamax'});
assert.equal(all().length,3);
assert.equal(new Set(all().map(t=>t.id)).size,3);
assert.equal(all().find(t=>t.id===dyn.id).pokemon_name,'Dynamax Gengar');
assert.equal((await save({...base,id:gmax.id,pokemon_name:'Gengar (Gigantamax)',battle_kind:'gigantamax',current_value:12})).id,gmax.id);
assert.equal(all().length,3,'Max spelling aliases update the same identity');
await save({...base,battle_kind:'gigantamax'},409);
assert.equal(all().find(t=>t.id===gmax.id).current_value,12,'Duplicate create cannot reset progress');
const counts=await save({...base,battle_kind:'gigantamax',target_type:'battles',current_value:0,target_value:2});
await save({...base,id:dyn.id,battle_kind:'raid'},409);

const editable=await save({
  pokemon_name:'Abra',
  battle_kind:'dynamax',
  target_type:'candy',
  target_value:100,
  current_value:7,
  expected_progress_per_raid:2,
  priority:'medium'
});
await save({
  id:editable.id,
  pokemon_name:'Machop',
  battle_kind:'gigantamax',
  target_type:'battles',
  target_value:5,
  current_value:2,
  expected_progress_per_raid:1,
  priority:'high'
});
const edited=all().find(t=>t.id===editable.id);
assert.equal(edited.pokemon_name,'Gigantamax Machop');
assert.equal(edited.battle_kind,'gigantamax');
assert.equal(edited.target_type,'battles');
assert.equal(edited.current_value,2);
assert.equal(editable.id,edited.id,'Identity edits keep the target ID stable for historical log/Undo links');
await save({...base,id:'foreign-user-target'},404);
await save({...base,battle_kind:'gigantamax',target_type:'mega_energy'},400);
await save({...base,pokemon_name:'Gigantamax Gengar',battle_kind:'dynamax'},400);
await save({...base,current_value:-1},400);
assert.equal((await upsertTarget(post({...base,token:'invalid'}),env)).status,401);
const metas=[{pokemon_name:'Gengar',overall_score:85,sprite_url:'base.png'},{pokemon_name:'Mega Gengar',overall_score:85},{pokemon_name:'Gigantamax Gengar',overall_score:85,sprite_url:'gmax.png'}];
const event={summary:'Gigantamax Gengar',source_type:'max_battles'};
assert.equal(findMatches(event.summary,all(),metas,event)[0].target.id,counts.id);
assert.equal(findMatches('Gengar',all(),metas,{source_type:'raid_battles'})[0].target.id,raid.id);
assert.equal(findMatches('Dynamax Gengar',all(),metas,{source_type:'max_battles',summary:'Dynamax Gengar'})[0].target.id,dyn.id);
assert.equal(findMatches('Mega Gengar',all(),metas,{source_type:'raid_battles'})[0].target,null,'No base target transferred to Mega');
assert.equal(T.matches({pokemon_name:'Alolan Raichu',battle_kind:'dynamax'},{pokemon_name:'Raichu',battle_system:'max',battle_variant:'dynamax'}),false);
assert.equal(T.matches(all()[0],{pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax'}),false);
assert.equal(T.kind({pokemon_name:'Gigantamax Gengar',battle_kind:null}),'gigantamax');
assert.equal(targetSpriteUrl({pokemon_name:'Gigantamax Gengar',battle_kind:'gigantamax'},metas.slice(0,1)),null);
assert.equal(targetSpriteUrl({pokemon_name:'Gigantamax Gengar',battle_kind:'gigantamax'},metas),'gmax.png');

const dynamaxSpriteMetas=[
  {pokemon_name:'Moltres',sprite_url:'moltres.png'},
  {pokemon_name:'Zapdos',sprite_url:'zapdos.png'},
  {pokemon_name:'Raichu',sprite_url:'raichu.png'},
  {pokemon_name:'Alolan Raichu',sprite_url:'alolan-raichu.png'},
  {pokemon_name:'Gengar',sprite_url:'gengar.png'}
];
assert.equal(
  targetSpriteUrl({pokemon_name:'Dynamax Moltres',battle_kind:'dynamax'},dynamaxSpriteMetas),
  'moltres.png',
  'Ordinary Dynamax targets reuse the exact underlying species sprite'
);
assert.equal(
  battleSpriteUrl({pokemon_name:'Dynamax Zapdos',battle_system:'max',battle_variant:'dynamax'},dynamaxSpriteMetas),
  'zapdos.png',
  'Forecast/recommendation Max identity uses the same ordinary Dynamax fallback'
);
assert.equal(
  targetSpriteUrl({pokemon_name:'Dynamax Alolan Raichu',battle_kind:'dynamax'},dynamaxSpriteMetas),
  'alolan-raichu.png',
  'Dynamax fallback preserves regional form identity'
);
assert.notEqual(
  targetSpriteUrl({pokemon_name:'Dynamax Alolan Raichu',battle_kind:'dynamax'},dynamaxSpriteMetas),
  'raichu.png',
  'Dynamax regional forms never fall back to a different base form'
);
assert.equal(
  battleSpriteUrl({pokemon_name:'Gigantamax Gengar',battle_system:'max',battle_variant:'gigantamax'},dynamaxSpriteMetas),
  null,
  'Gigantamax remains exact-only when only the ordinary sprite exists'
);
assert.equal(
  battleSpriteUrl({pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax'},dynamaxSpriteMetas),
  null,
  'Gigantamax stored as underlying species plus battle variant must not leak the base sprite'
);

// A battle boss must be discoverable before pokemon_meta catches up. Multi-boss
// Max feeds also inherit standard Dynamax capability consistently.
const maxFallbackPokedex=[
  {dexNr:111,names:{English:'Rhyhorn'},regionForms:{}},
  {dexNr:144,names:{English:'Articuno'},regionForms:{}},
  {dexNr:145,names:{English:'Zapdos'},regionForms:{}},
  {dexNr:146,names:{English:'Moltres'},regionForms:{}}
];
const birdsEvent={source_type:'max_battles',summary:'Articuno, Zapdos & Moltres Max Battles'};
const birdMatches=findMatches(birdsEvent.summary,[],[],birdsEvent,maxFallbackPokedex);
assert.deepEqual(birdMatches.map(match=>match.name).sort(),['Dynamax Articuno','Dynamax Moltres','Dynamax Zapdos']);
for(const match of birdMatches){
  const metadata=battleOpportunityMetadata(birdsEvent,{pokemonName:match.name});
  assert.equal(metadata.battle_variant,'dynamax');
  assert.equal(T.canonicalName(match.name,T.kind(metadata)),match.name);
}
const rhyhornEvent={source_type:'max_battles',summary:'Rhyhorn Max Battles'};
assert.equal(findMatches(rhyhornEvent.summary,[],[],rhyhornEvent,maxFallbackPokedex)[0].name,'Dynamax Rhyhorn');

// Explicit and automatic target matching update only the chosen system/goal.
sql.exec("INSERT INTO battle_resource_state VALUES('u',1500,'now')");
const input=normalizeBattleLog({pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax',participation:'remote',battle_count:2,max_particle_cost:250,target_id:gmax.id,progress_gained:7},all());
await createBattleLog(db,'u','2026-09-17','now','max-progress',input);
assert.equal(all().find(t=>t.id===gmax.id).current_value,19);
assert.equal(all().find(t=>t.id===raid.id).current_value,10);
assert.equal(all().find(t=>t.id===dyn.id).current_value,10);
assert.equal(all().find(t=>t.id===counts.id).current_value,0);
assert.throws(()=>normalizeBattleLog({...input,target_id:raid.id},all()),/battle type/);
await undoBattleLog(db,'u','max-progress','later');
assert.equal(all().find(t=>t.id===gmax.id).current_value,12);
assert.equal(sql.prepare('SELECT max_particles_held FROM battle_resource_state').get().max_particles_held,1500);
const winInput=normalizeBattleLog({pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax',participation:'local',battle_count:3,wins:2,max_particle_cost:0,target_id:counts.id},all());
assert.equal(winInput.progress_gained,2);

// Availability preserves system and variant even when species names coincide.
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const future=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
const insertEvent=sql.prepare("INSERT INTO events(id,source_type,summary,description,dtstart_line,other_lines,start_date,end_date,content_hash,updated_at) VALUES(?,?,?,'costs 250 MP','DTSTART:20260917T000000','',?,?,?,'now')");
insertEvent.run('raid','raid_battles','Gengar Raids',today,today,'1');
insertEvent.run('gmax','max_battles','Gigantamax Gengar Max Battles',today,today,'2');
insertEvent.run('dyn','max_battles','Dynamax Gengar Max Battles',future,future,'3');
const user={id:'u',timezone:'Asia/Singapore',pve_weight:1,pvp_weight:0,collector_weight:0};
insertEvent.run('rhyhorn-max','max_battles','Rhyhorn Max Battles',today,today,'4');
const rhyhornOverrideKey=maxBattleCostOverrideKey({
  pokemon_name:'Dynamax Rhyhorn',
  battle_variant:'dynamax',
  start_date:today,
  end_date:today
});
const overrideResponse=await updateMaxBattleCostOverrideApi(
  new Request('http://localhost/api/max-battle-cost-override',{
    method:'POST',
    body:JSON.stringify({
      token,
      opportunity_key:rhyhornOverrideKey,
      pokemon_name:'Dynamax Rhyhorn',
      battle_variant:'dynamax',
      start_date:today,
      end_date:today,
      max_battle_tier:1
    })
  }),
  env
);
assert.equal(overrideResponse.status,200);
assert.equal((await overrideResponse.json()).max_particle_cost,250);
const fallbackRecs=await recommendationsForDate(env,user,all(),metas,today,maxFallbackPokedex);
const rhyhornRec=fallbackRecs.find(r=>r.battle_system==='max'&&r.pokemon_name==='Dynamax Rhyhorn');
assert.ok(rhyhornRec,'Current Max boss without pokemon_meta must still render as a recommendation');
assert.equal(rhyhornRec.battle_variant,'dynamax');
assert.equal(rhyhornRec.max_particle_cost,250);
assert.equal(rhyhornRec.max_battle_tier,1);
assert.equal(rhyhornRec.max_particle_cost_confidence,'user_override');
assert.equal(rhyhornRec.max_cost_override_key,rhyhornOverrideKey);
assert.equal(rhyhornRec.max_cost_override_source,'user');
const clearOverrideResponse=await updateMaxBattleCostOverrideApi(
  new Request('http://localhost/api/max-battle-cost-override',{
    method:'POST',
    body:JSON.stringify({
      token,
      opportunity_key:rhyhornOverrideKey,
      pokemon_name:'Dynamax Rhyhorn',
      battle_variant:'dynamax',
      start_date:today,
      end_date:today,
      clear:true
    })
  }),
  env
);
assert.equal(clearOverrideResponse.status,200);
assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM max_battle_cost_overrides').get().n,0);
sql.prepare("DELETE FROM events WHERE id='rhyhorn-max'").run();
const recs=await recommendationsForDate(env,user,all(),metas,today);
assert.equal(recs.find(r=>r.battle_system==='raid').target.id,raid.id);
assert.equal(recs.find(r=>r.battle_variant==='gigantamax').target.id,counts.id);
let options=await targetOptionsForUser(env,user,all(),metas,recs);
assert.deepEqual(options.current.map(T.kind).sort(),['gigantamax','raid']);
assert.deepEqual(options.upcoming.map(T.kind),['dynamax']);
sql.prepare(`INSERT INTO event_suppression_rules (
  id,event_name,start_date,end_date,active,suppressed_source_types,updated_at
) VALUES(?,?,?,?,?,?,?)`).run('suppressed','Max replacement',today,future,1,'["max_battles"]','now');
options=await targetOptionsForUser(env,user,all(),metas,[]);
assert.deepEqual(options.current.map(T.kind),['raid']);
assert.equal(options.upcoming.length,0);
const maxRec={pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax',score:95,remote_pass_capable_by_source:true,max_particle_cost:250,target:all().find(t=>t.id===counts.id)};
const plan=buildBattleResourcePlan({recommendations:[maxRec],resourceState:{max_particles_held:1500},personalRemotePassCeiling:10,minScore:0});
assert.equal(plan.allocations[0].count,2,'Battle-count goals cap allocation by remaining wins');
const completedPlan=buildBattleResourcePlan({recommendations:[{...maxRec,target:{...maxRec.target,completed:1}}],resourceState:{max_particles_held:1500},personalRemotePassCeiling:10,minScore:0});
assert.equal(completedPlan.allocations.length,0);

// Exercise real UI filtering/rendering functions: counts honor every non-status filter.
const htmlMarkup=read('../public/manage.html');
const script=read('../public/planner-app.js');
const html=`${htmlMarkup}\n${script}`;
new vm.Script(script);
const elements=new Map();
const element=id=>{if(!elements.has(id)) elements.set(id,{value:'',textContent:'',innerHTML:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){}});return elements.get(id);};
const ui=vm.createContext({BattleTargets:T,document:{getElementById:element,querySelectorAll:()=>[]},state:{targets:[
  {...base,id:'a',battle_kind:'gigantamax',completed:0}, {...base,id:'b',battle_kind:'gigantamax',completed:0},
  {...base,id:'c',battle_kind:'gigantamax',completed:1}, {...base,id:'d',battle_kind:'raid',completed:0}
],target_options:{current:[{name:'Gengar',battle_system:'max',battle_variant:'gigantamax'}],upcoming:[{name:'Gengar',battle_system:'max',battle_variant:'dynamax'}]}},
targetFilterState:{status:'active',search:'gengar',type:'candy',battle:'gigantamax',priority:'high',availability:'now',sort:'name'},
normalizePickerName:v=>String(v).toLowerCase(),formatNumber:String,esc:String,targetById:new Map(),
syncTargetSelectionUi(){},syncTargetViewUi(){},targetCardHtml:t=>t.id});
vm.runInContext(read('../public/planner-target-logic.js'),ui);
ui.targetLogic=ui.PlannerTargetLogic.create({
  battleTargets:T,
  normalizeName:ui.normalizePickerName,
  formatNumber:ui.formatNumber
});
for(const name of ['targetAvailability','targetProgress','targetsMatchingNonStatusFilters','sortTargets','filteredTargets','activeTargetFilterCount','renderTargets']){
  const start=script.indexOf(`function ${name}(`);assert.ok(start>=0,name);
  const tail=script.slice(start);const end=tail.slice(1).search(/\n(?:async )?function /);
  vm.runInContext(tail.slice(0,end+1),ui);
}
ui.renderTargets();
assert.equal(element('targetActiveCount').textContent,'2');
assert.equal(element('targetCompletedCount').textContent,'1');
assert.equal(element('targetAllCount').textContent,'3');
ui.targetFilterState.status='completed';ui.renderTargets();
assert.equal(ui.filteredTargets().length,1);
assert.equal(element('targetActiveCount').textContent,'2');
assert.equal(ui.targetAvailability({pokemon_name:'Gengar',battle_kind:'raid'}),'not_raiding');
assert.equal(ui.targetAvailability({pokemon_name:'Dynamax Gengar',battle_kind:'dynamax'}),'upcoming');
assert.match(html,/BattleTargets\.kind\(target\) === "raid" \? raidRankingsHtml/);
assert.match(html,/id="battleLogTarget"/);
assert.match(html,/id="targetBattleFilter"/);
sql.exec('ALTER TABLE targets DROP COLUMN battle_kind;');
await save({...base,pokemon_name:'Blastoise',battle_kind:'dynamax'},503);
sql.close();
console.log('Battle Targets: migration, identity, CRUD, recommendations, availability, resources, logging/Undo and filtered counts passed');

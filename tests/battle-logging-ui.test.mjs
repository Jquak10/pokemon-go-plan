import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../public/battle-targets.js';
import { inferMaxParticleCost } from '../src/resource-planning.js';

const manage = readFileSync(new URL('../public/manage.html',import.meta.url),'utf8');
const script = [...manage.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
new vm.Script(script);
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:'',checked:true,disabled:false,textContent:'',innerHTML:'',
    dataset:{}, classList:{toggle(){},add(){},remove(){}},focus(){}});
  return elements.get(id);
}
const context = vm.createContext({
  BattleTargets:globalThis.BattleTargets, targetTypeLabels:{candy:'Candy'},
  document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},
  localStorage:{setItem(){},getItem(){return 'remote';}}, crypto:{randomUUID(){return 'test-request-id-12345';}},
  setTimeout(){},lockPageForModal(){},unlockPageForModal(){},
  normalizePickerName:value=>String(value).trim().toLowerCase(),esc:String,formatNumber:String,
  state:{targets:[{id:'t',pokemon_name:'Gigantamax Gengar',battle_kind:'gigantamax',target_type:'candy',current_value:10,expected_progress_per_raid:3}],recommendations:[],battle_resource_plan:{state:{max_particles_held:1500}}},
  raidLogType:'remote',raidLogProgressDirty:false,raidLogExplicitTargetId:null,
  battleLogRecommendation:null,battleLogRequestId:null,battleLogBusy:false,battleLogWinsDirty:false,battleLogPassesDirty:false
});
for (const name of ['raidLogMatchingTarget','raidLogPokemonNames','setRaidLogType','raidLogDefaultProgress','populateRaidLogPokemon','syncRaidLogProgressDefault','battleLogSelection','battleLogLabel','battleLogParticleCostValue','setBattleLogParticleCost','syncBattleLogParticleCostControl','prefillBattleLog','updateRaidLogPreview','openRaidLogModal']) {
  const start=script.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const remainder=script.slice(start);
  const next=remainder.slice(1).search(/\n(?:async )?function /);
  vm.runInContext(next<0?remainder:remainder.slice(0,next+1),context);
}
element('raidLogPokemon').value='Gengar';
context.openRaidLogModal('Gengar','t',{pokemon_name:'Gengar',battle_system:'max',battle_variant:'gigantamax',max_particle_cost:800,max_particle_cost_confidence:'known',logging_remote_eligible:true});
assert.equal(element('battleLogKind').value,'gigantamax');
assert.equal(element('battleLogMp').value,'800');
assert.equal(element('raidLogProgress').value,3);
assert.match(element('raidLogPreview').innerHTML,/800 MP spent/);
assert.equal(element('confirmRaidLog').disabled,false);

// Actual progress survives count/win changes; defaults use wins, not failed attempts.
context.raidLogProgressDirty=true;
element('raidLogProgress').value='17';
element('battleLogWins').value='2';
context.syncRaidLogProgressDefault();
assert.equal(element('raidLogProgress').value,'17');
context.raidLogProgressDirty=false;
context.syncRaidLogProgressDefault();
assert.equal(element('raidLogProgress').value,6);

context.openRaidLogModal('Gengar',null,{pokemon_name:'Gengar',battle_system:'max',battle_variant:'dynamax',max_particle_cost:400,max_particle_cost_confidence:'standard_tier_cost',logging_remote_eligible:false});
assert.equal(element('battleLogMp').value,'','Estimates must not silently become confirmed cost');
assert.match(element('battleLogCostHint').textContent,/suggests 400 MP/);
assert.equal(context.raidLogType,'local');
assert.equal(element('[data-raid-type="remote"]').disabled,true);
assert.equal(element('confirmRaidLog').disabled,true,'Unconfirmed standard tier must not be saved');
element('battleLogMp').value='400';
context.syncBattleLogParticleCostControl();
assert.match(element('raidLogPreview').innerHTML,/400 MP spent/);
assert.equal(element('confirmRaidLog').disabled,false,'Confirmed tier cost enables a valid Max log');
element('battleLogWins').value='0';
context.updateRaidLogPreview();
assert.equal(element('confirmRaidLog').disabled,false,'Loss with no MP consumed may be logged');
context.openRaidLogModal('Gengar',null,{pokemon_name:'Gengar',battle_system:'max',battle_variant:'dynamax',max_particle_cost:600,max_particle_cost_confidence:'known',logging_remote_eligible:true});
assert.equal(element('battleLogMp').value,'custom');
assert.equal(element('battleLogMpCustom').value,'600');
context.openRaidLogModal('Gengar');
assert.equal(element('battleLogKind').value,'raid');
assert.equal(element('[data-raid-type="remote"]').disabled,false);
assert.equal(element('confirmRaidLog').disabled,false);
context.openRaidLogModal('Gengar',null,{pokemon_name:'Gengar',battle_system:'max'});
assert.equal(element('battleLogKind').value,'max');
assert.equal(element('confirmRaidLog').disabled,true,'Unknown Max variant must be selected');

for (const text of ['Collect 1600 Max Particles during the event.', 'Rewards include 800 MP.', 'Max Particle collection limit: 1600 Max Particles.']) {
  assert.equal(inferMaxParticleCost({battle_system:'max',event_description:text}).cost,null);
}
assert.equal(inferMaxParticleCost({battle_system:'max',event_description:'This battle requires 250 Max Particles.'}).cost,250);
assert.match(manage,/<select id="battleLogMp">/);
assert.match(manage,/Tier 1 · 250 MP/);
assert.match(manage,/Tier 2–3 · 400 MP/);
assert.match(manage,/Tier 4–6 \/ Gigantamax · 800 MP/);
assert.match(manage,/max_particle_cost: battleLogParticleCostValue\(\)/);
assert.match(manage,/remote_battles_used: Number\(document\.getElementById\("raidsUsedToday"\)\.value\)/);
assert.match(manage,/official daily Remote limit is shared by ordinary Remote Raids and Remote Max Battles/i);
assert.match(manage,/data-log-battle-key=/);
assert.match(manage,/\/api\/battle-log/);
assert.match(manage,/log_source: logSource/);
assert.match(manage,/request_id: battleLogRequestId/);
assert.match(manage,/if \(battleLogBusy\) return/);
assert.match(manage,/lockPageForModal\(\)/);
assert.match(manage,/unlockPageForModal\(\)/);
assert.match(manage,/Today's Battle Activity/);
assert.match(manage,/Recent battle logs/);
console.log('Battle logger UI prefills, editable progress, unknown costs and form contracts passed');

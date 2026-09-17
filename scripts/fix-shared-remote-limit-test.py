from pathlib import Path

path = Path('tests/battle-logging.test.mjs')
text = path.read_text()
old = '''// Shared manual correction writes only the ordinary-Raid remainder and keeps
// the recorded Remote Max portion correlated with the overall daily total.
const correctedShared = await updateRemoteRaidUsage(request({remote_battles_used:5}),env);
assert.equal(correctedShared.status,200);
assert.equal(usage('remote_raid_usage','raids_used'),4);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),5);
await updateRemoteRaidUsage(request({remote_battles_used:3}),env);
assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),3);
'''
new = '''// Shared manual correction writes only the ordinary-Raid remainder and keeps
// the recorded Remote Max portion correlated with the overall daily total.
// The endpoint always uses the user's current local date, so preserve and
// restore whatever that day's test state was instead of assuming Sep 17.
const correctionDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
const correctionRaidBefore = usage('remote_raid_usage','raids_used',correctionDate);
const correctionMaxBefore = usage('battle_resource_daily','remote_max_passes_used',correctionDate);
const correctionSharedBefore = correctionRaidBefore + correctionMaxBefore;
const correctedShared = await updateRemoteRaidUsage(request({remote_battles_used:5}),env);
assert.equal(correctedShared.status,200);
const correctedSharedBody = await correctedShared.json();
assert.equal(correctedSharedBody.local_date,correctionDate);
assert.equal(usage('remote_raid_usage','raids_used',correctionDate),5-correctionMaxBefore);
assert.equal(await remoteBattleUsageForDate(env,'user',correctionDate),5);
await updateRemoteRaidUsage(request({remote_battles_used:correctionSharedBefore}),env);
assert.equal(usage('remote_raid_usage','raids_used',correctionDate),correctionRaidBefore);
assert.equal(await remoteBattleUsageForDate(env,'user',correctionDate),correctionSharedBefore);
'''
if text.count(old) != 1:
    raise RuntimeError(f'expected generated correction block once, found {text.count(old)}')
text = text.replace(old,new,1)
old_api = "assert.equal(apiMaxBody.remote_limit_used, await remoteBattleUsageForDate(env,'user','2026-09-17'));"
new_api = "assert.equal(apiMaxBody.remote_limit_used, await remoteBattleUsageForDate(env,'user',apiMaxBody.local_date));"
if text.count(old_api) != 1:
    raise RuntimeError(f'expected generated API date assertion once, found {text.count(old_api)}')
text = text.replace(old_api,new_api,1)
path.write_text(text)
print('date-aware shared correction and API regressions applied')

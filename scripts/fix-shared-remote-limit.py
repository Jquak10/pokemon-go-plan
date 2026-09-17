from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return updated


# ---------------------------------------------------------------------------
# Worker: keep ordinary Raid and Remote Max storage separate, but combine them
# whenever the official daily Remote participation limit is calculated.
# ---------------------------------------------------------------------------
index_path = Path("src/index.js")
index = index_path.read_text()

index = replace_once(
    index,
    "// Only ordinary Raid events participate in the legacy Raid limit allocator.\n// Remote Max Pass usage is recorded separately in battle_resource_daily.",
    "// Only ordinary Raid events are candidates for the legacy Raid allocator.\n// Daily Remote participation usage is shared with Remote Max Battles and is\n// summed from the two existing ledgers before applying the official limit.",
    "remote allocator comment",
)

old_usage = '''async function remoteRaidUsageForDate(env, userId, localDate) {
  const row = await env.DB.prepare(`
    SELECT raids_used
    FROM remote_raid_usage
    WHERE user_id = ? AND local_date = ?
  `).bind(userId, localDate).first();

  return row ? Math.max(0, Number(row.raids_used || 0)) : 0;
}'''
new_usage = '''async function remoteRaidUsageForDate(env, userId, localDate) {
  const row = await env.DB.prepare(`
    SELECT raids_used
    FROM remote_raid_usage
    WHERE user_id = ? AND local_date = ?
  `).bind(userId, localDate).first();

  return row ? Math.max(0, Number(row.raids_used || 0)) : 0;
}

async function remoteMaxPassUsageForDate(env, userId, localDate) {
  try {
    const row = await env.DB.prepare(`
      SELECT remote_max_passes_used
      FROM battle_resource_daily
      WHERE user_id = ? AND local_date = ?
    `).bind(userId, localDate).first();

    return row
      ? Math.max(0, Number(row.remote_max_passes_used || 0))
      : 0;
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) {
      return 0;
    }
    throw error;
  }
}

export async function remoteBattleUsageForDate(env, userId, localDate) {
  const [remoteRaids, remoteMax] = await Promise.all([
    remoteRaidUsageForDate(env, userId, localDate),
    remoteMaxPassUsageForDate(env, userId, localDate)
  ]);

  return remoteRaids + remoteMax;
}'''
index = replace_once(index, old_usage, new_usage, "shared remote usage helpers")

index = replace_once(
    index,
    '''      remoteRaidUsageForDate(
        env,
        user.id,
        localDate
      ),''',
    '''      remoteBattleUsageForDate(
        env,
        user.id,
        localDate
      ),''',
    "remote plan uses shared usage",
)

index = replace_once(
    index,
    '''    ...plan,

    system_recommended_budget:''',
    '''    ...plan,

    // Legacy `raids_used` remains for API compatibility; this alias makes the
    // shared Remote Raid + Remote Max daily-limit meaning explicit.
    remote_limit_used:
      plan.raids_used,

    system_recommended_budget:''',
    "remote plan shared alias",
)

index = replace_once(
    index,
    '''export async function raidActivityForUser(env, user, metas) {
  const localDate = localDateForTimezone(user.timezone);
  const remoteUsage = await remoteRaidUsageForDate(env, user.id, localDate);''',
    '''export async function raidActivityForUser(env, user, metas) {
  const localDate = localDateForTimezone(user.timezone);
  const [remoteRaidUsage, remoteMaxPassUsage] = await Promise.all([
    remoteRaidUsageForDate(env, user.id, localDate),
    remoteMaxPassUsageForDate(env, user.id, localDate)
  ]);
  const remoteLimitUsage = remoteRaidUsage + remoteMaxPassUsage;''',
    "activity shared usage inputs",
)

index = replace_once(
    index,
    '''  return {
    local_date: localDate, migration_ready: migrationReady,
    remote_raids: remoteUsage, local_raids: local, total_raids: remoteUsage + local,
    local_max_battles: localMax, remote_max_battles: remoteMax,
    total_battles: remoteUsage + local + localMax + remoteMax,
    max_particles_spent: totals.mp_spent,
    logged_remote_raids: totals.logged_remote_raids,
    manual_remote_adjustment: remoteUsage - totals.logged_remote_raids,''',
    '''  return {
    local_date: localDate, migration_ready: migrationReady,
    remote_raids: remoteRaidUsage, local_raids: local, total_raids: remoteRaidUsage + local,
    remote_max_passes_used: remoteMaxPassUsage,
    remote_limit_used: remoteLimitUsage,
    local_max_battles: localMax, remote_max_battles: remoteMax,
    total_battles: remoteRaidUsage + local + localMax + remoteMax,
    max_particles_spent: totals.mp_spent,
    logged_remote_raids: totals.logged_remote_raids,
    manual_remote_adjustment: remoteRaidUsage - totals.logged_remote_raids,''',
    "activity shared usage output",
)

index = replace_once(
    index,
    '''    const row = await createBattleLog(env.DB, user.id, localDateForTimezone(user.timezone), nowIso(), id, input);
    return json({
      ok: true, ...row, log_id: row.id, raid_type: row.participation,
      raid_count: row.battle_count, target_updated: Boolean(row.target_id),
      remote_raids_used: row.participation === "remote" && row.battle_system === "raid"
        ? await remoteRaidUsageForDate(env, user.id, row.local_date) : null
    });''',
    '''    const row = await createBattleLog(env.DB, user.id, localDateForTimezone(user.timezone), nowIso(), id, input);
    const remoteLimitUsed = row.participation === "remote"
      ? await remoteBattleUsageForDate(env, user.id, row.local_date)
      : null;
    return json({
      ok: true, ...row, log_id: row.id, raid_type: row.participation,
      raid_count: row.battle_count, target_updated: Boolean(row.target_id),
      remote_raids_used: row.participation === "remote" && row.battle_system === "raid"
        ? await remoteRaidUsageForDate(env, user.id, row.local_date) : null,
      remote_battles_used: remoteLimitUsed,
      remote_limit_used: remoteLimitUsed
    });''',
    "battle log response shared usage",
)

manual_function = '''export async function updateRemoteRaidUsage(request, env) {
  const body = await request.json();
  const user = await userByManageToken(env, body.token);
  if (!user) return bad("Invalid management link.", 401);

  const sharedCorrection = body.remote_battles_used != null;
  const requested = Number(
    sharedCorrection
      ? body.remote_battles_used
      : body.raids_used
  );

  if (!Number.isFinite(requested) || requested < 0 || requested > 999) {
    return bad(
      `${sharedCorrection ? "Remote battles" : "Remote Raids"} used must be a number between 0 and 999.`
    );
  }

  const localDate = localDateForTimezone(user.timezone);
  const timestamp = nowIso();
  const remoteMaxUsed = await remoteMaxPassUsageForDate(
    env,
    user.id,
    localDate
  );

  const requestedWhole = Math.floor(requested);

  if (sharedCorrection && requestedWhole < remoteMaxUsed) {
    return bad(
      `Shared Remote usage cannot be lower than the ${remoteMaxUsed} Remote Max Pass${remoteMaxUsed === 1 ? "" : "es"} already recorded today. Correct Remote Max usage first.`
    );
  }

  // Keep the existing ordinary-Raid ledger backward compatible. A shared
  // correction stores only the ordinary-Raid remainder after recorded Remote
  // Max usage; reads add the two ledgers back together for the official cap.
  const ordinaryRaidsUsed = sharedCorrection
    ? requestedWhole - remoteMaxUsed
    : requestedWhole;

  await env.DB.prepare(`
    INSERT INTO remote_raid_usage (
      user_id, local_date, raids_used, updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, local_date) DO UPDATE SET
      raids_used = excluded.raids_used,
      updated_at = excluded.updated_at
  `).bind(
    user.id,
    localDate,
    ordinaryRaidsUsed,
    timestamp
  ).run();

  const remoteLimitUsed = ordinaryRaidsUsed + remoteMaxUsed;

  return json({
    ok: true,
    local_date: localDate,
    raids_used: ordinaryRaidsUsed,
    remote_max_passes_used: remoteMaxUsed,
    remote_battles_used: remoteLimitUsed,
    remote_limit_used: remoteLimitUsed
  });
}'''
index = regex_once(
    index,
    r'async function updateRemoteRaidUsage\(request, env\) \{.*?\n\}\n\n\nexport async function targetOptionsForUser',
    manual_function + '\n\n\nexport async function targetOptionsForUser',
    "shared manual correction endpoint",
)

index_path.write_text(index)


# ---------------------------------------------------------------------------
# Resource planner: remoteRaidPlan.raids_used now represents the combined
# official daily-limit usage. Do not add Remote Max a second time.
# ---------------------------------------------------------------------------
resource_path = Path("src/resource-planning.js")
resource = resource_path.read_text()
resource = replace_once(
    resource,
    '''  const raidLimitUsed =
    wholeNonNegative(
      remoteRaidPlan.raids_used
    );

  const remoteMaxPassesUsed =
    state.remote_max_passes_used;

  const sharedPassesUsed =
    raidLimitUsed +
    remoteMaxPassesUsed;''',
    '''  const sharedPassesUsed =
    wholeNonNegative(
      remoteRaidPlan.remote_limit_used ??
      remoteRaidPlan.raids_used
    );

  const remoteMaxPassesUsed =
    state.remote_max_passes_used;

  const ordinaryRemoteRaidsUsed =
    Math.max(
      0,
      sharedPassesUsed -
      remoteMaxPassesUsed
    );''',
    "resource shared usage semantics",
)
resource = replace_once(
    resource,
    '''        systemRaidBudget -
        raidLimitUsed''',
    '''        systemRaidBudget -
        sharedPassesUsed''',
    "raid capacity subtracts shared use",
)
resource = replace_once(
    resource,
    '''      ordinary_remote_raids_used:
        raidLimitUsed,''',
    '''      ordinary_remote_raids_used:
        ordinaryRemoteRaidsUsed,''',
    "resource ordinary raid breakdown",
)
resource = replace_once(
    resource,
    '''    remote_raid_limit: {
      used:
        raidLimitUsed,''',
    '''    remote_raid_limit: {
      used:
        sharedPassesUsed,''',
    "official limit uses shared usage",
)
if "raidLimitUsed" in resource:
    raise RuntimeError("stale raidLimitUsed reference remains in resource planner")
resource_path.write_text(resource)


# ---------------------------------------------------------------------------
# UI: shared daily-limit language and tier dropdown for Max Particle cost.
# ---------------------------------------------------------------------------
manage_path = Path("public/manage.html")
manage = manage_path.read_text()

manage = replace_once(
    manage,
    '''            <small>Remote Raids logged</small>''',
    '''            <small>Raids + Remote Max</small>''',
    "hero shared usage label",
)

manage = replace_once(
    manage,
    '''                    Your limit is a ceiling—not a target. Unused capacity is intentionally left unused when raids are not valuable enough.''',
    '''                    The official Remote limit is shared by Remote Raids and Remote Max Battles. It is a ceiling—not a target; unused capacity is intentional.''',
    "remote plan shared limit subtitle",
)

manage = replace_once(
    manage,
    '''                    Optional. Leave Auto to follow the planner. This shared ceiling covers ordinary Remote Raids and Remote Max Battles, while the official Remote Raid participation limit remains separate.''',
    '''                    Optional. Leave Auto to follow the planner. The official daily Remote limit is shared by ordinary Remote Raids and Remote Max Battles; event increases or unlimited periods apply to the same counter.''',
    "override shared rule help",
)

manage = replace_once(
    manage,
    '''                  <label for="raidsUsedToday">Remote Raids used today · manual correction</label>
                  <p class="field-help">
                    Logging a Remote Raid below updates this automatically. Use this field only to correct the total or enter raids you did before using the battle logger.
                  </p>''',
    '''                  <label for="raidsUsedToday">Remote limit used today · manual correction</label>
                  <p class="field-help">
                    Includes ordinary Remote Raids and Remote Max Battles. Logs update this shared total automatically; use this only to correct the overall daily usage.
                  </p>''',
    "shared manual correction copy",
)

manage = replace_once(
    manage,
    '''            Battle logs update Remote Raid and Remote Max pass usage automatically. Use these fields for corrections or activity not yet logged. Max Particle limits can change during events; explicit event limits override the standard 800 collected / 1,500 held rules when the calendar supplies them.''',
    '''            Battle logs update ordinary Remote Raid and Remote Max usage automatically. Both count toward the same official daily Remote limit; the Remote Max field is the Max-specific share of that total. Max Particle limits can change during events; explicit event limits override the standard 800 collected / 1,500 held rules when the calendar supplies them.''',
    "battle resource shared usage help",
)

manage = replace_once(
    manage,
    '''                  aria-label="Remote Raid daily allocation"''',
    '''                  aria-label="Shared Remote daily-limit usage and Raid allocation"''',
    "capacity aria label",
)

manage = replace_once(
    manage,
    '''                <label for="battleLogMp">Max Particles per win</label>
                <input id="battleLogMp" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="Enter cost">''',
    '''                <label for="battleLogMp">Max Particles per win</label>
                <select id="battleLogMp">
                  <option value="">Select tier cost</option>
                  <option value="250">Tier 1 · 250 MP</option>
                  <option value="400">Tier 2–3 · 400 MP</option>
                  <option value="800">Tier 4–6 / Gigantamax · 800 MP</option>
                  <option value="custom">Event / custom cost…</option>
                </select>
                <input id="battleLogMpCustom" class="hidden" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="Custom MP cost" aria-label="Custom Max Particle cost">''',
    "Max Particle cost dropdown",
)

helper = '''function battleLogParticleCostValue() {
  const selected = document.getElementById("battleLogMp").value;
  return selected === "custom"
    ? document.getElementById("battleLogMpCustom").value
    : selected;
}

function setBattleLogParticleCost(value = "", confirmed = false) {
  const select = document.getElementById("battleLogMp");
  const custom = document.getElementById("battleLogMpCustom");
  const normalized = value == null || value === "" ? "" : String(value);

  if (["250", "400", "800"].includes(normalized)) {
    select.value = normalized;
    custom.value = "";
    custom.classList.add("hidden");
    return;
  }

  if (confirmed && normalized !== "") {
    select.value = "custom";
    custom.value = normalized;
    custom.classList.remove("hidden");
    return;
  }

  select.value = "";
  custom.value = "";
  custom.classList.add("hidden");
}

function syncBattleLogParticleCostControl() {
  const select = document.getElementById("battleLogMp");
  const custom = document.getElementById("battleLogMpCustom");
  custom.classList.toggle("hidden", select.value !== "custom");
  if (select.value !== "custom") {
    custom.value = "";
  }
  updateRaidLogPreview();
}

'''
manage = replace_once(
    manage,
    '''function prefillBattleLog(rec = null) {''',
    helper + '''function prefillBattleLog(rec = null) {''',
    "Max cost dropdown helpers",
)

manage = replace_once(
    manage,
    '''  const knownCost = rec?.max_particle_cost_confidence === "known";
  document.getElementById("battleLogMp").value = knownCost && rec?.max_particle_cost != null ? rec.max_particle_cost : "";
  document.getElementById("battleLogCostHint").textContent = knownCost
    ? "Cost from the recommendation. Correct it if an event changes the cost."
    : "MP cost is not confirmed. Enter the actual cost per win, including any event discount.";''',
    '''  const costConfidence = rec?.max_particle_cost_confidence || "unknown";
  const knownCost = costConfidence === "known";
  const suggestedCost = costConfidence === "standard_tier_cost"
    ? Number(rec?.max_particle_cost || 0)
    : 0;
  setBattleLogParticleCost(
    knownCost && rec?.max_particle_cost != null ? rec.max_particle_cost : "",
    knownCost
  );
  document.getElementById("battleLogCostHint").textContent = knownCost
    ? "Cost from the recommendation. Change the tier if an event changes the cost."
    : suggestedCost
      ? `Standard tier suggests ${formatNumber(suggestedCost)} MP. Confirm the actual tier cost; event bonuses may change it.`
      : "MP cost is not confirmed. Select the actual tier cost, or choose Event / custom cost.";''',
    "prefill dropdown cost",
)

manage = replace_once(
    manage,
    '''  const mpText = document.getElementById("battleLogMp").value;''',
    '''  const mpText = battleLogParticleCostValue();''',
    "preview dropdown cost",
)

manage = replace_once(
    manage,
    '''              max_particle_cost: document.getElementById("battleLogMp").value,''',
    '''              max_particle_cost: battleLogParticleCostValue(),''',
    "submit dropdown cost",
)

manage = replace_once(
    manage,
    '''  document.getElementById("battleLogMp").value = "";
  document.getElementById("battleLogCostHint").textContent = "Enter the actual MP cost per win.";''',
    '''  setBattleLogParticleCost("", false);
  document.getElementById("battleLogCostHint").textContent = "Select the actual tier cost per win.";''',
    "reset dropdown cost",
)

manage = replace_once(
    manage,
    '''document.getElementById("battleLogMp").addEventListener("input", updateRaidLogPreview);''',
    '''document.getElementById("battleLogMp").addEventListener("change", syncBattleLogParticleCostControl);
document.getElementById("battleLogMpCustom").addEventListener("input", updateRaidLogPreview);''',
    "dropdown cost listeners",
)

manage = replace_once(
    manage,
    '''        raids_used: Number(document.getElementById("raidsUsedToday").value)''',
    '''        remote_battles_used: Number(document.getElementById("raidsUsedToday").value)''',
    "shared manual correction payload",
)

manage = replace_once(
    manage,
    '''  document.getElementById("heroUsed").textContent = formatNumber(plan.raids_used);''',
    '''  document.getElementById("heroUsed").textContent = formatNumber(
    plan.remote_limit_used ?? plan.raids_used
  );''',
    "hero uses shared alias",
)

manage = replace_once(
    manage,
    '''function renderRemoteRaidPlan() {
  const plan = state.remote_raid_plan;
  const rule = plan.official_rule;''',
    '''function renderRemoteRaidPlan() {
  const plan = state.remote_raid_plan;
  const rule = plan.official_rule;
  const usedToday = Number(
    plan.remote_limit_used ??
    plan.raids_used ??
    0
  );''',
    "remote plan shared used local",
)

manage = replace_once(
    manage,
    '''  document.getElementById("raidsUsedToday").value = plan.raids_used;''',
    '''  document.getElementById("raidsUsedToday").value = usedToday;''',
    "manual correction shows shared usage",
)

manage = replace_once(
    manage,
    '''      <small>${formatNumber(plan.raids_used)} already logged</small>''',
    '''      <small>${formatNumber(usedToday)} shared Remote uses logged</small>''',
    "remote summary shared usage",
)

manage = replace_once(
    manage,
    '''    Number(plan.raids_used || 0) + Number(plan.recommended_total || 0)''',
    '''    usedToday + Number(plan.recommended_total || 0)''',
    "capacity shared used cap",
)
manage = replace_once(
    manage,
    '''  const usedPct = Math.min(100, (Number(plan.raids_used || 0) / cap) * 100);''',
    '''  const usedPct = Math.min(100, (usedToday / cap) * 100);''',
    "capacity shared used percent",
)
manage = replace_once(
    manage,
    '''      : `${formatNumber(plan.raids_used + plan.recommended_total)} / ${formatNumber(plan.effective_budget_cap)}`;''',
    '''      : `${formatNumber(usedToday + plan.recommended_total)} / ${formatNumber(plan.effective_budget_cap)}`;''',
    "capacity shared used text",
)

manage = replace_once(
    manage,
    '''      activity.remote_raids ??
      state.remote_raid_plan
        ?.raids_used ??''',
    '''      activity.remote_limit_used ??
      state.remote_raid_plan
        ?.remote_limit_used ??
      state.remote_raid_plan
        ?.raids_used ??
      activity.remote_raids ??''',
    "desktop rail shared usage",
)

manage_path.write_text(manage)


# ---------------------------------------------------------------------------
# Regression tests.
# ---------------------------------------------------------------------------
logging_test_path = Path("tests/battle-logging.test.mjs")
logging_test = logging_test_path.read_text()
logging_test = replace_once(
    logging_test,
    '''import { logRaidApi, undoRaidLogApi, raidActivityForUser } from '../src/index.js';''',
    '''import { logRaidApi, undoRaidLogApi, raidActivityForUser, remoteBattleUsageForDate, updateRemoteRaidUsage } from '../src/index.js';''',
    "logging test imports",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(target().current_value,22);''',
    '''assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),2);
assert.equal(target().current_value,22);''',
    "ordinary remote shared usage assertion",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),1);
assert.equal(usage('remote_raid_usage','raids_used'),2);''',
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),1);
assert.equal(usage('remote_raid_usage','raids_used'),2,'ordinary Raid ledger stays separate');
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),3,'Remote Raid + Remote Max share one daily limit');''',
    "remote Max shared usage assertion",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(maxTarget('gmax').current_value,4);

// Unknown/invalid cost,''',
    '''assert.equal(maxTarget('gmax').current_value,4);

// Shared manual correction writes only the ordinary-Raid remainder and keeps
// the recorded Remote Max portion correlated with the overall daily total.
const correctedShared = await updateRemoteRaidUsage(request({remote_battles_used:5}),env);
assert.equal(correctedShared.status,200);
assert.equal(usage('remote_raid_usage','raids_used'),4);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),5);
await updateRemoteRaidUsage(request({remote_battles_used:3}),env);
assert.equal(usage('remote_raid_usage','raids_used'),2);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),3);

// Unknown/invalid cost,''',
    "shared manual correction test",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);
const retry = await log''',
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),4);
const retry = await log''',
    "failed Max shared usage",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(held(),100);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);''',
    '''assert.equal(held(),100);
assert.equal(usage('battle_resource_daily','remote_max_passes_used'),2);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),4,'same-Power-Spot retry with no new pass does not consume another daily slot');''',
    "retry shared usage",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),0);

// Atomic arithmetic''',
    '''assert.equal(usage('battle_resource_daily','remote_max_passes_used'),0);
assert.equal(await remoteBattleUsageForDate(env,'user','2026-09-17'),0);

// Atomic arithmetic''',
    "undo shared usage",
)
logging_test = replace_once(
    logging_test,
    '''assert.equal(apiMax.status,200);
assert.equal((await apiMax.json()).target_updated,false);''',
    '''assert.equal(apiMax.status,200);
const apiMaxBody = await apiMax.json();
assert.equal(apiMaxBody.target_updated,false);
assert.equal(apiMaxBody.remote_limit_used, await remoteBattleUsageForDate(env,'user','2026-09-17'));''',
    "API shared usage response",
)
logging_test_path.write_text(logging_test)

resource_test_path = Path("tests/resource-planning.test.mjs")
resource_test = resource_test_path.read_text()
resource_test = replace_once(
    resource_test,
    '''  remoteRaidPlan: {
    raids_used: 2,
    official_remaining: 8,
    official_is_unlimited: false,
    system_recommended_budget: 4
  },''',
    '''  remoteRaidPlan: {
    // Shared official-limit usage: 2 ordinary Remote Raids + 1 Remote Max.
    raids_used: 3,
    remote_limit_used: 3,
    official_remaining: 7,
    official_is_unlimited: false,
    system_recommended_budget: 4
  },''',
    "resource shared used fixture",
)
resource_test = replace_once(
    resource_test,
    '''assert.equal(alreadyAtCeiling.remote_passes.used_total, 3);
assert.equal(alreadyAtCeiling.remote_passes.recommended_additional, 0);''',
    '''assert.equal(alreadyAtCeiling.remote_passes.used_total, 3);
assert.equal(alreadyAtCeiling.remote_passes.ordinary_remote_raids_used, 2);
assert.equal(alreadyAtCeiling.remote_raid_limit.used, 3);
assert.equal(alreadyAtCeiling.remote_passes.recommended_additional, 0);''',
    "resource shared used assertions",
)

unlimited_block = '''
const unlimitedSharedLimit = buildBattleResourcePlan({
  recommendations: [raid],
  remoteRaidPlan: {
    // An event has removed the game cap. Five of these 12 shared uses were
    // Remote Max; they must not be added a second time.
    raids_used: 12,
    remote_limit_used: 12,
    official_remaining: null,
    official_is_unlimited: true,
    system_recommended_budget: 20
  },
  resourceState: {
    max_particles_held: 1500,
    max_particles_collected_today: 0,
    remote_max_passes_used: 5
  },
  personalRemotePassCeiling: 15
});
assert.equal(unlimitedSharedLimit.remote_passes.used_total, 12);
assert.equal(unlimitedSharedLimit.remote_passes.ordinary_remote_raids_used, 7);
assert.equal(unlimitedSharedLimit.remote_raid_limit.used, 12);
assert.equal(unlimitedSharedLimit.remote_raid_limit.is_unlimited, true);

'''
resource_test = replace_once(
    resource_test,
    '''const canCollectThenSpend = buildBattleResourcePlan({''',
    unlimited_block + '''const canCollectThenSpend = buildBattleResourcePlan({''',
    "unlimited shared limit regression",
)
resource_test_path.write_text(resource_test)

ui_test_path = Path("tests/battle-logging-ui.test.mjs")
ui_test = ui_test_path.read_text()
ui_test = replace_once(
    ui_test,
    '''for (const name of ['raidLogMatchingTarget','raidLogPokemonNames','setRaidLogType','raidLogDefaultProgress','populateRaidLogPokemon','syncRaidLogProgressDefault','battleLogSelection','battleLogLabel','prefillBattleLog','updateRaidLogPreview','openRaidLogModal']) {''',
    '''for (const name of ['raidLogMatchingTarget','raidLogPokemonNames','setRaidLogType','raidLogDefaultProgress','populateRaidLogPokemon','syncRaidLogProgressDefault','battleLogSelection','battleLogLabel','battleLogParticleCostValue','setBattleLogParticleCost','syncBattleLogParticleCostControl','prefillBattleLog','updateRaidLogPreview','openRaidLogModal']) {''',
    "UI helper extraction list",
)
ui_test = replace_once(
    ui_test,
    '''assert.equal(element('battleLogMp').value,800);''',
    '''assert.equal(element('battleLogMp').value,'800');''',
    "known cost dropdown value",
)
ui_test = replace_once(
    ui_test,
    '''assert.equal(element('battleLogMp').value,'','Estimates must not silently become confirmed cost');
assert.equal(context.raidLogType,'local');''',
    '''assert.equal(element('battleLogMp').value,'','Estimates must not silently become confirmed cost');
assert.match(element('battleLogCostHint').textContent,/suggests 400 MP/);
element('battleLogMp').value='400';
context.syncBattleLogParticleCostControl();
assert.match(element('raidLogPreview').innerHTML,/400 MP spent/);
assert.equal(context.raidLogType,'local');''',
    "standard tier dropdown confirmation",
)
ui_test = replace_once(
    ui_test,
    '''context.openRaidLogModal('Gengar');
assert.equal(element('battleLogKind').value,'raid');''',
    '''context.openRaidLogModal('Gengar',null,{pokemon_name:'Gengar',battle_system:'max',battle_variant:'dynamax',max_particle_cost:600,max_particle_cost_confidence:'known',logging_remote_eligible:true});
assert.equal(element('battleLogMp').value,'custom');
assert.equal(element('battleLogMpCustom').value,'600');
context.openRaidLogModal('Gengar');
assert.equal(element('battleLogKind').value,'raid');''',
    "custom event cost dropdown",
)
ui_test = replace_once(
    ui_test,
    '''assert.match(manage,/data-log-battle-key=/);''',
    '''assert.match(manage,/<select id="battleLogMp">/);
assert.match(manage,/Tier 1 · 250 MP/);
assert.match(manage,/Tier 2–3 · 400 MP/);
assert.match(manage,/Tier 4–6 \/ Gigantamax · 800 MP/);
assert.match(manage,/max_particle_cost: battleLogParticleCostValue\(\)/);
assert.match(manage,/remote_battles_used: Number\(document\.getElementById\("raidsUsedToday"\)\.value\)/);
assert.match(manage,/official daily Remote limit is shared by ordinary Remote Raids and Remote Max Battles/i);
assert.match(manage,/data-log-battle-key=/);''',
    "UI static shared limit/dropdown assertions",
)
ui_test_path.write_text(ui_test)

print("shared Remote limit + Max cost dropdown patch applied")

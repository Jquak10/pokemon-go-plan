export const PLANNER_STORAGE_LIMITS =
  Object.freeze({
    targets: 250,
    target_notes_characters: 2000,
    battle_logs_per_local_day: 200,
    battle_logs_total: 20000,
    max_battle_cost_overrides: 250
  });

export function targetStorageLimitMessage() {
  return `This planner has reached its ${PLANNER_STORAGE_LIMITS.targets}-target storage limit. Delete an existing target before adding another.`;
}

export function targetNotesLimitMessage() {
  return `Target notes must be ${PLANNER_STORAGE_LIMITS.target_notes_characters.toLocaleString()} characters or fewer.`;
}

export function battleLogDailyLimitMessage() {
  return `This planner has reached its ${PLANNER_STORAGE_LIMITS.battle_logs_per_local_day} battle-log entry limit for this local day. Combine multiple battles in one log or try again on the next local day.`;
}

export function battleLogTotalLimitMessage() {
  return `This planner has reached its ${PLANNER_STORAGE_LIMITS.battle_logs_total.toLocaleString()} battle-log entry storage limit. Existing history remains available, but no new log entries can be added.`;
}

export function maxBattleOverrideLimitMessage() {
  return `This planner has reached its ${PLANNER_STORAGE_LIMITS.max_battle_cost_overrides}-item saved Max tier override limit. Clear an existing override before saving another.`;
}

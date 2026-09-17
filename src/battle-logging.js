import { maxBattleVariantFromText } from './battle-opportunities.js';

export class BattleLogError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function whole(value, label, min, max) {
  if (value == null || value === '' || typeof value === 'boolean' ||
      !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new BattleLogError(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return Number(value);
}

export function normalizeBattleLog(body, targets = []) {
  const name = String(body.pokemon_name || '').trim();
  if (!name || name.length > 200) throw new BattleLogError('Pokémon/form name is required (up to 200 characters).');
  const namedVariant = maxBattleVariantFromText(name);
  const system = body.battle_system || (namedVariant ? 'max' : 'raid');
  const variant = body.battle_variant || namedVariant || null;
  if (!['raid', 'max'].includes(system) ||
      (system === 'raid' && variant) ||
      (system === 'max' && !['dynamax', 'gigantamax'].includes(variant)) ||
      (namedVariant && variant !== namedVariant)) {
    throw new BattleLogError('Choose Raid, Dynamax or Gigantamax to match the Pokémon/form.');
  }
  const participation = body.participation ?? body.raid_type;
  if (!['local', 'remote'].includes(participation)) throw new BattleLogError('Participation must be local or remote.');
  const count = whole(body.battle_count ?? body.raid_count, 'Battle count', 1, 99);
  const wins = whole(body.wins ?? count, 'Battles won', 0, count);
  if (system === 'raid' && wins !== count) throw new BattleLogError('The Raid logger records completed raids.');
  // Explicit input is required for wins. Never turn an unknown cost into zero,
  // or infer cost from a collection bonus/MP reward in free-form event text.
  const cost = system === 'max' && body.max_particle_cost != null && body.max_particle_cost !== ''
    ? whole(body.max_particle_cost, 'Max Particles per win', 0, 100000) : null;
  if (system === 'max' && wins > 0 && cost == null) throw new BattleLogError('Enter Max Particles per win; the cost is unknown.');
  const passes = participation === 'remote'
    ? whole(body.remote_passes_used ?? count, 'Remote Passes consumed', 0, count) : 0;
  if (system === 'raid' && participation === 'remote' && passes !== count) {
    throw new BattleLogError('Each completed Remote Raid consumes one Remote Raid Pass.');
  }
  const key = value => String(value).trim().toLowerCase();
  let target = null;
  if (body.update_target !== false) {
    target = body.target_id
      ? targets.find(t => String(t.id) === String(body.target_id))
      : targets.find(t => key(t.pokemon_name) === key(name));
    if (body.target_id && (!target || key(target.pokemon_name) !== key(name))) {
      throw new BattleLogError('The selected target does not match this Pokémon/form.');
    }
  }
  const progress = Number(body.progress_gained == null || body.progress_gained === ''
    ? (target?.target_type === 'raids' ? wins : 0) : body.progress_gained);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1000000) {
    throw new BattleLogError('Progress gained must be between 0 and 1,000,000.');
  }
  return {
    pokemon_name: name, battle_system: system, battle_variant: variant,
    participation, battle_count: count, wins, max_particle_cost: cost,
    max_particles_spent: system === 'max' ? wins * (cost ?? 0) : 0,
    remote_passes_used: passes, progress_gained: target ? progress : 0,
    target_id: target?.id ?? null
  };
}

export function battleStorageError(error) {
  const message = String(error?.message || error);
  if (/no such (table|view|trigger)/i.test(message)) return new BattleLogError(
    'Battle logging needs migrations/0002_battle_logging.sql. No changes were saved.', 503);
  if (message.includes('battle_insufficient_particles')) return new BattleLogError(
    'Not enough recorded Max Particles. Correct your held balance in Battle resources, then retry.', 409);
  if (message.includes('battle_undo_target_conflict')) return new BattleLogError(
    'Undo could not restore the target: it was removed or its progress was reduced. Restore the target/progress first. Nothing was undone.', 409);
  if (message.includes('battle_undo_remote_conflict')) return new BattleLogError(
    'Undo conflicts with a corrected Remote usage total. Restore that day’s recorded usage first. Nothing was undone.', 409);
  if (message.includes('battle_target_missing')) return new BattleLogError('The target was removed. Refresh and retry.', 409);
  return error;
}

export async function createBattleLog(db, userId, localDate, timestamp, id, input) {
  const fields = Object.keys(input);
  try {
    // ON CONFLICT targets only the id: other constraint failures must not be ignored.
    await db.prepare(`INSERT INTO battle_log (id, user_id, local_date, created_at, ${fields.join(',')})
      VALUES (?, ?, ?, ?, ${fields.map(() => '?').join(',')}) ON CONFLICT(id) DO NOTHING`)
      .bind(id, userId, localDate, timestamp, ...Object.values(input)).run();
    const row = await db.prepare('SELECT * FROM battle_log WHERE id = ? AND user_id = ?').bind(id, userId).first();
    if (!row || fields.some(field => row[field] !== input[field])) {
      throw new BattleLogError('This request ID was already used for a different log. Close the logger and start again.', 409);
    }
    if (row.undone_at) throw new BattleLogError('This log was already undone. Close the logger to start a new log.', 409);
    return row;
  } catch (error) { throw battleStorageError(error); }
}

export async function undoBattleLog(db, userId, id, timestamp, source = 'battle') {
  const table = source === 'legacy' ? 'raid_log' : 'battle_log';
  try {
    if (source === 'legacy') {
      const row = await db.prepare('SELECT id FROM raid_log WHERE id = ? AND user_id = ?').bind(id, userId).first();
      if (!row) throw new BattleLogError('Battle log entry not found.', 404);
      // Import only this historical row WITHOUT replaying its original effects,
      // then reverse it and mark the old row in one D1 batch transaction. This
      // leaves older Workers compatible with the additive migration.
      await db.batch([
        db.prepare(`INSERT INTO battle_log (id, legacy_log_id, user_id, pokemon_name,
          battle_system, participation, battle_count, wins, remote_passes_used,
          progress_gained, target_id, target_before_value, target_after_value,
          local_date, created_at)
          SELECT 'legacy:' || id, id, user_id, pokemon_name, 'raid', raid_type, raid_count, raid_count,
            CASE WHEN raid_type = 'remote' THEN raid_count ELSE 0 END,
            CASE WHEN target_before_value IS NOT NULL THEN progress_gained ELSE 0 END,
            CASE WHEN target_before_value IS NOT NULL THEN target_id ELSE NULL END,
            target_before_value, target_after_value, local_date, created_at
          FROM raid_log WHERE id = ? AND user_id = ? AND undone_at IS NULL
          ON CONFLICT DO NOTHING`).bind(id, userId),
        db.prepare(`UPDATE battle_log SET undone_at = ?
          WHERE legacy_log_id = ? AND user_id = ? AND undone_at IS NULL`).bind(timestamp, id, userId),
        db.prepare(`UPDATE raid_log SET undone_at = ?
          WHERE id = ? AND user_id = ? AND undone_at IS NULL`).bind(timestamp, id, userId)
      ]);
      return;
    }
    // Trigger reverses ALL effects in the same transaction. Its WHEN clause and
    // this predicate make concurrent/double Undo harmless.
    const result = await db.prepare(`UPDATE ${table} SET undone_at = ?
      WHERE id = ? AND user_id = ? AND undone_at IS NULL`).bind(timestamp, id, userId).run();
    if (!result.meta?.changes) {
      const row = await db.prepare(`SELECT undone_at FROM ${table} WHERE id = ? AND user_id = ?`).bind(id, userId).first();
      if (!row) throw new BattleLogError('Battle log entry not found.', 404);
    }
  } catch (error) { throw battleStorageError(error); }
}

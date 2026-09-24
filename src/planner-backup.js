import {
  PLANNER_STORAGE_LIMITS
} from "./planner-storage-limits.js";
import {
  canonicalTimeZone
} from "./timezone.js";

export const PLANNER_BACKUP_FORMAT =
  "pokemon-go-planner-backup";

export const PLANNER_BACKUP_VERSION =
  1;

export const PLANNER_BACKUP_MAX_BROWSER_BYTES =
  25 * 1024 * 1024;

export const PLANNER_BACKUP_JSON_CHUNK_BYTES =
  900000;

export const PLANNER_BACKUP_MAX_BATCH_STATEMENTS =
  45;

export class PlannerBackupError extends Error {
  constructor(
    message,
    status = 400
  ) {
    super(message);
    this.name =
      "PlannerBackupError";
    this.status =
      status;
  }
}

function backupError(message) {
  throw new PlannerBackupError(
    message
  );
}

function object(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    backupError(
      `${label} is missing or invalid.`
    );
  }

  return value;
}

function array(
  value,
  label,
  max
) {
  if (!Array.isArray(value)) {
    backupError(
      `${label} must be an array.`
    );
  }

  if (
    value.length >
    max
  ) {
    backupError(
      `${label} exceeds the supported restore limit of ${max.toLocaleString()} rows.`
    );
  }

  return value;
}

function text(
  value,
  label,
  {
    allowNull = false,
    min = 0,
    max = 500
  } = {}
) {
  if (
    value == null &&
    allowNull
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    backupError(
      `${label} must be text.`
    );
  }

  if (
    value.length < min ||
    value.length > max
  ) {
    backupError(
      `${label} has an unsupported length.`
    );
  }

  return value;
}

function number(
  value,
  label,
  {
    allowNull = false,
    integer = false,
    min = null,
    max = null
  } = {}
) {
  if (
    value == null &&
    allowNull
  ) {
    return null;
  }

  if (
    typeof value === "boolean"
  ) {
    backupError(
      `${label} must be a number.`
    );
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    (
      integer &&
      !Number.isInteger(parsed)
    ) ||
    (
      min != null &&
      parsed < min
    ) ||
    (
      max != null &&
      parsed > max
    )
  ) {
    backupError(
      `${label} has an unsupported value.`
    );
  }

  return parsed;
}

function booleanInteger(
  value,
  label
) {
  if (
    value === true ||
    value === 1 ||
    value === "1"
  ) {
    return 1;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0"
  ) {
    return 0;
  }

  backupError(
    `${label} must be true or false.`
  );
}

function date(
  value,
  label
) {
  const clean =
    text(
      value,
      label,
      {
        min: 10,
        max: 10
      }
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      clean
    )
  ) {
    backupError(
      `${label} must use YYYY-MM-DD.`
    );
  }

  return clean;
}

function timestamp(
  value,
  label,
  {
    allowNull = false
  } = {}
) {
  return text(
    value,
    label,
    {
      allowNull,
      min: allowNull ? 0 : 1,
      max: 100
    }
  );
}

function safeId(
  value,
  label,
  {
    allowNull = false
  } = {}
) {
  const clean =
    text(
      value,
      label,
      {
        allowNull,
        min: allowNull ? 0 : 1,
        max: 300
      }
    );

  if (clean == null) {
    return null;
  }

  if (
    !/^[a-zA-Z0-9:_-]+$/.test(
      clean
    )
  ) {
    backupError(
      `${label} contains unsupported characters.`
    );
  }

  return clean;
}

function nullableTargetId(
  value,
  label
) {
  return safeId(
    value,
    label,
    {
      allowNull: true
    }
  );
}

function normalizePlannerSettings(
  value
) {
  const planner =
    object(
      value,
      "Backup planner settings"
    );

  const timezone =
    canonicalTimeZone(
      planner.timezone
    );

  if (!timezone) {
    backupError(
      "Backup planner timezone is invalid."
    );
  }

  const includedSources =
    array(
      planner.included_sources,
      "Backup calendar source selection",
      50
    ).map(
      (source, index) =>
        text(
          source,
          `Backup calendar source ${index + 1}`,
          {
            min: 1,
            max: 80
          }
        )
    );

  return {
    timezone,
    included_sources:
      [...new Set(
        includedSources
      )],
    pve_weight:
      number(
        planner.pve_weight,
        "Backup PvE weight",
        {
          min: 0,
          max: 2
        }
      ),
    pvp_weight:
      number(
        planner.pvp_weight,
        "Backup PvP weight",
        {
          min: 0,
          max: 2
        }
      ),
    collector_weight:
      number(
        planner.collector_weight,
        "Backup collector weight",
        {
          min: 0,
          max: 2
        }
      ),
    remote_raid_budget:
      number(
        planner.remote_raid_budget,
        "Backup Remote Raid budget",
        {
          allowNull: true,
          integer: true,
          min: 0,
          max: 999
        }
      ),
    remote_raid_min_score:
      number(
        planner.remote_raid_min_score,
        "Backup paid-battle minimum score",
        {
          min: 0,
          max: 100
        }
      )
  };
}

function normalizeTarget(
  row,
  index
) {
  row =
    object(
      row,
      `Backup target ${index + 1}`
    );

  const battleKind =
    text(
      row.battle_kind,
      `Backup target ${index + 1} battle type`,
      {
        allowNull: true,
        max: 20
      }
    );

  if (
    battleKind != null &&
    ![
      "raid",
      "dynamax",
      "gigantamax"
    ].includes(
      battleKind
    )
  ) {
    backupError(
      `Backup target ${index + 1} has an unsupported battle type.`
    );
  }

  const targetType =
    text(
      row.target_type,
      `Backup target ${index + 1} goal type`,
      {
        min: 1,
        max: 40
      }
    );

  if (
    ![
      "mega_energy",
      "raids",
      "battles",
      "candy_xl",
      "candy",
      "custom"
    ].includes(
      targetType
    )
  ) {
    backupError(
      `Backup target ${index + 1} has an unsupported goal type.`
    );
  }

  const priority =
    text(
      row.priority,
      `Backup target ${index + 1} priority`,
      {
        min: 1,
        max: 20
      }
    );

  if (
    ![
      "high",
      "medium",
      "low",
      "skip"
    ].includes(
      priority
    )
  ) {
    backupError(
      `Backup target ${index + 1} has an unsupported priority.`
    );
  }

  return {
    id:
      safeId(
        row.id,
        `Backup target ${index + 1} id`
      ),
    pokemon_name:
      text(
        row.pokemon_name,
        `Backup target ${index + 1} Pokémon/form`,
        {
          min: 1,
          max: 200
        }
      ),
    target_type:
      targetType,
    battle_kind:
      battleKind,
    target_value:
      number(
        row.target_value,
        `Backup target ${index + 1} target value`,
        {
          allowNull: true,
          min: 0
        }
      ),
    current_value:
      number(
        row.current_value,
        `Backup target ${index + 1} progress`,
        {
          min: 0
        }
      ),
    expected_progress_per_raid:
      number(
        row.expected_progress_per_raid,
        `Backup target ${index + 1} expected progress`,
        {
          allowNull: true,
          min: 0
        }
      ),
    priority,
    completed:
      booleanInteger(
        row.completed,
        `Backup target ${index + 1} completed state`
      ),
    notes:
      text(
        row.notes ?? "",
        `Backup target ${index + 1} notes`,
        {
          max:
            PLANNER_STORAGE_LIMITS.target_notes_characters
        }
      ),
    created_at:
      timestamp(
        row.created_at,
        `Backup target ${index + 1} created timestamp`
      ),
    updated_at:
      timestamp(
        row.updated_at,
        `Backup target ${index + 1} updated timestamp`
      )
  };
}

function normalizeRemoteUsage(
  row,
  index
) {
  row =
    object(
      row,
      `Backup Remote usage row ${index + 1}`
    );

  return {
    local_date:
      date(
        row.local_date,
        `Backup Remote usage row ${index + 1} date`
      ),
    raids_used:
      number(
        row.raids_used,
        `Backup Remote usage row ${index + 1} count`,
        {
          integer: true,
          min: 0,
          max: 1000000
        }
      ),
    updated_at:
      timestamp(
        row.updated_at,
        `Backup Remote usage row ${index + 1} timestamp`
      )
  };
}

function normalizeBudgetOverride(
  row,
  index
) {
  row =
    object(
      row,
      `Backup daily ceiling override ${index + 1}`
    );

  return {
    local_date:
      date(
        row.local_date,
        `Backup daily ceiling override ${index + 1} date`
      ),
    budget_override:
      number(
        row.budget_override,
        `Backup daily ceiling override ${index + 1} value`,
        {
          integer: true,
          min: 0,
          max: 999
        }
      ),
    updated_at:
      timestamp(
        row.updated_at,
        `Backup daily ceiling override ${index + 1} timestamp`
      )
  };
}

function normalizeMaxOverride(
  row,
  index
) {
  row =
    object(
      row,
      `Backup Max tier override ${index + 1}`
    );

  const variant =
    text(
      row.battle_variant,
      `Backup Max tier override ${index + 1} battle variant`,
      {
        min: 1,
        max: 20
      }
    );

  if (
    ![
      "dynamax",
      "gigantamax"
    ].includes(
      variant
    )
  ) {
    backupError(
      `Backup Max tier override ${index + 1} has an unsupported battle variant.`
    );
  }

  const startDate =
    date(
      row.start_date,
      `Backup Max tier override ${index + 1} start date`
    );

  const endDate =
    date(
      row.end_date,
      `Backup Max tier override ${index + 1} end date`
    );

  if (
    endDate <
    startDate
  ) {
    backupError(
      `Backup Max tier override ${index + 1} has an invalid date range.`
    );
  }

  return {
    opportunity_key:
      text(
        row.opportunity_key,
        `Backup Max tier override ${index + 1} key`,
        {
          min: 1,
          max: 800
        }
      ),
    pokemon_name:
      text(
        row.pokemon_name,
        `Backup Max tier override ${index + 1} Pokémon/form`,
        {
          min: 1,
          max: 200
        }
      ),
    battle_variant:
      variant,
    start_date:
      startDate,
    end_date:
      endDate,
    max_battle_tier:
      number(
        row.max_battle_tier,
        `Backup Max tier override ${index + 1} tier`,
        {
          integer: true,
          min: 1,
          max: 6
        }
      ),
    max_particle_cost:
      number(
        row.max_particle_cost,
        `Backup Max tier override ${index + 1} Max Particle cost`,
        {
          integer: true,
          min: 1,
          max: 100000
        }
      ),
    updated_at:
      timestamp(
        row.updated_at,
        `Backup Max tier override ${index + 1} timestamp`
      )
  };
}

function normalizeResourceState(
  value
) {
  if (value == null) {
    return null;
  }

  const row =
    object(
      value,
      "Backup Battle resource state"
    );

  return {
    max_particles_held:
      number(
        row.max_particles_held,
        "Backup Max Particles held",
        {
          integer: true,
          min: 0,
          max: 1000000000
        }
      ),
    updated_at:
      timestamp(
        row.updated_at,
        "Backup Battle resource timestamp"
      )
  };
}

function normalizeResourceDaily(
  row,
  index
) {
  row =
    object(
      row,
      `Backup Battle resource day ${index + 1}`
    );

  return {
    local_date:
      date(
        row.local_date,
        `Backup Battle resource day ${index + 1} date`
      ),
    max_particles_collected:
      number(
        row.max_particles_collected,
        `Backup Battle resource day ${index + 1} collected MP`,
        {
          integer: true,
          min: 0,
          max: 1000000000
        }
      ),
    remote_max_passes_used:
      number(
        row.remote_max_passes_used,
        `Backup Battle resource day ${index + 1} Remote Max usage`,
        {
          integer: true,
          min: 0,
          max: 1000000000
        }
      ),
    updated_at:
      timestamp(
        row.updated_at,
        `Backup Battle resource day ${index + 1} timestamp`
      )
  };
}

function normalizeLegacyLog(
  row,
  index
) {
  row =
    object(
      row,
      `Backup legacy Raid log ${index + 1}`
    );

  const raidType =
    text(
      row.raid_type,
      `Backup legacy Raid log ${index + 1} participation`,
      {
        min: 1,
        max: 20
      }
    );

  if (
    ![
      "local",
      "remote"
    ].includes(
      raidType
    )
  ) {
    backupError(
      `Backup legacy Raid log ${index + 1} has unsupported participation.`
    );
  }

  return {
    id:
      safeId(
        row.id,
        `Backup legacy Raid log ${index + 1} id`
      ),
    pokemon_name:
      text(
        row.pokemon_name,
        `Backup legacy Raid log ${index + 1} Pokémon/form`,
        {
          min: 1,
          max: 200
        }
      ),
    raid_type:
      raidType,
    raid_count:
      number(
        row.raid_count,
        `Backup legacy Raid log ${index + 1} count`,
        {
          integer: true,
          min: 1,
          max: 99
        }
      ),
    progress_gained:
      number(
        row.progress_gained,
        `Backup legacy Raid log ${index + 1} progress`,
        {
          min: 0,
          max: 1000000
        }
      ),
    target_id:
      nullableTargetId(
        row.target_id,
        `Backup legacy Raid log ${index + 1} target id`
      ),
    target_before_value:
      number(
        row.target_before_value,
        `Backup legacy Raid log ${index + 1} target-before value`,
        {
          allowNull: true
        }
      ),
    target_after_value:
      number(
        row.target_after_value,
        `Backup legacy Raid log ${index + 1} target-after value`,
        {
          allowNull: true
        }
      ),
    local_date:
      date(
        row.local_date,
        `Backup legacy Raid log ${index + 1} date`
      ),
    created_at:
      timestamp(
        row.created_at,
        `Backup legacy Raid log ${index + 1} created timestamp`
      ),
    undone_at:
      timestamp(
        row.undone_at,
        `Backup legacy Raid log ${index + 1} undone timestamp`,
        {
          allowNull: true
        }
      )
  };
}

function normalizeBattleLog(
  row,
  index
) {
  row =
    object(
      row,
      `Backup Battle log ${index + 1}`
    );

  const system =
    text(
      row.battle_system,
      `Backup Battle log ${index + 1} system`,
      {
        min: 1,
        max: 20
      }
    );

  const variant =
    text(
      row.battle_variant,
      `Backup Battle log ${index + 1} variant`,
      {
        allowNull: true,
        max: 20
      }
    );

  const participation =
    text(
      row.participation,
      `Backup Battle log ${index + 1} participation`,
      {
        min: 1,
        max: 20
      }
    );

  if (
    ![
      "raid",
      "max"
    ].includes(
      system
    ) ||
    ![
      "local",
      "remote"
    ].includes(
      participation
    ) ||
    (
      system === "raid" &&
      variant != null
    ) ||
    (
      system === "max" &&
      ![
        "dynamax",
        "gigantamax"
      ].includes(
        variant
      )
    )
  ) {
    backupError(
      `Backup Battle log ${index + 1} has an unsupported battle identity.`
    );
  }

  const battleCount =
    number(
      row.battle_count,
      `Backup Battle log ${index + 1} battle count`,
      {
        integer: true,
        min: 1,
        max: 99
      }
    );

  const wins =
    number(
      row.wins,
      `Backup Battle log ${index + 1} wins`,
      {
        integer: true,
        min: 0,
        max: battleCount
      }
    );

  const maxParticleCost =
    number(
      row.max_particle_cost,
      `Backup Battle log ${index + 1} MP cost`,
      {
        allowNull: true,
        integer: true,
        min: 0,
        max: 100000
      }
    );

  const remotePasses =
    number(
      row.remote_passes_used,
      `Backup Battle log ${index + 1} Remote Passes`,
      {
        integer: true,
        min: 0,
        max: battleCount
      }
    );

  if (
    (
      system === "raid" &&
      (
        maxParticleCost != null ||
        Number(
          row.max_particles_spent
        ) !== 0
      )
    ) ||
    (
      participation === "local" &&
      remotePasses !== 0
    )
  ) {
    backupError(
      `Backup Battle log ${index + 1} has inconsistent battle resource fields.`
    );
  }

  return {
    id:
      safeId(
        row.id,
        `Backup Battle log ${index + 1} id`
      ),
    legacy_log_id:
      safeId(
        row.legacy_log_id,
        `Backup Battle log ${index + 1} legacy id`,
        {
          allowNull: true
        }
      ),
    pokemon_name:
      text(
        row.pokemon_name,
        `Backup Battle log ${index + 1} Pokémon/form`,
        {
          min: 1,
          max: 200
        }
      ),
    battle_system:
      system,
    battle_variant:
      variant,
    participation,
    battle_count:
      battleCount,
    wins,
    max_particle_cost:
      maxParticleCost,
    max_particles_spent:
      number(
        row.max_particles_spent,
        `Backup Battle log ${index + 1} MP spent`,
        {
          integer: true,
          min: 0,
          max: 1000000000
        }
      ),
    remote_passes_used:
      remotePasses,
    progress_gained:
      number(
        row.progress_gained,
        `Backup Battle log ${index + 1} progress`,
        {
          min: 0,
          max: 1000000
        }
      ),
    target_id:
      nullableTargetId(
        row.target_id,
        `Backup Battle log ${index + 1} target id`
      ),
    target_before_value:
      number(
        row.target_before_value,
        `Backup Battle log ${index + 1} target-before value`,
        {
          allowNull: true
        }
      ),
    target_after_value:
      number(
        row.target_after_value,
        `Backup Battle log ${index + 1} target-after value`,
        {
          allowNull: true
        }
      ),
    local_date:
      date(
        row.local_date,
        `Backup Battle log ${index + 1} date`
      ),
    created_at:
      timestamp(
        row.created_at,
        `Backup Battle log ${index + 1} created timestamp`
      ),
    undone_at:
      timestamp(
        row.undone_at,
        `Backup Battle log ${index + 1} undone timestamp`,
        {
          allowNull: true
        }
      )
  };
}

function requireUnique(
  rows,
  key,
  label
) {
  const seen =
    new Set();

  for (const row of rows) {
    const value =
      row[key];

    if (
      seen.has(value)
    ) {
      backupError(
        `${label} contains duplicate ${key} values.`
      );
    }

    seen.add(value);
  }
}

function requireUniqueDates(
  rows,
  label
) {
  requireUnique(
    rows,
    "local_date",
    label
  );
}

function requireBattleDailyBounds(
  rows
) {
  const counts =
    new Map();

  for (const row of rows) {
    const count =
      (
        counts.get(
          row.local_date
        ) ||
        0
      ) + 1;

    if (
      count >
      PLANNER_STORAGE_LIMITS
        .battle_logs_per_local_day
    ) {
      backupError(
        `Backup Battle history exceeds the ${PLANNER_STORAGE_LIMITS.battle_logs_per_local_day}-entry local-day restore limit.`
      );
    }

    counts.set(
      row.local_date,
      count
    );
  }
}

export function normalizePlannerBackup(
  input
) {
  const backup =
    object(
      input,
      "Planner backup"
    );

  if (
    backup.format !==
      PLANNER_BACKUP_FORMAT
  ) {
    backupError(
      "This file is not a Pokémon GO Planner backup."
    );
  }

  if (
    backup.version !==
      PLANNER_BACKUP_VERSION
  ) {
    backupError(
      `This Planner backup version is not supported. Expected version ${PLANNER_BACKUP_VERSION}.`
    );
  }

  timestamp(
    backup.exported_at,
    "Backup export timestamp"
  );

  const data =
    object(
      backup.data,
      "Backup data"
    );

  const targets =
    array(
      data.targets,
      "Backup targets",
      PLANNER_STORAGE_LIMITS.targets
    ).map(
      normalizeTarget
    );

  const remoteUsage =
    array(
      data.remote_raid_usage,
      "Backup Remote usage",
      25000
    ).map(
      normalizeRemoteUsage
    );

  const dailyBudgetOverrides =
    array(
      data.remote_raid_daily_budget_overrides,
      "Backup daily ceiling overrides",
      5000
    ).map(
      normalizeBudgetOverride
    );

  const maxOverrides =
    array(
      data.max_battle_cost_overrides,
      "Backup Max tier overrides",
      PLANNER_STORAGE_LIMITS.max_battle_cost_overrides
    ).map(
      normalizeMaxOverride
    );

  const resourceDaily =
    array(
      data.battle_resource_daily,
      "Backup Battle resource days",
      25000
    ).map(
      normalizeResourceDaily
    );

  const legacyLogs =
    array(
      data.raid_log,
      "Backup legacy Raid history",
      20000
    ).map(
      normalizeLegacyLog
    );

  const battleLogs =
    array(
      data.battle_log,
      "Backup Battle history",
      PLANNER_STORAGE_LIMITS.battle_logs_total
    ).map(
      normalizeBattleLog
    );

  requireUnique(
    targets,
    "id",
    "Backup targets"
  );
  requireUniqueDates(
    remoteUsage,
    "Backup Remote usage"
  );
  requireUniqueDates(
    dailyBudgetOverrides,
    "Backup daily ceiling overrides"
  );
  requireUnique(
    maxOverrides,
    "opportunity_key",
    "Backup Max tier overrides"
  );
  requireUniqueDates(
    resourceDaily,
    "Backup Battle resource days"
  );
  requireUnique(
    legacyLogs,
    "id",
    "Backup legacy Raid history"
  );
  requireUnique(
    battleLogs,
    "id",
    "Backup Battle history"
  );
  requireBattleDailyBounds(
    battleLogs
  );

  const targetIds =
    new Set(
      targets.map(
        row => row.id
      )
    );

  for (
    const row of [
      ...legacyLogs,
      ...battleLogs
    ]
  ) {
    if (
      row.target_id != null &&
      !targetIds.has(
        row.target_id
      )
    ) {
      backupError(
        "Backup history references a Target that is not present in the backup."
      );
    }
  }

  return {
    format:
      PLANNER_BACKUP_FORMAT,
    version:
      PLANNER_BACKUP_VERSION,
    exported_at:
      backup.exported_at,
    planner:
      normalizePlannerSettings(
        backup.planner
      ),
    data: {
      targets,
      remote_raid_usage:
        remoteUsage,
      remote_raid_daily_budget_overrides:
        dailyBudgetOverrides,
      max_battle_cost_overrides:
        maxOverrides,
      battle_resource_state:
        normalizeResourceState(
          data.battle_resource_state
        ),
      battle_resource_daily:
        resourceDaily,
      raid_log:
        legacyLogs,
      battle_log:
        battleLogs
    }
  };
}

export function chunkJsonRows(
  rows,
  maxBytes =
    PLANNER_BACKUP_JSON_CHUNK_BYTES
) {
  if (!rows.length) {
    return [];
  }

  const encoder =
    new TextEncoder();
  const chunks = [];
  let current = [];
  let currentBytes = 2;

  for (const row of rows) {
    const serialized =
      JSON.stringify(row);

    const rowBytes =
      encoder.encode(
        serialized
      ).byteLength;

    if (
      rowBytes + 2 >
      maxBytes
    ) {
      backupError(
        "One backup record is too large to restore safely."
      );
    }

    const separator =
      current.length
        ? 1
        : 0;

    if (
      current.length &&
      currentBytes +
        separator +
        rowBytes >
        maxBytes
    ) {
      chunks.push(
        current
      );
      current = [];
      currentBytes = 2;
    }

    current.push(row);
    currentBytes +=
      (
        current.length > 1
          ? 1
          : 0
      ) +
      rowBytes;
  }

  if (current.length) {
    chunks.push(
      current
    );
  }

  return chunks;
}

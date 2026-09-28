export const REQUIRED_SCHEMA = Object.freeze({
  tables: {
    users: ["id","manage_hash","feed_hash","timezone","included_sources","pve_weight","pvp_weight","collector_weight","remote_raid_budget","remote_raid_min_score","created_at","updated_at"],
    feed_link_credentials: ["user_id","signed_generation","signed_enabled","updated_at"],
    targets: ["id","user_id","pokemon_name","target_type","battle_kind","target_value","current_value","expected_progress_per_raid","priority","completed","notes","created_at","updated_at"],
    events: ["id","source_type","source_uid","summary","description","dtstart_line","dtend_line","other_lines","start_date","end_date","source_url","content_hash","sequence","status","updated_at"],
    pokemon_meta: ["pokemon_name","pve_score","pvp_score","rarity_score","mega_score","overall_score","verdict","notes","updated_at"],
    meta_sources: ["id","pokemon_name","source_name","source_url","note","updated_at"],
    sync_source_health: ["source_key","source_group","source_label","source_url","last_attempt_at","last_success_at","last_error","item_count","updated_at"],
    remote_raid_usage: ["user_id","local_date","raids_used","updated_at"],
    remote_raid_limit_overrides: ["id","event_name","start_date","end_date","remote_raid_limit","source_url","active","updated_at","is_unlimited","detected_automatically","source_excerpt","detected_at"],
    event_suppression_rules: ["id","event_name","start_date","end_date","suppressed_source_types","note","source_url","active","detected_automatically","source_excerpt","updated_at"],
    remote_raid_daily_budget_overrides: ["user_id","local_date","budget_override","updated_at"],
    max_battle_cost_overrides: ["user_id","opportunity_key","pokemon_name","battle_variant","start_date","end_date","max_battle_tier","max_particle_cost","updated_at"],
    battle_resource_state: ["user_id","max_particles_held","updated_at"],
    battle_resource_daily: ["user_id","local_date","max_particles_collected","remote_max_passes_used","updated_at"],
    raid_log: ["id","user_id","pokemon_name","raid_type","raid_count","progress_gained","target_id","target_before_value","target_after_value","local_date","created_at","undone_at"],
    battle_log: ["id","legacy_log_id","user_id","pokemon_name","battle_system","battle_variant","participation","battle_count","wins","max_particle_cost","max_particles_spent","remote_passes_used","progress_gained","target_id","target_before_value","target_after_value","local_date","created_at","undone_at"]
  },
  indexes: [
    "idx_events_source","idx_events_dates","idx_events_status","idx_meta_sources_pokemon",
    "idx_sync_source_health_group","idx_remote_raid_limit_dates","idx_event_suppression_dates",
    "idx_remote_raid_daily_budget_overrides_date","idx_max_battle_cost_overrides_dates",
    "idx_battle_resource_daily_date","idx_battle_log_user_date"
  ],
  triggers: ["battle_log_apply","battle_log_undo"],
  views: ["unified_battle_log"]
});

export const SCHEMA_COMPONENT_HASH_ALGORITHM = "sha256";

export function requiredSchemaComponentIdentifiers(required = REQUIRED_SCHEMA) {
  const identifiers = [];

  for (const [table, columns] of Object.entries(required.tables || {})) {
    identifiers.push(`table:${table}`);
    for (const column of columns || []) {
      identifiers.push(`column:${table}.${column}`);
    }
  }

  for (const index of required.indexes || []) {
    identifiers.push(`index:${index}`);
  }
  for (const trigger of required.triggers || []) {
    identifiers.push(`trigger:${trigger}`);
  }
  for (const view of required.views || []) {
    identifiers.push(`view:${view}`);
  }

  return [...new Set(identifiers)].sort();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function schemaContractFingerprint(required = REQUIRED_SCHEMA) {
  return sha256Hex(
    requiredSchemaComponentIdentifiers(required).join("\n")
  );
}

export async function hashSchemaComponentIdentifiers(identifiers = []) {
  const pairs = await Promise.all(
    [...new Set(identifiers.map(value => String(value)))].sort()
      .map(async identifier => [
        identifier,
        await sha256Hex(identifier)
      ])
  );

  return new Map(pairs);
}

export async function evaluateSchemaComponentHashes(
  componentHashes = [],
  required = REQUIRED_SCHEMA
) {
  const present = new Set(
    (componentHashes || []).map(value => String(value).toLowerCase())
  );
  const requiredHashes =
    await hashSchemaComponentIdentifiers(
      requiredSchemaComponentIdentifiers(required)
    );

  const missing = [];
  for (const [identifier, hash] of requiredHashes) {
    if (!present.has(hash)) {
      missing.push(identifier);
    }
  }

  return {
    monitor_ok: missing.length === 0,
    status: missing.length === 0 ? "compatible" : "incompatible",
    missing_count: missing.length,
    missing_components: missing
  };
}

export async function inspectSchemaComponentHashes(db) {
  const { results: objects = [] } = await db.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all();

  const identifiers = [];
  const tableNames = [];

  for (const row of objects || []) {
    const type = String(row?.type || "").toLowerCase();
    const name = String(row?.name || "");

    if (!name || !["table", "index", "trigger", "view"].includes(type)) {
      continue;
    }

    identifiers.push(`${type}:${name}`);
    if (type === "table") {
      tableNames.push(name);
    }
  }

  for (const table of tableNames.sort()) {
    const escapedTable = table.replace(/"/g, '""');
    const { results: columns = [] } = await db.prepare(
      `PRAGMA table_info("${escapedTable}")`
    ).all();

    for (const column of columns || []) {
      const name = String(column?.name || "");
      if (name) {
        identifiers.push(`column:${table}.${name}`);
      }
    }
  }

  const hashes =
    await hashSchemaComponentIdentifiers(identifiers);

  return {
    status: "available",
    algorithm: SCHEMA_COMPONENT_HASH_ALGORITHM,
    component_count: hashes.size,
    component_hashes: [...hashes.values()].sort()
  };
}

export function evaluateSchemaCompatibility(objects = [], columnsByTable = {}) {
  const objectKeys = new Set(
    (objects || []).map(row => `${String(row.type || "").toLowerCase()}:${String(row.name || "")}`)
  );
  const missing = [];

  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA.tables)) {
    if (!objectKeys.has(`table:${table}`)) {
      missing.push(`table:${table}`);
      continue;
    }
    const present = new Set((columnsByTable[table] || []).map(row => String(row.name || "")));
    for (const column of columns) {
      if (!present.has(column)) missing.push(`column:${table}.${column}`);
    }
  }

  for (const index of REQUIRED_SCHEMA.indexes) {
    if (!objectKeys.has(`index:${index}`)) missing.push(`index:${index}`);
  }
  for (const trigger of REQUIRED_SCHEMA.triggers) {
    if (!objectKeys.has(`trigger:${trigger}`)) missing.push(`trigger:${trigger}`);
  }
  for (const view of REQUIRED_SCHEMA.views) {
    if (!objectKeys.has(`view:${view}`)) missing.push(`view:${view}`);
  }

  return {
    monitor_ok: missing.length === 0,
    status: missing.length === 0 ? "compatible" : "incompatible",
    missing_count: missing.length,
    missing_components: missing
  };
}

export async function inspectSchemaCompatibility(db) {
  const { results: objects = [] } = await db.prepare(`
    SELECT type, name
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
  `).all();

  const columnsByTable = {};
  for (const table of Object.keys(REQUIRED_SCHEMA.tables)) {
    const { results = [] } = await db.prepare(
      `PRAGMA table_info("${table}")`
    ).all();
    columnsByTable[table] = results;
  }

  return evaluateSchemaCompatibility(objects, columnsByTable);
}

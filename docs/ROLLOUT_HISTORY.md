# Historical rollout and migration reference

> **Historical reference — do not execute these commands as a current deployment checklist.**

This document preserves one-time rollout notes that shipped during earlier implementation stages of Pokémon GO Battle Planner. It exists for auditability, incident investigation, and upgrades of genuinely older installations.

For **current** setup and deployment guidance, use [README.md](../README.md). For a **fresh** D1 database, `schema.sql` is the authoritative baseline; do not initialize from `schema.sql` and then replay these numbered migrations on top of it.

Before applying any historical migration to an existing database, inspect that database and confirm which schema change is actually missing. In particular, `migrations/0003_target_battle_kind.sql` uses `ALTER TABLE ... ADD COLUMN` and is intentionally one-time/non-repeatable.

## Retained migration inventory

- `0001_battle_resources.sql` — adds Battle resource state/daily tables and index with `IF NOT EXISTS`.
- `0002_battle_logging.sql` — adds unified Battle logging, compatibility structures, and apply/Undo triggers for older installations.
- `0003_target_battle_kind.sql` — one-time `ALTER TABLE` that adds Target battle identity; **do not rerun** after the column exists.
- `0004_schema_baseline_operational_tables.sql` — idempotent repair migration for verified operational tables/indexes.
- `0005_max_battle_cost_overrides.sql` — additive per-planner Max Battle tier/cost fallback table and index.
- `0006_sync_source_health.sql` — additive synchronization-source health table and index.
- `0007_feed_link_credentials.sql` — additive signed-calendar generation/revocation state.

The presence of a file in `migrations/` does **not** mean it should be run now. A current release that requires a migration must name that migration explicitly in its rollout notes.

## Archived Part-by-Part rollout notes

The material below is preserved from the README as implementation-stage history. Statements about what was “new,” required immediately after a particular merge, or needed before a particular Worker/UI rollout refer to that historical stage. Later architecture and behavior decisions are recorded in [docs/DECISIONS.md](DECISIONS.md).

## Part 4: unified Battle logging

The Battle logger records ordinary Raids, Dynamax and Gigantamax separately. Recommendations prefill battle identity, participation eligibility and confidently known MP costs. Unknown or estimated costs remain blank and must be supplied for wins. Actual target progress stays editable. For Max Battles, enter attempts, wins and actual Remote Passes consumed; same-boss retries can use fewer passes than attempts. Log groups with different MP costs separately.

Official rules checked on 17 September 2026:

- [Niantic: Joining Battles Remotely](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2487-joining-battles-remotely/) confirms Remote Max Battles use a Remote Raid Pass plus the same MP cost as local participation. The pass is consumed when battle starts, including a loss; eligible retries against the same boss do not consume another pass.
- [Pokémon GO: Max Battles](https://pokemongo.com/max-pokemon-battle) confirms MP is spent only after defeating the boss. The logger therefore deducts MP for wins and records pass consumption separately.
- The Part 4 implementation initially kept ordinary Remote Raid and Remote Max numeric usage separate while the official relationship was unclear. That historical choice was superseded in PR #27: ordinary Remote Raids and Remote Max Battles now consume one shared official daily Remote participation ceiling, while their underlying ledgers remain separate for auditability. Temporary increases and unlimited windows apply to the combined usage.

### Required D1 migration

`migrations/0002_battle_logging.sql` is required because aggregate Part 3 resource counters cannot preserve each transaction's battle identity, pass/MP deltas and reversible target progress. It adds a durable `battle_log` table, an index, atomic apply/Undo triggers and a unified history view. It reuses `battle_resource_state`, `battle_resource_daily` and ordinary `remote_raid_usage`. `schema.sql` includes the same additions for fresh databases.

The migration uses `CREATE IF NOT EXISTS` and does not replay history or attach triggers to the historical `raid_log` table. Historical Undo imports and reverses one old row in a single D1 batch. New Undo reverses the original deltas and original usage date atomically; repeated requests are harmless. Conflicting manual corrections or deleted targets reject the entire Undo rather than partially refunding resources. MP refunds are not clamped, so later collection cannot cause a lossy Undo.

After merge, an authorized operator must apply **only** the new migration to production using the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0002_battle_logging.sql
```

This command is a manual production step, not part of tests or this PR's execution. Part 3 migration `0001_battle_resources.sql` must already be applied. The additive migration is compatible with the old Worker; if the new Worker arrives first, logging returns an actionable migration-required error until the migration is applied. Do not initialize production with the full `schema.sql`.

`/api/battle-log` and `/api/battle-log/undo` serve the unified logger; the existing `/api/raid-log` paths remain aliases. No Worker deployment settings change. CSS references are bumped to v33 on all four public pages. The deterministic suite includes actual SQLite transaction tests (Node 22.13+ or Node 24), API compatibility, resource/Undo regressions, UI contracts and inline JavaScript syntax checks.

## Part 5: Targets integration

Targets now distinguish ordinary Raids, Dynamax and Gigantamax. Add a target from a recommendation, or choose its battle type in the editor. Max goals default to battles won; Candy, Candy XL and editable custom progress remain supported. A matching existing recommendation target opens Edit. Existing targets can correct Pokémon/form, battle type, and target type while keeping the same stable target ID so historical battle-log/Undo links remain attached. Duplicate identity changes are rejected. The logger offers a goal selector when several goals match the same battle.

Matching uses the exact Pokémon/form plus battle identity across recommendations, current/upcoming availability, calendar personalization and logging. A Raid target never automatically receives Max progress. Explicitly named legacy Max targets retain that identity; otherwise historical targets remain Raid targets. New Max targets use capability-prefixed names (for example, Gigantamax Gengar) so separate goals coexist under the existing per-user/name/goal uniqueness rule. No existing name, ID or progress is rewritten.

When several goals match, recommendations prioritize active targets, then personal priority, with a stable goal/ID tie-break. The logger initially selects that target, but the user can select another matching goal and edit actual progress. Completed/Skip goals retain their planning exclusions. Battle-count goals use wins, not failed attempts. The planner does not automatically mark targets complete.

Battle and availability filters participate in the existing Active/Completed/All counts. Max Target cards omit ordinary Raid attacker information and never substitute a base sprite for a missing exact form. The Target editor and logger retain visible actions at narrow mobile sizes; CSS references are v34. Single-target deletion now reports progress/failure inline in Targets: a failed delete preserves the current tab, search/filter context, and target card, while a successful delete reloads state as before.

### Part 5 migration and rollout

`migrations/0003_target_battle_kind.sql` adds one nullable, constrained `targets.battle_kind` column. It preserves Target IDs and historical Raid foreign keys without rebuilding tables. It does not change Part 4 logs or resource tables. `schema.sql` includes the column for fresh databases.

Apply the migration **once**, after merge and production authorization, with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0003_target_battle_kind.sql
```

Unlike the CREATE-based Part 4 migration, SQLite ADD COLUMN is not repeatable. Check `PRAGMA table_info(targets)` first if application status is uncertain. Do not apply it again to a database already containing `battle_kind`, including a fresh database initialized with the new schema. Before migration, reads retain legacy identity inference and Target saves return an actionable 503.

Editing preserves a target's stable ID and history link, but Pokémon/form, battle type, and target type can now be corrected in place. A change that would collide with another existing target is rejected instead of merging/resetting progress. Progress, desired amount, expected progress, priority, completion and notes remain editable.

The Part 5 suite covers migration/FK preservation, separate same-species goals, CRUD/authentication, duplicate protection, form matching, recommendations, suppression-aware availability, allocation caps, editable progress and Undo, and filtered UI counts. No production migration, merge or deployment is part of Part 5 PR preparation.

### Schema baseline reconciliation

`schema.sql` is the supported fresh-database baseline. On 18 September 2026, the production D1 schema was inspected directly and confirmed to contain `event_suppression_rules`, `remote_raid_daily_budget_overrides`, `idx_event_suppression_dates`, and `idx_remote_raid_daily_budget_overrides_date`. The repository baseline now carries those verified definitions.

`migrations/0004_schema_baseline_operational_tables.sql` is an idempotent repair migration for an existing installation that is missing either operational table or explicit index. It uses only `CREATE ... IF NOT EXISTS`, so it preserves existing rows and objects. The current production database already contains all four verified objects, so BL-001 does **not** require applying migration 0004 to production.

For another installation, inspect `sqlite_schema` first. If any of the four objects are missing, apply the migration with the existing D1 binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0004_schema_baseline_operational_tables.sql
```

Fresh databases should be initialized from `schema.sql`, not by replaying production migrations.

### Max Battle tier override migration

`migrations/0005_max_battle_cost_overrides.sql` adds private per-user, per-opportunity Max Battle tier/cost fallback data. It is additive and uses `CREATE ... IF NOT EXISTS`. Apply it to an existing production D1 database before deploying the Worker/UI that exposes **Set Max tier…**:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0005_max_battle_cost_overrides.sql
```

The override is used only when automatic cost evidence is unavailable. It does not replace official event evidence or trusted current tier data.

### Sync source health migration

`migrations/0006_sync_source_health.sql` adds per-source synchronization health for event feeds, official schedules, and meta inputs. It stores the latest attempt, latest successful attempt, last error, and last successful item count. The migration is additive and idempotent.

Apply it to an existing production D1 database with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0006_sync_source_health.sql
```

The Worker is intentionally backward compatible with deployment order: if the new Worker runs before migration 0006 is applied, synchronization continues and the Planner falls back to its legacy freshness timestamps. Once the table exists and the next synchronization runs, per-source health begins populating automatically.

### Credential rotation migration

`migrations/0007_feed_link_credentials.sql` adds per-planner generation/enable state for the preferred signed calendar subscription. It is additive and idempotent.

Apply it to an existing production D1 database with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0007_feed_link_credentials.sql
```

Deployment order is safe. Before migration 0007 exists, every existing generation-0 signed URL keeps working exactly as before and the Planner disables signed-feed rotation controls. After the migration is applied, regenerating or revoking the preferred signed URL advances only that planner's generation and immediately invalidates its previous signed URL. Legacy `/calendar/<random-token>.ics` subscriptions remain independently compatible until the existing legacy-revoke control is used. Management-link rotation does not require migration 0007 and does not alter either calendar credential.

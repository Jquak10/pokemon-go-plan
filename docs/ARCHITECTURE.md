# Pokémon GO Planner Architecture

Last reviewed: 18 September 2026
Baseline: main at 5625d20614e2e2b1c20290085b3ac617ccaa441c

This document is the durable technical reference for the current Pokémon GO Planner. It describes how the application is built today, the invariants future changes must preserve, the data model, source precedence, Battle Plan behavior, resource accounting, and deployment workflow.

For why the system was shaped this way and which older approaches were superseded, read docs/DECISIONS.md.

## 1. Product purpose

Pokémon GO Planner is a private, personalized gameplay-planning application for Pokémon GO. It combines current event availability, Raid and Max Battle intelligence, personal collection/progress goals, Remote participation limits, Max Particle state, battle logging, Hundo CP calculations, and a private calendar feed.

The product deliberately optimizes for player decisions rather than maximizing activity. Official daily limits are ceilings, not spending targets. Unused Remote capacity is valid and often desirable when current opportunities do not clear the user's value threshold or when stronger future opportunities justify saving resources.

The production repository is Jquak10/pokemon-go-plan. The production branch is main. Hosting is Cloudflare Workers with Cloudflare D1. The vanity production URL is https://pogo-plan.jquak-10.workers.dev.

## 2. Architectural principles

The following principles are system invariants, not optional UI preferences.

1. Current source of truth comes from the newest repository main plus current authoritative Pokémon GO data.
2. Official Pokémon GO schedules outrank replacement/suppression notices, which outrank normalized GO Calendar data.
3. Missing availability is not invented. Derived availability is allowed only where the derivation rule is explicit, testable, and source-bounded.
4. Raid and Max Battle are sibling battle systems. Max Battles are not modeled as Raids.
5. Dynamax and Gigantamax are capabilities/battle variants. They do not erase the underlying Pokémon or form identity.
6. Battle form and catch encounter form are separate concepts. Raid-boss stats are never reused for the caught base form's Hundo CP.
7. Pokémon forms are exact. A missing exact sprite is preferable to a wrong sprite.
8. Remote capacity is a ceiling. Planner recommendations may deliberately leave capacity unused.
9. Remote Raid and eligible Remote Max participation share the official daily Remote participation limit, while the underlying ledgers remain separate for auditability.
10. Max Particles and Remote Passes are scarce resources and must be modeled explicitly.
11. Battle logging and Undo must be transactionally reversible.
12. Targets are battle-aware and exact-form aware. Raid progress never silently updates a Max goal, and vice versa.
13. Mobile and desktop are intentionally different experiences, not merely scaled versions of the same layout.
14. Calendar subscription URLs and management URLs are bearer credentials and must be treated as secrets.

## 3. Runtime topology

The system is a single Cloudflare Worker backed by D1 and static assets.

Browser or calendar client
→ Cloudflare Worker
→ API, management, calendar, and admin routes
→ Cloudflare D1

The Worker also serves static assets from public through the ASSETS binding.

wrangler.jsonc currently configures:

- Worker entry point: src/index.js
- Static asset directory: public
- D1 binding: DB
- D1 database name: pokemon-go-calendar-db
- Worker-first routes: /api/*, /calendar/*, /manage/*, /admin
- Observability enabled
- Three six-hour Cron schedules: 23 */6 * * *, 33 */6 * * *, and 43 */6 * * *

Those staggered schedules separate event synchronization, official-rule synchronization, and meta/ranking work so expensive external-source work does not all start at the same minute.

Do not replace wrangler.jsonc with a generic starter. D1 binding names, routes, Cron jobs, and deployment configuration are production-critical.

## 4. Frontend structure

The frontend is static HTML/CSS/JavaScript served by the Worker.

- public/index.html: planner creation and public landing page
- public/manage.html: personalized Planner application
- public/admin.html: administrator data/synchronization interface
- public/sources.html: source precedence and data-source information
- public/styles.css: shared responsive styles
- public/battle-targets.js: browser-side shared Target identity helpers

public/manage.html is intentionally a large self-contained application surface. It contains the Planner navigation, Battle Plan, Targets, Hundo CP, Calendar, Preferences, battle logger, quick actions, responsive behavior, and client-side API integration.

When public/styles.css changes, every public page's stylesheet cache reference must be bumped. The current cache generation after Part 8 is v36.

## 5. Backend modules

src/index.js remains the main Worker and orchestration layer. Specialized behavior has been split into focused modules as the application grew.

- src/battle-opportunities.js
  - Raid versus Max source classification
  - Dynamax/Gigantamax identity
  - Max rotation derivation
  - Battle presentation metadata
  - encounter identity and sprite policy

- src/battle-targets.js
  - shared Target matching helpers used by the Worker

- src/battle-logging.js
  - battle-log validation
  - Raid/Max identity checks
  - Max attempts/wins/pass/MP validation
  - idempotent create
  - transactional Undo integration and legacy-log compatibility

- src/resource-planning.js
  - shared Remote Pass allocation
  - Max Particle limits and costs
  - current-versus-future opportunity cost
  - Max-specific planning value
  - personal ceiling and threshold handling

- src/raid-rankings.js
  - type-specific Raid attacker ranking
  - form-family scoping
  - regional/Shadow/Crowned rules
  - current method version: raid-rank-v3-form-scope-dedupe

- src/max-rankings.js
  - Max-specific attacker intelligence
  - Max-eligibility evidence
  - bulk/survivability-aware ranking
  - current method version: max-rank-v2-event-eligibility-bulk

- src/remote-raid-rules.js
  - exact official Remote-limit time-window parsing
  - named timezone and UTC/GMT offset handling
  - projection into the user's IANA timezone
  - date-only fallback when exact timing cannot be trusted

## 6. Identity and access model

The Planner does not use a conventional email/password account system.

Each user/planner has:

- a private management capability
- a separate private read-only calendar capability
- a configured timezone
- event-source selections
- recommendation weights
- Remote planning preferences

D1 stores hashes rather than exposing raw bearer tokens. Feed signing uses the configured FEED_LINK_KEY. Administrator operations use ADMIN_KEY.

Never request, print, log, commit, or paste:

- ADMIN_KEY
- FEED_LINK_KEY
- GitHub personal access tokens
- Cloudflare secrets
- private management URLs
- private ICS/calendar URLs

Legacy calendar URLs remain supported for compatibility, while the preferred subscription uses a recoverable signed feed. Revocation behavior must preserve the preferred signed subscription while allowing older token-based URLs to be invalidated.

## 7. Core D1 model

schema.sql is the checked-in fresh-database baseline for the principal Planner tables. Existing production databases have evolved through additive migrations.

### users

Stores planner identity and preferences:

- id
- manage_hash
- feed_hash
- timezone
- included_sources
- PvE/PvP/collector weights
- remote_raid_budget
- remote_raid_min_score
- timestamps

### targets

Stores collection/progress goals:

- Pokémon/form name
- goal type
- battle_kind: raid, dynamax, or gigantamax
- current and target values
- expected progress per battle
- priority
- completed flag
- notes
- timestamps

battle_kind is nullable for historical compatibility. Legacy unqualified rows continue to mean ordinary Raid unless explicit Max identity can be inferred.

### events

Normalized calendar/event storage:

- source_type
- source_uid
- summary and description
- original DTSTART/DTEND lines
- other ICS lines
- normalized start/end dates
- source URL
- content hash
- sequence
- active/stale status

Keeping raw ICS date lines is important because RFC 5545 all-day DTEND is exclusive and because exact event representation is needed for feed regeneration and dedupe.

### pokemon_meta and meta_sources

pokemon_meta stores shared analytical values such as PvE, PvP, rarity, Mega utility, overall score, verdict, and notes.

meta_sources stores provenance and versioned generated profiles, including Raid and Max attacker ranking JSON.

Generated ranking methods are versioned. A method mismatch invalidates the cached profile immediately rather than presenting an old methodology as current.

### remote_raid_usage

Stores the ordinary Remote Raid portion of daily Remote participation usage by user/date.

### remote_raid_limit_overrides

Stores temporary official Remote-limit changes and unlimited windows, including:

- source dates
- numeric limit or unlimited flag
- source URL
- saved official source excerpt
- automatic-detection flag
- detection timestamp

The saved source excerpt is intentionally retained because exact event clock times/timezones can be reparsed without a schema migration.

### battle_resource_state

Stores the user's persistent Max Particle balance.

### battle_resource_daily

Stores per-user/per-day Max resource state:

- Max Particles collected
- Remote Max passes/participations used

The ordinary Raid and Remote Max daily ledgers remain separate physically, but planning sums them before applying the shared official daily Remote limit.

### raid_log

Historical Raid-only log retained for backward compatibility.

### battle_log

Current unified log for Raid and Max Battles:

- battle system
- Dynamax/Gigantamax variant where applicable
- local/remote participation
- battle attempts
- wins
- Max Particle cost per win
- total MP spent
- Remote Passes consumed
- Target progress delta
- before/after Target values
- user-local date
- timestamps and Undo state

### unified_battle_log

View combining the new battle_log with untouched historical raid_log rows.

### Operational tables used by the Worker

The current Worker also expects operational D1 tables named event_suppression_rules and remote_raid_daily_budget_overrides. These are used for source suppression and one-day personal Remote-budget overrides.

Important repository-maintenance note: at the 18 September 2026 baseline, those operational tables are referenced by src/index.js but are not represented in the three checked-in migrations or the current schema.sql snapshot. Production already depends on them. A future fresh-database/schema cleanup should reconcile this gap before treating schema.sql as a complete rebuild artifact. Do not create an unreviewed migration merely from this note.

## 8. Migration history

The checked-in additive migrations are:

### 0001_battle_resources.sql

Adds battle_resource_state and battle_resource_daily for Max Particle and Remote Max accounting.

### 0002_battle_logging.sql

Adds battle_log, transactional apply/Undo triggers, and unified_battle_log. It preserves raid_log and does not replay historical activity.

The apply trigger atomically:

- validates the Target
- checks available MP
- records before/after Target values
- advances Target progress
- deducts MP
- updates the ordinary Remote Raid ledger for Raid logs
- updates the Remote Max ledger for Max logs

The Undo trigger reverses the original deltas and rejects inconsistent partial Undo.

### 0003_target_battle_kind.sql

Adds nullable targets.battle_kind without rebuilding Target IDs or breaking historical log foreign keys.

Because SQLite ADD COLUMN is not repeatable, migration state must be checked before reapplying it.

## 9. Event ingestion and source precedence

The application ingests normalized event feeds from GO Calendar release assets and also scans official Pokémon GO pages for higher-priority corrections and rules.

The GO Calendar source families include:

- community_day
- event
- go_battle_league
- go_pass
- max_battles
- max_mondays
- pokemon_go_fest
- pokemon_spotlight_hour
- raid_battles
- raid_day
- raid_hour
- research
- season

The default user-facing source set focuses on gameplay/event categories relevant to the Planner.

Source precedence is:

1. explicit official Pokémon GO schedule
2. official replacement/suppression notice
3. normalized GO Calendar data
4. no invented availability

An official supplement can add an availability record missing from GO Calendar. A suppression rule can hide lower-priority scheduled entries during an official replacement window without deleting the underlying event or Pokémon meta.

Suppression must affect:

- Calendar display
- ICS output
- current availability
- recommendations
- Target availability
- Remote allocation

Suppression must not delete shared Pokémon meta.

## 10. Event lifecycle and date correctness

Event rows can become stale when an upstream feed no longer includes them. Stale storage is not equivalent to current availability.

The Planner includes several defensive rules:

- RFC 5545 all-day DTEND is treated as exclusive and converted to an inclusive internal end date.
- Current recommendations reject events whose effective end date has already passed.
- Stale rows may remain available for historical/recent calendar continuity but must not create current battle recommendations outside their true window.
- Official supplements sort ahead of normalized feed rows.
- Event dedupe uses source identity plus normalized battle identity where necessary.

Timezone-sensitive game rules must use the user's configured timezone, not the calendar date printed in an announcement.

## 11. Remote-limit rules

The standard official Remote Raid participation limit is currently 10 per day, with special events able to increase or remove the limit.

The Planner's current domain rule is that eligible Remote Raids and eligible Remote Max Battles consume the same official daily Remote participation limit.

The implementation keeps two underlying ledgers:

- remote_raid_usage.raids_used
- battle_resource_daily.remote_max_passes_used

remoteBattleUsageForDate sums them. The sum is what Battle Plan compares with the official daily ceiling.

This preserves auditability while making the player-facing capacity correct.

Temporary official limits are automatically detected from official event text. Since announcements can use PDT/PST or another explicit zone while the user is in Singapore or elsewhere, src/remote-raid-rules.js parses exact time windows where possible and converts them to UTC before projecting into the user's IANA timezone.

For today's rule, applicability is checked against the current instant. For future forecast dates, the system detects local-date overlap. If an exact timezone/time cannot be safely parsed, date-only behavior is retained rather than guessing.

This is why an announcement beginning 18 September at 5:00 p.m. PDT can correctly remain at 10 for all of 18 September Singapore time and only become 20 when the actual converted instant arrives.

## 12. Battle opportunity model

The application recognizes two first-class battle systems.

### Raid

Includes ordinary Raids, Mega Raids, Primal Raids, Shadow form identity where explicitly applicable, and special Raid forms.

Raid battle weaknesses use the boss battle form.

The post-battle catch encounter may be a different/base form. Catch/Hundo calculations use the actual encounter identity rather than Mega/Primal battle stats.

### Max Battle

Includes Dynamax and Gigantamax at Power Spots.

Max source families are max_battles, max_mondays, and internal max_rotation.

For Max-source events:

- explicit Gigantamax or G-Max text produces gigantamax
- explicit Dynamax produces dynamax
- otherwise the standard Max-source default is dynamax

Gigantamax is exceptional and must be explicit. Dynamax is the standard Max capability.

The underlying encounter/species/form identity remains separate from the capability prefix.

## 13. Weekly Max rotation and special-event isolation

GO Calendar's max_battles feed represents special Max events, while ordinary weekly Power Spot rotation availability can be absent from the latest feed after its Max Monday has passed.

To close that availability gap, the Planner has an internal source_type named max_rotation.

max_rotation is derived only from retained/current max_mondays rows:

- starts on the Max Monday date
- ends six days later
- creates a standard Dynamax weekly availability record

Critical isolation rules:

- max_battles special events are never stretched into weekly rotations
- Gigantamax/G-Max Max Monday entries are never stretched into a standard weekly rotation
- special events such as Gigantamax Cinderace Max Battle Day remain their own timed event
- the original max_mondays event remains its own timed event
- max_rotation is internal planning/availability data, not an additional user-selectable calendar source

These rules are regression-tested because special-event contamination would create false availability.

## 14. Pokémon/form matching

A battle card must not disappear merely because pokemon_meta has not yet been backfilled.

Battle-event matching therefore uses:

1. exact/current pokemon_meta
2. matching user Targets
3. current Pokémon GO API Pokédex fallback

The Pokédex fallback is cached per Worker isolate and must fail safely. An upstream Pokédex fetch failure must not break /api/me.

Form matching favors the more specific identity. Base-form Targets are not transferred to unrelated specific forms by substring.

Regional forms, Crowned forms, Origin forms, Mega/Primal forms, Shadow forms, Dynamax/Gigantamax capability, and costumes must remain separate when their battle/catch semantics differ.

## 15. Sprite policy

Primary sprite data comes from Pokémon GO API assets.

Rules:

- ordinary Dynamax may use the exact underlying species/form sprite plus a Dynamax badge
- Gigantamax requires an exact Gigantamax asset
- if an exact Gigantamax sprite is unavailable, show no sprite rather than a base-form substitute
- explicit Shadow identity remains visually explicit even if a separate static Shadow asset is unavailable
- never substitute a regional form for a normal form or vice versa

Mega Raichu X/Y and other new/special forms follow the same policy: exact asset or no asset.

## 16. Recommendation system

The recommendation engine combines global analytical value with user goals.

Inputs include:

- PvE value
- PvP value when weighted by the user
- rarity/collection value
- Mega utility where relevant
- user priority
- completion status
- current/remaining Target progress
- availability
- Remote eligibility
- battle-system-specific performance intelligence

The recommendation score is not a command to spend. It is one input to the resource allocator.

Priority presentation uses:

- MUST RAID
- HIGH PRIORITY
- RECOMMENDED
- OPTIONAL
- SKIP

The Planner can still allocate zero paid Remote uses to a high-scoring boss because completed/Skip goals, remaining-resource constraints, future opportunity cost, or the user's minimum score can block allocation.

## 17. Raid attacker intelligence

Raid rankings are computed from current Pokémon GO API/GameMaster-backed stats and moves rather than copied from a static editorial tier list.

The ranking system:

- finds optimal fast + charged move pairings per attack type
- compares battle-distinct variants deliberately
- keeps normal/Mega/Primal form families scoped correctly
- excludes unrelated regional variants from normal-form comparisons
- keeps regional requests within the same regional family
- keeps explicit Shadow targets exact-only
- deduplicates repeated API representations
- handles Crowned Zacian/Zamazenta transformation moves
- resolves plain Zacian/Zamazenta toward appropriate Hero identity when needed
- invalidates old cached profiles when RAID_RANK_METHOD_VERSION changes

Current method: raid-rank-v3-form-scope-dedupe.

## 18. Max attacker intelligence

Normal Raid DPS rankings are not reused as Max performance.

Max rankings are a separate system because Max Battles value:

- Max Attack type from the selected Fast Attack
- attack pressure during Max phases
- normal Fast/Charged pressure between Max phases
- bulk/survivability more heavily than ordinary Raid DPS
- exact Pokémon/form eligibility for Max Battles

Eligibility requires explicit historical/current Max Battle evidence. A Pokémon is not assumed Dynamax-capable merely because it exists in the Pokédex.

Current method: max-rank-v2-event-eligibility-bulk.

If a current Max ranking profile is unavailable or stale, the shared allocator can fall back to a provisional Max opportunity-value method. That fallback must be labeled as planning value, not presented as a Max attacker ranking.

## 19. Shared Remote Pass planning

Remote Passes are one scarce paid resource across eligible ordinary Remote Raids and eligible Remote Max Battles.

The resource allocator compares the next worthwhile use across both systems.

Inputs include:

- shared Remote usage already consumed today
- official Remote ceiling or unlimited state
- personal usual ceiling
- one-day budget override
- user minimum worthwhile score
- marginal value decay
- exact Target remaining progress/cap
- current availability
- future seven-day opportunities
- MP affordability for Max Battles
- stronger-future-opportunity reserve logic

The default paid-battle minimum score is 60.

Marginal value decays by 3 points per additional use, preventing a strong boss from automatically absorbing every available pass.

The future reserve score gap is 8 by default. A materially stronger future opportunity can cause the Planner to reserve a Remote Pass and, for Max Battles, enough MP.

The allocator intentionally permits unused capacity.

## 20. Max Particle planning

Current standard values are:

- 800 MP collectable per day
- 1,500 MP storage

These values are official defaults and can be overridden by event data.

Standard Max Battle cost mapping in the Planner:

- Tier 1: 250 MP
- Tier 2: 400 MP
- Tier 3: 400 MP
- Tier 4: 800 MP
- Tier 5: 800 MP
- Tier 6: 800 MP
- Gigantamax standard: 800 MP

Event text can supply an explicit cost. Unknown/ambiguous cost is not silently converted to zero.

The logger UI presents cost tiers as a dropdown and retains an Event / custom cost path because event bonuses can differ from standard tiers.

MP is spent on successful Max Battle wins. Remote Pass usage is tracked separately from MP so a failed remote attempt can consume a pass without consuming MP.

## 21. Unified battle logging

The logger is one interface for:

- ordinary Raid
- Dynamax
- Gigantamax

Raid logging records completed raids. For a Remote Raid, each completed raid consumes one Remote Raid Pass.

Max logging records:

- attempts
- wins
- cost per win
- actual Remote Passes consumed
- actual Target progress gained

Pass count may be lower than attempts for eligible retries against the same Power Spot boss.

The system must not infer an unknown Max cost as zero. If Max wins occurred and the cost is not known, the user must choose/enter the actual cost.

A request ID makes create operations idempotent. Reusing a request ID for different content is rejected.

## 22. Transactional accounting and Undo

New battle logs rely on D1/SQLite triggers so resource changes happen atomically with the log.

A successful Max log can simultaneously:

- record the log
- update Target progress
- deduct MP
- increment Remote Max usage

A Remote Raid log can simultaneously:

- record the log
- update Target progress
- increment ordinary Remote Raid usage

Undo reverses the original recorded deltas. It does not recompute what the values would be today.

Undo fails as a whole when:

- the Target has been removed or its progress was reduced below the reversible delta
- a manual Remote usage correction conflicts with the original usage amount

This is intentional. Partial refunds are worse than a visible conflict.

Historical raid_log rows are not replayed into the new model. Undo imports and reverses only the selected historical row.

## 23. Targets

Targets are shared across Raid and Max planning but battle-aware.

Supported battle_kind values:

- raid
- dynamax
- gigantamax

Supported goal types include:

- Mega Energy
- Raid/Battle count
- Candy XL
- Candy
- custom progress

Max goals default toward battles won rather than Mega Energy.

Identity is exact Pokémon/form plus battle type plus goal type. Separate same-species Raid, Dynamax, and Gigantamax goals can coexist.

Recommendations and logging choose among matching Targets using active status, priority, and stable ordering. The user can override the selected matching goal in the logger.

Expected progress per battle is only a prefill. Actual progress remains editable.

The Planner never auto-marks a Target complete solely because the numeric target is reached.

## 24. Target filtering/count semantics

Targets support Active, Completed, and All status views, search, goal type, priority, availability, sorting, Needs Attention, Tracking, and Completed grouping.

The Active/Completed/All counts are computed from the current search and all non-status filters.

Example: if the current filters match two active and one completed target, the status controls must show Active 2, Completed 1, All 3.

The global Targets navigation badge shows Active count only.

Bulk deletion supports:

- Select
- individual selection
- Select all shown
- Delete selected
- Cancel

Select all shown respects the current filtered set.

## 25. Battle Plan UI

The Planner's primary gameplay surface is Battle Plan. On compact mobile navigation it is labeled Plan.

The Battle Plan has a segmented filter:

- All
- Raids
- Max Battles

The same recommendation model powers all three views.

Cards keep system identity visible:

- Raid
- Dynamax
- Gigantamax

Raid-specific Hundo encounter information and Raid attacker rankings are not shown as if they applied to a Max Battle.

Max cards use Max-specific attacker intelligence where available.

Shared Remote recommendation counts come from the cross-system allocator rather than the legacy Raid-only allocator.

## 26. Mobile UX

Mobile is a dedicated experience.

Fixed bottom navigation order:

1. Plan
2. Targets
3. Hundo CP
4. Calendar
5. More

Preferences lives under More.

Requirements:

- 44px or larger interactive targets
- safe-area support
- no horizontal page scrolling
- no content hidden behind bottom nav
- foreground sheets/drawers freeze background scrolling
- only foreground content scrolls while a modal/sheet is open
- More is an action/sheet, not a tab
- focus returns appropriately after closing a sheet
- advanced Target filters remain hidden until Filters/organize controls are explicitly opened
- Add Target and bottom-sheet actions must remain inside the visible viewport

## 27. Desktop UX

Desktop uses available width to reduce vertical scrolling.

Current patterns include:

- fixed left navigation
- wider Battle Plan workspace
- contextual Quick Status/right rail
- compact Battle Plan hero/resources layout
- optional compact density
- card/list Target views
- split-pane Hundo search/results
- sticky Calendar detail behavior where appropriate

Sticky elements must begin at their natural section position and must not cover preceding content.

## 28. Hundo CP calculator

Hundo CP uses Pokémon GO's CP formula with 15/15/15 IVs.

Common benchmark levels include:

- Level 15 Research
- Level 20 Raid/Egg
- Level 25 weather-boosted Raid
- Level 30 wild maximum
- Level 35 weather-boosted wild maximum
- Level 40
- Level 50

Custom levels support half-level increments.

Calculations are form-specific. Theoretical values should be labeled as theoretical where the encounter cannot actually occur at that level/method.

For Mega/Primal/Max content, battle identity is resolved separately from the catch encounter. Never use Mega or Primal stats to calculate the post-raid base-form catch CP.

## 29. Calendar and ICS

Each Planner exposes a private read-only iCalendar subscription.

The feed:

- respects selected source categories
- uses personalized titles where relevant
- applies official supplements and suppression
- preserves legacy URL compatibility
- treats subscription URLs as bearer credentials
- is intended for Apple Calendar, Google Calendar, Outlook, Spark, and other standards-compatible clients

Calendar clients decide their own polling interval. Saving Planner filters changes what the next feed request returns; it cannot force an external calendar client to refresh immediately.

## 30. Administration and synchronization

The admin surface is for authorized maintainers and can inspect or trigger synchronization for:

- normalized event feeds
- official Pokémon GO schedule supplements
- Remote-limit rules
- suppression rules
- meta assessments
- Raid ranking refresh/backfill
- Max ranking/meta work

The Worker also performs scheduled synchronization through Cron.

Automatic synchronization must be fail-safe:

- an upstream failure should not wipe valid existing data
- parsing zero events should refuse destructive replacement
- cached data should have method/freshness checks
- current gameplay should continue where a safe fallback exists

## 31. Data freshness and cache behavior

External Pokémon GO data changes often. Method versions and freshness timestamps are part of correctness.

Raid and Max ranking profiles are invalidated when their method versions change.

Pokédex event matching uses a per-isolate TTL to avoid repeated upstream requests while still allowing current boss identity to appear before meta backfill.

The UI surfaces freshness/source information so users can distinguish official, derived, and normalized calendar data.

## 32. Development environment

The supported development environment is the repository's VS Code Dev Container.

Typical Windows layout:

- source on Windows, preferably C:\Projects\pokemon-go-plan
- not inside OneDrive or another sync-managed folder
- Docker Desktop runs the Linux container
- source bind-mounted to /workspace
- VS Code attaches through Dev Containers
- port 8787 forwarded for Wrangler
- Codex configuration persisted in named volume pogo-codex
- GitHub CLI configuration persisted in named volume pogo-gh

The container installs the OpenAI ChatGPT/Codex VS Code extension and runs repository post-create/post-start scripts.

Native Windows Git, Node, Wrangler, and a manually operated Ubuntu shell are not required for the documented workflow.

## 33. Development workflow

AGENTS.md is the operational instruction set for future coding work.

Default sequence:

1. fetch newest main
2. verify no unexplained local changes
3. create a descriptive feature/fix/docs branch
4. make the smallest safe change
5. run syntax and behavioral validation
6. run git diff --check
7. stage only intended files
8. commit
9. push feature branch
10. open PR to main
11. wait for checks
12. stop at a ready PR unless the user explicitly says ship it/merge/deploy

When the user says ship it:

- verify PR target/head/checks
- merge with the repository's normal safe method
- do not manually run wrangler deploy unless explicitly required
- verify main advanced
- verify post-merge checks where possible

Never commit routine feature work directly to main.

## 34. Automated validation

package.json defines:

- npm test: deterministic regression suite
- npm run test:live: live Pokémon GO API contract check
- npm run dev: Wrangler local development
- npm run deploy: manual Wrangler deployment fallback

The deterministic suite currently covers:

- Raid rankings
- battle opportunity model
- Battle Plan UI contracts
- timezone-aware Remote Raid rules
- shared resource planning
- recommendation behavior
- Max rankings
- Max ranking integration
- unified battle logging
- battle logging UI
- battle-aware Targets

The live contract test detects upstream Pokémon GO API changes that could silently alter Raid ranking behavior.

Tests are architectural guardrails. When a bug reveals a missing invariant, add a regression test rather than relying only on a one-off patch.

## 35. Production/deployment constraints

main is the production branch.

The normal repository workflow is feature branch → PR → main → existing Cloudflare production path. Manual wrangler deploy exists but is not the default action and should not be run just because a PR was merged.

Do not change the following unless the task requires it:

- wrangler.jsonc
- D1 binding
- Worker routes
- Cron triggers
- secrets
- Service Bindings
- deployment configuration
- schema/migrations

When a D1 migration is required, call it out explicitly and give one-time production application instructions. Never initialize an existing production database with the full schema.sql.

## 36. Known maintenance items

These are not requests to change behavior automatically. They are facts future work should account for.

### Schema completeness

src/index.js currently references event_suppression_rules and remote_raid_daily_budget_overrides, but these tables are not present in the current checked-in schema.sql or migrations 0001–0003. A future database-rebuild/documentation task should reconcile this before claiming schema.sql can recreate the full live schema.

### README historical sections

The README contains historical implementation narrative from the multi-part Max rollout. This architecture document and docs/DECISIONS.md should be treated as the authoritative current model when a historical README paragraph conflicts with a later merged decision.

### External rule freshness

Remote limits, Max Particle limits/costs, event availability, shiny eligibility, moves, and rankings can change. Reverify current official sources before hardcoding a gameplay rule.

## 37. Current architectural reference points

As of this baseline:

- standard Remote participation ceiling: 10/day unless an official event changes/removes it
- Remote Raid + eligible Remote Max: shared official daily Remote ceiling
- underlying Raid and Max ledgers: separate, summed for planning
- standard MP collection: 800/day
- standard MP storage: 1,500
- Max standard cost tiers: 250 / 400 / 800 depending on tier, with custom event cost support
- Battle Plan filters: All / Raids / Max Battles
- mobile nav: Plan / Targets / Hundo CP / Calendar / More
- CSS cache: v36
- Raid rank method: raid-rank-v3-form-scope-dedupe
- Max rank method: max-rank-v2-event-eligibility-bulk
- migrations: 0001 battle resources, 0002 battle logging, 0003 Target battle kind
- newest completed architecture fix: timezone-aware exact Remote-limit windows

## 38. How future contributors should use this document

Before changing Planner architecture:

1. read this file
2. read docs/DECISIONS.md
3. read AGENTS.md
4. fetch the newest main
5. inspect the current implementation rather than assuming this document overrides newer code
6. if an architectural decision changes, update both the implementation and the relevant documentation in the same PR

This file describes current architecture. docs/DECISIONS.md records why it became this architecture, including superseded approaches.

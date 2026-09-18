# Pokémon GO Planner — Architecture

Last consolidated: 18 September 2026  
Architecture baseline: main through PR #29

This document is the durable technical reference for the current Pokémon GO Planner. It exists so future work can start from the repository rather than from old chat history.

## How to use this document

Use this file for the current intended architecture. Use DECISIONS.md for the history and reasoning behind that architecture.

If documentation and executable behavior disagree, the newest code, schema, migrations, tests, and deployment configuration on main are the final source of truth. Update this document whenever a change materially alters the architecture.

The reference order for future work is:

1. Newest main branch code, schema, migrations, tests, and wrangler.jsonc.
2. This architecture document for current system intent and invariants.
3. docs/DECISIONS.md for historical reasoning and superseded choices.
4. README.md for user and development guidance.
5. Merged PRs for detailed implementation history.

## 1. Product purpose

Pokémon GO Planner is a private, personalized planning application for Pokémon GO. It combines current and upcoming availability, battle-specific meta intelligence, user goals, scarce resources, Remote participation limits, activity history, Hundo CP information, and a private calendar into one planner.

The product is not intended to maximize spend or fill every available Raid slot. It helps the user decide what is worth doing and when saving resources is better.

The Planner covers two first-class battle systems:

- Raids: ordinary, Mega, Primal, Shadow, and other Raid encounter forms.
- Max Battles: Dynamax and Gigantamax encounters at Power Spots.

Raids and Max Battles share some resources and planning surfaces, but they retain battle-system-specific mechanics, forms, costs, eligibility, rankings, and logging.

## 2. Core product principles

The following are architectural invariants.

### 2.1 Limits are ceilings, not targets

Official Remote participation limits, personal ceilings, and available passes are maximums. The recommendation engine may intentionally leave capacity unused.

### 2.2 Track goals and scarce resources, not a full Pokémon inventory

The Planner tracks user targets, Remote Pass usage, Max Particles, activity, and planning state. It does not attempt to become a complete owned-Pokémon roster or team manager.

### 2.3 Battle form and caught form are separate concepts

A Raid boss can use Mega, Primal, Shadow, or another battle form while the catch encounter can be a different form. Hundo CP must use the actual encounter form and encounter level, never the Raid boss's transformed battle stats.

For Max Battles, Dynamax is generally a battle capability layered on the underlying species/form. Gigantamax is a distinct battle capability/form presentation and must never be silently replaced with ordinary Dynamax or a base-form image when an exact asset is required.

### 2.4 Exact form identity beats convenience

Regional forms, Shadow forms, Armored forms, Crowned forms, Hero forms, Origin forms, Mega/Primal forms, costume forms, Dynamax, Gigantamax, and other battle-distinct variants must remain distinct where Pokémon GO treats them distinctly.

If an exact form sprite is unavailable, no sprite is preferable to the wrong sprite.

### 2.5 Current availability must come from evidence

Do not invent missing availability. Event and battle availability follows the precedence described in the Event Data section below.

### 2.6 Reversible accounting is atomic

Logging that changes target progress, Remote usage, or Max Particle state must be applied and undone as a coherent transaction. Partial Undo is not acceptable.

## 3. Production topology

Repository: Jquak10/pokemon-go-plan  
Production branch: main  
Production URL: https://pogo-plan.jquak-10.workers.dev  
Runtime: Cloudflare Workers  
Database: Cloudflare D1

The Worker entry point is src/index.js.

Static assets are served from public through the ASSETS binding. The Worker runs first for API, calendar, management, and admin routes.

Current wrangler.jsonc defines:

- Worker name: pokemon-go-personal-calendar.
- workers_dev disabled.
- main module: src/index.js.
- static assets directory: public.
- asset binding: ASSETS.
- D1 binding: DB.
- observability enabled.
- recurring Cron expressions:
  - 23 */6 * * *
  - 33 */6 * * *
  - 43 */6 * * *

Those Cron jobs support recurring synchronization/backfill work. Do not change their schedules casually; preserve the existing separation of sync responsibilities unless a task explicitly requires changing them.

## 4. Access and security model

The Planner intentionally uses capability links instead of a conventional email/password account system.

Each planner has private credentials represented by non-guessable links/tokens:

- A management link that can read and modify that planner.
- A separate private read-only calendar subscription URL.

Calendar URLs are bearer credentials. Management URLs are also sensitive. They must not be logged, printed into tests, committed to the repository, or pasted into support prompts.

Secrets such as ADMIN_KEY, FEED_LINK_KEY, GitHub credentials, Cloudflare credentials, management tokens, and private ICS URLs must never be requested or committed.

Legacy calendar subscription URLs must remain compatible when calendar internals evolve.

## 5. Front-end structure

The main public files are:

- public/index.html — landing/create-planner experience.
- public/manage.html — primary authenticated Planner UI.
- public/admin.html — administration/synchronization controls.
- public/sources.html — data-source explanation.
- public/styles.css — shared responsive styling.
- public/battle-targets.js — shared client-side target identity helpers.

The application intentionally uses a relatively compact static-client architecture rather than a framework-heavy SPA.

### 5.1 Mobile information architecture

Mobile is treated as a dedicated experience, not a squeezed desktop layout.

The fixed bottom navigation is:

- Plan
- Targets
- Hundo CP
- Calendar
- More

Preferences live under More rather than occupying a permanent bottom-nav slot.

Mobile invariants:

- Touch targets are at least 44 px where practical.
- Safe-area insets are respected.
- Sheets/drawers must not be hidden behind the bottom nav.
- Background page scrolling is frozen while a modal/drawer is open.
- Foreground sheet content may scroll.
- No horizontal page scrolling.
- Secondary filters are hidden until explicitly requested.
- Target advanced filters open in a bottom drawer.
- Add Target and destructive actions must remain inside the viewport.

### 5.2 Desktop information architecture

Desktop uses the available width to reduce vertical scrolling.

Preferred structure:

- Fixed left navigation.
- Wider central work area.
- Contextual right-side status/summary rail where useful.
- Compact/list Target layouts.
- Split Hundo search/results.
- Sticky Calendar detail regions.
- Density-aware compact presentation.

Sticky elements must begin at their natural section position and must not cover content that precedes them.

### 5.3 CSS cache discipline

Whenever public/styles.css changes, every page that references it must have its CSS cache/version reference bumped. This prevents stale production styling after deployment.

The current consolidated UI work through Part 8 uses the post-Part-8 cache generation. Future CSS changes must continue the version bump.

## 6. Server modules

src/index.js remains the integration/orchestration layer. More specialized logic has been split into domain modules.

Important modules:

- src/battle-opportunities.js — battle-system classification, Raid/Max source families, battle variants, encounter identity, Max rotation derivation helpers, presentation metadata, and remote-capability logic.
- src/resource-planning.js — shared Remote Pass planning, Max Particle rules/cost inference, battle resource allocation, and cross-system resource calculations.
- src/battle-logging.js — unified Raid/Max log validation and API-facing logging rules.
- src/battle-targets.js — shared server-side target identity semantics.
- src/raid-rankings.js — type-specific PvE Raid attacker analysis and method-versioned ranking profiles.
- src/max-rankings.js — Max-specific attacker analysis with Max-appropriate weighting and eligibility.
- src/remote-raid-rules.js — exact temporary Remote-limit time-window parsing and timezone projection.

Keep pure, testable domain logic in these modules where practical. src/index.js should integrate data sources, persistence, APIs, synchronization, and rendering payloads rather than duplicating every algorithm.

## 7. Data model

schema.sql is the fresh-database source of truth. Existing production databases are evolved by additive migrations.

Core tables in the current schema include:

### users

Stores planner identity and user preferences, including timezone, included calendar sources, recommendation weights, Remote planning settings, and capability-token hashes.

The default timezone is Asia/Singapore, but all user-facing date logic must honor the saved IANA timezone.

### targets

Stores personal goals. Key concepts include:

- Pokémon/form identity.
- Goal type.
- Optional battle_kind: raid, dynamax, or gigantamax.
- Desired value.
- Current value.
- Expected progress per battle.
- Priority.
- Completion state.
- Notes.

The battle_kind column was added by migration 0003_target_battle_kind.sql.

### events

Stores normalized calendar/event records from upstream feeds and official supplements.

Important fields include:

- source_type.
- source_uid.
- summary/description.
- raw DTSTART/DTEND properties.
- normalized start/end dates.
- source URL.
- content hash.
- sequence.
- active/stale status.

### pokemon_meta and meta_sources

pokemon_meta stores shared Pokémon-level planning/meta values. meta_sources stores source-specific evidence and generated profiles, including Raid and Max ranking profiles.

Generated ranking profiles are method-versioned. A stale method version must not be displayed as though it were current.

### remote_raid_usage

Stores the ordinary Remote Raid portion of daily shared Remote participation usage.

### remote_raid_limit_overrides

Stores temporary official Remote-limit overrides, including date range, numeric or unlimited state, source information, saved source excerpt, and automatic-detection metadata.

Exact time windows are derived from the saved source excerpt when trustworthy clock and timezone information exists.

### battle_resource_state

Stores persistent Max Particle state, especially MP currently held.

### battle_resource_daily

Stores per-user, per-local-date Max resource/accounting values, including Max Particles collected and the Remote Max portion of Remote Pass/participation usage.

### raid_log

Legacy Raid log table retained for backward compatibility and historical Undo.

### battle_log

Current unified battle log for Raids and Max Battles.

It stores battle system, battle variant, local/remote participation, attempts/battles, wins, MP cost, MP spent, Remote passes consumed, target progress, local date, and reversible state.

### unified_battle_log

View that exposes new battle_log records together with legacy raid_log history without replaying or duplicating old logs.

## 8. Migrations and schema evolution

Current explicit migrations are:

- migrations/0001_battle_resources.sql — Max Particle and battle resource state.
- migrations/0002_battle_logging.sql — unified battle_log, atomic triggers, unified history.
- migrations/0003_target_battle_kind.sql — battle-aware Targets.

Production migrations are deliberate manual steps. Do not initialize production by applying the entire schema.sql over an existing D1 database.

Future schema changes must:

- preserve existing IDs and history where possible;
- remain backward compatible during Worker/migration rollout where practical;
- avoid destructive rebuilds unless unavoidable;
- document whether migration is repeatable;
- include tests for migration and historical compatibility.

## 9. Event data and source precedence

Event accuracy is one of the Planner's most important responsibilities.

The source precedence is:

1. Explicit official Pokémon GO schedule.
2. Official replacement/suppression notice.
3. Normalized GO Calendar data.
4. Never invent missing availability.

Official evidence can supplement or suppress lower-precedence calendar data.

Suppression must affect:

- Calendar display.
- Private ICS output.
- Current availability.
- Battle recommendations.
- Remote allocation/planning.

Suppression does not delete underlying Pokémon meta or ranking data.

### 9.1 GO Calendar ingestion

GO Calendar feeds provide the normalized baseline for events, Raids, Max Battles, Max Mondays, Raid Hours, Spotlight Hours, and other event categories.

The Planner stores normalized events in D1 and retains enough raw DTSTART/DTEND information to correctly interpret iCalendar semantics.

### 9.2 iCalendar end-date semantics

RFC 5545 all-day DTEND is exclusive. The Planner must convert all-day event end dates correctly when determining active availability.

A past event must be defensively excluded from current recommendations even if an older stored row has not yet disappeared from D1.

### 9.3 Official supplements

When official Pokémon GO pages provide more precise or replacement scheduling than the baseline calendar, the Worker can create official supplement events.

Official supplement rows take precedence in ordering and are identifiable by official source metadata/source_uid conventions.

### 9.4 Weekly Max rotation

GO Calendar's max_battles feed contains special Max events such as Max Battle Days, while ordinary weekly Power Spot availability can be represented indirectly through Max Monday data and may disappear from the newest upstream feed after Monday passes.

The Planner therefore has an internal derived source type:

- max_rotation

max_rotation is not a separate user-selectable raw calendar feed.

It derives ordinary Monday-to-Sunday Dynamax availability from Max Monday schedule evidence. Original max_mondays entries remain intact as timed Monday events. Original max_battles special events remain intact.

The derivation must never turn explicit Gigantamax/G-Max schedule text into a generic week-long Dynamax rotation. Special events such as Gigantamax Max Battle Days stay isolated.

Recent stale Max Monday evidence may be retained only as needed to avoid losing the currently active derived week when the upstream rolling feed drops the Monday entry.

## 10. Battle-domain model

The Planner models battle identity separately from Pokémon identity.

### 10.1 Raid battle system

battle_system = raid

Raid presentation can include ordinary, Mega, Primal, Shadow, and other Raid forms. The caught encounter may not use the Raid boss's transformed battle form.

Raid recommendations can show:

- Personalized priority score.
- Remote allocation.
- Weaknesses/resistances.
- Hundo encounter CP where applicable.
- PvE Raid attacker rankings.
- Optimal moves.
- Target/progress context.
- Source/availability context.

### 10.2 Max battle system

battle_system = max

battle_variant is:

- dynamax
- gigantamax

For ordinary Dynamax, the underlying exact species/form remains the encounter identity. Dynamax is a capability/presentation state.

For Gigantamax, the capability/form must be explicit. Exact Gigantamax assets are required for a Gigantamax sprite. If none exists, show no sprite instead of an ordinary form.

Max cards must not display ordinary Raid Hundo assumptions or ordinary Raid attacker rankings as though those were Max-specific metrics.

## 11. Battle Plan

The primary planning surface is Battle Plan on desktop and Plan on mobile.

The battle-system filter is:

- All
- Raids
- Max Battles

Max Battles do not receive a separate permanent mobile navigation tab.

The Plan combines:

- Today's official Remote limit.
- Shared Remote usage.
- Remote Pass planning.
- Max Particle state/planning.
- Current Raid and Max opportunities.
- Personal targets.
- Future opportunities.
- Recent battle activity.
- Recommendation explanations.

## 12. Targets

Targets are shared across the product but battle-aware.

### 12.1 Identity

Target matching uses exact Pokémon/form plus battle identity.

A Raid target must not automatically influence or receive progress from a Max Battle.

Dynamax and Gigantamax targets are distinct where their battle capability matters.

Legacy targets remain compatible. Existing IDs, names, progress, and historical log references must not be rewritten merely to normalize newer battle semantics.

### 12.2 Status and filters

Targets support:

- Active.
- Completed.
- All.
- Search.
- Goal type.
- Priority.
- Raid/battle availability.
- Sorting.
- Needs Attention.
- Tracking.
- Completed grouping.

Active/Completed/All counts must reflect the current search plus every non-status filter.

If the current filters match two active and one completed target, counts must read Active 2, Completed 1, All 3.

The global Targets navigation badge shows Active count only.

### 12.3 Bulk deletion

Multi-select deletion supports Select, Select all shown, Delete selected, and Cancel. Selection must respect the current filtered set.

### 12.4 Completion semantics

Reaching a numeric target value does not automatically mark a target complete. Completion remains an explicit user state.

Skip/completed targets are excluded from paid allocation as appropriate.

## 13. Recommendation architecture

Recommendations combine current availability, shared meta, system-specific attacker intelligence, personal targets, progress, priority, and resource constraints.

### 13.1 Raid value

Raid recommendations use personalized value derived from available PvE/PvP/rarity/Mega inputs and target context.

Raid allocations use diminishing marginal value. A boss can stop receiving additional Remote allocation even when official capacity remains.

### 13.2 Max value

Max Battles must not inherit ordinary Raid DPS rankings as a proxy for Max performance.

Before dedicated Max rankings existed, the Planner used a provisional Max opportunity value. Part 7 replaced that with Max-specific attacker intelligence.

Current Max analysis considers Max-appropriate attributes, including:

- Explicit Max eligibility evidence.
- Underlying form identity.
- Fast Attack type for Dynamax Max Attack typing.
- Normal-phase Fast/Charged pressure.
- Max-phase pressure.
- Bulk/survivability weighted more heavily than ordinary Raid DPS.

Do not invent unknown Gigantamax move type/power data.

### 13.3 Cross-system allocation

When Remote participation is possible, Raids and Max Battles compete for the same scarce Remote Pass/daily Remote participation capacity.

The allocator compares the next worthwhile use across both systems while preserving system-specific value methods.

Future opportunity matters. The planner may save capacity for a stronger upcoming day rather than fill today's ceiling.

## 14. Remote participation and shared daily limit

Current architecture treats ordinary Remote Raids and Remote Max Battles as consuming one shared official daily Remote participation ceiling.

This supersedes the earlier conservative implementation that kept their numeric ceilings separate.

The underlying ledgers remain separate for auditability and compatibility:

- remote_raid_usage.raids_used = ordinary Remote Raid portion.
- battle_resource_daily.remote_max_passes_used = Remote Max portion.

Planning sums the two before applying the official daily limit.

This design allows one official rule layer to handle:

- Standard daily limit.
- Temporary increased limits.
- Unlimited event windows.

A Remote Max Battle using a Remote Raid Pass therefore contributes to the same shared daily Remote usage shown in Raid calculations.

## 15. Temporary Remote-limit rules and timezones

The default Remote limit is represented in application logic and can be overridden by official event rules.

Temporary overrides must use exact event timing when the official source provides trustworthy clock times plus timezone information.

src/remote-raid-rules.js:

- Parses supported named timezones such as PDT/PST and related US abbreviations.
- Parses explicit UTC/GMT offsets.
- Converts the official interval to UTC instants.
- Projects those instants into the user's saved IANA timezone.
- Evaluates today's rule against the current instant.
- Allows a source-date window to overlap the next local day after timezone conversion.
- Falls back to date-only behavior when exact time/timezone cannot be trusted.

This was added after the Staraptor Super Mega Raid Day case exposed a source-date/local-date mismatch. A Sep 18 17:00 PDT start must not become a full-day Sep 18 override in Singapore.

Never infer an offset from vague phrases such as "local time."

## 16. Remote Pass planning

Remote Pass usage and Remote participation limit are related but conceptually separate:

- A Remote Raid Pass is the physical paid resource.
- The official Remote daily limit is a participation ceiling.
- Eligible Remote Max Battles also consume Remote Raid Passes.
- Event rules can change the participation ceiling.

The Planner's personal ceiling is also a ceiling, not a spending goal.

Unused capacity is acceptable.

## 17. Max Particle model

Max Battles add a second scarce resource: Max Particles.

The Planner tracks:

- MP held.
- MP collected today.
- Daily collection ceiling.
- Storage ceiling.
- Planned spend.
- Actual spend through logs.

Historical standard values used by the Planner are 800 MP daily collection and 1,500 MP storage, with event overrides allowed when explicit evidence supplies different values.

Never assume an event-specific MP limit or cost without evidence.

### 17.1 Max Battle cost tiers

The logger uses a tier-oriented Max Particle cost control.

Current standard tier choices:

- Tier 1 — 250 MP.
- Tier 2–3 — 400 MP.
- Tier 4–6 / Gigantamax — 800 MP.
- Event/custom cost.

An inferred tier is a suggestion, not a silent truth. Unknown or event-modified costs must remain user-confirmable/editable.

## 18. Unified battle logging

The unified logger records Raids, Dynamax, and Gigantamax.

Important fields include:

- Pokémon/form.
- Battle system.
- Battle variant.
- Local or Remote participation.
- Battle/attempt count.
- Wins.
- MP cost per win.
- Total MP spent.
- Actual Remote Passes consumed.
- Target.
- Actual progress gained.
- Local date.

### 18.1 Raid logging

Remote Raid logs contribute to the ordinary Raid portion of shared Remote usage. Local Raid logs do not.

### 18.2 Max logging

For Max Battles:

- Attempts and wins are separate.
- MP is spent based on successful wins.
- Remote Passes are recorded from actual pass consumption, not assumed equal to attempts.
- A pass can be consumed even on a failed Remote Max attempt.
- Eligible retries against the same Power Spot boss can occur without consuming another pass.
- Log groups with different MP costs separately.

### 18.3 Target progress

expected_progress_per_raid can prefill expected progress but actual gained progress remains editable.

Battle-count goals use wins rather than failed attempts.

### 18.4 Atomic apply/Undo

battle_log_apply and battle_log_undo D1 triggers maintain atomic consistency across:

- Target progress.
- MP held.
- Ordinary Remote Raid usage.
- Remote Max usage.

Undo reverses the original deltas and original local date.

If later manual corrections make a clean reversal impossible, Undo fails coherently rather than partially mutating state.

Repeated requests must not duplicate effects.

### 18.5 Legacy compatibility

Older raid_log history remains readable.

Existing /api/raid-log routes remain compatibility aliases around the unified logging path where supported.

Historical Undo can import/reverse the single legacy record without replaying all past history.

## 19. Raid attacker rankings

Raid attacker rankings are analytical, type-specific PvE rankings produced by the Planner from current Pokémon GO API/GameMaster-backed stats and move data.

They are not copied from an editorial tier list.

Important behavior:

- Relevant battle-distinct forms can be compared.
- Regional forms are not silently inserted into unrelated form families.
- Explicit Shadow targets stay Shadow-specific.
- Normal/Mega/Primal comparisons exclude inappropriate regional substitutions.
- Zacian/Zamazenta generic container records are suppressed when explicit Hero/Crowned forms are available.
- Crowned Zacian/Zamazenta move transformation behavior is handled explicitly.
- Profiles are method-versioned.
- Old or malformed profile versions are hidden and prioritized for refresh.

Current implementation lives primarily in src/raid-rankings.js and the meta_sources pipeline.

## 20. Max attacker rankings

Max-specific intelligence lives in src/max-rankings.js.

Eligibility requires evidence that the Pokémon/form can participate in the Max system; the Planner does not treat every Pokémon in the normal Pokédex as a valid Max attacker.

The method intentionally values survivability/bulk more heavily than ordinary Raid DPS.

Dynamax Max Attack typing follows the selected Fast Attack type.

When Gigantamax move-specific data is unavailable, the ranking system must not fabricate it.

## 21. Pokémon matching and Pokédex fallback

Battle availability can appear before pokemon_meta has been backfilled.

To avoid hiding a legitimate current boss simply because shared meta is not ready, active battle-event matching can use the current Pokémon GO API Pokédex as a catalog fallback.

The catalog is cached per Worker isolate for a limited period.

If the upstream Pokédex is unavailable, the Planner falls back safely to existing meta/target matching rather than failing the entire planner payload.

This mechanism is for identity resolution, not permission to invent event availability.

## 22. Hundo CP

The Hundo CP calculator and battle cards use the Pokémon GO CP formula with 15/15/15 IVs.

Common levels:

- Level 15 — Research.
- Level 20 — standard Raid/egg.
- Level 25 — weather-boosted Raid.
- Level 30 — normal wild maximum where applicable.
- Level 35 — weather-boosted wild maximum where applicable.
- Level 40.
- Level 50.

Values outside actual encounter contexts should be labeled theoretical when appropriate.

For Mega/Primal Raids, weakness calculations use the Raid boss form, while catch Hundo CP uses the actual post-Raid encounter form.

## 23. Sprites

Primary sprite source is the Pokémon GO API / its assets.

Sprite rules:

- Exact form-specific asset when available.
- No knowingly incorrect substitution.
- Ordinary Dynamax can use the exact underlying species/form sprite with a DYNAMAX badge.
- Gigantamax requires an exact Gigantamax asset; otherwise render no Pokémon image and preserve GMAX text/badge identity.
- Shadow/regional/Crowned/Armored/costume forms must not silently borrow an incompatible form image.

## 24. Calendar and ICS architecture

The Planner provides:

- In-app month calendar.
- Personalized event visibility.
- Private read-only iCalendar subscriptions.
- Compatibility with standard calendar clients such as Apple Calendar, Google Calendar, and Outlook.

Calendar URLs are bearer credentials.

Personalization and suppression must be consistent across:

- In-app Calendar.
- ICS output.
- Current battle availability.
- Recommendations.

Legacy subscription URL compatibility must be preserved when internal routing or token handling changes.

## 25. Administration and synchronization

The admin surface supports operations such as:

- Event synchronization.
- Official supplement detection.
- Temporary Remote-limit detection.
- Suppression-rule synchronization.
- Meta synchronization.
- Raid-ranking refresh/backfill.
- Max-ranking/meta maintenance.

Administrative actions must use existing secret/binding infrastructure. Never embed management secrets in client code.

## 26. Testing strategy

package.json runs a deterministic regression suite covering the major domains, including:

- Raid rankings.
- Battle opportunities.
- Battle Plan UI.
- Remote-limit timezone rules.
- Resource planning.
- Recommendation engine.
- Max rankings.
- Max ranking integration.
- Unified battle logging.
- Battle logging UI.
- Battle-aware Targets.

There is also a live upstream contract test for Pokémon GO API/GameMaster-related assumptions.

Tests are deliberately used to freeze previously discovered regressions such as:

- Wrong form-family rankings.
- Old ranking method cache leakage.
- Crowned transformation handling.
- Missing Max cards when meta is late.
- Weekly Max rotation disappearance.
- Target battle-kind leakage.
- Shared Remote Raid/Max usage.
- Mobile navigation/sheet state.
- Remote-limit timezone rollover.

Future bug fixes should add focused regression coverage whenever practical.

## 27. Development and release workflow

AGENTS.md is the mandatory repository development workflow.

Core rules:

- Start from newest main.
- Never use an old generated patch/ZIP as source of truth.
- Use a feature/fix/docs/chore branch.
- Make the smallest safe change.
- Preserve wrangler.jsonc, routes, D1 bindings, Cron, secrets, Service Bindings, and deployment settings unless explicitly required.
- Validate syntax, tests, and diff cleanliness.
- Push the feature branch.
- Open a PR to main.
- Stop at a green PR unless the user explicitly authorizes merge/deploy.
- "ship it" is explicit merge authorization.
- Do not manually run wrangler deploy unless explicitly required.
- Never claim a merge/deploy happened unless it actually happened.

## 28. Dev Container

The repository includes a Docker-based VS Code Dev Container so Windows development does not require native Git tooling.

The Dev Container setup includes:

- Reproducible Node/CLI environment.
- VS Code integration.
- Codex extension/configuration support.
- GitHub authentication persistence helpers.
- Repository-local Git identity setup.
- Cross-computer workflow documentation.

The Dev Container is development infrastructure only and must not change production Worker bindings/configuration by accident.

## 29. Non-goals and guardrails

The Planner should not:

- Treat every daily limit as a quota to fill.
- Build a full owned-Pokémon inventory unless the product direction explicitly changes.
- Equate normal Raid DPS with Max Battle performance.
- Invent shiny availability, event availability, Max eligibility, Remote eligibility, MP costs, or event limits.
- Substitute the wrong Pokémon form for convenience.
- Expose private management/calendar links.
- Collapse Remote Raid and Remote Max ledgers so completely that auditability is lost.
- Delete underlying meta when an event is suppressed.
- Rewrite existing Target IDs or historical log identity merely to normalize newer semantics.

## 30. Updating this architecture

Any PR that changes one of the following should update this document in the same PR:

- Production topology or bindings.
- Database model/migrations.
- Battle-system model.
- Source precedence.
- Remote-limit semantics.
- Resource planning.
- Logging/Undo.
- Target identity.
- Ranking methodology.
- Calendar/ICS behavior.
- Mobile/desktop navigation architecture.
- Security/capability-link model.

When a decision changes rather than merely extends the architecture, also add or update the corresponding record in DECISIONS.md.

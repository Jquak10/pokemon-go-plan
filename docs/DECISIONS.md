# Pokémon GO Planner — Architecture Decision Record

Last consolidated: 18 September 2026  
Decision/change history covered: project inception through PR #31

This file records why the Planner looks the way it does. It is intentionally historical: some early decisions were later superseded as Pokémon GO rules became clearer or the product matured.

For current behavior, docs/ARCHITECTURE.md wins. For historical reasoning, use this file.

## Decision status vocabulary

- Current — still governs the product.
- Superseded — intentionally replaced by a later decision.
- Historical — useful implementation history but not a current architectural rule.

## ADR-001 — Build as a private personalized planner and calendar

Status: Current

The project began as a private Pokémon GO calendar service and evolved into a personalized planner.

The architecture keeps the calendar core but layers personalized decision support over it:

- current/upcoming event availability;
- personal targets;
- Remote planning;
- battle recommendations;
- Hundo CP;
- logging;
- private ICS subscriptions.

The Planner is designed for an individual user's choices rather than a public social network.

## ADR-002 — Use Cloudflare Workers + D1

Status: Current

The application uses a Cloudflare Worker for API/orchestration and D1 for persistent relational state.

Reasons:

- Small operational footprint.
- Serverless recurring sync via Cron.
- One deployment unit for APIs, calendar routes, admin routes, and static asset routing.
- D1 is sufficient for planner-sized relational data and trigger-based atomic accounting.

Production configuration lives in wrangler.jsonc and should be treated as protected infrastructure.

## ADR-003 — Use capability links instead of password accounts

Status: Current

Planner access is based on private management and calendar bearer URLs rather than email/password accounts.

Reasons:

- Low-friction personal app.
- Avoid unnecessary identity/account infrastructure.
- Calendar clients already work naturally with secret subscription URLs.

Consequence: tokens/URLs are credentials and must never be exposed in logs, code, tests, or support messages.

## ADR-004 — Treat the repository as the durable source of truth

Status: Current

Old chats, generated patches, copied ZIPs, and local stale files must not override newer GitHub code.

The development workflow always starts from newest main or the explicitly requested active PR branch.

This decision became increasingly important as the project gained many incremental PRs and the user wanted old chat cleanup.

## ADR-005 — Make the Windows development environment reproducible

Status: Current  
Implemented primarily in PRs #1–#3 and #7–#8.

The repository gained a VS Code Dev Container so a new Windows machine can work without relying on native Git installation.

The Dev Container also supports Codex/GitHub authentication persistence and multi-computer continuation.

This is development infrastructure only; it must not rewrite production Worker configuration.

## ADR-006 — Encode the development workflow in AGENTS.md

Status: Current  
Introduced in PR #5.

Routine branch, validation, commit, push, PR, and ship-it behavior is repository policy rather than chat-only convention.

Key release gate:

- default stopping point = green PR;
- explicit "ship it" = merge authorization.

## ADR-007 — Mobile and desktop are distinct UX modes

Status: Current

Mobile is not a scaled-down desktop.

Mobile design:

- fixed bottom navigation;
- Plan, Targets, Hundo CP, Calendar, More;
- Preferences under More;
- 44 px+ touch targets;
- safe-area handling;
- bottom sheets/drawers;
- frozen background while overlays are open.

Desktop design:

- fixed left navigation;
- wider central workspace;
- contextual right rail;
- compact/list Targets;
- split-pane Hundo;
- sticky Calendar details.

This direction was reinforced by later Part 8 regression hardening.

## ADR-008 — Remote limits are ceilings, never spending targets

Status: Current

The Planner must be comfortable recommending fewer paid battles than the official daily cap.

Reasons:

- Scarce paid resources.
- Future opportunities can be better.
- Personal targets can already be complete.
- Marginal value decreases after repeated battles.
- User personal ceiling may be lower than game capacity.

Unused capacity is an acceptable and often desirable output.

## ADR-009 — Keep current search/filter counts truthful

Status: Current  
Refined in PRs #10–#11.

Targets Active/Completed/All counts must reflect the currently applied search and non-status filters.

The global Targets badge shows Active targets only.

"All" visibly includes completed targets rather than counting hidden completed rows.

## ADR-010 — Support safe multi-delete rather than one-at-a-time target cleanup

Status: Current  
Implemented in PR #10.

Target bulk deletion selects within the currently visible/filtered result set and includes explicit Select, Select all shown, Delete selected, and Cancel controls.

This avoids destructive hidden selection and keeps mobile actions in view.

## ADR-011 — Follow RFC 5545 all-day end semantics

Status: Current  
Corrected in PR #10.

All-day ICS DTEND is exclusive.

The Planner converts it to an inclusive availability end when deciding whether a Raid/event is still active.

A second defensive expiration check prevents stale past Raid rows from appearing in current recommendations.

## ADR-012 — Build analytical Raid rankings instead of copying a tier list

Status: Current  
Introduced in PR #12 and refined in PRs #13–#16.

Raid attacker rankings are generated from Pokémon GO API/GameMaster-backed stats and moves.

Reasons:

- Form-aware calculations.
- Move-pair transparency.
- Type-specific usefulness.
- Better reproducibility than editorial ranking copy.

Ranking profiles live in the existing meta source pipeline and carry method versions.

## ADR-013 — Preserve form-family boundaries in Raid rankings

Status: Current  
Refined in PR #15.

Normal/Mega/Primal comparisons must not silently pull in unrelated regional forms.

Explicit Shadow targets are exact-only.

Generic Zacian/Zamazenta container records are suppressed when explicit Hero/Crowned forms exist.

Plain Zacian/Zamazenta are resolved consistently with the supported Hero/Crowned representation.

## ADR-014 — Model Crowned Zacian/Zamazenta transformation moves explicitly

Status: Current  
Implemented in PR #13.

Crowned Sword Zacian and Crowned Shield Zamazenta cannot be ranked correctly by naïvely reading an untransformed generic charged move.

The Planner handles Iron Head transformation to the Crowned signature move as part of the ranking calculation.

This decision established the broader rule that game-specific transformation mechanics need explicit modeling rather than generic stat substitution.

## ADR-015 — Invalidate ranking caches by methodology version

Status: Current  
Implemented in PR #16.

A cached ranking profile is valid only when its method field matches the current ranking method version.

Old/malformed profiles are hidden and prioritized for regeneration.

This prevents a data-correctness fix from taking up to the normal refresh interval to reach users.

## ADR-016 — Treat Max Battles as a first-class sibling battle system

Status: Current  
Part 1, PR #18.

Official conceptual term: Max Battles, not "Dynamax raids."

The system now distinguishes:

- Raid battle system.
- Max battle system.

Max is not modeled as another Raid tier.

The initial foundation separated source families, battle variants, encounter identity, and remote capability without immediately changing every UI/resource behavior.

## ADR-017 — Keep Dynamax/Gigantamax capability separate from underlying form identity

Status: Current

Ordinary Dynamax generally uses the underlying species/form identity plus Dynamax capability.

Gigantamax is explicitly represented as Gigantamax.

Regional identity must survive Max capability labeling.

This is why "Dynamax Articuno" is not a new species record and why an Alolan form must not be collapsed into a Kanto form.

## ADR-018 — Unify the main planning surface as Battle Plan

Status: Current  
Part 2, PR #19.

The former Raid Plan evolved into Battle Plan.

Desktop label: Battle Plan.  
Mobile label: Plan.

Filter:

- All.
- Raids.
- Max Battles.

No new permanent Max bottom-nav destination was added.

The objective was to compare current opportunities in one place while preserving clear battle-system identity.

## ADR-019 — Do not reuse Raid-specific Hundo/ranking UI on Max cards

Status: Current  
Part 2, PR #19.

Max cards can show type/weakness/resistance information, but they must not imply Raid catch CP or Raid PvE ranking logic is Max-specific.

This avoids a common modeling error where a shared Pokémon species causes battle-system-specific metrics to leak across contexts.

## ADR-020 — Introduce shared resource planning for Remote Passes and Max Particles

Status: Current in principle; numeric-limit portion later revised  
Part 3, PR #20.

The first Max resource layer introduced:

- shared Remote Pass spending capacity across eligible Raid and Max opportunities;
- Max Particles held/collected/planned;
- MP collection/storage ceilings;
- conservative MP cost inference;
- cross-system allocation.

At this stage, the official ordinary Remote Raid participation limit was intentionally kept separate from the Remote Max counter because the official rule relationship was not considered sufficiently established.

That numeric-limit separation was later superseded by ADR-031.

## ADR-021 — Keep physical-resource accounting distinct from participation-limit accounting

Status: Current

A Remote Raid Pass is a physical resource.

The official daily Remote limit is a participation ceiling.

They interact but are not conceptually identical.

This distinction lets the system model:

- event-raised or unlimited participation caps;
- actual pass consumption;
- retries where an additional pass is not consumed;
- a user's personal spending ceiling.

## ADR-022 — Use durable unified Battle logs with atomic triggers

Status: Current  
Part 4, PR #21.

A single unified logger now records ordinary Raids, Dynamax, and Gigantamax.

D1 trigger-based accounting was chosen so one log insert can atomically update:

- target progress;
- MP;
- ordinary Remote Raid usage;
- Remote Max usage.

Undo reverses the original deltas atomically.

The legacy raid_log remains available for history/compatibility.

Migration: 0002_battle_logging.sql.

## ADR-023 — Record Max attempts, wins, and actual pass use separately

Status: Current  
Part 4, PR #21.

For Max Battles:

- attempts are not the same as wins;
- wins determine MP spend;
- pass consumption can occur on a failed attempt;
- eligible retries can consume fewer passes than attempts.

Therefore the logger asks for actual Remote Passes consumed instead of deriving pass use from battle count.

## ADR-024 — Keep actual target progress editable

Status: Current

expected_progress_per_raid is a planning/default value, not an immutable result.

The user can log actual progress gained.

For battle-count goals, successful wins are the progress source rather than failed attempts.

## ADR-025 — Make Targets battle-aware without rewriting history

Status: Current  
Part 5, PR #22.

Targets gained battle_kind:

- raid.
- dynamax.
- gigantamax.

Exact Pokémon/form plus battle identity determines matching.

Existing target IDs, names, progress, and historical references are preserved.

Migration: 0003_target_battle_kind.sql.

The app does not automatically mark a target complete when its numeric threshold is reached.

## ADR-026 — Let multiple same-species goals coexist by explicit identity

Status: Current  
Part 5, PR #22.

A Raid goal and Max goal for the same species must not contaminate each other's recommendation priority or log progress.

Max target naming/capability identity is explicit enough to coexist under the existing uniqueness constraints.

When several goals match a battle, the logger provides a goal selector.

## ADR-027 — Compare scarce Remote Pass use across battle systems

Status: Current  
Part 6, PR #23.

Once resources, logs, and targets were battle-aware, the recommendation engine could compare the next scarce Remote Pass across Raid and Max opportunities.

The allocator uses system-appropriate value rather than one universal battle score.

Future availability is included so capacity can be saved for better opportunities.

## ADR-028 — Never treat normal Raid DPS as Max attacker performance

Status: Current  
Part 6/7, PRs #23–#24.

Part 6 used a provisional Max opportunity method rather than misusing Raid rankings.

Part 7 added dedicated Max attacker intelligence.

Max rankings emphasize:

- explicit Max eligibility;
- Fast Attack → Dynamax Max Attack typing;
- normal-phase move pressure;
- Max-phase pressure;
- survivability/bulk.

Unknown Gigantamax move data is not invented.

## ADR-029 — Allow event identity resolution before meta backfill

Status: Current  
PR #25.

A currently scheduled boss must not disappear from Battle Plan merely because pokemon_meta has not yet been populated.

The current Pokémon GO API Pokédex can be used as an identity catalog fallback.

If that upstream call fails, existing meta/target matching remains the fallback and the entire planner must not fail.

This fallback resolves identity only; it does not create event availability.

## ADR-030 — Derive weekly ordinary Max rotation from Max Monday evidence

Status: Current  
PR #26.

The rolling max_battles feed is not sufficient for ordinary weekly Power Spot availability; it primarily contains special Max events.

The Planner therefore derives internal max_rotation events from Max Monday schedule evidence.

Rules:

- Monday-to-Sunday ordinary Dynamax availability.
- Original Max Monday event remains unchanged.
- Original special max_battles events remain unchanged.
- Gigantamax/G-Max Max Monday text does not become a generic weekly Dynamax rotation.
- max_rotation is internal, not another user-selectable feed.

The implementation also protects the current derived week from disappearing immediately when the rolling upstream feed drops the already-passed Monday entry.

## ADR-031 — Share one official daily Remote limit across Remote Raids and Remote Max

Status: Current  
PR #27.  
Supersedes the numeric-limit portion of ADR-020.

After the official Remote Max rules were clarified, the product model changed.

Current rule:

shared Remote usage = ordinary Remote Raid usage + Remote Max pass/participation usage

That combined value is evaluated against the one official daily Remote limit.

Underlying ledgers remain separate for auditability and backward compatibility.

Consequences:

- Logging a Remote Max Battle immediately reduces remaining Remote capacity shown in Raid planning.
- Logging a Remote Raid reduces remaining capacity for Remote Max.
- Event-raised limits apply to both.
- Unlimited windows apply to both.
- Undo reverses the appropriate component.

This is the authoritative current model.

## ADR-032 — Use a tier dropdown for Max Particle cost

Status: Current  
PR #27.

The Max logger uses cost tiers rather than a freeform-only number.

Standard choices:

- 250 MP.
- 400 MP.
- 800 MP.
- Event/custom.

The UI can suggest an inferred tier but requires confirmation when appropriate.

Custom remains necessary because Pokémon GO events can temporarily alter costs.

## ADR-033 — Stabilize shared Battle Plan UX after Parts 1–7

Status: Current  
Part 8, PR #28.

Part 8 was intentionally a consolidation pass rather than another major feature.

It aligned:

- hero recommendation totals;
- Quick Status;
- shared Raid+Max Remote allocation wording;
- Raid/Dynamax/Gigantamax command presentation;
- mobile More sheet scroll/focus behavior;
- accessibility tab semantics;
- 44 px action targets.

It also removed stale wording from the earlier separate-cap model.

## ADR-034 — Evaluate temporary Remote-limit overrides by exact timestamp and user timezone

Status: Current  
PR #29.

A date-only model failed when an official announcement was published in PDT but the user was in Singapore.

Example that exposed the bug:

- official source start: Sep 18, 5:00 p.m. PDT;
- Singapore start: Sep 19, 8:00 a.m.

Treating the source date as a full local Sep 18 day incorrectly raised the Planner ceiling early.

Current decision:

- parse exact clock + timezone when trustworthy;
- convert to UTC instants;
- project into the user's IANA timezone;
- evaluate today against the current instant;
- search adjacent source dates to account for rollover;
- use date-only behavior when exact timing cannot be established safely.

Never guess an offset from "local time."

## ADR-035 — Keep event-source precedence explicit

Status: Current

Availability precedence:

1. Explicit official schedule.
2. Official replacement/suppression notice.
3. Normalized GO Calendar.
4. No invented availability.

Suppression changes display/availability/planning but does not delete underlying Pokémon meta.

This decision applies equally to Raids, Max Battles, Calendar, ICS, and Remote allocation.

## ADR-036 — Preserve exact sprite/form truth even when UI is less decorative

Status: Current

Correct form identity is more important than always showing an image.

Special rule for Max:

- ordinary Dynamax may use the exact underlying form sprite plus a DYNAMAX badge;
- Gigantamax requires an exact G-Max asset, otherwise no sprite.

The same philosophy applies to regional, Shadow, Crowned, Armored, costume, Mega, and Primal variants.

## ADR-037 — Keep the architecture and decision record in the repository

Status: Current  
Introduced by the documentation consolidation after PR #29.

The project accumulated enough design history that old chats became a maintenance risk.

The repository now carries:

- docs/ARCHITECTURE.md — current architecture/invariants.
- docs/DECISIONS.md — historical decisions and supersessions.

Future work must perform a documentation-impact assessment in the same PR. All product improvements and bug fixes are recorded in the PR lineage below; architecture and README updates are added when the change affects their respective current-behavior or user/developer guidance scopes.

AGENTS.md points future development work at these documents before implementation begins and makes the documentation-impact assessment part of the normal definition of done.

## ADR-038 — Require documentation impact assessment for every change

Status: Current  
Introduced after the PR #31 documentation consolidation.

The repository must not depend on a maintainer remembering to reconstruct changes from old chats.

For every feature, improvement, bug fix, refactor, migration, maintenance change, or workflow change, the implementation workflow assesses documentation impact and updates the relevant durable files in the same PR.

Rules:

- Every product improvement and bug fix gets a compact entry in the PR lineage in this file.
- Current architecture/invariant changes update `docs/ARCHITECTURE.md`.
- User/developer/operator-facing changes update `README.md`.
- Development automation/release-policy changes update `AGENTS.md`.
- New or superseded durable decisions add or revise an ADR.
- Routine regression fixes do not need a new ADR when they simply restore an existing invariant, but they still require the PR-lineage entry and appropriate regression coverage.
- Unrelated documentation should not be changed merely for checklist compliance.

Because the PR number is only known after opening a PR, adding the final lineage row as a follow-up commit on the same branch is an accepted and expected workflow step.

## PR lineage

The following sequence is retained as a compact repository implementation/change history. Non-merged PRs are included only when their status is explicitly stated so they cannot be mistaken for shipped behavior.

| PR | Purpose | Architectural significance |
| --- | --- | --- |
| #1 | Reproducible Dev Container | Established portable development environment. |
| #2 | Document Dev Container workflow | Made environment setup repeatable. |
| #3 | Dev Container quick check | Added lightweight setup verification. |
| #4 | Enter to create planner | Small landing UX improvement. |
| #5 | Codex development workflow | Added AGENTS.md branch/PR/release policy. |
| #6 | Planner button alignment | Responsive landing polish and CSS cache discipline. |
| #7 | Portable Dev Container across Windows PCs | Added Codex/GitHub persistence and multi-computer workflow. |
| #8 | Complete README / Windows setup | Consolidated setup and repository guidance. |
| #9 | Complete app usage guide | Added user-facing Planner operation documentation. |
| #10 | Raid availability and Target workflows | Fixed RFC 5545 end dates, mobile nav, bulk Target delete, Active badge. |
| #11 | Targets All view | Made completed Targets visible in All. |
| #12 | Variant-aware Raid rankings | Introduced GameMaster/API analytical Raid rankings. |
| #13 | Crowned Zacian/Zamazenta | Added transformed move handling. |
| #14 | Raid ranking hardening/UI | Added live contract checks and card simplification. |
| #15 | Variant scope/dedupe | Enforced regional/Shadow/form-family correctness. |
| #16 | Ranking cache invalidation | Made method version part of cache validity. |
| #17 | Supporting-page refresh | Brought public/admin/source pages up to current planner terminology and responsive behavior. |
| #18 | Max Battle foundation | Added first-class Raid vs Max domain model. |
| #19 | Max Battle Plan UI | Unified Battle Plan with Raid/Max filters and safe form presentation. |
| #20 | Shared Remote Pass + MP planning | Added resource-aware cross-system planning; initial numeric-cap model later revised. |
| #21 | Unified battle logging | Added durable battle_log, atomic apply/Undo, legacy compatibility. |
| #22 | Raid/Max Targets | Added battle-aware target identity and migration 0003. |
| #23 | Recommendation refinement | Added cross-system scarce-resource allocation/future opportunity logic. |
| #24 | Max attacker intelligence | Added dedicated Max rankings. |
| #25 | Max card/label/layout fixes | Added Pokédex identity fallback and corrected Dynamax labeling/layout. |
| #26 | Weekly Max rotation | Added internal max_rotation derived from Max Monday evidence. |
| #27 | Shared Remote daily limit + MP dropdown | Unified official Remote cap across Raid/Max and added tier cost control. |
| #28 | Part 8 UX/regression hardening | Stabilized shared Battle Plan UX/accessibility and removed stale cap wording. |
| #29 | Timezone-aware Remote limit windows | Added exact timestamp/timezone override evaluation. |
| #30 | Architecture/decision documentation draft | Closed without merge; superseded by #31, so it introduced no change to main. |
| #31 | Durable architecture and decision history | Added repository-level architecture/ADR references, linked them from README/AGENTS, and consolidated history through #29. |

## Supersession map

Important historical replacements:

- Part 3 / PR #20 intentionally kept the ordinary Remote Raid numeric cap separate from Remote Max while official rules were unclear.
- PR #27 superseded that choice: Remote Raid and Remote Max now share the official daily Remote participation ceiling.
- Part 6 used provisional Max opportunity value rather than misusing Raid rankings.
- PR #24 superseded that provisional intelligence for attacker analysis with dedicated Max rankings.
- Date-only Remote-limit interpretation was sufficient until a cross-timezone event exposed the flaw.
- PR #29 superseded automatic date-only interpretation whenever exact official timing can be parsed safely.

When reading older PR text or README sections, always apply this supersession map before assuming an earlier statement is still current.

## Future decision and change-log discipline

Every product improvement and bug fix must be represented in the PR lineage above. This is the minimum durable record even when no architectural decision changes.

Create or update an ADR entry when a change affects or supersedes durable decisions involving:

- battle-system boundaries;
- resource ownership/accounting;
- source precedence;
- form identity;
- persistence/migrations;
- security/access model;
- Remote rules;
- recommendation methodology;
- ranking methodology;
- calendar/ICS semantics;
- major mobile/desktop navigation;
- development/documentation/release governance.

A routine bug fix that restores an existing invariant usually needs a PR-lineage entry, focused regression coverage, and—when the invariant was previously unclear—an architecture clarification. It does not need a new ADR unless the underlying decision or rationale changed.

README and ARCHITECTURE updates are selected by impact rather than mechanically: update README for user/developer/operator-facing changes and ARCHITECTURE for current-system/invariant changes. AGENTS.md owns the mandatory assessment and PR workflow.

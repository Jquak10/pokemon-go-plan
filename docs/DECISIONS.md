# Pokémon GO Planner Architecture Decisions and History

Last reviewed: 18 September 2026
Current baseline: main at 5625d20614e2e2b1c20290085b3ac617ccaa441c

This document records the product and engineering decisions that led to the current Pokémon GO Planner. It exists so old chat threads are not required to understand why the code behaves the way it does.

Use docs/ARCHITECTURE.md for the current system. Use this file for rationale, historical context, superseded approaches, and implementation chronology.

Decision status meanings:

- Active: still governs current work.
- Superseded: intentionally replaced by a later decision.
- Historical: useful context but not a current constraint.

## 1. Inception: private personalized Raid Planner + calendar

Status: Active foundation

The original product was designed as a private personal Pokémon GO decision tool rather than a public general-purpose raid website.

The core problem was not simply listing events. The Planner needed to combine:

- what is actually available now
- how useful a boss is
- what the user personally wants
- how much progress remains
- whether a Remote Raid is worth paying for
- future opportunities that may be better
- a calendar that stays synchronized automatically

The initial platform choice was Cloudflare Workers + D1 with static HTML/CSS/JavaScript. Each planner uses private capability links rather than an account/password system. A separate private ICS subscription lets the same personalized event data appear in external calendars.

This led to several permanent principles:

- user goals and gameplay data live together
- external event data must be normalized and freshness-aware
- limits are ceilings, not targets
- bearer URLs are credentials
- the application must be usable on both mobile and desktop
- serverless deployment/configuration should remain small and stable

## 2. Decision: Cloudflare Worker + D1 + static assets

Status: Active

The application remains a single Cloudflare Worker with D1 and static assets.

Why:

- low operational overhead
- one deployment unit
- simple private-link APIs
- scheduled synchronization through Cron
- D1 is sufficient for the Planner's relational state and reversible logs
- static HTML/JS avoids a framework build pipeline for a small personal application

Consequence:

src/index.js became large over time. Specialized domain logic has been extracted into modules, but the Worker remains the orchestrator.

Do not casually split the deployment into services or replace wrangler.jsonc. Any such change would be an architectural migration, not a cleanup.

## 3. Decision: capability links instead of account authentication

Status: Active

Each planner receives a private management link and a separate read-only calendar link.

Why:

- the app is private/personal rather than a multi-tenant social product
- no password reset/email infrastructure is required
- calendar clients need a simple bearer URL

Security consequence:

- management links can modify Planner data
- calendar URLs can read personalized event data
- both must be kept private
- admin credentials and feed-signing secrets must never be pasted into chat or committed

The implementation stores hashes and signs preferred feed URLs rather than exposing raw secret material.

## 4. Decision: current repository main is the source of truth

Status: Active

Older ZIPs, generated patches, copied snippets, and chat-produced files are never authoritative when a newer GitHub version exists.

This became particularly important once the project began moving quickly through Max Battle Parts 1–8. Multiple patches and temporary validation workflows existed during development; only the final merged tree matters.

Future work must start by fetching newest main.

## 5. Decision: safe branch/PR workflow and explicit production authorization

Status: Active

PR #5 added repository-level AGENTS.md instructions. PRs #7–#9 made the development environment and documentation portable.

Normal workflow:

- newest main
- feature/fix/docs branch
- smallest safe change
- syntax/tests/diff validation
- commit and push branch
- PR to main
- wait for checks
- stop before merge

The phrase ship it is explicit merge authorization.

Why:

- prevents accidental production changes
- keeps GitHub PR history as the durable implementation log
- lets automated checks gate merges
- makes chat history disposable after decisions are captured in the repo

Manual wrangler deploy is not automatically run after merge unless specifically required.

## 6. Decision: portable Windows Dev Container

Status: Active

PRs #1–#3 created the reproducible Dev Container workflow. PR #7 made it portable between Windows computers. PR #8 documented a setup that does not require native Windows Git.

The intended model:

- source in C:\Projects\pokemon-go-plan
- avoid OneDrive/synchronized folders
- Docker Desktop runs the container
- VS Code attaches to it
- /workspace is the bind-mounted repository
- Git, Node, Wrangler, GitHub CLI, and Codex run inside the container
- Codex/GitHub CLI state persist in named volumes

Reasoning:

The user wanted a repeatable development setup without manually using Ubuntu/WSL or installing a full native toolchain on every Windows computer.

## 7. Decision: official schedule precedence

Status: Active

The event source precedence is:

1. explicit official Pokémon GO schedule
2. official replacement/suppression notice
3. normalized GO Calendar data
4. never invent missing availability

This became essential when general feeds did not perfectly match special-event schedules.

Official data can supplement or suppress normalized data, but it must not destroy underlying Pokémon meta.

This rule applies consistently to:

- calendar
- ICS
- recommendations
- current availability
- Target availability
- Remote allocation

## 8. Decision: suppress schedule entries, do not delete shared meta

Status: Active

Official events sometimes replace seasonal Raid or Spotlight schedules.

The Planner uses suppression rules to hide conflicting lower-priority schedule entries during replacement windows.

Why suppression instead of deleting data:

- the underlying Pokémon remains valid meta
- the seasonal event may return later
- a replacement notice is about availability, not Pokémon identity/value
- reversible/source-aware behavior is safer than destructive mutation

## 9. Decision: RFC 5545 all-day DTEND must be treated as exclusive

Status: Active
Introduced/fixed: PR #10

A bug allowed past Raid rotations to remain visible because all-day DTEND was interpreted as inclusive.

The fix converts all-day DTEND to an internal inclusive end date by subtracting a day.

This is a durable correctness rule for all ICS ingestion and recommendation filtering.

Current recommendations also defensively exclude events whose effective end date has passed, even if an old row remains stored.

## 10. Decision: Target counts are filter-relative

Status: Active
Implemented across PRs #10–#11 and later Target work

Active/Completed/All counts must reflect the current search and non-status filters.

Example:

If the current filters match two active and one completed Target, the UI shows:

- Active 2
- Completed 1
- All 3

The All view must visibly include completed goals rather than reporting them only in a count.

The navigation badge shows Active Targets only.

## 11. Decision: support multi-delete without weakening filter semantics

Status: Active
PR #10

Target cleanup needed bulk deletion.

Select all shown means the currently filtered set, not every Target in the database.

This preserves user intent and prevents hidden Targets from being unexpectedly deleted.

## 12. Decision: mobile foreground states must not break bottom navigation

Status: Active
PR #10 and Part 8/PR #28

The mobile bottom nav had disappeared after modal save/delete flows.

The fix established a broader invariant:

- modal/drawer/sheet state must cleanly restore page/nav state
- background scrolling is frozen while a foreground sheet is open
- only foreground content scrolls
- touch/focus guards must reset
- More is a sheet action, not a tab

Part 8 expanded this into an accessibility and mobile interaction contract.

## 13. Decision: Raid attacker rankings should be computed, type-specific, and form-aware

Status: Active
PR #12 onward

The Planner does not copy a static tier list for Raid attackers.

Rankings are derived from Pokémon GO API/GameMaster-backed stats and moves.

Why:

- form availability changes
- moves change
- a Pokémon can be excellent for one attack type and irrelevant for another
- exact forms matter to the user's decision

The UI stores generated ranking profiles with provenance/version information.

## 14. Decision: explicit Shadow Targets stay Shadow-specific

Status: Active
PR #12 onward

A Shadow Target must not fall back to a normal-form ranking profile.

Reason:

Shadow is a materially different battle form. Silently substituting normal data produces incorrect PvE advice.

Sprite fallback may use the underlying form art when necessary, but identity must remain explicitly Shadow.

## 15. Decision: Crowned Zacian/Zamazenta require transformed signature moves

Status: Active
PR #13

Crowned Sword Zacian and Crowned Shield Zamazenta cannot be treated as ordinary form/stat changes only.

Their transformed moves matter to Raid attacking roles:

- Behemoth Blade
- Behemoth Bash

The ranking engine therefore models the Crowned transformation move behavior rather than relying on a misleading generic record.

## 16. Decision: regional form scoping and API dedupe

Status: Active
PR #15

A normal/Mega/Primal comparison must not silently include an unrelated regional form.

Rules:

- normal families exclude unrelated regional variants
- a regional request compares within that regional family
- explicit Shadow remains exact
- repeated Pokédex representations are deduplicated
- generic Zacian/Zamazenta containers are removed when explicit Hero/Crowned forms exist

Reason:

The user saw misleading Alolan Raichu and duplicate Zacian/Zamazenta rank entries.

## 17. Decision: ranking methods are versioned and old cache is hidden immediately

Status: Active
PR #16

Fixing the ranking generator is not enough if D1 still serves profiles generated under the old method.

Therefore:

- generated profiles include method versions
- lookup rejects outdated/malformed profiles
- stale-method entries are prioritized for regeneration
- UI does not show known-old data during the refresh window

Current Raid method:
raid-rank-v3-form-scope-dedupe

Current Max method:
max-rank-v2-event-eligibility-bulk

## 18. Decision: live upstream contract tests complement deterministic tests

Status: Active
PR #14 onward

The Pokémon GO API is external and can change independently of this repository.

The project therefore has:

- deterministic local regression tests
- a live contract test against current upstream Pokémon GO API data

The live test is not a replacement for deterministic tests. It detects upstream structural/content drift that could silently alter rankings.

## 19. Decision: Max Battles are a first-class sibling system, not a Raid subtype

Status: Active
Part 1 / PR #18

This was the foundational Max architecture decision.

Conceptual model:

- Raid: ordinary/Mega/Primal/etc. at Gyms
- Max: Dynamax/Gigantamax at Power Spots

Why:

Max Battles differ in:

- resource costs
- remote eligibility
- attacker intelligence
- terminology
- availability sources
- form/capability presentation
- logging attempts/wins
- Target semantics

Calling them Dynamax raids or forcing them through Raid-only assumptions would create persistent correctness bugs.

## 20. Decision: no My Max Team inventory subsystem

Status: Active

The Planner tracks goals and scarce resources, not the user's full Pokémon inventory.

The project intentionally does not build a roster manager such as My Max Team.

Why:

- inventory maintenance becomes a separate product
- resource and opportunity decisions can be useful without tracking every owned Pokémon
- it keeps the Planner focused on what to do, not reproducing Pokémon storage

Attacker rankings describe what is strong, not what the user owns.

## 21. Decision: Battle Plan is one surface with All / Raids / Max Battles

Status: Active
Part 2 / PR #19

The existing Raid Plan evolved into Battle Plan.

Desktop label: Battle Plan
Compact mobile label: Plan

Filter:

- All
- Raids
- Max Battles

No new mobile bottom-nav destination was added for Max Battles.

Why:

Raid and Max compete for overlapping player time/resources. A unified planning surface is more useful than two disconnected planners.

## 22. Decision: Max cards must not inherit Raid-only information

Status: Active
PR #19

Max cards do not present ordinary Raid Hundo/attacker details as if they were valid Max advice.

Specifically:

- Max uses Max-specific attacker intelligence
- Raid Hundo catch data is not blindly shown for a Max battle
- battle identity and encounter identity remain distinct
- sprite rules remain form-safe

## 23. Decision: Dynamax is capability metadata; underlying form remains exact

Status: Active
PRs #18, #19, #25

A Dynamax label does not create a new species/form identity for normal sprite/stat matching.

Ordinary Dynamax can use the underlying exact Pokémon/form sprite with a Dynamax badge.

Gigantamax is different because the visual/form is distinct and requires exact-form handling.

## 24. Decision: Gigantamax requires exact sprite or no sprite

Status: Active

Wrong imagery is worse than no imagery.

If an exact Gigantamax sprite is unavailable, the UI leaves the sprite absent and keeps the Gigantamax badge/text.

This rule also guides other special forms, including new Mega forms.

## 25. Decision: shared Remote Pass budget, initially separate participation counters

Status: Superseded in part
Part 3 / PR #20

Part 3 correctly recognized that an eligible Remote Raid and an eligible Remote Max both spend a Remote Raid Pass, so they should compete for the same paid-pass budget.

At that point, the application conservatively kept the official ordinary Remote Raid participation counter separate because the official rules were not considered clear enough to assert that Max participation used the same numeric cap.

That conservative separation was later superseded by PR #27 after the product rule was clarified: Raid and Remote Max now share the official daily Remote participation limit.

What remains active from Part 3:

- shared Remote Pass planning
- separate underlying accounting for auditability
- MP planning
- opportunity-cost allocation

## 26. Decision: track Max Particles as a scarce resource

Status: Active
Part 3 / PR #20

The Planner tracks:

- MP held
- MP collected today
- standard daily collection ceiling
- storage ceiling
- planned spend
- projected remaining MP

Current standard values:

- 800 collected/day
- 1,500 storage

These are defaults, not immutable constants. Event overrides may raise limits.

## 27. Decision: do not invent unknown Max Battle cost

Status: Active

If an event does not establish the cost confidently, the allocator must not pretend the cost is zero.

Unknown cost:

- can still be shown as an opportunity
- cannot be automatically allocated as if free
- must be confirmed by the user when logging a win

This is a general product principle: uncertainty should reduce automation, not create false precision.

## 28. Decision: Max costs use standard tiers plus custom event cost

Status: Active
PR #27 UI refinement

The logger's cost control is a dropdown because costs cluster into standard tiers.

Current mapping:

- Tier 1: 250 MP
- Tier 2–3: 400 MP
- Tier 4–6: 800 MP
- Gigantamax standard: 800 MP
- Event/custom: explicit user-entered value

Why keep custom:

Events can change normal costs/bonuses. A fixed enum without escape hatch would become wrong.

## 29. Decision: unified battle logger with exact attempts/wins/pass usage

Status: Active
Part 4 / PR #21

One logger handles Raid, Dynamax, and Gigantamax.

Raid:

- logs completed battles
- remote completed Raid consumes one Remote Raid Pass

Max:

- attempts and wins are separate
- MP cost is per successful win
- actual Remote Passes consumed are entered
- retries may consume fewer passes than attempts
- failed remote attempts can consume a pass while spending no MP

Reason:

Max gameplay has resource semantics that a Raid count field cannot represent.

## 30. Decision: logging effects must be atomic in D1

Status: Active
Part 4 / PR #21

The system uses battle_log plus SQLite/D1 triggers.

A log should never succeed in one table while failing to update its Target/resource counter.

The apply trigger atomically handles:

- Target delta
- MP deduction
- ordinary Remote Raid usage or Remote Max usage

Undo also runs transactionally.

This is preferable to read-calculate-write API code because concurrent requests and partial failures can otherwise corrupt resource totals.

## 31. Decision: Undo reverses recorded deltas and rejects inconsistent partial recovery

Status: Active

Undo uses the original log's recorded deltas.

It does not clamp a refund or guess around later manual edits.

If a Target was deleted/reduced or a Remote usage correction makes the reversal inconsistent, Undo rejects the whole operation.

Reason:

A visible actionable conflict is safer than silently leaving the Planner partially incorrect.

## 32. Decision: preserve legacy Raid logs without replaying history

Status: Active

The old raid_log table remains.

Historical rows are presented through unified_battle_log.

Undo of an old row imports/reverses only that row without attaching new triggers to old history or replaying all previous activity.

This made the migration additive and safer across rollout order.

## 33. Decision: Targets are battle-aware and exact-form aware

Status: Active
Part 5 / PR #22

Same-species goals can coexist for:

- Raid
- Dynamax
- Gigantamax

A Raid goal must never receive Max progress merely because the species name matches.

Identity uses exact Pokémon/form plus battle identity and goal type.

Legacy IDs/names/progress remain stable so historical Undo references are not broken.

## 34. Decision: Targets do not track Pokémon inventory

Status: Active

Targets represent goals, not owned Pokémon.

The system tracks things such as:

- Mega Energy
- number of battles
- Candy/Candy XL
- custom progress

It does not track IV inventory, movesets, team slots, or every owned specimen.

## 35. Decision: expected progress is a convenience, actual progress stays editable

Status: Active

expected_progress_per_raid can prefill logging.

It must never become mandatory truth.

Reasons:

- Mega Energy varies
- event bonuses vary
- Candy/XL outcomes vary
- users may be correcting data after the fact

Actual progress belongs to the user at log time.

## 36. Decision: reaching a numeric Target does not auto-complete it

Status: Active

Completion is an explicit user state.

Why:

A numeric goal may be a checkpoint, not the final collection objective. Automatically marking complete can incorrectly remove future Remote allocation.

## 37. Decision: separate Max opportunity value from Raid attacker value

Status: Active
Part 6 / PR #23

Before dedicated Max rankings existed, the allocator needed a way to compare Raid and Max opportunities.

It introduced provisional Max opportunity value based on:

- general/personal recommendation
- rarity/availability
- Max capability

Critically, it did not pretend normal Raid attacker rankings measured Max performance.

That provisional path remains the fallback when a current Max ranking profile is unavailable.

## 38. Decision: scarce Remote Pass allocator compares systems on the next use

Status: Active
Part 6 / PR #23

The core shared-resource question is:

What is the best next Remote Pass use?

The allocator therefore compares marginal value across eligible Raid and Max opportunities, rather than first assigning a Raid quota and then a Max quota.

Consequences:

- resources can shift toward whichever system has better current value
- low-value capacity remains unused
- a stronger future opportunity can reserve a pass

## 39. Decision: future opportunity cost matters

Status: Active

Raid limits are ceilings, not targets.

The Planner looks ahead rather than spending every available pass today.

The shared allocator can reserve:

- a Remote Pass
- Max Particles when necessary

for a materially stronger future opportunity.

This is a core product behavior, not an optimization bug.

## 40. Decision: Max attacker rankings require explicit Max eligibility evidence

Status: Active
Part 7 / PR #24

A Pokémon being in the Pokédex does not prove it can currently Dynamax/Gigantamax in Pokémon GO.

Max ranking candidates require explicit historical/current Max Battle evidence.

This avoids inventing Max eligibility.

Regional/form identity remains exact.

## 41. Decision: Max ranking emphasizes bulk more than Raid DPS

Status: Active
Part 7 / PR #24

Max Battles have different combat dynamics.

The Max ranking method blends:

- Max-phase attack pressure
- normal-phase Fast/Charged pressure
- survivability/bulk

Bulk receives more weight than in a normal Raid DPS comparison.

Max Attack type follows the selected Fast Attack.

Unknown Gigantamax move properties are not fabricated.

## 42. Decision: current battle event must appear even before meta backfill

Status: Active
PR #25

A live Max boss disappeared because event matching only considered pokemon_meta and user Targets.

This violated availability authority.

Fix:

- event identity can resolve through the current Pokémon GO API Pokédex
- a current boss can create a card before meta backfill
- meta enriches the card later
- upstream Pokédex failure falls back safely rather than breaking /api/me

General rule:

availability should not depend on optional analytical enrichment being ready.

## 43. Decision: standard Max-source event defaults to Dynamax unless Gigantamax is explicit

Status: Active
PR #25

GO Calendar does not always repeat the word Dynamax in every standard Max event title.

For Max-source events:

- explicit Gigantamax/G-Max → gigantamax
- explicit Dynamax → dynamax
- otherwise → dynamax

This fixed inconsistent labels where one Kanto bird appeared as Dynamax while others did not.

## 44. Decision: desktop Battle Plan must surface actual battle cards early

Status: Active
PR #25

The first Battle Plan redesign used too much vertical space on hero/resource summaries before showing actionable content.

Desktop was compacted:

- hero/resources share horizontal space
- metrics are denser
- battle cards arrive earlier in the viewport
- mobile remains separately optimized

General UX decision:

desktop width should reduce scrolling rather than merely enlarge cards.

## 45. Decision: internal weekly Max rotation source fills a normalized source gap

Status: Active
PR #26

Problem:

GO Calendar's max_battles feed contained special Max events, while the ordinary weekly Rhyhorn rotation was missing after its Monday record dropped from the latest Max Monday feed.

The Planner needed current availability but could not simply pretend a special-event feed was weekly.

Solution:

internal max_rotation source derived from Max Monday schedule/history.

A standard Max Monday can anchor Monday–Sunday Dynamax availability.

## 46. Decision: special Max events and Max Mondays must remain isolated

Status: Active
PR #26

The weekly derivation must not affect special events.

Guardrails:

- max_battles entries never generate weekly rotations
- Gigantamax/G-Max Max Monday entries never generate standard weekly rotations
- Gigantamax Cinderace Max Battle Day remains a special timed event
- original Max Monday remains a separate timed event
- weekly max_rotation is internal planning availability

This is intentionally regression-tested.

## 47. Decision: Remote Raid and Remote Max share the official daily Remote ceiling

Status: Active
Supersedes part of Decision 25
PR #27

The application now treats the daily official Remote participation limit as shared across eligible Remote Raids and eligible Remote Max Battles.

Example:

3 Remote Raids + 2 Remote Max Battles = 5 daily Remote uses.

If the official ceiling is 10, five remain. If an event raises it to 20, fifteen remain.

Underlying counters remain separate:

- ordinary Remote Raid portion
- Remote Max portion

The Planner sums them before applying the rule.

Why preserve separate storage:

- auditability
- legacy compatibility
- clear activity breakdown
- shared player-facing capacity without destructive schema consolidation

## 48. Decision: special Remote ceilings automatically apply across both systems

Status: Active
PR #27

Once daily usage became shared, temporary official limit changes had to correlate automatically.

A 10, 20, other numeric, or unlimited official rule applies to the combined Remote usage total.

There is no separate event override for Raid versus Max unless Pokémon GO explicitly creates one in the future.

## 49. Decision: Part 8 is a stabilization pass, not a new subsystem

Status: Active
PR #28

Part 8 cleaned cross-system UX and hardened regression contracts after Parts 1–7.

Key outcomes:

- hero and Quick Status use shared Raid+Max allocation
- stale separate-cap copy removed
- command palette is battle-aware
- Max logger receives exact recommendation context
- All/Raids/Max becomes a clearer segmented control
- Raid and Max cards have distinct visual hierarchy
- mobile More becomes a true foreground sheet
- tab semantics and focus behavior improve
- 44px touch targets become tested invariants
- CSS cache bumped to v36

The purpose was to ensure the architecture was represented consistently in the interface.

## 50. Decision: official Remote limit windows use exact timestamps and user timezone

Status: Active
PR #29

A temporary Remote limit was incorrectly shown one local day early in Singapore.

Root cause:

The automatic rule detector stored source dates such as Sep 18–19 from a PDT announcement, then the Planner applied those dates directly as Singapore dates.

Fix:

- parse exact clock times and recognized timezone from the saved official excerpt
- convert to UTC instant
- project into the user's IANA timezone
- evaluate today against the current instant
- search adjacent source dates for rollover
- use date-only fallback when exact timing is not trustworthy

This avoids hardcoding Singapore or one event.

General rule:

game rules expressed in a source timezone must be applied by instant, not by copying their printed calendar date into another timezone.

## 51. Decision: preserve source excerpts because they are reparsable evidence

Status: Active
Reinforced by PR #29

remote_raid_limit_overrides already retained source_excerpt.

That allowed the application to gain timezone-aware behavior without a new D1 migration.

Broader rationale:

When normalized data may need better parsing later, retaining a bounded source excerpt/provenance can make future corrections possible without destructive data migration.

## 52. Decision: date-only/manual rules remain date-only when exact time is unavailable

Status: Active
PR #29

The new timestamp parser does not guess.

If text says local time without a reliable timezone, or there is no parseable time, the existing date-based semantics remain.

This follows the product's general uncertainty rule:

do not invent precision.

## 53. Decision: current architecture docs belong in the repository

Status: Active
PR #30

The project accumulated architecture across long chats and many PRs.

Chats are useful while designing, but they are a poor durable source of truth because:

- they can be deleted
- older messages can describe superseded decisions
- future tools may not have the same conversation context
- repository code and tests are what production actually runs

Therefore:

- docs/ARCHITECTURE.md describes the current system
- docs/DECISIONS.md records rationale/history/supersession
- AGENTS.md should direct future development agents to read both
- architectural changes should update these docs in the same PR

This is what makes old implementation chats safe to clean up later.

# Implementation chronology

The table below captures the repository's PR history through the current baseline. It is a navigation aid, not a replacement for the decision records above.

| PR | Change | Architectural significance |
| --- | --- | --- |
| #1 | Reproducible Dev Container | Established containerized Windows development |
| #2 | Document Dev Container workflow | Made setup repeatable |
| #3 | Dev Container quick check | Added environment validation guidance |
| #4 | Enter creates planner | Small landing-page usability fix |
| #5 | Codex development workflow | Added AGENTS.md and branch/PR discipline |
| #6 | Planner button alignment | Early responsive UI/cache discipline |
| #7 | Portable Dev Container | Persistent Codex/GitHub auth across computers |
| #8 | Complete README + Windows setup | Repository-grounded operational docs |
| #9 | App usage guide | Documented user workflows and features |
| #10 | Raid availability + Target workflows | Fixed DTEND, mobile nav, bulk delete, Active badge |
| #11 | Targets All view | Made completed goals truly visible in All |
| #12 | Variant-aware Raid rankings | Added computed PvE attacker intelligence |
| #13 | Crowned Zacian/Zamazenta | Correct transformed signature moves |
| #14 | Ranking hardening/UI | Added live contract test and compact ranking UX |
| #15 | Form scope/dedupe | Regional scoping, Shadow exactness, Zacian/Zamazenta dedupe |
| #16 | Ranking cache invalidation | Method-version enforcement |
| #17 | Supporting pages/responsive portal | Aligned docs/admin/sources and mobile portal UX |
| #18 | Max Battle foundation | Introduced first-class Raid/Max battle model |
| #19 | Max Battle Plan UI | Unified Battle Plan and Max card presentation |
| #20 | Shared Remote Pass + MP planning | Added resource allocator and Max Particle state |
| #21 | Unified battle logging | Added battle_log, triggers, attempts/wins/Undo |
| #22 | Raid/Max Targets | Added battle-aware Target identity |
| #23 | Recommendation refinement | Cross-system marginal/future opportunity allocation |
| #24 | Max attacker intelligence | Dedicated Max ranking method |
| #25 | Max cards/labels/desktop layout | Pokédex fallback, Dynamax defaults, compact desktop |
| #26 | Weekly Max availability | Added isolated internal max_rotation |
| #27 | Shared daily Remote limit | Combined Raid + Max official daily usage; MP dropdown |
| #28 | Part 8 UX/regression hardening | Cross-system UI/accessibility consistency |
| #29 | Timezone-aware Remote limit windows | Exact official timestamp conversion |
| #30 | Architecture and decision consolidation | Made repository docs the durable replacement for chat-only history |

# Superseded decisions to remember

Some older documentation/chat statements are historically correct but no longer describe the product.

## Separate numeric Remote Max daily cap accounting

Superseded by PR #27.

Older Part 3/4 documentation said ordinary Remote Raid participation and Remote Max participation were kept separate because the official relationship was unclear.

Current behavior:

- underlying ledgers remain separate
- official daily Remote participation usage is the sum
- one official rule/ceiling applies to both

Do not reintroduce separate player-facing daily capacities without new official evidence and an explicit architectural decision.

## Raid Plan terminology as the primary surface

Superseded by the Battle Plan model.

Some older README/user-guide paragraphs still say Raid Plan.

Current domain/UI architecture:

- Battle Plan
- All / Raids / Max Battles
- compact mobile label Plan

Legacy text should not be used to infer a Raid-only architecture.

## Meta must exist before a card can exist

Superseded by PR #25.

Availability is authoritative. Pokédex fallback can create the battle identity while meta enrichment catches up.

## GO Calendar max_battles alone represents all Max availability

Superseded by PR #26.

Special Max events and ordinary weekly rotations are different source concepts. Internal max_rotation exists specifically to bridge the weekly source gap without corrupting special events.

# Non-negotiable future checks

When proposing a future feature or refactor, explicitly test it against these questions:

1. Does it preserve exact Pokémon/form identity?
2. Does it distinguish battle form from catch encounter form?
3. Does it preserve Raid versus Max Battle as sibling systems?
4. Does it keep special Max events separate from derived weekly rotation?
5. Does it keep official source precedence and suppression behavior?
6. Does it avoid inventing missing availability, shiny status, Max eligibility, cost, or move data?
7. Does a Remote Max log update the same official daily Remote capacity seen by Raid planning?
8. Does Undo remain reversible and atomic?
9. Does Target progress update only the exact matching battle identity?
10. Does the planner treat limits as ceilings rather than spending goals?
11. Is future opportunity cost considered before recommending resource spend?
12. Are mobile sheets/navigation safe and desktop layout compact?
13. Is a wrong sprite avoided even if that means no sprite?
14. Are timezone-sensitive official rules evaluated by instant?
15. Are method/cache versions bumped when ranking semantics change?
16. Are permanent regression tests added for newly discovered invariants?
17. If CSS changes, was the cache version bumped everywhere?
18. If schema/config/secrets/Cron/bindings change, is that explicitly necessary and documented?
19. Did the work start from newest main?
20. Did the PR stop before merge unless the user explicitly said ship it?

# How to maintain this decision log

When a future architectural decision is made:

- add a new numbered decision
- mark any replaced decision Superseded rather than deleting it
- name the PR that implements the decision
- update docs/ARCHITECTURE.md to describe the resulting current state
- add/adjust regression tests for the invariant
- update README only where user-facing guidance changed

The goal is that a future developer or assistant can understand the Planner from the repository alone, without access to historical ChatGPT conversations.

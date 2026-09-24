# Pokémon GO Planner — Architecture Decision Record

Last consolidated: 18 September 2026  
Decision/change history covered: project inception through PR #33

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
Introduced in the original architecture; hardened in PR #47.

Planner access is based on private management and calendar bearer URLs rather than email/password accounts.

Reasons:

- Low-friction personal app.
- Avoid unnecessary identity/account infrastructure.
- Calendar clients already work naturally with secret subscription URLs.

Security consequences:

- Tokens/URLs are credentials and must never be exposed in logs, code, tests, or support messages.
- The management URL remains the durable sign-in capability, but the current Planner sends that capability to same-origin APIs in an `Authorization: Bearer` header instead of repeating it in query strings or JSON bodies.
- The current Admin UI sends `ADMIN_KEY` in `X-Admin-Key`, not URL query parameters or JSON request bodies.
- The Worker accepts the new headers first while preserving legacy query/body credential forms for older callers.
- Browser/private responses use no-referrer plus CSP/frame/content/permissions defenses; Planner/Admin HTML is no-store. Calendar feeds retain private ETag caching for client compatibility.
- Because the static frontend still contains inline JavaScript/styles, CSP permits inline execution while strictly blocking framing, objects, foreign base URLs, and non-self API/form destinations. A stricter no-inline policy would require a separate frontend extraction rather than a breaking header-only change.

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
- docs/BACKLOG.md — confirmed unshipped work, verified technical debt, and explicitly deferred/not-planned ideas.

Future work must perform a documentation/backlog-impact assessment in the same PR. All product improvements and bug fixes are recorded in the PR lineage below; architecture, backlog, and README updates are added when the change affects their respective current-behavior, unshipped-work, or user/developer guidance scopes.

AGENTS.md points future development work at these documents before implementation begins and makes the documentation-impact assessment part of the normal definition of done.

## ADR-038 — Require documentation impact assessment for every change

Status: Current  
Introduced in PR #32 after the PR #31 documentation consolidation.

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

## ADR-039 — Keep unshipped work in a repository backlog, not chat history

Status: Current  
Introduced in PR #33

Project chats are useful working context but are not a reliable long-term backlog. Deleting a chat should not erase a confirmed future commitment or known technical debt.

The repository therefore maintains `docs/BACKLOG.md` for work that has not shipped yet.

Rules:

- active backlog items require confirmed user intent or verified technical debt;
- speculative assistant suggestions are not active requirements;
- rejected or intentionally deferred ideas are recorded with status/reason when preserving that context is useful;
- when an item ships, remove it from Active/Deferred and record the shipped result in the PR lineage here;
- newest explicit user direction and newest `main` outrank backlog text;
- backlog presence never authorizes an unreviewed production migration or destructive change.

This separates present architecture, shipped history, and future work cleanly enough that old project chats can be removed without making them the only copy of important project knowledge.

## ADR-040 — Require self-starting real-browser regression coverage for UI work

Status: Current  
Introduced in PR #36.

Source/VM assertions remain useful for deterministic contracts, but they cannot prove that responsive CSS actually fits, that text is not visually clipped, or that modal/sheet geometry remains usable in a real browser.

The repository therefore keeps a real Chromium regression suite for representative Planner behavior.

Rules:

- the browser test starts and stops its own deterministic local fixture server;
- the user is never required to launch Wrangler or another development server for browser-test CI;
- every pull request and every push to `main` runs the broad Planner regression workflow;
- UI/responsive work must keep the `browser-ui` job green;
- deterministic mocked Planner/catalog payloads are preferred for layout regression tests so upstream availability does not make UI checks flaky;
- fixture Pokémon/events represent stable regression scenarios, not claims about the current live rotation, and should change only when the encoded product contract intentionally changes;
- browser context fixes locale/timezone and reduces motion where practical to limit environment-driven timing/layout variance;
- upstream/live contract validation remains a separate check and does not gate pull requests; it runs on main pushes, schedules, and manual invocations so external outages/drift cannot create false-negative PR regressions.

The initial browser coverage freezes the regressions that prompted PR #36: intermediate-desktop text visibility, asynchronous Dynamax battle-intel rendering, mobile modal containment/background locking, and horizontal overflow.

## ADR-041 — Use one canonical Battle Plan priority after battle identity is known

Status: Current  
Introduced in PR #38.

The Planner previously exposed the general recommendation score on cards, Today, and Quick Status while the shared resource allocator used a separate Max-aware planning score for Max Battles. That allowed the same Max opportunity to appear with one priority in the UI while resource allocation compared it using another.

The user-facing Battle Plan therefore uses one canonical priority after battle identity is known.

Rules:

- preserve the underlying general/personal value as `recommendation_score`;
- expose canonical Battle Plan priority as both public `score` and explicit `planning_score`;
- Raid canonical priority equals the personalized Raid recommendation value;
- Max canonical priority is calculated by the shared Max-aware planning method and may incorporate current Max attacker utility, rarity/availability, and Max capability;
- normal Raid attacker rankings must never be treated as Max performance;
- the canonical score drives card presentation, Today, desktop Quick Status, recommendation ordering/co-leader selection, shared resource allocation, and existing future recommendation summaries;
- the allocator must derive from preserved `recommendation_score`, not recursively feed an already-canonical public Max score back into the Max formula;
- each recommendation carries score-basis/method metadata and a human-readable planning rationale;
- the highest Raid label remains **MUST RAID** while the equivalent Max label is **MUST BATTLE**.

This decision unifies scoring/presentation but does not by itself replace the legacy seven-day Raid-oriented budget forecast with a fully shared Raid + Max forecast. That remains separate future work.

## ADR-042 — Require verified evidence before assigning Max Particle entry cost

Status: Current  
Introduced in PR #39; extended in PR #46.

Max Particle entry cost affects whether the shared resource planner can safely allocate a Remote Pass to a Max Battle. A species/form label is not sufficient evidence for an entry cost, and event-specific rules can supersede historical standard values.

The Planner therefore uses evidence-driven Max cost normalization.

Rules:

- evidence precedence is explicit official battle-entry cost → verified official/event Max Battle tier/difficulty → structured current Max Battle tier data → private user per-opportunity tier fallback → unknown;
- current standard tier mapping is Tier 1 = 250 MP, Tier 2–3 = 400 MP, and Tier 4–6 = 800 MP;
- Dynamax or Gigantamax identity alone never assigns an MP cost;
- generic non-official text that merely claims an MP cost is not promoted to trusted entry-cost evidence;
- official difficulty can be parsed from numeric or word-form tier descriptions, including forms such as `Difficulty 3`, `3★`, and `six-star`;
- multiple tier groups in one official event page are scoped independently so one group's tier/cost cannot leak to another;
- the existing official Pokémon GO sync may decorate an already-normalized Max calendar event with `X-POGO-MAX-*` evidence and provenance, but it must not create duplicate availability solely to carry cost metadata;
- the event sync may also consume pokemon-go-api's structured current Max Battle list (currently sourced from SnackNap) to decorate a currently active event with a tier when official evidence is absent and every matched boss in that event resolves to the same tier;
- structured current-boss data is lower precedence than official event evidence and is never used to fabricate future availability;
- when automatic evidence remains unavailable, the user may select Tier 1–6 for that exact Pokémon/variant/event date range; the Planner stores the standard mapped MP cost in `max_battle_cost_overrides`;
- user tier data is a fallback, not a competing authority: verified automatic evidence wins if it later becomes available;
- normalized recommendations expose Max tier, cost, confidence, evidence source, evidence URL where applicable, and the opportunity key needed to edit/clear a user fallback;
- if neither automatic evidence nor a user fallback is available, the cost remains unknown and automatic Remote Max allocation stays blocked.

This decision improves cost coverage while preserving source precedence and the conservative unknown-cost behavior established by shared resource planning. PR #46 adds the lower-precedence structured current-tier source and the private per-opportunity user fallback without allowing species identity alone to invent a cost.

## ADR-043 — Use one shared Raid + Max forecast for future paid-battle guidance

Status: Current  
Introduced in PR #40.

The original seven-day budget forecast was built for ordinary Remote Raids. After Max Battles became first-class opportunities, the current shared allocator could compare Raid and Max today, but future-saving guidance still selected from a Raid-oriented forecast/top-recommendation representation. That allowed future Max opportunity, MP replenishment, and cross-day target progress to be represented incompletely.

The Planner therefore uses a shared future Battle forecast.

Rules:

- day-level inputs come from `recommendationsForDate()`, so event source precedence, suppression, and exact availability are resolved before forecasting;
- Raid and Max opportunities use their canonical planning methods, with no Raid-attacker proxy for Max;
- each forecast day applies the official shared Remote daily limit plus the user's personal ceiling; today's logged shared usage is subtracted and a one-day manual ceiling override applies only to today;
- remaining target progress/attempt caps are shared across the full horizon instead of being independently recreated for every available day;
- verified Max Particle entry cost is required for automatic Max allocation;
- MP held, today's remaining collection, future daily collection/storage rules, and already-planned Max spend are simulated across the horizon before later Max allocations are accepted;
- flexible opportunities may move across available days, while short-window opportunities are considered first so exact availability is respected;
- future-saving guidance selects from actual forecast allocations that are remotely and resource-feasible, not from the old Raid-only `top_recommendations` proxy;
- when the selected future opportunity is Max, the current-day MP reserve uses the forecast's replenishment/spend path when available;
- the legacy `remote_raid_plan` API envelope remains for compatibility, but `budget_forecast_kind = "shared_battle"` and explicit Raid/Max additional-count fields define the new forecast semantics;
- the legacy ordinary-Raid allocator may remain for backward-compatible Raid fields, but it receives only the Raid share selected by the shared forecast.

This supersedes the Raid-oriented future-budget model while preserving current Remote-limit, target-completion, source-precedence, and conservative unknown-MP invariants.

## ADR-044 — Rotate management and signed-calendar bearer credentials independently

Status: Current  
Introduced in PR #60.

Management links and calendar subscription URLs are separate bearer credentials with different consumers and recovery needs. A leaked credential must therefore be recoverable without forcing unrelated credentials to change.

Current decision:

- management-link rotation replaces only the planner's `users.manage_hash`;
- the already-authenticated Planner receives the new management capability once, switches its in-memory Authorization bearer immediately, and replaces the browser URL without navigating through the invalid old capability;
- management rotation does not change the preferred signed calendar credential or the legacy random-token calendar credential;
- the preferred signed calendar URL is versioned by a per-planner generation stored in `feed_link_credentials`;
- generation 0 preserves the exact historical HMAC payload and URL shape, so every pre-BL-015 signed subscription remains valid until that planner explicitly rotates or revokes it;
- regenerating the signed calendar URL advances the generation and enables it, immediately invalidating the prior signed generation for that planner only;
- revoking the signed calendar URL advances the generation and disables it until a later regeneration;
- the global `FEED_LINK_KEY` remains the signing secret and is not rotated merely to recover one planner's leaked URL;
- legacy `/calendar/<random-token>.ics` URLs remain independently compatible and keep their existing explicit legacy-revoke path.

Migration 0007 adds only the per-planner signed generation/revocation state. Before that migration exists, generation-0 signed URLs remain valid and signed-feed rotation is unavailable rather than failing existing subscriptions.

This decision treats credential recovery as scoped invalidation: rotate only the bearer that is believed to be exposed.

## ADR-045 — Centralize Planner overlay accessibility behavior

Status: Current  
Introduced in PR #61.

Planner dialogs, sheets, drawers, and the command palette previously owned parts of their Escape/focus behavior independently. That made keyboard behavior inconsistent and allowed background content to remain reachable while a foreground interaction was active.

The Planner now uses one shared overlay accessibility controller.

Current decision:

- only the top active overlay owns Escape;
- Tab and Shift+Tab are contained within the active overlay;
- closing restores focus to the opening control when it still exists and is visible;
- body siblings outside the active overlay are marked `inert` and `aria-hidden`, with their previous states restored afterward;
- hidden static overlays remain inert while closed;
- the mobile Targets filter drawer gets `role="dialog"` and `aria-modal="true"` only while it is acting as a mobile foreground sheet;
- Ctrl/Cmd+K cannot open the command palette over another active overlay;
- existing overlay-specific scroll-lock code remains responsible for page/background scroll containment;
- keyboard focus is visibly indicated by Planner-only `:focus-visible` styling;
- reduced-motion preference removes meaningful transition/animation delays and avoids smooth programmatic scrolling.

The controller owns cross-overlay keyboard/focus/isolation mechanics only. Feature-specific form state, save/cancel behavior, and scroll-lock details remain in `planner-app.js`.

## ADR-046 — Enforce a same-origin external-script CSP on the private Planner

Status: Current  
Introduced in PR #62.

The private Planner previously depended on one large inline application script plus a generated inline image error handler. That forced the shared HTML Content Security Policy to permit inline script execution even though the Planner already used same-origin static assets for its other modules.

Current decision:

- `manage.html` contains markup and external same-origin script references only; it must not contain executable inline `<script>` blocks;
- Planner-generated markup must not use inline `on*=...` event handlers;
- the Planner integration/orchestration code lives in `public/planner-app.js`;
- this extraction is a CSP boundary change, not a requirement to split `planner-app.js` further based on file size;
- the private `/manage/<token>` route is hardened with `script-src 'self'` and no `'unsafe-inline'` script source;
- `src/http-security.js` retains an inline-script-compatible default policy for other existing HTML surfaces that still contain inline JavaScript;
- `style-src 'unsafe-inline'` remains unchanged because the scope of BL-017 is executable script, not style refactoring;
- Chromium Planner fixtures run under the strict script policy, so accidental inline-script dependencies fail browser regression tests.

The route-specific policy is intentionally additive to the existing response-hardening contract: no-store, no-referrer, frame/object/base restrictions, Permissions Policy, and same-origin opener/resource policies remain unchanged.

## ADR-047 — Normalize Planner API failures at the shared client boundary

Status: Current  
Introduced in PR #63.

Planner feature code should not need to know whether a failed request returned JSON, HTML, an empty body, or no HTTP response at all. The shared authenticated client is the transport boundary and owns that normalization.

Current decision:

- `PlannerClient.api()` is the only normal Planner feature transport path;
- response bodies are read once as text and parsed as JSON when present;
- failed HTTP responses preserve structured JSON `error` or `message` strings when supplied by the Worker;
- non-JSON or empty failed responses use status-aware recovery messages rather than surfacing JSON parser errors or raw HTML;
- empty or non-JSON successful responses are treated as malformed API responses because Planner APIs are JSON contracts;
- fetch/connection failures become a stable connectivity message and do not expose browser-specific transport strings;
- normalized failures use `PlannerApiError` with `kind`, optional HTTP `status`, and `retryable` metadata while retaining ordinary `error.message` compatibility for existing UI handlers;
- authorization, not-found, throttling, and server failures receive distinct fallback guidance when no structured server message exists;
- the browser asset reference for `planner-client.js` is versioned so deployments cannot leave a cached client on the pre-normalization response parser.

This keeps feature UI simple: it can display `error.message` while the shared client preserves enough structured metadata for future recovery UX without duplicating parsing logic.

## ADR-048 — Permanent planner deletion uses authenticated parent-row cascade

Status: Current  
Introduced in PR #77.

A public planner can accumulate Targets, notes, Battle logs, resource history, preference state, per-planner overrides, and private calendar credentials. Capability rotation reduces exposure risk but is not a substitute for letting the holder of the management capability permanently remove that planner.

Current decision:

- permanent deletion is available only from an authenticated management session;
- the Preferences danger zone keeps the destructive control disabled until the user types the exact phrase `DELETE`;
- `DELETE /api/planner` independently requires the same exact confirmation in the request body, so bypassing the UI does not remove the confirmation boundary;
- after authentication and confirmation, the Worker performs one `DELETE FROM users WHERE id = ?` operation for the authenticated planner rather than manually deleting child tables one-by-one;
- planner-owned tables already use `FOREIGN KEY ... REFERENCES users(id) ON DELETE CASCADE`, so Targets, Remote usage/budget overrides, Max cost overrides, Battle resource state/history, legacy/new Battle logs, and signed-feed credential state are removed atomically with the parent;
- removing the parent row immediately invalidates the management token plus signed and legacy calendar links because all authorization/feed lookup paths require the owning user row;
- no BL-029 migration or deployment-binding change is required;
- after successful deletion, the browser clears Planner-specific session navigation state and replaces the private management page with the public landing page, which confirms completion without retaining the deleted capability URL.

Deletion is intentionally separate from ordinary preference saving and from credential rotation. Rotation remains the recovery action when a capability is exposed; deletion is irreversible data removal.

## ADR-049 — Monitor production with a separate read-only smoke workflow

Status: Current  
Introduced in PR #79; extended in PR #86.

The deterministic regression suite and upstream Pokémon-data live-contract checks answer different questions from whether the deployed production application is currently reachable and serving its core public/Worker paths. Increasing the existing scheduled regression workflow cadence would also increase unrelated upstream traffic and would make production availability dependent on third-party data availability.

Current decision:

- production availability is checked by a dedicated GitHub Actions workflow rather than by increasing the existing regression/live-contract schedule;
- the workflow runs after pushes to `main`, on manual dispatch, and every three hours;
- the smoke probe is read-only and requires no repository secret, planner creation, real management capability, calendar URL, or admin credential;
- it verifies the landing HTML, the versioned `landing-app.js` expected by the checked-out repository, and the public Data Sources page;
- it also requests a fixed synthetic invalid `/manage/<token>` URL and requires the private Planner shell to return HTML with `no-store`;
- the probe derives every versioned same-origin script/stylesheet reference from the checked-out `manage.html`, requires production to expose those exact current references, and GETs every referenced Planner asset so stale shells, partial static deployments, and missing versioned assets fail monitoring;
- critical Planner asset checks explicitly preserve the theme initializer, shared semantic stylesheet, Planner-specific responsive stylesheet, and main Planner application script contracts while automatically following other future versioned Planner assets;
- `GET /api/me` uses the same fixed synthetic invalid management token and requires the normal `401` JSON/no-store response, exercising the deployed Worker authentication path and a D1 management-token lookup without mutating state;
- short bounded retries absorb transient network failures and normal deployment overlap before the workflow is marked failed;
- the production workflow is operational monitoring, not a required pull-request gate; its probe logic and safety invariants are covered by deterministic local fixture/release-safety tests in `npm test`, including a missing-Planner-asset failure case;
- upstream `live-contract` remains separate so a Pokémon-data provider outage or schema drift cannot be confused with application uptime.

This provides repository-owned production coverage without introducing a new public health endpoint, persistent monitoring state, additional credentials, or state-changing probe traffic.

## ADR-050 — Bound planner-owned persistent growth at mutation boundaries

Status: Current  
Introduced in PR #80.

Public creation rate limits constrain how quickly new planners can be created, but they do not by themselves bound persistent D1 growth once a valid management capability exists. The storage contract therefore also needs per-planner limits on user-controlled rows while preserving ordinary long-term gameplay history and Undo semantics.

Current decision:

- a planner may store at most 250 Targets;
- Target notes are rejected above 2,000 characters rather than silently truncated;
- battle logging may create at most 200 log rows for one planner-local date and at most 20,000 unified battle-log rows for one planner;
- the limits apply to log rows, not battles: one log row can still represent up to 99 battles;
- existing Target edits and idempotent retries for an existing battle request ID remain allowed when the planner is at capacity;
- Target and battle-log insert predicates are evaluated inside the same SQL write as the insertion so concurrent requests cannot race past the storage bound;
- a planner may retain at most 250 active/future manual Max tier/cost overrides, with expired overrides pruned before capacity evaluation and the conditional capacity predicate included in the insert;
- the one-day Remote Raid budget override may be written only for the planner's current local date, matching the only date consumed by the product, and valid save/clear operations remove obsolete dated rows left by prior/direct API callers;
- historical Remote usage, Battle resource daily rows, and battle history are not opportunistically pruned because historical Undo depends on the original dated ledgers;
- the change requires no new D1 schema migration or Cloudflare rate-limit binding.

These bounds are deliberately well above normal Planner use and are storage-safety controls, not gameplay limits or recommended targets.

## ADR-051 — Planner-loss resilience uses credential-free portable backups

Status: Current  
Introduced in PR #81.

The Planner intentionally has no account/email identity layer, so a lost management capability cannot be safely reconstructed from server-side identity claims. Recovery must preserve that capability-security model rather than introducing a weaker secondary authentication path.

Current decision:

- a user with a valid management capability can download a versioned JSON backup of planner-owned settings, Targets, Remote usage, Battle resource state/history, Max tier overrides, legacy Raid history, and unified Battle history;
- the backup excludes management/calendar URLs, tokens and hashes, signed-calendar generation/enabled state, and global synchronized event/meta data;
- backups remain private user data because they may contain notes and gameplay history even though they contain no authorization capability;
- restore requires a valid destination management capability, exact `RESTORE` confirmation, and an otherwise empty destination planner; the intended lost-link flow is therefore create a new planner, keep its newly issued credentials, then restore the saved backup;
- restore request bodies are bounded to 25 MB in the Worker as well as the browser: Bearer/header/query capabilities are authenticated before body parsing, oversized declared or streamed bodies return JSON 413, malformed bounded JSON returns the stable restore-file 400, and the historical body-token compatibility form is accepted only through that bounded parser;
- restore never replaces the destination management hash, legacy calendar hash, or signed-calendar credential state;
- source Target/log IDs are remapped into a destination-planner namespace so source and restored planners can coexist without global primary-key collisions;
- missing/deleted Target references and legacy-log relationships are preserved under the namespace so existing Undo-conflict and unified-history semantics remain faithful to the source state;
- Battle logs are inserted with non-null unique restore markers so historical effects are not replayed by `battle_log_apply`; current target/resource/Remote ledgers are restored separately, while later Undo continues through the normal `battle_log_undo` trigger;
- obsolete dated Remote-ceiling overrides and expired Max overrides are not resurrected during restore;
- large arrays are inserted through chunked D1 JSON expansion inside one transactional `batch()`, with a statement-count ceiling chosen to leave headroom for authentication and validation under the Free-plan per-invocation query limit;
- no new D1 migration, account system, recovery secret, Cloudflare binding, or scheduled job is introduced.

A backup is therefore a portable reconstruction artifact, not a bearer credential and not an account-recovery token.

## ADR-052 — Appearance is browser-local and semantic-token driven

Status: Current  
Introduced in PR #85.

The Planner needs Light and Dark presentation across its public, private, and administrative surfaces, but appearance does not affect Pokémon GO planning state and should not become part of the management capability or D1 schema.

Current decision:

- appearance offers `system`, `light`, and `dark`, with System as the default;
- the preference is stored only in browser localStorage under `pogo-theme`; it is not stored in D1, exported in Planner Backup, included in calendar data, or synchronized between devices;
- one same-origin external `theme.js` is loaded synchronously before the shared stylesheet on Landing, Planner, Data Sources, and Admin so the resolved mode is applied before first paint without weakening the strict `script-src 'self'` policy;
- System follows `prefers-color-scheme` continuously, while explicit Light/Dark choices remain stable until the user changes the preference;
- the resolved mode updates root `data-theme` metadata, native `color-scheme`, and the page's existing `theme-color` meta value;
- shared semantic CSS variables own page, surface, text, border, input, status, overlay, shadow, and map-background roles; Planner-specific surfaces consume those same tokens rather than maintaining an independent dark stylesheet;
- Pokémon/source/status accents retain their semantic identity with theme-appropriate backgrounds/text instead of being flattened into neutral colors;
- `styles.css` moves to cache generation v43, `planner.css` to v5, and the theme controller begins at `theme.js?v=1`;
- BL-040 remains responsible for dedicated automated contrast/theme-accessibility assertions, rather than making screenshot diffs the primary BL-035 correctness gate.

No D1 migration, Worker API field, Cloudflare binding, secret, route, or Cron change is required.

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
| #32 | Mandatory documentation impact assessment | Requires every product improvement/bug fix to be logged and routes architecture, README, and workflow updates by impact. |
| #33 | Durable backlog and chat-cleanup context | Added docs/BACKLOG.md, recorded the schema-completeness debt and non-planned Max-team idea, and made backlog maintenance part of the normal workflow. |
| #34 | D1 schema baseline reconciliation | Verified the two missing operational table/index definitions against production D1, reconciled the fresh schema, added idempotent migration 0004 and regression coverage, and closed BL-001 without changing current production data. |
| #35 | Max battle intel + desktop text visibility | Resolves Max weakness/resistance intel through the underlying exact form, replaces permanent post-load placeholders with an explicit unavailable state, and keeps Battle Resources guidance fully visible on desktop. |
| #36 | Automated browser regressions + broad Planner CI | Added self-starting Chromium responsive tests, made Planner regression CI run on every PR/main push, broadened JavaScript syntax coverage, and moved the remaining audit improvements into the durable backlog. |
| #37 | Failure-safe Pokémon catalog loading | Added explicit catalog load states, retryable terminal failures, validated last-known-good local fallback, and browser regressions so Battle Plan intel/Hundo cannot remain stuck loading after catalog failure. |
| #38 | Unified Battle Plan priority scoring | Made the Max-aware planning value the canonical visible Max priority, preserved the underlying recommendation score, aligned cards/Today/Quick Status/allocation/future summaries, and closed BL-002. |
| #39 | Verified Max Particle cost evidence | Normalized official Max difficulty/cost evidence onto existing opportunities, removed species-based Gigantamax cost assumptions, preserved unknown-safe allocation, and closed BL-007. |
| #40 | Shared Raid + Max future forecast | Replaced the Raid-oriented seven-day forecast with a shared resource-aware Battle forecast, modeled cross-day target/MP constraints, switched future reserve guidance to feasible allocations, and closed BL-006. |
| #41 | Planner schedule/forecast visibility fixes | Displayed exact temporary Remote-limit windows in the planner timezone, exposed derived weekly Dynamax rotations through the Max Battles calendar category, and added expandable Paid Battle Forecast details including unallocated Max opportunities/reasons. |
| #42 | Forecast Raid/Max count-label clarification | Replaced ambiguous total-plus-Max labels such as “4 · 1 Max” with mutually exclusive system counts such as “3 Raid + 1 Max” without changing forecast allocation semantics. |
| #43 | Canonical grouped Max Battle Pokémon identity | Canonicalized event-derived Max Pokémon names before recommendation/resource output so grouped schedules apply Dynamax/Gigantamax identity to every matched species; added regressions for the Kanto bird rotation and downstream metadata consistency. |
| #44 | Ordinary Dynamax sprite fallback | Centralized battle sprite resolution so ordinary Dynamax reuses the exact underlying species/form sprite across recommendations, forecasts, Targets, and recent logs while regional forms remain exact and Gigantamax stays exact-only. |
| #45 | Zero-Remote allocation explanations | Closed BL-008 by adding structured shared-plan non-allocation reasons, surfacing compact system-aware reasons directly on Raid/Max cards, and replacing the Raid-only zero-allocation section with a shared filtered collapsible Battle list. |
| #46 | Max tier fallbacks + editable Target identity | Added current structured Max tier ingestion plus private per-opportunity tier overrides for unknown MP costs, and allowed Pokémon/Battle/Target type corrections on existing targets while keeping stable IDs/history links and duplicate protection. |
| #47 | Intermediate desktop + private-surface hardening | Closed BL-009/BL-010 by delaying dense desktop splits until 1180px, adding width-boundary browser regressions, moving current Planner/Admin API credentials into headers with legacy compatibility, and adding no-referrer/CSP/frame/content/no-store response protections. |
| #48 | BL-011A Planner client extraction | Began incremental BL-011 modularization by moving management capability/API transport plus shared escaping/number formatting out of `public/manage.html` into `public/planner-client.js`, preserving the PR #47 auth/security contract and existing Planner behavior. |
| #49 | BL-011B Target logic extraction | Continued incremental BL-011 modularization by moving pure Target progress, availability, filtering, sorting, status counts, grouping, and view-model logic into `public/planner-target-logic.js` while keeping rendering and mutations in `manage.html`. |
| #50 | BL-011C Calendar logic extraction | Continued incremental BL-011 modularization by moving pure UTC date/month helpers, event-range matching, source-class normalization, and Monday-first month-grid projection into `public/planner-calendar-logic.js` while keeping Calendar rendering/fetch/cache state in `manage.html`. |
| #51 | BL-011D Hundo logic extraction | Continued incremental BL-011 modularization by moving Hundo CP multiplier/formula logic, standard benchmark generation, and Hundo search ranking into `public/planner-hundo-logic.js` while keeping catalog loading, recent selections, and DOM/input state in `manage.html`. |
| #52 | BL-011E Battle Plan resource logic extraction | Continued incremental BL-011 modularization by moving recommendation filtering/counts, allocation lookup maps, zero-allocation compatibility/reason labels, score tone, and Max tier/cost metadata into `public/planner-battle-plan-logic.js` while keeping card DOM/actions in `manage.html`. |
| #53 | BL-011F Battle Intel extraction | Continued incremental BL-011 modularization by moving Pokémon GO type-effectiveness and Battle Intel aggregation into `public/planner-battle-intel.js`, while keeping exact catalog/form resolution and Intel DOM rendering in `manage.html`. |
| #54 | BL-011G Planner stylesheet split | Continued incremental BL-011 modularization by moving the Planner-only responsive/feature tail of `public/styles.css` into `public/planner.css`, loaded after the shared base stylesheet only by `manage.html`; bumped shared CSS cache generation to v42. |
| #55 | BL-011H Worker HTTP security extraction | Continued incremental BL-011 modularization by moving JSON/error responses, management/admin credential parsing, and response-hardening policy into `src/http-security.js` while preserving the established `src/index.js` helper re-exports and legacy credential compatibility. |
| #56 | BL-011I iCalendar parsing extraction + BL-011 closure | Completed the BL-011 modularization series by moving pure RFC 5545/date-property parsing into `src/calendar-ics.js`, adding dedicated regression coverage, and removing BL-011 from Active after confirming the remaining large Planner/Worker files are orchestration surfaces rather than unbounded modularization work. |
| #57 | BL-012 timezone validation | Validates and canonicalizes IANA timezone identifiers at browser and Worker ingress, surfaces malformed legacy timezone state for correction, preserves a logged UTC fallback only for legacy compatibility, and records BL-013 through BL-018 from the 21 September 2026 product audit. |
| #58 | BL-013 durable official schedule discovery | Reuses stored official source URLs for still-future supplement rows beyond the newest-news discovery window, includes stale future rows for self-recovery, and limits replacement/staling to official pages that fully refreshed successfully so transient source failures preserve last-known future availability. |
| #59 | BL-014 per-source synchronization health | Adds additive D1-backed health for event, official, and meta synchronization sources; preserves last-success/item-count across failed attempts; filters event warnings to the user's relevant sources; and keeps legacy freshness timestamps as a deployment-order fallback until migration 0006 is applied. |
| #60 | BL-015 independent credential rotation | Rotates the management capability independently from calendar credentials and adds per-planner signed-calendar generations/revocation state while preserving generation-zero signed URLs and legacy random-token calendar compatibility until each credential is explicitly rotated or revoked. |
| #61 | BL-016 keyboard and modal accessibility | Centralizes focus containment, Escape dispatch, opener focus restoration, background inert/aria-hidden isolation, visible keyboard focus, reduced-motion handling, and real-browser regressions across Planner modals, sheets, drawers, and the command palette. |
| #62 | BL-017 Planner script CSP hardening | Externalizes the remaining Planner integration script, removes generated inline event handlers, and applies `script-src 'self'` without `'unsafe-inline'` to the private management route while preserving compatibility policy on other HTML surfaces. |
| #63 | BL-018 Planner API and transport failure normalization | Centralizes response parsing and transport failure handling in `planner-client.js`, preserving structured server errors while turning non-JSON, empty, and network failures into stable actionable messages with typed metadata. |
| #64 | Fresh product audit backlog | Closed without merge; superseded by #65, which carries the verified BL-020 through BL-028 backlog forward while shipping BL-019. |
| #65 | BL-019 half-level Hundo CP correctness | Replaces arithmetic half-level CPM interpolation with Pokémon GO's root-mean-square relationship, adds canonical low-level regressions, bumps the Hundo helper asset version, and removes BL-019 from Active. |
| #66 | BL-020 stacked implementation | Closed without merge after #65 was squash-merged; retargeting exposed pre-squash history conflicts, so the validated BL-020 diff was replayed cleanly in #67. |
| #67 | BL-020 Mobile More tab preservation | Restricts tab activation wiring to real `data-tab` controls so opening the mobile More sheet preserves the current/saved tab, with Chromium coverage from a non-Plan section and a Planner app asset-version bump. |
| #68 | BL-021 generic 500 error disclosure | Keeps unexpected Worker exceptions in server-side logging while reducing the public generic 500 JSON contract to a stable error message with no raw internal detail, backed by a behavioral regression against the real Worker fetch boundary. |
| #69 | BL-022 planner creation abuse protection | Adds repository-owned Cloudflare Workers Rate Limiting bindings before public planner creation, combining a hashed per-client threshold with a route-wide per-location ceiling, explicit 429/Retry-After responses, fail-closed limiter errors, and deterministic config/Worker regressions without storing raw IPs in D1 or logs. |
| #70 | BL-023 strict CSP on landing and Admin | Externalizes landing and Admin application JavaScript into same-origin assets, applies `script-src 'self'` to `/`, `/index.html`, and `/admin`, preserves Admin no-store and existing response hardening, and adds deterministic plus Chromium regressions that prevent inline-script reintroduction. |
| #71 | BL-024 landing/Admin API failure normalization | Adds a shared JSON API transport boundary for landing and Admin that preserves structured server errors, converts empty/non-JSON/malformed responses into stable status-aware messages, normalizes network failures, and keeps existing Admin credential/header behavior intact with deterministic and Chromium coverage. |
| #72 | BL-025 stacked implementation (superseded, unmerged) | Validated the single-target deletion failure UX while stacked on BL-024, but was closed without merge after PR #71 was squash-merged and retargeting produced a history conflict. |
| #73 | BL-025 single-target deletion failure UX | Clean replay from post-#71 `main`; handles single-target delete failures locally in Planner Targets, reports progress/failure in an `aria-live` status region, preserves target/search/tab context on failure, retains reload-on-success behavior, and covers both outcomes in Chromium. |
| #74 | BL-026 Planner tab keyboard semantics | Implements roving tabindex and ArrowLeft/ArrowRight/Home/End activation across true Planner tabs, adds explicit tab/panel ARIA relationships, moves Mobile More outside the tablist while preserving its mobile fifth-slot layout, and covers keyboard/focus behavior in Chromium. |
| #75 | BL-027 production-main enforcement | Records the active `Production main` GitHub ruleset after verification that `main` reports `protected: true`; the ruleset requires PRs plus `deterministic` and `browser-ui`, leaves `live-contract` non-blocking and strict up-to-date mode off, blocks deletion/force pushes, and has no bypass actors. |
| #76 | BL-028 dependency install and Worker packaging CI gate | Makes the required `deterministic` PR job run lockfile-backed `npm ci` and a non-deploying Wrangler `deploy --dry-run` package/config check, with a regression that preserves the install/package gate and keeps `live-contract` non-blocking. |
| #77 | BL-029 permanent self-service planner deletion | Adds exact typed/server confirmation plus authenticated `DELETE /api/planner`; deleting the parent planner row uses existing D1 cascades to remove planner-owned data and immediately invalidate management/calendar capabilities, with deterministic SQLite and Chromium regressions and no migration. |
| #78 | BL-030 automatic new-planner timezone detection | Replaces the fixed Singapore onboarding value with validated browser timezone detection, preserves manual overrides, leaves the field empty when detection is unavailable instead of silently assuming another region, and adds deterministic plus Chromium coverage. |
| #79 | BL-031 production smoke monitoring | Adds a separate read-only production smoke workflow on `main` pushes, manual dispatch, and a three-hour schedule; checks public assets plus a synthetic-invalid Worker/D1 lookup without secrets or state mutation, with deterministic fixture and release-safety coverage. |
| #80 | BL-032 planner storage growth bounds | Bounds per-planner Targets, Target-note length, daily/total battle-log rows, and active/future Max tier overrides; restricts the one-day Remote ceiling override to the current planner-local date and prunes obsolete override rows, with race-safe SQL predicates and focused SQLite coverage. |
| #81 | BL-033 portable planner backup and restore | Adds management-authenticated credential-free JSON backup plus empty-planner atomic restore, preserves destination capabilities and history/Undo semantics through namespaced ID remapping, and adds deterministic plus Chromium recovery coverage without a migration. |
| #82 | BL-033 responsive Preferences layout follow-up | Fixes the Backup & Recovery desktop regression by resetting grid card margins, pairing Management/Delete cards, giving backup controls a full-width row, preventing action-button collapse, bumping Planner CSS to v4, and adding cross-breakpoint primary-tab/Preferences layout regressions. |
| #83 | Latest product audit backlog capture | Promotes the user-confirmed 24 September 2026 audit findings into Active BL-034 through BL-040: restore request hardening, semantic dark-mode theming, Planner-aware production smoke, WebKit/Safari smoke, backup/recovery discoverability, unified branding, and automated contrast/theme accessibility coverage. |
| #84 | BL-034 restore request hardening | Enforces the 25 MB restore boundary in the Worker, authenticates non-body management capabilities before reading restore JSON, preserves bounded legacy body-token compatibility, returns stable 413/400 failures, and adds focused deterministic coverage without changing the backup format or D1 restore semantics. |
| #85 | BL-035 System / Light / Dark appearance | Adds browser-local System/Light/Dark theming with a pre-CSS same-origin initializer, semantic shared/Planner tokens, native color-scheme/theme-color integration, all-surface controls, cache bumps, and Chromium persistence/responsive regressions without adding planner/D1 state. |
| #86 | BL-036 Planner-aware production smoke | Extends the existing secret-free GET-only production monitor to a synthetic no-store Planner shell plus every current versioned Planner asset, explicitly checks theme/shared CSS/Planner CSS/main Planner JS contracts, and adds deterministic success/missing-asset regressions without changing the workflow cadence or production app runtime. |

## Supersession map

Important historical replacements:

- Part 3 / PR #20 intentionally kept the ordinary Remote Raid numeric cap separate from Remote Max while official rules were unclear.
- PR #27 superseded that choice: Remote Raid and Remote Max now share the official daily Remote participation ceiling.
- Part 6 used provisional Max opportunity value rather than misusing Raid rankings.
- PR #24 superseded that provisional intelligence for attacker analysis with dedicated Max rankings.
- Date-only Remote-limit interpretation was sufficient until a cross-timezone event exposed the flaw.
- PR #29 superseded automatic date-only interpretation whenever exact official timing can be parsed safely.
- The original paid-Raid seven-day forecast remained Raid-oriented after Max Battles were introduced.
- PR #40 superseded that future-planning proxy with a shared Raid + Max forecast that models target progress, shared Remote capacity, and Max Particle replenishment across days.

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
- development/documentation/release governance;
- backlog/change-lifecycle governance.

A routine bug fix that restores an existing invariant usually needs a PR-lineage entry, focused regression coverage, and—when the invariant was previously unclear—an architecture clarification. It does not need a new ADR unless the underlying decision or rationale changed.

README, ARCHITECTURE, and BACKLOG updates are selected by impact rather than mechanically: update README for user/developer/operator-facing changes, ARCHITECTURE for current-system/invariant changes, and BACKLOG for confirmed unshipped work/status changes. AGENTS.md owns the mandatory assessment and PR workflow.

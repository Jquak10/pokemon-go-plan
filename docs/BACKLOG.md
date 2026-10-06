# Pokémon GO Battle Planner — Backlog

Last reviewed: 6 October 2026

This file is the durable home for **confirmed but unshipped work** and explicitly deferred/rejected ideas that would otherwise exist only in project chats.

It is intentionally different from the other repository references:

- `docs/ARCHITECTURE.md` describes how the system works now.
- `docs/DECISIONS.md` records durable decisions and shipped PR history.
- `README.md` explains user/developer/operator usage.
- `AGENTS.md` defines the development and release workflow.
- `docs/BACKLOG.md` records work that has **not shipped yet**.

## Backlog rules

1. Chat history is not a durable backlog. A future idea matters after chat cleanup only if it is captured here or explicitly reintroduced by the user.
2. Add only:
   - confirmed user-requested future work;
   - verified technical debt or known defects;
   - intentionally deferred work with a clear reason.
3. Do not turn speculative assistant suggestions into active requirements.
4. When an item ships, remove it from Active/Deferred in the same PR and record the shipped result in the `docs/DECISIONS.md` PR lineage.
5. When an item is rejected, move it to **Not planned** with the reason rather than leaving it ambiguous.
6. Newest explicit user direction and newest `main` always outrank this file.
7. Never create a production migration solely because an item appears here. Inspect current production state and follow the normal migration/release workflow.

## Active

### BL-061 — Make PvP recommendation scoring league-complete

**Priority:** High

The Planner exposes a generic **PvP importance** preference and describes PvPoke as a general PvP analytical input, but the automatic meta pipeline currently imports only PvPoke Master League overall rankings.

This can undervalue Pokémon whose primary PvP usefulness is in Great League or Ultra League when a user gives PvP meaningful weight.

Implement a league-complete PvP scoring model that:

- imports Great League, Ultra League, and Master League overall ranking inputs;
- preserves exact Pokémon/form identity and does not silently substitute regional or other forms;
- derives and documents a stable general-PvP value for recommendation weighting;
- exposes enough explanation to tell the user which league or leagues contributed to the score;
- adds deterministic regression coverage for league specialists and form-specific matching.

If a full league-complete model is intentionally deferred, the interim UI must explicitly scope the preference and source copy to **Master League** rather than presenting the current input as general PvP value.

### BL-062 — Make Planner browser storage failure-safe

**Priority:** High

Optional Planner UI state currently uses direct `localStorage` and `sessionStorage` reads/writes in several paths, including top-level startup reads for Battle Plan filtering and Target view mode. Browsers or privacy/security policies can make Web Storage unavailable or throw `SecurityError`; optional local UI state must not prevent the Planner itself from booting.

Introduce a shared failure-safe browser-storage boundary that:

- catches read, write, and remove failures;
- falls back to product defaults when storage is unavailable;
- covers selected Planner tab, Battle Plan filter, Target view mode, desktop density, last battle participation type, Hundo recents, and other optional browser-local state;
- preserves the existing best-effort catalog/theme behavior;
- adds a browser regression where Web Storage throws and the Planner still loads and remains usable.

No planner-owned D1 state should be moved into browser storage as part of this work.

### BL-063 — Add recoverable Planner load and refresh state

**Priority:** High

Planner API failures are already normalized into actionable user-facing messages, but an initial `/api/me` failure has no in-app Retry action. In addition, the shared `load()` helper catches refresh failures internally, so a mutation can succeed while the subsequent state refresh fails and the caller cannot distinguish that partial-success state.

Harden Planner recovery so that:

- initial Planner load failures expose an explicit Retry action without requiring a full-page reload;
- retryable refresh failures preserve already rendered state instead of replacing it with misleading stale-success presentation;
- mutation flows can distinguish **mutation failed** from **mutation succeeded but the latest Planner state could not be refreshed**;
- successful recovery clears prior error styling/state;
- duplicate submissions remain prevented by the existing mutation/idempotency protections;
- Chromium coverage extends the existing HTTP/network failure tests through successful Retry/recovery and post-mutation refresh failure.

### BL-064 — Cover the successful Planner read model in production monitoring

**Priority:** Recommended

Production smoke currently validates public assets, schema compatibility, source freshness, the public Pokémon catalog, and the invalid-management-token `/api/me` contract without using a real planner credential. That intentionally safe design leaves one monitoring gap: it does not execute the successful authenticated Planner read-model assembly path in production.

Add a sanitized, credential-free and read-only production health/canary contract that:

- exercises the D1/query/composition dependencies required to assemble a normal Planner read model;
- uses no real management or calendar bearer credential and exposes no planner-owned row data;
- fails when the successful Planner read model would be structurally unavailable even though generic schema/freshness endpoints remain healthy;
- remains suitable for the existing Production smoke workflow and BL-055 sanitized diagnostics boundary;
- has deterministic local coverage for healthy and failed dependency states.

Do not introduce a synthetic mutable production planner or secret credential into CI merely to satisfy this monitor.

## Deferred

No confirmed deferred feature commitments are currently recorded.

## Not planned

### NP-001 — Lightweight "My Max Team" / Pokémon roster tracking

A possible feature was discussed where the Planner could store a small set of owned Dynamax/Gigantamax Pokémon and Max Move levels to estimate battle readiness.

It is **not planned** at present.

Reasons:

- the user questioned whether the feature was actually necessary;
- Max boss weaknesses and battle guidance do not require maintaining a personal Pokémon roster;
- the current product principle is to track goals and scarce resources rather than become a full Pokémon storage/team manager.

Revisit only if the user explicitly asks for owned-team/readiness tracking and the benefit justifies the additional data-entry and maintenance complexity.

## Chat-cleanup audit

The Max Battle work that was discussed in the long-running project conversation has already been implemented and durably recorded through the merged Max-related PRs and the architecture/decision documents.

BL-001 was resolved after the production D1 definitions for `event_suppression_rules` and `remote_raid_daily_budget_overrides` were inspected directly and reconciled into the repository schema, migration path, and regression coverage.

A follow-up repository audit on 18 September 2026 identified the improvement work tracked here. Automated browser regression coverage and broad PR CI shipped in PR #36, failure-safe Pokémon catalog loading shipped in PR #37, canonical Battle Plan priority scoring shipped in PR #38, and verified Max Particle cost evidence shipped in PR #39. Completed items are removed from Active and retained in `docs/DECISIONS.md` instead.

BL-011 was completed through the incremental Planner/Worker modularization series ending with the iCalendar parsing extraction. The resulting boundaries cover Planner client/auth, Targets, Calendar, Hundo, Battle Plan/resources, Battle Intel, Planner-only CSS, Worker HTTP security, and pure iCalendar parsing. Remaining large integration files are intentionally orchestration surfaces rather than backlog items based on size alone.

The first fresh product audit on 21 September 2026 identified BL-012 through BL-018. BL-012 shipped in PR #57, BL-013 in PR #58, BL-014 in PR #59, BL-015 in PR #60, BL-016 in PR #61, BL-017 in PR #62, and BL-018 in PR #63.

A second fresh audit after PR #63 verified the current `main` behavior, deterministic/browser/live-contract CI, public/Admin surfaces, security boundaries, accessibility wiring, and release controls. That audit identified BL-019 through BL-028. BL-019 shipped in PR #65, BL-020 in PR #67, BL-021 in PR #68, BL-022 in PR #69, BL-023 in PR #70, BL-024 in PR #71, BL-025 in PR #73, BL-026 in PR #74, and BL-027 in PR #75. BL-028 shipped in PR #76, leaving no active items from that audit. These entries are limited to demonstrated defects or concrete repository/operational gaps; no item was added merely because a large integration file exists or because a speculative feature might be useful.

A fresh public-readiness audit on 23 September 2026 identified whole-planner self-service deletion, fixed Singapore timezone onboarding, repository-owned production smoke monitoring, unbounded planner-owned storage growth, and loss of the private management capability without a portable recovery path as concrete public-launch gaps. BL-029 shipped in PR #77 with management-authenticated permanent deletion, BL-030 in PR #78 with validated browser timezone detection, BL-031 in PR #79 with scheduled/post-`main` read-only production smoke monitoring, BL-032 in PR #80 with planner-owned storage growth bounds, and BL-033 in PR #81 with credential-free portable backups plus empty-planner atomic restore. PR #82 then fixed the responsive Preferences regression introduced around the expanded backup/recovery surface.

A fresh product audit on 24 September 2026 reviewed the post-BL-033 production state, responsive coverage, security/recovery boundaries, monitoring, cross-browser coverage, accessibility, branding, and readiness for dark mode. The user explicitly asked to promote all identified audit items into the durable backlog. BL-034 through BL-040 therefore track restore request hardening, semantic dark-mode theming, Planner-aware production smoke coverage, WebKit/Safari smoke coverage, backup/recovery discoverability, unified product branding, and automated contrast/theme accessibility checks.

BL-034 shipped in PR #84 on 24 September 2026: restore capabilities presented outside the body are authenticated before body parsing, every restore request is bounded to 25 MB server-side even without a trustworthy `Content-Length`, and focused deterministic coverage preserves the valid BL-033 restore/Undo contract.

BL-035 shipped in PR #85 on 24 September 2026 with browser-local System/Light/Dark appearance, early pre-CSS theme initialization, semantic shared/Planner theme tokens, all-surface controls, native `color-scheme`/theme-color integration, and Chromium persistence/responsive coverage.

BL-036 shipped in PR #86 on 24 September 2026: Production smoke now checks a synthetic no-store Planner shell, requires its current versioned asset references, fetches every referenced Planner script/stylesheet read-only, explicitly validates theme/shared CSS/Planner CSS/main Planner JavaScript contracts, and has a deterministic missing-asset failure regression.

BL-040 shipped in PR #87 on 24 September 2026: semantic Light/Dark tokens receive deterministic WCAG contrast checks, Chromium verifies representative computed component/calendar/source contrast plus focus/disabled states, and theme changes during active overlays preserve keyboard focus, dialog/tab/live-region semantics, inert background isolation, and reduced-motion behavior. The audit also tightened the few Light-theme tokens that fell just below the new thresholds. BL-039 shipped in PR #89: **Pokémon GO Battle Planner** with **Personal Battle Strategy** is the canonical user-facing branding across Landing, Planner, Data Sources, Admin, README, architecture guidance, and production-smoke title assertions; the supporting copy explicitly covers Raids plus Dynamax/Gigantamax Max Battles without implying roster/storage management. BL-038 shipped in PR #90 with explicit management-link/backup guidance before and after planner creation, an exact new-empty-planner restore flow, and a mobile More description that surfaces access plus backup/recovery. BL-037 is implemented by PR #91 by extending the existing required `browser-ui` gate with a focused deterministic Playwright WebKit smoke suite for landing/theme, Planner shell, mobile fixed navigation and safe-area spacing, More/Preferences/backup controls, Calendar, representative overflow, and desktop sticky behavior. No active backlog items remain.

A fresh post-PR-#91 product audit identified BL-041 as a verified production-routing security mismatch. PR #92 added selective Worker-first public HTML routing and stronger production smoke, but the post-merge smoke correctly proved that the live release path still served the Landing asset without the Worker CSP. PR #93 fixes the live path by using Cloudflare Static Assets `public/_headers` for public/static HTML while retaining Worker hardening on dynamic/private routes, so the deployed security policy no longer depends on public HTML being Worker-first. No D1 migration is required.

The same 25 September 2026 fresh product audit identified five additional concrete follow-ups. The user explicitly promoted all of them into the durable backlog: BL-042 completes remaining accessibility semantics, BL-043 adds production data-freshness monitoring, BL-044 adds a public data-handling/support surface, BL-045 updates GitHub Actions for Node-24-era runtime compatibility, and BL-046 separates current README guidance from historical rollout instructions. These are now confirmed Active work rather than optional audit notes.

BL-042 is implemented by PR #95: all static form controls across Landing, Planner, Data Sources, and Admin receive programmatic names; remaining short user-action feedback becomes polite atomic status output; Target view/status, battle participation, and Admin section controls expose their selected state programmatically; generated recent-battle and Max-tier feedback receives the same live semantics; and deterministic plus Chromium regressions protect the contract. No D1 or CSS migration is required.

BL-043 is implemented by PR #96 using the existing migration-0006 source-health table: a public read-only `/api/health/data-freshness` signal evaluates every scheduled event/official/meta dependency, allows transient degraded state while last-known-good data is under 18 hours old, and marks stale/missing/unavailable health as non-monitor-safe. Production smoke consumes the signal every three hours, and deterministic tests cover healthy, degraded, stale, missing-health, sanitization, and read-only behavior. No D1 migration is required.

BL-044 is implemented by PR #97 with a static public `/help` surface linked from Landing, Data Sources, and Planner Preferences. It documents planner-owned D1 data, browser-local appearance, bearer management/calendar credential safety, backup/recovery limits, permanent deletion, and safe issue reporting through the repository's public GitHub tracker without exposing private URLs or backup files. Static-header, deterministic content, Chromium discovery/overflow, and production-smoke coverage protect the surface. No D1, identity, analytics, or support-backend change is required.

BL-045 is implemented by PR #98: Planner regression and Production smoke use the current v7 GitHub first-party checkout/setup actions whose internal runtime is Node 24-era compatible, while the repository test runtime remains Node 22. `package.json` now explicitly declares `"type": "module"` to match the existing ESM source modules and remove `MODULE_TYPELESS_PACKAGE_JSON` reparsing warnings, and deterministic release-safety coverage rejects regressions to pre-v7 first-party Action majors. Existing PR gates, live-contract behavior, browser coverage, Worker dry-run packaging, and read-only Production smoke cadence are unchanged.

BL-046 is implemented by PR #99: the README is now current-state guidance for product usage, fresh-environment setup, deployment, and migration state; historical Part 4/5 rollout notes and one-time D1 commands are preserved in `docs/ROLLOUT_HISTORY.md` behind an explicit do-not-rerun warning. Fresh databases use `schema.sql`, older installations apply only release-specific migrations after schema inspection, and deterministic documentation-safety coverage prevents historical rollout commands from drifting back into the current README. No D1, Worker/API, CSS, Cloudflare configuration, Cron, secret, binding, or gameplay behavior change is required.
A fresh post-PR-#99 product audit on 25 September 2026 identified six concrete follow-ups. The user explicitly promoted them into the durable backlog as BL-047 through BL-052: bearer-safe Worker observability, generalized official cancellation/reschedule suppression, expiry of stale pinned official pages, completion of the 44px mobile touch-target contract, implausibly-empty upstream sync rejection, and production D1 schema-compatibility health.

BL-047 is implemented by PR #100: Workers Logs/custom error output stays enabled, but automatic Fetch invocation logs are explicitly disabled because Cloudflare invocation records include request URLs and this product intentionally carries management/calendar bearer credentials in URL paths. Deterministic release-safety coverage locks that configuration, and the architecture now records the bearer-safe observability boundary. No D1 migration, route, Cron, secret, binding, Service Binding, CSS, or application behavior change is required.

BL-048 is implemented by PR #101: official cancellation/reschedule parsing now recognizes definite rescheduled, postponed, cancelled/canceled, suspended, will-not-take-place, and move-to-later/new-date language only when the same sentence positively names an already-normalized stored event. Targeted suppression selectors combine source type with normalized event identity and reuse the event's stored date window, so one event can be hidden without suppressing unrelated same-source/same-date events. Conditional wording such as "may be suspended" remains non-suppressing, the existing broad Mega Finale replacement rule remains intact, and Calendar/ICS plus recommendation/current-availability paths reuse the same suppression model. No D1 migration, CSS/cache, route, Cron, secret, binding, or Service Binding change is required.

BL-049 is implemented by PR #102: temporary official-page pins now carry explicit event horizons, so the Mega Finale/Armored Mewtwo pages stop receiving pinned discovery priority after 6 September 2026 and no longer consume current-news discovery slots. The retained-future-source lane remains separately bounded and can still revisit an expired former pin when a stored future official supplement references it. Existing historical event/evidence rows are not deleted or rewritten. No D1 migration, CSS/cache, route, Cron, secret, binding, Service Binding, or deployment-config change is required.

BL-051 is implemented by PR #104: Pokédex and PvPoke meta inputs now declare a minimum viable yield of one item. A structurally valid zero-item response is converted into the existing failed-attempt health path before success persistence, preserving the previous last-success timestamp and item count while recording the new attempt/error for freshness monitoring. Sources without an explicit minimum remain zero-safe. Deterministic coverage protects healthy, empty/degraded, and recovery-compatible semantics. No D1 migration, CSS/cache, route, Cron, secret, binding, Service Binding, or deployment-config change is required.

BL-050 is implemented by PR #103: the Planner-only mobile stylesheet now enforces a 44×44 touch-box contract across discrete buttons, selects, text inputs, collapsible summaries, compact icon/month/overflow controls, range inputs, Battle Plan filters, resource editors, forecast expansion, Max-tier controls, and the appearance selector while leaving desktop density unchanged. Range sliders retain an 8 px visual track inside a 44 px interaction height. Chromium measures representative rendered controls across Plan, More, Targets, Calendar, and Preferences, and the Planner stylesheet cache advances to v6. Shared `styles.css` is unchanged, so its v44 cache generation does not move. No D1 migration, route, Cron, secret, binding, Service Binding, or deployment-config change is required.

BL-052 is implemented by PR #105: production now exposes a sanitized read-only schema-compatibility signal covering the current required tables, columns, named indexes, battle-log triggers, and unified battle-log view. Missing components return 503 with actionable component identifiers only, and Production smoke consumes the signal so an omitted explicit D1 migration fails monitoring without mutating or auto-migrating production. Deterministic coverage protects compatible, incompatible, unavailable, and smoke-failure behavior. No D1 migration, CSS/cache, Cron, secret, binding, Service Binding, or deployment-config change is required.

BL-053 is implemented by PR #106 after the BL-052 production signal identified exactly one missing component: `idx_remote_raid_limit_dates`. The repository now carries idempotent migration `0008_remote_raid_limit_index.sql` to add only that index for older installations, with regression coverage proving existing Remote Raid limit rows are preserved and repeat execution is safe. Production still requires the explicit post-merge 0008 repair and a green Production smoke before BL-053 is operationally complete.

BL-054 is implemented by PR #107: the existing required `deterministic` PR check now compares each candidate branch's `REQUIRED_SCHEMA` with a credential-free production D1 component-hash snapshot before merge. Production publishes only SHA-256 hashes/count metadata through a read-only endpoint, CI maps any missing hashes back to candidate-owned component identifiers, transient failures receive bounded retries, and missing/unavailable evidence fails closed. Schema-changing PRs must therefore apply their explicitly named backward-compatible production migration before merge; the gate never runs migration SQL or requires Cloudflare/GitHub secrets. PR #108 is the production-only D1 compatibility follow-up: it excludes Cloudflare-managed `_cf_` catalog objects and tolerates an unrelated table that rejects column PRAGMA inspection while preserving fail-closed behavior for any candidate that actually requires an omitted component.

BL-055 is implemented by PR #109: Production smoke now includes only allow-listed actionable health identifiers in CI diagnostics. Schema failures report sanitized missing table/column/index/trigger/view component IDs; freshness failures report sanitized non-healthy `source_key` values grouped as stale/missing/degraded, and degraded-but-monitor-safe warnings use the same boundary. Raw health bodies, source URLs, raw errors, bearer credentials, SQL, schema fingerprints/component hashes, and malformed/log-injection strings are excluded, with deterministic malicious-fixture coverage protecting that contract.

BL-056 is implemented by PR #110: a repository-owned **Release health** GitHub Actions workflow now consolidates the current `main` SHA, exact-SHA production verification, latest same-SHA Planner regression and Production smoke state, data freshness, and schema compatibility into a single GitHub job summary. It refreshes after completed `main` regression/smoke workflows and on manual dispatch, uses only read-only Actions/contents permissions plus existing credential-free health endpoints, preserves BL-055 sanitization, and remains informational rather than a branch-protection/deployment gate. No D1 migration, application route, CSS/cache, Cloudflare binding, Cron, secret, Service Binding, or deployment-config change is required.

A fresh full product audit on 30 September 2026 reviewed the newest production `main`, release health, Production smoke, Planner regression, D1/schema safeguards, event/meta freshness, backup/recovery, mobile/desktop UX, accessibility, bearer-credential security, Pokémon/form handling, and repository governance. Production was assessed as public-ready with no release-blocking defect. Two concrete follow-ups were promoted into Active: BL-057 corrects Mega/Primal Hundo raid-catch semantics and adds missing Hundo correctness regressions; BL-058 makes Release health exact-SHA deployment verification independent of a bounded rolling Actions history window. The same audit identified stale PR #88 as housekeeping rather than product backlog scope.

BL-057 is implemented by PR #112: Mega and Primal selections remain searchable in the Hundo calculator, but Lv20/Lv25 cards now resolve and name the underlying same-dex base raid encounter form instead of using transformed stats. Other Mega/Primal benchmark levels and custom levels intentionally keep the selected transformed form and are labeled theoretical; if the encounter form cannot be resolved, raid CP is omitted rather than substituted. Deterministic coverage now locks known Hundo CP values, half-level behavior, regional-form separation, Mega/Primal encounter semantics, and the missing-encounter fail-safe, while Chromium verifies the real result labels and CP values.

BL-058 is implemented by PR #113: Release health keeps its bounded 50-run Actions window for the newest same-SHA Planner regression and Production smoke **current health**, but deployment verification now comes from a separate `production-smoke.yml` workflow query filtered to `branch=main`, `event=push`, and the exact current `head_sha`. The SHA remains production-verified when that bounded exact-SHA workflow history contains a completed successful push smoke, even after scheduled workflows have displaced that original run from the general recent-run window. Deterministic coverage reproduces a full 50-run rolling window with no push run and proves the historical exact-SHA deployment verification remains intact.

Repository housekeeping completed on 6 October 2026: superseded PR #88 (**Add BL-040 automated theme accessibility checks**) was reviewed against current `main`, confirmed to contain no unique product behavior worth merging, and closed with a supersession note. Current `main` retains the deterministic Light/Dark contrast gate, expanded Chromium contrast/theme-switch accessibility coverage, disabled/focus/live-region invariants, and the evolved semantic theme tokens. No numbered backlog item was created because this was repository hygiene only.

A fresh full product audit on 6 October 2026 reviewed the newest production `main`, exact-SHA Release health, Production smoke history, schema/data freshness, responsive desktop/mobile behavior, accessibility, backup/recovery, bearer-credential security, Hundo and raid-form correctness, Pokémon catalog resilience, repository governance, and recent production incidents. Production remained public-ready with no release-blocking defect. Two concrete reliability follow-ups were promoted into Active: BL-059 hardens Release health against transient GitHub metadata reads and separates unavailable evidence from genuinely missing/unverified state; BL-060 adds a server-side last-known-good Pokémon catalog path so first-time/new-device users retain Hundo and Battle Intel capability through temporary upstream catalog outages. Historical `event:go_pass` freshness failures were reviewed and intentionally not added to the backlog because the existing monitor detected, reported, and later recovered them exactly as designed.

BL-059 is implemented by PR #116: Release health now uses a bounded three-attempt retry with short capped exponential backoff for safe JSON GETs across GitHub metadata and the public freshness/schema endpoints. Network failures, HTTP 429/5xx responses, GitHub 403 rate-limit exhaustion, and successful-but-unusable JSON responses are retried; definitive client errors are not repeatedly retried. A valid Actions response with no matching exact-SHA workflow remains **missing**, while exhausted read evidence becomes **unavailable**. Exact-SHA deployment verification is now **verified**, **unverified**, or **unavailable**, with `production_verified` represented as `true`, `false`, or `null` accordingly. Deterministic coverage locks transient recovery, persistent GitHub failure, genuine missing state, rate-limit recovery, definitive client errors, deployment-evidence unavailability, and transient public-health recovery.

BL-060 is implemented by PR #117: the Worker now maintains one validated compact Pokémon/form catalog snapshot in D1, refreshed by successful scheduled Pokédex syncs and live catalog refreshes. A live upstream failure, malformed/empty catalog, or other unusable response falls back to that exact snapshot when available; if neither source is usable the endpoint returns a sanitized 503 instead of substituting another form. The Planner labels a server snapshot as stale/retryable and retains browser localStorage as an additional device-level fallback. Production smoke now verifies the public catalog is structurally usable and that a durable server snapshot is available. Existing production D1 must apply additive migration `0009_pokemon_catalog_snapshot.sql` **before PR #117 can merge**; the BL-054 candidate schema gate intentionally remains red until that table and its six required columns exist.


A fresh product audit on 6 October 2026 after BL-060 reviewed current production health, branch enforcement, recommendation inputs, Planner browser/runtime resilience, and production monitoring coverage. Production remained healthy and public-ready with no release-blocking defect. The user explicitly promoted four confirmed follow-ups into Active: **BL-061** makes the generic PvP preference league-complete instead of relying only on Master League input; **BL-062** makes optional Web Storage state failure-safe; **BL-063** adds explicit Planner load/refresh recovery and distinguishes successful mutations from failed follow-up refreshes; and **BL-064** closes the production-monitoring gap around successful Planner read-model assembly. The shiny/collection scoring idea remains intentionally untracked pending a sufficiently strict form-specific evidence model, and repository-description cleanup remains housekeeping rather than numbered product backlog scope.

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

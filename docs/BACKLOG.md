# Pokémon GO Planner — Backlog

Last reviewed: 24 September 2026

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

### BL-034 — Harden planner backup restore request handling

Enforce the restore upload boundary on the Worker, not only in the browser.

Required outcome:

- authenticate the destination management capability before parsing the restore payload wherever the existing request contract safely permits it;
- enforce the same maximum restore-body size server-side as the browser's current 25 MB file guard;
- return a clear `413 Payload Too Large` response for oversized restore requests;
- preserve the existing credential-free backup format, empty-planner restore rule, atomic D1 restore behavior, and post-restore Undo semantics;
- add deterministic coverage for unauthenticated, oversized, malformed, and valid restore requests.

This is a resource-abuse hardening item identified by the 24 September 2026 fresh product audit.

### BL-035 — Add semantic theming and System / Light / Dark mode

Introduce a maintainable theme architecture rather than layering ad-hoc dark overrides onto the current literal colors.

Required outcome:

- provide **System**, **Light**, and **Dark** appearance choices, with System as the default;
- keep appearance as a browser/device preference rather than planner-owned D1 data unless a later requirement changes that decision;
- introduce semantic color tokens for page/surface/text/border/input/status/overlay/shadow roles and migrate the major product surfaces away from hard-coded light-only values;
- apply theming consistently to the landing page, Planner, Data Sources, and Admin;
- initialize the selected/system theme early enough to avoid a light flash before dark rendering;
- set native `color-scheme` and update browser theme-color behavior appropriately;
- preserve Pokémon/source/status identity while ensuring readable light and dark variants;
- keep desktop/mobile behavior and existing accessibility/navigation invariants intact.

### BL-036 — Extend production smoke coverage to the Planner shell and assets

Expand BL-031 monitoring beyond the public landing shell so production can detect a broken Planner deployment without creating real planner state.

Required outcome:

- keep the workflow GET-only and free of real private credentials or state mutation;
- verify a synthetic `/manage/<token>` request serves the expected Planner shell;
- verify the versioned core Planner assets referenced by current `main`, including Planner JavaScript and Planner-specific CSS;
- include any future theme initializer or equivalent critical shell asset in the smoke contract;
- preserve bounded retries and deterministic local fixture coverage.

### BL-037 — Add lightweight WebKit / Safari smoke coverage

Add a small cross-browser gate for behavior most likely to differ from Chromium without duplicating the entire browser regression suite.

Required outcome:

- run a focused Playwright WebKit smoke suite in CI;
- cover the landing page, primary Planner shell, mobile navigation, Preferences, backup file controls, at least one modal/drawer, Calendar, and theme behavior after BL-035;
- check for horizontal overflow and broken fixed/sticky/safe-area behavior at representative phone and desktop sizes;
- keep the suite intentionally smaller than the Chromium regression job so CI remains stable and reasonably fast.

### BL-038 — Improve backup and recovery discoverability

Make BL-033 easier for ordinary users to discover before and after they lose a management link.

Required outcome:

- explain on the public landing/onboarding surface that users should keep their management link and periodically download a Planner Backup;
- provide clear guidance for the recovery flow: create a new planner, then restore the backup into that empty planner;
- update the mobile More/Preferences description so it reflects access, backup, and recovery—not only recommendation weights/timezone/budget;
- avoid implying that a planner can be recovered without either its management link or a previously saved backup.

### BL-039 — Unify product branding across public and Planner surfaces

Remove the current mismatch between the public **Pokémon GO Raid Planner / Personal Raid Strategy** branding and the dashboard's broader **Pokémon GO Battle Planner / Personal Battle Strategy** scope.

Required outcome:

- choose one canonical user-facing product name and terminology;
- apply it consistently to page titles, primary headings, landing copy, Planner shell, Data Sources/Admin references where appropriate, README, and production-smoke title assertions;
- ensure the wording accurately includes ordinary Raids plus Dynamax/Gigantamax and shared battle-planning features without suggesting the app is a full Pokémon storage manager.

### BL-040 — Add automated contrast and theme accessibility checks

Turn color accessibility into an explicit regression invariant, especially once BL-035 introduces multiple themes.

Required outcome:

- add deterministic or browser-based checks for representative foreground/background contrast pairs in Light and Dark modes;
- cover core text, secondary text, inputs, buttons, focus states, danger/warning/success surfaces, selected navigation, overlays/sheets, calendar/source indicators, and disabled states where practical;
- verify theme switching does not regress keyboard semantics, reduced-motion behavior, live regions, or existing focus management;
- avoid brittle whole-page screenshot diffs as the primary gate;
- coordinate implementation with BL-035 so the theme token system is testable rather than relying on hundreds of isolated literal colors.

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

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

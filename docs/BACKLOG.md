# Pokémon GO Battle Planner — Backlog

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

No confirmed active backlog items are currently recorded.

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

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

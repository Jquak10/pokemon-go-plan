# Pokémon GO Planner — Backlog

Last reviewed: 18 September 2026

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

### BL-008 — Explain zero Remote allocation directly on Raid and Max cards

The shared resource planner already records useful non-allocation reasons, but the Planner still has a Raid-specific zero-allocation details section and Max cards can show “0 Remote Max battles” without the reason close to the card.

Surface compact, system-aware reasons such as MP cost unknown, below threshold, not remotely accessible, target complete, or priority Skip. Replace Raid-only wording with shared Battle terminology while keeping secondary detail collapsible.

### BL-009 — Harden intermediate-width desktop responsiveness

The latest desktop fix removes Battle Resources text clipping, but the desktop two-column layout still activates at a relatively narrow width and other intentional ellipses/clamps remain throughout the UI.

Audit intermediate desktop widths using content/container-based breakpoints where useful. Keep dense panels stacked until adequate width exists and restrict truncation to secondary text whose full value remains available elsewhere.

### BL-010 — Harden bearer-token and private-surface security headers

Management links and calendar links are bearer credentials. Management API calls still pass the management token in some query strings, and private/static surfaces do not currently add a dedicated Referrer-Policy/CSP/frame-protection layer in Worker routing.

Add defense-in-depth headers such as a strict referrer policy and appropriate frame/content policies, move authenticated API requests toward headers while preserving legacy compatibility, and avoid introducing any logging or exposure of management/calendar/admin credentials.

### BL-011 — Incrementally modularize large Planner/Worker files

`public/manage.html`, `public/styles.css`, and `src/index.js` have grown into large integration files. They remain functional, but continued feature work increases regression and review cost.

Extract cohesive modules incrementally—Battle Plan/intel, Targets, Calendar, Hundo, resource UI, and Worker domain orchestration—without a big-bang framework rewrite. Preserve current routes, bindings, D1 behavior, and responsive UX during decomposition.

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

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

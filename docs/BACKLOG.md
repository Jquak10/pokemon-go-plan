# Pokémon GO Planner — Backlog

Last reviewed: 20 September 2026

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

### BL-013 — Make official schedule discovery durable

Still-upcoming official supplements should not disappear merely because their source article falls outside the newest-news discovery window. Retain/revisit official source URLs through the relevant event horizon while preserving replacement and suppression precedence.

### BL-014 — Track synchronization health per source

Persist last attempt, last success, last error, and item count for each event/official/meta source. Surface degraded relevant sources instead of representing the newest successful source timestamp as freshness for the whole layer.

### BL-015 — Add management and calendar credential rotation

Add explicit recovery controls for rotating the private management capability and regenerating/revoking the preferred signed calendar subscription URL. Preserve legacy URL compatibility while making leaked bearer credentials individually recoverable.

### BL-016 — Finish keyboard and modal accessibility

Centralize dialog keyboard behavior: focus containment, Escape handling, focus restoration, background isolation, visible keyboard focus, and reduced-motion handling. Add deterministic browser regressions for those interactions.

### BL-017 — Tighten Planner script CSP

Move the remaining large inline Planner application script and inline event handler into external same-origin code so `script-src 'unsafe-inline'` can be removed without reopening modularization based on file size alone.

### BL-018 — Normalize Planner API and transport failures

Make the Planner API client handle structured JSON errors, non-JSON 5xx responses, empty responses, and network failures with actionable user messages instead of assuming every response is valid JSON.

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

A fresh product audit on 21 September 2026 identified BL-012 through BL-018. BL-012 (timezone validation) is implemented by the current change and is therefore not retained as unshipped Active work; BL-013 through BL-018 remain recorded above for future prioritization.

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

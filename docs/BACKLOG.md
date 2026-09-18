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

### BL-001 — Reconcile fresh-database schema completeness

**Status:** Active maintenance debt  
**Area:** D1 schema / reproducible environments

Current `src/index.js` uses these operational tables:

- `event_suppression_rules`
- `remote_raid_daily_budget_overrides`

As of 18 September 2026, neither table is defined in `schema.sql` and neither is created by the checked-in migrations `0001`–`0003`.

This means the repository's fresh-database baseline is not yet sufficient to reconstruct every table the current Worker expects.

**Required resolution:**

- inspect the actual production D1 definitions for both tables before writing migration SQL;
- reconcile `schema.sql` with the verified production shape;
- add an appropriate migration only if existing installations need one;
- add regression/setup coverage so a fresh supported database contains all Worker-required tables;
- preserve existing production data and behavior.

Do **not** guess the table definitions or apply an unreviewed migration.

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

The remaining durable items identified from the available project conversation context and current repository audit are captured above:

- one verified active schema-completeness maintenance item;
- one explicitly non-planned Max-team tracking idea.

No other confirmed unimplemented commitment was identified during this audit. Future work should not infer requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

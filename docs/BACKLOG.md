# Pokémon GO Planner — Backlog

Last reviewed: 21 September 2026

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

### BL-021 — Do not expose internal exception details in 500 responses

**Priority:** High · security / failure handling

The Worker-wide `handleFetch()` catch logs an unexpected exception but also returns `String(error.message || error)` to the client as `detail`. Internal D1, upstream, or implementation error text should remain in server observability rather than being exposed by a generic public 500 response.

Done when:

- unexpected exceptions remain fully logged server-side;
- clients receive a stable generic error without raw internal exception text;
- deterministic coverage verifies the public 500 contract.

### BL-022 — Add abuse protection to public planner creation

**Priority:** High · operational security

`POST /api/create` is intentionally public and currently inserts a new planner for every valid request. The repository contains no application-level rate limit, challenge, quota, or other creation-abuse control. Before implementation, confirm whether Cloudflare already supplies an external compensating rule; do not duplicate a working control blindly.

Done when:

- the effective production path has a documented bounded-abuse control for planner creation;
- ordinary first-time creation remains low-friction;
- the design avoids retaining unnecessary personal/IP data;
- abuse responses are explicit and testable.

### BL-023 — Enforce strict script CSP on remaining credential-bearing pages

**Priority:** Medium · security hardening

The private Planner already runs with `script-src 'self'`, but the landing page and Admin page still contain inline application scripts and therefore use the default `'unsafe-inline'` script policy. The landing page displays newly issued bearer URLs and Admin handles the admin credential, so they should receive the same executable-script boundary where practical.

Done when:

- landing/Admin application JavaScript is external same-origin code;
- those HTML surfaces no longer require `script-src 'unsafe-inline'`;
- current no-store/referrer/frame protections remain intact;
- regression coverage prevents accidental inline-script reintroduction.

### BL-024 — Normalize landing/Admin API and transport failures

**Priority:** Medium · resilience

BL-018 centralized robust failure parsing for the private Planner, but the landing page and Admin page still call `response.json()` directly. Empty, HTML, malformed, or network failures can therefore surface parser/browser-specific errors rather than actionable UI messages.

Done when:

- create-planner and Admin requests handle structured JSON, non-JSON, empty, and network failures consistently;
- useful server-provided errors are preserved;
- raw HTML/parser/transport strings are not presented as the primary user message;
- deterministic or browser coverage exercises the failure modes.

### BL-025 — Surface single-target deletion failures

**Priority:** Medium · UX resilience

`removeTarget()` is the only normal Planner mutation found in the current audit that awaits `api()` without local failure handling. If deletion fails, the delegated click path can produce an unhandled rejected promise with no visible recovery message, even though the shared client now normalizes the error.

Done when:

- single-target delete shows an actionable failure state without losing the current Targets context;
- success behavior remains unchanged;
- regression coverage verifies a failed delete does not disappear silently.

### BL-026 — Complete keyboard semantics for Planner tabs

**Priority:** Medium · accessibility

The Planner navigation advertises `role="tablist"` / `role="tab"`, but it currently relies on ordinary button Tab/Enter behavior and does not implement the standard roving-tabindex and Arrow/Home/End interactions expected for an ARIA tab set. The mobile More control also lives inside the tablist even though it opens a sheet rather than a tab.

Done when:

- desktop tab semantics and keyboard behavior follow the ARIA tabs interaction model;
- only the active/roving tab participates in the intended tab stop pattern;
- ArrowLeft/ArrowRight and Home/End work predictably;
- More retains correct non-tab semantics on mobile;
- browser regressions cover keyboard navigation and focus.

### BL-027 — Enforce the production-main PR/check policy in GitHub

**Priority:** Medium · release safety

`main` is the production branch and repository policy requires feature branches, PR review flow, and passing deterministic/browser checks, but GitHub currently reports `main` as unprotected. The release policy is therefore convention rather than an enforced repository guardrail.

Done when:

- a GitHub branch protection/ruleset requires PR-based changes to `main`;
- deterministic and browser UI checks are required;
- the external live-contract job is not made a blocking PR gate because upstream availability is outside the branch's control;
- force-push/deletion protection is enabled where supported;
- the rule is documented in the developer workflow.

### BL-028 — Validate dependency install and Worker packaging in CI

**Priority:** Medium · release safety

The deterministic CI job currently runs JavaScript syntax checks and the test suite without first installing repository dependencies, and it does not perform a Wrangler packaging/configuration validation. The tests can therefore pass even if the lockfile/dependency install or Worker bundle/configuration has become undeployable.

Done when:

- CI installs dependencies reproducibly from the lockfile;
- CI performs a non-deploying Wrangler build/package/config validation appropriate to the current Worker setup;
- protected bindings/routes/Cron/deployment configuration remain unchanged unless intentionally modified;
- the validation is deterministic and suitable as a PR gate.

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

A second fresh audit after PR #63 verified the current `main` behavior, deterministic/browser/live-contract CI, public/Admin surfaces, security boundaries, accessibility wiring, and release controls. That audit identified BL-019 through BL-028. BL-019 is implemented by the parent change and removed from Active. BL-020 is implemented by the current change and removed from Active; BL-021 through BL-028 remain above. These entries are limited to demonstrated defects or concrete repository/operational gaps; no item was added merely because a large integration file exists or because a speculative feature might be useful.

The explicitly non-planned Max-team tracking idea remains preserved below Active work. Future work should not infer additional requirements from deleted chat history; it should use newest `main`, the durable docs, this backlog, and the user's current request.

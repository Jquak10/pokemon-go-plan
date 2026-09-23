# Pokémon GO Planner — Architecture

Last consolidated: 18 September 2026  
Architecture baseline: newest merged repository state; detailed change history is maintained in docs/DECISIONS.md

This document is the durable technical reference for the current Pokémon GO Planner. It exists so future work can start from the repository rather than from old chat history.

## How to use this document

Use this file for the current intended architecture. Use DECISIONS.md for the history and reasoning behind that architecture.

If documentation and executable behavior disagree, the newest code, schema, migrations, tests, and deployment configuration on main are the final source of truth. Every change receives a documentation-impact assessment. Update this document in the same PR whenever current behavior, invariants, data flow, persistence, battle/resource semantics, event precedence, security, operations, or UI architecture changes, including bug fixes that clarify an invariant future work must preserve.

The reference order for future work is:

1. Newest main branch code, schema, migrations, tests, and wrangler.jsonc.
2. This architecture document for current system intent and invariants.
3. docs/DECISIONS.md for historical reasoning and superseded choices.
4. docs/BACKLOG.md for confirmed unshipped work and verified technical debt.
5. README.md for user and development guidance.
6. Merged PRs for detailed implementation history.

## 1. Product purpose

Pokémon GO Planner is a private, personalized planning application for Pokémon GO. It combines current and upcoming availability, battle-specific meta intelligence, user goals, scarce resources, Remote participation limits, activity history, Hundo CP information, and a private calendar into one planner.

The product is not intended to maximize spend or fill every available Raid slot. It helps the user decide what is worth doing and when saving resources is better.

The Planner covers two first-class battle systems:

- Raids: ordinary, Mega, Primal, Shadow, and other Raid encounter forms.
- Max Battles: Dynamax and Gigantamax encounters at Power Spots.

Raids and Max Battles share some resources and planning surfaces, but they retain battle-system-specific mechanics, forms, costs, eligibility, rankings, and logging.

## 2. Core product principles

The following are architectural invariants.

### 2.1 Limits are ceilings, not targets

Official Remote participation limits, personal ceilings, and available passes are maximums. The recommendation engine may intentionally leave capacity unused.

### 2.2 Track goals and scarce resources, not a full Pokémon inventory

The Planner tracks user targets, Remote Pass usage, Max Particles, activity, and planning state. It does not attempt to become a complete owned-Pokémon roster or team manager.

### 2.3 Battle form and caught form are separate concepts

A Raid boss can use Mega, Primal, Shadow, or another battle form while the catch encounter can be a different form. Hundo CP must use the actual encounter form and encounter level, never the Raid boss's transformed battle stats.

For Max Battles, Dynamax is generally a battle capability layered on the underlying species/form. Gigantamax is a distinct battle capability/form presentation and must never be silently replaced with ordinary Dynamax or a base-form image when an exact asset is required.

### 2.4 Exact form identity beats convenience

Regional forms, Shadow forms, Armored forms, Crowned forms, Hero forms, Origin forms, Mega/Primal forms, costume forms, Dynamax, Gigantamax, and other battle-distinct variants must remain distinct where Pokémon GO treats them distinctly.

If an exact form sprite is unavailable, no sprite is preferable to the wrong sprite.

### 2.5 Current availability must come from evidence

Do not invent missing availability. Event and battle availability follows the precedence described in the Event Data section below.

### 2.6 Reversible accounting is atomic

Logging that changes target progress, Remote usage, or Max Particle state must be applied and undone as a coherent transaction. Partial Undo is not acceptable.

### 2.7 Timezone correctness is explicit

Planner timezones are IANA timezone identifiers such as `Asia/Singapore`. Creation and Preferences validate them in the browser for immediate feedback and independently in the Worker before persistence. The Worker canonicalizes valid identifiers through `Intl.DateTimeFormat`; invalid timezone input is rejected rather than stored.

The Planner API exposes whether an already-stored timezone is valid so a legacy malformed value can be surfaced for correction. Core date calculations retain a UTC fallback only as a defensive compatibility path for pre-validation legacy rows, and that fallback is logged rather than treated as normal behavior. Unrelated settings updates do not become blocked solely because a historical row contains an invalid timezone.

## 3. Production topology

Repository: Jquak10/pokemon-go-plan  
Production branch: main  
Production URL: https://pogo-plan.jquak-10.workers.dev  
Runtime: Cloudflare Workers  
Database: Cloudflare D1

The Worker entry point is src/index.js.

Static assets are served from public through the ASSETS binding. The Worker runs first for API, calendar, management, and admin routes.

Current wrangler.jsonc defines:

- Worker name: pokemon-go-personal-calendar.
- workers_dev disabled.
- main module: src/index.js.
- static assets directory: public.
- asset binding: ASSETS.
- D1 binding: DB.
- Rate Limiting bindings: `PLANNER_CREATE_CLIENT_RATE_LIMITER` and `PLANNER_CREATE_ROUTE_RATE_LIMITER`.
- observability enabled.
- recurring Cron expressions:
  - 23 */6 * * *
  - 33 */6 * * *
  - 43 */6 * * *

Those Cron jobs support recurring synchronization/backfill work. Do not change their schedules casually; preserve the existing separation of sync responsibilities unless a task explicitly requires changing them.

## 4. Access and security model

The Planner intentionally uses capability links instead of a conventional email/password account system.

Each planner has private credentials represented by non-guessable links/tokens:

- A management link that can read and modify that planner.
- A separate private read-only calendar subscription URL.

Calendar URLs are bearer credentials. Management URLs are also sensitive. They must not be logged, printed into tests, committed to the repository, or pasted into support prompts.

The management capability remains in the private `/manage/<token>` URL so existing saved links keep working, but the current Planner UI does not repeat that token in API query strings or JSON bodies. Same-origin management API requests send it as an `Authorization: Bearer` header. The Worker accepts that header first while retaining the historical query/body token forms for older clients and bookmarks. Admin browser requests similarly use `X-Admin-Key`, with legacy query/body key forms accepted server-side for compatibility.

Management-link rotation replaces only `users.manage_hash`. The authenticated Planner immediately swaps its in-memory API credential and uses `history.replaceState` to replace the capability URL without navigating through the now-invalid old link. Calendar credentials are unchanged.

The preferred signed calendar link is generation-scoped per planner. Generation 0 deliberately uses the exact pre-BL-015 HMAC payload and URL shape, so existing signed subscriptions remain valid without migration or user action. Migration 0007 adds `feed_link_credentials`; once present, regenerate/revoke advances only that planner's signed generation. A calendar request must match both the currently enabled generation and its HMAC signature. Revocation disables the current generation; regeneration advances again and re-enables it. The historical random-token `/calendar/<token>.ics` credential remains independent and is invalidated only by the existing legacy-feed revoke action.

Private/browser surfaces receive defense-in-depth response headers in Worker routing:

- `Referrer-Policy: no-referrer` prevents a capability URL from being disclosed as a navigation referrer.
- HTML receives a Content Security Policy that restricts default/connect/form destinations to the app, blocks objects and framing, and allows HTTPS/data images required by Pokémon sprites.
- `X-Frame-Options: DENY`, a restrictive Permissions Policy, `X-Content-Type-Options: nosniff`, and same-origin opener/resource policies protect HTML surfaces.
- Management and Admin HTML are `private, no-store`; authenticated JSON is also no-store by default.
- Calendar feeds keep their private ETag/revalidation behavior for calendar-client compatibility while also receiving no-referrer/nosniff protection.
- Unexpected Worker exceptions are logged with the original error server-side, but the public 500 JSON contract exposes only a stable generic error message and never raw internal exception text.

The HTML CSP is route-aware. The private Planner management route, public creation page (`/` and `/index.html`), and Admin page all use `script-src 'self'` with no `'unsafe-inline'` script allowance. Their executable application logic lives in same-origin external files, and those HTML shells must not contain executable inline `<script>` blocks or inline `on*=...` handlers. The landing app lives in `public/landing-app.js`, Admin logic lives in `public/admin-app.js`, and Planner orchestration remains in `public/planner-app.js`. `style-src 'unsafe-inline'` remains unchanged because this hardening is intentionally limited to executable script. Other HTML surfaces retain the default compatibility policy unless they are explicitly migrated. Chromium regression fixtures serve the landing, Admin, and Planner surfaces under the strict script policy so accidental inline-script dependencies fail browser CI.

Public planner creation is intentionally unauthenticated but is bounded before any D1 insert. The Worker uses Cloudflare Rate Limiting bindings with two one-minute controls: three creation attempts per hashed `CF-Connecting-IP` key and ten attempts for the creation route per Cloudflare location. The raw IP is never written to D1 or application logs. A client already over its own limit is rejected before consuming the route-wide budget. Rate limiting returns JSON 429 with `Retry-After: 60`; missing or failing limiter bindings fail creation closed with JSON 503 rather than inserting an unprotected planner. The limiter is a coarse abuse brake, not exact billing/accounting, because Cloudflare rate-limit counters are per location and eventually consistent.

Secrets such as ADMIN_KEY, FEED_LINK_KEY, GitHub credentials, Cloudflare credentials, management tokens, and private ICS URLs must never be requested or committed.

Legacy management API credential forms and legacy calendar subscription URLs must remain compatible when internals evolve.

## 5. Front-end structure

The main public files are:

- public/index.html — landing/create-planner experience.
- public/landing-app.js — landing/create-planner behavior, externalized so the credential-bearing creation surface can run under `script-src 'self'`.
- public/json-api-client.js — shared landing/Admin JSON response and transport normalization. It preserves structured server errors, converts empty/non-JSON HTTP failures into status-aware messages, treats malformed successful responses as recoverable API failures, and normalizes fetch/connection errors without surfacing parser/browser text.
- public/manage.html — primary authenticated Planner markup shell and same-origin script/style references.
- public/planner-app.js — Planner DOM/state/API orchestration that previously lived in the final inline `manage.html` application script. It remains one integration surface by design; BL-017 externalizes it for CSP correctness rather than reopening modularization based on file size.
- public/planner-client.js — shared Planner capability-token parsing, authenticated API request preparation, response parsing/failure normalization, HTML escaping, and numeric formatting. All Planner feature calls use this boundary rather than calling `response.json()` directly.
- public/planner-overlay.js — centralized modal/sheet/drawer keyboard containment, Escape dispatch, opener focus restoration, and background inert/aria-hidden isolation.
- public/planner-target-logic.js — pure Target progress, availability, non-status/status filtering, sorting, counts, and grouping/view-model logic. It accepts BattleTargets and normalization/formatting helpers as dependencies and contains no DOM or API mutation code.
- public/planner-calendar-logic.js — pure UTC date/month helpers, day-event range matching, source-class normalization, and six-week Monday-first month-grid projection. Calendar DOM rendering, fetch/cache state, and selected date/month state remain in planner-app.js.
- public/planner-hundo-logic.js — pure Hundo CP multiplier/formula logic, standard benchmark generation, and search ranking. Pokémon catalog loading/cache, recent selections, DOM rendering, and input events remain in planner-app.js.
- public/planner-battle-plan-logic.js — pure Battle Plan/resource view-model logic: recommendation system counts/filtering, primary/additional split, legacy/shared allocation lookup maps, zero-allocation compatibility merging/reason labels, score tone, and Max tier/cost display metadata. Recommendation-card DOM and actions remain in planner-app.js.
- public/planner-battle-intel.js — pure Pokémon GO type-effectiveness, compounded weakness/resistance grouping, type symbols, and battle/encounter Intel aggregation. Exact catalog/form resolution and Intel DOM rendering remain in planner-app.js so Mega/Primal/Max battle-form versus encounter-form rules stay explicit.
- public/admin.html — administration/synchronization controls.
- public/admin-app.js — Admin credential/API orchestration, externalized so the Admin surface can run under `script-src 'self'`. Admin requests keep their `X-Admin-Key`/no-referrer credential boundary while delegating response/transport normalization to `json-api-client.js`.
- public/sources.html — data-source explanation.
- public/styles.css — shared base styling used by the public, admin, sources, and Planner surfaces.
- public/planner.css — Planner-only responsive shell, feature styling, and regression-hardening overrides. It is loaded after styles.css only by manage.html, preserving the original cascade order while keeping unrelated pages out of Planner-specific CSS.
- public/battle-targets.js — shared client-side target identity helpers.

The application intentionally uses a relatively compact static-client architecture rather than a framework-heavy SPA. The completed BL-011 modularization established explicit boundaries around reusable Planner logic. BL-017 moved the remaining integration script out of `manage.html` into `planner-app.js` solely so the Planner can run under a strict external-script CSP; this is not a new file-size-driven modularization requirement. The Planner client module owns both the PR #47 management-auth transport contract and BL-018 response/failure normalization, so feature code calls its `api` helper rather than reimplementing token/query/body handling or assuming every response is valid JSON. Structured JSON `error`/`message` fields are preserved on failed HTTP responses; non-JSON or empty failures use status-aware recovery messages; empty/non-JSON successful responses are treated as malformed API responses; and fetch/connection failures become a stable connectivity message. Normalized `PlannerApiError` instances also expose `kind`, HTTP `status` when available, and a `retryable` flag while existing feature UI continues to display `error.message`. The landing and Admin surfaces follow the same failure principles through `json-api-client.js` rather than calling `response.json()` directly: useful structured JSON errors remain visible, HTML/empty/malformed responses become stable actionable messages, and network failures never expose raw browser strings such as `Failed to fetch`. Their UI layers continue to display only the normalized `error.message`. Target list business logic is likewise kept in the pure Planner Target Logic module; `planner-app.js` owns Target DOM rendering, selection state, modal interactions, and API mutations. Planner-specific CSS follows the same boundary: shared base rules stay in `styles.css`, while Planner-only responsive/feature overrides live in `planner.css` and load after the base stylesheet.

### 5.1 Mobile information architecture

Mobile is treated as a dedicated experience, not a squeezed desktop layout.

The fixed bottom navigation is:

- Plan
- Targets
- Hundo CP
- Calendar
- More

Preferences live under More rather than occupying a permanent bottom-nav slot.

Mobile invariants:

- Touch targets are at least 44 px where practical.
- Safe-area insets are respected.
- Sheets/drawers must not be hidden behind the bottom nav.
- Background page scrolling is frozen while a modal/drawer is open.
- Foreground sheet content may scroll.
- No horizontal page scrolling.
- Secondary filters are hidden until explicitly requested.
- Opening the mobile More sheet does not change the current Planner tab; navigation changes only after the user chooses a More action.
- Target advanced filters open in a bottom drawer.
- Add Target and destructive actions must remain inside the viewport.

### 5.2 Overlay and keyboard accessibility

Foreground Planner overlays use one shared accessibility controller instead of independent Escape/focus implementations.

Current invariants:

- the active modal, sheet, drawer, or command palette contains Tab and Shift+Tab focus;
- Escape is dispatched only to the top active overlay's close callback;
- closing restores focus to the control that opened the overlay when that control still exists;
- background body siblings are both `inert` and `aria-hidden` while an overlay is active, then restored to their previous state;
- Ctrl/Cmd+K cannot stack the command palette on top of another active overlay;
- hidden static overlays are inert while closed;
- the mobile Targets filter drawer gains modal dialog semantics only while it is mounted/open as a mobile sheet and is removed from the keyboard flow while closed;
- overlay-specific page scroll locks remain responsible for preventing background scrolling while foreground content can scroll;
- Planner keyboard focus uses a visible `:focus-visible` ring;
- Planner section tabs use the ARIA tabs interaction model: exactly one visible tab participates in the roving tab stop, ArrowLeft/ArrowRight move and activate with wraparound, and Home/End jump to the first/last visible tab without forcing content scroll;
- each `role="tab"` has a stable ID/`aria-controls` relationship to its `role="tabpanel"`/`aria-labelledby` peer;
- the mobile More disclosure is not part of the tablist and retains ordinary button semantics while occupying the fifth visual bottom-nav slot;
- `prefers-reduced-motion: reduce` collapses Planner animation/transition durations and disables smooth tab scrolling.

`planner-app.js` remains responsible for overlay-specific open/close business state and scroll-lock mechanics; `planner-overlay.js` owns the cross-overlay keyboard/focus/isolation contract.

### 5.3 Desktop information architecture

Desktop uses the available width to reduce vertical scrolling, but dense split panes are enabled only when enough horizontal space actually exists.

Width behavior:

- Intermediate desktop/tablet widths from 761–1179 px keep the Today briefing, Battle Resources, Calendar details, and other dense panels stacked rather than forcing narrow side-by-side columns.
- The seven-day forecast uses a four-column intermediate layout instead of squeezing all seven days into one row.
- Wide desktop behavior begins at 1180 px: fixed left navigation, contextual Quick Status rail, compact Target list mode, split Hundo search/results, and sticky Calendar details can use the larger canvas.
- Expanded forecast Pokémon names and recent battle Pokémon names wrap instead of being clipped. Ellipsis is reserved for compact preview text where the full value is available in a corresponding detail surface.
- Density-aware compact presentation remains available on wide desktop.

Sticky elements must begin at their natural section position and must not cover content that precedes them. No desktop or intermediate layout may introduce horizontal page scrolling.

### 5.4 Production branch enforcement

GitHub enforces the production `main` branch with the repository ruleset **Production main**. The ruleset targets the default branch only and has no bypass actors.

Current invariants:

- changes to `main` require a pull request;
- required PR checks are exactly `deterministic` and `browser-ui`;
- `live-contract` remains non-blocking because it depends on external Pokémon/event availability and intentionally does not run on pull requests;
- strict "branch must be up to date" mode is disabled, so PRs are not forced into redundant rebuilds solely because `main` moved;
- deletion of `main` is blocked;
- non-fast-forward updates/force pushes to `main` are blocked;
- there are no routine owner/admin bypass actors.

The public branch endpoint must report `protected: true`. The ruleset is repository-owned operational configuration, while `AGENTS.md` records the matching development workflow.

### 5.5 Required PR packaging validation

The required `deterministic` GitHub Actions job is also the release-packaging gate. It uses Node 22, restores npm's lockfile-aware cache, runs `npm ci` against `package-lock.json`, then executes JavaScript syntax checks, the deterministic test suite, and `npm run check:worker`.

`npm run check:worker` runs `wrangler deploy --dry-run --outdir .wrangler/ci-dry-run`. This invokes the same Wrangler bundling/configuration path used for deployment but does not upload or deploy the Worker. The output directory is already ignored by Git. This catches broken dependency/lockfile state and Worker packaging/config errors before a PR can merge without changing D1 bindings, routes, Cron triggers, secrets, or other production configuration.

The external `live-contract` job remains separate and non-blocking on pull requests.

### 5.6 CSS cache discipline

Whenever public/styles.css changes, every page that references it must have its CSS cache/version reference bumped. This prevents stale production styling after deployment.

The current shared CSS cache generation is v42 after the BL-011G Planner stylesheet split. Future `styles.css` changes must continue the version bump. Planner-only overrides are loaded separately from `planner.css`; BL-026 advances the Planner-only stylesheet reference to v3 for the Mobile More fifth-slot positioning needed after moving that control outside the ARIA tablist, without changing shared `styles.css`.

JavaScript assets use explicit query-version bumps when their browser contract changes. BL-018 advances the `planner-client.js` reference from v2 to v3 so cached clients cannot retain the old unconditional-`response.json()` behavior after deployment. BL-026 advances `planner-app.js` from v3 to v4 for the roving-tabindex and keyboard-navigation contract.

## 6. Server modules

src/index.js remains the integration/orchestration layer. More specialized logic has been split into domain modules.

Important modules:

- src/battle-opportunities.js — battle-system classification, Raid/Max source families, battle variants, encounter identity, Max rotation derivation helpers, presentation metadata, and remote-capability logic.
- src/resource-planning.js — shared Remote Pass planning, Max Particle rules/cost inference, battle resource allocation, and cross-system resource calculations.
- src/battle-logging.js — unified Raid/Max log validation and API-facing logging rules.
- src/battle-targets.js — shared server-side target identity semantics.
- src/raid-rankings.js — type-specific PvE Raid attacker analysis and method-versioned ranking profiles.
- src/max-rankings.js — Max-specific attacker analysis with Max-appropriate weighting and eligibility.
- src/remote-raid-rules.js — exact temporary Remote-limit time-window parsing and timezone projection.
- src/http-security.js — shared JSON/error responses, management/admin credential extraction with legacy compatibility, and static/private response hardening (route-aware CSP, frame protection, referrer policy, and no-store behavior). The default HTML policy preserves inline-script compatibility for legacy public/Admin surfaces, while the Planner route explicitly disables that allowance. `src/index.js` imports these helpers and re-exports the established security helper API for compatibility.
- src/calendar-ics.js — pure RFC 5545-oriented parsing/date helpers: folded-line normalization, property extraction, escaping/unescaping, compact date parsing, all-day exclusive-DTEND conversion, and VEVENT normalization. Fetching, persistence, suppression, personalization, and feed routing remain in `src/index.js`.

Keep pure, testable domain logic in these modules where practical. `src/index.js` is intentionally the integration/orchestration layer for data sources, persistence, APIs, synchronization, and rendering payloads; further splitting should be driven by a concrete cohesive domain need rather than file length alone.

## 7. Data model

schema.sql is the fresh-database baseline. Existing databases are evolved by additive migrations.

The baseline includes every operational table used by the current Worker. On 18 September 2026, production D1 was inspected directly for `event_suppression_rules` and `remote_raid_daily_budget_overrides`, including their explicit date indexes, and those verified definitions were reconciled into `schema.sql`. `migrations/0004_schema_baseline_operational_tables.sql` is the idempotent repair path for existing installations that are missing either table or index. The verified production database already contained all four objects and therefore did not require that migration for BL-001.

Core tables in the current schema include:

### users

Stores planner identity and user preferences, including timezone, included calendar sources, recommendation weights, Remote planning settings, and capability-token hashes.

The default timezone is Asia/Singapore, but all user-facing date logic must honor the saved IANA timezone.

### targets

Stores personal goals. Key concepts include:

- Pokémon/form identity.
- Goal type.
- Optional battle_kind: raid, dynamax, or gigantamax.
- Desired value.
- Current value.
- Expected progress per battle.
- Priority.
- Completion state.
- Notes.

The battle_kind column was added by migration 0003_target_battle_kind.sql. Existing target rows keep a stable opaque ID when the user corrects Pokémon/form, battle kind, or target type. That preserves historical battle-log/Undo references. The edit is rejected if the resulting Pokémon/battle/target-type identity would duplicate another target.

### max_battle_cost_overrides

Stores a private user fallback for a specific Max Battle opportunity when automatic tier/cost evidence is unavailable. The opportunity key is derived from canonical Pokémon/form, Dynamax/Gigantamax variant, and the event start/end date range. Stored fields include the selected tier, the standard mapped MP cost, and update time. Automatic verified evidence takes precedence over this fallback.

Migration 0005_max_battle_cost_overrides.sql adds this table and its user/date index for existing databases.

### events

Stores normalized calendar/event records from upstream feeds and official supplements.

Important fields include:

- source_type.
- source_uid.
- summary/description.
- raw DTSTART/DTEND properties.
- normalized start/end dates.
- source URL.
- content hash.
- sequence.
- active/stale status.

### feed_link_credentials

Stores per-planner state for the preferred signed calendar bearer credential:

- current signed generation;
- enabled/revoked state;
- update time.

A missing row means generation 0 and enabled, preserving all signed URLs issued before BL-015. This table never stores the plaintext management token, legacy feed token, signed URL, or HMAC secret.

### pokemon_meta and meta_sources

pokemon_meta stores shared Pokémon-level planning/meta values. meta_sources stores source-specific evidence and generated profiles, including Raid and Max ranking profiles.

Generated ranking profiles are method-versioned. A stale method version must not be displayed as though it were current.

### sync_source_health

Stores synchronization health separately from the content tables so a successful source cannot hide a failed sibling source behind a newer aggregate timestamp.

Each logical source row records:

- source key/group and display label;
- optional source URL;
- last attempt time;
- last successful attempt time;
- last error;
- item count from the last successful attempt;
- update time.

Event feeds are recorded independently, including derived weekly Max rotation and the current Max Battle tier reference. Official Pokémon GO schedule detection has its own health record. Meta health records Pokémon GO API Pokédex, PvPoke Master League, and the automatic assessment pipeline separately.

Failed attempts update the attempt/error fields but preserve the previous successful timestamp and successful item count. Health recording is diagnostic and must never cause the underlying event/official/meta synchronization itself to fail.

### remote_raid_usage

Stores the ordinary Remote Raid portion of daily shared Remote participation usage.

### remote_raid_limit_overrides

Stores temporary official Remote-limit overrides, including date range, numeric or unlimited state, source information, saved source excerpt, and automatic-detection metadata.

Exact time windows are derived from the saved source excerpt when trustworthy clock and timezone information exists.

### battle_resource_state

Stores persistent Max Particle state, especially MP currently held.

### battle_resource_daily

Stores per-user, per-local-date Max resource/accounting values, including Max Particles collected and the Remote Max portion of Remote Pass/participation usage.

### raid_log

Legacy Raid log table retained for backward compatibility and historical Undo.

### battle_log

Current unified battle log for Raids and Max Battles.

It stores battle system, battle variant, local/remote participation, attempts/battles, wins, MP cost, MP spent, Remote passes consumed, target progress, local date, and reversible state.

### unified_battle_log

View that exposes new battle_log records together with legacy raid_log history without replaying or duplicating old logs.

## 8. Migrations and schema evolution

Current explicit migrations are:

- migrations/0001_battle_resources.sql — Max Particle and battle resource state.
- migrations/0002_battle_logging.sql — unified battle_log, atomic triggers, unified history.
- migrations/0003_target_battle_kind.sql — battle-aware Targets.
- migrations/0004_schema_baseline_operational_tables.sql — idempotent operational-table/index repair.
- migrations/0005_max_battle_cost_overrides.sql — private per-opportunity Max tier/cost fallback.
- migrations/0006_sync_source_health.sql — additive per-source synchronization health and group index.
- migrations/0007_feed_link_credentials.sql — additive per-planner signed calendar generation/revocation state.

Production migrations are deliberate manual steps. Do not initialize production by applying the entire schema.sql over an existing D1 database.

Future schema changes must:

- preserve existing IDs and history where possible;
- remain backward compatible during Worker/migration rollout where practical;
- avoid destructive rebuilds unless unavoidable;
- document whether migration is repeatable;
- include tests for migration and historical compatibility.

## 9. Event data and source precedence

Event accuracy is one of the Planner's most important responsibilities.

The source precedence is:

1. Explicit official Pokémon GO schedule.
2. Official replacement/suppression notice.
3. Normalized GO Calendar data.
4. Never invent missing availability.

Official evidence can supplement or suppress lower-precedence calendar data.

Suppression must affect:

- Calendar display.
- Private ICS output.
- Current availability.
- Battle recommendations.
- Remote allocation/planning.

Suppression does not delete underlying Pokémon meta or ranking data.

### 9.1 GO Calendar ingestion

GO Calendar feeds provide the normalized baseline for events, Raids, Max Battles, Max Mondays, Raid Hours, Spotlight Hours, and other event categories.

For currently active Max bosses, the event sync may additionally read pokemon-go-api's structured current Max Battle list to obtain a tier when the event itself lacks one. That feed is lower precedence than explicit official Pokémon GO evidence and is applied only to current event rows whose matched bosses all resolve to the same tier; it must not overwrite official cost/tier evidence or fabricate future availability.


The Planner stores normalized events in D1 and retains enough raw DTSTART/DTEND information to correctly interpret iCalendar semantics.

### 9.2 iCalendar end-date semantics

RFC 5545 all-day DTEND is exclusive. The Planner must convert all-day event end dates correctly when determining active availability.

A past event must be defensively excluded from current recommendations even if an older stored row has not yet disappeared from D1.

### 9.3 Official supplements

When official Pokémon GO pages provide more precise or replacement scheduling than the baseline calendar, the Worker can create official supplement events.

Official supplement rows take precedence in ordering and are identifiable by official source metadata/source_uid conventions.

Official schedule discovery is durable across the event horizon. The newest Pokémon GO news index remains a bounded discovery input, but still-future official supplement rows—active or previously staled—contribute their stored official `source_url` back into later syncs. This lets a row accidentally staled by the older newest-news-only behavior recover automatically when its official page is revisited. Those retained URLs are normalized to approved Pokémon GO hosts, deduplicated, bounded independently from the newest-news discovery budget, and revisited until their stored event horizon ends.

Replacement is source-scoped and last-known-good. A sync may stale prior official supplement rows only for a source page that completed its fetch and parsing pass successfully in that same sync. If a retained page temporarily fails to fetch or its processing throws, its still-future supplement rows remain active. If a successfully refreshed page no longer yields the previous schedule, those rows can be staled normally so official replacements/removals still take effect. This durability rule does not override the source-precedence or suppression model.

### 9.4 Weekly Max rotation

GO Calendar's max_battles feed contains special Max events such as Max Battle Days, while ordinary weekly Power Spot availability can be represented indirectly through Max Monday data and may disappear from the newest upstream feed after Monday passes.

The Planner therefore has an internal derived source type:

- max_rotation

max_rotation is not a separate user-selectable raw calendar feed.

It derives ordinary Monday-to-Sunday Dynamax availability from Max Monday schedule evidence. Original max_mondays entries remain intact as timed Monday events. Original max_battles special events remain intact.

The derivation must never turn explicit Gigantamax/G-Max schedule text into a generic week-long Dynamax rotation. Special events such as Gigantamax Max Battle Days stay isolated.

Recent stale Max Monday evidence may be retained only as needed to avoid losing the currently active derived week when the upstream rolling feed drops the Monday entry.

## 10. Battle-domain model

The Planner models battle identity separately from Pokémon identity.

### 10.1 Raid battle system

battle_system = raid

Raid presentation can include ordinary, Mega, Primal, Shadow, and other Raid forms. The caught encounter may not use the Raid boss's transformed battle form.

Raid recommendations can show:

- Personalized priority score.
- Remote allocation.
- Weaknesses/resistances.
- Hundo encounter CP where applicable.
- PvE Raid attacker rankings.
- Optimal moves.
- Target/progress context.
- Source/availability context.

### 10.2 Max battle system

battle_system = max

battle_variant is:

- dynamax
- gigantamax

For ordinary Dynamax, the underlying exact species/form remains the encounter identity. Dynamax is a capability/presentation state. User-facing battle identity is nevertheless canonicalized as `Dynamax <species/form>` so recommendations, forecasts, targets, logging, and resource planning all use one stable label. Sprite resolution follows the same model: an ordinary Dynamax identity may reuse the sprite of its exact underlying species/form (for example, `Dynamax Moltres` → `Moltres`), but regional/form identity must be preserved (`Dynamax Alolan Raichu` may use `Alolan Raichu`, never ordinary Raichu).

When a single source event lists several Max Pokémon but writes the capability only once (for example, “Dynamax Articuno, Zapdos, and Moltres”), the event-level Max variant applies to every matched Pokémon. The parser must not infer that only the first listed species is Dynamax. Canonicalization occurs before recommendation/resource output so downstream UI surfaces cannot diverge.

For Gigantamax, the capability/form must be explicit. Exact Gigantamax assets are required for a Gigantamax sprite. If none exists, show no sprite instead of an ordinary form. The ordinary-Dynamax sprite fallback must never be applied to Gigantamax.

Shared battle intel such as typing, weaknesses, and resistances resolves a Max Battle through its underlying exact species/form when the catalog has no separate Max-form record. Pokémon catalog loading has explicit idle/loading/ready/stale/error state. A failed live catalog request must rerender dependent UI into an explicit retryable state rather than leave cards loading indefinitely. The client may use a validated last-known-good public catalog from local storage as a stale fallback; stale use is labeled, remains retryable, and never substitutes a different Pokémon/form merely to produce intel. After catalog resolution, a recommendation card must either render resolved battle intel or show an explicit unavailable state.

Max cards must not display ordinary Raid Hundo assumptions or ordinary Raid attacker rankings as though those were Max-specific metrics.

## 11. Battle Plan

The primary planning surface is Battle Plan on desktop and Plan on mobile.

The battle-system filter is:

- All
- Raids
- Max Battles

Max Battles do not receive a separate permanent mobile navigation tab.

The Plan combines:

- Today's official Remote limit.
- Shared Remote usage.
- Remote Pass planning.
- Max Particle state/planning.
- Current Raid and Max opportunities.
- Personal targets.
- Future opportunities.
- Recent battle activity.
- Recommendation explanations.

A current recommendation with zero Remote allocation must explain the decision on the card itself, using system-aware Raid/Max wording. The shared resource plan emits a stable `reason_code` plus the full human-readable reason for blocked or otherwise zero-allocated opportunities; presentation maps common codes to compact card copy without discarding the full explanation. Examples include unknown Max Particle cost, paid-battle threshold, Remote accessibility, target complete, priority Skip, exhausted capacity, future reserve, insufficient/reserved MP, and lower marginal value.

The detailed zero-allocation list is secondary and collapsible. It uses shared Battle terminology, includes both Raids and Max Battles, and follows the active All/Raids/Max Battles filter rather than disappearing for Max Battles.

## 12. Targets

Targets are shared across the product but battle-aware.

### 12.1 Identity

Target matching uses exact Pokémon/form plus battle identity.

A Raid target must not automatically influence or receive progress from a Max Battle.

Dynamax and Gigantamax targets are distinct where their battle capability matters.

Legacy targets remain compatible. Existing IDs, names, progress, and historical log references must not be rewritten merely to normalize newer battle semantics.

### 12.2 Status and filters

Targets support:

- Active.
- Completed.
- All.
- Search.
- Goal type.
- Priority.
- Raid/battle availability.
- Sorting.
- Needs Attention.
- Tracking.
- Completed grouping.

Active/Completed/All counts must reflect the current search plus every non-status filter.

If the current filters match two active and one completed target, counts must read Active 2, Completed 1, All 3.

The global Targets navigation badge shows Active count only.

### 12.3 Deletion resilience

Single-target deletion reports progress and failures in an in-context `aria-live` Target action status. A failed delete must leave the target, active Targets tab, search, and filters unchanged; normalized API failures are shown without reloading or silently removing the card. A successful delete keeps the historical behavior of reloading Planner state and returning to Targets, then confirms the deleted Pokémon in the same status region.

Multi-select deletion supports Select, Select all shown, Delete selected, and Cancel. Selection must respect the current filtered set.

### 12.4 Completion semantics

Reaching a numeric target value does not automatically mark a target complete. Completion remains an explicit user state.

Skip/completed targets are excluded from paid allocation as appropriate.

## 13. Recommendation architecture

Recommendations combine current availability, shared meta, system-specific attacker intelligence, personal targets, progress, priority, and resource constraints.

### 13.1 Raid value

Raid recommendations use personalized value derived from available PvE/PvP/rarity/Mega inputs and target context.

Raid allocations use diminishing marginal value. A boss can stop receiving additional Remote allocation even when official capacity remains.

### 13.2 Max value

Max Battles must not inherit ordinary Raid DPS rankings as a proxy for Max performance.

Before dedicated Max rankings existed, the Planner used a provisional Max opportunity value. Part 7 replaced that with Max-specific attacker intelligence.

Current Max analysis considers Max-appropriate attributes, including:

- Explicit Max eligibility evidence.
- Underlying form identity.
- Fast Attack type for Dynamax Max Attack typing.
- Normal-phase Fast/Charged pressure.
- Max-phase pressure.
- Bulk/survivability weighted more heavily than ordinary Raid DPS.

Do not invent unknown Gigantamax move type/power data.

### 13.3 Cross-system allocation

When Remote participation is possible, Raids and Max Battles compete for the same scarce Remote Pass/daily Remote participation capacity.

The allocator compares the next worthwhile use across both systems while preserving system-specific value methods.

Future opportunity matters. The planner may save capacity for a stronger upcoming day rather than fill today's ceiling.

### 13.4 Canonical Battle Plan priority

Every battle opportunity has one user-facing priority score and label after battle identity is known.

The underlying general/personal recommendation value is preserved as `recommendation_score`. The public `score` and explicit `planning_score` represent the canonical Battle Plan priority used for ordering and presentation.

- Raid: canonical planning priority equals the personalized Raid recommendation value.
- Max: canonical planning priority is calculated by the shared resource-planning method. When a current Max ranking profile exists, it combines personalized value, rarity/availability, Max capability, and Max attacker utility. Otherwise it uses the documented provisional Max opportunity method without treating ordinary Raid attacker rankings as Max performance.
- `planning_rationale`, `score_basis`, method/version metadata, and planning components travel with the recommendation so the UI and allocator can explain the same decision.
- Cards, Today, desktop Quick Status, co-leader selection, recommendation sorting, current allocation, and the existing future recommendation summaries use the canonical planning score rather than a separate generic Max score.
- The allocator recalculates from `recommendation_score` through the same canonical method. It must not recursively rescore an already-canonical public `score`.

Priority presentation thresholds remain consistent across systems. The highest Raid label remains **MUST RAID**; the corresponding Max label is **MUST BATTLE** so Max opportunities are not mislabeled as Raids.

### 13.5 Shared future Battle forecast

The seven-day forward-looking forecast is battle-system aware rather than Raid-only.

The Planner UI previews the highest-priority opportunities in each day card and provides an explicit **View all** expansion. The expanded day view includes both allocated and unallocated Raid/Max opportunities, their canonical priority, Max Particle cost when known, and the reason an opportunity was not auto-budgeted. This keeps unknown-cost Max Battles visible without pretending they are safe to allocate.

`recommendationsForDate()` remains the source of exact day-level availability, so suppression rules, official replacements, source precedence, and exact event windows are applied before the forecast sees an opportunity.

`buildBattleForecast()` in `src/resource-planning.js` then evaluates the normalized opportunities across the horizon:

- Raid and Max opportunities use their canonical planning value; Max never borrows ordinary Raid attacker rankings.
- Every day uses the applicable official shared Remote limit and the saved personal Remote ceiling. Today's already-used shared Remote count is subtracted; future days start with zero logged usage.
- A one-day manual ceiling override applies only to today. Future days use the normal saved personal ceiling.
- Target progress is budgeted once across the horizon. A remaining target cap is not independently re-created on every day that the same target is available.
- Single/short-window opportunities are naturally favored because groups with fewer available days are placed first; flexible opportunities are spread across feasible days by current load/value.
- Max opportunities require a usable MP cost. Evidence precedence is official event cost/tier, other verified event tier evidence, then current structured Max Battle tier data from pokemon-go-api (whose current-list datasource is SnackNap). When those automatic sources are unavailable, a private per-opportunity user tier override may supply the standard tier cost. Species/form identity alone still never invents a cost. Unknown-cost Max Battles remain visible and are not auto-budgeted.
- Max Particle feasibility is simulated across the whole horizon from the user's current held/collected state plus each day's applicable collection/storage rule. Planned Max spend on an earlier day can therefore make a later Max Battle infeasible, while future daily replenishment can make a later opportunity reachable.
- Forecast output keeps per-day Raid/Max allocation counts, MP spend/projection, all evaluated opportunities, and the actual shared allocation list.

Future-saving guidance no longer chooses from a Raid-oriented `top_recommendations` proxy. It selects the strongest **allocated, resource-feasible future opportunity** from the shared forecast. When that opportunity is a Max Battle, MP reserve guidance uses the forecast's day-by-day replenishment path (including earlier planned Max spend) before falling back to the legacy simple daily-limit estimate for compatibility data.

The existing `remote_raid_plan` response remains for API/UI compatibility, but `budget_forecast_kind = "shared_battle"` identifies the new semantics. Its legacy ordinary-Raid allocator receives only the Raid share chosen by the shared forecast; the combined forecast exposes separate additional Raid and Max counts. The current shared allocator respects both of those today-shares before applying stronger-future reserve logic, so a flexible Max target is not silently pulled forward from a later forecast day just because today's raw MP/pass capacity exists.

## 14. Remote participation and shared daily limit

Current architecture treats ordinary Remote Raids and Remote Max Battles as consuming one shared official daily Remote participation ceiling.

This supersedes the earlier conservative implementation that kept their numeric ceilings separate.

The underlying ledgers remain separate for auditability and compatibility:

- remote_raid_usage.raids_used = ordinary Remote Raid portion.
- battle_resource_daily.remote_max_passes_used = Remote Max portion.

Planning sums the two before applying the official daily limit.

This design allows one official rule layer to handle:

- Standard daily limit.
- Temporary increased limits.
- Unlimited event windows.

A Remote Max Battle using a Remote Raid Pass therefore contributes to the same shared daily Remote usage shown in Raid calculations.

## 15. Temporary Remote-limit rules and timezones

The default Remote limit is represented in application logic and can be overridden by official event rules.

Temporary overrides must use exact event timing when the official source provides trustworthy clock times plus timezone information.

src/remote-raid-rules.js:

- Parses supported named timezones such as PDT/PST and related US abbreviations.
- Parses explicit UTC/GMT offsets.
- Converts the official interval to UTC instants.
- Projects those instants into the user's saved IANA timezone.
- Evaluates today's rule against the current instant.
- Allows a source-date window to overlap the next local day after timezone conversion.
- Exposes both source-calendar dates and projected local dates/instants to the Planner.
- The Planner's active-rule banner displays an exact override in the user's saved timezone; source-calendar dates must not be presented as though they were the user's effective local interval.
- Falls back to date-only behavior when exact time/timezone cannot be trusted.

This was added after the Staraptor Super Mega Raid Day case exposed a source-date/local-date mismatch. A Sep 18 17:00 PDT start must not become a full-day Sep 18 override in Singapore.

Never infer an offset from vague phrases such as "local time."

## 16. Remote Pass planning

Remote Pass usage and Remote participation limit are related but conceptually separate:

- A Remote Raid Pass is the physical paid resource.
- The official Remote daily limit is a participation ceiling.
- Eligible Remote Max Battles also consume Remote Raid Passes.
- Event rules can change the participation ceiling.

The Planner's personal ceiling is also a ceiling, not a spending goal.

The forward-looking **Paid Battle Forecast** evaluates Raid and Max opportunities against that shared daily ceiling. Forecast budgets are additional worthwhile Remote Pass uses, not instructions to fill the ceiling, and the current-day shared plan can reserve a pass/MP for a materially stronger feasible future opportunity.

Unused capacity is acceptable.

## 17. Max Particle model

Max Battles add a second scarce resource: Max Particles.

The Planner tracks:

- MP held.
- MP collected today.
- Daily collection ceiling.
- Storage ceiling.
- Planned spend.
- Actual spend through logs.

Historical standard values used by the Planner are 800 MP daily collection and 1,500 MP storage, with event overrides allowed when explicit evidence supplies different values.

Never assume an event-specific MP limit or cost without evidence.

### 17.1 Max Battle cost evidence and tiers

The logger uses a tier-oriented Max Particle cost control, while automatic planning requires evidence before it assigns an MP entry cost.

Cost evidence precedence is:

1. an explicit official battle-entry cost;
2. a verified Max Battle difficulty/tier;
3. the standard cost mapping for that verified tier;
4. unknown.

Current standard tier mapping used after a tier is verified:

- Tier 1 — 250 MP.
- Tier 2–3 — 400 MP.
- Tier 4–6 — 800 MP.
- Event/custom cost when an official source explicitly supplies one.

A Dynamax/Gigantamax species or variant never implies a cost by itself. In particular, Gigantamax identity is not a substitute for verified difficulty. If no trustworthy cost/tier evidence exists, the cost remains unknown and the shared allocator does not auto-allocate a Remote Max Battle.

`src/resource-planning.js` normalizes numeric and word-form difficulty evidence (for example, `3-star`, `Difficulty 3`, or `six-star`) and carries cost/tier provenance with each recommendation.

The existing official Pokémon GO sync gives Max-event article links priority within its fixed page budget. When an official article provides Max Battle difficulty or an explicit entry cost, the sync decorates the already-normalized Max calendar event with `X-POGO-MAX-*` evidence in `events.other_lines`. It does not create a duplicate availability event. Recommendation normalization then exposes fields such as `max_battle_tier`, `max_particle_cost`, confidence/source metadata, and the official evidence URL.

The regular event sync runs before the official evidence sync on the existing six-hour cadence, so source refreshes can safely replace calendar rows and official evidence is re-applied afterward. If official evidence cannot be refreshed or matched, the planner falls back to unknown rather than retaining an unsupported species-based assumption.

Weekly standard Dynamax rotations derived from `max_mondays` are stored internally as `max_rotation`. They participate in Battle Plan availability directly. For user calendars, `max_rotation` inherits the visible **Max Battles** category: selecting Max Battles includes the derived weekly rotation in both the month view and private ICS feed, while the API normalizes its display category back to `max_battles`. Suppression rules targeting `max_battles` also apply to derived `max_rotation` events. The internal source is never exposed as a separate calendar preference. This matters when the upstream `max_battles` ICS feed contains only special Max Battle Days but the Max Monday schedule still provides the weekly species rotation.

## 18. Unified battle logging

The unified logger records Raids, Dynamax, and Gigantamax.

Important fields include:

- Pokémon/form.
- Battle system.
- Battle variant.
- Local or Remote participation.
- Battle/attempt count.
- Wins.
- MP cost per win.
- Total MP spent.
- Actual Remote Passes consumed.
- Target.
- Actual progress gained.
- Local date.

### 18.1 Raid logging

Remote Raid logs contribute to the ordinary Raid portion of shared Remote usage. Local Raid logs do not.

### 18.2 Max logging

For Max Battles:

- Attempts and wins are separate.
- MP is spent based on successful wins.
- Remote Passes are recorded from actual pass consumption, not assumed equal to attempts.
- A pass can be consumed even on a failed Remote Max attempt.
- Eligible retries against the same Power Spot boss can occur without consuming another pass.
- Log groups with different MP costs separately.

### 18.3 Target progress

expected_progress_per_raid can prefill expected progress but actual gained progress remains editable.

Battle-count goals use wins rather than failed attempts.

### 18.4 Atomic apply/Undo

battle_log_apply and battle_log_undo D1 triggers maintain atomic consistency across:

- Target progress.
- MP held.
- Ordinary Remote Raid usage.
- Remote Max usage.

Undo reverses the original deltas and original local date.

If later manual corrections make a clean reversal impossible, Undo fails coherently rather than partially mutating state.

Repeated requests must not duplicate effects.

### 18.5 Legacy compatibility

Older raid_log history remains readable.

Existing /api/raid-log routes remain compatibility aliases around the unified logging path where supported.

Historical Undo can import/reverse the single legacy record without replaying all past history.

## 19. Raid attacker rankings

Raid attacker rankings are analytical, type-specific PvE rankings produced by the Planner from current Pokémon GO API/GameMaster-backed stats and move data.

They are not copied from an editorial tier list.

Important behavior:

- Relevant battle-distinct forms can be compared.
- Regional forms are not silently inserted into unrelated form families.
- Explicit Shadow targets stay Shadow-specific.
- Normal/Mega/Primal comparisons exclude inappropriate regional substitutions.
- Zacian/Zamazenta generic container records are suppressed when explicit Hero/Crowned forms are available.
- Crowned Zacian/Zamazenta move transformation behavior is handled explicitly.
- Profiles are method-versioned.
- Old or malformed profile versions are hidden and prioritized for refresh.

Current implementation lives primarily in src/raid-rankings.js and the meta_sources pipeline.

## 20. Max attacker rankings

Max-specific intelligence lives in src/max-rankings.js.

Eligibility requires evidence that the Pokémon/form can participate in the Max system; the Planner does not treat every Pokémon in the normal Pokédex as a valid Max attacker.

The method intentionally values survivability/bulk more heavily than ordinary Raid DPS.

Dynamax Max Attack typing follows the selected Fast Attack type.

When Gigantamax move-specific data is unavailable, the ranking system must not fabricate it.

## 21. Pokémon matching and Pokédex fallback

Battle availability can appear before pokemon_meta has been backfilled.

To avoid hiding a legitimate current boss simply because shared meta is not ready, active battle-event matching can use the current Pokémon GO API Pokédex as a catalog fallback.

The catalog is cached per Worker isolate for a limited period.

If the upstream Pokédex is unavailable, the Planner falls back safely to existing meta/target matching rather than failing the entire planner payload.

This mechanism is for identity resolution, not permission to invent event availability.

## 22. Hundo CP

The Hundo CP calculator and battle cards use the Pokémon GO CP formula with 15/15/15 IVs.

Whole-level CP multipliers use the canonical stored values. Supported half levels derive their CPM as `sqrt((lowerCPM² + upperCPM²) / 2)`, matching Pokémon GO's half-level multiplier relationship; arithmetic interpolation is not valid.

Common levels:

- Level 15 — Research.
- Level 20 — standard Raid/egg.
- Level 25 — weather-boosted Raid.
- Level 30 — normal wild maximum where applicable.
- Level 35 — weather-boosted wild maximum where applicable.
- Level 40.
- Level 50.

Values outside actual encounter contexts should be labeled theoretical when appropriate.

For Mega/Primal Raids, weakness calculations use the Raid boss form, while catch Hundo CP uses the actual post-Raid encounter form.

## 23. Sprites

Primary sprite source is the Pokémon GO API / its assets.

Sprite rules:

- Exact form-specific asset when available.
- No knowingly incorrect substitution.
- Ordinary Dynamax can use the exact underlying species/form sprite with a DYNAMAX badge.
- Gigantamax requires an exact Gigantamax asset; otherwise render no Pokémon image and preserve GMAX text/badge identity.
- Shadow/regional/Crowned/Armored/costume forms must not silently borrow an incompatible form image.

## 24. Calendar and ICS architecture

The Planner provides:

- In-app month calendar.
- Personalized event visibility.
- Private read-only iCalendar subscriptions.
- Compatibility with standard calendar clients such as Apple Calendar, Google Calendar, and Outlook.

Calendar URLs are bearer credentials.

Personalization and suppression must be consistent across:

- In-app Calendar.
- ICS output.
- Current battle availability.
- Recommendations.

Legacy subscription URL compatibility must be preserved when internal routing or token handling changes.

## 25. Administration and synchronization

The admin surface supports operations such as:

- Event synchronization.
- Official supplement detection.
- Temporary Remote-limit detection.
- Suppression-rule synchronization.
- Meta synchronization.
- Raid-ranking refresh/backfill.
- Max-ranking/meta maintenance.

Administrative actions must use existing secret/binding infrastructure. Never embed management secrets in client code.

Synchronization health is persisted per logical source rather than inferred from the newest row written to events/meta tables. The Planner keeps the legacy layer timestamps for API compatibility, but also receives health summaries for event feeds relevant to the user's current calendar selection, official schedules, and meta/assessment inputs. A group is degraded when a relevant source's latest attempt failed; a never-recorded source is reported as pending/unknown rather than healthy. Healthy group freshness uses the oldest successful timestamp among its relevant dependencies, preventing one recent success from masking another stale dependency.

Migration 0006 is deployment-order tolerant. Before the table exists, health writes are best-effort and the Planner falls back to legacy freshness timestamps instead of failing synchronization or `/api/me`.

## 26. Testing strategy

package.json runs a deterministic regression suite covering the major domains, including:

- Raid rankings.
- Battle opportunities.
- Battle Plan UI.
- Remote-limit timezone rules.
- Resource planning.
- Recommendation engine.
- Max rankings.
- Max ranking integration.
- Unified battle logging.
- Battle logging UI.
- Battle-aware Targets.
- Fresh-database schema and idempotent operational-table migration completeness.

There is also a live upstream contract test for Pokémon GO API/GameMaster-related assumptions.

A real-browser regression suite runs in Chromium for UI behavior that source inspection and VM execution cannot validate reliably. The browser fixture is self-contained: the test starts and stops its own local HTTP fixture server and uses deterministic mocked Planner/catalog responses. Regression fixtures are intentionally independent of the live event rotation: a historical species/form such as Dynamax Rhyhorn remains valid test data after it leaves live Max Battles because the contract being tested is form resolution/rendering, not current availability. Current coverage includes intermediate desktop text visibility, asynchronous Max battle-intel rendering, mobile modal containment/background locking, and horizontal page overflow.

GitHub Actions runs deterministic regression checks and the browser suite automatically for every pull request and every push to `main`; no manual development server is required for the browser job. The upstream live-contract check does not gate pull requests because it depends on external availability and schema drift; it still runs on `main` pushes, schedules, and manual workflow runs. This keeps PR regression status deterministic while preserving early warning for upstream changes.

Tests are deliberately used to freeze previously discovered regressions such as:

- Wrong form-family rankings.
- Old ranking method cache leakage.
- Crowned transformation handling.
- Missing Max cards when meta is late.
- Weekly Max rotation disappearance.
- Target battle-kind leakage.
- Shared Remote Raid/Max usage.
- Mobile navigation/sheet state.
- Remote-limit timezone rollover.

Future bug fixes should add focused regression coverage whenever practical.

## 27. Development and release workflow

AGENTS.md is the mandatory repository development workflow.

Core rules:

- Start from newest main.
- Never use an old generated patch/ZIP as source of truth.
- Use a feature/fix/docs/chore branch.
- Make the smallest safe change.
- Preserve wrangler.jsonc, routes, D1 bindings, Cron, secrets, Service Bindings, and deployment settings unless explicitly required.
- Validate syntax, tests, and diff cleanliness.
- Treat the automated browser UI job as a required regression check for UI/responsive changes; it self-starts its fixture server and must not require the user to launch Wrangler.
- Push the feature branch.
- Open a PR to main.
- Stop at a green PR unless the user explicitly authorizes merge/deploy.
- "ship it" is explicit merge authorization.
- Do not manually run wrangler deploy unless explicitly required.
- Never claim a merge/deploy happened unless it actually happened.

## 28. Dev Container

The repository includes a Docker-based VS Code Dev Container so Windows development does not require native Git tooling.

The Dev Container setup includes:

- Reproducible Node/CLI environment.
- VS Code integration.
- Codex extension/configuration support.
- GitHub authentication persistence helpers.
- Repository-local Git identity setup.
- Cross-computer workflow documentation.

The Dev Container is development infrastructure only and must not change production Worker bindings/configuration by accident.

## 29. Non-goals and guardrails

The Planner should not:

- Treat every daily limit as a quota to fill.
- Build a full owned-Pokémon inventory unless the product direction explicitly changes.
- Equate normal Raid DPS with Max Battle performance.
- Invent shiny availability, event availability, Max eligibility, Remote eligibility, MP costs, or event limits.
- Substitute the wrong Pokémon form for convenience.
- Expose private management/calendar links.
- Collapse Remote Raid and Remote Max ledgers so completely that auditability is lost.
- Delete underlying meta when an event is suppressed.
- Rewrite existing Target IDs or historical log identity merely to normalize newer semantics.

## 30. Documentation maintenance and change logging

Documentation maintenance is a repository invariant, not optional cleanup after implementation.

Every feature, improvement, bug fix, refactor, migration, maintenance change, and workflow change must receive a documentation-impact assessment in the same branch/PR. The durable files have distinct roles:

- `docs/ARCHITECTURE.md` describes **current intended system behavior and invariants**. Update it when a change affects production topology/bindings, database model/migrations, APIs/data flow, battle-system modeling, source precedence, Remote-limit semantics, resource planning, logging/Undo, Target identity, ranking methodology, calendar/ICS behavior, security, operations, or mobile/desktop architecture. A bug fix should also update this document when it reveals or clarifies an invariant future work must preserve.
- `docs/DECISIONS.md` is the **durable decision and change history**. Every product improvement and bug fix must receive a compact PR-lineage entry. Add or revise an ADR when rationale, tradeoffs, or a durable architectural/product decision changes or supersedes an older choice.
- `README.md` is the **user/developer/operator guide**. Update it when features, visible behavior, setup, usage, migrations, deployment steps, or normal development workflow change.
- `AGENTS.md` is the **automation and release policy**. Update it when development, validation, documentation, PR, or release workflow changes.
- `docs/BACKLOG.md` is the **durable unshipped-work record**. Update it when confirmed future work, verified technical debt, or deferred/not-planned status changes. Remove shipped items from Active/Deferred and rely on `docs/DECISIONS.md` for the shipped history.

Not every fix requires a new ADR, and unrelated docs should not be churned. However, product improvements and bug fixes are always logged in the DECISIONS.md PR lineage so the repository can reconstruct its evolution without old chats. Unshipped commitments must likewise be captured in BACKLOG.md if they need to survive chat cleanup.

Because a PR number does not exist until the PR is opened, the development workflow may add the final PR-lineage entry as a small follow-up commit on the same branch. The PR is not considered ready to merge until that entry and any other relevant documentation are current.

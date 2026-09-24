# Pokémon GO Planner

Pokémon GO Planner is a private, personalized raid-planning and calendar application. It combines current event schedules, raid and meta data, personal targets, and Remote Raid preferences to help each user decide what is worth raiding.

**Production app:** [https://pogo-plan.jquak-10.workers.dev](https://pogo-plan.jquak-10.workers.dev)

**Engineering references:** [Current architecture](docs/ARCHITECTURE.md) · [Architecture decisions and supersession history](docs/DECISIONS.md) · [Unshipped backlog](docs/BACKLOG.md)

The engineering references above are the durable source for current architecture, design history, and confirmed unshipped work. Some Part-by-Part notes below intentionally describe the state at that implementation stage; when a later decision superseded an earlier one, docs/DECISIONS.md records the replacement. Future ideas or known technical debt that have not shipped belong in docs/BACKLOG.md rather than relying on project chat history.

**Change logging policy:** every product improvement and bug fix is recorded in the PR lineage in [docs/DECISIONS.md](docs/DECISIONS.md). Changes to current system behavior or invariants also update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); confirmed unshipped work and technical debt update [docs/BACKLOG.md](docs/BACKLOG.md); user/developer-facing behavior updates this README; development automation/policy updates [AGENTS.md](AGENTS.md). Documentation is maintained in the same PR as the change rather than reconstructed from chat history later.

Each planner receives a private management link and a separate read-only iCalendar (ICS) subscription link. Keep both private; anyone with the management link can change that planner. The Planner includes recovery controls for rotating an exposed management link and regenerating or revoking the preferred signed calendar URL without changing the other credential. The Preferences danger zone also supports permanent self-service planner deletion; deleting the planner invalidates every management/calendar capability and removes planner-owned data through the existing D1 cascade relationships.

## What the app does

The planner brings the decisions that normally live in several places into one dashboard: what is currently available, how valuable each raid is, which Pokémon matter to you, how much progress remains, and whether another paid Remote Raid is worthwhile. It also provides a personal event calendar and a private calendar subscription.

Create a planner with your timezone, save its private management link, and then tailor its Targets, recommendation weights, Remote limits, and event filters. The Battle Plan updates from those choices and from the battles you log.

Planner creation is deliberately low-friction but abuse-bounded. If creation traffic exceeds the configured Cloudflare limit, the page receives an explicit temporary rate-limit error and can be retried after one minute.

## Part 4: unified Battle logging

The Battle logger records ordinary Raids, Dynamax and Gigantamax separately. Recommendations prefill battle identity, participation eligibility and confidently known MP costs. Unknown or estimated costs remain blank and must be supplied for wins. Actual target progress stays editable. For Max Battles, enter attempts, wins and actual Remote Passes consumed; same-boss retries can use fewer passes than attempts. Log groups with different MP costs separately.

Official rules checked on 17 September 2026:

- [Niantic: Joining Battles Remotely](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/2487-joining-battles-remotely/) confirms Remote Max Battles use a Remote Raid Pass plus the same MP cost as local participation. The pass is consumed when battle starts, including a loss; eligible retries against the same boss do not consume another pass.
- [Pokémon GO: Max Battles](https://pokemongo.com/max-pokemon-battle) confirms MP is spent only after defeating the boss. The logger therefore deducts MP for wins and records pass consumption separately.
- The Part 4 implementation initially kept ordinary Remote Raid and Remote Max numeric usage separate while the official relationship was unclear. That historical choice was superseded in PR #27: ordinary Remote Raids and Remote Max Battles now consume one shared official daily Remote participation ceiling, while their underlying ledgers remain separate for auditability. Temporary increases and unlimited windows apply to the combined usage.

### Required D1 migration

`migrations/0002_battle_logging.sql` is required because aggregate Part 3 resource counters cannot preserve each transaction's battle identity, pass/MP deltas and reversible target progress. It adds a durable `battle_log` table, an index, atomic apply/Undo triggers and a unified history view. It reuses `battle_resource_state`, `battle_resource_daily` and ordinary `remote_raid_usage`. `schema.sql` includes the same additions for fresh databases.

The migration uses `CREATE IF NOT EXISTS` and does not replay history or attach triggers to the historical `raid_log` table. Historical Undo imports and reverses one old row in a single D1 batch. New Undo reverses the original deltas and original usage date atomically; repeated requests are harmless. Conflicting manual corrections or deleted targets reject the entire Undo rather than partially refunding resources. MP refunds are not clamped, so later collection cannot cause a lossy Undo.

After merge, an authorized operator must apply **only** the new migration to production using the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0002_battle_logging.sql
```

This command is a manual production step, not part of tests or this PR's execution. Part 3 migration `0001_battle_resources.sql` must already be applied. The additive migration is compatible with the old Worker; if the new Worker arrives first, logging returns an actionable migration-required error until the migration is applied. Do not initialize production with the full `schema.sql`.

`/api/battle-log` and `/api/battle-log/undo` serve the unified logger; the existing `/api/raid-log` paths remain aliases. No Worker deployment settings change. CSS references are bumped to v33 on all four public pages. The deterministic suite includes actual SQLite transaction tests (Node 22.13+ or Node 24), API compatibility, resource/Undo regressions, UI contracts and inline JavaScript syntax checks.

## Part 5: Targets integration

Targets now distinguish ordinary Raids, Dynamax and Gigantamax. Add a target from a recommendation, or choose its battle type in the editor. Max goals default to battles won; Candy, Candy XL and editable custom progress remain supported. A matching existing recommendation target opens Edit. Existing targets can correct Pokémon/form, battle type, and target type while keeping the same stable target ID so historical battle-log/Undo links remain attached. Duplicate identity changes are rejected. The logger offers a goal selector when several goals match the same battle.

Matching uses the exact Pokémon/form plus battle identity across recommendations, current/upcoming availability, calendar personalization and logging. A Raid target never automatically receives Max progress. Explicitly named legacy Max targets retain that identity; otherwise historical targets remain Raid targets. New Max targets use capability-prefixed names (for example, Gigantamax Gengar) so separate goals coexist under the existing per-user/name/goal uniqueness rule. No existing name, ID or progress is rewritten.

When several goals match, recommendations prioritize active targets, then personal priority, with a stable goal/ID tie-break. The logger initially selects that target, but the user can select another matching goal and edit actual progress. Completed/Skip goals retain their planning exclusions. Battle-count goals use wins, not failed attempts. The planner does not automatically mark targets complete.

Battle and availability filters participate in the existing Active/Completed/All counts. Max Target cards omit ordinary Raid attacker information and never substitute a base sprite for a missing exact form. The Target editor and logger retain visible actions at narrow mobile sizes; CSS references are v34. Single-target deletion now reports progress/failure inline in Targets: a failed delete preserves the current tab, search/filter context, and target card, while a successful delete reloads state as before.

### Part 5 migration and rollout

`migrations/0003_target_battle_kind.sql` adds one nullable, constrained `targets.battle_kind` column. It preserves Target IDs and historical Raid foreign keys without rebuilding tables. It does not change Part 4 logs or resource tables. `schema.sql` includes the column for fresh databases.

Apply the migration **once**, after merge and production authorization, with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0003_target_battle_kind.sql
```

Unlike the CREATE-based Part 4 migration, SQLite ADD COLUMN is not repeatable. Check `PRAGMA table_info(targets)` first if application status is uncertain. Do not apply it again to a database already containing `battle_kind`, including a fresh database initialized with the new schema. Before migration, reads retain legacy identity inference and Target saves return an actionable 503.

Editing preserves a target's stable ID and history link, but Pokémon/form, battle type, and target type can now be corrected in place. A change that would collide with another existing target is rejected instead of merging/resetting progress. Progress, desired amount, expected progress, priority, completion and notes remain editable.

The Part 5 suite covers migration/FK preservation, separate same-species goals, CRUD/authentication, duplicate protection, form matching, recommendations, suppression-aware availability, allocation caps, editable progress and Undo, and filtered UI counts. No production migration, merge or deployment is part of Part 5 PR preparation.

### Schema baseline reconciliation

`schema.sql` is the supported fresh-database baseline. On 18 September 2026, the production D1 schema was inspected directly and confirmed to contain `event_suppression_rules`, `remote_raid_daily_budget_overrides`, `idx_event_suppression_dates`, and `idx_remote_raid_daily_budget_overrides_date`. The repository baseline now carries those verified definitions.

`migrations/0004_schema_baseline_operational_tables.sql` is an idempotent repair migration for an existing installation that is missing either operational table or explicit index. It uses only `CREATE ... IF NOT EXISTS`, so it preserves existing rows and objects. The current production database already contains all four verified objects, so BL-001 does **not** require applying migration 0004 to production.

For another installation, inspect `sqlite_schema` first. If any of the four objects are missing, apply the migration with the existing D1 binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0004_schema_baseline_operational_tables.sql
```

Fresh databases should be initialized from `schema.sql`, not by replaying production migrations.

### Max Battle tier override migration

`migrations/0005_max_battle_cost_overrides.sql` adds private per-user, per-opportunity Max Battle tier/cost fallback data. It is additive and uses `CREATE ... IF NOT EXISTS`. Apply it to an existing production D1 database before deploying the Worker/UI that exposes **Set Max tier…**:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0005_max_battle_cost_overrides.sql
```

The override is used only when automatic cost evidence is unavailable. It does not replace official event evidence or trusted current tier data.

### Sync source health migration

`migrations/0006_sync_source_health.sql` adds per-source synchronization health for event feeds, official schedules, and meta inputs. It stores the latest attempt, latest successful attempt, last error, and last successful item count. The migration is additive and idempotent.

Apply it to an existing production D1 database with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0006_sync_source_health.sql
```

The Worker is intentionally backward compatible with deployment order: if the new Worker runs before migration 0006 is applied, synchronization continues and the Planner falls back to its legacy freshness timestamps. Once the table exists and the next synchronization runs, per-source health begins populating automatically.

### Credential rotation migration

`migrations/0007_feed_link_credentials.sql` adds per-planner generation/enable state for the preferred signed calendar subscription. It is additive and idempotent.

Apply it to an existing production D1 database with the existing binding:

```bash
npx wrangler d1 execute DB --remote --file=migrations/0007_feed_link_credentials.sql
```

Deployment order is safe. Before migration 0007 exists, every existing generation-0 signed URL keeps working exactly as before and the Planner disables signed-feed rotation controls. After the migration is applied, regenerating or revoking the preferred signed URL advances only that planner's generation and immediately invalidates its previous signed URL. Legacy `/calendar/<random-token>.ics` subscriptions remain independently compatible until the existing legacy-revoke control is used. Management-link rotation does not require migration 0007 and does not alter either calendar credential.

## Features

- Personalized raid recommendations based on event availability, shared meta scores, user-defined weights, targets, progress, and priority.
- Type-specific PvE raid-attacker rankings calculated from Pokémon GO API/GameMaster-backed stats and moves, with optimal move pairings and form-aware comparisons.
- Remote Raid planning that treats official limits and an optional personal budget as ceilings, not spending targets.
- Unified Local/Remote Raid, Dynamax and Gigantamax logging, recent activity, reversible resource accounting, and editable target-progress updates.
- Targets for Mega Energy, raid counts, Candy XL, Candy, and custom goals, with priority, progress, notes, completion state, search, filters, card/list views, and bulk deletion.
- A Hundo CP calculator for the loaded Pokémon GO Pokédex, common encounter levels, and custom levels. Catalog loading has explicit loading/error/retry states and can fall back to the last successfully saved public catalog when the live catalog endpoint is temporarily unavailable.
- A live month calendar and private ICS feed with user-selectable event categories.
- GO Calendar data, higher-priority official Pokémon GO schedule supplements, and suppression rules. Still-upcoming official supplement source pages are retained and revisited through their event horizon even after they fall outside the newest-news discovery window; a failed refresh preserves the last-known future supplement instead of erasing it.
- Automated PvPoke Master League data and Pokémon GO API-based analytical inputs, with visible source precedence and per-source synchronization health. The freshness strip warns when a source relevant to the current planner is degraded instead of letting a different successful source make the entire layer appear fresh.
- Responsive desktop and mobile interfaces with centralized overlay keyboard behavior: modal/sheet focus containment, Escape-to-close, opener focus restoration, background isolation, visible keyboard focus, and reduced-motion support.
- Planner section tabs support roving keyboard focus with ArrowLeft/ArrowRight and Home/End navigation. Mobile **More** remains a normal disclosure button outside the tablist, so opening it does not masquerade as selecting a tab.
- The private Planner management surface loads executable JavaScript only from same-origin external assets and is served with `script-src 'self'` (no `'unsafe-inline'` script allowance).
- Planner API calls share one failure-normalization boundary: structured server errors are preserved, while non-JSON/empty server responses and network failures become concise retry/recovery messages instead of browser JSON/transport exceptions.
- Administration views for synchronization, official raid supplements, Remote Raid limits, suppressions, meta assessments, and raid-ranking refreshes.
- Capability-link access without a conventional email/password account, with independent recovery controls for management and preferred signed calendar credentials.
- Permanent self-service planner deletion with an exact typed confirmation. Deleting the parent planner record cascades through Targets, battle logs, resource history, per-planner overrides, and calendar credential state; no separate migration is required.

The project is independent and is not affiliated with Niantic, The Pokémon Company, Nintendo, or GAME FREAK.

## Using the app

### Create or open a planner

1. Open the [production app](https://pogo-plan.jquak-10.workers.dev).
2. Confirm the detected timezone or choose another valid IANA timezone (for example, `Asia/Singapore`). New-planner setup prefills the browser's current timezone when the browser reports a valid one; it never replaces a manual choice. If browser detection is unavailable, the field stays empty so the user must choose a valid timezone rather than silently receiving a different region. The browser suggests supported timezones, and both the Planner UI and Worker reject invalid timezone names. The saved timezone controls local event dates, temporary event limits, and when daily Remote Raid/Max Particle usage resets.
3. Select **Create my planner**.
4. Save the **Management link** somewhere private. It is the sign-in link for that planner.
5. Save the separate calendar link only in a trusted calendar client.

There is no email/password recovery flow. Someone who has the management link can change the planner's targets and settings.

### Raid Plan

The **Raid Plan** tab combines today's limits, activity, recommendations, and future opportunities:

- **Remote Battle Plan** shows the **Official limit**, **Recommended next** shared Remote Pass uses, **Today's ceiling**, and **Official remaining** after already logged Remote Raids/Remote Max Battles.
- **Today's planning capacity** divides the shared Remote ceiling into **Used**, **Recommended**, and **Left unused**. Unused capacity is intentional when available Raid/Max opportunities do not meet the configured value/resource rules.
- **Paid Battle Forecast** evaluates Raid and Max opportunities across the next seven days. It uses exact normalized availability/suppression, canonical Raid/Max planning value, the shared Remote ceiling, target progress across the whole horizon, and Max Particle cost/replenishment. Each day previews the top opportunities; **View all** expands that day to show every evaluated Raid/Max Pokémon, including unallocated Max Battles and the reason they were not auto-budgeted (for example, unknown MP entry cost).
- **Today's Battle Activity** separates Raid/Max, Remote/Local, and total logged battles.
- **What to battle now** displays current Raid and Max Battle recommendations. Each card uses the same canonical planning score/priority that drives Today, desktop Quick Status, recommendation ordering, and shared resource allocation. Raid priority uses the personalized Raid value; Max priority uses the Max-aware planning method and never treats ordinary Raid attacker rankings as Max performance. **Why?** includes the planning-priority rationale. Max Particle cost is used automatically only when backed by an explicit official entry cost or a verified Max Battle tier mapped to the standard tier cost; Dynamax/Gigantamax identity alone never invents a cost, and unknown cost continues to block automatic Remote Max allocation. Max weakness/resistance guidance resolves through the underlying exact species/form; Raid-only 100% IV encounter CP and Raid attacker rankings remain Raid-specific. Multi-Pokémon Max schedules are normalized per Pokémon, so a grouped event such as “Dynamax Articuno, Zapdos, and Moltres” produces **Dynamax Articuno**, **Dynamax Zapdos**, and **Dynamax Moltres** consistently across recommendations, forecasts, Targets, and logging. Ordinary Dynamax presentation reuses the exact underlying species/form sprite when no separate Dynamax asset is needed; regional forms stay exact. Gigantamax remains exact-sprite-only, so the app shows no sprite rather than substituting an ordinary form. If the shared Pokémon catalog cannot load, battle intel exits the loading state, offers a retry, and uses the last successfully saved catalog when available.
- The first recommendations appear directly; **More battle opportunities** expands the rest. Any Raid or Max card with zero recommended Remote allocation shows a compact reason directly on the card—for example MP cost unknown, below the paid-battle threshold, Remote access unavailable/unconfirmed, target complete, or priority Skip. **Battles receiving 0 Remote allocation** keeps the full explanations available in a secondary collapsible list and follows the current Raid/Max filter.

Recommendations combine current event availability with PvE, PvP, rarity/collection, battle-system-specific attacker intelligence, personal targets, and saved preference weights. The visible score is the canonical Battle Plan priority: for Raids it is the personalized Raid recommendation value, while Max Battles use the Max-aware planning value. The underlying general/personal value is retained internally for Max calculations so the app does not recursively rescore its own output. A high priority score is evidence for consideration, not an instruction to spend a pass. Local battles remain valid even when no Remote allocation is recommended.

Raid-attacker rankings are computed by the planner from current Pokémon GO API/GameMaster-backed stats and moves rather than copied from an editorial tier list. Battle-distinct forms are compared deliberately, regional forms are not silently substituted into unrelated form families, and explicit Shadow targets remain Shadow-specific. Cached ranking profiles carry a methodology version; outdated or malformed profiles are hidden and queued for regeneration rather than shown as current data.

Expired raid events are defensively excluded from current recommendations even if an already-imported event row remains stored, so past rotations do not stay in **What to raid now** after their availability window ends.

### Remote Raid planning

Remote limits are always ceilings, not goals, and eligible Remote Max Battles share the same official daily Remote participation counter:

- **Official remaining** is the official daily capacity minus already logged shared Remote uses. When a temporary official rule has an exact timezone-aware window, its banner shows the effective start/end in the planner's saved local timezone rather than the announcement's source-calendar dates.
- **Recommended next** is the final current shared-plan recommendation after the Raid + Max forecast and stronger-future reserve logic, not a spending target.
- **Today's ceiling** applies the saved **Usual personal ceiling** or a one-day override without exceeding the official game limit.
- The **Paid Battle Forecast** evaluates every normalized Raid/Max opportunity for each forecast day. Suppressed/unavailable events are absent before planning; remaining target progress is shared across the horizon instead of duplicated per day.
- Raid and Max candidates use their own canonical planning method. Allocations stop when marginal value falls below the saved **Minimum Remote Raid score**.
- Remote Max allocation requires a usable MP entry cost. Official event evidence remains highest priority; the event sync also consumes the pokemon-go-api current Max Battle tier feed (sourced from SnackNap) for currently active bosses when official tier data is absent. If automatic tier evidence is still missing, the card/forecast exposes a per-opportunity **Set Max tier…** control. The selected tier maps to the standard cost (Tier 1 = 250 MP, Tier 2–3 = 400 MP, Tier 4–6 = 800 MP) and is stored as a private user fallback; verified automatic evidence always wins when available. The forecast then simulates held MP, today's remaining collection, future daily replenishment/storage rules, and planned Max spend across days.
- Future-saving guidance is selected from resource-feasible forecast allocations rather than a Raid-only top-recommendation proxy. A stronger future Max opportunity can therefore reserve both a Remote Pass and the amount of MP that cannot be replenished before it.
- Completed or skipped targets receive zero paid allocation. Target priority, remaining progress, expected progress per battle, exact availability, and future resource competition can change the recommendation.

Open **Planner controls & manual corrections** on the Raid Plan to use:

- **Today's budget override** and **Save override** for a one-day ceiling.
- **Use Auto** to remove that override.
- **Remote limit used today · manual correction** for shared Remote Raid/Remote Max usage completed before using the logger or to correct the counter.

Logging a Remote Raid or eligible Remote Max Battle normally updates the shared usage counter automatically. Local battles do not consume Remote capacity.

### Targets

Open **Targets**, then select **+ Add target**:

1. Choose a **Pokémon**. The list prioritizes Pokémon available now and known raid targets in the next 30 days; **Other / custom Pokémon…** accepts another Pokémon or form.
2. Choose a **Target type**: **Mega Energy**, **Number of raids**, **Candy XL**, **Candy**, or **Custom progress**.
3. Enter **Current progress**, an optional **Desired target**, and optional **Expected progress per raid**.
4. Set **Personal priority** to **High**, **Medium**, **Low**, or **Skip**. Skip prevents paid Remote Raid allocation for that target.
5. Set **Completed?**, optionally add **Notes**, and select **Save target**.

Use the status controls to switch among **Active**, **Completed**, and **All**. Search with **Search Pokémon…**, and filter by:

- **Goal type**: All types, Mega Energy, Candy, Candy XL, Raids, or Other.
- **Priority**: All priorities, High, Medium, Optional, or Skip.
- **Raid availability**: All, Available now, Upcoming, or Not currently raiding.
- **Sort**: Priority, Closest to goal, Name, or Recently updated.

Active targets that are high priority or **Available now** appear under **NEEDS ATTENTION — Available now or high priority**. Other active goals appear under **TRACKING — Other active goals**. Finished goals appear under the collapsible **COMPLETED — Finished goals** group.

Each target card shows progress, availability, priority/completion, expected progress per battle when present, and its available system-appropriate attacker ranking where applicable. Use **Edit** to change the Pokémon/form, **Battle**, **Target type**, progress values, priority, completion, or notes. Identity corrections keep the same target ID/history link unless the new identity would duplicate another target. Completed targets stay visible through **Completed** or **All** and receive zero paid Remote allocations. The overflow menu provides **Delete target**.

For bulk cleanup, select **Select** to enter multi-select mode, choose individual targets or **Select all shown**, then use **Delete selected**. **Select all shown** respects the current search and non-status filters, and **Cancel** exits selection mode without deleting anything. The Targets navigation badge shows the **Active** target count only rather than Active + Completed targets.

### Raid logging

Select **+ Log raid** from the Raid Plan, a recommendation, a target, the desktop quick-status rail, or the mobile quick action.

1. Choose the **Pokémon**.
2. Choose **Remote** or **Local** under **Raid type**.
3. Enter **Raids completed**; the current UI accepts 1–99 in one log.
4. Review **Total target progress gained**. Raid-count targets prefill one per raid; other matching targets use **Expected progress per raid** when available. Edit this field to record the actual total gained.
5. Leave **Update matching target progress** selected to apply that progress, or clear it to log raids without changing the target.
6. Review the **AFTER CONFIRMING** preview and select **Confirm raid log**.

Remote logs update the daily Remote Raid counter; Local logs are tracked separately. **Recent raid logs** shows up to five entries. Use **Undo** to reverse a mistaken log; target progress and the Remote Raid counter are reversed where applicable.

### Hundo CP

The **Hundo CP** tab calculates CP for a 15/15/15 Pokémon without inventing fixed values:

1. Use **Find a Pokémon** to search by name or Pokédex number.
2. Select the exact Pokémon or form from the results. Non-base entries are identified with a form badge, and recent selections appear under **RECENT**.
3. Review the common benchmarks: **Research** at Level 15, **Raid / Egg** at Level 20, and **Weather-boosted raid** at Level 25.
4. Select **More levels** for wild maximum, weather-boosted wild maximum, Level 40, and Level 50 benchmarks.
5. Under **CUSTOM LEVEL**, enter Level 1–50 in 0.5 steps.

Half-level custom results use Pokémon GO's canonical half-level CP-multiplier relationship rather than linearly averaging adjacent whole levels.

Search and calculations are form-specific. On raid recommendation cards, the app distinguishes the raid battle form from the catch encounter: Mega, Primal, Gigantamax, and Dynamax prefixes are removed when resolving the base-form catch encounter. Mega or Primal raid-boss stats therefore are not used as the base-form catch CP.

### Calendar

The **Calendar** tab has two related views:

- **Calendar Subscription** prepares one private, read-only **PREFERRED SUBSCRIPTION URL** for Apple Calendar, Google Calendar, Outlook, Spark, and compatible iCalendar clients. Select a client in **Where do you want to subscribe?** for its current instructions.
- **MONTH VIEW** shows the same selected event categories and personalized titles as the subscription. Use the previous/next controls or **Today**, then select a date to inspect its events.
- **Max Battles** also includes the Planner's derived weekly standard Dynamax rotation from Max Monday schedule data. This fills the week-long Max schedule in the month view and private ICS even when the upstream Max Battles feed only lists special Max Battle Day events. Max Monday itself remains a separate category/event.

Expand **Choose which event categories appear**, select the desired categories, and choose **Save calendar filters**. The dashboard preview updates immediately; calendar clients poll the ICS feed on their own schedules.

Treat the private calendar URL like a bearer credential: anyone who has it can read the calendar. Do not share it, paste it into chat, or commit it. The **Moving from an older calendar URL?** section explains migration; **Revoke legacy URL** invalidates older token links but does not change the preferred signed subscription.

### Preferences

The **Preferences** tab contains:

- **Raid / PvE importance**, **PvP importance**, and **Rarity / collection importance** sliders. A value of zero ignores that factor.
- **Usual personal ceiling**, an optional normal maximum for paid Remote Raids.
- **Minimum Remote Raid score**, below which the planner stops allocating paid Remote Raids.
- **Timezone**, which controls local event dates and the daily Remote Raid reset.
- **Delete Planner** in the danger zone. Type `DELETE` exactly to enable the permanent action. Deletion removes this planner's Targets, Battle logs, resource history, settings/overrides, and calendar credential state and immediately invalidates its management and calendar links. It cannot be undone.

Select **Save preferences** after making ordinary preference changes. These settings can make the plan more conservative but cannot raise the official game limit. Planner deletion is a separate irreversible action and does not use the Save preferences button.

### Management and administration

The management dashboard is accessed through each planner's private capability link. It controls that planner's Battle Plan, targets, logs, preferences, and calendar; it is not a public account profile. Keep the management URL private. The current UI sends its capability to management APIs in an authorization header rather than repeating it in request URLs or JSON bodies; the Worker still accepts the older token forms so existing integrations are not broken. Private Planner/Admin HTML is served no-store with no-referrer, frame protection, CSP/content restrictions, and related defense-in-depth headers.

The separate **Planner Admin** interface is for authorized maintainers. It can run and inspect event, official-schedule, Remote-limit, suppression, meta-assessment, and raid-ranking synchronization. Its browser requests send the configured admin credential in a request header; older query/body-key API calls remain compatible. Never share that credential or include it in a URL, README, issue, log, commit, or chat.

The public **Data Sources & Precedence** page explains why explicit official schedules take priority over suppression/replacement notices and general GO Calendar data, and identifies the analytical inputs and versioned computation used for raid value and attacker rankings.

### Typical user workflow

1. Create the planner, save the private management link, and confirm the timezone.
2. Add Pokémon under **Targets**, including current progress, desired progress, and priority.
3. Adjust **Preferences** if the default recommendation weights or Remote Raid rules do not fit.
4. Review **Raid Plan**, including today's capacity, **What to raid now**, and the seven-day forecast.
5. Decide whether a recommended raid is worthwhile; unused capacity is acceptable.
6. Use **+ Log raid** for completed Remote or Local raids and enter the actual progress gained.
7. Review updated target progress and recommendations.
8. Check **Calendar** for upcoming opportunities and subscribe with the private read-only link if desired.

### Mobile and desktop experience

- On wide desktop screens (1180 px and above), the planner uses fixed left-side navigation and a sticky **Quick status** rail with top priority, activity totals, **+ Log battle**, quick search, and a **Compact density** toggle. Targets also offer **Cards** and **Compact list**.
- Intermediate desktop/tablet widths keep dense Today/Battle Resources and Calendar panels stacked, use a four-column Paid Battle Forecast, wrap primary detail names, and retain segmented navigation above the content instead of prematurely squeezing the wide-desktop layout.
- Mobile uses a fixed bottom navigation for **Raid Plan**, **Targets**, **Hundo CP**, **Calendar**, and **More**. **Preferences** and **Data sources** are in the **More options** sheet. Opening **More** preserves the current section until an option is selected.
- Mobile provides a floating **+ Log raid** action, presents the raid logger as a bottom sheet, and moves advanced Target filters into the **Organize targets** drawer.
- On mobile, **More levels** expands the additional Hundo benchmarks, and Calendar day details flow beneath the month view.
- The public landing page, Data Sources page, and Planner Admin page collapse their multi-column layouts for narrow browsers, keep long URLs/text wrapped, and use touch-friendly controls without reserving space for the Planner-only bottom navigation.

## Technology and architecture

- **Cloudflare Workers** runs the backend and serves static frontend assets.
- **Cloudflare D1** stores planners, targets, events, meta data, Remote Raid usage, and limit overrides.
- **Cloudflare Workers Rate Limiting** protects public planner creation without storing raw client IPs in D1 or logs: the creation endpoint enforces both a per-client hashed-key limit and a route-wide per-location ceiling before any planner row is inserted.
- **Static frontend files** in `public/` provide the landing page, planner, administration, data-source, and responsive UI.
- The credential-bearing landing, Admin, and private Planner HTML surfaces execute application JavaScript only from same-origin external files under `script-src 'self'`; inline executable scripts are regression-tested against reintroduction.
- Landing and Admin requests share one status-aware JSON/transport boundary: structured server errors are preserved, HTML/empty/malformed responses become actionable messages, and connection failures do not expose raw parser or browser error text.
- **Worker code** in `src/index.js` orchestrates APIs, private routes, scheduled synchronization, recommendations, and asset routing; focused modules such as `src/http-security.js` and `src/calendar-ics.js` keep reusable infrastructure/parsing logic out of the entry point.
- **Cron Triggers** run separate event, official Remote Raid limit, and automatic meta synchronization jobs every six hours; the meta sync also refreshes versioned raid-ranking profiles.
- **GitHub and Cloudflare** provide the production path: feature branch → PR → `main` → the existing Cloudflare deployment pipeline.
- The production `main` branch is protected by the active **Production main** GitHub ruleset: changes must arrive through a PR, `deterministic` and `browser-ui` must pass, `live-contract` stays non-blocking, and force pushes/deletion are blocked. The ruleset has no routine bypass actors.
- The required `deterministic` gate installs dependencies reproducibly with `npm ci` and runs `npm run check:worker`, which packages the Worker with Wrangler `deploy --dry-run` without uploading it. This validates the lockfile plus Worker bundle/configuration before merge.
- **VS Code Dev Containers** provide the development toolchain while source remains on Windows.

```text
Browser / calendar client
          |
          v
Cloudflare Worker ----> public/ static assets
          |
          v
      Cloudflare D1
          ^
          |
scheduled event, Remote Raid limit, and meta synchronization

C:\Projects\pokemon-go-plan on Windows
          |
          | bind mount
          v
/workspace in the Dev Container
```

Manual `wrangler deploy` is available as an npm script, but it is not the normal production workflow.

## Repository structure

```text
.
├── .devcontainer/
│   ├── Dockerfile             # Container image and global development tools
│   ├── codex-config.toml      # Non-secret Codex configuration template
│   ├── devcontainer.json      # Container, mounts, extension, and port settings
│   ├── post-create.sh         # Dependencies and first-create setup
│   └── post-start.sh          # GitHub Git setup and local author identity
├── public/
│   ├── admin.html             # Administration interface markup
│   ├── admin-app.js           # Admin same-origin application script
│   ├── index.html             # Planner creation page markup
│   ├── landing-app.js         # Landing/create-planner same-origin application script
│   ├── json-api-client.js      # Shared landing/Admin JSON + transport failure normalization
│   ├── manage.html            # Personalized planner dashboard markup shell
│   ├── planner-app.js         # Planner DOM/state/API orchestration
│   ├── planner-client.js      # Planner auth, API transport + normalized failures
│   ├── planner-target-logic.js # Pure Target filtering/progress/sorting/grouping
│   ├── planner-calendar-logic.js # Pure Calendar date/month/event-grid logic
│   ├── planner-hundo-logic.js    # Pure Hundo CP/search/benchmark logic
│   ├── planner-battle-plan-logic.js # Battle Plan/resource view-model logic
│   ├── planner-battle-intel.js # Pure type-effectiveness/Battle Intel logic
│   ├── planner.css            # Planner-only responsive/feature overrides
│   ├── sources.html           # Data-source and precedence information
│   └── styles.css             # Shared base styles
├── src/
│   ├── calendar-ics.js        # Pure iCalendar parsing/date helpers
│   ├── http-security.js       # HTTP auth extraction + response hardening
│   ├── sync-health.js         # Pure per-source sync-health summarization
│   └── index.js               # Worker orchestration, APIs, routes, scheduled jobs
├── AGENTS.md                  # Persistent Codex workflow instructions
├── package.json               # npm scripts and dependency declaration
├── package-lock.json          # Reproducible dependency lock
├── schema.sql                 # D1 schema
└── wrangler.jsonc             # Worker, assets, D1, Cron, and observability
```

## Development environment

The intended layout is:

- VS Code runs natively on Windows.
- Docker Desktop runs the Linux Dev Container.
- Source remains at `C:\Projects\pokemon-go-plan`.
- That folder is bind-mounted at `/workspace` inside the container.
- Git, Node/npm, Wrangler, GitHub CLI, and Codex run inside the container.
- Native Windows Git, Node, Wrangler, Codex, and a manually operated WSL/Ubuntu shell are not required.

Use Windows PowerShell for Windows setup and the initial clone. After reopening in the Dev Container, use the **Dev Container terminal** for project commands.

## New Windows laptop or desktop setup

These instructions assume a new Windows computer with no native Git and no previous repository, GitHub CLI, or Codex authentication.

### A. Install prerequisites

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
2. Start Docker Desktop, complete its initial setup, and wait until its engine is running.
3. Install [Visual Studio Code](https://code.visualstudio.com/Download).
4. Open VS Code and press `Ctrl+Shift+X`.
5. Install Microsoft's **Dev Containers** extension from the [official marketplace page](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

Docker Desktop must be running before opening or rebuilding the Dev Container. Native Windows Git is not required.

### B. Create the local project directory

Run in **Windows PowerShell**:

```powershell
New-Item -ItemType Directory -Force C:\Projects | Out-Null
```

Do not put the repository in OneDrive or another synchronized folder.

### C. Clone without native Windows Git

The repository is public. Run in **Windows PowerShell**:

```powershell
docker run --rm -v "C:\Projects:/git" alpine/git clone https://github.com/Jquak10/pokemon-go-plan.git /git/pokemon-go-plan
```

Docker may download `alpine/git` first. The resulting files live at:

```text
C:\Projects\pokemon-go-plan
```

If the destination already exists and is not empty, stop and inspect it; do not clone over existing work.

### D. Open the repository in VS Code

Run in **Windows PowerShell** if the `code` command is available:

```powershell
code C:\Projects\pokemon-go-plan
```

Graphical alternative:

1. Open VS Code.
2. Select **File → Open Folder**.
3. Choose `C:\Projects\pokemon-go-plan`.
4. Select **Select Folder**.

If **Workspace Trust** appears or VS Code enters **Restricted Mode**, trust this repository folder before continuing.

### E. Reopen in the Dev Container

1. Confirm Docker Desktop is running.
2. Press `Ctrl+Shift+P` in VS Code.
3. Run **Dev Containers: Reopen in Container**.
4. Wait for the first build and post-create setup. The initial build may take several minutes.

The current configuration:

- Uses the Node 22 Bookworm Dev Container base image.
- Installs Git, GitHub CLI, curl, CA certificates, jq, and OpenSSH client.
- Installs pinned global Codex CLI and Wrangler versions.
- Bind-mounts the Windows repository at `/workspace`.
- Mounts named volumes at `/root/.codex` and `/root/.config/gh`.
- Automatically installs the official Codex extension, `OpenAI.chatgpt`, in the container.
- Runs `npm ci` after creation.
- Copies the Codex template only when `/root/.codex/config.toml` does not exist.
- Reapplies GitHub Git setup when already authenticated.
- On starts after authentication, supplies missing repository-local Git author fields.
- Forwards port `8787`.

Existing Codex configuration and authentication are never overwritten. GitHub and Codex authentication remain manual one-time steps on each computer.

### F. Verify the Dev Container

Open **Terminal → New Terminal**, then run in the **Dev Container terminal**:

```bash
pwd
git --version
gh --version
node --version
npm --version
wrangler --version
codex --version
git status --short
```

`pwd` must print `/workspace`. Each tool should print a version. A normal clean `git status --short` prints nothing; investigate any listed file before working.

### G. First-time GitHub authentication

Credentials are intentionally not copied between computers. Run in the **Dev Container terminal**:

```bash
gh auth login
```

Choose:

- **GitHub.com**
- **HTTPS**
- **Yes** to authenticate Git with GitHub credentials
- **Login with a web browser**

Complete the browser/device-code flow. Never paste a GitHub PAT into this README, chat, source, or a commit.

Then run:

```bash
gh auth setup-git
gh auth status
git ls-remote origin HEAD
```

Success means `gh auth status` reports the account and `git ls-remote origin HEAD` returns a commit hash and `HEAD` without prompting.

The `pogo-gh` volume persists `/root/.config/gh` across container stops and rebuilds on this computer. Deleting or pruning that volume removes the login.

### H. Configure Git commit identity

The post-start script derives missing repository-local identity after GitHub authentication. To configure or verify it immediately, run in the **Dev Container terminal**:

```bash
GITHUB_LOGIN="$(gh api user --jq .login)"
GITHUB_ID="$(gh api user --jq .id)"

git config --local user.name "$GITHUB_LOGIN"
git config --local user.email "${GITHUB_ID}+${GITHUB_LOGIN}@users.noreply.github.com"

git config --local --get user.name
git config --local --get user.email
```

This applies only to this repository. The GitHub noreply address protects the account's private email; no global Git identity is needed.

### I. First-time Codex authentication

The official Codex extension is installed automatically in the Dev Container.

1. Select the Codex icon in the VS Code Activity Bar.
2. Choose the normal account sign-in option.
3. Complete the browser/account login.
4. Return to VS Code and start a chat.

The installed CLI can also initiate its supported interactive browser/account flow:

```bash
codex
```

Do not request, document, or paste API tokens. The `pogo-codex` volume persists `/root/.codex` across stops and rebuilds on this computer. Deleting or pruning it removes authentication and local configuration.

### J. Codex permission configuration

The per-computer file is:

```text
/root/.codex/config.toml
```

It is local developer state and must not be committed. On first creation, the post-create script copies the non-secret repository template only if this file is absent.

Intended contents:

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
sandbox_mode = "workspace-write"

[projects."/workspace"]
trust_level = "trusted"

[sandbox_workspace_write]
writable_roots = ["/workspace"]
```

Meaning:

- `workspace-write` limits normal writes to approved development workspaces.
- `/workspace` is explicitly writable.
- `auto_review` reduces routine interruptions.
- `on-request` still lets higher-risk actions require escalation/review.
- `trusted` applies to this repository workspace.

Open it from the **Dev Container terminal**:

```bash
code /root/.codex/config.toml
```

Do not use unrestricted/full-access configuration. Validate afterward:

```bash
codex --help >/dev/null && echo "Codex config OK"
```

Then press `Ctrl+Shift+P`, run **Developer: Reload Window**, and start a **new Codex chat**.

### K. Confirm AGENTS.md automation

[AGENTS.md](AGENTS.md) contains persistent Codex workflow and safety instructions. Test it in a new chat without changing files:

```text
Read the repository instructions and tell me the workflow you should follow for a normal code change. Do not modify anything.
```

Codex should describe approximately:

```text
latest main
→ clean worktree check
→ feature branch
→ edit
→ validate
→ commit
→ push
→ PR
→ checks
→ stop before merge
```

If not, confirm the folder is trusted, VS Code is connected to the container, and the chat was started after reloading.

### L. Install project dependencies

Post-create runs this automatically. Rerun it after rebuilds or lock-file changes:

```bash
npm ci
```

Because `package-lock.json` is committed, `npm ci` installs the locked tree and fails when the manifest and lock disagree. It is more reproducible than `npm install`.

### M. Run locally

Run in the **Dev Container terminal**:

```bash
npm run dev
```

Open [http://localhost:8787](http://localhost:8787). The Dev Container forwards `8787` and notifies when available. If needed, use VS Code's **Ports** panel to open or forward it.

Smoke-test checklist:

- The landing page loads.
- The data-source page at `/sources` loads.
- The admin page at `/admin` loads without horizontal overflow at desktop and narrow viewport widths.
- Static styling responds at desktop and narrow viewport widths.
- Developer tools show no unexpected request or JavaScript errors.

The repository does not currently include a script that initializes the local D1 schema automatically. Planner creation, management APIs, and other D1-backed behavior require separate manual local D1 setup using `schema.sql`; runtime-secret and external-source behavior may also differ from production. Stop Wrangler with `Ctrl+C`.

### Automated regression checks

Every pull request and every push to `main` runs the deterministic Planner regression workflow. Pull requests run the Node regression suite and real Chromium browser suite; the upstream live-contract job is intentionally excluded from PR gating so an external outage or upstream drift cannot make an otherwise deterministic UI/code PR flaky. Pushes to `main`, scheduled runs, and manual workflow runs still exercise the live contract. The browser job installs Chromium in CI and the test itself starts and stops its own local fixture server, so **you do not need to start Wrangler or any other server for browser tests**.

Production availability is monitored separately by the **Production smoke** GitHub Actions workflow. It runs after pushes to `main`, can be started manually, and is scheduled every three hours. The smoke probe is intentionally read-only: it verifies the landing page, the versioned landing JavaScript asset referenced by the current repository, the public Data Sources page, and an invalid synthetic management lookup that must return the normal `401` JSON response. The API check exercises the deployed Worker and D1 lookup path without creating a planner or using a real management/calendar credential. Short retries absorb transient network or deployment overlap; a failed workflow run is the operational signal and notification delivery follows the repository owner's GitHub Actions notification settings. This production check is not a pull-request gate; its behavior is covered locally by deterministic fixture tests instead.

The browser suite protects the 768/900/1024/1179/1180/1280 responsive boundaries, intermediate-desktop text visibility, management-header credential transport, actionable non-JSON/empty/network API failure messages, asynchronous Dynamax battle-intel rendering, mobile modal containment, keyboard focus trapping/restoration, Escape handling, background isolation, reduced-motion overlay behavior, strict Planner `script-src 'self'` CSP execution, and horizontal-overflow regressions. Its Pokémon/event records are fixed regression fixtures rather than live schedule data, so a Pokémon leaving the current Raid/Max rotation does not make the test stale or flaky.

For an optional local browser run, install Playwright once in the Dev Container and then run the test directly:

```bash
python -m pip install "playwright==1.55.0"
python -m playwright install chromium
python tests/browser_ui_test.py
```

The test command starts its fixture server automatically and shuts it down when finished. GitHub Actions performs the Playwright installation automatically, so routine PR validation requires no manual browser-test setup from the user.

## Daily development workflow

Once setup is complete:

1. Start Docker Desktop.
2. Open `C:\Projects\pokemon-go-plan` in VS Code.
3. Confirm VS Code is connected to the Dev Container.
4. Start a new Codex chat.
5. Describe the desired change in plain English.

Example:

```text
Fix the mobile Targets filter drawer so its actions are never blocked by the bottom navigation.
```

For a normal change, `AGENTS.md` tells Codex to sync latest `main`, check the tree, create a feature branch, assess documentation impact, implement, update the relevant durable docs, validate, commit, push, create a PR, add the PR to the decision/change lineage when required, check it, and stop before merge. The user normally only reviews the result.

Explicitly authorize merge and cleanup with:

```text
ship it
```

Useful overrides:

```text
Investigate this only. Do not modify anything.
```

```text
Make the change and validate it, but do not commit or push.
```

```text
Make the change locally and show me the diff first.
```

## Using desktop and laptop together

GitHub is the synchronization mechanism.

- Do not synchronize the project with OneDrive.
- Do not copy Docker volumes or authentication directories between computers.
- Each machine has its own Docker volumes, GitHub login, Codex login, and local configuration.
- Merged work reaches the other machine by syncing latest `main`.

### Scenario 1: work is merged

Open the other computer and begin the next normal Codex task. `AGENTS.md` directs Codex to start from latest `origin/main`.

### Scenario 2: work is in an unfinished branch or PR

First commit and push it from the original computer. On the other computer, say:

```text
Continue work on PR #12. Fetch and use its existing remote branch. Review the current branch state before making additional changes. Do not create a duplicate branch.
```

Uncommitted changes existing only on Desktop A cannot appear on Laptop B.

## Git and PR safety

- Never develop directly on `main` or routinely run `git push origin main`.
- Use focused feature branches and PRs.
- Stage only intended files.
- Investigate unexpected working-tree changes.
- Do not blindly run `git reset --hard` or `git clean -fd`.
- Treat `main` as a production boundary because merges trigger Cloudflare.

## Production deployment

Normal production flow:

```text
feature branch
→ GitHub PR
→ merge to main
→ existing Cloudflare deployment
```

Production: [https://pogo-plan.jquak-10.workers.dev](https://pogo-plan.jquak-10.workers.dev)

Do not routinely use `wrangler deploy`. Never expose account IDs, tokens, private management URLs, private calendar URLs, or secrets.

## Secrets and private data

Never commit or paste:

- `ADMIN_KEY`
- `FEED_LINK_KEY`
- GitHub access tokens
- Cloudflare secrets/tokens
- Private management URLs
- Private ICS/calendar subscription URLs

Use platform secret storage and browser authentication. This README contains no real credential values.

## Troubleshooting

### VS Code is in Restricted Mode

Open **Workspace Trust**, trust `C:\Projects\pokemon-go-plan`, and reload.

### “Dev Containers: Reopen in Container” is missing

Install/enable Microsoft's **Dev Containers** extension in local Windows VS Code, then retry from `Ctrl+Shift+P`.

### Docker Desktop is not running

Start Docker Desktop, wait for the engine, then retry **Reopen in Container**.

### `pwd` is not `/workspace`

Reopen in the Dev Container and create a new terminal. If connected:

```bash
cd /workspace
pwd
```

### Port 8787 is not reachable

Confirm `npm run dev` is running, open VS Code's **Ports** panel, forward `8787` if absent, and open [localhost:8787](http://localhost:8787).

### GitHub CLI is not authenticated

```bash
gh auth login
gh auth status
```

Use GitHub.com, HTTPS, and browser login.

### `git push` asks for credentials

```bash
gh auth status
gh auth setup-git
git ls-remote origin HEAD
```

Log in first if needed; never paste a token into chat.

### Git reports “Author identity unknown”

Run the repository-local commands in [Configure Git commit identity](#h-configure-git-commit-identity), then verify with `git config --local --get user.name` and `git config --local --get user.email`.

### Codex authentication disappeared after volume pruning

The `pogo-codex` volume holds `/root/.codex`. Sign in again through the official extension or CLI browser/account flow, then check `config.toml`.

### GitHub authentication disappeared after volume pruning

The `pogo-gh` volume holds `/root/.config/gh`. Run `gh auth login` and `gh auth setup-git` again.

### Codex repeatedly asks for routine permissions

Compare `/root/.codex/config.toml` with this README, validate with `codex --help >/dev/null && echo "Codex config OK"`, reload the window, and start a new chat. Do not grant unrestricted access.

### Codex reports a config parse error

Restore the reviewed non-secret settings from `.devcontainer/codex-config.toml`, checking quotes, table headers, and brackets. Do not overwrite intentional local changes without reviewing them.

### Git shows CRLF/LF warnings

`.gitattributes` normalizes text to LF. Inspect the diff and ensure it contains real content changes rather than whole-file line-ending churn.

### The working tree is unexpectedly dirty

```bash
git status --short
git diff --name-only
git diff
```

Identify every change. Do not reset, clean, stash, overwrite, or delete unexplained work.

### Stop `npm run dev`

Focus its terminal and press `Ctrl+C`.

### Rebuild the Dev Container

Save understood work, inspect `git status --short`, then press `Ctrl+Shift+P` and run **Dev Containers: Rebuild Container**. Repeat verification afterward. Named volumes survive rebuilds, but not Docker volume pruning.

## Rebuilding or moving to a new computer checklist

- [ ] Install and start Docker Desktop.
- [ ] Install VS Code and Microsoft's Dev Containers extension.
- [ ] Create `C:\Projects`.
- [ ] Clone with Docker and `alpine/git`.
- [ ] Open and trust `C:\Projects\pokemon-go-plan`.
- [ ] Reopen in the Dev Container.
- [ ] Verify tools and `pwd=/workspace`.
- [ ] Run `gh auth login`, `gh auth setup-git`, and verify access.
- [ ] Configure or verify repository-local Git identity.
- [ ] Sign in to Codex through browser/account login.
- [ ] Inspect `/root/.codex/config.toml`.
- [ ] Reload VS Code and start a new Codex chat.
- [ ] Verify `AGENTS.md` behavior with the read-only prompt.
- [ ] Run `npm ci`.
- [ ] Run `npm run dev`.
- [ ] Confirm [localhost:8787](http://localhost:8787) works.
- [ ] Ready for normal Codex-assisted development.

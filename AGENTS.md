# Pokémon GO Planner — Codex Instructions

Repository: Jquak10/pokemon-go-plan
Production branch: main
Hosting: Cloudflare Workers + D1
Production URL: https://pogo-plan.jquak-10.workers.dev

## Default operating mode

When the user requests a code or UI change, handle the complete development workflow automatically unless the user explicitly asks for review-only or analysis-only work.

Do not require the user to manually perform routine Git, validation, push, or PR steps.

## Before changing anything

1. Confirm this is the `Jquak10/pokemon-go-plan` repository.
2. Check `git status --porcelain`.
3. If unexplained pre-existing changes are present, STOP and report them. Never discard, reset, overwrite, stash, or commit unexplained user work.
4. For normal new work, start from the newest GitHub `main`:
   - `git switch main`
   - `git fetch origin`
   - `git pull --ff-only origin main`
5. If the user explicitly asks to continue an existing branch or pull request from another
   computer, fetch and check out that existing remote branch or PR instead of creating a new
   branch.
6. Otherwise, create a new descriptive feature branch before editing:
   - `fix/<short-description>` for fixes
   - `feat/<short-description>` for features
   - `chore/<short-description>` for maintenance
   - `docs/<short-description>` for documentation

Never make development commits directly on `main`.

## Source of truth

Always work from the newest repository contents.

Never use an older generated ZIP, patch, copied file, or stale implementation as source of truth when newer GitHub code exists.

Before architectural or product-behavior work, read:

- docs/ARCHITECTURE.md for the current system architecture, invariants, data model, battle/resource semantics, event precedence, UI architecture, and development guardrails.
- docs/DECISIONS.md for the historical decision record, superseded choices, and PR lineage.
- docs/BACKLOG.md for confirmed unshipped work, verified technical debt, and explicitly deferred/not-planned ideas.

If older README text, PR text, backlog text, or chat history conflicts with current architecture, follow newest main first, then docs/ARCHITECTURE.md. Use docs/DECISIONS.md to understand why a previous design was replaced. Use docs/BACKLOG.md only for unshipped work; newest explicit user direction outranks backlog entries.

## Documentation impact and change logging

Documentation is part of the definition of done for every feature, improvement, bug fix, refactor, migration, maintenance change, and workflow change. Do not rely on chat history to preserve what changed.

For every change, perform a documentation-impact assessment before committing and update the relevant files in the same branch/PR:

- `docs/DECISIONS.md` — **mandatory for every product improvement and bug fix**. Add a compact factual PR-lineage entry once the PR number exists. Add or update an ADR when the change introduces, changes, or supersedes a durable design decision. A routine fix that restores an existing invariant usually needs a lineage entry, not a new ADR.
- `docs/ARCHITECTURE.md` — update whenever current behavior, invariants, data model, data flow, APIs, battle/resource semantics, event precedence, security, operational topology, or mobile/desktop architecture changes, or when a bug fix clarifies an invariant that future work must preserve.
- `README.md` — update whenever user-visible behavior, features, setup, usage, migrations, deployment/operator steps, or developer workflow changes.
- `AGENTS.md` — update whenever repository development automation, validation, PR, documentation, or release policy changes.
- `docs/BACKLOG.md` — update whenever confirmed future work, verified technical debt, or deferred/not-planned status changes. When a backlog item ships, remove it from Active/Deferred in the same PR and record the shipped result in `docs/DECISIONS.md`. Do not promote speculative assistant suggestions into active backlog requirements.

Do not churn unrelated documentation merely to satisfy a checklist. If one of the files above is not relevant, leave it unchanged and state why in the PR documentation-impact summary. However, a product improvement or bug fix may not claim "no documentation impact" because its change-history entry in `docs/DECISIONS.md` is required.

Documentation workflow:

1. Assess documentation and backlog impact before implementation.
2. Check `docs/BACKLOG.md` for a related item and update/remove it when the work changes its status.
3. Update current-behavior documentation while making the code/product change.
4. Create the PR.
5. Once the PR number exists, add/update its entry in the `docs/DECISIONS.md` PR lineage on the same branch and push that follow-up before the PR is considered ready.
6. Re-check the documentation and backlog after final code changes so they describe the shipped behavior and remaining work rather than an intermediate implementation.

## Implementation rules

Make the smallest safe change that satisfies the request.

Preserve existing working functionality.

Do not modify these unless the task explicitly requires it:

- `wrangler.jsonc`
- D1 bindings
- Worker routes
- Cron triggers
- secrets
- Service Bindings
- deployment configuration
- schema or migrations
- package/dependency configuration

Never replace `wrangler.jsonc` with a generic starter.

Never request, expose, print, or commit:

- ADMIN_KEY
- FEED_LINK_KEY
- GitHub tokens
- Cloudflare secrets
- private management URLs
- private ICS/calendar URLs

If `public/styles.css` changes, bump the CSS cache/version reference used by the app.

For Pokémon forms and sprites, never knowingly substitute the wrong form. No sprite is preferable to an incorrect one.

## Validation

After editing:

1. Inspect `git status --short`.
2. Inspect `git diff --name-only`.
3. Run `git diff --check`.
4. Run appropriate syntax checks for every changed JavaScript file.
5. Run relevant existing automated tests/checks.
6. Run targeted behavioral checks appropriate to the change.
7. For UI/responsive changes, require the PR's automated Chromium `browser-ui` job to pass. Treat deterministic/unit/browser checks as PR gates; do not make an external live-contract check a required PR gate because upstream availability can fail independently of the branch. The browser regression test starts/stops its own fixture server; never ask the user to manually start Wrangler or another server just to satisfy this test. Keep browser fixtures deterministic and independent of the live Pokémon/event rotation; update them only when the product contract they encode intentionally changes.
8. Use `npm run dev` / local Worker testing when the change affects runtime behavior and a separate local smoke test is useful.
9. Confirm no unrelated files changed.
10. Confirm protected Cloudflare/D1/deployment files did not change unless explicitly required.

If validation fails, diagnose and fix it before continuing.

Do not commit known-broken code.

## Commit workflow

Once validation succeeds:

1. If repository-local Git author name or email is missing and GitHub CLI is authenticated,
   derive the missing identity from the authenticated GitHub account and configure it locally
   for this repository.
2. Stage only the intended files. Avoid broad `git add .` when specific files can be named.
3. Re-run:
   - `git diff --cached --check`
   - `git diff --cached --name-only`
4. Create a concise conventional commit message.
5. Confirm the worktree is clean after the commit.

## Production `main` enforcement

The GitHub repository must enforce the production branch policy with an **active branch ruleset** targeting the default branch (`main`).

Required rules:

- Require a pull request before merging. This repository may use 0 required approving reviews because it is maintained as a single-owner project; the PR boundary itself is mandatory.
- Require status checks to pass before merging:
  - `deterministic`
  - `browser-ui`
- Do **not** require `live-contract` on pull requests. It intentionally does not run for `pull_request` events because external Pokémon/event availability can fail independently of a branch.
- Do not require branches to be up to date before merging unless the repository policy is deliberately changed later. The required deterministic/browser checks must still pass on the PR head used for merge.
- Restrict deletion of `main`.
- Block force pushes to `main`.
- Do not add a routine administrator/owner bypass. Emergency bypass should require an explicit temporary ruleset change with the reason documented.

If a required job name changes, update the GitHub ruleset in the same maintenance change. A green workflow run is not sufficient if GitHub is no longer enforcing these checks.

Verification:

- the public branch endpoint for `main` must report `protected: true`;
- a ruleset/branch-protection view in GitHub Settings must show PR enforcement plus required `deterministic` and `browser-ui` checks;
- `live-contract` must remain non-required;
- force pushes and deletion must remain blocked.

## GitHub workflow

After a successful commit:

1. Push only the current feature branch.
2. Never push directly to `main`.
3. Create a pull request targeting `main`.
4. PR title should match the intent of the change.
5. PR body should summarize:
   - what changed
   - validation performed
   - files/components affected
   - whether D1 migration is required
   - whether CSS cache version changed
   - whether `wrangler.jsonc`, bindings, routes, Cron, secrets, or deployment configuration changed
   - documentation/backlog impact: which of `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/BACKLOG.md`, `README.md`, and `AGENTS.md` changed, plus why any relevant file did not
6. After the PR number exists, ensure `docs/DECISIONS.md` contains the PR-lineage entry required by the documentation policy.
7. Check PR checks/status.

If checks fail, investigate and fix them on the same feature branch.

## Default stopping point

Unless the user explicitly says to merge, deploy, or "ship it":

STOP after the PR is ready and checks are passing.

Report:

- branch
- commit
- PR
- files changed
- tests/validation performed
- D1 migration required: yes/no
- CSS cache bump required/performed: yes/no
- deployment configuration changed: yes/no
- documentation updated: files + impact summary
- any remaining risks or manual verification needed

Do not merge to `main` automatically.

## "Ship it" workflow

If the user explicitly says `ship it`, `merge it`, or clearly authorizes production:

1. Confirm the PR still targets `main`.
2. Confirm required checks pass.
3. Confirm the PR contains only intended changes.
4. Confirm the documentation/backlog-impact assessment is complete, any affected backlog item is current, and the PR is recorded in `docs/DECISIONS.md` when required.
5. Merge using the repository's normal safe merge method.
6. Do not run a manual `wrangler deploy` unless explicitly required.
7. Switch local checkout back to `main`.
8. Fetch and fast-forward to `origin/main`.
9. Remove the completed local feature branch if safe.
10. Confirm the working tree is clean.
11. Verify the existing GitHub → Cloudflare deployment flow where possible.
12. Perform an appropriate production smoke check where possible.

## Safety

Never use destructive Git cleanup such as:

- `git reset --hard`
- `git clean -fd`
- restoring unexplained user changes
- force-pushing

unless the user explicitly requests it and the consequences are understood.

Treat Remote/production credentials and private calendar URLs as secrets.

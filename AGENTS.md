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
4. Start from the newest GitHub `main`:
   - `git switch main`
   - `git fetch origin`
   - `git pull --ff-only origin main`
5. Create a new descriptive feature branch before editing:
   - `fix/<short-description>` for fixes
   - `feat/<short-description>` for features
   - `chore/<short-description>` for maintenance
   - `docs/<short-description>` for documentation

Never make development commits directly on `main`.

## Source of truth

Always work from the newest repository contents.

Never use an older generated ZIP, patch, copied file, or stale implementation as source of truth when newer GitHub code exists.

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
7. Use `npm run dev` / local Worker testing when the change affects runtime behavior and a local smoke test is useful.
8. Confirm no unrelated files changed.
9. Confirm protected Cloudflare/D1/deployment files did not change unless explicitly required.

If validation fails, diagnose and fix it before continuing.

Do not commit known-broken code.

## Commit workflow

Once validation succeeds:

1. Stage only the intended files. Avoid broad `git add .` when specific files can be named.
2. Re-run:
   - `git diff --cached --check`
   - `git diff --cached --name-only`
3. Create a concise conventional commit message.
4. Confirm the worktree is clean after the commit.

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
6. Check PR checks/status.

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
- any remaining risks or manual verification needed

Do not merge to `main` automatically.

## "Ship it" workflow

If the user explicitly says `ship it`, `merge it`, or clearly authorizes production:

1. Confirm the PR still targets `main`.
2. Confirm required checks pass.
3. Confirm the PR contains only intended changes.
4. Merge using the repository's normal safe merge method.
5. Do not run a manual `wrangler deploy` unless explicitly required.
6. Switch local checkout back to `main`.
7. Fetch and fast-forward to `origin/main`.
8. Remove the completed local feature branch if safe.
9. Confirm the working tree is clean.
10. Verify the existing GitHub → Cloudflare deployment flow where possible.
11. Perform an appropriate production smoke check where possible.

## Safety

Never use destructive Git cleanup such as:

- `git reset --hard`
- `git clean -fd`
- restoring unexplained user changes
- force-pushing

unless the user explicitly requests it and the consequences are understood.

Treat Remote/production credentials and private calendar URLs as secrets.
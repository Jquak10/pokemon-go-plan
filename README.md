# Pokémon GO Planner

Pokémon GO Planner is a private, personalized raid-planning and calendar application. It combines current event schedules, raid and meta data, personal targets, and Remote Raid preferences to help each user decide what is worth raiding.

**Production app:** [https://pogo-plan.jquak-10.workers.dev](https://pogo-plan.jquak-10.workers.dev)

Each planner receives a private management link and a separate read-only iCalendar (ICS) subscription link. Keep both private; anyone with the management link can change that planner.

## What the app does

The planner brings the decisions that normally live in several places into one dashboard: what is currently available, how valuable each raid is, which Pokémon matter to you, how much progress remains, and whether another paid Remote Raid is worthwhile. It also provides a personal event calendar and a private calendar subscription.

Create a planner with your timezone, save its private management link, and then tailor its Targets, recommendation weights, Remote Raid limits, and event filters. The Raid Plan updates from those choices and from the raids you log.

## Features

- Personalized raid recommendations based on event availability, shared meta scores, user-defined weights, targets, progress, and priority.
- Remote Raid planning that treats official limits and an optional personal budget as ceilings, not spending targets.
- Local and Remote Raid logging, recent activity, undo support, Remote Raid usage tracking, and optional target-progress updates.
- Targets for Mega Energy, raid counts, Candy XL, Candy, and custom goals, with priority, progress, notes, completion state, search, filters, and card/list views.
- A Hundo CP calculator for the loaded Pokémon GO Pokédex, common encounter levels, and custom levels.
- A live month calendar and private ICS feed with user-selectable event categories.
- GO Calendar data, higher-priority official Pokémon GO schedule supplements, and suppression rules.
- Automated PvPoke Master League data and Pokémon GO API-based analytical inputs, with visible source precedence and freshness.
- Responsive desktop and mobile interfaces.
- Administration views for synchronization, official raid supplements, Remote Raid limits, suppressions, and raid assessments.
- Capability-link access without a conventional email/password account.

The project is independent and is not affiliated with Niantic, The Pokémon Company, Nintendo, or GAME FREAK.

## Using the app

### Create or open a planner

1. Open the [production app](https://pogo-plan.jquak-10.workers.dev).
2. Enter a timezone. It controls local event dates, temporary event limits, and when daily Remote Raid usage resets.
3. Select **Create my planner**.
4. Save the **Management link** somewhere private. It is the sign-in link for that planner.
5. Save the separate calendar link only in a trusted calendar client.

There is no email/password recovery flow. Someone who has the management link can change the planner's targets and settings.

### Raid Plan

The **Raid Plan** tab combines today's limits, activity, recommendations, and future opportunities:

- **Remote Raid Plan** shows the **Official limit**, the forward-looking **Planner budget**, **Today's ceiling**, and **Official remaining** after already logged Remote Raids.
- **Today's planning capacity** divides capacity into **Used**, **Recommended**, and **Left unused**. Unused capacity is intentional when available bosses do not meet the configured value threshold.
- **Paid Raid Budget Forecast** previews recommended paid-raid budgets for the next seven days and recalculates as targets or progress change.
- **Today's Raid Activity** separates Remote, Local, and total logged raids.
- **What to raid now** displays current raid recommendations. Each card can include its score and label, Remote Raid allocation, source, weaknesses, 100% IV encounter CP, battle details, and a **Why?** explanation.
- The first recommendations appear directly; **More raid recommendations** expands the rest. **Bosses receiving 0 Remote Raids** explains exclusions from paid allocation.

Recommendations combine current event availability with PvE, PvP, rarity/collection, and Mega utility inputs, plus personal targets and saved preference weights. A high recommendation score is evidence for consideration, not an instruction to spend a pass. The allocation badge is specifically for Remote Raids; Local raids are logged and counted separately.

### Remote Raid planning

Remote limits are always ceilings, not goals:

- **Official remaining** is the official daily capacity minus Remote Raids already logged.
- **Planner budget** is the planner's forward-looking recommendation.
- **Today's ceiling** applies automatic planning, the saved **Usual personal ceiling**, or a one-day override without exceeding the official game limit.
- Allocations stop when a boss's marginal value falls below the saved **Minimum Remote Raid score**.
- Completed or skipped targets receive zero paid Remote Raid allocation. Target priority, remaining progress, expected progress per raid, and current availability can change the recommendation.

Open **Planner controls & manual corrections** on the Raid Plan to use:

- **Today's budget override** and **Save override** for a one-day ceiling.
- **Use Auto** to remove that override.
- **Remote Raids used today · manual correction** for raids completed before using the logger or to correct the counter.

Logging a Remote Raid normally updates the usage counter automatically. Logging a Local raid does not consume Remote Raid capacity.

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

Each target card shows progress, availability, priority/completion, and expected progress per raid when present. Use **Edit** to change values or set **Completed?** to Yes. Completed targets stay visible through **Completed** or **All** and receive zero paid Remote Raid allocations. The overflow menu provides **Delete target**.

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

Search and calculations are form-specific. On raid recommendation cards, the app distinguishes the raid battle form from the catch encounter: Mega, Primal, Gigantamax, and Dynamax prefixes are removed when resolving the base-form catch encounter. Mega or Primal raid-boss stats therefore are not used as the base-form catch CP.

### Calendar

The **Calendar** tab has two related views:

- **Calendar Subscription** prepares one private, read-only **PREFERRED SUBSCRIPTION URL** for Apple Calendar, Google Calendar, Outlook, Spark, and compatible iCalendar clients. Select a client in **Where do you want to subscribe?** for its current instructions.
- **MONTH VIEW** shows the same selected event categories and personalized titles as the subscription. Use the previous/next controls or **Today**, then select a date to inspect its events.

Expand **Choose which event categories appear**, select the desired categories, and choose **Save calendar filters**. The dashboard preview updates immediately; calendar clients poll the ICS feed on their own schedules.

Treat the private calendar URL like a bearer credential: anyone who has it can read the calendar. Do not share it, paste it into chat, or commit it. The **Moving from an older calendar URL?** section explains migration; **Revoke legacy URL** invalidates older token links but does not change the preferred signed subscription.

### Preferences

The **Preferences** tab contains:

- **Raid / PvE importance**, **PvP importance**, and **Rarity / collection importance** sliders. A value of zero ignores that factor.
- **Usual personal ceiling**, an optional normal maximum for paid Remote Raids.
- **Minimum Remote Raid score**, below which the planner stops allocating paid Remote Raids.
- **Timezone**, which controls local event dates and the daily Remote Raid reset.

Select **Save preferences** after making changes. These settings can make the plan more conservative but cannot raise the official game limit.

### Management and administration

The management dashboard is accessed through each planner's private capability link. It controls that planner's Raid Plan, targets, logs, preferences, and calendar; it is not a public account profile.

The separate **Planner Admin** interface is for authorized maintainers. It can run and inspect event, official-schedule, Remote-limit, suppression, and raid-assessment synchronization. Its data actions require the configured admin credential. Never share that credential or include it in a URL, README, issue, log, commit, or chat.

The public **Data Sources & Precedence** page explains why explicit official schedules take priority over suppression/replacement notices and general GO Calendar data, and identifies the analytical inputs used for raid value.

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

- On wide desktop screens, the planner uses fixed left-side navigation and a sticky **Quick status** rail with top priority, activity totals, **+ Log raid**, quick search, and a **Compact density** toggle. Targets also offer **Cards** and **Compact list**.
- Tablet widths use segmented navigation above the content.
- Mobile uses a fixed bottom navigation for **Raid Plan**, **Targets**, **Hundo CP**, **Calendar**, and **More**. **Preferences** and **Data sources** are in the **More options** sheet.
- Mobile provides a floating **+ Log raid** action, presents the raid logger as a bottom sheet, and moves advanced Target filters into the **Organize targets** drawer.
- On mobile, **More levels** expands the additional Hundo benchmarks, and Calendar day details flow beneath the month view.

## Technology and architecture

- **Cloudflare Workers** runs the backend and serves static frontend assets.
- **Cloudflare D1** stores planners, targets, events, meta data, Remote Raid usage, and limit overrides.
- **Static frontend files** in `public/` provide the landing page, planner, administration, data-source, and responsive UI.
- **Worker code** in `src/index.js` implements APIs, private routes, scheduled synchronization, recommendations, and asset routing.
- **Cron Triggers** run separate event, official Remote Raid limit, and automatic meta synchronization jobs every six hours.
- **GitHub and Cloudflare** provide the production path: feature branch → PR → `main` → the existing Cloudflare deployment pipeline.
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
│   ├── admin.html             # Administration interface
│   ├── index.html             # Planner creation page
│   ├── manage.html            # Personalized planner dashboard
│   ├── sources.html           # Data-source and precedence information
│   └── styles.css             # Shared responsive styles
├── src/index.js               # Worker, APIs, routes, and scheduled jobs
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
- Static styling responds at desktop and narrow viewport widths.
- Developer tools show no unexpected request or JavaScript errors.

The repository does not currently include a script that initializes the local D1 schema automatically. Planner creation, management APIs, and other D1-backed behavior require separate manual local D1 setup using `schema.sql`; runtime-secret and external-source behavior may also differ from production. Stop Wrangler with `Ctrl+C`.

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

For a normal change, `AGENTS.md` tells Codex to sync latest `main`, check the tree, create a feature branch, implement, validate, commit, push, create a PR, check it, and stop before merge. The user normally only reviews the result.

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

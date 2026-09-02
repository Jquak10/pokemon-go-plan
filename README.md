# Pokémon GO Planner

Pokémon GO Planner is a private, personalized raid-planning and calendar application hosted at [pogo-plan.jquak-10.workers.dev](https://pogo-plan.jquak-10.workers.dev). It combines current event schedules, raid and meta data, personal targets, and Remote Raid preferences to help each user decide what is worth raiding.

Each planner receives a private management link and a separate read-only iCalendar (ICS) subscription link. Keep both private; anyone with the management link can change that planner.

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

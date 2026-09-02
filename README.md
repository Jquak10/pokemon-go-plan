# Pokémon GO Personal Calendar — Cloudflare Worker starter

A multi-user personalized Pokémon GO iCalendar service.

## What it does

- Pulls GO Calendar event-category feeds on a six-hour Cloudflare Cron Trigger.
- Stores normalized event data in Cloudflare D1.
- Gives each subscriber a unique management URL and separate `.ics` subscription URL.
- Lets each subscriber choose event categories.
- Lets each subscriber track targets such as Mega Energy, raid count, Candy XL or Candy.
- Lets each subscriber update progress from a browser dashboard.
- Generates personalized recommendations from:
  - shared internet/meta scores in `pokemon_meta`
  - automatically refreshed PvPoke Master League score where a name matches
  - each user's own target, progress and priority
- Generates dynamic ICS feeds for Apple Calendar.

## Default subscriber filters

Enabled:
- Community Day
- General Events
- Max Battles
- Max Mondays
- Pokémon GO Fest
- Spotlight Hour
- Raid Battles
- Raid Day
- Raid Hour
- Research

Disabled by default:
- GO Battle League
- GO Pass
- Season

Every subscriber can change their own filters.

## Important MVP limitation

The event sync is automatic.

PvP scores for Pokémon already present in `pokemon_meta` are automatically refreshed from
PvPoke's public GitHub ranking JSON.

PvE/rarity/Mega/general value scores are deliberately admin-curated in this starter rather
than scraping third-party sites without verifying their allowed automated-use terms. Use
`/admin` to enter current scores and attach source URLs. The data model is designed so a
permitted automated PvE source adapter can replace this later without changing subscriber
accounts or calendar URLs.

## Development environment

The source remains on Windows at `C:\Projects\pokemon-go-plan`, while development tools run
in the Docker VS Code Dev Container at `/workspace`. Git, Node/npm, Wrangler, GitHub CLI and
Codex all run inside the container.

Install dependencies and start local development from `/workspace`:

```sh
npm ci
npm run dev
```

The local Worker is available at `http://localhost:8787`.

For normal development, use a feature branch and open a pull request rather than pushing
directly to `main`. Production deployment remains the existing GitHub `main` → Cloudflare
workflow.

### Dev Container Quick Check

After opening or rebuilding the Dev Container, use these commands to verify the environment:

```bash
pwd
git status --short
gh auth status
node --version
npm --version
wrangler --version
codex --version
```

`pwd` should report `/workspace`, and `git status --short` should normally be empty before
starting new work.

## Cloudflare setup

1. Create a D1 database named `pokemon-go-calendar-db`.
2. Run `schema.sql` against it in the D1 console.
3. Copy the D1 database ID into `wrangler.jsonc`.
4. Connect the GitHub repository in Workers & Pages > Create application > Import a repository.
5. Keep deploy command `npx wrangler deploy`.
6. Add a runtime secret named `ADMIN_KEY`.
7. Deploy.
8. Open `/admin` and run the first event sync.
9. Open `/` and create a test subscriber.
10. Subscribe to the generated `.ics` URL from Apple Calendar.

## Security

The starter uses unguessable capability URLs rather than email/password accounts:
- management token: can modify a subscriber's settings
- feed token: read-only calendar feed

Only SHA-256 hashes of those tokens are stored in D1.

There is no management-link recovery in this starter. Add email magic-link login later if you
need recovery or cross-device account management.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relative =>
  readFileSync(
    new URL(
      `../${relative}`,
      import.meta.url
    ),
    "utf8"
  );

const packageJson =
  JSON.parse(
    read("package.json")
  );

const packageLock =
  JSON.parse(
    read("package-lock.json")
  );

const workflow =
  read(
    ".github/workflows/raid-ranking-regression.yml"
  );

const productionSmokeWorkflow =
  read(
    ".github/workflows/production-smoke.yml"
  );

const productionSmokeScript =
  read(
    "tests/production-smoke.mjs"
  );

const gitignore =
  read(".gitignore");

const workerCheck =
  packageJson.scripts?.[
    "check:worker"
  ] || "";

assert.match(
  workerCheck,
  /\bwrangler deploy\b/
);
assert.match(
  workerCheck,
  /--dry-run\b/,
  "Worker packaging validation must never perform a live deploy"
);
assert.match(
  workerCheck,
  /--outdir\s+\.wrangler\/ci-dry-run\b/,
  "Worker dry-run output must stay in the ignored .wrangler directory"
);
assert.match(
  gitignore,
  /^\.wrangler\/$/m,
  "Wrangler CI output must remain gitignored"
);

const deterministic =
  workflow.match(
    /^  deterministic:\n([\s\S]*?)(?=^  browser-ui:)/m
  )?.[1] || "";

assert.ok(
  deterministic,
  "CI must contain the deterministic PR gate"
);

const installIndex =
  deterministic.indexOf(
    "run: npm ci"
  );
const testIndex =
  deterministic.indexOf(
    "run: npm test"
  );
const packageIndex =
  deterministic.indexOf(
    "run: npm run check:worker"
  );

assert.ok(
  installIndex >= 0,
  "Deterministic CI must install dependencies with npm ci"
);
assert.ok(
  testIndex > installIndex,
  "npm ci must run before the test suite"
);
assert.ok(
  packageIndex > testIndex,
  "Worker packaging validation must run after the test suite"
);
assert.match(
  deterministic,
  /actions\/setup-node@v4[\s\S]*cache:\s*npm/,
  "Deterministic CI should reuse npm's lockfile-aware cache"
);

assert.equal(
  packageLock.lockfileVersion,
  3,
  "Repository dependency installation must remain lockfile-backed"
);
assert.equal(
  packageLock.packages?.[""]
    ?.devDependencies
    ?.wrangler,
  packageJson.devDependencies
    ?.wrangler,
  "package.json and package-lock.json must agree on the Wrangler dependency range"
);

const installedWrangler =
  packageLock.packages?.[
    "node_modules/wrangler"
  ]?.version;

assert.match(
  String(
    installedWrangler || ""
  ),
  /^\d+\.\d+\.\d+$/,
  "package-lock.json must pin an installed Wrangler version"
);

assert.match(
  workflow,
  /^  live-contract:\n\s+if: github\.event_name != 'pull_request'/m,
  "The external live-contract job must remain non-blocking on pull requests"
);

assert.match(
  productionSmokeWorkflow,
  /^name: Production smoke$/m,
  "Production monitoring must remain a distinct workflow"
);
assert.match(
  productionSmokeWorkflow,
  /^  push:\n\s+branches:\n\s+- main$/m,
  "Production smoke must run after main changes"
);
assert.match(
  productionSmokeWorkflow,
  /^  schedule:\n\s+- cron: "41 \*\/3 \* \* \*"$/m,
  "Production smoke must retain its three-hour schedule"
);
assert.match(
  productionSmokeWorkflow,
  /^  workflow_dispatch:$/m,
  "Production smoke must remain manually runnable"
);
assert.match(
  productionSmokeWorkflow,
  /^permissions:\n\s+contents: read$/m,
  "Production smoke must keep read-only GitHub permissions"
);
assert.match(
  productionSmokeWorkflow,
  /node tests\/production-smoke\.mjs/,
  "Production smoke workflow must execute the repository-owned smoke probe"
);
assert.doesNotMatch(
  productionSmokeWorkflow,
  /\$\{\{\s*secrets\./,
  "Production smoke must not depend on repository secrets"
);
assert.doesNotMatch(
  productionSmokeScript,
  /\/api\/create|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
  "Production smoke must never create or mutate planner state"
);
assert.match(
  productionSmokeScript,
  /\/api\/me/,
  "Production smoke must exercise a Worker API route"
);
assert.match(
  productionSmokeScript,
  /bl-036-production-smoke-invalid/,
  "Production smoke must use only its synthetic invalid management token"
);
assert.match(
  productionSmokeScript,
  /SYNTHETIC_MANAGE_PATH/,
  "Production smoke must exercise the synthetic private Planner shell"
);
assert.match(
  productionSmokeScript,
  /versionedLocalAssets/,
  "Production smoke must derive Planner assets from the repository shell"
);
assert.match(
  productionSmokeScript,
  /theme\\.js\\\?v=/,
  "Production smoke must keep the theme initializer in the critical Planner asset contract"
);
assert.match(
  productionSmokeScript,
  /planner\\.css\\\?v=/,
  "Production smoke must keep Planner-specific CSS in the critical asset contract"
);
assert.match(
  productionSmokeScript,
  /planner-app\\.js\\\?v=/,
  "Production smoke must keep the main Planner JavaScript in the critical asset contract"
);

console.log(
  "CI dependency-install, Worker packaging, and production smoke checks passed."
);

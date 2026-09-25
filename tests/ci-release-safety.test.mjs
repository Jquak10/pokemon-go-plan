import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import workerApp from "../src/index.js";

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

const wranglerConfig =
  JSON.parse(
    read("wrangler.jsonc")
  );

const staticHeaders =
  read("public/_headers");

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
  /actions\/setup-node@v7[\s\S]*cache:\s*npm/,
  "Deterministic CI should reuse npm's lockfile-aware cache"
);

assert.equal(
  packageJson.type,
  "module",
  "Repository .js modules must stay explicitly ESM to avoid MODULE_TYPELESS_PACKAGE_JSON reparsing warnings"
);

const workflowSources = [
  ["Planner regression", workflow],
  ["Production smoke", productionSmokeWorkflow]
];

for (const [
  workflowName,
  source
] of workflowSources) {
  const actionRefs = [
    ...source.matchAll(
      /uses:\s+(actions\/(?:checkout|setup-node|setup-python))@v(\d+)\b/g
    )
  ];

  assert.ok(
    actionRefs.length > 0,
    `${workflowName} must use GitHub first-party setup actions`
  );

  for (const [
    ,
    action,
    major
  ] of actionRefs) {
    assert.ok(
      Number(
        major
      ) >= 7,
      `${workflowName} must not downgrade ${action} to a pre-v7 runtime`
    );
  }
}

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

const workerFirstRoutes =
  wranglerConfig.assets
    ?.run_worker_first;

assert.ok(
  Array.isArray(
    workerFirstRoutes
  ),
  "Static-asset routing must keep selective Worker-first patterns instead of invoking the Worker for every asset"
);

assert.equal(
  wranglerConfig.assets
    ?.html_handling,
  "auto-trailing-slash",
  "Static HTML aliases must preserve Cloudflare's canonical extensionless redirects"
);

for (const path of [
  "/api/*",
  "/calendar/*",
  "/admin",
  "/manage/*"
]) {
  assert.ok(
    workerFirstRoutes.includes(
      path
    ),
    `Worker-first routing must preserve dynamic/private route ${path}`
  );
}

for (const path of [
  "/",
  "/sources",
  "/manage"
]) {
  assert.equal(
    workerFirstRoutes.includes(
      path
    ),
    false,
    `Asset-first public HTML path ${path} must rely on public/_headers instead of billable Worker-first routing`
  );
}

const requiredStaticHtmlHeaderBlocks = [
  {
    route: "/",
    noStore: false
  },
  {
    route: "/sources",
    noStore: false
  },
  {
    route: "/help",
    noStore: false
  },
  {
    route: "/admin",
    noStore: true
  },
  {
    route: "/manage",
    noStore: true
  }
];

for (const {
  route,
  noStore
} of requiredStaticHtmlHeaderBlocks) {
  const marker =
    `${route}\n`;
  const startIndex =
    staticHeaders.indexOf(
      marker
    );

  assert.ok(
    startIndex >= 0,
    `public/_headers must define ${route}`
  );

  const remainder =
    staticHeaders.slice(
      startIndex +
        marker.length
    );
  const nextRouteIndex =
    remainder.search(
      /\n\/[A-Za-z0-9_-]*\n/
    );
  const block =
    nextRouteIndex >= 0
      ? remainder.slice(
          0,
          nextRouteIndex
        )
      : remainder;

  const csp =
    block.match(
      /Content-Security-Policy:\s*([^\n]+)/
    )?.[1] || "";
  const scriptDirective =
    csp
      .split(";")
      .map(
        directive =>
          directive.trim()
      )
      .find(
        directive =>
          directive.startsWith(
            "script-src"
          )
      ) || "";

  assert.equal(
    scriptDirective,
    "script-src 'self'",
    `${route} must enforce the strict external-script CSP through Static Assets`
  );

  for (const expected of [
    "Referrer-Policy: no-referrer",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Resource-Policy: same-origin"
  ]) {
    assert.ok(
      block.includes(
        expected
      ),
      `${route} static headers must include ${expected}`
    );
  }

  if (noStore) {
    assert.match(
      block,
      /Cache-Control: private, no-store, max-age=0/,
      `${route} static HTML must remain no-store`
    );
  }
}

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

const assetFetches = [];

const securityEnv = {
  ASSETS: {
    async fetch(request) {
      assetFetches.push(
        new URL(
          request.url
        ).pathname
      );

      return new Response(
        "<!doctype html><title>Fixture</title>",
        {
          status: 200,
          headers: {
            "content-type":
              "text/html; charset=utf-8"
          }
        }
      );
    }
  }
};

for (const {
  requestPath,
  expectedAssetPath,
  noStore
} of [
  {
    requestPath: "/",
    expectedAssetPath: "/",
    noStore: false
  },
  {
    requestPath: "/sources",
    expectedAssetPath: "/sources",
    noStore: false
  },
  {
    requestPath: "/admin",
    expectedAssetPath: "/admin",
    noStore: true
  },
  {
    requestPath: "/manage",
    expectedAssetPath: "/manage",
    noStore: true
  },
  {
    requestPath: "/manage/bl-041-fixture-token",
    expectedAssetPath: "/manage",
    noStore: true
  }
]) {
  assetFetches.length = 0;

  const response =
    await workerApp.fetch(
      new Request(
        `https://planner.example${requestPath}`,
        {
          headers: {
            accept:
              "text/html"
          }
        }
      ),
      securityEnv
    );

  assert.equal(
    response.status,
    200,
    `${requestPath} must be served through the Worker HTML hardening path`
  );
  assert.deepEqual(
    assetFetches,
    [
      expectedAssetPath
    ],
    `${requestPath} must resolve to the expected static HTML asset`
  );

  const csp =
    response.headers.get(
      "content-security-policy"
    ) || "";

  assert.match(
    csp,
    /(?:^|;\s*)script-src 'self'(?:;|$)/,
    `${requestPath} must use the strict same-origin script CSP`
  );
  assert.doesNotMatch(
    csp,
    /script-src[^;]*'unsafe-inline'/,
    `${requestPath} must not permit inline executable script`
  );
  assert.equal(
    response.headers.get(
      "referrer-policy"
    ),
    "no-referrer"
  );
  assert.equal(
    response.headers.get(
      "x-content-type-options"
    ),
    "nosniff"
  );
  assert.equal(
    response.headers.get(
      "x-frame-options"
    ),
    "DENY"
  );
  assert.equal(
    response.headers.get(
      "cross-origin-opener-policy"
    ),
    "same-origin"
  );
  assert.equal(
    response.headers.get(
      "cross-origin-resource-policy"
    ),
    "same-origin"
  );
  assert.match(
    response.headers.get(
      "permissions-policy"
    ) || "",
    /camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\).*usb=\(\)/
  );

  if (noStore) {
    assert.match(
      response.headers.get(
        "cache-control"
      ) || "",
      /no-store/i,
      `${requestPath} must remain no-store`
    );
  }
}

console.log(
  "CI dependency-install, Worker packaging, and production smoke checks passed."
);

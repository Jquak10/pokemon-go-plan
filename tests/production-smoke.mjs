import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_PRODUCTION_URL =
  "https://pogo-plan.jquak-10.workers.dev";
const SYNTHETIC_MANAGEMENT_TOKEN =
  "bl-036-production-smoke-invalid";
const SYNTHETIC_MANAGE_PATH =
  `/manage/${SYNTHETIC_MANAGEMENT_TOKEN}`;

const sleep = milliseconds =>
  new Promise(resolve =>
    setTimeout(
      resolve,
      milliseconds
    )
  );

function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      String(value ?? ""),
      10
    );

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

async function fetchWithTimeout(
  url,
  options,
  timeoutMs
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

function assertContentType(
  response,
  expected
) {
  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  assert.match(
    contentType,
    expected,
    `Unexpected content-type for ${response.url}: ${contentType || "(missing)"}`
  );
}

function versionedLocalAssets(
  html
) {
  const assets = [];

  for (
    const match of html.matchAll(
      /<(?:script|link)\b[^>]*(?:src|href)="(\/[^"]+\?v=\d+)"[^>]*>/gi
    )
  ) {
    if (
      !assets.includes(
        match[1]
      )
    ) {
      assets.push(
        match[1]
      );
    }
  }

  return assets;
}

function requiredAssetReference(
  html,
  pattern,
  label
) {
  const reference =
    html.match(
      pattern
    )?.[1];

  assert.ok(
    reference,
    `Repository Planner shell must reference a versioned ${label}`
  );

  return reference;
}

function assetContentTypePattern(
  reference
) {
  const path =
    new URL(
      reference,
      "https://smoke.invalid"
    ).pathname;

  if (
    path.endsWith(
      ".css"
    )
  ) {
    return /text\/css/i;
  }

  if (
    path.endsWith(
      ".js"
    )
  ) {
    return /(?:javascript|text\/plain)/i;
  }

  throw new Error(
    `Unsupported production-smoke asset type: ${reference}`
  );
}

function assertCriticalPlannerAsset(
  reference,
  body,
  {
    themeAsset,
    sharedStylesAsset,
    plannerStylesAsset,
    plannerAppAsset
  }
) {
  if (
    reference ===
      themeAsset
  ) {
    assert.match(
      body,
      /pogo-theme/,
      "Theme initializer is missing its browser-local preference contract"
    );
  }

  if (
    reference ===
      sharedStylesAsset
  ) {
    assert.match(
      body,
      /--page-bg\s*:/,
      "Shared stylesheet is missing the semantic theme token contract"
    );
  }

  if (
    reference ===
      plannerStylesAsset
  ) {
    assert.match(
      body,
      /RESPONSIVE APP SHELL/,
      "Planner stylesheet is missing the responsive shell contract"
    );
  }

  if (
    reference ===
      plannerAppAsset
  ) {
    assert.match(
      body,
      /PlannerClient/,
      "Planner JavaScript is missing the Planner client contract"
    );
  }
}

async function runSmokeAttempt({
  baseUrl,
  timeoutMs
}) {
  const [
    expectedLandingHtml,
    expectedPlannerHtml
  ] =
    await Promise.all([
      readFile(
        new URL(
          "../public/index.html",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../public/manage.html",
          import.meta.url
        ),
        "utf8"
      )
    ]);

  const expectedLandingAsset =
    expectedLandingHtml.match(
      /<script src="(\/landing-app\.js\?v=\d+)"><\/script>/
    )?.[1];

  assert.ok(
    expectedLandingAsset,
    "Repository landing page must reference a versioned landing-app.js asset"
  );

  const plannerAssets =
    versionedLocalAssets(
      expectedPlannerHtml
    );

  const criticalPlannerAssets = {
    themeAsset:
      requiredAssetReference(
        expectedPlannerHtml,
        /<script src="(\/theme\.js\?v=\d+)"><\/script>/,
        "theme.js initializer"
      ),
    sharedStylesAsset:
      requiredAssetReference(
        expectedPlannerHtml,
        /<link rel="stylesheet" href="(\/styles\.css\?v=\d+)">/,
        "shared styles.css asset"
      ),
    plannerStylesAsset:
      requiredAssetReference(
        expectedPlannerHtml,
        /<link rel="stylesheet" href="(\/planner\.css\?v=\d+)">/,
        "Planner-specific planner.css asset"
      ),
    plannerAppAsset:
      requiredAssetReference(
        expectedPlannerHtml,
        /<script src="(\/planner-app\.js\?v=\d+)"><\/script>/,
        "planner-app.js asset"
      )
  };

  for (
    const reference of
      Object.values(
        criticalPlannerAssets
      )
  ) {
    assert.ok(
      plannerAssets.includes(
        reference
      ),
      `Critical Planner asset ${reference} must be part of the versioned Planner shell`
    );
  }

  const landingResponse =
    await fetchWithTimeout(
      new URL(
        "/",
        baseUrl
      ),
      {
        headers: {
          accept: "text/html"
        }
      },
      timeoutMs
    );

  assert.equal(
    landingResponse.status,
    200,
    `Landing page returned HTTP ${landingResponse.status}`
  );
  assertContentType(
    landingResponse,
    /text\/html/i
  );

  const landingHtml =
    await landingResponse.text();

  assert.match(
    landingHtml,
    /<title>Pokémon GO Raid Planner<\/title>/,
    "Landing page title is missing"
  );
  assert.ok(
    landingHtml.includes(
      `<script src="${expectedLandingAsset}"></script>`
    ),
    `Production landing page is not serving the repository's expected asset reference ${expectedLandingAsset}`
  );

  const landingAssetResponse =
    await fetchWithTimeout(
      new URL(
        expectedLandingAsset,
        baseUrl
      ),
      {
        headers: {
          accept:
            "text/javascript, application/javascript"
        }
      },
      timeoutMs
    );

  assert.equal(
    landingAssetResponse.status,
    200,
    `Landing JavaScript returned HTTP ${landingAssetResponse.status}`
  );
  assertContentType(
    landingAssetResponse,
    /(?:javascript|text\/plain)/i
  );

  const landingAsset =
    await landingAssetResponse.text();

  assert.match(
    landingAsset,
    /JsonApiClient\.fetchJson/,
    "Landing JavaScript is missing the planner-creation client contract"
  );
  assert.match(
    landingAsset,
    /TimezoneValidation/,
    "Landing JavaScript is missing timezone validation"
  );

  const sourcesResponse =
    await fetchWithTimeout(
      new URL(
        "/sources",
        baseUrl
      ),
      {
        headers: {
          accept: "text/html"
        }
      },
      timeoutMs
    );

  assert.equal(
    sourcesResponse.status,
    200,
    `Data Sources page returned HTTP ${sourcesResponse.status}`
  );
  assertContentType(
    sourcesResponse,
    /text\/html/i
  );

  const sourcesHtml =
    await sourcesResponse.text();

  assert.match(
    sourcesHtml,
    /<h1>Data Sources &amp; Precedence<\/h1>|<h1>Data Sources & Precedence<\/h1>/,
    "Data Sources page heading is missing"
  );

  const plannerResponse =
    await fetchWithTimeout(
      new URL(
        SYNTHETIC_MANAGE_PATH,
        baseUrl
      ),
      {
        headers: {
          accept: "text/html"
        }
      },
      timeoutMs
    );

  assert.equal(
    plannerResponse.status,
    200,
    `Synthetic Planner shell returned HTTP ${plannerResponse.status}`
  );
  assertContentType(
    plannerResponse,
    /text\/html/i
  );
  assert.match(
    plannerResponse.headers.get(
      "cache-control"
    ) || "",
    /no-store/i,
    "Private Planner shell responses must remain no-store"
  );

  const plannerHtml =
    await plannerResponse.text();

  assert.match(
    plannerHtml,
    /<title>My Pokémon GO Battle Planner<\/title>/,
    "Planner shell title is missing"
  );
  assert.match(
    plannerHtml,
    /<section id="app" class="hidden">/,
    "Planner shell is missing the authenticated app container"
  );

  for (
    const reference of
      plannerAssets
  ) {
    assert.ok(
      plannerHtml.includes(
        `"${reference}"`
      ),
      `Production Planner shell is not serving the repository's expected asset reference ${reference}`
    );

    const response =
      await fetchWithTimeout(
        new URL(
          reference,
          baseUrl
        ),
        {
          headers: {
            accept:
              reference.includes(
                ".css?"
              )
                ? "text/css"
                : "text/javascript, application/javascript"
          }
        },
        timeoutMs
      );

    assert.equal(
      response.status,
      200,
      `Planner asset ${reference} returned HTTP ${response.status}`
    );
    assertContentType(
      response,
      assetContentTypePattern(
        reference
      )
    );

    const body =
      await response.text();

    assert.ok(
      body.length > 0,
      `Planner asset ${reference} returned an empty body`
    );

    assertCriticalPlannerAsset(
      reference,
      body,
      criticalPlannerAssets
    );
  }

  const apiResponse =
    await fetchWithTimeout(
      new URL(
        "/api/me",
        baseUrl
      ),
      {
        headers: {
          accept:
            "application/json",
          authorization:
            `Bearer ${SYNTHETIC_MANAGEMENT_TOKEN}`
        }
      },
      timeoutMs
    );

  assert.equal(
    apiResponse.status,
    401,
    `Synthetic management lookup returned HTTP ${apiResponse.status} instead of the expected 401`
  );
  assertContentType(
    apiResponse,
    /application\/json/i
  );
  assert.match(
    apiResponse.headers.get(
      "cache-control"
    ) || "",
    /no-store/i,
    "Authenticated API responses must remain no-store"
  );

  const apiBody =
    await apiResponse.json();

  assert.deepEqual(
    apiBody,
    {
      error:
        "Invalid management link."
    },
    "Synthetic management lookup returned an unexpected JSON contract"
  );
}

export async function runProductionSmoke({
  baseUrl =
    process.env.POGO_PRODUCTION_URL ||
    DEFAULT_PRODUCTION_URL,
  attempts =
    positiveInteger(
      process.env.POGO_SMOKE_ATTEMPTS,
      4
    ),
  retryDelayMs =
    positiveInteger(
      process.env.POGO_SMOKE_RETRY_DELAY_MS,
      10000
    ),
  timeoutMs =
    positiveInteger(
      process.env.POGO_SMOKE_TIMEOUT_MS,
      10000
    )
} = {}) {
  const normalizedBaseUrl =
    new URL(baseUrl);

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    try {
      await runSmokeAttempt({
        baseUrl:
          normalizedBaseUrl,
        timeoutMs
      });

      console.log(
        `Production smoke passed on attempt ${attempt}/${attempts}: ${normalizedBaseUrl.origin}`
      );
      return;
    } catch (error) {
      lastError = error;

      console.error(
        `Production smoke attempt ${attempt}/${attempts} failed: ${error?.message || error}`
      );

      if (
        attempt < attempts
      ) {
        await sleep(
          retryDelayMs *
            attempt
        );
      }
    }
  }

  throw lastError ||
    new Error(
      "Production smoke failed."
    );
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) === process.argv[1];

if (isDirectExecution) {
  runProductionSmoke()
    .catch(error => {
      console.error(
        error?.stack ||
        error
      );
      process.exitCode = 1;
    });
}

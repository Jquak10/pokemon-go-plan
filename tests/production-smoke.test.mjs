import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import {
  runProductionSmoke
} from "./production-smoke.mjs";

const indexHtml =
  await readFile(
    new URL(
      "../public/index.html",
      import.meta.url
    ),
    "utf8"
  );
const manageHtml =
  await readFile(
    new URL(
      "../public/manage.html",
      import.meta.url
    ),
    "utf8"
  );
const sourcesHtml =
  await readFile(
    new URL(
      "../public/sources.html",
      import.meta.url
    ),
    "utf8"
  );
const adminHtml =
  await readFile(
    new URL(
      "../public/admin.html",
      import.meta.url
    ),
    "utf8"
  );

const expectedLandingAsset =
  indexHtml.match(
    /<script src="(\/landing-app\.js\?v=\d+)"><\/script>/
  )?.[1];

assert.ok(
  expectedLandingAsset,
  "Fixture landing page must reference a versioned landing-app.js asset"
);

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

const expectedPlannerAssets =
  versionedLocalAssets(
    manageHtml
  );

for (const expected of [
  /\/theme\.js\?v=\d+/,
  /\/styles\.css\?v=\d+/,
  /\/planner\.css\?v=\d+/,
  /\/planner-app\.js\?v=\d+/
]) {
  assert.ok(
    expectedPlannerAssets.some(
      reference =>
        expected.test(
          reference
        )
    ),
    `Fixture Planner shell is missing required asset ${expected}`
  );
}

const expectedPlannerStylesAsset =
  expectedPlannerAssets.find(
    reference =>
      /\/planner\.css\?v=\d+/.test(
        reference
      )
  );

assert.ok(
  expectedPlannerStylesAsset
);

async function fixtureAssetBody(
  reference
) {
  const pathname =
    new URL(
      reference,
      "http://fixture.invalid"
    ).pathname;

  return readFile(
    new URL(
      `../public/${pathname.replace(/^\//, "")}`,
      import.meta.url
    ),
    "utf8"
  );
}

const assetBodies =
  new Map();

for (
  const reference of [
    expectedLandingAsset,
    ...expectedPlannerAssets
  ]
) {
  assetBodies.set(
    reference,
    await fixtureAssetBody(
      reference
    )
  );
}

function contentTypeFor(
  reference
) {
  const pathname =
    new URL(
      reference,
      "http://fixture.invalid"
    ).pathname;

  return pathname.endsWith(
    ".css"
  )
    ? "text/css; charset=utf-8"
    : "text/javascript; charset=utf-8";
}

function hardenedHtmlHeaders({
  noStore = false
} = {}) {
  return {
    "content-type":
      "text/html; charset=utf-8",
    "content-security-policy":
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'",
    "referrer-policy":
      "no-referrer",
    "x-content-type-options":
      "nosniff",
    "x-frame-options":
      "DENY",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "cross-origin-opener-policy":
      "same-origin",
    "cross-origin-resource-policy":
      "same-origin",
    ...(
      noStore
        ? {
            "cache-control":
              "private, no-store, max-age=0"
          }
        : {}
    )
  };
}

const requests = [];
let unavailableAsset = null;

const server =
  http.createServer(
    (request, response) => {
      requests.push({
        method:
          request.method,
        url:
          request.url,
        authorization:
          request.headers
            .authorization ||
          null
      });

      if (
        request.method === "GET" &&
        (
          request.url === "/" ||
          request.url === "/index.html"
        )
      ) {
        response.writeHead(
          200,
          hardenedHtmlHeaders()
        );
        response.end(
          indexHtml
        );
        return;
      }

      if (
        request.method === "GET" &&
        (
          request.url === "/sources" ||
          request.url === "/sources.html"
        )
      ) {
        response.writeHead(
          200,
          hardenedHtmlHeaders()
        );
        response.end(
          sourcesHtml
        );
        return;
      }

      if (
        request.method === "GET" &&
        (
          request.url === "/admin" ||
          request.url === "/admin.html"
        )
      ) {
        response.writeHead(
          200,
          hardenedHtmlHeaders({
            noStore: true
          })
        );
        response.end(
          adminHtml
        );
        return;
      }

      if (
        request.method === "GET" &&
        (
          request.url === "/manage" ||
          request.url === "/manage.html" ||
          request.url ===
            "/manage/bl-036-production-smoke-invalid"
        )
      ) {
        response.writeHead(
          200,
          hardenedHtmlHeaders({
            noStore: true
          })
        );
        response.end(
          manageHtml
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url ===
          unavailableAsset
      ) {
        response.writeHead(
          404,
          {
            "content-type":
              "text/plain; charset=utf-8"
          }
        );
        response.end(
          "missing fixture asset"
        );
        return;
      }

      if (
        request.method === "GET" &&
        assetBodies.has(
          request.url
        )
      ) {
        response.writeHead(
          200,
          {
            "content-type":
              contentTypeFor(
                request.url
              )
          }
        );
        response.end(
          assetBodies.get(
            request.url
          )
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url === "/api/me"
      ) {
        response.writeHead(
          401,
          {
            "content-type":
              "application/json; charset=utf-8",
            "cache-control":
              "private, no-store"
          }
        );
        response.end(
          JSON.stringify({
            error:
              "Invalid management link."
          })
        );
        return;
      }

      response.writeHead(
        404
      );
      response.end();
    }
  );

await new Promise(
  (resolve, reject) => {
    server.once(
      "error",
      reject
    );
    server.listen(
      0,
      "127.0.0.1",
      resolve
    );
  }
);

try {
  const address =
    server.address();

  assert.ok(
    address &&
      typeof address ===
        "object"
  );

  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  await runProductionSmoke({
    baseUrl,
    attempts: 1,
    timeoutMs: 1000
  });

  assert.deepEqual(
    requests.map(
      request =>
        request.url
    ),
    [
      "/",
      expectedLandingAsset,
      "/sources",
      "/index.html",
      "/sources.html",
      "/admin",
      "/admin.html",
      "/manage",
      "/manage.html",
      "/manage/bl-036-production-smoke-invalid",
      ...expectedPlannerAssets,
      "/api/me"
    ],
    "Production smoke must probe the current Planner shell and every versioned Planner asset"
  );

  const apiRequest =
    requests.at(-1);

  assert.equal(
    apiRequest.method,
    "GET"
  );
  assert.equal(
    apiRequest.authorization,
    "Bearer bl-036-production-smoke-invalid"
  );

  assert.equal(
    requests
      .slice(
        0,
        -1
      )
      .some(
        request =>
          request.authorization
      ),
    false,
    "Only the synthetic API lookup may carry the synthetic Authorization header"
  );

  assert.equal(
    requests.some(
      request =>
        request.method !==
          "GET"
    ),
    false,
    "Production smoke checks must remain read-only"
  );

  requests.length = 0;
  unavailableAsset =
    expectedPlannerStylesAsset;

  await assert.rejects(
    () =>
      runProductionSmoke({
        baseUrl,
        attempts: 1,
        timeoutMs: 1000
      }),
    new RegExp(
      `Planner asset ${expectedPlannerStylesAsset.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")} returned HTTP 404`
    ),
    "A missing Planner asset must fail the production smoke gate"
  );

  assert.equal(
    requests.some(
      request =>
        request.method !==
          "GET"
    ),
    false,
    "Failure-path smoke checks must remain read-only"
  );
} finally {
  await new Promise(
    resolve =>
      server.close(
        resolve
      )
  );
}

console.log(
  "production smoke fixture tests passed"
);

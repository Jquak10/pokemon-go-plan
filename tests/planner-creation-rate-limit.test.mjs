import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import workerApp from "../src/index.js";

function limiter(success, calls) {
  return {
    async limit(input) {
      calls.push(input);
      return { success };
    }
  };
}

function createRequest({
  ip = "203.0.113.9",
  timezone = "Asia/Singapore"
} = {}) {
  return new Request(
    "https://planner.example/api/create",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
        "cf-connecting-ip":
          ip
      },
      body: JSON.stringify({
        timezone
      })
    }
  );
}

const config =
  JSON.parse(
    readFileSync(
      new URL(
        "../wrangler.jsonc",
        import.meta.url
      ),
      "utf8"
    )
  );

const rateLimiters =
  new Map(
    (config.ratelimits || [])
      .map(item => [
        item.name,
        item
      ])
  );

assert.deepEqual(
  rateLimiters
    .get(
      "PLANNER_CREATE_CLIENT_RATE_LIMITER"
    )
    ?.simple,
  {
    limit: 3,
    period: 60
  },
  "Planner creation must have a per-client limiter"
);

assert.deepEqual(
  rateLimiters
    .get(
      "PLANNER_CREATE_ROUTE_RATE_LIMITER"
    )
    ?.simple,
  {
    limit: 10,
    period: 60
  },
  "Planner creation must have a route-wide limiter"
);

assert.notEqual(
  rateLimiters
    .get(
      "PLANNER_CREATE_CLIENT_RATE_LIMITER"
    )
    ?.namespace_id,
  rateLimiters
    .get(
      "PLANNER_CREATE_ROUTE_RATE_LIMITER"
    )
    ?.namespace_id,
  "Creation rate-limit bindings must use separate namespaces"
);

const blockedClientCalls = [];
const blockedClientRouteCalls = [];

const blockedClientResponse =
  await workerApp.fetch(
    createRequest(),
    {
      PLANNER_CREATE_CLIENT_RATE_LIMITER:
        limiter(
          false,
          blockedClientCalls
        ),
      PLANNER_CREATE_ROUTE_RATE_LIMITER:
        limiter(
          true,
          blockedClientRouteCalls
        )
    }
  );

assert.equal(
  blockedClientResponse.status,
  429
);
assert.equal(
  blockedClientResponse.headers.get(
    "retry-after"
  ),
  "60"
);
assert.deepEqual(
  await blockedClientResponse.json(),
  {
    error:
      "Too many planner creation attempts. Please wait a minute and try again."
  }
);
assert.equal(
  blockedClientCalls.length,
  1
);
assert.equal(
  blockedClientRouteCalls.length,
  0,
  "A client already over its limit must not consume the shared route budget"
);
assert.match(
  blockedClientCalls[0].key,
  /^planner-create-client:[0-9a-f]{64}$/
);
assert.doesNotMatch(
  blockedClientCalls[0].key,
  /203\.0\.113\.9/,
  "The raw client IP must not be used as the rate-limit key"
);

const routeClientCalls = [];
const blockedRouteCalls = [];

const blockedRouteResponse =
  await workerApp.fetch(
    createRequest({
      ip: "198.51.100.7"
    }),
    {
      PLANNER_CREATE_CLIENT_RATE_LIMITER:
        limiter(
          true,
          routeClientCalls
        ),
      PLANNER_CREATE_ROUTE_RATE_LIMITER:
        limiter(
          false,
          blockedRouteCalls
        )
    }
  );

assert.equal(
  blockedRouteResponse.status,
  429
);
assert.equal(
  routeClientCalls.length,
  1
);
assert.deepEqual(
  blockedRouteCalls,
  [
    {
      key:
        "planner-create-route"
    }
  ]
);

const allowedClientCalls = [];
const allowedRouteCalls = [];

const allowedResponse =
  await workerApp.fetch(
    createRequest({
      timezone:
        "Not/A_Timezone"
    }),
    {
      PLANNER_CREATE_CLIENT_RATE_LIMITER:
        limiter(
          true,
          allowedClientCalls
        ),
      PLANNER_CREATE_ROUTE_RATE_LIMITER:
        limiter(
          true,
          allowedRouteCalls
        )
    }
  );

assert.equal(
  allowedResponse.status,
  400,
  "An allowed creation request must continue into the normal create validation path"
);
assert.equal(
  allowedClientCalls.length,
  1
);
assert.equal(
  allowedRouteCalls.length,
  1
);

const originalConsoleError =
  console.error;
const missingBindingLogs = [];

let missingBindingResponse;

try {
  console.error =
    (...args) =>
      missingBindingLogs.push(
        args
      );

  missingBindingResponse =
    await workerApp.fetch(
      createRequest(),
      {}
    );
} finally {
  console.error =
    originalConsoleError;
}

assert.equal(
  missingBindingResponse.status,
  503,
  "Planner creation must fail closed when the configured rate-limit bindings are unavailable"
);
assert.equal(
  missingBindingResponse.headers.get(
    "retry-after"
  ),
  "60"
);
assert.deepEqual(
  await missingBindingResponse.json(),
  {
    error:
      "Planner creation is temporarily unavailable. Please try again shortly."
  }
);
assert.equal(
  missingBindingLogs.length,
  1
);

const throwingLogs = [];
let throwingResponse;

try {
  console.error =
    (...args) =>
      throwingLogs.push(
        args
      );

  throwingResponse =
    await workerApp.fetch(
      createRequest(),
      {
        PLANNER_CREATE_CLIENT_RATE_LIMITER:
          {
            async limit() {
              throw new Error(
                "rate limiter unavailable"
              );
            }
          },
        PLANNER_CREATE_ROUTE_RATE_LIMITER:
          limiter(
            true,
            []
          )
      }
    );
} finally {
  console.error =
    originalConsoleError;
}

assert.equal(
  throwingResponse.status,
  503,
  "Planner creation must fail closed when the limiter service errors"
);
assert.equal(
  throwingLogs.length,
  1
);

console.log(
  "Planner creation abuse protection checks passed."
);

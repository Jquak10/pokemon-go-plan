import assert from "node:assert/strict";
import {
  collectReleaseHealth,
  renderReleaseHealthSummary
} from "./release-health-summary.mjs";

const SHA =
  "0440bb6474ea93f2e527ed31b442ed9f8cff65b4";
const REPO =
  "Jquak10/pokemon-go-plan";

function jsonResponse(
  body,
  status = 200
) {
  return new Response(
    JSON.stringify(
      body
    ),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}

function workflowRun({
  id,
  name,
  event,
  status = "completed",
  conclusion = "success",
  createdAt
}) {
  return {
    id,
    name,
    event,
    status,
    conclusion,
    head_sha:
      SHA,
    created_at:
      createdAt
  };
}

function healthyFetch({
  latestSmokeConclusion =
    "success",
  latestSmokeStatus =
    "completed",
  freshnessBody = {
    monitor_ok: true,
    status: "healthy",
    stale_count: 0,
    missing_count: 0,
    degraded_count: 0,
    sources: []
  },
  schemaBody = {
    monitor_ok: true,
    status: "compatible",
    missing_count: 0,
    missing_components: []
  }
} = {}) {
  return async url => {
    const parsed =
      new URL(
        url
      );

    if (
      parsed.pathname ===
        `/repos/${REPO}/branches/main`
    ) {
      return jsonResponse({
        commit: {
          sha: SHA
        }
      });
    }

    if (
      parsed.pathname ===
        `/repos/${REPO}/actions/runs`
    ) {
      return jsonResponse({
        workflow_runs: [
          workflowRun({
            id: 501,
            name:
              "Production smoke",
            event:
              "schedule",
            status:
              latestSmokeStatus,
            conclusion:
              latestSmokeConclusion,
            createdAt:
              "2026-09-30T01:45:00Z"
          }),
          workflowRun({
            id: 401,
            name:
              "Planner regression",
            event:
              "schedule",
            createdAt:
              "2026-09-30T01:30:00Z"
          }),
          workflowRun({
            id: 301,
            name:
              "Production smoke",
            event: "push",
            createdAt:
              "2026-09-29T17:15:00Z"
          }),
          workflowRun({
            id: 201,
            name:
              "Planner regression",
            event: "push",
            createdAt:
              "2026-09-29T17:14:00Z"
          }),
          workflowRun({
            id: 999,
            name:
              "Production smoke",
            event: "push",
            status:
              "completed",
            conclusion:
              "failure",
            createdAt:
              "2026-09-29T17:20:00Z",
            head_sha:
              "1111111111111111111111111111111111111111"
          })
        ]
      });
    }

    if (
      parsed.pathname ===
        "/api/health/data-freshness"
    ) {
      return jsonResponse(
        freshnessBody,
        freshnessBody
          ?.monitor_ok ===
          false
          ? 503
          : 200
      );
    }

    if (
      parsed.pathname ===
        "/api/health/schema-compatibility"
    ) {
      return jsonResponse(
        schemaBody,
        schemaBody
          ?.monitor_ok ===
          false
          ? 503
          : 200
      );
    }

    throw new Error(
      `Unexpected fixture URL: ${parsed.href}`
    );
  };
}

const healthy =
  await collectReleaseHealth({
    fetchImpl:
      healthyFetch(),
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    githubToken:
      "fixture-token",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000
  });

assert.equal(
  healthy.sha,
  SHA
);
assert.equal(
  healthy.production_verified,
  true,
  "A successful push-triggered smoke for the exact main SHA must verify the deployment SHA"
);
assert.equal(
  healthy.smoke.url,
  `https://github.com/${REPO}/actions/runs/501`,
  "Current smoke state must use the newest run for the same SHA, not blindly prefer the push run"
);
assert.equal(
  healthy.regression.url,
  `https://github.com/${REPO}/actions/runs/401`
);
assert.equal(
  healthy.overall,
  "healthy"
);

const healthyMarkdown =
  renderReleaseHealthSummary(
    healthy
  );

for (const expected of [
  "# Release health",
  "**Overall:** ✅ healthy",
  "`0440bb6`",
  "production-verified by smoke",
  "Planner regression",
  "Production smoke",
  "Data freshness",
  "Schema compatibility"
]) {
  assert.match(
    healthyMarkdown,
    new RegExp(
      expected.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    )
  );
}

const degraded =
  await collectReleaseHealth({
    fetchImpl:
      healthyFetch({
        freshnessBody: {
          monitor_ok: true,
          status: "degraded",
          stale_count: 0,
          missing_count: 0,
          degraded_count: 2,
          sources: [
            {
              source_key:
                "event:raid_hour",
              status:
                "degraded",
              source_url:
                "https://secret.example/token",
              last_error:
                "sensitive raw error"
            },
            {
              source_key:
                "official:pokemon-go-schedules",
              status:
                "degraded"
            }
          ]
        }
      }),
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000
  });

assert.equal(
  degraded.overall,
  "degraded"
);

const degradedMarkdown =
  renderReleaseHealthSummary(
    degraded
  );

assert.match(
  degradedMarkdown,
  /affected: degraded: event:raid_hour, official:pokemon-go-schedules/
);
assert.doesNotMatch(
  degradedMarkdown,
  /secret\.example|sensitive raw error/
);

const failedSmoke =
  await collectReleaseHealth({
    fetchImpl:
      healthyFetch({
        latestSmokeConclusion:
          "failure"
      }),
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000
  });

assert.equal(
  failedSmoke.production_verified,
  true,
  "Historical successful push smoke still records that this exact SHA was deployment-verified"
);
assert.equal(
  failedSmoke.overall,
  "attention",
  "A newer scheduled smoke failure must override the earlier healthy release state"
);
assert.equal(
  failedSmoke.smoke.conclusion,
  "failure"
);

const incompatible =
  await collectReleaseHealth({
    fetchImpl:
      healthyFetch({
        schemaBody: {
          monitor_ok: false,
          status:
            "incompatible",
          missing_count: 3,
          missing_components: [
            "column:targets.battle_kind",
            "trigger:battle_log_undo",
            "CREATE TABLE leaked(secret TEXT)"
          ],
          required_schema_fingerprint:
            "a".repeat(64),
          internal_error:
            "sensitive internal SQL detail"
        }
      }),
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000
  });

assert.equal(
  incompatible.overall,
  "attention"
);

const incompatibleMarkdown =
  renderReleaseHealthSummary(
    incompatible
  );

assert.match(
  incompatibleMarkdown,
  /missing: column:targets\.battle_kind, trigger:battle_log_undo/
);
assert.doesNotMatch(
  incompatibleMarkdown,
  /CREATE TABLE|sensitive internal SQL detail|[a-f0-9]{64}/i,
  "Release summary must preserve the BL-055 sanitized diagnostic boundary"
);

const pending =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/branches/main`
      ) {
        return jsonResponse({
          commit: {
            sha: SHA
          }
        });
      }

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        return jsonResponse(
          {
            message:
              "Actions temporarily unavailable"
          },
          503
        );
      }

      if (
        parsed.pathname ===
          "/api/health/data-freshness"
      ) {
        return new Response(
          "upstream error",
          {
            status: 503,
            headers: {
              "content-type":
                "text/plain"
            }
          }
        );
      }

      if (
        parsed.pathname ===
          "/api/health/schema-compatibility"
      ) {
        return new Response(
          "upstream error",
          {
            status: 503,
            headers: {
              "content-type":
                "text/plain"
            }
          }
        );
      }

      throw new Error(
        "Unexpected URL"
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000
  });

assert.equal(
  pending.overall,
  "pending"
);
assert.equal(
  pending.regression.status,
  "missing"
);
assert.equal(
  pending.freshness.healthy,
  null
);
assert.equal(
  pending.schema.healthy,
  null
);

await assert.rejects(
  () =>
    collectReleaseHealth({
      fetchImpl: async () =>
        jsonResponse(
          {
            message:
              "not available"
          },
          503
        ),
      repo: REPO,
      githubApiUrl:
        "https://api.github.test",
      productionUrl:
        "https://planner.example",
      timeoutMs: 1000
    }),
  /could not resolve the current main SHA/i
);

console.log(
  "release health summary tests passed"
);

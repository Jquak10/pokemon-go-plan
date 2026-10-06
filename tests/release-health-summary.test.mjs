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
  createdAt,
  headSha = SHA
}) {
  return {
    id,
    name,
    event,
    status,
    conclusion,
    head_sha:
      headSha,
    created_at:
      createdAt
  };
}

const ROLLING_ACTIONS_WINDOW = [
  workflowRun({
    id: 501,
    name:
      "Production smoke",
    event:
      "schedule",
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
  ...Array.from(
    {
      length: 48
    },
    (
      _,
      index
    ) =>
      workflowRun({
        id:
          600 +
          index,
        name:
          "Release health",
        event:
          "workflow_run",
        createdAt:
          `2026-09-30T00:${String(
            59 -
            index
          ).padStart(
            2,
            "0"
          )}:00Z`
      })
  )
];

assert.equal(
  ROLLING_ACTIONS_WINDOW.length,
  50
);
assert.equal(
  ROLLING_ACTIONS_WINDOW.some(
    run =>
      run.event ===
        "push"
  ),
  false,
  "The rolling 50-run fixture must simulate the original deployment smoke having aged out of general Actions history"
);

function healthyFetch({
  latestSmokeConclusion =
    "success",
  latestSmokeStatus =
    "completed",
  deploymentSmokeConclusion =
    "success",
  deploymentSmokeStatus =
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
      assert.equal(
        parsed.searchParams.get(
          "branch"
        ),
        "main"
      );
      assert.equal(
        parsed.searchParams.get(
          "per_page"
        ),
        "50"
      );

      return jsonResponse({
        workflow_runs:
          ROLLING_ACTIONS_WINDOW.map(
            run => {
              if (
                run.id ===
                  501
              ) {
                return {
                  ...run,
                  status:
                    latestSmokeStatus,
                  conclusion:
                    latestSmokeConclusion
                };
              }

              return run;
            }
          )
      });
    }

    if (
      parsed.pathname ===
        `/repos/${REPO}/actions/workflows/production-smoke.yml/runs`
    ) {
      assert.equal(
        parsed.searchParams.get(
          "branch"
        ),
        "main"
      );
      assert.equal(
        parsed.searchParams.get(
          "event"
        ),
        "push"
      );
      assert.equal(
        parsed.searchParams.get(
          "head_sha"
        ),
        SHA
      );
      assert.equal(
        parsed.searchParams.get(
          "per_page"
        ),
        "10"
      );

      return jsonResponse({
        workflow_runs: [
          workflowRun({
            id: 302,
            name:
              "Production smoke",
            event:
              "push",
            status:
              "completed",
            conclusion:
              "failure",
            createdAt:
              "2026-09-29T17:16:00Z"
          }),
          workflowRun({
            id: 301,
            name:
              "Production smoke",
            event:
              "push",
            status:
              deploymentSmokeStatus,
            conclusion:
              deploymentSmokeConclusion,
            createdAt:
              "2026-09-29T17:15:00Z"
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
  "Exact-SHA Production smoke history must keep the deployment verified even after the original push run ages out of the rolling 50-run Actions window"
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

const unverified =
  await collectReleaseHealth({
    fetchImpl:
      healthyFetch({
        deploymentSmokeConclusion:
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
  unverified.production_verified,
  false,
  "An exact-SHA push history with no successful Production smoke must not mark the deployment verified"
);
assert.equal(
  unverified.production_verification.status,
  "unverified",
  "A valid exact-SHA workflow response with no successful push smoke must remain distinct from unavailable verification evidence"
);
assert.match(
  renderReleaseHealthSummary(
    unverified
  ),
  /not yet production-verified by smoke/
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

const missingWorkflowBaseFetch =
  healthyFetch();

const genuinelyMissingWorkflows =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        return jsonResponse({
          workflow_runs: []
        });
      }

      return missingWorkflowBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  genuinelyMissingWorkflows.regression.status,
  "missing",
  "A successful Actions response with no matching same-SHA regression is genuinely missing rather than unavailable"
);
assert.equal(
  genuinelyMissingWorkflows.smoke.status,
  "missing"
);
assert.equal(
  genuinelyMissingWorkflows.production_verified,
  true,
  "Deployment verification remains independent from the rolling current-health lookup"
);
assert.equal(
  genuinelyMissingWorkflows.overall,
  "pending"
);

const transientBaseFetch =
  healthyFetch();
let transientActionsCalls = 0;

const transientActions =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        transientActionsCalls +=
          1;

        if (
          transientActionsCalls ===
            1
        ) {
          return jsonResponse(
            {
              message:
                "temporary GitHub failure"
            },
            503
          );
        }
      }

      return transientBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  transientActionsCalls,
  2,
  "Transient GitHub 5xx responses must recover within the bounded retry budget"
);
assert.equal(
  transientActions.overall,
  "healthy"
);
assert.equal(
  transientActions.regression.status,
  "completed"
);
assert.equal(
  transientActions.smoke.status,
  "completed"
);

const rateLimitBaseFetch =
  healthyFetch();
let rateLimitCalls = 0;

const rateLimitRecovered =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        rateLimitCalls +=
          1;

        if (
          rateLimitCalls ===
            1
        ) {
          return new Response(
            JSON.stringify({
              message:
                "rate limited"
            }),
            {
              status: 403,
              headers: {
                "content-type":
                  "application/json; charset=utf-8",
                "x-ratelimit-remaining":
                  "0"
              }
            }
          );
        }
      }

      return rateLimitBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  rateLimitCalls,
  2,
  "Rate-limit responses must receive the same bounded retry treatment"
);
assert.equal(
  rateLimitRecovered.overall,
  "healthy"
);

const persistentActionsBaseFetch =
  healthyFetch();
let persistentActionsCalls = 0;

const unavailableActions =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        persistentActionsCalls +=
          1;

        return jsonResponse(
          {
            message:
              "Actions temporarily unavailable"
          },
          503
        );
      }

      return persistentActionsBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  persistentActionsCalls,
  3,
  "Persistent transient GitHub failures must stop at the bounded attempt count"
);
assert.equal(
  unavailableActions.regression.status,
  "unavailable",
  "Unavailable Actions evidence must not be mislabeled as a genuinely missing workflow"
);
assert.equal(
  unavailableActions.smoke.status,
  "unavailable"
);
assert.equal(
  unavailableActions.production_verified,
  true,
  "Independent exact-SHA deployment verification may remain proven when the rolling current-health query is unavailable"
);
assert.equal(
  unavailableActions.overall,
  "pending"
);

const unavailableActionsMarkdown =
  renderReleaseHealthSummary(
    unavailableActions
  );

assert.match(
  unavailableActionsMarkdown,
  /Planner regression \| ⚪ unavailable/
);
assert.match(
  unavailableActionsMarkdown,
  /Production smoke \| ⚪ unavailable/
);

const deploymentUnavailableBaseFetch =
  healthyFetch();
let deploymentUnavailableCalls = 0;

const deploymentUnavailable =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/workflows/production-smoke.yml/runs`
      ) {
        deploymentUnavailableCalls +=
          1;

        return jsonResponse(
          {
            message:
              "GitHub workflow history unavailable"
          },
          503
        );
      }

      return deploymentUnavailableBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  deploymentUnavailableCalls,
  3
);
assert.equal(
  deploymentUnavailable.production_verified,
  null,
  "Unavailable deployment evidence must not be collapsed into false/unverified"
);
assert.equal(
  deploymentUnavailable
    .production_verification
    .status,
  "unavailable"
);
assert.equal(
  deploymentUnavailable.overall,
  "pending"
);
assert.match(
  renderReleaseHealthSummary(
    deploymentUnavailable
  ),
  /deployment verification unavailable/
);

const definitiveClientBaseFetch =
  healthyFetch();
let definitiveClientCalls = 0;

const definitiveClientFailure =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          `/repos/${REPO}/actions/runs`
      ) {
        definitiveClientCalls +=
          1;

        return jsonResponse(
          {
            message:
              "forbidden"
          },
          401
        );
      }

      return definitiveClientBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  definitiveClientCalls,
  1,
  "Definitive client errors must not consume the transient retry budget"
);
assert.equal(
  definitiveClientFailure
    .regression.status,
  "unavailable"
);

const transientHealthBaseFetch =
  healthyFetch();
let transientFreshnessCalls = 0;

const transientHealth =
  await collectReleaseHealth({
    fetchImpl: async url => {
      const parsed =
        new URL(
          url
        );

      if (
        parsed.pathname ===
          "/api/health/data-freshness"
      ) {
        transientFreshnessCalls +=
          1;

        if (
          transientFreshnessCalls ===
            1
        ) {
          throw new Error(
            "fixture network failure"
          );
        }
      }

      return transientHealthBaseFetch(
        url
      );
    },
    repo: REPO,
    githubApiUrl:
      "https://api.github.test",
    productionUrl:
      "https://planner.example",
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  transientFreshnessCalls,
  2,
  "Transient public health endpoint failures must recover within the bounded retry budget"
);
assert.equal(
  transientHealth.freshness.status,
  "healthy"
);
assert.equal(
  transientHealth.overall,
  "healthy"
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
          "/api/health/data-freshness" ||
        parsed.pathname ===
          "/api/health/schema-compatibility"
      ) {
        throw new Error(
          "fixture network failure"
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
    timeoutMs: 1000,
    fetchAttempts: 3,
    retryDelayMs: 0
  });

assert.equal(
  pending.overall,
  "pending"
);
assert.equal(
  pending.regression.status,
  "unavailable",
  "Persistent Actions read failure must remain distinct from a genuinely absent same-SHA workflow"
);
assert.equal(
  pending.production_verified,
  null
);
assert.equal(
  pending.production_verification.status,
  "unavailable"
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

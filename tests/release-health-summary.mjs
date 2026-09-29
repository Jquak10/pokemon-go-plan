import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  freshnessHealthDiagnostic,
  schemaHealthDiagnostic
} from "./production-smoke.mjs";

const DEFAULT_PRODUCTION_URL =
  "https://pogo-plan.jquak-10.workers.dev";
const DEFAULT_GITHUB_API_URL =
  "https://api.github.com";
const MAIN_BRANCH = "main";
const WORKFLOW_NAMES = {
  regression: "Planner regression",
  smoke: "Production smoke"
};

function safeInteger(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isInteger(
    number
  ) &&
    number >= 0
    ? number
    : null;
}

function safeSha(
  value
) {
  const sha =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  return /^[a-f0-9]{40,64}$/.test(
    sha
  )
    ? sha
    : null;
}

function safeWorkflowStatus(
  value
) {
  const status =
    String(
      value || ""
    );

  return [
    "queued",
    "in_progress",
    "completed",
    "waiting",
    "requested",
    "pending"
  ].includes(
    status
  )
    ? status
    : "unknown";
}

function safeWorkflowConclusion(
  value
) {
  const conclusion =
    String(
      value || ""
    );

  return [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "action_required",
    "neutral",
    "stale",
    "startup_failure"
  ].includes(
    conclusion
  )
    ? conclusion
    : null;
}

function safeHealthStatus(
  value,
  allowed
) {
  const status =
    String(
      value || ""
    );

  return allowed.includes(
    status
  )
    ? status
    : "unavailable";
}

function workflowState(
  run
) {
  if (!run) {
    return {
      status: "missing",
      conclusion: null,
      healthy: null
    };
  }

  const status =
    safeWorkflowStatus(
      run.status
    );
  const conclusion =
    safeWorkflowConclusion(
      run.conclusion
    );

  if (
    status !== "completed"
  ) {
    return {
      status,
      conclusion,
      healthy: null
    };
  }

  return {
    status,
    conclusion,
    healthy:
      conclusion ===
        "success"
  };
}

function runUrl(
  repo,
  run
) {
  const id =
    safeInteger(
      run?.id
    );

  return id == null
    ? null
    : `https://github.com/${repo}/actions/runs/${id}`;
}

function workflowCandidates(
  runs,
  name,
  sha
) {
  return (
    Array.isArray(
      runs
    )
      ? runs
      : []
  )
    .filter(
      run =>
        String(
          run?.name || ""
        ) === name &&
        safeSha(
          run?.head_sha
        ) === sha
    )
    .sort(
      (left, right) =>
        Date.parse(
          right?.created_at ||
          ""
        ) -
        Date.parse(
          left?.created_at ||
          ""
        )
    );
}

function chooseWorkflowRun(
  runs,
  name,
  sha
) {
  return (
    workflowCandidates(
      runs,
      name,
      sha
    )[0] ||
    null
  );
}

function choosePushWorkflowRun(
  runs,
  name,
  sha
) {
  return (
    workflowCandidates(
      runs,
      name,
      sha
    ).find(
      run =>
        run?.event ===
          "push"
    ) ||
    null
  );
}

async function fetchJson(
  fetchImpl,
  url,
  {
    token = null,
    timeoutMs = 10000
  } = {}
) {
  const controller =
    new AbortController();
  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const headers = {
      accept:
        "application/vnd.github+json, application/json"
    };

    if (token) {
      headers.authorization =
        `Bearer ${token}`;
    }

    const response =
      await fetchImpl(
        url,
        {
          method: "GET",
          headers,
          signal:
            controller.signal
        }
      );

    const contentType =
      response.headers?.get?.(
        "content-type"
      ) || "";

    if (
      !/application\/json/i.test(
        contentType
      )
    ) {
      return {
        ok: false,
        status:
          response.status,
        body: null
      };
    }

    return {
      ok:
        response.ok,
      status:
        response.status,
      body:
        await response.json()
    };
  } catch {
    return {
      ok: false,
      status: null,
      body: null
    };
  } finally {
    clearTimeout(
      timer
    );
  }
}

function githubHeadersToken(
  token
) {
  return String(
    token || ""
  ).trim() || null;
}

function healthCounts(
  body
) {
  return {
    stale:
      safeInteger(
        body?.stale_count
      ),
    missing:
      safeInteger(
        body?.missing_count
      ),
    degraded:
      safeInteger(
        body?.degraded_count
      )
  };
}

function releaseOverallState({
  regression,
  smoke,
  freshness,
  schema
}) {
  const hardFailure =
    regression.healthy ===
      false ||
    smoke.healthy ===
      false ||
    freshness.healthy ===
      false ||
    schema.healthy ===
      false;

  if (hardFailure) {
    return "attention";
  }

  const pending =
    regression.healthy == null ||
    smoke.healthy == null ||
    freshness.healthy == null ||
    schema.healthy == null;

  if (pending) {
    return "pending";
  }

  if (
    freshness.status ===
      "degraded"
  ) {
    return "degraded";
  }

  return "healthy";
}

export async function collectReleaseHealth({
  fetchImpl = fetch,
  repo =
    process.env.GITHUB_REPOSITORY,
  githubApiUrl =
    process.env.GITHUB_API_URL ||
    DEFAULT_GITHUB_API_URL,
  githubToken =
    process.env.GITHUB_TOKEN,
  productionUrl =
    process.env.POGO_PRODUCTION_URL ||
    DEFAULT_PRODUCTION_URL,
  timeoutMs = 10000
} = {}) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      String(
        repo || ""
      )
    )
  ) {
    throw new Error(
      "A valid GitHub repository is required."
    );
  }

  const apiBase =
    new URL(
      githubApiUrl
    );
  const token =
    githubHeadersToken(
      githubToken
    );

  const branchResponse =
    await fetchJson(
      fetchImpl,
      new URL(
        `/repos/${repo}/branches/${MAIN_BRANCH}`,
        apiBase
      ),
      {
        token,
        timeoutMs
      }
    );

  const sha =
    safeSha(
      branchResponse
        ?.body
        ?.commit
        ?.sha
    );

  if (
    !branchResponse.ok ||
    !sha
  ) {
    throw new Error(
      "Release health could not resolve the current main SHA."
    );
  }

  const runsResponse =
    await fetchJson(
      fetchImpl,
      new URL(
        `/repos/${repo}/actions/runs?branch=${MAIN_BRANCH}&per_page=50`,
        apiBase
      ),
      {
        token,
        timeoutMs
      }
    );

  const runs =
    runsResponse.ok &&
    Array.isArray(
      runsResponse
        ?.body
        ?.workflow_runs
    )
      ? runsResponse
          .body
          .workflow_runs
      : [];

  const regressionRun =
    chooseWorkflowRun(
      runs,
      WORKFLOW_NAMES.regression,
      sha
    );
  const smokeRun =
    chooseWorkflowRun(
      runs,
      WORKFLOW_NAMES.smoke,
      sha
    );
  const deploymentSmokeRun =
    choosePushWorkflowRun(
      runs,
      WORKFLOW_NAMES.smoke,
      sha
    );

  const regression = {
    ...workflowState(
      regressionRun
    ),
    url:
      runUrl(
        repo,
        regressionRun
      )
  };
  const smoke = {
    ...workflowState(
      smokeRun
    ),
    url:
      runUrl(
        repo,
        smokeRun
      )
  };

  const [
    freshnessResponse,
    schemaResponse
  ] =
    await Promise.all([
      fetchJson(
        fetchImpl,
        new URL(
          "/api/health/data-freshness",
          productionUrl
        ),
        {
          timeoutMs
        }
      ),
      fetchJson(
        fetchImpl,
        new URL(
          "/api/health/schema-compatibility",
          productionUrl
        ),
        {
          timeoutMs
        }
      )
    ]);

  const freshnessBody =
    freshnessResponse.body;
  const freshnessStatus =
    safeHealthStatus(
      freshnessBody?.status,
      [
        "healthy",
        "degraded",
        "stale",
        "unknown",
        "unavailable"
      ]
    );
  const freshness = {
    status:
      freshnessStatus,
    healthy:
      freshnessResponse.ok &&
      freshnessBody?.monitor_ok ===
        true &&
      [
        "healthy",
        "degraded"
      ].includes(
        freshnessStatus
      )
        ? true
        : (
            freshnessResponse.ok ||
            freshnessResponse.status ===
              503
          )
          ? false
          : null,
    counts:
      healthCounts(
        freshnessBody
      ),
    diagnostic:
      freshnessHealthDiagnostic(
        freshnessBody
      )
  };

  const schemaBody =
    schemaResponse.body;
  const schemaStatus =
    safeHealthStatus(
      schemaBody?.status,
      [
        "compatible",
        "incompatible",
        "unavailable"
      ]
    );
  const schema = {
    status:
      schemaStatus,
    healthy:
      schemaResponse.ok &&
      schemaBody?.monitor_ok ===
        true &&
      schemaStatus ===
        "compatible"
        ? true
        : (
            schemaResponse.ok ||
            schemaResponse.status ===
              503
          )
          ? false
          : null,
    missing_count:
      safeInteger(
        schemaBody
          ?.missing_count
      ),
    diagnostic:
      schemaHealthDiagnostic(
        schemaBody
      )
  };

  const overall =
    releaseOverallState({
      regression,
      smoke,
      freshness,
      schema
    });

  return {
    repo,
    sha,
    commit_url:
      `https://github.com/${repo}/commit/${sha}`,
    production_verified:
      workflowState(
        deploymentSmokeRun
      ).healthy ===
        true,
    overall,
    regression,
    smoke,
    freshness,
    schema
  };
}

function stateIcon(
  state
) {
  return {
    healthy: "✅",
    degraded: "⚠️",
    attention: "❌",
    pending: "⏳",
    success: "✅",
    failure: "❌",
    compatible: "✅",
    incompatible: "❌",
    unavailable: "⚪",
    stale: "❌",
    unknown: "❌",
    completed: "✅",
    missing: "⚪",
    queued: "⏳",
    in_progress: "⏳",
    waiting: "⏳",
    requested: "⏳",
    pending_run: "⏳"
  }[
    state
  ] || "⚪";
}

function workflowDisplay(
  workflow
) {
  if (
    workflow.status ===
      "completed"
  ) {
    return workflow.conclusion ||
      "unknown";
  }

  if (
    workflow.status ===
      "pending"
  ) {
    return "pending";
  }

  return workflow.status;
}

function markdownLink(
  label,
  url
) {
  return url
    ? `[${label}](${url})`
    : label;
}

export function renderReleaseHealthSummary(
  health
) {
  const overallIcon =
    stateIcon(
      health.overall
    );
  const regressionState =
    workflowDisplay(
      health.regression
    );
  const smokeState =
    workflowDisplay(
      health.smoke
    );

  const freshnessCounts =
    health.freshness.counts;
  const countText = [
    [
      "stale",
      freshnessCounts.stale
    ],
    [
      "missing",
      freshnessCounts.missing
    ],
    [
      "degraded",
      freshnessCounts.degraded
    ]
  ]
    .filter(
      ([, value]) =>
        value != null
    )
    .map(
      ([label, value]) =>
        `${label} ${value}`
    )
    .join(" · ");

  const freshnessDetails = [
    countText,
    health.freshness
      .diagnostic !==
      "none reported"
      ? `affected: ${health.freshness.diagnostic}`
      : null
  ]
    .filter(Boolean)
    .join(" · ") ||
    "No affected sources reported";

  const schemaDetails =
    health.schema
      .diagnostic !==
      "none reported"
      ? `missing: ${health.schema.diagnostic}`
      : (
          health.schema
            .missing_count != null
            ? `missing ${health.schema.missing_count}`
            : "No missing components reported"
        );

  const deploymentText =
    health.production_verified
      ? "production-verified by smoke"
      : "not yet production-verified by smoke";

  return [
    "# Release health",
    "",
    `**Overall:** ${overallIcon} ${health.overall}`,
    "",
    "| Signal | State | Details |",
    "| --- | --- | --- |",
    `| Deployment / main SHA | \`${health.sha.slice(0, 7)}\` | ${markdownLink(deploymentText, health.commit_url)} |`,
    `| Planner regression | ${stateIcon(regressionState)} ${regressionState} | ${markdownLink("workflow run", health.regression.url)} |`,
    `| Production smoke | ${stateIcon(smokeState)} ${smokeState} | ${markdownLink("workflow run", health.smoke.url)} |`,
    `| Data freshness | ${stateIcon(health.freshness.status)} ${health.freshness.status} | ${freshnessDetails} |`,
    `| Schema compatibility | ${stateIcon(health.schema.status)} ${health.schema.status} | ${schemaDetails} |`,
    "",
    "_This is a repository-owned operator summary. The SHA is the current GitHub main release under observation and is labeled production-verified only after Production smoke succeeds on that exact SHA. No private planner/calendar credentials, raw errors, source URLs, SQL, schema fingerprints, or component hashes are included._",
    ""
  ].join(
    "\n"
  );
}

async function main() {
  const health =
    await collectReleaseHealth();
  const summary =
    renderReleaseHealthSummary(
      health
    );

  console.log(
    summary
  );

  const summaryPath =
    String(
      process.env
        .GITHUB_STEP_SUMMARY ||
      ""
    ).trim();

  if (summaryPath) {
    await appendFile(
      summaryPath,
      summary,
      "utf8"
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(
      process.argv[1]
    ).href
) {
  main().catch(error => {
    console.error(
      error?.message ||
      String(error)
    );
    process.exitCode = 1;
  });
}

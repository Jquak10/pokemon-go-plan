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
const WORKFLOW_FILES = {
  smoke: "production-smoke.yml"
};
const DEFAULT_FETCH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 150;
const MAX_RETRY_DELAY_MS = 1000;

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

function chooseSuccessfulPushWorkflowRun(
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
          "push" &&
        safeWorkflowStatus(
          run?.status
        ) ===
          "completed" &&
        safeWorkflowConclusion(
          run?.conclusion
        ) ===
          "success"
    ) ||
    null
  );
}

function shouldRetryHttpResponse(
  response
) {
  const status =
    Number(
      response?.status
    );

  if (
    status === 429 ||
    status >= 500
  ) {
    return true;
  }

  if (
    status !== 403
  ) {
    return false;
  }

  const retryAfter =
    response.headers?.get?.(
      "retry-after"
    );
  const rateLimitRemaining =
    response.headers?.get?.(
      "x-ratelimit-remaining"
    );

  return Boolean(
    retryAfter
  ) ||
    rateLimitRemaining ===
      "0";
}

function retryDelayFor(
  attempt,
  retryDelayMs
) {
  return Math.min(
    Math.max(
      0,
      retryDelayMs
    ) *
      (2 ** Math.max(
        0,
        attempt - 1
      )),
    MAX_RETRY_DELAY_MS
  );
}

async function delay(
  milliseconds
) {
  if (
    milliseconds <= 0
  ) {
    return;
  }

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

async function fetchJson(
  fetchImpl,
  url,
  {
    token = null,
    timeoutMs = 10000,
    attempts =
      DEFAULT_FETCH_ATTEMPTS,
    retryDelayMs =
      DEFAULT_RETRY_DELAY_MS
  } = {}
) {
  const safeAttempts =
    Math.max(
      1,
      Math.min(
        5,
        Number.isInteger(
          attempts
        )
          ? attempts
          : DEFAULT_FETCH_ATTEMPTS
      )
    );

  const headers = {
    accept:
      "application/vnd.github+json, application/json"
  };

  if (token) {
    headers.authorization =
      `Bearer ${token}`;
  }

  let lastResult = {
    ok: false,
    status: null,
    body: null,
    evidence_available: false,
    attempts: 0
  };

  for (
    let attempt = 1;
    attempt <=
      safeAttempts;
    attempt += 1
  ) {
    const controller =
      new AbortController();
    const timer =
      setTimeout(
        () =>
          controller.abort(),
        timeoutMs
      );

    let retryable = false;

    try {
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
      const isJson =
        /application\/json/i.test(
          contentType
        );

      let body = null;
      let validJson = false;

      if (isJson) {
        try {
          body =
            await response.json();
          validJson = true;
        } catch {
          validJson = false;
        }
      }

      retryable =
        shouldRetryHttpResponse(
          response
        ) ||
        (
          response.ok &&
          !validJson
        );

      lastResult = {
        ok:
          response.ok &&
          validJson,
        status:
          response.status,
        body:
          validJson
            ? body
            : null,
        evidence_available:
          validJson,
        attempts:
          attempt
      };
    } catch {
      retryable = true;
      lastResult = {
        ok: false,
        status: null,
        body: null,
        evidence_available: false,
        attempts:
          attempt
      };
    } finally {
      clearTimeout(
        timer
      );
    }

    if (
      !retryable ||
      attempt ===
        safeAttempts
    ) {
      return lastResult;
    }

    await delay(
      retryDelayFor(
        attempt,
        retryDelayMs
      )
    );
  }

  return lastResult;
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
  timeoutMs = 10000,
  fetchAttempts =
    DEFAULT_FETCH_ATTEMPTS,
  retryDelayMs =
    DEFAULT_RETRY_DELAY_MS
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
        timeoutMs,
        attempts:
          fetchAttempts,
        retryDelayMs
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

  const [
    runsResponse,
    deploymentRunsResponse
  ] =
    await Promise.all([
      fetchJson(
        fetchImpl,
        new URL(
          `/repos/${repo}/actions/runs?branch=${MAIN_BRANCH}&per_page=50`,
          apiBase
        ),
        {
          token,
          timeoutMs,
          attempts:
            fetchAttempts,
          retryDelayMs
        }
      ),
      fetchJson(
        fetchImpl,
        new URL(
          `/repos/${repo}/actions/workflows/${WORKFLOW_FILES.smoke}/runs?branch=${MAIN_BRANCH}&event=push&head_sha=${sha}&per_page=10`,
          apiBase
        ),
        {
          token,
          timeoutMs,
          attempts:
            fetchAttempts,
          retryDelayMs
        }
      )
    ]);

  const runsEvidenceAvailable =
    runsResponse.ok &&
    Array.isArray(
      runsResponse
        ?.body
        ?.workflow_runs
    );
  const runs =
    runsEvidenceAvailable
      ? runsResponse
          .body
          .workflow_runs
      : [];

  const deploymentEvidenceAvailable =
    deploymentRunsResponse.ok &&
    Array.isArray(
      deploymentRunsResponse
        ?.body
        ?.workflow_runs
    );
  const deploymentRuns =
    deploymentEvidenceAvailable
      ? deploymentRunsResponse
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
    chooseSuccessfulPushWorkflowRun(
      deploymentRuns,
      WORKFLOW_NAMES.smoke,
      sha
    );

  const regression =
    runsEvidenceAvailable
      ? {
          ...workflowState(
            regressionRun
          ),
          url:
            runUrl(
              repo,
              regressionRun
            )
        }
      : {
          status:
            "unavailable",
          conclusion:
            null,
          healthy:
            null,
          url:
            null
        };

  const smoke =
    runsEvidenceAvailable
      ? {
          ...workflowState(
            smokeRun
          ),
          url:
            runUrl(
              repo,
              smokeRun
            )
        }
      : {
          status:
            "unavailable",
          conclusion:
            null,
          healthy:
            null,
          url:
            null
        };

  const productionVerification =
    !deploymentEvidenceAvailable
      ? {
          status:
            "unavailable",
          verified:
            null
        }
      : deploymentSmokeRun
        ? {
            status:
              "verified",
            verified:
              true
          }
        : {
            status:
              "unverified",
            verified:
              false
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
          timeoutMs,
          attempts:
            fetchAttempts,
          retryDelayMs
        }
      ),
      fetchJson(
        fetchImpl,
        new URL(
          "/api/health/schema-compatibility",
          productionUrl
        ),
        {
          timeoutMs,
          attempts:
            fetchAttempts,
          retryDelayMs
        }
      )
    ]);

  const freshnessBody =
    freshnessResponse.body;
  const freshnessAllowedStatuses = [
    "healthy",
    "degraded",
    "stale",
    "unknown",
    "unavailable"
  ];
  const freshnessStatus =
    safeHealthStatus(
      freshnessBody?.status,
      freshnessAllowedStatuses
    );
  const freshnessEvidenceAvailable =
    freshnessResponse
      .evidence_available ===
      true &&
    typeof freshnessBody
      ?.monitor_ok ===
      "boolean" &&
    freshnessAllowedStatuses
      .includes(
        String(
          freshnessBody
            ?.status || ""
        )
      );
  const freshness = {
    status:
      freshnessEvidenceAvailable
        ? freshnessStatus
        : "unavailable",
    healthy:
      !freshnessEvidenceAvailable
        ? null
        : (
            freshnessBody
              .monitor_ok ===
              true &&
            [
              "healthy",
              "degraded"
            ].includes(
              freshnessStatus
            )
          )
          ? true
          : false,
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
  const schemaAllowedStatuses = [
    "compatible",
    "incompatible",
    "unavailable"
  ];
  const schemaStatus =
    safeHealthStatus(
      schemaBody?.status,
      schemaAllowedStatuses
    );
  const schemaEvidenceAvailable =
    schemaResponse
      .evidence_available ===
      true &&
    typeof schemaBody
      ?.monitor_ok ===
      "boolean" &&
    schemaAllowedStatuses
      .includes(
        String(
          schemaBody
            ?.status || ""
        )
      );
  const schema = {
    status:
      schemaEvidenceAvailable
        ? schemaStatus
        : "unavailable",
    healthy:
      !schemaEvidenceAvailable
        ? null
        : (
            schemaBody
              .monitor_ok ===
              true &&
            schemaStatus ===
              "compatible"
          )
          ? true
          : false,
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

  let overall =
    releaseOverallState({
      regression,
      smoke,
      freshness,
      schema
    });

  if (
    overall !==
      "attention" &&
    productionVerification
      .status ===
      "unavailable"
  ) {
    overall =
      "pending";
  }

  return {
    repo,
    sha,
    commit_url:
      `https://github.com/${repo}/commit/${sha}`,
    production_verified:
      productionVerification
        .verified,
    production_verification:
      productionVerification,
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
    health
      .production_verification
      ?.status ===
      "verified"
      ? "production-verified by smoke"
      : health
          .production_verification
          ?.status ===
          "unavailable"
        ? "deployment verification unavailable"
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

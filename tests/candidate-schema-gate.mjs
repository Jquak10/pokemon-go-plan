import {
  REQUIRED_SCHEMA,
  SCHEMA_COMPONENT_HASH_ALGORITHM,
  evaluateSchemaComponentHashes,
  requiredSchemaComponentIdentifiers,
  schemaContractFingerprint
} from "../src/schema-health.js";
import { pathToFileURL } from "node:url";

export const BL054_BOOTSTRAP_SCHEMA_FINGERPRINT =
  "fc091e7aa216ead7a076ed540e76a947244d00ecefee51c62a8ad4ae4537dc9d";

const DEFAULT_PRODUCTION_URL =
  "https://pogo-plan.jquak-10.workers.dev";

async function responseJson(response, label) {
  const contentType =
    response.headers?.get?.("content-type") || "";

  if (!/application\/json/i.test(contentType)) {
    throw new Error(
      `${label} returned an unexpected content type: ${contentType || "missing"}`
    );
  }

  return response.json();
}

async function fetchWithTimeout(
  fetchImpl,
  url,
  timeoutMs
) {
  const controller =
    new AbortController();
  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetchImpl(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json"
        },
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function checkProductionSchemaRelease({
  fetchImpl = fetch,
  baseUrl =
    process.env.POGO_PRODUCTION_URL ||
    DEFAULT_PRODUCTION_URL,
  requiredSchema = REQUIRED_SCHEMA,
  bootstrapFingerprint =
    BL054_BOOTSTRAP_SCHEMA_FINGERPRINT,
  timeoutMs = 10000
} = {}) {
  const candidateFingerprint =
    await schemaContractFingerprint(
      requiredSchema
    );

  const snapshotUrl =
    new URL(
      "/api/health/schema-components",
      baseUrl
    );

  const snapshotResponse =
    await fetchWithTimeout(
      fetchImpl,
      snapshotUrl,
      timeoutMs
    );

  if (snapshotResponse.status === 404) {
    if (
      candidateFingerprint !==
      bootstrapFingerprint
    ) {
      throw new Error(
        "Production does not yet expose the BL-054 schema snapshot endpoint, and this candidate changes the required schema contract. Apply the required production migration before release and ensure the BL-054 endpoint is deployed before merging this schema-changing candidate."
      );
    }

    const compatibilityResponse =
      await fetchWithTimeout(
        fetchImpl,
        new URL(
          "/api/health/schema-compatibility",
          baseUrl
        ),
        timeoutMs
      );

    const compatibilityBody =
      await responseJson(
        compatibilityResponse,
        "Production schema compatibility"
      );

    if (
      compatibilityResponse.status !== 200 ||
      compatibilityBody?.monitor_ok !== true ||
      compatibilityBody?.status !== "compatible"
    ) {
      throw new Error(
        `Bootstrap production schema compatibility is not healthy: ${compatibilityBody?.status || compatibilityResponse.status}`
      );
    }

    return {
      ok: true,
      mode: "bootstrap",
      candidate_fingerprint:
        candidateFingerprint,
      required_component_count:
        requiredSchemaComponentIdentifiers(
          requiredSchema
        ).length
    };
  }

  const snapshotBody =
    await responseJson(
      snapshotResponse,
      "Production schema component snapshot"
    );

  if (snapshotResponse.status !== 200) {
    throw new Error(
      `Production schema component snapshot is unavailable: ${snapshotBody?.status || snapshotResponse.status}`
    );
  }

  if (
    snapshotBody?.status !== "available" ||
    snapshotBody?.algorithm !==
      SCHEMA_COMPONENT_HASH_ALGORITHM ||
    !Array.isArray(
      snapshotBody?.component_hashes
    )
  ) {
    throw new Error(
      "Production schema component snapshot has an invalid contract."
    );
  }

  const compatibility =
    await evaluateSchemaComponentHashes(
      snapshotBody.component_hashes,
      requiredSchema
    );

  if (!compatibility.monitor_ok) {
    throw new Error(
      `Production D1 is missing candidate-required schema components: ${compatibility.missing_components.join(", ")}`
    );
  }

  return {
    ok: true,
    mode: "hashed_snapshot",
    candidate_fingerprint:
      candidateFingerprint,
    required_component_count:
      snapshotBody.component_count ?? null
  };
}

async function main() {
  const result =
    await checkProductionSchemaRelease();

  console.log(
    `Candidate schema release gate passed via ${result.mode}.`
  );
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

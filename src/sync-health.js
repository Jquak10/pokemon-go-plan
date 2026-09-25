export const SYNC_HEALTH_GROUPS =
  Object.freeze({
    EVENT: "event",
    OFFICIAL: "official",
    META: "meta"
  });

function normalizedExpectedSources(
  expectedSources
) {
  const byKey =
    new Map();

  for (
    const source of
    Array.isArray(expectedSources)
      ? expectedSources
      : []
  ) {
    const key =
      String(
        source?.source_key ||
        source?.key ||
        ""
      ).trim();

    if (!key) {
      continue;
    }

    byKey.set(
      key,
      {
        source_key: key,
        source_label:
          String(
            source?.source_label ||
            source?.label ||
            key
          ).trim() ||
          key
      }
    );
  }

  return [
    ...byKey.values()
  ];
}

function healthSource(row) {
  return {
    source_key:
      String(
        row?.source_key || ""
      ),
    source_label:
      String(
        row?.source_label ||
        row?.source_key ||
        ""
      ),
    source_url:
      row?.source_url || null,
    last_attempt_at:
      row?.last_attempt_at || null,
    last_success_at:
      row?.last_success_at || null,
    last_error:
      row?.last_error || null,
    item_count:
      row?.item_count == null
        ? null
        : Number(
            row.item_count
          )
  };
}

export function summarizeSyncHealth(
  rows,
  expectedSources,
  fallbackUpdatedAt = null
) {
  const expected =
    normalizedExpectedSources(
      expectedSources
    );

  if (!expected.length) {
    return {
      status: "not_applicable",
      updated_at: null,
      source_count: 0,
      degraded_count: 0,
      missing_count: 0,
      degraded_sources: [],
      missing_sources: [],
      sources: []
    };
  }

  const rowMap =
    new Map(
      (Array.isArray(rows)
        ? rows
        : []
      )
        .map(healthSource)
        .filter(
          row =>
            row.source_key
        )
        .map(
          row => [
            row.source_key,
            row
          ]
        )
    );

  const sources = [];
  const missingSources = [];
  const degradedSources = [];

  for (const expectedSource of expected) {
    const row =
      rowMap.get(
        expectedSource.source_key
      );

    if (!row) {
      missingSources.push(
        expectedSource
      );
      continue;
    }

    const source = {
      ...row,
      source_label:
        row.source_label ||
        expectedSource.source_label
    };

    sources.push(source);

    if (
      source.last_error ||
      !source.last_success_at
    ) {
      degradedSources.push(
        source
      );
    }
  }

  const successTimes =
    sources
      .map(
        source =>
          source.last_success_at
      )
      .filter(Boolean)
      .sort();

  let status = "healthy";

  if (degradedSources.length) {
    status = "degraded";
  } else if (
    missingSources.length
  ) {
    status = "unknown";
  }

  return {
    status,
    updated_at:
      successTimes[0] ||
      fallbackUpdatedAt ||
      null,
    source_count:
      expected.length,
    degraded_count:
      degradedSources.length,
    missing_count:
      missingSources.length,
    degraded_sources:
      degradedSources,
    missing_sources:
      missingSources,
    sources
  };
}


export const PRODUCTION_FRESHNESS_STALE_AFTER_MS =
  18 * 60 * 60 * 1000;

function productionExpectedSources(
  expectedSources
) {
  const byKey =
    new Map();

  for (
    const source of
    Array.isArray(
      expectedSources
    )
      ? expectedSources
      : []
  ) {
    const key =
      String(
        source?.source_key ||
        source?.key ||
        ""
      ).trim();

    if (!key) {
      continue;
    }

    byKey.set(
      key,
      {
        source_key: key,
        source_group:
          String(
            source?.source_group ||
            source?.group ||
            "unknown"
          ).trim() ||
          "unknown",
        source_label:
          String(
            source?.source_label ||
            source?.label ||
            key
          ).trim() ||
          key
      }
    );
  }

  return [
    ...byKey.values()
  ];
}

function parsedTimestampMs(
  value
) {
  const parsed =
    Date.parse(
      String(
        value || ""
      )
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}

function monitoredSource(
  expected,
  row,
  nowMs,
  staleAfterMs
) {
  if (!row) {
    return {
      ...expected,
      status: "missing",
      last_attempt_at: null,
      last_success_at: null,
      item_count: null
    };
  }

  const source =
    healthSource(
      row
    );

  const lastSuccessMs =
    parsedTimestampMs(
      source.last_success_at
    );

  if (
    lastSuccessMs == null
  ) {
    return {
      ...expected,
      status: "missing",
      last_attempt_at:
        source.last_attempt_at,
      last_success_at:
        source.last_success_at,
      item_count:
        source.item_count
    };
  }

  const ageMs =
    Math.max(
      0,
      nowMs -
        lastSuccessMs
    );

  let status =
    "healthy";

  if (
    ageMs >=
      staleAfterMs
  ) {
    status =
      "stale";
  } else if (
    source.last_error
  ) {
    status =
      "degraded";
  }

  return {
    ...expected,
    status,
    last_attempt_at:
      source.last_attempt_at,
    last_success_at:
      source.last_success_at,
    item_count:
      source.item_count
  };
}

function freshnessGroup(
  sources
) {
  const staleSources =
    sources.filter(
      source =>
        source.status ===
        "stale"
    );
  const missingSources =
    sources.filter(
      source =>
        source.status ===
        "missing"
    );
  const degradedSources =
    sources.filter(
      source =>
        source.status ===
        "degraded"
    );

  let status =
    "healthy";

  if (
    staleSources.length
  ) {
    status =
      "stale";
  } else if (
    missingSources.length
  ) {
    status =
      "unknown";
  } else if (
    degradedSources.length
  ) {
    status =
      "degraded";
  }

  const successTimes =
    sources
      .map(
        source =>
          source.last_success_at
      )
      .filter(Boolean)
      .sort();

  const attemptTimes =
    sources
      .map(
        source =>
          source.last_attempt_at
      )
      .filter(Boolean)
      .sort();

  return {
    status,
    source_count:
      sources.length,
    stale_count:
      staleSources.length,
    missing_count:
      missingSources.length,
    degraded_count:
      degradedSources.length,
    oldest_success_at:
      successTimes[0] ||
      null,
    newest_attempt_at:
      attemptTimes.at(-1) ||
      null,
    stale_sources:
      staleSources,
    missing_sources:
      missingSources,
    degraded_sources:
      degradedSources
  };
}

export function evaluateProductionFreshness(
  rows,
  expectedSources,
  {
    now =
      new Date(),
    staleAfterMs =
      PRODUCTION_FRESHNESS_STALE_AFTER_MS
  } = {}
) {
  const expected =
    productionExpectedSources(
      expectedSources
    );

  const nowMs =
    now instanceof Date
      ? now.getTime()
      : parsedTimestampMs(
          now
        );

  if (
    !Number.isFinite(
      nowMs
    )
  ) {
    throw new TypeError(
      "A valid freshness evaluation time is required."
    );
  }

  const threshold =
    Number(
      staleAfterMs
    );

  if (
    !Number.isFinite(
      threshold
    ) ||
    threshold <= 0
  ) {
    throw new TypeError(
      "A positive freshness threshold is required."
    );
  }

  const rowMap =
    new Map(
      (Array.isArray(rows)
        ? rows
        : []
      )
        .map(
          row => [
            String(
              row?.source_key ||
              ""
            ),
            row
          ]
        )
        .filter(
          entry =>
            entry[0]
        )
    );

  const sources =
    expected.map(
      source =>
        monitoredSource(
          source,
          rowMap.get(
            source.source_key
          ),
          nowMs,
          threshold
        )
    );

  const groupMap =
    new Map();

  for (const source of sources) {
    const group =
      source.source_group;

    if (
      !groupMap.has(
        group
      )
    ) {
      groupMap.set(
        group,
        []
      );
    }

    groupMap
      .get(
        group
      )
      .push(
        source
      );
  }

  const groups =
    Object.fromEntries(
      [
        ...groupMap.entries()
      ].map(
        ([
          group,
          groupSources
        ]) => [
          group,
          freshnessGroup(
            groupSources
          )
        ]
      )
    );

  const overall =
    freshnessGroup(
      sources
    );

  return {
    monitor_ok:
      overall.stale_count ===
        0 &&
      overall.missing_count ===
        0,
    status:
      overall.status,
    checked_at:
      new Date(
        nowMs
      ).toISOString(),
    stale_after_hours:
      threshold /
      (60 * 60 * 1000),
    source_count:
      overall.source_count,
    stale_count:
      overall.stale_count,
    missing_count:
      overall.missing_count,
    degraded_count:
      overall.degraded_count,
    oldest_success_at:
      overall.oldest_success_at,
    newest_attempt_at:
      overall.newest_attempt_at,
    groups,
    sources
  };
}

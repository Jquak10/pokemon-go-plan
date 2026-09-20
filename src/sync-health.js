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

// Pure iCalendar parsing/date helpers used by the Worker.
// Fetching, persistence, event suppression, personalization, and feed routing stay in index.js.

export function addDaysIso(
  dateValue,
  days
) {
  const match =
    String(
      dateValue || ""
    ).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]) +
          Number(days || 0)
      )
    );

  return date
    .toISOString()
    .slice(0, 10);
}

export function escapeIcs(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /\r?\n/g,
      "\\n"
    )
    .replace(
      /,/g,
      "\\,"
    )
    .replace(
      /;/g,
      "\\;"
    );
}

export function unescapeIcs(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /\\n/gi,
      "\n"
    )
    .replace(
      /\\,/g,
      ","
    )
    .replace(
      /\\;/g,
      ";"
    )
    .replace(
      /\\\\/g,
      "\\"
    );
}

export function unfoldIcs(
  text
) {
  return String(text)
    .replace(
      /\r\n[ \t]/g,
      ""
    )
    .replace(
      /\n[ \t]/g,
      ""
    )
    .replace(
      /\r/g,
      ""
    );
}

export function firstProperty(
  lines,
  name
) {
  const upper =
    String(name || "")
      .toUpperCase();

  for (
    const line of
    Array.isArray(lines)
      ? lines
      : []
  ) {
    const colon =
      line.indexOf(":");

    if (colon < 0) {
      continue;
    }

    const left =
      line.slice(
        0,
        colon
      );

    const propertyName =
      left
        .split(";")[0]
        .toUpperCase();

    if (
      propertyName === upper
    ) {
      return {
        line,
        left,
        value:
          line.slice(
            colon + 1
          )
      };
    }
  }

  return null;
}

export function dateFromPropertyLine(
  line
) {
  if (!line) {
    return null;
  }

  const colon =
    line.indexOf(":");

  if (colon < 0) {
    return null;
  }

  const raw =
    line.slice(
      colon + 1
    );

  const match =
    raw.match(
      /^(\d{4})(\d{2})(\d{2})/
    );

  if (!match) {
    return null;
  }

  return (
    `${match[1]}-` +
    `${match[2]}-` +
    match[3]
  );
}

export function inclusiveEndDateFromPropertyLine(
  line,
  fallbackStartDate = null
) {
  const endDate =
    dateFromPropertyLine(
      line
    );

  if (!endDate) {
    return fallbackStartDate;
  }

  const colon =
    line.indexOf(":");

  const left =
    colon >= 0
      ? line
          .slice(
            0,
            colon
          )
          .toUpperCase()
      : "";

  const raw =
    colon >= 0
      ? line
          .slice(
            colon + 1
          )
          .trim()
      : "";

  const isAllDay =
    left.includes(
      "VALUE=DATE"
    ) ||
    /^\d{8}$/.test(
      raw
    );

  if (!isAllDay) {
    return endDate;
  }

  // RFC 5545 all-day DTEND is exclusive. Internally the app compares
  // inclusive calendar days, so subtract one day before storing/using it.
  const adjusted =
    addDaysIso(
      endDate,
      -1
    );

  if (!adjusted) {
    return (
      fallbackStartDate ||
      endDate
    );
  }

  if (
    fallbackStartDate &&
    adjusted <
      fallbackStartDate
  ) {
    return fallbackStartDate;
  }

  return adjusted;
}

export function parseIcsEvents(
  text
) {
  const unfolded =
    unfoldIcs(text);

  const blocks =
    unfolded.match(
      /BEGIN:VEVENT\n[\s\S]*?\nEND:VEVENT/g
    ) || [];

  return blocks
    .map(
      block => {
        const lines =
          block
            .split("\n")
            .filter(
              line =>
                line &&
                line !==
                  "BEGIN:VEVENT" &&
                line !==
                  "END:VEVENT"
            );

        const summaryProp =
          firstProperty(
            lines,
            "SUMMARY"
          );

        const descriptionProp =
          firstProperty(
            lines,
            "DESCRIPTION"
          );

        const uidProp =
          firstProperty(
            lines,
            "UID"
          );

        const dtstartProp =
          firstProperty(
            lines,
            "DTSTART"
          );

        const dtendProp =
          firstProperty(
            lines,
            "DTEND"
          );

        const urlProp =
          firstProperty(
            lines,
            "URL"
          );

        if (
          !summaryProp ||
          !dtstartProp
        ) {
          return null;
        }

        const otherLines =
          lines.filter(
            line => {
              const colon =
                line.indexOf(
                  ":"
                );

              if (colon < 0) {
                return true;
              }

              const name =
                line
                  .slice(
                    0,
                    colon
                  )
                  .split(";")[0]
                  .toUpperCase();

              return ![
                "SUMMARY",
                "DESCRIPTION",
                "DTSTART",
                "DTEND",
                "SEQUENCE",
                "STATUS"
              ].includes(
                name
              );
            }
          );

        const startDate =
          dateFromPropertyLine(
            dtstartProp.line
          );

        return {
          source_uid:
            uidProp
              ? uidProp.value
              : null,
          summary:
            unescapeIcs(
              summaryProp.value
            ),
          description:
            descriptionProp
              ? unescapeIcs(
                  descriptionProp
                    .value
                )
              : "",
          dtstart_line:
            dtstartProp.line,
          dtend_line:
            dtendProp
              ? dtendProp.line
              : null,
          other_lines:
            otherLines.join(
              "\n"
            ),
          start_date:
            startDate,
          end_date:
            dtendProp
              ? inclusiveEndDateFromPropertyLine(
                  dtendProp.line,
                  startDate
                )
              : startDate,
          source_url:
            urlProp
              ? urlProp.value
              : null
        };
      }
    )
    .filter(Boolean);
}

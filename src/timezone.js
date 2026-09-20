export const DEFAULT_TIMEZONE = "Asia/Singapore";
export const TIMEZONE_ERROR =
  "Enter a valid IANA timezone, such as Asia/Singapore.";

export function canonicalTimeZone(value) {
  const candidate =
    String(value ?? "").trim();

  if (
    !candidate ||
    candidate.length > 80
  ) {
    return null;
  }

  try {
    return (
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: candidate
        }
      )
        .resolvedOptions()
        .timeZone ||
      null
    );
  } catch {
    return null;
  }
}

export function isValidTimeZone(value) {
  return canonicalTimeZone(value) !== null;
}

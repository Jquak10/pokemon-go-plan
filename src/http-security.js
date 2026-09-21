function htmlContentSecurityPolicy({
  allowInlineScript = true
} = {}) {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    allowInlineScript
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'"
  ].join("; ");
}

export function json(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control":
          "no-store",
        "referrer-policy":
          "no-referrer",
        "x-content-type-options":
          "nosniff",
        ...headers
      }
    }
  );
}

export function bad(
  message,
  status = 400
) {
  return json(
    {
      error:
        message
    },
    status
  );
}

export function manageTokenFromRequest(
  request,
  body = null
) {
  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  const bearer =
    authorization.match(
      /^Bearer\s+(.+)$/i
    )?.[1]?.trim();

  const headerToken =
    request.headers.get(
      "x-manage-token"
    )?.trim();

  if (bearer) {
    return bearer;
  }

  if (headerToken) {
    return headerToken;
  }

  const bodyToken =
    body &&
    typeof body === "object"
      ? String(
          body.token || ""
        ).trim()
      : "";

  if (bodyToken) {
    return bodyToken;
  }

  const url =
    new URL(
      request.url
    );

  return (
    url.searchParams.get(
      "token"
    ) || ""
  ).trim();
}

export function adminKeyFromRequest(
  request,
  body = null
) {
  const headerKey =
    request.headers.get(
      "x-admin-key"
    )?.trim();

  if (headerKey) {
    return headerKey;
  }

  const bodyKey =
    body &&
    typeof body === "object"
      ? String(
          body.key || ""
        ).trim()
      : "";

  if (bodyKey) {
    return bodyKey;
  }

  const url =
    new URL(
      request.url
    );

  return (
    url.searchParams.get(
      "key"
    ) || ""
  ).trim();
}

export function hardenResponse(
  response,
  {
    noStore = false,
    allowInlineScript = true
  } = {}
) {
  const headers =
    new Headers(
      response.headers
    );

  headers.set(
    "referrer-policy",
    "no-referrer"
  );

  headers.set(
    "x-content-type-options",
    "nosniff"
  );

  if (noStore) {
    headers.set(
      "cache-control",
      "private, no-store, max-age=0"
    );

    headers.set(
      "pragma",
      "no-cache"
    );

    headers.set(
      "expires",
      "0"
    );
  }

  if (
    /text\/html/i.test(
      headers.get(
        "content-type"
      ) || ""
    )
  ) {
    headers.set(
      "content-security-policy",
      htmlContentSecurityPolicy({
        allowInlineScript
      })
    );

    headers.set(
      "x-frame-options",
      "DENY"
    );

    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );

    headers.set(
      "cross-origin-opener-policy",
      "same-origin"
    );

    headers.set(
      "cross-origin-resource-policy",
      "same-origin"
    );
  }

  return new Response(
    response.body,
    {
      status:
        response.status,
      statusText:
        response.statusText,
      headers
    }
  );
}

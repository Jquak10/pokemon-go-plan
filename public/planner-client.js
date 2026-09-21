// Shared Planner client helpers.
// Keep this as a classic script so the framework-free Planner can share one
// authenticated transport and response-normalization boundary.
(() => {
  function managementTokenFromPath(
    pathname
  ) {
    return String(
      pathname || ""
    )
      .split("/")
      .filter(Boolean)[1] || "";
  }

  function esc(value) {
    return String(
      value ?? ""
    ).replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
    );
  }

  function formatNumber(value) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number.toLocaleString()
      : "—";
  }

  function buildManagedApiRequest({
    token,
    path,
    options = {},
    origin
  }) {
    const url =
      new URL(
        path,
        origin
      );

    // Older call sites may still construct ?token= URLs or include token in
    // JSON. Strip both before the browser sends the request. The Worker keeps
    // accepting those historical forms for legacy external callers.
    url.searchParams.delete(
      "token"
    );

    const headers =
      new Headers(
        options.headers || {}
      );

    headers.set(
      "authorization",
      `Bearer ${token}`
    );

    let body =
      options.body;

    if (
      typeof body === "string" &&
      /application\/json/i.test(
        headers.get(
          "content-type"
        ) || ""
      )
    ) {
      try {
        const parsed =
          JSON.parse(
            body
          );

        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(
            parsed
          )
        ) {
          delete parsed.token;
          body =
            JSON.stringify(
              parsed
            );
        }
      } catch {}
    }

    return {
      url:
        `${url.pathname}${url.search}${url.hash}`,
      options: {
        ...options,
        headers,
        body,
        referrerPolicy:
          "no-referrer"
      }
    };
  }

  class PlannerApiError extends Error {
    constructor(
      message,
      {
        kind = "response",
        status = null,
        retryable = false,
        cause = null
      } = {}
    ) {
      super(message);
      this.name =
        "PlannerApiError";
      this.kind = kind;
      this.status =
        status == null
          ? null
          : Number(status);
      this.retryable =
        Boolean(retryable);

      if (cause) {
        this.cause = cause;
      }
    }
  }

  function responseStatus(
    response
  ) {
    const status =
      Number(
        response?.status
      );

    return Number.isFinite(
      status
    ) && status > 0
      ? status
      : null;
  }

  function responseFailureMessage(
    response
  ) {
    const status =
      responseStatus(
        response
      );

    if (
      status === 401 ||
      status === 403
    ) {
      return "This Planner link is no longer authorized. Open your current private management link and try again.";
    }

    if (status === 404) {
      return "The Planner service could not find this resource. Refresh the page and try again.";
    }

    if (status === 429) {
      return "The Planner service is receiving too many requests. Wait a moment and try again.";
    }

    if (
      status != null &&
      status >= 500
    ) {
      return `The Planner service is temporarily unavailable (HTTP ${status}). Please try again.`;
    }

    if (status != null) {
      return `Planner request failed (HTTP ${status}). Please try again.`;
    }

    return "Planner request failed. Please try again.";
  }

  function structuredErrorMessage(
    data
  ) {
    if (
      !data ||
      typeof data !==
        "object" ||
      Array.isArray(data)
    ) {
      return "";
    }

    for (
      const key of
      [
        "error",
        "message"
      ]
    ) {
      const value =
        data[key];

      if (
        typeof value ===
          "string" &&
        value.trim()
      ) {
        return value.trim();
      }
    }

    return "";
  }

  async function readApiResponse(
    response
  ) {
    let text;

    try {
      text =
        await response.text();
    } catch (error) {
      throw new PlannerApiError(
        "The Planner service response could not be read. Please try again.",
        {
          kind:
            "response-read",
          status:
            responseStatus(
              response
            ),
          retryable:
            true,
          cause:
            error
        }
      );
    }

    if (
      !String(
        text ?? ""
      ).trim()
    ) {
      if (!response.ok) {
        throw new PlannerApiError(
          responseFailureMessage(
            response
          ),
          {
            kind:
              "http",
            status:
              responseStatus(
                response
              ),
            retryable:
              responseStatus(
                response
              ) == null ||
              responseStatus(
                response
              ) >= 500 ||
              responseStatus(
                response
              ) === 429
          }
        );
      }

      throw new PlannerApiError(
        "The Planner service returned an empty response. Refresh the page and try again.",
        {
          kind:
            "empty-response",
          status:
            responseStatus(
              response
            ),
          retryable:
            true
        }
      );
    }

    let data;

    try {
      data =
        JSON.parse(text);
    } catch (error) {
      if (!response.ok) {
        throw new PlannerApiError(
          responseFailureMessage(
            response
          ),
          {
            kind:
              "http",
            status:
              responseStatus(
                response
              ),
            retryable:
              responseStatus(
                response
              ) == null ||
              responseStatus(
                response
              ) >= 500 ||
              responseStatus(
                response
              ) === 429,
            cause:
              error
          }
        );
      }

      throw new PlannerApiError(
        "The Planner service returned an unreadable response. Refresh the page and try again.",
        {
          kind:
            "invalid-response",
          status:
            responseStatus(
              response
            ),
          retryable:
            true,
          cause:
            error
        }
      );
    }

    if (!response.ok) {
      throw new PlannerApiError(
        structuredErrorMessage(
          data
        ) ||
        responseFailureMessage(
          response
        ),
        {
          kind:
            "http",
          status:
            responseStatus(
              response
            ),
          retryable:
            responseStatus(
              response
            ) == null ||
            responseStatus(
              response
            ) >= 500 ||
            responseStatus(
              response
            ) === 429
        }
      );
    }

    return data;
  }

  function createApiClient({
    token,
    tokenProvider = null,
    origin,
    fetchImpl
  }) {
    return async function api(
      path,
      options = {}
    ) {
      const request =
        buildManagedApiRequest({
          token:
            tokenProvider
              ? tokenProvider()
              : token,
          path,
          options,
          origin
        });

      let response;

      try {
        response =
          await fetchImpl(
            request.url,
            request.options
          );
      } catch (error) {
        throw new PlannerApiError(
          "Could not reach the Planner service. Check your internet connection and try again.",
          {
            kind:
              "network",
            retryable:
              true,
            cause:
              error
          }
        );
      }

      return readApiResponse(
        response
      );
    };
  }

  let token =
    managementTokenFromPath(
      globalThis.location?.pathname
    );

  function setToken(
    nextToken
  ) {
    const value =
      String(
        nextToken || ""
      ).trim();

    if (!value) {
      throw new Error(
        "A management token is required."
      );
    }

    token = value;

    return token;
  }

  const origin =
    globalThis.location?.origin ||
    "http://localhost";

  const api =
    createApiClient({
      tokenProvider:
        () => token,
      origin,
      fetchImpl:
        (...args) =>
          globalThis.fetch(
            ...args
          )
    });

  globalThis.PlannerClient =
    Object.freeze({
      get token() {
        return token;
      },
      setToken,
      api,
      esc,
      formatNumber,
      managementTokenFromPath,
      buildManagedApiRequest,
      createApiClient,
      readApiResponse,
      responseFailureMessage,
      PlannerApiError
    });
})();

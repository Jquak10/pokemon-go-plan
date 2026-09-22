// Shared JSON API response normalization for public/Admin surfaces.
// Keep this as a classic script so framework-free pages can share one
// status-aware response and transport boundary without coupling to Planner auth.
(() => {
  class JsonApiError extends Error {
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
        "JsonApiError";
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

  function responseFailureMessage(
    response,
    serviceName
  ) {
    const status =
      responseStatus(
        response
      );

    if (
      status === 401 ||
      status === 403
    ) {
      return `The ${serviceName} request is not authorized. Check your credentials and try again.`;
    }

    if (status === 404) {
      return `The ${serviceName} could not find this resource. Refresh the page and try again.`;
    }

    if (status === 429) {
      return `The ${serviceName} is receiving too many requests. Wait a moment and try again.`;
    }

    if (
      status != null &&
      status >= 500
    ) {
      return `The ${serviceName} is temporarily unavailable (HTTP ${status}). Please try again.`;
    }

    if (status != null) {
      return `The ${serviceName} request failed (HTTP ${status}). Please try again.`;
    }

    return `The ${serviceName} request failed. Please try again.`;
  }

  function retryableStatus(
    response
  ) {
    const status =
      responseStatus(
        response
      );

    return (
      status == null ||
      status >= 500 ||
      status === 429
    );
  }

  async function readJsonResponse(
    response,
    {
      serviceName =
        "service"
    } = {}
  ) {
    let text;

    try {
      text =
        await response.text();
    } catch (error) {
      throw new JsonApiError(
        `The ${serviceName} response could not be read. Please try again.`,
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
        throw new JsonApiError(
          responseFailureMessage(
            response,
            serviceName
          ),
          {
            kind:
              "http",
            status:
              responseStatus(
                response
              ),
            retryable:
              retryableStatus(
                response
              )
          }
        );
      }

      throw new JsonApiError(
        `The ${serviceName} returned an empty response. Refresh the page and try again.`,
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
        throw new JsonApiError(
          responseFailureMessage(
            response,
            serviceName
          ),
          {
            kind:
              "http",
            status:
              responseStatus(
                response
              ),
            retryable:
              retryableStatus(
                response
              ),
            cause:
              error
          }
        );
      }

      throw new JsonApiError(
        `The ${serviceName} returned an unreadable response. Refresh the page and try again.`,
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
      throw new JsonApiError(
        structuredErrorMessage(
          data
        ) ||
        responseFailureMessage(
          response,
          serviceName
        ),
        {
          kind:
            "http",
          status:
            responseStatus(
              response
            ),
          retryable:
            retryableStatus(
              response
            )
        }
      );
    }

    return data;
  }

  async function fetchJson(
    input,
    init = {},
    {
      fetchImpl =
        globalThis.fetch,
      serviceName =
        "service"
    } = {}
  ) {
    let response;

    try {
      response =
        await fetchImpl(
          input,
          init
        );
    } catch (error) {
      throw new JsonApiError(
        `Could not reach the ${serviceName}. Check your internet connection and try again.`,
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

    return readJsonResponse(
      response,
      {
        serviceName
      }
    );
  }

  globalThis.JsonApiClient = {
    JsonApiError,
    fetchJson,
    readJsonResponse,
    responseFailureMessage,
    structuredErrorMessage
  };
})();

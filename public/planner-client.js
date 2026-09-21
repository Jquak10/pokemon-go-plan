// Shared Planner client helpers.
// Keep this as a classic script so manage.html can remain framework-free while
// cohesive client infrastructure moves out of the large inline integration file.
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

      const response =
        await fetchImpl(
          request.url,
          request.options
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Request failed."
        );
      }

      return data;
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
      createApiClient
    });
})();

// Browser-side timezone validation and searchable IANA suggestions.
(() => {
  const MESSAGE =
    "Enter a valid IANA timezone, such as Asia/Singapore.";

  function parse(value) {
    const candidate =
      String(value ?? "").trim();

    if (
      !candidate ||
      candidate.length > 80
    ) {
      return {
        valid: false,
        timezone: null,
        message: MESSAGE
      };
    }

    try {
      const timezone =
        new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone: candidate
          }
        )
          .resolvedOptions()
          .timeZone;

      return {
        valid: Boolean(timezone),
        timezone:
          timezone || null,
        message:
          timezone ? "" : MESSAGE
      };
    } catch {
      return {
        valid: false,
        timezone: null,
        message: MESSAGE
      };
    }
  }

  function validateInput(
    input,
    {
      report = false
    } = {}
  ) {
    const result =
      parse(input?.value);

    if (input) {
      input.setCustomValidity(
        result.valid
          ? ""
          : result.message
      );

      if (
        result.valid &&
        result.timezone
      ) {
        input.value =
          result.timezone;
      }

      if (
        report &&
        !result.valid
      ) {
        input.reportValidity();
      }
    }

    return result;
  }

  function attachSuggestions(
    input,
    datalist
  ) {
    if (!input) {
      return;
    }

    input.addEventListener(
      "input",
      () =>
        input.setCustomValidity("")
    );

    if (
      !datalist ||
      typeof Intl.supportedValuesOf !==
        "function"
    ) {
      return;
    }

    const values =
      Intl.supportedValuesOf(
        "timeZone"
      );

    const fragment =
      document.createDocumentFragment();

    for (const timezone of values) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        timezone;

      fragment.appendChild(
        option
      );
    }

    datalist.replaceChildren(
      fragment
    );
  }

  globalThis.TimezoneValidation =
    Object.freeze({
      MESSAGE,
      parse,
      validateInput,
      attachSuggestions
    });
})();

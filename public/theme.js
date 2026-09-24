(() => {
  "use strict";

  const STORAGE_KEY =
    "pogo-theme";
  const PREFERENCES =
    new Set([
      "system",
      "light",
      "dark"
    ]);
  const media =
    typeof window.matchMedia ===
      "function"
      ? window.matchMedia(
          "(prefers-color-scheme: dark)"
        )
      : null;

  function storedPreference() {
    try {
      const value =
        localStorage.getItem(
          STORAGE_KEY
        );

      return PREFERENCES.has(
        value
      )
        ? value
        : "system";
    } catch {
      return "system";
    }
  }

  function resolvedTheme(
    preference
  ) {
    if (
      preference === "light" ||
      preference === "dark"
    ) {
      return preference;
    }

    return media?.matches
      ? "dark"
      : "light";
  }

  function syncThemeControls(
    preference
  ) {
    document
      .querySelectorAll(
        "[data-theme-select]"
      )
      .forEach(
        select => {
          if (
            select.value !==
            preference
          ) {
            select.value =
              preference;
          }
        }
      );
  }

  function applyPreference(
    preference,
    {
      persist = false,
      announce = false
    } = {}
  ) {
    const normalized =
      PREFERENCES.has(
        preference
      )
        ? preference
        : "system";
    const resolved =
      resolvedTheme(
        normalized
      );

    document.documentElement.dataset.theme =
      resolved;
    document.documentElement.dataset.themePreference =
      normalized;
    document.documentElement.style.colorScheme =
      resolved;

    const themeColor =
      document.querySelector(
        'meta[name="theme-color"]'
      );

    if (themeColor) {
      themeColor.setAttribute(
        "content",
        resolved === "dark"
          ? "#0b1220"
          : "#1f6feb"
      );
    }

    if (persist) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          normalized
        );
      } catch {
        // Appearance remains usable when browser storage is unavailable.
      }
    }

    syncThemeControls(
      normalized
    );

    if (announce) {
      window.dispatchEvent(
        new CustomEvent(
          "pogo-theme-change",
          {
            detail: {
              preference:
                normalized,
              theme:
                resolved
            }
          }
        )
      );
    }

    return resolved;
  }

  function setPreference(
    preference
  ) {
    return applyPreference(
      preference,
      {
        persist: true,
        announce: true
      }
    );
  }

  applyPreference(
    storedPreference()
  );

  media?.addEventListener?.(
    "change",
    () => {
      if (
        storedPreference() ===
        "system"
      ) {
        applyPreference(
          "system",
          {
            announce: true
          }
        );
      }
    }
  );

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      syncThemeControls(
        storedPreference()
      );

      document
        .querySelectorAll(
          "[data-theme-select]"
        )
        .forEach(
          select => {
            select.addEventListener(
              "change",
              () => {
                setPreference(
                  select.value
                );
              }
            );
          }
        );
    }
  );

  window.PogoTheme =
    Object.freeze({
      getPreference:
        storedPreference,
      getResolvedTheme:
        () =>
          resolvedTheme(
            storedPreference()
          ),
      setPreference
    });
})();

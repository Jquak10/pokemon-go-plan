(() => {
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "summary",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  const entries = [];
  let isolatedElements = [];

  function resolveElement(value) {
    if (!value) {
      return null;
    }

    if (
      typeof value === "string"
    ) {
      return document.querySelector(
        value
      );
    }

    if (
      typeof value === "function"
    ) {
      return resolveElement(
        value()
      );
    }

    return value;
  }

  function isVisible(element) {
    if (
      !element ||
      element.hidden ||
      element.closest(
        "[hidden], .hidden, [aria-hidden='true']"
      )
    ) {
      return false;
    }

    const style =
      globalThis.getComputedStyle(
        element
      );

    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      element.getClientRects()
        .length > 0
    );
  }

  function focusableElements(
    root
  ) {
    if (!root) {
      return [];
    }

    return [
      ...root.querySelectorAll(
        FOCUSABLE_SELECTOR
      )
    ].filter(
      element =>
        isVisible(element) &&
        !element.closest(
          "[inert]"
        )
    );
  }

  function focusElement(
    element
  ) {
    if (
      !element ||
      typeof element.focus !==
        "function"
    ) {
      return false;
    }

    try {
      element.focus({
        preventScroll: true
      });
    } catch {
      element.focus();
    }

    return (
      document.activeElement ===
      element
    );
  }

  function focusEntry(
    entry,
    preferLast = false
  ) {
    const preferred =
      resolveElement(
        entry.initialFocus
      );

    if (
      preferred &&
      entry.overlay.contains(
        preferred
      ) &&
      isVisible(
        preferred
      )
    ) {
      if (
        focusElement(
          preferred
        )
      ) {
        return;
      }
    }

    const focusables =
      focusableElements(
        entry.overlay
      );

    if (focusables.length) {
      focusElement(
        preferLast
          ? focusables[
              focusables.length - 1
            ]
          : focusables[0]
      );
      return;
    }

    if (
      !entry.overlay.hasAttribute(
        "tabindex"
      )
    ) {
      entry.overlay.setAttribute(
        "tabindex",
        "-1"
      );
      entry.addedTabIndex = true;
    }

    focusElement(
      entry.overlay
    );
  }

  function restoreBackground() {
    for (
      const item of
      isolatedElements
    ) {
      item.element.inert =
        item.inert;

      if (
        item.ariaHidden == null
      ) {
        item.element.removeAttribute(
          "aria-hidden"
        );
      } else {
        item.element.setAttribute(
          "aria-hidden",
          item.ariaHidden
        );
      }
    }

    isolatedElements = [];
  }

  function isolateBackground(
    overlay
  ) {
    restoreBackground();

    for (
      const element of
      document.body.children
    ) {
      if (
        element === overlay ||
        element.contains(
          overlay
        ) ||
        element.tagName ===
          "SCRIPT"
      ) {
        continue;
      }

      isolatedElements.push({
        element,
        inert:
          Boolean(
            element.inert
          ),
        ariaHidden:
          element.getAttribute(
            "aria-hidden"
          )
      });

      element.inert = true;
      element.setAttribute(
        "aria-hidden",
        "true"
      );
    }
  }

  function topEntry() {
    return (
      entries[
        entries.length - 1
      ] ||
      null
    );
  }

  function open({
    overlay,
    close,
    initialFocus = null,
    restoreFocus = null
  }) {
    const element =
      resolveElement(
        overlay
      );

    if (!element) {
      return null;
    }

    const existing =
      entries.find(
        entry =>
          entry.overlay === element
      );

    if (existing) {
      return existing;
    }

    const active =
      document.activeElement;

    const entry = {
      overlay: element,
      close,
      initialFocus,
      restoreFocus:
        resolveElement(
          restoreFocus
        ) ||
        (
          active instanceof
            HTMLElement
            ? active
            : null
        ),
      addedTabIndex: false,
      overlayInert:
        Boolean(
          element.inert
        ),
      overlayAriaHidden:
        element.getAttribute(
          "aria-hidden"
        )
    };

    entries.push(entry);
    element.inert = false;
    element.removeAttribute(
      "aria-hidden"
    );

    isolateBackground(
      element
    );

    requestAnimationFrame(
      () => {
        if (
          topEntry() === entry
        ) {
          focusEntry(entry);
        }
      }
    );

    return entry;
  }

  function close(
    overlay,
    {
      restoreFocus = true
    } = {}
  ) {
    const element =
      resolveElement(
        overlay
      );

    const index =
      entries.findIndex(
        entry =>
          entry.overlay ===
          element
      );

    if (index < 0) {
      return false;
    }

    const [
      entry
    ] =
      entries.splice(
        index,
        1
      );

    if (
      entry.addedTabIndex
    ) {
      entry.overlay.removeAttribute(
        "tabindex"
      );
    }

    entry.overlay.inert =
      entry.overlayInert;

    if (
      entry.overlayAriaHidden ==
      null
    ) {
      entry.overlay.removeAttribute(
        "aria-hidden"
      );
    } else {
      entry.overlay.setAttribute(
        "aria-hidden",
        entry.overlayAriaHidden
      );
    }

    restoreBackground();

    const next =
      topEntry();

    if (next) {
      isolateBackground(
        next.overlay
      );

      requestAnimationFrame(
        () =>
          focusEntry(
            next
          )
      );

      return true;
    }

    if (
      restoreFocus &&
      entry.restoreFocus &&
      entry.restoreFocus.isConnected &&
      isVisible(
        entry.restoreFocus
      ) &&
      !entry.restoreFocus
        .hasAttribute(
          "disabled"
        )
    ) {
      requestAnimationFrame(
        () =>
          focusElement(
            entry.restoreFocus
          )
      );
    }

    return true;
  }

  function isOpen(
    overlay
  ) {
    const element =
      resolveElement(
        overlay
      );

    return entries.some(
      entry =>
        entry.overlay ===
        element
    );
  }

  function handleKeydown(
    event
  ) {
    const entry =
      topEntry();

    if (!entry) {
      return;
    }

    if (
      (
        event.ctrlKey ||
        event.metaKey
      ) &&
      String(
        event.key
      ).toLowerCase() ===
        "k"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (
      event.key ===
      "Escape"
    ) {
      if (
        typeof entry.close ===
        "function"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        entry.close();
      }

      return;
    }

    if (
      event.key !==
      "Tab"
    ) {
      return;
    }

    const focusables =
      focusableElements(
        entry.overlay
      );

    if (
      !focusables.length
    ) {
      event.preventDefault();
      focusEntry(entry);
      return;
    }

    const first =
      focusables[0];

    const last =
      focusables[
        focusables.length - 1
      ];

    const active =
      document.activeElement;

    if (
      event.shiftKey
    ) {
      if (
        active === first ||
        !entry.overlay.contains(
          active
        )
      ) {
        event.preventDefault();
        focusElement(last);
      }

      return;
    }

    if (
      active === last ||
      !entry.overlay.contains(
        active
      )
    ) {
      event.preventDefault();
      focusElement(first);
    }
  }

  function handleFocusIn(
    event
  ) {
    const entry =
      topEntry();

    if (
      !entry ||
      entry.overlay.contains(
        event.target
      )
    ) {
      return;
    }

    focusEntry(entry);
  }

  document.addEventListener(
    "keydown",
    handleKeydown,
    true
  );

  document.addEventListener(
    "focusin",
    handleFocusIn,
    true
  );

  globalThis.PlannerOverlay =
    Object.freeze({
      open,
      close,
      isOpen,
      focusableElements,
      activeOverlay:
        () =>
          topEntry()
            ?.overlay ||
          null
    });
})();

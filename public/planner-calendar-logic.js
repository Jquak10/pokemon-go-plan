// Pure calendar/date helpers for the Planner.
// DOM rendering, API loading/cache, and selected-month/day state remain in manage.html.
(() => {
  const DAY_MS = 86400000;

  function parseIsoDate(value) {
    const match =
      String(
        value || ""
      ).match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

    if (!match) {
      return null;
    }

    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12
      )
    );
  }

  function isoDateFromUtc(date) {
    return [
      date.getUTCFullYear(),
      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0"),
      String(
        date.getUTCDate()
      ).padStart(2, "0")
    ].join("-");
  }

  function monthKeyFromDate(date) {
    return (
      `${date.getUTCFullYear()}-` +
      String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")
    );
  }

  function monthTitleFromDate(date) {
    return new Intl.DateTimeFormat(
      "en",
      {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }
    ).format(date);
  }

  function addMonthsUtc(
    date,
    amount
  ) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() +
          Number(amount || 0),
        1,
        12
      )
    );
  }

  function eventsForDate(
    events,
    dateIso
  ) {
    return (
      Array.isArray(events)
        ? events
        : []
    ).filter(
      event => {
        const start =
          event.start_date;

        const end =
          event.end_date ||
          event.start_date;

        return (
          start <= dateIso &&
          end >= dateIso
        );
      }
    );
  }

  function sourceClass(source) {
    return (
      "calendar-source-" +
      String(
        source || "event"
      ).replace(
        /[^a-z0-9_-]/gi,
        ""
      )
    );
  }

  function monthGrid({
    monthDate,
    events = [],
    todayIso = "",
    selectedDate = ""
  }) {
    if (!(monthDate instanceof Date)) {
      return [];
    }

    const year =
      monthDate.getUTCFullYear();

    const month =
      monthDate.getUTCMonth();

    const firstOfMonth =
      new Date(
        Date.UTC(
          year,
          month,
          1,
          12
        )
      );

    const mondayOffset =
      (
        firstOfMonth.getUTCDay() +
        6
      ) % 7;

    const gridStart =
      new Date(
        Date.UTC(
          year,
          month,
          1 - mondayOffset,
          12
        )
      );

    return Array.from(
      {
        length: 42
      },
      (_, index) => {
        const date =
          new Date(
            gridStart.getTime() +
            index * DAY_MS
          );

        const dateIso =
          isoDateFromUtc(
            date
          );

        const dayEvents =
          eventsForDate(
            events,
            dateIso
          );

        const visibleEvents =
          dayEvents.slice(
            0,
            3
          );

        return {
          date,
          dateIso,
          dayNumber:
            date.getUTCDate(),
          inMonth:
            date.getUTCMonth() ===
            month,
          isToday:
            dateIso === todayIso,
          selected:
            dateIso ===
            selectedDate,
          events:
            dayEvents,
          visibleEvents,
          extra:
            Math.max(
              0,
              dayEvents.length -
              visibleEvents.length
            )
        };
      }
    );
  }

  globalThis.PlannerCalendarLogic =
    Object.freeze({
      parseIsoDate,
      isoDateFromUtc,
      monthKeyFromDate,
      monthTitleFromDate,
      addMonthsUtc,
      eventsForDate,
      sourceClass,
      monthGrid
    });
})();

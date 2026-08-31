from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import requests
from icalendar import Calendar


CONFIG_FILE = Path("config.json")
SITE_DIR = Path("site")
OUTPUT_FILE = SITE_DIR / "pokemon-go.ics"


# GO Calendar's individual feed filenames.
# GO Battle League is deliberately not included.
SOURCE_FILES = {
    "community_day": "gocal__community_day.ics",
    "event": "gocal__event.ics",
    "go_pass": "gocal__go_pass.ics",
    "max_battles": "gocal__max_battles.ics",
    "max_mondays": "gocal__max_mondays.ics",
    "pokemon_go_fest": "gocal__pokemon_go_fest.ics",
    "pokemon_spotlight_hour": "gocal__pokemon_spotlight_hour.ics",
    "raid_battles": "gocal__raid_battles.ics",
    "raid_day": "gocal__raid_day.ics",
    "raid_hour": "gocal__raid_hour.ics",
    "research": "gocal__research.ics",
    "season": "gocal__season.ics"
}


def source_url(filename: str) -> str:
    scheme = "https://"
    host = "github.com"
    path = "/othyn/go-calendar/releases/latest/download/"
    return scheme + host + path + filename


def load_config() -> dict:
    with CONFIG_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def download_calendar(source_name: str) -> Calendar:
    if source_name not in SOURCE_FILES:
        raise ValueError(f"Unknown source: {source_name}")

    filename = SOURCE_FILES[source_name]

    response = requests.get(
        source_url(filename),
        timeout=30,
        headers={
            "User-Agent": "Pokemon-Go-Personal-Calendar/1.0"
        }
    )

    response.raise_for_status()

    return Calendar.from_ical(response.content)


def value_as_text(component, name: str) -> str:
    value = component.get(name)

    if value is None:
        return ""

    try:
        raw = value.to_ical()

        if isinstance(raw, bytes):
            return raw.decode("utf-8", errors="replace")

        return str(raw)

    except Exception:
        return str(value)


def event_fingerprint(event) -> str:
    parts = [
        str(event.get("SUMMARY", "")).strip().casefold(),
        value_as_text(event, "DTSTART"),
        value_as_text(event, "DTEND"),
        value_as_text(event, "RECURRENCE-ID")
    ]

    joined = "|".join(parts)

    return hashlib.sha256(
        joined.encode("utf-8")
    ).hexdigest()


def should_exclude(event, config: dict) -> bool:
    summary = str(event.get("SUMMARY", ""))

    exclusions = config.get(
        "exclude_title_contains",
        []
    )

    for exclusion in exclusions:
        if exclusion.casefold() in summary.casefold():
            return True

    return False


def apply_personal_rules(event, config: dict):
    original_summary = str(
        event.get("SUMMARY", "")
    )

    prefixes = []
    notes = []

    for rule in config.get(
        "personal_rules",
        []
    ):
        match = str(
            rule.get("match", "")
        ).strip()

        if not match:
            continue

        if match.casefold() in original_summary.casefold():

            prefix = str(
                rule.get(
                    "title_prefix",
                    ""
                )
            )

            if prefix and prefix not in prefixes:
                prefixes.append(prefix)

            notes.extend(
                rule.get(
                    "notes",
                    []
                )
            )

    if prefixes:
        event["SUMMARY"] = (
            "".join(prefixes)
            + original_summary
        )

    if notes:
        old_description = str(
            event.get(
                "DESCRIPTION",
                ""
            )
        ).strip()

        personal_description = (
            "PERSONAL PLAN\n"
            + "\n".join(
                f"• {note}"
                for note in notes
            )
        )

        if old_description:
            new_description = (
                old_description
                + "\n\n──────────\n"
                + personal_description
            )
        else:
            new_description = (
                personal_description
            )

        event["DESCRIPTION"] = (
            new_description
        )

    return event


def create_index_page(
    calendar_name: str
):
    index = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport"
          content="width=device-width, initial-scale=1">
    <title>{calendar_name}</title>
</head>
<body>
    <h1>{calendar_name}</h1>

    <p>
        Automatically generated Pokémon GO
        calendar feed.
    </p>

    <p>
        GO Battle League is excluded.
    </p>

    <p>
        <a href="pokemon-go.ics">
            Open calendar feed
        </a>
    </p>
</body>
</html>
"""

    (
        SITE_DIR / "index.html"
    ).write_text(
        index,
        encoding="utf-8"
    )


def main():
    config = load_config()

    output = Calendar()

    output.add(
        "prodid",
        "-//Pokemon GO Personal Calendar//EN"
    )
    output.add(
        "version",
        "2.0"
    )
    output.add(
        "calscale",
        "GREGORIAN"
    )
    output.add(
        "method",
        "PUBLISH"
    )
    output.add(
        "x-wr-calname",
        config.get(
            "calendar_name",
            "Pokémon GO — Personal Calendar"
        )
    )

    seen_uids = set()
    seen_fingerprints = set()
    timezones = {}
    events = []

    sources = config.get(
        "include_sources",
        []
    )

    for source_name in sources:
        print(
            f"Downloading: {source_name}"
        )

        source_calendar = (
            download_calendar(
                source_name
            )
        )

        # Preserve any timezone definitions.
        for component in source_calendar.subcomponents:
            if component.name == "VTIMEZONE":
                tzid = str(
                    component.get(
                        "TZID",
                        ""
                    )
                )

                if (
                    tzid
                    and tzid not in timezones
                ):
                    timezones[tzid] = (
                        copy.deepcopy(
                            component
                        )
                    )

        for component in source_calendar.walk():
            if component.name != "VEVENT":
                continue

            event = copy.deepcopy(
                component
            )

            if should_exclude(
                event,
                config
            ):
                print(
                    "Excluded:",
                    str(
                        event.get(
                            "SUMMARY",
                            ""
                        )
                    )
                )
                continue

            uid = str(
                event.get(
                    "UID",
                    ""
                )
            ).strip()

            fingerprint = (
                event_fingerprint(
                    event
                )
            )

            if (
                uid
                and uid in seen_uids
            ):
                continue

            if (
                fingerprint
                in seen_fingerprints
            ):
                continue

            if uid:
                seen_uids.add(uid)

            seen_fingerprints.add(
                fingerprint
            )

            event = apply_personal_rules(
                event,
                config
            )

            events.append(event)

    if not events:
        raise RuntimeError(
            "No calendar events were downloaded. "
            "Refusing to publish an empty feed."
        )

    for timezone in timezones.values():
        output.add_component(
            timezone
        )

    for event in events:
        output.add_component(
            event
        )

    SITE_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    OUTPUT_FILE.write_bytes(
        output.to_ical()
    )

    create_index_page(
        config.get(
            "calendar_name",
            "Pokémon GO — Personal Calendar"
        )
    )

    print(
        f"Generated {len(events)} events."
    )
    print(
        f"Calendar written to {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()

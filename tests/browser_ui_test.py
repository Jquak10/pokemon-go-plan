from __future__ import annotations

import json
import mimetypes
import threading
import time
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

ADVICE_DETAIL = (
    "The shared plan leaves lower-value pass capacity unused rather than spending to a ceiling. "
    "This guidance must remain fully readable on intermediate desktop widths instead of being clipped."
)

# This is deliberately a stable historical regression fixture, not a model of
# the live Max Battle rotation. Rhyhorn can leave the live rotation without
# invalidating this test: the contract under test is form resolution and UI
# rendering for an ordinary Dynamax species.
MOCK_STATE = {
    "user": {
        "timezone": "Asia/Singapore",
        "included_sources": [],
        "pve_weight": 1,
        "pvp_weight": 1,
        "collector_weight": 1,
        "remote_raid_budget": None,
        "remote_raid_min_score": 60,
    },
    "targets": [],
    "recommendations": [
        {
            "pokemon_name": "Dynamax Rhyhorn",
            "boss_name": "Dynamax Rhyhorn",
            "encounter_name": "Rhyhorn",
            "score": 48,
            "label": "OPTIONAL",
            "emoji": "⭐",
            "reasons": ["Max Battle regression fixture."],
            "battle_system": "max",
            "battle_variant": "dynamax",
            "battle_presentation": {
                "system_label": "Max Battle",
                "variant_label": "Dynamax",
                "sprite_policy": {"requires_exact_form": False},
            },
            "sprite_exact_form": True,
            "sprite_url": None,
            "source_label": "Regression fixture",
            "source_kind": "derived",
            "event_title": "[TEST] DYNAMAX RHYHORN REGRESSION FIXTURE",
            "event_description": "",
            "max_particle_cost": None,
            "logging_remote_eligible": False,
            "remote_pass_capable_by_source": False,
            "remote_eligible": False,
            "meta": {"max_rankings_json": None},
            "target": None,
        }
    ],
    "remote_raid_plan": {
        "local_date": "2026-09-18",
        "official_rule": {
            "label": "Standard daily Remote limit",
            "detected_automatically": False,
            "is_override": False,
            "source_url": None,
        },
        "official_limit": 10,
        "official_is_unlimited": False,
        "raids_used": 0,
        "remote_limit_used": 0,
        "official_remaining": 10,
        "system_recommended_budget": 0,
        "usual_personal_ceiling": None,
        "daily_budget_override": None,
        "effective_budget_cap": 0,
        "recommended_total": 0,
        "daily_planning_cap": 0,
        "purchase_advice": {
            "code": "selective",
            "label": "BE SELECTIVE",
            "headline": "Use resources selectively.",
            "detail": ADVICE_DETAIL,
        },
        "best_future_day": None,
        "budget_forecast": [],
        "allocations": [],
        "not_allocated": [],
    },
    "battle_resource_plan": {
        "local_date": "2026-09-18",
        "state": {
            "max_particles_held": 1500,
            "max_particles_collected_today": 0,
            "remote_max_passes_used": 0,
            "migration_ready": True,
        },
        "particle_rule": {
            "label": "Standard Max Particle rules",
            "daily_limit": 800,
            "storage_limit": 1500,
        },
        "remote_passes": {
            "used_total": 0,
            "recommended_additional": 0,
            "personal_daily_ceiling": 10,
        },
        "max_particles": {
            "held": 1500,
            "collected_today": 0,
            "daily_limit": 800,
            "storage_limit": 1500,
            "daily_collection_remaining": 800,
            "planned_spend": 0,
            "projected_after_plan": 2300,
        },
        "allocations": [],
        "not_allocated": [
            {
                "pokemon_name": "Dynamax Rhyhorn",
                "battle_system": "max",
                "reason": "Max Particle cost is unknown.",
            }
        ],
        "advice": {
            "code": "selective",
            "label": "BE SELECTIVE",
            "headline": "Use resources selectively.",
            "detail": ADVICE_DETAIL,
        },
    },
    "battle_activity": {
        "remote_raids": 0,
        "local_raids": 0,
        "local_max_battles": 0,
        "remote_max_battles": 0,
        "max_particles_spent": 0,
        "total_battles": 0,
        "recent": [],
    },
    "raid_activity": {
        "remote_raids": 0,
        "local_raids": 0,
        "local_max_battles": 0,
        "remote_max_battles": 0,
        "max_particles_spent": 0,
        "total_battles": 0,
        "recent": [],
    },
    "target_options": {
        "current": [],
        "upcoming": [],
        "existing": [],
        "horizon_days": 30,
    },
    "dashboard": {
        "local_date": "2026-09-18",
        "top_pick": {
            "pokemon_name": "Dynamax Rhyhorn",
            "score": 48,
            "label": "OPTIONAL",
            "emoji": "⭐",
            "battle_system": "max",
            "battle_variant": "dynamax",
            "source_kind": "derived",
            "source_label": "Weekly Max rotation",
            "sprite_url": None,
        },
        "top_picks": [
            {
                "pokemon_name": "Dynamax Rhyhorn",
                "score": 48,
                "label": "OPTIONAL",
                "emoji": "⭐",
                "battle_system": "max",
                "battle_variant": "dynamax",
                "source_kind": "derived",
                "source_label": "Regression fixture",
                "sprite_url": None,
            }
        ],
        "top_pick_is_tie": False,
        "paid_raid_guidance": {
            "code": "selective",
            "label": "BE SELECTIVE",
            "headline": "Use resources selectively.",
            "detail": ADVICE_DETAIL,
        },
        "planner_budget": 0,
        "effective_budget": 0,
        "next_change": None,
    },
    "data_freshness": {
        "event_feeds": "2026-09-18T06:00:00.000Z",
        "official_schedules": "2026-09-18T06:00:00.000Z",
        "raid_assessments": "2026-09-18T06:00:00.000Z",
    },
    "available_sources": [],
}

CATALOG = {
    "source": "browser-test-fixture",
    "generated_at": "2026-09-18T06:00:00.000Z",
    "entries": [
        {
            "key": "111|base|rhyhorn|rhyhorn",
            "dex_nr": 111,
            "name": "Rhyhorn",
            "form_id": "RHYHORN",
            "kind": "base",
            "attack": 140,
            "defense": 127,
            "stamina": 190,
            "types": ["Ground", "Rock"],
            "sprite_url": None,
            "shiny_sprite_url": None,
        }
    ],
}


class PlannerFixtureHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/me":
            return self._json(MOCK_STATE)

        if path == "/api/pokemon-catalog":
            # Keep this asynchronous enough that the first render exercises the
            # loading placeholder before the catalog-driven rerender.
            time.sleep(0.12)

            failures_remaining = getattr(
                self.server,
                "catalog_failures_remaining",
                0,
            )
            if failures_remaining > 0:
                self.server.catalog_failures_remaining = failures_remaining - 1
                return self._json(
                    {"error": "Fixture catalog temporarily unavailable."},
                    status=503,
                )

            return self._json(CATALOG)

        if path.startswith("/manage/"):
            return self._file(PUBLIC / "manage.html", "text/html; charset=utf-8")

        static_path = (PUBLIC / path.lstrip("/")).resolve()
        if PUBLIC.resolve() in static_path.parents and static_path.is_file():
            content_type = mimetypes.guess_type(static_path.name)[0] or "application/octet-stream"
            return self._file(static_path, content_type)

        self.send_error(404)

    def _json(self, value, status=200):
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _file(self, path: Path, content_type: str):
        payload = path.read_bytes()
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class PlannerBrowserRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), PlannerFixtureHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def setUp(self):
        self.server.catalog_failures_remaining = 0

    def open_planner(self, width: int, height: int):
        context = self.browser.new_context(
            viewport={"width": width, "height": height},
            locale="en-US",
            timezone_id="Asia/Singapore",
            reduced_motion="reduce",
        )
        self.addCleanup(context.close)
        page = context.new_page()
        page.goto(f"{self.base_url}/manage/browser-test-token", wait_until="domcontentloaded")
        page.wait_for_selector("#app:not(.hidden)")
        page.wait_for_selector(".recommendation-card")
        return page

    def assert_no_horizontal_overflow(self, page):
        dimensions = page.evaluate(
            """() => ({
                viewport: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth
            })"""
        )
        widest = max(dimensions["documentWidth"], dimensions["bodyWidth"])
        self.assertLessEqual(
            widest,
            dimensions["viewport"] + 1,
            f"Unexpected horizontal overflow: {dimensions}",
        )

    def test_catalog_failure_exits_loading_state_and_retry_recovers(self):
        self.server.catalog_failures_remaining = 1
        page = self.open_planner(1024, 800)

        card = page.locator(".recommendation-card", has_text="Dynamax Rhyhorn")
        unavailable = card.locator(".raid-intel-unavailable")
        unavailable.wait_for(state="visible")
        self.assertIn("temporarily unavailable", unavailable.inner_text().lower())
        self.assertNotIn("Loading battle intel", card.inner_text())

        retry = card.locator("[data-retry-pokemon-catalog]")
        self.assertEqual(retry.count(), 1)
        retry.click()

        card.locator(".raid-intel").wait_for(state="visible")
        self.assertNotIn("temporarily unavailable", card.inner_text().lower())
        self.assertIn("Water", card.locator(".raid-intel").inner_text())

    def test_catalog_failure_uses_last_known_good_saved_copy(self):
        page = self.open_planner(1024, 800)

        card = page.locator(".recommendation-card", has_text="Dynamax Rhyhorn")
        card.locator(".raid-intel").wait_for(state="visible")

        self.server.catalog_failures_remaining = 1
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#app:not(.hidden)")

        page.locator('.tab-button[data-tab="hundo"]').click()
        status = page.locator("#hundoCatalogStatus")
        status.get_by_text(
            "Using the last saved Pokémon catalog",
            exact=False,
        ).wait_for(state="visible")

        page.locator('.tab-button[data-tab="plan"]').click()
        card = page.locator(".recommendation-card", has_text="Dynamax Rhyhorn")
        card.locator(".raid-intel").wait_for(state="visible")
        self.assertNotIn("Loading battle intel", card.inner_text())
        self.assertIn("Water", card.locator(".raid-intel").inner_text())
        self.assertEqual(
            status.locator("[data-retry-pokemon-catalog]").count(),
            1,
        )

    def test_intermediate_desktop_keeps_guidance_visible_and_resolves_max_intel(self):
        page = self.open_planner(1024, 800)

        advice = page.locator("#battleResourceAdvice")
        self.assertIn(ADVICE_DETAIL, advice.inner_text())

        style = advice.evaluate(
            """element => {
                const style = getComputedStyle(element);
                return {
                    overflow: style.overflow,
                    lineClamp: style.webkitLineClamp,
                    display: style.display
                };
            }"""
        )
        self.assertEqual(style["overflow"], "visible")
        self.assertNotEqual(style["lineClamp"], "2")

        card = page.locator(".recommendation-card", has_text="Dynamax Rhyhorn")
        card.locator(".raid-intel").wait_for(state="visible")
        self.assertNotIn("Loading battle intel", card.inner_text())
        intel = card.locator(".raid-intel").inner_text()
        self.assertIn("WEAK TO", intel.upper())
        self.assertIn("Water", intel)
        self.assertIn("Grass", intel)

        self.assert_no_horizontal_overflow(page)

    def test_mobile_logger_stays_in_view_and_freezes_background(self):
        page = self.open_planner(390, 667)
        self.assert_no_horizontal_overflow(page)

        page.locator(".recommendation-card .log-raid-button").click()
        modal = page.locator("#raidLogModal")
        modal.wait_for(state="visible")

        body_position = page.evaluate("() => getComputedStyle(document.body).position")
        self.assertEqual(body_position, "fixed")

        confirm = page.locator("#confirmRaidLog")
        box = confirm.bounding_box()
        self.assertIsNotNone(box)
        self.assertGreaterEqual(box["y"], 0)
        self.assertLessEqual(box["y"] + box["height"], 668)

        self.assert_no_horizontal_overflow(page)


if __name__ == "__main__":
    unittest.main(verbosity=2)

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

SPRITE_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="

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
    "targets": [
        {
            "id": "target-dynamax-moltres",
            "pokemon_name": "Dynamax Moltres",
            "target_type": "battles",
            "current_value": 0,
            "target_value": 5,
            "expected_progress_per_raid": 1,
            "priority": "medium",
            "completed": 0,
            "notes": "",
            "updated_at": "2026-09-18T06:00:00.000Z",
            "battle_kind": "dynamax",
            "battle_system": "max",
            "battle_variant": "dynamax",
            "sprite_url": SPRITE_DATA_URL,
            "raid_rankings_json": None,
            "max_rankings_json": None,
        },
        {
            "id": "target-dynamax-zapdos",
            "pokemon_name": "Dynamax Zapdos",
            "target_type": "battles",
            "current_value": 0,
            "target_value": 5,
            "expected_progress_per_raid": 1,
            "priority": "medium",
            "completed": 0,
            "notes": "",
            "updated_at": "2026-09-18T06:00:00.000Z",
            "battle_kind": "dynamax",
            "battle_system": "max",
            "battle_variant": "dynamax",
            "sprite_url": SPRITE_DATA_URL,
            "raid_rankings_json": None,
            "max_rankings_json": None,
        },
    ],
    "recommendations": [
        {
            "pokemon_name": "Dynamax Rhyhorn",
            "boss_name": "Dynamax Rhyhorn",
            "encounter_name": "Rhyhorn",
            "score": 54,
            "label": "RECOMMENDED",
            "emoji": "⭐⭐",
            "recommendation_score": 48,
            "planning_score": 54,
            "score_basis": "max-opportunity-v1",
            "planning_rationale": (
                "Priority combines your personalized value, rarity/availability, "
                "and Max capability; current Max attacker utility is not available "
                "for this opportunity."
            ),
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
            "max_battle_tier": None,
            "max_cost_override_key": "dynamax rhyhorn|dynamax|2026-09-18|2026-09-18",
            "max_cost_override_source": None,
            "start_date": "2026-09-18",
            "end_date": "2026-09-18",
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
        "system_recommended_additional": 0,
        "forecast_recommended_additional_raids": 0,
        "forecast_recommended_additional_max": 0,
        "budget_forecast_kind": "shared_battle",
        "usual_personal_ceiling": None,
        "daily_budget_override": None,
        "effective_budget_cap": 0,
        "recommended_total": 0,
        "daily_planning_cap": 0,
        "purchase_advice": {
            "code": "save",
            "label": "SAVE FOR LATER",
            "headline": "Keep resources flexible for the stronger upcoming Max Battle.",
            "detail": ADVICE_DETAIL,
        },
        "best_future_day": {
            "date": "2026-09-19",
            "label": "Sat, Sep 19",
            "recommended_budget": 1,
            "recommended_raid_budget": 0,
            "recommended_max_budget": 1,
            "value_index": 92,
        },
        "budget_forecast": [
            {
                "date": "2026-09-18",
                "label": "Fri, Sep 18",
                "recommended_budget": 0,
                "recommended_raid_budget": 0,
                "recommended_max_budget": 0,
                "allocations": [],
                "value_index": 0,
            },
            {
                "date": "2026-09-19",
                "label": "Sat, Sep 19",
                "recommended_budget": 1,
                "recommended_raid_budget": 0,
                "recommended_max_budget": 1,
                "value_index": 92,
                "allocations": [
                    {
                        "pokemon_name": "Gigantamax Fixture",
                        "battle_system": "max",
                        "battle_variant": "gigantamax",
                        "count": 1,
                        "planning_score": 92,
                        "max_particles": 800,
                        "sprite_url": None,
                    }
                ],
                "opportunities": [
                    {
                        "pokemon_name": "Gigantamax Fixture",
                        "battle_system": "max",
                        "battle_variant": "gigantamax",
                        "planning_score": 92,
                        "allocated_count": 1,
                        "eligible": True,
                        "exclusion_reason": None,
                        "max_particle_cost": 800,
                        "sprite_url": None,
                    },
                    {
                        "pokemon_name": "Dynamax Articuno",
                        "battle_system": "max",
                        "battle_variant": "dynamax",
                        "planning_score": 88,
                        "allocated_count": 0,
                        "eligible": False,
                        "exclusion_reason": "Max Particle cost is unknown.",
                        "max_particle_cost": None,
                        "max_battle_tier": None,
                        "max_cost_override_key": "dynamax articuno|dynamax|2026-09-19|2026-09-19",
                        "max_cost_override_source": None,
                        "start_date": "2026-09-19",
                        "end_date": "2026-09-19",
                        "sprite_url": SPRITE_DATA_URL,
                    },
                    {
                        "pokemon_name": "Dynamax Zapdos",
                        "battle_system": "max",
                        "battle_variant": "dynamax",
                        "planning_score": 87,
                        "allocated_count": 0,
                        "eligible": False,
                        "exclusion_reason": "Max Particle cost is unknown.",
                        "max_particle_cost": None,
                        "max_battle_tier": None,
                        "max_cost_override_key": "dynamax zapdos|dynamax|2026-09-19|2026-09-19",
                        "max_cost_override_source": None,
                        "start_date": "2026-09-19",
                        "end_date": "2026-09-19",
                        "sprite_url": SPRITE_DATA_URL,
                    },
                    {
                        "pokemon_name": "Dynamax Moltres",
                        "battle_system": "max",
                        "battle_variant": "dynamax",
                        "planning_score": 86,
                        "allocated_count": 0,
                        "eligible": False,
                        "exclusion_reason": "Max Particle cost is unknown.",
                        "max_particle_cost": None,
                        "max_battle_tier": None,
                        "max_cost_override_key": "dynamax moltres|dynamax|2026-09-19|2026-09-19",
                        "max_cost_override_source": None,
                        "start_date": "2026-09-19",
                        "end_date": "2026-09-19",
                        "sprite_url": SPRITE_DATA_URL,
                    },
                ],
            },
        ],
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
                "battle_variant": "dynamax",
                "reason_code": "max_particle_cost_unknown",
                "reason": "Max Particle cost is unknown, so the planner will not auto-allocate a Remote Pass.",
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
        "upcoming": [
            {
                "name": "Dynamax Moltres",
                "battle_kind": "dynamax",
                "battle_system": "max",
                "battle_variant": "dynamax",
                "source": "upcoming_event",
            },
            {
                "name": "Dynamax Zapdos",
                "battle_kind": "dynamax",
                "battle_system": "max",
                "battle_variant": "dynamax",
                "source": "upcoming_event",
            },
        ],
        "existing": [],
        "horizon_days": 30,
    },
    "dashboard": {
        "local_date": "2026-09-18",
        "top_pick": {
            "pokemon_name": "Dynamax Rhyhorn",
            "score": 54,
            "label": "RECOMMENDED",
            "emoji": "⭐⭐",
            "recommendation_score": 48,
            "planning_score": 54,
            "score_basis": "max-opportunity-v1",
            "planning_rationale": "Priority combines personalized value and Max-specific signals.",
            "battle_system": "max",
            "battle_variant": "dynamax",
            "source_kind": "derived",
            "source_label": "Weekly Max rotation",
            "sprite_url": None,
        },
        "top_picks": [
            {
                "pokemon_name": "Dynamax Rhyhorn",
                "score": 54,
                "label": "RECOMMENDED",
                "emoji": "⭐⭐",
                "recommendation_score": 48,
                "planning_score": 54,
                "score_basis": "max-opportunity-v1",
                "planning_rationale": "Priority combines personalized value and Max-specific signals.",
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
            self.server.last_manage_api_path = self.path
            self.server.last_manage_authorization = self.headers.get("authorization")
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
        self.server.last_manage_api_path = None
        self.server.last_manage_authorization = None

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

    def test_management_api_uses_header_without_query_token(self):
        page = self.open_planner(1024, 800)

        self.assertEqual(
            self.server.last_manage_authorization,
            "Bearer browser-test-token",
        )
        self.assertEqual(
            self.server.last_manage_api_path,
            "/api/me",
        )

        self.assert_no_horizontal_overflow(page)

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
        self.assertEqual(card.locator(".score-ring").inner_text().strip(), "54")
        self.assertIn("RECOMMENDED", card.inner_text())
        self.assertIn("No Remote Max allocation", card.inner_text())
        self.assertIn("MP cost unknown", card.inner_text())
        tier_select = card.locator("[data-max-tier-override]")
        self.assertEqual(tier_select.count(), 1)
        self.assertIn(
            "Tier 5 · 800 MP",
            [text.strip() for text in tier_select.locator("option").all_inner_texts()],
        )

        saved_override = {}
        saved_override_headers = {}

        def capture_override(route):
            saved_override.update(json.loads(route.request.post_data or "{}"))
            saved_override_headers.update(route.request.headers)
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "ok": True,
                    "max_battle_tier": 5,
                    "max_particle_cost": 800,
                }),
            )

        page.route("**/api/max-battle-cost-override", capture_override)
        tier_select.select_option("5")
        page.wait_for_timeout(100)
        self.assertEqual(saved_override.get("pokemon_name"), "Dynamax Rhyhorn")
        self.assertEqual(saved_override.get("max_battle_tier"), "5")
        self.assertEqual(saved_override.get("start_date"), "2026-09-18")
        self.assertNotIn("token", saved_override)
        self.assertEqual(
            saved_override_headers.get("authorization"),
            "Bearer browser-test-token",
        )

        zero_details = page.locator("#remoteRaidZeroDetails")
        self.assertFalse(zero_details.evaluate("element => element.classList.contains('hidden')"))
        self.assertIn(
            "Battles receiving 0 Remote allocation · 1",
            page.locator("#remoteZeroSummary").inner_text(),
        )

        page.locator('[data-battle-filter="max"]').click()
        self.assertFalse(zero_details.evaluate("element => element.classList.contains('hidden')"))
        self.assertIn("· 1", page.locator("#remoteZeroSummary").inner_text())
        page.locator('[data-battle-filter="all"]').click()

        card.locator("summary", has_text="Why?").click()
        self.assertIn("Planning priority:", card.inner_text())
        self.assertIn("RECOMMENDED 54", page.locator("#desktopRailTopPick").inner_text())
        self.assertIn("RECOMMENDED", page.locator("#todayTopPickMeta").inner_text())
        self.assertIn("54", page.locator("#todayTopPickMeta").inner_text())
        self.assertIn("Paid Battle Forecast", page.locator(".budget-forecast-wrap").inner_text())
        forecast_text = page.locator("#budgetForecast").inner_text()
        self.assertIn("Gigantamax Fixture", forecast_text)
        self.assertIn("Dynamax Articuno", forecast_text)
        self.assertIn("Max", forecast_text)
        self.assertIn("800 MP", forecast_text)
        self.assertIn("View all · 4 Max", forecast_text)
        page.locator("[data-forecast-day-index='1']").click()
        details = page.locator("#budgetForecastDetails")
        details.wait_for(state="visible")
        detail_text = details.inner_text()
        self.assertIn("Dynamax Articuno", detail_text)
        self.assertIn("Dynamax Zapdos", detail_text)
        self.assertIn("Dynamax Moltres", detail_text)
        self.assertIn("Max Particle cost is unknown.", detail_text)
        self.assertGreaterEqual(
            details.locator("[data-max-tier-override]").count(),
            3,
        )
        self.assertIn("1 paid use planned", detail_text)
        self.assertIn("1 Remote Pass", page.locator("#purchaseAdvice").inner_text())

        page.evaluate(
            """() => {
                state.remote_raid_plan.budget_forecast[1].opportunities = [
                    { pokemon_name: "Raid A", battle_system: "raid", planning_score: 90, allocated_count: 1, eligible: true },
                    { pokemon_name: "Raid B", battle_system: "raid", planning_score: 89, allocated_count: 1, eligible: true },
                    { pokemon_name: "Raid C", battle_system: "raid", planning_score: 88, allocated_count: 0, eligible: true },
                    { pokemon_name: "Max A", battle_system: "max", planning_score: 87, allocated_count: 0, eligible: false, exclusion_reason: "Max Particle cost is unknown." }
                ];
                expandedForecastDayIndex = null;
                renderRemoteRaidPlan();
            }"""
        )
        mixed_label = page.locator("[data-forecast-day-index='1']").inner_text()
        self.assertIn("3 Raid + 1 Max", mixed_label)
        self.assertNotIn("4 · 1 Max", mixed_label)

        intel = card.locator(".raid-intel").inner_text()
        self.assertIn("WEAK TO", intel.upper())
        self.assertIn("Water", intel)
        self.assertIn("Grass", intel)

        self.assert_no_horizontal_overflow(page)

    def test_intermediate_widths_keep_dense_panels_stacked(self):
        for width in (768, 900, 1024, 1179, 1180, 1280):
            with self.subTest(width=width):
                page = self.open_planner(width, 900)

                self.assert_no_horizontal_overflow(page)

                today_layout = page.locator(".today-command-card").evaluate(
                    """element => {
                        const card = getComputedStyle(element);
                        const main = getComputedStyle(
                            element.querySelector(".today-command-main")
                        );
                        return {
                            display: card.display,
                            mainColumns: main.gridTemplateColumns
                        };
                    }"""
                )

                forecast_columns = page.locator("#budgetForecast").evaluate(
                    """element => getComputedStyle(element).gridTemplateColumns
                        .split(" ")
                        .filter(Boolean).length"""
                )

                if width < 1180:
                    self.assertEqual(today_layout["display"], "block")
                    self.assertEqual(
                        len(today_layout["mainColumns"].split()),
                        1,
                        f"Today briefing should stay stacked at {width}px",
                    )
                    self.assertEqual(
                        forecast_columns,
                        4,
                        f"Forecast should use four columns at {width}px",
                    )
                else:
                    self.assertEqual(today_layout["display"], "grid")
                    self.assertEqual(forecast_columns, 7)

                page.locator('.tab-button[data-tab="calendar"]').click()
                page.wait_for_selector("#calendarMonthGrid")

                calendar_columns = page.locator(".calendar-view-layout").evaluate(
                    """element => getComputedStyle(element).gridTemplateColumns
                        .split(" ")
                        .filter(Boolean).length"""
                )

                if width < 1180:
                    self.assertEqual(
                        calendar_columns,
                        1,
                        f"Calendar detail should stack below the month at {width}px",
                    )
                else:
                    self.assertEqual(calendar_columns, 2)

                page.locator('.tab-button[data-tab="plan"]').click()
                page.locator("[data-forecast-day-index='1']").click()
                detail_name = page.locator(
                    "#budgetForecastDetails .forecast-detail-main strong"
                ).first
                self.assertEqual(
                    detail_name.evaluate(
                        "element => getComputedStyle(element).whiteSpace"
                    ),
                    "normal",
                )

                self.assert_no_horizontal_overflow(page)

    def test_dynamax_sprites_render_in_forecast_and_targets(self):
        page = self.open_planner(1024, 800)

        page.locator("[data-forecast-day-index='1']").click()
        details = page.locator("#budgetForecastDetails")
        details.wait_for(state="visible")

        for name in ("Dynamax Zapdos", "Dynamax Moltres"):
            row = details.locator(".forecast-detail-row", has_text=name)
            self.assertEqual(row.locator("img.forecast-detail-sprite").count(), 1)
            self.assertTrue(row.locator("img.forecast-detail-sprite").is_visible())

        page.locator('.tab-button[data-tab="targets"]').click()

        for name in ("Dynamax Zapdos", "Dynamax Moltres"):
            card = page.locator(".target-card", has_text=name)
            self.assertEqual(card.locator("img.target-sprite").count(), 1)
            self.assertTrue(card.locator("img.target-sprite").is_visible())

        self.assert_no_horizontal_overflow(page)

    def test_zero_allocation_reason_is_system_aware_on_raid_card(self):
        page = self.open_planner(1024, 800)

        page.evaluate(
            """() => {
                const base = state.recommendations[0];
                state.recommendations = [{
                    ...base,
                    pokemon_name: "Raid Fixture",
                    boss_name: "Raid Fixture",
                    encounter_name: null,
                    battle_system: "raid",
                    battle_variant: null,
                    battle_presentation: {
                        system_label: "Raid",
                        variant_label: null,
                        sprite_policy: { requires_exact_form: false }
                    },
                    score: 45,
                    planning_score: 45,
                    recommendation_score: 45,
                    label: "OPTIONAL",
                    emoji: "⭐",
                    remote_eligible: true,
                    source_kind: "calendar",
                    source_label: "Regression fixture",
                    event_title: "[TEST] RAID ZERO ALLOCATION",
                    meta: null,
                    target: {
                        id: "raid-skip-target",
                        pokemon_name: "Raid Fixture",
                        priority: "skip",
                        completed: 0
                    },
                    reasons: ["Raid zero-allocation regression fixture."]
                }];

                state.battle_resource_plan.allocations = [];
                state.battle_resource_plan.not_allocated = [{
                    pokemon_name: "Raid Fixture",
                    battle_system: "raid",
                    battle_variant: null,
                    reason_code: "priority_skip",
                    reason: "Personal priority is set to Skip."
                }];
                state.remote_raid_plan.allocations = [];
                state.remote_raid_plan.not_allocated = [];
                battlePlanFilter = "all";
                renderRecommendations();
            }"""
        )

        card = page.locator(".recommendation-card", has_text="Raid Fixture")
        self.assertIn("0 Remote raids", card.inner_text())
        self.assertIn("No Remote Raid allocation", card.inner_text())
        self.assertIn("Priority set to Skip", card.inner_text())

        details = page.locator("#remoteRaidZeroDetails")
        self.assertIn(
            "Battles receiving 0 Remote allocation · 1",
            page.locator("#remoteZeroSummary").inner_text(),
        )
        details.locator("summary").click()
        self.assertIn("Raid · Personal priority is set to Skip.", details.inner_text())
        self.assertNotIn("Raid bosses receiving 0 Remote Raids", details.inner_text())

        self.assert_no_horizontal_overflow(page)

    def test_exact_remote_rule_banner_uses_planner_timezone(self):
        page = self.open_planner(1024, 800)

        page.evaluate(
            """() => {
                state.remote_raid_plan.official_rule = {
                    label: "Official temporary Remote Raid limit: 20",
                    detected_automatically: true,
                    is_override: true,
                    start_date: "2026-09-18",
                    end_date: "2026-09-19",
                    start_at: "2026-09-19T00:00:00.000Z",
                    end_at: "2026-09-20T03:00:00.000Z",
                    start_local_date: "2026-09-19",
                    end_local_date: "2026-09-20",
                    timing_precision: "instant",
                    source_url: "https://pokemongo.com/news/example"
                };
                state.remote_raid_plan.official_limit = 20;
                state.remote_raid_plan.official_remaining = 20;
                renderRemoteRaidPlan();
            }"""
        )

        banner = page.locator("#specialEventBanner")
        banner.wait_for(state="visible")
        text = banner.inner_text()

        self.assertIn("Official temporary Remote Raid limit: 20", text)
        self.assertIn("Local time", text)
        self.assertIn("Sat, Sep 19", text)
        self.assertIn("8:00 AM", text)
        self.assertIn("Sun, Sep 20", text)
        self.assertIn("11:00 AM", text)
        self.assertIn("Asia/Singapore", text)
        self.assertNotIn("2026-09-18 → 2026-09-19", text)

        self.assert_no_horizontal_overflow(page)

    def test_existing_target_identity_fields_are_editable(self):
        page = self.open_planner(1024, 800)
        page.locator('.tab-button[data-tab="targets"]').click()

        card = page.locator(".target-card", has_text="Dynamax Moltres")
        card.locator("[data-edit-target]").click()

        modal = page.locator("#targetModal")
        modal.wait_for(state="visible")

        for selector in ("#pokemonName", "#targetBattleKind", "#targetType"):
            self.assertFalse(
                page.locator(selector).is_disabled(),
                f"{selector} should remain editable for an existing target",
            )

        self.assertEqual(page.locator("#targetBattleKind").input_value(), "dynamax")
        self.assertEqual(page.locator("#targetType").input_value(), "battles")

        page.locator("#targetBattleKind").select_option("gigantamax")
        self.assertEqual(page.locator("#targetBattleKind").input_value(), "gigantamax")
        self.assertFalse(page.locator("#targetType").is_disabled())

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

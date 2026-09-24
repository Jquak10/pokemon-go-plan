from __future__ import annotations

import json
import threading
import unittest
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright

from browser_ui_test import PlannerFixtureHandler


class WebKitSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), PlannerFixtureHandler)
        cls.server_thread = threading.Thread(
            target=cls.server.serve_forever,
            daemon=True,
        )
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.webkit.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def setUp(self):
        self.server.manage_api_mode = "ok"
        self.server.catalog_failures_remaining = 0
        self.server.deleted_target_ids = set()
        self.server.last_backup_authorization = None
        self.server.last_restore_authorization = None
        self.server.last_restore_confirmation = None
        self.server.last_restore_backup = None

    def new_page(
        self,
        width: int,
        height: int,
        *,
        color_scheme: str = "light",
    ):
        context = self.browser.new_context(
            viewport={"width": width, "height": height},
            locale="en-US",
            timezone_id="Asia/Singapore",
            reduced_motion="reduce",
            color_scheme=color_scheme,
        )
        self.addCleanup(context.close)
        return context.new_page()

    def open_planner(
        self,
        width: int,
        height: int,
        *,
        color_scheme: str = "light",
    ):
        page = self.new_page(
            width,
            height,
            color_scheme=color_scheme,
        )
        page.goto(
            f"{self.base_url}/manage/browser-test-token",
            wait_until="domcontentloaded",
        )
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
        widest = max(
            dimensions["documentWidth"],
            dimensions["bodyWidth"],
        )
        self.assertLessEqual(
            widest,
            dimensions["viewport"] + 1,
            f"Unexpected horizontal overflow: {dimensions}",
        )

    def assert_inside_viewport(self, page, selector: str):
        box = page.locator(selector).bounding_box()
        self.assertIsNotNone(box, f"{selector} should have a layout box")
        viewport = page.viewport_size
        self.assertIsNotNone(viewport)
        self.assertGreaterEqual(box["x"], -1, selector)
        self.assertGreaterEqual(box["y"], -1, selector)
        self.assertLessEqual(
            box["x"] + box["width"],
            viewport["width"] + 1,
            selector,
        )
        self.assertLessEqual(
            box["y"] + box["height"],
            viewport["height"] + 1,
            selector,
        )

    def test_landing_theme_persistence_and_mobile_fit(self):
        page = self.new_page(
            390,
            844,
            color_scheme="dark",
        )
        page.goto(
            f"{self.base_url}/",
            wait_until="domcontentloaded",
        )
        page.wait_for_selector("[data-theme-select]")

        self.assertEqual(
            page.title(),
            "Pokémon GO Battle Planner",
        )
        self.assertEqual(
            page.locator("html").get_attribute("data-theme"),
            "dark",
        )
        self.assert_no_horizontal_overflow(page)

        page.locator("[data-theme-select]").select_option("light")
        page.wait_for_function(
            "() => document.documentElement.dataset.theme === 'light'"
        )
        self.assertEqual(
            page.evaluate("() => localStorage.getItem('pogo-theme')"),
            "light",
        )

        page.reload(wait_until="domcontentloaded")
        self.assertEqual(
            page.locator("html").get_attribute("data-theme"),
            "light",
            "Explicit theme preference should survive reload in WebKit",
        )
        self.assert_no_horizontal_overflow(page)

    def test_mobile_planner_navigation_preferences_backup_calendar_and_sheet(self):
        page = self.open_planner(390, 844)

        self.assertEqual(
            page.locator(".tab-nav").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "fixed",
        )
        self.assert_inside_viewport(page, ".tab-nav")
        self.assert_inside_viewport(page, "#mobileMoreButton")

        nav_height = page.locator(".tab-nav").bounding_box()["height"]
        body_padding_bottom = page.evaluate(
            "() => parseFloat(getComputedStyle(document.body).paddingBottom)"
        )
        self.assertGreater(
            body_padding_bottom,
            nav_height + 30,
            "Mobile body must reserve space beyond the fixed bottom nav, including safe-area allowance",
        )
        self.assert_no_horizontal_overflow(page)

        page.locator("#mobileMoreButton").click()
        page.locator("#mobileMoreBackdrop").wait_for(state="visible")
        self.assertEqual(
            page.locator("#mobileMoreBackdrop").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "fixed",
        )
        self.assertTrue(
            page.evaluate("() => document.querySelector('main').inert"),
            "Foreground More sheet should isolate the page behind it",
        )
        self.assert_inside_viewport(page, "#mobileMoreSheet")
        self.assert_no_horizontal_overflow(page)

        page.locator('[data-mobile-more-tab="preferences"]').click()
        page.wait_for_function(
            """() => document.getElementById('panel-preferences')?.classList.contains('active')"""
        )

        backup_card = page.locator(".settings-card-backup")
        backup_card.scroll_into_view_if_needed()
        file_input = page.locator("#plannerBackupFile")
        file_input.set_input_files(
            files=[
                {
                    "name": "webkit-smoke-backup.json",
                    "mimeType": "application/json",
                    "buffer": json.dumps(
                        {
                            "format": "pokemon-go-planner-backup",
                            "version": 1,
                        }
                    ).encode("utf-8"),
                }
            ]
        )
        self.assertTrue(
            page.locator("#restorePlannerBackup").is_disabled(),
            "Selecting a backup file alone must not enable restore",
        )

        file_box = file_input.bounding_box()
        card_box = backup_card.bounding_box()
        self.assertIsNotNone(file_box)
        self.assertIsNotNone(card_box)
        self.assertGreaterEqual(file_box["x"], card_box["x"] - 1)
        self.assertLessEqual(
            file_box["x"] + file_box["width"],
            card_box["x"] + card_box["width"] + 1,
        )
        self.assert_no_horizontal_overflow(page)

        page.locator("#tab-calendar").click()
        page.wait_for_function(
            """() => document.getElementById('panel-calendar')?.classList.contains('active')"""
        )
        page.wait_for_selector("#calendarMonthGrid .calendar-day-cell")
        self.assertEqual(
            page.locator(".calendar-day-details").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "static",
            "Mobile Calendar details should flow normally instead of sticking over content",
        )
        self.assert_no_horizontal_overflow(page)

    def test_desktop_planner_sticky_rails_calendar_and_fit(self):
        page = self.open_planner(1280, 900)

        self.assertEqual(
            page.locator(".tab-nav").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "fixed",
        )
        self.assert_inside_viewport(page, ".tab-nav")

        layout_box = page.locator(".plan-layout").bounding_box()
        sidebar_box = page.locator(".plan-sidebar").bounding_box()
        self.assertIsNotNone(layout_box)
        self.assertIsNotNone(sidebar_box)
        self.assertAlmostEqual(
            sidebar_box["y"],
            layout_box["y"],
            delta=2,
            msg="Desktop Quick Status should begin at its natural plan-section position",
        )
        self.assertEqual(
            page.locator(".plan-sidebar").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "sticky",
        )
        self.assertEqual(
            page.locator(".plan-sidebar").evaluate(
                "element => getComputedStyle(element).top"
            ),
            "24px",
        )
        self.assert_no_horizontal_overflow(page)

        page.locator("#tab-calendar").click()
        page.wait_for_selector("#calendarMonthGrid .calendar-day-cell")
        self.assertEqual(
            page.locator(".calendar-day-details").evaluate(
                "element => getComputedStyle(element).position"
            ),
            "sticky",
        )
        self.assertEqual(
            page.locator(".calendar-day-details").evaluate(
                "element => getComputedStyle(element).top"
            ),
            "24px",
        )

        calendar_columns = page.locator(".calendar-view-layout").evaluate(
            """element => getComputedStyle(element).gridTemplateColumns
                .split(" ")
                .filter(Boolean).length"""
        )
        self.assertEqual(
            calendar_columns,
            2,
            "Desktop Calendar should retain month + sticky-details split layout in WebKit",
        )
        self.assert_no_horizontal_overflow(page)


if __name__ == "__main__":
    unittest.main(verbosity=2)

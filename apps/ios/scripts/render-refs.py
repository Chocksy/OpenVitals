#!/usr/bin/env python3
"""Render the design system's own pages into apps/ios/Tests/References.

The mockups under `docs/mockups/v4` are the spec; these PNGs are what the
snapshot tests compare the native views against. Nothing here edits a
mockup: the pages are opened read-only from `file://`.

    uv run --with "playwright==1.56.0" python apps/ios/scripts/render-refs.py

The first run also needs the browser itself:

    uv run --with "playwright==1.56.0" python -m playwright install chromium

What is rendered, all at 3x:

  * the nine phone frames — Today, Body, Plan, Meals, Capture, Settings from
    `ios.html`, Sign in from `login.html`, and phase 34's two: Blood from
    `blood.html` and Research from `research.html`. The page is laid out at
    1440 px so `.phone` keeps its real 390 px width, and the clip is the
    phone element itself.
  * the goal row from `system.html` section 08, at the 1440 px the page is
    designed for: its three columns overflow at 390 and the render is
    unreadable, and a reference nobody can read is not a reference.
  * sections 03–15 of `system.html`, the element list the gallery mirrors,
    laid out at 390 px so the section is the width the phone is.

Each one twice: light, and the same page with the theme toggled to dark.
"""

from __future__ import annotations

import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[3]
MOCKUPS = ROOT / "docs" / "mockups" / "v4"
OUT = ROOT / "apps" / "ios" / "Tests" / "References"

SCALE = 3

# name, page, css selector, index among matches, viewport width
PHONES = [
    ("today", "ios.html", ".phone", 0, 1440),
    ("body", "ios.html", ".phone", 1, 1440),
    ("plan", "ios.html", ".phone", 2, 1440),
    ("meals", "ios.html", ".phone", 3, 1440),
    ("capture", "ios.html", ".phone", 4, 1440),
    ("settings", "ios.html", ".phone", 5, 1440),
    ("signin", "login.html", ".phone", 0, 1440),
    # Phase 34: Blood, one marker and Research, each the 390 px frame of its
    # own page.
    ("blood", "blood.html", ".phone", 0, 1440),
    ("research", "research.html", ".phone", 0, 1440),
]

SECTIONS = [
    (f"gallery-s{n:02d}", "system.html", f"section#s{n:02d}", 0, 390)
    for n in range(3, 16)
] + [
    # The goal row on its own, which is the shape `GoalCard` is built from.
    ("goalrow", "system.html", "section#s08 .rowlist:has(.goalrow)", 0, 1440),
]

DARK = """() => {
  const d = document.documentElement;
  d.setAttribute('data-theme', 'dark');
  d.classList.add('dark');
}"""

LIGHT = """() => {
  const d = document.documentElement;
  d.setAttribute('data-theme', 'light');
  d.classList.remove('dark');
}"""

# The mockups animate on load (staggered chips, the motion samples in
# section 13). Freeze every animation so two runs give the same pixels.
STILL = """() => {
  const css = document.createElement('style');
  css.textContent = `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
  }
  /* The phone frame draws a mock status bar; the real one belongs to iOS
     and is not part of any view the app renders, so it is not compared. */
  .phone .statusbar { display: none !important; }
  .themebtn { display: none !important; }`;
  document.head.appendChild(css);
}"""


def render(page, name: str, selector: str, index: int) -> None:
    node = page.locator(selector).nth(index)
    node.scroll_into_view_if_needed()
    for theme, script in (("light", LIGHT), ("dark", DARK)):
        page.evaluate(script)
        page.wait_for_timeout(120)
        target = OUT / f"{name}-{theme}.png"
        node.screenshot(path=str(target), animations="disabled")
        box = node.bounding_box()
        print(f"{target.name}: {box['width']:.0f}x{box['height']:.0f} css px")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in sorted({w for *_, w in PHONES + SECTIONS}):
            context = browser.new_context(
                viewport={"width": width, "height": 1200},
                device_scale_factor=SCALE,
                reduced_motion="reduce",
                color_scheme="light")
            page = context.new_page()
            loaded: str | None = None
            for name, doc, selector, index, w in PHONES + SECTIONS:
                if w != width:
                    continue
                if doc != loaded:
                    page.goto((MOCKUPS / doc).as_uri())
                    try:
                        page.wait_for_function(
                            "document.fonts.status === 'loaded'", timeout=15000)
                    except Exception:
                        print(f"warning: {doc}: web fonts did not load",
                              file=sys.stderr)
                    page.evaluate(STILL)
                    loaded = doc
                render(page, name, selector, index)
            context.close()
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

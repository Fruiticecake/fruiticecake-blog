# Open Source Radar local verification

- Date: 2026-08-10 (America/La_Paz)
- Result: PASS
- Build under test: production output from `python src/generator.py`
- Server: `python -m http.server 8765 -d public`, bound to `127.0.0.1:8765` as PID `17596`
- Browser: Playwright Chromium through the Playwright MCP fallback
- Viewports: desktop `1440x1000`; mobile `375x812`

## Production build and automated tests

1. `python src/generator.py` -> `OK: 60 posts, 5 sections`
2. `python -W ignore::ResourceWarning -m unittest discover -s tests -v` -> `Ran 42 tests`, `OK`
3. The production build was regenerated after each verification-driven fix and the complete browser journey was repeated against `public/`.

## Critical URLs and visible content

| URL | HTTP | Title | Visible heading / evidence |
| --- | ---: | --- | --- |
| `http://127.0.0.1:8765/` | 200 | `Fruiticecake` | `Fruiticecake`; 845 characters of visible body text; no error overlay |
| `http://127.0.0.1:8765/opensource/` | 200 | `开源雷达 · Fruiticecake` | `开源雷达`; lead shows `12 个项目`; three `今日风向` items |
| `http://127.0.0.1:8765/opensource/2026-08-09.html` | 200 | `开源雷达 · 2026-08-09 · Fruiticecake` | `开源雷达 · 2026-08-09`; `今日趋势`, `重点项目`, and `快速浏览` visible |

The browser journey clicked the homepage top-navigation `开源雷达` link to `/opensource/`, clicked the latest lead to `/opensource/2026-08-09.html`, opened `sample/observability-mesh` in a new tab, confirmed the exact new-tab URL `https://github.com/sample/observability-mesh`, closed it, returned to the section, and clicked the `14 日轨迹` day-9 entry back to the dated issue. The fixture contains only one issue, so the `历史日报` heading is present but there is no older dated row; the date rail is the available history/date entry.

## Project counts and link safety

- Featured cards: 3
- Quick cards: 9
- Repository cards total: 12
- Repository links with `target="_blank" rel="noopener noreferrer"`: 12/12
- Longest repository name tested: `sample/observability-mesh`
- Desktop: all repository-link rectangles remained inside their cards.
- Mobile: longest repository heading `scrollWidth=290`, `clientWidth=290`; overflowing repository headings: 0.

The external destination is fixture data and GitHub currently titles it `Page not found · GitHub · GitHub`; this does not affect the verified local new-tab URL, safe-link attributes, or local resource health.

## Console and network

Final clean-session audit across all three local URLs:

- Console errors: 0
- Console warnings: 0
- Uncaught page errors: 0
- Failed local requests: 0
- Local responses with status >= 400: 0
- Critical document responses: 200/200/200
- `style.css`: 200 or cache-valid 304
- Loaded external font and Mermaid resources observed with HTTP 200

The first browser run found `/favicon.ico` returning 404. Evidence was saved before the fix. The layout now declares an inline favicon (`data:,`), and a clean browser session confirmed that the 404 and console error are gone.

## Overflow and responsive layout

| Page | Viewport | document `scrollWidth` | document `clientWidth` | Result |
| --- | --- | ---: | ---: | --- |
| Home | 1440x1000 | 1425 | 1425 | PASS |
| Section | 1440x1000 | 1425 | 1425 | PASS |
| Detail | 1440x1000 | 1425 | 1425 | PASS |
| Home | 375x812 | 360 | 360 | PASS |
| Section | 375x812 | 360 | 360 | PASS |
| Detail | 375x812 | 360 | 360 | PASS |

The initial mobile screenshots showed the navigation's own horizontal scroller clipping `开源雷达` and `归档` at the right edge. After the CSS fix, the mobile nav uses `flex-wrap: wrap`, `overflow-x: visible`, has equal `scrollWidth` and `clientWidth` (360), and reports zero clipped links on all three pages.

## Keyboard and reduced motion

- Tab order reached the global navigation (`首页`, `开源雷达`, `归档`).
- Section Tab step 9 reached the latest lead with a 3px green outline.
- Section Tab step 10 reached the day-9 rail/history entry with a visible inset focus box shadow.
- Detail Tab step 10 reached `sample/agent-kit` with a 3px green outline; subsequent repository links are in normal sequential order.
- Every recorded target matched `:focus-visible` and had an outline or internal box-shadow indicator.
- With normal motion, `.opensource-lead::after` computed `animation-name: radar-scan`.
- With `prefers-reduced-motion: reduce`, the same scanning layer computed `animation-name: none`.

## Full-page screenshots

All required artifacts are final post-fix captures.

| Page | Viewport | Full-page image | Absolute path |
| --- | --- | --- | --- |
| Home | 1440x1000 | 1425x1435 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\home-desktop.png` |
| Section | 1440x1000 | 1425x1393 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\section-desktop.png` |
| Detail | 1440x1000 | 1425x2537 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\detail-desktop.png` |
| Home | 375x812 | 360x2353 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\home-mobile.png` |
| Section | 375x812 | 360x1639 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\section-mobile.png` |
| Detail | 375x812 | 360x4018 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\detail-mobile.png` |

Pre-fix evidence is also retained as `home-desktop-before-favicon-fix.png`, `home-mobile-before-nav-fix.png`, and `section-mobile-before-nav-fix.png` in the same directory.

## UI inspection conclusion

PASS. The warm cream background, dark brown editorial surfaces, serif display type, clay accent, and radar green remain visually consistent with the rest of the site. The section lead is immediately dominant; its count, date, copy, radar motif, and action are legible. Three trend cells read as one ranked group. The detail page clearly separates trends, the three larger featured projects, and the nine compact quick cards. Body copy is readable at both viewports. Manual review found no final clipping, overlap, page-level or navigation-level horizontal scrolling, or truncated repository names.

## Verification-driven fixes

1. Added an inline favicon declaration to prevent the browser's default `/favicon.ico` 404 and added a generator regression assertion.
2. Wrapped the global navigation below 720px to remove its internal horizontal scroll and clipping, with a CSS regression test.

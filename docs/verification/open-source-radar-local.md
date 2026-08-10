# Open Source Radar local verification

- Date: 2026-08-10 (America/La_Paz)
- Result: fixture UI harness PASS; production shell build PASS; production data E2E PENDING Task 9
- Browser: Playwright Chromium through the Playwright MCP fallback
- Viewports: desktop `1440x1000`; mobile `375x812`

## Verification boundary

The six screenshots and browser journey below were produced from a temporary UI harness digest generated from `tests/fixtures/briefs.json`. They verify rendering, layout, interaction, accessibility, link attributes, and browser health. They are not evidence that real repository data has been published.

The tracked fixture digest was removed from `content/opensource/` before release. The current production build contains only the Open Source Radar section shell. Task 9 GitHub Actions must generate real content, after which production E2E must be repeated against the real dated issue and real GitHub links. Until that happens, the data publication status is not PASS.

## Server commands

Original Task 8 run fact: the server was started as:

```powershell
python -m http.server 8765 -d public
```

It was reached through `http://127.0.0.1:8765` as PID 17596 and that exact PID was stopped after testing. The original command did not explicitly bind the server to loopback.

Recommended reproduction command:

```powershell
python -m http.server 8765 --bind 127.0.0.1 -d public
```

## Fixture UI harness construction

The generator integration test now creates an isolated temporary `content/opensource/` directory, invokes the Task 4 CLI with:

```text
--date 2026-08-09 --fixture tests/fixtures/briefs.json
```

It then points `generator.CONTENT` and `generator.PUBLIC` at temporary directories. This preserves coverage for the homepage link, `/opensource/`, `/opensource/2026-08-09.html`, the wide detail layout, and RSS without writing fixture data into production `content/` or `public/`.

## Fixture browser evidence

| Harness URL | HTTP | Title | Visible evidence |
| --- | ---: | --- | --- |
| `http://127.0.0.1:8765/` | 200 | `Fruiticecake` | Homepage content present; no error overlay |
| `http://127.0.0.1:8765/opensource/` | 200 | `开源雷达 · Fruiticecake` | Lead count 12 and three trend items |
| `http://127.0.0.1:8765/opensource/2026-08-09.html` | 200 | `开源雷达 · 2026-08-09 · Fruiticecake` | Three featured cards and nine quick cards |

Harness journey: homepage top navigation -> Open Source Radar section -> latest issue -> one GitHub new tab -> back to section -> 14-day date rail -> dated issue.

Harness-only counts and behavior:

- Featured cards: 3
- Quick cards: 9
- Repository cards: 12
- Safe external links with `target="_blank" rel="noopener noreferrer"`: 12/12
- Longest fixture name: `sample/observability-mesh`; no desktop or mobile card overflow
- New tab opened the expected fixture URL, then was closed
- Console errors: 0; console warnings: 0; uncaught page errors: 0
- Failed local requests: 0; local responses with status >= 400: 0
- Critical harness document responses: 200/200/200

The `sample/*` names, Trending positions, and star deltas in these harness artifacts are explicitly fictional test data and are not present in the release content or production build.

## Harness layout and accessibility

| Page | Viewport | document `scrollWidth` | document `clientWidth` | Result |
| --- | --- | ---: | ---: | --- |
| Home | 1440x1000 | 1425 | 1425 | PASS |
| Section | 1440x1000 | 1425 | 1425 | PASS |
| Detail | 1440x1000 | 1425 | 1425 | PASS |
| Home | 375x812 | 360 | 360 | PASS |
| Section | 375x812 | 360 | 360 | PASS |
| Detail | 375x812 | 360 | 360 | PASS |

- Tab order reached global navigation, the issue lead, the date/history rail, and repository links.
- Sampled keyboard targets matched `:focus-visible` and showed an outline or internal box-shadow.
- Normal motion computed `.opensource-lead::after` as `animation-name: radar-scan`.
- `prefers-reduced-motion: reduce` computed the same layer as `animation-name: none`.
- Manual harness inspection found a consistent warm editorial style, a dominant lead, clear trend/featured/quick hierarchy, readable copy, and no final clipping, overlap, or horizontal scrolling.

## Fixture UI screenshots

These retained screenshots are UI harness artifacts, not production-data screenshots.

| Page | Viewport | Full-page image | Absolute path |
| --- | --- | --- | --- |
| Home | 1440x1000 | 1425x1435 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\home-desktop.png` |
| Section | 1440x1000 | 1425x1393 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\section-desktop.png` |
| Detail | 1440x1000 | 1425x2537 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\detail-desktop.png` |
| Home | 375x812 | 360x2353 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\home-mobile.png` |
| Section | 375x812 | 360x1639 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\section-mobile.png` |
| Detail | 375x812 | 360x4018 | `C:\Users\Administrator\.codex\visualizations\2026\08\10\019fe96c-9f34-7590-8f9c-ba60b7ae58a1\open-source-radar-local\detail-mobile.png` |

Pre-fix harness evidence is retained in the same directory as `home-desktop-before-favicon-fix.png`, `home-mobile-before-nav-fix.png`, and `section-mobile-before-nav-fix.png`.

## Production gate evidence

The tracked `content/opensource/2026-08-09.md` fixture was deleted. The production directory may be empty until Task 9 creates a real issue.

Full suite: `python -W ignore::ResourceWarning -m unittest discover -s tests -v` -> 44 tests passed.

Automated gates now assert:

1. Every production `content/opensource/*.md` file excludes `sample/` and the known fictional Trending/star-delta markers.
2. A generator build from production content into a fresh temporary `public/` tree excludes `sample/`.
3. The fixture integration build remains entirely inside temporary content and public directories.

The ignored stale harness artifact `public/opensource/2026-08-09.html` was removed before the normal production rebuild because the static generator does not clean old output files. Final production commands and results:

```text
python src/generator.py
OK: 59 posts, 5 sections -> ...\public

rg -n "sample/|今日新增 842 星|今日新增 615 星|今日新增 488 星" content/opensource
no matches

rg -n "sample/" public
no matches
```

The resulting `public/opensource/` contains only `index.html`, which verifies that the section shell builds with no published digest.

## Verification-driven fixes retained from the harness run

1. Inline favicon declaration prevents the browser's default `/favicon.ico` 404.
2. Navigation wraps below 720px, removing its internal horizontal scroll and clipped links.

## Release conclusion

- UI harness: PASS
- Production shell build and fixture-exclusion gate: PASS
- Real Open Source Radar data and outbound-link E2E: PENDING Task 9 Actions generation and a new production E2E run

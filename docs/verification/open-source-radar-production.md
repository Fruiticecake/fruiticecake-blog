# Open Source Radar production verification

- Date: 2026-08-10 (America/La_Paz)
- GitHub Actions run: [31375006486](https://github.com/Fruiticecake/fruiticecake-blog/actions/runs/31375006486) — success
- Published digest: `content/opensource/2026-08-10.md` — 8 real projects, 3 trend rows, no fixture `sample/` names
- DeepSeek smoke: official API request succeeded with structured brief validation
- Vercel production: [zyj-blog.vercel.app/opensource/2026-08-10.html](https://zyj-blog.vercel.app/opensource/2026-08-10.html) — HTTP 200, Ready deployment

## Data checks

- The generated issue contains eight GitHub repository links and no `sample/` fixture repository.
- The issue metadata identifies GitHub Trending plus GitHub REST metadata and DeepSeek structured analysis.
- The workflow committed the generated issue as `457025c` after tests and static generation completed.

## Browser smoke checks

- Section index: `https://zyj-blog.vercel.app/opensource/` — HTTP 200, current date visible, no fixture data.
- Latest issue: `https://zyj-blog.vercel.app/opensource/2026-08-10.html` — HTTP 200, `.radar-digest` present, eight external GitHub links, no fixture data.
- The production deployment was `● Ready` in `vercel ls --prod`.

The local Playwright harness remains documented separately in `open-source-radar-local.md`; its fixture screenshots verify layout and accessibility, while this report records real-data publication and production HTTP checks.

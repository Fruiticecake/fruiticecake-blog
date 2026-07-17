#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""拉取 AI HOT 当日日报并写入 content/aihot/<date>.md（统一交给生成器渲染）。

运行：python3 src/aihot.py
- 优先拉取北京时间「今天」的日报；仅当 items>0 且 API date==今天时视为今日成功。
- 否则拉取 latest，按其真实 date 落盘；若该 date 不是今天则 exit 2（便于晚间重试）。
- latest 为空则 exit 1。绝不把昨日内容写进今日文件名。
"""
import os
import sys
import json
import datetime
import urllib.request
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_AIHOT = os.path.join(ROOT, "content", "aihot")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

SECTION_ORDER = [
    ("ai-models", "模型发布/更新"),
    ("ai-products", "产品发布/更新"),
    ("industry", "行业动态"),
    ("paper", "论文研究"),
    ("tip", "技巧与观点"),
]

BJ = datetime.timezone(datetime.timedelta(hours=8))


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8")
    except Exception:
        out = subprocess.run(["curl", "-s", "-H", f"User-Agent: {UA}", url],
                             capture_output=True, text=True, timeout=40)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout
        raise RuntimeError("fetch failed: " + url)


def get_daily(date_str=None):
    """Fetch daily digest. date_str=None means latest. No silent fallback."""
    base = "https://aihot.virxact.com/api/public/daily"
    url = f"{base}/{date_str}" if date_str else base
    return json.loads(fetch(url))


def count_items(data):
    sections = data.get("sections") or []
    return sum(len(s.get("items") or []) for s in sections)


def clean(s):
    return (s or "").replace("[", "(").replace("]", ")").strip()


def build_markdown(data, date_str):
    sections_map = {s.get("label", ""): s.get("items", []) for s in data.get("sections", [])}
    total = sum(len(sections_map.get(lbl, [])) for _, lbl in SECTION_ORDER)
    lines = []
    lines.append("---")
    lines.append(f'title: AI HOT 日报 · {date_str}')
    lines.append(f'date: {date_str}')
    lines.append("section: aihot")
    lines.append("html: true")
    lines.append(f'summary: 今日 AI HOT 收录 {total} 条动态，覆盖模型/产品/行业/论文/观点。')
    lines.append("tags: [AI, 日报, AI HOT]")
    lines.append(f'slug: {date_str}')
    lines.append("---")
    lines.append("")
    import html as html_lib

    def esc(s):
        return html_lib.escape(clean(s), quote=True)

    lines.append(f'<p class="aihot-intro">由 <a href="https://aihot.virxact.com" target="_blank" rel="noopener noreferrer">AI HOT</a> 公开接口整理，共 <strong>{total}</strong> 条。</p>')
    for _, lbl in SECTION_ORDER:
        items = sections_map.get(lbl, [])
        if not items:
            continue
        lines.append('<section class="aihot-group">')
        lines.append(f'  <h2 class="aihot-group-title">{esc(lbl)}</h2>')
        lines.append('  <div class="aihot-grid">')
        for it in items:
            title = clean(it.get("title", ""))
            url = it.get("sourceUrl") or it.get("permalink") or "#"
            src = clean(it.get("sourceName", "") or "AI HOT")
            summ = clean(it.get("summary", ""))[:140]
            body = esc(summ) if summ else "点击查看原文"
            lines.append(f'    <a class="aihot-card" href="{esc(url)}" target="_blank" rel="noopener noreferrer">')
            lines.append(f'      <span class="aihot-card-cat">{esc(lbl)}</span>')
            lines.append(f'      <h3>{esc(title)}</h3>')
            lines.append(f'      <p>{body}</p>')
            lines.append(f'      <span class="aihot-card-src">{esc(src)}</span>')
            lines.append('    </a>')
        lines.append('  </div>')
        lines.append('</section>')
    return "\n".join(lines)


def write_daily(data, date_str):
    os.makedirs(CONTENT_AIHOT, exist_ok=True)
    out = os.path.join(CONTENT_AIHOT, f"{date_str}.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build_markdown(data, date_str))
    print(f"OK aihot -> {out}")
    return out


def main():
    today = datetime.datetime.now(BJ).strftime("%Y-%m-%d")

    try:
        data_today = get_daily(today)
    except Exception as e:
        print(f"WARN today fetch failed: {e}", file=sys.stderr)
        data_today = None

    if data_today is not None:
        n = count_items(data_today)
        api_date = data_today.get("date") or ""
        if n > 0 and api_date == today:
            write_daily(data_today, today)
            return 0

    try:
        data = get_daily(None)
    except Exception as e:
        print(f"ERR latest fetch failed: {e}", file=sys.stderr)
        return 1

    n = count_items(data)
    if n <= 0:
        print("ERR latest empty", file=sys.stderr)
        return 1

    real_date = data.get("date") or ""
    if not real_date:
        print("ERR latest missing date", file=sys.stderr)
        return 1

    write_daily(data, real_date)
    if real_date != today:
        print(f"INFO wrote {real_date}, not today ({today}); exit 2 for retry", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

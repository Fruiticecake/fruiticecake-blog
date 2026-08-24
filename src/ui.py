#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""界面外壳：顶部药丸导航、移动端底部标签栏、月历网格、连续更新天数。

这些片段只负责生成 HTML，样式全部在 static/style.css 里。
新增板块时只要在 config.json 加一条，导航和标签栏会自动跟着长出来；
图标没配就退化成一个圆点，不会缺角。
"""
import calendar
import datetime

import util

# 底部标签栏图标：20×20 线性图标，stroke 由 CSS 的 currentColor 接管。
_ICONS = {
    "home": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
    "aihot": '<path d="M12 3s5 4.2 5 8.5a5 5 0 0 1-10 0C7 9 9 7.5 9 7.5s.5 2 1.5 2S12 3 12 3Z"/>',
    "ai-chat": '<path d="M20 12a7.5 7.5 0 0 1-10.8 6.7L4 20l1.4-4.1A7.5 7.5 0 1 1 20 12Z"/>',
    "blog": '<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z"/><path d="M13.5 6.5 17.5 10.5"/>',
    "docs": '<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
    "opensource": '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12 18 6"/>',
    "archive": '<path d="M3.5 7.5h17v12h-17z"/><path d="M2.5 4.5h19v3h-19z"/><path d="M10 11.5h4"/>',
}
_ICON_FALLBACK = '<circle cx="12" cy="12" r="6.5"/>'

_WEEKDAY_HEADS = ["日", "一", "二", "三", "四", "五", "六"]


def _icon(slug):
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{_ICONS.get(slug, _ICON_FALLBACK)}</svg>'


def _current(slug, active):
    return ' aria-current="page"' if slug == active else ""


def _destinations(cfg):
    """首页 + 各板块 + 归档，导航与标签栏共用同一份顺序。"""
    items = [("home", "/", "首页", "首页")]
    for section in cfg["sections"]:
        items.append((section["slug"], f'/{section["slug"]}/',
                      section["name"], section.get("tab") or section["name"]))
    items.append(("archive", "/archive/", "归档", "归档"))
    return items


def nav_links_html(cfg, active=""):
    """顶部药丸导航里的板块链接（首页与归档由模板直接写死，保证顺序）。"""
    return "".join(
        f'<a href="/{s["slug"]}/"{_current(s["slug"], active)}>{util.html_escape(s["name"])}</a>'
        for s in cfg["sections"])


def tab_links_html(cfg, active=""):
    """移动端底部标签栏：图标 + 短标签。"""
    return "".join(
        f'<a href="{url}"{_current(slug, active)}>{_icon(slug)}'
        f'<span class="tab-label">{util.html_escape(short)}</span></a>'
        for slug, url, _name, short in _destinations(cfg))


# ---------------- 日历 ----------------
def _bj_date(post):
    date = post.date
    if date.tzinfo is None:
        date = date.replace(tzinfo=datetime.timezone.utc)
    return date.astimezone(util.BJ).date()


def posts_by_date(posts):
    """同一天有多篇时保留最新的一篇（日报天然每天一篇）。"""
    mapping = {}
    for post in posts:
        mapping.setdefault(_bj_date(post), post)
    return mapping


def streak_days(posts):
    """从今天（或昨天）往回数，连续有更新的天数。"""
    days = set(posts_by_date(posts))
    if not days:
        return 0
    today = datetime.datetime.now(util.BJ).date()
    cursor = today if today in days else today - datetime.timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= datetime.timedelta(days=1)
    return count


def month_count(posts, today=None):
    today = today or datetime.datetime.now(util.BJ).date()
    return sum(1 for d in posts_by_date(posts)
               if d.year == today.year and d.month == today.month)


def calendar_html(posts, legend="有更新", variant=""):
    """当月日历网格：有内容的日子可点击，今天高亮为「今」。

    对应参考稿里的月历卡片——周日起始、圆角方格、缺席的日子留一个短横。
    variant 传 "is-radar" 时标记点用开源雷达的苔绿色，跟板块主色保持一致。
    """
    today = datetime.datetime.now(util.BJ).date()
    by_date = posts_by_date(posts)
    weeks = calendar.Calendar(firstweekday=6).monthdayscalendar(today.year, today.month)

    heads = "".join(f'<div class="cal-wd">{w}</div>' for w in _WEEKDAY_HEADS)
    cells = []
    for week in weeks:
        for day in week:
            if day == 0:
                cells.append('<div class="cal-cell is-blank" aria-hidden="true"></div>')
                continue
            date = datetime.date(today.year, today.month, day)
            post = by_date.get(date)
            classes = ["cal-cell"]
            if date == today:
                classes.append("is-today")
            elif date < today:
                classes.append("is-past")
            if post:
                classes.append("has-post")
            label = "今" if date == today else str(day)
            if post:
                mark = '<span class="cal-mark">·</span>'
            elif date > today:
                mark = ""          # 未来的日子留白，不用短横占位
            else:
                mark = '<span class="cal-mark">-</span>'
            attrs = f'class="{" ".join(classes)}"'
            if post:
                title = f'{date.month}月{date.day}日 · {util.html_escape(post.title)}'
                cells.append(f'<a {attrs} href="{post.url}" title="{title}">'
                             f'<span>{label}</span>{mark}</a>')
            else:
                cells.append(f'<div {attrs}><span>{label}</span>{mark}</div>')

    card_class = f"cal-card {variant}".strip()
    return (
        f'<div class="{card_class}">'
        '<div class="cal-head">'
        f'<span class="cal-month">{today.year}年{today.month}月</span>'
        f'<span class="cal-legend">{util.html_escape(legend)}</span>'
        '</div>'
        f'<div class="cal-grid">{heads}{"".join(cells)}</div>'
        '</div>')


def stat_html(label, value, unit="", extra_class=""):
    unit_html = f"<small>{util.html_escape(unit)}</small>" if unit else ""
    cls = f"stat {extra_class}".strip()
    return (f'<div class="{cls}"><span class="stat-label">{util.html_escape(label)}</span>'
            f'<span class="stat-num">{util.html_escape(value)}{unit_html}</span></div>')

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""首页：文章标记点星图 + 遥测数字 + 最近拍摄 + 板块频道。

星图的数据以 JSON 内嵌在页面里（<script type="application/json">），由 /site/constellation.js 绘制；
没有 JS 时页面下方的列表仍然能完整导航。
"""
import datetime
import json

import ui
import util

DAILY_SECTIONS = ("aihot", "opensource")      # 每日自动更新的板块：头条优先选其他板块的文章
LATEST_COUNT = 8
SPARK_WEEKS = 12


def marker_json(cfg, sections, all_posts):
    data = {
        "sections": [{"slug": s["slug"], "name": s["name"], "tab": s.get("tab", ""),
                      "count": sections[s["slug"]].count} for s in cfg["sections"]],
        "posts": [{"t": p.title, "u": p.url, "d": p.date.astimezone(util.BJ).strftime("%Y-%m-%d"), "s": p.section,
                   "stage": str(p.meta.get("design", "")).lower() == "stage"} for p in all_posts],
    }
    # 防止标题里出现 </script> 提前结束脚本块
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


def telemetry_html(cfg, all_posts):
    daily = [p for p in all_posts if p.section in DAILY_SECTIONS]
    cells = [
        ("TOTAL TAKES", str(len(all_posts)), "累计文章"),
        ("STREAK", f"{ui.streak_days(daily)}<small> d</small>", "连续更新天数"),
        ("THIS MONTH", str(ui.month_count(all_posts)), "本月新增"),
        ("CAMS", str(len(cfg["sections"])), "内容板块"),
    ]
    inner = "".join(f"<div><small>{k}</small><b>{v}</b><span>{d}</span></div>" for k, v, d in cells)
    return f'<div class="telemetry" data-reveal>{inner}</div>'


def feature_html(sections, all_posts):
    feature = next((p for p in all_posts if p.section not in DAILY_SECTIONS), all_posts[0] if all_posts else None)
    if feature is None:
        return '<p class="empty-note">暂无内容。</p>'
    return (f'<a class="feature" href="{feature.url}">'
            f'<span class="badge">{util.html_escape(sections[feature.section].name)} · 头条</span>'
            f'<h3>{util.html_escape(feature.title)}</h3>'
            f'<p>{util.html_escape(feature.summary)}</p>'
            f'<span class="meta">{feature.date.astimezone(util.BJ):%Y-%m-%d} · {feature.reading_time}</span></a>')


def takes_html(all_posts, take_no):
    total = len(all_posts)
    return "".join(
        f'<li class="m-row" style="--i:{i}"><a href="{p.url}"><span class="take-no">{take_no(total - i)}</span>'
        f'<span class="take-title">{util.html_escape(p.title)}</span>'
        f'<span class="take-date">{p.date.astimezone(util.BJ):%m-%d}</span></a></li>'
        for i, p in enumerate(all_posts[:LATEST_COUNT]))


def spark_svg(posts, today):
    weeks = [0] * SPARK_WEEKS
    for p in posts:
        w = (today - p.date.astimezone(util.BJ)).days // 7
        if 0 <= w < SPARK_WEEKS:
            weeks[SPARK_WEEKS - 1 - w] += 1
    peak = max(weeks) or 1
    bars = "".join(
        f'<rect x="{k * 9}" y="{28 - round(c / peak * 26)}" width="6" height="{round(c / peak * 26)}"/>' if c
        else f'<rect class="z" x="{k * 9 + 2}" y="26" width="2" height="2"/>'
        for k, c in enumerate(weeks))
    return f'<svg class="spark" viewBox="0 0 108 28" preserveAspectRatio="none" aria-hidden="true">{bars}</svg>'


def channels_html(cfg, sections, all_posts, today):
    cards = []
    for i, s in enumerate(cfg["sections"], 1):
        sec = sections[s["slug"]]
        last = util.html_escape(sec.posts[0].title) if sec.posts else "—"
        cards.append(
            f'<a class="channel" href="/{sec.slug}/"><span class="ch-id"><span>CAM_{i:02d}</span>'
            f'<span>{sec.count} TAKES</span></span><h3>{util.html_escape(sec.name)}</h3>'
            f'<p>{util.html_escape(sec.description)}</p>{spark_svg(sec.posts, today)}'
            f'<span class="last">最近：{last}</span></a>')
    span = f"{all_posts[-1].date:%Y} → {all_posts[0].date:%Y}" if all_posts else ""
    cards.append(
        f'<a class="channel is-archive" href="/archive/"><span class="ch-id"><span>CAM_ALL</span>'
        f'<span>{len(all_posts)} TAKES</span></span><h3>归档</h3>'
        f'<p>按时间浏览全部文章，或按标签筛选。</p><span class="last">{span}</span></a>')
    return "".join(cards)


def brand_html(title):
    """站名后半段高亮：FRUITICAKE → FRUITI<span class=hl>CAKE</span>；短名整体高亮最后 4 个字符。"""
    upper = title.upper()
    cut = max(1, len(upper) - 4)
    return f'{util.html_escape(upper[:cut])}<span class="hl">{util.html_escape(upper[cut:])}</span>'


def build(cfg, sections, all_posts, template, take_no, today=None):
    today = today or datetime.datetime.now(util.BJ)
    return template.substitute(
        today=f"{today:%Y-%m-%d}",
        total=len(all_posts),
        brand_html=brand_html(cfg["site"]["title"]),
        site_subtitle=util.html_escape(cfg["site"].get("subtitle", "")),
        telemetry_html=telemetry_html(cfg, all_posts),
        feature_html=feature_html(sections, all_posts),
        takes_html=takes_html(all_posts, take_no),
        channels_html=channels_html(cfg, sections, all_posts, today),
        marker_json=marker_json(cfg, sections, all_posts),
    )

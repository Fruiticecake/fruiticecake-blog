#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""博客静态生成器（零依赖，仅用标准库 json + string.Template）。

运行：python3 src/generator.py
从 content/<板块>/*.md 读取文章，按 config.json 渲染到 public/。
新增普通板块：建 content/<slug>/ 目录 + 在 config.json 的 sections 加一条即可，无需改代码
（默认用通用的时间线列表渲染）。aihot/ai-chat/blog/docs 四个板块各自有更贴合内容形态的列表样式，
在 build_section() 里按 slug 分派，其余板块一律走通用样式。
AI 对话记录：板块 slug 为 ai-chat，或文章 frontmatter 写 `type: chat`，
正文按 chat.py 的规则解析为聊天气泡。
"""
import os
import re
import shutil
import datetime
import json
from string import Template

import util
import markdown
import models
import chat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
TEMPLATES = os.path.join(SRC, "templates")
CONTENT = os.path.join(ROOT, "content")
PUBLIC = os.path.join(ROOT, "public")
STATIC = os.path.join(ROOT, "static")


def load_config():
    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        return json.load(f)


def load_template(name):
    with open(os.path.join(TEMPLATES, name), encoding="utf-8") as f:
        return Template(f.read())


def strip_html(h):
    return re.sub(r"<[^>]+>", "", h)


def make_summary(body_html, meta):
    if meta.get("summary"):
        return str(meta["summary"])
    text = re.sub(r"\s+", " ", strip_html(body_html)).strip()
    return text[:120] + ("…" if len(text) > 120 else "")


def name_map(sections):
    return {s: sec.name for s, sec in sections.items()}


def extract_count(summary):
    m = re.search(r"(\d+)\s*条", summary or "")
    return m.group(1) if m else ""


def parse_frontmatter(text):
    """Parse legacy frontmatter while decoding JSON values emitted by generators."""
    meta, body = util.parse_frontmatter(text)
    if not text.startswith("---"):
        return meta, body
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.S)
    if not match:
        return meta, body
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        try:
            meta[key.strip()] = json.loads(raw_value.strip())
        except json.JSONDecodeError:
            # Existing hand-authored frontmatter is deliberately not JSON-only.
            continue
    return meta, body


# ---------------- 加载文章 ----------------
def load_posts(cfg):
    sections = {}
    for sd in cfg["sections"]:
        sections[sd["slug"]] = models.Section(
            slug=sd["slug"], name=sd["name"],
            description=sd.get("description", ""), auto=sd.get("auto", False))
    all_posts = []
    for sd in cfg["sections"]:
        sdir = os.path.join(CONTENT, sd["slug"])
        if not os.path.isdir(sdir):
            continue
        for fn in sorted(os.listdir(sdir)):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(sdir, fn)
            with open(path, encoding="utf-8") as source:
                text = source.read()
            meta, body = parse_frontmatter(text)
            raw_html = str(meta.get("html", "")).lower() in ("true", "1", "yes")
            is_chat = sd["slug"] == "ai-chat" or str(meta.get("type", "")).lower() == "chat"
            if is_chat:
                body_html = chat.render(body, meta)
            elif raw_html:
                body_html = body
            else:
                body_html = markdown.render(body)
            slug = str(meta.get("slug") or util.slugify(fn[:-3]))
            date = util.parse_date(meta.get("date") or meta.get("published") or meta.get("created"))
            if date is None:
                date = datetime.datetime.fromtimestamp(
                    os.path.getmtime(path), tz=datetime.timezone.utc)
            tags = meta.get("tags") or []
            if isinstance(tags, str):
                tags = [tags]
            post = models.Post(
                slug=slug, section=sd["slug"],
                title=str(meta.get("title", fn[:-3])),
                date=date, summary=make_summary(body_html, meta),
                tags=list(tags), body_html=body_html, src_path=path,
                source=str(meta.get("source") or ""),
                model=str(meta.get("model") or ""), meta=meta)
            sections[sd["slug"]].posts.append(post)
            all_posts.append(post)
    for sec in sections.values():
        sec.posts.sort(key=lambda p: p.date, reverse=True)
    all_posts.sort(key=lambda p: p.date, reverse=True)
    return sections, all_posts


# ---------------- 通用片段 ----------------
def post_item_html(post, nmap):
    return (f'<article class="post-item">\n'
            f'  <div class="meta"><a class="sec-badge sec-{post.section}" '
            f'href="/{post.section}/">{util.html_escape(nmap[post.section])}</a> '
            f'<time>{post.date_human}</time></div>\n'
            f'  <h3><a href="{post.url}">{util.html_escape(post.title)}</a></h3>\n'
            f'  <p class="excerpt">{util.html_escape(post.summary)}</p>\n'
            f'</article>')


def section_cards_html(sections, cfg):
    cards = []
    for sd in cfg["sections"]:
        sec = sections[sd["slug"]]
        dot = sd.get("dot", "#8a7355")
        cards.append(
            f'<a class="sec-card sec-{sec.slug}" href="/{sec.slug}/">\n'
            f'  <span class="sec-dot" style="background:{util.html_escape(dot)}"></span>\n'
            f'  <h3>{util.html_escape(sec.name)}</h3>\n'
            f'  <p>{util.html_escape(sec.description)}</p>\n'
            f'  <span class="count">{sec.count} 篇</span>\n'
            f'</a>')
    return "\n".join(cards)


def tags_html(post):
    if not post.tags:
        return ""
    items = "".join(
        f'<a class="tag" href="/tags/{util.slugify(t)}.html">{util.html_escape(t)}</a>'
        for t in post.tags)
    return f'<div class="tags">{items}</div>'


def render_layout(cfg, title, description, content):
    t = load_template("layout.tpl")
    nav_links = "".join(
        f'<a href="/{s["slug"]}/">{util.html_escape(s["name"])}</a>'
        for s in cfg["sections"])
    return t.substitute(
        title=title, description=description,
        brand=util.html_escape(cfg["site"]["title"]),
        tagline=util.html_escape(cfg["site"].get("subtitle", "")),
        nav_links=nav_links, content=content,
        year=datetime.datetime.now(util.BJ).year,
        author=util.html_escape(cfg["site"].get("author", "")))


# ---------------- 板块专属列表渲染 ----------------
def render_aihot_section(sec):
    days = sec.posts[:14]
    streak_html = "".join(
        f'<div class="streak-day{" active" if i == 0 else ""}">'
        f'<div class="streak-wd">{util.weekday_cn(p.date)}</div>'
        f'<div class="streak-num">{p.date.day}</div></div>'
        for i, p in enumerate(days))
    rows = "".join(
        f'<a class="aihot-list-row" href="{p.url}">'
        f'<div><div class="aihot-list-date">{p.date_human}</div>'
        f'<div class="aihot-list-headline">{util.html_escape(p.summary)}</div></div>'
        f'<span class="aihot-list-count">{util.html_escape(extract_count(p.summary))} 条 →</span></a>'
        for p in sec.posts)
    return f'<div class="streak-row">{streak_html}</div><div class="aihot-list">{rows}</div>'


def render_chat_section(sec):
    rows = "".join(
        f'<a class="chat-inbox-row" href="{p.url}">'
        f'<div class="chat-avatar">{util.html_escape((p.model or "AI")[:1].upper())}</div>'
        f'<div class="chat-inbox-body"><div class="chat-inbox-top">'
        f'<span class="chat-inbox-title">{util.html_escape(p.title)}</span>'
        f'<span class="chat-inbox-date">{p.date_human}</span></div>'
        f'<div class="chat-inbox-preview">“{util.html_escape(p.summary)}”</div></div></a>'
        for p in sec.posts)
    return f'<div class="chat-inbox">{rows}</div>' if rows else '<p class="empty-note">还没有对话记录。</p>'


def render_blog_section(sec):
    posts = sec.posts
    if not posts:
        return '<p class="empty-note">暂无内容。</p>'
    feature, rest = posts[0], posts[1:]
    feature_html = (
        f'<a class="blog-feature" href="{feature.url}">'
        f'<div class="blog-feature-text"><span class="blog-feature-tag">最新</span>'
        f'<h2>{util.html_escape(feature.title)}</h2>'
        f'<p>{util.html_escape(feature.summary)}</p></div>'
        f'<div class="blog-feature-date">{feature.date_human}</div></a>')
    grid = "".join(
        f'<a class="blog-grid-item" href="{p.url}">'
        f'<div class="blog-grid-date">{p.date_human}</div>'
        f'<div class="blog-grid-title">{util.html_escape(p.title)}</div></a>'
        for p in rest)
    return feature_html + (f'<div class="blog-grid">{grid}</div>' if grid else "")


def render_docs_section(sec):
    rows = "".join(
        f'<a class="docs-index-row" href="{p.url}">'
        f'<span class="docs-index-idx">{i + 1:02d}</span>'
        f'<span class="docs-index-title">{util.html_escape(p.title)}</span>'
        f'<span class="docs-index-date">{p.date_human}</span></a>'
        for i, p in enumerate(sec.posts))
    return f'<div class="docs-index">{rows}</div>' if rows else '<p class="empty-note">暂无内容。</p>'


def _opensource_history_summary(post, limit=120):
    summary = " ".join(str(post.meta.get("trend_1") or post.summary or "").split())
    if len(summary) <= limit:
        return summary
    return summary[: limit - 1].rstrip() + "…"


def render_opensource_section(sec):
    if not sec.posts:
        return '<p class="empty-note">暂无内容。</p>'

    latest, history = sec.posts[0], sec.posts[1:]
    trends = [str(latest.meta.get(f"trend_{index}") or "") for index in range(1, 4)]
    trend_html = "".join(f'<li>{util.html_escape(trend)}</li>' for trend in trends if trend)
    project_count = latest.meta.get("project_count")
    count_html = (f'<span class="opensource-project-count">{util.html_escape(str(project_count))} 个项目</span>'
                  if project_count is not None else "")
    rail_html = "".join(
        f'<a class="streak-day{" active" if index == 0 else ""}" href="{post.url}">'
        f'<div class="streak-wd">{util.weekday_cn(post.date)}</div>'
        f'<div class="streak-num">{post.date.day}</div></a>'
        for index, post in enumerate(sec.posts[:14]))
    history_html = "".join(
        f'<a class="aihot-list-row" href="{post.url}">'
        f'<div><div class="aihot-list-date">{post.date_human}</div>'
        f'<div class="aihot-list-headline">{util.html_escape(_opensource_history_summary(post))}</div></div>'
        f'<span class="aihot-list-count">查看日报 →</span></a>'
        for post in history)
    return (
        f'<a class="opensource-lead" href="{latest.url}">'
        f'<div><div class="opensource-lead-kicker">最新一期 {count_html}</div>'
        f'<h2>{util.html_escape(latest.title)}</h2>'
        f'<p>{util.html_escape(latest.summary)}</p></div>'
        f'<span>阅读日报 →</span></a>'
        f'<section class="opensource-trends"><h2>今日风向</h2><ol>{trend_html}</ol></section>'
        f'<section class="opensource-rail"><h2>14 日轨迹</h2>'
        f'<div class="streak-row">{rail_html}</div></section>'
        f'<section class="opensource-history"><h2>历史日报</h2>'
        f'<div class="aihot-list">{history_html}</div></section>')


SECTION_RENDERERS = {
    "aihot": lambda sec, nmap: render_aihot_section(sec),
    "ai-chat": lambda sec, nmap: render_chat_section(sec),
    "blog": lambda sec, nmap: render_blog_section(sec),
    "docs": lambda sec, nmap: render_docs_section(sec),
    "opensource": lambda sec, nmap: render_opensource_section(sec),
}


# ---------------- 页面 ----------------
def build_home(cfg, sections, all_posts):
    t = load_template("home.tpl")
    nmap = name_map(sections)
    nav_slim = "".join(
        f'<a href="/{s["slug"]}/">{util.html_escape(s["name"])}</a>' for s in cfg["sections"]
    ) + '<a href="/archive/">归档</a>'

    chat_posts = [p for p in all_posts if p.section == "ai-chat"]
    if chat_posts:
        cp = chat_posts[0]
        chat_teaser_block = (
            f'<a class="home-chat-teaser" href="{cp.url}">'
            f'<div class="home-chat-kicker">最新 AI 对话</div>'
            f'<div class="home-chat-bubble">“{util.html_escape(cp.summary)}”</div>'
            f'<div class="home-chat-meta">与 {util.html_escape(cp.model or "AI")} · {cp.date_human} →</div></a>')
    else:
        chat_teaser_block = ""

    recent = all_posts[:cfg["site"].get("posts_per_home", 8)]
    feature = recent[0] if recent else None
    secondary = recent[1:6]
    if feature:
        feature_html = (
            f'<a class="home-feature" href="{feature.url}">'
            f'<span class="sec-badge sec-{feature.section}">{util.html_escape(nmap[feature.section])} · 头条</span>'
            f'<h2>{util.html_escape(feature.title)}</h2>'
            f'<p>{util.html_escape(feature.summary)}</p>'
            f'<span class="home-feature-date">{feature.date_human} · {feature.reading_time}</span></a>')
    else:
        feature_html = '<p class="empty-note">暂无内容。</p>'
    secondary_html = "".join(
        f'<a class="home-secondary-item" href="{p.url}">'
        f'<div class="home-secondary-top"><span class="sec-badge sec-{p.section}">{util.html_escape(nmap[p.section])}</span>'
        f'<span class="home-secondary-date">{p.date_human}</span></div>'
        f'<div class="home-secondary-title">{util.html_escape(p.title)}</div></a>'
        for p in secondary)

    content = t.substitute(
        site_title=util.html_escape(cfg["site"]["title"]),
        site_subtitle=util.html_escape(cfg["site"].get("subtitle", "")),
        nav_slim=nav_slim, chat_teaser_block=chat_teaser_block,
        feature_html=feature_html, secondary_html=secondary_html,
        section_cards=section_cards_html(sections, cfg))
    return render_layout(cfg, cfg["site"]["title"], cfg["site"].get("description", ""), content)


def build_section(cfg, sections, sd):
    sec = sections[sd["slug"]]
    nmap = name_map(sections)
    renderer = SECTION_RENDERERS.get(sd["slug"])
    body = renderer(sec, nmap) if renderer else "\n".join(post_item_html(p, nmap) for p in sec.posts)
    t = load_template("section.tpl")
    content = t.substitute(
        name=util.html_escape(sec.name),
        description=util.html_escape(sec.description),
        posts=body)
    return render_layout(cfg, f"{sec.name} · {cfg['site']['title']}",
                         sec.description, content)


def build_post(cfg, sections, post):
    t = load_template("post.tpl")
    if post.source:
        source_html = (
            f'<p class="source-note">原载 '
            f'<a href="{util.html_escape(post.source)}" target="_blank" '
            f'rel="noopener noreferrer">来源</a></p>'
        )
    else:
        source_html = ""
    model_html = (f'<span class="model-badge">{util.html_escape(post.model)}</span>'
                  if post.model else "")
    content = t.substitute(
        slug=post.section, section_url=f"/{post.section}/",
        post_class=" post-wide" if post.section == "opensource" else "",
        section_name=util.html_escape(sections[post.section].name),
        date=post.date_human, title=util.html_escape(post.title),
        reading_time=post.reading_time, model_html=model_html,
        tags_html=tags_html(post), source_html=source_html, body=post.body_html)
    return render_layout(cfg, f"{post.title} · {cfg['site']['title']}",
                         post.summary, content)


def build_archive(cfg, sections, all_posts):
    groups = []
    cur_key, cur_list = None, None
    for p in all_posts:
        key = (p.date.year, p.date.month)
        if key != cur_key:
            cur_key = key
            cur_list = []
            groups.append((f"{key[0]}年{key[1]}月", cur_list))
        cur_list.append(p)
    months_html = ""
    for label, posts in groups:
        rows = "".join(
            f'<a class="archive-row" href="{p.url}">'
            f'<span class="archive-dot"></span>'
            f'<span class="archive-title">{util.html_escape(p.title)}</span>'
            f'<span class="archive-date">{p.date.month:02d}-{p.date.day:02d}</span></a>'
            for p in posts)
        months_html += (
            f'<div class="archive-month"><div class="archive-month-label">{label}</div>'
            f'<div class="archive-timeline">{rows}</div></div>')
    t = load_template("archive.tpl")
    content = t.substitute(total=len(all_posts), posts=months_html)
    return render_layout(cfg, f"归档 · {cfg['site']['title']}", "全部文章归档", content)


def build_tags(cfg, sections, all_posts):
    tag_map = {}
    for p in all_posts:
        for tg in p.tags:
            tag_map.setdefault(tg, []).append(p)
    nmap = name_map(sections)
    max_count = max((len(ps) for ps in tag_map.values()), default=1)

    def tag_style(count):
        ratio = count / max_count
        size = 12 + 14 * ratio
        weight = 700 if ratio > 0.6 else 500
        opacity = round(45 + 40 * ratio)
        return (f'font-size:{size:.1f}px;font-weight:{weight};'
                f'color:color-mix(in srgb, var(--ink) {opacity}%, transparent)')

    idx_t = load_template("tag_index.tpl")
    tags_html_str = "\n".join(
        f'<a class="tag-prop" style="{tag_style(len(ps))}" href="/tags/{util.slugify(t)}.html">'
        f'{util.html_escape(t)} <span class="c">({len(ps)})</span></a>'
        for t, ps in sorted(tag_map.items(), key=lambda kv: -len(kv[1])))
    idx = idx_t.substitute(total=len(tag_map), tags=tags_html_str)
    idx_page = render_layout(cfg, f"标签 · {cfg['site']['title']}", "按标签浏览", idx)
    pages = {}
    tt = load_template("tags.tpl")
    for t, ps in tag_map.items():
        c = tt.substitute(
            tag=util.html_escape(t), count=len(ps),
            posts="\n".join(post_item_html(p, nmap) for p in ps))
        pages[util.slugify(t)] = render_layout(
            cfg, f"{t} · {cfg['site']['title']}", f"标签 {t}", c)
    return idx_page, pages


def build_feed(cfg, all_posts, limit=30):
    base = cfg["site"].get("base_url", "").rstrip("/")
    items = []
    for p in all_posts[:limit]:
        items.append(
            "  <item>\n"
            f"    <title>{util.html_escape(p.title)}</title>\n"
            f"    <link>{base}{p.url}</link>\n"
            f"    <guid>{base}{p.url}</guid>\n"
            f"    <pubDate>{p.date.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>\n"
            f"    <description>{util.html_escape(p.summary)}</description>\n"
            "  </item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>\n'
        f"  <title>{util.html_escape(cfg['site']['title'])}</title>\n"
        f"  <link>{base}/</link>\n"
        f"  <description>{util.html_escape(cfg['site'].get('description', ''))}</description>\n"
        + "\n".join(items) +
        "\n</channel></rss>\n"
    )


def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(content)


def reconcile_opensource_pages(posts):
    """Remove stale generated digest pages without touching section assets."""
    section_dir = os.path.join(PUBLIC, "opensource")
    if not os.path.isdir(section_dir):
        return
    expected_pages = {post.slug + ".html" for post in posts}
    for filename in os.listdir(section_dir):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.html", filename):
            continue
        path = os.path.join(section_dir, filename)
        if filename not in expected_pages and os.path.isfile(path):
            os.remove(path)


def main():
    cfg = load_config()
    sections, all_posts = load_posts(cfg)
    write_file(os.path.join(PUBLIC, "index.html"), build_home(cfg, sections, all_posts))
    for sd in cfg["sections"]:
        if sd["slug"] == "opensource":
            reconcile_opensource_pages(sections[sd["slug"]].posts)
        write_file(os.path.join(PUBLIC, sd["slug"], "index.html"),
                   build_section(cfg, sections, sd))
        for p in sections[sd["slug"]].posts:
            write_file(os.path.join(PUBLIC, sd["slug"], p.slug + ".html"),
                       build_post(cfg, sections, p))
    write_file(os.path.join(PUBLIC, "archive", "index.html"),
               build_archive(cfg, sections, all_posts))
    idx_page, tag_pages = build_tags(cfg, sections, all_posts)
    write_file(os.path.join(PUBLIC, "tags", "index.html"), idx_page)
    for slug, page in tag_pages.items():
        write_file(os.path.join(PUBLIC, "tags", slug + ".html"), page)
    write_file(os.path.join(PUBLIC, "feed.xml"), build_feed(cfg, all_posts))
    shutil.copyfile(os.path.join(STATIC, "style.css"),
                    os.path.join(PUBLIC, "style.css"))
    print(f"OK: {len(all_posts)} posts, {len(cfg['sections'])} sections -> {PUBLIC}")


if __name__ == "__main__":
    main()


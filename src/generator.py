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
import ui
import toc
import home_page
import stage
import stage_page

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
def is_stage(meta):
    return str(meta.get("design", "")).lower() == "stage"


def iter_post_files(sdir):
    """板块目录里的文章：单文件 xxx.md，或文件夹 xxx/index.md（文件夹里的其他文件是这篇文章的资源）。
    返回 (index.md 路径, 默认名, 文件夹路径或 None)。没有 index.md 的子目录忽略。"""
    for fn in sorted(os.listdir(sdir)):
        path = os.path.join(sdir, fn)
        if fn.endswith(".md") and os.path.isfile(path):
            yield path, fn[:-3], None
        elif os.path.isdir(path) and os.path.isfile(os.path.join(path, "index.md")):
            yield os.path.join(path, "index.md"), fn, path


def render_post_body(sd, path, meta, body):
    raw_html = str(meta.get("html", "")).lower() in ("true", "1", "yes")
    is_chat = sd["slug"] == "ai-chat" or str(meta.get("type", "")).lower() == "chat"
    if is_stage(meta) and (raw_html or is_chat):
        raise stage.StageError(f"{path}：design: stage 不能和 html: true 或对话格式（type: chat / ai-chat 板块）一起用")
    if is_chat:
        return chat.render(body, meta), None
    if raw_html:
        return body, None
    if is_stage(meta):
        try:
            rendered = stage.render_body(body)
        except stage.StageError as e:
            raise stage.StageError(f"{path}：{e}") from e
        return rendered.body_html, rendered
    return markdown.render(body), None


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
        for path, name, bundle_dir in iter_post_files(sdir):
            with open(path, encoding="utf-8") as source:
                text = source.read()
            meta, body = parse_frontmatter(text)
            body_html, rendered = render_post_body(sd, path, meta, body)
            slug = str(meta.get("slug") or util.slugify(name))
            date = util.parse_date(meta.get("date") or meta.get("published") or meta.get("created"))
            if date is None:
                date = datetime.datetime.fromtimestamp(
                    os.path.getmtime(path), tz=datetime.timezone.utc)
            tags = meta.get("tags") or []
            if isinstance(tags, str):
                tags = [tags]
            post = models.Post(
                slug=slug, section=sd["slug"],
                title=str(meta.get("title", name)),
                # 自动摘要跳过 TL;DR 块的小标签，否则摘要会以「// TL;DR」开头
                date=date, summary=make_summary(body_html.replace(stage.TLDR_LABEL, ""), meta),
                tags=list(tags), body_html=body_html, src_path=path,
                source=str(meta.get("source") or ""),
                model=str(meta.get("model") or ""), meta=meta,
                bundle_dir=bundle_dir, stage=rendered)
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


def tags_html(post):
    if not post.tags:
        return ""
    items = "".join(
        f'<a class="tag" href="/tags/{util.slugify(t)}.html">{util.html_escape(t)}</a>'
        for t in post.tags)
    return f'<div class="tags">{items}</div>'


MERMAID_SCRIPT = (
    '<script type="module">\n'
    "  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';\n"
    "  const light = document.documentElement.getAttribute('data-theme-resolved') === 'light';\n"
    "  mermaid.initialize({ startOnLoad: true, theme: light ? 'neutral' : 'dark' });\n"
    "</script>")


def site_version():
    """static/ 全部资源的内容哈希，页面引用 ?v= 用它，资源一改浏览器就取新文件。"""
    return stage_page.hash_tree(STATIC)


def render_layout(cfg, title, description, content, active=""):
    """active 传当前页面所属的板块 slug（首页传 home，归档传 archive），
    顶栏导航与移动端底部标签栏据此高亮当前项。首页首访播放开场校准动画。"""
    t = load_template("layout.tpl")
    current = ' aria-current="page"'
    return t.substitute(
        title=title, description=description,
        brand=util.html_escape(cfg["site"]["title"]),
        brand_upper=util.html_escape(cfg["site"]["title"].upper()),
        page=util.html_escape(active),
        head_boot=ui.head_boot_script(boot=active == "home"),
        version=site_version(),
        sound_button=ui.SOUND_BUTTON,
        theme_button=ui.THEME_BUTTON,
        analytics_html=ui.analytics_html(cfg),
        nav_links=ui.nav_links_html(cfg, active),
        tab_links=ui.tab_links_html(cfg, active),
        home_current=current if active == "home" else "",
        archive_current=current if active == "archive" else "",
        content=content,
        mermaid_script=MERMAID_SCRIPT if 'class="mermaid"' in content else "",
        year=datetime.datetime.now(util.BJ).year,
        author=util.html_escape(cfg["site"].get("author", "")))


# ---------------- 板块专属列表渲染 ----------------
def render_aihot_section(sec):
    if not sec.posts:
        return '<p class="empty-note">暂无内容。</p>'
    latest = sec.posts[0]
    stat_card = (
        '<div class="stat-card">'
        + ui.stat_html("已归档日报", len(sec.posts), "期")
        + f'<p class="stat-sub">最新一期 {latest.date_human} · '
          f'{util.html_escape(latest.summary)}</p>'
        '<div class="stat-chips">'
        f'<span class="stat-chip">连续更新 {ui.streak_days(sec.posts)} 天</span>'
        f'<span class="stat-chip">本月 {ui.month_count(sec.posts)} 期</span>'
        '</div></div>')
    rows = "".join(
        f'<a class="aihot-list-row" href="{p.url}">'
        f'<div><div class="aihot-list-date">{p.date_human}</div>'
        f'<div class="aihot-list-headline">{util.html_escape(p.summary)}</div></div>'
        f'<span class="aihot-list-count">{util.html_escape(extract_count(p.summary))} 条 →</span></a>'
        for p in sec.posts)
    return (
        f'<div class="daily-top">{stat_card}{ui.calendar_html(sec.posts, "点开当天日报")}</div>'
        '<section class="block"><h2>历史日报'
        '<a class="more-link" href="/archive/">全部归档 →</a></h2>'
        f'<div class="aihot-list">{rows}</div></section>')


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


def take_no(n):
    """拍摄编号：按时间正序给每篇文章一个编号，最新的编号最大。"""
    return f"TAKE {n:03d}"


def is_stage_post(post):
    return str(post.meta.get("design", "")).lower() == "stage"


def render_take_log(sec):
    """博客 / 技术文档：拍摄记录式列表（编号 · 标题 + 摘要 · 日期）。"""
    if not sec.posts:
        return '<p class="empty-note">暂无内容。</p>'
    total = len(sec.posts)
    rows = "".join(
        f'<li class="m-row" style="--i:{min(i, 12)}"><a href="{p.url}">'
        f'<span class="take-no">{take_no(total - i)}</span>'
        f'<div><h3>{util.html_escape(p.title)}{" <span class=badge>STAGE</span>" if is_stage_post(p) else ""}</h3>'
        f'<p>{util.html_escape(p.summary)}</p></div>'
        f'<span class="take-date">{p.date.astimezone(util.BJ):%Y-%m-%d}</span></a></li>'
        for i, p in enumerate(sec.posts))
    return f'<ol class="log">{rows}</ol>'


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
    history_html = "".join(
        f'<a class="aihot-list-row" href="{post.url}">'
        f'<div><div class="aihot-list-date">{post.date_human}</div>'
        f'<div class="aihot-list-headline">{util.html_escape(_opensource_history_summary(post))}</div></div>'
        f'<span class="aihot-list-count">查看日报 →</span></a>'
        for post in history)
    total_projects = sum(int(post.meta.get("project_count") or 0) for post in sec.posts)
    stat_card = (
        '<div class="stat-card">'
        + ui.stat_html("已发布日报", len(sec.posts), "期")
        + f'<p class="stat-sub">累计梳理 {total_projects} 个开源项目 · '
          f'最新一期 {latest.date_human}</p>'
        '<div class="stat-chips">'
        f'<span class="stat-chip is-radar">连续更新 {ui.streak_days(sec.posts)} 天</span>'
        f'<span class="stat-chip is-radar">本月 {ui.month_count(sec.posts)} 期</span>'
        '</div></div>')
    return (
        f'<a class="opensource-lead" href="{latest.url}">'
        f'<div><div class="opensource-lead-kicker">最新一期 {count_html}</div>'
        f'<h2>{util.html_escape(latest.title)}</h2>'
        f'<p>{util.html_escape(latest.summary)}</p></div>'
        f'<span>阅读日报 →</span></a>'
        f'<div class="daily-top">{stat_card}'
        f'{ui.calendar_html(sec.posts, "点开当天日报", "is-radar")}</div>'
        f'<section class="opensource-trends"><h2>今日风向</h2><ol>{trend_html}</ol></section>'
        f'<section class="opensource-history"><h2>历史日报</h2>'
        f'<div class="aihot-list">{history_html}</div></section>')


SECTION_RENDERERS = {
    "aihot": lambda sec, nmap: render_aihot_section(sec),
    "ai-chat": lambda sec, nmap: render_chat_section(sec),
    "blog": lambda sec, nmap: render_take_log(sec),
    "docs": lambda sec, nmap: render_take_log(sec),
    "opensource": lambda sec, nmap: render_opensource_section(sec),
}


# ---------------- 页面 ----------------
def build_home(cfg, sections, all_posts):
    content = home_page.build(cfg, sections, all_posts, load_template("home.tpl"), take_no)
    return render_layout(cfg, cfg["site"]["title"], cfg["site"].get("description", ""),
                         content, active="home")


def build_section(cfg, sections, sd):
    sec = sections[sd["slug"]]
    nmap = name_map(sections)
    renderer = SECTION_RENDERERS.get(sd["slug"])
    body = renderer(sec, nmap) if renderer else "\n".join(post_item_html(p, nmap) for p in sec.posts)
    index = [s["slug"] for s in cfg["sections"]].index(sd["slug"]) + 1
    last = f"{sec.posts[0].date.astimezone(util.BJ):%Y-%m-%d}" if sec.posts else "—"
    t = load_template("section.tpl")
    content = t.substitute(
        cam=f"CAM_{index:02d}", slug_upper=util.html_escape(sec.slug.upper()),
        name=util.html_escape(sec.name),
        description=util.html_escape(sec.description),
        count=sec.count, last=last,
        posts=body)
    return render_layout(cfg, f"{sec.name} · {cfg['site']['title']}",
                         sec.description, content, active=sd["slug"])


def build_post(cfg, sections, post):
    if is_stage(post.meta):
        return stage_page.build_stage_post(cfg, sections, post,
                                           os.path.join(TEMPLATES, "post-stage.tpl"), STATIC)
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
    # 开源雷达是宽版多栏排版，不加目录；其余文章从 h2/h3 自动生成目录（少于 2 个标题时不显示）
    wide = post.section == "opensource"
    levels = (2,) if post.section == "aihot" else (2, 3)     # 日报的 h3 是新闻卡片标题
    body, heads = (post.body_html, []) if wide else toc.add_heading_ids(post.body_html, levels)
    rail = toc.rail_html(heads)
    rail_html = (f'<aside class="rail" aria-label="目录"><p>// 目录</p><ol>{rail}</ol></aside>' if rail else "")
    meta_extra = f"<span>{len(heads)} 个小节</span>" if rail else ""
    content = t.substitute(
        section_url=f"/{post.section}/",
        layout_class=" is-wide" if wide else ("" if rail else " no-rail"),
        section_name=util.html_escape(sections[post.section].name),
        date=f"{post.date.astimezone(util.BJ):%Y-%m-%d}", title=util.html_escape(post.title),
        reading_time=post.reading_time, meta_extra=meta_extra, model_html=model_html,
        tags_html=tags_html(post), source_html=source_html, rail_html=rail_html, body=body)
    return render_layout(cfg, f"{post.title} · {cfg['site']['title']}",
                         post.summary, content, active=post.section)


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
    return render_layout(cfg, f"归档 · {cfg['site']['title']}", "全部文章归档",
                         content, active="archive")


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
        # 下限 65%：更低的透明度在白卡片上对比度不足 4.5:1
        opacity = round(65 + 35 * ratio)
        return (f'font-size:{size:.1f}px;font-weight:{weight};'
                f'color:color-mix(in srgb, var(--ink) {opacity}%, transparent)')

    idx_t = load_template("tag_index.tpl")
    tags_html_str = "\n".join(
        f'<a class="tag-prop" style="{tag_style(len(ps))}" href="/tags/{util.slugify(t)}.html">'
        f'{util.html_escape(t)} <span class="c">({len(ps)})</span></a>'
        for t, ps in sorted(tag_map.items(), key=lambda kv: -len(kv[1])))
    idx = idx_t.substitute(total=len(tag_map), tags=tags_html_str)
    idx_page = render_layout(cfg, f"标签 · {cfg['site']['title']}", "按标签浏览",
                             idx, active="archive")
    pages = {}
    tt = load_template("tags.tpl")
    for t, ps in tag_map.items():
        c = tt.substitute(
            tag=util.html_escape(t), count=len(ps),
            posts="\n".join(post_item_html(p, nmap) for p in ps))
        pages[util.slugify(t)] = render_layout(
            cfg, f"{t} · {cfg['site']['title']}", f"标签 {t}", c, active="archive")
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
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def copy_static(src=None, dest=None):
    """整目录拷贝 static/ 到 public/，含 images/<文章 slug>/ 这类子目录。
    默认值在调用时取模块变量，测试 patch PUBLIC 后才能生效。"""
    src, dest = src or STATIC, dest or PUBLIC
    for name in os.listdir(src):
        source, target = os.path.join(src, name), os.path.join(dest, name)
        if os.path.isdir(source):
            shutil.copytree(source, target, dirs_exist_ok=True)
        elif os.path.isfile(source):
            shutil.copyfile(source, target)


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
            stage_page.copy_bundle_assets(p, PUBLIC)
    write_file(os.path.join(PUBLIC, "archive", "index.html"),
               build_archive(cfg, sections, all_posts))
    idx_page, tag_pages = build_tags(cfg, sections, all_posts)
    write_file(os.path.join(PUBLIC, "tags", "index.html"), idx_page)
    for slug, page in tag_pages.items():
        write_file(os.path.join(PUBLIC, "tags", slug + ".html"), page)
    write_file(os.path.join(PUBLIC, "feed.xml"), build_feed(cfg, all_posts))
    copy_static()
    print(f"OK: {len(all_posts)} posts, {len(cfg['sections'])} sections -> {PUBLIC}")


if __name__ == "__main__":
    main()


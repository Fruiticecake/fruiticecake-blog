#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""博客静态生成器（零依赖，仅用标准库 json + string.Template）。

运行：python3 src/generator.py
从 content/<板块>/*.md 读取文章，按 config.json 渲染到 public/。
新增板块：建 content/<slug>/ 目录 + 在 config.json 的 sections 加一条即可，无需改代码。
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
            text = open(path, encoding="utf-8").read()
            meta, body = util.parse_frontmatter(text)
            raw_html = str(meta.get("html", "")).lower() in ("true", "1", "yes")
            body_html = body if raw_html else markdown.render(body)
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
                source=str(meta.get("source") or ""))
            sections[sd["slug"]].posts.append(post)
            all_posts.append(post)
    for sec in sections.values():
        sec.posts.sort(key=lambda p: p.date, reverse=True)
    all_posts.sort(key=lambda p: p.date, reverse=True)
    return sections, all_posts


# ---------------- 渲染片段 ----------------
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
        cards.append(
            f'<a class="sec-card sec-{sec.slug}" href="/{sec.slug}/">\n'
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


# ---------------- 页面 ----------------
def build_home(cfg, sections, all_posts):
    t = load_template("home.tpl")
    nmap = name_map(sections)
    recent = all_posts[:cfg["site"].get("posts_per_home", 8)]
    content = t.substitute(
        site_title=util.html_escape(cfg["site"]["title"]),
        site_subtitle=util.html_escape(cfg["site"].get("subtitle", "")),
        recent="\n".join(post_item_html(p, nmap) for p in recent),
        section_cards=section_cards_html(sections, cfg))
    return render_layout(cfg, cfg["site"]["title"], cfg["site"].get("description", ""), content)


def build_section(cfg, sections, sd):
    sec = sections[sd["slug"]]
    t = load_template("section.tpl")
    nmap = name_map(sections)
    content = t.substitute(
        name=util.html_escape(sec.name),
        description=util.html_escape(sec.description),
        posts="\n".join(post_item_html(p, nmap) for p in sec.posts))
    return render_layout(cfg, f"{sec.name} · {cfg['site']['title']}",
                         sec.description, content)


def build_post(cfg, sections, post):
    t = load_template("post.tpl")
    if post.source:
        source_html = (
            f'<p class="source-note">???'
            f'<a href="{util.html_escape(post.source)}" target="_blank" '
            f'rel="noopener noreferrer">{util.html_escape(post.source)}</a></p>'
        )
    else:
        source_html = ""
    content = t.substitute(
        slug=post.section, section_url=f"/{post.section}/",
        section_name=util.html_escape(sections[post.section].name),
        date=post.date_human, title=util.html_escape(post.title),
        tags_html=tags_html(post), source_html=source_html, body=post.body_html)
    return render_layout(cfg, f"{post.title} · {cfg['site']['title']}",
                         post.summary, content)


def build_archive(cfg, sections, all_posts):
    t = load_template("archive.tpl")
    nmap = name_map(sections)
    content = t.substitute(
        total=len(all_posts),
        posts="\n".join(post_item_html(p, nmap) for p in all_posts))
    return render_layout(cfg, f"归档 · {cfg['site']['title']}", "全部文章归档", content)


def build_tags(cfg, sections, all_posts):
    tag_map = {}
    for p in all_posts:
        for tg in p.tags:
            tag_map.setdefault(tg, []).append(p)
    nmap = name_map(sections)
    idx_t = load_template("tag_index.tpl")
    tags_html_str = "\n".join(
        f'<a class="tag" href="/tags/{util.slugify(t)}.html">'
        f'{util.html_escape(t)} <span class="c">({len(ps)})</span></a>'
        for t, ps in sorted(tag_map.items()))
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


def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(content)


def main():
    cfg = load_config()
    sections, all_posts = load_posts(cfg)
    write_file(os.path.join(PUBLIC, "index.html"), build_home(cfg, sections, all_posts))
    for sd in cfg["sections"]:
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
    shutil.copyfile(os.path.join(STATIC, "style.css"),
                    os.path.join(PUBLIC, "style.css"))
    print(f"OK: {len(all_posts)} posts, {len(cfg['sections'])} sections -> {PUBLIC}")


if __name__ == "__main__":
    main()

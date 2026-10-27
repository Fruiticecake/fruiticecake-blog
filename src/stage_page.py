#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 design: stage 的文章拼成完整页面（独立外壳，不套 layout.tpl），并复制文件夹文章的资源。"""
import datetime
import hashlib
import os
import re
import shutil
from string import Template

import stage
import ui
import util

STAGE_ASSETS = "stage"            # static/stage → public/stage
CHARS_PER_MINUTE = 400
# 文件夹文章只发布这些类型的资源；草稿 .md、脚本、点文件等不会进公开站点
BUNDLE_EXTENSIONS = frozenset({
    ".js", ".mjs", ".css", ".json", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg",
    ".mp4", ".webm", ".mp3", ".woff2", ".pdf", ".glb", ".gltf",
})
URL_ATTR = re.compile(r'\b(src|href)="([^"]*)"')
ABSOLUTE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|/|#)", re.I)


def hash_tree(root):
    """目录下所有文件（相对路径 + 内容）的短哈希；目录不存在时返回空内容的哈希。"""
    digest = hashlib.sha256()
    if root and os.path.isdir(root):
        for base, dirs, files in os.walk(root):
            dirs.sort()
            for fn in sorted(files):
                path = os.path.join(base, fn)
                with open(path, "rb") as f:
                    digest.update(os.path.relpath(path, root).encode() + b"|" + f.read())
    return digest.hexdigest()[:10]


def asset_version(static_dir):
    """static/stage 的内容哈希：资源一变，页面引用的 ?v= 就变，避免浏览器用旧缓存。"""
    return hash_tree(os.path.join(static_dir, STAGE_ASSETS))


def reading_minutes(body_html):
    text = re.sub(r"<[^>]+>", "", body_html or "")
    return max(1, round(len(re.sub(r"\s+", "", text)) / CHARS_PER_MINUTE))


def bundle_url(post, filename):
    """文件夹文章里存在该文件时返回它的站内地址，否则返回空串。"""
    if post.bundle_dir and os.path.isfile(os.path.join(post.bundle_dir, filename)):
        return f"/{post.section}/{post.slug}/{filename}"
    return ""


def rewrite_relative_urls(body_html, base):
    """文件夹文章的页面在 /<板块>/<slug>.html、资源在 /<板块>/<slug>/：把相对 src/href 补成资源目录下的地址。"""
    def repl(m):
        url = m.group(2)
        if not url or ABSOLUTE.match(url):
            return m.group(0)
        return f'{m.group(1)}="{base}{url[2:] if url.startswith("./") else url}"'
    return URL_ATTR.sub(repl, body_html)


def kicker(post, section_name):
    if post.meta.get("kicker"):
        return util.html_escape(post.meta["kicker"])
    tags = " · ".join(util.html_escape(t) for t in post.tags[:2])
    return util.html_escape(section_name) + (f" / {tags}" if tags else "")


def meta_chips(post):
    date = post.date if post.date.tzinfo else post.date.replace(tzinfo=datetime.timezone.utc)
    chips = [date.astimezone(util.BJ).strftime("%Y-%m-%d"), f"{reading_minutes(post.body_html)} MIN READ"]
    label = stage.source_label(post.meta)
    if label:
        chips.append(f"SRC · {label}")
    return "".join(f"<span>{util.html_escape(c)}</span>" for c in chips)


def rail_html(chapters):
    return "".join(
        f'<li><a href="#{c.id}"><span>{util.html_escape(c.rail_label)}</span>{c.rail_text}</a></li>'
        for c in chapters)


def nav_html(cfg, active=""):
    """首页 + 各板块 + 归档，与全站导航同序；文章所在板块高亮，首页链接在手机上也保留。"""
    links = []
    for slug, url, name, _short in ui._destinations(cfg):
        attrs = ' class="nav-home"' if slug == "home" else ""
        attrs += f' href="{url}"' + (' aria-current="true"' if slug == active else "")
        links.append(f"<a{attrs}>{util.html_escape(name)}</a>")
    return "".join(links)


def build_stage_post(cfg, sections, post, template_path, static_dir):
    with open(template_path, encoding="utf-8") as f:
        tpl = Template(f.read())
    section_name = sections[post.section].name
    title = post.meta.get("display_title") or post.title
    version = asset_version(static_dir)
    local_v = hash_tree(post.bundle_dir)
    local_js, local_css = bundle_url(post, "widgets.js"), bundle_url(post, "style.css")
    body = post.body_html
    if post.bundle_dir:
        body = rewrite_relative_urls(body, f"/{post.section}/{post.slug}/")
    return tpl.substitute(
        title=util.html_escape(f"{post.title} · {cfg['site']['title']}"),
        description=util.html_escape(post.summary),
        brand=util.html_escape(cfg["site"]["title"].upper()),
        nav_links=nav_html(cfg, post.section),
        analytics_html=ui.analytics_html(cfg),
        head_boot=ui.head_boot_script(boot=True),
        theme_button=ui.THEME_BUTTON,
        version=version,
        hero=stage.hero_name(post.meta),
        local_widgets_attr=f' data-local-widgets="{util.html_escape(local_js)}?v={local_v}"' if local_js else "",
        local_style=f'<link rel="stylesheet" href="{util.html_escape(local_css)}?v={local_v}">' if local_css else "",
        kicker=kicker(post, section_name),
        display_title=stage.display_title(title),
        dek=util.html_escape(post.summary),
        meta_chips=meta_chips(post),
        rail=rail_html(post.stage.chapters if post.stage else []),
        body=body,
        section_name=util.html_escape(section_name),
        section_url=f"/{post.section}/",
    )


def copy_bundle_assets(post, public_dir):
    """文件夹文章：把白名单类型的资源复制到 public/<板块>/<slug>/。
    跳过 index.md、点文件 / 点目录、不在白名单里的类型，以及真实路径越出文件夹的符号链接。"""
    if not post.bundle_dir:
        return
    root = os.path.realpath(post.bundle_dir)
    dest = os.path.join(public_dir, post.section, post.slug)
    for base, dirs, files in os.walk(post.bundle_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in files:
            src = os.path.join(base, fn)
            rel = os.path.relpath(src, post.bundle_dir)
            if fn.startswith(".") or rel == "index.md" or os.path.splitext(fn)[1].lower() not in BUNDLE_EXTENSIONS:
                continue
            if os.path.commonpath([root, os.path.realpath(src)]) != root:
                continue
            target = os.path.join(dest, rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(src, target)

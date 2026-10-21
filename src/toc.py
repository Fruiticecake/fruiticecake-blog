#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""普通文章的自动目录：给正文 h2/h3 加 id，生成左侧目录。

- 已有 id 的标题保留原 id（CSDN 导入的旧文里可能有锚点被外部链接引用）；
- h2 额外带 data-tc="§NN"，由样式显示成章节编号；
- 标题少于 2 个时不生成目录（短文不需要）。
"""
import html
import re
from dataclasses import dataclass

HEADING = re.compile(r"<h([23])((?:\s[^>]*)?)>(.*?)</h\1>", re.S)
ID_ATTR = re.compile(r'\sid="([^"]+)"')
TAG = re.compile(r"<[^>]+>")
MIN_HEADINGS = 2


@dataclass(frozen=True)
class Heading:
    level: int
    id: str
    text: str        # 纯文本（已反转义），输出时再转义


def add_heading_ids(body_html, levels=(2, 3)):
    """levels 限定收录的标题级别：例如日报正文的 h3 是卡片标题，只收 h2。"""
    heads, h2_count = [], 0

    def repl(m):
        nonlocal h2_count
        level, attrs, inner = int(m.group(1)), m.group(2) or "", m.group(3)
        text = html.unescape(TAG.sub("", inner)).strip()
        if not text or level not in levels:
            return m.group(0)
        existing = ID_ATTR.search(attrs)
        hid = existing.group(1) if existing else f"sec-{len(heads) + 1}"
        heads.append(Heading(level, hid, re.sub(r"\s+", " ", text)))
        new_attrs = attrs if existing else f' id="{hid}"{attrs}'
        if level == 2:
            h2_count += 1
            new_attrs += f' data-tc="§{h2_count:02d}"'
        return f"<h{level}{new_attrs}>{inner}</h{level}>"

    return HEADING.sub(repl, body_html), heads


def rail_html(heads):
    if len(heads) < MIN_HEADINGS:
        return ""
    return "".join(
        f'<li><a class="lv{h.level}" href="#{html.escape(h.id, quote=True)}">{html.escape(h.text)}</a></li>'
        for h in heads)

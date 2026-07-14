#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""零依赖 Markdown -> HTML 渲染器（覆盖博客/文档常用子集）。

支持：标题、代码块、行内代码、有序/无序列表、引用、分隔线、
粗体/斜体、链接（新窗口）、图片。不支持：表格、嵌套列表、脚注。
如需更完整 Markdown，可在 GitHub Action 中 pip install markdown 后替换本模块。
"""
import re
import html

BLOCK_CODE = re.compile(r"^```(\w*)\s*$")
UL_ITEM = re.compile(r"^\s*[-*+]\s+(.*)$")
OL_ITEM = re.compile(r"^\s*\d+\.\s+(.*)$")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
HR = re.compile(r"^(\s*[-*_]\s*){3,}$")


def render(md):
    lines = md.replace("\r\n", "\n").split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.strip() == "":
            i += 1
            continue
        # 代码块
        m = BLOCK_CODE.match(line)
        if m:
            lang = m.group(1)
            buf = []
            i += 1
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # 跳过结束 ```
            cls = f' class="language-{lang}"' if lang else ""
            out.append(f"<pre><code{cls}>{html.escape(chr(10).join(buf))}</code></pre>")
            continue
        # 分隔线
        if HR.match(line):
            out.append("<hr>")
            i += 1
            continue
        # 标题
        h = HEADING.match(line)
        if h:
            level = len(h.group(1))
            out.append(f"<h{level}>{_inline(h.group(2).strip())}</h{level}>")
            i += 1
            continue
        # 引用
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append(f"<blockquote>{_inline(' '.join(buf))}</blockquote>")
            continue
        # 列表（有序/无序）
        if UL_ITEM.match(line) or OL_ITEM.match(line):
            ordered = OL_ITEM.match(line) is not None
            items = []
            while i < n:
                um = UL_ITEM.match(lines[i])
                om = OL_ITEM.match(lines[i])
                if (ordered and om) or (not ordered and um):
                    item = (om.group(1) if om else um.group(1)) if (om or um) else None
                    if item is None:
                        break
                    items.append(_inline(item.strip()))
                    i += 1
                else:
                    break
            tag = "ol" if ordered else "ul"
            li = "".join(f"<li>{it}</li>" for it in items)
            out.append(f"<{tag}>{li}</{tag}>")
            continue
        # 段落
        buf = []
        while i < n and lines[i].strip() != "" \
                and not BLOCK_CODE.match(lines[i]) \
                and not HEADING.match(lines[i]) \
                and not HR.match(lines[i]) \
                and not lines[i].lstrip().startswith(">") \
                and not UL_ITEM.match(lines[i]) \
                and not OL_ITEM.match(lines[i]):
            buf.append(lines[i])
            i += 1
        out.append(f"<p>{_inline(' '.join(buf))}</p>")
    return "\n".join(out)


def _inline(text):
    text = html.escape(text)
    # ???????????? * _ ????
    codes = []

    def stash_code(m):
        codes.append(m.group(1))
        return f"\x00C{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash_code, text)

    # ?????????? URL ?? _ ????
    media = []

    def stash_img(m):
        media.append(("img", m.group(1), m.group(2)))
        return f"\x00M{len(media) - 1}\x00"

    def stash_link(m):
        media.append(("a", m.group(1), m.group(2)))
        return f"\x00M{len(media) - 1}\x00"

    text = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", stash_img, text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", stash_link, text)

    # ?? / ??
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"<em>\1</em>", text)

    def restore_media(m):
        kind, alt, url = media[int(m.group(1))]
        if kind == "img":
            return f'<img src="{url}" alt="{alt}">'
        return f'<a href="{url}" target="_blank" rel="noopener noreferrer">{alt}</a>'

    text = re.sub(r"\x00M(\d+)\x00", restore_media, text)

    def restore_code(m):
        return f"<code>{codes[int(m.group(1))]}</code>"

    text = re.sub(r"\x00C(\d+)\x00", restore_code, text)
    return text

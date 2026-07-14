#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lightweight Markdown -> HTML renderer for blog posts and docs.

Supports headings, fenced code, block/ordered lists, blockquotes, horizontal rules,
bold/italic, links (new tab), images, raw HTML blocks, GFM pipe tables, and Mermaid fences.
Can be replaced with pip install markdown in CI if needed.
"""
import re
import html

BLOCK_CODE = re.compile(r"^```(\w*)\s*$")
UL_ITEM = re.compile(r"^\s*[-*+]\s+(.*)$")
OL_ITEM = re.compile(r"^\s*\d+\.\s+(.*)$")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
HR = re.compile(r"^(\s*[-*_]\s*){3,}$")
TABLE_SEP = re.compile(r"^\s*\|(?:\s*:?-+:?\s*\|)+\s*$")
BLOCK_HTML_START = re.compile(r"^\s*(<\w|</\w)")
VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
})


def _is_block_html_line(line):
    return bool(BLOCK_HTML_START.match(line))


def _collect_html_block(lines, i, n):
    """Collect a raw HTML block starting at line i; return (html, next_index)."""
    buf = []
    stack = []
    j = i
    while j < n:
        line = lines[j]
        buf.append(line)
        for m in re.finditer(r"<\s*(/?)\s*(\w+)([^>]*?)(\/?)\s*>", line):
            is_close = bool(m.group(1))
            tag = m.group(2).lower()
            attrs = m.group(3) or ""
            explicit_void = bool(m.group(4))
            self_closing = explicit_void or tag in VOID_TAGS or attrs.rstrip().endswith("/")
            if is_close:
                if stack and stack[-1] == tag:
                    stack.pop()
            elif not self_closing:
                stack.append(tag)
        j += 1
        if j > i and not stack:
            break
    if j == i + 1:
        return buf[0], i + 1
    return "\n".join(buf), j


def _split_table_cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def _parse_table(lines, i, n):
    if i + 1 >= n or not TABLE_SEP.match(lines[i + 1]):
        return None
    header = _split_table_cells(lines[i])
    j = i + 2
    rows = []
    while j < n and lines[j].strip().startswith("|") and not TABLE_SEP.match(lines[j]):
        rows.append(_split_table_cells(lines[j]))
        j += 1
    thead = "<thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in header) + "</tr></thead>"
    tbody_rows = []
    for row in rows:
        tbody_rows.append(
            "<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in row) + "</tr>"
        )
    tbody = "<tbody>" + "".join(tbody_rows) + "</tbody>"
    return f"<table>{thead}{tbody}</table>", j


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
        m = BLOCK_CODE.match(line)
        if m:
            lang = (m.group(1) or "").lower()
            buf = []
            i += 1
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            body = html.escape("\n".join(buf))
            if lang == "mermaid":
                out.append(f'<pre class="mermaid">{body}</pre>')
            else:
                cls = f' class="language-{lang}"' if lang else ""
                out.append(f"<pre><code{cls}>{body}</code></pre>")
            continue
        if HR.match(line):
            out.append("<hr>")
            i += 1
            continue
        h = HEADING.match(line)
        if h:
            level = len(h.group(1))
            out.append(f"<h{level}>{_inline(h.group(2).strip())}</h{level}>")
            i += 1
            continue
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append(f"<blockquote>{_inline(' '.join(buf))}</blockquote>")
            continue
        if line.strip().startswith("|"):
            table = _parse_table(lines, i, n)
            if table:
                out.append(table[0])
                i = table[1]
                continue
        if _is_block_html_line(line):
            block, i = _collect_html_block(lines, i, n)
            out.append(block)
            continue
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
        buf = []
        while i < n and lines[i].strip() != "" \
                and not BLOCK_CODE.match(lines[i]) \
                and not HEADING.match(lines[i]) \
                and not HR.match(lines[i]) \
                and not lines[i].lstrip().startswith(">") \
                and not UL_ITEM.match(lines[i]) \
                and not OL_ITEM.match(lines[i]) \
                and not _is_block_html_line(lines[i]) \
                and not (lines[i].strip().startswith("|") and i + 1 < n and TABLE_SEP.match(lines[i + 1])):
            buf.append(lines[i])
            i += 1
        out.append(f"<p>{_inline(' '.join(buf))}</p>")
    return "\n".join(out)


def _inline(text):
    text = html.escape(text)
    # Stash inline code so * / _ in code are not styled
    codes = []

    def stash_code(m):
        codes.append(m.group(1))
        return f"\x00C{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash_code, text)

    # Stash images and links so URL/alt parsing is not broken by emphasis
    media = []

    def stash_img(m):
        media.append(("img", m.group(1), m.group(2)))
        return f"\x00M{len(media) - 1}\x00"

    def stash_link(m):
        media.append(("a", m.group(1), m.group(2)))
        return f"\x00M{len(media) - 1}\x00"

    text = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", stash_img, text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", stash_link, text)

    # Bold / italic
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"(?<!_)_([^_]+)_(?!_)", r"<em>\1</em>", text)

    def restore_media(m):
        kind, alt, url = media[int(m.group(1))]
        alt_esc = html.escape(html.unescape(alt))
        url_esc = html.escape(html.unescape(url))
        if kind == "img":
            return (
                f'<img src="{url_esc}" alt="{alt_esc}" '
                f'referrerpolicy="no-referrer" loading="lazy">'
            )
        return f'<a href="{url_esc}" target="_blank" rel="noopener noreferrer">{alt_esc}</a>'

    text = re.sub(r"\x00M(\d+)\x00", restore_media, text)

    def restore_code(m):
        return f"<code>{codes[int(m.group(1))]}</code>"

    text = re.sub(r"\x00C(\d+)\x00", restore_code, text)
    return text

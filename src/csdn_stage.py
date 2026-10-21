#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 design: stage 原稿里的版式写法展开成普通 Markdown，供 CSDN 等不支持交互的平台使用。

- ::: interactive → 降级内容 + 一行「交互演示见原文」，链接到所在章节的锚点 #cN
- ::: tldr / quote / ledger / lessons / stats → 引用、加粗引用、✔✘ 列表、编号列表、表格
- ## [01:20] 标题 → ## 标题 · 01:20；## [NOTE] 标题 → ## 标题

章节编号必须和 stage.render_body 生成的 id 一致，所以切分与代码块识别都复用 stage 模块。
"""
import re

import stage

H2_LINE = re.compile(r"^##\s+(.+?)\s*$")


def _heading(raw):
    m = stage.CHAPTER_TAG.match(raw)
    if not m:
        return f"## {raw}"
    tag, title = m.group(1).strip(), m.group(2).strip()
    return f"## {title} · {tag}" if stage.TIMECODE.match(tag) else f"## {title}"


def _md_chunk(text, chapter):
    """改写章节标题并统计章节数；代码块里的内容原样保留。"""
    out, fence = [], None
    for line in text.split("\n"):
        was_open = fence is not None
        fence = stage.fence_after(line, fence)
        m = None if (was_open or fence is not None) else H2_LINE.match(line)
        if m:
            chapter += 1
            line = _heading(m.group(1))
        out.append(line)
    return "\n".join(out), chapter


def _lines(body):
    return [ln.strip() for ln in body.split("\n") if ln.strip()]


def _interactive(block, anchor_url):
    pos, attrs = stage.parse_args(block.args, block.line)
    title = attrs.get("title") or (pos[0] if pos else "交互演示")
    return f"{block.body.strip()}\n\n> ▶ 本节有交互演示「{title}」，可在原文中动手操作：[打开交互版]({anchor_url})"


def _ledger(block):
    marks = {"[+]": "✔", "[-]": "✘"}
    out = []
    for ln in _lines(block.body):
        item = re.sub(r"^[-*+]\s+", "", ln)
        for raw, mark in marks.items():
            if item.startswith(raw):
                item = f"{mark} {item[len(raw):].strip()}"
        out.append(f"- {item}")
    return "\n".join(out)


def _stats(block):
    rows = ["| 指标 | 数值 | 说明 |", "|---|---|---|"]
    for ln in _lines(block.body):
        cells = [c.strip() for c in re.sub(r"^[-*+]\s+", "", ln).split("|")]
        rows.append("| " + " | ".join(cells) + " |")
    return "\n".join(rows)


def _directive(block, anchor_url):
    if block.name == "interactive":
        return _interactive(block, anchor_url)
    if block.name == "tldr":
        return "> **一句话结论**：" + " ".join(_lines(block.body))
    if block.name == "quote":
        return "> **" + " ".join(_lines(block.body)) + "**"
    if block.name == "ledger":
        return _ledger(block)
    if block.name == "lessons":
        return block.body.strip()
    if block.name == "stats":
        return _stats(block)
    raise stage.StageError(f"第 {block.line} 行：未知指令 ::: {block.name}")


def expand(body, post_url):
    """stage 原稿正文 → 普通 Markdown。"""
    parts, chapter = [], 0
    for block in stage.split_blocks(body):
        if block.kind == "md":
            text, chapter = _md_chunk(block.body, chapter)
            parts.append(text)
        else:
            anchor = f"{post_url}#c{chapter}" if chapter else post_url
            parts.append("\n" + _directive(block, anchor) + "\n")
    return "\n".join(parts)

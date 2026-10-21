#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「动捕棚」（design: stage）文章的正文渲染。

在普通 Markdown 之上增加两样东西：
1. 指令块 ::: name 参数 … :::
   - interactive <组件名> title="" hint="" note="" 其余属性 → 交互模块；块内 Markdown 是降级内容
     （没有 JS、CSDN 导出、搜索引擎都读它；通用组件也从它读取数据）
   - tldr / quote / ledger / lessons / stats → 版式语义块
2. 章节标题 ## [01:20] 标题 → 时间码章节头，并收集为左侧目录

指令不允许嵌套；代码块里的 ::: 不当作指令。所有用户文本都经过转义。
"""
import html
import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

import markdown

DIRECTIVE_OPEN = re.compile(r"^:::\s*([A-Za-z][\w-]*)\s*(.*?)\s*$")
DIRECTIVE_CLOSE = re.compile(r"^:::\s*$")
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
ARG = re.compile(r'([A-Za-z][\w-]*)="([^"]*)"|(\S+)')
NAME = re.compile(r"^[a-z][a-z0-9-]*$")
H2 = re.compile(r"<h2>(.*?)</h2>", re.S)
CHAPTER_TAG = re.compile(r"^\[([^\]]+)\]\s*(.+)$", re.S)
TIMECODE = re.compile(r"^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$")
MARKED_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(?:\[([+-])\]\s*)?\*\*(.+?)\*\*\s*(.*)$")
LIST_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$")
STRIKE = re.compile(r"~~(.+?)~~")
INTERACTIVE_RESERVED = ("title", "hint", "note")
DEFAULT_HERO = "mocap-gait"
TLDR_LABEL = "<small>// TL;DR</small>"
TAG = re.compile(r"<[^>]+>")


class StageError(ValueError):
    """原稿写法有误；消息直接给写作者（人或 AI）看，尽量指出位置。"""


@dataclass(frozen=True)
class Block:
    kind: str                 # "md" | "directive"
    body: str
    name: str = ""
    args: str = ""
    line: int = 0


@dataclass(frozen=True)
class Chapter:
    id: str
    rail_label: str
    title_html: str

    @property
    def rail_text(self):
        """目录里用的标题：去掉链接等行内标签（避免 <a> 嵌套），实体保持转义。"""
        return TAG.sub("", self.title_html).strip()


@dataclass
class Rendered:
    body_html: str
    chapters: list = field(default_factory=list)
    widgets: list = field(default_factory=list)


# ---------------- 切分 ----------------
def fence_after(line, fence):
    """更新代码块状态。fence 为 None 或 (字符, 长度)；闭合需同一字符、长度不少于开头、其后无内容。"""
    m = FENCE.match(line)
    if not m:
        return fence
    mark = m.group(1)
    if fence is None:
        return (mark[0], len(mark))
    if mark[0] == fence[0] and len(mark) >= fence[1] and not line.strip()[len(mark):].strip():
        return None
    return fence


def split_blocks(md):
    lines = md.replace("\r\n", "\n").split("\n")
    blocks, buf = [], []
    fence, fence_line = None, 0
    current = None            # (name, args, start_line, body_lines)
    for no, line in enumerate(lines, 1):
        was_open = fence is not None
        fence = fence_after(line, fence)
        if fence is not None and not was_open:
            fence_line = no
        in_fence = was_open or fence is not None
        if not in_fence and current is None and DIRECTIVE_OPEN.match(line):
            if buf:
                blocks.append(Block("md", "\n".join(buf)))
                buf = []
            m = DIRECTIVE_OPEN.match(line)
            current = (m.group(1), m.group(2), no, [])
            continue
        if not in_fence and current is None and DIRECTIVE_CLOSE.match(line):
            raise StageError(f"第 {no} 行：多余的 :::（前面没有对应的开头指令）")
        if not in_fence and current is not None:
            if DIRECTIVE_CLOSE.match(line):
                name, args, start, body = current
                blocks.append(Block("directive", "\n".join(body), name, args, start))
                current = None
                continue
            if DIRECTIVE_OPEN.match(line):
                raise StageError(f"第 {no} 行：指令不能嵌套（第 {current[2]} 行的 ::: {current[0]} 还没有结束）")
        (current[3] if current is not None else buf).append(line)
    if fence is not None:
        raise StageError(f"第 {fence_line} 行：代码块没有结束（缺少闭合的 {fence[0] * fence[1]}）")
    if current is not None:
        raise StageError(f"第 {current[2]} 行：::: {current[0]} 没有用单独一行 ::: 结束")
    if buf:
        blocks.append(Block("md", "\n".join(buf)))
    return blocks


def parse_args(text, line=0):
    """解析「组件名 key="value" ...」。格式不对直接报错，不静默丢弃。"""
    where = f"第 {line} 行：" if line else ""
    positional, attrs = [], {}
    for m in ARG.finditer(text or ""):
        if m.group(1):
            attrs[m.group(1)] = m.group(2)
            continue
        token = m.group(3)
        if "=" in token or '"' in token:
            raise StageError(f'{where}参数 {token!r} 格式不对，应写成 key="value"（值必须加双引号）')
        positional.append(token)
    if len(positional) > 1:
        raise StageError(f'{where}多余的参数 {positional[1:]}：只能有一个组件名，其余写成 key="value"')
    return positional, attrs


# ---------------- 行内小工具 ----------------
def _esc(text):
    return html.escape(str(text), quote=True)


def _unwrap_p(rendered):
    """单段落的渲染结果去掉外层 <p>，多段落保持原样。"""
    m = re.fullmatch(r"<p>(.*)</p>", rendered.strip(), re.S)
    return m.group(1) if m and "<p>" not in m.group(1) else rendered.strip()


def _items(body, where):
    """块内只允许列表项：出现续行、段落或空块都报错，避免内容被静默丢掉。"""
    lines = [ln for ln in body.split("\n") if ln.strip()]
    if not lines:
        raise StageError(f"{where}：块里没有任何列表项")
    for ln in lines:
        if not LIST_ITEM.match(ln):
            raise StageError(f"{where}：「{ln.strip()[:20]}」不是列表项（每一项必须写在一行里）")
    return lines


def _marked(line, where):
    m = MARKED_ITEM.match(line)
    if not m:
        raise StageError(f"{where}：每一项都要以 **标题** 开头，例如「- [+] **成本** 几分钟」")
    return m.group(1), markdown.render_inline(m.group(2)), markdown.render_inline(m.group(3).strip())


# ---------------- 指令 ----------------
class _Renderer:
    def __init__(self):
        self.modules = 0
        self.widgets = []

    def interactive(self, block):
        pos, attrs = parse_args(block.args, block.line)
        name = pos[0] if pos else ""
        if not NAME.match(name):
            raise StageError(f"第 {block.line} 行：组件名 {name!r} 不合法，只能用小写字母、数字和连字符")
        self.modules += 1
        self.widgets.append(name)
        props = {k: v for k, v in attrs.items() if k not in INTERACTIVE_RESERVED}
        title = attrs.get("title", name)
        hint = f'<span>{_esc(attrs["hint"])}</span>' if attrs.get("hint") else ""
        note = f'<p class="module-note">{markdown.render_inline(attrs["note"])}</p>' if attrs.get("note") else ""
        props_attr = f" data-props='{_esc(json.dumps(props, ensure_ascii=False))}'" if props else ""
        return (
            '<section class="module wide" data-reveal>'
            f'<div class="module-head"><span><b>MODULE_{self.modules:02d}</b> · {_esc(title)}</span>{hint}</div>'
            f'<div class="module-body"><div data-widget="{name}"{props_attr}></div>'
            f'<div class="ix-fallback">{markdown.render(block.body)}</div></div>'
            f"{note}</section>"
        )

    def tldr(self, block):
        return f'<div class="tldr" data-reveal>{TLDR_LABEL}{_unwrap_p(markdown.render(block.body))}</div>'

    def quote(self, block):
        text = " ".join(ln.strip() for ln in block.body.split("\n") if ln.strip())
        return f'<p class="quote">{markdown.render_inline(text)}</p>'

    def ledger(self, block):
        lis, where = [], f"第 {block.line} 行的 ::: ledger"
        for ln in _items(block.body, where):
            sign, label, rest = _marked(ln, where)
            cls = {"+": ' class="is-yes"', "-": ' class="is-no"'}.get(sign, "")
            lis.append(f"<li{cls}><b>{label}</b>{rest}</li>")
        return f'<ul class="ledger">{"".join(lis)}</ul>'

    def lessons(self, block):
        lis, where = [], f"第 {block.line} 行的 ::: lessons"
        for ln in _items(block.body, where):
            _, label, rest = _marked(ln, where)
            lis.append(f"<li><b>{label}</b><span>{rest}</span></li>")
        return f'<ol class="lessons" data-reveal>{"".join(lis)}</ol>'

    def stats(self, block):
        cells = []
        for ln in _items(block.body, f"第 {block.line} 行的 ::: stats"):
            parts = [p.strip() for p in LIST_ITEM.match(ln).group(1).split("|")]
            if len(parts) != 3:
                raise StageError(f"第 {block.line} 行的 ::: stats：每项写成「- 标签 | 数值 | 说明」")
            label, value, desc = parts
            value_html = STRIKE.sub(r"<s>\1</s>", _esc(value))
            cells.append(f"<div><small>{_esc(label)}</small><b>{value_html}</b><span>{markdown.render_inline(desc)}</span></div>")
        return f'<div class="telemetry" data-reveal>{"".join(cells)}</div>'

    def directive(self, block):
        handler = getattr(self, block.name.replace("-", "_"), None) if block.name in DIRECTIVES else None
        if handler is None:
            raise StageError(f"第 {block.line} 行：未知指令 ::: {block.name}，可用：{', '.join(DIRECTIVES)}")
        if block.name != "interactive" and block.args.strip():
            raise StageError(f"第 {block.line} 行：::: {block.name} 不接受参数（收到 {block.args.strip()!r}）")
        return handler(block)


DIRECTIVES = ("interactive", "tldr", "quote", "ledger", "lessons", "stats")


# ---------------- 章节 ----------------
def _chapter_label(tag):
    m = TIMECODE.match(tag.strip())
    if m:
        hh, mm, ss = int(m.group(1) or 0), int(m.group(2)), m.group(3)
        return f"[{hh:02d}:{mm:02d}:{ss}]", f"{mm:02d}:{ss}" if not hh else f"{hh:02d}:{mm:02d}:{ss}"
    tag = tag.strip().upper()
    return f"[{tag}]", tag


def _chapters_in(html_chunk, chapters):
    def repl(m):
        idx = len(chapters) + 1
        inner = m.group(1).strip()
        tagged = CHAPTER_TAG.match(inner)
        if tagged:
            tc, rail = _chapter_label(html.unescape(tagged.group(1)))
            title = tagged.group(2).strip()
        else:
            tc, rail, title = f"[§{idx:02d}]", f"§{idx:02d}", inner
        chapters.append(Chapter(f"c{idx}", rail, title))
        return f'<header class="chap" id="c{idx}"><p class="tc">{_esc(tc)}</p><h2>{title}</h2></header>'
    return H2.sub(repl, html_chunk)


def render_body(md):
    renderer, chapters, parts = _Renderer(), [], []
    for block in split_blocks(md):
        if block.kind == "directive":
            parts.append(renderer.directive(block))
        elif block.body.strip():
            chunk = markdown.render(block.body).replace("<h3>", '<h3 class="sub">')
            parts.append(_chapters_in(chunk, chapters))
    return Rendered("\n".join(parts), chapters, renderer.widgets)


# ---------------- 首屏 ----------------
def display_title(text):
    """「让 AI 给[任何怪物]做动画」→ 方括号里的词高亮；其余全部转义。"""
    return re.sub(r"\[([^\]]+)\]", r'<span class="hl">\1</span>', _esc(text))


def source_label(meta):
    if meta.get("source_label"):
        return str(meta["source_label"])
    host = urlparse(str(meta.get("source") or "")).netloc
    return host[4:] if host.startswith("www.") else host


def hero_name(meta):
    name = str(meta.get("hero") or DEFAULT_HERO)
    if not NAME.match(name):
        raise StageError(f"hero: {name!r} 不合法，只能用小写字母、数字和连字符")
    return name

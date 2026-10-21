#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一篇已发布的 Markdown 文章转换成可以直接粘贴到 CSDN 的版本。

用法：python3 src/export_csdn.py content/docs/2026-10-20-tls-handshake.md
      python3 src/export_csdn.py content/docs/<文件夹文章>        （文件夹文章，或其中的 index.md）

做四件事：去掉 frontmatter；design: stage 的文章先把 ::: 指令和时间码标题展开成普通
Markdown（见 csdn_stage.py）；把站内绝对路径（/images/...、/docs/...）和文件夹文章里的
相对路径补全为完整网址，CSDN 才能显示图片、点开链接；在文末追加“首发于个人博客”的原文链接。
结果写到 exports/csdn/<slug>.md（已 gitignore），标题/标签/摘要打印在终端，
方便填写 CSDN 发布表单。代码块和行内代码里的内容不会被改写。
"""
import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util  # noqa: E402
import stage  # noqa: E402
import csdn_stage  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = ROOT / "exports" / "csdn"
FENCE_RE = re.compile(r"^(```|~~~)")
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
# 只匹配单个 / 开头的站内路径，排除 //cdn 这种协议相对地址
SITE_LINK_RE = re.compile(r"(!?\[[^\]]*\]\()(/(?!/)[^)\s]*)\)")
ANY_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)\)")
LINK_PARTS_RE = re.compile(r"(!?\[[^\]]*\]\()([^)\s]+)\)")
RESOLVABLE_PREFIXES = ("http://", "https://", "/", "#", "mailto:")
SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)
BUNDLE_INDEX = "index.md"


class ExportError(Exception):
    """文章无法导出时抛出，消息直接展示给用户。"""


@dataclass(frozen=True)
class Located:
    section: str
    name: str          # 单文件为文件名，文件夹文章为文件夹名（与生成器默认 slug 规则一致）
    bundle: bool
    index: Path


@dataclass(frozen=True)
class CsdnExport:
    title: str
    tags: list
    summary: str
    post_url: str
    body: str


def _map_outside_inline_code(text, fn):
    codes = []

    def stash(m):
        codes.append(m.group(0))
        return f"\x00{len(codes) - 1}\x00"

    stashed = INLINE_CODE_RE.sub(stash, text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], fn(stashed))


def _map_prose(body, fn):
    """只对代码块、行内代码以外的文本应用 fn。"""
    out, prose, in_fence = [], [], False

    def flush():
        if prose:
            out.append(_map_outside_inline_code("".join(prose), fn))
            prose.clear()

    for line in body.splitlines(keepends=True):
        if FENCE_RE.match(line.lstrip()):
            if not in_fence:
                flush()
            in_fence = not in_fence
            out.append(line)
        elif in_fence:
            out.append(line)
        else:
            prose.append(line)
    flush()
    return "".join(out)


def absolutize_links(body, base_url):
    base = base_url.rstrip("/")
    return _map_prose(body, lambda text: SITE_LINK_RE.sub(lambda m: f"{m.group(1)}{base}{m.group(2)})", text))


def absolutize_relative(body, bundle_base):
    """文件夹文章：把 ](fig.png) 这类相对路径补成该文章资源目录下的完整网址。"""
    def fix(m):
        url = m.group(2)
        if url.startswith(RESOLVABLE_PREFIXES) or SCHEME_RE.match(url):
            return m.group(0)
        return f"{m.group(1)}{bundle_base}{url[2:] if url.startswith('./') else url})"
    return _map_prose(body, lambda text: LINK_PARTS_RE.sub(fix, text))


def find_relative_links(body):
    found = []

    def collect(text):
        found.extend(u for u in ANY_LINK_RE.findall(text) if not u.startswith(RESOLVABLE_PREFIXES))
        return text

    _map_prose(body, collect)
    return found


def locate(path, sections):
    """识别 content/<板块>/<文件>.md、content/<板块>/<文件夹>/ 或其中的 index.md。"""
    path = Path(path)
    if path.is_dir() or path.name == BUNDLE_INDEX or path.suffix.lower() != ".md":
        folder = path if path.name != BUNDLE_INDEX else path.parent
        located = Located(folder.parent.name, folder.name, True, folder / BUNDLE_INDEX)
    else:
        located = Located(path.parent.name, path.name, False, path)
    if located.section not in sections:
        raise ExportError(f"{path} 不在 content/<板块>/ 目录下（可用板块：{', '.join(sorted(sections))}）")
    return located


def build_export(text, base_url, section, filename, bundle=False):
    meta, body = util.parse_frontmatter(text)
    if str(meta.get("html", "")).lower() in ("true", "1", "yes"):
        raise ExportError("这是 html: true 的 HTML 正文（多为 CSDN 导入的旧文），无需再导出")
    title = str(meta.get("title") or Path(filename).stem)
    # 与 generator.load_posts 的 slug 规则保持一致，保证原文链接可以打开
    slug = str(meta.get("slug") or util.slugify(Path(filename).stem))
    post_url = f"{base_url.rstrip('/')}/{section}/{slug}.html"
    tags = meta.get("tags") or []
    footer = f"> 本文首发于我的个人博客：[{title}]({post_url})，欢迎访问阅读更多文章。"
    if str(meta.get("design", "")).lower() == "stage":
        try:
            body = csdn_stage.expand(body, post_url)
        except stage.StageError as e:
            raise ExportError(f"原稿写法有误：{e}") from e
    body = absolutize_links(body, base_url)
    if bundle:
        body = absolutize_relative(body, f"{base_url.rstrip('/')}/{section}/{slug}/")
    return CsdnExport(
        title=title,
        tags=[tags] if isinstance(tags, str) else list(tags),
        summary=str(meta.get("summary") or ""),
        post_url=post_url,
        body=body.strip() + "\n\n---\n\n" + footer + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description="导出 CSDN 版本的文章")
    parser.add_argument("post", help="content/<板块>/<文件>.md 或 content/<板块>/<文件夹>/")
    args = parser.parse_args(argv)

    with open(ROOT / "config.json", encoding="utf-8") as f:
        cfg = json.load(f)
    try:
        loc = locate(Path(args.post).resolve(), {s["slug"] for s in cfg["sections"]})
        if not loc.index.is_file():
            raise ExportError(f"找不到文章 {args.post}")
        text = loc.index.read_text(encoding="utf-8")
        export = build_export(text, cfg["site"]["base_url"], loc.section, loc.name, bundle=loc.bundle)
    except ExportError as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1

    out = EXPORT_DIR / f"{util.slugify(Path(export.post_url).stem)}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(export.body, encoding="utf-8")

    print(f"正文已写入：{out.relative_to(ROOT).as_posix()}（全选复制，粘贴到 CSDN 的 Markdown 编辑器）")
    print(f"标题：{export.title}")
    print(f"标签：{', '.join(export.tags) or '（无）'}")
    print(f"摘要：{export.summary or '（未填写）'}")
    print(f"原文：{export.post_url}")
    for url in ([] if loc.bundle else find_relative_links(util.parse_frontmatter(text)[1])):
        print(f"  提醒：相对路径 {url} 在 CSDN 上无法显示，请改成 /images/... 的站内绝对路径")
    print("  提醒：请先 git push 让个人站上线，否则 CSDN 里的图片会暂时加载失败")
    return 0


if __name__ == "__main__":
    sys.exit(main())

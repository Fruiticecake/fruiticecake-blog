#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""草稿流程：新建草稿、把写好的草稿发布到 content/<板块>/。

用法：
  python3 src/drafts.py new "标题" [--section docs] [--tags 网络,TLS] [--slug tls-handshake]
  python3 src/drafts.py new "标题" --stage --slug monster-rig      # 动捕棚版式的文件夹文章
  python3 src/drafts.py publish drafts/2026-10-20-tls-handshake.md
  python3 src/drafts.py publish drafts/monster-rig                # 发布整个文件夹

草稿放在 drafts/（已 gitignore：不参与构建，也不会推到公开仓库）。
模板是 scaffolds/post.md 与 scaffolds/stage-post.md，可直接改它们来调整默认结构。
design: stage 的草稿在发布前会先做一次渲染校验，写法有误时报出行号、不移动文件。
"""
import argparse
import datetime
import json
import os
import re
import shutil
import sys
from pathlib import Path
from string import Template

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util  # noqa: E402
import stage  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DRAFTS_DIR = ROOT / "drafts"
CONTENT_DIR = ROOT / "content"
SCAFFOLD = ROOT / "scaffolds" / "post.md"
STAGE_SCAFFOLD = ROOT / "scaffolds" / "stage-post.md"
BUNDLE_INDEX = "index.md"
DEFAULT_SECTION = "docs"
EXAMPLE_IMAGE_RE = re.compile(r"!\[图片说明\]\(/images/[^)]*/example\.png\)")
FRONTMATTER_RE = re.compile(r"\A---\s*\n.*?\n---\s*\n", re.S)
DATE_LINE_RE = re.compile(r"^date:.*$", re.M)


class DraftError(Exception):
    """草稿操作无法继续时抛出，消息直接展示给用户。"""


def today_bj():
    return datetime.datetime.now(util.BJ).strftime("%Y-%m-%d")


def load_sections():
    """返回 {板块 slug: 是否自动生成}，自动板块不接受手写草稿。"""
    with open(ROOT / "config.json", encoding="utf-8") as f:
        cfg = json.load(f)
    return {s["slug"]: bool(s.get("auto")) for s in cfg["sections"]}


def new_draft(title, section=DEFAULT_SECTION, tags=(), slug=None,
              drafts_dir=DRAFTS_DIR, scaffold=None, today=None, stage=False):
    """stage=True 时建文件夹草稿 drafts/<slug>/index.md（文件夹名就是将来的 URL）。"""
    title = title.strip()
    if not title:
        raise DraftError("标题不能为空")
    date = today or today_bj()
    slug = util.slugify(slug or title)
    scaffold = scaffold or (STAGE_SCAFFOLD if stage else SCAFFOLD)
    template = Template(Path(scaffold).read_text(encoding="utf-8"))
    text = template.safe_substitute(
        title=title, date=date, section=section, slug=slug, tags=", ".join(tags))

    path = Path(drafts_dir) / (f"{slug}/{BUNDLE_INDEX}" if stage else f"{date}-{slug}.md")
    if path.exists():
        raise DraftError(f"草稿已存在：{path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def _check_section(section, sections):
    if section not in sections:
        raise DraftError(f"未知板块 {section!r}，可选：{', '.join(sorted(sections))}")
    if sections[section]:
        raise DraftError(f"板块 {section!r} 是自动生成的，不接受手写文章")


def _publish_warnings(meta, body):
    warnings = []
    if not str(meta.get("summary") or "").strip():
        warnings.append("summary 为空：站内会自动截取正文开头，CSDN 摘要需要手动填写")
    if EXAMPLE_IMAGE_RE.search(body):
        warnings.append("正文里还留着模板的示例图片 example.png，记得删掉或替换")
    return warnings


def _with_date(text, date):
    """只改 frontmatter 里的 date 行，正文里出现的 date: 不动。"""
    m = FRONTMATTER_RE.match(text)
    if not m:
        raise DraftError("草稿缺少 --- 包裹的 frontmatter")
    fm = m.group(0)
    new_fm = DATE_LINE_RE.sub(f"date: {date}", fm, count=1) if DATE_LINE_RE.search(fm) \
        else fm.replace("---", f"---\ndate: {date}", 1)
    return new_fm + text[m.end():]


def _validate_stage(meta, body, where):
    """design: stage 的原稿先完整渲染一遍：有错就在发布前报出来，草稿保持原样。"""
    if str(meta.get("design", "")).lower() != "stage":
        return
    try:
        stage.render_body(body)
        stage.hero_name(meta)
    except stage.StageError as e:
        raise DraftError(f"{where} 的 stage 写法有误：{e}") from e


def publish_draft(draft, content_dir=CONTENT_DIR, sections=None, today=None):
    """把草稿移到 content/<板块>/，日期改成发布当天。返回 (目标路径, 提醒列表)。
    草稿可以是单个 .md 文件，也可以是含 index.md 的文件夹（整个文件夹一起发布）。"""
    draft = Path(draft)
    bundle = draft.is_dir()
    index = draft / BUNDLE_INDEX if bundle else draft
    if not index.is_file():
        raise DraftError(f"找不到草稿：{index}")
    text = index.read_text(encoding="utf-8")
    meta, body = util.parse_frontmatter(text)
    if not str(meta.get("title") or "").strip():
        raise DraftError("frontmatter 缺少 title")

    section = str(meta.get("section") or DEFAULT_SECTION)
    _check_section(section, sections if sections is not None else load_sections())
    _validate_stage(meta, body, index)

    date = today or today_bj()
    if meta.get("slug"):
        stem = util.slugify(str(meta["slug"]))
    elif bundle:
        stem = draft.name
    else:
        stem = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", draft.stem)
    # 文件夹文章的文件夹名就是 URL，不加日期前缀；单文件沿用「日期-名字.md」
    target = Path(content_dir) / section / (stem if bundle else f"{date}-{stem}.md")
    if target.exists():
        raise DraftError(f"目标已存在：{target}")

    published = _with_date(text, date)
    target.parent.mkdir(parents=True, exist_ok=True)
    if bundle:
        shutil.move(str(draft), str(target))
        (target / BUNDLE_INDEX).write_text(published, encoding="utf-8")
    else:
        target.write_text(published, encoding="utf-8")
        draft.unlink()
    return target, _publish_warnings(meta, body)


def _cmd_new(args):
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    _check_section(args.section, load_sections())
    path = new_draft(args.title, section=args.section, tags=tags, slug=args.slug, stage=args.stage)
    target = path.parent if args.stage else path
    print(f"已创建草稿：{path.relative_to(ROOT)}")
    print(f"写完后发布：python3 src/drafts.py publish {target.relative_to(ROOT).as_posix()}")


def _cmd_publish(args):
    target, warnings = publish_draft(args.draft)
    rel = target.relative_to(ROOT).as_posix()
    print(f"已发布到：{rel}")
    for w in warnings:
        print(f"  提醒：{w}")
    print("下一步：")
    print("  python3 src/generator.py && python3 -m http.server -d public 8000   # 本地预览")
    print(f"  git add {rel} static/images && git commit -m \"docs: 新文章\" && git push")
    print(f"  python3 src/export_csdn.py {rel}   # 生成 CSDN 版本")


def main(argv=None):
    parser = argparse.ArgumentParser(description="新建 / 发布博客草稿")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_new = sub.add_parser("new", help="从模板新建草稿")
    p_new.add_argument("title")
    p_new.add_argument("--section", default=DEFAULT_SECTION)
    p_new.add_argument("--tags", help="逗号分隔")
    p_new.add_argument("--slug", help="URL 名，建议用英文，默认取标题")
    p_new.add_argument("--stage", action="store_true", help="动捕棚版式的文件夹文章（drafts/<slug>/index.md）")
    p_new.set_defaults(func=_cmd_new)
    p_pub = sub.add_parser("publish", help="把草稿发布到 content/<板块>/")
    p_pub.add_argument("draft")
    p_pub.set_defaults(func=_cmd_publish)

    args = parser.parse_args(argv)
    try:
        args.func(args)
    except DraftError as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

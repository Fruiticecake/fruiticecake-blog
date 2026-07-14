#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "content" / "blog"
DUMPS = [
 pathlib.Path(r"C:\Users\Administrator\.cursor\projects\d-software-WorkBuddy-knowledge\agent-tools\47e01a33-d4a4-482b-9d55-e91d36634ea8.txt"),
 pathlib.Path(r"C:\Users\Administrator\.cursor\projects\d-software-WorkBuddy-knowledge\agent-tools\902a3ecc-5d01-45e1-97c2-781fbf04413e.txt"),
 pathlib.Path(r"C:\Users\Administrator\.cursor\projects\d-software-WorkBuddy-knowledge\agent-tools\cf5ca9ed-0738-4f14-ae24-75fb2d8f074d.txt"),
]
TITLE_SUFFIX_RE = re.compile(r"(?:_[^_\n]{0,80})?-CSDN\u535a\u5ba2\s*$")
SEO_SUFFIX_RE = re.compile(r"_[^_\n]{1,60}$")
URL_RE = re.compile(r"^URL:\s*(https://blog\.csdn\.net/[\w/-]+/article/details/(\d+))\s*$", re.M)
CHROME_CUT_RE = re.compile(
    r"\n(?:" + "|".join([
        "\u6807\u7b7e", "\u70b9\u8d5e", "\u8bc4\u8bba\\s*$", "\u7ea2\u5305",
        "\u76f8\u5173\u63a8\u8350", "\u559c\u6b22\u5c31\u652f\u6301\u4e00\u4e0b\u5427",
        "\u672c\u6587\u94fe\u63a5", "\u7248\u6743\u58f0\u660e", "\u5206\u7c7b\u4e13\u680f",
        "\u6587\u7ae0\u6807\u7b7e",
    ]) + r")\b",
    re.M,
)

def slugify(text):
    text = (text or "").strip().lower()
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", text)
    return text.strip("-") or "post"

def clean_title(raw):
    t = raw.strip()
    if t.startswith("#"):
        t = t.lstrip("#").strip()
    t = TITLE_SUFFIX_RE.sub("", t).strip()
    t = SEO_SUFFIX_RE.sub("", t).strip()
    return t or "untitled"
def extract_csdn_tags(chrome):
    tags = []
    for m in re.finditer(r"#([^#\s\n]+)#", chrome):
        tag = m.group(1).strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags[:8]

def make_summary(body, limit=100):
    text = re.sub(r"[#>*`_\-\[\]\(\)]+", " ", body)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\u2026"

def yaml_escape(s):
    if any(c in s for c in (":", "#", "{", "}", "[", "]", ",", '"', "'", "\n")):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s

def trim_chrome(body):
    m = CHROME_CUT_RE.search(body)
    tags = []
    if m:
        tags = extract_csdn_tags(body[m.start():])
        body = body[: m.start()]
    for marker in ("\n\u4e0a\u4e00\u7bc7", "\n\u4e0b\u4e00\u7bc7", "\n\u89c9\u5f97\u8fd8\u4e0d\u9519", "\n\u626b\u4e00\u626b"):
        i = body.find(marker)
        if i >= 0:
            body = body[:i]
    return body.strip(), tags
def parse_dump(text):
    matches = list(URL_RE.finditer(text))
    articles = []
    for i, m in enumerate(matches):
        url, aid = m.group(1), m.group(2)
        before = text[: m.start()].rstrip()
        title_line = before.splitlines()[-1] if before else ""
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        next_chunk = text[m.end() : end]
        nc_lines = next_chunk.splitlines()
        c = 0
        pub = "2020-01-01"
        author = ""
        for j, line in enumerate(nc_lines[:10]):
            if line.startswith("Published:"):
                pub = line.split(":", 1)[1].strip() or pub
                c = j + 1
            elif line.startswith("Author:"):
                author = line.split(":", 1)[1].strip()
                c = j + 1
        body_raw = "\n".join(nc_lines[c:]).lstrip("\n")
        bl = body_raw.splitlines()
        if bl:
            fl = bl[0].strip()
            ct = clean_title(title_line)
            if fl == title_line.strip() or clean_title(fl) == ct or fl.startswith("---") or (fl.startswith("#") and clean_title(fl) == ct):
                k = 1
                while k < len(bl) and (not bl[k].strip() or bl[k].strip() == "---"):
                    k += 1
                body_raw = "\n".join(bl[k:])
        body, ctags = trim_chrome(body_raw)
        articles.append({"id": aid, "url": url, "title": clean_title(title_line), "date": pub, "author": author, "body": body, "tags": ctags})
    return articles
def write_post(art):
    slug_tail = slugify(art["title"])
    if len(slug_tail) > 60:
        slug_tail = slug_tail[:60].rstrip("-")
    full_slug = f"{art['id']}-{slug_tail}"
    tags = ["CSDN\u540c\u6b65"] + [t for t in art["tags"] if t != "CSDN\u540c\u6b65"]
    summary = make_summary(art["body"])
    tag_str = "[" + ", ".join(tags) + "]"
    fm = "---\n" f"title: {yaml_escape(art['title'])}\n" f"date: {art['date']}\n" f"summary: {yaml_escape(summary)}\n" f"tags: {tag_str}\n" f"slug: {full_slug}\n" f"source: {art['url']}\n" "---\n\n"
    footer = f"\n\n> \u539f\u8f7d [CSDN]({art['url']})\uff0c\u540c\u6b65\u81f3\u672c\u7ad9\u3002\n"
    path = OUT / f"{full_slug}.md"
    path.write_text(fm + art["body"] + footer, encoding="utf-8")
    return path

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.md"):
        if p.name != "welcome.md":
            p.unlink()
    seen = set()
    all_arts = []
    for dump in DUMPS:
        if not dump.is_file():
            print("missing", dump, file=sys.stderr)
            continue
        for a in parse_dump(dump.read_text(encoding="utf-8")):
            if a["id"] in seen:
                continue
            seen.add(a["id"])
            all_arts.append(a)
    written = [write_post(a) for a in all_arts]
    print(f"imported={len(written)}")
    for p in written[:5]:
        print(" ", p.name)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
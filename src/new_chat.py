#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""交互式创建一条 AI 对话记录，保存到 content/ai-chat/。

用法：python3 src/new_chat.py
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import util  # noqa: E402

CONTENT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content", "ai-chat")


def main():
    title = input("标题: ").strip()
    model = input("使用的 AI（默认 AI）: ").strip() or "AI"
    tags = input("标签（逗号分隔，可留空）: ").strip()
    tags_list = [t.strip() for t in tags.split(",") if t.strip()]
    source = input("来源链接（可留空）: ").strip()
    print("依次输入对话内容，每行以「我：」或「AI：」开头，单独一行输入 END 结束：")
    lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        lines.append(line)

    date = datetime.datetime.now(util.BJ).strftime("%Y-%m-%d")
    slug = util.slugify(title)
    fm = ["---", f"title: {title}", f"date: {date}", f"model: {model}", "type: chat"]
    if tags_list:
        fm.append("tags: [" + ", ".join(tags_list) + "]")
    if source:
        fm.append(f"source: {source}")
    fm += [f"slug: {slug}", "---", ""]
    content = "\n".join(fm) + "\n".join(lines) + "\n"

    os.makedirs(CONTENT_DIR, exist_ok=True)
    path = os.path.join(CONTENT_DIR, f"{date}-{slug}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"已保存: {path}")


if __name__ == "__main__":
    main()


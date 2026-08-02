#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 对话记录渲染：把 frontmatter 正文里的问答标记解析为聊天气泡 HTML。

正文格式约定（每轮以行首角色标记开始，直到下一个标记前的内容都属于这一轮，
支持行内 Markdown）：

    我：这里是我的问题
    AI：这里是回答，支持 **加粗**、`代码`、链接等

标记大小写、中英文均可识别："我/user/q" 归为提问方，"ai/assistant/gpt/claude/a" 归为作答方。
"""
import re
import markdown
import util

USER_RE = re.compile(r"^(我|user|q)\s*[:：]\s*(.*)$", re.I)
AI_RE = re.compile(r"^(ai|assistant|claude|gpt|a)\s*[:：]\s*(.*)$", re.I)


def render(body, meta=None):
    meta = meta or {}
    lines = body.replace("\r\n", "\n").split("\n")
    turns = []
    cur = None
    for line in lines:
        stripped = line.strip()
        um = USER_RE.match(stripped)
        am = None if um else AI_RE.match(stripped)
        if um:
            cur = ["user", [um.group(2)]]
            turns.append(cur)
        elif am:
            cur = ["ai", [am.group(2)]]
            turns.append(cur)
        elif cur is not None:
            cur[1].append(line)
    if not turns:
        # 没有识别到任何标记，退化为普通 Markdown，保证内容不丢失
        return markdown.render(body)
    model_label = util.html_escape(str(meta.get("model") or "AI"))
    parts = ['<div class="chat-thread">']
    for role, buf in turns:
        text = "\n".join(buf).strip()
        html_ = markdown.render(text)
        label = "我" if role == "user" else model_label
        parts.append(
            f'<div class="chat-turn chat-{role}">'
            f'<div class="chat-role">{label}</div>'
            f'<div class="chat-bubble">{html_}</div></div>'
        )
    parts.append("</div>")
    return "\n".join(parts)


#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用工具：slug、北京时间、frontmatter 解析、HTML 转义。"""
import re
import html
import datetime

BJ = datetime.timezone(datetime.timedelta(hours=8))


def slugify(text):
    """生成 URL 友好的 slug（保留中文）。"""
    text = (text or "").strip().lower()
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", text)
    return text.strip("-") or "post"


def html_escape(s):
    return html.escape(str(s), quote=True)


def parse_date(value):
    """解析 YYYY-MM-DD 或 ISO 时间串，返回 datetime（UTC 感知）。"""
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime(value.year, value.month, value.day, tzinfo=datetime.timezone.utc)
    if not value:
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.datetime.fromisoformat(s)
    except Exception:
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
        if m:
            return datetime.datetime(*map(int, m.groups()), tzinfo=datetime.timezone.utc)
    return None


def bj_human(dt):
    """北京时间人话格式，不暴露 ISO 串。"""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    dt = dt.astimezone(BJ)
    today = datetime.datetime.now(BJ).date()
    if dt.date() == today:
        prefix = "今天"
    elif dt.date() == today - datetime.timedelta(days=1):
        prefix = "昨天"
    else:
        prefix = f"{dt.year}年{dt.month}月{dt.day}日"
    hh = f"{dt.hour:02d}:{dt.minute:02d}" if (dt.hour or dt.minute) else ""
    return f"{prefix} {hh}".strip() if hh else prefix


def parse_frontmatter(text):
    """解析简单的 YAML frontmatter。

    支持：
      key: value
      key: [a, b, c]        # 列表
      key:                 # 多行列表
        - a
        - b
    返回 (meta: dict, body: str)。
    """
    if not text.startswith("---"):
        return {}, text.strip()
    # 找到结束的 ---
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not m:
        return {}, text.strip()
    raw_meta, body = m.group(1), m.group(2)
    meta = {}
    cur_key = None
    list_buf = None
    for line in raw_meta.splitlines():
        if not line.strip():
            continue
        # 多行列表项
        li = re.match(r"^\s*-\s+(.*)$", line)
        if li and cur_key is not None and list_buf is not None:
            list_buf.append(_scalar(li.group(1)))
            continue
        kv = re.match(r"^([A-Za-z0-9_]+)\s*:\s*(.*)$", line)
        if kv:
            cur_key = kv.group(1)
            val = kv.group(2).strip()
            if val == "":
                list_buf = []
                meta[cur_key] = list_buf
            elif val.startswith("[") and val.endswith("]"):
                inner = val[1:-1].strip()
                meta[cur_key] = [_scalar(x) for x in inner.split(",")] if inner else []
                list_buf = None
            else:
                meta[cur_key] = _scalar(val)
                list_buf = None
    return meta, body.strip()


def _scalar(v):
    v = v.strip().strip('"').strip("'")
    return v

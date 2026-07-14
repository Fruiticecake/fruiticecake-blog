#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据模型：文章 Post 与 板块 Section。"""
import datetime
from dataclasses import dataclass, field


@dataclass
class Post:
    slug: str
    section: str
    title: str
    date: datetime.datetime
    summary: str = ""
    tags: list = field(default_factory=list)
    body_html: str = ""
    src_path: str = ""
    source: str = ""

    @property
    def url(self):
        return f"/{self.section}/{self.slug}.html"

    @property
    def date_human(self):
        from util import bj_human
        return bj_human(self.date)


@dataclass
class Section:
    slug: str
    name: str
    description: str = ""
    auto: bool = False
    posts: list = field(default_factory=list)

    @property
    def url(self):
        return f"/{self.slug}/"

    @property
    def count(self):
        return len(self.posts)

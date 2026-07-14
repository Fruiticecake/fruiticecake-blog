---
title: 还在苦于Kindle的epub格式吗？python爬虫，一键爬取小说加txt转换epub。
date: 2020-01-01
summary: 该文章介绍了一个使用Python编写的爬虫脚本，可以从独步小说网站抓取txt格式的小说，并利用Pandoc工具将txt转换为epub格式，适用于Kindle阅读。脚本涉及了请求、BeautifulSo…
tags: [CSDN同步, python]
slug: 130482474-还在苦于kindle的epub格式吗-python爬虫-一键爬取小说加txt转换epub
source: https://blog.csdn.net/weixin_52400878/article/details/130482474
---

该文章介绍了一个使用Python编写的爬虫脚本，可以从独步小说网站抓取txt格式的小说，并利用Pandoc工具将txt转换为epub格式，适用于Kindle阅读。脚本涉及了请求、BeautifulSoup解析和文件操作等技术。

还在苦于Kindle的epub格式吗？python爬虫，一键爬取小说加txt转换epub。

项目地址： https://github.com/Fruiticecake/dubuNovel/blob/main/getBook/getBook_single.py

爬取地址为独步小说网站，本博客仅用于学习作用。

#### 爬取小说txt格式（单线程）

```
import os
import requests
from bs4 import BeautifulSoup
import time
from queue import Queue
#lock = threading.RLock()
def get_page(url, headers):
    while (1):
        try:
            response = requests.get(url=url, headers=headers)
            break
        except Exception as e:
            print(e)
            time.sleep(2)
    return response

def download_novel(bookName, bookAuther, headers, q):
    size = q.qsize()
    count = 0
    print('共有：' + str(size) + "章")
    # 存储文件路径
    path = './novel/'
    n_path = path + bookName + bookAuther + '.txt'
    if not os.path.exists(path):
        os.mkdir
```

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/130482474)，同步至本站。

<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$description">
<meta name="author" content="Fruiticecake">
<meta name="theme-color" content="#0a0c0b" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#eef0e9" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="$brand" href="/feed.xml">
$head_boot
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;700&family=Chakra+Petch:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/stage/tokens.css?v=$version">
<link rel="stylesheet" href="/stage/motion.css?v=$version">
<link rel="stylesheet" href="/style.css?v=$version">
$analytics_html
</head>
<body data-page="$page">
<header class="bar">
  <div class="wrap">
    <a class="brand" href="/"><i aria-hidden="true"></i>$brand_upper</a>
    <nav class="site-nav" aria-label="主导航">
      <a href="/"$home_current>首页</a>
      $nav_links
      <a href="/archive/"$archive_current>归档</a>
    </nav>
    <div class="bar-tools"><span class="rec">REC · <span id="clock">00:00:00:00</span></span>$theme_button</div>
  </div>
  <span class="progress" aria-hidden="true"></span>
</header>
<main class="wrap">
$content
</main>
<footer class="site-footer">
  <div class="wrap">
    <span>© $year $brand_upper · STATIC BLOG · $author</span>
    <span><a href="https://github.com/Fruiticecake/fruiticecake-blog" target="_blank" rel="noopener noreferrer">GITHUB</a> · <a href="/feed.xml">RSS</a></span>
  </div>
</footer>
<nav class="tabbar" aria-label="底部导航">$tab_links</nav>
<button class="back-to-top" id="backToTop" type="button" aria-label="回到顶部" title="回到顶部">↑</button>
$mermaid_script
<script type="module" src="/site/site.js?v=$version"></script>
</body>
</html>

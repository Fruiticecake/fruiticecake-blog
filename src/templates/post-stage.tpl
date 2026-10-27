<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$description">
<meta name="author" content="Fruiticecake">
<meta name="theme-color" content="#0a0c0b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="$brand" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;700&family=Chakra+Petch:wght@500;700&display=swap" rel="stylesheet">
$head_boot
<link rel="stylesheet" href="/stage/tokens.css?v=$version">
<link rel="stylesheet" href="/stage/stage.css?v=$version">
<link rel="stylesheet" href="/stage/motion.css?v=$version">
$local_style
$analytics_html
</head>
<body class="stage" data-hero="$hero"$local_widgets_attr>
<header class="bar">
  <a class="brand" href="/">$brand</a>
  <nav aria-label="站点">$nav_links</nav>
  <span class="bar-tools"><span class="rec"><span class="rec-label">REC · </span><span id="clock">00:00:00:00</span></span>$theme_button</span>
  <span class="progress" aria-hidden="true"></span>
</header>

<main>
<section class="hero">
  <figure class="viewer" data-hero-mount></figure>
  <div class="hero-copy">
    <div>
      <p class="tc">[00:00:00] $kicker</p>
      <h1>$display_title</h1>
    </div>
    <div>
      <p class="dek">$dek</p>
      <div class="meta">$meta_chips</div>
    </div>
  </div>
</section>

<div class="layout">
  <aside class="rail" aria-label="章节">
    <p>// 章节</p>
    <ol>$rail</ol>
  </aside>
  <article class="body">
$body
    <footer class="foot"><a href="$section_url">← // $section_name</a><span>END OF TAPE</span></footer>
  </article>
</div>
</main>

<script type="module" src="/stage/runtime.js?v=$version"></script>
</body>
</html>

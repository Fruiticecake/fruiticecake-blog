<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<meta name="description" content="$description">
<meta name="author" content="Fruiticecake">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">Fruiticecake</a>
    <div class="tagline">$tagline</div>
  </div>
</header>
<nav class="site-nav">
  <div class="wrap">
    <a href="/">首页</a>
    $nav_links
    <a href="/archive/">归档</a>
  </div>
</nav>
<main class="wrap">
$content
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>© $year Fruiticecake · 静态博客 · <a href="https://github.com/Fruiticecake/fruiticecake-blog" target="_blank" rel="noopener noreferrer">GitHub</a></p>
  </div>
</footer>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark' });
</script>
</body>
</html>

<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>$title</title>
<meta name="description" content="$description">
<meta name="author" content="Fruiticecake">
<meta name="theme-color" content="#efe4d1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css">
<link rel="alternate" type="application/rss+xml" title="$brand" href="/feed.xml">
</head>
<body data-page="$page">
<div class="app-bg" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">Fruiticecake</a>
    <div class="tagline">$tagline</div>
  </div>
</header>
<nav class="site-nav" aria-label="主导航">
  <div class="wrap">
    <div class="nav-pill">
      <a href="/"$home_current>首页</a>
      $nav_links
      <a href="/archive/"$archive_current>归档</a>
    </div>
  </div>
</nav>
<main class="wrap">
$content
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>© $year Fruiticecake · 静态博客 · <a href="https://github.com/Fruiticecake/fruiticecake-blog" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="/feed.xml">RSS</a></p>
  </div>
</footer>
<nav class="tabbar" aria-label="底部导航">$tab_links</nav>
<button class="back-to-top" id="backToTop" aria-label="回到顶部" title="回到顶部">↑</button>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'dark' });
</script>
<script>
(function(){
  var btn = document.getElementById('backToTop');
  window.addEventListener('scroll', function(){
    btn.classList.toggle('show', window.scrollY > 480);
  }, { passive: true });
  btn.addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });

  document.querySelectorAll('.post-body pre').forEach(function(pre){
    if (pre.classList.contains('mermaid')) return;
    var btn2 = document.createElement('button');
    btn2.className = 'copy-btn';
    btn2.type = 'button';
    btn2.textContent = '复制';
    btn2.addEventListener('click', function(){
      var code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.textContent).then(function(){
        btn2.textContent = '已复制';
        setTimeout(function(){ btn2.textContent = '复制'; }, 1500);
      });
    });
    pre.appendChild(btn2);
  });
})();
</script>
$analytics_html
</body>
</html>

<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$title</title>
<meta name="description" content="$description">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">$brand</a>
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
    <p>© $year $author · 由自研静态生成器构建 · 内容托管于 GitHub</p>
  </div>
</footer>
</body>
</html>

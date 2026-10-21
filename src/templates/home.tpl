<section class="home-hero" aria-label="文章星图">
  <figure class="viewer" id="constellation" data-default-range="90">
    <figcaption class="viewer-cap">
      <span><i class="k-dot"></i>一篇文章</span><span><i class="k-ring"></i>交互文章</span><span><i class="k-hot"></i>最新</span>
      <span class="cap-note">每条轨道一个板块 · 点击标记点进入</span>
    </figcaption>
  </figure>
</section>
<section class="home-head">
  <div>
    <p class="tc">[LIVE] $today · $total MARKERS</p>
    <h1>$brand_html</h1>
  </div>
  <p class="lede">$site_subtitle</p>
</section>
$telemetry_html
<section class="block" aria-labelledby="latest-h">
  <div class="block-head"><p class="tc">[LATEST]</p><h2 id="latest-h">最近拍摄</h2><a class="more" href="/archive/">ARCHIVE →</a></div>
  <div class="latest">
    $feature_html
    <ol class="takes">$takes_html</ol>
  </div>
</section>
<section class="block" aria-labelledby="channels-h">
  <div class="block-head"><p class="tc">[CHANNELS]</p><h2 id="channels-h">板块</h2></div>
  <div class="channels">$channels_html</div>
</section>
<script type="application/json" id="marker-data">$marker_json</script>

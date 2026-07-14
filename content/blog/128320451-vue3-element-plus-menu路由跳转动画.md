---
title: "vue3 element plus Menu路由跳转动画"
date: 2022-12-14
summary: "vue3 element plus Menu路由跳转的切换动画"
tags: ["CSDN同步", "前端", "javascript", "开发语言"]
slug: 128320451-vue3-element-plus-menu路由跳转动画
source: "https://blog.csdn.net/weixin_52400878/article/details/128320451"
html: true
---

<pre>
<code class="language-html">        &lt;el-main&gt;
          &lt;router-view v-slot="{ Component }"&gt;
            &lt;keep-alive&gt;
              &lt;transition :name="animation"&gt;
                &lt;component :is="Component" /&gt;
              &lt;/transition&gt;
            &lt;/keep-alive&gt; &lt;/router-view
        &gt;&lt;/el-main&gt;</code></pre>

<pre>
<code class="language-javascript">const animation = ref("slide");
onBeforeRouteUpdate((to, form) =&gt; {
  if (to.meta.index &gt; form.meta.index) {
    animation.value = "slide-left";
  } else {
    animation.value = "slide-right";
  }
});</code></pre>

<pre>
<code class="language-css">.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  width: 100%;
  height: 100%;
  will-change: transform;
  transition: all 300ms cubic-bezier(0.55, 0, 0.1, 1);
  position: absolute;
  backface-visibility: hidden;
}
.slide-right-enter-active {
  opacity: 0;
  transform: translate3d(-100%, 0, 0);
}
.slide-right-leave-active {
  opacity: 0;
  transform: translate3d(3%, 0, 0);
}
.slide-left-enter-active {
  opacity: 0;
  transform: translate3d(100%, 0, 0);
}
.slide-left-leave-active {
  opacity: 0;
  transform: translate3d(-3%, 0, 0);
}</code></pre>

<p></p>
<p class="source-note">原文发布于 <a href="https://blog.csdn.net/weixin_52400878/article/details/128320451" target="_blank" rel="noopener noreferrer">CSDN</a>。</p>

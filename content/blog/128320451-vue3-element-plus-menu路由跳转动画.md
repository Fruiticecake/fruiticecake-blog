---
title: vue3 element plus Menu路由跳转动画
date: 2020-01-01
summary: "本文介绍如何在Vue项目中使用路由视图实现页面过渡动画效果，包括不同方向的滑动动画设置及CSS过渡属性的详细配置。 <el main <router view v slot=\"{ Component…"
tags: [CSDN同步, 前端]
slug: 128320451-vue3-element-plus-menu路由跳转动画
source: https://blog.csdn.net/weixin_52400878/article/details/128320451
---

本文介绍如何在Vue项目中使用路由视图实现页面过渡动画效果，包括不同方向的滑动动画设置及CSS过渡属性的详细配置。

```
        <el-main>
          <router-view v-slot="{ Component }">
            <keep-alive>
              <transition :name="animation">
                <component :is="Component" />
              </transition>
            </keep-alive> </router-view
        ></el-main>
```

```
const animation = ref("slide");
onBeforeRouteUpdate((to, form) => {
  if (to.meta.index > form.meta.index) {
    animation.value = "slide-left";
  } else {
    animation.value = "slide-right";
  }
});
```

```
.slide-left-enter-active,
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
}
```

> 原载 [CSDN](https://blog.csdn.net/weixin_52400878/article/details/128320451)，同步至本站。

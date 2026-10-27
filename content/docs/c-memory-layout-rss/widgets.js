// 本文专属组件：首屏地址空间 / 变量归位 / VmRSS 曲线形状 / FreeRTOS heap_4 模拟。
// 约定：导出 widgets 与 heroes，键是组件名，值是 mount(root, ctx)。
// 首屏和曲线里的 VmRSS、VmSize 关键点来自正文的实测；其余数值为图解，组件内标注「示意」。

import { mountAddrSpaceHero } from "./hero.js";
import { mountVarPlacer } from "./placer.js";
import { mountRssTrend } from "./rss.js";
import { mountRtosHeap } from "./rtos.js";

export const widgets = { "var-placer": mountVarPlacer, "rss-trend": mountRssTrend, "rtos-heap": mountRtosHeap };
export const heroes = { "addr-space": mountAddrSpaceHero };

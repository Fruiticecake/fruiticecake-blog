// 本文专属组件：首屏就绪链表 / 总流程图 / 三次握手与 accept 队列 / select 与 epoll 对比 / ev.data 标签往返 / LT 与 ET。
// 约定：导出 widgets 与 heroes，键是组件名，值是 mount(root, ctx)。
// 行为依据 epoll(7)、select(2)、listen(2) 与内核 5.x 源码；计数、就绪序列、队列排满等为图解，组件内标注「示意」。

import { mountEpollReadyHero } from "./hero.js";
import { mountEchoFlow } from "./flow.js";
import { mountAcceptQueue } from "./queue.js";
import { mountSelectVsEpoll } from "./mux.js";
import { mountDataTag } from "./tag.js";
import { mountLtEt } from "./ltet.js";

export const widgets = {
  "echo-flow": mountEchoFlow,
  "accept-queue": mountAcceptQueue,
  "select-vs-epoll": mountSelectVsEpoll,
  "data-tag": mountDataTag,
  "lt-et": mountLtEt,
};
export const heroes = { "epoll-ready": mountEpollReadyHero };

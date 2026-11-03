// 本文专属组件：首屏两条车道 / 七种 IPC 的拷贝路径 / 共享内存环形缓冲区 / 端侧 AI 数据通道。
// 约定：导出 widgets 与 heroes，键是组件名，值是 mount(root, ctx)。

import { mountIpcHero } from "./hero.js";
import { mountCopyPath } from "./copy.js";
import { mountShmRing } from "./ring.js";
import { mountAiPipeline } from "./aipipe.js";

export const widgets = {
  "copy-path": mountCopyPath,
  "shm-ring": mountShmRing,
  "ai-pipeline": mountAiPipeline,
};
export const heroes = { "ipc-lanes": mountIpcHero };

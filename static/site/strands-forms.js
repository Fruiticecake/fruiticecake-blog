// 海藻场的四种形态：同一池长条，按首页四个数字各摆成 Stripe 首页统计区的四种形状，数据来自本站：
//   burst    累计文章：每条射线是一篇文章，按发布时间从左（旧）到右（新）扇开
//   timeline 连续更新：最近 90 天排成一条 S 形飘带，每天一根竖线，越高当天发得越多；当前连续更新的日子亮起
//   globe    本月新增：本月每一天是地球上的一束经线，有更新的日子亮起
//   hub      内容板块：每个板块一束线，从左侧汇入中间的站点，再从右侧散开
// 每个形态返回 POOL 根长条（多余的收进焦点、透明），每根是 PTS 个点的折线：第 0 个点是根，最后一个点是梢。

export const POOL = 240;
export const PTS = 20;
const DAY = 86400000;
const TIMELINE_DAYS = 90;

const bjToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
// FNV-1a + murmur 收尾混合：相近的字符串（同格式的日报网址）也能散成均匀的 0~1
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function strand(sample, extra = {}) {
  const pts = new Float32Array(PTS * 2);
  for (let i = 0; i < PTS; i++) {
    const [x, y] = sample(i / (PTS - 1));
    pts[i * 2] = x; pts[i * 2 + 1] = y;
  }
  return { pts, a: 0.5, lit: false, dot: 1.6, label: "", href: "", ...extra };
}
const hidden = (fx, fy) => strand(() => [fx, fy], { a: 0, dot: 0 });
const line = (x0, y0, x1, y1) => (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];

function fill(list, focus) {
  while (list.length < POOL) list.push(hidden(focus.x, focus.y));
  return list.slice(0, POOL);
}

/* ---------- 累计文章：放射 ---------- */
function burst(data, W, H) {
  const posts = [...data.posts].sort((a, b) => a.d.localeCompare(b.d)).slice(-POOL);
  const focus = { x: W / 2, y: H + 6 };
  const rx = W * 0.47, ry = H * 0.9, n = posts.length;
  const list = posts.map((p, i) => {
    const r = hash(p.u);
    const ang = -Math.PI * (0.95 - 0.9 * ((i + 0.5) / n)) + (r - 0.5) * 0.04;
    const edge = 1 / Math.hypot(Math.cos(ang) / rx, Math.sin(ang) / ry);
    const fresh = i >= n - 10;
    const len = edge * (fresh ? 0.88 + 0.12 * r : 0.42 + 0.5 * r);
    return strand(line(focus.x, focus.y, focus.x + Math.cos(ang) * len, focus.y + Math.sin(ang) * len),
      { a: fresh ? 0.95 : 0.55, lit: fresh, dot: fresh ? 2.2 : 1.4, label: `${p.d} · ${p.t}`, href: p.u });
  });
  return { strands: fill(list, focus), focus, note: `每条射线是一篇文章，左旧右新 · 共 ${n} 篇 · 悬停看标题，点击打开` };
}

/* ---------- 连续更新：时间飘带 ---------- */
function timeline(data, W, H) {
  const today = Date.parse(bjToday());
  const perDay = new Map(), daily = new Set();
  for (const p of data.posts) {
    perDay.set(p.d, (perDay.get(p.d) || 0) + 1);
    if (data.daily?.includes(p.s)) daily.add(p.d);
  }
  const streak = new Set();                             // 与服务端 streak_days 相同：从今天（或昨天）往回数
  let cursor = daily.has(dayKey(today)) ? today : today - DAY;
  while (daily.has(dayKey(cursor))) { streak.add(dayKey(cursor)); cursor -= DAY; }

  const unit = H / 420;
  const list = [];
  for (let i = 0; i < TIMELINE_DAYS; i++) {
    const s = i / (TIMELINE_DAYS - 1);
    const key = dayKey(today - (TIMELINE_DAYS - 1 - i) * DAY);
    const n = perDay.get(key) || 0;
    const z = 0.5 + 0.5 * Math.sin(s * Math.PI * 2.2 + 0.3);     // 0 近 1 远：S 形飘带的纵深
    const persp = 1 / (1 + 0.6 * z);
    const x = W / 2 + (s - 0.5) * W * 0.86 * persp;
    const ribbon = H * (0.64 - 0.36 * z);
    const tipY = ribbon - Math.min(n, 6) * 26 * unit * persp;
    const lit = streak.has(key);
    list.push(strand(line(x, H + 4, x, tipY), {
      a: lit ? 1 : n ? 0.75 : 0.28, lit, dot: (n ? 2 : 1.2) * persp + (lit ? 0.6 : 0),
      label: `${key} · ${n ? `${n} 篇` : "无更新"}${lit ? " · 连续更新中" : ""}`,
    }));
  }
  const focus = { x: W / 2, y: H + 4 };
  const note = streak.size
    ? `最近 ${TIMELINE_DAYS} 天，每条竖线是一天，越高发得越多 · 亮起的 ${streak.size} 天是当前连续更新`
    : `最近 ${TIMELINE_DAYS} 天，每条竖线是一天，越高发得越多 · 每日板块今天还没更新，连续天数从 0 算起`;
  return { strands: fill(list, focus), focus, note };
}

/* ---------- 本月新增：地球 ---------- */
function globe(data, W, H) {
  const [y, m, d] = bjToday().split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  const perDay = new Map();
  for (const p of data.posts) if (p.d.startsWith(prefix)) perDay.set(+p.d.slice(8), (perDay.get(+p.d.slice(8)) || 0) + 1);

  const cx = W / 2, cy = H * 1.04, r = Math.min(W * (W < 640 ? 0.62 : 0.38), H * 0.95);   // 窄屏画面偏方，球放大
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const pole = norm([-0.5, -0.72, 0.48]);                // 屏幕坐标：y 向下为正，z 朝向观众
  const u = norm(cross(pole, [0, 0, 1])), v = cross(pole, u);
  const per = Math.floor(POOL / days);

  const list = [];
  for (let day = 1; day <= days; day++) {
    const n = perDay.get(day) || 0;
    for (let j = 0; j < per; j++) {
      const theta = (2 * Math.PI * (day - 1 + j / per)) / days;
      const reach = 1.9 + 0.9 * hash(`${day}-${j}`);
      let last = pole;
      list.push(strand((t) => {
        const phi = t * reach;
        const dir = [0, 1, 2].map((k) => Math.cos(theta) * u[k] + Math.sin(theta) * v[k]);
        const p = [0, 1, 2].map((k) => Math.cos(phi) * pole[k] + Math.sin(phi) * dir[k]);
        if (p[2] > 0.02) last = p;                         // 转到背面就停在地平线上
        return [cx + r * last[0], cy + r * last[1]];
      }, {
        a: day > d ? 0.05 : n ? 0.95 : 0.12, lit: n > 0, dot: n ? 1.8 : 0.8,
        label: `${m} 月 ${day} 日 · ${day > d ? "还没到" : n ? `${n} 篇` : "无更新"}`,
      }));
    }
  }
  const focus = { x: cx + r * pole[0], y: cy + r * pole[1] };
  return { strands: fill(list, focus), focus: { x: cx, y: cy - r * 0.3 },
    note: `本月每一天是一束经线 · 亮起的 ${perDay.size} 天有更新 · 悬停看日期` };
}

/* ---------- 内容板块：汇聚 ---------- */
function hub(data, W, H) {
  const secs = data.sections.filter((s) => s.count > 0);
  const total = secs.reduce((n, s) => n + s.count, 0) || 1;
  const budget = 56;                                    // 线要根根分明，太多会糊成一片
  const shares = secs.map((s) => Math.max(4, Math.round((budget * s.count) / total)));
  const sum = shares.reduce((a, b) => a + b, 0);
  const hx = W / 2, hy = H * 0.55, x0 = W * 0.05, x1 = W * 0.95;
  const top = H * 0.1, bottom = H * 0.95, gap = H * 0.035;
  const span = bottom - top - gap * (secs.length - 1);
  const bez = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

  const list = [];
  let yCursor = top;
  secs.forEach((s, si) => {
    const band = (span * shares[si]) / sum;
    for (let j = 0; j < shares[si]; j++) {
      const y = yCursor + (band * (j + 0.5)) / shares[si];
      list.push(strand((t) => {
        const half = t < 0.5, k = half ? t * 2 : (t - 0.5) * 2;
        return half
          ? [bez(x0, W * 0.3, W * 0.42, hx, k), bez(y, y, hy, hy, k)]
          : [bez(hx, W * 0.58, W * 0.7, x1, k), bez(hy, hy, y, y, k)];
      }, { a: 0.75, dot: 1.8, label: `${s.name} · ${s.count} 篇 · 点击进入`, href: `/${s.slug}/`, group: s.slug }));
    }
    yCursor += band + gap;
  });
  const focus = { x: hx, y: hy };
  return { strands: fill(list, focus), focus,
    note: `${secs.length} 个板块的文章从左侧汇入同一个站点 · 线束粗细是篇数 · 悬停看板块，点击进入` };
}

export const FORMS = { burst, timeline, globe, hub };

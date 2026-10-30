// 环境音开关（stage 文章与全站共用）。默认关闭，读者点了才响；用 Web Audio 实时合成，不下载任何音频文件。
// 声音：两路低频正弦（A1 / E2，一个五度）经过缓慢起伏的低通，叠一层很轻的「棚内空气声」（带通噪声），
// 每 8 秒一声极轻的高音提示，像录制中的 REC。选择存在 localStorage。
// 浏览器只允许在用户交互之后出声：记住了「开」的读者，在新页面上第一次点击 / 按键时才开始播放。

const KEY = "sound";
const VOLUME = 0.16;
const TICK_MS = 8000;

let ctx = null, master = null, tickTimer = null;
let wanted = false;   // 读者的选择
let playing = false;  // 是否真的在出声

function store(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* 无法存储：只在本页生效 */ }
}

function stored() {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}

function noiseBuffer(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** 搭好整张音频图，master 增益从 0 开始；只在用户交互里调用。 */
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const low = ctx.createBiquadFilter();
  low.type = "lowpass"; low.frequency.value = 420; low.Q.value = 0.7;
  low.connect(master);
  const lfo = ctx.createOscillator(), lfoDepth = ctx.createGain();
  lfo.frequency.value = 0.05; lfoDepth.gain.value = 180;     // 20 秒一个周期的明暗起伏
  lfo.connect(lfoDepth).connect(low.frequency);
  lfo.start();

  for (const [freq, type, level] of [[55, "sine", 0.5], [82.41, "sine", 0.3], [110.3, "triangle", 0.07]]) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq; g.gain.value = level;
    osc.connect(g).connect(low);
    osc.start();
  }

  const air = ctx.createBufferSource(), band = ctx.createBiquadFilter(), airGain = ctx.createGain();
  air.buffer = noiseBuffer(ctx); air.loop = true;
  band.type = "bandpass"; band.frequency.value = 1200; band.Q.value = 0.6;
  airGain.gain.value = 0.05;
  air.connect(band).connect(airGain).connect(master);
  air.start();
}

function tick() {
  if (!playing) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.frequency.value = 1760;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(g).connect(master);
  osc.start(t); osc.stop(t + 0.4);
}

async function start() {
  if (playing) return;
  if (!ctx) build();
  await ctx.resume();
  playing = true;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.8);   // 约 2 秒淡入
  clearInterval(tickTimer); tickTimer = setInterval(tick, TICK_MS);
}

function stop() {
  playing = false;
  clearInterval(tickTimer);
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  setTimeout(() => { if (!playing) ctx.suspend(); }, 800);
}

function sync(btn) {
  btn.setAttribute("aria-pressed", String(wanted));
  btn.setAttribute("aria-label", wanted ? "关闭环境音" : "打开环境音");
  btn.classList.toggle("is-waiting", wanted && !playing);
}

export function initSound() {
  const btn = document.querySelector(".sound-btn");
  if (!btn) return;
  if (!(window.AudioContext || window.webkitAudioContext)) { btn.hidden = true; return; }

  btn.addEventListener("click", async () => {
    wanted = !wanted;
    store(wanted);
    if (wanted) await start(); else stop();
    sync(btn);
  });

  // 记住了「开」：等读者在页面上第一次交互再出声（点按钮本身算作「关掉」，由上面的 click 处理）
  wanted = stored();
  if (wanted) {
    const kick = async (e) => {
      if (e.target instanceof Element && e.target.closest(".sound-btn")) return;
      ["pointerdown", "keydown"].forEach((t) => removeEventListener(t, kick, true));
      if (wanted) { await start(); sync(btn); }
    };
    ["pointerdown", "keydown"].forEach((t) => addEventListener(t, kick, true));
  }

  // 切到别的标签页时暂停，回来再继续
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !playing) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  sync(btn);
}

// 四足怪物的正向运动学（FK）：用关节角度生成 3D 关节位置，再投影到正面 / 侧面两个画面。
// 坐标：x 左右（+ 为近侧，靠近侧面相机），y 向上，z 向前（头的方向），单位米。

const deg = (d) => (d * Math.PI) / 180;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// 每个关节的活动范围（度）。随机姿势只在范围内取值——「只弯到真实关节能弯的程度」。
export const LIMITS = {
  hip: [-40, 40],      // 大腿相对竖直方向前后摆
  knee: [0, 85],       // 膝 / 踝只朝一个方向弯
  spine: [-10, 12],
  neck: [-25, 45],
  tail: [-35, 40],
  yaw: [-180, 180],    // 整只怪物转身
};

const LEGS = [
  { id: "FL", x: 0.27, z: 0.55, front: true },
  { id: "FR", x: -0.27, z: 0.55, front: true },
  { id: "HL", x: 0.29, z: -0.55, front: false },
  { id: "HR", x: -0.29, z: -0.55, front: false },
];
const UPPER = 0.42, LOWER = 0.44;

/** 随机姿势：每个角度都在 LIMITS 内。fast 表示这一帧是快速动作（需要运动模糊）。 */
export function randomAngles() {
  const legs = Object.fromEntries(LEGS.map((L) => [L.id, { hip: rand(...LIMITS.hip), knee: rand(...LIMITS.knee) }]));
  return {
    legs, spine: rand(...LIMITS.spine), neck: rand(...LIMITS.neck), tail: rand(...LIMITS.tail),
    yaw: rand(...LIMITS.yaw), fast: Math.random() < 0.5,
  };
}

/** 角度 → 关节位置列表 {name, x, y, z, limb}，limb 用于判断哪些部位在快速运动。 */
export function forwardKinematics(a) {
  const lift = Math.sin(deg(a.spine)) * 0.12;
  const hip = { x: 0, y: 1.0, z: -0.55 }, shld = { x: 0, y: 1.06 + lift, z: 0.55 };
  const mid = { x: 0, y: 1.05 + lift, z: 0 };
  const nk = deg(a.neck);
  const head = { x: 0, y: shld.y + Math.sin(nk) * 0.42, z: shld.z + Math.cos(nk) * 0.42 };
  const tl = deg(a.tail);
  const tail1 = { x: 0, y: hip.y + Math.sin(tl) * 0.3, z: hip.z - Math.cos(tl) * 0.3 };
  const tail2 = { x: 0, y: tail1.y + Math.sin(tl * 1.4) * 0.28, z: tail1.z - Math.cos(tl * 1.4) * 0.28 };

  const joints = [
    { name: "HEAD", ...head, limb: "head" }, { name: "SHLD", ...shld, limb: "body" },
    { name: "SPINE", ...mid, limb: "body" }, { name: "HIP", ...hip, limb: "body" },
    { name: "TAIL_1", ...tail1, limb: "tail" }, { name: "TAIL_2", ...tail2, limb: "tail" },
  ];
  const bones = [["HEAD", "SHLD"], ["SHLD", "SPINE"], ["SPINE", "HIP"], ["HIP", "TAIL_1"], ["TAIL_1", "TAIL_2"]];

  for (const L of LEGS) {
    const { hip: h, knee: k } = a.legs[L.id];
    const root = { x: L.x, y: (L.front ? shld.y : hip.y) - 0.06, z: L.z };
    const t1 = deg(h), t2 = deg(h + (L.front ? -k : k));   // 前腿膝向后弯，后腿踝向前弯
    const knee = { x: L.x, y: root.y - Math.cos(t1) * UPPER, z: root.z + Math.sin(t1) * UPPER };
    const foot = { x: L.x, y: knee.y - Math.cos(t2) * LOWER, z: knee.z + Math.sin(t2) * LOWER };
    joints.push({ name: `${L.id}_ROOT`, ...root, limb: L.id }, { name: `${L.id}_KNEE`, ...knee, limb: L.id },
      { name: `${L.id}_FOOT`, ...foot, limb: L.id });
    bones.push([L.front ? "SHLD" : "HIP", `${L.id}_ROOT`], [`${L.id}_ROOT`, `${L.id}_KNEE`], [`${L.id}_KNEE`, `${L.id}_FOOT`]);
  }

  // 落地：把最低点放到地面
  const minY = Math.min(...joints.map((j) => j.y));
  const yaw = deg(a.yaw), c = Math.cos(yaw), s = Math.sin(yaw);
  const placed = joints.map((j) => ({ ...j, y: j.y - minY, x: j.x * c + j.z * s, z: -j.x * s + j.z * c }));
  return { joints: placed, bones };
}

/** 正交投影：front 画面看到 (x, y)，side 画面看到 (z, y)。 */
export const project = (j, view) => (view === "front" ? { u: j.x, v: j.y } : { u: -j.z, v: j.y });

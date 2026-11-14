// research/NEW_GUNS.md §3(第4版): 衛星弾(shotgun-t2-satellite)。
// 動いている間(移動の入力がある時)、350msごとに1つ増えて自分の周り(半径64)を回る。最大8個。
// 回る速さは毎秒1周から、溜まるほど速くなり最大で毎秒1.6周。回っている弾も触れた敵に当たる
// (5・敵ごとに400msに1回・弾は消えない)。移動の入力が無くなって0.15秒で全部を放つ:
// 外向きに飛び出し、すぐ近い敵へ散って向かう(ゆるい誘導・秒速380・射程200・1発6・銃の扱い・会心あり)。
// 「動いている」に押されて動いている間・近接を振っている間は数えない。弾倉・リロードは無い。
//
// このモジュールは**純関数と定数だけ**(storeを読まない)。弾の放出(Projectile生成)・ダメージの
// 適用は呼び手(utils/newGunsTick.ts)。
export const SATELLITE_WEAPON_KEY = 'shotgun-t2-satellite';
export const SAT_ADD_MS = 350;
export const SAT_MAX = 8;
export const SAT_ORBIT_RADIUS_PX = 64;
/**
 * 軌道は地面に倒した楕円(社長承認2026-10-18): 横の半径 64 のまま、縦は扇・印と同じ 0.36 倍。
 * 根元はプレイヤーの足元(扇と同じ)。絵と当たり判定はどちらも satelliteOrbitPoint で位置を作る。
 */
export const SAT_ORBIT_Y_SCALE = 0.36; // = scanSensor.SCAN_FAN_GROUND_Y_SCALE(テストで同値を固定。import すると敵の表まで引き込むので値で持つ)

/** 軌道の角度 a・半径 r の点(画面=世界px)。描画の玉・尾も判定の玉もこれで置く。 */
export const satelliteOrbitPoint = (cx: number, cy: number, a: number, r: number): { x: number; y: number } => ({
  x: cx + Math.cos(a) * r,
  y: cy + Math.sin(a) * r * SAT_ORBIT_Y_SCALE,
});
export const SAT_REV_PER_SEC_MIN = 1;
export const SAT_REV_PER_SEC_MAX = 1.6;
export const SAT_RELEASE_IDLE_MS = 150;
export const SAT_CONTACT_DAMAGE = 5;
export const SAT_CONTACT_CD_MS = 400;
export const SAT_SHOT_DAMAGE = 6;
export const SAT_SHOT_SPEED_PX_PER_SEC = 380;
export const SAT_SHOT_RANGE_PX = 200;
/** 放った弾の寿命(射程÷弾速)。 */
export const SAT_SHOT_DURATION_MS = Math.round((SAT_SHOT_RANGE_PX / SAT_SHOT_SPEED_PX_PER_SEC) * 1000);
// ── 以下は設計書に数値の無い、見た目と判定の細部(未決として報告済みの仮の値) ──
/** 回っている弾の当たりの半径(px)。弾の絵の半径と同じ。 */
export const SAT_BULLET_RADIUS_PX = 8;
/** 放った弾の誘導の旋回半径(px)。誘導散弾(40px)よりゆるい。 */
export const SAT_SHOT_TURN_RADIUS_PX = 70;
/** 回る速さが目標へ寄る時定数(ms)。溜まって速くなる/回り始めに加速が付く(慣性)。 */
export const SAT_SPIN_TAU_MS = 260;
/** 新しい弾が軌道へ出る時間(ms)。中心から減速しながら半径64へ出る。 */
export const SAT_SPAWN_EASE_MS = 220;
/** 並びが詰め直る時定数(ms)。1つ増えた時に等間隔へ滑らかに並び直す(瞬間移動しない)。 */
export const SAT_SPACING_TAU_MS = 160;

export interface SatelliteSlot {
  /** 等間隔に並ぶための位相の遅れ(rad)。目標は i×2π/n。 */
  phase: number;
  /** 出た gameTime(出現の慣性)。 */
  bornAt: number;
}

export interface SatelliteOrbit {
  slots: SatelliteSlot[];
  /** 全体の回転角(rad)。 */
  angle: number;
  /** 今の角速度(rad/s)。目標へ時定数で寄る。 */
  angVel: number;
  /** 次の1つまでに溜まった「動いている」時間(ms)。 */
  accumMs: number;
  /** 移動の入力が無くなってからの時間(ms)。 */
  idleMs: number;
}

export const emptySatelliteOrbit = (): SatelliteOrbit => ({ slots: [], angle: 0, angVel: 0, accumMs: 0, idleMs: 0 });

/** 溜まっている数ごとの目標の回る速さ(周/秒)。1個=毎秒1周、8個=毎秒1.6周(線形)。 */
export const satelliteTargetRevPerSec = (count: number): number => {
  if (count <= 0) return 0;
  const f = SAT_MAX > 1 ? (Math.min(SAT_MAX, count) - 1) / (SAT_MAX - 1) : 1;
  return SAT_REV_PER_SEC_MIN + (SAT_REV_PER_SEC_MAX - SAT_REV_PER_SEC_MIN) * f;
};

export interface SatelliteInput {
  /** 移動の入力がある(押されて動いている間・近接を振っている間は呼び手が false にする)。 */
  moving: boolean;
  /** 移動の入力はあるが「動いている」と数えない状態(押されている/振っている)。放出の時計も進めない。 */
  held: boolean;
  /** 撃てない状態(刀・攻撃封印等)。溜めも放出もしない(回転だけ続ける)。 */
  locked: boolean;
}

export interface SatelliteStepResult {
  orbit: SatelliteOrbit;
  /** この step で放つ(呼び手が今の位置から弾を作る。orbit は空になって返る)。 */
  release: SatelliteBulletPose[] | null;
}

export interface SatelliteBulletPose {
  x: number; y: number;
  /** 回っている向き(接線・単位)。放つ時の速度の持ち越しに使う。 */
  tx: number; ty: number;
  /** 外向き(単位・根元から玉への向き)。 */
  rx: number; ry: number;
  /** 軌道の角度(rad)。 */
  angle: number;
  /** 角度1radあたりに玉が進む距離÷半径(真円なら1。楕円では上下で速く、左右で遅い)。接線の勢いに掛ける。 */
  tk: number;
}

const slotRadius = (s: SatelliteSlot, gameTime: number): number => {
  const t = Math.max(0, Math.min(1, (gameTime - s.bornAt) / SAT_SPAWN_EASE_MS));
  return SAT_ORBIT_RADIUS_PX * (1 - Math.pow(1 - t, 3));
};

/** 今の弾の位置(世界px)。 */
export const satelliteBulletPoses = (
  orbit: SatelliteOrbit, cx: number, cy: number, gameTime: number,
): SatelliteBulletPose[] => {
  const n = orbit.slots.length;
  const out: SatelliteBulletPose[] = [];
  const dir = orbit.angVel >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const s = orbit.slots[i];
    const a = orbit.angle + s.phase;
    const r = slotRadius(s, gameTime);
    const q = satelliteOrbitPoint(cx, cy, a, r);
    // 外向き=根元から玉への向き(楕円の上の今の位置)。接線=楕円の位置を角度で微分した向き。
    const ox = Math.cos(a), oy = Math.sin(a) * SAT_ORBIT_Y_SCALE;
    const ol = Math.hypot(ox, oy) || 1;
    const tx0 = -Math.sin(a), ty0 = Math.cos(a) * SAT_ORBIT_Y_SCALE;
    const tl = Math.hypot(tx0, ty0) || 1;
    out.push({ x: q.x, y: q.y, rx: ox / ol, ry: oy / ol, tx: (tx0 / tl) * dir, ty: (ty0 / tl) * dir, angle: a, tk: tl });
  }
  return out;
};

/** 1 step(dtMs)。 */
export const stepSatelliteOrbit = (
  orbit: SatelliteOrbit, dtMs: number, input: SatelliteInput, gameTime: number,
  cx: number, cy: number,
): SatelliteStepResult => {
  const dt = Math.max(0, dtMs);
  let slots = orbit.slots;
  let accumMs = orbit.accumMs;
  let idleMs = orbit.idleMs;
  let release: SatelliteBulletPose[] | null = null;
  if (!input.locked) {
    if (input.moving) {
      idleMs = 0;
      if (slots.length < SAT_MAX) {
        accumMs += dt;
        while (accumMs >= SAT_ADD_MS && slots.length < SAT_MAX) {
          accumMs -= SAT_ADD_MS;
          // 新しい弾は「今いちばん後ろ」に足す=既存の弾の位相はそのまま、並びは下で等間隔へ寄る。
          const lastPhase = slots.length > 0 ? slots[slots.length - 1].phase : 0;
          slots = [...slots, { phase: lastPhase, bornAt: gameTime }];
        }
        if (slots.length >= SAT_MAX) accumMs = 0;
      }
    } else if (!input.held) {
      idleMs += dt;
      accumMs = 0;
      if (slots.length > 0 && idleMs >= SAT_RELEASE_IDLE_MS) {
        release = satelliteBulletPoses({ ...orbit, slots }, cx, cy, gameTime);
        slots = [];
      }
    }
  }
  // 並びを等間隔へ寄せる(時定数)。
  const n = slots.length;
  if (n > 0) {
    const k = 1 - Math.exp(-dt / SAT_SPACING_TAU_MS);
    slots = slots.map((s, i) => {
      const target = (i * Math.PI * 2) / n;
      return { ...s, phase: s.phase + (target - s.phase) * k };
    });
  }
  // 回る速さ: 目標(周/秒)へ時定数で寄る=回り始めは加速、溜まると速くなる、空になると減速して止まる。
  const targetW = satelliteTargetRevPerSec(n) * Math.PI * 2;
  const kw = 1 - Math.exp(-dt / SAT_SPIN_TAU_MS);
  const angVel = orbit.angVel + (targetW - orbit.angVel) * kw;
  const angle = (orbit.angle + angVel * (dt / 1000)) % (Math.PI * 2);
  return { orbit: { slots, angle, angVel, accumMs, idleMs }, release };
};

/**
 * 放つ弾の初速の向き: 外向きに、回っていた勢い(接線)を少し持ち越す(速度の持ち越し=慣性)。
 * 持ち越しの割合は回る速さに比例(速く回っていたほど横へ流れて出る)。
 */
export const satelliteReleaseDir = (pose: SatelliteBulletPose, angVelRadPerSec: number): { x: number; y: number } => {
  const tangential = Math.abs(angVelRadPerSec) * SAT_ORBIT_RADIUS_PX * pose.tk; // px/s(楕円の上のその位置での速さ)
  const carry = Math.min(0.9, (tangential / SAT_SHOT_SPEED_PX_PER_SEC) * 0.5);
  const x = pose.rx + pose.tx * carry, y = pose.ry + pose.ty * carry;
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/** 回っている弾(円)と矩形が触れているか。 */
export const satelliteTouchesRect = (
  bx: number, by: number, e: { x: number; y: number; width: number; height: number },
): boolean => {
  const qx = Math.max(e.x, Math.min(bx, e.x + e.width));
  const qy = Math.max(e.y, Math.min(by, e.y + e.height));
  const dx = bx - qx, dy = by - qy;
  return dx * dx + dy * dy < SAT_BULLET_RADIUS_PX * SAT_BULLET_RADIUS_PX;
};

/** 敵ごとの当たりの間隔(400ms)を満たしているか。 */
export const satelliteContactReady = (lastHitAt: number | undefined, gameTime: number): boolean =>
  lastHitAt === undefined || gameTime - lastHitAt >= SAT_CONTACT_CD_MS || gameTime < lastHitAt;

/** 放った弾の旋回速度(rad/s)= 弾速÷旋回半径。 */
export const satelliteShotTurnRate = (): number => SAT_SHOT_SPEED_PX_PER_SEC / SAT_SHOT_TURN_RADIUS_PX;

/**
 * 放つ弾を近い敵へ「散って」割り振る。弾は外向きの角度(rad)、敵はプレイヤーから見た方位(rad)。
 * 1体あたりの上限を ceil(弾の数÷敵の数) にして(=全弾が1体に寄らない)、その中で「向きの近い組」から順に
 * 割り当てる(=自分の向きに近い敵へ飛ぶ)。敵が居なければ全部 undefined(=誘導なしでまっすぐ飛ぶ)。
 */
export const assignSatelliteTargets = (
  bulletAnglesRad: readonly number[], targets: readonly { id: string; azimuthRad: number }[],
): (string | undefined)[] => {
  const out: (string | undefined)[] = new Array(bulletAnglesRad.length).fill(undefined);
  if (targets.length === 0) return out;
  const cap = Math.ceil(bulletAnglesRad.length / targets.length);
  const angDiff = (a: number, b: number): number => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  };
  const pairs: { i: number; t: number; d: number }[] = [];
  bulletAnglesRad.forEach((a, i) => targets.forEach((tg, t) => pairs.push({ i, t, d: angDiff(a, tg.azimuthRad) })));
  pairs.sort((x, y) => x.d - y.d || x.i - y.i || x.t - y.t);
  const used = new Array(targets.length).fill(0);
  for (const pr of pairs) {
    if (out[pr.i] !== undefined || used[pr.t] >= cap) continue;
    out[pr.i] = targets[pr.t].id;
    used[pr.t]++;
  }
  return out;
};

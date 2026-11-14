// 火炎放射器の炎の粒(絵だけ・判定ゼロ)。筒先から細い噴流で飛び出し、減速しながら膨らんで橙→赤の塊になり、
// 最後は火の粉にちぎれる/煤になって昇って消える。
// 粒の番号(スロット)と「生まれた回」から向き・届く先・揺らぎが決まる=乱数を毎フレーム引かない(同じ時刻なら同じ絵)。
// 粒は「生まれた時の持ち主の位置と向き」で世界座標を飛ぶ(歩いても振り向いても、飛んでいる粒は置いていかれる=慣性)。
// 扇の寸法は判定と同じ(FLAMER_RANGE_PX / FLAMER_HALF_ANGLE_RAD)。塊・中・噴流は生まれた時の扇と射程の中に必ず収まる
// (押し戻しではなく、生まれる時点で「上昇と蛇行を足しても収まる」向きと届く先を選ぶ)。先端の火の粉だけ射程の+15%まで流れる
// (判定の無い派手さの絵)。純関数のみ(PixiJS を import しない)。描画は pixiScene.drawFlamerStreaks。
import { FLAMER_RANGE_PX, FLAMER_HALF_ANGLE_RAD, FLAMER_PULSE_MS } from './flamerCone';

/** 絵の大きさ: 0=火の粉(1〜2ドット) / 1=小(3ドット・噴流とちぎれ) / 2=中(5ドット) / 3=塊(7ドット)。 */
export type FlamerSpraySize = 0 | 1 | 2 | 3;
/** 色の段: 0=白〜淡い黄の噴流 / 1=橙(塊の中に白1〜2ドット) / 2=赤橙 / 3=暗い赤の燃えかす / 4=煤。 */
export type FlamerSprayStage = 0 | 1 | 2 | 3 | 4;
/** 粒の役割: 'blob'=膨らんで塊になる / 'mid'=中まで / 'spark'=火の粉のまま遠くへ / 'tip'=射程の外まで流れる火の粉。 */
export type FlamerSprayRole = 'blob' | 'mid' | 'spark' | 'tip';

export const FLAMER_SPRAY_BLOB = 18;
export const FLAMER_SPRAY_MID = 18;
export const FLAMER_SPRAY_SPARK = 19;
export const FLAMER_SPRAY_TIP = 5;
export const FLAMER_SPRAY_SLOTS = FLAMER_SPRAY_BLOB + FLAMER_SPRAY_MID + FLAMER_SPRAY_SPARK + FLAMER_SPRAY_TIP;
/** 絵の出口=銃の筒先(持ち主の中心から前へ)。判定の扇の原点(中心)は変えない。 */
export const FLAMER_MUZZLE_PX = 16;
/** 寿命(ms)の幅。粒ごとに違う。 */
export const FLAMER_SPRAY_LIFE_MIN_MS = 250;
export const FLAMER_SPRAY_LIFE_MAX_MS = 450;
/** 先端の火の粉が流れてよい距離(射程に対する倍率)。 */
export const FLAMER_TIP_RANGE_MUL = 1.15;

/** 噴射が途切れた後、新しい粒を止める時刻(=旧実装の減衰開始しきい値と同じ。最後のパルス+2パルス)。 */
export const flamerSprayStopAt = (lastPulseAt: number): number => lastPulseAt + FLAMER_PULSE_MS * 2;

/** 寿命の割合 u(0..1)→ 届く先までの進んだ割合(勢いよく出て減速する・k>1)。 */
export const flamerSprayTravel = (u: number, k = 2.4): number => {
  const c = Math.max(0, Math.min(1, u));
  return 1 - Math.pow(1 - c, k);
};

const hash01 = (a: number, b: number, c: number): number => {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export const flamerSprayRole = (i: number): FlamerSprayRole =>
  i < FLAMER_SPRAY_BLOB ? 'blob'
    : i < FLAMER_SPRAY_BLOB + FLAMER_SPRAY_MID ? 'mid'
      : i < FLAMER_SPRAY_BLOB + FLAMER_SPRAY_MID + FLAMER_SPRAY_SPARK ? 'spark' : 'tip';

/** スロットの寿命(ms・スロットごとに固定=生まれる周期)。塊ほど長め。 */
export const flamerSprayLifeMs = (i: number): number => {
  const role = flamerSprayRole(i);
  const r = hash01(i, 0, 1);
  const [lo, hi] = role === 'blob' ? [330, FLAMER_SPRAY_LIFE_MAX_MS] : role === 'mid' ? [290, 420] : [FLAMER_SPRAY_LIFE_MIN_MS, 380];
  return lo + (hi - lo) * r;
};

/** i 番目の粒が今どの回に生まれ、寿命のどこに居るか。見えない時は null。 */
export interface FlamerSprayBirth { n: number; birth: number; u: number }
export const flamerSprayBirth = (i: number, gameTime: number, sprayStartAt: number, lastPulseAt: number): FlamerSprayBirth | null => {
  if (!Number.isFinite(sprayStartAt) || !Number.isFinite(lastPulseAt)) return null;
  const life = flamerSprayLifeMs(i);
  // 噴き始めの群れ: 最初の回は 0〜0.6寿命 のあいだにばらけて出る。
  const offset = hash01(i, 0, 2) * life * 0.6;
  const latest = Math.min(gameTime, flamerSprayStopAt(lastPulseAt)) - sprayStartAt - offset;
  if (latest < 0) return null;
  const n = Math.floor(latest / life);
  const birth = sprayStartAt + offset + n * life;
  const age = gameTime - birth;
  if (age < 0 || age >= life) return null;
  return { n, birth, u: age / life };
};

/** 生まれた時の持ち主(中心=判定の扇の原点)と向き。 */
export interface FlamerSprayOrigin { x: number; y: number; dirX: number; dirY: number }

export interface FlamerSprayParticle {
  /** 世界座標。 */
  x: number;
  y: number;
  size: FlamerSpraySize;
  stage: FlamerSprayStage;
  /** 加算合成で描くか(噴流の白い芯と火の粉だけ)。塊・中・燃えかす・煤は通常合成。 */
  add: boolean;
  alpha: number;
  /** 絵の種類(0..3)。 */
  variant: number;
  role: FlamerSprayRole;
  u: number;
}

/**
 * 生まれた回 n・寿命の割合 u の粒の姿。origin=生まれた時の持ち主の中心と向き。
 * 位置 = 筒先 + 向き a へ reach×travel(u) + 横の蛇行(W×sin×travel) + 上昇(Rise×u²)。
 * 収まりの保証: travel≥u≥u² なので、どの u でも「横 ≤ travel×(reach|sin a|+W+Rise|dirX|)」
 * 「前 ≥ 筒先 + travel×(reach cos a − Rise×max(0,dirY))」。この2つが扇の比に収まる a と、
 * 筒先+reach+W+Rise ≤ 射程 となる reach を生まれる時点で選ぶ。
 */
export const flamerSprayParticleAt = (i: number, n: number, u: number, o: FlamerSprayOrigin): FlamerSprayParticle | null => {
  const role = flamerSprayRole(i);
  const h = (k: number) => hash01(i, n, k);
  const dl = Math.hypot(o.dirX, o.dirY) || 1;
  const dx = o.dirX / dl, dy = o.dirY / dl;
  const soot = (role === 'blob' || role === 'mid') && h(9) < 0.3;
  // 揺らぎ(粒ごと): 横の蛇行 3〜8px / 上へ流れる 6〜22px(煤は強め) / 減速の指数 2.0〜3.2。
  let W = 3 + 5 * h(3);
  let rise = (6 + 16 * h(4)) * (soot ? 1.5 : 1);
  const k = 2.0 + 1.2 * h(5);
  const limit = (role === 'tip' ? FLAMER_TIP_RANGE_MUL : 1) * FLAMER_RANGE_PX;
  const free = Math.max(4, limit - FLAMER_MUZZLE_PX - W - rise);
  // 届く先(筒先からの距離・free に対する割合)。先端は広く散らしてぎざぎざに終わらせる。
  const [rLo, rHi] = role === 'blob' ? [0.55, 0.95] : role === 'mid' ? [0.45, 0.9] : role === 'spark' ? [0.75, 1.0] : [0.85, 1.0];
  const reach = free * (rLo + (rHi - rLo) * h(6));
  const tanH = Math.tan(FLAMER_HALF_ANGLE_RAD), cosH = Math.cos(FLAMER_HALF_ANGLE_RAD);
  const A = tanH * reach * cosH;
  const B = tanH * rise * Math.max(0, dy) + W + rise * Math.abs(dx);
  // 揺らぎで角度の自由がほぼ無くなる時は、揺らぎを縮めて扇の幅の4割ぶんの散らばりを残す。
  if (A - B < 0.4 * A) { const s = (0.6 * A) / Math.max(1e-6, B); W *= s; rise *= s; }
  const slack = A - (tanH * rise * Math.max(0, dy) + W + rise * Math.abs(dx));
  const aMax = Math.asin(Math.max(0, Math.min(Math.sin(FLAMER_HALF_ANGLE_RAD), slack / reach)));
  const spread = role === 'blob' ? 0.7 : 1;
  const aOff = (h(7) * 2 - 1) * aMax * spread;
  const base = Math.atan2(dy, dx);
  const a = base + aOff;
  const tr = flamerSprayTravel(u, k);
  const wig = W * Math.sin(h(8) * Math.PI * 2 + u * Math.PI * 2 * (0.6 + 0.8 * h(10))) * tr;
  const px = dx * FLAMER_MUZZLE_PX + Math.cos(a) * reach * tr - dy * wig;
  const py = dy * FLAMER_MUZZLE_PX + Math.sin(a) * reach * tr + dx * wig - rise * u * u;

  // 大きさ・段・合成(寿命の割合で進む)。序盤は細い噴流→中→塊へ膨らむ→ちぎれる/煤。
  let size: FlamerSpraySize, stage: FlamerSprayStage, add: boolean, alpha = 1;
  const j = (h(11) - 0.5) * 0.08; // しきい値の粒ごとのずれ
  if (role === 'blob' || role === 'mid') {
    const big = role === 'blob';
    if (u < 0.22 + j) { size = 1; stage = 0; add = true; alpha = Math.min(1, u / 0.05); }
    else if (u < (big ? 0.45 : 0.55) + j) { size = 2; stage = 1; add = false; }
    else if (big && u < 0.62 + j) { size = 3; stage = 1; add = false; }
    else if (u < (big ? 0.8 : 0.78) + j) { size = big ? 3 : 2; stage = 2; add = false; }
    else if (u < 0.9 + j) { size = big ? 2 : 1; stage = 3; add = false; }
    else {
      const t = (u - 0.9 - j) / Math.max(0.01, 0.1 - j);
      if (soot) { size = big ? 2 : 1; stage = 4; add = false; alpha = 0.6 * (1 - t * t); }
      else { size = 0; stage = 2; add = true; alpha = 1 - t * t; }
    }
  } else {
    size = u < 0.35 ? 1 : 0;
    stage = u < 0.3 ? 0 : u < 0.65 ? 1 : 2;
    add = true;
    const outT = Math.max(0, (u - 0.6) / 0.4);
    alpha = Math.min(1, u / 0.05) * (1 - outT * outT);
  }
  if (alpha <= 0.001) return null;
  return { x: o.x + px, y: o.y + py, size, stage, add, alpha, variant: Math.floor(h(12) * 4), role, u };
};

/** 1本で引く版: origin(birth) は生まれた時刻の持ち主の姿を返す(描画側の履歴)。 */
export const flamerSprayParticle = (
  i: number, gameTime: number, sprayStartAt: number, lastPulseAt: number, originAt: (birth: number) => FlamerSprayOrigin,
): FlamerSprayParticle | null => {
  const b = flamerSprayBirth(i, gameTime, sprayStartAt, lastPulseAt);
  return b ? flamerSprayParticleAt(i, b.n, b.u, originAt(b.birth)) : null;
};

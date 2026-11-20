// ★鞭の普通の振りの見た目(社長 2026-11-20「鞭はちゃんと鞭っぽくしならせてから叩きつける感じに」「そのためにまっすぐの絵にしてあるので」
//   「悪魔城ドラキュラとか参考にして」「鞭振るときのプレイヤーの動きはナイフの逆で、振り上げから しゃがみ へ」)。
// 判定(前隙 MELEE_WINDUP_MS の後に解く・帯の長さ/幅・ダメージ)は何も変えない=ここは絵の形だけを決める純関数(store にも描画にも依存しない)。
//  - 鞭(まっすぐの絵をロープで曲げる): ①引く=体の後ろへ持ち上げる(頭の上を通る) ②溜め=後ろで少し垂れて止まる
//    ③打ち出し=手元から先端へほどけて加速 ④パチン=前隙の終わり(=当たる瞬間)にまっすぐ伸び切って一拍止まる ⑤戻り=たるんで縮み消える。
//  - 体: ナイフ(しゃがみ→立ち上がって振る)の逆=振り上げ(伸び上がり・後ろへ反る)→パチンの瞬間にしゃがみの底。
// 数値は叩き台(実機で詰める)。

/** パチンの後、まっすぐ伸び切って止まる長さ(ms)。 */
export const WHIP_ROPE_CRACK_HOLD_MS = 90;
/** 戻り(たるんで縮み消える)の長さ(ms)。 */
export const WHIP_ROPE_RETRACT_MS = 200;
/** 鞭のロープの点の数(手元の柄を含む)。 */
export const WHIP_ROPE_POINTS = 16;
/** 前隙の中の区切り(割合): 引き終わり・溜め終わり(=打ち出しの始まり)。 */
export const WHIP_ROPE_PULL_END = 0.35;
export const WHIP_ROPE_HOLD_END = 0.6;

/** ロープ全体の長さ(ms)。 */
export const whipRopeTotalMs = (windupMs: number): number => windupMs + WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 手元からの割合 u(0..1)の所の向き(rad・振りの向き=0・+は「下」側)。止まっている時の垂れ・後ろへ引いた形。 */
const restAngle = (u: number): number => 0.5 + 0.6 * u;                       // 前へ下がって垂れている
const backAngle = (u: number): number => -(Math.PI - 0.45) - 1.0 * u ** 1.4;  // 体の後ろ・手元は少し上、先へ行くほど垂れる

export interface WhipRopeShape {
  /** 手元(柄の握り)の位置のずれ(px・振りの向きの座標=x 前・y 下)。 */
  handX: number; handY: number;
  /** 手元から先端までの各点の向き(rad・振りの向き=0)。長さ WHIP_ROPE_POINTS-1(区間ごと)。 */
  angles: number[];
  /** 長さの掛け(1=射程ちょうど)。 */
  lenK: number;
  /** 濃さ(0..1)。 */
  alpha: number;
  /** どの段か(撮影・テスト用)。 */
  phase: 'pull' | 'hold' | 'lash' | 'crack' | 'retract' | 'done';
}

/**
 * 経過 el(ms・指を離した瞬間から)の鞭の形。windupMs=前隙(=パチンの時刻=判定の時刻)。
 * 前隙の終わり(el=windupMs)で必ずまっすぐ(全区間の向き0・長さ1・手元のずれ0)=判定の帯と鞭の本体と赤いしなりの伸び切りが重なる。
 */
export const whipRopeShape = (el: number, windupMs: number, segs = WHIP_ROPE_POINTS - 1): WhipRopeShape => {
  const W = Math.max(1, windupMs);
  const us = Array.from({ length: segs }, (_, i) => (i + 0.5) / segs);
  if (el >= whipRopeTotalMs(W)) return { handX: 0, handY: 0, angles: us.map(() => 0), lenK: 0.65, alpha: 0, phase: 'done' };
  if (el < W * WHIP_ROPE_PULL_END) {
    // ①引く: 前に垂れていた鞭を頭の上を通して体の後ろへ(減速して止まる)。手元も後ろ上へ。
    const p = easeOutCubic(clamp01(el / (W * WHIP_ROPE_PULL_END)));
    return { handX: -10 * p, handY: -12 * p, angles: us.map(u => restAngle(u) + (backAngle(u) - restAngle(u)) * p), lenK: 1, alpha: 1, phase: 'pull' };
  }
  if (el < W * WHIP_ROPE_HOLD_END) {
    // ②溜め: 後ろで垂れて止まる(先だけわずかに揺れる)。
    const h = (el - W * WHIP_ROPE_PULL_END) / (W * (WHIP_ROPE_HOLD_END - WHIP_ROPE_PULL_END));
    return { handX: -10, handY: -12, angles: us.map(u => backAngle(u) + 0.1 * u * u * Math.sin(h * Math.PI)), lenK: 1, alpha: 1, phase: 'hold' };
  }
  if (el < W) {
    // ③打ち出し: 加速しながら、手元から先端へほどけてまっすぐになる(先端が最後=パチン)。
    const q = clamp01((el - W * WHIP_ROPE_HOLD_END) / (W * (1 - WHIP_ROPE_HOLD_END)));
    const P = q * q;
    const hk = 1 - smooth(q);
    return {
      handX: -10 * hk, handY: -12 * hk,
      angles: us.map(u => {
        const qa = smooth(clamp01((P - 0.6 * u) / (1 - 0.6 * u)));
        return backAngle(u) * (1 - qa);
      }),
      lenK: 1, alpha: 1, phase: 'lash',
    };
  }
  if (el < W + WHIP_ROPE_CRACK_HOLD_MS) {
    // ④パチン: まっすぐ伸び切って止まる。先端だけ一瞬はじける(すぐ収まる)。
    const t = (el - W) / WHIP_ROPE_CRACK_HOLD_MS;
    const snap = 0.12 * (1 - t) * Math.sin(t * Math.PI * 3);
    return { handX: 0, handY: 0, angles: us.map(u => (el === W ? 0 : snap * u ** 3)), lenK: 1, alpha: 1, phase: 'crack' };
  }
  // ⑤戻り: たるんで(下へ垂れて)縮み、消える。
  const r = easeInOut(clamp01((el - W - WHIP_ROPE_CRACK_HOLD_MS) / WHIP_ROPE_RETRACT_MS));
  return { handX: 0, handY: 0, angles: us.map(u => r * (0.35 + 1.2 * u ** 1.5)), lenK: 1 - 0.35 * r, alpha: 1 - r ** 1.5, phase: 'retract' };
};

/**
 * 形 → 点の並び(振りの向きの座標・手元=原点+ずれ)。len=射程(px)。gripFrac=絵の左端から握りまでの割合(握りより手前の柄は手元の向きのまま後ろへ)。
 * 点は絵の左端(柄の端)から右端(先端)まで。全長 = len / (tipFrac - gripFrac)。
 */
export const whipRopePoints = (
  shape: WhipRopeShape, len: number, gripFrac: number, tipFrac: number,
): { x: number; y: number }[] => {
  const segs = shape.angles.length;
  const L = len * shape.lenK;
  const seg = L / segs;
  const total = L / Math.max(1e-6, tipFrac - gripFrac);
  const handle = total * gripFrac, tail = total * (1 - tipFrac);
  const a0 = shape.angles[0] ?? 0, aN = shape.angles[segs - 1] ?? 0;
  const pts: { x: number; y: number }[] = [{ x: shape.handX - Math.cos(a0) * handle, y: shape.handY - Math.sin(a0) * handle }];
  let x = shape.handX, y = shape.handY;
  pts.push({ x, y });
  for (const a of shape.angles) { x += Math.cos(a) * seg; y += Math.sin(a) * seg; pts.push({ x, y }); }
  pts.push({ x: x + Math.cos(aN) * tail, y: y + Math.sin(aN) * tail });
  return pts;
};

export interface WhipBodyPose {
  /** 体の絵: 'swing'=振り上げの絵 / 'ready'=しゃがみの絵 / null=差し替えない。 */
  pose: 'swing' | 'ready' | null;
  /** 横・縦の伸び縮み(1=そのまま)。 */
  sqX: number; sqY: number;
  /** 傾き(向き face を掛けて使う・+=前へ)。rad。 */
  lean: number;
}

/**
 * 体の動き(ナイフの逆=振り上げ→しゃがみ)。el=指を離してから(ms)。前隙の終わり(=パチン=当たる瞬間)がしゃがみの底。
 * 振り上げは伸び上がって後ろへ反る(減速して止まる)→打ち出しで加速して沈み、パチンで底→戻りは慣性つきで立ち姿へ。
 */
export const whipBodyPose = (el: number, windupMs: number, recoverMs = WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS): WhipBodyPose => {
  const W = Math.max(1, windupMs);
  if (el < 0 || el >= W + recoverMs) return { pose: null, sqX: 1, sqY: 1, lean: 0 };
  // 伸び上がり(up=1)としゃがみ(down=1)の量。
  let up = 0, down = 0;
  if (el < W * WHIP_ROPE_HOLD_END) up = easeOutCubic(clamp01(el / (W * WHIP_ROPE_PULL_END)));
  else if (el < W) {
    const q = clamp01((el - W * WHIP_ROPE_HOLD_END) / (W * (1 - WHIP_ROPE_HOLD_END)));
    const qq = q * q; // 加速して沈む
    up = 1 - qq; down = qq;
  } else down = 1 - easeOutCubic(clamp01((el - W) / recoverMs));
  return {
    pose: el < W ? 'swing' : 'ready',
    sqX: 1 - 0.07 * up + 0.12 * down,
    sqY: 1 + 0.12 * up - 0.18 * down,
    lean: -0.2 * up + 0.24 * down,
  };
};

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

// ---- ★鞭の絡め取り→振り回し→投げの見た目(research/WHIP_FOLLOWUP.md §8・見え方の監査 2026-11-25)。判定は utils/whipSwing のまま=ここは絵の形だけ。 ----

/**
 * 手元→掴んだ敵へ張った縄の形(whipRopePoints にそのまま渡せる形)。両端は手と敵に留めたまま、真ん中を回転と逆向きへ弓なりに遅らせる。
 * bow=たわみの強さ(rad・0=まっすぐ)。dir=回る向き(+1=角度が増える向き)。縄の座標は x=手→敵・y=その左手(+90°)なので、
 * 動く向きは +dir・遅れる側は -dir。角度は cos で前半と後半が打ち消し合う=先端は必ず敵の位置に着く(長さは lenK で合わせる)。
 */
export const whipTetherShape = (bow: number, dir: 1 | -1, alpha = 1, segs = WHIP_ROPE_POINTS - 1): WhipRopeShape => {
  const angles = Array.from({ length: segs }, (_, i) => -dir * bow * Math.cos(Math.PI * (i + 0.5) / segs));
  const sumCos = angles.reduce((s, a) => s + Math.cos(a), 0);
  return { handX: 0, handY: 0, angles, lenK: segs / Math.max(1e-6, sumCos), alpha, phase: 'crack' };
};

/** 振り回しのたわみ(rad)。回り出し(加速中)ほど遅れて大きくたわみ、最高速で張る(わずかに震える)。angVelFrac=今の角速度/最高の角速度。 */
export const whipTetherBow = (angVelFrac: number, tMs: number): number => {
  const slack = 1 - clamp01(angVelFrac);
  return 0.95 * slack ** 1.3 + 0.025 * Math.sin(tMs * 0.031);
};

/** 放した後、線の先が手元へ巻き戻る長さ(ms)。 */
export const WHIP_TETHER_RETRACT_MS = 150;
/** 巻き戻りの進み k(0..1・ease-in=加速しながら戻る)。先端の位置 = 手 + (放した先 - 手) × (1 - k)。終わったら null。 */
export const whipTetherRetract = (elMs: number): { k: number; bow: number; alpha: number } | null => {
  if (!(elMs >= 0) || elMs >= WHIP_TETHER_RETRACT_MS) return null;
  const u = elMs / WHIP_TETHER_RETRACT_MS;
  return { k: u * u, bow: 0.45 * u, alpha: 1 - u ** 4 };
};

/** 投げた敵の高さの山(px)=体の絵の高さ × これ(上下の限り付き)。 */
export const WHIP_FLY_LIFT_K = 0.55;
export const WHIP_FLY_LIFT_MIN_PX = 34;
export const WHIP_FLY_LIFT_MAX_PX = 78;
/** 途中で当たって着いた時、宙から地面へ落ちる長さ(ms)。 */
export const WHIP_FLY_DROP_MS = 110;
/** 途中で当たって着いた時、絵の遅れを体へ戻す時定数(ms)。 */
export const WHIP_FLY_CATCHUP_TAU_MS = 45;

/** 投げた敵の高さの山(px)。 */
export const whipFlyPeakPx = (bodyH: number): number =>
  Math.max(WHIP_FLY_LIFT_MIN_PX, Math.min(WHIP_FLY_LIFT_MAX_PX, bodyH * WHIP_FLY_LIFT_K));

/**
 * 飛ぶ高さ(px・描画だけ)。放してから t ms・最大距離に着く時刻 T ms(判定の whipThrowDurationMs)で 0 に戻る放物線。
 * 途中で当たった(landAt<T)時は、その時の高さから重さで落ちて WHIP_FLY_DROP_MS で地面へ。
 */
export const whipFlyLiftPx = (tMs: number, flyMs: number, peakPx: number, landAtMs?: number): number => {
  const T = Math.max(1, flyMs);
  const arc = (x: number): number => { const q = clamp01(x / T); return peakPx * 4 * q * (1 - q); };
  if (landAtMs === undefined || landAtMs >= T || tMs <= landAtMs) return arc(tMs);
  const u = (tMs - landAtMs) / WHIP_FLY_DROP_MS;
  return u >= 1 ? 0 : arc(landAtMs) * (1 - u * u);
};

/**
 * 絵の上の飛んだ距離(px)。判定(出だし v0 から減速して最大距離で 4 割の速さ)と違い、絵は最大距離でちょうど止まるように減速する
 * (=最大距離で急停止せず、着地の後に地面を擦って滑って止まる)。判定より少し遅れて進む(遅れの最大は最大距離の約 1 割)。
 */
export const whipFlyVisualDist = (tMs: number, v0: number, maxDist: number): number => {
  if (!(tMs > 0) || !(v0 > 0) || !(maxDist > 0)) return 0;
  const Tv = (2 * maxDist) / v0; // s
  const t = Math.min(Tv, tMs / 1000);
  return Math.min(maxDist, v0 * t - (v0 * v0 / (4 * maxDist)) * t * t);
};

/**
 * 絵のずれ(px・投げた向きに沿う・負=判定より後ろ)。logicalD=判定の距離。
 * 最大距離で着いた('max')=絵は自分の式のまま滑って止まる。途中で当たって着いた('hit')=着いた時のずれを短く戻す(当たって止まる)。
 */
export const whipFlyOffset = (o: {
  tMs: number; v0: number; maxDist: number; logicalD: number; landAtMs?: number; landKind?: 'max' | 'hit'; landD?: number;
}): number => {
  if (o.landAtMs === undefined || o.landKind === undefined || o.tMs <= o.landAtMs) {
    return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - o.logicalD);
  }
  const landD = o.landD ?? o.logicalD;
  if (o.landKind === 'max') return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - landD);
  const off0 = Math.min(0, whipFlyVisualDist(o.landAtMs, o.v0, o.maxDist) - landD);
  return off0 * Math.exp(-(o.tMs - o.landAtMs) / WHIP_FLY_CATCHUP_TAU_MS);
};

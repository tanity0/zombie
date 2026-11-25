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
/** 放した瞬間のたるみの下限(rad・張っていた縄が手を離れて緩む)。 */
export const WHIP_TETHER_RELEASE_SLACK = 0.28;
/** 放した後、縄の先が回っていた勢いのまま進み続ける時定数(ms)。進む量は勢い×これで頭打ちになり、巻き戻りに飲まれる。 */
export const WHIP_TETHER_COAST_TAU_MS = 40;
/** 放した後、回った円に沿った軌跡が消えきるまで(ms)。尾から縮みながら薄れる(1フレームで消さない)。 */
export const WHIP_TRAIL_FADE_MS = 140;
/** 放した後の軌跡: 長さの掛け(尾から縮む)と濃さの掛け。消えたら null。 */
export const whipTrailFade = (elMs: number): { spanK: number; alphaK: number } | null => {
  if (!(elMs >= 0) || elMs >= WHIP_TRAIL_FADE_MS) return null;
  const u = elMs / WHIP_TRAIL_FADE_MS;
  return { spanK: 1 - u * u, alphaK: (1 - u) * (1 - u) };
};
/**
 * 巻き戻りの進み k(0..1・ease-in=加速しながら戻る)。先端の位置 = 手 + (放した先 - 手) × (1 - k)。終わったら null。
 * たわみは放した瞬間が一番大きく(張っていた縄が緩む=bow0 と下限の大きい方)、戻るほど張る(手元へ引き込まれてまっすぐになる)。
 * thick=縄の太さの掛け(短くなるほど細く=素材を短い長さへ押し込んで塊に見せない)。
 */
export const whipTetherRetract = (elMs: number, bow0 = 0): { k: number; bow: number; alpha: number; thick: number } | null => {
  if (!(elMs >= 0) || elMs >= WHIP_TETHER_RETRACT_MS) return null;
  const u = elMs / WHIP_TETHER_RETRACT_MS;
  const k = u * u;
  return { k, bow: Math.max(Math.abs(bow0), WHIP_TETHER_RELEASE_SLACK) * (1 - u) ** 1.5, alpha: 1 - u ** 3, thick: 0.55 + 0.45 * (1 - k) };
};

/**
 * 放した後の縄の先の位置(手元からの相対・world px)。rel0=放した瞬間の手元→先・vRel=その時の先の速さ(手元に対する・px/ms)。
 * 先は放した瞬間の速さのまま進み出し(勢いの持ち越し=放した瞬間に止まらない)、手元へ加速しながら巻き戻る(whipTetherRetract の k)。
 */
export const whipTetherRetractTip = (
  elMs: number, rel0x: number, rel0y: number, vRelX: number, vRelY: number,
): { x: number; y: number } | null => {
  const rt = whipTetherRetract(elMs);
  if (!rt) return null;
  const c = WHIP_TETHER_COAST_TAU_MS * (1 - Math.exp(-Math.max(0, elMs) / WHIP_TETHER_COAST_TAU_MS));
  const keep = 1 - rt.k;
  return { x: (rel0x + vRelX * c) * keep, y: (rel0y + vRelY * c) * keep };
};

/** 掴んだ瞬間、振りの鞭(まっすぐ伸び切った形)から縄へ引き継ぐ長さ(ms)。 */
export const WHIP_TETHER_ENTRY_MS = 140;
/**
 * 掴んだ直後の引き継ぎ(0..1・止まった所から動き出し、前寄りに速く、減速して着く)。0=振りの鞭の伸び切った形(届く距離ぶん・地面の高さ・まっすぐ=パチンで止まっている)
 * /1=手→掴んだ敵の体へ張った縄。先は敵の向きのまま届く距離から敵の体まで縮み(巻き付く)、たわみ・高さも同じ割合で入る。
 * 速さ = 12u(1-u)^2 =出だし0(パチンで止まっていた先がいきなり速く動かない)・着き0。
 */
export const whipTetherEntry = (tMs: number): number => {
  const u = clamp01(tMs / WHIP_TETHER_ENTRY_MS);
  return u * u * (6 - 8 * u + 3 * u * u);
};

/** 光の縁の濃さ(0..1)。回る速さの割合が最高速に近い時だけ出る(回り出し・掴んだ瞬間は出ない)。 */
export const whipTetherGlowK = (angVelFrac: number): number => {
  const q = clamp01((angVelFrac - 0.8) / 0.2);
  return q * q;
};

/** 投げた敵の高さの山(px)=体の絵の高さ × これ(上下の限り付き)。 */
export const WHIP_FLY_LIFT_K = 0.55;
export const WHIP_FLY_LIFT_MIN_PX = 34;
export const WHIP_FLY_LIFT_MAX_PX = 78;
/** 途中で当たって着いた時、宙から地面へ落ちる長さ(ms)。 */
export const WHIP_FLY_DROP_MS = 110;
/** 途中で当たって着いた時、絵が当たった所へ止まるまでの時定数(ms・臨界減衰=着いた時の速さを持ち越して減速して止まる)。 */
export const WHIP_FLY_STOP_TAU_MS = 30;
/** 放した瞬間の曲がり(回っていた勢い→投げた向きの直進)が抜ける時定数(ms)。 */
export const WHIP_FLY_BLEND_TAU_MS = 45;
/** 飛び上がりの立ち上がり(ms)。地面で回っていた体の上下の速さを0から入れる(放した瞬間に上へ跳ねない)。 */
export const WHIP_FLY_RISE_TAU_MS = 30;

/** 投げた敵の高さの山(px)。 */
export const whipFlyPeakPx = (bodyH: number): number =>
  Math.max(WHIP_FLY_LIFT_MIN_PX, Math.min(WHIP_FLY_LIFT_MAX_PX, bodyH * WHIP_FLY_LIFT_K));

/**
 * 飛ぶ高さ(px・描画だけ)。放してから t ms・最大距離に着く時刻 T ms(判定の whipThrowDurationMs)で 0 に戻る放物線。
 * 途中で当たった(landAt<T)時は、その時の高さから重さで落ちて WHIP_FLY_DROP_MS で地面へ。
 */
export const whipFlyLiftPx = (tMs: number, flyMs: number, peakPx: number, landAtMs?: number): number => {
  const T = Math.max(1, flyMs);
  // 放物線に立ち上がりを掛ける(出だしの上への速さ0=地面で回っていた体が、放した瞬間に上へ跳ねない)。着く時刻は同じ。
  const arc = (x: number): number => {
    if (!(x > 0)) return 0;
    const q = clamp01(x / T);
    return peakPx * 4 * q * (1 - q) * (1 - Math.exp(-x / WHIP_FLY_RISE_TAU_MS));
  };
  if (landAtMs === undefined || landAtMs >= T || tMs <= landAtMs) return arc(tMs);
  // 途中で当たった: 着いた時の高さと上下の速さを持ち越し、重さで WHIP_FLY_DROP_MS に地面へ(上っていた最中なら、少し上ってから落ちる)。
  const h0 = arc(landAtMs);
  const vh = arc(landAtMs + 0.5) - arc(landAtMs - 0.5); // px/ms
  const D = WHIP_FLY_DROP_MS;
  const s = tMs - landAtMs;
  const g = (2 * (h0 + vh * D)) / (D * D); // D で地面に着く重さ(px/ms²)
  if (g <= 0) { // 下りが速く、重さ無しでも D より前に地面へ着く=そのままの速さで地面へ
    const end = vh < 0 ? h0 / -vh : 0;
    return s >= end ? 0 : Math.max(0, h0 + vh * s);
  }
  return s >= D ? 0 : Math.max(0, h0 + vh * s - 0.5 * g * s * s);
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
  // 着いた後は(着いたフレームも)着いた距離で見る(前のフレームの判定の距離のままだと、着いたフレームだけ1歩ぶん前へ跳ぶ)。
  if (o.landAtMs === undefined || o.landKind === undefined || o.tMs < o.landAtMs) {
    return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - o.logicalD);
  }
  const landD = o.landD ?? o.logicalD;
  if (o.landKind === 'max') return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - landD);
  // 途中で当たった: 着いた時の絵の遅れ off0 と絵の速さ vL を持ち越し、臨界減衰で当たった所へ止まる(速さが1フレームで0にならない)。
  // 速いまま当たると少しだけ当たった所の先へめり込んでから戻る(最大 vL×τ/e)。
  const off0 = Math.min(0, whipFlyVisualDist(o.landAtMs, o.v0, o.maxDist) - landD);
  const vL = whipFlyVisualSpeed(o.landAtMs, o.v0, o.maxDist) / 1000; // px/ms
  const s = o.tMs - o.landAtMs;
  const tau = WHIP_FLY_STOP_TAU_MS;
  return (off0 + (vL + off0 / tau) * s) * Math.exp(-s / tau);
};

/**
 * 放した瞬間の曲がり(world px)。判定は投げた向きへ直進するが、体は回っていた勢い(放した瞬間の速さ)のまま動き出し、
 * WHIP_FLY_BLEND_TAU_MS ほどで投げた向きの直進へ曲がって乗る(放した瞬間に向きと速さが跳ばない)。rv=放した瞬間の速さ − 直進の速さ(px/s)。
 * 出だしの速さの差が rv・ずれの最大は |rv|×τ/e(1周0.45秒の最高速で真後ろへ投げた時で約42px)で、その後0へ戻る。
 */
export const whipFlyReleaseBlend = (tMs: number, rvx: number, rvy: number): { x: number; y: number } => {
  if (!(tMs > 0)) return { x: 0, y: 0 };
  const k = (tMs / 1000) * Math.exp(-tMs / WHIP_FLY_BLEND_TAU_MS);
  return { x: rvx * k, y: rvy * k };
};

/** 投げた敵の絵(描画の whipFly が持つ値)。 */
export interface WhipFlyView {
  tMs: number; v0: number; maxDist: number; flyMs: number; ux: number; uy: number; logicalD: number;
  landAt?: number; landKind?: 'max' | 'hit'; landD?: number; rvx?: number; rvy?: number;
}
/** 投げた敵の絵のずれ(world px・判定の位置から)と高さ(px)。描画と計測が同じ1本を使う。 */
export const whipFlyViewOffset = (f: WhipFlyView, bodyH: number): { dx: number; dy: number; lift: number } => {
  const off = whipFlyOffset({ tMs: f.tMs, v0: f.v0, maxDist: f.maxDist, logicalD: f.logicalD, landAtMs: f.landAt, landKind: f.landKind, landD: f.landD });
  const b = whipFlyReleaseBlend(f.tMs, f.rvx ?? 0, f.rvy ?? 0);
  return { dx: f.ux * off + b.x, dy: f.uy * off + b.y, lift: whipFlyLiftPx(f.tMs, f.flyMs, whipFlyPeakPx(bodyH), f.landAt) };
};

/** 投げた敵の後ろへ伸ばす風の筋の長さ=絵の上の今の速さ × これ(秒)。速いほど長く、減速で縮む。 */
export const WHIP_THROW_STREAK_LEN_S = 0.11;
/** 着弾の瞬間から、筋が先(敵の側)から尾へ向けて消えきるまで(ms)。 */
export const WHIP_THROW_STREAK_OUT_MS = 170;

/** 絵の上の飛んだ距離が d になる時刻(ms・whipFlyVisualDist の逆)。 */
export const whipFlyVisualTimeAt = (d: number, v0: number, maxDist: number): number => {
  if (!(d > 0) || !(v0 > 0) || !(maxDist > 0)) return 0;
  const q = Math.min(1, d / maxDist);
  return ((2 * maxDist) / v0) * (1 - Math.sqrt(1 - q)) * 1000;
};
/** 絵の上の今の速さ(px/s)。最大距離でちょうど 0。 */
export const whipFlyVisualSpeed = (tMs: number, v0: number, maxDist: number): number => {
  if (!(v0 > 0) || !(maxDist > 0)) return 0;
  const Tv = (2 * maxDist) / v0;
  return Math.max(0, v0 * (1 - Math.max(0, tMs) / 1000 / Tv));
};

/**
 * 投げた敵の後ろの風の筋(派手さの絵・判定なし)。投げた向きに沿う距離(放した点から・px)で、尾 tailD と先 headD・濃さの掛け alpha を返す。
 * 先=敵の体の今の位置(headNow・絵の上)。飛んでいる間は尾が速さぶん後ろ(放した点より後ろへは出さない=手元にかぶらない)。
 * 着弾(landAtMs)の後は尾をその場に残し、先が加速しながら尾へ縮んで消える(WHIP_THROW_STREAK_OUT_MS)。消えたら null。
 */
export const whipThrowStreak = (o: {
  tMs: number; v0: number; maxDist: number; headNow: number; landAtMs?: number; landD?: number;
}): { tailD: number; headD: number; alpha: number } | null => {
  const lenAt = (t: number, head: number): number => Math.max(0, Math.min(head, whipFlyVisualSpeed(t, o.v0, o.maxDist) * WHIP_THROW_STREAK_LEN_S));
  if (o.landAtMs === undefined || o.tMs <= o.landAtMs) {
    const head = Math.max(0, o.headNow);
    return { tailD: head - lenAt(o.tMs, head), headD: head, alpha: 1 };
  }
  const u = (o.tMs - o.landAtMs) / WHIP_THROW_STREAK_OUT_MS;
  if (u >= 1) return null;
  const headLand = Math.max(0, Math.min(whipFlyVisualDist(o.landAtMs, o.v0, o.maxDist), o.landD ?? Infinity));
  const tail = headLand - lenAt(o.landAtMs, headLand);
  const head = Math.max(tail, o.headNow);
  return { tailD: tail, headD: tail + (head - tail) * (1 - u * u), alpha: 1 - 0.5 * u };
};

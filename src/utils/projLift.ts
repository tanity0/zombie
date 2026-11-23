// 投影の段階5「高さ」の純関数(PixiJS を読まない・描画の写像だけ)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-8(3-8b 高さの投影の式・3-8e 置き方・3-8i 作る物1)。
// 芯: 高さを持つ物は地面の点 G と高さ h(world px)に分けて持ち、G を投影した点 P から上へ h × σ だけ持ち上げる。
// 予告・前後の並び・地平線フェード・定義域・描く距離のフェードは全部 G で決める。
// `?proj=1` の時だけ pixiScene が使う(既定 `?proj=0` では1ビットも使われない)。ゲームの判定には一切関与しない。

import {
  projectInto, makeProjPoint, projScaleAtLocal, projScaleYNearAt, projScreenRowsL, type ProjFrame, type ProjPoint,
} from './perspectiveProjection';

/**
 * ★#6「浮きの倍率」(社長裁定 2026-11-23=A): 'A'=σ=s(立っている絵と同じ横の縮み)/'B'=地面の縦の詰め比(控え)。
 * 読むのは projLiftScale の1か所だけ(番人テスト③)。
 */
export const PROJ_LIFT_MODE: 'A' | 'B' = 'A';

/** 高さの倍率 σ(ℓ)(§3-8b)。基準行で 1。 */
export const projLiftScale = (f: ProjFrame, l: number, mode: 'A' | 'B' = PROJ_LIFT_MODE): number => {
  if (mode === 'A') return projScaleAtLocal(f, l);
  const tb = f.table;
  const lRef = f.lRef;
  const ref = projScaleYNearAt(lRef, tb.stripH, tb.refCount, tb.p, lRef);
  return projScaleYNearAt(l, tb.stripH, tb.refCount, tb.p, lRef) / Math.max(1e-9, ref);
};

/** 高さの割り戻し(§3-8e の1本の式): 今の写し方が高さに掛けている倍率 m を σ に直す縦のずれ = −(σ − m)·h。 */
export const projLiftFixDy = (h: number, m: number, sigma: number): number => -(sigma - m) * h;

/**
 * 部品の高さの付き方(§3-8e の表の m の行):
 * - body: 後掛けの相似で写る体の部品(m = k·δ)
 * - hudNoH: 平行移動・基準点 H に高さを含まない頭上の物(m = δ=描いた時のまま)
 * - hudWithH: 前掛け P + s·(H − F)・平行移動で H に高さを含む頭上の物(m = s·δ)
 * - ground: 高さと一緒に上がらない部品(影・足元の輪・接地の楕円・地面の予告)=直さない
 * - streak: 足元から体までを結ぶ浮きの筋(位置は body と同じ・長さも σ/m 倍)
 */
export type ProjLiftKind = 'body' | 'hudNoH' | 'hudWithH' | 'ground' | 'streak';

/**
 * 部品の m(1項ぶん)。drawn=描く関数が実際に引いた量(=δ·h)・delta=δ・k=後掛けの k・s=投影の s。
 * 戻り値は「drawn を何倍に写しているか」(=m/δ)。ground は σ/δ を返す(直しが 0 になる)。
 */
export const projLiftPartMul = (kind: ProjLiftKind, k: number, s: number, sigma: number, delta: number): number => {
  const dd = Math.abs(delta) > 1e-9 ? delta : 1;
  switch (kind) {
    case 'body': case 'streak': return k;
    case 'hudNoH': return 1;
    case 'hudWithH': return s;
    default: return sigma / dd;
  }
};

/**
 * 高さの項の列(drawn[i]=δ_i·h_i・delta[i]=δ_i)から、部品の縦の直しの和を出す(§3-8e「項ごとに記録する」)。
 * Σ −(σ·h_i − m_i·h_i) = Σ −(σ/δ_i − mul)·drawn_i。
 */
export const projLiftTermsFixDy = (
  kind: ProjLiftKind, k: number, s: number, sigma: number, drawn: ArrayLike<number>, delta: ArrayLike<number>, n: number,
): number => {
  if (kind === 'ground') return 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const dd = Math.abs(delta[i]) > 1e-9 ? delta[i] : 1;
    const h = drawn[i] / dd;
    dy += projLiftFixDy(h, projLiftPartMul(kind, k, s, sigma, dd) * dd, sigma);
  }
  return dy;
};

const P0 = makeProjPoint(), P1 = makeProjPoint();

/**
 * 地面の成分の直し(§3-8e「地面の成分と高さの成分が1つの変数に混ざる物の分け方」): 体の相似が地面の成分 g を k·g へ写すのを、
 * world の点 F+g を投影した点へ合わせる量 = 投影(F + g) − P − k·g。
 */
export const projGroundOffsetFix = (
  f: ProjFrame, fx: number, fy: number, gx: number, gy: number, k: number, out: { x: number; y: number },
): { x: number; y: number } => {
  const p = projectInto(f, fx, fy, P0);
  const q = projectInto(f, fx + gx, fy + gy, P1);
  out.x = q.x - p.x - k * gx;
  out.y = q.y - p.y - k * gy;
  return out;
};

/** 画面の上端の表示Y(worldGroup のローカル・ズーム前)− 余白(§3-8e「空」・★#33=A)。 */
export const projSkyTopY = (f: ProjFrame, marginPx: number): number =>
  f.camY + f.farH + projScreenRowsL(f).top - marginPx;

/**
 * ★#33「空とつながる物の上端」(社長裁定=A): 地面の点 G の真上で、画面の上端の外(余白 marginPx)から始まる高さ h0(world px)。
 * h0 = (P_G.y − (画面の上端の表示Y − 余白)) / σ(ℓ_G)。出た時に1回だけ決めて覚える(毎フレーム決め直さない=揺れない)。
 */
export const projSkyStartH = (f: ProjFrame, gx: number, gy: number, marginPx: number): number => {
  const p = projectInto(f, gx, gy, P0);
  const sig = Math.max(1e-6, projLiftScale(f, Math.max(0, p.l)));
  return Math.max(0, (p.y - projSkyTopY(f, marginPx)) / sig);
};

/** 持ち上げた点(投影(G) − (0, h·σ))を out へ書く(σ は G の行)。 */
export const projLiftPointInto = (
  f: ProjFrame, gx: number, gy: number, h: number, out: { x: number; y: number; s: number; sigma: number; alpha: number; l: number },
) => {
  const p = projectInto(f, gx, gy, P0);
  const sig = projLiftScale(f, Math.max(0, p.l));
  out.x = p.x; out.y = p.y - h * sig; out.s = p.s; out.sigma = sig; out.alpha = p.alpha; out.l = p.l;
  return out;
};
export const makeProjLiftPoint = () => ({ x: 0, y: 0, s: 1, sigma: 1, alpha: 1, l: 0 });

/**
 * 描画の間引き(§3-8h の4): G の投影と持ち上げた点の両方を囲む箱(± r·s・world の半径 r)が、画面(ズーム後の画面px+marginPx)に
 * 掛からないなら true。G が地平線より北(定義域の外)なら true(★#18=描かない)。持ち上げた体が画面に掛かっていれば外さない。
 */
export const projLiftOutside = (f: ProjFrame, gx: number, gy: number, h: number, r: number, marginPx: number): boolean => {
  const p: ProjPoint = projectInto(f, gx, gy, P0);
  if (!p.inDomain) return true;
  const sig = projLiftScale(f, Math.max(0, p.l));
  const z = f.wgScale > 0 ? f.wgScale : 1;
  const rr = Math.max(0, r) * p.s;
  const sx = f.wgX + z * (p.x - f.camX + f.shakeX);
  const syG = f.wgY + z * (p.y - f.camY + f.shakeY);
  const syL = f.wgY + z * (p.y - Math.max(0, h) * sig - f.camY + f.shakeY);
  const left = sx - z * rr, right = sx + z * rr;
  const top = Math.min(syG, syL) - z * rr, bottom = Math.max(syG, syL) + z * rr;
  return right < -marginPx || left > f.screenW + marginPx || bottom < -marginPx || top > f.screenH + marginPx;
};

/**
 * ★#35「拡縮で高さ・近さを表す演出」の推薦 A(ヘリ): 地面の点 G を支点に、今の描き方の点 (x, y) を s_G 倍の相似で写す。
 * 表示 = P_G + s_G·((x, y) − G)。G では恒等(P_G)・s_G=1 かつ P_G=G の時は今の点そのもの。
 */
export const projHelperSimilar = (
  f: ProjFrame, gx: number, gy: number, x: number, y: number, out: { x: number; y: number; s: number },
): { x: number; y: number; s: number } => {
  const p = projectInto(f, gx, gy, P0);
  out.x = p.x + p.s * (x - gx);
  out.y = p.y + p.s * (y - gy);
  out.s = p.s;
  return out;
};

// ---- 段階5の台帳(§3-8d・鍵は Z1〜Z58・Z37=再掲は入れない) ----

export type ProjLiftRowType = 'split' | 'fused' | 'sky' | 'scale' | 'done' | 'ground' | 'dead' | 'material';
export interface ProjLiftRow { types: readonly ProjLiftRowType[]; delta: 1 | 'd' | 'check' | null }

const R = (types: ProjLiftRowType[], delta: 1 | 'd' | 'check' | null): ProjLiftRow => ({ types, delta });

export const PROJ_LIFT_ROWS = {
  // ア. 主人公
  Z1: R(['split'], 1), Z2: R(['split'], 'd'), Z3: R(['split'], 1), Z4: R(['split'], 'd'), Z5: R(['dead'], null),
  Z6: R(['done'], null), Z7: R(['split', 'ground'], 1), Z8: R(['split', 'ground'], 'check'), Z9: R(['split'], 'check'),
  Z57: R(['split'], 1), Z40: R(['done'], 'd'),
  // イ. 敵・ボス
  Z10: R(['split'], 1), Z11: R(['split'], 1), Z12: R(['split'], 1), Z13: R(['split'], 'check'), Z14: R(['split'], 'check'),
  Z50: R(['sky'], null), Z15: R(['ground'], null), Z16: R(['done', 'ground'], null), Z17: R(['split'], 1),
  Z18: R(['split', 'ground'], 1), Z19: R(['scale', 'split'], 'check'), Z20: R(['material'], null), Z38: R(['split'], 1),
  Z54: R(['split'], 1),
  // ウ. 味方・NPC・拾い物・設置物・登場
  Z21: R(['split'], 1), Z22: R(['split'], 1), Z39: R(['split'], 'd'), Z41: R(['split'], 1), Z42: R(['done'], 'd'),
  Z23: R(['split'], 1), Z43: R(['fused'], null), Z24: R(['done'], 1), Z52: R(['split'], 1), Z53: R(['done'], 1),
  Z51: R(['split'], 'd'), Z25: R(['scale'], null),
  // エ. 放物線・空とつながる物・落ちてくる物
  Z26: R(['split'], 'check'), Z27: R(['split'], 'check'), Z47: R(['sky'], null), Z46: R(['sky'], null), Z28: R(['sky'], null),
  Z44: R(['split', 'fused'], 'check'), Z45: R(['fused'], null), Z48: R(['sky'], null), Z29: R(['split'], 'check'),
  Z30: R(['sky'], null), Z49: R(['sky'], null), Z55: R(['done'], null), Z56: R(['done'], 1),
  // オ. 演出の高さ
  Z31: R(['done'], null), Z32: R(['done'], null), Z33: R(['done'], null), Z34: R(['fused'], null), Z35: R(['done'], null),
  Z36: R(['done'], null),
  // 残像
  Z58: R(['fused'], null),
} as const satisfies Record<string, ProjLiftRow>;

export type ProjLiftRowKey = keyof typeof PROJ_LIFT_ROWS;

/** 直す行(分・溶・空・拡のどれかを含む行)か。 */
export const projLiftRowNeedsFix = (r: ProjLiftRow): boolean =>
  r.types.some((t) => t === 'split' || t === 'fused' || t === 'sky' || t === 'scale');

/** 計器 s5 unfixed が数える行か(分と溶のうち、空と拡を含まない行=3-8i の9)。 */
export const projLiftRowCountsUnfixed = (r: ProjLiftRow): boolean =>
  r.types.some((t) => t === 'split' || t === 'fused') && !r.types.some((t) => t === 'sky' || t === 'scale');

/**
 * ★#34「浮きの画面の上限」(推薦 B で作る=上限は world のまま・切り替えの定数は置かない)。
 * 計器 s5 cap 用: 上限に当たった浮きの画面の持ち上がり(ローカル)と、持ち上げた体の上端と画面の上端の差(ローカル・負=画面の外)。
 */
export const projLiftCapStat = (
  f: ProjFrame, gx: number, gy: number, h: number, bodyH: number, out: { liftPx: number; topGap: number },
): { liftPx: number; topGap: number } => {
  const p = projectInto(f, gx, gy, P0);
  const sig = projLiftScale(f, Math.max(0, p.l));
  out.liftPx = h * sig;
  out.topGap = (p.y - h * sig - bodyH * p.s) - projSkyTopY(f, 0);
  return out;
};

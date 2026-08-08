// グレン(stage-7ラスボス)第二形態の連結パーツ台帳と蛇式軌跡の純関数群(v0.25.3027)。
//
// 出自: 台帳と式は pixiScene.syncGlenParts(v0.25.2918〜3025)からの移設。胴体弾(社長裁定
// 「体パーツから弾を両サイドに発射」)で **描画と発射位置が同じ台帳・同じ式を読む**ために
// renderer-agnostic なこの層へ置く(CLAUDE.md「判定はworld/store側」)。
// 描画(pixiScene)は実テクスチャ幅×描画スケール(深度スケール込み)で間隔を出し、
// 発射(gameStore)は同じ式を**世界座標の近似**(社長裁定1a: contain式まで再現・カメラ依存の
// 深度スケールは含めない=ズレは許容)で使う。

import type { Enemy } from '../types/game';
import { enemyFootBox } from '../pixi/renderSpec';

// 第二形態しきい値(HP60%以下で変身)。城ボスの既存フェーズ閾値60%(GIANT_PHASE_HP_THRESHOLD)と
// 意図的に同値(v0.25.2918の叩き台裁定)。ここが正本で、pixiScene はこれを import する。
export const GLEN_P2_HP_FRAC = 0.6;
// 連結の構成(社長指示v0.25.2921「胴体5+尾」→v0.25.3025「胴体パーツ3つ増やして」=胴体8+尾)。
// 胴体はシートの砲身(0)と箱(1)を交互に使って単調さを消し、尾(2)は必ず最後尾。
export const GLEN_CHAIN: readonly number[] = [0, 1, 0, 1, 0, 1, 0, 1, 2];
export const GLEN_SLOT_COUNT = GLEN_CHAIN.length; // 9
export const GLEN_TAIL_SLOT = GLEN_SLOT_COUNT - 1; // 尾スロット(胴体弾の対象外)
// 「真ん中のパーツから減っていく」のスロット除去順。胴体の中央から外へ交互に欠け、根本(0)は
// 胴体の最後、**尾(8)は最後まで残る**。
export const GLEN_REMOVAL: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];
export const GLEN_VISIBLE_BY_COUNT: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let count = 0; count <= GLEN_SLOT_COUNT; count++) {
    const removed = new Set(GLEN_REMOVAL.slice(0, GLEN_SLOT_COUNT - count));
    out.push(GLEN_CHAIN.map((_, s) => s).filter((s) => !removed.has(s)));
  }
  return out;
})();
/** 第二形態内のHP残量→連結スロット数(9→0・区間を9等分)。 */
export const glenPartCount = (hpFrac: number): number =>
  Math.max(0, Math.min(GLEN_SLOT_COUNT, Math.ceil((hpFrac / GLEN_P2_HP_FRAC) * GLEN_SLOT_COUNT)));

// ---- 蛇式軌跡(DQ隊列・v0.25.2956) ------------------------------------------------------------
export interface GlenTrailPoint { x: number; y: number }
export const GLEN_TRAIL_MAX = 360; // 9連結(v0.25.3025)の遡り距離をカバーする点数

/** 本体足元の軌跡を記録する。直近点から2px以上動いた時だけ追加(syncGlenPartsの現行実装と同一)。 */
export const pushGlenTrail = (trail: GlenTrailPoint[], x: number, y: number): void => {
  const last = trail[trail.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) >= 2) {
    trail.push({ x, y });
    if (trail.length > GLEN_TRAIL_MAX) trail.splice(0, trail.length - GLEN_TRAIL_MAX);
  }
};

/** 軌跡を現在位置(headX/Y)から距離dだけ遡った点。軌跡が足りない分は最古の向き(無ければ右)へ
 * 直線延長=出現直後でも「本体の背後に一列」が崩れない(syncGlenPartsの現行実装と同一)。 */
export const sampleGlenTrail = (
  trail: readonly GlenTrailPoint[], headX: number, headY: number, d: number,
): GlenTrailPoint => {
  let px = headX, py = headY, remain = d;
  for (let i = trail.length - 1; i >= 0; i--) {
    const q = trail[i];
    const segLen = Math.hypot(px - q.x, py - q.y);
    if (segLen >= remain) {
      const k = segLen > 0 ? remain / segLen : 0;
      return { x: px + (q.x - px) * k, y: py + (q.y - py) * k };
    }
    remain -= segLen; px = q.x; py = q.y;
  }
  const a = trail.length >= 2 ? trail[0] : null, b = trail.length >= 2 ? trail[1] : null;
  let dx = 1, dy = 0;
  if (a && b) { const l = Math.hypot(b.x - a.x, b.y - a.y); if (l > 0.5) { dx = (a.x - b.x) / l; dy = (a.y - b.y) / l; } }
  return { x: px + dx * remain, y: py + dy * remain };
};

/** 可視スロット列(show順)→各パーツの遡り距離。現行の間隔累積式そのもの:
 * 初項=bodyHalfW*0.15(付け根は本体にほぼ隠す)+w*0.5*0.4、以降=prevHalfW+w/2−min(prevHalfW*2,w)*0.4
 * (隣と幅40%の深い重なりでつなぎ目を隠す)。中央のパーツが欠けると残りは詰まる(現行挙動)。 */
export const glenChainDistances = (
  bodyHalfW: number, slots: readonly number[], widthOf: (slot: number) => number,
): number[] => {
  const out: number[] = [];
  let dist = bodyHalfW * 0.15;
  let prevHalfW = 0;
  let first = true;
  for (const slot of slots) {
    const w = widthOf(slot);
    dist += first ? w * 0.5 * 0.4 : (prevHalfW + w / 2 - Math.min(prevHalfW * 2, w) * 0.4);
    out.push(dist);
    first = false;
    prevHalfW = w / 2;
  }
  return out;
};

// ---- 胴体弾(v0.25.3027・社長裁定「1:一斉に(胴体パーツだけ) 2:予告なし、通常弾。狙わずに、
// 両サイドから斜め前にv字 3:通常弾なので当然カウンターできる」+追裁定 1a/安全半径あり/技中は撃たない) --
// 素材の実寸(pixiTextures.tsのframe定義と同値。差し替え時は両方直す)。
export const GLEN_PART_TEX_W: readonly number[] = [244, 208, 184]; // 砲身/箱/尾
export const GLEN_BODY_TEX_W = 1024; // glen-boss2.png 実寸
export const GLEN_BODY_TEX_H = 840;
export const GLEN_VOLLEY_CD_MS = 3600;        // 生値。実効=/ENEMY_ATTACK_SPEED_MULT(≒3.0s)
export const GLEN_VOLLEY_V_RAD = Math.PI / 4; // 進行方向±45°=「斜め前にV字」
export const GLEN_VOLLEY_SAFE_PX = 80;        // 背後湧き対策: プレイヤーからこの距離未満のパーツは撃たない(社長裁定)
export const GLEN_VOLLEY_TARGET_REACH_PX = 100; // createEnemyProjectileへ渡す方向指定用の到達点距離

/** 斉射してよい瞬間か(社長裁定3「技の予告中は撃たない」=aiPhase無し=追跡/歩行中のみ)。
 * lastAt==null は「変身直後の種付け前」=撃たない(初回はCD後・監査指摘)。 */
export const shouldGlenVolley = (
  secondForm: boolean, aiPhase: string | undefined, lastAt: number | undefined,
  gameTime: number, cdEffMs: number,
): boolean =>
  secondForm && aiPhase == null && lastAt != null && gameTime - lastAt >= cdEffMs;

export interface GlenVolleyShot { ox: number; oy: number; tx: number; ty: number }

/** 1斉射ぶんの弾(発射点+到達点)。可視の胴体パーツ(尾を除く)×2発(進行方向±45°)。
 * 位置は世界座標の近似(社長裁定1a): contain式・視覚倍率込み、カメラ依存の深度スケールは含めない。 */
export const glenVolleyShots = (
  boss: Enemy, trail: readonly GlenTrailPoint[], playerCx: number, playerCy: number,
): GlenVolleyShot[] => {
  const hpFrac = boss.maxHealth > 0 ? boss.health / boss.maxHealth : 1;
  const show = GLEN_VISIBLE_BY_COUNT[Math.min(GLEN_SLOT_COUNT, glenPartCount(hpFrac))];
  const fb = enemyFootBox(boss);
  const sc = Math.min(fb.boxW / GLEN_BODY_TEX_W, fb.boxH / GLEN_BODY_TEX_H); // 描画containScaleと同式
  const bodyHalfW = (GLEN_BODY_TEX_W * sc) / 2;
  const dists = glenChainDistances(bodyHalfW, show, (slot) => GLEN_PART_TEX_W[GLEN_CHAIN[slot]] * sc);
  const shots: GlenVolleyShot[] = [];
  for (let i = 0; i < show.length; i++) {
    const slot = show[i];
    if (slot === GLEN_TAIL_SLOT) continue; // 尾からは撃たない(社長裁定1)
    const d = dists[i];
    const a = sampleGlenTrail(trail, fb.footX, fb.footY, d);
    if (Math.hypot(a.x - playerCx, a.y - playerCy) < GLEN_VOLLEY_SAFE_PX) continue; // 反応時間ゼロ被弾の防止(社長裁定2)
    // 列の進行方向(=頭側へ12px近い点との差)。停止直後などで取れない時は本体方向→右をフォールバック。
    const ahead = sampleGlenTrail(trail, fb.footX, fb.footY, Math.max(0, d - 12));
    let fx = ahead.x - a.x, fy = ahead.y - a.y;
    let fl = Math.hypot(fx, fy);
    if (fl < 0.5) { fx = fb.footX - a.x; fy = fb.footY - a.y; fl = Math.hypot(fx, fy); }
    if (fl < 0.5) { fx = 1; fy = 0; fl = 1; }
    fx /= fl; fy /= fl;
    for (const sgn of [1, -1] as const) {
      const cos = Math.cos(GLEN_VOLLEY_V_RAD), sin = Math.sin(GLEN_VOLLEY_V_RAD) * sgn;
      const dx = fx * cos - fy * sin, dy = fx * sin + fy * cos;
      shots.push({
        ox: a.x, oy: a.y,
        tx: a.x + dx * GLEN_VOLLEY_TARGET_REACH_PX,
        ty: a.y + dy * GLEN_VOLLEY_TARGET_REACH_PX,
      });
    }
  }
  return shots;
};

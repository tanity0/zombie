// 画面外ボスマーク / ボスメーカーの距離表示(社長指示v0.25.2657)の純関数層。
//
// 社長指示:
//   > (ゲーム中も)ボス交戦中は画面外のボスマーク表示
//   > ボスメーカー中は常にボスとの距離を表示
//
// ★配線(pixiScene)に判定を直書きしない(CLAUDE.md 実装精度の規律4)。
// 「誰がボスか」「画面のどこへ置くか」「距離はいくつか」は全部ここで決め、テストで固定する。
// pixiScene は返ってきた座標に**絵を描くだけ**(描画は読むだけ=CLAUDE.md Rendering vs. game logic)。
import type { Enemy } from '../types/game';
import { isHiddenBoss, isBountyType } from './enemyUtils';

/**
 * 画面端マークを出す「ボス」の定義 = **一騎打ちのボス**。
 * ・`isHiddenBoss`: 裏ボス4体 + 天使6体 + idol(ボスメーカーの主役)
 * ・`isStoryBoss` : グレン(stage-7) / 未確認変異体(stage-ex1)
 *
 * ★城ボス(giantbat)と雑魚の格上(pumpkin/hunter等=`isBossType`)は**わざと外す**:
 *   - 城ボスは `castle.bossSpawned` の赤い城マーカーが既に同じ方角を指している(2重表示になる)。
 *   - hunter は「検知された時だけ赤矢印」が既にある(常時表示にすると意味が変わる)。
 *   - pumpkin 等は複数同時に湧くので、全部にボスマークを出すと画面端が渋滞する。
 *   足す場合は社長判断(=ここ1箇所を変えれば全経路に効く)。
 *
 * §6.38 B1.5-5(賞金首): 賞金首4型も対象に追加(1分で会わずにいると去る=見つけやすくする必要がある)。
 * ただし賞金首だけ有効距離1200px(`BOUNTY_MARK_MAX_DIST_PX`)のゲートが追加で掛かる
 * (`isMarkedBossVisible`側)。他の一騎打ちボスに距離ゲートは無い=既存仕様のまま。
 */
export const isMarkedBoss = (e: Pick<Enemy, 'type' | 'isStoryBoss'>): boolean =>
  isHiddenBoss(e.type) || e.isStoryBoss === true || isBountyType(e.type);

/** 賞金首の矢印マーカー有効距離(§6.38 B1.5-5)。
 * ★2026-08-26 社長指示「いる間はマーク表示。近づいたらじゃなくて」で**距離ゲートは撤廃**
 * (isMarkedBossVisible は賞金首なら常にtrue)。定数は経緯の記録として残す(参照ゼロなら将来削除可)。 */
export const BOUNTY_MARK_MAX_DIST_PX = 1200;

/**
 * マーカーを実際に出すか(`isMarkedBoss` + `isEngagedBoss` + 賞金首専用の距離ゲート、を1箇所に集約)。
 * pixiScene側はこれ1本を呼ぶだけにする(CLAUDE.md 実装精度の規律4=配線に判定を直書きしない)。
 */
export const isMarkedBossVisible = (
  e: Pick<Enemy, 'type' | 'isStoryBoss' | 'bossState' | 'lastHit' | 'x' | 'y' | 'width' | 'height'>,
  now: number,
  playerCx: number,
  playerCy: number,
): boolean => {
  void playerCx; void playerCy; // ★引数は互換のため残す(賞金首の距離ゲート撤廃で未使用化・下記)
  if (!isMarkedBoss(e)) return false;
  // ★社長指示2026-08-26「賞金首はいる間はマーク表示してあげよう。近づいたらじゃなくて」:
  // 賞金首は**滞在中ずっと**出す——距離1200pxゲートと交戦ゲートの両方を外す(去り(return)中も、
  // 消えるまでは「いる」)。なお v§6.38 B1.5-5 では「有効距離1200px」と裁定されていた(事実)。
  if (isBountyType(e.type)) return true;
  return isEngagedBoss(e, now);
};

/**
 * 殴り合いが途切れてから「交戦中」を保つ猶予(ms)。
 * ★これが要る理由: 裏ボスは**ズーム後の画面外が3秒続くと `bossState='return'`(帰巣)へ落ちる**。
 * つまり「マークを出したい状況」と「帰巣状態」が完全に重なる。直近の殴り合いで繋がないと、
 * 画面外へ出た瞬間にマークまで消えて**役に立たない**。
 */
export const BOSS_ENGAGE_GRACE_MS = 6000;

/**
 * **交戦中か**(社長指示v0.25.2658「画面外のボスマークはボスと交戦中だけね」)。
 * 「ボスが生きている」だけでは出さない——裏ボスは巣で復活待機したまま生き続けるので、
 * 逃げた後もずっと巣を指す矢印が残ってしまう。
 *
 * 交戦中 = 次のどちらか。
 *  1. **帰巣/離脱中ではない**(`bossState !== 'return'`)= まだこちらを見ている。
 *     `'return'` を使うのは裏ボス4体のコントローラだけ(天使/idol/グレンは使わない=常に交戦中扱い。
 *     グレンはリーシュしない仕様なので正しい)。
 *  2. **直近 `BOSS_ENGAGE_GRACE_MS` 以内に殴った**(`lastHit`)= 画面外離脱の予兆〜帰巣直後を拾う。
 *
 * `now` と `lastHit` は**どちらも `Date.now()` 基準**(types/game.ts の注記どおり)。gameTime を渡さないこと。
 */
export const isEngagedBoss = (e: Pick<Enemy, 'bossState' | 'lastHit'>, now: number): boolean =>
  e.bossState !== 'return' || now - e.lastHit <= BOSS_ENGAGE_GRACE_MS;

/** マークを置ける画面の内側矩形(余白はHUD/ノッチを避けるための既存の値をそのまま受け取る)。 */
export interface MarkBox {
  w: number; h: number;
  marginX: number; marginTop: number; marginBottom: number;
}

export interface BossMark {
  /** マークを描く画面座標(画面外なら縁の点 / 画面内ならボスの頭上)。 */
  x: number; y: number;
  /** リング中心→ボスの角度(矢印の向き)。画面内(offscreen=false)では矢印を出さない。 */
  angle: number;
  offscreen: boolean;
  /** プレイヤー中心↔ボス中心のワールド距離(px・整数)。**AIの距離帯と同じ測り方**(中心↔中心)。 */
  distPx: number;
}

/**
 * ワールド→画面の写像。`screen = origin + world × zoom`。
 *
 * ★**ズーム引き考慮(CLAUDE.md 必須項目)**: ボス戦は距離と体格により最大0.58まで引くので、
 * 可視域は画面の約1.72倍まで広がる。`world - camera` を画面座標として扱うと、ボスがまだ
 * はっきり見えている位置で「画面外」と判定してマークが出てしまう。よってズームを必ず通す。
 * 呼ぶ側は Pixi の実値(`worldGroup.scale` / `worldGroup.position` / `world.position`)から作ること
 * ——**式を2箇所に持たない**(カメラシェイクやズーム時の寄せも自動で乗る)。
 */
export interface WorldView { zoom: number; originX: number; originY: number }

/**
 * 中心 `(cx, cy)` から角度 `angle` へ伸ばして、余白を除いた画面矩形の**縁**に当たる点を返す。
 * 中心が既に余白の外に居る等で前方に縁が無い場合は `null`(後ろ向きの点を返さない)。
 */
export const projectToEdge = (
  angle: number, cx: number, cy: number, box: MarkBox,
): { x: number; y: number } | null => {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let t = Infinity;
  if (dx > 1e-4) t = Math.min(t, (box.w - box.marginX - cx) / dx);
  else if (dx < -1e-4) t = Math.min(t, (box.marginX - cx) / dx);
  if (dy > 1e-4) t = Math.min(t, (box.h - box.marginBottom - cy) / dy);
  else if (dy < -1e-4) t = Math.min(t, (box.marginTop - cy) / dy);
  if (!Number.isFinite(t) || t < 0) return null;
  return { x: cx + dx * t, y: cy + dy * t };
};

/**
 * ボス1体ぶんのマーク位置を出す。
 * - **画面外**: 画面の縁 + 矢印の向き(`offscreen: true`)。
 * - **画面内**: ボスの当たり帯の**上端**(=頭上。距離だけ出す用。`offscreen: false`)。
 *   ゲーム中は画面内のマークを出さない(本体が見えているので不要)——出すかどうかは呼ぶ側が決める。
 */
export const bossMarkFor = (args: {
  boss: { x: number; y: number; width: number; height: number };
  playerCenter: { x: number; y: number };
  /** ワールド→画面(ズーム込み)。`camera` を直接受け取らないのは上の WorldView の注記のとおり。 */
  view: WorldView;
  /** 画面上のリング中心(=プレイヤーの画面位置)。既存の方角矢印と同じ基準。 */
  center: { x: number; y: number };
  box: MarkBox;
}): BossMark | null => {
  const { boss, playerCenter, view, center, box } = args;
  const z = view.zoom || 1;
  const bcx = boss.x + boss.width / 2;
  const bcy = boss.y + boss.height / 2;
  const tx = view.originX + bcx * z, ty = view.originY + bcy * z;
  // 距離は**中心↔中心のワールド距離**。idolTick / bossSkeleton の距離帯(zoneForDistance)と同じ
  // 測り方にしないと「表示は melee なのに台本は near を引く」というズレた道具になる。
  // ズーム倍率は掛けない=引き/寄りで数字が動かない(調整の基準がぶれない)。
  const distPx = Math.round(Math.hypot(bcx - playerCenter.x, bcy - playerCenter.y));
  const angle = Math.atan2(ty - center.y, tx - center.x);
  if (tx >= 0 && tx <= box.w && ty >= 0 && ty <= box.h) {
    return { x: tx, y: view.originY + boss.y * z, angle, offscreen: false, distPx };
  }
  const p = projectToEdge(angle, center.x, center.y, box);
  return p ? { x: p.x, y: p.y, angle, offscreen: true, distPx } : null;
};

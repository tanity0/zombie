// 社長相談(実装チャット・v0.25.1499): レベルアップ処理を、ジャンプ着地/ダッシュ突進の「赤ライン」
// 実当たり判定内にプレイヤーがいる間だけ保留する(画面のどこかで誰かが溜めているだけでは保留しない)。
// ・ジャンプ着地(パンプキン/lab-zombie-3/ジャイアントバット/ハンター): 実際の着地爆発ヒット判定
//   (useGameLoopのpumpkinBlasts処理と同じ「爆心からの距離 <= 半径+双方の当たり半径」)と同じ式。
// ・ダッシュ突進(werewolf/lab-zombie-2/ジャイアントバット/ハンター): 専用の当たり判定式が
//   別に存在しない(汎用の接触ダメージ)ため、敵の幅を経路の当たり半径として近似する。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。最小インターフェースにして
// フルの Enemy 型に依存しない(enemyCulling.ts と同じ方針)。
import { MIMIR_LASER_HALF_WIDTH } from './mimirLaserTrack';
// §6.38 B2b: distToSegmentはgeometry.ts(依存ゼロ)へ移設した(下のコメント参照)。既存の呼び出し側
// (gameStore.ts/angelBossTick.ts/combatTick.ts/idolTick.ts)は変更不要=ここから引き続き再exportする。
import { distToSegment } from './geometry';
export { distToSegment };
// §6.38 B2b: 鋏(bounty-balance)/舞妓(bounty-maiko)の技の寸法はbountyTick.tsが実体=単一の出どころ
// (社長指摘2026-08-14「写し定数はGIANT_STOMP_RADIUS_MIRRORが反面教師。実定数をexportして同一ソースを
// import」)。bountyTick.tsがdistToSegmentをgeometry.tsから直接importする形にしたことで循環が無くなり、
// ここから安全にimportできる。
import {
  BB_SWEEP_HALFWIDTH, BB_LEAP_RADIUS,
  MK_NAGINATA_HALFWIDTH, MK_SPIN_RADIUS, MK_SUIU_RADIUS, MK_SUIU_FINAL_RADIUS_MULT,
} from './bountyTick';

export interface TelegraphEnemy {
  type: string;
  x: number; y: number; width: number; height: number;
  aiPhase?: string;
  aiTargetX?: number; aiTargetY?: number;
  aiFromX?: number; aiFromY?: number; // M51: ジャイアント薙ぎ払いの始点(中心座標)に使用
  // M65: ジャイアントの踏み鳴らし/飛び掛かりの「実際に使う半径」(ステージ別倍率込み・windup開始時に
  // 敵へ確定済み)。付いていれば汎用の pumpkinExplosionRadius/giantStompRadius より優先して使う
  // (=シミュ側の命中判定・描画側の赤円と同じ値を読むことでドリフトを防ぐ。他タイプには影響しない)。
  gStompRadius?: number;
  gJumpRadius?: number;
  // PACING_PUZZLE.md §6.38 v6 C-3: bossState系(aiPhaseを使わないコントローラ=idol/賞金首等)の
  // 突進/レーザーもここで拾えるよう追加。aiPhase系との衝突は無い(別フィールド・別分岐)。
  bossState?: string;
}

const JUMP_TELEGRAPH_TYPES = new Set(['pumpkin', 'lab-zombie-3', 'giantbat', 'hunter']);
const DASH_TELEGRAPH_TYPES = new Set(['werewolf', 'lab-zombie-2', 'giantbat', 'hunter']);
// M51: ジャイアント新スクリプト(?giantscript=0で旧文字列'jump'/'windup'に戻るため上の2集合は無改変)。
// 新スクリプトは 'g-' 接頭辞の専用値を使うため、ここに別枠で追加する(他タイプの判定には影響しない)。
const GIANT_JUMP_TELEGRAPH_PHASES = new Set(['g-jump-windup', 'g-jump-air']);
const GIANT_SWEEP_TELEGRAPH_PHASES = new Set(['g-sweep-windup', 'g-sweep-active']);
// PACING_PUZZLE.md §6.38 v6 C-3: 賞金首(bossState系コントローラ=aiPhaseを使わない)の突進/レーザー。
// 型集合はbountyTick.tsがこのファイルのdistToSegmentをimportしているため複製する(循環回避)が、
// 半太さは実体(mimirLaserTrack.ts)を直接importする——写し定数(*_MIRROR)にしない
// (社長指摘2026-08-14「GIANT_STOMP_RADIUS_MIRRORは反面教師。実定数をexportして同一ソースをimport」)。
const BOUNTY_CHARGE_TELEGRAPH_TYPES = new Set(['bounty-melee']);
const BOUNTY_LASER_TELEGRAPH_TYPES = new Set(['bounty-ranged']); // = mimirLaserTrack.usesMimirLaserの対象と同値
// §6.38 B2b: 鋏(跳躍/薙ぎ払い)・舞妓(薙ぎ/薙ぎ連/水鳥)の型集合(同じ理由で複製=循環回避)。
const BOUNTY_LEAP_TELEGRAPH_TYPES = new Set(['bounty-balance']);
const BOUNTY_SWEEP_TELEGRAPH_TYPES = new Set(['bounty-balance']);
const BOUNTY_NAGINATA_TELEGRAPH_TYPES = new Set(['bounty-maiko']);
const BOUNTY_SPIN_TELEGRAPH_TYPES = new Set(['bounty-maiko']);
const BOUNTY_SUIU_TELEGRAPH_TYPES = new Set(['bounty-maiko']);
const BOUNTY_SUIU_HOP_STATES = new Set(['mk-suiu-hop1', 'mk-suiu-hop2', 'mk-suiu-hop3']);

export const isPlayerInAttackTelegraph = (
  player: { x: number; y: number; width: number; height: number },
  enemies: TelegraphEnemy[],
  pumpkinExplosionRadius: number,
  // M51: ジャイアント新スクリプトの新規テレグラフ(密着の踏み鳴らし/近の薙ぎ払い)。省略時はこの2つの
  // 判定を単に足さない(呼び出し側=旧テスト/ヘッドレスは既存動作のまま)。
  giantStompRadius?: number,
  giantSweepHalfWidth?: number,
): boolean => {
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  for (const e of enemies) {
    if (e.aiPhase === 'jump' && JUMP_TELEGRAPH_TYPES.has(e.type)) {
      const tx = (e.aiTargetX ?? e.x) + e.width / 2;
      const ty = (e.aiTargetY ?? e.y) + e.height / 2;
      if (Math.hypot(pcx - tx, pcy - ty) <= pumpkinExplosionRadius + pr) return true;
    } else if (
      e.aiPhase === 'windup' && DASH_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      const half = e.width / 2 + pr;
      if (distToSegment({ x: pcx, y: pcy }, { x: ex, y: ey }, { x: e.aiTargetX, y: e.aiTargetY }) <= half) return true;
    } else if (e.type === 'giantbat' && e.aiPhase !== undefined && GIANT_JUMP_TELEGRAPH_PHASES.has(e.aiPhase)) {
      const tx = (e.aiTargetX ?? e.x) + e.width / 2;
      const ty = (e.aiTargetY ?? e.y) + e.height / 2;
      // M65: ステージ別倍率込みで敵に確定済みのgJumpRadiusがあればそれを優先(無ければ従来どおり
      // pumpkinExplosionRadius=無倍率。パンプキン/lab-zombie-3/ハンターのjump分岐は上のJUMP_TELEGRAPH_TYPES
      // 側で処理済みでgJumpRadiusを持たないため、常に無倍率のまま=他タイプへの影響ゼロ)。
      const jumpR = e.gJumpRadius ?? pumpkinExplosionRadius;
      if (Math.hypot(pcx - tx, pcy - ty) <= jumpR + pr) return true;
    } else if (e.type === 'giantbat' && e.aiPhase === 'g-dash-windup' && e.aiTargetX !== undefined && e.aiTargetY !== undefined) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      const half = e.width / 2 + pr;
      if (distToSegment({ x: pcx, y: pcy }, { x: ex, y: ey }, { x: e.aiTargetX, y: e.aiTargetY }) <= half) return true;
    } else if (e.type === 'giantbat' && e.aiPhase === 'g-stomp-windup' && (e.gStompRadius ?? giantStompRadius) !== undefined) {
      // M65: ステージ別倍率込みで敵に確定済みのgStompRadiusがあればそれを優先(無ければ従来どおり
      // giantStompRadius=無倍率。両方省略時はこの分岐自体に入らず判定しない=既存動作を保つ)。
      const stompR = (e.gStompRadius ?? giantStompRadius)!;
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      if (Math.hypot(pcx - ex, pcy - ey) <= stompR + pr) return true;
    } else if (
      e.type === 'giantbat' && e.aiPhase !== undefined && GIANT_SWEEP_TELEGRAPH_PHASES.has(e.aiPhase) &&
      giantSweepHalfWidth !== undefined && e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      // 薙ぎ払いは aiFromX/Y・aiTargetX/Y の両方が中心座標(gameStore.ts の beginGiantMove('sweep'))。
      const fx = e.aiFromX ?? (e.x + e.width / 2), fy = e.aiFromY ?? (e.y + e.height / 2);
      if (distToSegment({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: e.aiTargetX, y: e.aiTargetY }) <= giantSweepHalfWidth + pr) return true;
    } else if (
      // PACING_PUZZLE.md §6.38 v6 C-3: 賞金首(bossState系)の突進/レーザーもここで拾う。
      e.bossState === 'bm-charge-windup' && BOUNTY_CHARGE_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      const half = e.width / 2 + pr; // werewolf系ダッシュと同じ近似(敵の幅を経路の当たり半径とする)
      if (distToSegment({ x: pcx, y: pcy }, { x: ex, y: ey }, { x: e.aiTargetX, y: e.aiTargetY }) <= half) return true;
    } else if (
      e.bossState === 'laser-windup' && BOUNTY_LASER_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      if (distToSegment({ x: pcx, y: pcy }, { x: ex, y: ey }, { x: e.aiTargetX, y: e.aiTargetY }) <= MIMIR_LASER_HALF_WIDTH + pr) return true;
    } else if (
      // §6.38 B2b: 鋏の跳びかかり(輸入=pumpkin。着地点=locked aiTargetX/Y=JUMP_TELEGRAPH_TYPESと同型)。
      e.bossState === 'leap-windup' && BOUNTY_LEAP_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      if (Math.hypot(pcx - e.aiTargetX, pcy - e.aiTargetY) <= BB_LEAP_RADIUS + pr) return true;
    } else if (
      // 鋏の薙ぎ払い(帯・aiFromX/Y→aiTargetX/Y)。
      e.bossState === 'bb-sweep-windup' && BOUNTY_SWEEP_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const fx = e.aiFromX ?? (e.x + e.width / 2), fy = e.aiFromY ?? (e.y + e.height / 2);
      if (distToSegment({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: e.aiTargetX, y: e.aiTargetY }) <= BB_SWEEP_HALFWIDTH + pr) return true;
    } else if (
      // 舞妓の毬の薙ぎ(単発/2連いずれも同じ帯判定)。
      (e.bossState === 'mk-naginata-windup' || e.bossState === 'mk-naginata1-windup' || e.bossState === 'mk-naginata2-windup')
      && BOUNTY_NAGINATA_TELEGRAPH_TYPES.has(e.type) && e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const fx = e.aiFromX ?? (e.x + e.width / 2), fy = e.aiFromY ?? (e.y + e.height / 2);
      if (distToSegment({ x: pcx, y: pcy }, { x: fx, y: fy }, { x: e.aiTargetX, y: e.aiTargetY }) <= MK_NAGINATA_HALFWIDTH + pr) return true;
    } else if (
      // 舞妓の毬回し(自分中心円=敵の現在位置が中心。跳躍/レーザーと異なりaiTargetXを使わない)。
      e.bossState === 'mk-spin-windup' && BOUNTY_SPIN_TELEGRAPH_TYPES.has(e.type)
    ) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      if (Math.hypot(pcx - ex, pcy - ey) <= MK_SPIN_RADIUS + pr) return true;
    } else if (
      // 舞妓の水鳥乱舞(各ホップの着地円=locked aiTargetX/Y。最終段のみ大円)。
      e.bossState !== undefined && BOUNTY_SUIU_HOP_STATES.has(e.bossState) && BOUNTY_SUIU_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const radius = e.bossState === 'mk-suiu-hop3' ? MK_SUIU_RADIUS * MK_SUIU_FINAL_RADIUS_MULT : MK_SUIU_RADIUS;
      if (Math.hypot(pcx - e.aiTargetX, pcy - e.aiTargetY) <= radius + pr) return true;
    }
  }
  return false;
};

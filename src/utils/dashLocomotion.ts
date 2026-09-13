// 刀の一閃(katanaDash)/ワイヤーアンカー(wireDash・wireHop)の「ロコモーション上書き」共通部品。
// research/GHOST_PARITY_LEDGER.md 裁定2(刀/ワイヤー=**共有方式**。簡易モデル禁止)+
// BOT_AND_GHOST.md §2.11補足のドクトリン「写すな、共通化しろ」。
//
// これまで gameStore.movePlayer にインラインで書かれていた「どの強制移動が優先か / その速度と
// 目標ベクトルは何か」を、**主語(オーナー)に依存しない純関数**として切り出した。プレイヤーは
// Player 直付けの状態、守護霊は Summon.ghostDash の状態を渡す=同じ1本の判定を通る。
//
// 掟: 値・優先順位・式は movePlayer にあった時から1つも変えていない(抽出リファクタのみ)。
//     store/PixiJS非依存(型importのみ)=ヘッドレスでテストできる。
import type { DashLocomotionState } from '../types/game';

/** 全ゼロの初期状態(プレイヤーの初期値/resetGame と同じ値)。 */
export const emptyDashState = (): DashLocomotionState => ({
  katanaDashUntil: 0,
  katanaDashDirX: 0,
  katanaDashDirY: 0,
  katanaDashCooldownEnd: 0,
  katanaRecoveryUntil: 0,
  wireAnchorX: 0,
  wireAnchorY: 0,
  wireAnchored: false,
  wirePlantUntil: 0,
  wireDashUntil: 0,
  wireDashSpeed: 0,
  wireStuckEnemyId: '',
  wireStuckUntil: 0,
  wireSlamEnemyId: '',
  wireSlamStart: 0,
  wireSlamFromX: 0,
  wireSlamFromY: 0,
  wireHopUntil: 0,
  wireHopTargetX: 0,
  wireHopTargetY: 0,
  wireHopSpeed: 0,
});

/**
 * 状態の読み出し(欠損=未使用の守護霊は全ゼロへフォールバック)。Player はこの型を満たすので
 * そのまま渡せる(=同じ関数がプレイヤーにも守護霊にも効く)。
 */
export const dashStateOf = (src: DashLocomotionState | undefined): DashLocomotionState =>
  src ? src : emptyDashState();

/**
 * 有効な上書きモード。null=上書きなし(通常移動)。
 * 優先順は movePlayer の元コードと同一: wireDash > wireHop > katanaDash > katanaRecovery。
 */
export type DashMode = 'wire-dash' | 'wire-hop' | 'katana-dash' | 'katana-recovery' | null;

export const dashModeAt = (st: DashLocomotionState, nowMs: number): DashMode =>
  nowMs < st.wireDashUntil ? 'wire-dash'
    : nowMs < st.wireHopUntil ? 'wire-hop'
      : nowMs < st.katanaDashUntil ? 'katana-dash'
        : nowMs < st.katanaRecoveryUntil ? 'katana-recovery'
          : null;

export interface DashOverride {
  /** 移動速度(px/s)。katana-recovery は 0(=その場で停止)。 */
  speed: number;
  /** 目標方向(未正規化。呼び出し側が正規化する=元の movePlayer と同じ手順)。 */
  tx: number;
  ty: number;
}

/**
 * 上書き中の速度と目標ベクトル。cx/cy = 主語の中心座標(ホーミング系はここから目標へ向け直す)。
 * katanaDashSpeed = KATANA_DASH_DISTANCE / (KATANA_DASH_MS / 1000)(定数は gameStore が持つため注入)。
 */
export const dashOverride = (
  st: DashLocomotionState,
  mode: Exclude<DashMode, null>,
  cx: number,
  cy: number,
  katanaDashSpeed: number,
): DashOverride => {
  switch (mode) {
    case 'wire-dash':
      return { speed: st.wireDashSpeed, tx: st.wireAnchorX - cx, ty: st.wireAnchorY - cy };
    case 'wire-hop':
      return { speed: st.wireHopSpeed, tx: st.wireHopTargetX - cx, ty: st.wireHopTargetY - cy };
    case 'katana-dash':
      return { speed: katanaDashSpeed, tx: st.katanaDashDirX, ty: st.katanaDashDirY };
    case 'katana-recovery':
      return { speed: 0, tx: 0, ty: 0 };
  }
};

/**
 * 1フレームの移動量(px)。プレイヤーは慣性 tau=0(PLAYER_INERTIA_TAU)で即応=
 * 「正規化した目標 × speed × dt」と同値なので、守護霊もこの同じ式で動かす。
 */
export const dashStep = (o: DashOverride, deltaTime: number): { dx: number; dy: number } => {
  const len = Math.hypot(o.tx, o.ty);
  if (len <= 0) return { dx: 0, dy: 0 };
  return { dx: (o.tx / len) * o.speed * deltaTime, dy: (o.ty / len) * o.speed * deltaTime };
};

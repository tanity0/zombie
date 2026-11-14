// SKILL_BUILD_REDESIGN.md §21(B5発注文)「枠光」の点灯判定(§12-2#11の叩き台どおり)。
// **視覚専用の純関数**——CLAUDE.md「視覚とヒットボックスの分離」と同じ扱いで、判定・数値には
// 一切影響しない。ここは点灯ロジックだけを固定する土台(実際の描画コンポーネントは★B5未決
// =SKILL_BUILD_REDESIGN.md §21-3参照。既存HUDに「ラン中ビルドの枠」表示が無いため未着手)。
//
// PixiJS import 禁止(renderer非依存)。プレイヤーの生値(player.health等)ではなく個々のプリミティブを
// 引数に取る=呼び出し側(HUDコンポーネント)がプリミティブ購読のまま渡せる形にしてある
// (CLAUDE.md「React re-render discipline」)。

export const BERSERKER_LIGHT_HP_FRAC = 0.7; // §12-2#11: バーサーカーはHP70%未満で点灯
export const OVERCLOCK_LIGHT_MS = 800;      // §12-2#11: オーバークロックはCDリセットproc発生から800ms点灯

export interface FrameLightState {
  lit: boolean;
  /** 0..1。lit=falseの時は常に0。 */
  intensity: number;
}

/**
 * バーサーカーの枠光(金)。HP70%未満で点灯、強度は失ったHP比率に比例
 * (ちょうど閾値で0→HP0で1への線形)。
 * 注意: バーサーカー本体のダメージ倍率(gameStore.ts側・失HP%そのもの)とは**別の値**。
 * 枠光の閾値(70%)はあくまで視覚の叩き台であり、ダメージ計算式を変えない
 * (CLAUDE.md「視覚とヒットボックスの分離」)。
 */
export const berserkerFrameLight = (
  hasBerserker: boolean,
  health: number,
  maxHealth: number,
): FrameLightState => {
  if (!hasBerserker || maxHealth <= 0) return { lit: false, intensity: 0 };
  const hpFrac = Math.max(0, Math.min(1, health / maxHealth));
  if (hpFrac >= BERSERKER_LIGHT_HP_FRAC) return { lit: false, intensity: 0 };
  const intensity = Math.max(0, Math.min(1, (BERSERKER_LIGHT_HP_FRAC - hpFrac) / BERSERKER_LIGHT_HP_FRAC));
  return { lit: true, intensity };
};

/**
 * オーバークロックの枠光(青)。`lightUntil`(proc発生時にstore側が `gameTime + OVERCLOCK_LIGHT_MS`
 * で立てる・player.overclockLightUntil)を過ぎるまで点灯。gameTime基準なのでポーズ中は一緒に止まる
 * (他の *Until 系状態フィールドと同じ挙動)。
 */
export const overclockFrameLit = (
  hasOverclock: boolean,
  lightUntil: number,
  gameTime: number,
): boolean => hasOverclock && gameTime < lightUntil;

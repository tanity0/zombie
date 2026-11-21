// UNIQUE_WEAPONS.md §16-2/§16-3b/§16-5(バッチD「シグナルランチャー」glauncher-t3-signal)。
// PHILL銃のターゲットサイトを流用した手動専用銃(オート射撃なし)。指を離した瞬間の地点を
// 記録 → 900ms後にその地点へ空爆(追尾しない・置き撃ち)。
//
// 状態そのもの(SignalStrike[])は gameStore.ts が持つ(goldRings/iceLanceFloorsと同じ役割分担)。
// ここは店・PixiJS 非依存の定数とサイクルDPSだけ(ヘッドレスでテスト可能)。

export const SIGNAL_STRIKE_DELAY_MS = 900; // 記録→着弾までの遅延(死に時間としてcooldownへ畳んで測る)
export const SIGNAL_STRIKE_RADIUS_PX = 160; // 空爆の範囲
// UNIQUE_WEAPONS.md §16-5c(バッチD検収A-2是正): 社長仕様「高い体勢値削り」。パイルドライバーの
// 'heavy'(比率0.10)を基準に、それより高い意味で1.5倍(=damageEnemyのpostureImpactMult)。
export const SIGNAL_POSTURE_MULT = 1.5;

/** 空爆1回ぶんの記録(gameStore.signalStrikesの要素)。 */
export interface SignalStrike {
  id: string;
  x: number;
  y: number;
  dueAt: number; // gameTime。この時刻に着弾する
  damage: number; // 発射時点で確定させた素ダメージ(スキル倍率込み)
}

/**
 * 1サイクル(空爆3発)の実効DPS(UNIQUE_WEAPONS.md §5-2)。
 * 着弾遅延900msは撃てない時間なのでcooldownへ足して測る(ロケランの溜めと同じ扱い)。
 */
export const signalCycleDps = (
  damage: number,
  cooldownMs: number,
  delayMs: number,
  magSize: number,
  reloadMsRaw: number,
): number => {
  const effectiveReloadMs = Math.max(250, reloadMsRaw * 2);
  const effectiveCooldown = cooldownMs + delayMs;
  const totalDamage = damage * magSize;
  const cycleMs = effectiveCooldown * magSize + effectiveReloadMs;
  return (totalDamage / cycleMs) * 1000;
};

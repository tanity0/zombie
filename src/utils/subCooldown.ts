// BOT_AND_GHOST.md §2.8 G2.6「CD正規化」: サブウェポンCDに乗る2スキル(オーバークロック→
// タイムキーパー)の適用を1つの純関数へ寄せる。従来は合流点(gameStore.setSubWeaponCooldown)と
// 手動実装2本(sensor-mine=チャージ制 / support-sniper=専用タイマー)が同じ2効果を別々に
// 再実装していた(research/SKILL_EQUIP_LEDGER.md §A-0)。挙動は1msも変えない:
// - 抽選条件: deltaMs > 0 の時だけ乱数を消費(従来の合流点と同一。sensor-mine/support-sniperは
//   実CDが常に正なので、従来の無条件抽選とも等価)。
// - 成立(オーバークロック)= CDを付けない(deltaMs 0)。
// - 不成立 = タイムキーパー倍率を残りΔへ乗算(mult===1 や Δ<=0 の時は値を素通し=従来と同じ分岐)。
// recordOverclockProc 等の計測(副作用)は呼び出し側に残す(純関数を保つ)。

export interface SubCooldownSkillsResult {
  /** オーバークロック成立(CDを付けない)。呼び出し側で recordOverclockProc() を呼ぶこと。 */
  overclockProc: boolean;
  /** 適用後のCD残り(ms)。overclockProc 時は 0。 */
  deltaMs: number;
}

export const applySubCooldownSkills = (
  overclockChance: number,
  cooldownMult: number,
  deltaMs: number,
  rand: () => number = Math.random,
): SubCooldownSkillsResult => {
  if (deltaMs > 0 && rand() < overclockChance) {
    return { overclockProc: true, deltaMs: 0 };
  }
  return {
    overclockProc: false,
    deltaMs: cooldownMult !== 1 && deltaMs > 0 ? deltaMs * cooldownMult : deltaMs,
  };
};

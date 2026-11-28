// 永続育成「強化」の数値のうち、サーバ(ビルド無しで .mjs を読む)とも共有する分の正本。
// src/data/playerUpgrades.ts の台帳がここを読み、shared/ghostSanitize.mjs(他人の守護霊の正規化)の
// 上限もここから導く=1段の伸びや段数上限を変えた時に、守護霊の上限だけ旧値で残る事故を防ぐ。

/** 各系統の上限段数(= PLAYER_UPGRADE_MAX_LEVEL)。 */
export const PLAYER_UPGRADE_MAX_LEVEL = 5;

/** 攻撃力の1段あたり(倍率へ足す割合)。 */
export const PLAYER_UPGRADE_ATTACK_PER_LEVEL = 0.10;

/** カウンター受付の1段あたり(秒)。 */
export const PLAYER_UPGRADE_COUNTER_PER_LEVEL_SEC = 0.03;

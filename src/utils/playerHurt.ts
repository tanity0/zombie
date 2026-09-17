// ★プレイヤーの被弾リアクションの段(社長裁定2026-09-16「一旦aでやってみよう」)。
//
// なぜ「出す/出さない」ではなく「段」なのか(社長指摘「敵は体勢値、プレイヤーは無敵時間があるので
// 分けないとあかん」):
//  - **敵**は体勢値(bossPosture)が「怯まない程度か否か」を既に決めている。そこへHP割合のしきい値を
//    足すと、同じことを決める仕組みが2本になる。だから**敵側は触らない**。
//  - **プレイヤー**は無敵1秒があるので、そもそも1秒に1回しか怯まない。**連発は起きない**ので、
//    間引く(出す/出さない)必要が無い。足りないのは**強弱の段**だった——素の状態でも被弾量は
//    6〜141(最大HP120)まで開くのに、反応が1種類しかなかった。
//
// ★案(b)「軽い被弾では怯まない」へ倒したくなったら、**下の表の軽段 crouchMs を 0 にする**だけでよい
// (0なら窓が開かない=しゃがみが出ない。ストップとノックは従来どおり残る)。

/**
 * 1段ぶんの反応。crouchMs=しゃがみ絵を出す長さ / stopMs=ヒットストップの長さ /
 * gunLockMs=**銃が撃てない長さ**(社長裁定2026-09-16「はい」=被弾の復帰ディレイ)。
 */
export interface PlayerHurtReaction {
  crouchMs: number;
  stopMs: number;
  gunLockMs: number;
  /** ★移動そのものを止める尺(社長指示2026-09-17「食らった重さ」)。のけぞりより短い=前半だけ動けない。 */
  moveLockMs: number;
  /** ★吹き飛びの速さの倍率(社長指示2026-09-17「慣性で吹き飛ぶ感じ」)。基準=`PLAYER_KNOCKBACK_SPEED`。 */
  kbSpeedMult: number;
  /** ★吹き飛びの尺。重い一撃ほど長く飛ぶ(減衰は既存の線形=初速最大→0で慣性になる)。 */
  kbMs: number;
}

/** 段の境目(被弾量 ÷ 最大HP)。この値**以上**で次の段へ上がる。 */
export const PLAYER_HURT_TIER_FRACS = [0.08, 0.20] as const;

/**
 * 段ごとの反応(叩き台・実機で調整)。最大HP120なら 軽=〜9 / 中=10〜23 / 重=24〜。
 * 素の敵の攻撃力(コウモリ6・骸骨8・ゾンビ10・人狼12・パンプキン16)だと、
 * **浅い所では軽〜中・深い所や色つきでは重**へ自然に寄る。
 */
// ★社長指示2026-09-17「**こっちが食らった感じが軽い。食らった重さがほしい。エルデンリングをまねてみて**」。
// エルデンリングの被弾は**①のけぞりが長い(0.4〜0.8秒)②その間は本当に何もできない③画面が揺れる**。
// 旧値は「絵は300ms崩れるが、銃だけ止まって移動はできる」=**体勢を崩された感じが出ていなかった**。
// ⇒ **尺を約1.7倍に伸ばし、`moveLockMs`(移動そのものを止める)を新設**して「動けない」を作る。
// ★移動を止める尺は**のけぞりより短くする**——全部止めると「操作を奪われた」になる(理不尽)。
//   **前半は動けない・後半は動けるが撃てない**、という二段の抜け方にする。
// ★近接/カウンターは**止めない**(下の理由=近接とパリィが同じ入力なので、止めると死の連鎖になる)。
// ★社長指示2026-09-17(2回目)「**食らった時、まだ軽い。もう少し長くしゃがんで動けないストップ入れて、
// 慣性で吹き飛ぶ感じ**」。⇒ ①しゃがみを更に伸ばす ②動けない時間を大きく伸ばす
// ③**吹き飛びを段ごとに重くする**(旧は全段一律 460px/s・260ms で、軽い一撃も重い一撃も同じ飛び方だった)。
// ★順序の設計: **吹き飛ぶ(慣性) → 着地しても動けない → 動けるが撃てない → 復帰**。
//   `moveLockMs` は `kbMs` より長くする(飛んでいる間+着地後の溜め)。`gunLockMs` は更に長い。
export const PLAYER_HURT_TIERS: readonly PlayerHurtReaction[] = [
  { crouchMs: 420,  stopMs: 70,  gunLockMs: 420,  moveLockMs: 260, kbSpeedMult: 0.7, kbMs: 200 },  // 軽: かすった
  { crouchMs: 700,  stopMs: 120, gunLockMs: 700,  moveLockMs: 460, kbSpeedMult: 1.0, kbMs: 320 },  // 中: まともに食らった
  { crouchMs: 1000, stopMs: 190, gunLockMs: 1000, moveLockMs: 700, kbSpeedMult: 1.5, kbMs: 420 },  // 重: 保たない一撃
];

/** 被弾量と最大HPから段(0=軽 / 1=中 / 2=重)を返す。 */
export const playerHurtTier = (damage: number, maxHealth: number): 0 | 1 | 2 => {
  const hp = Math.max(1, maxHealth); // 0除算と負値を潰す(最大HPは成長で動く)
  const frac = Math.max(0, damage) / hp;
  if (frac >= PLAYER_HURT_TIER_FRACS[1]) return 2;
  if (frac >= PLAYER_HURT_TIER_FRACS[0]) return 1;
  return 0;
};

/** 段の反応を引く。範囲外の段は軽へ丸める(セーブ跨ぎ等で壊れた値が来ても落ちない)。 */
export const playerHurtReactionOf = (tier: number | undefined): PlayerHurtReaction =>
  PLAYER_HURT_TIERS[tier === 1 || tier === 2 ? tier : 0];

// ---------------------------------------------------------------------------------------------
// ★被弾の復帰ディレイ(社長指示2026-09-16「食らった時に多少動けるようになるのにディレイが
//   お互いに必要な気がする」→「はい」)
// ---------------------------------------------------------------------------------------------
// 食らっても**行動の選択肢が1つも減っていなかった**のが、重圧が出ない原因だった。被弾で止まるのは
// ①全体ヒットストップ(40/70/110ms=世界ごと止まるのでお互い様)②ノックバックの滑り(260ms・移動だけ)
// ③しゃがみの絵(180/300/460ms・絵だけ)の3つで、**撃ちながら食らって撃ち続けられた**。
//
// ★止めるのは「移動」ではなく「銃」。移動を止めると「操作を奪われた」に感じるが、攻撃を止めると
// 「体勢を崩された」に感じる(前者は理不尽・後者は納得)。**長さはしゃがみの絵と同じ**にして、
// 絵と実態を一致させる(いままで絵だけが大げさに嘘をついていた)。
//
// ★近接/カウンターは**止めない**。このゲームでは近接の一振りとカウンター窓は**同じ入力**
// (`beginMeleeSwing` が窓とCDと絵を同時に開く)なので、近接を止めるとパリィまで止まる=
// 食らった直後に弾けなくなり、死の連鎖になる。守りは常に即応のまま、が現状の設計。
/**
 * ★被弾直後の「動けない」窓(社長指示2026-09-17「食らった重さがほしい。エルデンリングをまねて」)。
 * のけぞり(`gunLockMs`)より**短い**=前半だけ本当に動けず、後半は動けるが撃てない。
 */
export const isHurtMoveLocked = (
  p: { lastHurtAt?: number; lastHurtTier?: 0 | 1 | 2 },
  nowMs: number,
): boolean => {
  if (p.lastHurtAt === undefined) return false;
  return nowMs - p.lastHurtAt < playerHurtReactionOf(p.lastHurtTier).moveLockMs;
};

export const isHurtGunLocked = (
  p: { lastHurtAt?: number; lastHurtTier?: 0 | 1 | 2 },
  nowMs: number,
): boolean => {
  if (p.lastHurtAt === undefined) return false;
  const ms = playerHurtReactionOf(p.lastHurtTier).gunLockMs;
  if (ms <= 0) return false;
  const since = nowMs - p.lastHurtAt;
  return since >= 0 && since < ms;
};

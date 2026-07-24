// 空輸弾薬(エアドロップ)の判定・配置ロジック。useGameLoop.ts の直書き(旧7954-8001行付近)から
// 挙動保存で切り出した純関数(v0.25.2172)。実プレイ(useGameLoop.ts)とヘッドレス(playtestDriver.ts)の
// 両方がこの同じ関数を使うことで、テスト基盤にエアドロップ経路を移植する(挙動は1つも変えない)。
// レンダラ非依存・乱数は引数のrngで注入(テスト可能)。
//
// 元ロジック(useGameLoop.ts): 初回50-60s後、以後75-105s間隔、同時最大1個(worldDropのammo-*ピック
// アップ数で判定)、プレイヤーから1.1-1.6画面ぶんの画面外ランダム方位に配置、弾種は構え銃70%/
// 所持からランダム30%。チュートリアル中・ナイフマスター所持時は発生しない。

import type { AmmoType } from '../types/game';

export const AIRDROP_MAX_WORLD_DROPS = 1;
export const AIRDROP_FIRST_DELAY_MIN_MS = 50000;
export const AIRDROP_FIRST_DELAY_RANGE_MS = 10000; // 初回: 50-60s
export const AIRDROP_REPEAT_DELAY_MIN_MS = 75000;
export const AIRDROP_REPEAT_DELAY_RANGE_MS = 30000; // 以後: 75-105s
export const AIRDROP_DIST_MIN_MULT = 1.1;
export const AIRDROP_DIST_RANGE_MULT = 0.5; // 配置距離: 画面半対角×(1.1-1.6)
export const AIRDROP_EQUIPPED_WEIGHT = 0.7; // 弾種: 構え銃70%/所持ランダム30%

export interface AirdropTickInput {
  tutorialStage: boolean;   // チュートリアル中は発生しない(社長指示v0.25.1818)
  knifeMaster: boolean;     // ナイフマスターは弾薬ドロップ0%(社長指示)
  gameTime: number;
  worldAmmoCount: number;   // 現在フィールドにあるworldDrop弾薬(ammo-*)ピックアップ数
  lastAmmoDropAt: number;   // 呼び出し側refの現在値(前回投下時刻。未投下は0)
  nextAmmoDropDelayMs: number; // 呼び出し側refの現在値(0=未初期化=初回ロール前)
  playerX: number; playerY: number; playerWidth: number; playerHeight: number;
  boundsWidth: number; boundsHeight: number;
  ownedAmmoTypes: AmmoType[]; // 所持銃の弾種(getGuns(player).map(w => w.ammoType)相当)
  equippedAmmo?: AmmoType;
  rng: () => number; // Math.random互換([0,1))。呼び出し順は元コードと同一に保つこと
}

export interface AirdropSpawn {
  x: number;
  y: number;
  ammoType: AmmoType;
}

export interface AirdropTickResult {
  // 呼び出し側は毎tick、この値で nextAmmoDropDelayMs の ref を更新すること
  // (spawn有無に関わらず。元コードの「0なら初期化してから判定に使う」を再現するため)。
  nextAmmoDropDelayMs: number;
  spawn: AirdropSpawn | null;
}

export const shouldSpawnAirdrop = (input: AirdropTickInput): AirdropTickResult => {
  // 初回の遅延レンジ抽選(元コード: nextAmmoDropDelayRef.current === 0 の時だけ・毎tick評価だが
  // 一度セットされたら二度と0に戻らないので実質1回きり)。
  let delay = input.nextAmmoDropDelayMs;
  if (delay === 0) {
    delay = AIRDROP_FIRST_DELAY_MIN_MS + input.rng() * AIRDROP_FIRST_DELAY_RANGE_MS;
  }

  if (
    input.tutorialStage ||
    input.worldAmmoCount >= AIRDROP_MAX_WORLD_DROPS ||
    input.knifeMaster ||
    !(input.gameTime - input.lastAmmoDropAt > delay)
  ) {
    return { nextAmmoDropDelayMs: delay, spawn: null };
  }

  // プレイヤーから見て画面外(1.1-1.6画面)のランダム方位に配置。
  const angle = input.rng() * Math.PI * 2;
  const halfMax = Math.max(input.boundsWidth, input.boundsHeight) / 2;
  const dist = halfMax * (AIRDROP_DIST_MIN_MULT + input.rng() * AIRDROP_DIST_RANGE_MULT);
  const px = input.playerX + input.playerWidth / 2 + Math.cos(angle) * dist;
  const py = input.playerY + input.playerHeight / 2 + Math.sin(angle) * dist;

  // 弾種: 構え銃70%、外れたら(または未構え)所持からランダム30%。
  const ammoType: AmmoType = input.equippedAmmo && input.rng() < AIRDROP_EQUIPPED_WEIGHT
    ? input.equippedAmmo
    : input.ownedAmmoTypes[Math.floor(input.rng() * input.ownedAmmoTypes.length)];

  const nextDelay = AIRDROP_REPEAT_DELAY_MIN_MS + input.rng() * AIRDROP_REPEAT_DELAY_RANGE_MS;
  return { nextAmmoDropDelayMs: nextDelay, spawn: { x: px, y: py, ammoType } };
};

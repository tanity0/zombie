/**
 * ★攻撃射程を保つ層(PACING_PUZZLE.md §16-B・社長指示2026-09-17
 * 「**一定距離まできたら近づいてくるのをやめさせたい…台本とは別に攻撃射程を保つようにしたい。
 * それぞれ。保ち方はやはり半分の速度で円展開、後ろに下がるなど。ここはヒステリシスでいいです**」)。
 *
 * ★**技(台本)が動いていない平常時の移動だけ**に掛かる層。技が始まったら台本が移動を全部持つ。
 * ★**`aiPhase` を使わない**(§16-B B-9 Q-2)。bat/skeleton の枠の申告条件が
 * `aiPhase === undefined` なので、ここで相を立てると**枠を申告できなくなり技が一切出なくなる**。
 * ⇒ **速度の合成だけ**で表現する。
 *
 * ★**既に自分の間合いを持っている型には掛けない**(ゾンビ200/100・ゴースト220・叫喚260・
 * 削岩型190/130・伐採人150/110・賞金首・トール・アクラシエル)。整合監査でこの一覧は実コードと
 * 突き合わせ済み。**「無い型にだけ足す」**のがこの層の設計。
 */
import type { EnemyType } from '../types/game';
import { idRespawnUnitHash } from './chaffMoves';

/** 保ち方(§16-B B-2)。**全員同じにしない**——均質は「AIっぽさ」の筆頭(CLAUDE.md)。 */
export type KeepStyle = 'orbit' | 'creep';

export interface KeepBand {
  /** 外側(これより遠ければ今までどおり詰める)。その型の技の発動距離から引く。 */
  outer: number;
  /** 内側(これより近ければ下がる)。外側 × 0.75。 */
  inner: number;
  style: KeepStyle;
}

/** 保つ間の速さ(素の速度に対する倍率)。 */
export const KEEP_ORBIT_SPEED_MULT = 0.5;   // 社長「半分の速度で円展開」
export const KEEP_CREEP_SPEED_MULT = 0.35;  // 社長「パンプキンはCD中はじりじり距離を取る」
/** 内側を割った時に下がる速さ。★プレイヤーの実効速度を超えさせない(§16-B B-4・監査A-7)。 */
export const KEEP_BACKOFF_SPEED_MULT = 0.9;
/** ヒステリシスの幅(内側 = 外側 × これ)。1つの閾値だと境界で毎フレーム震える。 */
export const KEEP_INNER_RATIO = 0.75;
/** 好み半径の散らし幅(帯の中で個体ごとにずらす。同じ型が同じ輪に並ぶと壁になる=監査A-8)。 */
export const KEEP_PREFER_JITTER = 0.8;

const SALT_PREFER = 0x6b2a;
const SALT_SPIN = 0x6b2b;
const SALT_ESCAPE = 0x6b2c;

/**
 * ★**真上に重なった時(距離ほぼゼロ)の逃げ方向**。パンプキンの跳躍は
 * **プレイヤー中心を狙って着地する**ので距離が厳密に0になり、「的へ向かう向き」が定義できず
 * その場に固まる(実測2026-09-17: 着地後30秒ずっと0px=社長の言う「張り付いてるバカみたいなの」)。
 * 個体ごとに固定の角度を割り当てて、必ずどこかへ抜ける。
 */
export const KEEP_DEGENERATE_PX = 1;
export const keepEscapeDir = (id: string, spawnedAt: number | undefined): { x: number; y: number } => {
  const a = idRespawnUnitHash(id, spawnedAt, SALT_ESCAPE) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

/**
 * 型ごとの外側の距離。**既存の定数から引く**(新しい距離を発明しない・§16-B B-3)。
 * 値の出どころは呼び出し側が渡す(このファイルが gameStore/chaffMoves へ依存しないため)。
 */
export const KEEP_STYLE_BY_TYPE: Partial<Record<EnemyType, KeepStyle>> = {
  bat: 'orbit',
  skeleton: 'orbit',
  werewolf: 'orbit',
  'lab-zombie-2': 'orbit',
  pumpkin: 'creep',
  'lab-zombie-3': 'creep',
  // ★リッチは「離れ方」がワープ(§16-B B-5)だが、**離れた後に保つ**のはこの層の仕事
  // (社長「CD中は例のヒステリシスで」)。外側は `LICH_KEEP_RADIUS_PX`(=着地距離)を渡す。
  lich: 'orbit',
};

/**
 * ★切替ツマミ `?keeprange=0`(このプロジェクトの作法=切り分け用のURLツマミは先に用意する)。
 * 層を丸ごと切って**入れる前と同じ動き**に戻せる。実機で「これのせいか」を1回で確かめられる。
 */
export const KEEP_RANGE_ON: boolean = (() => {
  if (typeof window === 'undefined') return true;
  try { return new URLSearchParams(window.location.search).get('keeprange') !== '0'; } catch { return true; }
})();

/** この型はこの層の対象か。 */
export const hasKeepRange = (type: EnemyType): boolean =>
  KEEP_RANGE_ON && KEEP_STYLE_BY_TYPE[type] !== undefined;

/**
 * 個体ごとの帯。**好み半径を帯の中で散らす**ので、同じ型でも止まる位置が揃わない。
 * `outerPx` はその型の技の発動距離(呼び出し側が既存定数から渡す)。
 */
export const keepBandFor = (
  type: EnemyType, id: string, spawnedAt: number | undefined, outerPx: number,
): KeepBand | null => {
  const style = KEEP_STYLE_BY_TYPE[type];
  if (style === undefined) return null;
  // 好み半径: 帯の真ん中を中心に ±(帯幅の40%) ぶら下げる。
  const inner0 = outerPx * KEEP_INNER_RATIO;
  const mid = (outerPx + inner0) / 2;
  const half = (outerPx - inner0) / 2;
  const u = idRespawnUnitHash(id, spawnedAt, SALT_PREFER) * 2 - 1;   // -1..1
  const prefer = mid + u * half * KEEP_PREFER_JITTER;
  return { outer: prefer + half, inner: prefer - half, style };
};

/** 回る向き(個体ごとに固定)。全員が同じ向きに回ると隊列が同期して不自然になる。 */
export const keepSpin = (id: string, spawnedAt: number | undefined): 1 | -1 =>
  idRespawnUnitHash(id, spawnedAt, SALT_SPIN) < 0.5 ? 1 : -1;

/**
 * ★**帯の内側に居る間は技を出さない**(§16-B B-10・実測2026-09-17で判明した設計の穴)。
 * これが無いと、技の引き金が帯より手前でも成立する型は**下がり切る前に技を出し直して
 * その場に居座る**(パンプキンの引き金は `dist > 12` なので、着地直後の18pxから跳び続けた)。
 * 引き金の**上限(発動距離)は1ビットも変えない**——**下限を帯の内側に合わせるだけ**。
 */
export const keepBlocksTechnique = (
  type: EnemyType, id: string, spawnedAt: number | undefined, outerPx: number, distance: number,
): boolean => {
  if (!hasKeepRange(type)) return false;
  const band = keepBandFor(type, id, spawnedAt, outerPx);
  return band !== null && distance < band.inner;
};

export interface KeepResult { tvx: number; tvy: number; zone: 'approach' | 'keep' | 'backoff' }

/**
 * 保つ層の速度。**詰める帯では何もしない**(呼び出し側の `tvx/tvy` をそのまま返す)ので、
 * 遠い時の挙動は1ビットも変わらない。
 *
 * @param ux,uy  的へ向かう単位ベクトル
 * @param speed  その個体の素の実効速度(既に各種倍率が乗ったもの)
 * @param playerSpeed 後退の上限(プレイヤーの実効速度)。これを超えて下がらない=歩いて追いつける。
 */
export const keepRangeVelocity = (
  tvx: number, tvy: number,
  ux: number, uy: number, distance: number,
  speed: number, band: KeepBand, spin: 1 | -1, playerSpeed: number,
): KeepResult => {
  if (distance > band.outer) return { tvx, tvy, zone: 'approach' };
  if (distance < band.inner) {
    // 下がる。★プレイヤーより速く退かない(退かれると歩きでは永遠に届かない)。
    const back = Math.min(speed * KEEP_BACKOFF_SPEED_MULT, playerSpeed);
    return { tvx: -ux * back, tvy: -uy * back, zone: 'backoff' };
  }
  // 保つ。★帯の中の好み半径へ寄せる放射補正を足す(2閾値だけだと、円の弦を進むぶん距離が
  // 増えて外側を跨ぎ続け、**状態が毎フレーム震える**=デッドバンド。監査A-5)。
  const mid = (band.outer + band.inner) / 2;
  const err = (distance - mid) / Math.max(1, (band.outer - band.inner) / 2); // -1..1
  const radial = Math.max(-1, Math.min(1, err));
  const keepSpeed = speed * (band.style === 'creep' ? KEEP_CREEP_SPEED_MULT : KEEP_ORBIT_SPEED_MULT);
  if (band.style === 'creep') {
    // じりじり下がる: 接線は使わず、**外へゆっくり**。好み半径より内側なら下がり、外側なら止まる。
    const away = radial < 0 ? -radial : 0;
    return { tvx: -ux * keepSpeed * away, tvy: -uy * keepSpeed * away, zone: 'keep' };
  }
  // 円展開: 接線主体 + 好み半径への放射補正。
  const tx = -uy * spin, ty = ux * spin;
  // ★符号に注意(テストで1度間違えて捕まえた): `ux` は**的へ向かう**向き。
  // 好み半径より**外側**(radial>0)なら**内へ寄る**=`+ux`。内側(radial<0)なら外へ逃げる。
  const bx = tx + ux * radial * 0.6;
  const by = ty + uy * radial * 0.6;
  const bl = Math.max(0.001, Math.hypot(bx, by));
  return { tvx: (bx / bl) * keepSpeed, tvy: (by / bl) * keepSpeed, zone: 'keep' };
};

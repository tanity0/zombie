// 武将の祠(research/POI_TOUCH_SHRINE.md §2/§3・SKILL_BUILD_REDESIGN.md §13-5)。
// 3種=鎧(body)/小手(arms)/兜(accessory)。祠の手前の円に3秒とどまると、その部位の武将装備を装備する
// (社長裁定2026-11-02「いつもの3秒サークル」・1ラン1回・取ったら消える)。
//
// この層は renderer-agnostic(PixiJS非依存)。位置・当たり判定・割り当ての純関数だけ。
// 付与は gameStore、描画は pixiScene がここの値を読む。
import type { EquipSlot } from '../types/game';
import { footRect, resolveAabb, type Rect } from './obstacles';
import { POI_SECTORS } from './pois';
import { sectorAngle, DETOUR_CIRCLE_RADIUS, DETOUR_DWELL_MS, DETOUR_CIRCLE_FRONT_OFFSET } from './detourPoi';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';

export type ShrineSlot = EquipSlot; // 'body' | 'arms' | 'accessory'
export const SHRINE_SLOTS: readonly ShrineSlot[] = ['body', 'arms', 'accessory'];

/** 絵(社長支給 v0.25.3217)。鎧=poi-yoroi / 小手=poi-kote / 兜=poi-kabuto。 */
export const SHRINE_TEXTURE: Record<ShrineSlot, string> = {
  body: 'poi-yoroi', arms: 'poi-kote', accessory: 'poi-kabuto',
};

// 距離=未確認汚染帯(AREA_THRESHOLDS[2]〜[3]=距離の倍率込みで 7500〜11250)の25/50/75%(§13-5・部位ごとに固定。乱数は方角だけ)。
// 「深さ=価値」= 救済ではなく強化なので深くてよい。寄り道(デンジャー帯 5250/6000/6750)とは帯が違う=同じセクターでも衝突しない。
// (品質監査A1: 素の値 5000/2500 を直書きすると距離の倍率 v0.25.4293 を外れてデンジャー帯に入っていた)
const UNCONFIRMED_LO = AREA_THRESHOLDS[2];
const UNCONFIRMED_SPAN = AREA_THRESHOLDS[3] - AREA_THRESHOLDS[2];
export const SHRINE_DIST: Record<ShrineSlot, number> = {
  body: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.25,      // ≈8438
  arms: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.5,       // 9375
  accessory: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.75, // ≈10313
};

/** 見た目の高さ(px・等倍時)。寄り道の建物(188)より一回り小さい祠。 */
export const SHRINE_DISPLAY_H = 170;
/** 当たり判定=土台(段)だけ。絵(約460〜500×580〜630)の下の段の幅に合わせる。 */
export const SHRINE_HITBOX_W = 96;
export const SHRINE_HITBOX_H = 30;
/** 取った後のフェードアウト(ms)。 */
export const SHRINE_FADE_MS = 900;

export interface ShrineState {
  slot: ShrineSlot;
  x: number;
  y: number;
  /** 取った時刻(gameTime)。未取得は undefined。 */
  takenAt?: number;
}

/**
 * 3種を、**寄り道3種が実際に使った3セクター**(detourSectors)へ**独立にシャッフルで1つずつ**割り当てる
 * (assignDetourSectors と同型・rng注入)。結果として各寄り道セクターに寄り道1+祠1が同居する(距離帯が違うので衝突しない)。
 * 裏ボスがいるステージでは寄り道が裏ボスのセクターを避けているので祠も避ける。いないステージ(4つ中3つを寄り道が使う)
 * でも祠は寄り道と同じ3つ(§16-9#1)。detourSectors を渡さない時は裏ボス以外の全セクター(テスト用)。
 */
export const assignShrineSectors = (
  bossSector: number | null,
  rand: () => number = Math.random,
  detourSectors?: readonly number[],
): Record<ShrineSlot, number> => {
  const pool: number[] = [];
  if (detourSectors && detourSectors.length >= 3) pool.push(...detourSectors.slice(0, 3));
  else for (let i = 0; i < POI_SECTORS; i++) if (i !== bossSector) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const [body, arms, accessory] = pool;
  return { body, arms, accessory };
};

export const shrinePosForSector = (slot: ShrineSlot, sector: number, offsetRad = 0): { x: number; y: number } => {
  const a = sectorAngle(sector) + offsetRad;
  const d = SHRINE_DIST[slot];
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
};

/** 土台の当たり判定(足元基準)。 */
export const shrineRect = (s: { x: number; y: number }): Rect => footRect(s.x, s.y, SHRINE_HITBOX_W, SHRINE_HITBOX_H);

const isLive = (s: ShrineState): boolean => s.takenAt === undefined;

/** 祠の土台で移動を解決する。取った祠は消えるので素通り。遠い祠は判定しない。 */
export const resolveShrineCollision = (rect: Rect, shrines: readonly ShrineState[]): { x: number; y: number } => {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const walls: Rect[] = [];
  for (const s of shrines) {
    if (!isLive(s)) continue;
    if (Math.abs(cx - s.x) > 600 || Math.abs(cy - s.y) > 600) continue;
    walls.push(shrineRect(s));
  }
  if (walls.length === 0) return { x: rect.x, y: rect.y };
  return resolveAabb(rect, walls);
};

// ---- 3秒サークル(社長裁定2026-11-02「いつもの3秒サークル」=寄り道の旧方式と同じ値・同じ置き方) ----
export const SHRINE_CIRCLE_RADIUS = DETOUR_CIRCLE_RADIUS; // 95
export const SHRINE_DWELL_MS = DETOUR_DWELL_MS;           // 3000
/** サークルが出はじめる距離(中心から)。病院の旧 HOSPITAL_CIRCLE_REVEAL_DIST と同じ。 */
export const SHRINE_CIRCLE_REVEAL_DIST = 340;
/** 円の中心=祠の足元の手前(+Y)。当たり判定(土台)と重ならない。 */
export const shrineCircleCenter = (s: { x: number; y: number }): { x: number; y: number } =>
  ({ x: s.x, y: s.y + DETOUR_CIRCLE_FRONT_OFFSET });

/** プレイヤー(矩形の中心)が入っている、まだ取っていない祠の円(無ければ null)。 */
export const shrineCircleAt = (
  player: Rect, shrines: readonly ShrineState[],
): ShrineState | null => {
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  for (const s of shrines) {
    if (!isLive(s)) continue;
    const c = shrineCircleCenter(s);
    if (Math.hypot(px - c.x, py - c.y) <= SHRINE_CIRCLE_RADIUS) return s;
  }
  return null;
};

/** 滞在の進行(病院の旧 tickHospitalDwell と同じ: 円外=0へ戻す・3秒到達のtickだけ done)。 */
export const tickShrineDwell = (
  dwellMs: number, inside: boolean, dtMs: number,
): { dwellMs: number; done: boolean } => {
  if (!inside) return { dwellMs: 0, done: false };
  const next = dwellMs + Math.max(0, dtMs);
  return { dwellMs: Math.min(SHRINE_DWELL_MS, next), done: dwellMs < SHRINE_DWELL_MS && next >= SHRINE_DWELL_MS };
};

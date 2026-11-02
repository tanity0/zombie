// 武将の祠(research/POI_TOUCH_SHRINE.md §2・SKILL_BUILD_REDESIGN.md §13-5)。
// 3種=鎧(body)/小手(arms)/兜(accessory)。触れるとその部位の武将装備を装備する(1ラン1回・取ったら消える)。
//
// この層は renderer-agnostic(PixiJS非依存)。位置・当たり判定・割り当ての純関数だけ。
// 付与は gameStore、描画は pixiScene がここの値を読む。
import type { EquipSlot } from '../types/game';
import { footRect, resolveAabb, touchesFromBelow, type Rect } from './obstacles';
import { POI_SECTORS } from './pois';
import { sectorAngle } from './detourPoi';

export type ShrineSlot = EquipSlot; // 'body' | 'arms' | 'accessory'
export const SHRINE_SLOTS: readonly ShrineSlot[] = ['body', 'arms', 'accessory'];

/** 絵(社長支給 v0.25.3217)。鎧=poi-yoroi / 小手=poi-kote / 兜=poi-kabuto。 */
export const SHRINE_TEXTURE: Record<ShrineSlot, string> = {
  body: 'poi-yoroi', arms: 'poi-kote', accessory: 'poi-kabuto',
};

// 距離=未確認汚染帯(5000〜7500)の25/50/75%(§13-5・部位ごとに固定。乱数は方角だけ)。
// 「深さ=価値」= 救済ではなく強化なので深くてよい。
const UNCONFIRMED_LO = 5000;
const UNCONFIRMED_SPAN = 2500;
export const SHRINE_DIST: Record<ShrineSlot, number> = {
  body: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.25,      // 5625
  arms: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.5,       // 6250
  accessory: UNCONFIRMED_LO + UNCONFIRMED_SPAN * 0.75, // 6875
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
 * 3種を、裏ボスのセクター(無ければ null)を除いたセクターへ**独立にシャッフルで1つずつ**割り当てる
 * (assignDetourSectors と同型・rng注入)。結果として各非ボスセクターに寄り道1+祠1が同居する(距離帯が違うので衝突しない)。
 */
export const assignShrineSectors = (
  bossSector: number | null,
  rand: () => number = Math.random,
): Record<ShrineSlot, number> => {
  const pool: number[] = [];
  for (let i = 0; i < POI_SECTORS; i++) if (i !== bossSector) pool.push(i);
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

/** プレイヤーが下から触れている祠(無ければ null)。 */
export const touchedShrine = (
  player: Rect, shrines: readonly ShrineState[],
): ShrineState | null => {
  for (const s of shrines) {
    if (!isLive(s)) continue;
    if (touchesFromBelow(player, shrineRect(s))) return s;
  }
  return null;
};

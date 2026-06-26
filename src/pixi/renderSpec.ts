// Visual spec: how a gameplay hitbox maps to its on-screen drawing box.
//
// CORE RULE — the sprite's look is decoupled from the collision box. Gameplay
// (collision, ranges, ammo, counters) only ever uses Player/Enemy width/height
// from the store. Nothing here feeds back into the simulation; it only decides
// how big to draw a sprite and where its FEET sit, which is also the value used
// for Y-sorting. Swap real sprites in later by changing only these numbers.

import type { Enemy, Player, Summon } from '../types/game';

// The sprites read as chunky pixel art by drawing larger than their gameplay
// hitboxes. Feet stay anchored to the hitbox bottom; the extra height rises
// upward, so collision and melee ranges remain unchanged.
export const PLAYER_VISUAL_SCALE = 2.3;

// 敵/NPCの「規定値スケール」をプレイヤー基準に合わせる一括倍率(社長指示)。
// プレイヤーは固定 86px 幅(当たり判定28pxの約3.07倍)で描画されるのに対し、敵は当たり判定×倍率(~2.1)で
// 小さめだった。人型敵(zombie/skeleton 等の~2.1)がプレイヤーと同寸になるよう、敵の見た目 boxを ×ACTOR_VISUAL_BUMP。
// 描画のみ(当たり判定/射程/速度には不干渉)。型別の相対サイズ(bat大・reaper小 等)はそのまま保たれる。
export const ACTOR_VISUAL_BUMP = 1.46;

const ENEMY_VISUAL_SCALE: Partial<Record<Enemy['type'], number>> = {
  bat: 2.35,
  skeleton: 2.15,
  zombie: 2.1,
  plant: 2.15,
  ghost: 2.0,
  werewolf: 2.05,
  pumpkin: 1.75,
  giantbat: 1.55,
  reaper: 1.45,
};

// A foot-anchored draw box in WORLD space. `footX/footY` is the bottom-centre
// the sprite is pinned to (also its Y-sort key); `boxW/boxH` is the box the
// texture is "contain"-fitted into.
export interface FootBox {
  footX: number;
  footY: number;
  boxW: number;
  boxH: number;
}

export const playerFootBox = (p: Player): FootBox => {
  const boxW = p.width * PLAYER_VISUAL_SCALE;
  const boxH = p.height * PLAYER_VISUAL_SCALE;
  const cx = p.x + p.width / 2;
  // Foot sits on the hitbox BOTTOM (not below it), so the drawn feet line up
  // with the collision the simulation uses — see the obstacle convention in
  // CLAUDE.md / src/world/obstacles.ts. The oversized sprite then rises upward
  // from there.
  return { footX: cx, footY: p.y + p.height, boxW, boxH };
};

export const enemyFootBox = (e: Enemy): FootBox => {
  // 規定スケールをプレイヤー基準へ(×ACTOR_VISUAL_BUMP)。裏ボスは絵を別経路(BOSS_SPRITE_FIT)で描くので対象外。
  const hiddenBoss = e.type === 'mimir' || e.type === 'jormungand' || e.type === 'skadi';
  const scale = (ENEMY_VISUAL_SCALE[e.type] ?? 2) * (hiddenBoss ? 1 : ACTOR_VISUAL_BUMP);
  return {
    footX: e.x + e.width / 2,
    footY: e.y + e.height,
    boxW: e.width * scale,
    boxH: e.height * scale,
  };
};

// 敵スプライト素材の縦横比(texH/texW)を type×バリアント(default/stage3)別に登録する小さなレジストリ。
// 描画は containScale で枠(boxW×boxH)に内接させるため、横長素材は実描画が枠より低くなる=頭の位置が
// 素材ごとに変わる。PHILLサークルの「頭スナップ」を実描画に合わせるためのデータ橋渡し(描画→ロジック)。
const enemyArtAspect = new Map<string, number>();
export const setEnemyArtAspect = (key: string, aspect: number): void => { if (aspect > 0 && Number.isFinite(aspect)) enemyArtAspect.set(key, aspect); };

// 足元から見た「頭付近」の世界Y。実描画の縦範囲(box内接フィット)に基づき、その上部=頭へスナップさせる。
// stage3=廃都の敵絵バリアント。アスペクト未登録時は従来どおり box の 0.83 にフォールバック。
export const enemyHeadY = (e: Enemy, stage3: boolean): number => {
  const fb = enemyFootBox(e);
  const aspect = enemyArtAspect.get((stage3 ? 'stage3:' : 'default:') + e.type) ?? enemyArtAspect.get('default:' + e.type);
  if (aspect == null) return fb.footY - fb.boxH * 0.83;
  // 実描画の縦割合 = min(1, (boxW/boxH)×(texH/texW))。その上部(×0.86)を頭中心の目安に。
  const dispFrac = Math.min(1, (fb.boxW / Math.max(1, fb.boxH)) * aspect);
  return fb.footY - fb.boxH * dispFrac * 0.86;
};

// 召喚ユニットは流用元の敵タイプと同じ視覚スケールで描く(敵と大きさを揃える)。
export const summonFootBox = (s: Summon): FootBox => {
  const scale = ENEMY_VISUAL_SCALE[s.reusedType] ?? 2;
  return {
    footX: s.x + s.width / 2,
    footY: s.y + s.height,
    boxW: s.width * scale,
    boxH: s.height * scale,
  };
};

// Ground-shadow width per enemy (heavy bosses get a wider, darker pool). Mirror
// of the Canvas2D `drawGroundShadow` calls.
export const enemyShadow = (e: Enemy): { width: number; alpha: number } => {
  const heavy = e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin';
  return { width: e.width * (heavy ? 1.15 : 1), alpha: heavy ? 0.56 : 0.46 };
};

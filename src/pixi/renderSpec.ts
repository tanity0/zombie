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
  hunter: 1.9, // ハンター変異体(ミニボス級の存在感)
  screamer: 1.95, // 変異体(叫喚型・やや大きめの存在感)
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

// 通常敵(非・裏ボス)の【見た目だけ】の一括倍率(段階調整用・社長指示)。当たり判定は裏ボスと同じ「帯」方式
// (=ゲーム上の生の矩形 e.width×e.height)に統一したので、この倍率は描画(enemyFootBox)にしか掛からない。
// 帯はこの描画ボックスの下部中央バンドに一致する(footY=足元に底辺・上へ伸びる)=裏ボスの足元帯と同構造。
export const ENEMY_SIZE_MULT = 1.5;

export const enemyFootBox = (e: Enemy): FootBox => {
  const scale = (ENEMY_VISUAL_SCALE[e.type] ?? 2) * ENEMY_SIZE_MULT;
  return {
    footX: e.x + e.width / 2,
    footY: e.y + e.height,
    boxW: e.width * scale,
    boxH: e.height * scale,
  };
};

// 【現在未使用】足元アンカーで描いた描画ボックスそのもの(footX中心・footYが底)のAABB。かつて「見た目=当たり判定」
// 実験で当たり判定に使っていたが、社長指示で当たり判定を裏ボスと同じ「帯」方式(生の矩形)へ戻したため今は呼ばれない。
// 「見た目=判定」へ再度切り替える場合の参照用に残す。
export const enemyVisualRect = (e: Enemy): { x: number; y: number; width: number; height: number } => {
  const fb = enemyFootBox(e);
  return { x: fb.footX - fb.boxW / 2, y: fb.footY - fb.boxH, width: fb.boxW, height: fb.boxH };
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

// 当たり判定の「帯」幅の規格。Pixiの接地影(actorShadowWidthFromSprite)と同じ「実描画スプライト幅×0.55」。
// 社長指示:「帯は影と同じ規格の幅で」。これで帯=影=見えてる足元の幅、が揃う。
export const ENEMY_SHADOW_WIDTH_FRAC = 0.55;
// 帯の高さ=実描画スプライト高さ×この割合(足元を底に固定して上へ伸ばす)。社長指示で 50%(=見た目の下半分が当たり判定)。
// 実機で微調整可。1.0=見た目の全身が当たり判定。
export const ENEMY_STRIP_HEIGHT_FRAC = 0.5;

// 通常敵(非・裏ボス)の当たり判定「帯」(AABB)。幅=影と同規格(実描画幅×0.55)、高さ=実描画高さ×ENEMY_STRIP_HEIGHT_FRAC、
// 足元アンカー(footX中心・footYが底)で上方向へ伸ばす。実描画寸法は contain フィット(min(boxW,boxH/アスペクト) /
// min(boxH,boxW×アスペクト))で影/絵の実寸と一致(アスペクト未登録時は box にフォールバック)。深度スケールは掛けない
// (当たり判定不変)。裏ボスは別経路(生の帯=ENEMY_STATS)なので呼び出し側で除外する。
export const enemyHitStrip = (e: Enemy): { x: number; y: number; width: number; height: number } => {
  const fb = enemyFootBox(e);
  const aspect = enemyArtAspect.get('default:' + e.type); // texH/texW
  const drawnW = aspect && aspect > 0 ? Math.min(fb.boxW, fb.boxH / aspect) : fb.boxW;
  const drawnH = aspect && aspect > 0 ? Math.min(fb.boxH, fb.boxW * aspect) : fb.boxH;
  const w = drawnW * ENEMY_SHADOW_WIDTH_FRAC;
  const h = drawnH * ENEMY_STRIP_HEIGHT_FRAC;
  return { x: fb.footX - w / 2, y: fb.footY - h, width: w, height: h };
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
  const heavy = e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' || e.type === 'hunter';
  return { width: e.width * (heavy ? 1.15 : 1), alpha: heavy ? 0.56 : 0.46 };
};

// 作戦室の地図に出すボスの顔(research/SORTIE_MAP_BOSS_ICONS.md §2・§5)。判定と並べ方だけの純関数(React/PixiJS 非依存)。
//
// 載せる条件: 「出会った記録あり・倒した記録なし」で、
//   A. ステージ固定のボス(PRACTICE_SLOTS の reachable:true の枠)→ その枠のステージの場所
//   B. 徘徊の枠(宇宙飛行群・亡霊・拳鬼)→ 作戦室の抽選で確定した時だけ、確定したステージの場所
// 照らすキーは encounterSlotKey(城ボス=giantbat@stage-N 等)。PRACTICE_SLOTS の slotKey(…@practice)では照らさない。
// ハンター・死神(使者を含む)・変異塊・英雄・解放軍群は、どんな状態でも載せない(型の除外一覧で明示)。
import type { EnemyType } from '../types/game';
import { PRACTICE_SLOTS } from './bossPractice';
import { bossIconName } from './bossIcon';
import { OPS_MAP_PLACES } from '../data/opsMapPlaces';
import type { RunMutantBoss } from './wraithScript';
import type { SortiePatrolPlan } from './sortiePatrolPlan';

/** 地図に載せない型(reachable を将来変えても漏れないように明示)。 */
export const MAP_BOSS_EXCLUDED_TYPES: readonly EnemyType[] = ['hunter', 'reaper', 'hangedman', 'lab-crawler', 'mutant-hero', 'mutant-liberty'];

/** 徘徊の枠の1人 → 記録のキー・型・絵の名前。 */
export const PATROL_MAP_BOSS: Readonly<Record<Exclude<RunMutantBoss, 'none'>, { key: string; type: EnemyType; sprite: string }>> = {
  astro: { key: 'mutant-astro', type: 'mutant-astro', sprite: 'mutant-astro' },
  wraith: { key: 'mutant-wraith', type: 'mutant-wraith', sprite: 'mutant-wraith' },
  brawler: { key: 'phantom-brawler', type: 'guardian-phantom', sprite: 'kenki-idle' },
};

export interface MapBossFace {
  /** 記録のキー(encounterSlotKey と同じ形)。 */
  key: string;
  stageId: string;
  /** 絵の名前(sprites/ 以下・data/bossHeadCrops.ts のキー)。 */
  sprite: string;
  /** 徘徊の枠(作戦室の抽選で確定した1人)。地点の列の先頭に並び、「+N」には入らない。 */
  patrol?: boolean;
}

export interface MapBossInput {
  encountered: ReadonlySet<string>;
  defeated: ReadonlySet<string>;
  /** 今の進行で出撃できるステージ。地図に場所が無い/行けないステージには出さない。 */
  sortieableStageIds: ReadonlySet<string>;
  /** 作戦室で引いた徘徊の枠(無ければ null)。 */
  patrol: SortiePatrolPlan | null;
}

/** ステージ固定のボス(A)の母集団: reachable の枠から除外の型を抜き、絵が引けるものだけ。 */
export const stageFixedMapBossCandidates = (): MapBossFace[] => PRACTICE_SLOTS
  .filter(s => s.reachable && !MAP_BOSS_EXCLUDED_TYPES.includes(s.bossType))
  .flatMap(s => {
    const sprite = bossIconName(s.bossType, s.stageId);
    return sprite ? [{ key: s.encounterSlotKey, stageId: s.stageId, sprite }] : [];
  });

/** 地図に出し得る全ての顔の絵(頭の切り抜きの表の台帳テスト用)。 */
export const allMapBossSprites = (): string[] => [...new Set([
  ...stageFixedMapBossCandidates().map(f => f.sprite),
  ...Object.values(PATROL_MAP_BOSS).map(p => p.sprite),
])];

/** 地図に出す顔の一覧(ステージ固定→徘徊の順)。 */
export const mapBossFaces = (input: MapBossInput): MapBossFace[] => {
  const shown = (key: string, stageId: string): boolean =>
    input.encountered.has(key) && !input.defeated.has(key)
    && input.sortieableStageIds.has(stageId) && OPS_MAP_PLACES[stageId] !== undefined;
  const out = stageFixedMapBossCandidates().filter(f => shown(f.key, f.stageId));
  const p = input.patrol;
  if (p && p.boss !== 'none' && p.stageId) {
    const pb = PATROL_MAP_BOSS[p.boss];
    if (!MAP_BOSS_EXCLUDED_TYPES.includes(pb.type) && shown(pb.key, p.stageId)) out.push({ key: pb.key, stageId: p.stageId, sprite: pb.sprite, patrol: true });
  }
  return out;
};

// ---- 1地点の並べ方(§5+クリエイティブ監査: 最大4つまで横一列・徘徊は先頭で「+N」に入れない・点の下(入らなければ上)・
//      近い地点の列や地図の印と重なる時は上下へ逃がす・点から列へ細い引き線) ----
export const MAP_FACE_MAX_PER_SPOT = 4;

export interface MapFaceSpotLayout {
  /** 地図の座標(原画の単位)。 */
  at: readonly [number, number];
  /** 出す顔(最大4・徘徊が先頭)とその中心。 */
  faces: { face: MapBossFace; x: number; y: number }[];
  /** 出さなかった数(0なら「+N」を出さない)と、その文字の左端・縦の中心。 */
  more: number;
  moreX: number;
  moreY: number;
  /** 点から列への引き線(点の縁 → 先頭の顔の縁)。 */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** 列が点の下か(false=上)。 */
  below: boolean;
}

/** 顔を被せない地図の印(行った場所の四角・今いる所・NEXT の菱形など)。中心と半分の大きさ。 */
export interface MapFaceObstacle { x: number; y: number; half: number }

export interface MapFaceLayoutOpts {
  /** 顔の直径(原画の単位)。 */
  diameter: number;
  /** 顔どうしの間隔。 */
  gap: number;
  /** 点の中心から列の縁までの最短距離(点の印の大きさぶん離す)。 */
  offset: number;
  /** 地図の幅・高さ(原画の単位)。はみ出すなら内へ寄せる/上へ回す。 */
  mapW: number;
  mapH: number;
  /** 「+N」の文字が取る幅(列の右に足す)。 */
  moreW?: number;
  /** 点の印の半分の大きさ(引き線を印の縁から始める)。 */
  markHalf?: number;
  /** 顔を被せない印。 */
  avoid?: readonly MapFaceObstacle[];
}

interface Box { l: number; r: number; t: number; b: number }
const hit = (a: Box, b: Box): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/**
 * 顔を地点ごとにまとめて並べる(同じ座標=同じ地点。地点の並びは最初に出た順=先の地点から場所を取る)。
 * 列の置き場所は 点の下 → 点の上 → 1段下 → 1段上 … の順に、地図の中に収まり、先に置いた列・避ける印と重ならない最初の所。
 * どこも塞がっていたら、地図に収まる最初の候補(それも無ければ点の下)。
 */
export const layoutMapFaces = (faces: readonly MapBossFace[], placeOf: (stageId: string) => readonly [number, number] | undefined, o: MapFaceLayoutOpts): MapFaceSpotLayout[] => {
  const spots: { at: readonly [number, number]; list: MapBossFace[] }[] = [];
  for (const f of faces) {
    const at = placeOf(f.stageId);
    if (!at) continue;
    const s = spots.find(q => q.at[0] === at[0] && q.at[1] === at[1]);
    if (s) s.list.push(f); else spots.push({ at, list: [f] });
  }
  const R = o.diameter / 2;
  const step = o.diameter + o.gap;
  const pad = o.gap / 2;
  const avoid: Box[] = (o.avoid ?? []).map(a => ({ l: a.x - a.half, r: a.x + a.half, t: a.y - a.half, b: a.y + a.half }));
  const placed: Box[] = [];
  return spots.map(({ at, list }) => {
    // 徘徊を先頭へ(残りは来た順のまま)。徘徊は「+N」に入らない。
    const ordered = [...list.filter(f => f.patrol), ...list.filter(f => !f.patrol)];
    const shown = ordered.slice(0, MAP_FACE_MAX_PER_SPOT);
    const n = shown.length;
    const more = ordered.length - n;
    const rowW = n * o.diameter + (n - 1) * o.gap;
    const extra = more > 0 ? o.gap + (o.moreW ?? 0) : 0;
    // 横は点の真下に中央揃え。地図の左右からはみ出すなら内へ寄せる。
    let left = at[0] - rowW / 2;
    left = Math.max(0, Math.min(o.mapW - rowW - extra, left));
    const boxAt = (y: number): Box => ({ l: left - pad, r: left + rowW + extra + pad, t: y - R - pad, b: y + R + pad });
    const cands: number[] = [];
    for (let k = 0; k < 4; k++) {
      cands.push(at[1] + o.offset + R + k * step);
      cands.push(at[1] - o.offset - R - k * step);
    }
    const inMap = (y: number) => y - R >= 0 && y + R <= o.mapH;
    const y = cands.find(c => inMap(c) && !placed.some(p => hit(p, boxAt(c))) && !avoid.some(a => hit(a, boxAt(c))))
      ?? cands.find(inMap) ?? cands[0];
    placed.push(boxAt(y));
    const below = y > at[1];
    const out = shown.map((face, i) => ({ face, x: left + R + i * step, y }));
    const first = out[0];
    const dir = below ? 1 : -1;
    const mh = o.markHalf ?? 0;
    // 引き線: 点の縁 → 先頭の顔の縁(顔の中心へ向かう線を、顔の丸の手前で止める)。
    const dx = first.x - at[0], dy = first.y - at[1];
    const len = Math.hypot(dx, dy) || 1;
    const line = { x1: at[0], y1: at[1] + dir * mh, x2: first.x - (dx / len) * R, y2: first.y - (dy / len) * R };
    return { at, faces: out, more, moreX: left + rowW + o.gap, moreY: y, line, below };
  });
};

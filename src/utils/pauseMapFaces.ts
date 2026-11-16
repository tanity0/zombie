// 一時停止の地図(PauseMap)の脅威の印を、ボスの顔(作戦室の地図と同じ頭の切り抜き)にするための引き当て。描くのは PauseMap。
// 型(+城ボスならステージ)→ 絵の名前は bossIconName(作戦室の地図・年表と同じ1枚の表)。拳鬼だけは幻影の型の中の1人なので
// 作戦室の地図と同じ徘徊の枠の絵(PATROL_MAP_BOSS)を引く。頭の切り抜きの表(BOSS_HEAD_CROPS)に無い絵は null(=今の琥珀の菱形のまま)。
// 徘徊の枠(宇宙飛行群・亡霊・拳鬼)は作戦室の地図と同じく縁を血の赤にする。
import type { Enemy } from '../types/game';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';
import { bossIconName } from './bossIcon';
import { PATROL_MAP_BOSS } from './sortieMapBosses';
import { PHANTOM_BRAWLER_KIND } from './phantomBrawlerSpawn';

export interface PauseMapFace { sprite: string; patrol: boolean }

const PATROL_TYPES: ReadonlySet<string> = new Set(Object.values(PATROL_MAP_BOSS).map(p => p.type));

export const pauseMapFaceOf = (t: { type: Enemy['type']; phantomUnique?: Enemy['phantomUnique'] }, stageId: string | null): PauseMapFace | null => {
  if (t.type === 'guardian-phantom') {
    if (t.phantomUnique !== PHANTOM_BRAWLER_KIND) return null; // 拳鬼以外の幻影は顔の表に無い
    const sprite = PATROL_MAP_BOSS.brawler.sprite;
    return BOSS_HEAD_CROPS[sprite] ? { sprite, patrol: true } : null;
  }
  const sprite = bossIconName(t.type, stageId);
  if (!sprite || !BOSS_HEAD_CROPS[sprite]) return null;
  return { sprite, patrol: PATROL_TYPES.has(t.type) };
};

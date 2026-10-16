// ★一時停止の地図に出す敵(research/THEONE_ROUND2.md §2-3・社長 2026-10-17)。
// 「パンプキンとか伐採人とかは出さない」「表示される敵は素直に位置情報でいい。そのプレイで出会ってたらね」。
// 出す=ボス級から強個体(パンプキン/削岩型/伐採人)と研究所の大型を除いた物+宿敵。
// 出会った=その出撃で一度でも画面(ズーム込みの可視域)に体の中心が入った個体(敵ID単位。裏ボスだけは型単位=下の sightKey)。一度出会えば今の位置を出す。
// 記録はこのモジュールの中だけ(store へは書かない=毎ティック呼んでも購読者を起こさない)。出撃ごとに resetMapSightings で空にする。
import type { Enemy } from '../types/game';
import { isBossType, isPumpkinTier, isHiddenBoss } from './enemyUtils';
import { isPointInZoomedViewport } from './cameraZoom';

type Tracked = Pick<Enemy, 'type' | 'isNamed' | 'corpseUntil'>;

export const isMapTrackedEnemy = (e: Tracked): boolean => {
  if (e.corpseUntil !== undefined) return false;
  if (e.isNamed) return true;
  return isBossType(e.type) && !isPumpkinTier(e.type) && e.type !== 'lab-zombie-3';
};

const seen = new Set<string>();

// 裏ボスは巣へ帰ると一覧から消え、次は新しいIDで出直す(検収前の品質監査 C-2)。出直しても「出会った」ままにするため型で覚える。
const sightKey = (e: Pick<Enemy, 'id' | 'type'>): string => (isHiddenBoss(e.type) ? `type:${e.type}` : e.id);

export const resetMapSightings = (): void => { seen.clear(); };

export const wasSeenThisRun = (e: Pick<Enemy, 'id' | 'type'>): boolean => seen.has(sightKey(e));

/** 画面に入っている対象の敵を「出会った」として記録する。新しく出会った数を返す(テスト用)。 */
export const recordMapSightings = (
  enemies: readonly (Tracked & Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height'>)[],
  camera: { x: number; y: number }, viewport: { width: number; height: number }, zoom: number,
): number => {
  let added = 0;
  for (const e of enemies) {
    const k = sightKey(e);
    if (seen.has(k) || !isMapTrackedEnemy(e)) continue;
    if (!isPointInZoomedViewport(e.x + e.width / 2, e.y + e.height / 2, camera, viewport, zoom)) continue;
    seen.add(k);
    added++;
  }
  return added;
};

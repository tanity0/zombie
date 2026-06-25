// 探索の道標(POI: Points Of Interest)と「拠点を解放するとその方角のPOIが矢印で示される」仕組み。
//
// 仕様(社長指示):
// - MAP上に洞窟などのオブジェ(POI)と裏ボスの巣がある。
// - 8拠点(createBaseSites)はスタート地点(原点)から見て8方角(45°刻み)に並ぶ。各拠点は45°セクターを担当。
// - ある拠点を「解放(captured)」すると、その方角(セクター)にあるPOI/裏ボスが矢印で表示される。
//
// この層は renderer-agnostic(PixiJS非依存): 座標/角度/解放判定の純粋関数だけを置く。
// 描画(画面端の方向矢印)は pixiScene が、出現/帰巣は useGameLoop が、ここの値を読んで行う。

import type { EnemyType, BaseSite } from '../types/game';

export interface Poi {
  id: string;
  x: number;
  y: number;
  kind: 'boss' | 'cave';
}

// 拠点の数=方角の数(createBaseSites の BASE_SITE_COUNT と一致)。
export const POI_SECTORS = 8;
const SECTOR_RAD = (Math.PI * 2) / POI_SECTORS;

// 原点基準の角度(rad)→ 最も近い拠点(セクター)インデックス[0..7]。
// 拠点 i は角度 i*45° に置かれている(createBaseSites)。境界は四捨五入で最寄りに割り当てる。
export const sectorIndexForAngle = (angle: number): number => {
  const i = Math.round(angle / SECTOR_RAD);
  return ((i % POI_SECTORS) + POI_SECTORS) % POI_SECTORS;
};

// POI が属するセクター(=その方角を担当する拠点)インデックス。
export const poiSectorIndex = (poi: { x: number; y: number }): number =>
  sectorIndexForAngle(Math.atan2(poi.y, poi.x));

// 裏ボスの巣(固定座標)。ステージ別に「原点からの角度・距離」で定義する。
// 距離は深層域(>=7500)の内側に置く(到達=深層域)。角度=その方角の拠点で解放される。
// 調整はこの2値だけでよい(矢印・出現・帰巣すべてここを参照)。
const BOSS_LAIR: Partial<Record<EnemyType, { angle: number; dist: number }>> = {
  mimir: { angle: Math.PI, dist: 9000 },      // ステージ1=西(拠点4の方角)
  jormungand: { angle: 0, dist: 9000 },       // ステージ3=東(拠点0の方角)
};

// 裏ボスの巣のワールド座標(未定義タイプは null)。
export const bossLairPos = (boss: EnemyType | null): { x: number; y: number } | null => {
  if (!boss) return null;
  const l = BOSS_LAIR[boss];
  if (!l) return null;
  return { x: Math.cos(l.angle) * l.dist, y: Math.sin(l.angle) * l.dist };
};

// 洞窟など固定POI(ステージ別)。※未実装: 配置が決まったらここに {id,x,y,kind:'cave'} を足すだけで
// 自動的にセクター判定・矢印表示の対象になる(該当方角の拠点を解放すると出る)。
const STAGE_CAVES: Poi[] = [
  // 例) { id: 'cave-1', x: Math.cos(Math.PI/4)*6000, y: Math.sin(Math.PI/4)*6000, kind: 'cave' },
];

// この出撃のPOI一覧(裏ボスの巣 + 洞窟)。原点付近(無効座標)は除外。
export const getRunPois = (hiddenBoss: EnemyType | null): Poi[] => {
  const out: Poi[] = [...STAGE_CAVES];
  const lair = bossLairPos(hiddenBoss);
  if (lair) out.push({ id: `lair-${hiddenBoss}`, x: lair.x, y: lair.y, kind: 'boss' });
  return out;
};

// POI が「解放済み」か = その方角を担当する拠点が captured か。
export const isPoiRevealed = (poi: { x: number; y: number }, baseSites: BaseSite[]): boolean => {
  if (!baseSites.length) return false;
  const sector = poiSectorIndex(poi);
  const base = baseSites.find(b => b.id === `base-${sector}`) ?? baseSites[sector];
  return !!base && base.status === 'captured';
};

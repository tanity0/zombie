// 破壊された手続き生成オブジェクト(木 / 街・雪プロップ)のキー集合。
//
// 木やプロップは「世界座標の純粋関数」で都度生成され、エンティティとして保持しない(描画と当たり判定が
// 必ず一致する設計)。個別に消すには、生成関数がこの上書きSetを参照して該当キーを欠番にすればよい。
// 描画(treesInRegion / cityPropsInRegion)も当たり判定(同関数→trunkRect/cityPropRect)も同じ生成関数を
// 通るので、1つSetに入れるだけで「描画から消える＝当たり判定からも消える」が同時に成立する。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。store(裏ボスが障害物に触れた時)が mark し、resetGame で clear。
const destroyed = new Set<string>();

export const markObstacleDestroyed = (key: string): void => { destroyed.add(key); };
export const isObstacleDestroyed = (key: string): boolean => destroyed.size > 0 && destroyed.has(key);
export const clearDestroyedObstacles = (): void => { destroyed.clear(); };
export const destroyedObstacleCount = (): number => destroyed.size;

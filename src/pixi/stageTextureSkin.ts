// ステージ別素材が注入されるまで、森の下地を見せないために隠すレイヤーの純関数。
// Pixi/StoreをimportしないのでNodeの検査でもブラウザAPIを要求しない。
export type StageSkinLayer = 'far' | 'ground' | 'horizon' | 'front';

const ALL: readonly StageSkinLayer[] = ['far', 'ground', 'horizon', 'front'];
const LAYERS_BY_SKIN: Readonly<Record<string, readonly StageSkinLayer[]>> = {
  lab: ['far', 'ground', 'front'],
  city: ALL,
  snow: ALL,
  stage5: ALL,
  tutorial: ALL,
  stage7: ['far'],
  ending: ALL, // エンディング(仮組み): 遠景/地面/地平帯/前景の4層とも社長支給テクスチャへ差し替える(ENDING_SCENE.md)
};

export const skinLayersExpectedFor = (
  theme: string | undefined,
  farBackdrop: string,
  _nearHorizon: string,
  corridorMode = false,
): ReadonlySet<StageSkinLayer> => {
  if (corridorMode) return new Set();
  const skinned = theme === 'lab' || (!!farBackdrop && farBackdrop !== 'forest');
  if (!skinned) return new Set();
  const key = theme === 'lab' ? 'lab' : farBackdrop;
  return new Set(LAYERS_BY_SKIN[key] ?? ALL); // 未知スキンは既存どおり安全側=全レイヤー待機
};

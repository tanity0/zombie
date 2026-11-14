// 研究所ゾンビLv1の見た目(男/女)を敵IDから決める純関数(描画と1対1枠で**同じ式を1箇所に**持つ)。
//
// ★以前は `pixiScene.labEnemyTextureName` の中に直書きしてあった。ボスメーカーの1対1で
//   「男を選んだのに女が出る」を防ぐには同じ式でIDを寄せる必要があり、2箇所に書くとズレる
//   (社長指摘2026-09-26「ボスメーカーに研究所の敵達がいない」で1対1へ載せた時に切り出した)。

export type LabZombieSex = 'male' | 'female';

/** 敵IDのハッシュ(31進)の偶奇で男女を固定振り分け。個体はちらつかない。 */
export const labZombieSexOf = (id: string): LabZombieSex => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? 'male' : 'female';
};

/** 狙った見た目になるIDを作る(元のIDに接尾辞を足すだけ=一意性は保たれる)。 */
export const idForLabSex = (baseId: string, want: LabZombieSex): string => {
  if (labZombieSexOf(baseId) === want) return baseId;
  for (let n = 1; n <= 64; n++) {
    const id = `${baseId}s${n}`;
    if (labZombieSexOf(id) === want) return id;
  }
  return baseId; // 偶奇なので2回以内に必ず当たる(ここへは来ない)
};

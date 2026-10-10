// リザルトなど DOM で敵の立ち絵を出す時の素材名(社長指示2026-10-09「死亡時、リザルトにプレイヤーを殺した敵のアイコンと名前を表示」)。
// 解決順は描画側 `PixiScene.enemyTexKey`(pixi/pixiScene.ts)と同じ:
//   フィル → ステージ7の城ボス(グレン) → 見た目の表(男女など・個体idで固定) → ステージ別の城ボス → 研究所ゾンビ → 型名。
// ★描画側の表を変えたらここも揃えること(enemyArt.test.ts が主な型の対応を固定している)。
import { variantTextureName } from './enemyVariant';
import { labZombieSexOf } from './labZombieSex';

export const enemyArtName = (type: string, id: string, farBackdrop: string): string => {
  if (type === 'phillboss') return 'phill';
  if (farBackdrop === 'stage7' && type === 'giantbat') return 'glen-boss';
  const variant = variantTextureName(type, id);
  if (variant) return variant;
  if (type === 'giantbat') {
    if (farBackdrop === 'city' || farBackdrop === 'ending') return 'stage3-enemies/giantbat';
    if (farBackdrop === 'snow') return 'stage4-enemies/giantbat';
    if (farBackdrop === 'stage5') return 'stage5-enemies/giantbat';
  }
  if (type === 'lab-zombie-3') return 'lab-zombie/lab-zombie-lv3';
  if (type === 'lab-zombie-2') return 'lab-zombie/lab-zombie-lv2';
  if (type === 'lab-zombie-1') return `lab-zombie/lab-zombie-lv1-${labZombieSexOf(id)}`;
  return type;
};

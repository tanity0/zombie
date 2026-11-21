// 松明の裏の光(社長承認2026-11-21「松明のあるステージは全部、ステージ1と同じ“松明の裏に落ちる光”に」)。
// 足元の少し奥(画面の上)の地面が温かく照らされ、松明の台座がその明るい地面の前に影絵で立つ。
// 描くのは pixi/stageLook.ts の TorchBackLight(柔らかい丸の絵・加算・使い回し・慣性)。影を落とす光ではない。
// どのステージに・どの寸法/濃さ/色で掛けるかはこの表1本。表に無いステージは何もしない(厳密にそのまま)。
//   - ステージ1: 通常の夜(pixi/stage1Night.ts)が描く。値は従来どおり(TORCH_BACK_* と S1N_TORCH_BACK_ALPHA)。
//     雨上がりの裏の光(pixi/weatherWet.ts)は別経路のまま。
//   - ステージ5: 戦場(pixi/stage5Battlefield.ts)が描く。値は S5B_FIRE_POOLS(燃える残骸の足元の溜まりも同じ絵)。
//   - ステージ3/4/7: この表の値で、描画側の共通の層(pixiScene の syncTorchBack)が描く。
//   - 松明の無いステージ(チュートリアルの洞窟・2・6・EX)は載せない。
// RENDERER-AGNOSTIC: PixiJS を import しない。

import {
  TORCH_BACK_UP, TORCH_BACK_W, TORCH_BACK_H, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX, S1N_TORCH_BACK_ALPHA,
} from './weatherWet';
import { S5B_FIRE_POOLS, type FirePoolSpec } from './stage5Battlefield';

export type TorchBackSpec = FirePoolSpec;
/** 誰が描くか: stage1Night / stage5Battle は各ステージの層、shared は共通の層。 */
export type TorchBackOwner = 'stage1Night' | 'stage5Battle' | 'shared';
export interface TorchBackStage {
  owner: TorchBackOwner;
  /** そのステージの遠景のキー(これ以外の遠景=屋内・別の舞台では掛けない)。 */
  farKey: string;
  /** 重ねる丸の絵(1〜2枚)。寸法は world px・遠近前。up=足元から奥(画面の上)へずらす量。 */
  pools: readonly TorchBackSpec[];
}

/** ステージ1(森の夜): 従来の値そのまま。 */
const STAGE1: TorchBackStage = {
  owner: 'stage1Night',
  farKey: 'forest',
  pools: [{ w: TORCH_BACK_W, h: TORCH_BACK_H, up: TORCH_BACK_UP, alpha: S1N_TORCH_BACK_ALPHA, tint: TORCH_BACK_TINT, tintMix: TORCH_BACK_TINT_MIX }],
};

export const TORCH_BACK_STAGES: Readonly<Record<string, TorchBackStage>> = {
  'stage-1': STAGE1,
  // ステージ3(昼の廃都): 日の光の下=ほのかに。石畳に落ちる温かい黄。
  'stage-3': {
    owner: 'shared', farKey: 'city',
    pools: [{ w: 190, h: 54, up: 12, alpha: 0.2, tint: 0xffd27a, tintMix: 0.5 }],
  },
  // ステージ4(雪原の夜・焚き火): 雪に落ちる橙。焚き火は低く横に広い=裏だけでなく周りにも少し回る。
  // 雪は明るい=加算で白く飛びやすいので、外側は広く薄く・芯は狭く。
  'stage-4': {
    owner: 'shared', farKey: 'snow',
    pools: [
      { w: 250, h: 78, up: 14, alpha: 0.36, tint: 0xff7a26, tintMix: 0.7 }, // 外側: 雪を染める橙
      { w: 130, h: 36, up: 8, alpha: 0.28, tint: 0xffa850, tintMix: 0.5 }, // 芯: 焚き火のすぐ奥
    ],
  },
  // ステージ5(戦場): 赤橙の火の溜まり(燃える残骸と共用)。
  'stage-5': { owner: 'stage5Battle', farKey: 'stage5', pools: S5B_FIRE_POOLS },
  // ステージ7(橙の靄の森): 靄に溶ける琥珀色。
  'stage-7': {
    owner: 'shared', farKey: 'stage7',
    pools: [{ w: 210, h: 58, up: 12, alpha: 0.36, tint: 0xffa45a, tintMix: 0.55 }],
  },
};

/** そのステージの松明の裏の光(表に無い=null)。 */
export const torchBackStage = (stageId: string): TorchBackStage | null => TORCH_BACK_STAGES[stageId] ?? null;

export interface TorchBackCtx {
  stageId: string;
  indoor: boolean;
  corridor: boolean;
  /** 今の遠景のキー。 */
  farKey: string | null;
}
/**
 * 共通の層(ステージ3/4/7)がこのフレームで描くべき丸の絵。描かない=null。
 * 表に無いステージ・各ステージの層が描くステージ(1・5)・屋内・回廊・別の遠景では null。
 */
export const sharedTorchBackPools = (c: TorchBackCtx): readonly TorchBackSpec[] | null => {
  const t = torchBackStage(c.stageId);
  if (!t || t.owner !== 'shared') return null;
  if (c.indoor || c.corridor || c.farKey !== t.farKey) return null;
  return t.pools;
};

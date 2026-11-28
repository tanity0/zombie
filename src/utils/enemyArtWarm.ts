// ボス級の絵(立ち絵+遅延シート)を「出る前/出た瞬間」に取りに行く段取りの、描画に依らない決めごと。
//
// 社長報告(ステージ1の2周目): 賞金首の出現アテンションで、寄った先に魔法陣しか映っていなかった。
// 立ち絵(`bosses` 組)と歩き・攻撃のシート(SHEET_RESIDENCY='deferred')は起動時に読まない遅延組で、
// 取りに行くのは盤上に出た瞬間(pixiScene の drawEnemy が全敵を毎フレーム描く=画面外でも網が起きる)。
// 出現→寄り切りまでは 950ms+寄り360ms しか無く、その間に立ち絵とシート(計 約0.36MB の PNG)を
// **同時に**取りに行っていたので、回線が細いと立ち絵が帯域を分け合って間に合わない。
// 直し方は2段:
//   ①立ち絵を先に、シートは立ち絵が届いてから(`enemyArtWarmPlan`)= 立ち絵が帯域を独り占めする。
//   ②そのステージの賞金首は型が決まっている(BOUNTY_TYPE_BY_STAGE)ので、出撃時に先読みする(`stageBountyArtGroup`)。
// RENDERER-AGNOSTIC: PixiJS を import しない(pixiTextures が読む)。

import { BOUNTY_TYPE_BY_STAGE } from '../config/stageDifficulty';
import { allEnemySheets, sheetDeferred } from './enemySheets';

/** その立ち絵が持つ遅延シート(SHEET_RESIDENCY が遅延と決めた個体のシート全部)。並びは表の順。 */
export const deferredSheetsOfIdle = (idle: string): string[] =>
  sheetDeferred(idle) ? allEnemySheets().filter(s => s.idle === idle).map(s => s.sheet) : [];

/**
 * 絵を取りに行く順番。first=先に取りに行く物(立ち絵)、then=first が届いてから取りに行く物(シート)。
 * 立ち絵は「本体が映る」ための最低限、シートは「動く」ための物=立ち絵を待たせない。
 */
export const enemyArtWarmPlan = (idle: string): { first: string[]; then: string[] } => ({
  first: [idle],
  then: deferredSheetsOfIdle(idle).filter(s => s !== idle),
});

/** 出撃時の先読みの組の名前(pixiTextures の DEFERRED_SPRITE_GROUPS のキー)。 */
export const bountyArtGroupKey = (bountyType: string): string => `bounty:${bountyType}`;

/**
 * 賞金首の型 → 先読みする絵の名前(立ち絵+遅延シート)。賞金首の立ち絵の名前は型名そのまま
 * (enemyTexKey のどの差し替えにも掛からない・pixiScene)。
 */
export const bountyArtNames = (bountyType: string): string[] => {
  const p = enemyArtWarmPlan(bountyType);
  return [...p.first, ...p.then];
};

/** 先読みの組の表(賞金首の全型ぶん)。pixiTextures が DEFERRED_SPRITE_GROUPS へ足す。 */
export const BOUNTY_ART_GROUPS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set(Object.values(BOUNTY_TYPE_BY_STAGE).filter((t): t is NonNullable<typeof t> => !!t))]
    .map(t => [bountyArtGroupKey(t), bountyArtNames(t)]),
);

/** そのステージの賞金首の先読みの組のキー。賞金首の居ないステージは null。 */
export const stageBountyArtGroup = (stageId: string): string | null => {
  const t = BOUNTY_TYPE_BY_STAGE[stageId];
  return t ? bountyArtGroupKey(t) : null;
};

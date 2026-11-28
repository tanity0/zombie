// ハンターの「出さない/退かせる」場面の判定(useGameLoop のハンター・ディレクターが使う)。
// 社長指示2026-10-06「ボスと交戦中はハンター出ないようにして」=交戦中(bossFightNow)を
// 追われ中(bossChasing)と同じ扱いにする: 新しく出さない・居るなら退く。

export interface HunterSceneInput {
  bossChasing: boolean;
  /** ボスと交戦中(bossEngagedNow=城ボス/裏ボス/ゲート2ボス/賞金首など ENGAGEABLE_BOSS_TYPES)。 */
  bossFightNow: boolean;
  redNightActive: boolean;
  /** ジャイアント/リーパー系が場に居る。 */
  giantOrReaper: boolean;
  /** アテンション(カットイン)表示中。 */
  attention: boolean;
}

/** 出現を止める場面(=索敵中なら立ち去る)。 */
export const hunterCinematic = (s: HunterSceneInput): boolean =>
  s.bossChasing || s.bossFightNow || s.attention || s.redNightActive || s.giantOrReaper;

/** 追跡中のハンターを退かせる場面。アテンションは除く(発見時に自分で出すアテンションで即撤退しないため)。 */
export const hunterRetreatCinematic = (s: HunterSceneInput): boolean =>
  s.bossChasing || s.bossFightNow || s.redNightActive || s.giantOrReaper;

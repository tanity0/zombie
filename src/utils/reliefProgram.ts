// PACING_REDESIGN.mdバッチ4: 緩の演目選択(RELAX/HARVESTのプロデュース)。
// フェーズ境界(山→緩)で、直前の山の試験結果(バッチ2)から演目を選ぶ純関数。演目=SpawnSceneと
// 同形のデータ(mix/featured/suppressed/intervalMult/rareMult)+XP倍率適用有無。
// 台本PHASESの時刻・種別は不変。緩フェーズの「中身(シーン)」だけを演目が差し替える。
//
// 実機確認③での社長決定:
//  - HARVEST=雑魚無双(旧「パンプキン2体の狩猟」案は廃止)。
//  - 講習は主役1体だけ(同時1・1フェーズ合計1体・キル後は再投入しない=呼び出し側のstateで管理)。
//  - 終盤(城ボス時刻7:00以降)の緩は講習・純休憩を選ばず、既定=HARVEST無双。例外は成績最悪のみ。
import type { EnemyType } from '../types/game';
import type { SpawnScene } from './difficultyDirector';

export type ReliefProgramId = 'relax' | 'lesson-wolf' | 'lesson-pumpkin' | 'recovery' | 'harvest';

// SpawnSceneと同形(featured/intervalMult/suppressed/rareMult/featuredFloor/mix)+バッチ4固有フィールド。
// useGameLoop側でSpawnScene代わりにそのまま使える(既存のsceneFeatured等の消費コードを流用)。
export interface ReliefProgram extends SpawnScene {
  id: ReliefProgramId;
  xpBoost: boolean;             // rankAdj.rewardMult を適用するか(HARVEST/回収のみ)
  lessonPrimary?: EnemyType;    // 講習系のみ: 1フェーズ合計1体だけ投入する主役
  recoveryPrimary?: EnemyType;  // 回収のみ: 弱め少数で投入する対象(前の山の主役)
}

export const RELAX_PROGRAM: ReliefProgram = {
  id: 'relax', mix: { bat: 70, skeleton: 25, zombie: 5 }, featured: [], suppressed: ['zombie'],
  intervalMult: 1.3, rareMult: 0, xpBoost: false,
};

export const HARVEST_PROGRAM: ReliefProgram = {
  id: 'harvest', mix: { bat: 70, skeleton: 25, zombie: 5 }, featured: [], suppressed: ['zombie'],
  intervalMult: 0.6, rareMult: 0.5, xpBoost: true,
};

type LessonType = 'werewolf' | 'pumpkin';

export const lessonProgram = (type: LessonType): ReliefProgram => ({
  id: type === 'werewolf' ? 'lesson-wolf' : 'lesson-pumpkin',
  mix: { bat: 55, skeleton: 40, zombie: 5 }, featured: [type], suppressed: ['zombie'],
  intervalMult: 1.1, rareMult: 0, featuredFloor: true, xpBoost: false, lessonPrimary: type,
});

export const recoveryProgram = (type: EnemyType): ReliefProgram => ({
  id: 'recovery',
  mix: { bat: 60, skeleton: 35, zombie: 5 }, featured: [type], suppressed: ['zombie'],
  // 「弱め少数」: 個体そのものの弱体化はスコープ外(実機調整前提・別途検討)。「少数」は間隔を緩めに
  // することで表現する(harvest=0.6より遅い1.0)。
  intervalMult: 1.0, rareMult: 0.3, featuredFloor: true, xpBoost: true, recoveryPrimary: type,
});

// 城ボス時刻(difficultyDirector.ts/useGameLoopのCASTLE_BOSS_MIN_TIME_MSと同じ7分)。
// pure関数なので依存を持たずここに複製(値は実機調整前提で両者を揃えること)。
export const RELIEF_LATE_GAME_MS = 7 * 60 * 1000;
const LESSON_WINDOW_MS = 4 * 60 * 1000;      // 講習は序盤(〜4分)だけ選ばれる
const LESSON_EXPERIENCE_MAX = 3;             // 通算キル数がこれ未満なら「経験が少ない」
const RELAX_SCORE_MAX = 0.4;                 // これ未満で純休憩
const RELAX_SCORE_MAX_LATE = 0.25;           // 7:00以降はこれ未満の時だけ純休憩(それ以外はHARVEST)
// PACING_V2.mdバッチR4-A: 深入りの立て直しコマ(difficultyDirector.ts新PHASESのbuildup⑤=
// 7:30-8:30と同じ窓)。pure関数なので依存を持たずここに複製(値は実機調整前提で両者を揃えること)。
const DEEP_DIVE_REGROUP_START_MS = 450 * 1000; // 7:30
const DEEP_DIVE_REGROUP_END_MS = 510 * 1000;   // 8:30

export interface ReliefProgramInput {
  gameTimeMs: number;
  score: number; // 0-1、直前gateの成績(directorRankのevaluatePhasePerformanceと同じ尺度)
  lessonExperience: { werewolf: number; pumpkin: number }; // 通算キル数(経験の代理指標)
  struggleType: EnemyType | null; // 直前gateで主役だったのに苦戦(キルが少ない)した型。無ければnull
  intro?: boolean; // 導入(まだ関所を1つも経ていない最初のbuildup)。GAME_AUDIT #6
  // PACING_V2.mdバッチR4-A: 直近に見せた演目id(純休憩⇄HARVESTの直前禁止判定用。無ければnull)。
  // 講習/回収/導入時のfixed選択では参照しない(そちらは既存条件をそのまま維持)。
  lastProgramId?: ReliefProgramId | null;
}

// PACING_V2.mdバッチR4-A: 緩の演目ローテ。条件付き演目(回収/講習)の適格条件・優先順位・
// 終盤(7:00以降)が講習/純休憩を選ばない既存仕様は完全に維持したまま、「どちらも不適格」だった
// 場合の末尾(旧: 常にHARVEST固定)だけを純休憩⇄HARVESTの交互(直前禁止)に置き換える。
// 候補が2つ(relax/harvest)しか無いため、「未見優先」は「直前と違う方を選ぶ」に一致する
// (両方見た後の未見集合は常に空になるため、直前禁止だけで仕様上の未見優先と同じ結果になる)。
export const selectReliefProgram = (input: ReliefProgramInput): ReliefProgram => {
  // GAME_AUDIT #6: 導入(buildup①)は成績が未計測(仮値0.7)のまま講習が選ばれ、
  // 「静かな立ち上がり」が初手から犬講習に置き換わっていた。導入は必ず純休憩。
  if (input.intro) return RELAX_PROGRAM;
  // PACING_V2.mdバッチR4-A: 深入りの立て直しコマは純休憩固定(社長指定。以降は既存どおり)。
  if (input.gameTimeMs >= DEEP_DIVE_REGROUP_START_MS && input.gameTimeMs < DEEP_DIVE_REGROUP_END_MS) return RELAX_PROGRAM;
  const late = input.gameTimeMs >= RELIEF_LATE_GAME_MS;
  const lastId = input.lastProgramId ?? null;
  const alternate = (): ReliefProgram => (lastId === 'relax' ? HARVEST_PROGRAM : lastId === 'harvest' ? RELAX_PROGRAM : HARVEST_PROGRAM);
  if (late) {
    // 終盤の緩はだれさせない: 講習・純休憩を選ばず、既定=HARVEST無双。例外は成績最悪のみ。
    return input.score < RELAX_SCORE_MAX_LATE ? RELAX_PROGRAM : alternate();
  }
  if (input.score < RELAX_SCORE_MAX) return RELAX_PROGRAM;
  if (input.gameTimeMs < LESSON_WINDOW_MS) {
    if (input.lessonExperience.werewolf < LESSON_EXPERIENCE_MAX) return lessonProgram('werewolf');
    if (input.lessonExperience.pumpkin < LESSON_EXPERIENCE_MAX) return lessonProgram('pumpkin');
  }
  if (input.struggleType) return recoveryProgram(input.struggleType);
  return alternate();
};

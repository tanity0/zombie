// ボス出現カットイン(PACING_PUZZLE.md §6.36)と、ボスモード等の「ボスの表示名」の台帳。
// 名前の正本はここ1箇所(CLAUDE.md「同じ文章を2箇所で管理しない」)。
//
// 掟(§6.36・社長裁定2026-08-07):
//  - 名前はプレイヤー既出 or 社長裁定のもののみ。**新しい名前をここで発明しない。**
//  - 台帳に無いボス=「実装してないボス」。カットインは出さず、ボスモード等の表示は「?」
//    (社長指示「実装してないボスは、ボスモードでもどこでも?にしといて」)。
//    現状の該当: 城ボス stage-2(城ボス不在=永久ロック§20-10)/ stage-ex1(未確認変異体=
//    名を出さない方針・統合正本10.3)。
import type { EnemyType } from '../types/game';

/** 城ボス(giantbat)のステージ別表示名(社長裁定2026-08-07)。無いステージは「?」扱い。 */
export const CASTLE_BOSS_NAME_BY_STAGE: Record<string, string> = {
  'stage-1': '搬送体(変異)',
  'stage-3': '樹木管理員(変異)',
  'stage-4': '衛生兵(変異)',
  'stage-5': '軍隊(変異)',
  'stage-7': 'グレン',
};

/** 固有名ボスのカットイン表示名(プレイヤー既出の和名のみ)。 */
const NAMED_BOSS_CUTIN_NAME: Partial<Record<EnemyType, string>> = {
  mimir: 'ミーミル',
  jormungand: 'ヨルムンガルド',
  skadi: 'スカジ',
  thor: 'トール',
  idol: '偶像',
  miguel: 'ミゲル',
  jibril: 'ジブリル',
  rafi: 'ラフィ',
  uri: 'ウリ',
  suriel: 'スリィエル',
  acrasiel: 'アクラシエル',
  // PACING_PUZZLE.md §10-12#5(EXボス「フィル(変異体)」): 素材と名前が確定したので名を出す
  // (統合正本10.3の「未確認変異体」裁定=当時は名を伏せる意図だったが今は確定=出す方が良いと判断。
  // 過去の裁定は事実として併記/CLAUDE.md「★過去の裁定は制約ではなく事実」)。
  phillboss: 'フィル(変異体)',
  // PACING_PUZZLE.md §6.38 v9(完全コピー原則): 賞金首4種も城ボスと同じ出現カットインを出す。
  'bounty-ranged': 'バス停(変異)',
  'bounty-melee': '馬乗り(変異)',
  'bounty-balance': '鋏(変異)',
  'bounty-maiko': '舞妓(変異)',
  // 社長裁定2026-08-28「死神も紹介入れて。『礼賛』」「ハンターも入ってないっけ?入れて『監視者』」。
  // 台帳の掟(名前を発明しない)に対し、これは社長支給の二つ名=そのまま登録。
  // 死神=完全出現アテンション/ハンター=発見アテンション(1波1回)にカットインが乗る(useGameLoop)。
  reaper: '礼賛',
  hunter: '監視者',
};

/**
 * カットイン/一覧に出す表示名。null = 台帳に無い(実装してないボス)ので、
 * カットインは出さず、一覧は「?」で出す。
 */
export const bossCutinName = (bossType: EnemyType, stageId?: string | null): string | null => {
  if (bossType === 'giantbat') return CASTLE_BOSS_NAME_BY_STAGE[stageId ?? ''] ?? null;
  return NAMED_BOSS_CUTIN_NAME[bossType] ?? null;
};

// ボスラッシュ(練習モード)の台帳と判定。BOSS_MAKER.md §20。
//
// 社長仕様: 「ラッシュは連戦じゃない。1体」「一度ステージで出会ったことがあれば解放される。
// 練習モードの位置づけ」「死神とハンターはボスに含まない」「ステージボスは全員含める」。
//
// ★このモジュールが持つのは**台帳と判定だけ**。UIは components/BossRush.tsx、
//   遭遇の記録は utils/bossEncounter.ts。ボスの挙動・HP・技には一切触らない。
import type { EnemyType } from '../types/game';
import { bossCutinName } from '../data/bossCutin';
import { GHOST_DOSSIER_SLOTS, type GhostDossierSlot } from './ghostDossier';
import { stageIdForGateBoss } from '../config/gateBoss';
import { getStage, STAGES } from '../data/campaign';
import {
  STAGE_BOSS_HEALTH_BY_STAGE, GATE_BOSS_HEALTH, HIDDEN_BOSS_HEALTH,
} from '../config/bossHealth';
import { isBountyType } from './enemyUtils';
// ★HP基準値は依存ゼロの葉(bountyDims.ts)から直接読む。bountyTick.ts経由にすると
// 「gameStore → bossPractice → bountyTick → gameStore」の循環importになる(v0.25.3390の教訓と同型)。
import { BOUNTY_BASE_HP } from './bountyDims';

// ---------------------------------------------------------------------------------------------
// 出撃の種類(ランのフラグ)
// ---------------------------------------------------------------------------------------------
const param = (k: string): string | null =>
  typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(k);

/**
 * 練習ラン(ボスラッシュ)か。**モジュールロード時に1回だけ**読む(他のデバッグフラグと同じ作法)。
 *
 * ★`BOSS_TEST_RUN` に相乗りしない理由(BOSS_MAKER.md §20-6-a): `giantbat@stage-7 / @stage-ex1` は
 * **強制出現パラメータ無しで出撃する**(storyBoss経路で勝手に出るため)ので、相乗りだと
 * **枠によって安全弁が効いたり効かなかったりする**。進行を止める判定は必ずこの1つで行う。
 */
// URL経由の練習(直リンク/テスト用)。**通常の導線はURLを使わない**(下記 beginPracticeRun)。
export const PRACTICE_RUN_URL = param('practice') === '1';

// ---------------------------------------------------------------------------------------------
// ★実行中の練習ラン(v0.25.2862・社長指摘「この導線おかしいでしょ。ゲームからそのまま
//   シームレスに戦闘に入らないと」)
//
// 旧実装は出撃を `window.location.search` の差し替え=**ページ再読込**で行っていた。
// 強制出現フラグ(`?castlenow` 等)が useGameLoop の**モジュールロード時定数**だったため。
// 結果、メニューから戦闘へ入るのに「全画面リロード → 起動ローディング」を挟んでいた。
// ⇒ **練習ランの指定を実行時の状態に持ち替える**。通常の出撃(`startGame`)と同じ経路で入るので
//   リロードは起きない。URL版(`?practice=1`)は直リンク用に残す。
// ※ボスメーカー(別ページ)は引き続きURL方式(あちらは入口ごと分かれているので再読込で構わない)。
let activeSlot: PracticeSlot | null = null;

/** 練習ランに入る。`restore` は終了時に呼び出し側へ返す「元に戻すための値」。 */
export const beginPracticeRun = (slot: PracticeSlot, restore: PracticeRestore): void => {
  activeSlot = slot;
  practiceRestore = restore;
};
/** 練習ランを抜ける。呼び出し側は返り値で選択状態を元に戻す。 */
export const endPracticeRun = (): PracticeRestore | null => {
  const r = practiceRestore;
  activeSlot = null;
  practiceRestore = null;
  return r;
};
export interface PracticeRestore { stageId: string; mission: string; free: boolean }
let practiceRestore: PracticeRestore | null = null;

/** いま練習ラン中か(実行時の指定 or URL直リンク)。 */
export const isPracticeRun = (): boolean => activeSlot !== null || PRACTICE_RUN_URL;

/**
 * 練習で狙っているボスの型(`?practiceboss=`)。**「ラッシュは1体」(社長)の実現に使う。**
 * 練習ランは `?nospawn=1` を必ず付けて雑魚も他のボスも止めるが、**城ボス/ストーリーボスを
 * 練習する時だけは nospawn を上書きして出す**必要があるので、その判定にこれを使う。
 */
const PRACTICE_BOSS_URL: EnemyType | null = (param('practiceboss') as EnemyType | null) || null;
/** 練習で狙っているボスの型。 */
export const practiceBossType = (): EnemyType | null => activeSlot?.bossType ?? PRACTICE_BOSS_URL;
/** 現在選択中の練習枠。リザルトの形態名・専用アイコンにも同じ指定を渡す。 */
export const practiceActiveSlot = (): PracticeSlot | null => activeSlot;
/** グレン第二形態を最初から出すか(glenForm===2 の個体をフルHPでスポーン)。
 * ★v0.25.3600「合体」裁定でメニューの第二形態枠は撤去済み=通常の練習は常に形態1から。
 * 開発用の直リンク `?practice=1&practicephase=2` だけがこの経路を使う。 */
export const practiceWantsGlenForm2 = (): boolean =>
  activeSlot?.glenForm2 === true || (PRACTICE_RUN_URL && param('practicephase') === '2');
/** 練習の狙いが城ボス(giantbat)か。城ボス/ストーリーボスの湧きを nospawn より優先させる。 */
export const practiceWantsCastleBoss = (): boolean => isPracticeRun() && practiceBossType() === 'giantbat';
/**
 * 練習が指定の強制出現パラメータを要求しているか。
 * useGameLoop の各湧きゲートは `既存の?フラグ || practiceForces('...')` で読む
 * (=**既存のURL経路は一切変えない**。練習はそこへ相乗りするだけ)。
 */
export const practiceForces = (p: Exclude<PracticeParam, null>): boolean => {
  if (activeSlot) return activeSlot.param === p;
  return PRACTICE_RUN_URL && param(p) === '1';
};

/** 練習 or 開発用ボス戦テスト(遭遇を記録してはいけないラン)。 */
export const isBossTestOrPracticeRun = (): boolean =>
  isPracticeRun()
  || ['bossnow', 'idolnow', 'gateboss', 'castlenow', 'bossmaker'].some(k => param(k) === '1');

// ---------------------------------------------------------------------------------------------
// 台帳: 守護霊メニューと同じ基礎台帳(GHOST_DOSSIER_SLOTS)+形態別の派生枠
// ---------------------------------------------------------------------------------------------
/** 出撃のさせ方。`param=null` = 強制出現パラメータ不要(ステージへ出撃すれば勝手に出る)。 */
export type PracticeParam = 'castlenow' | 'gateboss' | 'bossnow' | 'idolnow' | 'bountynow' | null;

export interface PracticeSlot {
  slotKey: string;              // 基本はGHOST_DOSSIER_SLOTS.slotKeyと同一。形態別掲載だけ固有キー。
  /** 遭遇解放に使う本編側の枠。形態別の掲載枠は第一形態と同じ遭遇記録を共有する。 */
  encounterSlotKey: string;
  bossType: EnemyType;
  stageId: string;              // 出撃先
  param: PracticeParam;
  /** 一覧・リザルトだけで使う固有名。未指定なら従来の enemyDeathLabel。 */
  label?: string;
  /** グレン第二形態を最初から出す枠。★v0.25.3600「合体」裁定でメニューからは撤去済み
   * (どの枠も設定しない)。型と描画分岐(BossRush/PracticeResultのphase2アイコン)は
   * 開発用直リンク `?practicephase=2` のために残している。 */
  glenForm2?: boolean;
  /** 本編で遭遇し得るか。false = 現状どこにも置かれていない(社長裁定§20-10: 「?」のまま並べる)。 */
  reachable: boolean;
}

// 城ボスの湧きゲート(useGameLoop)は `!labTheme && !storyBoss` を要求する。
// よって `castlenow` が効くのは**その両方に当たらないステージだけ**。
// storyBoss ステージ(7 / ex1)は castlenow が効かない代わりに**storyBoss経路で勝手に出る**ので
// パラメータ不要。lab ステージ(2)は**本編にも城ボスが存在しない**=どうやっても出ない。
const castleSortie = (stageId: string): { param: PracticeParam; reachable: boolean } => {
  const st = getStage(stageId);
  if (st?.theme === 'lab') return { param: null, reachable: false }; // stage-2: 城ボス不在
  if (st?.storyBossOnly) return { param: null, reachable: true };    // stage-7 / ex1: 勝手に出る
  return { param: 'castlenow', reachable: true };
};

/** 裏ボス型 → そのボスが置かれているステージID(campaign.hiddenBoss の逆引き)。 */
const stageIdForHiddenBoss = (bossType: EnemyType): string | null =>
  STAGES.find(s => s.hiddenBoss === bossType)?.id ?? null;

const toPracticeSlot = (slot: GhostDossierSlot): PracticeSlot => {
  if (slot.bossType === 'giantbat') {
    const stageId = slot.stageId ?? 'stage-1';
    const { param: p, reachable } = castleSortie(stageId);
    // 表示名はカットインと同じ台帳(src/data/bossCutin.ts)を引く。台帳に無いステージの城ボス=
    // 実装してないボスなので「?」(社長指示2026-08-07「実装してないボスは、ボスモードでもどこでも?に
    // しといて」)。該当: stage-2(城ボス不在)/ stage-ex1(未確認変異体=名を出さない)。
    return {
      slotKey: slot.slotKey, encounterSlotKey: slot.slotKey, bossType: 'giantbat', stageId, param: p, reachable,
      label: bossCutinName('giantbat', stageId) ?? '?',
    };
  }
  if (slot.bossType === 'idol') {
    return { slotKey: slot.slotKey, encounterSlotKey: slot.slotKey, bossType: 'idol', stageId: 'stage-2', param: 'idolnow', reachable: true };
  }
  const gateStage = stageIdForGateBoss(slot.bossType);
  if (gateStage) {
    // ゲート2の自然発火は `!storyBoss` を要求し、洋館通路(stage-6)は予約ごとスキップされる。
    // よってスリィエル(stage-6)とアクラシエル(stage-ex1)は**本編では遭遇できない**。
    const st = getStage(gateStage);
    const reachable = !st?.storyBossOnly && gateStage !== 'stage-6';
    return { slotKey: slot.slotKey, encounterSlotKey: slot.slotKey, bossType: slot.bossType, stageId: gateStage, param: 'gateboss', reachable };
  }
  const hiddenStage = stageIdForHiddenBoss(slot.bossType);
  if (hiddenStage) {
    return { slotKey: slot.slotKey, encounterSlotKey: slot.slotKey, bossType: slot.bossType, stageId: hiddenStage, param: 'bossnow', reachable: true };
  }
  // 台帳に載っているのに出撃先が引けない = 表のズレ。テストで落とす(黙って既定に寄せない)。
  throw new Error(`bossPractice: 出撃先を解決できない枠 "${slot.slotKey}"`);
};

/**
 * ボスラッシュに並ぶ枠。守護霊メニューと同じ順・粒度。
 * ★グレン第二形態の独立枠(v0.25.3029「二体」時代の 'giantbat@stage-7:phase2')は
 * 社長裁定v0.25.3600「第二形態は第一形態と合体させて。第一倒したら第二に移行」で撤去。
 * 本編と同じ流れ(形態1討伐→アテンション明けに形態2が同位置に湧く)を練習でもそのまま踏む。
 * 形態2だけを直接練習したい時は開発用の直リンク `?practice=1&practicephase=2` が残っている。
 */
const GHOST_DERIVED_SLOTS: readonly PracticeSlot[] = GHOST_DOSSIER_SLOTS.map(toPracticeSlot);

// ---------------------------------------------------------------------------------------------
// §6.38 掲載裁定: 賞金首4種(GHOST_DOSSIER_SLOTS由来ではない独立追記枠)。
// 解放は本編遭遇と共有する既存規約に乗せる——encounterSlotKey=bossType文字列そのものは
// bossStyleSlotKey()(src/utils/ghostSlot.ts)がgiantbat以外の型に対して返すキーと同一形式
// (isEngageableBossに賞金首4型が既に入っているので、directorTick.tsのengagedBossSlotKeys→
// markBossesEncounteredが本編交戦開始時にこのキーをそのまま記録する。追加配線は不要)。
// 出撃先=stage-1(lab/corridorではない野外・v6 B-5)。デバッグ強制出現は`?bountynow=1`相乗り
// (useGameLoop.tsのFORCE_BOUNTY判定がpracticeForces('bountynow')を見る)。
const BOUNTY_PRACTICE_LABEL: Record<'bounty-ranged' | 'bounty-melee' | 'bounty-balance' | 'bounty-maiko', string> = {
  'bounty-ranged': 'バス停(変異)',
  'bounty-melee': '馬乗り(変異)',
  'bounty-balance': '鋏(変異)',
  'bounty-maiko': '舞妓(変異)',
};
const BOUNTY_PRACTICE_TYPES = ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as const;
const BOUNTY_PRACTICE_SLOTS: readonly PracticeSlot[] = BOUNTY_PRACTICE_TYPES.map(t => ({
  slotKey: `${t}@practice`,
  encounterSlotKey: t,
  bossType: t,
  stageId: 'stage-1',
  param: 'bountynow',
  label: BOUNTY_PRACTICE_LABEL[t],
  reachable: true,
}));

// 表示順=小ボス(賞金首)が一番上(社長指示v0.25.3444「小ボスは一番上だろ」。旧: 既存ボス群の後ろ)。
export const PRACTICE_SLOTS: readonly PracticeSlot[] = [...BOUNTY_PRACTICE_SLOTS, ...GHOST_DERIVED_SLOTS];

// ★変異体対策室のカテゴリ表示順の正(社長指示v0.25.3444「小ボスは一番上だろ」)。
// v3444では上の PRACTICE_SLOTS の並びだけを直したが、画面(BossRush.tsx)は**カテゴリごとに区切って
// 描く**ので並びが変わっていなかった(社長再指摘v0.25.3457)。順番の定義はここ1箇所にして、
// 画面はこれをそのまま回す=同じ取りこぼしを繰り返さない(bossPractice.testで先頭を機械化)。
export const PRACTICE_CATEGORY_ORDER = ['bounty', 'story', 'gate', 'hidden'] as const;

export const practiceSlotByKey = (slotKey: string): PracticeSlot | undefined =>
  PRACTICE_SLOTS.find(s => s.slotKey === slotKey);

// ---------------------------------------------------------------------------------------------
// 表示用のHP(BOSS_MAKER.md §20-8)
// ---------------------------------------------------------------------------------------------
/**
 * 枠のHP。**引けない枠は null**(画面は「—」を出す)。
 * ※v0.25.3164(社長決定「ボスのHPは増やす台本を適用しよう」)で、**stage-7のグレンは台帳どおり
 *   6000で戦うようになった**ので、そのまま表示してよくなった。
 *   旧: storyBossは台帳を通らず実効2500で戦っており、表の6000を出すと嘘になるので出していなかった
 *   (当時のコメントは「base(500)のまま/12倍の嘘」と書いていたが、**×ENEMY_HP_MULT(5)を見落とした
 *    誤り**。正しくは2500で2.4倍のズレだった)。
 * ★**stage-ex1 は台帳に行が無い**ので従来どおり実効2500=表示できない(null)。
 */
export const practiceBossHealth = (slot: PracticeSlot): number | null => {
  if (slot.bossType === 'giantbat') {
    // 台帳に行があれば、その値で戦っている(v0.25.3164でストーリーボスも台帳を通るようになった)。
    // 行が無い枠(stage-ex1)だけは実際のHPと表が違うので出さない。
    return STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId] ?? null;
  }
  // §6.38(賞金首): 実効HPは基準値(BOUNTY_BASE_HP)×スポーン時の実効難易度倍率(bountyMaxHealth)で
  // 変動するため、台帳の固定値ではなく**基準値をそのまま**出す(掲載裁定「基準値2000を出す」)。
  if (isBountyType(slot.bossType)) return BOUNTY_BASE_HP;
  const gate = (GATE_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  if (gate != null) return gate;
  const hidden = (HIDDEN_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  return hidden ?? null;
};

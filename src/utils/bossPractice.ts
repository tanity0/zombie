// ボスラッシュ(練習モード)の台帳と判定。BOSS_MAKER.md §20。
//
// 社長仕様: 「ラッシュは連戦じゃない。1体」「一度ステージで出会ったことがあれば解放される。
// 練習モードの位置づけ」「死神とハンターはボスに含まない」「ステージボスは全員含める」。
//
// ★このモジュールが持つのは**台帳と判定だけ**。UIは components/BossRush.tsx、
//   遭遇の記録は utils/bossEncounter.ts。ボスの挙動・HP・技には一切触らない。
import type { EnemyType } from '../types/game';
import { GHOST_DOSSIER_SLOTS, type GhostDossierSlot } from './ghostDossier';
import { stageIdForGateBoss } from '../config/gateBoss';
import { getStage, STAGES } from '../data/campaign';
import {
  STAGE_BOSS_HEALTH_BY_STAGE, GATE_BOSS_HEALTH, HIDDEN_BOSS_HEALTH,
} from '../config/bossHealth';

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
export const PRACTICE_RUN = param('practice') === '1';
export const isPracticeRun = (): boolean => PRACTICE_RUN;

/**
 * 練習で狙っているボスの型(`?practiceboss=`)。**「ラッシュは1体」(社長)の実現に使う。**
 * 練習ランは `?nospawn=1` を必ず付けて雑魚も他のボスも止めるが、**城ボス/ストーリーボスを
 * 練習する時だけは nospawn を上書きして出す**必要があるので、その判定にこれを使う。
 */
export const PRACTICE_BOSS: EnemyType | null = (param('practiceboss') as EnemyType | null) || null;
/** 練習の狙いが城ボス(giantbat)か。城ボス/ストーリーボスの湧きを nospawn より優先させる。 */
export const practiceWantsCastleBoss = (): boolean => PRACTICE_RUN && PRACTICE_BOSS === 'giantbat';

/** 練習 or 開発用ボス戦テスト(遭遇を記録してはいけないラン)。 */
export const isBossTestOrPracticeRun = (): boolean =>
  PRACTICE_RUN
  || ['bossnow', 'idolnow', 'gateboss', 'castlenow', 'bossmaker'].some(k => param(k) === '1');

// ---------------------------------------------------------------------------------------------
// 台帳: 守護霊メニューと**同じ1本**(GHOST_DOSSIER_SLOTS)を使う
// ---------------------------------------------------------------------------------------------
/** 出撃のさせ方。`param=null` = 強制出現パラメータ不要(ステージへ出撃すれば勝手に出る)。 */
export type PracticeParam = 'castlenow' | 'gateboss' | 'bossnow' | 'idolnow' | null;

export interface PracticeSlot {
  slotKey: string;              // GHOST_DOSSIER_SLOTS.slotKey と同一
  bossType: EnemyType;
  stageId: string;              // 出撃先
  param: PracticeParam;
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
    return { slotKey: slot.slotKey, bossType: 'giantbat', stageId, param: p, reachable };
  }
  if (slot.bossType === 'idol') {
    return { slotKey: slot.slotKey, bossType: 'idol', stageId: 'stage-2', param: 'idolnow', reachable: true };
  }
  const gateStage = stageIdForGateBoss(slot.bossType);
  if (gateStage) {
    // ゲート2の自然発火は `!storyBoss` を要求し、洋館通路(stage-6)は予約ごとスキップされる。
    // よってスリィエル(stage-6)とアクラシエル(stage-ex1)は**本編では遭遇できない**。
    const st = getStage(gateStage);
    const reachable = !st?.storyBossOnly && gateStage !== 'stage-6';
    return { slotKey: slot.slotKey, bossType: slot.bossType, stageId: gateStage, param: 'gateboss', reachable };
  }
  const hiddenStage = stageIdForHiddenBoss(slot.bossType);
  if (hiddenStage) {
    return { slotKey: slot.slotKey, bossType: slot.bossType, stageId: hiddenStage, param: 'bossnow', reachable: true };
  }
  // 台帳に載っているのに出撃先が引けない = 表のズレ。テストで落とす(黙って既定に寄せない)。
  throw new Error(`bossPractice: 出撃先を解決できない枠 "${slot.slotKey}"`);
};

/** ボスラッシュに並ぶ枠。守護霊メニューと同じ順・同じ粒度。 */
export const PRACTICE_SLOTS: readonly PracticeSlot[] = GHOST_DOSSIER_SLOTS.map(toPracticeSlot);

export const practiceSlotByKey = (slotKey: string): PracticeSlot | undefined =>
  PRACTICE_SLOTS.find(s => s.slotKey === slotKey);

// ---------------------------------------------------------------------------------------------
// 表示用のHP(BOSS_MAKER.md §20-8)
// ---------------------------------------------------------------------------------------------
/**
 * 枠のHP。**引けない枠は null**(画面は「—」を出す)。
 * ★storyBoss(stage-7 グレン / stage-ex1)は `stageBossHealthFor` を通らず、`enemyUtils` の
 *   base(500)のまま戦っている。表の 6000 を出すと**12倍の嘘**になるので出さない。
 *   ボス側のHPを変えるのはバランス変更なのでここではやらない(§20-2)。
 */
export const practiceBossHealth = (slot: PracticeSlot): number | null => {
  if (slot.bossType === 'giantbat') {
    if (getStage(slot.stageId)?.storyBossOnly) return null; // 実際のHPと表が違う
    return STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId] ?? null;
  }
  const gate = (GATE_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  if (gate != null) return gate;
  const hidden = (HIDDEN_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  return hidden ?? null;
};

// ---------------------------------------------------------------------------------------------
// 出撃URL(BOSS_MAKER.md §20-7)
// ---------------------------------------------------------------------------------------------
/**
 * 練習出撃のクエリを作る。**強制出現フラグはモジュールロード時定数**なので、遷移は
 * `window.location.search` の差し替え(ページ再読込)で行う(React遷移では効かない)。
 *
 * ★`?nospawn=1` を必ず付ける = 雑魚も他のボスも湧かない(社長「ラッシュは1体」)。
 *   5分で湧く城ボスや、ex1で同時に湧くストーリーボスもこれで止まる。
 *   城ボス自身を練習する時だけ `practiceboss=giantbat` が nospawn を上書きする(useGameLoop側)。
 * ★`mission=main` / `free=0` を明示する: `selectedMission='revisit'` が端末に残っていると
 *   stage-6 の練習が**洋館再訪ラン**に化ける(内容もクリア処理も別物)。
 * ★守護霊は選ばせない(社長指示v0.25.2857「スキル装備していけばいいだけ」)= `?ghost` は付けない。
 */
export const practiceQuery = (slot: PracticeSlot, characterClass: string): string => {
  const p = new URLSearchParams();
  p.set('smoke', '1');
  p.set('stage', slot.stageId);
  p.set('practice', '1');
  p.set('practiceboss', slot.bossType);
  p.set('nospawn', '1');
  if (slot.param) p.set(slot.param, '1');
  p.set('class', characterClass);
  p.set('retry', '1'); // 開始時会話をスキップ
  return `?${p.toString()}`;
};

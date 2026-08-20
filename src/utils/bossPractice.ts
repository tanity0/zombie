// ボスラッシュ(練習モード)の台帳と判定。BOSS_MAKER.md §20。
//
// 社長仕様: 「ラッシュは連戦じゃない。1体」「一度ステージで出会ったことがあれば解放される。
// 練習モードの位置づけ」「死神とハンターはボスに含まない」「ステージボスは全員含める」。
//
// ★このモジュールが持つのは**台帳と判定だけ**。UIは components/BossRush.tsx、
//   遭遇の記録は utils/bossEncounter.ts。ボスの挙動・HP・技には一切触らない。
import type { CharacterClass, EnemyType } from '../types/game';
import { bossCutinName } from '../data/bossCutin';
import { GHOST_DOSSIER_SLOTS, type GhostDossierSlot } from './ghostDossier';
import { stageIdForGateBoss } from '../config/gateBoss';
import { getStage, STAGES } from '../data/campaign';
import {
  STAGE_BOSS_HEALTH_BY_STAGE, GATE_BOSS_HEALTH, HIDDEN_BOSS_HEALTH, guardianPhantomHealth,
} from '../config/bossHealth';
// research/GHOST_BOSS.md(幻影): 表示名の出どころ=守護霊台帳の人物名(名前を写経しない)。
import { strongestGuardian } from '../data/fixedGuardians';
// ★research/GROWTH.md v4「唯一の例外=ラン外のメニュー表示」: 出撃前は焼き値が存在しないので、
// 幻影HPの**表示に限り**有効段数を直読みする。読み先は保存を読む純関数だけ(store経由は
// gameStore → bossPractice の循環importになるので不可)。ゲームプレイの参照は焼き値のみ。
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { activeUpgradeLevel, growthMaxHpBonus, loadPlayerUpgrades } from './playerUpgrades';
import { isBountyType } from './enemyUtils';
// ★HP基準値は依存ゼロの葉(bountyDims.ts)から直接読む。bountyTick.ts経由にすると
// 「gameStore → bossPractice → bountyTick → gameStore」の循環importになる(v0.25.3390の教訓と同型)。
import { BOUNTY_BASE_HP } from './bountyDims';
// research/STAGE_DIFFICULTY.md: ステージ難度の階段(HP係数)。**生の台帳を直接読む**——表示は常に
// 「プレイヤーが見る実戦の値」で、計測路の中立化(utils/stageDiffMults)は一覧を出さない場面の話なので
// ここでは通さない。config/stageDifficulty.ts は依存ゼロの葉=循環importにならない。
import { stageHpMult, BOUNTY_HOME_STAGE } from '../config/stageDifficulty';

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
export type PracticeParam = 'castlenow' | 'gateboss' | 'bossnow' | 'idolnow' | 'bountynow' | 'phantomnow' | null;

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
  /**
   * research/GHOST_BOSS.md: **本編の遭遇記録を待たずに最初から選べる枠**。
   *
   * なぜ要るか: 対策室の解放は「一度ステージで出会っていること」(encounterSlotKey の遭遇記録)が
   * 条件だが、幻影は**本編のどこにも置かれていない**ので、その輪だけでは永久に開かない。
   * 遭遇記録の掟そのものは触らず(既存ボスの解放条件は1bitも変えない)、この枠だけを別の入口で開ける。
   */
  alwaysUnlocked?: true;
}

/** その枠が今えらべるか(遭遇記録 or 常時解放)。**画面と台帳テストが同じ1本を見る**。 */
export const practiceSlotUnlocked = (slot: PracticeSlot, encountered: ReadonlySet<string>): boolean =>
  slot.alwaysUnlocked === true || encountered.has(slot.encounterSlotKey);

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
// 出撃先=**生息ステージ**(BOUNTY_HOME_STAGE・社長報告2026-08-20「難易度補正、ボスモードに
// 入ってない」への修正)。旧v6 B-5では stage-1 固定(裁定理由は「lab/corridorではない野外」で、
// 生息ステージも全て野外=理由は満たしたまま)。難度階段(v3676)で賞金首がステージ固有になった後も
// 練習だけ stage-1=係数×1.0 で出ており、実戦(S3:1.2/S4:1.4/S5:1.6)と強さが食い違っていた。
// 出撃先を生息地にすれば係数・背景・HP一覧(stageHpMult(slot.stageId))が全て台帳1本で一致する。
// デバッグ強制出現は`?bountynow=1`相乗り(useGameLoop.tsのFORCE_BOUNTY判定がpracticeForces('bountynow')を見る)。
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
  stageId: BOUNTY_HOME_STAGE[t] ?? 'stage-1', // 生息ステージへ出撃=実戦と同じ難度係数が乗る
  param: 'bountynow',
  label: BOUNTY_PRACTICE_LABEL[t],
  reachable: true,
}));

// ---------------------------------------------------------------------------------------------
// research/GHOST_BOSS.md(守護霊ボス「幻影」): 独立枠1つ・新カテゴリ 'duel'(「決闘」)。
// 一覧の**最下段**(実験枠なので既存ボス群の後ろ)。出撃先=stage-1(lab/corridorではない野外)、
// 強制出現は専用パラメータ `?phantomnow=1` へ相乗り(useGameLoop.ts の FORCE_PHANTOM)。
// 表示名は台帳の人物名から組む(名前の出どころを2箇所に持たない)。
// ---------------------------------------------------------------------------------------------
export const GUARDIAN_PHANTOM_SLOT_KEY = 'guardian-phantom@practice';
/** 一覧・リザルト・頭上ラベルの表示名。**唯一の出どころ**(pixiSceneもここを読む)。 */
export const GUARDIAN_PHANTOM_LABEL = `${strongestGuardian().name}(幻影)`;
/** 立ち絵に使うクラス(台帳の最強データのクラス。**唯一の出どころ**=pixiSceneもここを読む)。 */
export const GUARDIAN_PHANTOM_CLASS: CharacterClass = strongestGuardian().classId;
const GUARDIAN_PHANTOM_SLOT: PracticeSlot = {
  slotKey: GUARDIAN_PHANTOM_SLOT_KEY,
  // 本編に居ない相手なので遭遇記録は一生付かない。キーは型文字列の規約に揃えておく(将来
  // 本編へ置かれたら既存の遭遇配線がそのまま効く)が、解放は alwaysUnlocked が担う。
  encounterSlotKey: 'guardian-phantom',
  bossType: 'guardian-phantom',
  stageId: 'stage-1',
  param: 'phantomnow',
  label: GUARDIAN_PHANTOM_LABEL,
  reachable: false, // 本編のどこにも置かれていない(実験枠)
  alwaysUnlocked: true,
};

// 表示順=小ボス(賞金首)が一番上(社長指示v0.25.3444「小ボスは一番上だろ」。旧: 既存ボス群の後ろ)。
// 幻影(決闘)は最下段。
export const PRACTICE_SLOTS: readonly PracticeSlot[] = [...BOUNTY_PRACTICE_SLOTS, ...GHOST_DERIVED_SLOTS, GUARDIAN_PHANTOM_SLOT];

// ★変異体対策室のカテゴリ表示順の正(社長指示v0.25.3444「小ボスは一番上だろ」)。
// v3444では上の PRACTICE_SLOTS の並びだけを直したが、画面(BossRush.tsx)は**カテゴリごとに区切って
// 描く**ので並びが変わっていなかった(社長再指摘v0.25.3457)。順番の定義はここ1箇所にして、
// 画面はこれをそのまま回す=同じ取りこぼしを繰り返さない(bossPractice.testで先頭を機械化)。
// research/GHOST_BOSS.md: 'duel'(決闘=幻影)は**末尾**(実験枠)。
export const PRACTICE_CATEGORY_ORDER = ['bounty', 'story', 'gate', 'hidden', 'duel'] as const;

export const practiceSlotByKey = (slotKey: string): PracticeSlot | undefined =>
  PRACTICE_SLOTS.find(s => s.slotKey === slotKey);

// ---------------------------------------------------------------------------------------------
// 表示用のHP(BOSS_MAKER.md §20-8)
// ---------------------------------------------------------------------------------------------
/** 係数を掛ける前の台帳HP(表引きだけ。ステージ係数を掛けるのは下の practiceBossHealth)。 */
const practiceBossBaseHealth = (slot: PracticeSlot): number | null => {
  if (slot.bossType === 'giantbat') {
    // 台帳に行があれば、その値で戦っている(v0.25.3164でストーリーボスも台帳を通るようになった)。
    // 行が無い枠(stage-ex1)だけは実際のHPと表が違うので出さない。
    return STAGE_BOSS_HEALTH_BY_STAGE[slot.stageId] ?? null;
  }
  // §6.38(賞金首): 実効HPは基準値(BOUNTY_BASE_HP)×スポーン時の実効難易度倍率(bountyMaxHealth)で
  // 変動するため、台帳の固定値ではなく**基準値をそのまま**出す(掲載裁定「基準値2000を出す」)。
  if (isBountyType(slot.bossType)) return BOUNTY_BASE_HP;
  // research/GHOST_BOSS.md(幻影): 裏ボス方式=倍率を一切通さないので、スポーン時に書く値=実効HP。
  // その値は「初期プレイヤーHP+育成の体力加算」(装備補正なし)なので、表示も同じ式で出す。
  // ★基準クラスの注意(GROWTH.md v4): 実戦は「そのランのプレイヤーのクラス」(player.ddaBaseHp)、
  //   ここは「守護霊台帳の最強クラス」。ラン外ではプレイヤーのクラスが確定しないためこの式のままだが、
  //   一致は**全クラスの maxHp が同値(STANDARD_MAX_HP)であること**に依存している。
  //   クラス別HPを導入するとズレる——その前提は bossPractice.test.ts でテスト化してある。
  if (slot.bossType === 'guardian-phantom') {
    return guardianPhantomHealth(
      PLAYER_PROFILES[strongestGuardian().classId].maxHp
      + growthMaxHpBonus(activeUpgradeLevel(loadPlayerUpgrades(), 'health')),
    );
  }
  const gate = (GATE_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  if (gate != null) return gate;
  const hidden = (HIDDEN_BOSS_HEALTH as Partial<Record<EnemyType, number>>)[slot.bossType];
  return hidden ?? null;
};

/**
 * 枠のHP。**引けない枠は null**(画面は「—」を出す)。
 * ※v0.25.3164(社長決定「ボスのHPは増やす台本を適用しよう」)で、**stage-7のグレンは台帳どおりの値で
 *   戦うようになった**ので、そのまま表示してよくなった。
 *   旧: storyBossは台帳を通らず実効2500で戦っており、表の値を出すと嘘になるので出していなかった
 *   (当時のコメントは「base(500)のまま/12倍の嘘」と書いていたが、**×ENEMY_HP_MULT(5)を見落とした
 *    誤り**。正しくは2500で2.4倍のズレだった)。
 * ★**stage-ex1 は台帳に行が無い**ので従来どおり実効2500=表示できない(null)。
 * ★research/STAGE_DIFFICULTY.md: 実戦のスポーンは台帳HPに**ステージ係数**を掛けるので、表示も同じ式で出す
 *   (掛けないと一覧が実戦と食い違う)。賞金首枠は生息ステージへ出撃(2026-08-20修正)=実戦と同係数。
 *   幻影枠は stage-1 固定のまま(実戦側も係数を通さないので×1.0が正)。
 *   計測路(ボスメーカー/ガントレット)は実戦側が1.0だが、その場面ではこの一覧を出さないので生の係数でよい。
 */
export const practiceBossHealth = (slot: PracticeSlot): number | null => {
  const base = practiceBossBaseHealth(slot);
  return base === null ? null : Math.round(base * stageHpMult(slot.stageId));
};

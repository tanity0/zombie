// ボス戦テストメニュー(社長依頼2026-07-31「テスト用にボス戦だけの部屋」→採用案=専用部屋ではなく
// **実ステージ+既存の強制出現パラメータ+出撃メニュー**)。専用部屋を作らない理由: 人工環境はテスト
// 結果ごと偽物になる前例がある(arenanow=bossでは守護霊の召喚ゲートが反応しない/同じボスでも場所だけで
// 生存が3倍変わった=TEST_HANDOFF依頼#7/#8)。実ステージなら囲いサークル・M2通路・雑魚の挙動が全部本物。
//
// このモジュールは純関数のみ(カタログ+URL合成)。表示と遷移は components/BossTestMenu.tsx。
// 強制出現フラグ(bossnow等)はuseGameLoopの**モジュールロード時定数**なので、出撃はページ再読込
// (location遷移)で行う=`?smoke=1`(タイトル/メニュー全スキップの既存クイックスタート)に相乗りする。
import type { EnemyType, SkillKey } from '../types/game';

/** 出撃1件の定義。param=useGameLoopに既にある強制出現フラグ(新しい召喚機構は作らない)。 */
export interface BossTestEntry {
  boss: EnemyType;
  stageId: string;
  /**
   * 既存デバッグパラメータ: bossnow=そのステージの裏ボスをプレイヤー近く(画面外)へ即出現 /
   * idolnow=idol強制召喚 / gateboss=ゲート2天使を拘束サークル付きで即発動 /
   * castlenow=城ボスを城へ即出現(城マーカーへ向かって戦う) /
   * bountynow=賞金首(§6.38 B1)をプレイヤーから700〜1000pxへdormantで即出現。
   */
  param: 'bossnow' | 'idolnow' | 'gateboss' | 'castlenow' | 'bountynow';
  /** param==='bountynow'の時だけ意味を持つ副パラメータ(?bountytype=)。4種の型を選ぶ。 */
  bountyType?: 'ranged' | 'melee' | 'balance' | 'maiko';
}

// 掲載順=裏ボス4 → idol → 天使6 → 城ボス。ステージ対応は campaign.ts の hiddenBoss と
// useGameLoop の GATE2_BOSS_TYPE_BY_STAGE を写した固定表(どちらも変更頻度が低い設定値。
// ズレたら bossTest.test.ts の突き合わせテストが落ちる)。
export const BOSS_TEST_ENTRIES: readonly BossTestEntry[] = [
  { boss: 'mimir', stageId: 'stage-1', param: 'bossnow' },
  { boss: 'jormungand', stageId: 'stage-3', param: 'bossnow' },
  { boss: 'skadi', stageId: 'stage-4', param: 'bossnow' },
  { boss: 'thor', stageId: 'stage-5', param: 'bossnow' },
  { boss: 'idol', stageId: 'stage-2', param: 'idolnow' },
  { boss: 'miguel', stageId: 'stage-1', param: 'gateboss' },
  { boss: 'jibril', stageId: 'stage-3', param: 'gateboss' },
  { boss: 'rafi', stageId: 'stage-4', param: 'gateboss' },
  { boss: 'uri', stageId: 'stage-5', param: 'gateboss' },
  { boss: 'suriel', stageId: 'stage-6', param: 'gateboss' },
  { boss: 'acrasiel', stageId: 'stage-ex1', param: 'gateboss' },
  { boss: 'giantbat', stageId: 'stage-1', param: 'castlenow' },
  // PACING_PUZZLE.md §6.38 B1(賞金首): デバッグ出現のみ(?bountynow=1&bountytype=…)。
  // stage-1(森・非labテーマ/非corridor)で統一=v6 B-5の抑止条件に抵触しない場所。
  { boss: 'bounty-ranged', stageId: 'stage-1', param: 'bountynow', bountyType: 'ranged' },
  { boss: 'bounty-melee', stageId: 'stage-1', param: 'bountynow', bountyType: 'melee' },
  { boss: 'bounty-balance', stageId: 'stage-1', param: 'bountynow', bountyType: 'balance' },
  { boss: 'bounty-maiko', stageId: 'stage-1', param: 'bountynow', bountyType: 'maiko' },
];

export interface BossTestOptions {
  characterClass: string; // 'warrior' | 'mage' | 'rogue' | 'necromancer'
  ghostMode: BossTestGhostMode | null; // null=召喚なし / 3種は本番スキルと同じ取得経路
  ghostlog: boolean;      // ?ghostlog=1 守護霊の被弾源タグをconsoleへ([GHOSTDMG])
}

export type BossTestGhostMode = 'own' | 'random' | 'top';

const BOSS_TEST_GHOST_SKILL: Readonly<Record<BossTestGhostMode, SkillKey>> = {
  own: 'guardian-spirit',
  random: 'ghost-helper',
  top: 'ghost-slayer',
};

/** ボス戦テストの3択を、本番と同じ守護霊スキルへ変換する。旧URLの ?ghost=1 は自分扱い。 */
export const bossTestGhostSkill = (search?: string): SkillKey | null => {
  const raw = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const p = new URLSearchParams(raw);
  if (p.get('ghost') !== '1') return null;
  const mode = p.get('ghostmode');
  return BOSS_TEST_GHOST_SKILL[mode === 'random' || mode === 'top' ? mode : 'own'];
};

/**
 * 出撃URLのクエリ部を合成する。`smoke=1&stage=…&<強制フラグ>=1&class=…&retry=1` の組み合わせで
 * 再読込後にタイトル/メニューを全スキップして該当ボス戦へ直行する。`retry=1`は開始時会話のスキップ
 * (ゲームオーバーの「もう一度プレイ」と同じ扱い=テストの回転を速くする)。
 */
export const bossTestQuery = (e: BossTestEntry, opts: BossTestOptions): string => {
  const p = new URLSearchParams();
  p.set('smoke', '1');
  p.set('stage', e.stageId);
  p.set(e.param, '1');
  if (e.param === 'bountynow' && e.bountyType) p.set('bountytype', e.bountyType);
  p.set('class', opts.characterClass);
  p.set('retry', '1');
  if (opts.ghostMode) {
    p.set('ghost', '1');
    p.set('ghostmode', opts.ghostMode);
  }
  if (opts.ghostlog) p.set('ghostlog', '1');
  return `?${p.toString()}`;
};

// ---- 現在モードの表示(社長指示2026-07-31「いまどのモードになってるか出しといて」) ---------------
// パラメータ残留事故(v0.25.2576で修正)の再発をその場で見抜くための可視化。強制出現フラグは
// モジュールロード時定数なので、**ページ読込時のURL**が今セッションの真実=それを解析して表示する。
export const FORCE_PARAMS = ['bossnow', 'idolnow', 'gateboss', 'castlenow', 'bossmaker', 'bountynow'] as const;

export interface BossTestModeInfo {
  active: boolean;                          // いずれかのテスト系パラメータが生きているか
  params: string[];                         // 生きている強制出現フラグ(表示用)
  stageId: string | null;
  ghost: boolean;                           // ?ghost=1(デバッグ守護霊)
  ghostMode: BossTestGhostMode | null;       // ボス戦テストで選んだ3種(旧URLはown)
  smoke: boolean;                           // ?smoke(クイックスタート)
}

/** ページ読込時のURLクエリから現在モードを判定する純関数(テスト可能・window非依存)。 */
export const parseBossTestMode = (search: string): BossTestModeInfo => {
  const p = new URLSearchParams(search);
  const params = FORCE_PARAMS.filter(k => p.get(k) === '1');
  const ghost = p.get('ghost') === '1';
  const rawGhostMode = p.get('ghostmode');
  const ghostMode: BossTestGhostMode | null = !ghost ? null
    : rawGhostMode === 'random' || rawGhostMode === 'top' ? rawGhostMode : 'own';
  const smoke = p.get('smoke') !== null;
  return {
    active: params.length > 0 || ghost || smoke,
    params: [...params],
    stageId: p.get('stage'),
    ghost, ghostMode, smoke,
  };
};

// ---- ?gateboss=1 の発火ゲート(v0.25.2611・実装精度の規律4で純関数へ切り出し) -------------------
/**
 * ボス戦テストの強制出現(?gateboss=1)を「今フレーム発火してよいか」。
 *
 * 社長報告v0.25.2610「すりぃえるのボスモード、強制的に上に歩かされて何もできない」の本体は
 * **corridorRunIn の取りこぼし**だった。ステージ6(古い洋館)だけが corridorMode で、ラン開始直後に
 * 「入力を遮断して自動で上へ走らせる」入場演出(v0.25.2110)が約6秒走る。その最中にゲート2ボスを
 * 強制出現させると:
 *   ① 入力は isInputLocked(corridorRunInActive) で遮断されたまま
 *   ② プレイヤーは強制的に上へ歩かされ続ける
 *   ③ 進路上(拘束サークル中心の150px上)にボスが湧いて接触ダメージを受け続ける
 * さらに走り込みの解除条件は「y<=0 到達」か「gameTime>6000」だけで、**①で張った拘束サークル
 * (半径300)が y<=0 への到達を構造的に阻む**ため、6秒の安全弁が切れるまで何もできなかった。
 * 実ゲート2は走り込みが終わった後にしか発火しないので、この事故はテスト経路だけに存在した。
 *
 * 掟: **新しい「入力を奪う演出」を足したらここへも足す**(CLAUDE.md「教訓は即機械化」)。
 */
export interface GateBossGateState {
  forceParamOn: boolean;      // ?gateboss=1
  alreadySpawned: boolean;    // このランで既に出したか(gatebossForceRef)
  danceTest: boolean;
  indoor: boolean;
  labTheme: boolean;
  corridorRunInActive: boolean; // 洋館の走り込み入場中(=入力が奪われている)
  gameWon: boolean;
}

export const canForceGateBossNow = (s: GateBossGateState): boolean =>
  s.forceParamOn && !s.alreadySpawned && !s.danceTest && !s.indoor && !s.labTheme
  && !s.corridorRunInActive && !s.gameWon;

// ---- ボスメーカー(BOSS_MAKER.md §3): 入口は既存のボス戦テストに1項目足す形 ----------------------
// **一騎打ちのトレーニング場**。`?nospawn=1`(既存)で湧きを全て止め、`?bossmaker=1` で
// 部屋(方眼・無敵・調整フォーム)を立てる。数値の受け渡しにURLは使わない(社長明示「?パラメータは
// 回りくどい」)——URLは**部屋へ入るためだけ**に使う。
export const BOSS_MAKER_STAGE = 'stage-1'; // 森(平地)。広さ無限・木はメーカー側で消す。

/**
 * この読込が**ボスメーカーの部屋**か(ページ読込時のURLが今セッションの真実)。
 * `useGameLoop` の `BOSS_MAKER` と同じ判定だが、**resetGame(store)からも要る**ので
 * ここへ置いて1本にする(§1-1「壁なし・障害物なし・敵は選んだボス1体だけ」の履行に使う)。
 */
export const isBossMakerRun = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bossmaker') === '1';

// ---- ボスメーカーのスキル/装備/Lv注入口(SKILL_BUILD_REDESIGN.md §15-1の2・§12-2#7) --------------
// 「スキル(複数)+各Lv+装備Tier+プレイヤーLv」の注入口。**数値の受け渡しにURLは使わない**
// (社長明示「?パラメータは回りくどい」・上のbossMakerQueryの注記と同じ理由)。URLは部屋へ入るため
// だけに使う=注入はこのモジュール内の設定(モジュール変数)で行い、ボスメーカーのTTK計測スクリプト/
// テストは resetGame を呼ぶ前に setBossTestSkillInjection を呼ぶ。
// **プレイヤー本人の枠**(bossTestGhostSkillと同じ型の思想を踏襲=同行者スキルの注入とは別枠。
// 同行者あり/なしの切替は既存の ghostMode を使う=このAPIはプレイヤー自身のビルドだけを扱う)。
export interface BossTestSkillInjection {
  /** 装備スキルの複数キー。将来の6枠ビルド(SKILL_BUILD_REDESIGN.md §1-1)を見越して上限を設けない。
   *  現行(B0時点)の gameStore は装備2枠が仕様(MAX_EQUIPPED_SKILLS・無改変)だが、ボスメーカーの
   *  部屋(isBossMakerRun)に限り、この注入だけはその枠を通さず player.skills へそのまま反映する
   *  (TTK計測の対象は「想定最強6枠ビルド」=実プレイヤーの持ち込み経路とは別の専用測定路)。 */
  skills: SkillKey[];
  /** 各スキルのLv(未指定キー=Lv1)。skillMaxLevelでクランプする。 */
  skillLevels: Partial<Record<SkillKey, number>>;
  /** 基礎装備のスロット別Tier(0=未装備・1..5)。系統(line)は各スロットの先頭系統で固定
   *  (体=protection/腕=firepower/アクセ=crit。TTK計測は火力寄りの系統をデフォルトにする叩き台)。 */
  equipTier: { body?: number; arms?: number; accessory?: number };
  /** プレイヤーLv。ボスメーカーの部屋はXPが入らないため注入が前提(§12-2#7)。 */
  playerLevel: number;
}

let bossTestSkillInjection: BossTestSkillInjection | null = null;

/** テスト/計測スクリプトから呼ぶ。resetGame より前に呼ぶこと。null=注入解除(通常のボスメーカー出撃)。 */
export const setBossTestSkillInjection = (injection: BossTestSkillInjection | null): void => {
  bossTestSkillInjection = injection;
};

/** gameStore.resetGame が読む。ボスメーカーの部屋(isBossMakerRun)以外では無視される。 */
export const getBossTestSkillInjection = (): BossTestSkillInjection | null => bossTestSkillInjection;

// ---- 部屋に出すボス(BOSS_MAKER.md §1-3 セレクト欄・v0.25.3558でフェーズ4=賞金首4種を追加) ------
// ★URLで渡すのは「どの部屋を立てるか」まで(=stage と同じ扱い)。**数値はURLで渡さない**という上の掟は
// 崩していない。強制出現フラグと同じくモジュールロード時に決まる値なので、切替は再読込で行う。
export const BOSS_MAKER_BOSSES: readonly EnemyType[] = [
  'idol',
  'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
  // 第3弾(v0.25.3567): 天使6体。実戦は拘束サークル付きのゲート2経路だが、**部屋では通常の単体
  // スポーン**で立てる(§1-1「部屋にはプレイヤーとボスだけ」)。旋回/縁クランプの中心(homeX/homeY)は
  // useGameLoop のボスメーカー出現ブロックが置く。
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
  // 第4弾(v0.25.3573): 裏ボス4体。実戦は「深層域の巣へ近づくと出現」だが、**部屋では通常の単体
  // スポーン**で立てる(§1-1)。専用コントローラ(useGameLoopのhiddenBossブロック)が掴む手掛かり
  // (bossId/巣/寸法)は、ボスメーカーの出現ブロックが置く。
  'mimir', 'jormungand', 'skadi', 'thor',
];
export const BOSS_MAKER_DEFAULT_BOSS: EnemyType = 'idol';

/** `?makerboss=` を読む純関数(未知/未指定は既定=idol。window非依存でテストできる)。 */
export const parseBossMakerBoss = (search: string): EnemyType => {
  const raw = new URLSearchParams(search).get('makerboss');
  return BOSS_MAKER_BOSSES.find(b => b === raw) ?? BOSS_MAKER_DEFAULT_BOSS;
};

/** いまの読込でボスメーカーが出すボス(ページ読込時のURLが真実)。 */
export const bossMakerBossType = (): EnemyType =>
  parseBossMakerBoss(typeof window !== 'undefined' ? window.location.search : '');

export const bossMakerQuery = (opts: BossTestOptions, bossType: EnemyType = BOSS_MAKER_DEFAULT_BOSS): string => {
  const p = new URLSearchParams();
  p.set('smoke', '1');
  p.set('stage', BOSS_MAKER_STAGE);
  p.set('nospawn', '1');
  p.set('bossmaker', '1');
  p.set('makerboss', bossType);
  p.set('class', opts.characterClass);
  p.set('retry', '1');
  if (opts.ghostMode) {
    p.set('ghost', '1');
    p.set('ghostmode', opts.ghostMode);
  }
  return `?${p.toString()}`;
};

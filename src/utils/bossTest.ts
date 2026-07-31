// ボス戦テストメニュー(社長依頼2026-07-31「テスト用にボス戦だけの部屋」→採用案=専用部屋ではなく
// **実ステージ+既存の強制出現パラメータ+出撃メニュー**)。専用部屋を作らない理由: 人工環境はテスト
// 結果ごと偽物になる前例がある(arenanow=bossでは守護霊の召喚ゲートが反応しない/同じボスでも場所だけで
// 生存が3倍変わった=TEST_HANDOFF依頼#7/#8)。実ステージなら囲いサークル・M2通路・雑魚の挙動が全部本物。
//
// このモジュールは純関数のみ(カタログ+URL合成)。表示と遷移は components/BossTestMenu.tsx。
// 強制出現フラグ(bossnow等)はuseGameLoopの**モジュールロード時定数**なので、出撃はページ再読込
// (location遷移)で行う=`?smoke=1`(タイトル/メニュー全スキップの既存クイックスタート)に相乗りする。
import type { EnemyType } from '../types/game';

/** 出撃1件の定義。param=useGameLoopに既にある強制出現フラグ(新しい召喚機構は作らない)。 */
export interface BossTestEntry {
  boss: EnemyType;
  stageId: string;
  /**
   * 既存デバッグパラメータ: bossnow=そのステージの裏ボスをプレイヤー近く(画面外)へ即出現 /
   * idolnow=idol強制召喚 / gateboss=ゲート2天使を拘束サークル付きで即発動 /
   * castlenow=城ボスを城へ即出現(城マーカーへ向かって戦う)。
   */
  param: 'bossnow' | 'idolnow' | 'gateboss' | 'castlenow';
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
];

export interface BossTestOptions {
  characterClass: string; // 'warrior' | 'mage' | 'rogue' | 'necromancer'
  ghost: boolean;         // ?ghost=1 デバッグ守護霊召喚(装備不要で守護霊が出る)
  ghostlog: boolean;      // ?ghostlog=1 守護霊の被弾源タグをconsoleへ([GHOSTDMG])
}

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
  p.set('class', opts.characterClass);
  p.set('retry', '1');
  if (opts.ghost) p.set('ghost', '1');
  if (opts.ghostlog) p.set('ghostlog', '1');
  return `?${p.toString()}`;
};

// ---- 現在モードの表示(社長指示2026-07-31「いまどのモードになってるか出しといて」) ---------------
// パラメータ残留事故(v0.25.2576で修正)の再発をその場で見抜くための可視化。強制出現フラグは
// モジュールロード時定数なので、**ページ読込時のURL**が今セッションの真実=それを解析して表示する。
export const FORCE_PARAMS = ['bossnow', 'idolnow', 'gateboss', 'castlenow', 'bossmaker'] as const;

export interface BossTestModeInfo {
  active: boolean;                          // いずれかのテスト系パラメータが生きているか
  params: string[];                         // 生きている強制出現フラグ(表示用)
  stageId: string | null;
  ghost: boolean;                           // ?ghost=1(デバッグ守護霊)
  smoke: boolean;                           // ?smoke(クイックスタート)
}

/** ページ読込時のURLクエリから現在モードを判定する純関数(テスト可能・window非依存)。 */
export const parseBossTestMode = (search: string): BossTestModeInfo => {
  const p = new URLSearchParams(search);
  const params = FORCE_PARAMS.filter(k => p.get(k) === '1');
  const ghost = p.get('ghost') === '1';
  const smoke = p.get('smoke') !== null;
  return {
    active: params.length > 0 || ghost || smoke,
    params: [...params],
    stageId: p.get('stage'),
    ghost, smoke,
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
export const bossMakerQuery = (opts: BossTestOptions): string => {
  const p = new URLSearchParams();
  p.set('smoke', '1');
  p.set('stage', BOSS_MAKER_STAGE);
  p.set('nospawn', '1');
  p.set('bossmaker', '1');
  p.set('class', opts.characterClass);
  p.set('retry', '1');
  if (opts.ghost) p.set('ghost', '1');
  return `?${p.toString()}`;
};

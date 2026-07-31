// PACING_PUZZLE.md §6.28-20(バッチM64)/ 監査レポート§2(バッチ3・v0.25.2613): idol(stage-2隠しボス)。
// レンダラ非依存・store非依存の**データと純関数だけ**(状態機械は idolTick.ts)。
//
// 「全ボスの逆」= **近づくほど安全**。他の全ボスは間合いが遠いほど安全(離れれば予告を見て歩いて
// 避けられる)が、idolは**遠いほど危険**。近距離技は硬直が長く休符も長い=密着してターンを奪うのが
// 唯一の勝ち筋。段のラダーには入らない(積み上げではなく反転・§6.28-20/§6.28-21)。
//
// ★社長裁定v0.25.2613「この人はかなり強い序列だったはずなので、MAXモリモリになるはず」:
// idolは進行表の1体ではなく**隠しボス=最難関枠**。「わざわざ反対方面の最奥まで探しに行った人だけが
// 会う」「寄り道の報酬が"今までの手が通じない一戦"」(§6.28-20)の裏付けどおり、難易度を天井まで上げる。
// ただし**MAXは「密度」で作り、「読めなさ」では作らない**=下の IDOL_FAIRNESS_* を
// bossSkeleton.fairnessViolations がテストで機械検査する(予告が必ず決断の時刻より前に出ている)。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
import { phaseForHealth } from './bossScript';
import {
  zoneForDistance, type ZoneEdges, type NeutralBand, type StringScript, type StringLenConfig,
  type RestConfig, type PunishConfig, type MoveFairness, type BossZone,
} from './bossSkeleton';
import { deepCloneTuning } from './bossTuning';

// v0.25.2613: 狙撃線(snipe)と追尾弾(orb)を新設。既存4技は消さず条件を与え直す(社長方針)。
export type IdolMove = 'aim' | 'fan' | 'roll' | 'punch' | 'snipe' | 'orb';

export const IDOL_ALL_MOVES: readonly IdolMove[] = ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb'];

// ============================================================================================
// ★ボスメーカー対応(BOSS_MAKER.md §2・v0.25.2621): 数値は**すべてこの1つの可変テーブル**に集約する。
// 台本(ロジック)は今までどおりコードに置き、**数字だけをここから読む**。実行中に画面から書き換わる。
//
// 掟(§2-4):
//  - **既定値は現行の実装値と1つも変えない**(テーブル化は純粋なリファクタ)。
//    `idolScript.test.ts` の突き合わせテストが機械で担保する。
//  - `as const` は付けない(実行時に書き換えるため)。型は下の interface で守る。
//  - 従来の名前(`IDOL_TIMING` 等)は**このテーブルの入れ子オブジェクトへの参照**として再exportする。
//    参照が同じなので、テーブルを書き換えると使用箇所(58箇所)へ**自動で反映される**=書き換え不要。
// ============================================================================================
export interface IdolTuning {
  zoneEdges: ZoneEdges;
  neutralBand: NeutralBand;
  verbSpeedMult: { close: number; retreat: number; strafe: number; hold: number };
  phaseHpThreshold: number;
  fanCount: { p1: number; p2: number };
  orbCount: { p1: number; p2: number };
  timing: Record<IdolMove, { windup: number; active: number; recover: number }>;
  shape: {
    rollDist: number; punchRange: number; punchHalfWidth: number;
    snipeRange: number; snipeHalfWidth: number; fanSpreadStep: number;
    orbSpeed: number; orbTurnRate: number;
  };
  waveDelayMs: number;
  stringLen: StringLenConfig;
  strings: StringScript<IdolMove>[];
  rest: RestConfig;
  neutral: { minMs: number; maxMs: number };
  punish: PunishConfig<IdolMove>;
  sameAngleDeg: number;
  /** 基礎値(§1-5)。ENEMY_STATS.idol と同値で始まる。画面から変えた時は生きている個体へ反映する。 */
  stats: { health: number; damage: number; speed: number };
}

export const IDOL_TUNING: IdolTuning = {
  // ①帯(§6.28-20の確定表 140/340 をそのまま使い、遠を2つに割っただけ=仕様不変)
  zoneEdges: {
    meleeMax: 140, // 近(離脱ローリング/至近の殴り)=§6.28-20 の NEAR_MAX
    nearMax: 340,  // 中(連射)=§6.28-20 の MID_MAX。**ここが主戦帯**
    midMax: 700,   // 遠(狙い撃ち/狙撃線)。これを超えたら超遠=追尾弾と狙撃線だけが届く
  },
  // ⑤主戦帯(監査レポート§2-4): 上限340=中帯上限 / 下限200=rollDist(140)+余白60
  // =「密着から離脱ローリング1回でちょうど主戦帯の下端へ戻る」。
  neutralBand: { min: 200, max: 340 },
  // 中立の移動速度倍率(enemy.speed=150 に掛ける)。詰めは全速、維持/後退はゆっくり=張り付かせない。
  verbSpeedMult: { close: 1, retreat: 0.45, strafe: 0.45, hold: 0 },
  phaseHpThreshold: 0.5,
  fanCount: { p1: 3, p2: 5 },  // 連射の扇の本数(§6.28-20の確定値)
  orbCount: { p1: 2, p2: 3 },  // 追尾弾の数
  // 技の秒数(MAX枠)。**硬直は6技すべて900ms**(= withRecoverFloor の床がそのまま既定値になっている。
  // 元の素の値は aim500/fan600/roll800/punch900/snipe900/orb900 で、床900に押し上げられた結果)。
  // ★未決: 6技一律なのは調整の余地あり(ボスメーカーで詰める対象)。
  timing: {
    aim:   { windup: 700,  active: 0,   recover: 900 },
    fan:   { windup: 900,  active: 0,   recover: 900 },
    roll:  { windup: 400,  active: 300, recover: 900 },
    punch: { windup: 600,  active: 0,   recover: 900 },
    snipe: { windup: 1100, active: 200, recover: 900 },
    orb:   { windup: 800,  active: 0,   recover: 900 },
  },
  // 図形(判定と厳密一致させる値。描画側=pixiScene も同じここを読む)。
  shape: {
    rollDist: 140,
    punchRange: 90,
    punchHalfWidth: 30,
    snipeRange: 900,      // 狙撃線の長さ(超遠まで届く=逃げ撃ちを消す担い手)
    snipeHalfWidth: 40,   // =THOR_HARAI_HALF_WIDTH(流用・新しい数字を発明しない)
    fanSpreadStep: 0.14,  // 1本あたりの開き角(rad)
    orbSpeed: 155,        // 追尾弾の速度(プレイヤー104.4px/sより速い=走っても振り切れない)
    orbTurnRate: 1.5,     // 旋回速度(rad/s)。密着すると旋回が追いつかない=詰めた側の報酬
  },
  // 第二波(ER §2-15 約束の王ラダーンP2の型)。1発目の判定から追撃までの遅れ。
  // 550ms(公平性の下限)を上回る値=見てから反応できる。
  waveDelayMs: 650,
  // ②③ストリング。**4段目まで書き、P1は先頭3段だけ使う**=P2で1段伸びる。
  stringLen: { p1: 3, p2: 4 },
  strings: [
    // 密着(0〜140): 硬直の長い近距離技で「ここが安全」を体で教える。終端は必ず離脱か遠距離技。
    { zone: 'melee', weight: 55, moves: ['punch', 'roll', 'fan', 'orb'] },
    { zone: 'melee', weight: 45, moves: ['roll', 'fan', 'punch', 'orb'] },
    // 主戦帯(140〜340): 連射で崩して終端に追尾弾=「離れても解決しない」を教える帯。
    { zone: 'near', weight: 40, moves: ['fan', 'fan', 'orb', 'snipe'] },
    { zone: 'near', weight: 35, moves: ['fan', 'snipe', 'orb', 'fan'] },
    { zone: 'near', weight: 25, moves: ['orb', 'fan', 'punch', 'snipe'] },
    // 遠(340〜700): 狙撃線が主。ここが一番危ない=「近づけ」の圧。
    { zone: 'mid', weight: 50, moves: ['aim', 'aim', 'snipe', 'orb'] },
    { zone: 'mid', weight: 50, moves: ['snipe', 'orb', 'aim', 'snipe'] },
    // 超遠(700+): 逃げ切れる距離を作らない(ER §1-4「遠距離に居させない設計」)。
    { zone: 'far', weight: 45, moves: ['aim', 'snipe', 'orb', 'snipe'] },
    { zone: 'far', weight: 55, moves: ['orb', 'orb', 'snipe', 'aim'] },
  ],
  // ④休符: P1/P2とも0.9秒。**0にはしない**(プレイヤーのターンが消えると理不尽)。
  // 0.9秒=カウンター1サイクル820msを上回る最小値。
  rest: { p1: 900, p2: 900 },
  // 中立の滞在(休符明け〜次のストリングまで)。ER原則③「主戦帯で横に回りながら出入りする」。
  // ここが0だとボスは一切移動しない(初回計測で移動tick0.5〜5.5%だった原因)。
  neutral: { minMs: 700, maxMs: 1300 },
  // ⑥懲罰(ER原則⑤)。密着の答えは**離脱**であってAoEではない(「近づくほど安全」を壊さない)。
  punish: { farMs: 2000, farMove: 'snipe', meleeMs: 3000, meleeMove: 'roll', sameAngleMs: 4000 },
  sameAngleDeg: 30,
  // 基礎値。既定は ENEMY_STATS.idol と同値(テストで突き合わせる)。
  stats: { health: 9000, damage: 30, speed: 150 },
};

/** 既定値(リセット/差分表示用)。テーブルとは別オブジェクトとして凍結せずに保持する。 */
export const IDOL_TUNING_DEFAULTS: IdolTuning = deepCloneTuning(IDOL_TUNING);

// ---- 従来名の再export(**同じ参照**なのでテーブルの書き換えが自動で効く=使用箇所は無改変) -------
export const IDOL_ZONE_EDGES: ZoneEdges = IDOL_TUNING.zoneEdges;
export const IDOL_NEUTRAL_BAND: NeutralBand = IDOL_TUNING.neutralBand;
export const IDOL_VERB_SPEED_MULT = IDOL_TUNING.verbSpeedMult;
export const IDOL_TIMING = IDOL_TUNING.timing;
export const IDOL_STRING_LEN: StringLenConfig = IDOL_TUNING.stringLen;
export const IDOL_STRINGS: readonly StringScript<IdolMove>[] = IDOL_TUNING.strings;
export const IDOL_REST: RestConfig = IDOL_TUNING.rest;
export const IDOL_PUNISH: PunishConfig<IdolMove> = IDOL_TUNING.punish;

export const idolZone = (distance: number): BossZone => zoneForDistance(distance, IDOL_TUNING.zoneEdges);
export const idolPhaseForHealth = (healthFrac: number): 1 | 2 =>
  phaseForHealth(healthFrac, [IDOL_TUNING.phaseHpThreshold]) as 1 | 2;
/** 連射の扇の本数(§6.28-20の確定値)。 */
export const idolFanCount = (phase: 1 | 2): number => (phase === 2 ? IDOL_TUNING.fanCount.p2 : IDOL_TUNING.fanCount.p1);
export const idolOrbCount = (phase: 1 | 2): number => (phase === 2 ? IDOL_TUNING.orbCount.p2 : IDOL_TUNING.orbCount.p1);

// 第二波の対象(遠距離3技)。近距離技には付けない=「近づくほど安全」を強化する。
// ※**技の構成そのもの**なので台本側=コードに残す(テーブルは数字だけ)。
export const IDOL_WAVE_MOVES: readonly IdolMove[] = ['aim', 'fan', 'snipe'];
export const idolWaveActive = (move: IdolMove, phase: 1 | 2): boolean =>
  phase >= 2 && IDOL_WAVE_MOVES.includes(move);

// ---- 公平性の台帳(社長指示「MAXは密度で作る。読めなさで作らない」) -----------------------------
// cls の意味(bossSkeleton.ts): A=歩くだけで確実に避けられる / B=歩けるが余裕が小さい /
// C=歩いて避けられない=**別の答え(カウンター、または間合いを詰めること)が要る**。
// idolのCは「その距離に居続ける限り避けられない」=答えが「詰める」になる技=本ボスの主題そのもの。
// escapePx = 判定から歩いて出るのに要る距離(自機半径16px込み)。
const PLAYER_HALF = 16;
// ★ボスメーカー対応: 数値がテーブルから来る=**モジュール読み込み時のスナップショットにしない**。
// 呼ぶたびに今の値で組み直す関数にする(数字を画面で変えたら公平性の検算も追随する)。
export const idolFairnessP1 = (): MoveFairness[] => {
  const T = IDOL_TUNING;
  return [
    { key: 'aim', cls: 'A', telegraphMs: T.timing.aim.windup, escapePx: 14 + PLAYER_HALF },
    { key: 'fan', cls: 'B', telegraphMs: T.timing.fan.windup, escapePx: 54 + PLAYER_HALF },
    { key: 'snipe', cls: 'B', telegraphMs: T.timing.snipe.windup, escapePx: T.shape.snipeHalfWidth + PLAYER_HALF },
    // 拳: 帯90px×半幅30。溜め600msで歩ける距離は62px<判定 → 歩いて出られない=カウンターが答え。
    { key: 'punch', cls: 'C', telegraphMs: T.timing.punch.windup },
    // 追尾弾: 速度155>プレイヤー104.4=走っても振り切れない。答えは「詰めて旋回を振り切る」。
    { key: 'orb', cls: 'C', telegraphMs: T.timing.orb.windup },
  ];
};
export const idolFairnessP2 = (): MoveFairness[] => {
  const T = IDOL_TUNING;
  return [
    // Phase2: 遠距離3技すべてに第二波が付く=1発目を避けても650ms後にもう一度来る(回避2回)。
    // 「1発目の判定」がヒントなので、第二波の予告時間は waveDelayMs そのもの。
    { key: 'aim+wave', cls: 'C', telegraphMs: T.waveDelayMs },
    { key: 'fan+wave', cls: 'C', telegraphMs: T.waveDelayMs },
    { key: 'snipe+wave', cls: 'C', telegraphMs: T.waveDelayMs },
    { key: 'punch', cls: 'C', telegraphMs: T.timing.punch.windup },
    { key: 'orb', cls: 'C', telegraphMs: T.timing.orb.windup },
  ];
};

// ---- 旧API(既存の呼び出し側との互換) ----------------------------------------------------------
/** 旧 idolMoveEligible の後継。台本方式へ移行したので「そのゾーンの台本に登場するか」で答える。 */
export const idolMoveEligible = (move: IdolMove, distance: number): boolean => {
  const z = idolZone(distance);
  return IDOL_STRINGS.some(s => s.zone === z && s.weight > 0 && s.moves.includes(move));
};

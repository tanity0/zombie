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
import { PLAYER_WALK_PX_PER_SEC } from './bossTelegraph';
import { deepCloneTuning } from './deepClone';
import { registerEnemyFireProfile } from './enemyUtils';
import { HIDDEN_BOSS_HEALTH } from '../config/bossHealth';

// v0.25.2613: 狙撃線(snipe)と追尾弾(orb)を新設。既存4技は消さず条件を与え直す(社長方針)。
export type IdolCoreMove = 'aim' | 'fan' | 'roll' | 'punch' | 'snipe' | 'orb';

/**
 * **射撃スロット**(v0.25.2638・社長要望「通常弾とかも入れたい 連射の弾幕とか、何かの後に普通に撃つ
 * ジャブを入れたい とかできる」)。**空の技枠を8つ用意しておき、メーカーの画面で中身を作る。**
 *
 * なぜ「部品」なのか: 弾を撃つ技は aim/fan/orb と3つ書いてきたが、違いは**数字だけ**だった
 * (1発/扇3本/追尾)。ならば**弾数・斉射・広がり・速度・誘導・狙い方をパラメータにした1つの技**を
 * 8枠置けば、社長が画面で新しい射撃技を作れる。コードを書き足す必要が無くなる。
 *
 * 上限8の理由: 技が多すぎるとプレイヤーが読めない(ERのボスでも実質10前後)。加えて
 * 型・状態名・スキーマを**静的に持てる**上限にしておくと、動的な型を持ち込まずに済む。
 */
export type IdolShotSlot = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8';
export type IdolMove = IdolCoreMove | IdolShotSlot;

/** 中核6技(コードで台本を書いてある技)。**射撃スロットは含まない**。 */
export const IDOL_ALL_MOVES: readonly IdolCoreMove[] = ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb'];
export const IDOL_SHOT_SLOTS: readonly IdolShotSlot[] = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
/** 中核6技+射撃8枠。状態名の一覧やCD表など「全ての技」が要る所で使う。 */
export const IDOL_MOVES_ALL: readonly IdolMove[] = [...IDOL_ALL_MOVES, ...IDOL_SHOT_SLOTS];
export const isIdolShot = (m: IdolMove): m is IdolShotSlot =>
  (IDOL_SHOT_SLOTS as readonly string[]).includes(m);

/**
 * 射撃部品の1枠ぶんの数値。**全部が数字**=メーカーのフォームがそのまま生える。
 *
 * ★分類(CLAUDE.md 攻撃ヴィジュアルの2分類): 射撃は**1(危険を伝える絵)**。
 * 予告の線は `count`/`spreadDeg`/`aimMode` から引くので、**数字を変えると赤い線も一緒に変わる**
 * (「描画用に同じ数字を書いておく」を絶対にやらない=v0.25.2631の教訓)。
 */
export interface IdolShotSpec {
  /** 0=この枠は存在しない(画面にも台本にも出ない)。1=有効。 */
  enabled: number;
  /** どの距離帯で出すか(0=密着 / 1=主戦 / 2=遠 / 3=超遠)。 */
  zoneIdx: number;
  /** その距離帯での抽選の重み。0=台本には出ない(▶の単独再生では出せる)。 */
  weight: number;
  /** 1斉射で出る弾数。 */
  count: number;
  /** 斉射の回数(1=単発。2以上で連射になる)。 */
  waves: number;
  /** 斉射の間隔(ms)。 */
  intervalMs: number;
  /** 弾1本あたりの開き角(度)。0=全部同じ向き。 */
  spreadDeg: number;
  /** 斉射ごとに向きをずらす量(度)。回転する弾幕が作れる。 */
  waveTurnDeg: number;
  speed: number;
  damage: number;
  size: number;
  /** 誘導の旋回速度(度/秒)。0=直進。速度がプレイヤー(104.4px/s)より速い誘導弾は「走っても振り切れない」。 */
  homingDeg: number;
  /** 狙いの決め方: 0=撃つ瞬間に狙う / 1=予告の開始で固定(歩いて避けられる) / 2=移動先を読む(偏差)。 */
  aimMode: number;
  windup: number;
  recover: number;
}

/** `zoneIdx` → 距離帯。並びは近い順(メーカーの数字と意味を1対1にする)。 */
export const IDOL_SHOT_ZONES: readonly BossZone[] = ['melee', 'near', 'mid', 'far'];

/** 追尾弾(orb)の発射時の散らし角(rad)。**判定と描画が同じ値を読む**ために定数を1つだけ置く。 */
export const IDOL_ORB_SPREAD_RAD = 0.5;

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
  /** **中核6技だけ**の秒数。射撃スロットは自分の `windup`/`recover` を持つ(`idolMoveTiming` が吸収)。 */
  timing: Record<IdolCoreMove, { windup: number; active: number; recover: number }>;
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
  /**
   * **弾の性能は技ごとに持つ**(社長指示v0.25.2628)。
   *
   * これまで `enemyUtils.getEnemyFireProfile` の**11ボス共通の1行**(speed320/damage20/size16)を
   * 使っていたため、ボスごとに変えられなかった(v0.25.2627でここへ移設)。さらにv0.25.2628で
   * **aim/fanを1組に共通化していたのを技ごとへ分けた**——同じ弾を撃つ技どうしでも共通化すると
   * 「狙い撃ち=速い1発 / 連射扇=遅いが数で押す」のような**技の性格を数字で作り分けられなくなる**。
   * 追尾弾(orb)はアイドル固有の実装なので別(`shape.orbSpeed`/`shape.orbTurnRate`)。
   *
   * interval/range はアイドルでは未使用(発射タイミングは台本が直接制御)。
   * `bullet.aim` は `registerEnemyFireProfile('idol', ...)` に渡す**型の既定**も兼ねる
   * (どの技でもない経路から撃たれた時の値。実際の aim/fan は発射地点で明示的に渡す)。
   */
  bullet: {
    aim: { interval: number; range: number; speed: number; damage: number; size: number };
    fan: { interval: number; range: number; speed: number; damage: number; size: number };
    /** 追尾弾は**速度が既存の `shape.orbSpeed` に居る**ので、ここは威力と大きさだけ持つ(値を二重に持たない)。 */
    orb: { damage: number; size: number };
  };
  /**
   * **判定を直接出す技のダメージ**(社長報告v0.25.2629「射撃線と殴り はそもそもダメージのパラメータがない」)。
   *
   * 事故の形は弾速(v0.25.2627)と同じ:**技ごとに違ってよい値が、ボス共通の1箇所から流用されていた。**
   * 殴りは `hitCapsule(damage: idol.damage)`、狙撃線は `damagePlayer(idol.damage)` と、どちらも
   * **接触ダメージ(`stats.damage`)を流用**していたため、メーカーに欄が出せなかった。
   * 既定は現行の実効値(=`ENEMY_STATS.idol.damage` の 30)。**`stats.damage` は「体が触れた時」の
   * ダメージとして別に残す**(技とは別軸)。
   * 弾を撃つ技(aim/fan/orb)は `bullet[move].damage` が正。
   */
  moveDamage: { punch: number; snipe: number };
  /**
   * **技ごとの押し出し**(v0.25.2653・社長要望「押しやる殴り」/ BOSS_MAKER.md §9-2)。
   * これまで押し量は**全ゲーム共通の1組**(`PLAYER_KNOCKBACK_SPEED/MS`)だったので、
   * 「殴って中距離まで押しやる」のような**技の性格**が数字で作れなかった(弾速・ダメージと同型の問題)。
   * **距離(px)で持つ**——「中距離まで押しやる」は距離の話であって速度×時間の話ではないため。
   */
  moveKnockback: { punch: { distPx: number; ms: number } };
  /**
   * エフェクトの速さ(社長要望v0.25.2651「エフェクトの速さもいじりたい / 拳とかダメージ判定
   * 早いのにエフェクト遅いので」)。**判定は変えず、絵の動き方だけ**を持つ欄。
   */
  fx: {
    /** 拳が動く区間(溜めの後ろ何割で伸びるか)。1=溜め全体を使って等速(旧実装=遅く見える) / 0.3=最後の3割で突き出す。 */
    punchFistLead: number;
    /** 拳の伸びのカーブ。1=等速 / 1より大=溜めてから伸びる / 1より小=出だしが速い。 */
    punchFistEase: number;
    /** 拳が当たってから消えるまで(ms)。 */
    punchFistHoldMs: number;
  };
  /** 射撃部品の8枠(既定は全て `enabled:0` = 何も無い)。 */
  shots: Record<IdolShotSlot, IdolShotSpec>;
  /** 枠に付けた名前(空=`射撃1` のような既定名)。台本に並べた時に読めるようにするためだけの値。 */
  shotLabels: Record<IdolShotSlot, string>;
}

/**
 * 射撃枠の既定値=**「ごく普通の弾を1発」**。社長が枠を足した瞬間に「とりあえず撃つ技」が
 * 手に入り、そこから数字を動かして性格を作る、という手順にする(空の枠から作らせない)。
 * 弾の3点(速度320/威力20/大きさ16)は既存の共通行と同値=**足しても既存の見た目と揃う**。
 */
const shotDefault = (): IdolShotSpec => ({
  enabled: 0, zoneIdx: 1, weight: 30,
  count: 1, waves: 1, intervalMs: 150,
  spreadDeg: 8, waveTurnDeg: 0,
  speed: 320, damage: 20, size: 16,
  homingDeg: 0, aimMode: 0,
  windup: 700, recover: 900,
});

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
    roll:  { windup: 400,  active: 180, recover: 900 },
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
    // 拳で押し出した先へ狙撃線を通す。もう一方は離脱→射線で挟み、最後の拳から再び狙撃へ繋ぐ。
    { zone: 'melee', weight: 55, moves: ['punch', 'snipe', 'roll', 'fan'] },
    { zone: 'melee', weight: 45, moves: ['roll', 'fan', 'punch', 'snipe'] },
    // 主戦帯(140〜340): 連射で崩して終端に追尾弾=「離れても解決しない」を教える帯。
    { zone: 'near', weight: 40, moves: ['fan', 'roll', 'snipe', 'orb'] },
    { zone: 'near', weight: 35, moves: ['orb', 'punch', 'snipe', 'fan'] },
    { zone: 'near', weight: 25, moves: ['fan', 'orb', 'punch', 'snipe'] },
    // 遠(340〜700): 狙撃線が主。ここが一番危ない=「近づけ」の圧。
    { zone: 'mid', weight: 50, moves: ['aim', 'snipe', 'orb', 'roll'] },
    { zone: 'mid', weight: 50, moves: ['orb', 'aim', 'snipe', 'fan'] },
    // 超遠(700+): 逃げ切れる距離を作らない(ER §1-4「遠距離に居させない設計」)。
    { zone: 'far', weight: 45, moves: ['aim', 'snipe', 'orb', 'roll'] },
    { zone: 'far', weight: 55, moves: ['orb', 'snipe', 'aim', 'fan'] },
  ],
  // ④休符: P1/P2とも1.7秒。連段中は圧を掛け、終端だけ2発ぶんの小休止を保証する。
  // カウンター1サイクル820ms×2を上回るため、回避後に明確な「こちらのターン」が来る。
  rest: { p1: 1700, p2: 1700 },
  // 中立の滞在(休符明け〜次のストリングまで)。ER原則③「主戦帯で横に回りながら出入りする」。
  // ここが0だとボスは一切移動しない(初回計測で移動tick0.5〜5.5%だった原因)。
  neutral: { minMs: 700, maxMs: 1300 },
  // ⑥懲罰(ER原則⑤)。密着の答えは**離脱**であってAoEではない(「近づくほど安全」を壊さない)。
  punish: { farMs: 2000, farMove: 'snipe', meleeMs: 3000, meleeMove: 'roll', sameAngleMs: 4000 },
  sameAngleDeg: 30,
  // 基礎値。既定は ENEMY_STATS.idol と同値(テストで突き合わせる)。
  stats: { health: HIDDEN_BOSS_HEALTH.idol, damage: 30, speed: 150 },
  // 既定は従来の共通行と同値(speed320/damage20/size16)=**技ごとに分けても挙動は変わらない**。
  bullet: {
    aim: { interval: 99999, range: 99999, speed: 320, damage: 20, size: 16 },
    fan: { interval: 99999, range: 99999, speed: 320, damage: 20, size: 16 },
    orb: { damage: 20, size: 16 },
  },
  // 既定は現行の実効値(接触ダメージ 30 の流用)=**欄を足しても挙動は変わらない**。
  moveDamage: { punch: 30, snipe: 30 },
  // 技ごとの押し出し(v0.25.2653)。**既定は全ゲーム共通の押し量と同じ**=挙動不変。
  // 共通値: 初速460px/s を 260ms かけて 1→0 で減衰 ⇒ 進む距離 = 460×0.26÷2 ≒ **60px**。
  moveKnockback: { punch: { distPx: 60, ms: 260 } },
  // エフェクトの速さ(v0.25.2651)。**旧実装は lead=1.0(溜め600msかけて等速)** だったが、
  // 社長報告「ダメージ判定早いのにエフェクト遅い」のとおり**遅く見える**ので 0.35 を既定にする
  // (溜めの最後の35%で突き出す=拳らしい速さ)。**伸び切る瞬間は判定の瞬間のまま**なので、
  // 「絵が当たったのにダメージが来ない/逆」は起きない(CLAUDE.md 攻撃ヴィジュアルの分類①)。
  fx: { punchFistLead: 0.35, punchFistEase: 1, punchFistHoldMs: 280 },
  // 射撃部品(v0.25.2638)。**既定は8枠すべて無効**=本編のアイドルの挙動は1ミリも変わらない。
  shots: {
    s1: shotDefault(), s2: shotDefault(), s3: shotDefault(), s4: shotDefault(),
    s5: shotDefault(), s6: shotDefault(), s7: shotDefault(), s8: shotDefault(),
  },
  shotLabels: { s1: '', s2: '', s3: '', s4: '', s5: '', s6: '', s7: '', s8: '' },
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

/**
 * 拳の伸び具合(0..1)。`u` = 溜めの進行(0=溜め開始 / **1=判定の瞬間**)。
 *
 * ★**不変条件: `u=1` で必ず 1**(=判定の瞬間にちょうど伸び切る)。
 * ここを崩すと「絵はまだ届いていないのにダメージが入る」「絵が当たったのにダメージが無い」に
 * なる=CLAUDE.md の禁止事項そのもの。**速さを変えても着弾の瞬間は動かさない**、が設計の芯。
 * `lead` が変えるのは「いつ動き出すか」だけ。
 */
export const idolFistReach = (u: number, lead: number, ease: number): number => {
  const t = Math.max(0, Math.min(1, u));
  const L = Math.max(0.01, Math.min(1, lead));      // 0除算と「動かない拳」を防ぐ
  const p = Math.max(0, Math.min(1, (t - (1 - L)) / L));
  return Math.pow(p, Math.max(0.1, ease));
};

// ---- 射撃部品のアクセサ(v0.25.2638) -----------------------------------------------------------
export const idolShot = (m: IdolShotSlot): IdolShotSpec => IDOL_TUNING.shots[m];
/** 表示名。空なら `射撃1` のような既定名(枠を足しただけで名無しにならない)。 */
export const idolShotName = (m: IdolShotSlot): string =>
  IDOL_TUNING.shotLabels[m]?.trim() || `射撃${IDOL_SHOT_SLOTS.indexOf(m) + 1}`;
/** 有効な枠(社長が足した射撃技)。 */
export const idolEnabledShots = (): IdolShotSlot[] =>
  IDOL_SHOT_SLOTS.filter(s => IDOL_TUNING.shots[s].enabled >= 0.5);

/** 斉射を撃ち切るのに要る時間(ms)。1斉射なら0=撃った瞬間に硬直へ入る(既存の aim/fan と同じ形)。 */
export const idolShotFireMs = (sp: IdolShotSpec): number =>
  Math.max(0, Math.round(sp.waves) - 1) * Math.max(0, sp.intervalMs);

/**
 * 技の秒数を1つの関数で引く。**射撃スロットは `timing` に居ない**(自分の windup/recover を持つ)ので、
 * `IDOL_TIMING[m]` を直接引いてはいけない(射撃枠で undefined になる)。
 */
export const idolMoveTiming = (m: IdolMove): { windup: number; active: number; recover: number } => {
  if (!isIdolShot(m)) return IDOL_TUNING.timing[m];
  const sp = IDOL_TUNING.shots[m];
  return { windup: sp.windup, active: idolShotFireMs(sp), recover: sp.recover };
};

/**
 * 台本の全量 = **コードで書いた台本 + 社長が足した射撃技**。
 * 足した射撃は「その距離帯の1段だけの台本」として混ざる(重み0なら出ない)。
 * ※複数段の組み立て(「何かの後に撃つジャブ」)は台本エディタ(3便目)の仕事。ここでは1段。
 *
 * **off にした台本は落とす**(BOSS_MAKER.md §15)。重みはテーブル側で保持したままなので、
 * onへ戻せば元どおり抽選に混ざる——ここは「今この瞬間に抽選へ渡してよい台本」だけを返す係。
 * off が1本も無ければ `IDOL_TUNING.strings` を**そのまま**返す(参照を変えない=既存の
 * 「同じ配列の同じ参照」不変条件を崩さない)。
 */
export const idolStrings = (): StringScript<IdolMove>[] => {
  const extra: StringScript<IdolMove>[] = [];
  for (const s of idolEnabledShots()) {
    const sp = IDOL_TUNING.shots[s];
    if (sp.weight <= 0) continue;
    const zi = Math.max(0, Math.min(IDOL_SHOT_ZONES.length - 1, Math.round(sp.zoneIdx)));
    extra.push({ zone: IDOL_SHOT_ZONES[zi], weight: sp.weight, moves: [s] });
  }
  const hasOff = IDOL_TUNING.strings.some(s => s.off);
  const base = hasOff ? IDOL_TUNING.strings.filter(s => !s.off) : IDOL_TUNING.strings;
  return extra.length === 0 && !hasOff ? IDOL_TUNING.strings : [...base, ...extra];
};

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

/**
 * 社長が足した射撃技の公平性(v0.25.2638)。**足した技も必ず検算に載る**ようにする——
 * ここを空のままにすると「メーカーで作った技だけ公平性の網の外」という穴になる。
 *  - 誘導があり、かつプレイヤーより速い ⇒ **走っても振り切れない = C**(答えは詰めること)
 *  - それ以外は **B**(判定=弾の太さぶんだけ横へ歩けば出られる)
 */
const idolShotFairness = (): MoveFairness[] => idolEnabledShots().map(s => {
  const sp = IDOL_TUNING.shots[s];
  const unshakeable = sp.homingDeg > 0 && sp.speed > PLAYER_WALK_PX_PER_SEC;
  return unshakeable
    ? { key: idolShotName(s), cls: 'C' as const, telegraphMs: sp.windup }
    : { key: idolShotName(s), cls: 'B' as const, telegraphMs: sp.windup, escapePx: sp.size / 2 + PLAYER_HALF };
});
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
    ...idolShotFairness(),
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
    ...idolShotFairness(),
  ];
};

// ---- 旧API(既存の呼び出し側との互換) ----------------------------------------------------------
/** 旧 idolMoveEligible の後継。台本方式へ移行したので「そのゾーンの台本に登場するか」で答える。 */
export const idolMoveEligible = (move: IdolMove, distance: number): boolean => {
  const z = idolZone(distance);
  return idolStrings().some(s => s.zone === z && s.weight > 0 && s.moves.includes(move));
};

// ---- 銃口(社長指示v0.25.3439) -----------------------------------------------------------------
// 「銃技は立ち絵で銃がある高さの、絵の左右端っこを起点にする。進行方向が右なら右端を起点。高さは一定。」
// 立ち絵(public/sprites/idol.png・768×1024・表示高95px)では銃は腕を伸ばした絵の端・上から約18%の
// 高さにある。銃技(aim/fan/snipe/orb/射撃部品)の**発射起点・予告線の起点・武器絵の持ち位置**を
// 全てこの1点に揃える(判定=赤い線=絵が同じ純関数を読む)。punch/rollは銃技ではない=対象外。
export const IDOL_GUN_MUZZLE_SIDE_PX = 36; // 絵の左右端(表示幅≒95×768/1024=71pxの半分)
export const IDOL_GUN_MUZZLE_UP_PX = 78;   // 足元から銃の高さまで(表示高95pxの上から約18%)
export const idolGunMuzzle = (
  centerX: number, footY: number, aimDx: number,
): { x: number; y: number } => ({
  x: centerX + (aimDx >= 0 ? IDOL_GUN_MUZZLE_SIDE_PX : -IDOL_GUN_MUZZLE_SIDE_PX),
  y: footY - IDOL_GUN_MUZZLE_UP_PX,
});

// ---- 弾プロファイルの登録(v0.25.2849・BOSS_MAKER.md §19-6-a) ----------------------------------
// 弾の性能を「11ボス共通の1行」(`enemyUtils` の fallback)から**このテーブル**へ差し替える。
// **同じ参照**を渡すので、ボスメーカーで数字を変えるとその場で次の弾から反映される。
// 渡すのは**型の既定**(どの技でもない経路から撃たれた時の値)。実際の aim/fan/orb は
// 発射地点(idolTick)で技ごとの値を明示的に渡す(社長指示v0.25.2628「弾速度とか個別にしないと」)。
//
// ★ここに置く理由: 旧はボスメーカーの `idolTuning.ts` 最上位で呼んでおり、`App.tsx` が
// パネルを eager import していたおかげで**本編のロード時にも走っていた**。道具を切り分けて
// バンドルから落とすと、この副作用も一緒に消える。今は登録値と fallback の数値が偶然一致して
// いるので挙動は変わらないが、片方を触った瞬間に本編と道具が静かに食い違う。よってゲーム側へ移す。
// (`enemyUtils` は `idolScript` を import していないので循環しない)
registerEnemyFireProfile('idol', IDOL_TUNING.bullet.aim);

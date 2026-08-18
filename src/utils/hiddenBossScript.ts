// ボスメーカー横展開・第4弾(BOSS_MAKER.md §6 フェーズ4): 裏ボス4体(ミーミル/ヨルムンガルド/
// スカジ/トール)の**可変チューニングテーブル**。
//
// 方針は idol / 賞金首 / 天使と同じ「台本はコード / 数字はテーブル」(BOSS_MAKER.md §2-2):
//  - 状態機械(useGameLoop.ts の裏ボスコントローラ)のロジックは一切変えず、**数値の置き場所だけ**
//    をここへ移す。既存コードは使用時参照(tick中/描画中に読む)なので、テーブルのプロパティを読む
//    形にすれば挙動は1バイトも変わらない。**既定値は現行の実装値と完全一致**(=リファクタとして無変更)。
//  - 判定(useGameLoop)と描画(pixiScene)は**このテーブルの同じ場所を読む**。どちらか一方が古い定数を
//    読むと「赤いのに当たらない」になるので、寸法は必ずここに1つだけ置く
//    (第1弾で確立: スカラーの再exportは数値のコピー=画面で動かしても古い値のまま。
//     **入れ子オブジェクトだけが live**)。
//
// ★このファイルは**依存の軽い葉**でなければならない(import は deepClone / bossTelegraph の2つ=
//   いずれも store を触らない層だけ)。理由は bountyDims.ts 冒頭の「gameStore → levelUpGate →
//   bountyTick → gameStore の循環importで本番バンドルがTDZ=起動直後真っ暗」(v0.25.3390)。
//   **gameStore を import しないこと。** よって `PLAYER_BASE_SPEED`(gameStore)や
//   `RANGE_BY_CATEGORY`(weaponUtils)から導かれていた値は**数値を複製し、実体との一致を
//   `hiddenBossTuning.test.ts` が機械検査する**(bossTelegraph.ts / bountyDims.ts と同じ作法)。
//
// ここに**無い**もの(=まだ画面から触れない・意図的):
//  - 技の**抽選**(距離帯・重み・フェーズ別の出し分け・連携の台本): mimirScript / jormungandScript /
//    skadiScript / thorScript / bossChoreography が正本(いずれも store 非依存の別の葉)。
//    天使・賞金首と同じ扱いで、テーブル化には持ち主側の分解が要る。
//  - **レーザーの寸法/溜め/中断窓**(MIMIR_LASER_RANGE / HALF_WIDTH / FIRE_MS / WINDUP_MS 等):
//    正本は `mimirLaserTrack.ts` で、**バス停(bounty-ranged)が同じ実体を輸入している**
//    (賞金首パネルも「寸法と溜めは本家と同じ=触れるのは威力・硬直・頻度だけ」で揃えてある)。
//    ここへ複製すると二重定義になるので置かない。ミーミル側で触れるのも威力・硬直・揺れだけ。
//  - **氷塊/氷刃の飛翔体そのもの**(SKADI_ICE_RADIUS / SKADI_BLADE_SPEED / SKADI_BLADE_HIT /
//    SKADI_BLADE_LIFE_MS): gameStore が持つ「置かれた物」側の値=store 非依存の葉には置けない。
//  - **場と交戦の値**(出現深度・帰巣の猶予/回復・召喚ヘイト距離・ワープフェード): 技の数字ではなく
//    「深層域という場」の寸法。触ると戦闘域そのものが食い違う(天使のアリーナ半径と同じ扱い)。
//  - **旧実装(`?<boss>script=0`)専用の抽選確率**(BOSS_DASH_CHANCE / MIMIR_LASER_CHANCE /
//    SKADI_ATTACK_CHANCE / MIMIR_LASER_AIM_TRACK): フォールバックは変更前の姿を保つのが役目なので
//    可変化しない(天使 §6 と同じ)。
import { deepCloneTuning } from './deepClone';
import { withRecoverFloor } from './bossTelegraph';

// =================================================================================================
// 4体共通(★複製して分岐を作らない=共有のまま1箇所に置く)
// =================================================================================================
/**
 * 裏ボス4体で**実際に共有されている**値(旧 `BOSS_*` 定数)。スキーマ側では「関係するボスのパネル」に
 * 同じパスで載せるが、ヘルプに「4体共通」と明記する(1つ動かすと全員が動く)。
 * ボスごとに複製すると挙動の構造が変わる=仕様変更なので、共有のままにしてある。
 *
 * ※トールは弾もダッシュも使わないので、共通のうち `actionMinMs` / `turnResponse` だけを読む
 *   (だからトールのパネルにはその2つしか出さない)。
 */
export interface HiddenCommonTuning {
  /** 次の特殊行動までの最短/最長(台帳 bossNeutralDelayMs が無い時のフォールバック+復帰時の間)。 */
  actionMinMs: number;
  actionMaxMs: number;
  /** 弾3連(立ち止まり→3発)。 */
  aimBurstMs: number;
  burstShots: number;
  burstGapMs: number;
  /** 全方位(立ち止まり→16発)。 */
  aimRadialMs: number;
  radialCount: number;
  /** 突進(3体共通・§6.28-5/7/9で同値)。 */
  dash: {
    windup: number; ms: number; speedMult: number;
    homing: number; backstepMult: number; recover: number;
  };
  /** 移動の慣性。目標速度へ寄せる係数(小さいほど慣性大=ぬるっと曲がる)。 */
  turnResponse: number;
}

export const HIDDEN_COMMON_TUNING: HiddenCommonTuning = {
  actionMinMs: 2600,   // = 旧 BOSS_ACTION_MIN_MS
  actionMaxMs: 4600,   // = 旧 BOSS_ACTION_MAX_MS
  aimBurstMs: 1000,    // = 旧 BOSS_AIM_BURST_MS(立ち止まり1秒後に3連発)
  burstShots: 3,       // = 旧 BOSS_BURST_SHOTS
  burstGapMs: 500,     // = 旧 BOSS_BURST_GAP_MS
  aimRadialMs: 2000,   // = 旧 BOSS_AIM_RADIAL_MS(立ち止まり2秒後に全方位)
  radialCount: 16,     // = 旧 BOSS_RADIAL_COUNT
  dash: {
    windup: 1000,      // = 旧 BOSS_DASH_WINDUP_MS(読める溜めは残すが待たせ過ぎない)
    ms: 700,           // = 旧 BOSS_DASH_MS(実行は短く爆発的)
    speedMult: 4.4,    // = 旧 BOSS_DASH_SPEED_MULT(歩行の4.4倍で間合いを横断)
    homing: 0.05,      // = 旧 BOSS_DASH_HOMING(基本は直進・少しだけ寄せる)
    backstepMult: 0.4, // = 旧 BOSS_DASH_BACKSTEP_MULT(溜め中にゆっくり後退り)
    recover: withRecoverFloor(800), // = 旧 BOSS_DASH_RECOVER_MS
  },
  turnResponse: 3.2,   // = 旧 BOSS_TURN_RESPONSE
};

/**
 * 各ボスのテーブルは**同じ共通オブジェクトを参照で持つ**(`common:` の中身は4体で1個)。
 * こうしてあるのは、ボスメーカーの欄が「ボスのテーブルからのパス」でしか値を指せないため
 * ——複製して各ボスに配ると「画面で動かしたのに片方だけ変わる」= 挙動の構造が変わる(仕様変更)。
 */
interface HiddenSharedHolder { common: HiddenCommonTuning }

// =================================================================================================
// ミーミル(mimir・§6.28-5)
// =================================================================================================
export interface HiddenMimirTuning extends HiddenSharedHolder {
  /**
   * レーザー。**寸法と溜めはここに無い**(mimirLaserTrack.ts が正本=バス停と共有)。
   * ここで触れるのは威力・硬直・発射中の揺れだけ(賞金首パネルのレーザー節と同じ切り分け)。
   */
  laser: { damage: number; shakeMag: number; recover: number };
  /** 群体の噛みつき(本体直下の円AoE)。半径は bodyCenteredAoe.ts が正本(不変条件テスト付き)。 */
  bite: { windup: number; recover: number; cdMs: number };
  /** 弾3連/全方位の硬直(ボスごとに違う値なのでボス別に持つ)。 */
  burstRecover: number;
  radialRecover: number;
}

export const HIDDEN_MIMIR_TUNING: HiddenMimirTuning = {
  common: HIDDEN_COMMON_TUNING, // ★4体で同じ実体(複製しない)
  laser: { damage: 42, shakeMag: 5, recover: withRecoverFloor(900) },
  bite: { windup: 700, recover: withRecoverFloor(800), cdMs: 6000 },
  burstRecover: withRecoverFloor(300),
  radialRecover: withRecoverFloor(500),
};

// =================================================================================================
// ヨルムンガルド(jormungand・§6.28-7)
// =================================================================================================
export interface HiddenJormungandTuning extends HiddenSharedHolder {
  /** 3-way扇を5回(=計15発)。1回ぶんの発射は共通の burst 経路に乗る。 */
  burst: { volleys: number; fanSpread: number; gapMs: number; recover: number };
  /** 全方位16発を8回、毎回すこしずつ時計回りへずらす螺旋。 */
  radial: { volleys: number; gapMs: number; spin: number; recover: number };
  /**
   * うねり(近接専用・Phase2限定)。長さ/半幅の既定はトールの払いと同値(§6.28-7で明記された流用)。
   * **別の欄として持つ**(揃っていることは hiddenBossTuning.test.ts が既定値で機械検査する)。
   */
  coil: { windup: number; active: number; recover: number; cdMs: number; range: number; halfWidth: number };
}

export const HIDDEN_JORMUNGAND_TUNING: HiddenJormungandTuning = {
  common: HIDDEN_COMMON_TUNING, // ★4体で同じ実体(複製しない)
  burst: { volleys: 5, fanSpread: 0.18, gapMs: 500, recover: withRecoverFloor(500) },
  radial: { volleys: 8, gapMs: 300, spin: Math.PI / 16, recover: withRecoverFloor(900) },
  coil: { windup: 700, active: 220, recover: withRecoverFloor(700), cdMs: 7000, range: 310, halfWidth: 40 },
};

// =================================================================================================
// スカジ(skadi・§6.28-9)
// =================================================================================================
export interface HiddenSkadiTuning extends HiddenSharedHolder {
  /** 氷塊/氷刃 共通の設置前windup(壁時計系=このmsがそのまま実効)。 */
  preWindup: number;
  /** 氷塊バースト(足元へ置いて2秒後に起爆)。telegraphMs は氷結の檻の氷塊にも効く。 */
  ice: { count: number; gapMs: number; telegraphMs: number; recover: number };
  /** 氷の刃(周辺のリング上へ置いて1秒後に発射)。 */
  blade: { count: number; gapMs: number; delayMs: number; ringMin: number; ringMax: number; recover: number };
  /** 氷結の檻(Phase3限定・N+1分割の1箇所だけ空ける)。 */
  cage: { windup: number; recover: number; cdMs: number; ringRadius: number; count: number };
  burstRecover: number;
  radialRecover: number;
}

export const HIDDEN_SKADI_TUNING: HiddenSkadiTuning = {
  common: HIDDEN_COMMON_TUNING, // ★4体で同じ実体(複製しない)
  preWindup: 450,
  ice: { count: 5, gapMs: 1000, telegraphMs: 2000, recover: withRecoverFloor(600) },
  blade: { count: 7, gapMs: 400, delayMs: 1000, ringMin: 100, ringMax: 180, recover: withRecoverFloor(600) },
  cage: { windup: 1000, recover: withRecoverFloor(900), cdMs: 12000, ringRadius: 180, count: 8 },
  burstRecover: withRecoverFloor(300),
  radialRecover: withRecoverFloor(500),
};

// =================================================================================================
// トール(thor・§6.28-10)
// =================================================================================================
export interface HiddenThorTuning extends HiddenSharedHolder {
  /**
   * 旋回。`distPx` の既定は「ハンドガン射程(176)+余白40」=216(社長指示v0.25.1321〜
   * 「ハンドガンが届かないくらいの距離で回る」)。**weaponUtils を import できない葉なので数値を複製し、
   * 一致は hiddenBossTuning.test.ts が機械検査する。**
   */
  orbit: { distPx: number; approachSlack: number; speedMult: number; radiusCorrect: number };
  /** 接近/後退の速さ。既定は PLAYER_BASE_SPEED(87)×0.5=43.5(社長指示「プレイヤーの1/2速度」)。 */
  approachSpeed: number;
  retreatSpeed: number;
  /** たまに後ろへ跳ぶ(攻撃サイクルとは独立の movement flourish)。 */
  backstep: { minIntervalMs: number; maxIntervalMs: number; distPx: number; ms: number };
  /** 旋回中にたまに接線方向へ弾むステップ(緩急)。 */
  orbitStep: { minIntervalMs: number; maxIntervalMs: number; distPx: number; ms: number };
  /** たまに2秒さらに1/2の速度で歩く。 */
  slowWalk: { ms: number; mult: number; minIntervalMs: number; maxIntervalMs: number };
  /** 一閃(溜め→高速移動。判定は赤いライン上のみ)。 */
  issen: { windup: number; dashMs: number; range: number; halfWidth: number; recover: number };
  /** 突き(本体は動かず間合いだけ伸びる細い帯)。trackFrac=溜め中の狙い追従(プレイヤー速度比)。 */
  tsuki: { windup: number; ms: number; range: number; halfWidth: number; trackFrac: number; recover: number };
  /** 払い(ロック済みの並行ライン)。 */
  harai: { windup: number; active: number; range: number; halfWidth: number; recover: number };
  /** 飛び掛かり(画面外からの被弾が続いた時の間合い詰め)。 */
  jump: { triggerHits: number; triggerWindowMs: number; windup: number; ms: number; radius: number; recover: number };
  /** カウンター成立時の後退ジャンプ。 */
  counterLeapMs: number;
}

export const HIDDEN_THOR_TUNING: HiddenThorTuning = {
  common: HIDDEN_COMMON_TUNING, // ★4体で同じ実体(複製しない)
  orbit: { distPx: 216, approachSlack: 60, speedMult: 2 / 3, radiusCorrect: 4 },
  approachSpeed: 43.5,
  retreatSpeed: 43.5,
  backstep: { minIntervalMs: 3000, maxIntervalMs: 6000, distPx: 90, ms: 180 },
  orbitStep: { minIntervalMs: 2500, maxIntervalMs: 5000, distPx: 70, ms: 160 },
  slowWalk: { ms: 2000, mult: 0.5, minIntervalMs: 5000, maxIntervalMs: 9000 },
  // 社長指示v0.25.3461「一閃、もう少し発動早くていい」で 3000→2400。半幅80+自機14=94px → 必要900ms。
  issen: { windup: 2400, dashMs: 280, range: 310, halfWidth: 80, recover: withRecoverFloor(900) },
  tsuki: { windup: 1000, ms: 180, range: 240, halfWidth: 15, trackFrac: 0.5, recover: withRecoverFloor(600) },
  harai: { windup: 1000, active: 220, range: 310, halfWidth: 40, recover: withRecoverFloor(700) },
  jump: { triggerHits: 3, triggerWindowMs: 6000, windup: 700, ms: 360, radius: 70, recover: withRecoverFloor(900) },
  counterLeapMs: 260,
};

// ---- 既定値(リセット/差分表示用・BOSS_MAKER.md §2-2) --------------------------------------------
// テーブルとは**別のオブジェクト**として焼く(参照を共有すると「リセット」で戻せなくなる)。
export const HIDDEN_COMMON_TUNING_DEFAULTS: HiddenCommonTuning = deepCloneTuning(HIDDEN_COMMON_TUNING);
export const HIDDEN_MIMIR_TUNING_DEFAULTS: HiddenMimirTuning = deepCloneTuning(HIDDEN_MIMIR_TUNING);
export const HIDDEN_JORMUNGAND_TUNING_DEFAULTS: HiddenJormungandTuning = deepCloneTuning(HIDDEN_JORMUNGAND_TUNING);
export const HIDDEN_SKADI_TUNING_DEFAULTS: HiddenSkadiTuning = deepCloneTuning(HIDDEN_SKADI_TUNING);
export const HIDDEN_THOR_TUNING_DEFAULTS: HiddenThorTuning = deepCloneTuning(HIDDEN_THOR_TUNING);

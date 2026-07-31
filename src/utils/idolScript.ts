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
import { withRecoverFloor } from './bossTelegraph';

// v0.25.2613: 狙撃線(snipe)と追尾弾(orb)を新設。既存4技は消さず条件を与え直す(社長方針)。
export type IdolMove = 'aim' | 'fan' | 'roll' | 'punch' | 'snipe' | 'orb';

export const IDOL_ALL_MOVES: readonly IdolMove[] = ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb'];

// ---- ①帯(§6.28-20の確定表 140/340 をそのまま使い、遠を2つに割っただけ=仕様不変) --------------
export const IDOL_ZONE_EDGES: ZoneEdges = {
  meleeMax: 140, // 近(離脱ローリング/至近の殴り)=§6.28-20 の NEAR_MAX
  nearMax: 340,  // 中(連射)=§6.28-20 の MID_MAX。**ここが主戦帯**
  midMax: 700,   // 遠(狙い撃ち/狙撃線)。これを超えたら超遠=追尾弾と狙撃線だけが届く
};
export const idolZone = (distance: number): BossZone => zoneForDistance(distance, IDOL_ZONE_EDGES);

// ---- ⑤主戦帯(監査レポート§2-4) ----------------------------------------------------------------
// 根拠(新しい数字を発明していない): 上限340=§6.28-20の中帯上限 / 下限200=IDOL_ROLL_DIST(140)+余白60
// =「密着から離脱ローリング1回でちょうど主戦帯の下端へ戻る」。検算: 下端200pxからプレイヤー(104.4px/s)が
// 密着(≤140)まで詰めるのに0.58秒、完全密着まで1.9秒 → fanの溜め900msの間に1回は撃たれるが必ず詰められる。
export const IDOL_NEUTRAL_BAND: NeutralBand = { min: 200, max: 340 };

/** 中立の移動速度倍率(enemy.speed=150 に掛ける)。詰めは全速、維持/後退はゆっくり=張り付かせない。 */
export const IDOL_VERB_SPEED_MULT = { close: 1, retreat: 0.45, strafe: 0.45, hold: 0 } as const;

// ---- フェーズ(既存の閾値を据え置き) ------------------------------------------------------------
export const IDOL_PHASE_HP_THRESHOLD = 0.5;
export const idolPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [IDOL_PHASE_HP_THRESHOLD]) as 1 | 2;

/** 連射の扇の本数(Phase2で3→5・§6.28-20の確定値。不変)。 */
export const idolFanCount = (phase: 1 | 2): number => (phase === 2 ? 5 : 3);

// ---- 技の秒数(MAX枠) ---------------------------------------------------------------------------
export const IDOL_TIMING = {
  aim:   { windup: 700,  active: 0,   recover: withRecoverFloor(500) },
  fan:   { windup: 900,  active: 0,   recover: withRecoverFloor(600) },
  roll:  { windup: 400,  active: 300, recover: withRecoverFloor(800) },
  punch: { windup: 600,  active: 0,   recover: withRecoverFloor(900) },
  snipe: { windup: 1100, active: 200, recover: withRecoverFloor(900) },
  orb:   { windup: 800,  active: 0,   recover: withRecoverFloor(900) },
} as const satisfies Record<IdolMove, { windup: number; active: number; recover: number }>;

// 図形(判定と厳密一致させる値。描画側=pixiScene はこの定数を読む)。
export const IDOL_ROLL_DIST = 140;
export const IDOL_PUNCH_RANGE = 90;
export const IDOL_PUNCH_HALF_WIDTH = 30;
export const IDOL_SNIPE_RANGE = 900;      // 狙撃線の長さ(超遠まで届く=逃げ撃ちを消す担い手)
export const IDOL_SNIPE_HALF_WIDTH = 40;  // =THOR_HARAI_HALF_WIDTH(流用・新しい数字を発明しない)
export const IDOL_FAN_SPREAD_STEP = 0.14; // 1本あたりの開き角(rad・既存値)
export const IDOL_ORB_SPEED = 155;        // 追尾弾の速度(プレイヤー104.4px/sより速い=走っても振り切れない)
export const IDOL_ORB_TURN_RATE = 1.5;    // 旋回速度(rad/s)。**密着すると旋回が追いつかない**=詰めた側の報酬
export const idolOrbCount = (phase: 1 | 2): number => (phase === 2 ? 3 : 2);

// ---- ★フェーズ2「第二波」(ER §2-15 約束の王ラダーンP2の型) -------------------------------------
// 「全ての攻撃に遅れて聖の光波(追撃)が付く=P1の各技につき回避が2回必要」。出典が
// **「最も安価で効果的な最終ボス強化の実例」と明言**している型をそのまま流用する。
// 対象は遠距離3技(aim/fan/snipe)。近距離技(roll/punch)には付けない=「近づくほど安全」を強化する。
export const IDOL_WAVE_MOVES: readonly IdolMove[] = ['aim', 'fan', 'snipe'];
/** 1発目の判定から第二波までの遅れ。550ms(公平性の下限)を上回る値=見てから反応できる。 */
export const IDOL_WAVE_DELAY_MS = 650;
export const idolWaveActive = (move: IdolMove, phase: 1 | 2): boolean =>
  phase >= 2 && IDOL_WAVE_MOVES.includes(move);

// ---- ②③ストリング(台本) -----------------------------------------------------------------------
// 並びは「速→速→遅(終)」(ER §2-17 レラーナの経験則)。**4段目まで書き、P1は先頭3段だけ使う**
// =P2で1段伸びる(社長裁定「MAX枠なら P1=3段 / P2=4段」)。
export const IDOL_STRING_LEN: StringLenConfig = { p1: 3, p2: 4 };

export const IDOL_STRINGS: readonly StringScript<IdolMove>[] = [
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
];

// ---- ④休符 -------------------------------------------------------------------------------------
// 社長裁定: MAX枠は P1=0.9秒(1発)/ P2=0.9秒のまま。**ストリングが長い分ターンの回数が減る**という作り。
// 0にはしない(プレイヤーのターンが消えると理不尽)。0.9秒=カウンター1サイクル820msを上回る最小値。
export const IDOL_REST: RestConfig = { p1: 900, p2: 900 };

// ---- 中立の滞在(休符明け〜次のストリングまで) --------------------------------------------------
// ER原則③「中立姿勢は主戦帯で横に回りながら出入りする」。**ここが無いとボスは一切移動しない**
// (初回計測で移動tickが0.5〜5.5%しか無く、休符明けに同フレームで次の技を出していた=主戦帯の
// 維持そのものが成立していなかった)。ストリングが長いMAX枠でも「動いている絵」を必ず作るための最小値。
export const IDOL_NEUTRAL_MIN_MS = 700;
export const IDOL_NEUTRAL_MAX_MS = 1300;

// ---- ⑥懲罰(ER原則⑤) ---------------------------------------------------------------------------
// (a)遠距離での長居 → 狙撃線(竜装大騎士 §3-1「中〜遠では火球を連発、回復行動へのパニッシュとして撃つ」)
// (b)密着の居座り → 離脱ローリング(ラダーン §2-3「密着していれば中遠距離の魔法を使わない」の逆用。
//    **AoEで剥がさない**=「近づくほど安全」を壊さないため、離れるだけ)
// (c)同角度の長居 → 旋回方向を反転(軸ずらし)
export const IDOL_PUNISH: PunishConfig<IdolMove> = {
  farMs: 2000, farMove: 'snipe',
  meleeMs: 3000, meleeMove: 'roll',
  sameAngleMs: 4000,
};
export const IDOL_SAME_ANGLE_DEG = 30;

// ---- 公平性の台帳(社長指示「MAXは密度で作る。読めなさで作らない」) -----------------------------
// cls の意味(bossSkeleton.ts): A=歩くだけで確実に避けられる / B=歩けるが余裕が小さい /
// C=歩いて避けられない=**別の答え(カウンター、または間合いを詰めること)が要る**。
// idolのCは「その距離に居続ける限り避けられない」=答えが「詰める」になる技=本ボスの主題そのもの。
// escapePx = 判定から歩いて出るのに要る距離(自機半径16px込み)。
const PLAYER_HALF = 16;
export const IDOL_FAIRNESS_P1: readonly MoveFairness[] = [
  { key: 'aim', cls: 'A', telegraphMs: IDOL_TIMING.aim.windup, escapePx: 14 + PLAYER_HALF },
  { key: 'fan', cls: 'B', telegraphMs: IDOL_TIMING.fan.windup, escapePx: 54 + PLAYER_HALF },
  { key: 'snipe', cls: 'B', telegraphMs: IDOL_TIMING.snipe.windup, escapePx: IDOL_SNIPE_HALF_WIDTH + PLAYER_HALF },
  // 拳: 帯90px×半幅30。溜め600msで歩ける距離は62px<判定 → 歩いて出られない=カウンターが答え。
  { key: 'punch', cls: 'C', telegraphMs: IDOL_TIMING.punch.windup },
  // 追尾弾: 速度155>プレイヤー104.4=走っても振り切れない。答えは「詰めて旋回を振り切る」。
  { key: 'orb', cls: 'C', telegraphMs: IDOL_TIMING.orb.windup },
];
export const IDOL_FAIRNESS_P2: readonly MoveFairness[] = [
  // Phase2: 遠距離3技すべてに第二波が付く=1発目を避けても650ms後にもう一度来る(回避2回)。
  // 「1発目の判定」がヒントなので、第二波の予告時間は IDOL_WAVE_DELAY_MS そのもの。
  { key: 'aim+wave', cls: 'C', telegraphMs: IDOL_WAVE_DELAY_MS },
  { key: 'fan+wave', cls: 'C', telegraphMs: IDOL_WAVE_DELAY_MS },
  { key: 'snipe+wave', cls: 'C', telegraphMs: IDOL_WAVE_DELAY_MS },
  { key: 'punch', cls: 'C', telegraphMs: IDOL_TIMING.punch.windup },
  { key: 'orb', cls: 'C', telegraphMs: IDOL_TIMING.orb.windup },
];

// ---- 旧API(既存の呼び出し側との互換) ----------------------------------------------------------
/** 旧 idolMoveEligible の後継。台本方式へ移行したので「そのゾーンの台本に登場するか」で答える。 */
export const idolMoveEligible = (move: IdolMove, distance: number): boolean => {
  const z = idolZone(distance);
  return IDOL_STRINGS.some(s => s.zone === z && s.weight > 0 && s.moves.includes(move));
};

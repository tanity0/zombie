// ステージ1「1周目」構成(STAGE1_FIRST_LOOP.md・社長 2026-11-18「ステージ１を2週させます」「戻す可能性も視野にいれておいて」)。
//
// ★可逆性(§1): 1周目の構成は STAGE1_FIRST_LOOP_ENABLED の1本で丸ごと止まる。false なら isStage1FirstLoopRun が
//   常に false=store の `stage1Loop` は常に null=どの分岐にも入らない(現行のステージ1と同じ)。
// この層は純関数だけ(store/React/PixiJS 非依存)。判定・位置・段階・モードの一方通行・賞金首の発火半径・
// 1周目に出さない物の一覧を置く。配線(gameStore/useGameLoop/pixiScene)はここを読むだけ。
import { DETOUR_DIST, DETOUR_ANGLE_SCATTER_RAD } from '../world/detourPoi';
import { sectorIndexForAngle } from '../world/pois';
import type { EventQuestNpc, SkillKey } from '../types/game';
import { welcomeAdvance, type WelcomeAdvanceResult } from './welcomeScript';

/** ★1周目構成の総スイッチ(§1)。false=現行のステージ1と同じ(二人組v4・城ボス・解放条件を含む)。 */
export const STAGE1_FIRST_LOOP_ENABLED = true;

/** 対象のステージ(1周目を持つのはステージ1だけ)。 */
export const STAGE1_FIRST_LOOP_STAGE_ID = 'stage-1';

/**
 * 開発用の URL ツマミ `?loop1=0|1` の読み(0=1周目を止める/1=クリア済みでも1周目にする)。
 * それ以外(無指定)は null=通常の判定。`?smoke=1` 等の「1周目にしない出撃」でも `?loop1=1` なら1周目で撮れる。
 */
export const parseLoop1Force = (search: string | null | undefined): '0' | '1' | null => {
  if (!search) return null;
  const v = new URLSearchParams(search).get('loop1');
  return v === '0' || v === '1' ? v : null;
};

export interface Loop1RunInput {
  enabled: boolean;          // STAGE1_FIRST_LOOP_ENABLED
  force: '0' | '1' | null;   // ?loop1=
  stageId: string;
  firstLoopCleared: boolean; // 端末の「ステージ1・1周目クリア済み」
  benchmark: boolean;
  free: boolean;             // フリー(周回)出撃
  practice: boolean;         // 練習(ボスモード)・ガントレット
  bossTestRun: boolean;      // ?castlenow/?bossnow/ボスメーカー/?vs 等(BOSS_TEST_RUN)
  smoke: boolean;            // ?smoke
  revisit: boolean;
}

/**
 * この出撃が1周目か(§2・§7.5「1周目にしない出撃」)。
 * 練習(ボスモード)・フリー・ベンチ・?smoke・?castlenow・ボスメーカーは1周目にしない。`?loop1=1` は開発用の強制。
 */
export const isStage1FirstLoopRun = (i: Loop1RunInput): boolean => {
  if (i.stageId !== STAGE1_FIRST_LOOP_STAGE_ID || i.benchmark) return false;
  if (i.force === '0') return false;
  if (i.force === '1') return true;
  if (!i.enabled) return false;
  if (i.firstLoopCleared) return false;
  return !(i.free || i.practice || i.bossTestRun || i.smoke || i.revisit);
};

// ───────────────────────────────────────────────────────────────────────────
// 段階(§4)
// base=開始〜西の拠点の確保 / afterBase=「拠点の利用」のポップアップが閉じるまで / baseComm=軍人の通信(二人組はどこだ…)が流れ切るまで /
// hospital=通信の後〜ワクチン取得(廃病院が北寄りに立つ・立つ瞬間にアテンション) / duoWait=取得後、ポップアップが閉じてから3秒 /
// duoAttention=二人が南寄りに立ち、カメラが二人へ寄って戻るまで / duo=操作が戻った〜二人のサークル到着(ミラ「助けて〜」の通信) /
// talk=到着の通信(世界は止めない) /  ※§7.9
// enclosure=囲い(全滅まで) / goal=ゴールサークル(3秒滞在) / thanks=お礼の通信(納品ロック) / won=クリア。
export type Loop1Phase = 'base' | 'afterBase' | 'baseComm' | 'hospital' | 'duoWait' | 'duoAttention' | 'duo' | 'talk' | 'enclosure' | 'goal' | 'thanks' | 'won';
export type Loop1Talk = 'arrival' | 'thanks';

export interface Stage1LoopState {
  phase: Loop1Phase;
  /** 区域のモード(0=リラックス/1=ハーベスト/2=ピーク)。一方通行で上がるだけ(§4-3)。 */
  modeLevel: 0 | 1 | 2;
  /** 賞金首の強制出現を済ませたか(1回だけ=§7.6 E)。 */
  bountySpawned: boolean;
  /** 出撃した軍人の名簿 index(警告の一言の話者・軍人が倒れていても通信で出す)。-1=軍人なし。 */
  soldierIndex: number;
  hospitalPos: { x: number; y: number };
  duoPos: { x: number; y: number };
  /** 救助(ウェルカム台本)の段(-1=まだ)・段を倒し切ったゲーム時刻・始まり/終わりのゲーム時刻(0=まだ)。 */
  rescueStep: number;
  rescueStepClearedAt: number | null;
  rescueStartedAt: number;
  rescueEndedAt: number;
  /** ゴールサークルの連続滞在(ms)。 */
  goalDwellMs: number;
  /** 出す順番を待っているチュートリアル(ポップアップ・メニューが閉じたら先頭から1つずつ出す)。 */
  pendingTutorials: Loop1TutorialId[];
  /** 「拠点の確保」を積んだか(軍人が西の拠点のサークルに入った最初の瞬間に1回だけ)。 */
  baseCaptureTutQueued: boolean;
  /** ワクチン取得後、ポップアップ等が閉じてから数えた時間(ms)。LOOP1_DUO_REVEAL_DELAY_MS で二人が立つ(§7.9)。 */
  duoWaitMs: number;
  /** 西の拠点を確保した時のピークが明けるゲーム時刻。0=まだ確保していない。 */
  capturePeakUntil: number;
  /** 「敵の動き」(mode-bar)を積んだ/出した/閉じてモードを通常のサイクルへ返したか。 */
  modeBarQueued: boolean;
  modeBarShown: boolean;
  modeHandedBack: boolean;
  /** 逆方向の通信: 次に踏み出した時に出せるか(西へ戻る/軍備配置区域の半ばより内へ戻ると立つ)・最後に出したゲーム時刻。 */
  wrongWayArmed: boolean;
  wrongWayLastAt: number;
  /** 「守護霊」のチュートリアルを積んだか(賞金首に守護霊が来た最初の瞬間に1回だけ=§7.8)。 */
  guardianTutQueued: boolean;
}

/** 1周目で出すチュートリアル(tutorials.ts の id)。 */
export type Loop1TutorialId = 'base-capture' | 'base-use' | 'detour-poi' | 'mode-bar' | 'mutant-tier' | 'guardian';

/** 1周目で確保の対象になる拠点=西(セクター2・角度π)。他の3つは印・サークル・軍人を出さない(§7.6 C)。 */
export const LOOP1_BASE_ID = 'base-2';
export const isLoop1HiddenBase = (baseId: string): boolean => baseId !== LOOP1_BASE_ID;

/**
 * 西のデンジャーゾーンの北寄り/南寄り(§4-5/§4-6)。距離は廃病院の既定(デンジャーゾーンの一番奥=DETOUR_DIST.hospital)、
 * 角度は西(π)から寄り道の散らしの上限(DETOUR_ANGLE_SCATTER_RAD=30°)だけ北/南へ振る=セクター(西)の中に必ず収まる。
 * 画面の上=北=−Y。
 */
export const loop1WestDangerPoint = (side: 'north' | 'south'): { x: number; y: number } => {
  const a = Math.PI + (side === 'north' ? DETOUR_ANGLE_SCATTER_RAD : -DETOUR_ANGLE_SCATTER_RAD);
  const d = DETOUR_DIST.hospital;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
};
export const loop1HospitalPos = (): { x: number; y: number } => loop1WestDangerPoint('north');
export const loop1DuoPos = (): { x: number; y: number } => loop1WestDangerPoint('south');

export const createStage1LoopState = (soldierIndex: number): Stage1LoopState => ({
  phase: 'base',
  modeLevel: 0,
  bountySpawned: false,
  soldierIndex,
  hospitalPos: loop1HospitalPos(),
  duoPos: loop1DuoPos(),
  rescueStep: -1,
  rescueStepClearedAt: null,
  rescueStartedAt: 0,
  rescueEndedAt: 0,
  goalDwellMs: 0,
  pendingTutorials: [],
  baseCaptureTutQueued: false,
  duoWaitMs: 0,
  capturePeakUntil: 0,
  modeBarQueued: false,
  modeBarShown: false,
  modeHandedBack: false,
  wrongWayArmed: true,
  wrongWayLastAt: Number.NEGATIVE_INFINITY,
  guardianTutQueued: false,
});

// ───────────────────────────────────────────────────────────────────────────
// 区域のモード(§4-3・一方通行)
/** 区域→モード段(軍事区域=リラックス/研究対象=ハーベスト/デンジャーゾーン以遠=ピーク)。 */
export const loop1ModeLevelForArea = (areaIdx: number): 0 | 1 | 2 =>
  areaIdx <= 0 ? 0 : areaIdx === 1 ? 1 : 2;
/** 一方通行: 一度上がったら下がらない(戻っても前のモードへ戻さない)。 */
export const ratchetLoop1Mode = (prev: 0 | 1 | 2, areaIdx: number): 0 | 1 | 2 => {
  const next = loop1ModeLevelForArea(areaIdx);
  return next > prev ? next : prev;
};
export const loop1KomaForLevel = (level: 0 | 1 | 2): 'relax' | 'harvest' | 'peak' =>
  level === 0 ? 'relax' : level === 1 ? 'harvest' : 'peak';

// ───────────────────────────────────────────────────────────────────────────
// 西の方角のモードの組み立て(社長指示2026-11-19・旧「デンジャーゾーン以遠はずっとピーク」を置き換え)
// 軍備配置区域=リラックス / 研究対象区域=ハーベスト(一方通行は従来どおり) / デンジャーゾーン=確保までリラックス /
// 確保した瞬間から LOOP1_CAPTURE_PEAK_MS だけピーク → 「敵の動き」を出し、閉じたら通常のサイクル(既定)へ返す。
// 返すまで、ピーク明け〜チュートリアルを閉じるまでの間は確保前と同じ区域の組み立てに戻る。
// ★例外: 西以外の方角で軍備配置区域の外=1周目のあいだずっとピーク(返した後も)。
export const LOOP1_CAPTURE_PEAK_MS = 20000;
export type Loop1Koma = 'relax' | 'harvest' | 'peak';
export const loop1KomaNow = (i: {
  modeLevel: 0 | 1 | 2; capturePeakUntil: number; gameTime: number; handedBack: boolean; wrongWayPeak: boolean;
}): Loop1Koma | null => {
  if (i.wrongWayPeak) return 'peak';
  if (i.handedBack) return null; // 通常のサイクル(既定)
  if (i.capturePeakUntil > 0 && i.gameTime < i.capturePeakUntil) return 'peak';
  return i.modeLevel === 1 ? 'harvest' : 'relax';
};
/** 「敵の動き」を積む瞬間: ピークが明け、ポップアップ・通信・アテンション・ほかの段の仕事が何も無い時(重ねない)。 */
export const loop1ModeBarTutorialDue = (i: { queued: boolean; capturePeakUntil: number; gameTime: number; idle: boolean }): boolean =>
  !i.queued && i.capturePeakUntil > 0 && i.gameTime >= i.capturePeakUntil && i.idle;
/** 出した後、ポップアップが閉じたら通常のサイクルへ返す。 */
export const loop1ModeHandBackDue = (i: { shown: boolean; handedBack: boolean; popupOpen: boolean }): boolean =>
  i.shown && !i.handedBack && !i.popupOpen;

// ───────────────────────────────────────────────────────────────────────────
// 逆方向(社長指示2026-11-19): 西の拠点の方角(セクター)以外へ踏み出したら、軍人が「そっちじゃない」の通信。
/** 西の拠点の方角のセクター(LOOP1_BASE_ID=西=角度π)。 */
export const LOOP1_WEST_SECTOR = sectorIndexForAngle(Math.PI);
export const loop1InWestSector = (px: number, py: number): boolean => sectorIndexForAngle(Math.atan2(py, px)) === LOOP1_WEST_SECTOR;
/** 通信を出す境目=軍備配置区域の半径の半分(militaryR=AREA_THRESHOLDS[0])。 */
export const LOOP1_WRONG_WAY_RADIUS_FRAC = 0.5;
export const loop1WrongWayRegion = (px: number, py: number, militaryR: number): boolean =>
  !loop1InWestSector(px, py) && Math.hypot(px, py) > militaryR * LOOP1_WRONG_WAY_RADIUS_FRAC;
/** 常にピークになる所=西以外の方角で軍備配置区域の外。 */
export const loop1WrongWayPeak = (px: number, py: number, militaryR: number): boolean =>
  !loop1InWestSector(px, py) && Math.hypot(px, py) > militaryR;
/** 通信どうしの最短の間(ゲーム時刻)。出入りを繰り返しても連呼しない。 */
export const LOOP1_WRONG_WAY_COOLDOWN_MS = 15000;
/** 1フレーム進める。外へ出た(inRegion=false)ら立て直す。立っていて間が空いていれば出す。 */
export const stepLoop1WrongWay = (i: { armed: boolean; lastAt: number; inRegion: boolean; now: number }): { fire: boolean; armed: boolean } => {
  if (!i.inRegion) return { fire: false, armed: true };
  if (i.armed && i.now - i.lastAt >= LOOP1_WRONG_WAY_COOLDOWN_MS) return { fire: true, armed: false };
  return { fire: false, armed: i.armed };
};

// ───────────────────────────────────────────────────────────────────────────
// 賞金首の強制出現(§7.6 E)
/** 研究対象区域の中ほど=区域の内外境界の中間の半径。thresholds は区域境界(activeAreaThresholds)。 */
export const loop1BountyRadius = (thresholds: readonly number[]): number => (thresholds[0] + thresholds[1]) / 2;
/** 初めてその半径を越えた瞬間に1回だけ(出撃地点=原点は半径の内側なので、最初に半径以上になったフレームが「越えた瞬間」)。 */
export const loop1BountyDue = (i: { spawned: boolean; distFromOrigin: number; radius: number }): boolean =>
  !i.spawned && i.distFromOrigin >= i.radius;
/** プレイヤーの少し北(−Y)。賞金首の起床距離(380)より外=見えても「無視して進む」ができる距離。 */
export const LOOP1_BOUNTY_NORTH_OFFSET_PX = 520;
export const loop1BountySpawnPos = (px: number, py: number): { x: number; y: number } =>
  ({ x: px, y: py - LOOP1_BOUNTY_NORTH_OFFSET_PX });

// ───────────────────────────────────────────────────────────────────────────
// 二人組のサークル・囲い・ゴール
/** 二人のサークル(到着の判定)の半径。旧レスキューのトリガー円と同じ見た目で描く。 */
export const LOOP1_DUO_CIRCLE_RADIUS = 140;
/** ゴールサークル=帰還サークルと同じ大きさ・同じ3秒(B5)。 */
export const LOOP1_GOAL_RADIUS = 95;
export const LOOP1_GOAL_HOLD_MS = 3000;

export const isInLoop1Circle = (px: number, py: number, c: { x: number; y: number }, radius: number): boolean =>
  Math.hypot(px - c.x, py - c.y) <= radius;

/** ゴールの滞在。外れたら0へ戻す(帰還サークル・拠点と同じ流儀)。done=このtickで満了。 */
export const tickLoop1GoalDwell = (dwellMs: number, inside: boolean, dtMs: number): { dwellMs: number; done: boolean } => {
  if (!inside) return { dwellMs: 0, done: false };
  const next = Math.min(LOOP1_GOAL_HOLD_MS, dwellMs + Math.max(0, dtMs));
  return { dwellMs: next, done: dwellMs < LOOP1_GOAL_HOLD_MS && next >= LOOP1_GOAL_HOLD_MS };
};

/**
 * 二人組の救助(社長指示2026-11-19): 旧・1周目専用の囲い(12体)を、既存のウェルカム台本(utils/welcomeScript.ts の
 * ステージ1の表をそのまま)に置き換えた。輪の中心だけ二人のサークルへ。段の進め方は welcomeAdvance そのもの。
 * ★区域を跨いだ打ち切り(③)は使わない=二人はデンジャーゾーンに居るので、区域0として渡す(倒し切りだけで終わる)。
 * ゲートを持たないステージ(stage-1)なので始動ゲートの入力は使われない。
 */
export const loop1RescueAdvance = (i: { step: number; alive: number; gameTime: number; stepClearedAt: number | null }): WelcomeAdvanceResult =>
  welcomeAdvance({
    step: i.step, aliveOfWelcome: i.alive, gameTime: i.gameTime, stepClearedAt: i.stepClearedAt,
    stageId: STAGE1_FIRST_LOOP_STAGE_ID, areaIndex: 0, startedAt: 0, playerCenterY: 0, merchantY: 0,
  });

/** 救助の間、二人の絵は消える(始まりで抜け、終わってゴールサークルと一緒に戻る・慣性つき)。描くだけ(pixiScene が読む)。 */
export const LOOP1_DUO_FADE_MS = 700;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const loop1DuoAlpha = (loop: Pick<Stage1LoopState, 'phase' | 'rescueStartedAt' | 'rescueEndedAt'>, gameTime: number): number => {
  if (loop.phase === 'enclosure') {
    const t = Math.min(1, Math.max(0, (gameTime - loop.rescueStartedAt) / LOOP1_DUO_FADE_MS));
    return 1 - easeOutCubic(t);
  }
  if (loop.rescueEndedAt > 0 && (loop.phase === 'goal' || loop.phase === 'thanks' || loop.phase === 'won')) {
    const t = Math.min(1, Math.max(0, (gameTime - loop.rescueEndedAt) / LOOP1_DUO_FADE_MS));
    return easeOutCubic(t);
  }
  return 1;
};

/** 2周目以降のステージ1はウェルカムイベントを出さない(社長指示2026-11-19=済んだ扱い)。1周目は救助として別に出す。 */
export const stage1LaterLoopSkipsWelcome = (i: { enabled: boolean; stageId: string; firstLoopCleared: boolean }): boolean =>
  i.enabled && i.stageId === STAGE1_FIRST_LOOP_STAGE_ID && i.firstLoopCleared;

// ───────────────────────────────────────────────────────────────────────────
// 段階の遷移(§4)。actions は配線側(useGameLoop)がその瞬間に1回だけ行う仕事。
export type Loop1Action =
  | 'baseCaptured'     // 「拠点の利用」のチュートリアル(廃病院はまだ出さない=§7.9)
  | 'startBaseComm'    // ポップアップが閉じた→出撃中の軍人の通信(loop1AfterBase の2行)
  | 'placeHospital'    // 通信が流れ切った→廃病院を北寄りに出す+アテンション
  | 'vaccineTaken'     // 寄り道のチュートリアル(二人はまだ出さない)
  | 'revealDuo'        // 3秒→二人を南寄りに出す+アテンション
  | 'helpComm'         // アテンションが明けた→通信 ミラ「助けて〜」
  | 'startArrivalTalk' // 到着の通信(LOOP1_ARRIVAL_LINES)
  | 'startEnclosure'   // 救助(ウェルカム台本)の開始(通常湧きを止める)+「変異体の危険度」
  | 'enclosureCleared' // 台本を倒し切った→ゴールサークルへ
  | 'startThanksTalk'  // お礼の通信(納品ロック)
  | 'win';             // 納品処理+クリア

export interface Loop1StepInput {
  baseCaptured: boolean;
  vaccineTaken: boolean;
  inDuoCircle: boolean;
  /** チュートリアルのポップアップ・メニューが開いている(B4: 閉じるまで会話を始めない)。 */
  uiBlocked: boolean;
  talkEnded: Loop1Talk | null;
  /** チュートリアルのポップアップ・メニューが閉じていて、出す順番を待つチュートリアルも無い。 */
  tutorialIdle: boolean;
  /** 通信欄が空(表示中もキューも無い)。 */
  commEnded: boolean;
  /** ワクチン取得後の待ち(LOOP1_DUO_REVEAL_DELAY_MS)が満ちた。 */
  duoRevealDue: boolean;
  /** アテンション(カメラが寄って戻る演出)の最中。 */
  attentionActive: boolean;
  /** 救助のウェルカム台本を倒し切った。 */
  rescueCleared: boolean;
  goalDone: boolean;
}

export const stepLoop1Phase = (phase: Loop1Phase, i: Loop1StepInput): { phase: Loop1Phase; action: Loop1Action | null } => {
  switch (phase) {
    case 'base': return i.baseCaptured ? { phase: 'afterBase', action: 'baseCaptured' } : { phase, action: null };
    case 'afterBase': return i.tutorialIdle ? { phase: 'baseComm', action: 'startBaseComm' } : { phase, action: null };
    case 'baseComm': return i.commEnded ? { phase: 'hospital', action: 'placeHospital' } : { phase, action: null };
    case 'hospital': return i.vaccineTaken ? { phase: 'duoWait', action: 'vaccineTaken' } : { phase, action: null };
    case 'duoWait': return i.duoRevealDue ? { phase: 'duoAttention', action: 'revealDuo' } : { phase, action: null };
    case 'duoAttention': return i.attentionActive ? { phase, action: null } : { phase: 'duo', action: 'helpComm' };
    case 'duo': return i.inDuoCircle && !i.uiBlocked ? { phase: 'talk', action: 'startArrivalTalk' } : { phase, action: null };
    case 'talk': return i.talkEnded === 'arrival' ? { phase: 'enclosure', action: 'startEnclosure' } : { phase, action: null };
    case 'enclosure': return i.rescueCleared ? { phase: 'goal', action: 'enclosureCleared' } : { phase, action: null };
    case 'goal': return i.goalDone && !i.uiBlocked ? { phase: 'thanks', action: 'startThanksTalk' } : { phase, action: null };
    case 'thanks': return i.talkEnded === 'thanks' ? { phase: 'won', action: 'win' } : { phase, action: null };
    default: return { phase, action: null };
  }
};

// ───────────────────────────────────────────────────────────────────────────
// チュートリアルの出し方(社長指示2026-11-18「拠点の確保 と 拠点の利用 をチュートリアル分けよう。
// 確保は、拠点にNPCが入ったら表示。利用は、確保したら表示」)
/**
 * 「拠点の確保」を積む瞬間: 西の拠点の担当の軍人がサークルに入り、確保の進み(滞在)が始まった最初のフレーム。
 * baseDwellMs は拠点の滞在の写し(gameStore が軍人のサークル内滞在を BaseSite.dwellMs へ写す=外へ出ると0)。
 * 進みを見ずに確保が済んだ場合(撮影用の段飛ばし等)も、確保より前に必ず1回積む=「確保」→「利用」の順を崩さない。
 */
export const loop1BaseCaptureTutorialDue = (i: { queued: boolean; baseDwellMs: number; baseCaptured: boolean }): boolean =>
  !i.queued && (i.baseDwellMs > 0 || i.baseCaptured);
/** 待ち行列の末尾へ足す(同じ物は二重に積まない)。 */
export const enqueueLoop1Tutorial = (queue: readonly Loop1TutorialId[], id: Loop1TutorialId): Loop1TutorialId[] =>
  queue.includes(id) ? [...queue] : [...queue, id];
/** 今出す1件(ポップアップ・メニュー・会話の間は出さない=閉じるまで待つ)。rest=残りの行列。 */
export const nextLoop1Tutorial = (
  queue: readonly Loop1TutorialId[], blocked: boolean,
): { show: Loop1TutorialId | null; rest: Loop1TutorialId[] } =>
  blocked || queue.length === 0 ? { show: null, rest: [...queue] } : { show: queue[0], rest: queue.slice(1) };

/** ワクチン取得から二人が立つまでの待ち(§7.9「3秒後」・ゲーム時刻)。 */
export const LOOP1_DUO_REVEAL_DELAY_MS = 3000;
/** その待ちを進める。ポップアップ・メニューが開いている間(=寄り道のチュートリアル)は進めない=閉じてから3秒。 */
export const tickLoop1DuoWait = (ms: number, idle: boolean, dtMs: number): number => (idle ? ms + dtMs : ms);

/** 二人のサークルに着いた時の会話(1周目専用・§7.9)。2周目以降/v4 の EVENT_QUEST_SUB_ACCEPT_LINES は変えない。 */
export const LOOP1_ARRIVAL_LINES: readonly { name: string; text: string }[] = [
  { name: 'グレン', text: 'また会ったな' },
  { name: 'ミラ', text: '変異体に囲まれて困ってたの！' },
  { name: 'グレン', text: '気がついたら囲まれていてな。困った' },
  { name: 'ミラ', text: '助けて〜' },
];
/** 二人が立ってアテンションが明けた時の通信(§7.9)。 */
export const LOOP1_HELP_COMM_LINES: readonly { name: string; text: string }[] = [
  { name: 'ミラ', text: '助けて〜' },
];

/** 通常湧きを止める段(囲いの間=§7.5)。 */
export const loop1HoldsNormalSpawns = (phase: Loop1Phase | null | undefined): boolean => phase === 'enclosure';
/** 地面に二人が立っている段。 */
export const loop1DuoVisible = (phase: Loop1Phase | null | undefined): boolean =>
  phase === 'duoAttention' || phase === 'duo' || phase === 'talk' || phase === 'enclosure' || phase === 'goal' || phase === 'thanks';
/** 廃病院が立っている段(取得前)。 */
export const loop1HospitalPlaced = (phase: Loop1Phase | null | undefined): boolean =>
  phase !== 'base' && phase !== 'afterBase' && phase !== 'baseComm';

// ───────────────────────────────────────────────────────────────────────────
// 守護霊のマスト化(§7.8・社長 2026-11-18「ステージ1はどちらも守護霊がマストでオフにできない。(クリア後は通常通り)」)
// ステージ1を(2周目で)クリアするまでの間、ステージ1の出撃では同行者を守護霊に固定する。召喚そのものは既存の経路
// (directorTick.runGhostAndTraitsStep=ボス/賞金首との交戦で召喚)をそのまま使う=ここは「誰を連れていくか」だけを決める。
// ★1周目(§7.6 D の「守護霊は出さない」)は §7.8 で置き換わった=1周目も守護霊を連れていく(賞金首との交戦で来る)。
/** 固定する同行者(campaign.SKILLS の守護霊)。 */
export const STAGE1_LOCKED_COMPANION: SkillKey = 'guardian-spirit';

export interface Stage1GuardianLockInput {
  enabled: boolean;      // STAGE1_FIRST_LOOP_ENABLED
  stageId: string;
  stageCleared: boolean; // 端末の「ステージ1クリア済み」(progress.getClearedStages の stage-1)
  benchmark: boolean;
  free: boolean;
  practice: boolean;     // 練習(ボスモード)・ガントレット=ボスモードの同行者欄が正
  bossTestRun: boolean;
  smoke: boolean;
  revisit: boolean;
}
/**
 * この出撃で同行者を守護霊に固定するか。1周目にしない出撃(§7.5)は固定しない=現行どおり。
 * 1周目(isStage1FirstLoopRun が true)は呼び出し側で別に OR する(`?loop1=1` でクリア済みの端末を1周目にした時も守護霊が来る)。
 */
export const isStage1GuardianLockRun = (i: Stage1GuardianLockInput): boolean =>
  i.enabled && i.stageId === STAGE1_FIRST_LOOP_STAGE_ID && !i.stageCleared
  && !(i.benchmark || i.free || i.practice || i.bossTestRun || i.smoke || i.revisit);
/** キャラ選択の守護霊枠をロック表示にするか(出撃のロックと同じ条件のうち、選択画面で分かるものだけ)。 */
export const stage1GuardianLockShown = (i: { enabled: boolean; stageId: string; stageCleared: boolean; free: boolean }): boolean =>
  i.enabled && i.stageId === STAGE1_FIRST_LOOP_STAGE_ID && !i.stageCleared && !i.free;
/** ロック中の短い注記(キャラ選択の守護霊枠)。 */
export const STAGE1_GUARDIAN_LOCK_NOTE = 'ステージ1をクリアするまで外せない';
/** このランで実際に連れていく同行者。ロック中は守護霊、それ以外は選択どおり(選択の保存値は書き換えない)。 */
export const stage1RunCompanion = (selected: SkillKey | null, locked: boolean): SkillKey | null =>
  locked ? STAGE1_LOCKED_COMPANION : selected;

/** 守護霊が紐付いた相手の区分(配線側が型から決める: 賞金首/城ボス(giantbat)/その他)。 */
export type GuardianBoundKind = 'bounty' | 'castle' | 'other';
/**
 * 「守護霊」のチュートリアルを出す瞬間(§7.8)。守護霊が賞金首(1周目)/賞金首か城ボス(2周目以降)に来た最初の瞬間。
 * - 1周目: 端末の既読に関係なく出す(§7.6 B と同じ)。1出撃1回(queued)。
 * - 2周目以降: ロック中(ステージ1未クリア)で、まだ見ていない時だけ。どちらか先に来た方で1回=見たら以後は出さない。
 * - ロックが外れた(ステージ1クリア後)出撃では出さない=通常どおり。
 * - 会話の最中と、「賞金首」のチュートリアルがまだ出ていない間は待つ(賞金首→守護霊の順を守る・重ねない)。
 */
export const stage1GuardianTutorialDue = (i: {
  firstLoop: boolean; locked: boolean; seen: boolean; queued: boolean; boundKind: GuardianBoundKind | null;
  /** NPCの会話(表示中・待ち行列)がある間は待つ(流れ切ってから)。 */
  dialogueActive?: boolean;
  /** 「賞金首」のチュートリアルがまだ出ていない(待ち・未読)間は待つ=賞金首が必ず先(社長指示2026-11-19)。 */
  bountyTutorialPending?: boolean;
}): boolean => {
  if (i.queued || i.boundKind === null) return false;
  if (i.dialogueActive || i.bountyTutorialPending) return false; // 待つだけ(次のフレームで判定し直す)
  if (i.firstLoop) return i.boundKind === 'bounty';
  return i.locked && !i.seen && (i.boundKind === 'bounty' || i.boundKind === 'castle');
};

// ───────────────────────────────────────────────────────────────────────────
// 1周目に出さない物(§3・§7.6 D・§7.7 A4)。配線の網羅を一覧で残す(テストが一覧の存在を固定する)。
export const LOOP1_SUPPRESSED = [
  'castle', 'castleBoss', 'hiddenBoss', 'secretPoi', 'reaper',
  'armory', 'police', 'shrine', 'naturalBounty', 'duoV4', 'arenaEvents', 'redNight', 'welcome',
  'gate1', 'gate2', 'patrolSlots', 'mutantHero', 'liberty', 'sceneSpawns', 'scriptedWaves', 'stage1Guide',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// 文言(§7.6 G)
export const LOOP1_OBJECTIVE_TEXT = '身元不明の民間人2名を救出せよ';
/** 右上の目的の1行(社長指示2026-11-19): 段で切り替える。クリア後(won)は最後の行のまま。 */
export const loop1ObjectiveText = (phase: Loop1Phase): string => {
  switch (phase) {
    case 'base': return '西の拠点へ向かう';
    case 'afterBase': case 'baseComm': case 'hospital': return '廃病院へ向かう';
    case 'duoWait': case 'duoAttention': case 'duo': case 'talk': return '二人組の元へ向かう';
    case 'enclosure': return '二人組の救助';
    default: return '二人組の安否確認'; // goal / thanks / won
  }
};
export const LOOP1_REPORT_LINES: readonly string[] = [
  'グレンとミラを保護した。',
  '二人から、PHILL再生医療研究所へ通じる経路を聞き出した。',
  '経路上に大型変異体を確認。排除を優先する。',
];

// ───────────────────────────────────────────────────────────────────────────
// 描画の写し(pixiScene は読むだけ)。二人組は既存の二人の絵(旧 eventQuestNpc の描画経路)をそのまま使うので、
// 同じ形の値を作って渡す(既存の eventQuestNpc は 1周目は status='gone' のまま=v4の経路には一切入らない)。
export const loop1DuoNpcView = (loop: Stage1LoopState | null | undefined, gameTime = 0): EventQuestNpc | null => {
  if (!loop || !loop1DuoVisible(loop.phase)) return null;
  return {
    viewAlpha: loop1DuoAlpha(loop, gameTime),
    x: loop.duoPos.x, y: loop.duoPos.y, radius: LOOP1_DUO_CIRCLE_RADIUS,
    // duo の間だけ 'rescue'=水色の待機トリガー円を描く(旧レスキューと同じ見た目)。到着後は円を消して二人だけ立たせる。
    status: loop.phase === 'duo' || loop.phase === 'duoAttention' ? 'rescue' : 'accepted',
    questIndex: 0, fadeStartedAt: 0, dwellMs: 0, leftSinceAccept: true,
    moveStartedAt: 0, moveFromX: 0, moveFromY: 0, moveToX: 0, moveToY: 0, movePhase: null, hopPx: 0,
    triggerRadius: LOOP1_DUO_CIRCLE_RADIUS,
  };
};
/** ゴールサークル(帰還サークルと同じ絵)。goal の段だけ。 */
export const loop1GoalCircleView = (loop: Stage1LoopState | null | undefined): { x: number; y: number; radius: number; dwellMs: number } | null =>
  loop && loop.phase === 'goal' ? { x: loop.duoPos.x, y: loop.duoPos.y, radius: LOOP1_GOAL_RADIUS, dwellMs: loop.goalDwellMs } : null;
/** 画面端の人型の印(二人の位置)を出す段。 */
export const loop1DuoMarkVisible = (phase: Loop1Phase | null | undefined): boolean => phase === 'duo' || phase === 'goal';

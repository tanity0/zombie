// ステージ1「1周目」構成(STAGE1_FIRST_LOOP.md・社長 2026-11-18「ステージ１を2週させます」「戻す可能性も視野にいれておいて」)。
//
// ★可逆性(§1): 1周目の構成は STAGE1_FIRST_LOOP_ENABLED の1本で丸ごと止まる。false なら isStage1FirstLoopRun が
//   常に false=store の `stage1Loop` は常に null=どの分岐にも入らない(現行のステージ1と同じ)。
// この層は純関数だけ(store/React/PixiJS 非依存)。判定・位置・段階・モードの一方通行・賞金首の発火半径・
// 1周目に出さない物の一覧を置く。配線(gameStore/useGameLoop/pixiScene)はここを読むだけ。
import { DETOUR_DIST, DETOUR_ANGLE_SCATTER_RAD } from '../world/detourPoi';
import type { EnemyType, EventQuestNpc } from '../types/game';

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
// base=開始〜西の拠点の確保 / hospital=拠点確保〜ワクチン取得(廃病院が北寄りに立つ) /
// duo=ワクチン取得〜二人のサークル到着(二人が南寄りに立つ) / talk=到着の会話(時間停止) /
// enclosure=囲い(全滅まで) / goal=ゴールサークル(3秒滞在) / thanks=お礼の会話(時間停止) / won=クリア。
export type Loop1Phase = 'base' | 'hospital' | 'duo' | 'talk' | 'enclosure' | 'goal' | 'thanks' | 'won';
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
  /** 囲いで出した敵の id(B1: 消えた個体も「倒した」に数える=生存数はこの id のうち盤上に居る物)。 */
  enclosureIds: string[];
  enclosureSpawned: number;
  enclosureNextAt: number;
  /** ゴールサークルの連続滞在(ms)。 */
  goalDwellMs: number;
  /** 出す順番を待っているチュートリアル(ポップアップ・メニューが閉じたら出す)。 */
  pendingTutorial: 'loop1-base' | 'detour-poi' | null;
}

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
  enclosureIds: [],
  enclosureSpawned: 0,
  enclosureNextAt: 0,
  goalDwellMs: 0,
  pendingTutorial: null,
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
/** 会話の最終行を出し切ってから閉じるまでの余白(自動で閉じる時のみ。タップ/スキップは即)。 */
export const LOOP1_TALK_END_HOLD_MS = 600;

export const isInLoop1Circle = (px: number, py: number, c: { x: number; y: number }, radius: number): boolean =>
  Math.hypot(px - c.x, py - c.y) <= radius;

/** ゴールの滞在。外れたら0へ戻す(帰還サークル・拠点と同じ流儀)。done=このtickで満了。 */
export const tickLoop1GoalDwell = (dwellMs: number, inside: boolean, dtMs: number): { dwellMs: number; done: boolean } => {
  if (!inside) return { dwellMs: 0, done: false };
  const next = Math.min(LOOP1_GOAL_HOLD_MS, dwellMs + Math.max(0, dtMs));
  return { dwellMs: next, done: dwellMs < LOOP1_GOAL_HOLD_MS && next >= LOOP1_GOAL_HOLD_MS };
};

/** 囲いの敵の数と出し方(新規の簡易版=§7.5)。大量発生(horde)の顔ぶれの比率(1/3=パンプキン・2/3と最後=ウルフ)を流用。 */
export const LOOP1_ENCLOSURE_COUNT = 12;
export const LOOP1_ENCLOSURE_INTERVAL_MS = 350;
// 輪の半径: 縦持ちの画面で見える内側(横は画面の半幅ほど・北側は地平線のフェードより手前)に収める。
// プレイヤーとの最低距離は大量発生の湧き(HORDE_SPAWN_PLAYER_CLEARANCE=140)より外。
export const LOOP1_ENCLOSURE_RING_MIN = 170;
export const LOOP1_ENCLOSURE_RING_MAX = 240;
export const loop1EnclosureType = (n: number, total: number, rand: () => number): EnemyType => {
  const pumpkinAt = Math.round(total / 3);
  const wolfAt = Math.round(total * 2 / 3);
  if (n === pumpkinAt) return 'pumpkin';
  if (n === wolfAt || n === total) return 'werewolf';
  const basics: EnemyType[] = ['zombie', 'skeleton', 'bat'];
  return basics[Math.min(basics.length - 1, Math.floor(rand() * basics.length))];
};
/** サークルの周り(輪の上)へ等間隔+揺らぎで置く(1体目から順に一周する)。 */
export const loop1EnclosureSpawnPos = (
  center: { x: number; y: number }, n: number, total: number, rand: () => number,
): { x: number; y: number } => {
  const ang = (Math.PI * 2 * (n - 1)) / Math.max(1, total) + (rand() - 0.5) * 0.4;
  const r = LOOP1_ENCLOSURE_RING_MIN + rand() * (LOOP1_ENCLOSURE_RING_MAX - LOOP1_ENCLOSURE_RING_MIN);
  return { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
};
/** 囲いの生存数(B1: 盤上から消えた個体=倒した扱い)。 */
export const loop1EnclosureAlive = (ids: readonly string[], enemies: readonly { id: string; health: number }[]): number => {
  if (ids.length === 0) return 0;
  const set = new Set(ids);
  let n = 0;
  for (const e of enemies) if (set.has(e.id) && e.health > 0) n++;
  return n;
};

// ───────────────────────────────────────────────────────────────────────────
// 段階の遷移(§4)。actions は配線側(useGameLoop)がその瞬間に1回だけ行う仕事。
export type Loop1Action =
  | 'baseCaptured'     // 拠点ページのチュートリアル+廃病院を北寄りに出す
  | 'vaccineTaken'     // 寄り道のチュートリアル+二人を南寄りに出す
  | 'startArrivalTalk' // 到着の会話(時間停止)
  | 'startEnclosure'   // 囲いの開始(通常湧きを止める)
  | 'enclosureCleared' // ゴールサークルへ
  | 'startThanksTalk'  // お礼の会話(時間停止)
  | 'win';             // 納品処理+クリア

export interface Loop1StepInput {
  baseCaptured: boolean;
  vaccineTaken: boolean;
  inDuoCircle: boolean;
  /** チュートリアルのポップアップ・メニューが開いている(B4: 閉じるまで会話を始めない)。 */
  uiBlocked: boolean;
  talkEnded: Loop1Talk | null;
  enclosureSpawnedAll: boolean;
  enclosureAlive: number;
  goalDone: boolean;
}

export const stepLoop1Phase = (phase: Loop1Phase, i: Loop1StepInput): { phase: Loop1Phase; action: Loop1Action | null } => {
  switch (phase) {
    case 'base': return i.baseCaptured ? { phase: 'hospital', action: 'baseCaptured' } : { phase, action: null };
    case 'hospital': return i.vaccineTaken ? { phase: 'duo', action: 'vaccineTaken' } : { phase, action: null };
    case 'duo': return i.inDuoCircle && !i.uiBlocked ? { phase: 'talk', action: 'startArrivalTalk' } : { phase, action: null };
    case 'talk': return i.talkEnded === 'arrival' ? { phase: 'enclosure', action: 'startEnclosure' } : { phase, action: null };
    case 'enclosure': return i.enclosureSpawnedAll && i.enclosureAlive === 0 ? { phase: 'goal', action: 'enclosureCleared' } : { phase, action: null };
    case 'goal': return i.goalDone && !i.uiBlocked ? { phase: 'thanks', action: 'startThanksTalk' } : { phase, action: null };
    case 'thanks': return i.talkEnded === 'thanks' ? { phase: 'won', action: 'win' } : { phase, action: null };
    default: return { phase, action: null };
  }
};

/** 通常湧きを止める段(囲いの間=§7.5)。 */
export const loop1HoldsNormalSpawns = (phase: Loop1Phase | null | undefined): boolean => phase === 'enclosure';
/** 地面に二人が立っている段。 */
export const loop1DuoVisible = (phase: Loop1Phase | null | undefined): boolean =>
  phase === 'duo' || phase === 'talk' || phase === 'enclosure' || phase === 'goal' || phase === 'thanks';
/** 廃病院が立っている段(取得前)。 */
export const loop1HospitalPlaced = (phase: Loop1Phase | null | undefined): boolean => phase !== 'base';

// ───────────────────────────────────────────────────────────────────────────
// 1周目に出さない物(§3・§7.6 D・§7.7 A4)。配線の網羅を一覧で残す(テストが一覧の存在を固定する)。
export const LOOP1_SUPPRESSED = [
  'castle', 'castleBoss', 'hiddenBoss', 'secretPoi', 'guardianGhost', 'reaper',
  'armory', 'police', 'shrine', 'naturalBounty', 'duoV4', 'arenaEvents', 'redNight', 'welcome',
  'gate1', 'gate2', 'patrolSlots', 'mutantHero', 'liberty', 'sceneSpawns', 'scriptedWaves', 'stage1Guide',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// 文言(§7.6 G)
export const LOOP1_OBJECTIVE_TEXT = '身元不明の民間人2名を救出せよ';
export const LOOP1_REPORT_LINES: readonly string[] = [
  '民間人2名を保護した。二人から、PHILL再生医療研究所の位置を聞き出した。',
  '研究所へ向かうには、周辺の大型変異体を排除する必要がある。',
];

// ───────────────────────────────────────────────────────────────────────────
// 描画の写し(pixiScene は読むだけ)。二人組は既存の二人の絵(旧 eventQuestNpc の描画経路)をそのまま使うので、
// 同じ形の値を作って渡す(既存の eventQuestNpc は 1周目は status='gone' のまま=v4の経路には一切入らない)。
export const loop1DuoNpcView = (loop: Stage1LoopState | null | undefined): EventQuestNpc | null => {
  if (!loop || !loop1DuoVisible(loop.phase)) return null;
  return {
    x: loop.duoPos.x, y: loop.duoPos.y, radius: LOOP1_DUO_CIRCLE_RADIUS,
    // duo の間だけ 'rescue'=水色の待機トリガー円を描く(旧レスキューと同じ見た目)。到着後は円を消して二人だけ立たせる。
    status: loop.phase === 'duo' ? 'rescue' : 'accepted',
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

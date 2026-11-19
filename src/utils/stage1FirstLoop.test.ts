import { describe, it, expect } from 'vitest';
import {
  STAGE1_FIRST_LOOP_ENABLED, isStage1FirstLoopRun, parseLoop1Force, type Loop1RunInput,
  createStage1LoopState, isLoop1HiddenBase, LOOP1_BASE_ID, loop1HospitalPos, loop1DuoPos,
  loop1ModeLevelForArea, ratchetLoop1Mode, loop1KomaForLevel,
  loop1BountyRadius, loop1BountyDue, loop1BountySpawnPos, LOOP1_BOUNTY_NORTH_OFFSET_PX,
  tickLoop1GoalDwell, LOOP1_GOAL_HOLD_MS, loop1RescueAdvance, loop1DuoAlpha, LOOP1_DUO_FADE_MS, stage1LaterLoopSkipsWelcome,
  stepLoop1Phase, type Loop1StepInput, type Loop1Phase, loop1HoldsNormalSpawns, loop1DuoVisible,
  loop1DuoNpcView, loop1GoalCircleView, loop1DuoMarkVisible, LOOP1_SUPPRESSED,
  LOOP1_OBJECTIVE_TEXT, LOOP1_REPORT_LINES, loop1BaseCaptureTutorialDue, enqueueLoop1Tutorial, nextLoop1Tutorial,
  LOOP1_ARRIVAL_LINES, LOOP1_HELP_COMM_LINES, LOOP1_DUO_REVEAL_DELAY_MS, tickLoop1DuoWait, loop1HospitalPlaced, loop1ObjectiveText,
  loop1KomaNow, LOOP1_CAPTURE_PEAK_MS, loop1ModeBarTutorialDue, loop1ModeHandBackDue,
  LOOP1_WEST_SECTOR, loop1InWestSector, loop1WrongWayRegion, loop1WrongWayPeak, stepLoop1WrongWay, LOOP1_WRONG_WAY_COOLDOWN_MS,
  isStage1GuardianLockRun, type Stage1GuardianLockInput, stage1GuardianLockShown, stage1RunCompanion, STAGE1_LOCKED_COMPANION,
  stage1GuardianTutorialDue, STAGE1_GUARDIAN_LOCK_NOTE,
} from './stage1FirstLoop';
import { COMPANION_SKILL_KEYS } from '../data/campaign';
import { EVENT_QUEST_SUB_ACCEPT_LINES } from './eventQuest';
import { WELCOME_SCRIPT, WELCOME_STEP_GAP_MS } from './welcomeScript';
import { AREA_THRESHOLDS } from './enemyUtils';
import { BOUNTY_AGGRO_RANGE_DEFAULT } from './bountyDims';
import { poiSectorIndex } from '../world/pois';
import { pickNpcLine, NPC_SCENE_VARIANTS, npcLinesInOrder } from '../data/npcLines';
import { npcChatterAllowed } from './npcChatter';
import { getTutorial } from '../data/tutorials';

const run = (over: Partial<Loop1RunInput> = {}): Loop1RunInput => ({
  enabled: true, force: null, stageId: 'stage-1', firstLoopCleared: false, benchmark: false, free: false,
  practice: false, bossTestRun: false, smoke: false, revisit: false, ...over,
});

describe('1周目の判定(§2・§7.5)', () => {
  it('スイッチは既定ON(試験導入)', () => {
    expect(STAGE1_FIRST_LOOP_ENABLED).toBe(true);
  });
  it('ステージ1・未クリア・通常出撃だけが1周目', () => {
    expect(isStage1FirstLoopRun(run())).toBe(true);
    expect(isStage1FirstLoopRun(run({ firstLoopCleared: true }))).toBe(false);
    expect(isStage1FirstLoopRun(run({ stageId: 'stage-3' }))).toBe(false);
  });
  it('スイッチOFFなら1周目にならない(=現行のステージ1)', () => {
    expect(isStage1FirstLoopRun(run({ enabled: false }))).toBe(false);
  });
  it('1周目にしない出撃: 練習・フリー・ベンチ・?smoke・ボス戦テスト(?castlenow等)・再訪', () => {
    for (const k of ['practice', 'free', 'benchmark', 'smoke', 'bossTestRun', 'revisit'] as const) {
      expect(isStage1FirstLoopRun(run({ [k]: true })), k).toBe(false);
    }
  });
  it('?loop1=1 は強制(クリア済み・?smoke でも)/?loop1=0 は止める。ステージ1以外・ベンチは強制でもならない', () => {
    expect(isStage1FirstLoopRun(run({ force: '1', firstLoopCleared: true, smoke: true }))).toBe(true);
    expect(isStage1FirstLoopRun(run({ force: '0' }))).toBe(false);
    expect(isStage1FirstLoopRun(run({ force: '1', stageId: 'stage-2' }))).toBe(false);
    expect(isStage1FirstLoopRun(run({ force: '1', benchmark: true }))).toBe(false);
  });
  it('?loop1= の読み', () => {
    expect(parseLoop1Force('?loop1=1')).toBe('1');
    expect(parseLoop1Force('?smoke=1&loop1=0')).toBe('0');
    expect(parseLoop1Force('?loop1=x')).toBeNull();
    expect(parseLoop1Force('')).toBeNull();
  });
});

describe('拠点と位置(§4・§7.6 C)', () => {
  it('西の拠点(base-2)だけが対象・他の3つは隠す', () => {
    expect(isLoop1HiddenBase(LOOP1_BASE_ID)).toBe(false);
    for (const id of ['base-0', 'base-1', 'base-3']) expect(isLoop1HiddenBase(id)).toBe(true);
  });
  it('廃病院=西のデンジャーゾーンの北寄り/二人=南寄り(どちらも西のセクター・デンジャーゾーンの中)', () => {
    const h = loop1HospitalPos(), d = loop1DuoPos();
    expect(h.x).toBeLessThan(0); expect(d.x).toBeLessThan(0);
    expect(h.y).toBeLessThan(0); // 北=上=−Y
    expect(d.y).toBeGreaterThan(0);
    for (const p of [h, d]) {
      expect(poiSectorIndex(p)).toBe(2);
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThan(AREA_THRESHOLDS[1]);
      expect(r).toBeLessThan(AREA_THRESHOLDS[2]);
    }
  });
  it('初期状態', () => {
    const s = createStage1LoopState(3);
    expect(s.phase).toBe('base');
    expect(s.modeLevel).toBe(0);
    expect(s.bountySpawned).toBe(false);
    expect(s.soldierIndex).toBe(3);
  });
});

describe('区域のモード(§4-3・一方通行)', () => {
  it('軍事区域=リラックス/研究対象=ハーベスト/デンジャー以遠=ピーク', () => {
    expect(loop1KomaForLevel(loop1ModeLevelForArea(0))).toBe('relax');
    expect(loop1KomaForLevel(loop1ModeLevelForArea(1))).toBe('harvest');
    expect(loop1KomaForLevel(loop1ModeLevelForArea(2))).toBe('peak');
    expect(loop1KomaForLevel(loop1ModeLevelForArea(4))).toBe('peak');
  });
  it('一度上がったら下がらない', () => {
    let lvl = ratchetLoop1Mode(0, 1);
    expect(lvl).toBe(1);
    lvl = ratchetLoop1Mode(lvl, 0);
    expect(lvl).toBe(1);
    lvl = ratchetLoop1Mode(lvl, 2);
    expect(lvl).toBe(2);
    expect(ratchetLoop1Mode(lvl, 0)).toBe(2);
    expect(ratchetLoop1Mode(lvl, 1)).toBe(2);
  });
});

describe('賞金首の強制出現(§7.6 E)', () => {
  const r = loop1BountyRadius(AREA_THRESHOLDS);
  it('半径=研究対象区域の内外境界の中間', () => {
    expect(r).toBe((AREA_THRESHOLDS[0] + AREA_THRESHOLDS[1]) / 2);
  });
  it('半径を越えた最初の1回だけ(どの方角でも)', () => {
    expect(loop1BountyDue({ spawned: false, distFromOrigin: r - 1, radius: r })).toBe(false);
    expect(loop1BountyDue({ spawned: false, distFromOrigin: r, radius: r })).toBe(true);
    expect(loop1BountyDue({ spawned: true, distFromOrigin: r + 500, radius: r })).toBe(false);
  });
  it('プレイヤーの少し北・起床距離より外(無視して進める)', () => {
    const p = loop1BountySpawnPos(100, 200);
    expect(p.x).toBe(100);
    expect(p.y).toBeLessThan(200);
    expect(LOOP1_BOUNTY_NORTH_OFFSET_PX).toBeGreaterThan(BOUNTY_AGGRO_RANGE_DEFAULT);
  });
});

describe('囲いとゴール(§4-7/§4-8・B1・B5)', () => {
  it('ゴールは3秒滞在・外れたら0へ', () => {
    let t = tickLoop1GoalDwell(0, true, LOOP1_GOAL_HOLD_MS - 1);
    expect(t.done).toBe(false);
    t = tickLoop1GoalDwell(t.dwellMs, true, 5);
    expect(t.done).toBe(true);
    expect(tickLoop1GoalDwell(2000, false, 16).dwellMs).toBe(0);
  });
  it('二人組の救助=ステージ1のウェルカム台本をそのまま(区域では打ち切らない・倒し切りで終わる)', () => {
    const table = WELCOME_SCRIPT['stage-1']!;
    let r = loop1RescueAdvance({ step: -1, alive: 0, gameTime: 1000, stepClearedAt: null });
    expect(r.step).toBe(0);
    expect(r.spawnNow).toEqual(table[0]);
    expect(r.endedAt).toBeNull();
    // 生きている間は進まない(デンジャーゾーンでも打ち切らない)
    expect(loop1RescueAdvance({ step: 0, alive: 1, gameTime: 99999, stepClearedAt: null }).endedAt).toBeNull();
    // 全滅→間が明けたら次の段
    expect(loop1RescueAdvance({ step: 0, alive: 0, gameTime: 2000 + WELCOME_STEP_GAP_MS - 1, stepClearedAt: 2000 }).spawnNow).toBeNull();
    r = loop1RescueAdvance({ step: 0, alive: 0, gameTime: 2000 + WELCOME_STEP_GAP_MS, stepClearedAt: 2000 });
    expect(r.step).toBe(1);
    expect(r.spawnNow).toEqual(table[1]);
    const last = table.length - 1;
    r = loop1RescueAdvance({ step: last, alive: 0, gameTime: 9000 + WELCOME_STEP_GAP_MS, stepClearedAt: 9000 });
    expect(r.endedAt).not.toBeNull();
    expect(r.cleared).toBe(true);
  });
  it('救助の間、二人は慣性つきで抜けて、終わるとゴールサークルと一緒に戻る', () => {
    const s0 = createStage1LoopState(0);
    expect(loop1DuoAlpha({ ...s0, phase: 'talk' }, 5000)).toBe(1);
    const enc = { ...s0, phase: 'enclosure' as const, rescueStartedAt: 1000 };
    expect(loop1DuoAlpha(enc, 1000)).toBe(1);
    const mid = loop1DuoAlpha(enc, 1000 + LOOP1_DUO_FADE_MS / 2);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(0.5); // ease-out=前半で大きく抜ける
    expect(loop1DuoAlpha(enc, 1000 + LOOP1_DUO_FADE_MS)).toBe(0);
    const goal = { ...s0, phase: 'goal' as const, rescueStartedAt: 1000, rescueEndedAt: 8000 };
    expect(loop1DuoAlpha(goal, 8000)).toBe(0);
    expect(loop1DuoAlpha(goal, 8000 + LOOP1_DUO_FADE_MS / 2)).toBeGreaterThan(0.5);
    expect(loop1DuoAlpha(goal, 8000 + LOOP1_DUO_FADE_MS)).toBe(1);
    expect(loop1DuoNpcView(enc, 1000 + LOOP1_DUO_FADE_MS)?.viewAlpha).toBe(0);
  });
  it('2周目以降のステージ1はウェルカムを出さない', () => {
    expect(stage1LaterLoopSkipsWelcome({ enabled: true, stageId: 'stage-1', firstLoopCleared: true })).toBe(true);
    expect(stage1LaterLoopSkipsWelcome({ enabled: true, stageId: 'stage-1', firstLoopCleared: false })).toBe(false);
    expect(stage1LaterLoopSkipsWelcome({ enabled: true, stageId: 'stage-3', firstLoopCleared: true })).toBe(false);
    expect(stage1LaterLoopSkipsWelcome({ enabled: false, stageId: 'stage-1', firstLoopCleared: true })).toBe(false);
  });
});

describe('段階の遷移(§4)', () => {
  const none: Loop1StepInput = {
    baseCaptured: false, vaccineTaken: false, inDuoCircle: false, uiBlocked: false, talkEnded: null,
    tutorialIdle: false, commEnded: false, duoRevealDue: false, attentionActive: true,
    rescueCleared: false, goalDone: false,
  };
  it('§4の順で進む', () => {
    let ph: Loop1Phase = 'base';
    const go = (i: Partial<Loop1StepInput>) => { const r = stepLoop1Phase(ph, { ...none, ...i }); ph = r.phase; return r.action; };
    expect(go({})).toBeNull();
    expect(go({ vaccineTaken: true })).toBeNull(); // 拠点前にワクチンは段を飛ばさない
    expect(ph).toBe('base');
    expect(go({ baseCaptured: true })).toBe('baseCaptured');
    expect(ph).toBe('afterBase');
    // §7.9: 「拠点の利用」が閉じるまで軍人の通信は出さない。廃病院も通信が流れ切るまで出さない。
    expect(go({ vaccineTaken: true, commEnded: true })).toBeNull();
    expect(go({ tutorialIdle: true })).toBe('startBaseComm');
    expect(ph).toBe('baseComm');
    expect(loop1HospitalPlaced(ph)).toBe(false);
    expect(go({ tutorialIdle: true })).toBeNull();
    expect(go({ commEnded: true })).toBe('placeHospital');
    expect(ph).toBe('hospital');
    expect(loop1HospitalPlaced(ph)).toBe(true);
    expect(go({ vaccineTaken: true })).toBe('vaccineTaken');
    expect(ph).toBe('duoWait');
    expect(loop1DuoVisible(ph)).toBe(false);
    expect(go({ inDuoCircle: true, attentionActive: false })).toBeNull(); // 3秒が満ちるまで二人は出ない
    expect(go({ duoRevealDue: true })).toBe('revealDuo');
    expect(ph).toBe('duoAttention');
    expect(loop1DuoVisible(ph)).toBe(true);
    expect(go({ inDuoCircle: true })).toBeNull(); // アテンション中は待つ(到着の会話も始めない)
    expect(go({ attentionActive: false })).toBe('helpComm');
    expect(ph).toBe('duo');
    expect(go({ inDuoCircle: true, uiBlocked: true })).toBeNull(); // B4: 開いていれば待つ
    expect(go({ inDuoCircle: true })).toBe('startArrivalTalk');
    expect(ph).toBe('talk');
    expect(go({ talkEnded: 'arrival' })).toBe('startEnclosure');
    expect(go({})).toBeNull(); // 台本を倒し切るまで終わらない
    expect(go({ rescueCleared: true })).toBe('enclosureCleared');
    expect(go({ goalDone: true })).toBe('startThanksTalk');
    expect(go({ talkEnded: 'thanks' })).toBe('win');
    expect(ph).toBe('won');
    expect(go({ baseCaptured: true, goalDone: true })).toBeNull();
  });
  it('二人が立つのはワクチン取得後、ポップアップが閉じてから3秒(ゲーム時刻)', () => {
    expect(LOOP1_DUO_REVEAL_DELAY_MS).toBe(3000);
    expect(tickLoop1DuoWait(0, false, 16)).toBe(0); // 開いている間は数えない
    expect(tickLoop1DuoWait(100, true, 16)).toBe(116);
    expect(createStage1LoopState(0).duoWaitMs).toBe(0);
  });
  it('右上の目的の1行は段で切り替わる', () => {
    const want: Record<Loop1Phase, string> = {
      base: '西の拠点へ向かう', afterBase: '廃病院へ向かう', baseComm: '廃病院へ向かう', hospital: '廃病院へ向かう',
      duoWait: '二人組の元へ向かう', duoAttention: '二人組の元へ向かう', duo: '二人組の元へ向かう', talk: '二人組の元へ向かう',
      enclosure: '二人組の救助', goal: '二人組の安否確認', thanks: '二人組の安否確認', won: '二人組の安否確認',
    };
    for (const [p, t] of Object.entries(want)) expect(loop1ObjectiveText(p as Loop1Phase), p).toBe(t);
  });
  it('通常湧きを止めるのは囲いの間だけ', () => {
    expect(loop1HoldsNormalSpawns('enclosure')).toBe(true);
    for (const p of ['base', 'afterBase', 'baseComm', 'hospital', 'duoWait', 'duoAttention', 'duo', 'talk', 'goal', 'thanks', 'won'] as Loop1Phase[]) expect(loop1HoldsNormalSpawns(p)).toBe(false);
    expect(loop1HoldsNormalSpawns(null)).toBe(false);
  });
  it('二人はワクチン取得後から立ち、待機円は到着まで', () => {
    expect(loop1DuoVisible('hospital')).toBe(false);
    expect(loop1DuoVisible('duo')).toBe(true);
    const s = createStage1LoopState(0);
    expect(loop1DuoNpcView(s)).toBeNull();
    expect(loop1DuoNpcView({ ...s, phase: 'duo' })?.status).toBe('rescue');
    expect(loop1DuoNpcView({ ...s, phase: 'enclosure' })?.status).toBe('accepted');
    expect(loop1GoalCircleView({ ...s, phase: 'enclosure' })).toBeNull();
    expect(loop1GoalCircleView({ ...s, phase: 'goal' })?.radius).toBeGreaterThan(0);
    expect(loop1DuoMarkVisible('duo')).toBe(true);
    expect(loop1DuoMarkVisible('talk')).toBe(false);
    expect(loop1DuoNpcView(null)).toBeNull();
  });
});

describe('西の方角のモードと逆方向(社長指示2026-11-19)', () => {
  const R0 = AREA_THRESHOLDS[0];
  const k = (o: Partial<Parameters<typeof loop1KomaNow>[0]>) => loop1KomaNow({ modeLevel: 0, capturePeakUntil: 0, gameTime: 0, handedBack: false, wrongWayPeak: false, ...o });
  it('軍備=リラックス/研究=ハーベスト/デンジャー=確保までリラックス', () => {
    expect(k({ modeLevel: 0 })).toBe('relax');
    expect(k({ modeLevel: 1 })).toBe('harvest');
    expect(k({ modeLevel: 2 })).toBe('relax');
  });
  it('確保から20秒だけピーク、明けたら区域の組み立てへ。閉じたら通常のサイクル(null)', () => {
    expect(LOOP1_CAPTURE_PEAK_MS).toBe(20000);
    expect(k({ modeLevel: 2, capturePeakUntil: 25000, gameTime: 5000 })).toBe('peak');
    expect(k({ modeLevel: 2, capturePeakUntil: 25000, gameTime: 25000 })).toBe('relax');
    expect(k({ modeLevel: 2, capturePeakUntil: 25000, gameTime: 9000, handedBack: true })).toBeNull();
  });
  it('西以外の方角で軍備配置区域の外は、返した後もずっとピーク', () => {
    expect(k({ wrongWayPeak: true })).toBe('peak');
    expect(k({ wrongWayPeak: true, handedBack: true })).toBe('peak');
    expect(loop1InWestSector(-R0 * 2, 0)).toBe(true);
    expect(loop1WrongWayPeak(-R0 * 2, 0, R0)).toBe(false); // 西
    expect(loop1WrongWayPeak(R0 * 1.1, 0, R0)).toBe(true); // 東の外
    expect(loop1WrongWayPeak(R0 * 0.9, 0, R0)).toBe(false); // 東でも軍備配置区域の中
    expect(poiSectorIndex({ x: -1, y: 0 })).toBe(LOOP1_WEST_SECTOR);
  });
  it('「敵の動き」はピーク明けかつ何も重なっていない時に1回だけ、閉じたら返す', () => {
    expect(loop1ModeBarTutorialDue({ queued: false, capturePeakUntil: 0, gameTime: 99999, idle: true })).toBe(false); // 確保前
    expect(loop1ModeBarTutorialDue({ queued: false, capturePeakUntil: 25000, gameTime: 24999, idle: true })).toBe(false);
    expect(loop1ModeBarTutorialDue({ queued: false, capturePeakUntil: 25000, gameTime: 25000, idle: false })).toBe(false); // 通信・ポップアップ中は待つ
    expect(loop1ModeBarTutorialDue({ queued: false, capturePeakUntil: 25000, gameTime: 25000, idle: true })).toBe(true);
    expect(loop1ModeBarTutorialDue({ queued: true, capturePeakUntil: 25000, gameTime: 25000, idle: true })).toBe(false);
    expect(loop1ModeHandBackDue({ shown: true, handedBack: false, popupOpen: true })).toBe(false);
    expect(loop1ModeHandBackDue({ shown: true, handedBack: false, popupOpen: false })).toBe(true);
    expect(loop1ModeHandBackDue({ shown: false, handedBack: false, popupOpen: false })).toBe(false);
    expect(getTutorial('mode-bar')?.title).toBe('敵の動き');
    expect(getTutorial('mode-bar')?.where).toBe('全域');
    expect(getTutorial('mode-bar')?.lines.join('')).not.toMatch(/[0-9０-９]/);
    expect(getTutorial('mutant-tier')?.title).toBe('変異体の危険度');
    expect(getTutorial('mutant-tier')?.where).toBe('全域');
    expect(getTutorial('mutant-tier')?.lines).toEqual([
      '変異体は、体の色で危険度が分かる。',
      '青、紫、赤の順に、体力も攻撃も強くなる。',
      '赤い変異体は強個体と化しており、体勢を崩しても一撃では倒せない。',
    ]);
  });
  it('逆方向の通信: 軍備配置区域の半ばより外で1回、戻ると立て直し、連呼しない', () => {
    expect(loop1WrongWayRegion(R0 * 0.4, 0, R0)).toBe(false);
    expect(loop1WrongWayRegion(R0 * 0.6, 0, R0)).toBe(true);
    expect(loop1WrongWayRegion(-R0 * 3, 0, R0)).toBe(false);
    const s0 = createStage1LoopState(0);
    let a = stepLoop1WrongWay({ armed: s0.wrongWayArmed, lastAt: s0.wrongWayLastAt, inRegion: true, now: 1000 });
    expect(a).toEqual({ fire: true, armed: false });
    expect(stepLoop1WrongWay({ armed: false, lastAt: 1000, inRegion: true, now: 99999 })).toEqual({ fire: false, armed: false }); // 居続けても1回
    a = stepLoop1WrongWay({ armed: false, lastAt: 1000, inRegion: false, now: 2000 });
    expect(a).toEqual({ fire: false, armed: true }); // 戻ると立つ
    expect(stepLoop1WrongWay({ armed: true, lastAt: 1000, inRegion: true, now: 1000 + LOOP1_WRONG_WAY_COOLDOWN_MS - 1 }).fire).toBe(false); // 間が空くまで待つ
    expect(stepLoop1WrongWay({ armed: true, lastAt: 1000, inRegion: true, now: 1000 + LOOP1_WRONG_WAY_COOLDOWN_MS }).fire).toBe(true);
  });
  it('「そっちじゃない」は8人それぞれ1行(雑談OFFでも出る)', () => {
    const want = ['そっちじゃない。拠点は西だ！', 'おーい、そっちじゃねえって！西だ西！', 'そちらではありませんわ。拠点は西です。', 'そちらではない。西だ。',
      'そちらではありません！拠点は西です！', 'ふふ、そっちは盤面の外だよ。拠点は西だ。', 'そっちじゃないよ！拠点は西だよ！', 'どこ行く気だ。拠点は西だぞ。'];
    want.forEach((t, i) => expect(npcLinesInOrder(i, 'loop1WrongWay'), `idx${i}`).toEqual([t]));
    expect(npcChatterAllowed('loop1WrongWay', false)).toBe(true);
  });
});

describe('出さない物・文言・台詞・チュートリアル', () => {
  it('出さない物の一覧(§3・§7.6 D・§7.7 A4)', () => {
    for (const k of ['castle', 'castleBoss', 'hiddenBoss', 'reaper', 'armory', 'police', 'shrine', 'naturalBounty', 'duoV4', 'redNight', 'welcome', 'gate1', 'gate2', 'patrolSlots', 'mutantHero', 'sceneSpawns']) {
      expect(LOOP1_SUPPRESSED as readonly string[]).toContain(k);
    }
    // §7.8: 守護霊は1周目も連れていく(賞金首との交戦で来る)=出さない物の一覧から外れた。
    expect(LOOP1_SUPPRESSED as readonly string[]).not.toContain('guardianGhost');
  });
  it('目的と任務報告の文言(§7.6 G)', () => {
    expect(LOOP1_OBJECTIVE_TEXT).toBe('身元不明の民間人2名を救出せよ');
    expect(LOOP1_REPORT_LINES).toEqual([
      'グレンとミラを保護した。',
      '二人から、PHILL再生医療研究所へ通じる経路を聞き出した。',
      '経路上に大型変異体を確認。排除を優先する。',
    ]);
  });
  it('賞金首の警告は8人全員にあり、雑談OFFでも出る', () => {
    for (let i = 0; i < 8; i++) {
      expect(NPC_SCENE_VARIANTS.some(v => v.idx === i && v.cat === 'bountyWarning'), `idx${i}`).toBe(true);
      expect(pickNpcLine(i, 'bountyWarning', '')).not.toBe('');
    }
    expect(npcChatterAllowed('bountyWarning', false)).toBe(true);
  });
  it('拠点確保後の軍人の通信は8人それぞれ2行を順に(§7.9・雑談OFFでも出る)', () => {
    const want: [string, string][] = [
      ['二人組はどこだ？', '北の廃病院を当たってみるぞ。'],
      ['で、肝心の二人組はどこだ？', '北の廃病院あたり、覗いてみようぜ！'],
      ['お二人はどちらにいらっしゃるのかしら。', '北の廃病院へ行ってみましょう。'],
      ['二人組は何処だ。', '北の廃病院へ向かう。'],
      ['二人組はどこでしょう？', '北の廃病院へ参りましょう！'],
      ['さて、二人組はどこにいるのかな。', '北の廃病院……ふふ、次の一手はそこだね。'],
      ['二人組、どこにいるんだろう？', '北の廃病院に行ってみようよ！'],
      ['二人組はどこだ。', '北の廃病院だ。行くぞ。'],
    ];
    want.forEach((lines, i) => expect(npcLinesInOrder(i, 'loop1AfterBase'), `idx${i}`).toEqual(lines));
    expect(npcChatterAllowed('loop1AfterBase', false)).toBe(true);
  });
  it('到着の会話は1周目専用の4行(v4/2周目以降の受注の台詞は変えない)、二人が立った後の通信は ミラ「助けて〜」', () => {
    expect(LOOP1_ARRIVAL_LINES).toEqual([
      { name: 'グレン', text: 'また会ったな' },
      { name: 'ミラ', text: '変異体に囲まれて困ってたの！' },
      { name: 'グレン', text: '気がついたら囲まれていてな。困った' },
      { name: 'ミラ', text: '助けて〜' },
    ]);
    expect(LOOP1_HELP_COMM_LINES).toEqual([{ name: 'ミラ', text: '助けて〜' }]);
    expect(EVENT_QUEST_SUB_ACCEPT_LINES['stage-1'][0].text).toBe('またお前か。頼みがある。理由は聞くな');
  });
  it('拠点のチュートリアルは「確保」と「利用」の2件(3枚ガイドとは別id)', () => {
    expect(getTutorial('base-capture')?.title).toBe('拠点の確保');
    expect(getTutorial('base-capture')?.lines).toHaveLength(3);
    expect(getTutorial('base-use')?.title).toBe('拠点の利用');
    expect(getTutorial('base-use')?.lines).toEqual(['確保した拠点では、黄色いサークルの中で指を離した瞬間に、武器商人の通販を利用できる。']);
    expect(getTutorial('base-capture')?.archiveAlways).toBeFalsy();
    expect(getTutorial('base-use')?.archiveAlways).toBeFalsy();
  });
  it('「拠点の確保」は軍人がサークルに入った(滞在が始まった)最初の瞬間に1回だけ', () => {
    expect(loop1BaseCaptureTutorialDue({ queued: false, baseDwellMs: 0, baseCaptured: false })).toBe(false);
    expect(loop1BaseCaptureTutorialDue({ queued: false, baseDwellMs: 16, baseCaptured: false })).toBe(true);
    expect(loop1BaseCaptureTutorialDue({ queued: true, baseDwellMs: 16, baseCaptured: false })).toBe(false);
    // 進みを見ずに確保が済んでも、確保より前に1回積む
    expect(loop1BaseCaptureTutorialDue({ queued: false, baseDwellMs: 0, baseCaptured: true })).toBe(true);
    expect(createStage1LoopState(0).baseCaptureTutQueued).toBe(false);
    expect(createStage1LoopState(0).pendingTutorials).toEqual([]);
  });
  it('確保が待っているうちに確保が済んだら「確保」→「利用」の順で1件ずつ出す', () => {
    let q = enqueueLoop1Tutorial([], 'base-capture');
    q = enqueueLoop1Tutorial(q, 'base-use');
    expect(enqueueLoop1Tutorial(q, 'base-use')).toEqual(['base-capture', 'base-use']);
    // ポップアップが開いている間は出さない
    expect(nextLoop1Tutorial(q, true)).toEqual({ show: null, rest: ['base-capture', 'base-use'] });
    const a = nextLoop1Tutorial(q, false);
    expect(a).toEqual({ show: 'base-capture', rest: ['base-use'] });
    const b = nextLoop1Tutorial(a.rest, false);
    expect(b).toEqual({ show: 'base-use', rest: [] });
    expect(nextLoop1Tutorial([], false)).toEqual({ show: null, rest: [] });
  });
});

describe('守護霊のマスト化(§7.8)', () => {
  const lock = (over: Partial<Stage1GuardianLockInput> = {}): Stage1GuardianLockInput => ({
    enabled: true, stageId: 'stage-1', stageCleared: false, benchmark: false, free: false,
    practice: false, bossTestRun: false, smoke: false, revisit: false, ...over,
  });
  it('固定する同行者は守護霊(同行者の候補の1つ)', () => {
    expect(STAGE1_LOCKED_COMPANION).toBe('guardian-spirit');
    expect(COMPANION_SKILL_KEYS).toContain(STAGE1_LOCKED_COMPANION);
  });
  it('ステージ1を未クリアの通常の出撃だけ固定する(クリア後・他ステージ・1周目にしない出撃は現行どおり)', () => {
    expect(isStage1GuardianLockRun(lock())).toBe(true);
    expect(isStage1GuardianLockRun(lock({ stageCleared: true }))).toBe(false);
    expect(isStage1GuardianLockRun(lock({ stageId: 'stage-2' }))).toBe(false);
    expect(isStage1GuardianLockRun(lock({ enabled: false }))).toBe(false); // 総スイッチOFF=現行と同じ
    for (const k of ['benchmark', 'free', 'practice', 'bossTestRun', 'smoke', 'revisit'] as const) {
      expect(isStage1GuardianLockRun(lock({ [k]: true })), k).toBe(false);
    }
  });
  it('選択画面のロック表示も同じ条件(ステージ1・未クリア・フリーでない)', () => {
    expect(stage1GuardianLockShown({ enabled: true, stageId: 'stage-1', stageCleared: false, free: false })).toBe(true);
    expect(stage1GuardianLockShown({ enabled: true, stageId: 'stage-1', stageCleared: true, free: false })).toBe(false);
    expect(stage1GuardianLockShown({ enabled: true, stageId: 'stage-1', stageCleared: false, free: true })).toBe(false);
    expect(stage1GuardianLockShown({ enabled: true, stageId: 'stage-2', stageCleared: false, free: false })).toBe(false);
    expect(stage1GuardianLockShown({ enabled: false, stageId: 'stage-1', stageCleared: false, free: false })).toBe(false);
    expect(STAGE1_GUARDIAN_LOCK_NOTE).toBe('ステージ1をクリアするまで外せない');
  });
  it('ロック中は選択に関係なく守護霊、外れたら選択どおり', () => {
    expect(stage1RunCompanion(null, true)).toBe('guardian-spirit');
    expect(stage1RunCompanion('ghost-helper', true)).toBe('guardian-spirit');
    expect(stage1RunCompanion('ghost-helper', false)).toBe('ghost-helper');
    expect(stage1RunCompanion(null, false)).toBe(null);
  });
  it('チュートリアル: 1周目は賞金首に来た時に毎回(既読に関係なく)・1出撃1回', () => {
    const base = { firstLoop: true, locked: true, seen: true, queued: false };
    expect(stage1GuardianTutorialDue({ ...base, boundKind: 'bounty' })).toBe(true);
    expect(stage1GuardianTutorialDue({ ...base, boundKind: null })).toBe(false);
    expect(stage1GuardianTutorialDue({ ...base, boundKind: 'other' })).toBe(false);
    expect(stage1GuardianTutorialDue({ ...base, queued: true, boundKind: 'bounty' })).toBe(false);
  });
  it('チュートリアル: 2周目以降は未読の時だけ、賞金首か城ボスの先に来た方で', () => {
    const base = { firstLoop: false, locked: true, seen: false, queued: false };
    expect(stage1GuardianTutorialDue({ ...base, boundKind: 'bounty' })).toBe(true);
    expect(stage1GuardianTutorialDue({ ...base, boundKind: 'castle' })).toBe(true);
    expect(stage1GuardianTutorialDue({ ...base, boundKind: 'other' })).toBe(false);
    expect(stage1GuardianTutorialDue({ ...base, seen: true, boundKind: 'castle' })).toBe(false); // 見たら以後は出さない
    expect(stage1GuardianTutorialDue({ ...base, locked: false, boundKind: 'bounty' })).toBe(false); // クリア後は通常どおり
  });
  it('チュートリアル: 会話の最中と、賞金首のチュートリアルが出る前は待つ(賞金首が先)', () => {
    for (const firstLoop of [true, false]) {
      const base = { firstLoop, locked: true, seen: false, queued: false, boundKind: 'bounty' as const };
      expect(stage1GuardianTutorialDue({ ...base, dialogueActive: true })).toBe(false);
      expect(stage1GuardianTutorialDue({ ...base, bountyTutorialPending: true })).toBe(false);
      expect(stage1GuardianTutorialDue({ ...base, dialogueActive: false, bountyTutorialPending: false })).toBe(true);
    }
  });
  it('文面(社長確定 2026-11-18)', () => {
    expect(createStage1LoopState(0).guardianTutQueued).toBe(false);
    expect(getTutorial('guardian')?.title).toBe('守護霊');
    expect(getTutorial('guardian')?.where).toBe('全域');
    expect(getTutorial('guardian')?.lines).toEqual([
      '強敵と出会うと、誰かの守護霊が現れて一緒に戦ってくれる事がある。',
      '守護霊は、誰かの過去の戦いを写した影。守護霊を連れていくか否かは、キャラ選択の守護霊枠で選べる。(自らの守護霊を育てるにはソロプレイで討伐する必要がある)',
    ]);
  });
});

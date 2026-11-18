import { describe, it, expect } from 'vitest';
import {
  STAGE1_FIRST_LOOP_ENABLED, isStage1FirstLoopRun, parseLoop1Force, type Loop1RunInput,
  createStage1LoopState, isLoop1HiddenBase, LOOP1_BASE_ID, loop1HospitalPos, loop1DuoPos,
  loop1ModeLevelForArea, ratchetLoop1Mode, loop1KomaForLevel,
  loop1BountyRadius, loop1BountyDue, loop1BountySpawnPos, LOOP1_BOUNTY_NORTH_OFFSET_PX,
  tickLoop1GoalDwell, LOOP1_GOAL_HOLD_MS, loop1EnclosureType, loop1EnclosureSpawnPos, loop1EnclosureAlive,
  LOOP1_ENCLOSURE_RING_MIN, LOOP1_ENCLOSURE_RING_MAX,
  stepLoop1Phase, type Loop1StepInput, type Loop1Phase, loop1HoldsNormalSpawns, loop1DuoVisible,
  loop1DuoNpcView, loop1GoalCircleView, loop1DuoMarkVisible, LOOP1_SUPPRESSED,
  LOOP1_OBJECTIVE_TEXT, LOOP1_REPORT_LINES,
} from './stage1FirstLoop';
import { AREA_THRESHOLDS } from './enemyUtils';
import { BOUNTY_AGGRO_RANGE_DEFAULT } from './bountyDims';
import { poiSectorIndex } from '../world/pois';
import { pickNpcLine, NPC_SCENE_VARIANTS } from '../data/npcLines';
import { npcChatterAllowed } from './npcChatter';
import { getTutorial, STAGE1_GUIDE_SLIDES } from '../data/tutorials';

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
  it('囲いの顔ぶれ(大量発生と同じ比率)と輪の上の位置', () => {
    const rand = () => 0.5;
    expect(loop1EnclosureType(4, 12, rand)).toBe('pumpkin');
    expect(loop1EnclosureType(8, 12, rand)).toBe('werewolf');
    expect(loop1EnclosureType(12, 12, rand)).toBe('werewolf');
    expect(['zombie', 'skeleton', 'bat']).toContain(loop1EnclosureType(1, 12, rand));
    const c = { x: -5000, y: 3000 };
    for (let n = 1; n <= 12; n++) {
      const p = loop1EnclosureSpawnPos(c, n, 12, Math.random);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      expect(d).toBeGreaterThanOrEqual(LOOP1_ENCLOSURE_RING_MIN - 1e-6);
      expect(d).toBeLessThanOrEqual(LOOP1_ENCLOSURE_RING_MAX + 1e-6);
    }
  });
  it('消えた個体は倒した扱い(盤上に居る生きた個体だけ数える)', () => {
    expect(loop1EnclosureAlive(['a', 'b', 'c'], [{ id: 'a', health: 10 }, { id: 'b', health: 0 }, { id: 'x', health: 5 }])).toBe(1);
    expect(loop1EnclosureAlive([], [{ id: 'a', health: 10 }])).toBe(0);
  });
});

describe('段階の遷移(§4)', () => {
  const none: Loop1StepInput = {
    baseCaptured: false, vaccineTaken: false, inDuoCircle: false, uiBlocked: false, talkEnded: null,
    enclosureSpawnedAll: false, enclosureAlive: 0, goalDone: false,
  };
  it('§4の順で進む', () => {
    let ph: Loop1Phase = 'base';
    const go = (i: Partial<Loop1StepInput>) => { const r = stepLoop1Phase(ph, { ...none, ...i }); ph = r.phase; return r.action; };
    expect(go({})).toBeNull();
    expect(go({ vaccineTaken: true })).toBeNull(); // 拠点前にワクチンは段を飛ばさない
    expect(ph).toBe('base');
    expect(go({ baseCaptured: true })).toBe('baseCaptured');
    expect(go({ vaccineTaken: true })).toBe('vaccineTaken');
    expect(go({ inDuoCircle: true, uiBlocked: true })).toBeNull(); // B4: 開いていれば待つ
    expect(go({ inDuoCircle: true })).toBe('startArrivalTalk');
    expect(ph).toBe('talk');
    expect(go({ talkEnded: 'arrival' })).toBe('startEnclosure');
    expect(go({ enclosureSpawnedAll: false, enclosureAlive: 0 })).toBeNull(); // 出し切る前は終わらない
    expect(go({ enclosureSpawnedAll: true, enclosureAlive: 2 })).toBeNull();
    expect(go({ enclosureSpawnedAll: true, enclosureAlive: 0 })).toBe('enclosureCleared');
    expect(go({ goalDone: true })).toBe('startThanksTalk');
    expect(go({ talkEnded: 'thanks' })).toBe('win');
    expect(ph).toBe('won');
    expect(go({ baseCaptured: true, goalDone: true })).toBeNull();
  });
  it('通常湧きを止めるのは囲いの間だけ', () => {
    expect(loop1HoldsNormalSpawns('enclosure')).toBe(true);
    for (const p of ['base', 'hospital', 'duo', 'talk', 'goal', 'thanks', 'won'] as Loop1Phase[]) expect(loop1HoldsNormalSpawns(p)).toBe(false);
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

describe('出さない物・文言・台詞・チュートリアル', () => {
  it('出さない物の一覧(§3・§7.6 D・§7.7 A4)', () => {
    for (const k of ['castle', 'castleBoss', 'hiddenBoss', 'guardianGhost', 'reaper', 'armory', 'police', 'shrine', 'naturalBounty', 'duoV4', 'redNight', 'welcome', 'gate1', 'gate2', 'patrolSlots', 'mutantHero', 'sceneSpawns']) {
      expect(LOOP1_SUPPRESSED as readonly string[]).toContain(k);
    }
  });
  it('目的と任務報告の文言(§7.6 G)', () => {
    expect(LOOP1_OBJECTIVE_TEXT).toBe('身元不明の民間人2名を救出せよ');
    expect(LOOP1_REPORT_LINES).toEqual([
      '民間人2名を保護した。二人から、PHILL再生医療研究所の位置を聞き出した。',
      '研究所へ向かうには、周辺の大型変異体を排除する必要がある。',
    ]);
  });
  it('賞金首の警告は8人全員にあり、雑談OFFでも出る', () => {
    for (let i = 0; i < 8; i++) {
      expect(NPC_SCENE_VARIANTS.some(v => v.idx === i && v.cat === 'bountyWarning'), `idx${i}`).toBe(true);
      expect(pickNpcLine(i, 'bountyWarning', '')).not.toBe('');
    }
    expect(npcChatterAllowed('bountyWarning', false)).toBe(true);
  });
  it('拠点ページは3枚ガイドの「拠点」ページそのもの(別id=3枚ガイドを既読にしない)', () => {
    const t = getTutorial('loop1-base');
    const slide = STAGE1_GUIDE_SLIDES.find(s => s.title === '拠点')!;
    expect(t?.slides).toEqual([slide]);
    expect(t?.lines).toEqual(slide.lines);
  });
});

import { describe, it, expect } from 'vitest';
import {
  junJoinsRun, junDepartDue, junDepartReady, stepJunWalk, junCastleRoute, junCollapseView, junTransformAtMs,
  junAttentionExtraHoldMs, junVanishAlpha, castleBossFootPoint, isJunEscort, junDepartLeadMs, junCompanionQuiet,
  junFocusOk, worldToScreenYFrac, junRelocatePoint, junCollapseMotion, medicFallShiftPx,
  junNextWaypoint, junReachableGoal, junTouchesRect, JUN_ARRIVE_TOUCH_DIST, type PathRect,
  JUN_DEPART_LEAD_MIN_MS, JUN_DEPART_LEAD_MAX_MS, JUN_DEPART_AFTER_RISE_MS, JUN_COLLAPSE_BEAT_MS, JUN_FALL_MS, JUN_VANISH_MS,
  JUN_HOLD_LONG_CAP_MS, JUN_FOCUS_WAIT_MAX_MS, JUN_COMPANION_QUIET_BEFORE_MS, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT, MEDIC_FALL_SHIFT_PX,
  junFollowsPlayer, junFollowMachine, countsForBaseCapture, junNearOpenBase, junLeftBehindStep, junPseudoBase, JUN_BASE_ID,
  JUN_LEFT_BEHIND_PX, JUN_LEFT_BEHIND_REARM_PX,
  JUN_LIE_MS, JUN_FALL_BOUNCE_MS, junTremble, junSinceLandMs, junSceneLineAt, junCollapseDialogue, JUN_TREMBLE_LINE_AFTER_LAND_MS,
  JUN_FALL_AFTER_LINE1_MS, JUN_TRANSFORM_CUT_AFTER_MS, junCloseDialogue, junCameraZoomAt, JUN_CLOSEUP_ZOOM, JUN_CLOSEUP_IN_MS, JUN_PUSH_IN_MUL, JUN_WINDUP_MUL,
  JUN_WINDUP_MS, JUN_PULL_MS, JUN_PULL_ZOOM, JUN_STAGGER_FORWARD_PX,
} from './junEscort';
import { JUN_ESCORT_INDEX, JUN_NPC_LINES, JUN_SCENE_LINES, pickJunLine, JUN_TRANSFORM_SCENE_LINES, JUN_TREMBLE_LINE_CUT_AFTER, JUN_NO_PORTRAIT } from '../data/junEscortLines';
import { pickNpcLine } from '../data/npcLines';
import { slowLineTypedMs } from './slowLine';
import { escortSceneLine } from '../data/escortSceneLines';
import { ATTENTION_IN_MS, ATTENTION_HOLD_MS } from '../store/gameStore';

const MIN = 7 * 60 * 1000;
const VMAX = 73;

describe('junEscort: ステージ4のジュンの同行(research/JUN_ESCORT.md §1)', () => {
  it('加わるのはステージ4の通常の名簿の出撃だけ(他ステージ・護衛の出ない出撃・洋館再訪は加えない)', () => {
    expect(junJoinsRun({ stageId: 'stage-4', normalRoster: true, revisit: false })).toBe(true);
    for (const id of ['stage-1', 'stage-3', 'stage-5', 'stage-7', 'stage-0', '']) {
      expect(junJoinsRun({ stageId: id, normalRoster: true, revisit: false })).toBe(false);
    }
    expect(junJoinsRun({ stageId: 'stage-4', normalRoster: false, revisit: false })).toBe(false);
    expect(junJoinsRun({ stageId: 'stage-4', normalRoster: true, revisit: true })).toBe(false);
  });
  it('名簿外の印(0..7 にも M0 の随行 100/101 にも重ならない)', () => {
    expect(JUN_ESCORT_INDEX).toBeGreaterThanOrEqual(8);
    expect([100, 101]).not.toContain(JUN_ESCORT_INDEX);
    expect(isJunEscort({ soldierIndex: JUN_ESCORT_INDEX })).toBe(true);
    for (let i = 0; i < 8; i++) expect(isJunEscort({ soldierIndex: i })).toBe(false);
  });
});

describe('junEscort: 台詞(設計書§2の表そのまま・表に無い場面は無言)', () => {
  it('表の文言が既存の場面へ当たる', () => {
    expect(JUN_NPC_LINES.sortie).toEqual(['だ、大丈夫です…戦えます…', '自分の身は、自分で守らなければ…！']);
    expect(JUN_NPC_LINES.surrounded).toEqual(['変異体どもめ…！', '来ないで…来ないでください…！']);
    expect(JUN_NPC_LINES.rescued).toEqual(['不思議と、痛みはないんです']);
    expect(JUN_NPC_LINES.baseNear).toEqual(['医師団はどこに…']);
    expect(JUN_NPC_LINES.baseCaptured).toEqual(['医師団はどこに…']);
    expect(JUN_NPC_LINES.companion).toEqual(['変な感じがする…']);
    expect(JUN_NPC_LINES.neglectFar).toEqual(['待って…置いていかないで…']);
    expect(JUN_SCENE_LINES.revived).toBe('…もう、塞がってます');
    expect(JUN_SCENE_LINES.targeted).toBe('私を…見てる…？');
    expect(JUN_TRANSFORM_SCENE_LINES).toEqual(['あれ…あつい、です', 'い、意識が…', '…見ないで…ください…']);
  });
  it('表に無い場面は空文字(無言)・既存の台帳の引き口からも同じ答え', () => {
    for (const cat of ['pushback', 'npcKill', 'praise', 'opPrep', 'rescueReturned', 'capture', 'retreat']) {
      expect(pickJunLine(cat)).toBe('');
      expect(pickNpcLine(JUN_ESCORT_INDEX, cat, '名簿のフォールバック')).toBe('');
    }
    expect(escortSceneLine(JUN_ESCORT_INDEX, 'downed')).toBe('');
    expect(escortSceneLine(JUN_ESCORT_INDEX, 'revived')).toBe('…もう、塞がってます');
    expect(escortSceneLine(JUN_ESCORT_INDEX, 'targeted')).toBe('私を…見てる…？');
    expect(['だ、大丈夫です…戦えます…', '自分の身は、自分で守らなければ…！']).toContain(pickNpcLine(JUN_ESCORT_INDEX, 'sortie', 'x'));
  });
  it('他の軍人の台詞の引き方は変わらない', () => {
    expect(pickNpcLine(3, 'nonexistent-cat', 'fallback')).toBe('fallback');
    expect(escortSceneLine(7, 'revived')).toBe('触るな。もう立てる');
  });
});

describe('junEscort: 離脱の時刻(城まで歩く時間から逆算)', () => {
  it('城ボスの時刻に城の足元へ着く: 歩く時間がリードに入る(下限40秒・上限120秒)', () => {
    expect(junDepartLeadMs(0, VMAX)).toBe(JUN_DEPART_LEAD_MIN_MS);
    expect(junDepartLeadMs(100_000, VMAX)).toBe(JUN_DEPART_LEAD_MAX_MS);
    const d = 4000; // 約55秒ぶん
    const lead = junDepartLeadMs(d, VMAX);
    expect(lead).toBeGreaterThan((d / VMAX) * 1000); // 歩く時間より前に離れる=間に合う
    expect(lead).toBeLessThan((d / VMAX) * 1000 + 15_000); // 待ちすぎない
    expect(junDepartLeadMs(5000, VMAX)).toBeGreaterThan(junDepartLeadMs(4000, VMAX)); // 遠いほど早く離れる
  });
  const due = (o: Partial<Parameters<typeof junDepartDue>[0]>) => junDepartDue({
    junInSquad: true, castleRouteOk: true, castleSpawned: false, directorTimeMs: 0, castleMinMs: MIN, castleReady: false, leadMs: 60_000, ...o,
  });
  it('城ボスの時刻 − リード から離れる', () => {
    expect(due({ directorTimeMs: MIN - 60_000 - 1 })).toBe(false);
    expect(due({ directorTimeMs: MIN - 60_000 })).toBe(true);
  });
  it('城ボスの条件が先に満ちた(強制出現など)時は時刻に関わらず離脱', () => {
    expect(due({ directorTimeMs: 0, castleReady: true })).toBe(true);
  });
  it('城ボスが出ない経路・出た後・ジュンが隊に居ない時は離脱しない', () => {
    expect(due({ directorTimeMs: MIN, castleRouteOk: false })).toBe(false);
    expect(due({ directorTimeMs: MIN, castleSpawned: true })).toBe(false);
    expect(due({ directorTimeMs: MIN, junInSquad: false })).toBe(false);
  });
  it('道中の「一緒にいる」は離脱の数十秒前から止める(離脱の一言で初めて聞かせる)', () => {
    const lead = 60_000;
    expect(junCompanionQuiet(MIN - lead - JUN_COMPANION_QUIET_BEFORE_MS - 1, MIN, lead)).toBe(false);
    expect(junCompanionQuiet(MIN - lead - JUN_COMPANION_QUIET_BEFORE_MS, MIN, lead)).toBe(true);
    expect(JUN_COMPANION_QUIET_BEFORE_MS).toBeGreaterThanOrEqual(20_000);
  });
  const ready = (o: Partial<Parameters<typeof junDepartReady>[0]>) => junDepartReady({
    downed: false, sinceRiseMs: null, busy: false, kicking: false, focusOk: true, ...o,
  });
  it('倒れていたら起き上がった後(起き上がりの動きが見えてから)に離脱する', () => {
    expect(ready({ downed: true })).toBe(false);
    expect(ready({ sinceRiseMs: 100 })).toBe(false);
    expect(ready({ sinceRiseMs: JUN_DEPART_AFTER_RISE_MS })).toBe(true);
    expect(ready({})).toBe(true);
    expect(ready({ busy: true })).toBe(false);
    expect(ready({ kicking: true })).toBe(false);
    expect(ready({ focusOk: false })).toBe(false);
  });
  it('画面下のぼけの帯では少し待つ(画面外・ピントの帯・待ちすぎなら離れる)', () => {
    expect(junFocusOk({ onScreen: true, screenYFrac: 0.55, waitedMs: 0 })).toBe(true);
    expect(junFocusOk({ onScreen: true, screenYFrac: 0.9, waitedMs: 0 })).toBe(false);
    expect(junFocusOk({ onScreen: true, screenYFrac: 0.9, waitedMs: JUN_FOCUS_WAIT_MAX_MS })).toBe(true);
    expect(junFocusOk({ onScreen: false, screenYFrac: 0.9, waitedMs: 0 })).toBe(true);
    expect(worldToScreenYFrac(500, 0, 1000, 1)).toBeCloseTo(0.5);
    expect(worldToScreenYFrac(1000, 0, 1000, 0.5)).toBeCloseTo(0.75); // 引きでは中心へ寄る
  });
});

describe('junEscort: 歩き(慣性つき)', () => {
  it('止まった所から加速して動き出し(瞬間に最高速にならない)、手前で減速して行き過ぎずに止まる', () => {
    let st = { x: 0, y: 0, speed: 0 };
    const first = stepJunWalk({ ...st, targetX: 1000, targetY: 0, dtSec: 1 / 60, vmax: VMAX });
    expect(first.speed).toBeGreaterThan(0);
    expect(first.speed).toBeLessThan(VMAX * 0.1);
    let maxSpeed = 0, frames = 0, arrived = false;
    const speeds: number[] = [];
    while (!arrived && frames < 60 * 60) {
      const w = stepJunWalk({ ...st, targetX: 1000, targetY: 0, dtSec: 1 / 60, vmax: VMAX });
      st = { x: w.x, y: w.y, speed: w.speed };
      speeds.push(w.speed);
      maxSpeed = Math.max(maxSpeed, w.speed);
      expect(w.x).toBeLessThanOrEqual(1000);
      arrived = w.arrived;
      frames++;
    }
    expect(arrived).toBe(true);
    expect(st.x).toBe(1000);
    expect(maxSpeed).toBeCloseTo(VMAX, 5);
    expect(speeds[speeds.length - 2]).toBeLessThan(VMAX * 0.35); // 着く直前は遅い(瞬間停止ではない)
  });
  it('城ボスがいつも出る場所の足元=当たり箱(城の座標が左上)の下辺の中央', () => {
    expect(castleBossFootPoint({ x: 100, y: 200 }, 60, 60)).toEqual({ x: 130, y: 260 });
  });
});

describe('junEscort: 城ボスの出し方(置き直しは画面に見えている所では起きない)', () => {
  const route = (o: Partial<Parameters<typeof junCastleRoute>[0]>) => junCastleRoute({
    junInSquad: false, phase: null, junOnScreen: false, targetOnScreen: false, relocated: false, holdMs: 0, attentionBusy: false, ...o,
  });
  it('ジュンが居ない(隊にも城にも)=従来どおり', () => {
    expect(route({})).toBe('legacy');
  });
  it('ジュンが隊に居る(まだ離れていない=倒れている等)=待つ', () => {
    expect(route({ junInSquad: true })).toBe('hold');
  });
  it('城で待っている=変身へ', () => {
    expect(route({ phase: 'waiting', targetOnScreen: true })).toBe('collapse');
  });
  it('見えたまま歩いている途中=待つ(置き直さない)', () => {
    expect(route({ phase: 'leaving', junOnScreen: true, targetOnScreen: true })).toBe('hold');
    expect(route({ phase: 'leaving', junOnScreen: true, targetOnScreen: false })).toBe('hold');
  });
  it('ジュンが画面外・城の足元も画面外=足元へ置いて変身(どちらも見えない)', () => {
    expect(route({ phase: 'leaving', junOnScreen: false, targetOnScreen: false })).toBe('collapse');
  });
  it('ジュンが画面外・城の足元が画面内=画面外の点へ1回置き直し、そこから歩いて入って来るのを待つ', () => {
    expect(route({ phase: 'leaving', junOnScreen: false, targetOnScreen: true })).toBe('relocate');
    expect(route({ phase: 'leaving', junOnScreen: false, targetOnScreen: true, relocated: true })).toBe('hold');
  });
  it('画面に映っている間は、いくら待っても置き直しも強制の変身もしない', () => {
    for (const holdMs of [0, 20_000, JUN_HOLD_LONG_CAP_MS, JUN_HOLD_LONG_CAP_MS * 5]) {
      for (const relocated of [false, true]) for (const targetOnScreen of [false, true]) {
        expect(route({ phase: 'leaving', junOnScreen: true, targetOnScreen, relocated, holdMs })).toBe('hold');
      }
    }
  });
  it('全体の上限: 置き直した後も着かないまま長く待ったら、画面外に居る瞬間にもう一度置き直す', () => {
    expect(route({ phase: 'leaving', junOnScreen: false, targetOnScreen: true, relocated: true, holdMs: JUN_HOLD_LONG_CAP_MS - 1 })).toBe('hold');
    expect(route({ phase: 'leaving', junOnScreen: false, targetOnScreen: true, relocated: true, holdMs: JUN_HOLD_LONG_CAP_MS })).toBe('relocate');
    expect(JUN_HOLD_LONG_CAP_MS).toBeGreaterThanOrEqual(45_000);
  });
  it('別のアテンション中は待つ・変身の最中は二重に出さない', () => {
    expect(route({ phase: 'waiting', attentionBusy: true })).toBe('hold');
    expect(route({ phase: 'collapsing' })).toBe('busy');
    expect(route({ phase: 'vanishing' })).toBe('busy');
  });
  it('置き直し先は画面の外で、城へ向かう道の上のいちばん城寄りの点', () => {
    // 画面=x 0..400(余白込み)。城の足元(300,0)は画面内、ジュンは(-600,0)。
    const visible = (x: number) => x >= 0 && x <= 400;
    const p = junRelocatePoint({ x: -600, y: 0 }, { x: 300, y: 0 }, visible);
    expect(visible(p.x)).toBe(false);
    expect(p.x).toBeLessThan(0);
    expect(p.x).toBeGreaterThan(-20); // 画面の縁のすぐ外(城寄り)
    expect(p.y).toBe(0);
    // 城の足元が画面外なら足元そのもの
    expect(junRelocatePoint({ x: -600, y: 0 }, { x: 900, y: 0 }, visible)).toEqual({ x: 900, y: 0 });
    // 道が全部画面内なら、ジュンの後ろへ延ばした先(やはり画面外)
    const q = junRelocatePoint({ x: 100, y: 0 }, { x: 300, y: 0 }, visible);
    expect(visible(q.x)).toBe(false);
  });
});

describe('junEscort: 倒れる→変身の時間割(時間停止の中)', () => {
  it('変身の瞬間まで素のアテンション(=時間停止・カメラの寄り)が続く', () => {
    const extra = junAttentionExtraHoldMs(ATTENTION_IN_MS, ATTENTION_HOLD_MS);
    expect(ATTENTION_IN_MS + ATTENTION_HOLD_MS + extra).toBeGreaterThan(junTransformAtMs(ATTENTION_IN_MS));
  });
  it('寄り切って一拍おいてから倒れ始め、3コマを順に・ゆっくり(1.5〜2秒)倒れる', () => {
    expect(JUN_FALL_MS).toBeGreaterThanOrEqual(1500);
    expect(JUN_FALL_MS).toBeLessThanOrEqual(2000);
    expect(junCollapseView(ATTENTION_IN_MS + JUN_COLLAPSE_BEAT_MS - 1, ATTENTION_IN_MS).frame).toBe(-1);
    let prev = -1;
    const seen = new Set<number>();
    for (let t = 0; t <= JUN_FALL_MS; t += 20) {
      const v = junCollapseView(ATTENTION_IN_MS + JUN_COLLAPSE_BEAT_MS + t, ATTENTION_IN_MS);
      expect(v.frame).toBeGreaterThanOrEqual(prev);
      prev = v.frame;
      seen.add(v.frame);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
  it('倒れ始めは遅く、地面へ向けて速くなる(重力=慣性)', () => {
    const k = (ms: number) => junCollapseView(ATTENTION_IN_MS + JUN_COLLAPSE_BEAT_MS + ms, ATTENTION_IN_MS).fallK;
    expect(k(JUN_FALL_MS) - k(JUN_FALL_MS * 0.8)).toBeGreaterThan((k(JUN_FALL_MS * 0.2) - k(0)) * 2);
  });
  it('倒れ切ってから変身(倒れ切る前に変身しない)', () => {
    const at = junCollapseView(junTransformAtMs(ATTENTION_IN_MS), ATTENTION_IN_MS);
    expect(at.landed).toBe(true);
    expect(at.transformDue).toBe(true);
    expect(junCollapseView(junTransformAtMs(ATTENTION_IN_MS) - 1, ATTENTION_IN_MS).transformDue).toBe(false);
  });
  it('消えていく体はフェード(パッと消えない)', () => {
    expect(junVanishAlpha(0)).toBe(1);
    expect(junVanishAlpha(JUN_VANISH_MS / 2)).toBeGreaterThan(0);
    expect(junVanishAlpha(JUN_VANISH_MS / 2)).toBeLessThan(1);
    expect(junVanishAlpha(JUN_VANISH_MS)).toBe(0);
  });
  it('倒れの位置の動き: かがみの間に沈み・ふらつき、着地で跳ねて止まる(量は数px)', () => {
    const at0 = (ms: number) => junCollapseMotion(ATTENTION_IN_MS + JUN_COLLAPSE_BEAT_MS + ms, ATTENTION_IN_MS);
    // 立ったままのよろめきで前へ出た分(JUN_STAGGER_FORWARD_PX)は倒れの間も残る=ここではそれを除いて見る
    const at = (ms: number) => { const m = at0(ms); return { forward: m.forward - JUN_STAGGER_FORWARD_PX, down: m.down }; };
    expect(junCollapseMotion(0, ATTENTION_IN_MS)).toEqual({ forward: 0, down: 0 });
    expect(at(0).forward).toBeCloseTo(0);
    let maxDown = 0, sawL = false, sawR = false;
    for (let t = 0; t < JUN_FALL_MS * Math.sqrt(JUN_FALL_FRAME1_AT); t += 10) {
      const m = at(t);
      maxDown = Math.max(maxDown, m.down);
      if (m.forward > 0.3) sawR = true;
      if (m.forward < -0.3) sawL = true;
    }
    expect(maxDown).toBeGreaterThan(1);
    expect(maxDown).toBeLessThanOrEqual(3.01);
    expect(sawL && sawR).toBe(true); // 左右に一度ふらつく
    expect(at(JUN_FALL_MS + 80).down).toBeLessThan(0); // 着地で跳ねる(上へ)
    expect(at(JUN_FALL_MS + 400).forward).toBeCloseTo(0); // 止まる
    expect(at(JUN_FALL_MS + 400).down).toBe(0);
  });
  it('倒れの絵の足元合わせは連続(コマの切り替えで段差が無い)', () => {
    expect(medicFallShiftPx(0, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT)).toBe(MEDIC_FALL_SHIFT_PX[0]);
    expect(medicFallShiftPx(JUN_FALL_FRAME1_AT, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT)).toBeCloseTo(MEDIC_FALL_SHIFT_PX[1]);
    expect(medicFallShiftPx(1, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT)).toBe(MEDIC_FALL_SHIFT_PX[2]);
    let prev = medicFallShiftPx(0, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT);
    for (let k = 0.01; k <= 1; k += 0.01) {
      const v = medicFallShiftPx(k, JUN_FALL_FRAME1_AT, JUN_FALL_FRAME2_AT);
      expect(v - prev).toBeLessThan(1); // 1%進むごとに1px未満=跳ばない
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('junEscort: 道筋(城の当たり箱を回り込んで足元へ着く)', () => {
  // 城=footRect(0, 38, 168, 50)(gameStore の CASTLE_COLLISION_W/H・城の足元=castle.y+38)。行き先=城ボスの足元(30, 60)。
  const castle: PathRect = { x: -84, y: -12, width: 168, height: 50 };
  const target = { x: 30, y: 60 };
  // 体の当たり箱と城の箱を押し戻す(gameStore の resolveShieldWalls 相当の最小版)。
  const push = (x: number, y: number): { x: number; y: number } => {
    const bx0 = x - 14, bx1 = x + 14, by0 = y - 28, by1 = y;
    const r = castle;
    if (bx1 <= r.x || bx0 >= r.x + r.width || by1 <= r.y || by0 >= r.y + r.height) return { x, y };
    const outs = [
      { x: r.x - 14, y, d: bx1 - r.x }, { x: r.x + r.width + 14, y, d: r.x + r.width - bx0 },
      { x, y: r.y, d: by1 - r.y }, { x, y: r.y + r.height + 28, d: r.y + r.height - by0 },
    ].sort((a, b) => a.d - b.d);
    return { x: outs[0].x, y: outs[0].y };
  };
  const walk = (start: { x: number; y: number }) => {
    const goal = junReachableGoal(target, [castle]);
    let p = { ...start, speed: 0 };
    for (let f = 0; f < 60 * 120; f++) {
      const wp = junNextWaypoint(p, goal, [castle]);
      const w = stepJunWalk({ x: p.x, y: p.y, speed: p.speed, targetX: wp.x, targetY: wp.y, dtSec: 1 / 60, vmax: VMAX, remainingPx: wp.remaining });
      const q = push(w.x, w.y);
      p = { x: q.x, y: q.y, speed: w.speed };
      const near = Math.hypot(p.x - target.x, p.y - target.y);
      if (near <= 2 || (near <= JUN_ARRIVE_TOUCH_DIST && junTouchesRect(p, castle))) return { arrived: true, frames: f, p };
    }
    return { arrived: false, frames: -1, p };
  };
  it('行き先が城の箱(体ぶん)の中なら、すぐ下の着ける足元へ出す', () => {
    const g = junReachableGoal(target, [castle]);
    expect(g.x).toBe(30);
    expect(g.y).toBeGreaterThan(60);
    expect(g.y).toBeLessThanOrEqual(68);
  });
  for (const [name, start] of [['上', { x: 30, y: -600 }], ['左', { x: -700, y: 10 }], ['右', { x: 700, y: 10 }], ['下', { x: 30, y: 700 }], ['左上', { x: -500, y: -400 }]] as const) {
    it(`城の${name}から来ても回り込んで足元へ着く`, () => {
      const r = walk(start);
      expect(r.arrived).toBe(true);
      // 道のりは直線の数倍以内(大回りしすぎない)
      expect(r.frames / 60).toBeLessThan((Math.hypot(start.x - target.x, start.y - target.y) * 2.2) / VMAX + 5);
    });
  }
  it('直線が箱を横切らない時は寄り道しない', () => {
    const wp = junNextWaypoint({ x: 30, y: 600 }, { x: 30, y: 67 }, [castle]);
    expect(wp.detour).toBe(false);
  });
  it('上から来た時の最初の経由点は箱の外側の角(箱の中を通らない)', () => {
    const wp = junNextWaypoint({ x: 30, y: -600 }, { x: 30, y: 67 }, [castle]);
    expect(wp.detour).toBe(true);
    expect(wp.x < castle.x - 14 || wp.x > castle.x + castle.width + 14).toBe(true);
  });
  it('経由点では止まらない(道のりが残る間は速さを保つ)', () => {
    const w = stepJunWalk({ x: 0, y: 0, speed: VMAX, targetX: 1, targetY: 0, dtSec: 1 / 60, vmax: VMAX, remainingPx: 500 });
    expect(w.speed).toBeGreaterThan(VMAX * 0.9);
    expect(w.arrived).toBe(false);
  });
});

describe('junEscort: 最初からプレイヤーについて歩く(拠点解放には行かない)', () => {
  it('ジュンだけが、ウェルカムの輪の外ではいつもついてくる(輪の間は出撃地点で待つ)', () => {
    expect(junFollowsPlayer({ isJun: true, welcomeHold: false })).toBe(true);
    expect(junFollowsPlayer({ isJun: true, welcomeHold: true })).toBe(false);
    expect(junFollowsPlayer({ isJun: false, welcomeHold: false })).toBe(false);
    expect(junFollowMachine()).toEqual({ state: 'follow', pauseUntil: undefined, started: false });
  });
  it('拠点の滞在・解放に数えるのは隊の4人だけ(ジュンは数えない)', () => {
    expect(countsForBaseCapture({ soldierIndex: JUN_ESCORT_INDEX })).toBe(false);
    for (let i = 0; i < 8; i++) expect(countsForBaseCapture({ soldierIndex: i })).toBe(true);
  });
  it('ジュンの拠点の名札はどの拠点とも一致しない・仮の拠点は自分の足元で解放済み扱い', () => {
    for (let i = 0; i < 4; i++) expect(JUN_BASE_ID).not.toBe(`base-${i}`);
    expect(junPseudoBase({ x: 12, y: -40 })).toEqual({ id: JUN_BASE_ID, x: 12, y: -40, status: 'captured' });
  });
  it('「拠点の近く」は、いちばん近い未解放の拠点(範囲内)。解放済み・範囲外は対象外', () => {
    const bases = [
      { id: 'base-0', x: 1000, y: 0, status: 'open' },
      { id: 'base-1', x: 0, y: 500, status: 'captured' },
      { id: 'base-2', x: 0, y: -400, status: 'open' },
    ];
    expect(junNearOpenBase({ x: 0, y: 0 }, bases, 600)?.id).toBe('base-2');
    expect(junNearOpenBase({ x: 0, y: 400 }, bases, 600)).toBeNull(); // 近いのは解放済み/他は遠い
    expect(junNearOpenBase({ x: 900, y: 0 }, bases, 600)?.id).toBe('base-0');
  });
  it('「置いていかれそう」は離された瞬間に1回だけ。追いつくまで次は出ない(ヒステリシス)', () => {
    let far = false, spoke = 0;
    const seq = [50, 200, JUN_LEFT_BEHIND_PX + 1, JUN_LEFT_BEHIND_PX + 200, JUN_LEFT_BEHIND_PX - 10, JUN_LEFT_BEHIND_REARM_PX + 5, JUN_LEFT_BEHIND_PX + 5];
    const out: boolean[] = [];
    for (const d of seq) { const r = junLeftBehindStep(d, far); far = r.far; out.push(r.speakNow); if (r.speakNow) spoke++; }
    expect(out).toEqual([false, false, true, false, false, false, false]);
    expect(spoke).toBe(1);
    // 追いついてから(REARM 以下)また離されたら、もう一度
    let r = junLeftBehindStep(JUN_LEFT_BEHIND_REARM_PX - 1, far); far = r.far;
    expect(far).toBe(false);
    r = junLeftBehindStep(JUN_LEFT_BEHIND_PX + 1, far);
    expect(r.speakNow).toBe(true);
    expect(JUN_LEFT_BEHIND_REARM_PX).toBeLessThan(JUN_LEFT_BEHIND_PX);
  });
});

describe('倒れる時の通信(社長指示2026-10-20)', () => {
  it('「い、意識が…」をその場で出し、待ち行列のジュンの行だけ捨てる', async () => {
    const { junCollapseDialogue } = await import('./junEscort');
    const r = junCollapseDialogue(1000, [{ name: 'ジュン', text: 'x' }, { name: '武蔵', text: 'y' }], 2800, 1200);
    expect(r.npcDialogue).toEqual({ name: 'ジュン', text: 'い、意識が…', until: 1000 + 2800 + 1200, slow: true, portrait: JUN_NO_PORTRAIT });
    expect(r.npcDialogueQueue).toEqual([{ name: '武蔵', text: 'y' }]);
  });
});

describe('変異の場面のカメラと通信(research/JUN_ESCORT.md §5)', () => {
  const IN = ATTENTION_IN_MS;
  const typed = (t: string) => slowLineTypedMs(Array.from(t));
  const fallAt = IN + JUN_COLLAPSE_BEAT_MS;
  const landAt = fallAt + JUN_FALL_MS;
  it('行の時刻: 1行目を送り終わって200ms後に倒れ始め・3行目は着地の跳ねの直後・「…見ないで…」を送り終わって130ms後に変身で断ち切る', () => {
    // 1行目はアテンション開始と同時に出る。文言を変えたら JUN_COLLAPSE_BEAT_MS を直す(このテストが落ちる)。
    expect(JUN_FALL_AFTER_LINE1_MS).toBe(200);
    expect(typed(JUN_TRANSFORM_SCENE_LINES[0]) + JUN_FALL_AFTER_LINE1_MS).toBe(fallAt);
    expect(fallAt).toBeGreaterThanOrEqual(JUN_CLOSEUP_IN_MS); // 寄り切ってから倒れる
    expect(typed(JUN_TRANSFORM_SCENE_LINES[1])).toBeLessThan(JUN_FALL_MS); // 2行目は倒れている間に送り切る
    expect(JUN_TREMBLE_LINE_AFTER_LAND_MS).toBe(JUN_FALL_BOUNCE_MS);
    // 3行目は最後まで言わせない: 頭の「…見ないで…」を送り終わった少し後=「ください…」の途中で変身
    expect(JUN_TRANSFORM_SCENE_LINES[2].startsWith(JUN_TREMBLE_LINE_CUT_AFTER)).toBe(true);
    expect(JUN_LIE_MS).toBe(JUN_TREMBLE_LINE_AFTER_LAND_MS + typed(JUN_TREMBLE_LINE_CUT_AFTER) + JUN_TRANSFORM_CUT_AFTER_MS);
    const cutAt = JUN_LIE_MS - JUN_TREMBLE_LINE_AFTER_LAND_MS; // 3行目が出てから変身まで
    expect(cutAt).toBeLessThan(typed(JUN_TRANSFORM_SCENE_LINES[2]));
    expect(cutAt).toBeGreaterThan(typed(JUN_TREMBLE_LINE_CUT_AFTER));
    // 拍を揃えない(段の後の間が同じ値の連打にならない)
    expect(JUN_TRANSFORM_CUT_AFTER_MS).not.toBe(JUN_FALL_AFTER_LINE1_MS);
    expect(junTransformAtMs(IN)).toBe(IN + JUN_COLLAPSE_BEAT_MS + JUN_FALL_MS + JUN_LIE_MS);
    expect(junSinceLandMs(junTransformAtMs(IN), IN)).toBe(JUN_LIE_MS);
    expect(JUN_FALL_MS).toBe(1800);
  });
  it('通信の段: 寄り始め→倒れ始め→着地の跳ねの直後(段は戻らない)', () => {
    expect(junSceneLineAt(0, IN)).toBe(0);
    expect(junSceneLineAt(fallAt - 1, IN)).toBe(0);
    expect(junSceneLineAt(fallAt, IN)).toBe(1);
    expect(junCollapseView(fallAt, IN).frame).toBe(0); // 倒れ始め=倒れの0コマ目へ入る瞬間
    expect(junSceneLineAt(landAt + JUN_TREMBLE_LINE_AFTER_LAND_MS - 1, IN)).toBe(1);
    expect(junSceneLineAt(landAt + JUN_TREMBLE_LINE_AFTER_LAND_MS, IN)).toBe(2);
    let prev = 0;
    for (let t = 0; t <= junTransformAtMs(IN) + 500; t += 10) { const l = junSceneLineAt(t, IN); expect(l).toBeGreaterThanOrEqual(prev); prev = l; }
  });
  it('各段の行は、その場で差し替え・ジュンの待ち行列は捨てる', () => {
    for (const text of JUN_TRANSFORM_SCENE_LINES) {
      const r = junCollapseDialogue(500, [{ name: 'ジュン', text: 'x' }, { name: '武蔵', text: 'y' }], 2800, 1200, text);
      expect(r.npcDialogue).toEqual({ name: 'ジュン', text, until: 500 + 2800 + 1200, slow: true, portrait: JUN_NO_PORTRAIT });
      expect(r.npcDialogueQueue).toEqual([{ name: '武蔵', text: 'y' }]);
    }
  });
  it('変身の瞬間に通信の箱を閉じる(ジュンの行だけ・ほかの人の行は残す)', () => {
    const q = [{ name: 'ジュン', text: 'x' }, { name: '武蔵', text: 'y' }];
    expect(junCloseDialogue({ name: 'ジュン', text: 'a' }, q)).toEqual({ npcDialogue: null, npcDialogueQueue: [{ name: '武蔵', text: 'y' }] });
    expect(junCloseDialogue({ name: '武蔵', text: 'b' }, q).npcDialogue).toEqual({ name: '武蔵', text: 'b' });
    expect(junCloseDialogue(null, []).npcDialogue).toBeNull();
  });
  it('痙攣: 0から始まる・横は4px以下・縦は1px以下・1フレームで2px以下・ビクッは強くなり2回目は逆向き・最後の山が変身の瞬間', () => {
    for (let t = -500; t <= JUN_FALL_BOUNCE_MS; t += 5) expect(junTremble(t, JUN_LIE_MS)).toEqual({ x: 0, y: 0 });
    let prev = { x: 0, y: 0 };
    const jerks: number[] = []; let cur = 0; let still = 0; let sawShiver = false;
    for (let t = 0; t <= JUN_LIE_MS + 400; t += 16) {
      const v = junTremble(t, JUN_LIE_MS);
      expect(Number.isInteger(v.x) && Number.isInteger(v.y)).toBe(true);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(4);
      expect(v.y).toBeGreaterThanOrEqual(-1);
      expect(v.y).toBeLessThanOrEqual(0);
      expect(Math.abs(v.x - prev.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(v.y - prev.y)).toBeLessThanOrEqual(1);
      if (v.y === 0 && v.x !== 0) sawShiver = true;
      // ビクッ(縦が出ている間)の横の頂点を符号つきで拾う
      if (v.y !== 0) { if (Math.abs(v.x) > Math.abs(cur)) cur = v.x; still = 0; } else if (cur !== 0 && ++still > 3) { jerks.push(cur); cur = 0; }
      prev = v;
    }
    if (cur !== 0) jerks.push(cur);
    expect(sawShiver).toBe(true);
    expect(jerks.length).toBe(3);
    for (let i = 1; i < jerks.length; i++) expect(Math.abs(jerks[i])).toBeGreaterThan(Math.abs(jerks[i - 1]));
    expect(Math.sign(jerks[1])).toBe(-Math.sign(jerks[0])); // 2回目は逆向き
    expect(Math.abs(jerks[2])).toBe(4);
    // 最後の山=変身の瞬間(f=1)
    expect(junTremble(JUN_LIE_MS, JUN_LIE_MS)).toEqual({ x: 4, y: -1 });
    // 跳ね上がりは速く、戻りは遅い(頂点の前後で、半分の高さまでの時間)
    const half = (dir: 1 | -1) => { let t = JUN_LIE_MS; while (Math.abs(junTremble(t, JUN_LIE_MS).x) >= 2) t += dir; return Math.abs(t - JUN_LIE_MS); };
    expect(half(1)).toBeGreaterThan(half(-1) * 2);
    expect(junTremble(JUN_LIE_MS + 400, JUN_LIE_MS)).toEqual({ x: 0, y: 0 }); // 体が消えるまでに収まる
    expect(junTremble(1234, JUN_LIE_MS)).toEqual(junTremble(1234, JUN_LIE_MS)); // 乱数なし
  });
  it('よろめき: 寄り切りの直後から・不揃いな左右2回(戻り切らない)→最後に半歩前へ・倒れ始めで跳ばない', () => {
    const m = (ms: number) => junCollapseMotion(ms, IN).forward;
    expect(m(JUN_CLOSEUP_IN_MS)).toBe(0);
    expect(m(JUN_CLOSEUP_IN_MS + 30)).toBeGreaterThan(0); // 寄り切りの直後から動く
    let prev = 0; let turns = 0; let dir = 0; let minV = 0;
    for (let t = JUN_CLOSEUP_IN_MS; t <= fallAt + 100; t += 16) {
      const f = m(t);
      expect(Math.abs(f - prev)).toBeLessThan(0.6); // 加減速つき=跳ばない
      const d = Math.sign(f - prev);
      if (d !== 0 && dir !== 0 && d !== dir) turns++;
      if (d !== 0) dir = d;
      minV = Math.min(minV, f);
      prev = f;
    }
    expect(turns).toBeGreaterThanOrEqual(2); // 片側→逆側へ振れてから前へ
    // 1回目の揺れは戻り切らずに一度止まる(中ほどで正の側に残る)
    const u = (k: number) => JUN_CLOSEUP_IN_MS + (fallAt - JUN_CLOSEUP_IN_MS) * k;
    expect(m(u(0.33))).toBeGreaterThan(0.3);
    expect(Math.abs(m(u(0.33) + 16) - m(u(0.33)))).toBeLessThan(0.1);
    expect(minV).toBeLessThan(-0.5); // 逆側へも崩れる
    expect(m(fallAt - 1)).toBeCloseTo(JUN_STAGGER_FORWARD_PX, 1);
    expect(m(fallAt)).toBeCloseTo(JUN_STAGGER_FORWARD_PX, 1);
  });
  it('カメラ: 等倍から寄り(約700ms)→押し込み→溜め→一気に引く(約400ms)・つなぎ目で跳ばない', () => {
    const T = junTransformAtMs(IN);
    const c = (ms: number) => junCameraZoomAt(ms, 'collapse', IN);
    const p = (ms: number) => junCameraZoomAt(ms, 'transform', IN);
    expect(c(0)).toEqual({ mul: 1, cancel: 0 });
    expect(c(JUN_CLOSEUP_IN_MS).mul).toBeCloseTo(JUN_CLOSEUP_ZOOM);
    expect(c(JUN_CLOSEUP_IN_MS).cancel).toBe(1);
    expect(c(T - JUN_WINDUP_MS).mul).toBeCloseTo(JUN_CLOSEUP_ZOOM * JUN_PUSH_IN_MUL);
    const peak = JUN_CLOSEUP_ZOOM * JUN_PUSH_IN_MUL * JUN_WINDUP_MUL;
    expect(c(T).mul).toBeCloseTo(peak);
    expect(c(T + 50).mul).toBeCloseTo(peak); // 変身が1フレーム遅れても溜めの頂点で待つ
    expect(p(0).mul).toBeCloseTo(peak);
    expect(p(0).cancel).toBe(1);
    expect(p(JUN_PULL_MS).mul).toBeCloseTo(JUN_PULL_ZOOM);
    expect(p(JUN_PULL_MS).cancel).toBeCloseTo(0);
    // 加速→減速: 出だしの1フレームは遅い(指数の近づきではない)
    expect(c(16).mul - 1).toBeLessThan((JUN_CLOSEUP_ZOOM - 1) * 0.01);
    expect(peak - p(16).mul).toBeLessThan((peak - JUN_PULL_ZOOM) * 0.1);
    // 連続(1msごとに跳ばない)・押し込みの間は単調に寄る
    let prev = c(0).mul;
    for (let t = 1; t <= T + 20; t++) { const z = c(t).mul; expect(Math.abs(z - prev)).toBeLessThan(0.01); if (t > JUN_CLOSEUP_IN_MS) expect(z).toBeGreaterThanOrEqual(prev - 1e-9); prev = z; }
    prev = p(0).mul;
    for (let t = 1; t <= JUN_PULL_MS + 20; t++) { const z = p(t).mul; expect(Math.abs(z - prev)).toBeLessThan(0.03); expect(z).toBeLessThanOrEqual(prev + 1e-9); prev = z; }
    // 引きの前半に縮みが寄る
    expect(peak - p(JUN_PULL_MS / 2).mul).toBeGreaterThan((peak - JUN_PULL_ZOOM) * 0.5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  GLEN_ROAR_LINE, isGlenBossSpawnReady, shouldPlayGlenTransform, glenTransformBossBox, glenTransformExtraHoldMs,
  glenTransformPose, glenTransformStageAt, GLEN_TRANSFORM_EVENTS, glenTransformDueEvents, glenCloseRoar, GLEN_HUMAN_ART,
  GLEN_TF_APPEAR_MS, GLEN_TF_SUFFER_AT_MS, GLEN_TF_BURST_AT_MS, GLEN_TF_VANISH_MS, GLEN_TF_AFTER_BURST_MS, GLEN_HUMAN_TARGET_REF_H,
  GLEN_TF_HUSH_AT_MS, GLEN_TF_SILENT_BEFORE_BURST_MS,
} from './glenIntro';

describe('ステージ7の戦闘前会話', () => {
  it('初回は咆哮の表示が終わるまでボスを出さない', () => {
    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: false,
      currentText: null,
      roarPending: true,
    })).toBe(false);

    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: true,
      currentText: GLEN_ROAR_LINE,
      roarPending: false,
    })).toBe(false);

    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: true,
      currentText: null,
      roarPending: false,
    })).toBe(true);
  });

  it('既読後は会話を省略してボスを出せる', () => {
    expect(isGlenBossSpawnReady({
      introSkipped: true,
      roarQueued: false,
      roarShown: false,
      currentText: null,
      roarPending: false,
    })).toBe(true);
  });
});

describe('ステージ7 グレンの変身の場面(research/GLEN_TRANSFORM.md §2)', () => {
  const base = { isM7: true, introSkipped: false, cineSuppress: false, forceGateboss: false, noSpawn: false, practiceWantsCastleBoss: false };

  it('出す条件は今のボス出現と同じ組み合わせ(既読・cine・ゲート2練習・nospawn では出さない)', () => {
    expect(shouldPlayGlenTransform(base)).toBe(true);
    expect(shouldPlayGlenTransform({ ...base, isM7: false })).toBe(false);
    expect(shouldPlayGlenTransform({ ...base, introSkipped: true })).toBe(false);
    expect(shouldPlayGlenTransform({ ...base, cineSuppress: true })).toBe(false);
    expect(shouldPlayGlenTransform({ ...base, forceGateboss: true })).toBe(false);
    expect(shouldPlayGlenTransform({ ...base, noSpawn: true })).toBe(false);
    expect(shouldPlayGlenTransform({ ...base, noSpawn: true, practiceWantsCastleBoss: true })).toBe(true);
  });

  it('箱は今の出現と同じ位置(2倍で中心を保つ)・行ける帯へ収め、足元=箱の下辺の中央', () => {
    const id = (x: number, y: number) => ({ x, y });
    const r = glenTransformBossBox(100, 50, 380, 60, 60, id);
    // 今の出現: spawnEnemyAt(scx, scy)=左上(100, -330) の 60×60 → 2倍で左上を 30 ずつ戻す。
    expect(r.box).toEqual({ x: 70, y: -360, width: 120, height: 120 });
    expect(r.footX).toBe(130);
    expect(r.footY).toBe(-240);
    // 帯で寄せられたら、足元も同じだけ動く(ボスの箱と人間のグレンの足元が離れない)。
    const r2 = glenTransformBossBox(100, 50, 380, 60, 60, (x, y) => ({ x: x + 5, y: Math.max(-200, y) }));
    expect(r2.box.x).toBe(75);
    expect(r2.box.y).toBe(-200);
    expect(r2.footY).toBe(r2.box.y + r2.box.height);
    expect(r2.footX).toBe(r2.box.x + r2.box.width / 2);
  });

  it('寄りは弾けてから少し見せるまで保つ(in+hold+延長 = 弾け+余韻)', () => {
    expect(360 + 1900 + glenTransformExtraHoldMs(360, 1900)).toBe(GLEN_TF_BURST_AT_MS + GLEN_TF_AFTER_BURST_MS);
    expect(glenTransformExtraHoldMs(360, 99999)).toBe(0);
  });

  it('段取り: 立ち姿で現れ → ビクッ → 深い息 → 1.3秒で苦しむ絵 → 4段 → 溜め → 3.4秒で弾けて 120ms で消える', () => {
    expect(glenTransformPose(0).frame).toBe('stand');
    expect(glenTransformPose(0).alpha).toBe(0);
    expect(glenTransformPose(GLEN_TF_APPEAR_MS).alpha).toBe(1);
    expect(glenTransformPose(GLEN_TF_SUFFER_AT_MS - 1).frame).toBe('stand');
    expect(glenTransformPose(GLEN_TF_SUFFER_AT_MS).frame).toBe('suffer');
    expect([1300, 1700, 2100, 2500, 2900].map(glenTransformStageAt)).toEqual([1, 2, 3, 4, 5]);
    expect(glenTransformStageAt(1299)).toBe(0);
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS).alpha).toBe(1);
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS + GLEN_TF_VANISH_MS / 2).alpha).toBeGreaterThan(0.5); // ease-in(初めはゆっくり)
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS + GLEN_TF_VANISH_MS).frame).toBeNull();
    // 弾けは 3.2〜3.5秒。カメラの寄り(in=360ms)が止まってから立ち姿を 0.8〜1.0秒見せる。
    expect(GLEN_TF_BURST_AT_MS).toBeGreaterThanOrEqual(3200);
    expect(GLEN_TF_BURST_AT_MS).toBeLessThanOrEqual(3500);
    expect(GLEN_TF_SUFFER_AT_MS - 360).toBeGreaterThanOrEqual(800);
    expect(GLEN_TF_SUFFER_AT_MS - 360).toBeLessThanOrEqual(1000);
    // 弾けた後の寄りは 0.8〜1.0秒。
    expect(GLEN_TF_AFTER_BURST_MS).toBeGreaterThanOrEqual(800);
    expect(GLEN_TF_AFTER_BURST_MS).toBeLessThanOrEqual(1000);
  });

  it('咆哮の行への反応: 現れ終わった所で一度ビクッと上へ跳ね、首が横へ引きつる(位置だけ)', () => {
    let up = 0, side = 0;
    for (let t = GLEN_TF_APPEAR_MS; t < GLEN_TF_APPEAR_MS + 300; t++) {
      const p = glenTransformPose(t);
      up = Math.min(up, p.dy); side = Math.max(side, Math.abs(p.dx));
    }
    expect(up).toBeLessThan(-0.03);
    expect(side).toBeGreaterThan(0.02);
    // 跳ねた後は静まる(深い息の前)。
    expect(Math.abs(glenTransformPose(GLEN_TF_APPEAR_MS + 305).dy)).toBeLessThan(0.002);
  });

  it('立ち姿の深い息: 肩が体の高さの4〜5%上がって止まり、苦しむ絵の手前で落ちる', () => {
    let top = 0;
    for (let t = 760; t < GLEN_TF_SUFFER_AT_MS; t++) top = Math.min(top, glenTransformPose(t).dy);
    expect(-top).toBeGreaterThanOrEqual(0.04);
    expect(-top).toBeLessThanOrEqual(0.05);
    // 吸い上げた所で止まる(区間の dy が一定)。
    expect(glenTransformPose(1170).dy).toBeCloseTo(glenTransformPose(1230).dy, 6);
  });

  it('動きは位置だけで、1ms ごとに見て跳ばない(慣性・段の頭でも連続)', () => {
    let prev = glenTransformPose(0);
    let maxDx = 0, maxDy = 0;
    for (let t = 1; t < GLEN_TF_BURST_AT_MS + GLEN_TF_VANISH_MS; t++) {
      const p = glenTransformPose(t);
      maxDx = Math.max(maxDx, Math.abs(p.dx - prev.dx));
      maxDy = Math.max(maxDy, Math.abs(p.dy - prev.dy));
      prev = p;
    }
    // 1ms で体の高さの1%未満(=体高105pxで1px未満)。最速の震え(20Hz・6%)でも 2π·20·0.06/1000 ≈ 0.0075。
    expect(maxDx).toBeLessThan(0.01);
    expect(maxDy).toBeLessThan(0.01);
  });

  it('苦しみは段ごとに強くなる(震えの振れ幅の最大が段を追って増える)・よろめきは段2で右・段3で左・溜めで止まる', () => {
    const peak = (a: number, b: number) => { let m = 0; for (let t = a; t < b; t++) m = Math.max(m, Math.abs(glenTransformPose(t).dx)); return m; };
    const s1 = peak(1300 + 150, 1700);
    const s4 = peak(2500 + 150, 2900);
    expect(s4).toBeGreaterThan(s1 * 2);
    const at = (t: number) => glenTransformPose(t).dx;
    // よろめき(8%・10%)は震え(3%・4.5%)より大きい=頂点付近の向きで分かる。
    expect(at(1700 + 137)).toBeGreaterThan(0.04);
    expect(at(2100 + 137)).toBeLessThan(-0.05);
    // 膝が落ちる: 苦しむ絵へ変わった後に沈み(6%)、段4の頭でもう一段(合計9%)。
    expect(glenTransformPose(1690).dy).toBeCloseTo(0.06, 3);
    expect(glenTransformPose(2850).dy).toBeCloseTo(0.09, 3);
    // 溜め: 震えが止まる(弾ける直前の 0.1 秒は横に動かない)。
    expect(peak(GLEN_TF_HUSH_AT_MS + 90, GLEN_TF_BURST_AT_MS)).toBeLessThan(1e-6);
  });

  it('出来事: 呻きは1回・胸の光は各段の頭で撃ち間隔が詰まる・1つずつ(重ねない)・溜めは光なし・最後に弾け→残り火', () => {
    const growls = GLEN_TRANSFORM_EVENTS.filter(e => e.kind === 'growl');
    expect(growls.map(e => e.at)).toEqual([GLEN_TF_SUFFER_AT_MS]);
    const pulses = GLEN_TRANSFORM_EVENTS.filter(e => e.kind === 'pulse').map(e => e.at);
    for (const head of [1300, 1700, 2100, 2500, 2900]) expect(pulses).toContain(head);
    expect(pulses.every(t => t < GLEN_TF_HUSH_AT_MS)).toBe(true);
    expect(new Set(pulses).size).toBe(pulses.length); // 同じ時刻に重ねない
    const burstIdx = GLEN_TRANSFORM_EVENTS.findIndex(e => e.kind === 'burst');
    expect(GLEN_TRANSFORM_EVENTS[burstIdx]).toEqual({ at: GLEN_TF_BURST_AT_MS, kind: 'burst' });
    expect(GLEN_TRANSFORM_EVENTS.slice(burstIdx + 1).every(e => e.kind === 'ember')).toBe(true);
    for (let i = 1; i < GLEN_TRANSFORM_EVENTS.length; i++) expect(GLEN_TRANSFORM_EVENTS[i].at).toBeGreaterThanOrEqual(GLEN_TRANSFORM_EVENTS[i - 1].at);
    // 光の半径は強glow(44)未満=投影影を落とさない。段1〜2の水準(36以下)。
    for (const e of GLEN_TRANSFORM_EVENTS) if (e.kind === 'pulse') expect(e.radius).toBeLessThanOrEqual(36);
    // 残り火は弾けた後の寄りの中で消え切る。
    for (const e of GLEN_TRANSFORM_EVENTS) if (e.kind === 'ember') expect(e.at + e.durationMs).toBeLessThanOrEqual(GLEN_TF_BURST_AT_MS + GLEN_TF_AFTER_BURST_MS + 500);
  });

  it('鼓動: 光の脈に合わせて鳴り、段が上がるほど速く大きい・弾ける直前の0.3秒は鼓動しか鳴らない', () => {
    const beats = GLEN_TRANSFORM_EVENTS.filter((e): e is Extract<typeof e, { kind: 'beat' }> => e.kind === 'beat');
    const pulseAt = new Set(GLEN_TRANSFORM_EVENTS.filter(e => e.kind === 'pulse').map(e => e.at));
    for (const b of beats) if (b.at !== GLEN_TF_HUSH_AT_MS) expect(pulseAt.has(b.at)).toBe(true);
    const s1 = beats.find(b => b.at === 1300)!, s4 = beats.find(b => b.at === 2500)!;
    expect(s4.rate).toBeGreaterThan(s1.rate);
    expect(s4.gain).toBeGreaterThan(s1.gain);
    const quiet = GLEN_TRANSFORM_EVENTS.filter(e => e.at >= GLEN_TF_BURST_AT_MS - GLEN_TF_SILENT_BEFORE_BURST_MS && e.at < GLEN_TF_BURST_AT_MS);
    expect(quiet.every(e => e.kind === 'beat' || e.kind === 'pulse')).toBe(true);
  });

  it('出来事は1回ずつ撃つ(フレームが飛んでも取りこぼさない・二重に撃たない)', () => {
    const a = glenTransformDueEvents(0, GLEN_TF_SUFFER_AT_MS - 1);
    expect(a.due).toEqual([]);
    const b = glenTransformDueEvents(a.next, 1800);
    expect(b.due.some(e => e.kind === 'growl')).toBe(true);
    const c = glenTransformDueEvents(b.next, 1800);
    expect(c.due).toEqual([]);
    const d = glenTransformDueEvents(c.next, 99999);
    expect(d.due.some(e => e.kind === 'burst')).toBe(true);
    expect(d.next).toBe(GLEN_TRANSFORM_EVENTS.length);
  });

  it('弾けた時は咆哮の行だけ閉じる', () => {
    const r = glenCloseRoar({ name: 'グレン', text: GLEN_ROAR_LINE }, [{ name: 'ミラ', text: 'x' }, { name: 'グレン', text: GLEN_ROAR_LINE }]);
    expect(r.npcDialogue).toBeNull();
    expect(r.npcDialogueQueue).toEqual([{ name: 'ミラ', text: 'x' }]);
    const keep = { name: 'ミラ', text: 'y' };
    expect(glenCloseRoar(keep, []).npcDialogue).toBe(keep);
  });

  it('GLEN_HUMAN_TARGET_REF_H は pixiScene の EVENT_NPC_TARGET_HEIGHT と同じ値(二人組の場の絵と同じ倍率)', () => {
    const pixi = import.meta.glob('../pixi/pixiScene.ts', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
    const src = Object.values(pixi)[0] ?? '';
    expect(src).toContain(`const EVENT_NPC_TARGET_HEIGHT = ${GLEN_HUMAN_TARGET_REF_H};`);
  });

  it('2枚の足元は画素の中心・下端=足元(絵の外へ出ない)', () => {
    for (const a of [GLEN_HUMAN_ART.stand, GLEN_HUMAN_ART.suffer]) {
      expect(a.footX).toBeGreaterThan(0);
      expect(a.footX).toBeLessThan(a.w);
      expect(a.footY).toBeLessThanOrEqual(a.h);
    }
  });
});

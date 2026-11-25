import { describe, expect, it } from 'vitest';
import {
  GLEN_ROAR_LINE, isGlenBossSpawnReady, shouldPlayGlenTransform, glenTransformBossBox, glenTransformExtraHoldMs,
  glenTransformPose, glenTransformStageAt, GLEN_TRANSFORM_EVENTS, glenTransformDueEvents, glenCloseRoar, GLEN_HUMAN_ART,
  GLEN_TF_APPEAR_MS, GLEN_TF_SUFFER_AT_MS, GLEN_TF_BURST_AT_MS, GLEN_TF_VANISH_MS, GLEN_TF_AFTER_BURST_MS, GLEN_HUMAN_TARGET_REF_H,
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

  it('段取り: 立ち姿で現れ → 0.7秒で苦しむ絵 → 4段 → 2.6秒で弾けて 120ms で消える', () => {
    expect(glenTransformPose(0).frame).toBe('stand');
    expect(glenTransformPose(0).alpha).toBe(0);
    expect(glenTransformPose(GLEN_TF_APPEAR_MS).alpha).toBe(1);
    expect(glenTransformPose(GLEN_TF_SUFFER_AT_MS - 1).frame).toBe('stand');
    expect(glenTransformPose(GLEN_TF_SUFFER_AT_MS).frame).toBe('suffer');
    expect([700, 1100, 1500, 1900, 2300].map(glenTransformStageAt)).toEqual([1, 2, 3, 4, 5]);
    expect(glenTransformStageAt(699)).toBe(0);
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS).alpha).toBe(1);
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS + GLEN_TF_VANISH_MS / 2).alpha).toBeGreaterThan(0.5); // ease-in(初めはゆっくり)
    expect(glenTransformPose(GLEN_TF_BURST_AT_MS + GLEN_TF_VANISH_MS).frame).toBeNull();
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

  it('苦しみは段ごとに強くなる(震えの振れ幅の最大が段を追って増える)・よろめきは段2で右・段3で左', () => {
    const peak = (a: number, b: number) => { let m = 0; for (let t = a; t < b; t++) m = Math.max(m, Math.abs(glenTransformPose(t).dx)); return m; };
    const s1 = peak(700 + 150, 1100);
    const s4 = peak(1900 + 150, 2300);
    expect(s4).toBeGreaterThan(s1 * 2);
    const at = (t: number) => glenTransformPose(t).dx;
    // よろめき(8%・10%)は震え(3%・4.5%)より大きい=頂点付近の向きで分かる。
    expect(at(1100 + 137)).toBeGreaterThan(0.04);
    expect(at(1500 + 137)).toBeLessThan(-0.05);
    // 膝が落ちる: 0.7秒の後に沈み(6%)、段4の頭でもう一段(合計9%)。
    expect(glenTransformPose(1090).dy).toBeCloseTo(0.06, 3);
    expect(glenTransformPose(2250).dy).toBeCloseTo(0.09, 3);
  });

  it('出来事: 呻き3回(音程を下げる)・胸の光は各段の頭で撃ち間隔が詰まる・最後に弾け', () => {
    const growls = GLEN_TRANSFORM_EVENTS.filter(e => e.kind === 'growl');
    expect(growls.map(e => e.at)).toEqual([700, 1100, 1900]);
    expect(growls.map(e => (e.kind === 'growl' ? e.rate : 0))).toEqual([0.7, 0.65, 0.6]);
    const pulses = GLEN_TRANSFORM_EVENTS.filter(e => e.kind === 'pulse').map(e => e.at);
    for (const head of [700, 1100, 1500, 1900, 2300]) expect(pulses).toContain(head);
    expect(pulses.every(t => t < GLEN_TF_BURST_AT_MS)).toBe(true);
    const last = GLEN_TRANSFORM_EVENTS[GLEN_TRANSFORM_EVENTS.length - 1];
    expect(last).toEqual({ at: GLEN_TF_BURST_AT_MS, kind: 'burst' });
    for (let i = 1; i < GLEN_TRANSFORM_EVENTS.length; i++) expect(GLEN_TRANSFORM_EVENTS[i].at).toBeGreaterThanOrEqual(GLEN_TRANSFORM_EVENTS[i - 1].at);
    // 光の半径は強glow(44)未満=投影影を落とさない。
    for (const e of GLEN_TRANSFORM_EVENTS) if (e.kind === 'pulse') expect(e.radius).toBeLessThan(44);
  });

  it('出来事は1回ずつ撃つ(フレームが飛んでも取りこぼさない・二重に撃たない)', () => {
    const a = glenTransformDueEvents(0, 699);
    expect(a.due).toEqual([]);
    const b = glenTransformDueEvents(a.next, 1200);
    expect(b.due.some(e => e.kind === 'growl')).toBe(true);
    const c = glenTransformDueEvents(b.next, 1200);
    expect(c.due).toEqual([]);
    const d = glenTransformDueEvents(c.next, 99999);
    expect(d.due[d.due.length - 1].kind).toBe('burst');
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

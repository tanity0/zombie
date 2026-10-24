import { describe, it, expect } from 'vitest';
import type { Enemy, EscortSoldier } from '../types/game';
import {
  escortInHitView, escortInMotionView, hittableEscorts, escortAggroCandidates, hateEscortSource, escortBossHaters,
  ESCORT_MOTION_MARGIN_PX, type EscortViewState,
} from './escortView';
import { zoomedViewportBounds } from './cameraZoom';

const mk = (id: string, x: number, y: number, over: Partial<EscortSoldier> = {}): EscortSoldier => ({
  id, baseId: 'base-0', x, y, face: 1, soldierIndex: 0, fireAt: 0, dwellMs: 0, health: 50, maxHealth: 50, ...over,
});
const view = (escorts: EscortSoldier[], over: Partial<EscortViewState> = {}): EscortViewState => ({
  escorts, camera: { x: 0, y: 0 }, gameBounds: { width: 430, height: 932 }, viewZoom: 1, ...over,
});

// 旧 updateSuppression の onScreen(camera+gameBounds±M・ズームを見ない)。ズーム1では新しい定義と完全に一致する(スマホの配置は1pxも動かさない)。
const oldOnScreen = (st: EscortViewState, x: number, y: number): boolean => {
  const M = 100; const cam = st.camera, gb = st.gameBounds;
  return x >= cam.x - M && x <= cam.x + gb.width + M && y >= cam.y - M && y <= cam.y + gb.height + M;
};

describe('画面内の定義は1本(§3・§7 項17)', () => {
  it('動きの切り替えの余白は100px', () => { expect(ESCORT_MOTION_MARGIN_PX).toBe(100); });

  it('被弾・狙われる候補は可視域ぴったり(余白なし)・動きの切り替えは+100px', () => {
    const st = view([]);
    // 体の中心 = (x, y-14)
    expect(escortInHitView(st, { x: 215, y: 14 })).toBe(true);   // 中心 y=0 = 上端ぴったり(含む)
    expect(escortInHitView(st, { x: 215, y: 13 })).toBe(false);  // 中心 y=-1 = 画面の外
    expect(escortInMotionView(st, 215, -99)).toBe(true);          // +100px の内側
    expect(escortInMotionView(st, 215, -101)).toBe(false);
  });

  it('スマホの寸法(430×932 / 375×667)・PC(1280×720)で、ズーム1の動きの切り替えは旧定義と全点で一致する', () => {
    for (const gb of [{ width: 430, height: 932 }, { width: 375, height: 667 }, { width: 1280, height: 720 }]) {
      const st = view([], { gameBounds: gb, camera: { x: 123, y: -456 } });
      for (let x = st.camera.x - 160; x <= st.camera.x + gb.width + 160; x += 17) {
        for (let y = st.camera.y - 160; y <= st.camera.y + gb.height + 160; y += 23) {
          expect(escortInMotionView(st, x, y)).toBe(oldOnScreen(st, x, y));
        }
      }
    }
  });

  it('ズームを引いた時(0.4)は、見えている軍人が「画面外」扱いにならない(旧: ズームを見なかった)', () => {
    const st = view([], { viewZoom: 0.4 });
    // ズーム0.4の可視域は幅 430/0.4=1075 → 左右に 322px ずつ広がる
    const b = zoomedViewportBounds(st.camera, st.gameBounds, 0.4);
    expect(b.left).toBeCloseTo(-322.5, 1);
    expect(escortInHitView(st, { x: -300, y: 400 })).toBe(true);
    expect(oldOnScreen(st, -300, 400)).toBe(false); // 旧定義では「画面外」だった
    expect(escortInMotionView(st, -300, 400)).toBe(true);
    // +100px は画面px換算=ワールドでは 250px
    expect(escortInMotionView(st, -322.5 - 249, 400)).toBe(true);
    expect(escortInMotionView(st, -322.5 - 251, 400)).toBe(false);
  });

  it('スマホの寸法でも被弾の可視域はズーム1で camera〜camera+gameBounds ぴったり', () => {
    for (const gb of [{ width: 430, height: 932 }, { width: 375, height: 667 }]) {
      const st = view([], { gameBounds: gb, camera: { x: 1000, y: 2000 } });
      expect(escortInHitView(st, { x: 1000, y: 2000 + 14 })).toBe(true);
      expect(escortInHitView(st, { x: 1000 + gb.width, y: 2000 + gb.height + 14 })).toBe(true);
      expect(escortInHitView(st, { x: 1000 + gb.width + 1, y: 2000 + 14 })).toBe(false);
      expect(escortInHitView(st, { x: 999, y: 2000 + 14 })).toBe(false);
    }
  });
});

describe('当たる/狙われる/ヘイトの候補', () => {
  const inside = mk('in', 200, 300);
  const outside = mk('out', 5000, 300);
  const downed = mk('down', 220, 300, { health: 0, downedAt: 1 });
  const m0 = mk('m0', 240, 300, { health: undefined, maxHealth: undefined });
  const st = view([inside, outside, downed, m0]);

  it('被弾の対象=見えていて・倒れていなくて・体力のある軍人だけ(M0の随行は除外)', () => {
    expect(hittableEscorts(st).map(e => e.id)).toEqual(['in']);
  });
  it('雑魚・強個体・ハンターが狙う候補は体の中心座標', () => {
    expect(escortAggroCandidates(st)).toEqual([{ id: 'in', x: 200, y: 300 - 14 }]);
  });
  it('ボスのヘイト: inView=見えていて倒れていない / alive=倒れていない(画面外含む・ロック済みの相手を引く用)', () => {
    const s = hateEscortSource(st);
    expect(s.inView.map(c => c.id)).toEqual(['in']);
    expect(s.alive.map(c => c.id).sort()).toEqual(['in', 'out']);
    expect(s.inView[0].footY).toBe(300);
  });
  it('速度は偏差撃ち用に運ばれる', () => {
    const s = hateEscortSource(view([mk('a', 100, 200, { vx: 33, vy: -4 })]));
    expect(s.inView[0].vx).toBe(33);
    expect(s.inView[0].vy).toBe(-4);
  });
  it('ボスが狙いを決めた軍人の一覧(死体のボスは数えない)', () => {
    const en = (id: string, hateTarget?: Enemy['hateTarget'], corpseUntil?: number) => ({ id, hateTarget, corpseUntil });
    const m = escortBossHaters([en('b1', 'escort:a'), en('b2', 'player'), en('b3', 'escort:a'), en('b4', 'ghost'), en('b5', 'escort:b', 1)]);
    expect(m.get('a')).toEqual(['b1', 'b3']);
    expect(m.has('b')).toBe(false);
    expect(m.size).toBe(1);
  });
  it('追いかけ/帰り道(bossState=chase/return)の狙い替えは数えない=赤い予告が出ていない(技の溜めに入った個体だけ)', () => {
    const en = (id: string, bossState?: Enemy['bossState']) => ({ id, hateTarget: 'escort:a' as const, corpseUntil: undefined, bossState });
    const m = escortBossHaters([en('chase', 'chase'), en('ret', 'return'), en('wind', 'dash-windup'), en('none')]);
    expect(m.get('a')).toEqual(['wind', 'none']);
  });
});

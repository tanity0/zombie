import { describe, it, expect } from 'vitest';
import {
  cineCameraAt, cineAccepts, cineSideOf,
  CINE_KILL_ORBIT_START_MS, CINE_KILL_ORBIT_MS, CINE_KILL_ORBIT_FRAC, CINE_COUNTER_OVERSHOOT, CINE_COUNTER_IN_MS,
  CINE_COUNTER_ORBIT_OUT_MS, CINE_COUNTER_ORBIT_BACK_MS, CINE_COUNTER_ORBIT_FRAC, CINE_DEATH_FROM_FRAC, CINE_DEATH_IN_MS, type CineEvent,
  thirdsAim, cinePlateIn, cinePlateKinds,
  CINE_THIRDS_X_FRAC, CINE_FRAME_MARGIN_FRAC, CINE_PLATE_IN_MS, cineModeFor, CINE_PLATE_W_FRAC, CINE_PLATE_NEAR_MARGIN_FRAC,
  applyCineKnobs,
} from './cineCamera';

describe('ダイナミック・カメラワーク(research/CINEMATIC_CAMERA.md v2・社長承認2026-09-14)', () => {
  it('★押し込みは削除(社長指示2026-09-16「一番悪さしてたのは押し込みだった」): どの瞬間でも最大寄り', () => {
    for (const t of [0, 1, 50, 99, 100, 200, 300, 560, 1000]) {
      expect(cineCameraAt('kill', t, 'full').zoomFrac, `kill t=${t}`).toBe(1);
      expect(cineCameraAt('execute', t, 'full').zoomFrac, `execute t=${t}`).toBe(1);
    }
    // 割り込みの持ち越し(startFrac)でも寄りは下がらない=途中から始まっても弱くならない
    for (const f of [0.1, 0.5, 0.95]) {
      expect(cineCameraAt('kill', 0, 'full', f).zoomFrac).toBe(1);
      expect(cineCameraAt('execute', 0, 'full', f).zoomFrac).toBe(1);
    }
  });
  it('★三分割の構図も削除(同指示): どの演目・どのモードでも thirds は立たない', () => {
    for (const k of ['kill', 'execute', 'counter', 'death', 'rescue'] as const) {
      for (const m of ['full', 'cutPush', 'pushOnly'] as const) {
        expect(cineCameraAt(k, 500, m).thirds, `${k}/${m}`).toBe(false);
      }
    }
  });
  it('KILL: 横滑りは残る(遅れて立ち上がる)。cutPush/pushOnly では構図を触らない', () => {
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS, 'full').orbitFrac).toBe(0);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS + CINE_KILL_ORBIT_MS, 'full').orbitFrac).toBeCloseTo(CINE_KILL_ORBIT_FRAC, 9);
    for (const m of ['cutPush', 'pushOnly'] as const) {
      const c = cineCameraAt('kill', 500, m);
      expect(c.orbitFrac).toBe(0);
      expect(c.zoomFrac).toBeCloseTo(1, 9);
    }
  });
  it('カウンター: (1+CINE_COUNTER_OVERSHOOT)→100%のばねで入り、逆側へ速く出て(60ms)ゆっくり戻る(180ms)=往復は対称ではない。戻りは硬く切る(outPow>1)', () => {
    expect(cineCameraAt('counter', 0, 'full').zoomFrac).toBeCloseTo(1 + CINE_COUNTER_OVERSHOOT, 9);
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    const peak = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS, 'full').orbitFrac;
    expect(peak).toBeCloseTo(-CINE_COUNTER_ORBIT_FRAC, 9); // 逆側・最大
    const half = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS / 2, 'full').orbitFrac;
    const backHalf = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS + CINE_COUNTER_ORBIT_BACK_MS / 2, 'full').orbitFrac;
    expect(Math.abs(half)).toBeGreaterThan(CINE_COUNTER_ORBIT_FRAC * 0.8); // 往きは速い(半分の時間で8割超)
    expect(Math.abs(backHalf)).toBeGreaterThan(0);      // 戻りはまだ残っている
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS + CINE_COUNTER_ORBIT_BACK_MS, 'full').orbitFrac).toBeCloseTo(0, 9);
    expect(cineCameraAt('counter', 0, 'full').outPow).toBeGreaterThan(1);
  });
  it('死亡: 60%からじり寄り(ease-in)、保持(1150)の前に着いて止める。戻りは来た時より遅い(outPow<1)。救援は台本なし(恒等)', () => {
    expect(cineCameraAt('death', 0, 'full').zoomFrac).toBe(CINE_DEATH_FROM_FRAC);
    const early = cineCameraAt('death', CINE_DEATH_IN_MS / 2, 'full').zoomFrac;
    expect(early).toBeGreaterThan(CINE_DEATH_FROM_FRAC);
    expect(early).toBeLessThan(CINE_DEATH_FROM_FRAC + (1 - CINE_DEATH_FROM_FRAC) / 2); // 前半は遅い=ease-in
    expect(cineCameraAt('death', CINE_DEATH_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    expect(CINE_DEATH_IN_MS).toBeLessThan(1150);
    expect(cineCameraAt('death', 500, 'full').thirds).toBe(false);
    expect(cineCameraAt('death', 0, 'full').outPow).toBeLessThan(1);
    expect(cineCameraAt('rescue', 100, 'full')).toEqual({ zoomFrac: 1, orbitFrac: 0, thirds: false, outPow: 1, pushNorm: 1 });
  });
  it('重なり: 進行中より高い順位だけ割り込む(KILL保持中のカウンターは捨てる・死亡は割り込む)。終わっていれば何でも受ける', () => {
    const kill: CineEvent = { kind: 'kill', startAt: 1000, endAt: 1700, hasTarget: true, targetX: 0, targetY: 0, sideX: 1, sideY: 1 };
    expect(cineAccepts(kill, 'counter', 1200)).toBe(false);
    expect(cineAccepts(kill, 'kill', 1200)).toBe(false);
    expect(cineAccepts(kill, 'death', 1200)).toBe(true);
    expect(cineAccepts(kill, 'counter', 1700)).toBe(true);
    expect(cineAccepts(null, 'rescue', 0)).toBe(true);
  });
  it('構図の側は開始時に確定(相手が同じ位置なら0=決まらない)。割り込みの持ち越し startFrac は新台本の出だしになる', () => {
    expect(cineSideOf(0, 0, 100, -50)).toEqual({ sideX: 1, sideY: -1 });
    expect(cineSideOf(0, 0, 0, 0)).toEqual({ sideX: 0, sideY: 0 });
    // 処刑(1.0まで寄り切っている)に死亡が割り込む: 60%から始めず 1.0 から(1フレームで引かない)
    expect(cineCameraAt('death', 0, 'full', 1.0).zoomFrac).toBeCloseTo(1, 9);
    expect(cineCameraAt('death', 0, 'full').zoomFrac).toBe(CINE_DEATH_FROM_FRAC);
    // ★押し込み削除後(v0.25.4330): 処刑は持ち越しに関係なく最初から最大寄り=割り込みで弱くならない
    expect(cineCameraAt('execute', 0, 'full', 0.95).zoomFrac).toBe(1);
  });
});

describe('部品スイッチ: 残るのは横滑りだけ(押し込み・三分割は v0.25.4330 で削除)', () => {
  it('横滑りを切っても、寄りは巻き添えにしない', () => {
    const c = cineCameraAt('kill', 460, 'full');
    const noOrbit = applyCineKnobs(c, { orbit: 0 });
    expect(noOrbit.orbitFrac).toBe(0);
    expect(noOrbit.zoomFrac).toBe(c.zoomFrac);
  });
  it('0.5 で半分、1 で素通し(同じ参照を返す)', () => {
    const c = cineCameraAt('kill', 460, 'full');
    expect(applyCineKnobs(c, { orbit: 0.5 }).orbitFrac).toBeCloseTo(c.orbitFrac * 0.5, 9);
    expect(applyCineKnobs(c, { orbit: 1 })).toBe(c);
  });
});

describe('モード(§2-6・v0.25.4300〜4301): pan が効くかは「演目の最大寄り base×(1+mag)」で決める', () => {
  it('群衆戦の引き(0.8)・通常ボスの引き(0.7)は最大寄り(×2.0)で 1 を超える=full。巨大ボス遠距離(0.40)は 0.8=cutPush', () => {
    expect(cineModeFor(false, 0.8, 1.0, 'kill')).toBe('full');
    expect(cineModeFor(false, 0.8, 1.0, 'execute')).toBe('full');
    expect(cineModeFor(false, 0.8, 1.0, 'counter')).toBe('full');
    expect(cineModeFor(false, 0.7, 1.0, 'execute')).toBe('full');   // 0.7×2.0=1.4(カット時点 0.7×1.4=0.98 でも縮めない)
    expect(cineModeFor(false, 0.4, 1.0, 'execute')).toBe('cutPush'); // 0.40×2.0=0.8
    expect(cineModeFor(false, 0.45, 1.0, 'kill')).toBe('cutPush');   // 0.45×2.0=0.9
  });
  it('押し込みだけの場面(訓練/エンディング/通路/EX/研究所)は倍率に関係なく pushOnly。板の余白は板の内縁より広い', () => {
    expect(cineModeFor(true, 1.0, 1.0, 'kill')).toBe('pushOnly');
    expect(CINE_PLATE_NEAR_MARGIN_FRAC).toBeGreaterThan(CINE_PLATE_W_FRAC);
  });
});

describe('第2弾(v0.25.4296): 処刑の別台本・画面上の三分割・近景の板', () => {
  it('処刑(execute): 押し込み削除で常に最大寄り(v0.25.4330)。優先順は kill より上・death より下', () => {
    for (const t of [0, 100, 300, 560, 760, 1100]) {
      expect(cineCameraAt('execute', t, 'full').zoomFrac, `t=${t}`).toBe(1);
    }
    const kill: CineEvent = { kind: 'kill', startAt: 0, endAt: 700, hasTarget: true, targetX: 0, targetY: 0, sideX: 1, sideY: 1 };
    expect(cineAccepts(kill, 'execute', 100)).toBe(true);
    const exec: CineEvent = { kind: 'execute', startAt: 0, endAt: 1100, hasTarget: true, targetX: 0, targetY: 0, sideX: 1, sideY: 1 };
    expect(cineAccepts(exec, 'kill', 100)).toBe(false);
    expect(cineAccepts(exec, 'death', 100)).toBe(true);
  });
  it('三分割(画面上の置き場所): 相手は縦の三分割線(自機の反対側)に乗り、自機は枠内に残る', () => {
    const W = 800, H = 600, zoom = 2;
    // 近接キル(相手が右60px): 距離比なら中央寄せと同じだが、置き場所なら相手は右の三分割線
    const near = thirdsAim({ px: 0, py: 0, tx: 60, ty: 0, zoom, screenW: W, screenH: H });
    const targetScreenX = W / 2 + (60 - near.x) * zoom;
    expect(targetScreenX).toBeCloseTo(W / 2 + W * CINE_THIRDS_X_FRAC, 6);
    expect(near.sideX).toBe(1);
    // 遠距離(相手が右900px): 自機が枠外へ出ないよう寄り先がクランプされる
    const far = thirdsAim({ px: 0, py: 0, tx: 900, ty: 0, zoom, screenW: W, screenH: H });
    const playerScreenX = W / 2 + (0 - far.x) * zoom;
    expect(playerScreenX).toBeGreaterThanOrEqual(W * CINE_FRAME_MARGIN_FRAC - 1e-6);
    expect(playerScreenX).toBeLessThanOrEqual(W - W * CINE_FRAME_MARGIN_FRAC + 1e-6);
    // 相手が左なら左の三分割線
    expect(thirdsAim({ px: 0, py: 0, tx: -60, ty: 0, zoom, screenW: W, screenH: H }).sideX).toBe(-1);
    // 板を出す演目: 自機側の余白を板の内縁より広く取る=自機は板(0〜0.32W)の裏に入らない
    const plated = thirdsAim({ px: 0, py: 0, tx: 900, ty: 0, zoom, screenW: W, screenH: H, nearMarginFrac: 0.38 });
    const platedPlayerX = W / 2 + (0 - plated.x) * zoom;
    expect(platedPlayerX).toBeGreaterThanOrEqual(W * 0.38 - 1e-6);
  });
  it('近景の板: 滑り込みは行き過ぎて止まる(途中で1を超える)。出す演目は処刑2種と死亡だけ', () => {
    expect(cinePlateIn(0)).toBe(0);
    let over = false;
    for (let t = 0; t <= CINE_PLATE_IN_MS; t += 10) if (cinePlateIn(t) > 1) over = true;
    expect(over).toBe(true);
    expect(cinePlateIn(CINE_PLATE_IN_MS)).toBeCloseTo(1, 9);
    expect(cinePlateKinds.has('kill')).toBe(true); expect(cinePlateKinds.has('execute')).toBe(true);
    expect(cinePlateKinds.has('death')).toBe(true); expect(cinePlateKinds.has('counter')).toBe(false);
  });
});

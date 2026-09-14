import { describe, it, expect } from 'vitest';
import {
  cineCameraAt, cineAccepts, cineSideOf, CINE_KILL_CUT_FRAC, CINE_KILL_PUSH_START_MS, CINE_KILL_PUSH_MS,
  CINE_KILL_ORBIT_START_MS, CINE_KILL_ORBIT_MS, CINE_KILL_ORBIT_FRAC, CINE_COUNTER_OVERSHOOT, CINE_COUNTER_IN_MS,
  CINE_COUNTER_ORBIT_OUT_MS, CINE_COUNTER_ORBIT_BACK_MS, CINE_COUNTER_ORBIT_FRAC, CINE_DEATH_FROM_FRAC, CINE_DEATH_IN_MS, type CineEvent,
  thirdsAim, cinePlateIn, cinePlateKinds, CINE_EXEC_CUT_FRAC, CINE_EXEC_PUSH1_TO, CINE_EXEC_PUSH2_START_MS, CINE_EXEC_PUSH2_MS,
  CINE_THIRDS_X_FRAC, CINE_FRAME_MARGIN_FRAC, CINE_PLATE_IN_MS, cineModeFor, CINE_PLATE_W_FRAC, CINE_PLATE_NEAR_MARGIN_FRAC,
  cineBarFrac, cineBarKinds, cineBarsOn, CINE_BAR_H_FRAC, CINE_THIRDS_Y_FRAC,
} from './cineCamera';

describe('ダイナミック・カメラワーク(research/CINEMATIC_CAMERA.md v2・社長承認2026-09-14)', () => {
  it('KILL: カット(CINE_KILL_CUT_FRAC=50%・v0.25.4301)で始まり、ストップ明けから押し込んで保持の前半で100%(最大寄り=スローの最遅区間の裁定を保つ)', () => {
    expect(cineCameraAt('kill', 0, 'full').zoomFrac).toBe(CINE_KILL_CUT_FRAC);
    expect(cineCameraAt('kill', CINE_KILL_PUSH_START_MS - 1, 'full').zoomFrac).toBe(CINE_KILL_CUT_FRAC);
    const mid = cineCameraAt('kill', CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS / 2, 'full').zoomFrac;
    expect(mid).toBeGreaterThan(CINE_KILL_CUT_FRAC); expect(mid).toBeLessThan(1);
    expect(cineCameraAt('kill', CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    expect(CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS).toBeLessThanOrEqual(100 + 560 * 0.5);
  });
  it('KILL: 横滑りは押し込みの後半から重ねて立ち上がる(終点と始点を同じ瞬間にしない)。三分割は full のみ。cutPush/pushOnly では構図を触らない', () => {
    expect(CINE_KILL_ORBIT_START_MS).toBeLessThan(CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS);
    expect(CINE_KILL_ORBIT_START_MS).toBeGreaterThan(CINE_KILL_PUSH_START_MS);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS, 'full').orbitFrac).toBe(0);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS + CINE_KILL_ORBIT_MS, 'full').orbitFrac).toBeCloseTo(CINE_KILL_ORBIT_FRAC, 9);
    expect(cineCameraAt('kill', 500, 'full').thirds).toBe(true);
    for (const m of ['cutPush', 'pushOnly'] as const) {
      const c = cineCameraAt('kill', 500, m);
      expect(c.orbitFrac).toBe(0); expect(c.thirds).toBe(false);
      expect(c.zoomFrac).toBeCloseTo(1, 9); // 押し込みは残る
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
    // KILL に execute が割り込む: カットは今の倍率(0.95)から=60%へ落とさない(ただし一拍目の到達92%は超えない)
    expect(cineCameraAt('execute', 0, 'full', 0.95).zoomFrac).toBeCloseTo(0.92, 9);
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
  it('処刑(execute): カットは KILL より広く、一拍目→止め→二拍目で100%。優先順は kill より上・death より下', () => {
    expect(cineCameraAt('execute', 0, 'full').zoomFrac).toBe(CINE_EXEC_CUT_FRAC);
    expect(CINE_EXEC_CUT_FRAC).toBeLessThan(CINE_KILL_CUT_FRAC);
    const hold = cineCameraAt('execute', CINE_EXEC_PUSH2_START_MS - 1, 'full').zoomFrac;
    expect(hold).toBeCloseTo(CINE_EXEC_PUSH1_TO, 2); // 止めの間は92%
    expect(cineCameraAt('execute', CINE_EXEC_PUSH2_START_MS + CINE_EXEC_PUSH2_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
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

describe('第3弾(v0.25.4303): レターボックス(§7)', () => {
  it('カットの瞬間に帯は既に居る(滑り込ませない=板と同じ文法)。抜けは √decay で開き、戻り切りで0', () => {
    expect(cineBarFrac(1)).toBeCloseTo(CINE_BAR_H_FRAC, 9); // 演目の最中=満載。t=0 でも同じ(立ち上がりの時計を持たない)
    expect(cineBarFrac(0)).toBe(0);
    // √ は線形より「遅く閉じる」=幹の板(outTree)と同じ形で画角と近景が同時に戻る
    expect(cineBarFrac(0.25)).toBeCloseTo(CINE_BAR_H_FRAC * 0.5, 9);
    expect(cineBarFrac(0.5)).toBeGreaterThan(CINE_BAR_H_FRAC * 0.5);
    // 単調(途中で戻らない)
    let prev = -1;
    for (let d = 0; d <= 1.0001; d += 0.05) { const v = cineBarFrac(d); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    // 包絡線の外(負・1超)を渡されても帯は画面を食い尽くさない
    expect(cineBarFrac(-1)).toBe(0);
    expect(cineBarFrac(5)).toBeCloseTo(CINE_BAR_H_FRAC, 9);
  });
  it('出す演目は処刑2種と死亡だけ(カウンターは短すぎる)', () => {
    expect(cineBarKinds.has('kill')).toBe(true); expect(cineBarKinds.has('execute')).toBe(true);
    expect(cineBarKinds.has('death')).toBe(true);
    expect(cineBarKinds.has('counter')).toBe(false); expect(cineBarKinds.has('rescue')).toBe(false);
  });
  it('★モードの門(検収監査5・v0.25.4300の再発防止): pushOnly だけ出さない=cutPush では板が出なくても帯は出る', () => {
    for (const k of ['kill', 'execute', 'death'] as const) {
      expect(cineBarsOn(k, 'full', 1)).toBe(true);
      expect(cineBarsOn(k, 'cutPush', 1)).toBe(true);   // ★ここ。板(full限定)と違って縮小モードでも帯は出る
      expect(cineBarsOn(k, 'pushOnly', 1)).toBe(false); // 訓練/通路/EX/研究所は演出そのものを抑える
    }
    expect(cineBarsOn('counter', 'full', 1)).toBe(false); // 320msは短すぎる
    expect(cineBarsOn('rescue', 'full', 1)).toBe(false);
    expect(cineBarsOn(null, 'full', 1)).toBe(false);      // 演目なし
    expect(cineBarsOn('kill', 'full', 0)).toBe(false);    // 戻り切り
  });
  it('★帯が構図を食わない(§7-4): 相手の三分割線も、自機の枠内余白も帯の内側に残る', () => {
    // 相手は中央から H×1/8。帯の内縁は中央から H×(0.5−0.12)=0.38H。食わない。
    expect(CINE_THIRDS_Y_FRAC).toBeLessThan(0.5 - CINE_BAR_H_FRAC);
    // 自機が枠内に残る余白(0.14)は帯(0.12)より広い=斬っている自機が帯の裏に入らない。
    // ここが逆転したら「絵を作ったのに主役が隠れる」事故になるので、帯を太くする時は必ず一緒に動かす。
    expect(CINE_BAR_H_FRAC).toBeLessThan(CINE_FRAME_MARGIN_FRAC);
  });
  it('★但し書き(検収監査3): 縦クランプが効くほど高低差が大きいと、相手は帯の裏へ入りうる=「食わない」は無条件ではない', () => {
    const W = 800, H = 600, zoom = 2;
    // 高低差が小さい通常の場面: 相手は H/8 の三分割線=帯の内縁(中央から 0.38H)の内側。§7-4 の主張はここで成立する。
    const near = thirdsAim({ px: 0, py: 0, tx: 0, ty: 140, zoom, screenW: W, screenH: H });
    expect(Math.abs(H / 2 + (140 - near.y) * zoom - H / 2)).toBeLessThan(H * (0.5 - CINE_BAR_H_FRAC));
    // 高低差が大きいと縦クランプ(自機を枠内に残す)が効き、相手のオフセットは H/8 固定から外れる。
    // その結果 **相手は画面内に居るのに帯の裏** という並びがありうる。仕様として固定しておく(直すなら三分割側)。
    const far = thirdsAim({ px: 0, py: 0, tx: 0, ty: 240, zoom, screenW: W, screenH: H });
    const y = H / 2 + (240 - far.y) * zoom;
    expect(y).toBeLessThan(H);                                   // 画面内
    expect(Math.abs(y - H / 2)).toBeGreaterThan(H * (0.5 - CINE_BAR_H_FRAC)); // でも帯の内縁より外=帯の裏
  });
});

import { describe, it, expect } from 'vitest';
import {
  aabbGapDistance, bossDistanceZoomTarget, bossZoomClassFor, contextZoomTarget, isLargeForZoom,
  isPointInZoomedViewport, zoomCompensatedWorldDistance, zoomedViewportBounds,
  BOSS_DISTANCE_ZOOM_FAR_PX, BOSS_DISTANCE_ZOOM_MID_PX, BOSS_DISTANCE_ZOOM_MIN, BOSS_DISTANCE_ZOOM_NEAR_PX,
  BOSS_ZOOM_PROFILES, BOSS_ZOOM_NEAR, BOSS_ZOOM_MID, CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN, ZOOM_MIN_ABS,
  CONTEXT_ZOOM_COUNT_FLOOR, CONTEXT_ZOOM_COUNT_CEIL,
} from './cameraZoom';

describe('cameraZoom — context zoom target', () => {
  it('does not zoom out up to the floor count', () => {
    expect(contextZoomTarget(0, false)).toBe(1);
    expect(contextZoomTarget(CONTEXT_ZOOM_COUNT_FLOOR, false)).toBe(1);
  });

  it('zooms out linearly above the floor, reaching the min at the ceiling', () => {
    expect(contextZoomTarget(CONTEXT_ZOOM_COUNT_CEIL, false)).toBeCloseTo(CONTEXT_ZOOM_MIN, 6);
    const mid = contextZoomTarget(Math.round((CONTEXT_ZOOM_COUNT_FLOOR + CONTEXT_ZOOM_COUNT_CEIL) / 2), false);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(CONTEXT_ZOOM_MIN);
    // monotonic in count
    expect(contextZoomTarget(15, false)).toBeLessThan(contextZoomTarget(10, false));
    // never below the min even past the ceiling
    expect(contextZoomTarget(40, false)).toBe(CONTEXT_ZOOM_MIN);
  });

  // v0.25.2413(社長指示「ボス戦はもう少し引けます?」): ボス戦だけ BOSS_ZOOM_MIN まで深く引く。
  // 体数ドリブンの引き(CONTEXT_ZOOM_MIN)は据え置きなので、両者が別の値であることも固定しておく
  // (同じ値に戻ると「ボス戦だけ深く」という意図が黙って消える)。
  it('a large enemy forces the boss zoom-out regardless of count', () => {
    expect(contextZoomTarget(1, true)).toBe(BOSS_ZOOM_MIN);
    expect(contextZoomTarget(0, true)).toBe(BOSS_ZOOM_MIN);
    expect(BOSS_ZOOM_MIN).toBeLessThan(CONTEXT_ZOOM_MIN);
    // 安全マージンの基準は「一番引いた時」でなければならない(背景の隙間/敵の消失を防ぐ)。
    expect(ZOOM_MIN_ABS).toBe(Math.min(CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN, BOSS_DISTANCE_ZOOM_MIN));
  });

  it('large-type set = reaper/giantbat/hidden bosses/hunter (not pumpkin/screamer)', () => {
    for (const t of ['reaper', 'giantbat', 'mimir', 'jormungand', 'skadi', 'hunter']) expect(isLargeForZoom(t)).toBe(true);
    for (const t of ['pumpkin', 'screamer', 'zombie', 'bat', 'plant']) expect(isLargeForZoom(t)).toBe(false);
  });

  it('uses size classes and treats story giantbats as giant bosses', () => {
    // v0.25.2947(社長指示): 足元=等倍1.0 / 中=1.7倍引き / 遠=体格別(giant 0.40=2.5倍引き)。
    expect(BOSS_ZOOM_NEAR).toBe(1.0);
    expect(BOSS_ZOOM_MID).toBeCloseTo(1 / 1.7, 6);
    expect(BOSS_ZOOM_PROFILES).toEqual({
      compact: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.48 },
      standard: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.44 },
      giant: { near: BOSS_ZOOM_NEAR, mid: BOSS_ZOOM_MID, far: 0.40 },
    });
    expect(bossZoomClassFor('idol')).toBe('compact');
    expect(bossZoomClassFor('miguel')).toBe('compact');
    expect(bossZoomClassFor('thor')).toBe('standard');
    expect(bossZoomClassFor('giantbat')).toBe('standard');
    expect(bossZoomClassFor('giantbat', true)).toBe('giant');
    expect(bossZoomClassFor('jormungand')).toBe('giant');
  });

  it('足元=等倍→中=1.7倍引き→遠=最深、の3アンカーを単調に繋ぐ', () => {
    const profile = BOSS_ZOOM_PROFILES.giant;
    expect(bossDistanceZoomTarget('jormungand', 0)).toBe(BOSS_ZOOM_NEAR);
    expect(bossDistanceZoomTarget('jormungand', BOSS_DISTANCE_ZOOM_NEAR_PX)).toBe(BOSS_ZOOM_NEAR);
    expect(bossDistanceZoomTarget('jormungand', BOSS_DISTANCE_ZOOM_MID_PX)).toBeCloseTo(BOSS_ZOOM_MID, 6);
    expect(bossDistanceZoomTarget('jormungand', BOSS_DISTANCE_ZOOM_FAR_PX)).toBeCloseTo(profile.far, 6);
    expect(bossDistanceZoomTarget('jormungand', 99999)).toBeCloseTo(profile.far, 6);
    // 各区間の中点=スムーズステップの中央値(=両端の平均)
    expect(bossDistanceZoomTarget('jormungand', (BOSS_DISTANCE_ZOOM_NEAR_PX + BOSS_DISTANCE_ZOOM_MID_PX) / 2))
      .toBeCloseTo((BOSS_ZOOM_NEAR + BOSS_ZOOM_MID) / 2, 6);
    expect(bossDistanceZoomTarget('jormungand', (BOSS_DISTANCE_ZOOM_MID_PX + BOSS_DISTANCE_ZOOM_FAR_PX) / 2))
      .toBeCloseTo((BOSS_ZOOM_MID + profile.far) / 2, 6);
    // 全域で単調(引きは増える一方)
    let prev = bossDistanceZoomTarget('jormungand', 0);
    for (let d = 50; d <= 1400; d += 50) {
      const z = bossDistanceZoomTarget('jormungand', d);
      expect(z).toBeLessThanOrEqual(prev + 1e-9);
      prev = z;
    }
  });

  it('uses body-edge distance for wide bosses', () => {
    const player = { x: 100, y: 100, width: 20, height: 20 };
    expect(aabbGapDistance(player, { x: 120, y: 90, width: 500, height: 80 })).toBe(0);
    expect(aabbGapDistance(player, { x: 170, y: 100, width: 500, height: 80 })).toBe(50);
    expect(aabbGapDistance(player, { x: 150, y: 150, width: 500, height: 80 })).toBeCloseTo(Math.hypot(30, 30));
  });

  it('expands visual world distances so zoomed screen distances stay constant', () => {
    expect(zoomCompensatedWorldDistance(70, 1)).toBe(70);
    expect(zoomCompensatedWorldDistance(70, 0.7)).toBe(100);
    expect(zoomCompensatedWorldDistance(220, 0.58) * 0.58).toBeCloseTo(220, 6);
    expect(zoomCompensatedWorldDistance(70, 1.2)).toBe(70);
    expect(zoomCompensatedWorldDistance(70, 0)).toBe(70);
  });

  it('expands offscreen bounds by the same zoom ratio', () => {
    const camera = { x: 100, y: 200 };
    const viewport = { width: 400, height: 700 };
    const b = zoomedViewportBounds(camera, viewport, 0.5, 50);
    expect(b).toEqual({ left: -200, top: -250, right: 800, bottom: 1350 });
    expect(isPointInZoomedViewport(790, 1340, camera, viewport, 0.5, 50)).toBe(true);
    expect(isPointInZoomedViewport(801, 1340, camera, viewport, 0.5, 50)).toBe(false);
  });

  it('combines crowd, large-enemy and distance boss targets by deepest pull', () => {
    expect(contextZoomTarget(0, false, 0.66)).toBe(0.66);
    expect(contextZoomTarget(0, true, 0.62)).toBe(0.62);
    expect(contextZoomTarget(CONTEXT_ZOOM_COUNT_CEIL, false, 0.9)).toBe(CONTEXT_ZOOM_MIN);
  });
});

// v0.25.2954: フレーミング項(社長指示「早めに引き判定に入り、できるだけ被写体を捉え続ける」)。
import { bossFramingZoom, BOSS_FRAME_EDGE_MARGIN_PX, BOSS_ZOOM_PROFILES as PROFILES2 } from './cameraZoom';

describe('bossFramingZoom (被写体を画面内に保つ要求ズーム)', () => {
  const vp = { width: 800, height: 600 };
  it('縦=帯基準で全量/横=半分+MID床の軸別要求(v0.25.2969・縦持ち実写から)', () => {
    // 縦は「見える帯(画面高×0.45)」の半径で全量を測る=上下に逃げられたら素直に引く
    const bandHalf = (vp.height * 0.45) / 2;
    expect(bossFramingZoom(0, 500, vp)).toBeCloseTo((bandHalf - BOSS_FRAME_EDGE_MARGIN_PX) / 500, 6);
    // 横は半分で測り、床=BOSS_ZOOM_MID(1.7倍引き)を割らない=横のために豆粒化しない
    expect(bossFramingZoom(2000, 0, vp)).toBeCloseTo(1 / 1.7, 6);
    // 横500pxなら引き不要(寄せが半分担う)
    expect(bossFramingZoom(500, 0, vp)).toBeGreaterThan(1);
  });
  it('近距離(足元の等倍帯)ではフレーミング項が効かない=等倍のまま', () => {
    // 直接のbossFramingZoomは帯基準で1未満になり得るが、bossDistanceZoomTargetのNEAR帯+ブレンドが守る
    expect(bossDistanceZoomTarget('mimir', 100, false, { dxCenter: 0, dyCenter: 120, viewport: vp })).toBe(1.0);
  });
  it('bossDistanceZoomTargetはフレーミング要求とアンカーの引きが強い方を採り、床(far)を割らない', () => {
    const far = PROFILES2.giant.far;
    // 縦600離れ(gap500相当・w=1): 帯基準の全量要求((135-40)/600? → (270-40)/600=0.383)が
    // アンカー(mid=0.588)より強い→そちら(床farでクランプ)
    const bandHalf2 = (vp.height * 0.45) / 2;
    const pulled = bossDistanceZoomTarget('mimir', 500, false, { dxCenter: 0, dyCenter: 600, viewport: vp });
    expect(pulled).toBeCloseTo(Math.max(far, (bandHalf2 - BOSS_FRAME_EDGE_MARGIN_PX) / 600), 6);
    // 横600離れ: 横は半分要求=引き不要→アンカーのまま
    const pulledX = bossDistanceZoomTarget('mimir', 500, false, { dxCenter: 600, dyCenter: 0, viewport: vp });
    expect(pulledX).toBeCloseTo(PROFILES2.giant.mid, 6);
    // 超遠距離でも床=farで止まる
    expect(bossDistanceZoomTarget('mimir', 2000, false, { dxCenter: 0, dyCenter: 2200, viewport: vp })).toBe(far);
    // 足元(NEAR以内)は等倍のまま(社長裁定v0.25.2947不変)
    expect(bossDistanceZoomTarget('mimir', 100, false, { dxCenter: 0, dyCenter: 400, viewport: vp })).toBe(1.0);
    // v0.25.2964: NEAR境界のすぐ外ではフレーミング項がほぼ効かない=境界の段差が無い(連続)
    const nearEdge = bossDistanceZoomTarget('mimir', 181, false, { dxCenter: 0, dyCenter: 480, viewport: vp });
    const anchorOnly = bossDistanceZoomTarget('mimir', 181);
    expect(Math.abs(nearEdge - anchorOnly)).toBeLessThan(0.01);
    // framing無し(従来呼び出し)は従来曲線のまま
    expect(bossDistanceZoomTarget('mimir', 500)).toBeCloseTo(PROFILES2.giant.mid, 6);
  });
});

// §6.37 v6(v0.25.2994): 引き連動のカメラ下げ(上下の地面幅を揃える・社長指示2026-08-07)。
import { zoomCameraDownFrac, CAMERA_HORIZON_FRAC } from './cameraZoom';

describe('zoomCameraDownFrac — 引きで上下の地面幅を揃えるカメラ下げ', () => {
  it('等倍(zoom>=1)では従来の下げ量そのまま=構図不変(恒等)', () => {
    expect(zoomCameraDownFrac(0.08, 1)).toBe(0.08);
    expect(zoomCameraDownFrac(0.16, 1.2)).toBe(0.16);
  });
  it('従来値を下回らない(max合成)=浅い引きで急に構図が変わらない', () => {
    for (const z of [0.99, 0.9, 0.8, 0.6, ZOOM_MIN_ABS]) {
      expect(zoomCameraDownFrac(0.16, z)).toBeGreaterThanOrEqual(0.16);
    }
  });
  it('引きが深いほど単調に増える', () => {
    let prev = 0;
    for (const z of [0.9, 0.8, 0.7, 0.6, 0.5, ZOOM_MIN_ABS]) {
      const v = zoomCameraDownFrac(0.08, z);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('等式: 地平線支点でプレイヤー画面比が(地平線+下端)/2に一致する下げ量になっている', () => {
    // p(z) = (0.5+off)·z + f·(1-z) が (1+f)/2 に一致(off=均衡項が勝つ深さで)。
    for (const z of [0.6, 0.5, ZOOM_MIN_ABS]) {
      const off = zoomCameraDownFrac(0, z); // base=0で均衡項そのもの
      const p = (0.5 + off) * z + CAMERA_HORIZON_FRAC * (1 - z);
      expect(p).toBeCloseTo((1 + CAMERA_HORIZON_FRAC) / 2, 6);
    }
  });
  it('最深(ZOOM_MIN_ABS)より深い値を渡してもそこで頭打ち', () => {
    expect(zoomCameraDownFrac(0.08, 0.1)).toBeCloseTo(zoomCameraDownFrac(0.08, ZOOM_MIN_ABS), 9);
  });
});

// §6.37 v7→v0.25.3002: 縦のボスカメラ先読み。北=「ボスを目標画面高さへ引き込む」方式
// (社長報告「まだボスが上の被写体深度の中にいるのが基準になっちゃってる」対応)。南=中間寄せ+上限。
import {
  bossCameraLeadY, BOSS_CAMERA_LEAD_MAX_SCREEN_FRAC, BOSS_LEAD_TARGET_SCREEN_FRAC,
  BOSS_LEAD_PLAYER_MAX_FRAC,
} from './cameraZoom';

describe('bossCameraLeadY — ボス方向への縦カメラ先読み(北=目標ライン方式)', () => {
  const H = 800;
  const pBal = (1 + CAMERA_HORIZON_FRAC) / 2;
  it('南(dy>0)は中間寄せ+上限で負、dy=0は0', () => {
    expect(bossCameraLeadY(200, H, 1)).toBeCloseTo(-100, 6);
    const cap = BOSS_CAMERA_LEAD_MAX_SCREEN_FRAC * H;
    expect(bossCameraLeadY(100000, H, 1)).toBeCloseTo(-cap, 6);
    expect(bossCameraLeadY(0, H, 1)).toBeCloseTo(0, 9);
  });
  it('北でもボスが既に目標ラインより下に映る近さなら寄せない(0)', () => {
    // dy·z が目標ラインとの差より小さい: bossBase = pBal·H + dy·z > T·H → S<0 → 0
    const dySmall = -((pBal - BOSS_LEAD_TARGET_SCREEN_FRAC) * H) * 0.5; // 必要距離の半分
    expect(bossCameraLeadY(dySmall, H, 1)).toBe(0);
  });
  it('北の中距離ではボスがちょうど目標画面高さに来るシフトを返す', () => {
    for (const z of [1, 0.7, ZOOM_MIN_ABS]) {
      const dy = -(0.5 * H) / z; // 画面0.5H分の北距離(クランプ内に収まる範囲)
      const lead = bossCameraLeadY(dy, H, z);
      const bossScreen = pBal * H + dy * z + lead * z;
      // クランプに掛からなければ厳密に目標ライン
      const maxShift = (BOSS_LEAD_PLAYER_MAX_FRAC - pBal) * H;
      const want = BOSS_LEAD_TARGET_SCREEN_FRAC * H - (pBal * H + dy * z);
      if (want <= maxShift) expect(bossScreen).toBeCloseTo(BOSS_LEAD_TARGET_SCREEN_FRAC * H, 4);
    }
  });
  it('北の超遠距離はプレイヤー下限(画面高比)でクランプされる', () => {
    for (const z of [1, ZOOM_MIN_ABS]) {
      const maxShift = (BOSS_LEAD_PLAYER_MAX_FRAC - pBal) * H;
      expect(bossCameraLeadY(-100000, H, z)).toBeCloseTo(maxShift / z, 4);
    }
  });
  it('最深より深いzoomを渡してもZOOM_MIN_ABSで頭打ち', () => {
    expect(bossCameraLeadY(-100000, H, 0.1)).toBeCloseTo(
      bossCameraLeadY(-100000, H, ZOOM_MIN_ABS), 6);
  });
});

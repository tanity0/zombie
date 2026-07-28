// 廃病院(社長指示v0.25.2331・PACING_PUZZLE.md §6.24 M48で角度のランダム化に改修)の純関数。
// 位置・サークル判定・滞在の不変条件を機械化する。
import { describe, it, expect } from 'vitest';
import {
  HOSPITAL_DIST, HOSPITAL_CIRCLE_RADIUS, HOSPITAL_DWELL_MS, HOSPITAL_HITBOX_W, HOSPITAL_HITBOX_H,
  hospitalPos, hospitalRect, resolveHospitalCollision, isInHospitalCircle, tickHospitalDwell,
} from './hospital';
import { AREA_THRESHOLDS } from '../utils/enemyUtils';
import { detourPosForSector } from './detourPoi';
import { getRunPois, poiSectorIndex } from './pois';

const player = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

describe('hospitalPos(未確認汚染のほぼ中間・§6.24でセクター引数へ変更)', () => {
  it('距離は未確認汚染エリアの中間(社長指示「未確認のほぼ中間らへんに」)', () => {
    expect(HOSPITAL_DIST).toBe((AREA_THRESHOLDS[2] + AREA_THRESHOLDS[3]) / 2);
    for (const sector of [0, 1, 2, 3]) {
      const p = hospitalPos(sector);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(HOSPITAL_DIST, 6);
    }
  });

  it('未確認汚染エリアの内側にある(隣のエリアへはみ出さない)', () => {
    expect(HOSPITAL_DIST).toBeGreaterThan(AREA_THRESHOLDS[2]);
    expect(HOSPITAL_DIST).toBeLessThan(AREA_THRESHOLDS[3]);
  });

  it('detourPoi.ts の detourPosForSector(hospital, sector) と一致する(=単一の位置計算式)', () => {
    for (const sector of [0, 1, 2, 3]) {
      const p = hospitalPos(sector);
      const expected = detourPosForSector('hospital', sector);
      expect(p.x).toBeCloseTo(expected.x, 6);
      expect(p.y).toBeCloseTo(expected.y, 6);
    }
  });

  it('割り当てられたセクターに属する(=矢印の解放判定と実体が一致する)', () => {
    for (const sector of [0, 1, 2, 3]) {
      expect(poiSectorIndex(hospitalPos(sector))).toBe(sector);
    }
  });
});

describe('getRunPois(病院の方角マーク・§6.24でdetours引数へ変更)', () => {
  it('detours未指定(既定=空配列)では出さない=病院の無いステージを汚さない', () => {
    expect(getRunPois(null)).toEqual([]);
  });

  it('detoursに渡すと病院POIが1つ増え、座標はそのまま反映される', () => {
    const h = hospitalPos(1);
    const pois = getRunPois('mimir', [{ kind: 'hospital', pos: h }]);
    const found = pois.find(p => p.kind === 'hospital');
    expect(found).toBeTruthy();
    expect(found!.x).toBeCloseTo(h.x, 6);
    expect(found!.y).toBeCloseTo(h.y, 6);
    expect(pois.filter(p => p.kind === 'boss')).toHaveLength(1); // 裏ボスの巣は据え置き
  });

  it('pos=nullを渡すと病院POIは出ない(入手後に呼び出し側がnullを渡す想定)', () => {
    expect(getRunPois('mimir', [{ kind: 'hospital', pos: null }]).some(p => p.kind === 'hospital')).toBe(false);
  });
});

describe('hospitalRect / resolveHospitalCollision(足元基準の矩形)', () => {
  it('当たり判定の下端=足元(obstacles.ts の規約)', () => {
    const r = hospitalRect({ x: 100, y: 200 });
    expect(r.y + r.height).toBeCloseTo(200, 6);
    expect(r.x + r.width / 2).toBeCloseTo(100, 6);
    expect(r.width).toBe(HOSPITAL_HITBOX_W);
    expect(r.height).toBe(HOSPITAL_HITBOX_H);
  });

  it('土台に潜り込んだ矩形は押し出される', () => {
    const pos = { x: 0, y: 0 };
    const inside = { x: -10, y: -50, width: 28, height: 28 }; // 土台のど真ん中
    const out = resolveHospitalCollision(inside, pos, false);
    expect(out.x !== inside.x || out.y !== inside.y).toBe(true);
  });

  it('入手後(taken)は素通りする=建物が消えた後に詰まらない', () => {
    const inside = { x: -10, y: -50, width: 28, height: 28 };
    expect(resolveHospitalCollision(inside, { x: 0, y: 0 }, true)).toEqual({ x: inside.x, y: inside.y });
    expect(resolveHospitalCollision(inside, null, false)).toEqual({ x: inside.x, y: inside.y });
  });

  it('遠くの矩形はそのまま(近傍だけ判定=1個ぶんの距離チェック)', () => {
    const far = { x: 5000, y: 5000, width: 28, height: 28 };
    expect(resolveHospitalCollision(far, { x: 0, y: 0 }, false)).toEqual({ x: far.x, y: far.y });
  });
});

describe('isInHospitalCircle', () => {
  const pos = { x: 1000, y: -500 };

  it('中心が半径内なら true / 外なら false(境界は含む)', () => {
    expect(isInHospitalCircle(player(pos.x, pos.y), pos)).toBe(true);
    expect(isInHospitalCircle(player(pos.x + HOSPITAL_CIRCLE_RADIUS, pos.y), pos)).toBe(true);
    expect(isInHospitalCircle(player(pos.x + HOSPITAL_CIRCLE_RADIUS + 1, pos.y), pos)).toBe(false);
  });

  it('病院が無い出撃(null)は常に false', () => {
    expect(isInHospitalCircle(player(0, 0), null)).toBe(false);
  });

  it('サークルは建物の土台の外まで届く=正面から入れる(詰みにならない)', () => {
    expect(HOSPITAL_CIRCLE_RADIUS).toBeGreaterThan(0);
    const front = player(pos.x, pos.y + HOSPITAL_CIRCLE_RADIUS - 1); // 足元より手前(下)
    expect(isInHospitalCircle(front, pos)).toBe(true);
    // 手前側は土台(足元より上へ伸びる箱)に含まれない=立てる。
    const r = hospitalRect(pos);
    expect(front.y).toBeGreaterThan(r.y + r.height - 1);
  });
});

describe('tickHospitalDwell(3秒滞在)', () => {
  it('サークル内なら加算し、3秒でちょうど1回だけ done が立つ', () => {
    let dwell = 0, dones = 0;
    for (let i = 0; i < 100; i++) {
      const r = tickHospitalDwell(dwell, true, 100);
      dwell = r.dwellMs;
      if (r.done) dones++;
    }
    expect(dwell).toBe(HOSPITAL_DWELL_MS);
    expect(dones).toBe(1); // 到達フレームだけ=ワクチンの二重付与が起きない
  });

  it('円から出たら0へ戻る(やり直し=帰還/制圧と同じ流儀)', () => {
    const mid = tickHospitalDwell(1500, false, 16);
    expect(mid).toEqual({ dwellMs: 0, done: false });
  });

  it('3秒を超えて溜まらない(上限でクランプ)', () => {
    expect(tickHospitalDwell(HOSPITAL_DWELL_MS, true, 1000).dwellMs).toBe(HOSPITAL_DWELL_MS);
    expect(tickHospitalDwell(HOSPITAL_DWELL_MS, true, 1000).done).toBe(false); // 到達済みは再発火しない
  });

  it('巨大な dt(タブ復帰など)でも1回だけ done', () => {
    const r = tickHospitalDwell(0, true, 99999);
    expect(r).toEqual({ dwellMs: HOSPITAL_DWELL_MS, done: true });
  });
});

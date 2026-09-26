import { describe, it, expect } from 'vitest';
import {
  stepReaperBody, encircleRadiusPx, encirclePoints, corridorEncirclePoints,
  servantTargetCount, knockbackCdReady, hangedmanKnockbackActive,
} from './reaper2';

describe('stepReaperBody — 直進+70px旋回(PACING_PUZZLE.md §14-4-2)', () => {
  it('縁距離より遠ければプレイヤーへ直進する', () => {
    const r = stepReaperBody(0, 0, 100, 0, 10, 5, 70);
    expect(r.orbiting).toBe(false);
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('縁距離ちょうど/内側では旋回に切り替わり、プレイヤーからの距離(半径)を保つ', () => {
    // 半径70の位置からスタート
    const r = stepReaperBody(70, 0, 0, 0, 999 /* 直進なら大きく飛ぶはずが旋回では効かない */, 10, 70);
    expect(r.orbiting).toBe(true);
    const distAfter = Math.hypot(r.x - 0, r.y - 0);
    expect(distAfter).toBeCloseTo(70, 6); // 半径不変
    // 旋回で位置は変わる(その場に留まらない)
    expect(Math.hypot(r.x - 70, r.y - 0)).toBeGreaterThan(0.01);
  });

  it('プレイヤーとの距離が0でも直進枝は例外を投げない(現在地に留まる)', () => {
    const r = stepReaperBody(5, 5, 5, 5, 10, 5, 0);
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });

  it('直進のstepPxが0なら位置は動かない', () => {
    const r = stepReaperBody(0, 0, 100, 0, 0, 5, 70);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });
});

describe('stepReaperBody — 縁基準(edgeOffsetPx・補修バッチC-1)', () => {
  it('edgeOffsetPx=0(既定)は従来どおり中心間距離で判定する', () => {
    // 中心距離90・縁距離70。offsetなしでは90>70=直進のまま。
    const r = stepReaperBody(0, 0, 90, 0, 10, 5, 70);
    expect(r.orbiting).toBe(false);
  });

  it('edgeOffsetPx>0を渡すと、中心距離が同じでも早く旋回へ切り替わる(縁基準)', () => {
    // 中心距離90・縁距離70・offset25(本体/プレイヤーの半径ぶん)→縁距離換算65<70=旋回。
    const r = stepReaperBody(0, 0, 90, 0, 10, 5, 70, 25);
    expect(r.orbiting).toBe(true);
    // 旋回半径は中心距離(90)のまま保たれる(縁基準はしきい値判定だけに効く)。
    expect(Math.hypot(r.x - 90, r.y - 0)).toBeCloseTo(90, 6);
  });
});

describe('encircleRadiusPx — 囲み半径(中8/中9・ズームで割る)', () => {
  it('ズーム1.0なら画面対角の半分+margin', () => {
    const r = encircleRadiusPx(800, 600, 1, 50);
    expect(r).toBeCloseTo(Math.hypot(400, 300) + 50, 6);
  });

  it('ズームを引く(小さい値)ほど半径は大きくなる=最大引きでも画面外を保証', () => {
    const zoomedOut = encircleRadiusPx(800, 600, 0.4, 50);
    const normal = encircleRadiusPx(800, 600, 1, 50);
    expect(zoomedOut).toBeGreaterThan(normal);
  });
});

describe('encirclePoints — 均等配置(§14-4-3叩き台)', () => {
  it('n体を円周上に均等配置し、全点がプレイヤー中心から半径distanceにある', () => {
    const pts = encirclePoints(5, 100, 200, 300);
    expect(pts).toHaveLength(5);
    for (const p of pts) {
      expect(Math.hypot(p.x - 100, p.y - 200)).toBeCloseTo(300, 6);
    }
  });

  it('0体は空配列(落ちない)', () => {
    expect(encirclePoints(0, 0, 0, 100)).toEqual([]);
  });

  it('1体は起点角の位置に1つだけ', () => {
    const pts = encirclePoints(1, 0, 0, 10, 0);
    expect(pts).toHaveLength(1);
    expect(pts[0].x).toBeCloseTo(10, 6);
    expect(pts[0].y).toBeCloseTo(0, 6);
  });
});

describe('corridorEncirclePoints — 廊下縮退(左右2点・補修バッチ3次A-新3)', () => {
  it('引数省略時は従来どおり左右2点のみ返す(後方互換)', () => {
    const pts = corridorEncirclePoints(50, 50, 200);
    expect(pts).toEqual([{ x: -150, y: 50 }, { x: 250, y: 50 }]);
  });

  it('★重なり再発防止(A-新3): maxSlots=5では5スロットの座標が全て異なる(旧実装は0/2/4が同座標に重なっていた)', () => {
    const pts = corridorEncirclePoints(50, 50, 200, 5);
    expect(pts).toHaveLength(5);
    const keys = pts.map(p => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(5); // 全点ユニーク
  });

  it('先頭2点(slot0/1)は従来の基準点のまま(左右・y不変)=見た目の縮退方針を崩さない', () => {
    const pts = corridorEncirclePoints(50, 50, 200, 5);
    expect(pts[0]).toEqual({ x: -150, y: 50 });
    expect(pts[1]).toEqual({ x: 250, y: 50 });
  });

  it('同じ側(左/右)に落ちるペアは進行軸(y)方向へspacingぶんずれる', () => {
    const pts = corridorEncirclePoints(50, 50, 200, 4, 100);
    // slot0/2は左側(x=-150)・slot1/3は右側(x=250)。y方向にspacingぶん離れている。
    expect(pts[0].x).toBe(pts[2].x);
    expect(pts[1].x).toBe(pts[3].x);
    expect(Math.abs(pts[2].y - pts[0].y)).toBe(100);
    expect(Math.abs(pts[3].y - pts[1].y)).toBe(100);
  });
});

describe('hangedmanKnockbackActive — 使者のKB中は専用ムーバの前進を止める(補修バッチ3次A-新1)', () => {
  it('knockbackUntilが未来ならtrue(前進を止める)', () => {
    expect(hangedmanKnockbackActive({ knockbackUntil: 2000 }, 1000)).toBe(true);
  });

  it('knockbackUntilが過去/現在ならfalse(前進してよい)', () => {
    expect(hangedmanKnockbackActive({ knockbackUntil: 1000 }, 1000)).toBe(false);
    expect(hangedmanKnockbackActive({ knockbackUntil: 500 }, 1000)).toBe(false);
  });

  it('knockbackUntil未指定は0扱い=常に前進してよい', () => {
    expect(hangedmanKnockbackActive({}, 0)).toBe(false);
  });
});

describe('servantTargetCount — 枠(target)は10秒毎+1・上限まで(補修バッチA-2)', () => {
  it('波の開始直後は枠1', () => {
    expect(servantTargetCount(0, 0, 10000, 5)).toBe(1);
    expect(servantTargetCount(1000, 9999, 10000, 5)).toBe(1);
  });

  it('interval経過ごとに枠が+1(現在数は無関係=枠だけを返す)', () => {
    expect(servantTargetCount(0, 10000, 10000, 5)).toBe(2);
    expect(servantTargetCount(0, 20000, 10000, 5)).toBe(3);
    expect(servantTargetCount(0, 39999, 10000, 5)).toBe(4);
  });

  it('上限で頭打ち', () => {
    expect(servantTargetCount(0, 999999, 10000, 5)).toBe(5);
  });

  it('★1体消えたら即補充(重大バグ再発防止): 枠は現在数と無関係に進み続けるので、呼び出し側が「現在数<枠」を検知した瞬間、intervalを待たず即座に埋める対象になる', () => {
    // 波開始から25秒後=枠3。5体いたうち2体が同フレームで死んで現在数3に減っても、
    // 枠の計算(waveStartAt基準)はintervalの巻き戻り無しにそのまま3を返す=即補充可能。
    const target = servantTargetCount(0, 25000, 10000, 5);
    const currentCountAfterDeaths = 1; // 5体中4体が死んで1体だけ残った想定
    expect(target).toBe(3);
    expect(Math.max(0, target - currentCountAfterDeaths)).toBe(2); // このフレームで2体を即補充
  });
});

describe('knockbackCdReady — hangedmanのKB特例(裁定済み#6/#8)', () => {
  it('hangedmanは免疫CD中でも常にtrue(全ヒットが積む)', () => {
    expect(knockbackCdReady({ type: 'hangedman', knockbackImmuneUntil: 999999 }, 0)).toBe(true);
  });

  it('他タイプは従来どおり免疫CDを見る', () => {
    expect(knockbackCdReady({ type: 'zombie', knockbackImmuneUntil: 1000 }, 500)).toBe(false);
    expect(knockbackCdReady({ type: 'zombie', knockbackImmuneUntil: 1000 }, 1500)).toBe(true);
  });

  it('knockbackImmuneUntil未指定は0扱い=常にCD明け', () => {
    expect(knockbackCdReady({ type: 'zombie' }, 0)).toBe(true);
  });
});

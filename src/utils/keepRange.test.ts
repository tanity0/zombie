import { describe, it, expect } from 'vitest';
import {
  hasKeepRange, keepBandFor, keepRangeVelocity, keepSpin, keepEscapeDir, keepBlocksTechnique,
  KEEP_INNER_RATIO, KEEP_ORBIT_SPEED_MULT, KEEP_CREEP_SPEED_MULT, KEEP_TECHNIQUE_NEAR_FLOOR_PX,
} from './keepRange';

const SPEED = 60;
const PLAYER = 87;

describe('§16-B 攻撃射程を保つ層', () => {
  it('★対象は「自分の間合いを持たない型」だけ(既に持つ型には掛けない)', () => {
    // ★リッチも対象(§16-B B-5・v0.25.4447)。ただし掛かるのは**噛みのCD中だけ**で、
    // その判定は呼び出し側(gameStore)が持つ——ここは「型として対象か」だけを見る。
    for (const t of ['bat', 'skeleton', 'werewolf', 'lab-zombie-2', 'pumpkin', 'lab-zombie-3', 'lich'] as const) {
      expect(hasKeepRange(t)).toBe(true);
    }
    // 既に自分の間合いを持っている / 対象外の型
    for (const t of ['zombie', 'ghost', 'screamer', 'driller', 'logger', 'plant', 'giantbat', 'thor'] as const) {
      expect(hasKeepRange(t)).toBe(false);
    }
  });

  it('★外側より遠ければ何もしない(遠い時の挙動は1ビットも変わらない)', () => {
    const band = keepBandFor('bat', 'b1', 100, 100)!;
    const r = keepRangeVelocity(11, 22, 1, 0, band.outer + 50, SPEED, band, 1, PLAYER);
    expect(r.zone).toBe('approach');
    expect(r.tvx).toBe(11);
    expect(r.tvy).toBe(22);
  });

  it('★内側を割ったら下がる。ただしプレイヤーより速く退かない(歩いて追いつける)', () => {
    const band = keepBandFor('bat', 'b1', 100, 100)!;
    const fast = keepRangeVelocity(0, 0, 1, 0, band.inner - 20, 500, band, 1, PLAYER);
    expect(fast.zone).toBe('backoff');
    expect(fast.tvx).toBeLessThan(0);                 // 的と反対へ
    expect(Math.hypot(fast.tvx, fast.tvy)).toBeLessThanOrEqual(PLAYER + 1e-9);
  });

  it('★帯の中では「半分の速度」で回る(社長指示)', () => {
    const band = keepBandFor('bat', 'b1', 100, 100)!;
    const mid = (band.outer + band.inner) / 2;
    const r = keepRangeVelocity(0, 0, 1, 0, mid, SPEED, band, 1, PLAYER);
    expect(r.zone).toBe('keep');
    expect(Math.hypot(r.tvx, r.tvy)).toBeCloseTo(SPEED * KEEP_ORBIT_SPEED_MULT, 5);
  });

  it('★パンプキンは回らず「じりじり下がる」(保ち方は型ごとに違う=均質にしない)', () => {
    const band = keepBandFor('pumpkin', 'p1', 100, 246)!;
    const inner = band.inner + (band.outer - band.inner) * 0.1;   // 帯の内寄り
    const r = keepRangeVelocity(0, 0, 1, 0, inner, SPEED, band, 1, PLAYER);
    expect(r.zone).toBe('keep');
    expect(r.tvx).toBeLessThan(0);                                 // 外へ(下がる)
    expect(Math.hypot(r.tvx, r.tvy)).toBeLessThanOrEqual(SPEED * KEEP_CREEP_SPEED_MULT + 1e-9);
  });

  it('★★好み半径が個体ごとに散る(同じ型が同じ輪に並ぶと壁になる)', () => {
    const mids = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => {
      const b = keepBandFor('bat', id, 100, 100)!;
      return (b.outer + b.inner) / 2;
    });
    expect(new Set(mids.map(m => Math.round(m))).size).toBeGreaterThan(3);
  });

  it('★回る向きが個体ごとに分かれる(全員同じ向きだと隊列が同期して不自然)', () => {
    const spins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => keepSpin(id, 100));
    expect(new Set(spins).size).toBe(2);
  });

  it('ヒステリシスは2閾値(内側 < 外側)で、内側は外側の0.75を基準にしている', () => {
    const band = keepBandFor('skeleton', 's1', 100, 100)!;
    expect(band.inner).toBeLessThan(band.outer);
    expect(KEEP_INNER_RATIO).toBe(0.75);
  });

  it('★帯の中で好み半径へ寄る(外寄りなら内向き成分・内寄りなら外向き成分)', () => {
    const band = keepBandFor('bat', 'b1', 100, 100)!;
    const outerSide = keepRangeVelocity(0, 0, 1, 0, band.outer - 0.5, SPEED, band, 1, PLAYER);
    const innerSide = keepRangeVelocity(0, 0, 1, 0, band.inner + 0.5, SPEED, band, 1, PLAYER);
    expect(outerSide.tvx).toBeGreaterThan(innerSide.tvx);   // 外寄りほど内向き(+x)へ寄る
  });

  // ── 実測2026-09-17で捕まえた2つの穴(どちらも「張り付いたまま動かない」として現れた) ──
  it('★真上に重なっても止まらない(逃げ方向が定義される・長さ1)', () => {
    const d = keepEscapeDir('p1', 100);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
  });

  it('★逃げ方向は個体ごとに散る(全員が同じ方へ抜けると列になる)', () => {
    const angles = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => {
      const d = keepEscapeDir(id, 100);
      return Math.round(Math.atan2(d.y, d.x) * 100);
    });
    expect(new Set(angles).size).toBeGreaterThan(3);
  });

  // ★★裁定 #K-1(社長2026-09-20「a」)で規則が変わった節。
  // 旧: 「**帯の内側**では技を出さない」(パンプキンで167〜207px)
  // 新: 「**密着(50px)**では技を出さない」——旧規則は、噛みが届く60px級と帯の内側との間に
  //     **「噛めないし技も出せない帯」を約100〜140px幅**で空けていた(社長報告「絶妙な距離を
  //     保ち続けると何もしてこない」)。**元の役目(着地直後の連射を止める)はそのまま残す。**
  it('★密着では技を出さない=下がり切る前に技を出し直して居座らない(元の役目)', () => {
    expect(keepBlocksTechnique('pumpkin', 'pk1', 100, 246, 18)).toBe(true);   // 着地直後の実測値
    expect(keepBlocksTechnique('pumpkin', 'pk1', 100, 246, KEEP_TECHNIQUE_NEAR_FLOOR_PX - 1)).toBe(true);
  });

  it('★★#K-1: 帯の内側でも、密着でなければ技は出せる(「何もしてこない帯」を作らない)', () => {
    const band = keepBandFor('pumpkin', 'pk1', 100, 246)!;
    expect(band.inner).toBeGreaterThan(KEEP_TECHNIQUE_NEAR_FLOOR_PX); // 前提: 帯の内側は密着より外
    expect(keepBlocksTechnique('pumpkin', 'pk1', 100, 246, band.inner - 1)).toBe(false);
    for (const d of [60, 90, 120, 160]) {
      expect(keepBlocksTechnique('pumpkin', 'pk1', 100, 246, d), `${d}px`).toBe(false);
    }
  });

  it('★引き金の上限(発動距離)は変えない=帯の中・外では技が出る', () => {
    const band = keepBandFor('werewolf', 'w1', 100, 246)!;
    expect(keepBlocksTechnique('werewolf', 'w1', 100, 246, band.inner + 1)).toBe(false);
    expect(keepBlocksTechnique('werewolf', 'w1', 100, 246, 246)).toBe(false);
  });

  it('層の対象外の型は技を1ビットも止めない', () => {
    expect(keepBlocksTechnique('zombie', 'z1', 100, 246, 0)).toBe(false);
  });

  /**
   * ★不変条件(社長報告2026-09-19「カウンターした後は、横に回り込んでくるけど、その後攻撃して
   * こなくなる。ずっと回り込むだけ」の再発防止)。
   *
   * `outerPx` は**その型の技の発動距離**なので、帯は必ずその**内側**でなければならない。
   * 外へはみ出すと「帯に居る＝技の射程外」になり、**回り続けて技を出さない**。
   * 実測(骸骨・outerPx=100): はみ出していた頃の帯は 82.8〜107.8 で、技と技の間隔が
   * **13〜16秒**(技後CDは3500msしかない)。頭打ちを入れて **6.2秒周期**に戻った。
   * 同型の前例=リッチの「150〜200pxを回るだけで二度と噛まなくなった」。
   */
  it('★★帯の外側は技の発動距離を絶対に超えない(超えると「回るだけで攻撃しない」)', () => {
    const TYPES = ['bat', 'skeleton', 'werewolf', 'lab-zombie-2', 'pumpkin', 'lab-zombie-3', 'lich'] as const;
    for (const t of TYPES) {
      for (const outerPx of [30, 100, 174, 246, 400]) {
        for (let k = 0; k < 200; k++) {
          const band = keepBandFor(t, `probe-${k}`, 1000 + k * 37, outerPx)!;
          expect(band.outer).toBeLessThanOrEqual(outerPx);
          expect(band.inner).toBeLessThan(band.outer); // 帯が潰れていない
        }
      }
    }
  });
});

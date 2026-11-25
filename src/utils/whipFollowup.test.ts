// 鞭の追加攻撃(research/WHIP_FOLLOWUP.md §7・§6)の純関数: 鞭の浮きの形・当たりの分類(浮かせる/叩きつけ/普通の打撃)・
// スラッシャーの追加の振り(段数・時刻・最後は叩きつけ・狙い)・叩きつけの爆発。
import { describe, it, expect } from 'vitest';
import {
  whipLiftPatch, whipLiftTop, whipLiftApexAt, whipLiftFallAt, whipReliftPeak, WHIP_LIFT_SHAPE, WHIP_LIFT_MS,
  WHIP_LIFT_RISE_MS, WHIP_LIFT_HOVER_MS, WHIP_LIFT_FALL_MS, WHIP_LIFT_HEIGHT_MULT, WHIP_KEEP_MARGIN_MS,
  classifyWhipHit, whipChainExtras, whipChainModeAt, planWhipChain, startWhipChain, dueWhipChainStep, nextWhipChain, whipChainActive, whipChainAimDir, whipChainAfterStall,
  WHIP_CHAIN_INTERVAL_MS, whipSlamBlastPlan, whipSlamBlastFalloff,
} from './whipFollowup';
import { brawlerJuggleHeightRel, brawlerJugglePush, brawlerAirborne, brawlerLiftVisBasePx, BRAWLER_JUGGLE_WEIGHT, type BrawlerJuggleFields } from './brawlerCombo';
import { brawlerLiftArcRel, BRAWLER_LIFT_VIS_BODY_K, BRAWLER_LIFT_VIS_MAX_VIEW_FRAC } from './brawler';

const T0 = 1_000_000;
/** 弧の高さを ms ごとに取る。 */
const heights = (e: BrawlerJuggleFields, from: number, to: number, stepMs = 5) => {
  const out: number[] = [];
  for (let t = from; t <= to; t += stepMs) out.push(brawlerJuggleHeightRel(e, t));
  return out;
};

describe('鞭の浮きの形(0.4秒かけて頂点へ・加速→減速・頂点で漂って落ちる)', () => {
  const lifted = { ...whipLiftPatch({}, 'mob', T0) } as BrawlerJuggleFields;
  it('地上から浮かせると鞭の弧(0.4秒で頂点・頂点は格闘の4段目の打ち上げの2倍・区分の重さ)', () => {
    expect(lifted.brLiftShape).toBe('whip');
    expect(lifted.brLiftMs).toBe(WHIP_LIFT_MS);
    expect(WHIP_LIFT_MS).toBe(WHIP_LIFT_RISE_MS + WHIP_LIFT_HOVER_MS + WHIP_LIFT_FALL_MS);
    expect(whipLiftApexAt(lifted)).toBe(T0 + WHIP_LIFT_RISE_MS);
    expect(WHIP_LIFT_RISE_MS).toBe(400); // 社長指示2026-11-25「0.4秒に変更」
    expect(whipLiftTop('mob')).toBe(WHIP_LIFT_HEIGHT_MULT * BRAWLER_JUGGLE_WEIGHT.mob);
    expect(whipLiftTop('strong')).toBe(WHIP_LIFT_HEIGHT_MULT * BRAWLER_JUGGLE_WEIGHT.strong);
    // 格闘の4段目(地上の打ち上げ)の頂点の2倍
    const s4 = brawlerJugglePush({}, 'mob', 's4', T0, false, false);
    expect(lifted.brLiftPeak).toBeCloseTo(WHIP_LIFT_HEIGHT_MULT * (s4?.brLiftPeak ?? 0));
    expect(brawlerJuggleHeightRel(lifted, T0 + WHIP_LIFT_RISE_MS)).toBeCloseTo(whipLiftTop('mob'), 6);
  });
  it('上りは速さ0から加速し、頂点の手前で減速して速さ0で着く(パッと動かない・パッと止まらない)', () => {
    const h = heights(lifted, T0, T0 + WHIP_LIFT_RISE_MS, WHIP_LIFT_RISE_MS / 200); // 上りの尺に比例した刻み(0.4秒へ縮めた時に刻みが粗くならないよう)
    const v = h.slice(1).map((x, i) => x - h[i]);
    expect(v.every(d => d >= -1e-12)).toBe(true); // 上りの間は下がらない
    const peakI = v.indexOf(Math.max(...v));
    expect(peakI).toBeGreaterThan(5); // 出だしが一番速くない(加速がある)
    expect(peakI).toBeLessThan(v.length - 5); // 着く手前が一番速くない(減速がある)
    expect(v[0]).toBeLessThan(Math.max(...v) * 0.1);
    expect(v[v.length - 1]).toBeLessThan(Math.max(...v) * 0.1);
  });
  it('頂点で少し漂い、落ちて地面で終わる。高さは跳ばない(つなぎ目で連続)', () => {
    const h = heights(lifted, T0, T0 + WHIP_LIFT_MS, 1);
    for (let i = 1; i < h.length; i++) expect(Math.abs(h[i] - h[i - 1])).toBeLessThan(0.05);
    const top = whipLiftTop('mob');
    expect(brawlerJuggleHeightRel(lifted, T0 + WHIP_LIFT_RISE_MS + WHIP_LIFT_HOVER_MS)).toBeGreaterThan(top * 0.9); // 漂いの間はほぼ頂点
    expect(brawlerAirborne(lifted, T0 + WHIP_LIFT_MS - 1)).toBe(true);
    expect(brawlerAirborne(lifted, T0 + WHIP_LIFT_MS)).toBe(false);
  });
  it('式は格闘の浮きと同じ1本(brawlerLiftArcRel)に鞭の形を渡しているだけ', () => {
    for (const u of [0.1, 0.4, 0.55, 0.7, 0.9]) {
      expect(brawlerJuggleHeightRel(lifted, T0 + u * WHIP_LIFT_MS)).toBeCloseTo(brawlerLiftArcRel(u, 0, whipLiftTop('mob'), WHIP_LIFT_SHAPE), 9);
    }
  });
  it('格闘・爆発の浮きの形は変わらない(上りは打たれた瞬間が一番速い ease-out のまま)', () => {
    const s4 = brawlerJugglePush({}, 'mob', 's4', T0, false, false)! as BrawlerJuggleFields;
    const h = heights(s4, T0, T0 + 60, 5);
    const v = h.slice(1).map((x, i) => x - h[i]);
    expect(v[0]).toBe(Math.max(...v));
  });
  it('画面の上限の割合は格闘と同じ(高さの倍率で割る)。小さい敵は体の高さの割合のまま=格闘の2倍の高さ', () => {
    const viewH = 900;
    const smallBox = 60, bigBox = 2000;
    expect(brawlerLiftVisBasePx({ brLiftShape: 'whip' }, smallBox, viewH)).toBeCloseTo(smallBox * BRAWLER_LIFT_VIS_BODY_K);
    expect(brawlerLiftVisBasePx({ brLiftShape: 'whip' }, bigBox, viewH) * whipLiftTop('mob')).toBeCloseTo(viewH * BRAWLER_LIFT_VIS_MAX_VIEW_FRAC * BRAWLER_JUGGLE_WEIGHT.mob);
    expect(brawlerLiftVisBasePx({}, bigBox, viewH)).toBeCloseTo(viewH * BRAWLER_LIFT_VIS_MAX_VIEW_FRAC); // 格闘は今のまま
  });
});

describe('浮かせ続ける(スラッシャーの追加の振り)', () => {
  const lifted = { ...whipLiftPatch({}, 'mob', T0) } as BrawlerJuggleFields;
  it('上りの途中で当たった: 上りの高さはそのまま(跳ばない)で、漂いが次の振りの後まで伸びる', () => {
    const at = T0 + Math.round(WHIP_LIFT_RISE_MS / 2); // 上りの途中(上りが追加の振りの間隔より短くなったので、上りの半ばで当てる)
    const kept = { ...lifted, ...whipLiftPatch(lifted, 'mob', at, WHIP_CHAIN_INTERVAL_MS) } as BrawlerJuggleFields;
    for (let t = T0; t <= T0 + WHIP_LIFT_RISE_MS; t += 25) expect(brawlerJuggleHeightRel(kept, t)).toBeCloseTo(brawlerJuggleHeightRel(lifted, t), 9);
    expect(whipLiftApexAt(kept)).toBe(whipLiftApexAt(lifted));
    expect(whipLiftFallAt(kept)!).toBeGreaterThanOrEqual(at + WHIP_CHAIN_INTERVAL_MS + WHIP_KEEP_MARGIN_MS - 1);
    expect(whipLiftFallAt(kept)!).toBeGreaterThanOrEqual(whipLiftFallAt(lifted)!); // 早く落ちることはない
  });
  it('頂点の後(漂い・落ち)で当たった: 今の高さから打ち上げ直す(高さは跳ばず、そこから上がる)・次の振りまで浮いている', () => {
    const at = T0 + WHIP_LIFT_RISE_MS + WHIP_LIFT_HOVER_MS + 200; // 落ち始めて少し
    const h0 = brawlerJuggleHeightRel(lifted, at);
    const re = { ...lifted, ...whipLiftPatch(lifted, 'mob', at, WHIP_CHAIN_INTERVAL_MS) } as BrawlerJuggleFields;
    expect(brawlerJuggleHeightRel(re, at + 1)).toBeCloseTo(h0, 1);
    expect(brawlerJuggleHeightRel(re, at + 200)).toBeGreaterThan(h0);
    expect(brawlerAirborne(re, at + WHIP_CHAIN_INTERVAL_MS + 1)).toBe(true);
    expect(brawlerJuggleHeightRel(re, at + WHIP_CHAIN_INTERVAL_MS)).toBeGreaterThan(whipLiftTop('mob') * 0.9);
  });
  it('浮かせ直しの押し上げ量は、格闘の浮き直しの頂点の式で狙った高さに届く最小', () => {
    for (const [h, want] of [[0, 2], [1, 2], [1.9, 2.16], [2, 2.16], [0.5, 1.4]]) {
      const p = whipReliftPeak(h, want);
      expect(Math.max(0.8 * h + p, h + 0.3 * p)).toBeCloseTo(want, 9);
    }
  });
});

describe('当たりの分類(浮かせる/叩きつけ/普通の打撃)', () => {
  const g = { boss: false, airborne: false, liftable: true };
  it('普通の振り: 地上は浮かせる・浮いている敵は叩きつけ(同じ振りで両方起こる)', () => {
    expect(classifyWhipHit(g, 'swing')).toBe('lift');
    expect(classifyWhipHit({ ...g, airborne: true }, 'swing')).toBe('slam');
  });
  it('ボス級は浮かない=叩きつけにもならない(普通の打撃のまま)', () => {
    for (const mode of ['swing', 'keep', 'final'] as const) {
      expect(classifyWhipHit({ ...g, boss: true }, mode)).toBe('plain');
      expect(classifyWhipHit({ ...g, boss: true, airborne: true }, mode)).toBe('plain');
    }
  });
  it('浮かせられない状況(技の最中・専用の動かし手の型)の地上の敵は普通の打撃', () => {
    expect(classifyWhipHit({ ...g, liftable: false }, 'swing')).toBe('plain');
    expect(classifyWhipHit({ ...g, liftable: false }, 'keep')).toBe('plain');
  });
  it('追加の振り: 最後以外は浮かせ続ける(浮いていても叩きつけない)・最後は必ず叩きつけ', () => {
    expect(classifyWhipHit({ ...g, airborne: true }, 'keep')).toBe('lift');
    expect(classifyWhipHit(g, 'keep')).toBe('lift');
    expect(classifyWhipHit({ ...g, airborne: true }, 'final')).toBe('slam');
  });
});

describe('スラッシャーの追加の振り(0.5秒ごと・段数ぶん・最後は叩きつけ)', () => {
  it('段数: Lv1=追加1 / Lv2=追加2 / Lv3=追加3(スラッシャーの最大2/3/4連から1発目を除いた数)・無し=0', () => {
    expect([0, 1, 2, 3].map(whipChainExtras)).toEqual([0, 1, 2, 3]);
    expect(whipChainExtras(5)).toBe(3);
  });
  it('時刻は1発目から0.5秒ごと・最後の1発だけ叩きつけ', () => {
    expect(planWhipChain(T0, 3)).toEqual([
      { at: T0 + 500, mode: 'keep' }, { at: T0 + 1000, mode: 'keep' }, { at: T0 + 1500, mode: 'final' },
    ]);
    expect(planWhipChain(T0, 1)).toEqual([{ at: T0 + 500, mode: 'final' }]);
    expect(planWhipChain(T0, 0)).toEqual([]);
    expect(WHIP_CHAIN_INTERVAL_MS).toBe(500);
    for (const n of [1, 2, 3]) expect(whipChainModeAt(n, n)).toBe('final');
  });
  it('状態を進めると計画どおりに出る(時刻前は出ない・最後を出したら終わる)', () => {
    let c = startWhipChain(T0, 3, 1, 0, ['a']);
    const seen: { at: number; mode: string }[] = [];
    for (let t = T0; t <= T0 + 2000 && c; t += 10) {
      const s = dueWhipChainStep(c, t);
      if (!s) continue;
      seen.push({ at: t, mode: s.mode });
      c = nextWhipChain(c, t);
    }
    expect(seen).toEqual(planWhipChain(T0, 3));
    expect(c).toBeNull();
    expect(whipChainActive(c)).toBe(false);
    expect(startWhipChain(T0, 0, 1, 0, [])).toBeNull(); // スラッシャーなし=連続なし
    expect(dueWhipChainStep(startWhipChain(T0, 2, 1, 0, []), T0 + 499)).toBeNull();
  });
  it('時計が止まっていた後(ポーズ相当)は取りこぼした段を出さず後ろへずらす=1フレームで2段以上出ない', () => {
    let c = startWhipChain(T0, 3, 1, 0, ['a']);
    // 1つ目を出した後、長く止まる
    c = nextWhipChain(c!, T0 + 500);
    const t = T0 + 60_000;
    expect(dueWhipChainStep(c, t)).toBeNull(); // 遅れすぎ=この時刻には出さない
    const r = whipChainAfterStall(c!, t);
    expect(r.nextAt).toBe(t + WHIP_CHAIN_INTERVAL_MS);
    expect(r.done).toBe(1); // 段は飛ばさない(後ろへずらすだけ)
    // 置き直した後、同じ時刻・直後のフレームでは出ない。1間隔後に1つだけ出る。
    expect(dueWhipChainStep(r, t)).toBeNull();
    expect(dueWhipChainStep(r, t + 16)).toBeNull();
    const s = dueWhipChainStep(r, t + WHIP_CHAIN_INTERVAL_MS);
    expect(s?.k).toBe(2);
    const n = nextWhipChain(r, t + WHIP_CHAIN_INTERVAL_MS);
    expect(dueWhipChainStep(n, t + WHIP_CHAIN_INTERVAL_MS + 16)).toBeNull();
    // 遅れが1間隔以内なら置き直さない(同じ状態)・次は実際に出した時刻から1間隔後
    const c2 = startWhipChain(T0, 3, 1, 0, [])!;
    expect(whipChainAfterStall(c2, T0 + 500 + WHIP_CHAIN_INTERVAL_MS)).toBe(c2);
    expect(nextWhipChain(c2, T0 + 900)?.nextAt).toBe(T0 + 900 + WHIP_CHAIN_INTERVAL_MS);
  });
  it('狙い: 1発目で浮いた敵の一番近い敵へ向ける・居なければ1発目の向き', () => {
    const c = { dirX: 1, dirY: 0 };
    expect(whipChainAimDir(c, 0, 0, [])).toEqual({ x: 1, y: 0 });
    const d = whipChainAimDir(c, 0, 0, [{ x: 0, y: 100 }, { x: 0, y: -40 }]);
    expect(d.x).toBeCloseTo(0); expect(d.y).toBeCloseTo(-1);
  });
});

describe('叩きつけの爆発(社長「爆発は叩きつけられた敵を中心にです」)', () => {
  const pt = (id: string, x: number, y: number) => ({ id, anchor: () => ({ x, y }) });
  it('減りは手榴弾と同じ(爆心1・縁0.55)', () => {
    expect(whipSlamBlastFalloff(0, 66)).toBe(1);
    expect(whipSlamBlastFalloff(66, 66)).toBeCloseTo(0.55);
    expect(whipSlamBlastFalloff(33, 66)).toBeCloseTo(0.775);
  });
  it('爆心の敵本体には入らない(鞭の打撃で当てる=二重にしない)・半径の外と壁越しは当たらない', () => {
    const plan = whipSlamBlastPlan([{ id: 'a', x: 0, y: 0 }],
      [pt('a', 0, 0), pt('near', 30, 0), pt('far', 100, 0), { ...pt('wall', 10, 0), blocked: () => true }], 66);
    expect(plan).toEqual([{ centerId: 'a', targetId: 'near', dist: 30, scale: whipSlamBlastFalloff(30, 66) }]);
  });
  it('叩きつけた敵が複数=1体ずつを中心に爆発。重なりは手榴弾の同時爆発と同じ=それぞれ独立に当たる', () => {
    const plan = whipSlamBlastPlan([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 40, y: 0 }],
      [pt('a', 0, 0), pt('b', 40, 0), pt('mid', 20, 0)], 66);
    expect(plan.filter(h => h.targetId === 'mid').map(h => h.centerId)).toEqual(['a', 'b']);
    // 叩きつけた a は自分の爆発は受けず、近くの b の爆発(減った分)だけ受ける。
    expect(plan.filter(h => h.targetId === 'a').map(h => [h.centerId, h.scale])).toEqual([['b', whipSlamBlastFalloff(40, 66)]]);
  });
});

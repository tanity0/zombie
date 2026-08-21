// カウンター成立域(reach)の宣言表の機械検査 — research/COUNTER_REACH_AUDIT.md の是正(v0.25.3591)
//
// この2本が「同じ穴を4度目に踏まない」ための装置(監査の推薦を機械化したもの):
//  ① **完全性**: カウンターが通る州は、全部この表に宣言が要る。新しい技の州を足して宣言を忘れると落ちる。
//  ② **一致**: 表が 'band' と言う州は、実装(counterReachShapeFor)も本当に帯を返す(表が飾りにならない)。
// 加えて幾何そのもの(帯/円/体/紫)の判定を単体で固める。
import { describe, it, expect } from 'vitest';
import {
  COUNTER_REACH_DECL, counterReachKindFor, counterReachShapeFor, inCounterReach,
  HIDDEN_COUNTER_WINDUP_STATES, HIDDEN_COUNTER_RECOVER_STATES, HIDDEN_COUNTER_ACTIVE_STATES,
} from './counterReach';
import {
  BOUNTY_WINDUP_STATES, BOUNTY_RECOVER_STATES, BOUNTY_ACTIVE_COUNTER_STATES,
} from './bountyTick';
import { IDOL_WINDUP_STATES, IDOL_RECOVER_STATES, IDOL_REST_STATE } from './idolTick';
import { BOUNTY_MELEE_TUNING as BM_T, BOUNTY_BALANCE_TUNING as BB_T, BOUNTY_MAIKO_TUNING as MK_T } from './bountyScript';
import { ANGEL_RAFI_TUNING as RF_T, ANGEL_ACRASIEL_TUNING as AC_T } from './angelScript';
import { HIDDEN_JORMUNGAND_TUNING as HB_JO, HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { MIMIR_BITE_RADIUS } from './bodyCenteredAoe';

const CTX = { bcx: 0, bcy: 0, pcx: 100, pcy: 0 };
const BOSS = { x: -22, y: -22, width: 44, height: 44 };   // 賞金首と同寸(44×44)・中心(0,0)
/** 中心(x,y)に立つプレイヤーの矩形(28×28=半径14)。 */
const playerAt = (x: number, y: number) => ({ x: x - 14, y: y - 14, width: 28, height: 28 });

describe('① 完全性: カウンターが通る州は必ず宣言表に載っている(新しい技の宣言漏れ検知)', () => {
  const missing = (prefix: string, states: readonly string[]): string[] =>
    states.filter(s => COUNTER_REACH_DECL[`${prefix}:${s}`] === undefined).map(s => `${prefix}:${s}`);

  it('賞金首4種(windup/実行中/硬直)', () => {
    expect(missing('bounty', [...BOUNTY_WINDUP_STATES, ...BOUNTY_ACTIVE_COUNTER_STATES, ...BOUNTY_RECOVER_STATES])).toEqual([]);
  });
  it('裏ボス4体(windup/実行中/硬直)', () => {
    expect(missing('hidden', [...HIDDEN_COUNTER_WINDUP_STATES, ...HIDDEN_COUNTER_ACTIVE_STATES, ...HIDDEN_COUNTER_RECOVER_STATES])).toEqual([]);
  });
  it('idol(windup/硬直/休符)', () => {
    expect(missing('idol', [...IDOL_WINDUP_STATES, ...IDOL_RECOVER_STATES, IDOL_REST_STATE])).toEqual([]);
  });
  // research/GHOST_BOSS.md v6: 幻影は**予告も硬直も持たない**(即発ミラー)ため州が存在しない=
  // 宣言表にも載らない(カウンターは幻影に成立しない、が裁定)。よってこの系統の完全性検査は無い。
  // 天使6体は州名が6体で衝突する(rafiとuriの'sweep-windup'は別寸法)ため州リストを持たない。
  // ここでは**宣言されている天使の州は必ず図形reach**(=体の重なりならわざわざ宣言しない)ことだけ固める。
  it('天使の宣言は全て図形reach(体の重なりの州は宣言しない=表を無駄に太らせない)', () => {
    // ※v6で 'gp:'(幻影)の宣言は全撤去されたので、許可リストからも外してある。
    const angelKeys = Object.keys(COUNTER_REACH_DECL)
      .filter(k => !k.startsWith('bounty:') && !k.startsWith('hidden:') && !k.startsWith('idol:'));
    expect(angelKeys.length).toBeGreaterThan(0);
    for (const k of angelKeys) expect(COUNTER_REACH_DECL[k], k).not.toBe('body');
  });
});

describe('② 一致: 宣言した図形と、実装が組む図形が食い違わない(表が飾りにならない)', () => {
  it('全宣言について counterReachShapeFor().kind === 宣言', () => {
    for (const key of Object.keys(COUNTER_REACH_DECL)) {
      const shape = counterReachShapeFor(key, { ...CTX, aiTargetX: 200, aiTargetY: 0, tripleAng: 0, ballX: 50, ballY: 0 });
      expect(shape.kind, key).toBe(COUNTER_REACH_DECL[key]);
    }
  });
  it('未宣言の州は従来どおり体の重なり(既定を変えない)', () => {
    expect(counterReachKindFor('bounty:such-a-state-does-not-exist')).toBe('body');
    expect(counterReachShapeFor('bounty:such-a-state-does-not-exist', CTX).kind).toBe('body');
  });
});

describe('③ 寸法は技のテーブルを読む(赤い予告と同じ数字=「赤いのに当たらない」の再発防止)', () => {
  it('自分中心円: 360度ムチ=whip360.radius / 噛みつき=MIMIR_BITE_RADIUS / 毬回し=spin.radius', () => {
    const w = counterReachShapeFor('bounty:bm-whip360', CTX);
    expect(w.kind === 'circle' && w.radius).toBe(BM_T.whip360.radius);
    const b = counterReachShapeFor('hidden:bite-windup', CTX);
    expect(b.kind === 'circle' && b.radius).toBe(MIMIR_BITE_RADIUS);
    const s = counterReachShapeFor('bounty:mk-spin', CTX);
    expect(s.kind === 'circle' && s.radius).toBe(MK_T.spin.radius);
  });
  it('着地円: 鋏の跳びかかり=leap.radius / ラフィの跳びかかり=jump.radius / 転移=warp.impactRadius', () => {
    const at = { ...CTX, aiTargetX: 300, aiTargetY: 40 };
    const l = counterReachShapeFor('bounty:leap-windup', at);
    expect(l.kind === 'circle' && [l.cx, l.cy, l.radius]).toEqual([300, 40, BB_T.leap.radius]);
    const j = counterReachShapeFor('rafi:jump-windup', at);
    expect(j.kind === 'circle' && j.radius).toBe(RF_T.jump.radius);
    const w = counterReachShapeFor('acrasiel:warp-in', at);
    expect(w.kind === 'circle' && w.radius).toBe(AC_T.warp.impactRadius);
  });
  it('帯: うねり=coil.halfWidth / ラフィの薙ぎ=sweep.halfWidth', () => {
    const at = { ...CTX, aiFromX: 0, aiFromY: 0, aiTargetX: 310, aiTargetY: 0 };
    const c = counterReachShapeFor('hidden:coil-windup', at);
    expect(c.kind === 'band' && c.bands[0].halfWidth).toBe(HB_JO.coil.halfWidth);
    const s = counterReachShapeFor('rafi:sweep', at);
    expect(s.kind === 'band' && s.bands[0].halfWidth).toBe(RF_T.sweep.halfWidth);
  });
  it('水鳥乱舞の最終段だけ大円(finalRadiusMult)', () => {
    const at = { ...CTX, aiTargetX: 0, aiTargetY: 0 };
    const h1 = counterReachShapeFor('bounty:mk-suiu-hop1', at);
    const h3 = counterReachShapeFor('bounty:mk-suiu-hop3', at);
    expect(h1.kind === 'circle' && h1.radius).toBe(MK_T.suiu.radius);
    expect(h3.kind === 'circle' && h3.radius).toBe(MK_T.suiu.radius * MK_T.suiu.finalRadiusMult);
  });
  // ★v6: 幻影(gp:*)の帯テストは撤去。予告そのものが無くなったので成立域も存在しない。
  it('三段突きは帯3本(brTripleAnglesと同じ左右±20度)', () => {
    const t = counterReachShapeFor('bounty:br-triple-windup', { ...CTX, tripleAng: 0 });
    expect(t.kind === 'band' && t.bands.length).toBe(3);
  });
});

describe('④ 幾何: 体に触れていなくても赤の中なら成立 / 赤の外なら不成立 / 紫は常に不成立', () => {
  it('円: 半径+自機半径の内側で成立、外側で不成立(体には一切触れていない)', () => {
    const shape = counterReachShapeFor('bounty:mk-spin', CTX); // r=180・自分中心
    expect(inCounterReach(shape, playerAt(150, 0), BOSS)).toBe(true);   // 体(±22)の外・円の中
    expect(inCounterReach(shape, playerAt(400, 0), BOSS)).toBe(false);  // 円の外
  });
  it('帯: 軸上の遠い位置でも帯の中なら成立、横へ出れば不成立', () => {
    const shape = counterReachShapeFor('hidden:coil-windup', { ...CTX, aiFromX: 0, aiFromY: 0, aiTargetX: 310, aiTargetY: 0 });
    expect(inCounterReach(shape, playerAt(200, 0), BOSS)).toBe(true);
    expect(inCounterReach(shape, playerAt(200, 300), BOSS)).toBe(false);
  });
  it('体の重なり(既定)は従来どおり=矩形が重なる時だけ', () => {
    const shape = counterReachShapeFor('bounty:mk-boom-windup', CTX);
    expect(inCounterReach(shape, playerAt(0, 0), BOSS)).toBe(true);
    expect(inCounterReach(shape, playerAt(100, 0), BOSS)).toBe(false);
  });
  it('★紫(狙撃)は、帯の中に居ても・体に重なっていても成立しない(避けるだけの技)', () => {
    for (const key of ['bounty:bm-snipe-windup', 'idol:idol-snipe-windup']) {
      const shape = counterReachShapeFor(key, { ...CTX, aiFromX: 0, aiFromY: 0, aiTargetX: 900, aiTargetY: 0 });
      expect(shape.kind, key).toBe('none');
      expect(inCounterReach(shape, playerAt(400, 0), BOSS), key).toBe(false);
      expect(inCounterReach(shape, playerAt(0, 0), BOSS), key).toBe(false);
    }
  });
  it('★狙撃の溜めはカウンター可能州の一覧からも外れている(接触でも取れない=紫と一貫)', () => {
    expect(BOUNTY_WINDUP_STATES).not.toContain('bm-snipe-windup');
    expect(BOUNTY_RECOVER_STATES).toContain('bm-snipe-recover'); // 硬直は従来どおり可
  });
});

// ================================================================================================
// ★v0.25.3780(research/THOR_ISSEN_REWORK.md §8-2・社長裁定「赤いのにカウンターできないは
// 聞くまでもなく直すでしょ」): トールを宣言表へ乗せた。旧実装は `hiddenBossCounterableNow` の
// `boss.type !== 'thor'` でこの表を素通りし、溜め中は**体の重なりだけ**で成立していた。
// ================================================================================================
describe('⑤ トール: 赤い予告の図形=成立域(§8-2)', () => {
  it('溜めの3州(一閃/突き/払い)+新技の突進が、カウンター可能州の一覧に載っている', () => {
    for (const st of ['issen-windup', 'tsuki-windup', 'harai-windup', 'jump-windup', 'thor-dash-windup']) {
      expect(HIDDEN_COUNTER_WINDUP_STATES, st).toContain(st);
    }
    for (const st of ['issen-recover', 'tsuki-recover', 'harai-recover', 'jump-recover', 'thor-dash-recover']) {
      expect(HIDDEN_COUNTER_RECOVER_STATES, st).toContain(st);
    }
  });

  it('★無の境地(紫)は一覧に載っていない+宣言も none=二重に閉じてある(§1-1 受け入れ条件2)', () => {
    expect(HIDDEN_COUNTER_WINDUP_STATES).not.toContain('issen-nihil');
    expect(HIDDEN_COUNTER_RECOVER_STATES).not.toContain('issen-nihil');
    expect(HIDDEN_COUNTER_ACTIVE_STATES).not.toContain('issen-nihil');
    const shape = counterReachShapeFor('hidden:issen-nihil', { ...CTX, aiFromX: 0, aiFromY: 0, aiTargetX: 310, aiTargetY: 0 });
    expect(shape.kind).toBe('none');
    // 円の中に居ても・体に重なっていても成立しない。
    expect(inCounterReach(shape, playerAt(100, 0), BOSS)).toBe(false);
    expect(inCounterReach(shape, playerAt(0, 0), BOSS)).toBe(false);
  });

  it('寸法は台帳を直読みしている(一閃=issen.halfWidth / 払い=harai.halfWidth)', () => {
    const at = { ...CTX, aiFromX: 0, aiFromY: 0, aiTargetX: 310, aiTargetY: 0 };
    const i = counterReachShapeFor('hidden:issen-windup', at);
    expect(i.kind === 'band' && i.bands[0].halfWidth).toBe(HB_TH.issen.halfWidth);
    const h = counterReachShapeFor('hidden:harai-windup', at);
    expect(h.kind === 'band' && h.bands[0].halfWidth).toBe(HB_TH.harai.halfWidth);
  });

  it('★突きの帯は「狙い点そのもの」ではなく「狙いの向き×range」で組む(実行時の帯と同じ式)', () => {
    // 狙い点(aiTarget)は射程より**手前**(80px)。帯は range(300)まで伸びていなければならない。
    const near = counterReachShapeFor('hidden:tsuki-windup', { ...CTX, aiTargetX: 80, aiTargetY: 0 });
    expect(near.kind === 'band' && near.bands[0]).toEqual({
      fx: 0, fy: 0, tx: HB_TH.tsuki.range, ty: 0, halfWidth: HB_TH.tsuki.halfWidth,
    });
    // 狙い点が射程より**遠く**(900px)ても帯の長さは range のまま。
    const far = counterReachShapeFor('hidden:tsuki-windup', { ...CTX, aiTargetX: 900, aiTargetY: 0 });
    expect(far.kind === 'band' && far.bands[0].tx).toBe(HB_TH.tsuki.range);
    // 帯の中(体には触れていない)でカウンターが成立する=これが§8-2の是正の中身。
    expect(inCounterReach(near, playerAt(250, 0), BOSS)).toBe(true);
    expect(inCounterReach(near, playerAt(250, 300), BOSS)).toBe(false);
  });

  it('硬直と飛び掛かりの溜め・突進は従来どおり「体の重なり」(挙動を変えていない州)', () => {
    for (const k of ['hidden:issen-recover', 'hidden:tsuki-recover', 'hidden:harai-recover',
      'hidden:jump-windup', 'hidden:jump-recover', 'hidden:thor-dash-windup', 'hidden:thor-dash-recover']) {
      expect(counterReachKindFor(k), k).toBe('body');
    }
  });

  it('★他ボスの宣言が1つも変わっていない(除外撤去がトール以外へ波及していない)', () => {
    expect(counterReachKindFor('hidden:dash-windup')).toBe('body');   // 裏ボス3体の突進
    expect(counterReachKindFor('hidden:dash')).toBe('body');
    expect(counterReachKindFor('hidden:bite-windup')).toBe('circle'); // ミーミル
    expect(counterReachKindFor('hidden:coil-windup')).toBe('band');   // ヨルムンガルド
    expect(counterReachKindFor('hidden:laser-windup')).toBe('body');
    // 裏ボス3体はトールの州を1つも持たない=一覧へ足しても評価対象にならない。
    for (const st of ['issen-windup', 'tsuki-windup', 'harai-windup', 'thor-dash-windup', 'issen-nihil']) {
      expect(HIDDEN_COUNTER_ACTIVE_STATES, st).not.toContain(st);
    }
  });
});

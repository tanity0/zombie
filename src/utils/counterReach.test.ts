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
  shouldSkipBossContactParry, skipThorDashRunContactDamage,
} from './counterReach';
import {
  BOUNTY_WINDUP_STATES, BOUNTY_RECOVER_STATES, BOUNTY_ACTIVE_COUNTER_STATES,
} from './bountyTick';
import { IDOL_WINDUP_STATES, IDOL_RECOVER_STATES, IDOL_REST_STATE } from './idolTick';
import { BOUNTY_MELEE_TUNING as BM_T, BOUNTY_BALANCE_TUNING as BB_T, BOUNTY_MAIKO_TUNING as MK_T } from './bountyScript';
import { ANGEL_RAFI_TUNING as RF_T, ANGEL_ACRASIEL_TUNING as AC_T } from './angelScript';
import { HIDDEN_JORMUNGAND_TUNING as HB_JO, HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { MIMIR_BITE_RADIUS } from './bodyCenteredAoe';

// ★v0.25.3809(8巡目 重大4): 受け流しスキップの述語は**呼ばれていること**まで固定する。
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// thorNihil.test.ts / meleeSwingCommit.test.ts と同じ作法)。
const COMBAT_TICK_SOURCES = import.meta.glob<string>(
  ['./combatTick.ts'], { query: '?raw', import: 'default', eager: true },
);

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
      // ctx は「盤面の値が全部揃っている」場合。landingLocked も揃っている側(=台本ON)で見る
      // (台本OFFで 'body' へ落ちることは ⑤ の専用テストが別に固定する)。
      const shape = counterReachShapeFor(key, { ...CTX, aiTargetX: 200, aiTargetY: 0, tripleAng: 0, ballX: 50, ballY: 0, landingLocked: true });
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

  // ★v0.25.3793(検収監査 重大1): **2巡連続で実機から消えた挙動に回帰テストが1本も無かった**。
  // v0.25.3784→3785 の事故は「走行中の突進が共通カウンターブロックに載っていない」=
  // `HIDDEN_COUNTER_ACTIVE_STATES` から `'thor-dash-move'` が抜けることで再発する。ところが
  // ⑤の既存3本は**「載っていない」側(not.toContain)しか固定していなかった**ので、この行を
  // 消しても全テストが緑のまま通ってしまった。**載っている側**を固定する。
  it('★走行中の突進(thor-dash-move)が実行中カウンター州の一覧に載っている(消すと弾き返し/専用CDが実機から消える)', () => {
    expect(HIDDEN_COUNTER_ACTIVE_STATES).toContain('thor-dash-move');
    // 宣言は裏ボスの突進('hidden:dash')と同じ 'body'=成立域は旧実装(生の rectsOverlap)と同一。
    // ここが 'band'/'circle'/'none' へ動くと、走行中の取り方が黙って変わる。
    expect(COUNTER_REACH_DECL['hidden:thor-dash-move']).toBe('body');
    expect(counterReachKindFor('hidden:thor-dash-move')).toBe('body');
    // 実際の図形も体の重なり=重なっていれば成立・離れていれば不成立(宣言が飾りでないこと)。
    const shape = counterReachShapeFor('hidden:thor-dash-move', CTX);
    expect(shape.kind).toBe('body');
    expect(inCounterReach(shape, playerAt(0, 0), BOSS)).toBe(true);
    expect(inCounterReach(shape, playerAt(300, 0), BOSS)).toBe(false);
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

  it('硬直と突進の溜めは従来どおり「体の重なり」(挙動を変えていない州)', () => {
    for (const k of ['hidden:issen-recover', 'hidden:tsuki-recover', 'hidden:harai-recover',
      'hidden:jump-recover', 'hidden:thor-dash-windup', 'hidden:thor-dash-recover']) {
      expect(counterReachKindFor(k), k).toBe('body');
    }
  });

  // ★v0.25.3810(§9-12・§8-2 の包括裁定「赤いのにカウンターできないは聞くまでもなく直すでしょ」):
  // ジャンプの溜めだけ `'body'` で、**赤い着地円を描いているのに体に当てないと取れなかった**。
  // → **円でも取れるようにした(体当ての経路はそのまま)**=赤い円を成立域へ**足した**。
  // ※v0.25.3810 はこれを `'circle'` への**置換**として実装しており、円と体は包含関係にない別集合なので
  //   「体当てで取る」経路が消えていた(着地点はヘイト次第で守護霊の足元にロックされる)。
  //   v0.25.3812 で `'circle-or-body'` へ訂正。
  it('★飛び掛かりの溜めは「着地円 または 体」(circle-or-body・中心=ロック済みの着地点/半径=jump.radius)', () => {
    expect(counterReachKindFor('hidden:jump-windup')).toBe('circle-or-body');
    const at = { ...CTX, aiTargetX: 300, aiTargetY: 40, landingLocked: true };
    const j = counterReachShapeFor('hidden:jump-windup', at);
    // 中心も半径もラフィ('rafi:jump-windup')・賞金首('bounty:leap-windup')と**同じ式**。
    expect(j.kind === 'circle-or-body' && [j.cx, j.cy, j.radius]).toEqual([300, 40, HB_TH.jump.radius]);
    // ①赤い円の中(ボスの体からは 300px 離れていて一切触れていない)で成立する=足した経路。
    expect(inCounterReach(j, playerAt(300, 40), BOSS)).toBe(true);
    // ②ボスの体に重なっている(円の中心からは遠い)場所でも成立する=**奪っていない**既存の経路。
    //   ボスは中心(0,0)の44×44、着地円は(300,40)なので、原点は円の外(距離302.6 > 110+14)。
    expect(Math.hypot(0 - 300, 0 - 40) > HB_TH.jump.radius + 14).toBe(true);
    expect(inCounterReach(j, playerAt(0, 0), BOSS)).toBe(true);
    // ③どちらでもない所(円の外・体からも離れている)では成立しない=「赤くないのに当たる」を作っていない。
    expect(inCounterReach(j, playerAt(300 + HB_TH.jump.radius + 200, 40), BOSS)).toBe(false);
  });

  // ★v0.25.3812(§5-8): `?thorscript=0`(台本OFF)は `beginThorJump` が着地点をロックせず、
  // `pixiScene` の `showLandingCircle` も溜め中は赤い円を描かない。溜め中の aiTarget は
  // **前の技の残骸**なので、そこを成立域にすると「画面に赤が1つも無い場所で成立」してしまう。
  it('★台本OFF(着地点が未ロック)では従来どおり「体の重なり」へ落ちる=赤くない場所で成立させない', () => {
    // landingLocked を渡さない/false = 台本OFF相当。
    const stale = { ...CTX, aiTargetX: 300, aiTargetY: 40 };
    const b = counterReachShapeFor('hidden:jump-windup', stale);
    expect(b.kind).toBe('body');
    expect(counterReachShapeFor('hidden:jump-windup', { ...stale, landingLocked: false }).kind).toBe('body');
    // 残骸の着地点(300,40)に立っても成立しない(赤い円が描かれていないから)。
    expect(inCounterReach(b, playerAt(300, 40), BOSS)).toBe(false);
    // 体に重なっていれば従来どおり成立する。
    expect(inCounterReach(b, playerAt(0, 0), BOSS)).toBe(true);
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

// =================================================================================================
// ★v0.25.3809(検収監査8巡目 重大4): 受け流し(bossContactParries)へ落とさない州の述語。
//
// v0.25.3808〜3817 の間、この述語は `combatTick` の**到達不能な行**にあった(暫定措置で走行中の
// 接触が forEach の冒頭で return していたため)。**それを守るテストが1本も無く、宣言ごと削除しても
// 全緑**だった(監査が実測)= 次の「デッドコード掃除」で消え、裁定の瞬間に
// v0.25.3785 重大A(受け流しがカウンターを丸ごと横取りする)が黙って戻る導火線だった。
// **★v0.25.3818 の社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」で除外が外れ、
// この述語は再び現役の分岐に戻っている**(=消すと重大Aがそのまま復活する)。
// =================================================================================================
describe('★受け流しへ落とさない州(shouldSkipBossContactParry)= §5-2 やること④', () => {
  it("★トールの走り(thor-dash-move)は true(=受け流しへ落とさない)", () => {
    expect(shouldSkipBossContactParry('thor', 'thor-dash-move')).toBe(true);
  });
  it('トールの他の州は false(=従来どおり受け流しへ落ちる)', () => {
    for (const st of ['chase', 'thor-dash-windup', 'thor-dash-recover', 'issen-windup', 'issen-nihil',
      'tsuki-windup', 'harai-windup', 'jump-windup', 'counter-leap', undefined]) {
      expect(shouldSkipBossContactParry('thor', st), String(st)).toBe(false);
    }
  });
  it('★他のボスは同名の州でも false(トール1体に閉じている=横展開していない)', () => {
    for (const t of ['mimir', 'jormungand', 'skadi', 'miguel', 'giantbat', 'zombie']) {
      expect(shouldSkipBossContactParry(t, 'thor-dash-move'), t).toBe(false);
      expect(shouldSkipBossContactParry(t, 'dash'), t).toBe(false);
    }
  });

  // ★述語を残しても、**呼び出し側を外せば**同じ実バグ(受け流しがカウンターを横取りする)が戻る。
  // 値のテストだけでは `const thorDashRunNow = false;` に差し替える変異が緑を通ったので、
  // 「受け流しの分岐が本当にこの述語を見ているか」も配線として固定する(ソース走査)。
  it('★combatTick の受け流しの分岐が、この述語を通っている(呼び出しを外す変異もここで落ちる)', () => {
    const src = Object.values(COMBAT_TICK_SOURCES)[0] ?? '';
    expect(src.length, 'combatTick.ts を読めていない(走査そのものが壊れた)').toBeGreaterThan(1000);
    const lines = src.split('\n').filter(l => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    });
    const calls = lines.filter(l => /shouldSkipBossContactParry\(/.test(l));
    // ★判定時置換ミラー(2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2 §成立地点6): 2本目=守護霊の
    // 接触受け流し(tryGhostContactParry)が同じ述語を通る(プレイヤーの写し)。台帳宣言=ちょうど2本。
    expect(
      calls.length,
      '受け流しスキップの述語(shouldSkipBossContactParry)の呼び出しが2本(プレイヤー+守護霊ミラー)ではない。'
      + `\n走査=\n${calls.map(l => l.trim()).join('\n')}`,
    ).toBe(2);
    const playerCall = calls.find(l => /shouldSkipBossContactParry\(\s*enemy\.type\s*,\s*enemy\.bossState\s*\)/.test(l));
    expect(playerCall, 'プレイヤー側の述語呼び出し(enemy.type/enemy.bossState)が無い').toBeTruthy();
    expect(playerCall, '述語の結果を thorDashRunNow へ束ねていない').toMatch(/thorDashRunNow\s*=(?!=)/);
    const ghostCall = calls.find(l => /shouldSkipBossContactParry\(\s*fromEnemy\.type\s*,\s*fromEnemy\.bossState\s*\)/.test(l));
    expect(ghostCall, '守護霊ミラー側の述語呼び出し(fromEnemy.type/fromEnemy.bossState)が無い').toBeTruthy();
    const gate = lines.filter(l => /BOSS_CONTACT_PARRY_ENABLED\s*&&/.test(l));
    expect(gate.length, 'ボス接触受け流しのゲート行が1本ではない').toBe(1);
    expect(
      gate[0],
      'ボス接触受け流しのゲートが `!thorDashRunNow` を見ていない=走行中の突進が受け流しへ落ち、'
      + '突進のカウンター(Counter!/クリ反撃/counter-leap/弾き返し/専用CD)が丸ごと消える(v0.25.3785 重大A)。'
      + `\n走査=\n${gate[0].trim()}`,
    ).toMatch(/!thorDashRunNow/);
  });
});

describe('★§9-6b 走行中の接触免除(skipThorDashRunContactDamage)= 社長裁定2026-08-30 推薦(a)', () => {
  it('トールの走行中(thor-dash-move)は、カウンター窓が開いている時だけ接触を落とす', () => {
    expect(skipThorDashRunContactDamage('thor', 'thor-dash-move', true)).toBe(true);
    // 窓を開けていなければ従来どおり当たる=§9-6の裁定(走行中の体当たりは当てる)を壊していない。
    expect(skipThorDashRunContactDamage('thor', 'thor-dash-move', false)).toBe(false);
  });

  it('走行中以外・トール以外へは効かない(免除を広げていない)', () => {
    for (const st of ['thor-dash-windup', 'thor-dash-recover', 'issen-dash', 'tsuki', 'harai', 'chase', undefined]) {
      expect(skipThorDashRunContactDamage('thor', st, true), `州 ${String(st)} まで免除している`).toBe(false);
    }
    expect(skipThorDashRunContactDamage('miguel', 'thor-dash-move', true)).toBe(false);
    expect(skipThorDashRunContactDamage('giantbat', 'thor-dash-move', true)).toBe(false);
  });
});

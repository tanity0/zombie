// BOT_AND_GHOST.md §2.9 G4a(1): 技への反応表の判定中核(暴露判定・3分類の優先順位・EMA更新)を検証する。
// 計測専用モジュール=ゲーム挙動には一切影響しない。
import { describe, it, expect } from 'vitest';
import {
  moveKeyForEnemy, contactDamageMoveKey, createMoveReactionState, stepMoveReactions,
  markMoveReactionCounter, markMoveReactionHit, endMoveReactions, blendMoveReactionTable,
  blendDodgeDirStat,
  MOVE_REACTION_LINGER_MS,
  bulletMoveKeyForEnemy, anyMoveKeyForEnemy, projectileMoveKeyForEnemy,
  isProjectileMoveKey, BULLET_MOVE_KEYS, PROJECTILE_MOVE_KEYS,
  type MoveReactionEnemy,
} from './moveReaction';
import { IDOL_SHOT_SLOTS } from './idolScript';
import { IDOL_WINDUP_STATES, IDOL_RECOVER_STATES, IDOL_FIRE_STATES } from './idolTick';
import type { Enemy, EnemyType } from '../types/game';

const giant = (aiPhase: Enemy['aiPhase'], over: Partial<MoveReactionEnemy> = {}): MoveReactionEnemy => ({
  id: 'g1', type: 'giantbat', aiPhase, bossState: undefined,
  x: 1000, y: 1000, width: 120, height: 120, gStompRadius: undefined,
  ...over,
} as MoveReactionEnemy);

const thor = (bossState: Enemy['bossState'], over: Partial<MoveReactionEnemy> = {}): MoveReactionEnemy => ({
  id: 't1', type: 'thor', aiPhase: undefined, bossState,
  x: 500, y: 500, width: 40, height: 40, gStompRadius: undefined,
  ...over,
} as MoveReactionEnemy);

// プレイヤー(遠方=自己中心技の危険域の外)。
const farPlayer = { x: 0, y: 0, width: 20, height: 20 };

describe('moveReaction: moveKeyForEnemy(技キーの導出)', () => {
  it('giantbatのg-*フェーズを技キーへ丸める(サブフェーズ込み)', () => {
    expect(moveKeyForEnemy(giant('g-stomp-windup'))).toBe('g-stomp');
    expect(moveKeyForEnemy(giant('g-sweep-active'))).toBe('g-sweep');
    expect(moveKeyForEnemy(giant('g-dash-charge'))).toBe('g-dash');
    expect(moveKeyForEnemy(giant('g-bolt-burst'))).toBe('g-bolt');
    expect(moveKeyForEnemy(giant('g-quad-breath-windup'))).toBe('g-quad'); // 複合サブフェーズも親技へ
    expect(moveKeyForEnemy(giant('g-nihil-chant2'))).toBe('g-nihil');
    expect(moveKeyForEnemy(giant('g-sweepbeam-windup'))).toBe('g-sweepbeam'); // g-sweepと混同しない
    expect(moveKeyForEnemy(giant('g-trijump-air'))).toBe('g-trijump');
  });

  it('旧スクリプト(g-接頭辞なし)のフェーズと技なしはnull', () => {
    expect(moveKeyForEnemy(giant('charge'))).toBeNull();
    expect(moveKeyForEnemy(giant(undefined))).toBeNull();
  });

  it('thorのbossStateを技キーへ丸める(技以外の状態はnull)', () => {
    expect(moveKeyForEnemy(thor('issen-windup'))).toBe('thor-issen');
    expect(moveKeyForEnemy(thor('issen-dash'))).toBe('thor-issen');
    expect(moveKeyForEnemy(thor('tsuki'))).toBe('thor-tsuki');
    expect(moveKeyForEnemy(thor('harai-recover'))).toBe('thor-harai');
    expect(moveKeyForEnemy(thor('jump-attack'))).toBe('thor-jump');
    expect(moveKeyForEnemy(thor('chase'))).toBeNull();
    expect(moveKeyForEnemy(thor('counter-leap'))).toBeNull();
    expect(moveKeyForEnemy(thor('backstep'))).toBeNull();
  });

  // v0.25.2603(社長指示「ちゃんと広げて揃えましょう」): 残り全ボスの近接/AoE技も台帳へ。
  // **同名の状態を型で正しく振り分けること**が要点(名前は複数のボスで衝突している)。
  it('同名bossStateでもtypeごとに別の技キーへ振り分ける(名前の衝突を型で解く)', () => {
    const at = (type: string, bossState: string) =>
      moveKeyForEnemy({ type, aiPhase: undefined, bossState } as unknown as MoveReactionEnemy);
    expect(at('thor', 'harai')).toBe('thor-harai');       // 'harai' は thor と miguel が使う
    expect(at('miguel', 'harai')).toBe('miguel-harai');
    expect(at('rafi', 'sweep')).toBe('rafi-sweep');       // 'sweep' は rafi/uri/suriel が使う
    expect(at('uri', 'sweep')).toBe('uri-sweep');
    expect(at('suriel', 'sweep')).toBe('suriel-sweep');
    expect(at('thor', 'jump-attack')).toBe('thor-jump');  // 'jump-*' は thor と rafi が使う
    expect(at('rafi', 'jump-attack')).toBe('rafi-jump');
    expect(at('acrasiel', 'burst')).toBe('acrasiel-burst'); // 'burst' は裏ボス(弾)と acrasiel(爆発)
    // 'burst' は裏ボス側だと**弾技**なので近接台帳には無い(弾台帳=anyMoveKeyForEnemyが拾う)。
    expect(at('mimir', 'burst')).toBeNull();
    expect(anyMoveKeyForEnemy({ type: 'mimir', aiPhase: undefined, bossState: 'burst' } as unknown as MoveReactionEnemy))
      .toBe('mimir-burst');
    expect(at('mimir', 'dash')).toBe('mimir-dash');         // 'dash' は裏ボス3体が共有
    expect(at('skadi', 'dash')).toBe('skadi-dash');
  });

  it('その技の全フェーズ(溜め/実行/硬直)が同じキーへ寄る=1つの技が2回に数えられない', () => {
    const at = (type: string, bossState: string) =>
      moveKeyForEnemy({ type, aiPhase: undefined, bossState } as unknown as MoveReactionEnemy);
    for (const st of ['laser-windup', 'laser-fire', 'laser-recover']) expect(at('mimir', st)).toBe('mimir-laser');
    for (const st of ['coil-windup', 'coil', 'coil-recover']) expect(at('jormungand', st)).toBe('jormungand-coil');
    for (const st of ['skadi-ice-windup', 'skadi-ice', 'skadi-ice-recover']) expect(at('skadi', st)).toBe('skadi-ice');
    for (const st of ['mdash-windup', 'mdash-move', 'mdash-recover']) expect(at('miguel', st)).toBe('miguel-mdash');
    for (const st of ['thrust-windup', 'thrust', 'thrust-recover']) expect(at('uri', st)).toBe('uri-thrust');
    // スリィエルの輪は3系統の溜めから実行・硬直まで**1つの技**として扱う。
    for (const st of ['ring-move-windup', 'ring-beam-windup', 'ring-spin-windup', 'ring-active', 'ring-spin',
      'ring-recover', 'ring-spin-recover']) expect(at('suriel', st)).toBe('suriel-ring');
    for (const st of ['idol-roll-windup', 'idol-roll', 'idol-roll-recover']) expect(at('idol', st)).toBe('idol-roll');
  });

  it('移動だけの状態は技ではない=null(warp系・counter-leap・chase)', () => {
    const at = (type: string, bossState: string) =>
      moveKeyForEnemy({ type, aiPhase: undefined, bossState } as unknown as MoveReactionEnemy);
    expect(at('jibril', 'warp-windup')).toBeNull();
    expect(at('acrasiel', 'warp-in')).toBeNull();
    expect(at('acrasiel', 'warp-out')).toBeNull();
    expect(at('miguel', 'counter-leap')).toBeNull();
    expect(at('rafi', 'chase')).toBeNull();
  });
});

describe('moveReaction: contactDamageMoveKey(接触被弾の帰属)', () => {
  it('体当たりが技のダメージであるフェーズだけ技キーを返す', () => {
    expect(contactDamageMoveKey(giant('g-dash-charge'))).toBe('g-dash');
    expect(contactDamageMoveKey(giant('g-quad-charge'))).toBe('g-quad');
    expect(contactDamageMoveKey(giant('g-glide-active'))).toBe('g-glide');
  });
  it('溜め中/技なし/他タイプの接触は技キーなし(従来どおりの汎用接触)', () => {
    expect(contactDamageMoveKey(giant('g-dash-windup'))).toBeUndefined();
    expect(contactDamageMoveKey(giant(undefined))).toBeUndefined();
    expect(contactDamageMoveKey(thor('issen-dash'))).toBeUndefined();
  });
});

describe('moveReaction: エピソード状態機械と3分類(counter > hit > dodge)', () => {
  it('aimed技: 解決1回=暴露1・無反応=dodge(残響が切れてから確定する)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-sweep-windup')], farPlayer, 0);
    stepMoveReactions(st, [giant('g-sweep-recover')], farPlayer, 500);
    stepMoveReactions(st, [giant(undefined)], farPlayer, 1000); // 技終了→残響へ
    expect(st.tally['g-sweep']).toBeUndefined(); // 残響中はまだ確定しない
    stepMoveReactions(st, [giant(undefined)], farPlayer, 1000 + MOVE_REACTION_LINGER_MS);
    expect(st.tally['g-sweep']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('技の切り替わり(連携)は前の技を閉じて別エピソードにする', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-stomp-recover', { gStompRadius: 92 })], farPlayer, 0);
    stepMoveReactions(st, [giant('g-dash-windup')], farPlayer, 500); // 連携: stomp→dash
    const { tally } = endMoveReactions(st);
    // stompは遠方で暴露なし=数えない / dashはaimed=暴露1
    expect(tally['g-stomp']).toBeUndefined();
    expect(tally['g-dash']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('hit: 技中の技キー付き被弾はhitに分類される', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], farPlayer, 0);
    stepMoveReactions(st, [thor('harai')], farPlayer, 1000);
    markMoveReactionHit(st, 'thor-harai');
    const { tally } = endMoveReactions(st);
    expect(tally['thor-harai']).toEqual({ exposures: 1, counters: 0, hits: 1 });
  });

  it('優先順位: counterはhitより強い(両方起きたらcounterだけ数える)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('jump-windup')], farPlayer, 0);
    markMoveReactionHit(st, 'thor-jump');
    markMoveReactionCounter(st);
    const { tally } = endMoveReactions(st);
    expect(tally['thor-jump']).toEqual({ exposures: 1, counters: 1, hits: 0 });
  });

  it('残響(linger)中の遅延被弾はその技に帰属する/残響切れ後は数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-bolt-windup')], farPlayer, 0);
    stepMoveReactions(st, [giant(undefined)], farPlayer, 1000); // 技終了(弾はまだ飛んでいる)
    markMoveReactionHit(st, 'g-bolt'); // 残響中の着弾
    stepMoveReactions(st, [giant(undefined)], farPlayer, 1000 + MOVE_REACTION_LINGER_MS);
    expect(st.tally['g-bolt']).toEqual({ exposures: 1, counters: 0, hits: 1 });
    markMoveReactionHit(st, 'g-bolt'); // 残響切れ後の被弾(帰属先なし)=無視
    expect(endMoveReactions(st).tally['g-bolt']).toEqual({ exposures: 1, counters: 0, hits: 1 });
  });

  it('counter: 開いているエピソードが無ければ残響中のエピソードへマークする(反射の遅れ等)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-bolt-burst')], farPlayer, 0);
    stepMoveReactions(st, [giant(undefined)], farPlayer, 500); // 技終了→残響
    markMoveReactionCounter(st); // 飛んでいる咆哮弾を反射した
    expect(endMoveReactions(st).tally['g-bolt']).toEqual({ exposures: 1, counters: 1, hits: 0 });
  });

  it('自己中心技(g-stomp): 溜め中に危険域の外なら暴露なし=数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], farPlayer, 0);
    stepMoveReactions(st, [giant('g-stomp-recover', { gStompRadius: 92 })], farPlayer, 700);
    expect(endMoveReactions(st).tally['g-stomp']).toBeUndefined();
  });

  it('自己中心技(g-stomp): 溜め中に半径内へ居たら暴露1(離れて無傷ならdodge)', () => {
    const st = createMoveReactionState();
    // ボス中心=(1060,1060)。プレイヤー中心(1050,1050)は距離約14 <= 92+10=102で危険域内。
    const nearPlayer = { x: 1040, y: 1040, width: 20, height: 20 };
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], nearPlayer, 0);
    stepMoveReactions(st, [giant('g-stomp-recover', { gStompRadius: 92 })], farPlayer, 700); // 離脱
    expect(endMoveReactions(st).tally['g-stomp']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('追跡中のボスが消えた(撃破等)らエピソードは残響へ移り、セッション終了で確定する', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('tsuki-windup')], farPlayer, 0);
    stepMoveReactions(st, [], farPlayer, 500); // 敵消滅
    expect(endMoveReactions(st).tally['thor-tsuki']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });
});

describe('moveReaction: blendMoveReactionTable(EMA更新とnの累計)', () => {
  it('初記録(n=0/未登録)はサンプルそのまま・nは暴露回数', () => {
    const next = blendMoveReactionTable({}, { 'g-dash': { exposures: 4, counters: 1, hits: 2 } }, 0.3);
    expect(next['g-dash']).toEqual({ n: 4, counterRate: 0.25, hitRate: 0.5 });
  });

  it('2回目以降はα=0.3でEMA混合し、nを加算する', () => {
    const prev = { 'g-dash': { n: 4, counterRate: 0.25, hitRate: 0.5 } };
    const next = blendMoveReactionTable(prev, { 'g-dash': { exposures: 2, counters: 2, hits: 0 } }, 0.3);
    expect(next['g-dash']!.n).toBe(6);
    expect(next['g-dash']!.counterRate).toBeCloseTo(0.25 * 0.7 + 1 * 0.3, 10);
    expect(next['g-dash']!.hitRate).toBeCloseTo(0.5 * 0.7 + 0 * 0.3, 10);
  });

  it('今回集計に無い技は前回値のまま・集計が空なら参照ごと不変', () => {
    const prev = { 'g-jump': { n: 3, counterRate: 0.5, hitRate: 0.2 } };
    const next = blendMoveReactionTable(prev, { 'thor-issen': { exposures: 1, counters: 0, hits: 1 } }, 0.3);
    expect(next['g-jump']).toEqual(prev['g-jump']);
    expect(next['thor-issen']).toEqual({ n: 1, counterRate: 0, hitRate: 1 });
    expect(blendMoveReactionTable(prev, {}, 0.3)).toBe(prev);
  });
});

// ==== GHOST-CMD-1B(§2.18-2 dodgeの味付け): 避け方向の癖の計測 ====================================
// thor(500,500,40x40)の中心=(520,520)。at(cx,cy)=プレイヤー中心を(cx,cy)に置く。
// (200,520)からは敵への半径方向=x軸・接線方向=y軸になる=分解の期待値が読みやすい配置。

describe('GHOST-CMD-1B: 避け方向の癖(dodgeDirTally)の計測', () => {
  const at = (cx: number, cy: number) => ({ x: cx - 10, y: cy - 10, width: 20, height: 20 });

  it('横移動でdodge確定 → lateral加算', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(200, 560), 100);  // 接線方向(y)へ40px
    stepMoveReactions(st, [thor('chase')], at(200, 560), 200);  // 技終了→残響へ
    const r = endMoveReactions(st);
    expect(r.tally['thor-harai']).toEqual({ exposures: 1, counters: 0, hits: 0 });
    expect(r.dodgeDir).toEqual({ away: 0, lateral: 1, through: 0 });
  });

  it('後退(敵から離れる)でdodge確定 → away加算', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(150, 520), 100);  // 半径方向へ離れる50px
    stepMoveReactions(st, [thor('chase')], at(150, 520), 200);
    expect(endMoveReactions(st).dodgeDir).toEqual({ away: 1, lateral: 0, through: 0 });
  });

  it('敵へ向かう移動でdodge確定 → through加算', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(260, 520), 100);  // 敵へ向かって60px
    stepMoveReactions(st, [thor('chase')], at(260, 520), 200);
    expect(endMoveReactions(st).dodgeDir).toEqual({ away: 0, lateral: 0, through: 1 });
  });

  it('被弾(hit)したエピソードはdodgeDirに数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(200, 560), 100);
    markMoveReactionHit(st, 'thor-harai');
    const r = endMoveReactions(st);
    expect(r.tally['thor-harai']).toEqual({ exposures: 1, counters: 0, hits: 1 });
    expect(r.dodgeDir).toEqual({ away: 0, lateral: 0, through: 0 });
  });

  it('カウンター成立したエピソードはdodgeDirに数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(200, 560), 100);
    markMoveReactionCounter(st);
    const r = endMoveReactions(st);
    expect(r.tally['thor-harai']).toEqual({ exposures: 1, counters: 1, hits: 0 });
    expect(r.dodgeDir).toEqual({ away: 0, lateral: 0, through: 0 });
  });

  it('暴露なし(自己中心技の危険域の外)はdodgeDirに数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], at(200, 520), 0);
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], at(200, 560), 100);
    stepMoveReactions(st, [giant(undefined)], at(200, 560), 200);
    const r = endMoveReactions(st);
    expect(r.tally['g-stomp']).toBeUndefined();
    expect(r.dodgeDir).toEqual({ away: 0, lateral: 0, through: 0 });
  });

  it('一歩も動かなかったdodge(全軸0)は方向が定義できない=数えない(nを薄めない)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('harai')], at(200, 520), 100);
    stepMoveReactions(st, [thor('chase')], at(200, 520), 200);
    const r = endMoveReactions(st);
    expect(r.tally['thor-harai']).toEqual({ exposures: 1, counters: 0, hits: 0 }); // dodge自体は数える
    expect(r.dodgeDir).toEqual({ away: 0, lateral: 0, through: 0 });
  });

  it('エピソード開始のtickへ跨ぐ変位は数えない(開始前の移動が分類を汚さない)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('chase')], at(200, 520), 0);          // 技なし(基準tickのみ)
    stepMoveReactions(st, [thor('harai-windup')], at(400, 520), 100); // 敵へ200px詰めたtickで技が開始
    stepMoveReactions(st, [thor('harai')], at(400, 560), 200);        // エピソード中は横へ40px
    stepMoveReactions(st, [thor('chase')], at(400, 560), 300);
    expect(endMoveReactions(st).dodgeDir).toEqual({ away: 0, lateral: 1, through: 0 });
  });

  it('技が解決するtickへ跨ぐ変位はその技に数える(避けの最後の一歩を取りこぼさない)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], at(200, 520), 0);
    stepMoveReactions(st, [thor('chase')], at(200, 560), 100); // 解決と同tickの横移動
    expect(endMoveReactions(st).dodgeDir).toEqual({ away: 0, lateral: 1, through: 0 });
  });

  it('blendDodgeDirStat: 初回=サンプルそのまま・2回目以降はEMA・nは累計・サンプル0は前回値を参照ごと返す', () => {
    const first = blendDodgeDirStat(undefined, { away: 1, lateral: 3, through: 0 }, 0.3);
    expect(first).toEqual({ n: 4, awayRate: 0.25, lateralRate: 0.75 });
    const second = blendDodgeDirStat(first, { away: 2, lateral: 0, through: 0 }, 0.3);
    expect(second!.n).toBe(6);
    expect(second!.awayRate).toBeCloseTo(0.25 * 0.7 + 1 * 0.3, 10);
    expect(second!.lateralRate).toBeCloseTo(0.75 * 0.7 + 0 * 0.3, 10);
    expect(blendDodgeDirStat(first, { away: 0, lateral: 0, through: 0 }, 0.3)).toBe(first);
    expect(blendDodgeDirStat(undefined, { away: 0, lateral: 0, through: 0 }, 0.3)).toBeUndefined();
  });
});

// ==== GHOST-BULLET-TECH(弾も技・v0.25.2543) ====================================================
// 社長方針「弾も技である以上、記録に弾を避ける確率、避ける動きもあるべき」。
// 弾を撃つ技を**3実装経路すべて**(gameStore=城ボス / useGameLoop=裏ボス+idol /
// angelBossTick=天使)から拾えているかを、台帳と発射経路の両面で機械的に確認する。

const bulletBoss = (
  type: EnemyType, bossState: string, over: Partial<MoveReactionEnemy> = {},
): MoveReactionEnemy => ({
  id: `${type}-1`, type, aiPhase: undefined, bossState,
  x: 500, y: 500, width: 60, height: 60, gStompRadius: undefined,
  ...over,
} as MoveReactionEnemy);

// 「このボスのこの状態で弾が出る」= 実際の発射箇所の全数表(ソース走査の対応表)。
// 左から: 敵タイプ / 発射時の状態 / 期待キー / 発射箇所。
const FIRE_SITES: ReadonlyArray<[EnemyType, string, string, string]> = [
  ['mimir', 'burst', 'mimir-burst', 'useGameLoop fireBullet(burst)'],
  ['mimir', 'aim-radial', 'mimir-radial', 'useGameLoop fireBullet(aim-radial=16発一斉)'],
  ['jormungand', 'burst', 'jormungand-burst', 'useGameLoop fireBullet(burst 3-way)'],
  ['jormungand', 'radial', 'jormungand-radial', 'useGameLoop fireBullet(radial 螺旋)'],
  ['skadi', 'burst', 'skadi-burst', 'useGameLoop fireBullet(burst)'],
  ['skadi', 'aim-radial', 'skadi-radial', 'useGameLoop fireBullet(aim-radial)'],
  ['thor', 'burst', 'thor-burst', 'useGameLoop fireBullet(?thorscript=0の旧3択)'],
  ['thor', 'aim-radial', 'thor-radial', 'useGameLoop fireBullet(?thorscript=0の旧3択)'],
  ['miguel', 'volley', 'miguel-volley', 'angelBossTick miguel volley(台本/旧の2経路)'],
  ['jibril', 'volley', 'jibril-volley', 'angelBossTick jibril volley(台本/旧の2経路)'],
  ['uri', 'bolt', 'uri-bolt', 'angelBossTick uri bolt'],
  ['suriel', 'gaze-windup', 'suriel-gaze', 'angelBossTick suriel gaze(windupの終わりに1発)'],
  ['acrasiel', 'gaze-windup', 'acrasiel-gaze', 'angelBossTick acrasiel gaze'],
  ['idol', 'idol-aim-windup', 'idol-aim', 'idolTick idol 単発'],
  ['idol', 'idol-fan-windup', 'idol-fan', 'idolTick idol 扇'],
  // 射撃部品(v0.25.2638): メーカーで足す8枠。1枠でも技キーが付かないと、その弾だけ記録にも
  // 守護霊の再現にも一生乗らない(=このファイルの冒頭に書いてある事故そのもの)。
  ...IDOL_SHOT_SLOTS.map(m => (
    ['idol', `idol-${m}-windup`, `idol-${m}`, `idolTick 射撃枠 ${m}`] as [EnemyType, string, string, string]
  )),
];

describe('GHOST-BULLET-TECH: 弾技の技キー導出', () => {
  it('発射箇所の全数(3経路)で技キーが付く', () => {
    for (const [type, state, key, where] of FIRE_SITES) {
      expect(projectileMoveKeyForEnemy(bulletBoss(type, state)), where).toBe(key);
    }
  });

  it('咆哮弾(giantbat g-bolt)も同じ1本で解決する=combatTickのownerType推定を廃止できる', () => {
    expect(projectileMoveKeyForEnemy(giant('g-bolt-windup'))).toBe('g-bolt');
    expect(projectileMoveKeyForEnemy(giant('g-bolt-burst'))).toBe('g-bolt');
    expect(projectileMoveKeyForEnemy(giant('g-bolt-recover'))).toBe('g-bolt');
  });

  it('溜め/実行/硬直の全フェーズが同じキーへ寄る(飛翔中の弾を残響で帰属させるため)', () => {
    for (const st of ['aim-burst', 'burst', 'burst-recover']) {
      expect(bulletMoveKeyForEnemy(bulletBoss('mimir', st))).toBe('mimir-burst');
    }
    for (const st of ['volley-windup', 'volley', 'volley-recover']) {
      expect(bulletMoveKeyForEnemy(bulletBoss('jibril', st))).toBe('jibril-volley');
    }
    for (const st of ['bolt-windup', 'bolt', 'bolt-recover']) {
      expect(bulletMoveKeyForEnemy(bulletBoss('uri', st))).toBe('uri-bolt');
    }
  });

  it('状態名の衝突を型ゲートで捌く(volley/burst/radial/gaze-windupは複数ボスが使う)', () => {
    expect(bulletMoveKeyForEnemy(bulletBoss('miguel', 'volley'))).toBe('miguel-volley');
    expect(bulletMoveKeyForEnemy(bulletBoss('jibril', 'volley'))).toBe('jibril-volley');
    expect(bulletMoveKeyForEnemy(bulletBoss('suriel', 'gaze-windup'))).toBe('suriel-gaze');
    expect(bulletMoveKeyForEnemy(bulletBoss('acrasiel', 'gaze-windup'))).toBe('acrasiel-gaze');
    expect(bulletMoveKeyForEnemy(bulletBoss('skadi', 'burst'))).toBe('skadi-burst');
  });

  it('弾を撃たない技・非ボスはタグ無し(従来どおり常時回避対象のままにする)', () => {
    // アクラシエルの burst は自己中心の**爆発**(弾ではない)=入れない。
    expect(bulletMoveKeyForEnemy(bulletBoss('acrasiel', 'burst'))).toBeNull();
    expect(bulletMoveKeyForEnemy(bulletBoss('acrasiel', 'burst-windup'))).toBeNull();
    // ラフィの骨は別エンティティ(spawnSkadiBlade)=弾ではない。
    expect(bulletMoveKeyForEnemy(bulletBoss('rafi', 'bone'))).toBeNull();
    expect(bulletMoveKeyForEnemy(bulletBoss('idol', 'idol-roll'))).toBeNull();
    expect(bulletMoveKeyForEnemy(bulletBoss('mimir', 'chase'))).toBeNull();
    expect(projectileMoveKeyForEnemy({ type: 'plant', aiPhase: undefined, bossState: undefined })).toBeUndefined();
  });

  it('近接/AoE技のキーは弾に載らない(万一その状態で弾が生まれても誤タグしない安全弁)', () => {
    expect(anyMoveKeyForEnemy(giant('g-stomp-windup'))).toBe('g-stomp');
    expect(projectileMoveKeyForEnemy(giant('g-stomp-windup'))).toBeUndefined();
    expect(projectileMoveKeyForEnemy(thor('issen-dash'))).toBeUndefined();
    expect(isProjectileMoveKey('g-stomp')).toBe(false);
    expect(isProjectileMoveKey('g-bolt')).toBe(true);
  });

  it('anyMoveKeyForEnemy は近接/AoE台帳を優先し、弾技台帳へ落ちる(thorは両方を持つ)', () => {
    expect(anyMoveKeyForEnemy(thor('issen-windup'))).toBe('thor-issen'); // G4a台帳が勝つ
    expect(anyMoveKeyForEnemy(thor('burst'))).toBe('thor-burst');        // G4a台帳に無い→弾技台帳
  });

  it('PROJECTILE_MOVE_KEYS = g-bolt + 弾技台帳の全数(重複なし)', () => {
    expect(PROJECTILE_MOVE_KEYS).toEqual(['g-bolt', ...BULLET_MOVE_KEYS]);
    expect(new Set(PROJECTILE_MOVE_KEYS).size).toBe(PROJECTILE_MOVE_KEYS.length);
    // 発射箇所の表が使うキーは、全て台帳(BULLET_MOVE_KEYS)に載っている。
    for (const [, , key] of FIRE_SITES) expect(BULLET_MOVE_KEYS as readonly string[]).toContain(key);
  });
});

describe('GHOST-BULLET-TECH: 弾技のエピソード(既存の技と同じ流儀でnを数える)', () => {
  it('弾技も「解決1回=暴露1」。無傷ならdodge(hitRate=0)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [bulletBoss('uri', 'bolt-windup')], farPlayer, 0);
    stepMoveReactions(st, [bulletBoss('uri', 'bolt')], farPlayer, 500);
    stepMoveReactions(st, [bulletBoss('uri', 'chase')], farPlayer, 1500); // 技終了→残響
    expect(endMoveReactions(st).tally['uri-bolt']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('被弾は弾のタグ(srcMoveKey)経由で技へ帰属する。飛翔中の着弾は残響で拾う', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [bulletBoss('jibril', 'volley')], farPlayer, 0);
    stepMoveReactions(st, [bulletBoss('jibril', 'chase')], farPlayer, 800); // 技終了(弾はまだ飛んでいる)
    markMoveReactionHit(st, 'jibril-volley');                                // 残響中の着弾
    expect(endMoveReactions(st).tally['jibril-volley']).toEqual({ exposures: 1, counters: 0, hits: 1 });
  });

  it('残響が切れてから届いた弾は数えない(既存g-boltと同じ扱い)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [bulletBoss('mimir', 'aim-radial')], farPlayer, 0);
    stepMoveReactions(st, [bulletBoss('mimir', 'chase')], farPlayer, 500);
    stepMoveReactions(st, [bulletBoss('mimir', 'chase')], farPlayer, 500 + MOVE_REACTION_LINGER_MS);
    markMoveReactionHit(st, 'mimir-radial');
    expect(endMoveReactions(st).tally['mimir-radial']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('反射(カウンター成立)は開いているエピソードへ付く=counterがhitに優先する', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [bulletBoss('idol', 'idol-fan-windup')], farPlayer, 0);
    markMoveReactionHit(st, 'idol-fan');
    markMoveReactionCounter(st);
    expect(endMoveReactions(st).tally['idol-fan']).toEqual({ exposures: 1, counters: 1, hits: 0 });
  });

  it('giantbat/thorの既存計測は変わらない(型ホワイトリスト撤廃の副作用が無いこと)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-sweep-windup'), bulletBoss('mimir', 'chase')], farPlayer, 0);
    stepMoveReactions(st, [giant(undefined), bulletBoss('mimir', 'chase')], farPlayer, 500);
    const { tally } = endMoveReactions(st);
    expect(tally['g-sweep']).toEqual({ exposures: 1, counters: 0, hits: 0 });
    expect(Object.keys(tally)).toEqual(['g-sweep']); // 技を出していないボスはエピソードを作らない
  });
});

// ---- 網羅の機械化(CLAUDE.md「同じ"動作"を持つ全員に付ける」の再発防止) ------------------------
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// ghostTelegraph.test.ts と同じ作法)。
const BULLET_SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts', './angelBossTick.ts', '../hooks/useGameLoop.ts', './combatTick.ts', './idolTick.ts'],
  { query: '?raw', import: 'default', eager: true },
);

describe('GHOST-BULLET-TECH: 発射経路の網羅(ソース走査)', () => {
  it('台帳に書いた状態名は実際にソースへ存在する(状態のリネーム/打ち間違いを検知)', () => {
    const all = Object.values(BULLET_SOURCES).join('\n');
    // v0.25.2638: idol の州名は技の一覧から機械的に組むのでソースに文字列リテラルが無い。
    // その場合は**実装がエクスポートしている州の一覧**と突き合わせる(同じ「実在するか」の検査)。
    const declared = new Set<string>([...IDOL_WINDUP_STATES, ...IDOL_RECOVER_STATES, ...IDOL_FIRE_STATES]);
    for (const [, state, , where] of FIRE_SITES) {
      expect(all.includes(`'${state}'`) || declared.has(state), `${state} (${where})`).toBe(true);
    }
  });

  it('射撃枠の複製値が本体とズレていない(moveReaction.ts はボス実装に依存しない層なので複製で持つ)', () => {
    for (const m of IDOL_SHOT_SLOTS) {
      expect(BULLET_MOVE_KEYS as readonly string[], `${m} の技キーが無い`).toContain(`idol-${m}`);
    }
    // 逆向き: 台帳にあるのに本体に無い枠(消した枠の取り残し)も検知する。
    const slotKeys = (BULLET_MOVE_KEYS as readonly string[]).filter(k => /^idol-s\d+$/.test(k));
    expect(slotKeys).toHaveLength(IDOL_SHOT_SLOTS.length);
  });

  it('敵弾の生成箇所の数は固定(新しい発射経路を足したらこのテストが落ちる=分類してから入れる)', () => {
    // 内訳(v0.25.3319時点・全数):
    //   gameStore.ts   3 = 咆哮弾の連射(burst)/扇(fan)/**グレン胴体弾のV字斉射**(v0.25.3027・
    //                      'g-parts'=専用aiPhase無しのため生成後にsrcMoveKeyを後付けする経路)
    //   useGameLoop.ts 1 = 裏ボス fireBullet(idolはv0.25.2613でidolTick.tsへ移設)
    //   angelBossTick  8 = miguel×2(台本/旧)・jibril×3(台本volleyの狙い弾+**全方位リング**
    //                      (v0.25.3197: 偶数発目=リング8発の追加射出口。状態は同じ'volley'=技キー分類済み)・旧)・
    //                      uri・suriel・acrasiel
    //   combatTick.ts  1 = 汎用発砲(plant等の非ボス。?giantscript=0のgiantbat旧経路も同じ口)
    //   idolTick.ts    3 = idolの通常弾(aim/fan)/ 追尾弾(orb)/ **射撃部品の斉射**(v0.25.2638)
    // 合計16。増えたら「そのボスのその状態」をBULLET_STATE_TO_MOVEへ足すこと(足さないと
    // その弾だけ技キーが付かず、記録にも守護霊の再現にも一生乗らない)。
    // ※射撃部品は1箇所(fireShotVolley)で8枠ぶんを撃つので、枠を増やしても発射箇所は増えない。
    let sites = 0;
    for (const text of Object.values(BULLET_SOURCES)) {
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) continue;
        sites += (line.match(/createEnemyProjectile\(/g) ?? []).length;
      }
    }
    expect(sites).toBe(16);
  });
});

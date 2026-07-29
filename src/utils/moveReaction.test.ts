// BOT_AND_GHOST.md §2.9 G4a(1): 技への反応表の判定中核(暴露判定・3分類の優先順位・EMA更新)を検証する。
// 計測専用モジュール=ゲーム挙動には一切影響しない。
import { describe, it, expect } from 'vitest';
import {
  moveKeyForEnemy, contactDamageMoveKey, createMoveReactionState, stepMoveReactions,
  markMoveReactionCounter, markMoveReactionHit, endMoveReactions, blendMoveReactionTable,
  MOVE_REACTION_LINGER_MS,
  type MoveReactionEnemy,
} from './moveReaction';
import type { Enemy } from '../types/game';

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

  it('同名bossStateでもthor以外のボスはnull(型ゲート=miguelのharai等を拾わない)', () => {
    expect(moveKeyForEnemy({ type: 'miguel', aiPhase: undefined, bossState: 'harai' })).toBeNull();
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
    const tally = endMoveReactions(st);
    // stompは遠方で暴露なし=数えない / dashはaimed=暴露1
    expect(tally['g-stomp']).toBeUndefined();
    expect(tally['g-dash']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('hit: 技中の技キー付き被弾はhitに分類される', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('harai-windup')], farPlayer, 0);
    stepMoveReactions(st, [thor('harai')], farPlayer, 1000);
    markMoveReactionHit(st, 'thor-harai');
    const tally = endMoveReactions(st);
    expect(tally['thor-harai']).toEqual({ exposures: 1, counters: 0, hits: 1 });
  });

  it('優先順位: counterはhitより強い(両方起きたらcounterだけ数える)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('jump-windup')], farPlayer, 0);
    markMoveReactionHit(st, 'thor-jump');
    markMoveReactionCounter(st);
    const tally = endMoveReactions(st);
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
    expect(endMoveReactions(st)['g-bolt']).toEqual({ exposures: 1, counters: 0, hits: 1 });
  });

  it('counter: 開いているエピソードが無ければ残響中のエピソードへマークする(反射の遅れ等)', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-bolt-burst')], farPlayer, 0);
    stepMoveReactions(st, [giant(undefined)], farPlayer, 500); // 技終了→残響
    markMoveReactionCounter(st); // 飛んでいる咆哮弾を反射した
    expect(endMoveReactions(st)['g-bolt']).toEqual({ exposures: 1, counters: 1, hits: 0 });
  });

  it('自己中心技(g-stomp): 溜め中に危険域の外なら暴露なし=数えない', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], farPlayer, 0);
    stepMoveReactions(st, [giant('g-stomp-recover', { gStompRadius: 92 })], farPlayer, 700);
    expect(endMoveReactions(st)['g-stomp']).toBeUndefined();
  });

  it('自己中心技(g-stomp): 溜め中に半径内へ居たら暴露1(離れて無傷ならdodge)', () => {
    const st = createMoveReactionState();
    // ボス中心=(1060,1060)。プレイヤー中心(1050,1050)は距離約14 <= 92+10=102で危険域内。
    const nearPlayer = { x: 1040, y: 1040, width: 20, height: 20 };
    stepMoveReactions(st, [giant('g-stomp-windup', { gStompRadius: 92 })], nearPlayer, 0);
    stepMoveReactions(st, [giant('g-stomp-recover', { gStompRadius: 92 })], farPlayer, 700); // 離脱
    expect(endMoveReactions(st)['g-stomp']).toEqual({ exposures: 1, counters: 0, hits: 0 });
  });

  it('追跡中のボスが消えた(撃破等)らエピソードは残響へ移り、セッション終了で確定する', () => {
    const st = createMoveReactionState();
    stepMoveReactions(st, [thor('tsuki-windup')], farPlayer, 0);
    stepMoveReactions(st, [], farPlayer, 500); // 敵消滅
    expect(endMoveReactions(st)['thor-tsuki']).toEqual({ exposures: 1, counters: 0, hits: 0 });
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

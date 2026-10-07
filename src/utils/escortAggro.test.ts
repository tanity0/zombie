import { describe, it, expect } from 'vitest';
import type { Enemy, EnemyType, Player, Summon } from '../types/game';
import {
  chooseEscortAggro, ESCORT_AGGRO_RANGE_PX, ESCORT_AGGRO_STICKY_RATIO, type EscortAggroCandidate,
} from './escortAggro';
import { resolveEnemyTarget, isEscortAggroMob } from './enemyUtils';
import { ALCHEMY_AGGRO_RANGE } from './summonUtils';
import { escortHateSide } from './bossHate';

const mkEnemy = (x: number, y: number, over: Partial<Enemy> = {}): Enemy =>
  ({ x, y, width: 32, height: 32, id: 'e1', type: 'zombie', ...over } as unknown as Enemy);
const mkPlayer = (x: number, y: number): Player => ({ x, y, width: 32, height: 32 } as unknown as Player);
const esc = (id: string, x: number, y: number): EscortAggroCandidate => ({ id, x, y });

describe('chooseEscortAggro(§4: 380px・プレイヤーより近い・粘着20%)', () => {
  it('定数: 気づく距離=ALCHEMY_AGGRO_RANGE(380)・粘着は2割', () => {
    expect(ESCORT_AGGRO_RANGE_PX).toBe(380);
    expect(ESCORT_AGGRO_RANGE_PX).toBe(ALCHEMY_AGGRO_RANGE);
    expect(ESCORT_AGGRO_STICKY_RATIO).toBe(0.8);
  });
  it('軍人が居なければ狙わない', () => {
    expect(chooseEscortAggro(0, 0, 300, [], undefined)).toBeUndefined();
  });
  it('380pxの外の軍人は狙わない(プレイヤーのまま)', () => {
    expect(chooseEscortAggro(0, 0, 900, [esc('a', 400, 0)], undefined)).toBeUndefined();
  });
  it('内側でも、プレイヤーより2割近くなければプレイヤーのまま(今の相手=プレイヤーへの粘着)', () => {
    expect(chooseEscortAggro(0, 0, 300, [esc('a', 250, 0)], undefined)).toBeUndefined(); // 250 > 300×0.8
    expect(chooseEscortAggro(0, 0, 300, [esc('a', 240, 0)], undefined)).toBe('a');         // 240 = 300×0.8
    expect(chooseEscortAggro(0, 0, 300, [esc('a', 100, 0)], undefined)).toBe('a');
  });
  it('プレイヤーが遠い(Infinity=隠れている等)なら、380内の軍人を追う', () => {
    expect(chooseEscortAggro(0, 0, Infinity, [esc('a', 350, 0)], undefined)).toBe('a');
  });
  it('等距離でも毎フレーム入れ替わらない(追っている軍人は、新しい方が2割近くなるまで離さない)', () => {
    // いま a を追っている。b が少し近い(5%)だけでは替えない
    expect(chooseEscortAggro(0, 0, 500, [esc('a', 200, 0), esc('b', 190, 0)], 'a')).toBe('a');
    // b が2割以上近ければ替える
    expect(chooseEscortAggro(0, 0, 500, [esc('a', 200, 0), esc('b', 150, 0)], 'a')).toBe('b');
    // プレイヤー側が2割近くなったら軍人を離れてプレイヤーへ戻る
    expect(chooseEscortAggro(0, 0, 150, [esc('a', 200, 0)], 'a')).toBeUndefined();
    // プレイヤーが少し近い(5%)だけなら軍人のまま
    expect(chooseEscortAggro(0, 0, 190, [esc('a', 200, 0)], 'a')).toBe('a');
  });
  it('追っていた軍人が候補から消えたら(倒れた/見えなくなった)、プレイヤー側が今の相手になる', () => {
    expect(chooseEscortAggro(0, 0, 300, [esc('b', 250, 0)], 'a')).toBeUndefined();
  });
  it('複数の軍人は一番近い軍人', () => {
    expect(chooseEscortAggro(0, 0, 900, [esc('a', 300, 0), esc('b', 120, 0), esc('c', 200, 0)], undefined)).toBe('b');
  });
});

describe('isEscortAggroMob(§4: ヘイト表に入っていない敵全部・英雄/旗手/死神は除外)', () => {
  const yes: EnemyType[] = ['zombie', 'bat', 'skeleton', 'pumpkin', 'driller', 'logger', 'hunter', 'werewolf', 'plant', 'lich', 'screamer', 'ghost'];
  const no: EnemyType[] = [
    'giantbat', 'idol', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'mimir', 'jormungand', 'skadi', 'thor', 'phillboss',
    'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko', // ボス=ヘイト表(§5)で決める
    'mutant-hero', 'mutant-liberty', // 英雄・旗手=中立
    'reaper', 'hangedman', // 死神系=プレイヤーを追う終端
    'guardian-phantom', // 幻影=プレイヤーの写し
  ];
  it.each(yes)('%s は軍人を狙う', t => { expect(isEscortAggroMob(t)).toBe(true); });
  it.each(no)('%s は狙わない', t => { expect(isEscortAggroMob(t)).toBe(false); });
});

describe('resolveEnemyTarget の進軍NPC版(§4・優先順)', () => {
  const cands = [esc('a', 100, 16)];
  it('軍人が居なければ従来どおり(escorts 未指定/空)', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(300, 0), [], 400, false, 1000);
    expect(t.escortId).toBeUndefined();
    expect(t.x).toBeCloseTo(316);
    expect(resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(300, 0), [], 400, false, 1000, null, []).escortId).toBeUndefined();
  });
  it('プレイヤーより近い軍人を追う(座標=軍人の体の中心・escortId付き)', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(300, 0), [], 400, false, 1000, null, cands);
    expect(t.escortId).toBe('a');
    expect(t.x).toBe(100);
    expect(t.y).toBe(16);
    expect(t.hidden).toBe(false);
  });
  it('強個体(パンプキン/削岩型/伐採人)・ハンターも狙う。英雄・死神は狙わない', () => {
    for (const type of ['pumpkin', 'driller', 'logger', 'hunter'] as const) {
      expect(resolveEnemyTarget(mkEnemy(0, 0, { type }), mkPlayer(300, 0), [], 400, false, 1000, null, cands).escortId).toBe('a');
    }
    for (const type of ['mutant-hero', 'reaper'] as const) {
      expect(resolveEnemyTarget(mkEnemy(0, 0, { type }), mkPlayer(300, 0), [], 400, false, 1000, null, cands).escortId).toBeUndefined();
    }
  });
  it('プレイヤーのほうが近ければプレイヤー(粘着=今の相手がプレイヤーなら2割近い軍人だけが奪える)', () => {
    const near = [esc('a', 270, 16)];
    expect(resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(250, 0), [], 400, false, 1000, null, near).escortId).toBeUndefined();
  });
  it('粘着: 追っている軍人(targetEscortId)は等距離のプレイヤーに替えない', () => {
    const e = mkEnemy(0, 0, { targetEscortId: 'a' });
    // プレイヤー中心(266,16)・軍人(250,16): ほぼ等距離だが軍人のまま
    const t = resolveEnemyTarget(e, mkPlayer(250, 0), [], 400, false, 1000, null, [esc('a', 250, 16)]);
    expect(t.escortId).toBe('a');
  });
  it('優先順: 英雄の誘い > ガーディアンのラッチ > 軍人(距離規則)', () => {
    const hero = { id: 'h', x: 60, y: 0, width: 32, height: 32 };
    const t1 = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(300, 0), [], 400, false, 1000, hero, cands);
    expect(t1.escortId).toBeUndefined(); // 英雄(中立)が先
    expect(t1.x).toBeCloseTo(76);
    const ghost = { x: 700, y: 0, width: 24, height: 24, kind: 'ghost-ally' } as unknown as Summon;
    const e = mkEnemy(0, 0, { ghostHateUntil: 6000 });
    const t2 = resolveEnemyTarget(e, mkPlayer(300, 0), [ghost], 400, false, 1000, null, cands);
    expect(t2.escortId).toBeUndefined(); // 殴られた雑魚のラッチ(守護霊)が先
    expect(t2.x).toBeCloseTo(712);
  });
  it('プレイヤーが隠れていても(シーカー)軍人が範囲内ならそれを追う=hidden にならない', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(300, 0), [], 400, true, 1000, null, cands);
    expect(t.hidden).toBe(false);
    expect(t.escortId).toBe('a');
  });
  it('ボス(ヘイト表)は距離規則では軍人へ寄らない(BOSS_SUMMON_AGGRO と同じ)が、hateTarget=escort:<id> ならその軍人を追う(技と移動の主語を揃える)', () => {
    const boss = mkEnemy(0, 0, { type: 'thor', id: 'b' });
    expect(resolveEnemyTarget(boss, mkPlayer(300, 0), [], 400, false, 1000, null, cands).escortId).toBeUndefined();
    const locked = mkEnemy(0, 0, { type: 'thor', id: 'b', hateTarget: escortHateSide('a') });
    const t = resolveEnemyTarget(locked, mkPlayer(300, 0), [], 400, false, 1000, null, cands);
    expect(t.escortId).toBe('a');
    expect(t.x).toBe(100);
    // 軍人の一覧に居なければプレイヤーへ落ちる
    expect(resolveEnemyTarget(locked, mkPlayer(300, 0), [], 400, false, 1000, null, [esc('z', 5, 5)]).escortId).toBeUndefined();
  });
});

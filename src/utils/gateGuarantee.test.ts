import { describe, it, expect } from 'vitest';
import { evaluateGateGuarantee, GATE_FEATURE_GUARANTEE_MS } from './gateGuarantee';
import type { KillBucket } from './killTelemetry';

const ANCHOR: Record<KillBucket, number> = { pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 };

describe('evaluateGateGuarantee (PACING_V2.mdバッチR1-D: 主題保証)', () => {
  it('15秒経過・未出現→投入指示が立つ', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS,
      featuredProblemChildren: ['pumpkin'],
      allowedAtCeiling: ['pumpkin', 'werewolf'],
      anchorSpawns: ANCHOR,
      nowSpawns: ANCHOR,
      alreadyInjected: false,
    });
    expect(r.shouldInject).toBe(true);
    expect(r.type).toBe('pumpkin');
  });

  it('15秒未満では投入指示が立たない', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS - 1,
      featuredProblemChildren: ['pumpkin'],
      allowedAtCeiling: ['pumpkin', 'werewolf'],
      anchorSpawns: ANCHOR,
      nowSpawns: ANCHOR,
      alreadyInjected: false,
    });
    expect(r.shouldInject).toBe(false);
  });

  it('既に出現していれば(nowSpawns>anchorSpawns)投入指示は立たない', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS,
      featuredProblemChildren: ['pumpkin'],
      allowedAtCeiling: ['pumpkin', 'werewolf'],
      anchorSpawns: ANCHOR,
      nowSpawns: { ...ANCHOR, pumpkin: 1 },
      alreadyInjected: false,
    });
    expect(r.shouldInject).toBe(false);
  });

  it('ゾーン0-1では立たない(allowedAtCeilingに型が含まれない=ゾーン天井で解禁されない)', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS,
      featuredProblemChildren: ['pumpkin', 'werewolf'],
      allowedAtCeiling: [], // 初心者ゾーンの天井では問題児が一切解禁されない(憲法第4条)
      anchorSpawns: ANCHOR,
      nowSpawns: ANCHOR,
      alreadyInjected: false,
    });
    expect(r.shouldInject).toBe(false);
    expect(r.type).toBeNull();
  });

  it('既に確定投入済み(1体だけの意図)なら再度は立たない', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS * 3,
      featuredProblemChildren: ['pumpkin'],
      allowedAtCeiling: ['pumpkin'],
      anchorSpawns: ANCHOR,
      nowSpawns: ANCHOR,
      alreadyInjected: true,
    });
    expect(r.shouldInject).toBe(false);
  });

  it('featured内で先に出現済みの型は飛ばし、未出現の型を対象にする', () => {
    const r = evaluateGateGuarantee({
      elapsedMs: GATE_FEATURE_GUARANTEE_MS,
      featuredProblemChildren: ['pumpkin', 'werewolf', 'plant'],
      allowedAtCeiling: ['pumpkin', 'werewolf', 'plant'],
      anchorSpawns: ANCHOR,
      nowSpawns: { ...ANCHOR, pumpkin: 2 }, // pumpkinは既に出現済み
      alreadyInjected: false,
    });
    expect(r.type).toBe('werewolf');
  });

  it('キャップ満杯では待つ: 呼び出し側がpendingを保持して毎フレーム再評価する前提どおり、条件が変わらない限り同じ判定を返し続ける(冪等)', () => {
    const inputs = {
      elapsedMs: GATE_FEATURE_GUARANTEE_MS + 5000,
      featuredProblemChildren: ['pumpkin'] as const,
      allowedAtCeiling: ['pumpkin'] as const,
      anchorSpawns: ANCHOR,
      nowSpawns: ANCHOR,
      alreadyInjected: false,
    };
    const r1 = evaluateGateGuarantee({ ...inputs, featuredProblemChildren: [...inputs.featuredProblemChildren], allowedAtCeiling: [...inputs.allowedAtCeiling] });
    const r2 = evaluateGateGuarantee({ ...inputs, featuredProblemChildren: [...inputs.featuredProblemChildren], allowedAtCeiling: [...inputs.allowedAtCeiling] });
    expect(r1).toEqual(r2);
    expect(r1.shouldInject).toBe(true);
  });
});

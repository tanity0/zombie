import { describe, it, expect } from 'vitest';
import { TORCH_BACK_STAGES, torchBackStage, sharedTorchBackPools, type TorchBackCtx } from './torchBackLight';
import {
  TORCH_BACK_UP, TORCH_BACK_W, TORCH_BACK_H, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX, S1N_TORCH_BACK_ALPHA,
} from './weatherWet';
import { S5B_FIRE_POOLS } from './stage5Battlefield';

const ctx = (stageId: string, farKey: string | null, o: Partial<TorchBackCtx> = {}): TorchBackCtx =>
  ({ stageId, farKey, indoor: false, corridor: false, ...o });

describe('松明の裏の光: ステージの表', () => {
  it('松明の無いステージ(洞窟・2・6・EX)は表に無い=何もしない', () => {
    for (const id of ['stage-tutorial', 'stage-2', 'stage-6', 'stage-ex1', 'stage-ex2', 'stage-ending', 'nope']) {
      expect(torchBackStage(id)).toBeNull();
      expect(sharedTorchBackPools(ctx(id, 'forest'))).toBeNull();
    }
  });
  it('ステージ1の値は従来どおり(寸法・色は雨上がりと同じ・濃さは S1N)', () => {
    const t = TORCH_BACK_STAGES['stage-1'];
    expect(t.owner).toBe('stage1Night');
    expect(t.pools).toEqual([{
      w: TORCH_BACK_W, h: TORCH_BACK_H, up: TORCH_BACK_UP, alpha: S1N_TORCH_BACK_ALPHA, tint: TORCH_BACK_TINT, tintMix: TORCH_BACK_TINT_MIX,
    }]);
    expect([TORCH_BACK_W, TORCH_BACK_H, TORCH_BACK_UP, S1N_TORCH_BACK_ALPHA, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX])
      .toEqual([200, 52, 12, 0.45, 0xffc24e, 0.45]);
  });
  it('ステージ5は戦場の火の溜まりそのもの(燃える残骸と共用)', () => {
    expect(TORCH_BACK_STAGES['stage-5'].owner).toBe('stage5Battle');
    expect(TORCH_BACK_STAGES['stage-5'].pools).toBe(S5B_FIRE_POOLS);
  });
  it('どの丸の絵も足元より奥(画面の上)へずれ、濃さ・色の寄せは 0..1', () => {
    for (const t of Object.values(TORCH_BACK_STAGES)) {
      expect(t.pools.length).toBeGreaterThan(0);
      for (const p of t.pools) {
        expect(p.up).toBeGreaterThan(0);
        expect(p.w).toBeGreaterThan(p.h); // 地面に寝た横長の光
        expect(p.alpha).toBeGreaterThan(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
        expect(p.tintMix).toBeGreaterThanOrEqual(0);
        expect(p.tintMix).toBeLessThanOrEqual(1);
      }
    }
  });
  it('昼のステージ3は夜のステージより控えめ', () => {
    const sum = (id: string) => TORCH_BACK_STAGES[id].pools.reduce((a, p) => a + p.alpha, 0);
    for (const id of ['stage-1', 'stage-4', 'stage-7']) expect(sum('stage-3')).toBeLessThan(sum(id));
  });
});

describe('松明の裏の光: 共通の層のゲート', () => {
  it('ステージ3/4/7はそのステージの遠景の屋外で効く', () => {
    expect(sharedTorchBackPools(ctx('stage-3', 'city'))).toBe(TORCH_BACK_STAGES['stage-3'].pools);
    expect(sharedTorchBackPools(ctx('stage-4', 'snow'))).toBe(TORCH_BACK_STAGES['stage-4'].pools);
    expect(sharedTorchBackPools(ctx('stage-7', 'stage7'))).toBe(TORCH_BACK_STAGES['stage-7'].pools);
  });
  it('ステージ1/5は各ステージの層が描く=共通の層は何もしない(二重に描かない)', () => {
    expect(sharedTorchBackPools(ctx('stage-1', 'forest'))).toBeNull();
    expect(sharedTorchBackPools(ctx('stage-5', 'stage5'))).toBeNull();
  });
  it('屋内・回廊・別の遠景では効かない', () => {
    expect(sharedTorchBackPools(ctx('stage-3', 'city', { indoor: true }))).toBeNull();
    expect(sharedTorchBackPools(ctx('stage-4', 'snow', { corridor: true }))).toBeNull();
    expect(sharedTorchBackPools(ctx('stage-7', 'forest'))).toBeNull();
    expect(sharedTorchBackPools(ctx('stage-3', null))).toBeNull();
  });
});

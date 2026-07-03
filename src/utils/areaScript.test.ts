import { describe, it, expect } from 'vitest';
import {
  AREA_SCRIPT_PATTERNS, AREA_SCRIPT_CAPS, AREA_SCRIPT_CHANCE_BY_AREA,
  AREA_SCRIPT_SPECIAL_UNLOCK_MS, AREA_SCRIPT_SPECIAL_AREA_MIN,
  rollAreaScriptSpawns, rollAreaScriptSpecial, areaScriptGateOk,
  type AreaScriptRollInput,
} from './areaScript';

const NO_REFRACTORY = new Set<never>() as ReadonlySet<never>;

const base: AreaScriptRollInput = {
  areaIdx: 1, chanceRoll: 0, patternRoll: 0, countRoll: 0,
  alive: {}, refractoryTypes: NO_REFRACTORY,
};

describe('AREA_SCRIPT_PATTERNS(PACING_V2.md§2の表そのまま)', () => {
  it('エリア1: パンプキン1 / 犬1 / 弾1-2 の3択', () => {
    expect(AREA_SCRIPT_PATTERNS[1]).toEqual([
      [{ type: 'pumpkin', countMin: 1, countMax: 1 }],
      [{ type: 'werewolf', countMin: 1, countMax: 1 }],
      [{ type: 'plant', countMin: 1, countMax: 2 }],
    ]);
  });

  it('エリア2: パンプキン1+弾1 / 犬1+弾1 / 弾2 の3択', () => {
    expect(AREA_SCRIPT_PATTERNS[2]).toEqual([
      [{ type: 'pumpkin', countMin: 1, countMax: 1 }, { type: 'plant', countMin: 1, countMax: 1 }],
      [{ type: 'werewolf', countMin: 1, countMax: 1 }, { type: 'plant', countMin: 1, countMax: 1 }],
      [{ type: 'plant', countMin: 2, countMax: 2 }],
    ]);
  });

  it('エリア3: パンプキン1+弾2 / 犬1+弾2 / 弾3 の3択', () => {
    expect(AREA_SCRIPT_PATTERNS[3]).toEqual([
      [{ type: 'pumpkin', countMin: 1, countMax: 1 }, { type: 'plant', countMin: 2, countMax: 2 }],
      [{ type: 'werewolf', countMin: 1, countMax: 1 }, { type: 'plant', countMin: 2, countMax: 2 }],
      [{ type: 'plant', countMin: 3, countMax: 3 }],
    ]);
  });

  it('エリア4(塩梅任せ): 全パターンがキャップ(パンプキン2/犬2/弾3)内に収まる', () => {
    for (const pattern of AREA_SCRIPT_PATTERNS[4]) {
      for (const spec of pattern) {
        expect(spec.countMax, `${spec.type}`).toBeLessThanOrEqual(AREA_SCRIPT_CAPS[spec.type]);
      }
    }
  });

  it('エリア0(軍備配置)はパターン無し・確率0=何も出ない', () => {
    expect(AREA_SCRIPT_PATTERNS[0]).toBeUndefined();
    expect(AREA_SCRIPT_CHANCE_BY_AREA[0]).toBe(0);
    expect(rollAreaScriptSpawns({ ...base, areaIdx: 0 })).toEqual([]);
  });

  it('確率はエリアが深いほど高い(単調非減少)', () => {
    for (let a = 1; a < AREA_SCRIPT_CHANCE_BY_AREA.length; a++) {
      expect(AREA_SCRIPT_CHANCE_BY_AREA[a]).toBeGreaterThanOrEqual(AREA_SCRIPT_CHANCE_BY_AREA[a - 1]);
    }
  });
});

describe('rollAreaScriptSpawns(メイントラック)', () => {
  it('chanceRollが確率以上なら発火しない(「たまに」の実体)', () => {
    expect(rollAreaScriptSpawns({ ...base, chanceRoll: 0.20 })).toEqual([]); // エリア1=0.20ちょうどは外れ
    expect(rollAreaScriptSpawns({ ...base, chanceRoll: 0.19 }).length).toBeGreaterThan(0);
  });

  it('エリア1の弾パターンはcountRollで1-2体を解決する', () => {
    const low = rollAreaScriptSpawns({ ...base, patternRoll: 0.99, countRoll: 0 });   // 3択目=弾
    const high = rollAreaScriptSpawns({ ...base, patternRoll: 0.99, countRoll: 0.99 });
    expect(low).toEqual([{ type: 'plant', count: 1 }]);
    expect(high).toEqual([{ type: 'plant', count: 2 }]);
  });

  it('キャップ超過分は切り捨てる(弾: 生存2+指定2→1体だけ/生存3→0体)', () => {
    const clipped = rollAreaScriptSpawns({ ...base, areaIdx: 2, patternRoll: 0.99, alive: { plant: 2 } }); // エリア2弾2指定
    expect(clipped).toEqual([{ type: 'plant', count: 1 }]);
    const full = rollAreaScriptSpawns({ ...base, areaIdx: 2, patternRoll: 0.99, alive: { plant: 3 } });
    expect(full).toEqual([]);
  });

  it('パンプキン生存2(キャップ)ならセットの弾だけが出る(エリア2のパンプキン+弾1)', () => {
    const r = rollAreaScriptSpawns({ ...base, areaIdx: 2, patternRoll: 0, alive: { pumpkin: 2 } });
    expect(r).toEqual([{ type: 'plant', count: 1 }]);
  });

  it('リフラクトリ中の型は投入しない', () => {
    const r = rollAreaScriptSpawns({ ...base, patternRoll: 0, refractoryTypes: new Set(['pumpkin']) });
    expect(r).toEqual([]); // エリア1パンプキン単独パターン→丸ごと空
  });
});

describe('rollAreaScriptSpecial(別枠: 叫び1/ゴースト2)', () => {
  const sBase = { areaIdx: 1, gameTimeMs: 0, chanceRoll: 0, pickRoll: 0, alive: {} };

  it('3分未満かつエリア3未満では解禁されない', () => {
    expect(rollAreaScriptSpecial({ ...sBase, gameTimeMs: AREA_SCRIPT_SPECIAL_UNLOCK_MS - 1, areaIdx: 2 })).toBeNull();
  });

  it('3分経過で解禁(浅いエリアでも)', () => {
    expect(rollAreaScriptSpecial({ ...sBase, gameTimeMs: AREA_SCRIPT_SPECIAL_UNLOCK_MS, areaIdx: 1 })).not.toBeNull();
  });

  it('エリア3以降は開始直後(0ms)から出現しうる', () => {
    expect(rollAreaScriptSpecial({ ...sBase, gameTimeMs: 0, areaIdx: AREA_SCRIPT_SPECIAL_AREA_MIN })).not.toBeNull();
  });

  it('キャップ: 叫び生存1なら候補はゴーストのみ/両方満杯ならnull', () => {
    const onlyGhost = rollAreaScriptSpecial({ ...sBase, areaIdx: 3, alive: { screamer: 1 }, pickRoll: 0 });
    expect(onlyGhost).toBe('ghost');
    const none = rollAreaScriptSpecial({ ...sBase, areaIdx: 3, alive: { screamer: 1, ghost: 2 } });
    expect(none).toBeNull();
  });

  it('chanceRollが確率以上なら発火しない', () => {
    expect(rollAreaScriptSpecial({ ...sBase, areaIdx: 3, chanceRoll: 0.10 })).toBeNull();
  });
});

describe('areaScriptGateOk(§3ディレクター連携: いつ出すかの判断)', () => {
  it('通常時(buildup/peak・intensity低・pity無し)は発火可', () => {
    expect(areaScriptGateOk({ macro: 'buildup', intensity: 0.3, pityBlocked: false })).toBe(true);
  });
  it('RELAX中(息継ぎ)は発火しない', () => {
    expect(areaScriptGateOk({ macro: 'relax', intensity: 0.1, pityBlocked: false })).toBe(false);
  });
  it('intensity>=0.75(ピンチ)は発火しない', () => {
    expect(areaScriptGateOk({ macro: 'buildup', intensity: 0.75, pityBlocked: false })).toBe(false);
  });
  it('pity(救済)発動中は発火しない', () => {
    expect(areaScriptGateOk({ macro: 'buildup', intensity: 0.3, pityBlocked: true })).toBe(false);
  });
});

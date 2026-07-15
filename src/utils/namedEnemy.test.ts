import { describe, it, expect } from 'vitest';
import {
  NAMED_ENEMY_NAMES, isPromotionExcluded, pickNamedEnemyName, rollNamedSpawnThisRun, decidePromotionOnDeath,
  normalizeNamedName, normalizeNamedNamesInText,
} from './namedEnemy';

describe('NAMED_ENEMY_NAMES', () => {
  it('has 32 distinct names (社長指示: 候補は多いほど良い)', () => {
    expect(NAMED_ENEMY_NAMES.length).toBe(32);
    expect(new Set(NAMED_ENEMY_NAMES).size).toBe(32);
  });

  it('§6.20 M45: all names use the "CODE:ROMAN" display format', () => {
    for (const name of NAMED_ENEMY_NAMES) {
      expect(name).toMatch(/^CODE:[A-Z]+$/);
    }
  });
});

describe('normalizeNamedName (§6.20 M45)', () => {
  it('maps legacy katakana names (angels/hidden bosses/named foes) to the new CODE:ROMAN display', () => {
    expect(normalizeNamedName('ミゲル')).toBe('CODE:MIGUEL');
    expect(normalizeNamedName('ジブリル')).toBe('CODE:JIBRIL');
    expect(normalizeNamedName('ラフィ')).toBe('CODE:RAFI');
    expect(normalizeNamedName('ミーミル')).toBe('CODE:MIMIR');
    expect(normalizeNamedName('ヨルムンガルド')).toBe('CODE:JORMUNGAND');
    expect(normalizeNamedName('スカジ')).toBe('CODE:SKADI');
    expect(normalizeNamedName('トール')).toBe('CODE:THOR');
    expect(normalizeNamedName('ケルベロス')).toBe('CODE:CERBERUS');
    expect(normalizeNamedName('ヒュプノス')).toBe('CODE:HYPNOS');
  });

  it('returns unknown/already-new names unchanged', () => {
    expect(normalizeNamedName('CODE:CERBERUS')).toBe('CODE:CERBERUS');
    expect(normalizeNamedName('未知の名前')).toBe('未知の名前');
    expect(normalizeNamedName('')).toBe('');
  });
});

describe('normalizeNamedNamesInText (§6.20追補: 年表など記録済み文言の表示時正規化)', () => {
  it('文中の旧名を新表記へ置換し、「天使」接頭辞は接頭辞ごと外す(社長指示v0.25.1756)', () => {
    expect(normalizeNamedNamesInText('天使ミゲルを討伐')).toBe('CODE:MIGUELを討伐');
    expect(normalizeNamedNamesInText('ミーミルを討伐')).toBe('CODE:MIMIRを討伐');
    expect(normalizeNamedNamesInText('ヨルムンガルドを討伐')).toBe('CODE:JORMUNGANDを討伐');
  });

  it('複数の旧名・旧名なし・新表記済みの文もそれぞれ正しく扱う', () => {
    expect(normalizeNamedNamesInText('トールとスカジを討伐')).toBe('CODE:THORとCODE:SKADIを討伐');
    expect(normalizeNamedNamesInText('ストーリーボスを討伐')).toBe('ストーリーボスを討伐');
    expect(normalizeNamedNamesInText('CODE:MIGUELを討伐')).toBe('CODE:MIGUELを討伐');
    expect(normalizeNamedNamesInText('深層域に到達')).toBe('深層域に到達');
  });
});

describe('isPromotionExcluded', () => {
  it('excludes castle boss (giantbat), reaper, hidden bosses, unknown killer, and red-night', () => {
    expect(isPromotionExcluded('giantbat', false)).toBe(true);
    expect(isPromotionExcluded('reaper', false)).toBe(true);
    expect(isPromotionExcluded('mimir', false)).toBe(true);
    expect(isPromotionExcluded('jormungand', false)).toBe(true);
    expect(isPromotionExcluded('skadi', false)).toBe(true);
    expect(isPromotionExcluded('thor', false)).toBe(true);
    expect(isPromotionExcluded(undefined, false)).toBe(true);
    expect(isPromotionExcluded(null, false)).toBe(true);
    expect(isPromotionExcluded('zombie', true)).toBe(true); // 紅き月中は対象外
  });

  it('allows ordinary chaff/nuisance types outside red night', () => {
    expect(isPromotionExcluded('zombie', false)).toBe(false);
    expect(isPromotionExcluded('skeleton', false)).toBe(false);
    expect(isPromotionExcluded('pumpkin', false)).toBe(false);
  });
});

describe('pickNamedEnemyName / rollNamedSpawnThisRun (RNG injection)', () => {
  it('picks the name at the injected RNG index deterministically', () => {
    expect(pickNamedEnemyName(() => 0)).toBe(NAMED_ENEMY_NAMES[0]);
    expect(pickNamedEnemyName(() => 0.999999)).toBe(NAMED_ENEMY_NAMES[31]);
  });

  it('rolls true/false at exactly the 60% boundary', () => {
    expect(rollNamedSpawnThisRun(() => 0.59)).toBe(true);
    expect(rollNamedSpawnThisRun(() => 0.6)).toBe(false);
  });
});

describe('decidePromotionOnDeath', () => {
  it('does nothing when killed by an excluded type', () => {
    expect(decidePromotionOnDeath('giantbat', false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath('reaper', false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath(undefined, false, false)).toEqual({ kind: 'none' });
    expect(decidePromotionOnDeath('zombie', false, true)).toEqual({ kind: 'none' }); // 紅き月中
  });

  it('grudges (no re-strengthen) when killed by the active named-foe instance itself, even for an excluded type', () => {
    expect(decidePromotionOnDeath('zombie', true, false)).toEqual({ kind: 'grudge' });
    expect(decidePromotionOnDeath('giantbat', true, false)).toEqual({ kind: 'grudge' }); // named-kill takes priority
  });

  it('overwrites (fresh promotion, grudge implicitly 0 by caller) when killed by a new eligible type', () => {
    const outcome = decidePromotionOnDeath('skeleton', false, false, () => 0);
    expect(outcome).toEqual({ kind: 'overwrite', type: 'skeleton', name: NAMED_ENEMY_NAMES[0] });
  });
});

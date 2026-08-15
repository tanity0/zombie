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

  it('v0.25.3199(社長指示「CODE削除」): all names are bare ROMAN (no CODE: prefix)', () => {
    for (const name of NAMED_ENEMY_NAMES) {
      expect(name).toMatch(/^[A-Z]+$/);
    }
  });
});

describe('normalizeNamedName (§6.20 M45 / v0.25.3199 CODE削除 / 名称統一v3443 ボスは和名へ)', () => {
  it('宿敵(ギリシャ神話32名)は旧カタカナ→素のローマ字のまま(v0.25.3199の正)', () => {
    expect(normalizeNamedName('ケルベロス')).toBe('CERBERUS');
    expect(normalizeNamedName('ヒュプノス')).toBe('HYPNOS');
  });

  it('固有名ボス(天使/裏ボス)は旧ローマ字→カットイン台帳の和名(名称統一v3443)', () => {
    expect(normalizeNamedName('MIGUEL')).toBe('ミゲル');
    expect(normalizeNamedName('JIBRIL')).toBe('ジブリル');
    expect(normalizeNamedName('RAFI')).toBe('ラフィ');
    expect(normalizeNamedName('MIMIR')).toBe('ミーミル');
    expect(normalizeNamedName('JORMUNGAND')).toBe('ヨルムンガルド');
    expect(normalizeNamedName('SKADI')).toBe('スカジ');
    expect(normalizeNamedName('THOR')).toBe('トール');
    expect(normalizeNamedName('CODE:MIMIR')).toBe('ミーミル');
  });

  it('strips the legacy CODE: prefix and returns unknown/already-new names unchanged', () => {
    expect(normalizeNamedName('CODE:CERBERUS')).toBe('CERBERUS');
    expect(normalizeNamedName('CERBERUS')).toBe('CERBERUS');
    expect(normalizeNamedName('ミーミル')).toBe('ミーミル'); // 既に和名=そのまま
    expect(normalizeNamedName('未知の名前')).toBe('未知の名前');
    expect(normalizeNamedName('')).toBe('');
  });
});

describe('normalizeNamedNamesInText (§6.20追補: 年表など記録済み文言の表示時正規化)', () => {
  it('固有名ボスの旧表記(ローマ字/CODE:/天使接頭辞)を和名へ置換する(名称統一v3443)', () => {
    expect(normalizeNamedNamesInText('MIMIRを討伐')).toBe('ミーミルを討伐');
    expect(normalizeNamedNamesInText('CODE:MIGUELを討伐')).toBe('ミゲルを討伐');
    expect(normalizeNamedNamesInText('天使ミゲルを討伐')).toBe('ミゲルを討伐');
    expect(normalizeNamedNamesInText('アイドルを討伐')).toBe('偶像を討伐');
    expect(normalizeNamedNamesInText('ミーミルを討伐')).toBe('ミーミルを討伐'); // 和名記録はそのまま
  });

  it('SURIEL⊃URIの包含関係でも長い名前から置換される', () => {
    expect(normalizeNamedNamesInText('SURIELを討伐')).toBe('スリィエルを討伐');
    expect(normalizeNamedNamesInText('URIを討伐')).toBe('ウリを討伐');
  });

  it('複数の旧名・旧名なし・宿敵(ローマ字が正)の文もそれぞれ正しく扱う', () => {
    expect(normalizeNamedNamesInText('THORとSKADIを討伐')).toBe('トールとスカジを討伐');
    expect(normalizeNamedNamesInText('ストーリーボスを討伐')).toBe('ストーリーボスを討伐');
    expect(normalizeNamedNamesInText('ケルベロスを討伐')).toBe('CERBERUSを討伐');
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

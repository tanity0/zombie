import { describe, it, expect } from 'vitest';
import {
  NAMED_ENEMY_NAMES, isPromotionExcluded, pickNamedEnemyName, rollNamedSpawnThisRun, decidePromotionOnDeath, sanitizeNamedFoe, resolveDamager,
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

  it('always spawns the nemesis on the next sortie (chance 1, 社長指示2026-10-09)', () => {
    expect(rollNamedSpawnThisRun(() => 0)).toBe(true);
    expect(rollNamedSpawnThisRun(() => 0.999999)).toBe(true);
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

// v0.25.3694(社長報告「鴉は敵として通常ステージに出てきたよ！」): 幻影(guardian-phantom)は
// 対戦専用の型なので宿敵に昇格させない+過去の穴で保存された端末は読込時に浄化する。
describe('幻影(guardian-phantom)は宿敵にならない', () => {
  it('幻影に殺されても昇格しない', () => {
    expect(decidePromotionOnDeath('guardian-phantom', false, false)).toEqual({ kind: 'none' });
  });

  it('sanitizeNamedFoe: 除外型の保存データはnull(浄化)・通常型はそのまま', () => {
    expect(sanitizeNamedFoe({ type: 'guardian-phantom' as const, name: '鴉', grudge: 2 })).toBeNull();
    expect(sanitizeNamedFoe({ type: 'giantbat' as const, name: 'x', grudge: 0 })).toBeNull();
    const ok = { type: 'zombie' as const, name: 'ハロルド', grudge: 1 };
    expect(sanitizeNamedFoe(ok)).toBe(ok);
    expect(sanitizeNamedFoe(null)).toBeNull();
  });
});

describe('resolveDamager(倒した相手の解決・v0.25.4997)', () => {
  const enemies = [
    { id: 'z1', type: 'zombie' as const },
    { id: 'n1', type: 'pumpkin' as const, isNamed: true },
  ];
  it('型が渡らない被弾(噛みつき・接触)は個体idで場の敵から型を引く', () => {
    expect(resolveDamager(undefined, undefined, ['z1'], enemies)).toEqual({ type: 'zombie', wasNamed: false, id: 'z1' });
  });
  it('宿敵本人の個体なら wasNamed=true(因縁の判定に届く)', () => {
    expect(resolveDamager(undefined, undefined, [undefined, 'n1'], enemies)).toEqual({ type: 'pumpkin', wasNamed: true, id: 'n1' });
  });
  it('発射元が倒れている弾は手がかりの型を使う', () => {
    expect(resolveDamager(undefined, undefined, [undefined, undefined, 'gone'], enemies, 'skeleton')).toEqual({ type: 'skeleton', wasNamed: false, id: 'gone' });
  });
  it('明示された型が最優先・何も分からなければ null', () => {
    expect(resolveDamager('guardian-phantom', undefined, ['z1'], enemies).type).toBe('guardian-phantom');
    expect(resolveDamager(undefined, undefined, [], enemies)).toEqual({ type: null, wasNamed: false, id: null });
  });
});

describe('専用の tick で動くボス級は宿敵にならない(v0.25.4997)', () => {
  it('賞金首・英雄(変異)・解放軍の旗手は対象外', () => {
    expect(isPromotionExcluded('bounty-melee', false)).toBe(true);
    expect(isPromotionExcluded('bounty-maiko', false)).toBe(true);
    expect(isPromotionExcluded('mutant-hero', false)).toBe(true);
    expect(isPromotionExcluded('mutant-liberty', false)).toBe(true);
  });
});

describe('死神の使者・ハンターは宿敵にならない(社長指示2026-10-13)', () => {
  it('使者(hangedman)・ハンター・死神本体は対象外', () => {
    expect(isPromotionExcluded('hangedman', false)).toBe(true);
    expect(isPromotionExcluded('hunter', false)).toBe(true);
    expect(isPromotionExcluded('reaper', false)).toBe(true);
  });
  it('保存済みの宿敵が使者・ハンターなら浄化で消える', () => {
    expect(sanitizeNamedFoe({ type: 'hangedman', name: 'x', grudge: 0 })).toBeNull();
    expect(sanitizeNamedFoe({ type: 'hunter', name: 'x', grudge: 1 })).toBeNull();
  });
});

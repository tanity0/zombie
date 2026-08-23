// research/SAME_ARENA.md O-5「幻影の中身が『他人』になる」の受け入れ条件を機械化する。
// 眼目は「装備だけ他人にしても意味が無い=**癖・ビルド・名前が必ず同じ1人から来る**」こと。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pickFixedPhantom, pickPhantomIdentity, setPhantomIdentity, getPhantomIdentity,
  clearPhantomIdentity, phantomDisplayLabel,
} from './phantomIdentity';
import { phantomProfile } from './phantomTick';
import { FIXED_GUARDIANS, strongestGuardian } from '../data/fixedGuardians';

beforeEach(() => { clearPhantomIdentity(); });

describe('O-5 幻影の人格', () => {
  it('★固定20人から選ぶので「常に同じ1人」ではない(乱数を振ると別人になる)', () => {
    const first = pickFixedPhantom(() => 0);
    const last = pickFixedPhantom(() => 0.999);
    expect(FIXED_GUARDIANS.length).toBeGreaterThan(1);
    expect(first.name).not.toBe(last.name);
    expect(first.source).toBe('fixed');
  });

  it('★癖・ビルド・名前が必ず同じ1人から来る(バラバラの人物が混ざらない)', () => {
    const id = pickFixedPhantom(() => 0.5);
    const g = FIXED_GUARDIANS.find(x => x.name === id.name)!;
    expect(id.profile).toBe(g.profile);                       // 癖
    expect(id.profile.snapshot).toBe(g.profile.snapshot);     // ビルド(=同じprofileの中身)
    expect(id.name).toBe(g.name);                             // 名前
  });

  it('乱数が壊れていても落ちない(NaN/範囲外は先頭へ丸める)', () => {
    expect(pickFixedPhantom(() => Number.NaN).name).toBe(FIXED_GUARDIANS[0].name);
    expect(pickFixedPhantom(() => 1.5).name).toBeTruthy();
    expect(pickFixedPhantom(() => -3).name).toBe(FIXED_GUARDIANS[0].name);
  });

  it('オンライン候補が無ければ固定20人へ落ちる(オフラインでも成立する)', () => {
    const id = pickPhantomIdentity('stage-1', () => 0.25);
    expect(id.source).toBe('fixed');
    expect(FIXED_GUARDIANS.some(g => g.name === id.name)).toBe(true);
  });
});

describe('O-5 表示名は人格に追従する', () => {
  it('人格が未設定なら従来どおり台帳の最強データ(=1bit不変)', () => {
    expect(phantomDisplayLabel()).toBe(`${strongestGuardian().name}(幻影)`);
  });

  it('人格を設定するとその人の名前になる', () => {
    const id = pickFixedPhantom(() => 0.8);
    setPhantomIdentity(id);
    expect(phantomDisplayLabel()).toBe(`${id.name}(幻影)`);
  });

  it('★ラン境界で捨てられる(前のランの他人の名前を持ち越さない)', () => {
    setPhantomIdentity(pickFixedPhantom(() => 0.8));
    clearPhantomIdentity();
    expect(getPhantomIdentity()).toBeNull();
    expect(phantomDisplayLabel()).toBe(`${strongestGuardian().name}(幻影)`);
  });
});

describe('O-5 頭脳(癖)も人格から来る', () => {
  it('★人格を切り替えると phantomProfile も切り替わる(キャッシュが人格を跨いで固まらない)', () => {
    // 癖の値が実際に違う2人を選ぶ(台帳は個性の分類順なので端どうしは差がある)
    const a = FIXED_GUARDIANS.find(g => g.profile.counterChance !== FIXED_GUARDIANS[0].profile.counterChance)
      ?? FIXED_GUARDIANS[FIXED_GUARDIANS.length - 1];
    setPhantomIdentity({ name: FIXED_GUARDIANS[0].name, profile: FIXED_GUARDIANS[0].profile, source: 'fixed' });
    const p0 = phantomProfile();
    setPhantomIdentity({ name: a.name, profile: a.profile, source: 'fixed' });
    const p1 = phantomProfile();
    expect(p0.counterChance).toBe(FIXED_GUARDIANS[0].profile.counterChance);
    expect(p1.counterChance).toBe(a.profile.counterChance);
  });

  it('人格が未設定なら従来どおり台帳の最強データの癖(=1bit不変)', () => {
    const p = phantomProfile();
    expect(p.counterChance).toBe(strongestGuardian().profile.counterChance);
    expect(p.preferredDist).toBe(strongestGuardian().profile.preferredDist);
  });
});

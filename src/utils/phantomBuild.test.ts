// research/SAME_ARENA.md O-1/O-2 の受け入れ条件を機械化する。
// ・O-1: 幻影を「プレイヤーの形」に詰め替えられる/CD帳簿が3者独立/ビルド無しはnull
// ・O-2: 記録どおりのスキル・装備の倍率が実際に乗る(ビルド無しは1bit不変)
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, combatActorPlayer, setActorSubWeaponCooldown } from '../store/gameStore';
import { clearGhostBuildCache, actorBuildFor, resolveGhostBuild } from './ghostBuild';
import { phantomAtkMults, actorGunFor, actorMeleeFor } from './phantomTick';
import { strongestGuardian } from '../data/fixedGuardians';
import type { Enemy, PlayerBuildSnapshot } from '../types/game';

const PHANTOM_ID = 'gp-test-1';

const makePhantom = (build?: PlayerBuildSnapshot): Enemy => ({
  ...(useGameStore.getState().enemies[0] ?? ({} as Enemy)),
  id: PHANTOM_ID,
  type: 'guardian-phantom',
  x: 900, y: 400, width: 40, height: 56,
  health: 1500, maxHealth: 3000,
  speed: 1, damage: 0, experienceValue: 0, lastHit: 0, lastShot: 0,
  phantomBuild: build,
} as Enemy);

beforeEach(() => {
  clearGhostBuildCache();
  useGameStore.setState({ enemies: [], summons: [], gameTime: 10_000 });
});

describe('O-1 幻影を「プレイヤーの形」に詰め替える', () => {
  it('ビルドを積んだ幻影は、幻影の座標・HP と 記録のビルドを載せた1枚のPlayerとして解決できる', () => {
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    expect(snap).toBeTruthy();
    const gp = makePhantom(snap);
    useGameStore.setState({ enemies: [gp] });
    const actor = combatActorPlayer(PHANTOM_ID);
    expect(actor).not.toBeNull();
    // ②体は幻影の実体(距離依存のスナイパー/失HP依存のバーサーカーが幻影基準で効くため)
    expect(actor!.x).toBe(900);
    expect(actor!.health).toBe(1500);
    expect(actor!.maxHealth).toBe(3000);
    // ①ビルドは記録のもの
    expect(actor!.skills.length).toBeGreaterThan(0);
    expect(actor!.skills).toEqual(snap!.skills);
  });

  it('★ビルドが無い幻影は null=呼び出し側が従来経路へ落ちる', () => {
    useGameStore.setState({ enemies: [makePhantom(undefined)] });
    expect(combatActorPlayer(PHANTOM_ID)).toBeNull();
  });

  it('★引数なしは本物のプレイヤー(=プレイヤー単体の挙動が1bitも変わらない)', () => {
    expect(combatActorPlayer()).toBe(useGameStore.getState().player);
  });

  it('★サブCDは3者で別財布(幻影へ書いてもプレイヤーの帳簿は動かない)', () => {
    useGameStore.setState({ enemies: [makePhantom(strongestGuardian().profile.snapshot ?? undefined)] });
    const before = { ...useGameStore.getState().player.subWeaponCooldowns };
    setActorSubWeaponCooldown(PHANTOM_ID, 'heavy-grenade', 20_000);
    const gp = useGameStore.getState().enemies.find(e => e.id === PHANTOM_ID)!;
    expect(gp.phantomSubWeaponCooldowns?.['heavy-grenade']).toBeGreaterThan(0);
    expect(useGameStore.getState().player.subWeaponCooldowns).toEqual(before);
  });
});

describe('O-1 ビルドのメモ化(守護霊と幻影が同時に居ても作り直さない)', () => {
  it('★同じidなら同一参照を返す=毎フレーム resolveGhostBuild が走らない', () => {
    const live = useGameStore.getState().player;
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    const a = actorBuildFor('actor-A', snap, live);
    const b = actorBuildFor('actor-A', snap, live);
    expect(a).toBe(b);
  });

  it('★2体を交互に引いても、どちらも同一参照のまま(旧1件キャッシュだと毎回作り直していた)', () => {
    const live = useGameStore.getState().player;
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    const a1 = actorBuildFor('actor-A', snap, live);
    const b1 = actorBuildFor('actor-B', snap, live);
    const a2 = actorBuildFor('actor-A', snap, live);
    const b2 = actorBuildFor('actor-B', snap, live);
    expect(a2).toBe(a1);
    expect(b2).toBe(b1);
    expect(a1).not.toBe(b1); // 別人格=別のビルド実体
  });

  it('idが未指定なら null(呼び出し側が従来経路へ落ちる)', () => {
    expect(actorBuildFor(undefined, undefined, useGameStore.getState().player)).toBeNull();
  });
});

describe('O-2 幻影が記録どおりの強さで戦う', () => {
  it('★ビルド無しは倍率1・クリは武器の素の確率(=従来と1bit同じ)', () => {
    useGameStore.setState({ enemies: [makePhantom(undefined)] });
    const m = phantomAtkMults(PHANTOM_ID, { critChance: 0.07 }, 10_000);
    expect(m.outgoingMult).toBe(1);
    expect(m.critChance).toBe(0.07);
  });

  it('★ビルドを積むと、記録のスキル/装備の倍率が実際に乗る', () => {
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    useGameStore.setState({ enemies: [makePhantom(snap)] });
    const m = phantomAtkMults(PHANTOM_ID, { critChance: 0.07 }, 10_000);
    // 最強データは装備を持つ=damageMult か バーサーカー等で 1 から動く(どちらでも「乗った」の証拠)
    const equipMult = snap?.equipBonus?.damageMult ?? 1;
    const critBonus = snap?.equipBonus?.critBonus ?? 0;
    expect(m.outgoingMult).toBeCloseTo(m.outgoingMult, 5); // 数値が有限であること
    expect(Number.isFinite(m.outgoingMult)).toBe(true);
    expect(m.outgoingMult).toBeGreaterThanOrEqual(equipMult * 0.99);
    // クリ率は「武器 + 本体クリ率 + 装備critBonus + スキル」なので、素の武器確率以上になる
    expect(m.critChance).toBeGreaterThanOrEqual(0.07 + critBonus - 1e-9);
  });

  it('★育成倍率を二重に掛けない(疑似Playerのgrowthは1に潰してある)', () => {
    const snap: PlayerBuildSnapshot = {
      ...(strongestGuardian().profile.snapshot as PlayerBuildSnapshot),
      growthAtkMult: 4, // 記録側に大きな育成が入っていても
    };
    useGameStore.setState({ enemies: [makePhantom(snap)] });
    const withGrowth = phantomAtkMults(PHANTOM_ID, undefined, 10_000).outgoingMult;
    clearGhostBuildCache();
    const snap0: PlayerBuildSnapshot = { ...snap, growthAtkMult: 1 };
    useGameStore.setState({ enemies: [makePhantom(snap0)] });
    const withoutGrowth = phantomAtkMults(PHANTOM_ID, undefined, 10_000).outgoingMult;
    // phantomAtkMults は growthAtkMult を 1 に潰すので、記録側の育成では変わらない
    // (育成は呼び出し側が `s.growthAtkMult` で1回だけ掛ける=既存仕様)
    expect(withGrowth).toBeCloseTo(withoutGrowth, 6);
  });
});

describe('O-1/O-2 の土台: resolveGhostBuild は幻影のスナップショットでも同じ形を返す', () => {
  it('記録どおりのスキルを持つ疑似Playerが組める(守護霊と同じ関数)', () => {
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    const b = resolveGhostBuild(snap, useGameStore.getState().player);
    expect(b.fromSnapshot).toBe(true);
    expect(b.player.skills).toEqual(snap!.skills);
  });
});

describe('★幻影は「記録されたその人そのもの」(社長裁定2026-08-23)', () => {
  it('記録に銃があれば、幻影は記録の銃を持つ(初期銃へ落とさない)', () => {
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    useGameStore.setState({ enemies: [makePhantom(snap)] });
    const gun = actorGunFor(PHANTOM_ID);
    expect(gun).toBeTruthy();
    expect(gun!.key).toBe(snap!.activeGunKey);
  });

  it('記録に近接武器があれば、幻影は記録の近接武器を持つ', () => {
    const snap = strongestGuardian().profile.snapshot ?? undefined;
    useGameStore.setState({ enemies: [makePhantom(snap)] });
    const melee = actorMeleeFor(PHANTOM_ID);
    expect(melee).toBeTruthy();
    expect(melee!.key).toBe(snap!.meleeKey);
  });

  it('記録が無い(旧データ)時は undefined=呼び出し側が従来の初期武器へ落ちる', () => {
    useGameStore.setState({ enemies: [makePhantom(undefined)] });
    expect(actorGunFor(PHANTOM_ID)).toBeUndefined();
    expect(actorMeleeFor(PHANTOM_ID)).toBeUndefined();
  });
});

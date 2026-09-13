// 永続育成「強化」の**配線**テスト(research/GROWTH.md v4)。純関数側は utils/playerUpgrades.test.ts。
//
// ここで見るのは3つだけ:
//   ①「全メーター0 = 育成機能が無かった時(初期130化後)と完全に一致する」(最重要の不変条件)
//   ②「メーター変更はラン中に効かない」(=焼き込みの原則が機械的に守られているか)
//   ③ 写し先(幻影・守護霊)と処刑の前掛けが0段で不変か
//
// localStorage は node 環境に無いので、gameStore を読む**前に**スタブを差す
// (practiceGuard.test.ts / subquestProgress.test.ts と同じ流儀)。
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { useGameStore, AMMO_MAX, skillOutgoingDamageMult } = await import('./gameStore');
const { PLAYER_PROFILES } = await import('../data/playerProfiles');
const { PLAYER_UPGRADE_IDS, PLAYER_UPGRADE_MAX_LEVEL } = await import('../data/playerUpgrades');
const { PLAYER_UPGRADES_KEY, emptyPlayerUpgrades, growthMaxHpBonus, savePlayerUpgrades } = await import('../utils/playerUpgrades');
const { guardianPhantomHealth } = await import('../config/bossHealth');
const { snapshotPlayerBuild, buildPseudoPlayer } = await import('../utils/playerBuild');
const { spawnEnemyAt } = await import('../utils/enemyUtils');

/** 育成の保存を消してから出撃する(=何も買っていない状態)。 */
const sortieWithNoGrowth = () => {
  mem.clear();
  useGameStore.setState({ playerUpgrades: emptyPlayerUpgrades() });
  useGameStore.getState().resetGame('warrior');
};

/** 全系統を上限まで買って(有効段数も上限)出撃する。 */
const sortieWithMaxGrowth = () => {
  mem.clear();
  useGameStore.setState({ playerUpgrades: emptyPlayerUpgrades() });
  useGameStore.getState().addGold(99999);
  for (const id of PLAYER_UPGRADE_IDS) {
    for (let i = 0; i < PLAYER_UPGRADE_MAX_LEVEL; i++) expect(useGameStore.getState().buyPlayerUpgrade(id)).toBe(true);
  }
  useGameStore.getState().resetGame('warrior');
};

beforeEach(() => { sortieWithNoGrowth(); });

describe('★最重要: 全メーター0 = 育成機能が無かった時(初期130化後)と一致', () => {
  it('HP加算0 / 攻撃倍率1.0 / 弾上限=AMMO_MAX素値 / ゴールド倍率1.0 / ddaBaseHp=profile.maxHp', () => {
    const p = useGameStore.getState().player;
    expect(PLAYER_PROFILES.warrior.maxHp).toBe(130); // 前提変更(110→130)
    expect(p.maxHealth).toBe(PLAYER_PROFILES.warrior.maxHp); // 装備なし=素の初期HPそのもの
    expect(p.ddaBaseHp).toBe(PLAYER_PROFILES.warrior.maxHp);
    expect(p.growthAtkMult).toBe(1);
    expect(p.growthGoldMult).toBe(1);
    expect(p.growthAmmoMax).toEqual(AMMO_MAX);
    expect(skillOutgoingDamageMult(p)).toBe(1); // 攻撃の合流点も素通し
  });

  it('弾薬の上限も素値のまま(addAmmo のclamp)', () => {
    useGameStore.getState().addAmmo('handgun', 9999);
    expect(useGameStore.getState().player.ammoHandgun).toBe(AMMO_MAX.handgun);
  });
});

describe('育成MAX(全系統5段)の焼き込み', () => {
  it('HP+100 / 攻撃×1.2 / 弾上限+25% / ゴールド×1.5 / ddaBaseHp も育成込み', () => {
    sortieWithMaxGrowth();
    const p = useGameStore.getState().player;
    expect(p.maxHealth).toBe(230);
    expect(p.ddaBaseHp).toBe(230);
    expect(p.growthAtkMult).toBeCloseTo(1.2, 10);
    expect(p.growthGoldMult).toBeCloseTo(1.5, 10);
    // glauncher はライフル弾共用=同値で追従する(同ティア武器拾得の弾変換がこのキーを引く)。
    expect(p.growthAmmoMax).toEqual({ handgun: 90, shotgun: 30, rifle: 45, phill: 60, glauncher: 45 });
    expect(skillOutgoingDamageMult(p)).toBeCloseTo(1.2, 10);
    useGameStore.getState().addAmmo('handgun', 9999);
    expect(useGameStore.getState().player.ammoHandgun).toBe(90);
  });
});

describe('★メーター変更はラン中に効かない(焼き込みの原則)', () => {
  it('出撃後に store と保存の active を変えても、焼き値と各適用点の結果が変わらない', () => {
    sortieWithMaxGrowth();
    const before = useGameStore.getState().player;
    const bakedAmmoMax = { ...before.growthAmmoMax };

    // ラン中にメーターを全部0へ(storeの正本・localStorageの保存の両方)。
    for (const id of PLAYER_UPGRADE_IDS) useGameStore.getState().setPlayerUpgradeActive(id, 0);
    savePlayerUpgrades(emptyPlayerUpgrades());
    expect(mem.get(PLAYER_UPGRADES_KEY)).toContain('"active":0');

    const after = useGameStore.getState().player;
    expect(after.maxHealth).toBe(before.maxHealth);
    expect(after.ddaBaseHp).toBe(before.ddaBaseHp);
    expect(after.growthAtkMult).toBe(before.growthAtkMult);
    expect(after.growthGoldMult).toBe(before.growthGoldMult);
    expect(after.growthAmmoMax).toEqual(bakedAmmoMax);
    expect(skillOutgoingDamageMult(after)).toBeCloseTo(1.2, 10);
    useGameStore.getState().addAmmo('handgun', 9999);
    expect(useGameStore.getState().player.ammoHandgun).toBe(bakedAmmoMax.handgun);

    // 次の出撃で初めて反映される。
    useGameStore.getState().resetGame('warrior');
    const next = useGameStore.getState().player;
    expect(next.growthAtkMult).toBe(1);
    expect(next.growthAmmoMax).toEqual(AMMO_MAX);
    expect(next.maxHealth).toBe(PLAYER_PROFILES.warrior.maxHp);
  });
});

describe('処刑の前掛け(致命の一撃は baseDamage 側にだけ育成が乗る)', () => {
  // 中央経路(damageEnemy の viaMeleeFinish + postureImpact='heavy')で測る。
  // ★規約(検収監査の指摘1): この経路の実在の呼び出し元はワイヤー大技の1箇所だけで、
  //   amount は呼び出し側で skillOutgoingDamageMult(=育成込み)を通ってから来る。
  //   よって**ゲート側では再度掛けない**(掛けると二重適用=5段MAXで×1.44になる実バグ)。
  // 報酬予算の残量を0にしてあるので、与ダメ = 渡した amount × 5 になる。
  const fatalDamageOnBrokenBoss = (amount: number): number => {
    const gameTime = useGameStore.getState().gameTime;
    const e = spawnEnemyAt('giantbat', 400, 400, gameTime);
    e.health = e.maxHealth = 100000;
    e.bossFullStunUntil = gameTime + 5000;
    e.bossBreakRewardRemaining = 0;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, amount, false, false, true, null, 'player', 'heavy');
    return 100000 - (useGameStore.getState().enemies.find(x => x.id === e.id)?.health ?? 0);
  };

  it('育成0では従来どおり(素ダメージ×5)', () => {
    expect(fatalDamageOnBrokenBoss(10)).toBe(50);
  });

  it('育成MAXでも中央ゲートは再乗算しない(呼び出し側の育成込みamountがそのまま×5=二重適用なし)', () => {
    sortieWithMaxGrowth();
    const mult = useGameStore.getState().player.growthAtkMult ?? 1;
    expect(mult).toBeCloseTo(1.2, 10);
    // 呼び出し側(ワイヤー)の契約どおり、育成込みの amount を渡す → ちょうど×5(×1.44にならない)。
    expect(fatalDamageOnBrokenBoss(10 * mult)).toBeCloseTo(60, 10);
  });
});

describe('写し先(幻影・守護霊)', () => {
  it('幻影HP: 育成0なら初期プレイヤーHP(130化後)と一致し、育成ぶんだけ増える', () => {
    expect(guardianPhantomHealth(useGameStore.getState().player.ddaBaseHp)).toBe(PLAYER_PROFILES.warrior.maxHp);
    sortieWithMaxGrowth();
    expect(guardianPhantomHealth(useGameStore.getState().player.ddaBaseHp))
      .toBe(PLAYER_PROFILES.warrior.maxHp + growthMaxHpBonus(PLAYER_UPGRADE_MAX_LEVEL));
  });

  it('守護霊スナップショット: 記録側と読み出し側が同じ値を運ぶ(欠損=旧データは1.0)', () => {
    sortieWithMaxGrowth();
    const live = useGameStore.getState().player;
    const snap = snapshotPlayerBuild(live);
    expect(snap.growthAtkMult).toBeCloseTo(1.2, 10);
    expect(buildPseudoPlayer(snap, live).growthAtkMult).toBeCloseTo(1.2, 10);
    // 旧プロファイル(フィールドが無い)は0段扱い=本人の育成が漏れて乗らない。
    const legacy = { ...snap };
    delete legacy.growthAtkMult;
    expect(buildPseudoPlayer(legacy, live).growthAtkMult).toBe(1);
  });
});

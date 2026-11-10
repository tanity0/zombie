// 幻影の装備・スキルの総点検(社長「なぜ装備のステータス上乗せされてないの?ちゃんとして」2026-11-10・社長承認で幻影全体へ)。
// どの幻影でも、記録(ビルド)の装備とスキルがプレイヤーと同じ式で効くこと(playerBuild「装備の効果は100%持ち物から引ける」)。
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useGameStore, combatActorPlayer, playerMoveStatMult, skillLevel } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { FIXED_GUARDIANS } from '../data/fixedGuardians';
import { setPhantomIdentity } from './phantomIdentity';
import { guardianPhantomHealth } from '../config/bossHealth';
import {
  phantomMeleeDamage, phantomMoveSpeed, phantomAtkMults, actorGunFor, actorMeleeFor, runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX,
} from './phantomTick';
import { phantomBrawlerStrikerMult } from './phantomBrawlerTick';
import { brawlerSpeedDamageMult, brawlerTimeKeeperDiscount } from './brawlerSkills';
import { brawlerTechCost, brawlerPointCap, brawlerStageSpec } from './brawler';
import { effectiveReloadMs, effectiveMagSize } from './weaponUtils';
import { snapshotPlayerBuild } from './playerBuild';
import { aggregateEquipBonus } from '../data/equipment';
import { PVP_DAMAGE_SCALE } from './phantomScript';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';
import type { PlayerProfile } from './playerTraits';

const GT = 10_000_000;
const ORIGIN = 50_000;
const BASE_SPEED = 130 * (2 / 3); // ENEMY_STATS['guardian-phantom'].speed に敵の係数(2/3)が掛かった値=プレイヤー並み

const place = (profile: PlayerProfile, unique?: 'brawler', playerOffsetX = 3000): Enemy => {
  setPhantomIdentity({ name: profile.srcName ?? 'x', profile, source: unique ? 'unique' : 'fixed' });
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, GT);
  Object.assign(e, { phantomBuild: profile.snapshot, dormant: false, bossState: 'chase', ...(unique ? { phantomUnique: unique } : {}) });
  const pl = useGameStore.getState().player;
  e.health = e.maxHealth = guardianPhantomHealth(pl.ddaBaseHp, e.phantomBuild?.maxHealth); // スポーンと同じ式
  useGameStore.setState(s => ({
    enemies: [e], projectiles: [], gameTime: GT,
    player: { ...s.player, x: e.x + e.width / 2 + playerOffsetX, y: e.y + e.height / 2 - s.player.height / 2, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
  }));
  return e;
};
const onlineProfile = (): PlayerProfile => {
  // 実データの人格(オンラインの記録と同じ作り=snapshotPlayerBuild)。足・リロード・クリの装備+ランナー・クイックリロード。
  const eq = { body: 'body-mobility-2', arms: 'arms-handling-3', accessory: 'accessory-crit-2' } as const;
  const p0 = useGameStore.getState().player;
  const live = { ...p0, equipment: { ...eq }, equipBonus: aggregateEquipBonus(eq),
    skills: ['runner', 'quick-reload'] as never, skillLevels: { runner: 2, 'quick-reload': 2 } as never, magBonus: 2, reloadMult: 0.8, critChance: 0.03 };
  const hay = FIXED_GUARDIANS.find(g => g.id === 'hayase')!.profile;
  return { ...hay, srcName: 'online', srcClass: 'warrior', snapshot: snapshotPlayerBuild(live) };
};

describe('幻影の装備・スキルが効く(実行時の値)', () => {
  beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); useGameStore.getState().resetGame('warrior'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('体力: 記録の体力(クラス+装備)を使う=プレイヤーの体力に引きずられない', () => {
    useGameStore.setState(s => ({ player: { ...s.player, ddaBaseHp: 999 } }));
    expect(place(uniquePhantomSpec('brawler').profile, 'brawler').maxHealth).toBe(130); // ストライカー130+装備の上乗せ0
    const hay = FIXED_GUARDIANS.find(g => g.id === 'hayase')!.profile;
    expect(place(hay).maxHealth).toBe(hay.snapshot!.maxHealth);
  });

  it('移動速度: 素の足 × 記録の装備・スキルの足の速さ(拳鬼=ジェットブーツ×1.3)・記録の無い幻影は素の足のまま', () => {
    const k = place(uniquePhantomSpec('brawler').profile, 'brawler');
    expect(phantomMoveSpeed(k, GT)).toBeCloseTo(BASE_SPEED * 1.3, 3);
    const hay = place(FIXED_GUARDIANS.find(g => g.id === 'hayase')!.profile);
    const a = combatActorPlayer(hay.id)!;
    expect(phantomMoveSpeed(hay, GT)).toBeCloseTo(BASE_SPEED * playerMoveStatMult(a, GT), 3);
    expect(playerMoveStatMult(a, GT)).toBeGreaterThan(1.2);
    // 実際に動く速さ(遠いプレイヤーへ1.4秒歩かせた最大の速さ)
    const kk = place(uniquePhantomSpec('brawler').profile, 'brawler');
    const st = createPhantomTickState();
    let gt = GT; let maxV = 0;
    for (let i = 0; i < 90; i++) {
      gt += 16; useGameStore.setState({ gameTime: gt });
      runPhantomTick(useGameStore.getState().enemies[0], st, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
      const c = useGameStore.getState().enemies[0]; maxV = Math.max(maxV, Math.hypot(c.vx ?? 0, c.vy ?? 0));
    }
    expect(kk.id).toBe(useGameStore.getState().enemies[0].id);
    expect(maxV).toBeGreaterThan(BASE_SPEED * 1.3 * 0.97);
    // 記録の無い(旧来の)幻影は素の足のまま
    const bare = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, GT);
    useGameStore.setState({ enemies: [bare] });
    expect(phantomMoveSpeed(bare, GT)).toBeCloseTo(BASE_SPEED, 5);
  });

  it('拳鬼の与ダメージ: ナイフ22×アサルトバレル1.6 × ストライカーの素手1.5 × 足の速さ1.3 × 段の倍率 × 対人0.2(1回だけ)', () => {
    const e = place(uniquePhantomSpec('brawler').profile, 'brawler', 40);
    const a = combatActorPlayer(e.id)!;
    expect(phantomMeleeDamage(1, e.id)).toBeCloseTo(22 * 1.6, 5);
    expect(phantomBrawlerStrikerMult(a.characterClass)).toBe(1.5);
    expect(brawlerSpeedDamageMult(playerMoveStatMult(a, GT))).toBeCloseTo(1.3, 5);
    // 実際に当たった1発目(会心なし)の削り=1段目の式どおり
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const st = createPhantomTickState();
    let gt = GT; const drops: number[] = [];
    let hp = useGameStore.getState().player.health;
    for (let i = 0; i < 120 && drops.length < 1; i++) {
      gt += 16; useGameStore.setState({ gameTime: gt });
      runPhantomTick(useGameStore.getState().enemies[0], st, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
      const now = useGameStore.getState().player.health;
      if (now < hp) drops.push(hp - now);
      hp = now;
    }
    const stage1 = 22 * 1.6 * 1.5 * 1.3 * brawlerStageSpec(1).mult * PVP_DAMAGE_SCALE;
    expect(drops[0]).toBeCloseTo(stage1, 1);
  });

  it('会心: 近接=武器+本体(プレイヤーの近接と同じ式・装備のクリは銃だけ)/銃=武器+本体+装備のクリ', () => {
    const e = place(uniquePhantomSpec('brawler').profile, 'brawler');
    const a = combatActorPlayer(e.id)!;
    expect((actorMeleeFor(e.id)?.critChance ?? 0) + a.critChance).toBeCloseTo(0.12, 5); // ファイティングナイフ
    const gun = actorGunFor(e.id)!;
    expect(phantomAtkMults(e.id, gun, GT).critChance).toBeCloseTo((gun.critChance ?? 0) + 0.09, 5); // ミリタリースコープ
  });

  it('拳鬼のスキル: タイムキーパーLv3(技の値段)・オーバークロックLv3・格闘Lv3(技ポイントの上限)', () => {
    const e = place(uniquePhantomSpec('brawler').profile, 'brawler');
    const a = combatActorPlayer(e.id)!;
    expect(skillLevel(a, 'time-keeper')).toBe(3);
    expect(skillLevel(a, 'overclock')).toBe(3);
    expect(brawlerTechCost('kiko', false, brawlerTimeKeeperDiscount('kiko', skillLevel(a, 'time-keeper')))).toBeLessThan(brawlerTechCost('kiko', false, 0));
    expect(e.phantomBuild?.subWeaponLevels?.brawler).toBe(3);
    expect(brawlerPointCap(3)).toBeGreaterThan(brawlerPointCap(1));
  });

  it('銃: 記録の装備・スキルのリロードと弾倉が実際に効く(旧=中立の主語で素の値だった)', () => {
    const e = place(onlineProfile());
    const a = combatActorPlayer(e.id)!;
    const gun = actorGunFor(e.id)!;
    const wantReload = effectiveReloadMs(gun, a);
    const wantMag = effectiveMagSize(gun, a);
    expect(wantReload).toBeLessThan(effectiveReloadMs(gun, { ...a, skills: [], skillLevels: {}, reloadMult: 1, equipBonus: undefined } as never));
    // 弾倉を空にして1tick=リロード開始。終わりの時刻=記録のリロード。
    const st = createPhantomTickState();
    st.activeId = e.id; // 出現の時の初期化(銃の持ち替え)を済ませた扱い
    st.gun = { ...gun, magazine: 0 };
    const now = 5_000_000;
    const t1 = GT + 5000; // 出現の立ち上がりの後
    useGameStore.setState({ gameTime: t1 });
    runPhantomTick(useGameStore.getState().enemies[0], st, t1, 0.016, 1, now, NOOP_PHANTOM_SFX, () => 0.999);
    expect(st.reloadEndsAt - now).toBeCloseTo(wantReload, 0);
    useGameStore.setState({ gameTime: t1 + 16 });
    runPhantomTick(useGameStore.getState().enemies[0], st, t1 + 16, 0.016, 1, st.reloadEndsAt + 1, NOOP_PHANTOM_SFX, () => 0.999);
    expect(st.gun?.magazine).toBe(wantMag);
    expect(wantMag).toBeGreaterThan(gun.magSize ?? 0); // 記録の magBonus が乗る
  });
});

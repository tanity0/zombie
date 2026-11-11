// GHOST-BUILD-1(BOT_AND_GHOST.md §2.11 裁定1「攻撃力の基準=計測時のステータス・ビルドをそのまま再現」)。
// 記録側(snapshotPlayerBuild)と消費側(resolveGhostBuild/ghostActorPlayer)の純関数を固定する。
// 掟の機械化: **ゴーストの倍率はプレイヤーと同じ純関数を通る**(式の複製禁止)ことを、同じビルドを着せた
// プレイヤーとゴーストで結果が一致することで確認する。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, BOSS_CRIT_DAMAGE_MULT, counterReplyDamage, counterAcceptMsOf, COUNTER_ACCEPT_MS,
  isKatanaMode, hasMurasame, katanaLevel, katanaRange, KATANA_RANGE_BY_LEVEL, subWeaponBlockedByKatana,
} from '../store/gameStore';
import { snapshotPlayerBuild, buildPseudoPlayer, buildHasLoadout } from './playerBuild';
import { resolveGhostBuild, ghostActorPlayer, clearGhostBuildCache, ghostBuildFor, actorBuildFor } from './ghostBuild';
import { sanitizeSharedProfile, GHOST_PROFILE_DEFAULTS } from '../../shared/ghostSanitize.mjs';
import { effectiveGhostProfile, type PlayerProfile } from './playerTraits';
import type { PlayerBuildSnapshot } from '../types/game';
import { createWeapon, gunShotBaseDamage, gunShotCritChance } from './weaponUtils';
import { ghostCounterDamage } from './ghostCounter';
import type { Player, Summon, SubWeaponKey, EquipLoadout } from '../types/game';
import { aggregateEquipBonus } from '../data/equipment';

const freshPlayer = (): Player => {
  useGameStore.getState().resetGame('warrior');
  return useGameStore.getState().player;
};

/** 「計測時はこういうビルドだった」を作る(装備銃=スナイパー・近接=対変異体ナイフ・スキル2種・装備火力+20%)。 */
// パリティ検証用の実在する装備一式(数値は表から引く=写経しない)。
const PARITY_GEAR: EquipLoadout = { body: 'special-body', arms: 'arms-firepower-5', accessory: 'accessory-crit-5' };
const PARITY_BONUS = aggregateEquipBonus(PARITY_GEAR);

const buildRun = (): Player => {
  const base = freshPlayer();
  const sniper = createWeapon('rifle-t2');
  const knife = createWeapon('anti-mutant-knife-t5');
  return {
    ...base,
    weapons: [sniper, knife],
    activeWeaponId: sniper.id,
    skills: ['crit-up', 'berserker'],
    skillLevels: { 'crit-up': 3, berserker: 2 },
    critChance: 0.2,
    magBonus: 4,
    reloadMult: 0.7,
    // ★v0.25.3855(SAME_ARENA §4-c「持つべき情報はビルド」): 装備効果は**持ち物から引き直される**ので、
    // 「装備は空なのに equipBonus だけ盛る」という**実在しない状態**はもう作れない。実際の装備を着せる。
    equipment: PARITY_GEAR,
    equipBonus: aggregateEquipBonus(PARITY_GEAR),
    health: 50, maxHealth: 100,
  };
};

beforeEach(() => clearGhostBuildCache());

describe('snapshotPlayerBuild: 計測時ビルドの写し(純粋コピー)', () => {
  it('武器ロードアウト・スキル+Lv・装備+集計効果・クリ率・サブを丸ごと控える', () => {
    const p = buildRun();
    const snap = snapshotPlayerBuild(p);
    expect(snap.maxHealth).toBe(100);
    expect(snap.gunKeys).toEqual(['rifle-t2']);
    expect(snap.activeGunKey).toBe('rifle-t2');
    expect(snap.meleeKey).toBe('anti-mutant-knife-t5');
    expect(snap.skills).toEqual(['crit-up', 'berserker']);
    expect(snap.skillLevels).toEqual({ 'crit-up': 3, berserker: 2 });
    expect(snap.critChance).toBe(0.2);
    expect(snap.magBonus).toBe(4);
    expect(snap.reloadMult).toBe(0.7);
    expect(snap.equipBonus?.damageMult).toBeCloseTo(PARITY_BONUS.damageMult, 6); // 数値は装備表から引く(§4-c)
    expect(snap.characterClass).toBe('warrior');
    expect(buildHasLoadout(snap)).toBe(true);
  });

  it('配列/オブジェクトはコピー(後からプレイヤーが変わっても写しは動かない=規律3)', () => {
    const p = buildRun();
    const snap = snapshotPlayerBuild(p);
    p.skills.push('knight');
    expect(snap.skills).toEqual(['crit-up', 'berserker']);
  });

  it('PHILL計測(裁定4): 母数>0なら率を焼く / 0なら載せない(未記録)', () => {
    const p = buildRun();
    expect(snapshotPlayerBuild(p, { shots: 10, headshots: 4 }).phillHeadshotRate).toBeCloseTo(0.4, 6);
    expect(snapshotPlayerBuild(p, { shots: 0, headshots: 0 }).phillHeadshotRate).toBeUndefined();
    expect(snapshotPlayerBuild(p).phillHeadshotRate).toBeUndefined();
  });

  it('旧snapshot(3項目のみ)はロードアウト無し扱い=「今の装備借用」へフォールバックする合図', () => {
    expect(buildHasLoadout({ maxHealth: 100, speed: 200, level: 3 })).toBe(false);
    expect(buildHasLoadout(undefined)).toBe(false);
  });
});

describe('buildPseudoPlayer: 既存の倍率関数へ渡す疑似Player', () => {
  it('ビルド項目はスナップショットで上書き・一時バフ窓は中立化', () => {
    const live = { ...freshPlayer(), critChance: 0.99, quickMagCritUntil: 1e12, benkeiBuffUntil: 1e12, scavengerBuffUntil: 1e12 };
    const snap = snapshotPlayerBuild(buildRun());
    const pseudo = buildPseudoPlayer(snap, live);
    expect(pseudo.critChance).toBe(0.2);            // 計測時ビルドの値(本人の0.99ではない)
    expect(pseudo.magBonus).toBe(4);
    expect(pseudo.reloadMult).toBe(0.7);
    expect(pseudo.skills).toEqual(['crit-up', 'berserker']);
    expect(pseudo.quickMagCritUntil).toBe(0);       // 本人の瞬間バフは持ち込まない
    expect(pseudo.benkeiBuffUntil).toBe(0);
    expect(pseudo.scavengerBuffUntil).toBe(0);
  });

  it('スナップショットが欠損している項目は本人の値へフォールバック(後方互換)', () => {
    const live = { ...freshPlayer(), critChance: 0.33 };
    const pseudo = buildPseudoPlayer({ maxHealth: 77, speed: 123, level: 4 }, live);
    expect(pseudo.maxHealth).toBe(77);
    expect(pseudo.critChance).toBe(0.33); // 旧snapshotにはcritChanceが無い=本人の値
  });
});

describe('resolveGhostBuild: 召喚時は「計測時ビルドの武器」で戦う(今の装備借用の廃止)', () => {
  it('スナップショットのアクティブ銃/近接武器を復元する(本人の現在装備は使わない)', () => {
    const snap = snapshotPlayerBuild(buildRun());
    const nowPlayer = freshPlayer(); // 本人は初期装備(ハンドガン+ナイフ)に戻っている状況
    const build = resolveGhostBuild(snap, nowPlayer);
    expect(build.fromSnapshot).toBe(true);
    expect(build.gun?.key).toBe('rifle-t2');
    expect(build.melee?.key).toBe('anti-mutant-knife-t5');
    expect(nowPlayer.weapons.find(w => !w.isMelee)?.key).not.toBe('rifle-t2'); // 本人とは別物
  });

  it('旧プロファイル(ロードアウト欠損)は召喚時の本人装備を借用する(従来挙動)', () => {
    const nowPlayer = freshPlayer();
    const build = resolveGhostBuild({ maxHealth: 50, speed: 100, level: 1 }, nowPlayer);
    expect(build.fromSnapshot).toBe(false);
    expect(build.gun?.id).toBe(nowPlayer.activeWeaponId);
  });

  it('PHILL率はビルドへ載る(0..1へクランプ)', () => {
    const snap = snapshotPlayerBuild(buildRun(), { shots: 4, headshots: 3 });
    expect(resolveGhostBuild(snap, freshPlayer()).phillHeadshotRate).toBeCloseTo(0.75, 6);
  });

  it('ghostBuildForは召喚1体につき1回だけ組み立て、ゴースト不在でも直近ビルドを返す(在弾の着弾用)', () => {
    const snap = snapshotPlayerBuild(buildRun());
    const live = freshPlayer();
    const ghost = { id: 'ghost-1', kind: 'ghost-ally', ghostBuild: snap } as unknown as Summon;
    const first = ghostBuildFor(ghost, live);
    expect(ghostBuildFor(ghost, live)).toBe(first);   // 同一参照=メモ化
    expect(ghostBuildFor(undefined, live)).toBe(first); // 解散後も同じビルドで解決
    clearGhostBuildCache();
    expect(ghostBuildFor(undefined, live)).toBeNull();
  });
});

describe('ghostActorPlayer: 位置/HPは実体(ゴースト)基準', () => {
  it('距離依存(スナイパー)・失HP依存(バーサーカー)がゴーストの値で評価される', () => {
    const build = resolveGhostBuild(snapshotPlayerBuild(buildRun()), freshPlayer());
    const actor = ghostActorPlayer(build, { x: 900, y: 900, width: 32, height: 32, health: 10, maxHealth: 100 });
    expect(actor.x).toBe(900);
    expect(actor.health).toBe(10);
    expect(actor.maxHealth).toBe(100);
    expect(actor.skills).toEqual(['crit-up', 'berserker']); // ビルドは維持
  });
});

describe('パリティ(式の複製禁止の機械化): 同じビルドならプレイヤーとゴーストの倍率が一致する', () => {
  it('銃の素ダメージ/クリ率が「そのビルドを着たプレイヤー」と完全一致する', () => {
    const runPlayer = buildRun();
    const snap = snapshotPlayerBuild(runPlayer);
    const build = resolveGhostBuild(snap, freshPlayer());
    const gun = build.gun!;
    const asPlayer = { ...runPlayer, weapons: [gun], activeWeaponId: gun.id };
    expect(gunShotBaseDamage(gun, build.player, 0)).toBeCloseTo(gunShotBaseDamage(gun, asPlayer, 0), 9);
    expect(gunShotCritChance(gun, build.player, 0)).toBeCloseTo(gunShotCritChance(gun, asPlayer, 0), 9);
    // 装備の火力倍率が実際に乗っている(素の武器性能ではない=§2.11訂正の眼目)。
    // ★数値は装備表から引く(写経しない)=表を変えてもこのテストは勝手に揃う(§4-c)。
    expect(PARITY_BONUS.damageMult).toBeGreaterThan(1); // 前提: この一式は火力を持つ
    expect(gunShotBaseDamage(gun, build.player, 0)).toBeCloseTo(gun.damage * PARITY_BONUS.damageMult, 6);
    // クリ率=武器基礎+本体0.2+装備のcritBonus
    expect(gunShotCritChance(gun, build.player, 0))
      .toBeCloseTo((gun.critChance ?? 0) + 0.2 + PARITY_BONUS.critBonus, 6);
  });

  it('カウンター反撃ダメージがプレイヤーの式(counterReplyDamage)と一致する', () => {
    const runPlayer = buildRun();
    const build = resolveGhostBuild(snapshotPlayerBuild(runPlayer), freshPlayer());
    const owner = ghostActorPlayer(build, { x: 0, y: 0, width: 32, height: 32, health: 50, maxHealth: 100 });
    const gunDamage = build.gun?.damage;
    expect(ghostCounterDamage(gunDamage, owner)).toBe(counterReplyDamage(gunDamage, owner, BOSS_CRIT_DAMAGE_MULT));
    // ビルド未指定(旧プロファイル/テスト)は倍率なしの旧式=後方互換
    expect(ghostCounterDamage(40)).toBe(Math.round(40 * BOSS_CRIT_DAMAGE_MULT));
    // クリティカルD上昇Lv3(+1.0)とバーサーカー(失HP50%×1.25=+62.5%)が乗る=素の×5より大きい
    expect(ghostCounterDamage(gunDamage, owner)).toBeGreaterThan(Math.round((gunDamage ?? 12) * BOSS_CRIT_DAMAGE_MULT));
  });
});

// GHOST-KATANA-WIRE(v0.25.2518・裁定2「共有方式」): 刀/ワイヤーの**発動条件は計測時ビルドのサブ**で、
// 主語を差し替えたプレイヤー用純関数(isKatanaMode/katanaLevel/katanaRange)がそのまま通ることを固定する。
describe('刀/ワイヤー(裁定2): ビルドのサブウェポンが守護霊の主語判定へ通る', () => {
  const withSubs = (subs: SubWeaponKey[], levels: Partial<Record<SubWeaponKey, number>> = {}): Player => ({
    ...buildRun(), subWeapons: subs, subWeaponLevels: levels,
  });

  it('katana/murasame を持つビルドだけ刀モードになる(無いビルドは従来のナイフ役)', () => {
    const noKatana = resolveGhostBuild(snapshotPlayerBuild(withSubs([])), freshPlayer());
    expect(isKatanaMode(noKatana.player)).toBe(false);
    const katana = resolveGhostBuild(snapshotPlayerBuild(withSubs(['katana'], { katana: 2 })), freshPlayer());
    expect(isKatanaMode(katana.player)).toBe(true);
    const mura = resolveGhostBuild(snapshotPlayerBuild(withSubs(['murasame'])), freshPlayer());
    expect(isKatanaMode(mura.player)).toBe(true);
    expect(hasMurasame(mura.player)).toBe(true); // 村雨=CD無し連発の分岐がそのまま効く
  });

  it('刀レベル別リーチが「そのビルドを着たプレイヤー」と一致する(値の複製をしていない)', () => {
    for (const lvl of [1, 2, 3]) {
      const runPlayer = withSubs(['katana'], { katana: lvl });
      const ghost = resolveGhostBuild(snapshotPlayerBuild(runPlayer), freshPlayer());
      expect(katanaLevel(ghost.player)).toBe(lvl);
      expect(katanaRange(ghost.player)).toBe(katanaRange(runPlayer));
      expect(katanaRange(ghost.player)).toBe(KATANA_RANGE_BY_LEVEL[lvl]);
    }
  });

  it('ワイヤーは wire-anchor を持つビルドだけ・刀装備中は刀の排他がゴーストにも効く', () => {
    const wire = resolveGhostBuild(snapshotPlayerBuild(withSubs(['wire-anchor'], { 'wire-anchor': 3 })), freshPlayer());
    expect(wire.player.subWeapons).toContain('wire-anchor');
    expect(subWeaponBlockedByKatana(wire.player, 'wire-anchor')).toBe(false);
    const both = resolveGhostBuild(snapshotPlayerBuild(withSubs(['katana', 'wire-anchor'])), freshPlayer());
    expect(subWeaponBlockedByKatana(both.player, 'wire-anchor')).toBe(true); // プレイヤーと同じ排他
  });

  it('ゴースト実体を着せても(位置/HP差し替え)刀モードの判定は保たれる', () => {
    const build = resolveGhostBuild(snapshotPlayerBuild(withSubs(['katana'], { katana: 3 })), freshPlayer());
    const actor = ghostActorPlayer(build, { x: 500, y: 500, width: 32, height: 32, health: 30, maxHealth: 100 });
    expect(isKatanaMode(actor)).toBe(true);
    expect(katanaRange(actor)).toBe(KATANA_RANGE_BY_LEVEL[3]);
  });
});

// 社長裁定: オンラインで来る他人の守護霊にも記録主の熟練度・育成の攻撃力を乗せる。受け取りの道
// (sanitizeSharedProfile → effectiveGhostProfile → snapshot → resolveGhostBuild(guardian) / actorBuildFor)を1本通す。
describe('他人の守護霊(オンラインの記録)に熟練度と育成の攻撃力が届く', () => {
  const remoteSnapshot = (): PlayerBuildSnapshot => ({
    ...snapshotPlayerBuild(buildRun()),
    growthAtkMult: 1.16,
    masteryMult: { melee: 1.7, rifle: 1.4 },
    masteryLoadoutMult: 1.3,
  });
  const received = (snap: PlayerBuildSnapshot): PlayerBuildSnapshot | undefined => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1, snapshot: JSON.parse(JSON.stringify(snap)) } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as PlayerProfile | null;
    expect(safe).not.toBeNull();
    return effectiveGhostProfile(safe!, 'thor').snapshot;
  };

  it('守護霊の疑似プレイヤーに、記録主の熟練度と育成の攻撃力がそのまま乗る', () => {
    const snap = received(remoteSnapshot());
    const b = resolveGhostBuild(snap, freshPlayer(), { guardian: true });
    expect(b.fromSnapshot).toBe(true);
    expect(b.player.growthAtkMult).toBe(1.16);
    expect(b.player.masteryMult).toEqual({ melee: 1.7, rifle: 1.4 });
    expect(b.player.masteryLoadoutMult).toBe(1.3);
  });

  it('古い記録(欄なし)は熟練度なし・育成1.0の強さ', () => {
    const { growthAtkMult: _g, masteryMult: _m, masteryLoadoutMult: _l, ...old } = remoteSnapshot();
    const b = resolveGhostBuild(received(old as PlayerBuildSnapshot), freshPlayer(), { guardian: true });
    expect(b.player.growthAtkMult).toBe(1);
    expect(b.player.masteryMult).toEqual({});
    expect(b.player.masteryLoadoutMult).toBe(1);
  });

  it('幻影(敵)は今までどおり: 熟練度 {}/1・記録主の育成は持たない(1)', () => {
    const snap = received(remoteSnapshot());
    const b = actorBuildFor('phantom-remote', snap, freshPlayer())!;
    expect(b.player.masteryMult).toEqual({});
    expect(b.player.masteryLoadoutMult).toBe(1);
    expect(b.player.growthAtkMult).toBe(1);
  });
});

// 社長裁定「通す必要ありそうなものは通して」: 育成「カウンター受付」も他人の守護霊へ届く。受け取りの道
// (sanitizeSharedProfile → effectiveGhostProfile → snapshot → ghostBuildFor(守護霊) / actorBuildFor(幻影))を1本通す。
describe('他人の守護霊(オンラインの記録)に育成「カウンター受付」が届く', () => {
  beforeEach(() => clearGhostBuildCache());
  const received = (snap: PlayerBuildSnapshot): PlayerBuildSnapshot | undefined => {
    const raw = {
      v: 1, runs: 1, moveReactions: {}, subStyles: {},
      bossStyles: { thor: { ...GHOST_PROFILE_DEFAULTS, subStyles: {}, at: 1, snapshot: JSON.parse(JSON.stringify(snap)) } },
    };
    const safe = sanitizeSharedProfile(raw, 'thor') as PlayerProfile | null;
    expect(safe).not.toBeNull();
    return effectiveGhostProfile(safe!, 'thor').snapshot;
  };
  const remote = (): PlayerBuildSnapshot => ({ ...snapshotPlayerBuild(buildRun()), growthCounterAcceptMs: 60 });

  it('守護霊の疑似プレイヤーに記録主の段が乗り、受付の窓がその分延びる', () => {
    const snap = received(remote());
    expect(snap?.growthCounterAcceptMs).toBe(60);
    const ghost = { id: 'ghost-remote-counter', kind: 'ghost-ally', ghostBuild: snap } as unknown as Summon;
    const b = ghostBuildFor(ghost, freshPlayer())!;
    expect(b.player.growthCounterAcceptMs).toBe(60);
    expect(counterAcceptMsOf(b.player)).toBe(COUNTER_ACCEPT_MS + 60);
  });

  it('古い記録(欄なし)は0段=今までどおり', () => {
    const { growthCounterAcceptMs: _c, ...old } = remote();
    const snap = received(old as PlayerBuildSnapshot);
    expect(snap).not.toHaveProperty('growthCounterAcceptMs');
    const ghost = { id: 'ghost-remote-old', kind: 'ghost-ally', ghostBuild: snap } as unknown as Summon;
    const b = ghostBuildFor(ghost, freshPlayer())!;
    expect(b.player.growthCounterAcceptMs).toBe(0);
    expect(counterAcceptMsOf(b.player)).toBe(COUNTER_ACCEPT_MS);
  });

  it('幻影(敵)は今までどおり0段: 記録主の段を持たない', () => {
    const b = actorBuildFor('phantom-remote-counter', received(remote()), freshPlayer())!;
    expect(b.player.growthCounterAcceptMs).toBe(0);
    expect(counterAcceptMsOf(b.player)).toBe(COUNTER_ACCEPT_MS);
    // 育成の攻撃力の手当て(前回)も同時に効いたまま。
    const both = actorBuildFor('phantom-remote-both', received({ ...remote(), growthAtkMult: 1.2 }), freshPlayer())!;
    expect(both.player.growthAtkMult).toBe(1);
    expect(both.player.growthCounterAcceptMs).toBe(0);
  });
});

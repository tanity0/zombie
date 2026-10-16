// B12 スーパーアーマー(research/THEONE_ROUND2.md §4)の**配線**テスト。純関数は utils/superArmor.test.ts。
// 「吹き飛びを書く場所は2つ(damagePlayer の kbApply / combatTick の爆風)」の両方で、アーマー時は
// knockbackUntil と lastHurtAt が変わらず、無敵・ヒットストップ・被弾反撃の窓・シェイクは従来どおりであることを固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, PLAYER_MELEE_SWING_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { isHurtMoveLocked, isHurtGunLocked } from '../utils/playerHurt';
import { SKILLS, SKILL_KEYS, skillDescForLevel, NEW_SLEEPING_SKILLS, GACHA_EXCLUDED_SKILLS, DEFAULT_OWNED_SKILLS, skillsByRarity } from '../data/campaign';
import { BLOOD_AWAKEN_MS } from '../utils/bloodAwaken';
import type { SkillKey } from '../types/game';

let now = 5_000_000;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };

const zombieAt = (dx: number, dy: number, id: string) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, st().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.id = id;
  return e;
};
const withArmor = (lv: number) => useGameStore.setState(s => ({
  player: { ...s.player, skills: [...s.player.skills.filter(k => k !== 'super-armor'), 'super-armor'], skillLevels: { ...s.player.skillLevels, 'super-armor': lv } },
}));
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    gameTime: 100_000,
    enemies: [zombieAt(100, 0, 'z')],
    player: { ...s.player, health: 500, maxHealth: 500, invulnerable: false, counterWindowEnd: 0, counterCooldownEnd: 0 },
  }));
};
/** 右の敵 z から実被弾(被弾源=敵の位置→左へ吹き飛ぶ向き)。 */
const hit = (amount: number) => {
  useGameStore.setState(s => ({ player: { ...s.player, invulnerable: false } }));
  const e = st().enemies.find(x => x.id === 'z')!;
  return st().damagePlayer(amount, 'test', e.x + e.width / 2, e.y + e.height / 2, undefined, undefined, undefined, 'z', 'z');
};

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('damagePlayer の経路: Lv1 は 8 まで(境界)', () => {
  it('8 ダメージ: 吹き飛ばず・しゃがまず・動けて撃てる。ダメージは受ける', () => {
    setup(); withArmor(1);
    const hp0 = st().player.health;
    const kbUntil0 = st().player.knockbackUntil;
    hit(8);
    const p = st().player;
    expect(p.health).toBe(hp0 - 8);
    expect(p.knockbackUntil).toBe(kbUntil0);          // 押し出さない
    expect(p.lastHurtAt).toBeUndefined();             // しゃがみ/ロックの時計を書かない
    expect(p.hurtArmoredAt).toBe(now);                 // 代わりに旗
    expect(isHurtMoveLocked(p, now)).toBe(false);      // 移動ロックの読み手が素通り
    expect(isHurtGunLocked(p, now)).toBe(false);       // 銃ロックの読み手が素通り
  });
  it('9 ダメージ: 従来どおり吹き飛び・しゃがむ(アーマーは働かない)', () => {
    setup(); withArmor(1);
    hit(9);
    const p = st().player;
    expect(p.knockbackUntil).toBeGreaterThan(now);
    expect(p.lastHurtAt).toBe(now);
    expect(p.hurtArmoredAt).toBeUndefined();
    expect(isHurtMoveLocked(p, now)).toBe(true);
  });
  it('Lv2 は 16 まで・Lv3 は 24 まで', () => {
    setup(); withArmor(2); hit(16);
    expect(st().player.lastHurtAt).toBeUndefined();
    setup(); withArmor(2); hit(17);
    expect(st().player.lastHurtAt).toBe(now);
    setup(); withArmor(3); hit(24);
    expect(st().player.lastHurtAt).toBeUndefined();
    setup(); withArmor(3); hit(25);
    expect(st().player.lastHurtAt).toBe(now);
  });
  it('実ダメージ(skilled)で見る: 覚醒でなくてもナイト等の補正後の値が基準', () => {
    setup(); withArmor(1);
    useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills, 'berserker'], skillLevels: { ...s.player.skillLevels, berserker: 1 } } }));
    // バーサーカーは被ダメ+20%: 素の 7 → 8.4 > 8 なのでアーマーは働かない
    hit(7);
    expect(st().player.lastHurtAt).toBe(now);
  });
});

describe('アーマー時も従来どおりの物(無敵・ヒットストップ・被弾反撃の窓・シェイク・被弾演出)', () => {
  it('同じ 8 ダメージを「アーマーあり」と「なし」で受けて、吹き飛びと硬直の時計以外が同値', () => {
    setup(); // アーマーなし
    hit(8);
    const a = st();
    setup(); withArmor(1);
    hit(8);
    const b = st();
    expect(b.player.health).toBe(a.player.health);
    expect(b.player.invulnerable).toBe(a.player.invulnerable);
    expect(b.player.invulnerableTime).toBe(a.player.invulnerableTime);
    expect(b.player.iframeBySource).toEqual(a.player.iframeBySource);
    expect(b.hitstopUntil).toBe(a.hitstopUntil);
    expect(b.hitstopUntil).toBeGreaterThan(now);
    expect(b.shakeUntil).toBe(a.shakeUntil);
    expect(b.shakeMag).toBe(a.shakeMag);
    expect(b.shakeDirX).toBe(a.shakeDirX);
    expect(b.shakeDirY).toBe(a.shakeDirY);
    expect(b.hitRetaliation).toEqual(a.hitRetaliation);
    expect(b.hitRetaliation).not.toBeNull();
    expect(b.player.lastDamagedAtGame).toBe(a.player.lastDamagedAtGame);
    // 違うのは吹き飛びと硬直の時計だけ
    expect(a.player.knockbackUntil).toBeGreaterThan(now);
    expect(b.player.knockbackUntil).not.toBe(a.player.knockbackUntil);
    expect(a.player.lastHurtAt).toBe(now);
    expect(b.player.lastHurtAt).toBeUndefined();
  });
});

describe('血の覚醒中はスキルが無くても吹き飛ばない(被ダメは×2のまま)', () => {
  it('覚醒中: 74 ダメージ級でも吹き飛ばない。ダメージは2倍で受ける', () => {
    setup();
    useGameStore.setState(s => ({ player: { ...s.player, bloodMeter: 1, bloodAwakenUntil: s.gameTime + BLOOD_AWAKEN_MS, bloodAwakenStartedAt: s.gameTime } }));
    const hp0 = st().player.health;
    hit(37);
    const p = st().player;
    expect(hp0 - p.health).toBe(74);
    expect(p.lastHurtAt).toBeUndefined();
    expect(p.hurtArmoredAt).toBe(now);
    expect(p.knockbackUntil ?? 0).toBeLessThanOrEqual(now);
  });
  it('覚醒が終われば従来どおり吹き飛ぶ', () => {
    setup();
    useGameStore.setState(s => ({ player: { ...s.player, bloodMeter: 0, bloodAwakenUntil: 0 } }));
    hit(30);
    expect(st().player.lastHurtAt).toBe(now);
  });
});

describe('爆風の経路(combatTick): 吹き飛びを書くもう1つの場所', () => {
  const blastAtPlayer = (damage: number) => {
    const c = center();
    return { x: c.x - 10, y: c.y, radius: 80, damage, enemyId: 'z', moveKey: 'driller-thrust', retaliate: true };
  };
  const resolveBlast = () => applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });

  it('アーマーなし: 爆風で吹き飛ぶ(押し出しが書かれる)', () => {
    setup();
    useGameStore.setState({ pumpkinBlasts: [blastAtPlayer(74)] as never });
    resolveBlast();
    const p = st().player;
    expect(p.knockbackUntil).toBeGreaterThan(now);
    expect(Math.hypot(p.knockbackVx ?? 0, p.knockbackVy ?? 0)).toBeGreaterThan(0);
    expect(p.lastHurtAt).toBe(now);
  });
  it('★Lv3 で近接を振っている最中は 74 ダメージ(S6の赤ゾンビ級)の爆風でも吹き飛ばない。ダメージは受ける', () => {
    setup(); withArmor(3);
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now - 100, pendingSwingAt: 0 } }));
    const hp0 = st().player.health;
    const kbUntil0 = st().player.knockbackUntil;
    useGameStore.setState({ pumpkinBlasts: [blastAtPlayer(74)] as never });
    resolveBlast();
    const p = st().player;
    expect(p.health).toBe(hp0 - 74);                   // ダメージは受ける
    expect(p.knockbackUntil).toBe(kbUntil0);           // 押し出しを書かない
    expect(p.knockbackVx ?? 0).toBe(0);
    expect(p.lastHurtAt).toBeUndefined();
    expect(p.hurtArmoredAt).toBe(now);
    expect(st().hitstopUntil).toBeGreaterThan(now);    // ヒットストップは従来どおり
    expect(st().hitRetaliation).not.toBeNull();        // 被弾反撃の窓も従来どおり
  });
  it('Lv3 でも振っていなければ 74 の爆風は吹き飛ばす(24 を超える)', () => {
    setup(); withArmor(3);
    useGameStore.setState({ pumpkinBlasts: [blastAtPlayer(74)] as never });
    resolveBlast();
    expect(st().player.knockbackUntil).toBeGreaterThan(now);
  });
  it('Lv1 で 8 の爆風は吹き飛ばない / 9 は吹き飛ぶ(爆風の経路でも同じ境界)', () => {
    setup(); withArmor(1);
    useGameStore.setState({ pumpkinBlasts: [blastAtPlayer(8)] as never });
    resolveBlast();
    expect(st().player.knockbackUntil ?? 0).toBeLessThanOrEqual(now);
    setup(); withArmor(1);
    useGameStore.setState({ pumpkinBlasts: [blastAtPlayer(9)] as never });
    resolveBlast();
    expect(st().player.knockbackUntil).toBeGreaterThan(now);
  });
  it('近接を振っている定義の長さは store の PLAYER_MELEE_SWING_MS(振りが終われば効かない)', () => {
    setup(); withArmor(3);
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now - PLAYER_MELEE_SWING_MS - 1, pendingSwingAt: 0 } }));
    hit(74);
    expect(st().player.lastHurtAt).toBe(now);
  });
});

describe('スキル台帳', () => {
  it('台帳に在る: 見せる名「スーパーアーマー」・通常枠・Lv別の記述', () => {
    expect(SKILL_KEYS).toContain('super-armor');
    expect(SKILLS['super-armor'].name).toBe('スーパーアーマー');
    expect(SKILLS['super-armor'].rarity).toBe('normal');
    const base = '小さなダメージでは吹き飛ばず、動きが止まらない';
    expect(skillDescForLevel('super-armor', 1)).toBe(`${base}（Lv1：8以下）`);
    expect(skillDescForLevel('super-armor', 2)).toBe(`${base}（Lv2：16以下）`);
    expect(skillDescForLevel('super-armor', 3)).toBe(`${base}（Lv3：24以下。近接を振っている間は吹き飛ばない）`);
  });
  it('ガチャの通常枠に自動で入る(眠らせない・初期所持にしない)', () => {
    expect(NEW_SLEEPING_SKILLS as SkillKey[]).not.toContain('super-armor');
    expect(GACHA_EXCLUDED_SKILLS).not.toContain('super-armor');
    expect(DEFAULT_OWNED_SKILLS).not.toContain('super-armor');
    // rollGachaSkill の通常枠の母集団=skillsByRarity('normal') から除外を引いたもの
    expect(skillsByRarity('normal').filter(k => !GACHA_EXCLUDED_SKILLS.includes(k))).toContain('super-armor');
  });
});

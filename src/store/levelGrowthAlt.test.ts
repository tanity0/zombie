import { describe, it, expect } from 'vitest';
import { useGameStore, xpGainMultFor, XP_GAIN_MULT, XP_GAIN_MULT_TUTORIAL, skillOutgoingDamageMult, LEVELUP_EMPHASIS_MS } from './gameStore';
import { statOption, STAT_CARD_HP, STAT_CARD_ATK } from '../utils/upgradeUtils';

// research/LEVEL_GROWTH.md §11(社長裁定2026-09-13「はい / a と、少しだけレベル上げを渋く / b も」)の配線テスト。
describe('代替a: ステータスカードの取得(selectUpgrade type=stat)', () => {
  it('体力カード: 最大HP +10 と同量の回復。攻撃カード: levelAtkMult +0.06 が合流点に乗る', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({ player: { ...s.player, health: s.player.maxHealth - 30 }, showUpgradeMenu: true, isPaused: true }));
    const p0 = useGameStore.getState().player;
    useGameStore.getState().selectUpgrade(statOption('hp'));
    const p1 = useGameStore.getState().player;
    expect(p1.maxHealth).toBe(p0.maxHealth + STAT_CARD_HP);
    expect(p1.health).toBe(p0.health + STAT_CARD_HP);
    expect(useGameStore.getState().showUpgradeMenu).toBe(false);
    const d0 = skillOutgoingDamageMult(p1);
    useGameStore.getState().selectUpgrade(statOption('atk'));
    const p2 = useGameStore.getState().player;
    expect(p2.levelAtkMult).toBeCloseTo(1 + STAT_CARD_ATK, 9);
    expect(skillOutgoingDamageMult(p2)).toBeCloseTo(d0 * (1 + STAT_CARD_ATK), 9);
    // 出撃し直すと 1 へ戻る(ラン限り)
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().player.levelAtkMult).toBe(1);
  });
});

describe('少しだけ渋く: 経験値の実効倍率(本編 1/3.5・M0 は 1/3)', () => {
  it('xpGainMultFor: 本編 < M0、本編は 1/3.5', () => {
    expect(xpGainMultFor(false)).toBe(XP_GAIN_MULT);
    expect(xpGainMultFor(true)).toBe(XP_GAIN_MULT_TUTORIAL);
    expect(XP_GAIN_MULT).toBeCloseTo(1 / 3.5, 9);
    expect(XP_GAIN_MULT).toBeLessThan(XP_GAIN_MULT_TUTORIAL);
  });
  it('gainExperience は本編で 1/3.5 を掛ける', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({ player: { ...s.player, experience: 0, experienceToNextLevel: 1000 } }));
    useGameStore.getState().gainExperience(35);
    expect(useGameStore.getState().player.experience).toBeCloseTo(10, 6);
  });
});

describe('代替b: 取った瞬間の可視化', () => {
  it('攻撃が変わるカードを取ると「最初の1発」の窓が開き、最初の非クリ数字だけ白→金フラッシュ(2発目は従来色)。名札は帯つき明朝', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ showUpgradeMenu: true, isPaused: true, levelUpEmphasisUntil: 0, levelUpFlashArmed: false });
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.getState().selectUpgrade(statOption('atk'));
    const s = useGameStore.getState();
    expect(s.levelUpEmphasisUntil).toBe(gt0 + LEVELUP_EMPHASIS_MS);
    expect(s.levelUpFlashArmed).toBe(true);
    // 頭上の名札(callout)が帯つき・明朝で出ている
    const label = s.effects.find(e => e.kind === 'damageNumber' && e.text === '攻撃力');
    expect(label).toBeDefined();
    if (label && label.kind === 'damageNumber') { expect(label.bg).toBeDefined(); expect(label.serif).toBe(true); expect(label.holdMs ?? 0).toBeGreaterThan(0); }
    useGameStore.getState().spawnDamageNumber(0, 0, 12, false);
    const fx = useGameStore.getState().effects;
    const n = fx[fx.length - 1];
    expect(n.kind).toBe('damageNumber');
    if (n.kind === 'damageNumber') { expect(n.flash).toBe(true); expect(n.color).toBe('#fde68a'); expect(n.scale).toBe(1.4); }
    expect(useGameStore.getState().levelUpFlashArmed).toBe(false); // 1発で消費
    // 2発目は従来色
    useGameStore.getState().spawnDamageNumber(0, 0, 12, false);
    const fx2 = useGameStore.getState().effects;
    const n2 = fx2[fx2.length - 1];
    if (n2.kind === 'damageNumber') { expect(n2.flash).toBeUndefined(); expect(n2.color).toBe('#fef9c3'); expect(n2.scale).toBeUndefined(); }
  });
  it('攻撃が変わらないカード(体力)では数字を光らせない(名札だけ)', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ showUpgradeMenu: true, isPaused: true, levelUpEmphasisUntil: 0 });
    useGameStore.getState().selectUpgrade(statOption('hp'));
    const s = useGameStore.getState();
    expect(s.levelUpEmphasisUntil).toBe(0);
    expect(s.levelUpFlashArmed).toBe(false);
    expect(s.effects.some(e => e.kind === 'damageNumber' && e.text === '体力')).toBe(true);
  });
});

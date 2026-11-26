import { describe, it, expect } from 'vitest';
import { subWeaponBlurb, SUB_BLURB_BY_DEVICE } from './subWeaponBlurbs';

// research/PC_SUPPORT.md §11-6: 「フリック」等のスマホの言葉を PC・パッドに出さない(チュートリアルの pcLines/padLines と同じ考え方)。
describe('subWeaponBlurb(機器ごとの一言)', () => {
  it('スマホ(既定)の文は変えない', () => {
    expect(subWeaponBlurb('katana')).toBe('刀で自動的に斬りつける。銃と他のサブウェポンは使えない。フリックで無敵の突進斬り。');
    expect(subWeaponBlurb('wire-anchor', 'touch')).toBe('フリックした方向へワイヤーを撃ち、刺さった所へ無敵で飛ぶ。');
  });
  it('PC・パッドの文にはスマホの操作の言葉が無い', () => {
    for (const k of ['katana', 'wire-anchor'] as const) { // 鞭は投げの操作を書かない=どの機器でも同じ文(下の鞭のテスト)
      for (const d of ['mouse', 'pad'] as const) {
        const t = subWeaponBlurb(k, d);
        expect(t).not.toMatch(/フリック|指|タップ/);
      }
      expect(subWeaponBlurb(k, 'mouse')).toMatch(/右クリック/);
      expect(subWeaponBlurb(k, 'pad')).not.toMatch(/クリック|ボタン|\{/); // 「右のボタン」と書かず、刻印を差し込む
    }
  });
  it('パッドの文は系統ごとの刻印(HUD の札と同じ字)', () => {
    expect(subWeaponBlurb('katana', 'pad', 'xbox')).toBe('刀で自動的に斬りつける。銃と他のサブウェポンは使えない。B でスティックを倒した方へ無敵の突進斬り。');
    expect(subWeaponBlurb('katana', 'pad', 'ps')).toContain('○ でスティックを倒した方へ');
    expect(subWeaponBlurb('wire-anchor', 'pad', 'nin')).toBe('A でスティックを倒した方へワイヤーを撃ち、刺さった所へ無敵で飛ぶ。');
  });
  it('刀とワイヤーの PC の文は同じ形(読点を挟まない)', () => {
    expect(subWeaponBlurb('katana', 'mouse')).toContain('右クリックでカーソルの方へ無敵の突進斬り');
    expect(subWeaponBlurb('wire-anchor', 'mouse')).toContain('右クリックでカーソルの方へワイヤーを撃ち');
  });
  it('PC の文を持つ物は、パッドの文も必ず持つ(パッドに「クリック」を出さない)', () => {
    expect(Object.keys(SUB_BLURB_BY_DEVICE.pad).sort()).toEqual(Object.keys(SUB_BLURB_BY_DEVICE.pc).sort());
  });
  it('機器ごとの文が無い物は、どの機器でもスマホの文', () => {
    expect(subWeaponBlurb('dog', 'mouse')).toBe(subWeaponBlurb('dog'));
    expect(subWeaponBlurb('dog', 'pad')).toBe(subWeaponBlurb('dog'));
  });
  it('鞭(research/WHIP_FOLLOWUP.md §8): 気絶・絡め取る・振り回す・投げつける・ぶつかった所で爆発する・竜巻を言う。投げは自動だけ=投げの操作を書かない・どの機器でも同じ文。数値を書かない・句点で終える', () => {
    const touch = subWeaponBlurb('whip');
    for (const w of ['気絶', '絡め取', '振り回', '投げつけ', 'ぶつかった所で爆発する', '竜巻']) expect(touch).toContain(w);
    // 社長指示2026-11-26「掴んだ時、任意に投げれるのはやめて」: 任意の投げの操作(指を離す・はじく・もう一度振る・右クリック・ボタン)を書かない。
    expect(touch).not.toMatch(/投げれば|指を離|はじ|もう一度振|クリック|\{/);
    expect(subWeaponBlurb('whip', 'mouse')).toBe(touch);
    expect(subWeaponBlurb('whip', 'pad', 'xbox')).toBe(touch);
    for (const d of ['touch', 'mouse', 'pad'] as const) {
      const t = subWeaponBlurb('whip', d);
      expect(t).not.toMatch(/[0-9０-９]/);
      expect(t.endsWith('。')).toBe(true);
    }
  });
  it('格闘中に止まるのは銃だけ(v0.25.5428)=格闘の一言は「銃は使えない」', () => {
    expect(subWeaponBlurb('brawler')).toContain('銃は使えない');
    expect(subWeaponBlurb('brawler')).not.toContain('サブウェポンは使えない');
  });
});

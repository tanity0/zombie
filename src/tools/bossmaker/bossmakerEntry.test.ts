// ボスメーカーのページ(`bossmaker.html`)の入口テスト。BOSS_MAKER.md §19 / §19-12。
//
// ★v0.25.2862: 起動クエリを注入していたインライン classic script は**廃止した**。
// このページが**開発用の出撃メニューを持つ**ようになり(社長指示「ボスメーカー側にメニューは
// 移植してください」)、出撃はメニューが `window.location.search` を差し替えて再読込する形になった。
// = 読み込まれた時点で必ずURLにフラグが載っているので、注入する必要が無い。
// (注入方式は「モジュールロード時定数に間に合わない」という地雷を抱えていたので、これで消滅した。)
import { describe, it, expect } from 'vitest';
import html from '../../../bossmaker.html?raw';
import toolMain from './main.tsx?raw';

describe('bossmaker.html', () => {
  it('ツール専用のエントリを読む(本編の main.tsx ではない)', () => {
    expect(html).toContain('/src/tools/bossmaker/main.tsx');
    expect(html).not.toContain('/src/main.tsx');
  });

  it('起動クエリを注入するインライン script を持たない(廃止済み)', () => {
    expect(html).not.toContain('var need = {');
    expect(html).not.toContain('replaceState');
  });

  it('入口側でも replaceState でクエリを作らない(ESMの評価順に間に合わないため)', () => {
    expect(toolMain).not.toContain('replaceState');
  });

  it('出撃フラグが無ければ出撃メニューを出す', () => {
    expect(toolMain).toContain('BossTestMenu');
    expect(toolMain).toContain('FORCE_PARAMS');
  });

  it('調整部屋のときだけ調整UIを重ねる', () => {
    expect(toolMain).toContain("params.get('bossmaker') === '1'");
    expect(toolMain).toContain('BossMakerPanel');
  });
});

// research/THOR_ISSEN_REWORK.md §1-3 の**規則**を機械化する:
// 「プレイヤーの近接スイングが確定する箇所**すべて**に専用の打刻(`commitMeleeSwing()`)を打つ」。
//
// なぜ件数を固定するのか(発注仕様の言葉のまま):
//   「行番号で列挙した4件は現時点の実例であって仕様ではない——将来ナイフ系の武器や新しい振り方が
//    増えたら、**そこにも打つのが規則**(打ち忘れは『新しい武器だけ必中一閃が出ない』という
//    **無音の穴**になる)」。
// 呼び出し口が増減したらこのテストが落ちて、**「新しい近接に打刻を足したか?」を人に問う**
// (ghostTelegraph の完全性検査と同じ型)。
//
// 増減が正しい変更なら、下の EXPECTED を新しい件数へ更新し、コメントに「何の経路を足したか」を書く。
import { describe, it, expect } from 'vitest';

// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// ghostTelegraph.test.ts と同じ作法)。
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** 現時点の打刻経路(4件)。**この一覧は「今こうなっている」であって、上限ではない**。 */
const EXPECTED_CALLSITES = [
  'ナイフ(通常近接スイープ)',
  '刀(katanaMode)',
  '鞭(whipMode)',
  'スラッシャー追撃(applySlasherChainStrike)',
];

describe('近接スイング確定の打刻(commitMeleeSwing)の経路数を固定する', () => {
  const text = Object.values(SOURCES)[0] ?? '';

  it('gameStore.ts を読めている(走査そのものが壊れていない)', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('commitMeleeSwing');
  });

  it(`★呼び出し口はちょうど ${EXPECTED_CALLSITES.length} 箇所(増減したら「新しい近接に打刻を足したか?」を確認する)`, () => {
    const calls = text.match(/get\(\)\.commitMeleeSwing\(\)/g) ?? [];
    expect(
      calls.length,
      `現時点の経路: ${EXPECTED_CALLSITES.join(' / ')}。`
      + '近接武器/振り方を足したなら打刻を足してこの件数を更新し、減らしたなら「なぜ打たなくてよいか」を書くこと。',
    ).toBe(EXPECTED_CALLSITES.length);
  });

  it('打刻を書く実装は1本だけ(store のアクション定義=純関数 stampMeleeSwingCommit へ委譲)', () => {
    const defs = text.match(/commitMeleeSwing:\s*\(\)\s*=>\s*\{/g) ?? [];
    expect(defs.length).toBe(1);
    expect(text).toContain('stampMeleeSwingCommit(state.player, Date.now())');
  });

  it('★カウンター成立の演出(markMeleeSwingFx)と混ざっていない=別の打刻であることの証明', () => {
    // markMeleeSwingFx は meleeSwingAt(描画用)だけを書き、meleeSwingCommitAt は書かない。
    const fxDef = /markMeleeSwingFx:\s*\(\)\s*=>\s*\{\s*\n\s*set\(state => \(\{ player: \{ \.\.\.state\.player, meleeSwingAt: Date\.now\(\) \} \}\)\);/;
    expect(fxDef.test(text)).toBe(true);
  });
});

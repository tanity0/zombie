// ★ボス「はめ」シミュレーション(社長指示v0.25.3496「シールドバッシュ・犬・救急鞄・踏み鳴らし・四神
// これらでボスをはめれちゃうって事はなさそう？シミュレーションしてみて」)。
//
// 測るもの: 20秒の窓を16ms刻みで回し、**ボスが「止まっている」フレームの割合**を出す。
// 「止まっている」の定義は実装と同じ `knockbackUntil > now`——bountyTick.isFrozen(賞金首)と
// useGameLoop の kbStoppedNow(裏ボス)がこの1条件で移動・状態進行を止め、v0.25.3476以降は
// **進行中の技も中断する**ため、この割合がそのまま「技を出せない時間の割合」になる。
//
// 道具ごとのCDは敢えてモデル化しない。代わりに**最悪ケース=毎フレーム発火**で測る:
// これで上界が取れるので、CDのある実際の道具(バッシュ/犬/救急鞄/踏み鳴らし/四神)は必ずこれ以下になる。
// 分岐は「その道具が knockbackEnemy を通るか(=DRが効く)/ enemy へ直接 knockbackUntil を書くか」だけ。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KNOCKBACK_DURATION } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

const FRAME_MS = 16;
const WINDOW_MS = 20_000;
const EPOCH = 1_700_000_000_000;

/** 毎フレーム `fire(id)` を呼びながら、止まっていたフレームの割合を返す。 */
const stoppedFraction = (type: Parameters<typeof spawnEnemyAt>[0], fire: (id: string) => void): number => {
  const e = spawnEnemyAt(type, 0, 0, 0);
  useGameStore.setState({ enemies: [e] });
  let stopped = 0, frames = 0;
  for (let t = 0; t < WINDOW_MS; t += FRAME_MS) {
    vi.setSystemTime(EPOCH + t);
    fire(e.id);
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id)!;
    if (cur.knockbackUntil !== undefined && Date.now() < cur.knockbackUntil) stopped++;
    frames++;
  }
  return stopped / frames;
};

describe('ボスはめシミュレーション(20秒・毎フレーム発火=最悪ケース)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
    vi.setSystemTime(EPOCH);
  });
  afterEach(() => { vi.useRealTimers(); });

  // --- ① knockbackEnemy を通る道具(犬/救急鞄/踏み鳴らし/四神/シールドの押し戻しキュー) ---
  // これらは全て `useGameStore.knockbackEnemy` が入口=汎用DR(bossStopDr)を通る。
  it('★DR経由の道具は、毎フレーム撃ち続けてもボスを止め続けられない(はめ不可)', () => {
    const frac = stoppedFraction('idol', id => useGameStore.getState().knockbackEnemy(id, 1, 0, 3));
    // DRの1周: 満額280ms + 半減140ms + 無効化&完全耐性3000ms ≒ 3420msのうち止まるのは420ms。
    expect(frac).toBeLessThan(0.2);
    expect(frac).toBeGreaterThan(0); // 1発目は必ず効く(手応えは残る)
  });

  it('城ボス・賞金首・裏ボスのいずれでも同じ(DRはisBossType全体に効く)', () => {
    for (const t of ['giantbat', 'bounty-melee', 'thor'] as const) {
      expect(stoppedFraction(t, id => useGameStore.getState().knockbackEnemy(id, 1, 0, 3)), t).toBeLessThan(0.2);
    }
  });

  it('通常敵は従来どおり止まり続ける(雑魚の手応えは意図的に強い仕様=不変)', () => {
    expect(stoppedFraction('zombie', id => useGameStore.getState().knockbackEnemy(id, 1, 0, 3))).toBeGreaterThan(0.99);
  });

  // --- ② enemy へ直接 knockbackUntil を書く経路(DRを通らない) ---
  // 近接の各命中・シールドバッシュ・鞭・吸引系(重力弾/ハリケーン/錬金レア)はこの形。
  // **DRの外側**なので、連続で当て続けられる道具はボスを止め続けられてしまう。
  it('★直接書き込み経路はDRを通らないので、止め続けられてしまう(=構造的な穴・要裁定)', () => {
    const frac = stoppedFraction('idol', id => {
      useGameStore.setState(s => ({
        enemies: s.enemies.map(x => x.id === id
          ? { ...x, knockbackVx: 0, knockbackVy: 0, knockbackUntil: Date.now() + KNOCKBACK_DURATION }
          : x),
      }));
    });
    expect(frac).toBeGreaterThan(0.99); // 20秒間ずっと止まったまま
  });
});

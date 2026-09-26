// 洋館通路(corridorMode)の敵リサイクル(runOffscreenRecycleAndCull)が、移動不可エリアへ
// 再配置しないことの配線テスト。社長指示「ステージ2に限らず、移動不可エリアにアイテムも敵も
// 沸かないで」対応(v0.25.2391)。クランプの計算自体は src/world/playableArea.test.ts が固定
// するので、ここでは directorTick.ts が corridorMode 時にその関数を正しく呼んでいることだけ確認する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runOffscreenRecycleAndCull, type RecycleCullCtx } from './directorTick';
import { spawnEnemyAt } from './enemyUtils';
import { CORRIDOR_LATERAL_CLAMP } from './corridorProjection';
import type { Player } from '../types/game';

const buildCtx = (player: Player, overrides: Partial<RecycleCullCtx> = {}): RecycleCullCtx => ({
  labTheme: false,
  indoor: false,
  gameBounds: { width: 800, height: 600 },
  player,
  playerCenterX: player.x + player.width / 2,
  playerCenterY: player.y + player.height / 2,
  gameTime: 999999, // WAVE_GRACE_MS(10s)より十分先にして isWave 保護の影響を避ける
  spawnBounds: { width: 800, height: 600 },
  spawnViewOffsetY: 0,
  snowTheme: false,
  spawnEsc: 0,
  playerAreaIdx: 0,
  enemyCap: 50, // 上限カリングが今回のテストに介入しないよう十分大きく
  puzzleActiveNow: false,
  labSpawnAggroRange: 200,
  labVisited: null,
  ...overrides,
});

describe('runOffscreenRecycleAndCull(corridorMode)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('画面外まで離れた敵を再配置する時、xを±CORRIDOR_LATERAL_CLAMPの内側へ寄せる', () => {
    const player = useGameStore.getState().player;
    // 画面外送り境界(recycleHalfW)を確実に超える、極端に遠い位置に敵を置く。
    const far = spawnEnemyAt('zombie', player.x + 10_000_000, player.y, 0);
    far.isWave = false; // spawnEnemyAtはisWave=trueタグ付け=WAVE_GRACE_MSの保護対象になるため、
    // 通常湧きのリサイクル対象として扱うためにここだけ外す(生成位置/種類/強さは変更しない)。
    useGameStore.setState({ enemies: [far], corridorMode: true, corridorRunInActive: false });

    runOffscreenRecycleAndCull(buildCtx(player));

    const after = useGameStore.getState().enemies[0];
    expect(after).toBeDefined();
    expect(Math.abs(after.x + after.width / 2)).toBeLessThanOrEqual(CORRIDOR_LATERAL_CLAMP + 0.001);
  });

  it('corridorMode=falseの通常ステージでは従来どおり帯の外にも再配置されうる(回帰確認)', () => {
    const player = useGameStore.getState().player;
    const far = spawnEnemyAt('zombie', player.x + 10_000_000, player.y, 0);
    far.isWave = false;
    useGameStore.setState({ enemies: [far], corridorMode: false });

    runOffscreenRecycleAndCull(buildCtx(player));

    const after = useGameStore.getState().enemies[0];
    expect(after).toBeDefined();
    // 通常ステージはCORRIDOR_LATERAL_CLAMPの制約を受けない=xがその範囲を超えることがある
    // (常に超えるとは限らないので、少なくとも「クランプされていない」ことだけを見る=
    // クランプされていれば必ず±CLAMPぴったりになるが、そうなっていないケースがあることを確認)。
    // 決定的な検証のため、プレイヤーからのオフセットで判定する代わりに、位置が変わったこと
    // (=再配置された)ことだけを確認する。
    expect(after.x).not.toBe(player.x + 10_000_000);
  });
});

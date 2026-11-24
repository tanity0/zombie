// 研究所(ステージ2・stageTheme==='lab')は木を描かない(pixiScene.syncTrees の noTrees)ので、世界の層でも木を返さない
// (社長指示2026-11-24「見えない処理は当然無くして」)。旧: 絵は無いのに幹の当たり判定が残り、手榴弾・地雷・タレット等の
// 爆発の遮り(useGameLoop の aoeWalls=treesInRegion の幹)・味方の移動・押し返し・練習の置き場に効いていた。
import { describe, it, expect, afterEach } from 'vitest';
import { useGameStore } from './gameStore';
import { treesInRegion, trunkRect, resolveTreeCollision, setTreesDisabled } from '../world/trees';

afterEach(() => {
  useGameStore.setState({ pendingStageTheme: 'forest' });
  setTreesDisabled(false); // 他テストへ漏らさない
});

const REGION = [-3000, -3000, 3000, 3000] as const;

describe('研究所テーマでは世界の層の木が無い', () => {
  it('森の出撃では木がある(前提)', () => {
    useGameStore.setState({ pendingStageTheme: 'forest' });
    useGameStore.getState().resetGame('warrior');
    expect(treesInRegion(...REGION).length).toBeGreaterThan(0);
  });

  it('研究所の出撃では木が0本=爆発の遮り(幹)も、幹の押し出しも無い', () => {
    // 森で幹の位置を1本取っておく(この位置は研究所でも同じ座標=もとの木の位置)。
    useGameStore.setState({ pendingStageTheme: 'forest' });
    useGameStore.getState().resetGame('warrior');
    const t = treesInRegion(...REGION)[0];
    const trunk = trunkRect(t);
    const onTrunk = { x: trunk.x + trunk.width / 2 - 5, y: trunk.y + trunk.height / 2 - 5, width: 10, height: 10 };
    const pushedInForest = resolveTreeCollision(onTrunk);
    expect(pushedInForest.x !== onTrunk.x || pushedInForest.y !== onTrunk.y).toBe(true);

    useGameStore.setState({ pendingStageTheme: 'lab' });
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().stageTheme).toBe('lab');
    // aoeWalls(爆発の遮り)は屋外で treesInRegion(爆心±200).map(trunkRect) を返す=研究所では空になる。
    const cx = t.footX, cy = t.footY;
    expect(treesInRegion(cx - 200, cy - 200, cx + 200, cy + 200).map(trunkRect)).toEqual([]);
    expect(treesInRegion(...REGION)).toEqual([]);
    // 幹に重なる矩形も素通り(英雄の犬・錬金の味方・レベルアップの押し返し・練習の置き場が使う)。
    const passthrough = resolveTreeCollision(onTrunk);
    expect(passthrough.x).toBe(onTrunk.x);
    expect(passthrough.y).toBe(onTrunk.y);
  });

  it('研究所の後に森へ出撃すると木が戻る(出撃ごとに設定し直す)', () => {
    useGameStore.setState({ pendingStageTheme: 'lab' });
    useGameStore.getState().resetGame('warrior');
    expect(treesInRegion(...REGION)).toEqual([]);
    useGameStore.setState({ pendingStageTheme: 'forest' });
    useGameStore.getState().resetGame('warrior');
    expect(treesInRegion(...REGION).length).toBeGreaterThan(0);
  });
});

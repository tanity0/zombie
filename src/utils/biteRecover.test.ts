import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { biteSpecFor, BITE_RECOVER_STILL_MS } from './enemyBite';

/**
 * ★噛みつき直後の硬直(社長指摘2026-09-17「噛みつき直後の硬直があるはずだけど？」)。
 * 台帳には「硬直600ms」と書いてあったのに、実装は再発火のゲートだけで**移動が止まっていなかった**。
 * その再発を機械で止める。
 */
const ORIGIN = 1200;

const setup = (biteAt: number, over: Record<string, unknown> = {}) => {
  useGameStore.setState(s => ({
    player: { ...s.player, x: ORIGIN, y: ORIGIN },
    enemies: [{
      id: 'e1', type: 'zombie', x: ORIGIN + 200, y: ORIGIN, width: 36, height: 36,
      health: 200, maxHealth: 200, speed: 42, damage: 10, lastHit: 0,
      biteAt, biteDirX: -1, biteDirY: 0,
      ...over,
    }] as never,
  }));
};

describe('噛みつき直後の硬直', () => {
  beforeEach(() => { useGameStore.getState().resetGame('assault'); });

  it('★硬直の長さは近接1振り(約368ms)が入る最小である', () => {
    // 「硬直がある」と言えるのは、そこで殴り返せる時だけ。それ未満は「ただの間」。
    expect(BITE_RECOVER_STILL_MS).toBeGreaterThanOrEqual(300);
    expect(BITE_RECOVER_STILL_MS).toBeLessThan(biteSpecFor('zombie').recoverMs);
  });

  it('★硬直中は1pxも動かない', () => {
    const gt = 5000;
    setup(0, { biteRecoverUntil: gt + BITE_RECOVER_STILL_MS });
    useGameStore.getState().setGameTime(gt);
    const before = useGameStore.getState().enemies[0].x;
    for (let i = 0; i < 10; i++) {
      useGameStore.getState().setGameTime(gt + i * 16);
      useGameStore.getState().updateEnemies(1 / 60);
    }
    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBe(before);
    expect(after.vx).toBe(0);
    expect(after.vy).toBe(0);
  });

  it('★硬直が明けたら動き出す', () => {
    const gt = 5000;
    setup(0, { biteRecoverUntil: gt + BITE_RECOVER_STILL_MS });
    const before = useGameStore.getState().enemies[0].x;
    for (let i = 0; i < 10; i++) {
      useGameStore.getState().setGameTime(gt + BITE_RECOVER_STILL_MS + 1 + i * 16);
      useGameStore.getState().updateEnemies(1 / 60);
    }
    expect(useGameStore.getState().enemies[0].x).toBeLessThan(before);   // プレイヤー(左)へ詰める
  });

  it('★★§16の技を出している個体には掛けない(二重に止めると技が終わらない)', () => {
    const gt = 5000;
    setup(0, {
      biteRecoverUntil: gt + BITE_RECOVER_STILL_MS,
      chaffMove: 'zombie-double', aiPhase: 'z-lunge-in', chaffMoveAt: gt,
    });
    const before = useGameStore.getState().enemies[0].x;
    for (let i = 0; i < 10; i++) {
      useGameStore.getState().setGameTime(gt + i * 16);
      useGameStore.getState().updateEnemies(1 / 60);
    }
    // 技の踏み込みが進む=止まっていない(止めると終点に着けず技が終わらない)
    expect(useGameStore.getState().enemies[0].x).not.toBe(before);
  });
});

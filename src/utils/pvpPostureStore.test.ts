// ★対人体勢(SAME_ARENA §9)のstore配線: プレイヤーの紫(行動不能)ゲートと紫入りの破棄。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, playerPvpChipPatch } from '../store/gameStore';
import { freshPvpPosture, PVP_POSTURE_MAX } from './pvpPosture';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const breakState = (gameTime: number) => ({
  posture: 0, recoveryCap: 0, lastChipAt: gameTime, breakUntil: gameTime + 3000, lockUntil: gameTime + 9000,
});

describe('対人体勢: プレイヤーの紫(行動不能)ゲート', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('紫中は近接を振れない(窓も開かない)・明ければ振れる', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ player: { ...s.player, pvpPosture: breakState(gt) } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(false);
    expect(useGameStore.getState().player.counterWindowEnd).toBe(0); // 窓は開いていない
    // 明けた状態(breakUntilが過去)なら振れる。
    useGameStore.setState(s => ({ player: { ...s.player, pvpPosture: { ...freshPvpPosture(), breakUntil: gt - 1 } } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
  });

  it('紫中は移動入力を無視する(速度が減衰へ落ちる)', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ player: { ...s.player, pvpPosture: breakState(gt), vx: 100, vy: 0 } }));
    useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true } as never, 0.1);
    const p = useGameStore.getState().player;
    expect(Math.abs(p.vx)).toBeLessThan(100); // 入力(右)で加速せず、残速度が減衰している
  });

  it('紫中は triggerCounter(PC入力の直呼び経路)も不発・リロードも始まらない(検収監査 重大①)', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ player: { ...s.player, pvpPosture: breakState(gt) } }));
    const r = useGameStore.getState().triggerCounter();
    expect(r.swung).toBe(false);
    const gunId = useGameStore.getState().player.weapons.find(w => !w.isMelee)?.id;
    if (gunId) {
      useGameStore.getState().startReload(gunId);
      expect(useGameStore.getState().player.reloadingWeaponId).not.toBe(gunId);
    }
  });

  it('紫入り(playerPvpChipPatch)で窓・前隙・無敵が破棄される', () => {
    const gt = useGameStore.getState().gameTime;
    const p0 = {
      ...useGameStore.getState().player,
      pvpPosture: { ...freshPvpPosture(), posture: 10, lastChipAt: gt }, // counter 0.20(=20)で0へ
      counterWindowEnd: Date.now() + 300, pendingSwingAt: Date.now(), invulnerable: true,
    };
    const patch = playerPvpChipPatch(p0, 'counter', gt);
    expect(patch.pvpPosture?.posture).toBe(0);
    expect(patch.counterWindowEnd).toBe(0);
    expect(patch.pendingSwingAt).toBe(0);
    expect(patch.invulnerable).toBe(false);
    // 紫でない削りは窓を触らない。
    const p1 = { ...p0, pvpPosture: freshPvpPosture() };
    const patch2 = playerPvpChipPatch(p1, 'melee', gt);
    expect(patch2.pvpPosture?.posture).toBe(PVP_POSTURE_MAX - 4);
    expect(patch2.counterWindowEnd).toBeUndefined();
  });
});

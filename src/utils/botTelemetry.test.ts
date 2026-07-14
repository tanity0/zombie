import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSubUse, recordOverclockProc, getBotTelemetry, snapshotBotTelemetry, resetBotTelemetry,
} from './botTelemetry';
import { useGameStore } from '../store/gameStore';

describe('botTelemetry (M35: ボットレポート計測シングルトン)', () => {
  beforeEach(() => resetBotTelemetry());

  it('recordSubUse: 種別ごとに加算される', () => {
    recordSubUse('sensor-mine');
    recordSubUse('sensor-mine');
    recordSubUse('junk-weapon');
    expect(getBotTelemetry().subUses['sensor-mine']).toBe(2);
    expect(getBotTelemetry().subUses['junk-weapon']).toBe(1);
    expect(getBotTelemetry().subUses['molotov']).toBeUndefined(); // 未使用は未記録
  });

  it('recordOverclockProc: 成立回数が加算される', () => {
    expect(getBotTelemetry().overclockProcs).toBe(0);
    recordOverclockProc();
    recordOverclockProc();
    expect(getBotTelemetry().overclockProcs).toBe(2);
  });

  it('resetBotTelemetry: 全カウンタ0に戻る(ラン開始のリセット)', () => {
    recordSubUse('turret');
    recordOverclockProc();
    resetBotTelemetry();
    expect(getBotTelemetry().subUses).toEqual({});
    expect(getBotTelemetry().overclockProcs).toBe(0);
  });

  it('配線: setSubWeaponCooldown(合流点)で発動が記録され、resetGame(ラン開始)で0に戻る', () => {
    // ヘッドレスのボットはサブ自動使用が未接続(M26既知の簡略化)のため、合流点の配線自体をここで機械検証する
    // (=サブが発動する実機?botランでは subUses>0 になることの根拠)。
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().setSubWeaponCooldown('turret', useGameStore.getState().gameTime + 1000);
    expect(getBotTelemetry().subUses['turret']).toBe(1);
    useGameStore.getState().resetGame('warrior'); // 新ラン=リセット
    expect(getBotTelemetry().subUses['turret']).toBeUndefined();
    expect(getBotTelemetry().overclockProcs).toBe(0);
  });

  it('snapshotBotTelemetry: ディープコピー(以後の加算がスナップショットに漏れない=規律3)', () => {
    recordSubUse('turret');
    const snap = snapshotBotTelemetry();
    recordSubUse('turret');
    recordOverclockProc();
    expect(snap.subUses['turret']).toBe(1);       // スナップショットは増えない
    expect(snap.overclockProcs).toBe(0);
    expect(getBotTelemetry().subUses['turret']).toBe(2); // 生きた集計は増える
  });
});

// 隠れ処(research/HIDDEN_POI.md)のボス戦の前後。社長指示2026-11-04「ボス戦中はグレーアウトして当たり判定も無しに」
// 「ボス戦終わった時に重なり判定ある場合はノックバックでふっ飛ばそう」。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { secretPoiRect, SECRET_EJECT_SPEED, type SecretPoi } from '../world/secretPois';

const POI: SecretPoi = { id: 'secret-99', texture: 'x', name: 'テスト', verb: '見つけた', x: 5000, y: 12000 };

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState({ secretPois: [POI], bossFightNow: false, bossFightLastTrueAt: -1e9, gameTime: 100000 });
});

describe('隠れ処とボス戦', () => {
  it('ボス戦が明けた瞬間に土台へ重なっていたプレイヤーは外へノックバックで飛ぶ・その間は土台に当たらない', () => {
    const r = secretPoiRect(POI);
    useGameStore.setState(s => ({ facilityLockedPrev: true, player: { ...s.player, x: r.x + r.width / 2 - s.player.width / 2, y: r.y + r.height - s.player.height + 2 } }));
    useGameStore.getState().updateFacilityEject();
    const s = useGameStore.getState();
    expect(s.facilityLockedPrev).toBe(false);
    expect(Math.hypot(s.player.knockbackVx ?? 0, s.player.knockbackVy ?? 0)).toBeCloseTo(SECRET_EJECT_SPEED, 0);
    expect((s.player.knockbackUntil ?? 0)).toBeGreaterThan(Date.now());
    expect(s.facilityEjectUntil).toBeGreaterThan(s.gameTime);
  });
  it('重なっていなければ何も飛ばない', () => {
    useGameStore.setState(s => ({ facilityLockedPrev: true, player: { ...s.player, x: 0, y: 0, knockbackVx: 0, knockbackVy: 0 } }));
    useGameStore.getState().updateFacilityEject();
    expect(useGameStore.getState().player.knockbackVx ?? 0).toBe(0);
  });
  it('ボス戦中(施設ロック中)は触れても見つからない', () => {
    const r = secretPoiRect(POI);
    useGameStore.setState(s => ({ bossFightNow: true, bossFightLastTrueAt: 100000, player: { ...s.player, x: POI.x - 14, y: r.y + r.height } }));
    const before = useGameStore.getState().secretFoundThisRun;
    useGameStore.getState().updateSecretPois();
    expect(useGameStore.getState().secretFoundThisRun).toBe(before);
    useGameStore.getState().updateFacilityEject();
    expect(useGameStore.getState().facilityLockedPrev).toBe(true);
  });
});

describe('施設全般のボス戦明けの弾き出し', () => {
  it('城・寄り道の建物・祠に重なっていても弾き出す(病院で確認)', () => {
    useGameStore.setState(s => ({ secretPois: [], hospital: { x: 3000, y: 3000 }, hospitalTaken: false, facilityLockedPrev: true,
      player: { ...s.player, x: 3000 - s.player.width / 2, y: 3000 - s.player.height - 4, knockbackVx: 0, knockbackVy: 0 } }));
    useGameStore.getState().updateFacilityEject();
    const s = useGameStore.getState();
    expect(Math.hypot(s.player.knockbackVx ?? 0, s.player.knockbackVy ?? 0)).toBeCloseTo(SECRET_EJECT_SPEED, 0);
  });
});

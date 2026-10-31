// GHOST-BUILD-1(監査項目13/7・BOT_AND_GHOST.md §2.11): 守護霊の**被弾側**のパリティ。
//  - 被ダメ補正(ナイト×0.8/バーサーカー×1.2)を**計測時ビルドのスキル**で評価する(項目13)。
//  - 被弾ノックバック(ダメージ源から離れる向き・PLAYER_KNOCKBACK_SPEED/MS)を付与し、
//    updateSummonsが減衰しながら消化する(項目7)。被弾シェイクは出さない(裁定3)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLAYER_KNOCKBACK_MS, PLAYER_KNOCKBACK_SPEED } from '../store/gameStore';
import type { PlayerBuildSnapshot, Summon } from '../types/game';

const ghostAt = (x: number, y: number, ghostBuild?: PlayerBuildSnapshot): Summon => ({
  id: 'ghost-test', x, y, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild,
});

const snap = (over: Partial<PlayerBuildSnapshot> = {}): PlayerBuildSnapshot =>
  ({ maxHealth: 100, speed: 200, level: 1, gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1', ...over });

const place = (s: Summon) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState({ summons: [s] });
};
const ghost = () => useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');

beforeEach(() => { useGameStore.getState().resetGame('warrior'); });

describe('項目13: 被ダメ補正は計測時ビルドのスキルで評価する', () => {
  it('ナイトLv1(×0.8)を持っていた撃破ランのゴーストは被ダメが減る', () => {
    place(ghostAt(500, 500, snap({ skills: ['knight'], skillLevels: { knight: 1 } })));
    useGameStore.getState().damageSummon('ghost-test', 10);
    expect(ghost()?.health).toBeCloseTo(92, 6);
  });

  it('バーサーカー(×1.2)を持っていた撃破ランのゴーストは被ダメが増える', () => {
    place(ghostAt(500, 500, snap({ skills: ['berserker'], skillLevels: { berserker: 1 } })));
    useGameStore.getState().damageSummon('ghost-test', 10);
    expect(ghost()?.health).toBeCloseTo(88, 6);
  });

  it('スキル無し/旧プロファイル(ビルド欠損)は補正なし=従来どおり', () => {
    place(ghostAt(500, 500, snap({ skills: [], skillLevels: {} })));
    useGameStore.getState().damageSummon('ghost-test', 10);
    expect(ghost()?.health).toBe(90);
    place(ghostAt(500, 500, undefined));
    useGameStore.getState().damageSummon('ghost-test', 10);
    expect(ghost()?.health).toBe(90);
  });
});

describe('項目7: 被弾ノックバック(プレイヤーのdamagePlayerと同式)', () => {
  it('ダメージ源から離れる向きへ弾かれ、updateSummonsが減衰しながら消化する', () => {
    place(ghostAt(500, 500, snap()));
    // 源=ゴーストの左(x=400)→ 右向き(+x)へ弾かれる
    useGameStore.getState().damageSummon('ghost-test', 10, 400, 516);
    const hit = ghost()!;
    expect(hit.knockbackVx).toBeCloseTo(PLAYER_KNOCKBACK_SPEED, 3);
    expect(hit.knockbackVy).toBeCloseTo(0, 3);
    expect((hit.knockbackUntil ?? 0) - Date.now()).toBeGreaterThan(PLAYER_KNOCKBACK_MS - 50);
    useGameStore.getState().updateSummons(0.016);
    expect(ghost()!.x).toBeGreaterThan(500); // 右へ滑った
  });

  it('ダメージ源が渡されない被弾ではノックバックしない(従来挙動)', () => {
    place(ghostAt(500, 500, snap()));
    useGameStore.getState().damageSummon('ghost-test', 10);
    expect(ghost()?.knockbackUntil).toBeUndefined();
    useGameStore.getState().updateSummons(0.016);
    expect(ghost()!.x).toBe(500);
  });

  it('i-frame中(直近被弾から700ms未満)は無傷=ノックバックも付かない', () => {
    place({ ...ghostAt(500, 500, snap()), lastHit: Date.now() });
    useGameStore.getState().damageSummon('ghost-test', 10, 400, 516);
    expect(ghost()?.health).toBe(100);
    expect(ghost()?.knockbackUntil).toBeUndefined();
  });
});

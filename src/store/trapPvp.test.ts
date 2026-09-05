// ★対人トラップの効果(社長裁定2026-08-25・research/SAME_ARENA.md §3-g)の不変条件。
//
// 敵に対するトラップは従来どおり**拘束**。対人だけは拘束をやめ、社長指定の4効果に置き換えた。
// ここで固定するのは「効果が**実際に効いているか**」で、定数の一致は utils/trapDebuff.test.ts が見る。
//  ①移動が等倍のみ(かさまし%・ダッシュが無効) ③リロード1.5倍
//  (②クリ率アップ・④CD短縮無効は純関数側=trapDebuff.test.ts / 呼び出しは実装のwrap1本)
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLAYER_BASE_SPEED, KATANA_DASH_MS } from './gameStore';
import { effectiveReloadMs, createWeapon } from '../utils/weaponUtils';
import { TRAP_PVP_RELOAD_MULT, TRAP_PVP_DEBUFF_MS } from '../utils/trapDebuff';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const ORIGIN = 50_000;
const DT = 1 / 60;

/** 右へ1秒ぶん歩かせて、実際に進んだ距離(px)を返す。 */
const walkRightFor = (frames: number): number => {
  const x0 = useGameStore.getState().player.x;
  for (let i = 0; i < frames; i++) useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true }, DT);
  return useGameStore.getState().player.x - x0;
};

const placePlayer = (patch: Record<string, unknown> = {}) => {
  useGameStore.setState(s => ({
    // 速度ランプ(同方向へ走り続けた時間のボーナス)も毎回ゼロへ戻す。戻さないと2本目の計測が
    // 1本目の助走を引き継いで長く出る=比較そのものが成立しない。
    player: { ...s.player, x: ORIGIN, y: ORIGIN, vx: 0, vy: 0, trapDebuffUntil: 0,
      speedRampSustainMs: 0, speedRampDirX: 0, speedRampDirY: 0, ...patch },
  }));
};

describe('★対人トラップ(SAME_ARENA.md §3-g)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('①効果中は「かさまし%」が乗らない: 装備の移動速度倍率2倍を付けても素の足の距離しか進まない', () => {
    // 素の足で1秒(ランプが満額になるまで走らせる=かさましが乗るなら必ず差が出る条件)。
    placePlayer({ equipBonus: { moveSpeedMult: 2 } });
    const boosted = walkRightFor(120);

    placePlayer({ equipBonus: { moveSpeedMult: 2 }, trapDebuffUntil: Date.now() + TRAP_PVP_DEBUFF_MS });
    const trapped = walkRightFor(120);

    expect(boosted).toBeGreaterThan(trapped);                       // かさましが潰れている
    expect(trapped).toBeLessThanOrEqual(PLAYER_BASE_SPEED * 2 + 1); // 2秒ぶんの上限=等倍を超えない
  });

  it('①効果中は「ダッシュ」も等倍で頭打ち: 一閃ダッシュの移動距離が素の足まで落ちる', () => {
    const frames = Math.ceil((KATANA_DASH_MS / 1000) * 60);
    placePlayer({ katanaDashUntil: Date.now() + KATANA_DASH_MS, katanaDashDirX: 1, katanaDashDirY: 0 });
    const dashed = walkRightFor(frames);

    placePlayer({
      katanaDashUntil: Date.now() + KATANA_DASH_MS, katanaDashDirX: 1, katanaDashDirY: 0,
      trapDebuffUntil: Date.now() + TRAP_PVP_DEBUFF_MS,
    });
    const trapped = walkRightFor(frames);

    expect(dashed).toBeGreaterThan(trapped * 2); // ダッシュは素の足の何倍も速いので明確に差が出る
    expect(trapped).toBeLessThanOrEqual(PLAYER_BASE_SPEED * (KATANA_DASH_MS / 1000) + 1);
  });

  it('①効果が切れれば元どおり(期限を過ぎた trapDebuffUntil は何もしない)', () => {
    placePlayer({ equipBonus: { moveSpeedMult: 2 } });
    const normal = walkRightFor(120);
    placePlayer({ equipBonus: { moveSpeedMult: 2 }, trapDebuffUntil: Date.now() - 1 });
    expect(walkRightFor(120)).toBeCloseTo(normal, 5);
  });

  it('③効果中はリロードが1.5倍(下限250msの床は残る)', () => {
    const w = createWeapon('rifle-t1');
    const p = useGameStore.getState().player;
    const base = effectiveReloadMs(w, { ...p, trapDebuffUntil: 0 });
    const trapped = effectiveReloadMs(w, { ...p, trapDebuffUntil: Date.now() + TRAP_PVP_DEBUFF_MS });
    expect(base).toBeGreaterThan(250);                       // 床に張り付いていない銃で測る
    expect(trapped).toBeCloseTo(base * TRAP_PVP_RELOAD_MULT, 5);
  });

  it('★対人のみ: 幻影/守護霊の主語(trapDebuffUntil を持たない)はリロードが伸びない', () => {
    const w = createWeapon('rifle-t1');
    const p = useGameStore.getState().player;
    const ghostLike = { ...p } as Record<string, unknown>;
    delete ghostLike.trapDebuffUntil;
    expect(effectiveReloadMs(w, ghostLike as unknown as typeof p)).toBeCloseTo(effectiveReloadMs(w, { ...p, trapDebuffUntil: 0 }), 5);
  });
});

// PACING_PUZZLE.md §16-H #H-4 / #H-6 の回帰。
//
// ★なぜ要るか(社長報告2026-09-19「パンプキンは明らかに着地直後から噛みついてくる。おかしい」):
// 硬直(recover)が明けた**同じフレーム**に §12 の噛みつきが立っていた。復帰後の猶予
// (`PUMPKIN_COOLDOWN_MS`)は `aiReadyAt`(=次の技)にしか書かれておらず、噛みつきが見ている
// `biteReadyAt` は**誰も書いていなかった**ため。
// ★§16-H の凍結(残りを預かって戻す)では直らない——硬直明けの時点で `biteReadyAt` は
// 過去/未設定なので**畳む残りが無い**。技の後の間は**書かないと生まれない**。
// ★社長裁定2026-09-19「800ms(パンプキンと同じ)」= 4型で同じ値(`RECOVER_BITE_GAP_MS`)を共有する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, RECOVER_BITE_GAP_MS, PUMPKIN_COOLDOWN_MS, ENEMY_ATTACK_SPEED_MULT } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';

const ORIGIN = 50_000;
const START_GT = 10_000_000;

const place = (type: EnemyType, over: Partial<Enemy>): void => {
  const e = { ...spawnEnemyAt(type, 0, 0, START_GT), ...over } as Enemy;
  e.x = ORIGIN + 200 - e.width / 2; e.y = ORIGIN - e.height / 2;
  e.health = 99999; e.maxHealth = 99999;
  useGameStore.setState(s => ({ enemies: [e], gameTime: START_GT,
    player: { ...s.player, x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 } }));
};
const tick = (gt: number) => { useGameStore.getState().setGameTime(gt); useGameStore.getState().updateEnemies(1 / 60); };
const first = (): Enemy => useGameStore.getState().enemies[0];

beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); useGameStore.getState().resetGame('assault'); });

describe('§16-H #H-6: 硬直が明けたら噛みつきにも間を与える(4型で同じ値)', () => {
  it('値の出どころは1つ(新しい数字を作っていない)', () => {
    expect(RECOVER_BITE_GAP_MS).toBe(PUMPKIN_COOLDOWN_MS);
    expect(RECOVER_BITE_GAP_MS).toBe(800);
  });

  const cases: Array<[string, EnemyType, NonNullable<Enemy['aiPhase']>]> = [
    ['パンプキン(着地)', 'pumpkin', 'recover'],
    ['人狼(突進)', 'werewolf', 'dash-recover'],
    ['削岩型(突き)', 'driller', 'driller-thrust-recover'],
    ['伐採人(薙ぎ)', 'logger', 'logger-sweep-recover'],
  ];
  for (const [label, type, phase] of cases) {
    it(`${label}: 硬直が明けた瞬間に biteReadyAt が未来へ書かれる`, () => {
      // 硬直の期限を過去にして、次の1tickで「明ける」ようにする。
      place(type, { aiPhase: phase, aiPhaseUntil: START_GT - 1, biteReadyAt: 0 });
      tick(START_GT);
      const e = first();
      expect(e.aiPhase).not.toBe(phase);                       // 硬直は明けた
      const gap = (e.biteReadyAt ?? 0) - START_GT;
      // 書き込みは atkUntil/atkCdUntil 経由(=ゲームスピードで割る)。丸めの幅だけ見る。
      expect(gap).toBeGreaterThan(0);                          // ★「明けた同じフレームに噛める」が消えた
      expect(gap).toBeCloseTo(RECOVER_BITE_GAP_MS / ENEMY_ATTACK_SPEED_MULT, -1);
    });
  }
});

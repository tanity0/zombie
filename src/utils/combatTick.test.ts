// 接触ダメージ/ボス接触受け流しの分岐の回帰テスト(research/THOR_ISSEN_REWORK.md §5-2 やること④)。
//
// ★なぜ在るか(v0.25.3793・検収監査 重大1): **2巡連続で「実機から挙動が消える」事故を起こした場所**
// なのに、テストが1本も無かった。
//  - v0.25.3784: `applyContactDamage` の冒頭にあるトール除外から `thor-dash-move` を外した(接触が入る
//    ようになった)。
//  - v0.25.3785: その結果、同じ forEach の下流の**ボス接触受け流し**へも走行中の突進が流れ込み、
//    `rootUntil=900ms` が立って `frozen` が `bossState='chase'` へ落とすため、**突進のカウンター
//    (Counter!/クリ反撃/counter-leap/弾き返し/専用CD)が丸ごと実機に出なくなった**。
//    しかも競合順序が固定で不利(ボスtickは**フレーム頭の座標**で重なりを見る/この関数は**進めた後の
//    座標**で見る ⇒ 到達フレームは必ず受け流しが先に取る)。直しは「走行中は受け流しへ落とさない」除外。
// この除外を消しても**テストが1本も落ちなかった**ので、ここで機械化する。
// 併せて **`'chase'` では従来どおり受け流しが立つ**ことも固定する(=除外がトールの全州へ広がって
// いないことの証明。広がると「トールには体当たりカウンターが一切効かない」に静かに変わる)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from './combatTick';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const START_GT = 10_000_000;
const ORIGIN = 50_000;

/** トール1体と、その体に**重なった**プレイヤーを置く。カウンター窓は開けておく。 */
const setup = (bossState: Enemy['bossState']): Enemy => {
  const e = spawnEnemyAt('thor', ORIGIN, ORIGIN, START_GT);
  e.bossState = bossState;
  e.bossStateUntil = START_GT + 1000;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      // 体の中心を重ねる(受け流し・接触ダメージのどちらも「矩形が重なっているか」で入口が同じ)。
      x: e.x + e.width / 2 - s.player.width / 2,
      y: e.y + e.height / 2 - s.player.height / 2,
      health: 9999, maxHealth: 9999,
      invulnerable: false, invulnerableTime: 0,
      counterWindowEnd: Date.now() + 5000, // カウンター窓=開いている
    },
  }));
  return e;
};

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

describe('ボス接触受け流し: トールの突進の走行中(thor-dash-move)だけは横取りさせない(§5-2 やること④)', () => {
  it('★走行中(thor-dash-move)は受け流しが積まれず、接触ダメージ側へ落ちる', () => {
    setup('thor-dash-move');
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const boss = useGameStore.getState().enemies[0];
    // 受け流しの痕跡(拘束900ms/体幹削りの打刻)が1つも無いこと=カウンターの解決はトール側の1本に残る。
    expect(boss.rootUntil).toBeUndefined();
    expect(boss.bossPostureLastDamageAt).toBeUndefined();
    // 代わりに接触ダメージが通っている(=ミゲルの踏み込み走行と同じ扱い)。
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
  });

  it('★追跡中(chase)では従来どおり受け流しが立つ(除外がトールの全州へ広がっていない)', () => {
    setup('chase');
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const boss = useGameStore.getState().enemies[0];
    expect(boss.rootUntil).toBe(START_GT + 900); // BOSS_CONTACT_PARRY_ROOT_MS
    expect(boss.bossPostureLastDamageAt).toBe(START_GT);
    // 受け流しは**無傷**(プレイヤーは i-frame を得て被弾しない)。
    expect(useGameStore.getState().player.health).toBe(hp0);
    expect(useGameStore.getState().player.invulnerable).toBe(true);
  });
});

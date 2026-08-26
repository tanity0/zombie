// 接触ダメージ/ボス接触受け流しの分岐の回帰テスト(research/THOR_ISSEN_REWORK.md §5-2 やること④)。
//
// ★なぜ在るか(v0.25.3793・検収監査 重大1): **2巡連続で「実機から挙動が消える」事故を起こした場所**
// なのに、テストが1本も無かった。
//  - v0.25.3784: `applyContactDamage` の冒頭にあるトール除外から `thor-dash-move` を外した(接触が入る
//    ようになった)。v0.25.3808(7巡目 中7)で裁定待ちの暫定として除外へ戻し、
//    **★v0.25.3818 の社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」で再び外した**(=確定仕様。条件の
//    ①走行中の赤い帯(`pixiScene.drawThorDashBodyBand`)②`botSkill` の帯脅威登録 を同じ版で入れてある)。
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
  // ★v0.25.3818(社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」)で期待値を確定へ戻した。
  // v0.25.3808 の `toBe(hp0)`(=当たらない)は**裁定待ちの暫定退避**であって結論ではなかった。
  // 受け流しの横取りが起きないこと(下2つのアサート)は、どちらの裁定でも変わらない不変条件。
  it('★走行中(thor-dash-move)は受け流しが積まれない(=カウンターの解決はトール側の1本に残る)', () => {
    setup('thor-dash-move');
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const boss = useGameStore.getState().enemies[0];
    // 受け流しの痕跡(拘束900ms/体幹削りの打刻)が1つも無いこと=カウンターの解決はトール側の1本に残る。
    expect(boss.rootUntil).toBeUndefined();
    expect(boss.bossPostureLastDamageAt).toBeUndefined();
    // ★裁定(B): 接触ダメージは**入る**(トール除外から `thor-dash-move` が外れている)。
    // この行が `toBe(hp0)` に戻ると、走行中が無害=ミゲルと文法が割れた状態に静かに戻る。
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
  });

  // ★カウンター憲法(社長裁定2026-08-26・v0.25.3947): 追跡中(chase)の接触は攻撃判定ゼロ
  // (isBiteSubject=true で「触れても痛くない」)なので、受け流しも**立たない**
  // (v2946「追跡中の体当たりは受け流し」は憲法が上書き)。
  it('★追跡中(chase)は攻撃判定ゼロ=受け流しが立たない(憲法)', () => {
    setup('chase');
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const boss = useGameStore.getState().enemies[0];
    expect(boss.rootUntil).toBeUndefined();
    expect(boss.bossPostureLastDamageAt).toBeUndefined();
    expect(useGameStore.getState().player.health).toBe(hp0);
  });

  it('★体当たり技の最中(dash=貫通表)は接触判定が生きている=受け流しが立つ(憲法どおり残る側)', () => {
    // トールは専用州の早期returnがあるため、汎用 'dash' を持つ裏ボス(mimir)で確認する。
    const e = spawnEnemyAt('mimir', ORIGIN, ORIGIN, START_GT);
    e.bossState = 'dash'; // PASS_THROUGH_BOSS_STATES=体を投げ出している技=接触判定が生きている
    e.bossStateUntil = START_GT + 1000;
    useGameStore.setState(s2 => ({
      enemies: [e], gameTime: START_GT,
      player: {
        ...s2.player,
        x: e.x + e.width / 2 - s2.player.width / 2,
        y: e.y + e.height / 2 - s2.player.height / 2,
        health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
        counterWindowEnd: Date.now() + 5000,
      },
    }));
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const boss = useGameStore.getState().enemies[0];
    expect(boss.rootUntil).toBe(START_GT + 900); // BOSS_CONTACT_PARRY_ROOT_MS
    expect(useGameStore.getState().player.invulnerable).toBe(true);
  });
});

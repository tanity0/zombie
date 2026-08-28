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
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from './combatTick';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';
import { REAPER2_CONFIG } from '../config/reaper';

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

  // ★社長報告2026-08-26「鋏変異のジャンプ攻撃がどうしてもカウンターできない」(v0.25.3949):
  // 賞金首の体当たり技(leap-air)も受け流しの対象。飛んでくる体に窓を合わせれば無傷+体幹削り+拘束。
  it('★鋏の飛び掛かり滞空(leap-air)=賞金首でも受け流しが立つ(v0.25.3949)', () => {
    const e = spawnEnemyAt('bounty-balance', ORIGIN, ORIGIN, START_GT);
    e.bossState = 'leap-air'; // BODY_SLAM_BOSS_STATES=体を投げ出している技
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
    expect(boss.rootUntil).toBe(START_GT + 900);
    expect(useGameStore.getState().player.invulnerable).toBe(true);
  });

  it('★賞金首の突進(bm-charge)は受け流しに先取りさせない=bountyTick側のフル報酬カウンターへ委ねる', () => {
    const e = spawnEnemyAt('bounty-melee', ORIGIN, ORIGIN, START_GT);
    e.bossState = 'bm-charge';
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
    expect(boss.rootUntil).toBeUndefined(); // 受け流しは立たない(横取りしない)
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

// ★確認検収3巡目(A)・v0.25.4013: 使者(hangedman)のKILL!演出は「生存→死亡の遷移」で1回だけ。
// 致死後もhealth=0のまま接触が続くとdamagePlayerが毎回died=trueを返し、i-frame明けごとに
// triggerFinishImpact(CD無視の最大ズーム)が再発火して死亡ズームを潰していた(実測: 2.83秒で3回)。
// ★PACING_PUZZLE.md §14-4-8/8b(神付き)以降: 使者の接触は即時ではなく「①接触→②時間停止→
// ③覆いかぶさり→④ダメージ確定」の2段になった。①の呼び出しでは予約が立つだけでダメージは入らず、
// 覆い時間(既定600ms)が明けた後の次の呼び出しで解決する(setTimeout禁止=呼び出しごとに期限を見る)。
describe('使者のKILL!演出: 死亡遷移で1回だけ(再接触・i-frame明けで再発火しない・神付き経由)', () => {
  it('★①接触ではダメージが入らず(神付きの予約のみ)、②覆いが明けた解決で1回だけKILL!が出る。以降の再接触では増えない', () => {
    const e = spawnEnemyAt('hangedman', ORIGIN, ORIGIN, START_GT);
    useGameStore.setState(s => ({
      enemies: [e], gameTime: START_GT,
      player: {
        ...s.player,
        x: e.x + e.width / 2 - s.player.width / 2,
        y: e.y + e.height / 2 - s.player.height / 2,
        health: 50, maxHealth: 130, invulnerable: false, invulnerableTime: 0,
        counterWindowEnd: 0,
      },
    }));
    let impacts = 0; let callouts = 0;
    const fx = {
      ...NOOP_COMBAT_EFFECTS,
      triggerFinishImpact: () => { impacts += 1; },
      spawnCallout: () => { callouts += 1; },
    };
    // ①接触=神付きの予約(時間停止)のみ。まだダメージは入らない。
    applyContactDamage(START_GT, false, 0, fx);
    expect(useGameStore.getState().player.health).toBe(50);
    expect(useGameStore.getState().kamitsukiFx).not.toBeNull();
    expect(impacts).toBe(0);
    expect(callouts).toBe(0);
    // ②覆い時間(既定600ms)が明けた後の次の呼び出しで解決=999接触=即死+KILL!が1回だけ出る。
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + REAPER2_CONFIG.kamitsukiMs + 50);
    applyContactDamage(START_GT, false, 0, fx);
    spy.mockRestore();
    expect(useGameStore.getState().player.health).toBe(0);
    expect(useGameStore.getState().kamitsukiFx).toBeNull();
    expect(impacts).toBe(1);
    expect(callouts).toBe(1);
    // i-frame明けを再現(useGameLoop.ts:7520と同じ解除)して再接触 → 演出は増えない
    // (health=0のままなのでkamitsukiトリガ自体は成立しても、次の解決でdiedはtrueのままwasAliveBeforeContactがfalse=増えない)。
    useGameStore.setState(s => ({ player: { ...s.player, invulnerable: false, invulnerableTime: 0 } }));
    applyContactDamage(START_GT + 1000, false, 0, fx);
    const spy2 = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + REAPER2_CONFIG.kamitsukiMs + 50);
    applyContactDamage(START_GT + 1000, false, 0, fx);
    spy2.mockRestore();
    expect(impacts).toBe(1);
    expect(callouts).toBe(1);
  });
});

// PACING_PUZZLE.md §14-4-8/8b(神付き)。実装精度の規律4: 発火/解決/多重発火/対象外/ヘッドレスの
// 分岐条件をここで機械化する。
describe('神付き(PACING_PUZZLE.md §14-4-8/8b)', () => {
  /** 死神本体(isTerminalReaper)または使者(hangedman)をプレイヤーへ重ねて置く。 */
  const place = (type: 'reaper' | 'hangedman', opts?: { reaperChaser?: boolean }): Enemy => {
    const e = spawnEnemyAt(type, ORIGIN, ORIGIN, START_GT);
    if (type === 'reaper') e.reaperChaser = opts?.reaperChaser ?? true;
    useGameStore.setState(s => ({
      enemies: [e], gameTime: START_GT,
      player: {
        ...s.player,
        x: e.x + e.width / 2 - s.player.width / 2,
        y: e.y + e.height / 2 - s.player.height / 2,
        health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
        counterWindowEnd: 0,
      },
    }));
    return e;
  };

  it('★本体(isTerminalReaper)の接触は即ダメージにならず、kamitsukiFx予約+hitstopが立つ(A-4)。前かがみ(lastContactAttackAt)も打刻しない(A-1)', () => {
    const e = place('reaper');
    const hp0 = useGameStore.getState().player.health;
    let flashes = 0;
    const fx = { ...NOOP_COMBAT_EFFECTS, spawnFlash: () => { flashes += 1; } };
    const beforeNow = Date.now();
    applyContactDamage(START_GT, false, 0, fx);
    expect(useGameStore.getState().player.health).toBe(hp0); // ダメージはまだ入らない
    expect(flashes).toBe(0); // 被弾FXも解決時まで出ない
    const kfx = useGameStore.getState().kamitsukiFx;
    expect(kfx).not.toBeNull();
    expect(kfx?.enemyId).toBe(e.id);
    expect(kfx?.isHangedman).toBe(false);
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThanOrEqual(beforeNow + REAPER2_CONFIG.kamitsukiMs);
    expect(useGameStore.getState().enemies[0].lastContactAttackAt).toBeUndefined();
  });

  it('★i-frame中(player.invulnerable=true)は発火しない(A-2)', () => {
    place('hangedman');
    useGameStore.setState(s => ({ player: { ...s.player, invulnerable: true, invulnerableTime: Date.now() } }));
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(useGameStore.getState().kamitsukiFx).toBeNull();
  });

  it('★1tickにつき1体(forEach先頭の1体だけ予約が立ち、以降の接触解決は打ち切られる)(A-3)', () => {
    const e1 = spawnEnemyAt('reaper', ORIGIN, ORIGIN, START_GT);
    e1.reaperChaser = true;
    const e2 = spawnEnemyAt('hangedman', ORIGIN, ORIGIN, START_GT);
    useGameStore.setState(s => ({
      enemies: [e1, e2], gameTime: START_GT,
      player: {
        ...s.player,
        x: e1.x + e1.width / 2 - s.player.width / 2,
        y: e1.y + e1.height / 2 - s.player.height / 2,
        health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
        counterWindowEnd: 0,
      },
    }));
    // ★{...NOOP_COMBAT_EFFECTS}(spread)を使う=厳密な参照一致(fx===NOOP_COMBAT_EFFECTS)で
    // ヘッドレスと誤判定されない「実演出あり」経路(この節の他のヘッドレステストとは意図的に別)。
    applyContactDamage(START_GT, false, 0, { ...NOOP_COMBAT_EFFECTS });
    expect(useGameStore.getState().kamitsukiFx?.enemyId).toBe(e1.id);
  });

  it('★横切りゴースト(reaperChaser=false)は対象外=現行の即77のまま', () => {
    place('reaper', { reaperChaser: false });
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(useGameStore.getState().kamitsukiFx).toBeNull();
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
  });

  it('★ヘッドレス(NOOP_COMBAT_EFFECTSを直に渡す=playtestDriver経路)は覆いを挟まず即時適用(現行挙動そのまま)', () => {
    place('hangedman');
    const hp0 = useGameStore.getState().player.health;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    expect(useGameStore.getState().kamitsukiFx).toBeNull();
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
  });

  // 裁定済み#K-1(社長裁定2026-08-28「aで」=案A・PACING_PUZZLE.md §14-4-8b): 神付きの停止ぶん、
  // 主要な実時間窓を後ろへずらす。ここでは「唯一の防御手段」である使者のKBが停止をまたいでも
  // 消えないこと(=シフト後、updateEnemies[KBスライドの唯一の適用点]で実際に滑る)を実測する
  // (reaperDoubleDrive.test.tsと同じ実測手法)。二重シフトが無いことも合わせて確認する。
  it('★#K-1: 停止をまたいだ敵のknockbackUntilが停止ぶん延び、停止明けにKBスライドが実際に適用される(二重シフト無し)', () => {
    const N = 5_000_000;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(N);
    const player = useGameStore.getState().player;
    const grabber = spawnEnemyAt('hangedman', ORIGIN, ORIGIN, START_GT);
    // KB窓が停止(600ms)より短い使者(=シフトが無いと停止明けには既に窓が閉じている数値)。
    const kbTarget = spawnEnemyAt('hangedman', player.x + 300, player.y, START_GT);
    kbTarget.knockbackVx = 200; // +x=プレイヤーから離れる向き
    kbTarget.knockbackVy = 0;
    kbTarget.knockbackUntil = N + 280;
    useGameStore.setState(s => ({
      enemies: [grabber, kbTarget], gameTime: START_GT,
      player: {
        ...s.player,
        x: grabber.x + grabber.width / 2 - s.player.width / 2,
        y: grabber.y + grabber.height / 2 - s.player.height / 2,
        health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
        counterWindowEnd: 0,
      },
    }));
    // ①接触(grabberのみプレイヤーに重なっている)=神付きの予約が立つ。
    // ★{...NOOP_COMBAT_EFFECTS}(spread)=厳密な参照一致のヘッドレス判定を避け、「実演出あり」経路を通す。
    const fx = { ...NOOP_COMBAT_EFFECTS };
    applyContactDamage(START_GT, false, 0, fx);
    expect(useGameStore.getState().kamitsukiFx?.enemyId).toBe(grabber.id);
    // 覆い時間(既定600ms)が明ける実時間まで進める。
    spy.mockReturnValue(N + REAPER2_CONFIG.kamitsukiMs + 50);
    // ②解決=#K-1のシフトが一括で1回だけ入る(全敵のknockbackUntilが対象=kbTargetにも効く)。
    applyContactDamage(START_GT, false, 0, fx);
    const shifted = useGameStore.getState().enemies.find(e => e.id === kbTarget.id);
    expect(shifted?.knockbackUntil).toBe(N + 280 + REAPER2_CONFIG.kamitsukiMs); // 停止ぶん延びている
    expect(shifted!.knockbackUntil!).toBeGreaterThan(Date.now()); // まだ実時間で閉じていない=スライドが続けられる
    // 実測: 唯一の適用点(updateEnemies)で実際にKBスライドすることを確かめる。
    const before = useGameStore.getState().enemies.find(e => e.id === kbTarget.id)!;
    useGameStore.getState().updateEnemies(1 / 60);
    const after = useGameStore.getState().enemies.find(e => e.id === kbTarget.id)!;
    expect(after.x).toBeGreaterThan(before.x);
    // 二重シフトが無いこと: もう一度呼んでも(予約は既にnull)knockbackUntilは動かない。
    const untilBefore = useGameStore.getState().enemies.find(e => e.id === kbTarget.id)!.knockbackUntil;
    applyContactDamage(START_GT, false, 0, fx);
    expect(useGameStore.getState().enemies.find(e => e.id === kbTarget.id)!.knockbackUntil).toBe(untilBefore);
    spy.mockRestore();
  });
});

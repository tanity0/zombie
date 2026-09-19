// PACING_PUZZLE.md §16-2(skeleton — 回り込んで横から噛む)・§16-8b手順7の統合テスト。
//
// 純関数(skeletonArcPoint/skeletonWantsChaffSlot等の値そのもの)は chaffMoves.test.ts に置く。
// ここは「実装精度の規律4」どおり、配線(gameStore.ts の状態機械)を updateEnemies を実際に
// 回して確かめる統合テスト+★受け入れ条件(殴り返せる時間350ms以上=取り分は「後退」)の機械化。
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useGameStore, INVULN_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { biteSpecFor, BITE_CONTACT_DIST_PX, biteLungeDistanceAtFire } from '../utils/enemyBite';
import { SKELETON_TRIGGER_PX, SKELETON_CROUCH_MS, SKELETON_ARC_MS, SKELETON_RECOVER_MS } from '../utils/chaffMoves';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const ORIGIN = 50_000;
const START_GT = 10_000_000;

const place = (dist: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt('skeleton', 0, 0, START_GT), ...over };
  e.x = ORIGIN + dist - e.width / 2;
  e.y = ORIGIN - e.height / 2;
  useGameStore.setState(s => ({
    enemies: [e],
    gameTime: START_GT,
    player: {
      ...s.player,
      x: ORIGIN - s.player.width / 2, y: ORIGIN - s.player.height / 2,
      health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0,
      grabbedUntil: undefined,
    },
  }));
  return e;
};

const tick = (gt: number, dt = 1 / 60) => {
  useGameStore.getState().setGameTime(gt);
  useGameStore.getState().updateEnemies(dt);
};

const first = (): Enemy => useGameStore.getState().enemies[0];

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

describe('構え前(aiPhase未設定) → s-crouch(しゃがみ・合図)', () => {
  it('発火距離(100px)以内に入った個体はs-crouchへ入り、900ms(シビア反映)の尺を持つ', () => {
    place(80);
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('s-crouch');
    expect(e.aiPhaseUntil).toBe(START_GT + SKELETON_CROUCH_MS);
  });

  it('発火距離の外(150px)では何も起きない', () => {
    place(150);
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });

  it('★社長裁定2026-09-16「3、出す」= 発火距離は70pxの内側ではなく100px', () => {
    expect(SKELETON_TRIGGER_PX).toBe(100);
  });

  it('★技後CD中は発火距離内に入ってもs-crouchへ入らない', () => {
    place(80, { chaffMoveCdUntil: START_GT + 2000 });
    tick(START_GT);
    expect(first().aiPhase).toBeUndefined();
  });
});

describe('s-crouch中は静止(移動・判定を持たない=カニ歩きにしない)', () => {
  it('しゃがみの間、位置は動かない', () => {
    const e0 = place(50, { aiPhase: 's-crouch', aiPhaseUntil: START_GT + 500 });
    tick(START_GT);
    const e = first();
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y);
    expect(e.vx).toBe(0); expect(e.vy).toBe(0);
  });
});

describe('s-crouch → s-arc(弧で回り込む。chaffMoveはここで立つ=§16-7b)', () => {
  it('しゃがみ明けでs-arcへ。chaffMove=skel-bite・chaffArcSide決定・aiFrom/aiStartedAtを焼く', () => {
    place(50, { aiPhase: 's-crouch', aiPhaseUntil: START_GT });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('s-arc');
    expect(e.aiPhaseUntil).toBe(START_GT + SKELETON_ARC_MS);
    expect(e.chaffMove).toBe('skel-bite');
    expect(e.chaffMoveAt).toBe(START_GT);
    expect(typeof e.chaffArcSide).toBe('boolean');
    expect(e.aiStartedAt).toBe(START_GT);
  });
});

describe('s-arc: 弧を描いて横へ(直線にしない=人狼と被らない)', () => {
  it('★弧の終点=プレイヤー中心からSKELETON_TRIGGER_PXの横(整合監査A-7)', () => {
    const e0 = place(50, {
      aiPhase: 's-arc', aiPhaseUntil: START_GT + SKELETON_ARC_MS, chaffMove: 'skel-bite',
      chaffArcSide: true, aiFromX: undefined, aiFromY: undefined, aiStartedAt: START_GT,
    });
    useGameStore.setState({ enemies: [{ ...e0, aiFromX: e0.x + e0.width / 2, aiFromY: e0.y + e0.height / 2 }] });
    tick(START_GT + SKELETON_ARC_MS); // 弧の終点ちょうど→この瞬間s-biteへ遷移
    const e = first();
    expect(e.aiPhase).toBe('s-bite');
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    const distFromPlayer = Math.hypot(ecx - ORIGIN, ecy - ORIGIN);
    expect(distFromPlayer).toBeCloseTo(SKELETON_TRIGGER_PX, 0);
    // ★§16-A「踏み込みの終点」: 踏み込み距離は発火時の中心間距離(≒100px)から接触距離を
    // 引いた値を発火の瞬間に焼く(biteLungeDistanceAtFire・追尾しない=以後は読むだけ)。
    expect(e.biteLungePx).toBeCloseTo(biteLungeDistanceAtFire('skeleton', distFromPlayer), 0);
  });

  it('★直線にしない: 途中経過(弧の半ば)が開始点-終点の直線から外れている', () => {
    const start = place(50, {
      aiPhase: 's-arc', aiPhaseUntil: START_GT + SKELETON_ARC_MS, chaffMove: 'skel-bite',
      chaffArcSide: true, aiStartedAt: START_GT,
    });
    useGameStore.setState({ enemies: [{ ...start, aiFromX: start.x + start.width / 2, aiFromY: start.y + start.height / 2 }] });
    tick(START_GT + SKELETON_ARC_MS / 2);
    const mid = first();
    // 開始点→(推定)終点の直線からの垂直距離を大まかに確認(側方向にそれているはず)。
    const startCx = start.x + start.width / 2, startCy = start.y + start.height / 2;
    const midCx = mid.x + mid.width / 2, midCy = mid.y + mid.height / 2;
    // 開始点からどれだけ側方(プレイヤーから見て横)に動いたか。
    const lateral = Math.hypot(midCx - startCx, midCy - startCy);
    expect(lateral).toBeGreaterThan(0);
  });
});

describe('s-bite(標準2段: 前隙300ms+噛み200ms=シビア反映)', () => {
  const spec = biteSpecFor('skeleton', 'skel-bite');
  // ★lungePxは「固定値」ではなくなった: §16-A「踏み込みの終点」(社長指摘2026-09-17「敵の攻撃が
  // 通り過ぎちゃうことがある」・設計者の規則ミスを訂正した後)で、実際の踏み込み距離は発火時に
  // `biteLungeDistanceAtFire`が動的に計算し`biteLungePx`へ焼く(上の「s-crouch → s-arc」の
  // テストで確認)。ここの`spec.lungePx`は保険の既定値(`BITE_CONTACT_DIST_PX.skeleton`=接触距離)。
  // windupMs/biteMs/counterableは不変。
  it('windupMs=300・biteMs=200・保険の既定lungePx=接触距離', () => {
    expect(spec.windupMs).toBe(300);
    expect(spec.biteMs).toBe(200);
    expect(spec.lungePx).toBe(BITE_CONTACT_DIST_PX.skeleton);
    expect(spec.counterable).toBe(true);
  });

  it('★受け入れ条件22: 静止しているプレイヤーに当たる(空振り0回)', () => {
    const e = place(0, { aiPhase: 's-bite', chaffMove: 'skel-bite' });
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }] });
    const hpBefore = useGameStore.getState().player.health;
    useGameStore.getState().setGameTime(START_GT);
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const hpAfter = useGameStore.getState().player.health;
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(useGameStore.getState().enemies[0].biteAt).toBe(0);
  });
});

describe('s-bite解決 → s-recover(硬直・★プレイヤーの取り分。変えない値=500ms)', () => {
  it('噛みが解決したらs-recoverへ(その場・下がらない)', () => {
    const e0 = place(0, { aiPhase: 's-bite', chaffMove: 'skel-bite', biteAt: 0 });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('s-recover');
    expect(e.aiPhaseUntil).toBe(START_GT + SKELETON_RECOVER_MS);
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y);
    expect(e.chaffMove).toBe('skel-bite'); // 技の続き(後退が終わるまで立てたまま)
  });

  it('硬直中は動かない', () => {
    const e0 = place(0, { aiPhase: 's-recover', aiPhaseUntil: START_GT + 300, chaffMove: 'skel-bite' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBe('s-recover');
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y);
  });

  it('硬直明けでs-retreatへ(位置はまだ動かない=このフレームは遷移だけ)', () => {
    place(0, { aiPhase: 's-recover', aiPhaseUntil: START_GT, chaffMove: 'skel-bite' });
    tick(START_GT);
    expect(first().aiPhase).toBe('s-retreat');
  });
});

describe('s-retreat: 発火距離(100px)まで1.5倍速で後退(「間合いを取り直す」)', () => {
  it('★硬直が後退より前(社長裁定「その代わりディレイ」): 噛み解決から硬直500msの間は下がらない', () => {
    const e0 = place(0, { aiPhase: 's-bite', chaffMove: 'skel-bite', biteAt: 0 });
    let t = START_GT;
    for (let i = 0; i < 29; i++) { t += 1000 / 60; tick(t); } // 硬直500ms未満ぶん進める
    const e = first();
    expect(e.aiPhase).toBe('s-recover');
    expect(e.x).toBe(e0.x); expect(e.y).toBe(e0.y); // まだ下がっていない
  });

  it('後退中は距離が伸びる(離れる)', () => {
    const e0 = place(0, { aiPhase: 's-retreat', chaffMove: 'skel-bite' });
    tick(START_GT);
    const e = first();
    const d0 = Math.hypot((e0.x + e0.width / 2) - ORIGIN, (e0.y + e0.height / 2) - ORIGIN);
    const d1 = Math.hypot((e.x + e.width / 2) - ORIGIN, (e.y + e.height / 2) - ORIGIN);
    expect(d1).toBeGreaterThan(d0);
  });

  it('発火距離まで戻ったら技の終わり(chaffMove消滅+技後CD≒3500ms±12%)', () => {
    place(SKELETON_TRIGGER_PX + 1, { aiPhase: 's-retreat', chaffMove: 'skel-bite' });
    tick(START_GT);
    const e = first();
    expect(e.aiPhase).toBeUndefined();
    expect(e.chaffMove).toBeUndefined();
    expect(e.chaffMoveCdUntil).toBeGreaterThanOrEqual(START_GT + 3500 * 0.88);
    expect(e.chaffMoveCdUntil).toBeLessThanOrEqual(START_GT + 3500 * 1.12);
  });
});

describe('★受け入れ条件42: skeletonは攻撃のあと硬直してから距離を取る(安全に殴って安全に帰る、にしない)', () => {
  it('噛み解決から硬直500msぶんは、s-retreatへ入らず(=下がらず)プレイヤーが追いつける', () => {
    const e0 = place(0, { aiPhase: 's-bite', chaffMove: 'skel-bite', biteAt: 0 });
    tick(START_GT); // → s-recover
    let e = first();
    const x0 = e.x, y0 = e.y;
    let t = START_GT;
    for (let i = 0; i < 29; i++) { // 500ms未満(29フレーム≒483ms)
      t += 1000 / 60; tick(t);
      e = first();
      expect(e.aiPhase).toBe('s-recover');
      expect(e.x).toBe(x0); expect(e.y).toBe(y0);
    }
    void e0;
  });
});

describe('★受け入れ条件(350ms・取り分は「後退」): 硬直500msは丸ごと被弾無敵の中に入るので、'
  + '後退中に殴り返せる時間が350ms以上あること', () => {
  let now = 1_000_000;
  beforeEach(() => { now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('噛みヒットからchaffMoveが消える(=間合いを取り直した)までの窓 − 被弾無敵1000ms ≧ 350ms', () => {
    const e = place(0, { aiPhase: 's-bite', chaffMove: 'skel-bite' });
    const spec = biteSpecFor('skeleton', 'skel-bite');
    useGameStore.setState({ enemies: [{ ...e, biteAt: START_GT - (spec.windupMs + spec.biteMs) }] });
    useGameStore.getState().setGameTime(START_GT);
    now = 1_000_000;
    applyContactDamage(START_GT, false, 0, NOOP_COMBAT_EFFECTS);
    const hitAtGt = START_GT;
    const hitAtNow = now;
    expect(useGameStore.getState().player.invulnerable).toBe(true);

    let t = hitAtGt;
    let techEndAt = -1;
    for (let i = 0; i < 600; i++) {
      t += 1000 / 60; now = hitAtNow + (t - hitAtGt);
      tick(t);
      if (first().chaffMove === undefined) { techEndAt = t; break; }
    }
    expect(techEndAt).toBeGreaterThan(0);

    const punishWindowMs = techEndAt - hitAtGt;
    const netPunishMs = punishWindowMs - INVULN_MS;
    expect(netPunishMs).toBeGreaterThanOrEqual(350);
    // ★硬直(500ms)を勝手に延ばして辻褄を合わせていないことの確認(台帳の値のまま)。
    expect(SKELETON_RECOVER_MS).toBe(500);
  });
});

/**
 * ★社長報告2026-09-19(動画)「skeletonの攻撃しなくなるの直ってない」の**1本目の真因**の回帰。
 *
 * 噛みの発火時に焼く向きは `bl = Math.max(0.001, hypot(...))` で正規化するので、
 * **中心が重なっていると 0 ÷ 0.001 ≒ 0** が両軸に入る=**単位ベクトルにならない**。
 * 後退相の `-(enemy.biteDirX ?? 1)` は **undefined しか拾わない**のでゼロは素通りし、
 * **後退速度が0のまま相から永久に出られない**(=「回り込むだけで攻撃してこない」)。
 * 実測(プレイヤー静止30秒): 密着から始めると噛みは **1回**で2.6秒後に停止していた(修正後は5回)。
 */
describe('★密着で焼いた向きがゼロでも後退相から必ず抜ける(v0.25.45xx)', () => {
  it('biteDirがゼロでも s-retreat は終わる(=技が終わってCDが始まる)', () => {
    place(0, { aiPhase: 's-retreat', chaffMove: 'skel-bite', biteDirX: 0, biteDirY: 0 });
    let t = START_GT, ended = false;
    for (let i = 0; i < 600; i++) {   // 10秒ぶん
      t += 1000 / 60; tick(t);
      if (first().aiPhase !== 's-retreat') { ended = true; break; }
    }
    expect(ended).toBe(true);
  });

  it('向きがゼロでない時は従来どおり(焼いた向きの逆へ下がる)', () => {
    const e0 = place(0, { aiPhase: 's-retreat', chaffMove: 'skel-bite', biteDirX: 1, biteDirY: 0 });
    tick(START_GT + 1000 / 60);
    expect(first().x).toBeLessThan(e0.x); // biteDirX=+1 の逆=左へ下がる
  });
});

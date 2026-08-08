// v0.25.2601(社長裁定「その第三案でいい」): 城ボスの飛び掛かり(g-jump-air)のカウンターは
// **着地したら当たる位置**でだけ成立する。「赤い着地円=弾ける範囲」を一致させる不変条件を固定する
// (CLAUDE.md 攻撃ヴィジュアルの分類①「赤いのに当たらない/赤くないのに当たるは絶対にやらない」の
//  カウンター版=「赤い円の外に居るのに弾ける」を潰す)。
import { describe, it, expect } from 'vitest';
import { useGameStore, GIANT_JUMP_RADIUS, GLEN_TRIJUMP_RADIUS, GIANT_GLIDE_HALF_WIDTH } from '../store/gameStore';
import { applyContactDamage, inGiantJumpLandingZone, inGlenTriJumpLandingZone, inGiantGlideBand, NOOP_COMBAT_EFFECTS } from './combatTick';
import { spawnEnemyAt } from './enemyUtils';
import type { Enemy } from '../types/game';

const jumpingGiantAt = (x: number, y: number, landX: number, landY: number): Enemy => {
  const boss = spawnEnemyAt('giantbat', x, y, useGameStore.getState().gameTime);
  boss.aiPhase = 'g-jump-air';
  boss.aiTargetX = landX; boss.aiTargetY = landY;
  boss.gJumpRadius = GIANT_JUMP_RADIUS;
  boss.health = boss.maxHealth; // 反撃で倒れない
  return boss;
};

describe('inGiantJumpLandingZone: 幾何は着地の爆風判定と同一', () => {
  const boss = { aiTargetX: 1000, aiTargetY: 1000, width: 80, height: 80, gJumpRadius: 100 };
  const lx = 1040, ly = 1040; // 着地円の中心 = aiTarget + 半身

  it('円の中(中心)は成立する', () => {
    expect(inGiantJumpLandingZone(lx, ly, 16, boss)).toBe(true);
  });
  it('縁ちょうど(半径+自分の当たり半径)は成立する=爆風と同じ境界', () => {
    expect(inGiantJumpLandingZone(lx + 100 + 16, ly, 16, boss)).toBe(true);
    expect(inGiantJumpLandingZone(lx + 100 + 16 + 0.5, ly, 16, boss)).toBe(false);
  });
  it('円の外は成立しない(ボスの通り道に立っているだけでは弾けない)', () => {
    expect(inGiantJumpLandingZone(lx + 400, ly, 16, boss)).toBe(false);
  });
  it('着地点が未確定(旧セーブ等)は従来どおり通す=厳しくするのは外だと確認できた時だけ', () => {
    expect(inGiantJumpLandingZone(0, 0, 16, { ...boss, aiTargetX: undefined })).toBe(true);
    expect(inGiantJumpLandingZone(0, 0, 16, { ...boss, aiTargetY: undefined })).toBe(true);
  });
});

// v0.25.3050(社長指示①): 三連跳び(g-trijump-air)の空中扱いも単発の飛び掛かりと同じ不変条件に固定する。
describe('inGlenTriJumpLandingZone: 幾何は三連跳びの着地爆風判定と同一(今の跳びの着地円)', () => {
  // gTriJumpPts は中心座標の平たい配列 [x0,y0, x1,y1, x2,y2]。idx=1 の跳び中なら (500,500) が今の着地円。
  const boss = { gTriJumpPts: [100, 100, 500, 500, 900, 900], gTriJumpIdx: 1 };

  it('今の跳びの着地円の中(中心)は成立する', () => {
    expect(inGlenTriJumpLandingZone(500, 500, 16, boss)).toBe(true);
  });
  it('縁ちょうど(半径+自分の当たり半径)は成立する=着地爆風と同じ境界', () => {
    expect(inGlenTriJumpLandingZone(500 + GLEN_TRIJUMP_RADIUS + 16, 500, 16, boss)).toBe(true);
    expect(inGlenTriJumpLandingZone(500 + GLEN_TRIJUMP_RADIUS + 16 + 0.5, 500, 16, boss)).toBe(false);
  });
  it('別の跳びの着地円(過去/未来のidx)では成立しない=「今」の円だけ', () => {
    expect(inGlenTriJumpLandingZone(100, 100, 16, boss)).toBe(false);
    expect(inGlenTriJumpLandingZone(900, 900, 16, boss)).toBe(false);
  });
  it('着地点が未確定なら従来どおり通す(inGiantJumpLandingZoneと同じフェイルオープン)', () => {
    expect(inGlenTriJumpLandingZone(0, 0, 16, { gTriJumpPts: undefined, gTriJumpIdx: 0 })).toBe(true);
  });
});

// v0.25.3052(社長裁定「滑空の案はうで」): 滑空(g-glide-active)は空中族=通過中の体当たりは被弾せず、
// カウンターは「赤い帯の中」でだけ成立する。帯の幾何=カプセル爆発判定と同一(半幅40+相手半径)。
describe('inGiantGlideBand: 幾何は滑空の帯(カプセル爆発)判定と同一', () => {
  // aiFrom/aiTargetは左上基準・中心=+半身(幅80/高さ80)。帯=(140,100)→(740,100)の横線。
  const boss = { aiFromX: 100, aiFromY: 60, aiTargetX: 700, aiTargetY: 60, width: 80, height: 80 };

  it('帯の中心線上は成立する', () => {
    expect(inGiantGlideBand(400, 100, 16, boss)).toBe(true);
  });
  it('縁ちょうど(半幅+自分の当たり半径)は成立する=爆発と同じ境界', () => {
    expect(inGiantGlideBand(400, 100 + GIANT_GLIDE_HALF_WIDTH + 16, 16, boss)).toBe(true);
    expect(inGiantGlideBand(400, 100 + GIANT_GLIDE_HALF_WIDTH + 16 + 0.5, 16, boss)).toBe(false);
  });
  it('帯の外は成立しない(巨体の端に触れても「赤くないのに弾ける/当たる」を作らない)', () => {
    expect(inGiantGlideBand(400, 300, 16, boss)).toBe(false);
  });
  it('端点が未確定なら従来どおり通す(他の空中族と同じフェイルオープン)', () => {
    expect(inGiantGlideBand(0, 0, 16, { ...boss, aiTargetX: undefined })).toBe(true);
  });
});

describe('プレイヤーの空中パリィ: 着地円の中でだけ成立する', () => {
  const setup = (landOffset: number) => {
    useGameStore.getState().resetGame('warrior');
    const now = Date.now();
    useGameStore.setState(s => ({
      player: { ...s.player, x: 0, y: 0, counterWindowEnd: now + 400, invulnerable: false },
    }));
    const p = useGameStore.getState().player;
    // ボス本体はプレイヤーに重ねる(接触=分岐①に入る条件)。着地点だけを遠近で振り分ける。
    const boss = jumpingGiantAt(p.x, p.y, p.x + landOffset, p.y);
    useGameStore.setState({ enemies: [boss] });
    applyContactDamage(useGameStore.getState().gameTime, false, 0, NOOP_COMBAT_EFFECTS);
    return useGameStore.getState().enemies.find(e => e.id === boss.id);
  };

  it('着地点が自分の真上=円の中 → パリィ成立(体勢を20%削る)', () => {
    const after = setup(0);
    expect(after?.bossPosture).toBe(64);
  });

  it('着地点が遠く=円の外 → 体が重なっていてもパリィしない(赤くないのに弾ける、を潰す)', () => {
    const after = setup(1200);
    expect(after?.bossPosture).toBeUndefined();
    // 空中の相手からは被弾しない(この不変条件は据え置き=分岐①のreturnは変えていない)。
    expect(useGameStore.getState().player.health).toBe(useGameStore.getState().player.maxHealth);
  });
});

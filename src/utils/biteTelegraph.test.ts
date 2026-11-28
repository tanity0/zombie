import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  biteTelegraphLine, preBiteTelegraphLine, chaffAimPoint, rankMobMeteors, zombieFirstBiteFxCenter,
  MOB_METEOR_RANK_HYSTERESIS_PX,
} from './biteTelegraph';
import { biteFxRect } from './biteFxHit';
import {
  biteSpecFor, biteLungeFrac, BITE_CONTACT_DIST_PX, biteLungeDistanceAtFire, isBiteResolveDue,
} from './enemyBite';
import {
  ZOMBIE_STANCE_MS, ZOMBIE_WINDUP_MS, ZOMBIE_STAGGER_MS, SKELETON_CROUCH_MS, SKELETON_ARC_MS,
} from './chaffMoves';
import { ESCORT_BODY_SIZE } from './escortHealth';

const mk = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', type: 'zombie', x: 0, y: 0, width: 40, height: 60,
  health: 420, maxHealth: 420, speed: 40, damage: 10, lastHit: 0,
  ...over,
} as Enemy);

describe('雑魚の軽い攻撃の予告(流星ライン)', () => {
  it('噛んでいない敵には線を出さない', () => {
    expect(biteTelegraphLine(mk(), 1000)).toBeNull();
  });

  it('★終点は「発火の瞬間にプレイヤーが立っていた点」と一致する', () => {
    // 発火時の中心間距離 120px。踏み込みは (120 − 接触距離) が焼かれている。
    const contact = BITE_CONTACT_DIST_PX.zombie;
    const e = mk({
      biteAt: 1000, biteDirX: 1, biteDirY: 0, biteLungePx: 120 - contact,
      chaffMove: 'zombie-double', aiPhase: 'z-bite1',
    });
    const l = biteTelegraphLine(e, 1000)!;           // 発火の瞬間(まだ踏み込んでいない)
    const ecx = e.x + e.width / 2;
    expect(l.fx).toBeCloseTo(ecx, 5);
    expect(l.tx - l.fx).toBeCloseTo(120, 5);          // = 発火時の中心間距離
  });

  it('★踏み込んで敵が動いても、線は世界に固定されたまま動かない', () => {
    const e0 = mk({
      biteAt: 1000, biteDirX: 1, biteDirY: 0, biteLungePx: 80,
      chaffMove: 'zombie-double', aiPhase: 'z-bite1',
    });
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const l0 = biteTelegraphLine(e0, 1000)!;
    // 噛みの途中まで進め、敵をそのぶん前へ動かす(状態機械がやっていることの再現)。
    const t = 1000 + spec.windupMs + spec.biteMs / 2;
    // その時刻の踏み込み曲線ぶんだけ敵を前へ動かす(状態機械がやっていることの再現)。
    const moved = mk({ ...e0, x: e0.x + 80 * biteLungeFrac(e0, t) });
    const l1 = biteTelegraphLine(moved, t)!;
    expect(l1.fx).toBeCloseTo(l0.fx, 5);
    expect(l1.tx).toBeCloseTo(l0.tx, 5);
  });

  it('★進捗1(=判定の瞬間)まで通しで、溜めの終わりで描き切る割合になっている', () => {
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const e = mk({ biteAt: 1000, biteDirX: 0, biteDirY: 1, biteLungePx: 40, chaffMove: 'zombie-double', aiPhase: 'z-bite1' });
    const atWindupEnd = biteTelegraphLine(e, 1000 + spec.windupMs - 1)!;
    expect(atWindupEnd.drawFrac).toBeCloseTo(spec.windupMs / (spec.windupMs + spec.biteMs), 5);
    // 溜めの終わり ≒ drawFrac(そこで線が満ちる)
    expect(atWindupEnd.prog).toBeCloseTo(atWindupEnd.drawFrac, 2);
  });

  it('★色の出どころは判定と同じ台帳(カウンター可=赤 / 不可=紫)', () => {
    // §16のゾンビ2連=カウンター可(赤)
    const red = biteTelegraphLine(mk({ biteAt: 1000, biteDirX: 1, biteDirY: 0, chaffMove: 'zombie-double', aiPhase: 'z-bite1' }), 1000)!;
    expect(red.counterable).toBe(true);
    // §12の噛みつき=カウンター不可(紫)
    const purple = biteTelegraphLine(mk({ biteAt: 1000, biteDirX: 1, biteDirY: 0 }), 1000)!;
    expect(purple.counterable).toBe(false);
  });

  it('★本物のボスと城ボスにも出す(v0.25.5046・社長報告「ボスに近づくとノールックで攻撃される」=噛みつきに自前の予告は無い)', () => {
    for (const type of ['thor', 'mimir', 'giantbat'] as const) {
      const bl = biteTelegraphLine(mk({ type, biteAt: 1000, biteDirX: 1, biteDirY: 0 }), 1000);
      expect(bl, type).not.toBeNull();
      expect(bl!.counterable, type).toBe(false); // §12=紫
    }
  });
});

// ★社長指示2026-10-23「ゾンビとスケルトンの技、流星予告入れたい」。
// 赤い予告の掟②「出る=溜めの始まり」/③「消え切る=当たる(多段は段ごと)」を、時刻の純関数で固定する。
describe('★ゾンビ/スケルトンの技の流星(出る=溜めの頭・消え切る=当たる)', () => {
  const T = 50_000;
  const aim = { x: 20 + 60, y: 30 };   // 敵の中心(20,30)から右へ60px(1歩で噛める距離の内側)

  it('ゾンビ2連の1発目: 構え(z-red-pause)の頭で出て、赤の点滅の頭で満ち、1発目の命中で消え切る', () => {
    const spec1 = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const stance = mk({ aiPhase: 'z-red-pause', aiPhaseUntil: T + ZOMBIE_STANCE_MS, chaffBlinkAt: T + ZOMBIE_WINDUP_MS });
    const l0 = preBiteTelegraphLine(stance, T, aim)!;
    expect(l0).not.toBeNull();
    expect(l0.startAt).toBe(T);                                              // 出る=構えの頭
    expect(l0.prog).toBe(0);
    const hit = T + ZOMBIE_STANCE_MS + spec1.windupMs + spec1.biteMs;
    expect(l0.hitAt).toBe(hit);                                              // 1発目の命中
    expect(l0.lockAt).toBe(T);                                               // 向きが固まる=構えの頭(社長「推薦で」2026-10-23)
    expect(l0.lockCue).toBe(true);
    expect(l0.drawFrac).toBeCloseTo(ZOMBIE_WINDUP_MS / (hit - T), 6);        // 満ちる=赤の点滅の頭
    expect(l0.counterable).toBe(true);                                       // 赤(ゾンビ2連=カウンター可)
    expect(l0.emphasis).toBe(1);
    expect(l0.mobLine).toBe(true);
    // 噛みが立った後(z-bite1)も同じ窓の続き=途切れない・時刻が動かない。
    const fireAt = T + ZOMBIE_STANCE_MS;
    const bite1 = mk({
      ...stance, aiPhase: 'z-bite1', chaffMove: 'zombie-double', biteAt: fireAt, biteDirX: 1, biteDirY: 0,
      biteLungePx: biteLungeDistanceAtFire('zombie', 60),
    });
    const l1 = biteTelegraphLine(bite1, fireAt)!;
    expect(l1.startAt).toBe(T);
    expect(l1.hitAt).toBe(hit);
    expect(l1.drawFrac).toBeCloseTo(l0.drawFrac, 6);
    expect(l1.prog).toBeCloseTo(preBiteTelegraphLine(stance, fireAt - 0.001, aim)!.prog, 4);
    // 発火の瞬間の線は、溜めの最後の線と同じ所を指す(向き・長さ=発火で焼く値と同じ式)。
    const lPre = preBiteTelegraphLine(stance, fireAt - 1, aim)!;
    expect(l1.tx).toBeCloseTo(lPre.tx, 5);
    expect(l1.ty).toBeCloseTo(lPre.ty, 5);
    // 消え切る=当たる: 命中の1ms前はまだ進行中、命中の時刻で判定が解決し線は出ない。
    expect(biteTelegraphLine(bite1, hit - 1)!.prog).toBeLessThan(1);
    expect(isBiteResolveDue(bite1, hit - 1)).toBe(false);
    expect(isBiteResolveDue(bite1, hit)).toBe(true);
    expect(biteTelegraphLine(bite1, hit)).toBeNull();
  });

  it('ゾンビ2連の2発目: よろけ(z-stagger)の頭で出て、2発目の命中で消え切る(1発目と窓を混ぜない)・強調つき', () => {
    const spec2 = biteSpecFor('zombie', 'zombie-double', 'z-bite2');
    const stagger = mk({ aiPhase: 'z-stagger', aiPhaseUntil: T + ZOMBIE_STAGGER_MS, chaffMove: 'zombie-double' });
    const ls = preBiteTelegraphLine(stagger, T, aim)!;
    const hit = T + ZOMBIE_STAGGER_MS + spec2.windupMs + spec2.biteMs;
    expect(ls.startAt).toBe(T);
    expect(ls.hitAt).toBe(hit);
    expect(ls.lockAt).toBe(T + ZOMBIE_STAGGER_MS + spec2.windupMs);           // 噛み2の溜めが明ける=判定の向きが固まる
    expect(ls.emphasis).toBeGreaterThan(1);
    const fireAt = T + ZOMBIE_STAGGER_MS;
    const e = mk({ aiPhase: 'z-bite2', chaffMove: 'zombie-double', biteAt: fireAt, biteDirX: 1, biteDirY: 0 });
    const l = biteTelegraphLine(e, fireAt)!;
    expect(l.startAt).toBe(T);
    expect(l.hitAt).toBe(hit);
    expect(l.emphasis).toBeGreaterThan(1);
    expect(isBiteResolveDue(e, hit - 1)).toBe(false);
    expect(isBiteResolveDue(e, hit)).toBe(true);
    expect(biteTelegraphLine(e, hit)).toBeNull();
  });

  it('スケルトンの噛み: しゃがみ(s-crouch)は線なし・回り込み(s-arc)の頭で出て、噛み(s-bite)の命中で消え切る', () => {
    const spec = biteSpecFor('skeleton', 'skel-bite');
    const arcAt = T + SKELETON_CROUCH_MS;
    const hit = arcAt + SKELETON_ARC_MS + spec.windupMs + spec.biteMs;
    const crouch = mk({ type: 'skeleton', aiPhase: 's-crouch', aiPhaseUntil: arcAt });
    expect(preBiteTelegraphLine(crouch, T, aim)).toBeNull();                 // しゃがみ=色なし(形で読む)
    expect(preBiteTelegraphLine(crouch, arcAt - 1, aim)).toBeNull();
    const arc = mk({ type: 'skeleton', aiPhase: 's-arc', aiPhaseUntil: arcAt + SKELETON_ARC_MS, aiStartedAt: arcAt, chaffMove: 'skel-bite', chaffMoveAt: arcAt });
    const la0 = preBiteTelegraphLine(arc, arcAt, aim)!;
    expect(la0.startAt).toBe(arcAt);                                         // 出る=回り込みの頭(体の赤の点滅と同じ錨)
    expect(la0.prog).toBe(0);
    expect(la0.hitAt).toBe(hit);
    expect(la0.counterable).toBe(true);
    const drawFrac = la0.drawFrac;
    expect(drawFrac).toBeGreaterThan(0);
    expect(drawFrac).toBeLessThan(0.5);
    const fireAt = arcAt + SKELETON_ARC_MS;
    const bite = mk({ ...arc, aiPhase: 's-bite', biteAt: fireAt, biteDirX: 1, biteDirY: 0 });
    const lb = biteTelegraphLine(bite, fireAt)!;
    expect(lb.startAt).toBe(arcAt);
    expect(lb.hitAt).toBe(hit);
    expect(lb.drawFrac).toBeCloseTo(drawFrac, 6);
    expect(isBiteResolveDue(bite, hit - 1)).toBe(false);
    expect(isBiteResolveDue(bite, hit)).toBe(true);
    expect(biteTelegraphLine(bite, hit)).toBeNull();
  });

  it('★ゾンビ1発目: 構えの間は焼いた向き(stanceDir)のまま=狙いを追わない', () => {
    const stance = mk({
      aiPhase: 'z-red-pause', aiPhaseUntil: T + ZOMBIE_STANCE_MS, chaffBlinkAt: T + ZOMBIE_WINDUP_MS,
      stanceDirX: 1, stanceDirY: 0,
    });
    const behind = { x: 20 - 60, y: 30 };                                   // プレイヤーが裏(左)へ回った
    const l = preBiteTelegraphLine(stance, T + 500, behind)!;
    expect(l.tx).toBeGreaterThan(l.fx);                                      // 線は焼いた右向きのまま
    expect(l.ty).toBeCloseTo(l.fy, 6);
  });

  it('軍人を狙う線は targetsEscort=true・終点の印は軍人の足元へ写す', () => {
    const e = mk({ biteAt: T, biteDirX: 1, biteDirY: 0, biteAimEscortId: 'esc-1' });
    const l = biteTelegraphLine(e, T)!;
    expect(l.targetsEscort).toBe(true);
    expect(l.footToOff).toBe(ESCORT_BODY_SIZE / 2);
    const lp = preBiteTelegraphLine(mk({ aiPhase: 'z-stagger', aiPhaseUntil: T + 160, chaffMove: 'zombie-double' }), T, aim, true)!;
    expect(lp.targetsEscort).toBe(true);
    expect(biteTelegraphLine(mk({ biteAt: T, biteDirX: 1, biteDirY: 0 }), T)!.targetsEscort).toBe(false);
  });

  it('前段の無い噛み(§12の噛みつき等)は従来どおり: 出る=発火・満ちる=溜めの終わり・向きの合図なし', () => {
    const spec = biteSpecFor('zombie');
    const l = biteTelegraphLine(mk({ biteAt: T, biteDirX: 1, biteDirY: 0 }), T)!;
    expect(l.startAt).toBe(T);
    expect(l.lockCue).toBe(false);
    expect(l.hitAt).toBe(T + spec.windupMs + spec.biteMs);
    expect(l.drawFrac).toBeCloseTo(spec.windupMs / (spec.windupMs + spec.biteMs), 6);
  });

  it('雑魚の線は足元へ写す材料を持つ(判定の中心 tx/ty は不変)/ ボスは従来の線(mobLine=false)', () => {
    const e = mk({ biteAt: T, biteDirX: 1, biteDirY: 0, biteLungePx: 10 });
    const mob = biteTelegraphLine(e, T)!;
    expect(mob.mobLine).toBe(true);
    expect(mob.footFromOff).toBe(e.height / 2);           // 攻撃側の中心→箱の底辺(足元)
    expect(mob.footToOff).toBeGreaterThan(0);              // 狙いの点→相手の足元
    expect(mob.tx - mob.fx).toBeCloseTo(10 + BITE_CONTACT_DIST_PX.zombie, 5); // 終点=狙っている点(足元へ写す前)
    const boss = biteTelegraphLine(mk({ type: 'thor', biteAt: T, biteDirX: 1, biteDirY: 0 }), T)!;
    expect(boss.mobLine).toBe(false);
  });

  it('★リッチの転移噛みは線を出さない(当たるのはワープ先の赤い円・ワープ元に赤を描かない)', () => {
    const lich = mk({ type: 'lich', chaffMove: 'lich-blink', biteAt: T, biteDirX: 1, biteDirY: 0 });
    expect(biteTelegraphLine(lich, T)).toBeNull();
    expect(biteTelegraphLine(lich, T + 500)).toBeNull();
  });

  it('溜めの外(構え前・硬直・後退)では溜めの線を出さない', () => {
    expect(preBiteTelegraphLine(mk({ aiPhase: 'z-wait', aiPhaseUntil: T + 500 }), T, aim)).toBeNull();
    expect(preBiteTelegraphLine(mk({ aiPhase: 'z-recover', aiPhaseUntil: T + 900 }), T, aim)).toBeNull();
    expect(preBiteTelegraphLine(mk({ aiPhase: 'zpause', aiPhaseUntil: T + 1000 }), T, aim)).toBeNull(); // 紫の突進の溜めは今回は出さない
    expect(preBiteTelegraphLine(mk({ type: 'skeleton', aiPhase: 's-recover', aiPhaseUntil: T + 500 }), T, aim)).toBeNull();
  });

  it('狙い: 軍人を追っていて候補に居れば軍人、居なければ実プレイヤー(状態機械の apx/apy と同じ)', () => {
    const p = { x: 1, y: 2 };
    expect(chaffAimPoint({ targetEscortId: 'a' }, p, [{ id: 'a', x: 9, y: 8 }])).toEqual({ x: 9, y: 8, escort: true });
    expect(chaffAimPoint({ targetEscortId: 'b' }, p, [{ id: 'a', x: 9, y: 8 }])).toEqual({ x: 1, y: 2, escort: false });
    expect(chaffAimPoint({}, p, [{ id: 'a', x: 9, y: 8 }])).toEqual({ x: 1, y: 2, escort: false });
  });
});

describe('★群れの強弱の順位(敵の中心とプレイヤーの距離・3本・ヒステリシス)', () => {
  const items = [
    { key: 'a', d: 50 }, { key: 'b', d: 80 }, { key: 'c', d: 100 }, { key: 'd', d: 110 }, { key: 'e', d: 200 },
  ];
  it('近い順に3本', () => {
    expect([...rankMobMeteors(items, new Set())].sort()).toEqual(['a', 'b', 'c']);
  });
  it('前フレームで上位だった線は、ヒステリシス未満の差なら入れ替わらない(ちらつかない)', () => {
    const near = [{ key: 'a', d: 50 }, { key: 'b', d: 80 }, { key: 'c', d: 100 + MOB_METEOR_RANK_HYSTERESIS_PX - 1 }, { key: 'd', d: 100 }];
    expect(rankMobMeteors(near, new Set(['a', 'b', 'c'])).has('c')).toBe(true);
    // ヒステリシスを超えて離れたら入れ替わる。
    const far = [{ key: 'a', d: 50 }, { key: 'b', d: 80 }, { key: 'c', d: 100 + MOB_METEOR_RANK_HYSTERESIS_PX + 1 }, { key: 'd', d: 100 }];
    expect(rankMobMeteors(far, new Set(['a', 'b', 'c'])).has('d')).toBe(true);
  });
  it('3本以下なら全部が通常の強さ', () => {
    expect(rankMobMeteors(items.slice(0, 2), new Set()).size).toBe(2);
  });
});

describe('★ゾンビ1発目の噛みの四角(絵=判定)は焼いた向きの前方・後ろの端がゾンビの前の端', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]] as const) {
    it(`向き(${dx.toFixed(2)},${dy.toFixed(2)})`, () => {
      const lp = 30, contact = BITE_CONTACT_DIST_PX.zombie;
      const c = zombieFirstBiteFxCenter(0, 0, dx, dy, lp, contact);
      const r = biteFxRect('zombie-double', c.x, c.y, dx >= 0)!;
      const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
      const back = Math.min(...corners.map(([x, y]) => x * dx + y * dy));
      expect(back).toBeCloseTo(lp + contact - 14, 5);   // 前の端=踏み込み+体の半分
    });
  }
  it('1発目の線の終点は四角の中に入っている(線の先に居れば当たる)', () => {
    const e = mk({
      aiPhase: 'z-bite1', chaffMove: 'zombie-double', biteAt: 1000, chaffBlinkAt: 0, biteDirX: -1, biteDirY: 0,
      biteLungePx: biteLungeDistanceAtFire('zombie', 60),
    });
    const l = biteTelegraphLine(e, 1000)!;
    const r = biteFxRect('zombie-double', l.fxX, l.fyY, false)!;
    expect(l.tx).toBeGreaterThanOrEqual(r.x);
    expect(l.tx).toBeLessThanOrEqual(r.x + r.w);
    // 2発目・他の型は終点のまま(不変)。
    const e2 = mk({ aiPhase: 'z-bite2', chaffMove: 'zombie-double', biteAt: 1000, biteDirX: -1, biteDirY: 0 });
    const l2 = biteTelegraphLine(e2, 1000)!;
    expect(l2.fxX).toBe(l2.tx);
    expect(l2.fyY).toBe(l2.ty);
  });
});


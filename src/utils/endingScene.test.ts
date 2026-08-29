import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENDING_SOLDIER_TUNING, DEFAULT_ENDING_PHILL_TUNING, DEFAULT_ENDING_BOMB_TUNING,
  spawnEndingSoldier, stepEndingSoldier, reenterEndingSoldierIfOffscreen, createInitialEndingSoldiers,
  fallenSoldierAt, nextFallenSoldierAfter, fallenSoldiersInRange,
  createInitialEndingPhill, stepEndingPhill,
  trySpawnEndingBomb, stepEndingBomb, endingBombFallY, blastEndingSoldiers, isEndingSoldierTumbling,
  ENDING_BLOWN_MS,
} from './endingScene';

// 決定的な擬似乱数(テスト用)。0..1を固定シーケンスで返す。
const seqRand = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('endingScene — 兵士の状態機械(ENDING_SCENE.md 演出仕様v2 §1/§7/§9)', () => {
  it('spawnEndingSoldierはphase=walk・velMult=1で始まり、値がtuningの範囲内に収まる', () => {
    const rand = seqRand([0.5]);
    const s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.speed).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.speedMin);
    expect(s.speed).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.speedMax);
    expect(Math.abs(s.y)).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.bandHalfPx);
  });

  it('walk中は右→左(-x方向)に個体速度で進む', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    const x0 = s.x;
    s = stepEndingSoldier(s, 100, 100, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.x).toBeLessThan(x0); // 左へ動いた
    expect(s.phase).toBe('walk');
  });

  it('歩行区間(walkLegMs)を超えるとdecelへ、その後stopped→fire→accel→walkへ一巡する', () => {
    const rand = seqRand([0, 0.5, 1, 0.3, 0.7]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, walkLegMs: 500 }; // 歩行区間を短く固定してテストを速くする
    // walk中: まだ歩行区間内
    s = stepEndingSoldier(s, 400, 400, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('walk');
    // 歩行区間を超える
    s = stepEndingSoldier(s, 200, 600, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('decel');
    // decelのease(既定200ms)を使い切るとstoppedへ、velMult=0
    s = stepEndingSoldier(s, 250, 850, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('stopped');
    expect(s.velMult).toBe(0);
    expect(s.stopDurationMs).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.stopMsMin);
    expect(s.stopDurationMs).toBeLessThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.stopMsMax);
    // stopped区間を使い切るとfireへ切り替わる(この1tickでは発砲ロジックはまだ回らない=shotsFired0)
    s = stepEndingSoldier(s, s.stopDurationMs + 10, 2000, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('fire');
    expect(s.shotsPlanned).toBeGreaterThanOrEqual(1);
    expect(s.shotsPlanned).toBeLessThanOrEqual(3);
    expect(s.shotsFired).toBe(0);
    // fireフェーズの次tickでnextShotAtMs=0なので即1発目(1発目が遅れて出るのはNG=CLAUDE.md「小さくて見えない」の運動版)
    s = stepEndingSoldier(s, 16, 2016, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.shotsFired).toBeGreaterThanOrEqual(1);
    expect(s.lastShotAt).toBe(2016);
    const planned = s.shotsPlanned;
    // 発砲間隔(300ms)を全部進めて撃ち切る
    for (let i = 0; i < planned + 1 && s.phase === 'fire'; i++) {
      s = stepEndingSoldier(s, DEFAULT_ENDING_SOLDIER_TUNING.shotIntervalMs, 3000 + i * 300, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    }
    expect(s.phase).toBe('accel');
    expect(s.shotsFired).toBe(planned);
    // accelのeaseを使い切るとwalkへ戻り、velMult=1・新しいwalkLegMsを持つ
    s = stepEndingSoldier(s, DEFAULT_ENDING_SOLDIER_TUNING.easeMs + 10, 9999, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.walkLegMs).toBeGreaterThanOrEqual(DEFAULT_ENDING_SOLDIER_TUNING.walkMsMin);
  });

  it('decel/accel中はvelMultが1→0/0→1へ単調に(慣性=瞬間停止しない・CLAUDE.md MUST)', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', 1000, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, phase: 'decel', phaseMs: 0, velMult: 1, walkLegMs: 0 };
    const half = DEFAULT_ENDING_SOLDIER_TUNING.easeMs / 2;
    s = stepEndingSoldier(s, half, half, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.velMult).toBeGreaterThan(0);
    expect(s.velMult).toBeLessThan(1);
  });

  it('createInitialEndingSoldiersは指定人数を一意なidで作る', () => {
    const rand = seqRand([0.1, 0.4, 0.9, 0.2]);
    const arr = createInitialEndingSoldiers(7, 2000, 1500, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(arr).toHaveLength(7);
    expect(new Set(arr.map(s => s.id)).size).toBe(7);
  });

  it('左境界を割ると右から再投入され、phaseがwalkに戻る(プール・§9)', () => {
    const rand = seqRand([0.5]);
    let s = spawnEndingSoldier('a', -500, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    s = { ...s, phase: 'fire', velMult: 0 }; // 再投入前は任意フェーズでも良いことの確認を兼ねる
    const reentered = reenterEndingSoldierIfOffscreen(s, -400, 3000, 200, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(reentered.phase).toBe('walk');
    expect(reentered.x).toBeGreaterThanOrEqual(3000);
    expect(reentered.id).toBe('a');
  });

  it('左境界の内側にいる兵士はそのまま(無変更)', () => {
    const rand = seqRand([0.5]);
    const s = spawnEndingSoldier('a', 100, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    const result = reenterEndingSoldierIfOffscreen(s, -400, 3000, 200, rand, DEFAULT_ENDING_SOLDIER_TUNING);
    expect(result).toBe(s); // 同一参照(無変更)
  });
});

describe('endingScene — 倒れ兵士の配置(§8・ワールド固定)', () => {
  it('900〜1400pxの間隔に収まる(隣接indexの差)', () => {
    for (let i = 0; i < 200; i++) {
      const a = fallenSoldierAt(i);
      const b = fallenSoldierAt(i + 1);
      const gap = b.x - a.x;
      expect(gap).toBeGreaterThanOrEqual(900);
      expect(gap).toBeLessThanOrEqual(1400);
    }
  });

  it('xについて単調増加', () => {
    let prev = -Infinity;
    for (let i = 0; i < 200; i++) {
      const spot = fallenSoldierAt(i);
      expect(spot.x).toBeGreaterThan(prev);
      prev = spot.x;
    }
  });

  it('nextFallenSoldierAfterはafterIndexより後ろ・fromX以降の最初の1体を返す', () => {
    const spot = nextFallenSoldierAfter(2, 5000);
    expect(spot.index).toBeGreaterThan(2);
    expect(spot.x).toBeGreaterThanOrEqual(5000);
  });

  it('fallenSoldiersInRangeは範囲内のみ返し、順序はindex昇順', () => {
    const spots = fallenSoldiersInRange(0, 6000);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(6000);
    }
    for (let i = 1; i < spots.length; i++) expect(spots[i].index).toBeGreaterThan(spots[i - 1].index);
  });
});

describe('endingScene — フィルの救護状態機械(§2/§4/§8)', () => {
  it('createInitialEndingPhillはphase=walk・velMult=1で始まる', () => {
    const s = createInitialEndingPhill();
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
    expect(s.lastHealedIndex).toBe(-1);
    expect(s.targetIndex).toBeNull();
  });

  it('倒れ兵士に近づくとapproachDecelへ入り、停止点(手前stopOffsetPx)でvelMultが0近くまで下がる', () => {
    let s = createInitialEndingPhill();
    const target = fallenSoldierAt(0);
    const stopX = target.x - DEFAULT_ENDING_PHILL_TUNING.stopOffsetPx;
    // approachTriggerPxの少し外側から1歩で入る
    let playerX = stopX - DEFAULT_ENDING_PHILL_TUNING.approachTriggerPx + 1;
    s = stepEndingPhill(s, playerX, 16, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.phase).toBe('approachDecel');
    expect(s.targetIndex).toBe(0);
    // 停止点ぎりぎりまで進める(プレイヤーの実移動はstore/useGameLoop側が担うので、テストでは
    // playerXを外から与えて状態機械の反応だけを見る)。
    playerX = stopX - 1;
    s = stepEndingPhill(s, playerX, 16, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.phase).toBe('healForward');
    expect(s.velMult).toBe(0);
  });

  it('healForward→healHold→healReverse→accel→walkと一巡し、lastHealedIndexが更新される', () => {
    let s: ReturnType<typeof createInitialEndingPhill> = { ...createInitialEndingPhill(), phase: 'healForward', phaseMs: 0, targetIndex: 3, frame: 0 };
    const t = DEFAULT_ENDING_PHILL_TUNING;
    // healForward: 5コマぶん進める(片道)
    s = stepEndingPhill(s, 0, t.healFrameMs * 5, t);
    expect(s.phase).toBe('healHold');
    expect(s.frame).toBe(5);
    // healHold: 保持ぶん進める
    s = stepEndingPhill(s, 0, t.healHoldMs, t);
    expect(s.phase).toBe('healReverse');
    // healReverse: 5コマぶん逆再生
    s = stepEndingPhill(s, 0, t.healFrameMs * 5, t);
    expect(s.phase).toBe('accel');
    expect(s.lastHealedIndex).toBe(3);
    expect(s.targetIndex).toBeNull();
    // accel: easeを使い切るとwalkへ、velMult=1
    s = stepEndingPhill(s, 0, t.accelMs + 10, t);
    expect(s.phase).toBe('walk');
    expect(s.velMult).toBe(1);
  });

  it('approachDecelは有限時間で救護へ収束し、途中の速度床は0.3(検収A-4=9秒失速の再発防止)', () => {
    const t = DEFAULT_ENDING_PHILL_TUNING;
    let s = createInitialEndingPhill();
    const target = fallenSoldierAt(0);
    const stopX = target.x - t.stopOffsetPx;
    // 減速開始点の少し外側から、呼び出し側の実装どおり velMult×基準速度 で自走させて収束を見る。
    let playerX = stopX - t.approachTriggerPx + 1;
    const speedPxS = 220; // 仮の基準歩速。値は結論に効かない(床0.3がある限り有限時間で届く)
    let elapsedMs = 0;
    while (s.phase !== 'healForward' && elapsedMs < 10000) {
      s = stepEndingPhill(s, playerX, 16, t);
      if (s.phase === 'approachDecel') expect(s.velMult).toBeGreaterThanOrEqual(0.3);
      playerX += speedPxS * s.velMult * (16 / 1000);
      elapsedMs += 16;
    }
    expect(s.phase).toBe('healForward');
    expect(elapsedMs).toBeLessThanOrEqual(2500); // 旧実装(床0.04・しきい値2px)は9秒超掛かっていた
  });

  it('歩行コマはvelMult連動のanimMsで進む(減速中は脚もゆっくり=足滑り対策・検収A-4)', () => {
    const t = DEFAULT_ENDING_PHILL_TUNING;
    let s: ReturnType<typeof createInitialEndingPhill> =
      { ...createInitialEndingPhill(), phase: 'approachDecel', targetIndex: 0, velMult: 0.5, animMs: 0 };
    const target = fallenSoldierAt(0);
    const playerX = target.x - t.stopOffsetPx - 50; // 停止点まで50px(=減速域内・まだ止まらない)
    s = stepEndingPhill(s, playerX, 100, t);
    expect(s.animMs).toBeCloseTo(50); // 100ms × velMult0.5(フレーム開始時点の値)
  });

  it('healForward中はvelMult=0(停止して救護動作に専念=判定なしの観賞シーン)', () => {
    let s: ReturnType<typeof createInitialEndingPhill> = { ...createInitialEndingPhill(), phase: 'healForward', phaseMs: 0, targetIndex: 0 };
    s = stepEndingPhill(s, 0, 50, DEFAULT_ENDING_PHILL_TUNING);
    expect(s.velMult).toBe(0);
  });
});

describe('endingScene — 爆撃(ENDING_SCENE.md 演出仕様v3.1)', () => {
  const T = DEFAULT_ENDING_BOMB_TUNING;
  const soldierAt = (id: string, x: number, y = 0) => {
    const s = spawnEndingSoldier(id, x, () => 0.5);
    return { ...s, y };
  };

  it('trySpawn: 兵士の予測位置(左進み込み)がアンカーになり、着弾点はその近く(X±60・帯クランプ内)', () => {
    const s = soldierAt('a', 1000, 40);
    const b = trySpawnEndingBomb('b1', [s], 1000, 400, () => 0.5, T);
    expect(b).not.toBeNull();
    const predictedX = s.x - s.speed * s.velMult * (T.fallMs / 1000); // 検収A-2: 落下中の左進みを先読み
    expect(Math.abs(b!.impactX - predictedX)).toBeLessThanOrEqual(T.anchorOffsetXPx);
    expect(Math.abs(b!.impactY)).toBeLessThanOrEqual(T.bandClampYPx);
  });

  it('trySpawn: 着弾Yは必ず|y|≥60(検収A-1・案A: フィルの進路=中央帯には落とさない=「奥や手前に」)', () => {
    for (const r of [0.05, 0.3, 0.5, 0.7, 0.95]) {
      const s = soldierAt('a', 1000, 0); // 進路ど真ん中の兵士がアンカーでも
      const b = trySpawnEndingBomb('b1', [s], 1000, 400, () => r, T);
      expect(b).not.toBeNull();
      expect(Math.abs(b!.impactY)).toBeGreaterThanOrEqual(T.minImpactAbsYPx);
      expect(Math.abs(b!.impactY)).toBeLessThanOrEqual(T.bandClampYPx);
    }
  });

  it('★再発防止(実機2026-08-29「爆撃が来ない」・検収A-1): 実寸の論理画面幅(405px)でも投下が成立する', () => {
    // v0.25.4039はX方向のフィル回避帯が候補窓(可視半幅202×0.75)を包含し、投下成功率0.00%だった
    // (検収監査の実測)。実在する画面寸(viewport.ts VIEW_CORE_W=405)で成立することを固定する。
    const halfView = 405 / 2;
    const s = soldierAt('a', 1000, 40); // カメラ中心付近に1人立っているだけの最小ケース
    const b = trySpawnEndingBomb('b1', [s], 1000, halfView, () => 0.5, T);
    expect(b).not.toBeNull();
  });

  it('着弾Xはフィル(着弾時カメラ中心)から±クリアランス以上離れる(社長指示「フィルの近くには落とさないで」)', () => {
    // アンカーの予測位置がちょうどフィルの真横に来るケースでも、候補は捨てず着弾点を外へ押し出す
    // (候補フィルタで弾くとv4039の「候補0=爆撃が来ない」型に戻る)。
    const camCenter = 1000;
    const camAtImpact = camCenter + T.camLeadPx;
    const s0 = soldierAt('a', 1000);
    const sAtPhill = { ...s0, x: camAtImpact + s0.speed * s0.velMult * (T.fallMs / 1000) }; // 予測位置=フィル真横
    const b = trySpawnEndingBomb('b1', [sAtPhill], camCenter, 400, () => 0.5, T);
    expect(b).not.toBeNull();
    expect(Math.abs(b!.impactX - camAtImpact)).toBeGreaterThanOrEqual(T.phillClearancePx);
    // 押し出してもアンカーはノックバック楕円内(=「と同時に」が保たれる)
    const dx = sAtPhill.x - sAtPhill.speed * sAtPhill.velMult * (T.fallMs / 1000) - b!.impactX;
    const dy = (sAtPhill.y - b!.impactY) * T.knockDepthMult;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(T.knockRadiusPx);
  });

  it('trySpawn: 着弾時に画面外へ流れる兵士・転倒中の兵士はアンカーにならず、候補0なら見送り(検収A-1/A-2)', () => {
    const offscreen = soldierAt('a', 5000);   // 着弾時カメラ中心(1000+94)±320の外
    const tumbling = { ...soldierAt('c', 1000), phase: 'downed' as const };
    expect(trySpawnEndingBomb('b1', [offscreen, tumbling], 1000, 400, () => 0.5, T)).toBeNull();
  });

  it('落下は重力加速(後半の方が速い)で、fallMs後に着弾(justExplodedは着弾フレームだけ)', () => {
    let b = trySpawnEndingBomb('b1', [soldierAt('a', 0)], 0, 400, () => 0.5, T)!;
    const y0 = endingBombFallY(b, T);
    expect(y0).toBeCloseTo(b.impactY - T.fallHeightPx);
    b = stepEndingBomb(b, T.fallMs * 0.25, T)!;
    const dFirst = endingBombFallY(b, T) - y0;          // 前半1/4の落下量
    const yq = endingBombFallY(b, T);
    b = stepEndingBomb(b, T.fallMs * 0.5, T)!;          // t=0.75まで
    b = { ...b, phaseMs: T.fallMs * 0.75 };
    const dLater = endingBombFallY(b, T) - yq;          // 中盤2/4の落下量
    expect(dLater).toBeGreaterThan(dFirst * 2);          // 加速している(等速ではない=慣性MUST)
    b = stepEndingBomb(b, T.fallMs, T)!;                 // 着弾
    expect(b.phase).toBe('explode');
    expect(b.justExploded).toBe(true);
    b = stepEndingBomb(b, 16, T)!;
    expect(b.justExploded).toBe(false);                  // edgeは1フレームだけ
    expect(stepEndingBomb(b, T.explodeMs, T)).toBeNull(); // 爆発表示が終わると消える
  });

  it('blast: 楕円半径内の兵士だけがblownになり、方向は爆心から離れる向き(監査A-3/A-5)', () => {
    const near = soldierAt('near', 1100, 0);   // dx=+100 → 半径内・右へ飛ぶ
    const far = soldierAt('far', 1400, 0);     // dx=+400 → 半径外
    const deep = soldierAt('deep', 1000, 80);  // dx=0/dy=80×1.6=128 → 半径内・左右は乱数
    const out = blastEndingSoldiers([near, far, deep], 1000, -40, () => 0.3, T);
    expect(out[0].phase).toBe('blown');
    expect(out[0].knockDirX).toBe(1);
    expect(out[1].phase).toBe('walk');
    // deep: dy=(80-(-40))×1.6=192 → 半径170の外。座標を変えて内側も確認
    const deep2 = soldierAt('d2', 1005, -20);
    const out2 = blastEndingSoldiers([deep2], 1000, -40, () => 0.3, T);
    expect(out2[0].phase).toBe('blown');
    expect([1, -1]).toContain(out2[0].knockDirX); // |dx|<8 → 左右は乱数のどちらか
  });

  it('転倒はblown→downedで終端(起き上がらない=社長指示2026-08-29)。補充は画面外reenterのみ', () => {
    const rand = () => 0.5;
    let s = blastEndingSoldiers([soldierAt('a', 1100)], 1000, 0, rand, T)[0];
    expect(isEndingSoldierTumbling(s)).toBe(true);
    const x0 = s.x;
    // 60fpsの実刻みで積分(検収B-3: 550msの1ステップは台形近似が粗く330pxに膨れる。実機は~220px)
    for (let i = 0; i < Math.ceil(ENDING_BLOWN_MS / 16) + 1 && s.phase === 'blown'; i++) {
      s = stepEndingSoldier(s, 16, 0, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    }
    expect(s.phase).toBe('downed');
    const dist = s.x - x0;
    expect(dist).toBeGreaterThan(180); // 「大きく」飛んでいる(初速1200×(1-t)²減衰の積分≈220px)
    expect(dist).toBeLessThan(260);
    // 旧downDurationMs(2.5〜4.5s)を大きく超えても起き上がらない=終端
    s = stepEndingSoldier(s, 60000, 0, DEFAULT_ENDING_SOLDIER_TUNING, rand);
    expect(s.phase).toBe('downed');
    // blown中は画面外でも再投入しない(動きの完走を守る)
    const mid = { ...s, phase: 'blown' as const, phaseMs: 0 };
    expect(reenterEndingSoldierIfOffscreen(mid, mid.x + 999, 0, 0, rand)).toBe(mid);
    // downed(終端)は画面外へ抜けたら右から新規walkerとして補充される(人数が痩せない唯一の回収口)
    const recycled = reenterEndingSoldierIfOffscreen(s, s.x + 999, 5000, 0, rand);
    expect(recycled.phase).toBe('walk');
    expect(recycled.x).toBeGreaterThanOrEqual(5000);
  });
});

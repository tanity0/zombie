// v0.25.3512(社長指示「発射間隔もレベルで下げたい。いまの間隔をMAXとして、階段にしておいて」)。
// タレットのLv差は「持続時間」「爆発弾のLv3ゲート」「発射間隔」の3つに効くので、
// **Lvの判定式が1本であること**と**階段の向き**をここで固定する。
import { describe, it, expect } from 'vitest';
import {
  TURRET_DURATION_BY_LEVEL, TURRET_FIRE_INTERVAL_MULT_BY_LEVEL, TURRET_COOLDOWN_MS, turretNextReadyAt,
  turretLevelFromDuration, turretFireIntervalMs,
} from './turretTuning';

const FWD = 130;  // 前方集中の現行値(=Lv3)
const OMNI = 420; // 全方位の現行値(=Lv3)

describe('turretLevelFromDuration(設置時の持続時間からLvを逆算)', () => {
  it('社長裁定の秒数どおりにLvが決まる(10秒=1 / 13秒=2 / 15秒=3)', () => {
    expect(turretLevelFromDuration(TURRET_DURATION_BY_LEVEL[1])).toBe(1);
    expect(turretLevelFromDuration(TURRET_DURATION_BY_LEVEL[2])).toBe(2);
    expect(turretLevelFromDuration(TURRET_DURATION_BY_LEVEL[3])).toBe(3);
  });
  it('未設定・欠損はLv1として扱う(描画/発射が落ちない安全側)', () => {
    expect(turretLevelFromDuration(undefined)).toBe(1);
    expect(turretLevelFromDuration(0)).toBe(1);
  });
  it('境界の1ms手前は下のLv(表と判定がズレていないこと)', () => {
    expect(turretLevelFromDuration(TURRET_DURATION_BY_LEVEL[3] - 1)).toBe(2);
    expect(turretLevelFromDuration(TURRET_DURATION_BY_LEVEL[2] - 1)).toBe(1);
  });
});

describe('turretFireIntervalMs(発射間隔の階段)', () => {
  it('★Lv3(MAX)は現行値のまま=既存の手触りを変えない', () => {
    expect(turretFireIntervalMs(FWD, 3)).toBe(FWD);
    expect(turretFireIntervalMs(OMNI, 3)).toBe(OMNI);
  });
  it('Lvが上がるほど間隔が短くなる(階段の向き。取り違えたら落ちる)', () => {
    for (const base of [FWD, OMNI]) {
      expect(turretFireIntervalMs(base, 1)).toBeGreaterThan(turretFireIntervalMs(base, 2));
      expect(turretFireIntervalMs(base, 2)).toBeGreaterThan(turretFireIntervalMs(base, 3));
    }
  });
  it('Lv1/Lv2は現行値より遅い(=現行がMAXであることの裏返し)', () => {
    expect(turretFireIntervalMs(FWD, 1)).toBe(195);
    expect(turretFireIntervalMs(FWD, 2)).toBe(156);
    expect(turretFireIntervalMs(OMNI, 1)).toBe(630);
    expect(turretFireIntervalMs(OMNI, 2)).toBe(504);
  });
  it('2モードの比(前方:全方位)はLvが変わっても保たれる(倍率の表1つで管理している証明)', () => {
    for (const lv of [1, 2, 3]) {
      const r = turretFireIntervalMs(OMNI, lv) / turretFireIntervalMs(FWD, lv);
      expect(r).toBeCloseTo(OMNI / FWD, 1);
    }
  });
  it('範囲外のLvは等倍(=現行値)へ落とす(壊れた値で0除算や無限連射にしない)', () => {
    expect(turretFireIntervalMs(FWD, 0)).toBe(FWD);
    expect(turretFireIntervalMs(FWD, 9)).toBe(FWD);
  });
  it('倍率表はLv3=1.0で単調減少(表を直接いじった時の検知)', () => {
    expect(TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[3]).toBe(1);
    expect(TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[1]).toBeGreaterThan(TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[2]);
    expect(TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[2]).toBeGreaterThan(TURRET_FIRE_INTERVAL_MULT_BY_LEVEL[3]);
  });
});

describe('★turretNextReadyAt — CDは「消えてから」数える(社長報告v0.25.3552「CDがズルしてる」)', () => {
  it('次に設置できる時刻 = 設置時刻 + 寿命 + CD', () => {
    expect(turretNextReadyAt(0, 1)).toBe(TURRET_DURATION_BY_LEVEL[1] + TURRET_COOLDOWN_MS);
    expect(turretNextReadyAt(0, 2)).toBe(TURRET_DURATION_BY_LEVEL[2] + TURRET_COOLDOWN_MS);
    expect(turretNextReadyAt(0, 3)).toBe(TURRET_DURATION_BY_LEVEL[3] + TURRET_COOLDOWN_MS);
  });

  it('★【不変条件】CDはタレットの寿命と並走しない(寿命が明ける前に再設置できない)', () => {
    // これが「ズル」の中身。旧実装は CD=設置+10秒 で寿命(10/13/15秒)と並走し、
    // CD明けに**まだ生きているタレットを消して置き直す**ため、どのLvでも実効「10秒周期で常設」だった。
    for (const lv of [1, 2, 3]) {
      const placedAt = 5000;
      expect(turretNextReadyAt(placedAt, lv))
        .toBeGreaterThan(placedAt + TURRET_DURATION_BY_LEVEL[lv]);
    }
  });

  it('★【不変条件】持続時間の階段が、そのまま「次に置けるまで」の階段になる(Lvが死なない)', () => {
    // v0.25.3482の持続時間の階段(10/13/15秒)が1秒も効いていなかったのが今回の不具合。
    expect(turretNextReadyAt(0, 2)).toBeGreaterThan(turretNextReadyAt(0, 1));
    expect(turretNextReadyAt(0, 3)).toBeGreaterThan(turretNextReadyAt(0, 2));
  });

  it('設置時刻ぶんは素直にずれる', () => {
    expect(turretNextReadyAt(12345, 2) - turretNextReadyAt(0, 2)).toBe(12345);
  });

  it('範囲外のLvは1..3へ丸める(落ちない)', () => {
    expect(turretNextReadyAt(0, 0)).toBe(turretNextReadyAt(0, 1));
    expect(turretNextReadyAt(0, 9)).toBe(turretNextReadyAt(0, 3));
  });
});

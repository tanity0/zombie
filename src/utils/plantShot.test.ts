// ★弾を撃つ絵(花が閉じる→撃つ→開く)の拍。社長支給2026-09-21
// 「プラントの弾攻撃(蕾になるのを早く流して、閉じたら弾が発射するイメージ)」。
import { describe, it, expect } from 'vitest';
import {
  plantShotFrame, plantCloseStartAt, usesShotWindup, PLANT_CLOSE_MS, PLANT_OPEN_MS,
} from './plantShot';
import { ENEMY_SHOT_SHEETS } from './enemySheets';

const FR = ENEMY_SHOT_SHEETS['plant-common'];
const C = PLANT_CLOSE_MS, O = PLANT_OPEN_MS;
const LAST = FR - 1;

describe('★★閉じ切った瞬間に弾が出る', () => {
  it('閉じ始めは開いた姿(0コマ目)', () => {
    expect(plantShotFrame(FR, 0)).toBe(0);
  });

  it('★弾が出る直前のコマは「閉じた蕾」(最後のコマ)', () => {
    expect(plantShotFrame(FR, C - 1)).toBe(LAST);
  });

  it('★弾が出た瞬間も蕾のまま(そこから開き直す)=継ぎ目で跳ねない', () => {
    expect(plantShotFrame(FR, C)).toBe(LAST);
  });

  it('開き切ったら立ち絵へ戻る(null)', () => {
    expect(plantShotFrame(FR, C + O)).toBeNull();
    expect(plantShotFrame(FR, C + O + 500)).toBeNull();
    expect(plantShotFrame(FR, null)).toBeNull();
  });

  it('開く途中は最後のコマから0へ降りていく(単調)', () => {
    let prev = LAST;
    for (let t = C; t < C + O; t += 5) {
      const i = plantShotFrame(FR, t)!;
      expect(i).toBeLessThanOrEqual(prev);
      prev = i;
    }
    expect(plantShotFrame(FR, C + O - 1)).toBe(0);
  });

  it('★★「早く流す」=閉じる途中のコマほど尺が短い(等間隔ではない)', () => {
    const spans: number[] = [];
    let cur = 0, start = 0;
    for (let t = 0; t <= C; t++) {
      const i = t < C ? plantShotFrame(FR, t)! : FR;
      if (i !== cur) { spans.push(t - start); start = t; cur = i; }
    }
    expect(spans.length).toBe(FR);                       // 全コマが一度は出る(飛ばさない)
    const mid = spans.slice(0, FR - 1);                  // 蕾(最後)を除いた「閉じていく」コマ
    expect(mid[0]).toBeGreaterThan(mid[mid.length - 1]); // 頭が長く、閉じ際が短い
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(2);  // 機械的な等間隔ではない
  });

  it('★★蕾のコマは「見える長さ」持つ(60fpsで数コマ)', () => {
    // 加速だけで閉じ切ると蕾が17ms=1コマしか出ず、「閉じたら発射」の肝心の絵が見えなかった。
    let budMs = 0;
    for (let t = 0; t < C; t++) if (plantShotFrame(FR, t) === LAST) budMs++;
    expect(budMs).toBeGreaterThanOrEqual(80);
    expect(budMs).toBeLessThan(C);                       // 全部が蕾=閉じる絵が無い、にはしない
  });

  it('閉じる尺を短くしても、閉じていく絵は全部残る(蕾が全部を食わない)', () => {
    const shortClose = 100;   // 既定の蕾(90ms)より短い=待ち尺の方が長くなる条件
    const seen = new Set<number>();
    let budMs = 0;
    for (let t = 0; t < shortClose; t++) {
      const i = plantShotFrame(FR, t, shortClose, O, 90)!;
      seen.add(i);
      if (i === LAST) budMs++;
    }
    expect(seen.size).toBe(FR);                          // 0〜7が全部出る
    expect(budMs).toBeLessThan(shortClose * 0.7);        // 蕾だけの絵にならない
  });

  it('コマ番号は必ず範囲内', () => {
    for (let t = -50; t < C + O + 200; t += 3) {
      const i = plantShotFrame(FR, t);
      if (i !== null) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(FR); }
    }
  });

  it('1コマしか無い表は動かさない / 閉じ始めていなければ動かさない', () => {
    expect(plantShotFrame(1, 0)).toBeNull();
    expect(plantShotFrame(FR, null)).toBeNull();
    expect(plantShotFrame(FR, -1)).toBeNull();
  });
});

describe('★発射の時刻は従来と同じ(閉じ始めを前倒ししてある)', () => {
  it('閉じ始め + 閉じる尺 = 前の発射 + 発射間隔', () => {
    for (const interval of [2200, 1100, 600]) {
      expect(plantCloseStartAt(10_000, interval) + C).toBe(10_000 + interval);
    }
  });

  it('発射間隔が閉じる尺より短くても、閉じ始めが前の発射より前にならない', () => {
    expect(plantCloseStartAt(10_000, 100)).toBe(10_000);
  });

  it('閉じてから撃つのはプラントだけ(他の射手の拍を変えていない)', () => {
    expect(usesShotWindup('plant')).toBe(true);
    for (const t of ['giantbat', 'zombie', 'mimir', 'jormungand']) {
      expect(usesShotWindup(t), t).toBe(false);
    }
  });
});

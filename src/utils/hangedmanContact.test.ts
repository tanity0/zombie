// PACING_PUZZLE.md §14-4-3b: 使者(hangedman)の接触だけは「足元の円」(半径 HANGEDMAN_CONTACT_R)で判定する。
// 円の中心=使者の足元(x+w/2, y+h)、プレイヤー側の点=当たり箱(playerHitbox)の中心。距離 ≤ R で接触。
// 描画(pixiScene の紫の円)は同じ hangedmanContactCenter / HANGEDMAN_CONTACT_R を引く=判定と厳密一致。
import { describe, it, expect, beforeAll } from 'vitest';
import {
  checkPlayerEnemyCollisions, checkCollision, enemyContactBox, playerHitbox,
  HANGEDMAN_CONTACT_R, hangedmanContactCenter, hangedmanContactHit, hangedmanContactCircleLive,
} from './collisionUtils';
import { setEnemyArtAspect } from '../pixi/renderSpec';
import type { Enemy, EnemyType, Player } from '../types/game';

const foe = (type: EnemyType, over: Partial<Enemy> = {}): Enemy => ({
  id: `e-${type}`, type, x: 0, y: 0,
  width: type === 'hangedman' ? 46 : 32, height: type === 'hangedman' ? 92 : 32,
  health: 2000, maxHealth: 2000, speed: 100, damage: 999, lastShot: 0, lastHit: 0,
  ...over,
} as Enemy);

/** 当たり箱の中心が (cx, cy) に来るプレイヤー(28×28)。 */
const playerAt = (cx: number, cy: number): Player => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 } as Player);

describe('使者の接触=足元の円(§14-4-3b)', () => {
  const e = foe('hangedman', { x: 100, y: 200 });
  const c = hangedmanContactCenter(e);

  it('円の中心は使者の足元(当たり箱の下辺の中央)', () => {
    expect(c).toEqual({ x: 123, y: 292 });
  });

  it('境目: 距離 R ちょうどは当たる / R を少しでも超えたら当たらない(4方向とも)', () => {
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]]) {
      const inside = playerAt(c.x + ux * (HANGEDMAN_CONTACT_R - 0.01), c.y + uy * (HANGEDMAN_CONTACT_R - 0.01));
      const outside = playerAt(c.x + ux * (HANGEDMAN_CONTACT_R + 0.01), c.y + uy * (HANGEDMAN_CONTACT_R + 0.01));
      expect(hangedmanContactHit(inside, e)).toBe(true);
      expect(hangedmanContactHit(outside, e)).toBe(false);
      expect(checkPlayerEnemyCollisions(inside, [e])).toHaveLength(1);
      expect(checkPlayerEnemyCollisions(outside, [e])).toHaveLength(0);
    }
  });

  it('プレイヤー側の点は当たり箱の中心(箱の端が円に掛かっても、中心が外なら当たらない)', () => {
    const p = playerAt(c.x + HANGEDMAN_CONTACT_R + 5, c.y); // 当たり箱の左端は円の内側(半幅9.3>5)
    const hb = playerHitbox(p);
    expect(hb.x).toBeLessThan(c.x + HANGEDMAN_CONTACT_R);
    expect(checkPlayerEnemyCollisions(p, [e])).toHaveLength(0);
  });

  it('使者の体の上の方(胸・頭)に重なっても、足元の円の外なら当たらない(旧の四角なら当たっていた所)', () => {
    const p = playerAt(c.x, c.y - 60);
    expect(checkCollision(playerHitbox(p), enemyContactBox(e))).toBe(true); // 旧: 帯の四角には入っている
    expect(checkPlayerEnemyCollisions(p, [e])).toHaveLength(0);           // 新: 円の外=当たらない
  });

  it('死体は円でも当たらない', () => {
    const dead = foe('hangedman', { x: 100, y: 200, corpseUntil: 99999 });
    expect(checkPlayerEnemyCollisions(playerAt(c.x, c.y), [dead])).toHaveLength(0);
  });
});

describe('R の根拠: 旧の四角の横の届き(帯の幅/2 + 当たり箱の幅/2)と1px以内', () => {
  beforeAll(() => {
    // 実機で描画が登録する使者の絵(reaper2-hanged.png 31×128)の縦横比(texH/texW)。
    setEnemyArtAspect('default:hangedman', 128 / 31);
  });
  it('足元の高さで真横から近づいた時、四角が当たり始める距離と R の差は1px未満', () => {
    const e = foe('hangedman', { x: 100, y: 200 });
    const c = hangedmanContactCenter(e);
    const box = enemyContactBox(e);
    const hb = playerHitbox(playerAt(0, 0));
    const boxReachX = box.width / 2 + hb.width / 2;
    expect(Math.abs(boxReachX - HANGEDMAN_CONTACT_R)).toBeLessThan(1);
    // 四角の中心(横)は円の中心と同じ(足元の真上)。
    expect(Math.abs(box.x + box.width / 2 - c.x)).toBeLessThan(0.001);
  });
});

describe('他の敵は四角のまま', () => {
  it('ゾンビは帯の四角で判定し、円の式は使わない', () => {
    const z = foe('zombie', { x: 0, y: 0, damage: 10, health: 100, maxHealth: 100 });
    const box = enemyContactBox(z);
    // 四角の角の内側(中心からの距離は R より遠いが四角の中)=当たる
    const corner = playerAt(box.x + box.width + 9, box.y + 1);
    expect(checkCollision(playerHitbox(corner), box)).toBe(true);
    expect(checkPlayerEnemyCollisions(corner, [z])).toHaveLength(1);
    expect(hangedmanContactCircleLive(z, 0)).toBe(false);
  });
});

describe('円を出す条件(=いま触れたら当たる)', () => {
  it('生きている使者は出す / 死体・HP0・気絶中は出さない', () => {
    expect(hangedmanContactCircleLive(foe('hangedman'), 1000)).toBe(true);
    expect(hangedmanContactCircleLive(foe('hangedman', { corpseUntil: 5000 }), 1000)).toBe(false);
    expect(hangedmanContactCircleLive(foe('hangedman', { health: 0 }), 1000)).toBe(false);
    expect(hangedmanContactCircleLive(foe('hangedman', { stunUntil: 2000 }), 1000)).toBe(false);
    expect(hangedmanContactCircleLive(foe('hangedman', { stunUntil: 500 }), 1000)).toBe(true);
  });
});

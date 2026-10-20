// ステージ2の変異塊の代理(research/LAB_CRAWLER.md §4・第2版)の純関数のテスト。
import { describe, it, expect } from 'vitest';
import {
  CRAWLER_PROXY_ID, CRAWLER_PROXY_HP_PAD, crawlerProxyWanted, crawlerProxyHealth, crawlerProxyDamage, buildCrawlerProxy,
  syncCrawlerProxyInEnemies, crawlerDamageNumberAt, CRAWLER_DMG_NUMBER_EDGE_INSET_PX, CRAWLER_DMG_NUMBER_EDGE_SPREAD_PX,
  isCrawlerDamageNumber, crawlerCenterFxPoint, CRAWLER_FX_EDGE_INSET_PX,
  crawlerDmgNumberViewX, CRAWLER_DMG_NUMBER_HUD_LEFT_PX, CRAWLER_DMG_NUMBER_HUD_RIGHT_PX,
} from './labCrawlerProxy';
import { createLabCrawler, crawlerRect, applyCrawlerDamage, CRAWLER_HP } from '../world/labCrawler';
import { spawnEnemyAt, isBossType, countsTowardEnemyCap, resistsChipKnockback } from './enemyUtils';
import { usesPostureSystem } from './bossPosture';
import { isEngageableBoss } from './bossEngagement';
import { isPromotionExcluded } from './namedEnemy';
import { isMapTrackedEnemy } from './mapSightings';
import { enemyRangeRect, blastAnchorOf, bandHitsBox } from './enemyUtils';
import { isBoxInGroundFire } from './molotov';
import { enemyContactBox } from './collisionUtils';
import { enemyFootBox } from '../pixi/renderSpec';

const awake = () => ({ ...createLabCrawler({ x: 7000, y: 0 }), awake: true });

describe('変異塊の代理', () => {
  it('起きていて判定がある間だけ置く(待機中・昇天中・居ない時は置かない)', () => {
    expect(crawlerProxyWanted(null)).toBe(false);
    expect(crawlerProxyWanted(createLabCrawler({ x: 7000, y: 0 }))).toBe(false);
    expect(crawlerProxyWanted(awake())).toBe(true);
    expect(crawlerProxyWanted(applyCrawlerDamage(awake(), CRAWLER_HP, 0).next)).toBe(false);
  });

  it('箱=塊の当たり判定・体力=hp+下駄・前の記録(被弾の打刻)は残し、ノックバック・気絶は持たせない', () => {
    const c = awake();
    const prev = { ...buildCrawlerProxy(c), lastHit: 123, knockbackUntil: 999, stunUntil: 999, x: -1, health: 5 };
    const p = buildCrawlerProxy({ ...c, hp: 100 }, prev);
    const r = crawlerRect(c);
    expect([p.x, p.y, p.width, p.height]).toEqual([r.x, r.y, r.width, r.height]);
    expect(p.id).toBe(CRAWLER_PROXY_ID);
    expect(p.health).toBe(CRAWLER_PROXY_HP_PAD + 100);
    expect(p.lastHit).toBe(123);
    expect(p.knockbackUntil).toBeUndefined();
    expect(p.stunUntil).toBeUndefined();
  });

  it('減り=前に書いた体力との差(居ない・回復した時は0)', () => {
    const c = { ...awake(), hp: 1000 };
    expect(crawlerProxyDamage(c, { health: crawlerProxyHealth(c) - 250 })).toBe(250);
    expect(crawlerProxyDamage(c, { health: crawlerProxyHealth(c) + 50 })).toBe(0);
    expect(crawlerProxyDamage(c, undefined)).toBe(0);
  });

  it('敵配列への同期: 置く時は1体だけ、置かない時は外す、他の敵は触らない', () => {
    const z = { ...spawnEnemyAt('zombie', 0, 0, 0), id: 'z' };
    const a = syncCrawlerProxyInEnemies([z], awake());
    expect(a.map(e => e.id)).toEqual(['z', CRAWLER_PROXY_ID]);
    const b = syncCrawlerProxyInEnemies(a, awake());
    expect(b.filter(e => e.id === CRAWLER_PROXY_ID).length).toBe(1);
    const off = syncCrawlerProxyInEnemies(b, null);
    expect(off.map(e => e.id)).toEqual(['z']);
    const same = [z];
    expect(syncCrawlerProxyInEnemies(same, null)).toBe(same);
  });

  it('区分: ボス級(押されない・気絶しない)・体勢値なし・ボス戦に入らない・敵の数に入らない・宿敵にならない・地図に出ない', () => {
    const p = buildCrawlerProxy(awake());
    expect(isBossType(p.type)).toBe(true);
    expect(resistsChipKnockback(p.type)).toBe(true);
    expect(usesPostureSystem(p)).toBe(false);
    expect(isEngageableBoss(p.type)).toBe(false);
    expect(countsTowardEnemyCap(p)).toBe(false);
    expect(isPromotionExcluded(p.type, false)).toBe(true);
    expect(isMapTrackedEnemy(p)).toBe(false);
  });
});

describe('変異塊のダメージの数字の位置(描画だけ)', () => {
  it('x はプレイヤーに面した縁の内側 70〜160 でばらし、y は当たった高さを箱の中に収めて使う', () => {
    const c = awake();
    const r = crawlerRect(c);
    const cx = r.x + r.width / 2;
    const pRightX = r.x + r.width + 30, pY = r.y + r.height - 40;
    const a = crawlerDamageNumberAt(cx, r.y + 100, c, pRightX, pY, 0);
    const b = crawlerDamageNumberAt(cx, r.y + 100, c, pRightX, pY, 1);
    expect(a.x).toBe(r.x + r.width - CRAWLER_DMG_NUMBER_EDGE_INSET_PX);
    expect(b.x).toBe(r.x + r.width - CRAWLER_DMG_NUMBER_EDGE_INSET_PX - CRAWLER_DMG_NUMBER_EDGE_SPREAD_PX);
    expect(a.y).toBe(r.y + 100); // 当たった高さ
    expect(crawlerDamageNumberAt(cx, r.y - 500, c, pRightX, pY, 0).y).toBeGreaterThanOrEqual(r.y); // 箱の中へ収める
    const left = crawlerDamageNumberAt(cx, r.y + 100, c, r.x - 30, pY, 0);
    expect(left.x).toBe(r.x + CRAWLER_DMG_NUMBER_EDGE_INSET_PX);
    // プレイヤーの真上(箱の上下に居る)に重なる時は塊の中心側へずらす
    const above = crawlerDamageNumberAt(r.x + 200, r.y + 100, c, r.x + 200, r.y + r.height + 30, 0);
    expect(Math.abs(above.x - (r.x + 200))).toBeGreaterThanOrEqual(40 - 1e-9);
    expect(crawlerDamageNumberAt(cx, r.y, null, 0, 0)).toEqual({ x: cx, y: r.y });
  });

  it('x は見えている範囲から HUD の帯を除いた内側に収める(引きのズームでは帯もワールドで広がる)', () => {
    const c = awake();
    const r = crawlerRect(c);
    const view1 = crawlerDmgNumberViewX({ x: 0 }, { width: 400 }, 1);
    expect(view1).toEqual({ left: CRAWLER_DMG_NUMBER_HUD_LEFT_PX, right: 400 - CRAWLER_DMG_NUMBER_HUD_RIGHT_PX });
    const view05 = crawlerDmgNumberViewX({ x: 0 }, { width: 400 }, 0.5);
    expect(view05.left).toBe(200 - 400 + CRAWLER_DMG_NUMBER_HUD_LEFT_PX * 2);
    expect(view05.right).toBe(200 + 400 - CRAWLER_DMG_NUMBER_HUD_RIGHT_PX * 2);
    // 面した縁の内側が画面の右の HUD の下に潜る時は、帯の内側へ寄せる
    const pRightX = r.x + r.width + 30, pY = r.y + r.height - 40;
    const v = { left: r.x + r.width - 400, right: r.x + r.width - 120 };
    const q = crawlerDamageNumberAt(r.x + r.width / 2, r.y + 100, c, pRightX, pY, 0, v);
    expect(q.x).toBeLessThanOrEqual(v.right);
    expect(q.x).toBeGreaterThanOrEqual(v.left);
    // view を渡さなければ従来どおり
    expect(crawlerDamageNumberAt(r.x + r.width / 2, r.y + 100, c, pRightX, pY, 0).x).toBe(r.x + r.width - CRAWLER_DMG_NUMBER_EDGE_INSET_PX);
  });

  it('寄せるのは代理に当たった数字だけ(enemyId で判定。無い経路は代理の箱の中心の x・上辺/中心の数字だけ)', () => {
    const c = awake();
    const r = crawlerRect(c);
    const cx = r.x + r.width / 2;
    expect(isCrawlerDamageNumber(cx, r.y, c, CRAWLER_PROXY_ID)).toBe(true);
    expect(isCrawlerDamageNumber(cx, r.y, c, 'zombie-1')).toBe(false); // 箱の中に居る別の雑魚の数字は寄せない
    expect(isCrawlerDamageNumber(cx, r.y, c, undefined)).toBe(true);
    expect(isCrawlerDamageNumber(cx, r.y + r.height / 2, c, undefined)).toBe(true);
    expect(isCrawlerDamageNumber(cx + 40, r.y + 60, c, undefined)).toBe(false);
    expect(isCrawlerDamageNumber(cx, r.y, createLabCrawler({ x: 7000, y: 0 }), CRAWLER_PROXY_ID)).toBe(false); // 待機中(代理なし)
  });
});

describe('変異塊の代理: 当たった手応えの絵・爆発の点(品質監査A2/A3)', () => {
  it('代理の箱の中心に出された絵だけ、プレイヤーに面した縁の内側(プレイヤーの高さ)へ寄せる', () => {
    const c = awake();
    const r = crawlerRect(c);
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const q = crawlerCenterFxPoint(cx, cy, c, r.x + r.width + 20, r.y + 200)!;
    expect(q.x).toBe(r.x + r.width - CRAWLER_FX_EDGE_INSET_PX);
    expect(q.y).toBe(r.y + 200);
    expect(crawlerCenterFxPoint(cx + 10, cy, c, 0, 0)).toBeNull();
    expect(crawlerCenterFxPoint(cx, cy, null, 0, 0)).toBeNull();
  });
  it('爆発の巻き込みは、代理だけ箱の中で爆心に一番近い点で測る(縁で起きた爆発が届く)。他の敵は中心のまま', () => {
    const p = buildCrawlerProxy(awake());
    const bx = p.x + p.width + 30, by = p.y + p.height / 2;
    const a = blastAnchorOf(p, bx, by);
    expect(a).toEqual({ x: p.x + p.width, y: by });
    expect(Math.hypot(a.x - bx, a.y - by)).toBe(30);
    const z = { ...spawnEnemyAt('zombie', 100, 100, 0) };
    expect(blastAnchorOf(z, 0, 0)).toEqual({ x: z.x + z.width / 2, y: z.y + z.height / 2 });
  });
  it('床(延焼弾・火炎瓶・血の棘)は箱で測る: 縁に掛かった火は代理に届き、離れた火は届かない(品質監査2巡目A-1)', () => {
    const p = buildCrawlerProxy(awake());
    const edgeFire = { x: p.x + p.width + 40, y: p.y + p.height / 2, radius: 50 };
    const farFire = { x: p.x + p.width + 80, y: p.y + p.height / 2, radius: 50 };
    expect(isBoxInGroundFire(p, [edgeFire])).toBe(true);
    expect(isBoxInGroundFire(p, [farFire])).toBe(false);
    // 中心で測ると縁の火は届かない(=箱で測る意味)
    expect(Math.hypot(edgeFire.x - (p.x + p.width / 2), edgeFire.y - (p.y + p.height / 2))).toBeGreaterThan(edgeFire.radius);
    expect(isBoxInGroundFire(p, [farFire], 50, 2)).toBe(true); // 半径の倍率も効く
  });
  it('線の攻撃(帯)は箱に掛かるかで測る: 縁をかすめる帯は当たり、外れる帯は当たらない(品質監査2巡目A-2)', () => {
    const p = buildCrawlerProxy(awake());
    const x0 = p.x + p.width + 200, y0 = p.y + p.height / 2;
    expect(bandHitsBox(x0, y0, -1, 0, 260, 10, p)).toBe(true); // 左へ伸びて縁に届く
    expect(bandHitsBox(x0, y0, -1, 0, 150, 10, p)).toBe(false); // 届かない長さ
    expect(bandHitsBox(x0, p.y - 30, -1, 0, 400, 10, p)).toBe(false); // 箱の上を通る(半幅より離れている)
    expect(bandHitsBox(x0, p.y - 8, -1, 0, 400, 10, p)).toBe(true); // 半幅の内で上縁をかすめる
  });
});

describe('変異塊の代理: 当たる範囲=塊の箱そのもの(見たまま当たる)', () => {
  it('弾の当たり(enemyContactBox)・近接/銃の届き(enemyRangeRect)・足元の箱(PHILLの頭の領域・照準)が箱からはみ出さない', () => {
    const c = awake();
    const p = buildCrawlerProxy(c);
    const r = crawlerRect(c);
    const box = { x: r.x, y: r.y, width: r.width, height: r.height };
    expect(enemyContactBox(p)).toEqual(box);
    expect(enemyRangeRect(p)).toEqual(box);
    const fb = enemyFootBox(p);
    expect(fb.boxW).toBeCloseTo(r.width);
    expect(fb.boxH).toBeCloseTo(r.height);
  });
});

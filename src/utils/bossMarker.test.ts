import { describe, it, expect } from 'vitest';
import { isMarkedBoss, isEngagedBoss, isMarkedBossVisible, BOUNTY_MARK_MAX_DIST_PX, BOSS_ENGAGE_GRACE_MS, projectToEdge, bossMarkFor, type MarkBox } from './bossMarker';
import type { Enemy } from '../types/game';

const BOX: MarkBox = { w: 400, h: 300, marginX: 26, marginTop: 60, marginBottom: 30 };
const CENTER = { x: 200, y: 150 };
const mk = (t: string, extra: Partial<Enemy> = {}) =>
  ({ type: t as Enemy['type'], ...extra }) as Pick<Enemy, 'type' | 'isStoryBoss'>;

describe('誰にマークを出すか(「ボス交戦中」の定義)', () => {
  it('裏ボス・天使・idol(=一騎打ちのボス)には出す', () => {
    for (const t of ['mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol']) {
      expect(isMarkedBoss(mk(t)), t).toBe(true);
    }
  });
  it('ストーリーボス(グレン/未確認変異体)は個体フラグで拾う', () => {
    expect(isMarkedBoss(mk('giantbat', { isStoryBoss: true }))).toBe(true);
  });
  it('★城ボス・雑魚の格上・雑魚には出さない(既存マーカーと2重にしない)', () => {
    expect(isMarkedBoss(mk('giantbat'))).toBe(false);  // 城マーカー(bossSpawned=赤)が既に指している
    expect(isMarkedBoss(mk('hunter'))).toBe(false);     // 「検知された時だけ」の赤矢印が既にある
    expect(isMarkedBoss(mk('pumpkin'))).toBe(false);    // 同時に複数湧く=画面端が渋滞する
    expect(isMarkedBoss(mk('zombie'))).toBe(false);
  });

  // PACING_PUZZLE.md §6.38 B1.5-5(賞金首): 4型もマーク対象に追加。
  it('賞金首4型にはマークを出す', () => {
    for (const t of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko']) {
      expect(isMarkedBoss(mk(t)), t).toBe(true);
    }
  });
});

describe('isMarkedBossVisible(§6.38 B1.5-5・賞金首だけ有効距離1200pxのゲートを追加で通す)', () => {
  const NOW = 1_000_000;
  const mkFull = (t: string, extra: Partial<Enemy> = {}): Pick<Enemy, 'type' | 'isStoryBoss' | 'bossState' | 'lastHit' | 'x' | 'y' | 'width' | 'height'> =>
    ({ type: t as Enemy['type'], bossState: 'chase' as Enemy['bossState'], lastHit: NOW, x: 0, y: 0, width: 10, height: 10, ...extra });

  it('賞金首: 1200px以内なら出る・超えると出ない', () => {
    expect(isMarkedBossVisible(mkFull('bounty-ranged', { x: BOUNTY_MARK_MAX_DIST_PX - 10, y: 0 }), NOW, 0, 0)).toBe(true);
    expect(isMarkedBossVisible(mkFull('bounty-ranged', { x: BOUNTY_MARK_MAX_DIST_PX + 10, y: 0 }), NOW, 0, 0)).toBe(false);
  });

  it('賞金首以外(裏ボス等)には距離ゲートが掛からない(遠くても出る)', () => {
    expect(isMarkedBossVisible(mkFull('mimir', { x: 999999, y: 0 }), NOW, 0, 0)).toBe(true);
  });

  it('交戦中でなければ距離に関わらず出ない(isEngagedBossが先に効く)', () => {
    expect(isMarkedBossVisible(mkFull('bounty-ranged', { bossState: 'return' as Enemy['bossState'], lastHit: 0, x: 0, y: 0 }), NOW, 0, 0)).toBe(false);
  });

  it('マーク対象外の型(雑魚)は常に出ない', () => {
    expect(isMarkedBossVisible(mkFull('zombie'), NOW, 0, 0)).toBe(false);
  });
});

describe('交戦中だけ出す(社長指示v0.25.2658「画面外のボスマークはボスと交戦中だけね」)', () => {
  const NOW = 1_000_000;
  const eng = (bossState: string | undefined, lastHit: number) =>
    isEngagedBoss({ bossState: bossState as Enemy['bossState'], lastHit }, NOW);

  it('帰巣/離脱中でなければ交戦中(追ってきている)', () => {
    expect(eng('chase', 0)).toBe(true);
    expect(eng('issen-windup', 0)).toBe(true);
    expect(eng(undefined, 0)).toBe(true); // 状態機械を持たない経路(グレン等)は常に交戦中
  });

  it('★帰巣中(return)でも、直近に殴っていれば交戦中のまま', () => {
    // 裏ボスはズーム後の画面外が3秒続くと return へ落ちる=マークを出したい状況と重なる。
    // ここで切ると「帰巣開始と同時にマークも消える」=道具にならない。
    expect(eng('return', NOW - 1)).toBe(true);
    expect(eng('return', NOW - BOSS_ENGAGE_GRACE_MS)).toBe(true);
  });

  it('帰巣中 + 殴り合いが猶予を超えて途切れた = 交戦中ではない(巣を指す矢印が残らない)', () => {
    expect(eng('return', NOW - BOSS_ENGAGE_GRACE_MS - 1)).toBe(false);
    expect(eng('return', 0)).toBe(false); // 一度も殴っていない(lastHitの初期値0)
  });
});

describe('画面の縁への投影', () => {
  it('真右は右の余白の内側で止まる', () => {
    expect(projectToEdge(0, CENTER.x, CENTER.y, BOX)).toEqual({ x: 400 - 26, y: 150 });
  });
  it('真上は marginTop(HUD/ノッチ避け)で止まる=画面の上端まで行かない', () => {
    const p = projectToEdge(-Math.PI / 2, CENTER.x, CENTER.y, BOX);
    expect(p?.y).toBeCloseTo(60, 6);
    expect(p?.x).toBeCloseTo(200, 6);
  });
  it('真下は marginBottom で止まる', () => {
    const p = projectToEdge(Math.PI / 2, CENTER.x, CENTER.y, BOX);
    expect(p?.y).toBeCloseTo(300 - 30, 6);
  });
  it('★前方に縁が無い時は null(後ろ向きの点を返さない)', () => {
    // 中心が上の余白より上に居る(極端に低い画面)+さらに上を向く=前方に縁が無い。
    const p = projectToEdge(-Math.PI / 2, 200, 40, BOX);
    expect(p).toBeNull();
  });
});

describe('ボス1体ぶんのマーク', () => {
  const player = { x: 1000, y: 1000 };
  // 等倍・シェイクなし = origin は -camera(player が画面中心(200,150)に来る)。
  const view = { zoom: 1, originX: -800, originY: -850 };

  it('画面外なら縁+矢印の向き。距離は**中心↔中心**(AIの距離帯と同じ測り方)', () => {
    const m = bossMarkFor({
      boss: { x: 1600, y: 960, width: 80, height: 80 },  // 中心(1640,1000)=真右へ640px
      playerCenter: player, view, center: CENTER, box: BOX,
    });
    expect(m).not.toBeNull();
    expect(m?.offscreen).toBe(true);
    expect(m?.distPx).toBe(640);
    expect(m?.x).toBeCloseTo(400 - 26, 6); // 右の縁
    expect(m?.angle).toBeCloseTo(0, 6);
  });

  it('画面内なら offscreen=false で、置き場所は**当たり帯の上端**(頭上)', () => {
    const m = bossMarkFor({
      boss: { x: 1040, y: 980, width: 40, height: 40 },  // 中心(1060,1000)=右へ60px
      playerCenter: player, view, center: CENTER, box: BOX,
    });
    expect(m?.offscreen).toBe(false);
    expect(m?.distPx).toBe(60);
    expect(m?.x).toBeCloseTo(1060 - 800, 6);
    expect(m?.y).toBeCloseTo(980 - 850, 6); // boss.y(帯の上端)
  });

  it('距離はカメラ/ズームに依らない(ワールド距離)=引き/寄りで数字が動かない', () => {
    const boss = { x: 1300, y: 960, width: 80, height: 80 };
    const a = bossMarkFor({ boss, playerCenter: player, view, center: CENTER, box: BOX });
    const b = bossMarkFor({
      boss, playerCenter: player,
      view: { zoom: 0.7, originX: 60, originY: 45 }, center: CENTER, box: BOX,
    });
    expect(a?.distPx).toBe(b?.distPx);
  });

  it('★ズームで引いている時(ボス戦=0.7)は、まだ見えているボスを「画面外」にしない', () => {
    // 中心(1240,1000): 等倍なら画面X=440=画面外(w=400)だが、0.7で引くと可視域は1/0.7倍あり
    // 実際の画面X = origin + world×zoom = 508 - 1240×0.7 = 508-868 → …となるよう origin を組む。
    // origin は「プレイヤーが画面中心に来る」条件から: originX = 200 - 1000×0.7 = -500。
    const view07 = { zoom: 0.7, originX: 200 - 1000 * 0.7, originY: 150 - 1000 * 0.7 };
    const boss = { x: 1200, y: 980, width: 80, height: 40 }; // 中心(1240,1000)=右へ240px
    const zoomed = bossMarkFor({ boss, playerCenter: player, view: view07, center: CENTER, box: BOX });
    expect(zoomed?.offscreen).toBe(false);            // 240×0.7=168px右 → 画面内(368<400)
    // 同じ位置でも等倍なら画面外(440>400)。ズームを見落とすとここが false→true にひっくり返る。
    const plain = bossMarkFor({ boss, playerCenter: player, view, center: CENTER, box: BOX });
    expect(plain?.offscreen).toBe(true);
  });
});

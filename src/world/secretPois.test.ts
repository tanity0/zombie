import { describe, expect, it } from 'vitest';
import {
  secretPoisForStage, ALL_SECRET_POI_DEFS, SECRET_MIN_DIST, secretPoiTouchedBy, secretPoiRect, secretSepiaMult,
  SECRET_COLOR_LEAD_PX, secretPoiDefsForStage, isNearSecretPoi, SECRET_RELAX_DIST, secretChroniclePhrase, excludeNearSecretPois, secretEjectDir,
} from './secretPois';
import { bossLairPos } from './pois';
import { REAPER_CONFIG } from '../config/reaper';

// research/HIDDEN_POI.md。
describe('隠しPOI', () => {
  const stages = [['stage-1', 'mimir', 7], ['stage-3', 'jormungand', 7], ['stage-4', 'skadi', 8], ['stage-5', 'thor', 8]] as const;

  it('ステージ1・3・4・5に 7/7/8/8 個・30個すべて別の絵・他のステージには無い', () => {
    const all = stages.flatMap(([s]) => secretPoisForStage(s));
    for (const [s, , n] of stages) expect(secretPoisForStage(s)).toHaveLength(n);
    expect(new Set(all.map(p => p.id)).size).toBe(30);
    expect(ALL_SECRET_POI_DEFS).toHaveLength(30);
    for (const s of ['stage-2', 'stage-6', 'ex1', 'tutorial']) expect(secretPoisForStage(s)).toEqual([]);
  });

  it('全部が深層域の中(ゲート2の囲いより奥)・死神のリスク蓄積より手前・裏ボスの巣から離れている', () => {
    for (const [s, boss] of stages) {
      const lair = bossLairPos(boss)!;
      for (const p of secretPoisForStage(s)) {
        const d = Math.hypot(p.x, p.y);
        expect(d).toBeGreaterThan(SECRET_MIN_DIST + 300);
        expect(d).toBeLessThan(REAPER_CONFIG.spawnRiskDepthPx);
        // 裏ボスの出現範囲(2250)には入らない。
        expect(Math.hypot(p.x - lair.x, p.y - lair.y)).toBeGreaterThan(2250 + 100);
      }
    }
  });

  it('正面(下)から触れた時だけ発見・横や離れた所では発見しない', () => {
    const [p] = secretPoisForStage('stage-1');
    const r = secretPoiRect(p);
    const below = { x: p.x - 14, y: r.y + r.height, width: 28, height: 28 };
    expect(secretPoiTouchedBy(below, [p])?.id).toBe(p.id);
    const side = { x: r.x - 28, y: r.y, width: 28, height: 28 };
    expect(secretPoiTouchedBy(side, [p])).toBeNull();
    expect(secretPoiTouchedBy({ ...below, y: below.y + 200 }, [p])).toBeNull();
  });

  it('セピアは画面に入ると抜けて(0)、画面の縁の外へ離れると戻る(1)・間はなめらか', () => {
    expect(secretSepiaMult(0)).toBe(0);
    expect(secretSepiaMult(SECRET_COLOR_LEAD_PX + 1)).toBe(1);
    const mid = secretSepiaMult(SECRET_COLOR_LEAD_PX / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(secretSepiaMult(Infinity)).toBe(1);
  });

  it('各ステージの1個目は巣へ向かう道筋の脇の浅い所(最初の1個で「色が戻る」を覚えさせる)', () => {
    for (const [s, boss] of stages) {
      const [first] = secretPoisForStage(s);
      const lair = bossLairPos(boss)!;
      const angle = Math.abs(Math.atan2(first.y, first.x) - Math.atan2(lair.y, lair.x)) % (2 * Math.PI);
      expect(Math.min(angle, 2 * Math.PI - angle)).toBeLessThan((16 * Math.PI) / 180);
      expect(Math.hypot(first.x, first.y)).toBeLessThan(12500);
    }
  });

  it('置き場所が等間隔の格子になっていない(隣どうしの角度の差が揃わない)', () => {
    for (const [s] of stages) {
      const ang = secretPoisForStage(s).map(p => Math.atan2(p.y, p.x));
      const gaps = ang.slice(1).map((a, i) => Math.round(((a - ang[i] + 4 * Math.PI) % (2 * Math.PI)) * 180 / Math.PI));
      expect(new Set(gaps).size).toBeGreaterThan(2);
      expect(secretPoiDefsForStage(s)).toHaveLength(ang.length);
    }
  });
});

// 社長指示2026-11-04「このPOIの近くは敵の湧きも強制リラックスに」。
describe('隠しPOIの近くの強制リラックス', () => {
  it('近く(SECRET_RELAX_DIST 以内)だけ真', () => {
    const p = { x: 1000, y: 2000 };
    expect(isNearSecretPoi(1000, 2000 + SECRET_RELAX_DIST - 1, [p])).toBe(true);
    expect(isNearSecretPoi(1000, 2000 + SECRET_RELAX_DIST + 1, [p])).toBe(false);
    expect(isNearSecretPoi(0, 0, [])).toBe(false);
  });
});

describe('隠しPOIの名前と年表の文', () => {
  it('名前は30個とも別・帯を危険の赤にする語を含まない・年表の文は動詞で助詞が変わる', () => {
    const names = ALL_SECRET_POI_DEFS.map(d => d.name);
    expect(new Set(names).size).toBe(30);
    for (const n of names) expect(/危険|デンジャー|汚染|深層|検知|成功|達成|救難|凌いだ|蹄の音/.test(n)).toBe(false);
    const byId = (id: string) => ALL_SECRET_POI_DEFS.find(d => d.id === id)!;
    expect(secretChroniclePhrase(byId('secret-08'))).toBe('七号観測室に足を踏み入れた');
    expect(secretChroniclePhrase(byId('secret-04'))).toBe('喰われた獣を見つけた');
  });
});

// 社長指示2026-11-04「このPOIは英雄たちのルートにも入らない」。
describe('英雄たち(変異体の巡回)のルートに入らない', () => {
  it('隠れ処そのものと、その近くの点は巡回先の候補から外れる', () => {
    const secrets = secretPoisForStage('stage-1');
    const near = { x: secrets[0].x + 300, y: secrets[0].y };
    const far = { x: 0, y: 9000 };
    expect(excludeNearSecretPois([secrets[0], near, far, null], secrets)).toEqual([far]);
  });
  it('今の巡回先の候補(裏ボスの巣)は、どのステージでも外されない=隠れ処から十分離れている', () => {
    for (const [s, boss] of [['stage-1', 'mimir'], ['stage-3', 'jormungand'], ['stage-4', 'skadi'], ['stage-5', 'thor']] as const) {
      const lair = bossLairPos(boss)!;
      expect(excludeNearSecretPois([lair], secretPoisForStage(s))).toHaveLength(1);
    }
  });
});

describe('ボス戦明けの弾き出しの向き', () => {
  it('土台に重なっていれば中心から外向き・重なっていなければ null', () => {
    const p = { x: 0, y: 0 };
    const r = secretPoiRect(p);
    const right = secretEjectDir({ x: r.x + r.width - 10, y: r.y + 4, width: 28, height: 28 }, [p])!;
    expect(right.dx).toBeGreaterThan(0);
    expect(secretEjectDir({ x: 500, y: 500, width: 28, height: 28 }, [p])).toBeNull();
  });
});

// ランダムに置く物どうしを重ねすぎない(research/PROP_OVERLAP.md §4 受け入れ条件)。
// ステージ 1/2/3/4/5/7 の ±4000 を数える。
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import type { Rect } from './obstacles';
import { treesInRegion, treeArtRect, trunkRect, setTreesDisabled } from './trees';
import { cityPropsInRegion, cityPropArtRect, cityPropRect, STAGE_PROPS, setCityPropsDisabled } from './cityProps';
import { torchesInRegion, torchArtRect, torchRect, setTorchesDisabled, TORCH_RELAX_BONUS } from './torches';
import { forestFlowersInRegion, flowerArtRect, setFlowersDisabled } from './forestDecor';
import { puddlesInRegion } from './weatherPuddles';
import {
  labWallsInRegionRaw, labPropsInRegionRaw, labWallArtRect, labPropArtRect, wallRect, propRect, LAB_ZONE,
} from './labWalls';
import { setPoiClearings, poiBuildingArtRects } from './poiClearings';
import {
  artOverlapRatio, collisionGap, beginPropPlacementSortie, setHandPlacedAnchors, hitsAnchor,
  MAX_ART_OVERLAP, MIN_COLLISION_GAP, type HandPlacedAnchor,
} from './propPlacement';
import { markObstacleDestroyed, clearDestroyedObstacles } from './destructibles';
import { STAGE1_TREE_SKIN, STAGE3_TREE_SKIN, STAGE4_TREE_SKIN } from './artRects';

const R = 4000;

type Layer = 'tree' | 'prop' | 'torch' | 'flower' | 'puddle' | 'labWall' | 'labCover' | 'labProp';
interface Item { id: string; layer: Layer; art: Rect; col: Rect | null; fixed: boolean; cell: string }

interface StageCfg { far: string; lab?: boolean; trees: boolean; flowers?: boolean; puddles?: boolean; treeSkin?: string }
const STAGES: Record<string, StageCfg> = {
  'stage-1': { far: '', trees: true, flowers: true, puddles: true, treeSkin: STAGE1_TREE_SKIN }, // 葉付きの3本(2026-11-21)
  'stage-2': { far: '', lab: true, trees: false },
  'stage-3': { far: 'city', trees: true, treeSkin: STAGE3_TREE_SKIN }, // 葉付きの3本(2026-11-21)
  'stage-4': { far: 'snow', trees: true, treeSkin: STAGE4_TREE_SKIN }, // 雪の針葉樹3本(2026-11-21)
  'stage-5': { far: 'stage5', trees: false },
  'stage-7': { far: 'stage7', trees: true, treeSkin: STAGE1_TREE_SKIN }, // ステージ1と同じ3本(2026-11-21)
};
// 決まりを入れる前(v0.25.5695)の ±4000 の数(同じ数え方)。置き物の数は 85% 以上残ること(§4)。
const BEFORE: Record<string, Record<string, number>> = {
  'stage-1': { tree: 476, torch: 154, flower: 724, puddle: 618 },
  'stage-2': { labProp: 69 },
  'stage-3': { tree: 476, prop: 559, torch: 154 },
  'stage-4': { tree: 476, prop: 295, torch: 154 },
  'stage-5': { prop: 877, torch: 154 },
  'stage-7': { tree: 476, torch: 154 },
};
// 木の絵を大きくした分の減り(決まりの劣化ではなく、避ける相手の絵が大きくなった分)。残る割合の下限をここだけ下げる。
// ステージ1の水たまり: 葉付きの3本(2026-11-21・枯れ木の約1.4倍の高さ・幅も広い)の絵の範囲を避けるので 618→464(75%)。
const MIN_KEEP: Record<string, Record<string, number>> = {
  'stage-1': { puddle: 0.72 },
};

// 手置きの物(テスト用の代表配置): POI 3つ・拠点4つ・城・裏ボスの巣。
const POIS = [{ x: 2400, y: -1800 }, { x: -2600, y: 1500 }, { x: 600, y: 3100 }];
const ANCHORS: HandPlacedAnchor[] = [
  { kind: 'circle', x: 3000, y: 0, r: 130 }, { kind: 'circle', x: -3000, y: 0, r: 130 },
  { kind: 'circle', x: 0, y: 2600, r: 130 }, { kind: 'circle', x: 0, y: -2600, r: 130 },
  { kind: 'rect', rect: { x: 1100 - 105, y: 900 + 38 - 190, width: 210, height: 190 } }, // 城
  { kind: 'circle', x: -3700, y: -3500, r: 130 }, // 裏ボスの巣
];

const setup = (stageId: string, withAnchors: boolean) => {
  const c = STAGES[stageId];
  setTreesDisabled(!c.trees);
  setTorchesDisabled(!!c.lab);
  setFlowersDisabled(false);
  setCityPropsDisabled(false);
  setPoiClearings(withAnchors ? POIS : []);
  setHandPlacedAnchors(withAnchors ? ANCHORS : []);
  beginPropPlacementSortie(c.far, c.treeSkin ?? c.far);
};

const collect = (stageId: string, minX = -R, minY = -R, maxX = R, maxY = R, torchBonus = TORCH_RELAX_BONUS): Item[] => {
  const c = STAGES[stageId];
  const within = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const out: Item[] = [];
  if (c.lab) {
    for (const w of labWallsInRegionRaw(minX, minY, maxX, maxY)) {
      if (!within(w.footX, w.footY)) continue;
      out.push({ id: w.id, layer: 'labWall', art: labWallArtRect(w), col: wallRect(w), fixed: true, cell: w.id.split('-')[1] });
    }
    for (const p of labPropsInRegionRaw(minX, minY, maxX, maxY)) {
      if (!within(p.footX, p.footY)) continue;
      const cover = p.id.startsWith('lpc-');
      out.push({ id: p.id, layer: cover ? 'labCover' : 'labProp', art: labPropArtRect(p), col: propRect(p), fixed: cover, cell: '' });
    }
    return out;
  }
  for (const t of treesInRegion(minX - 300, minY - 300, maxX, maxY)) {
    if (within(t.footX, t.footY)) out.push({ id: t.key, layer: 'tree', art: treeArtRect(t, c.treeSkin ?? c.far), col: trunkRect(t), fixed: false, cell: '' });
  }
  const defs = STAGE_PROPS[c.far];
  if (defs) {
    for (const p of cityPropsInRegion(c.far, minX, minY, maxX, maxY)) {
      if (!within(p.footX, p.footY) || defs[p.variant].decal) continue; // 地面のデカールは対象外(§2 監査A3)
      out.push({ id: p.id, layer: 'prop', art: cityPropArtRect(c.far, p)!, col: cityPropRect(c.far, p), fixed: false, cell: '' });
    }
  }
  for (const t of torchesInRegion(minX - 500, minY - 500, maxX, maxY, torchBonus)) {
    if (within(t.footX, t.footY)) out.push({ id: t.id, layer: 'torch', art: torchArtRect(t, c.far), col: torchRect(t), fixed: false, cell: '' });
  }
  if (c.flowers) {
    for (const f of forestFlowersInRegion(stageId, minX, minY, maxX, maxY)) {
      if (within(f.footX, f.footY)) out.push({ id: f.id, layer: 'flower', art: flowerArtRect(f), col: null, fixed: false, cell: '' });
    }
  }
  if (c.puddles) {
    for (const p of puddlesInRegion(minX, minY, maxX, maxY, { stageId })) {
      if (within(p.x, p.y)) out.push({ id: p.id, layer: 'puddle', art: { x: p.x - p.rx, y: p.y - p.ry, width: p.rx * 2, height: p.ry * 2 }, col: null, fixed: false, cell: '' });
    }
  }
  return out;
};

/** 絵が交わり得る距離(判定の隙間ぶん広げた絵の矩形が交わる)にある組を、格子で拾って数える。 */
const pairsNear = (items: Item[], fn: (a: Item, b: Item) => void) => {
  const G = 400;
  const grid = new Map<string, Item[]>();
  for (const it of items) {
    const k = `${Math.floor(it.art.x / G)},${Math.floor(it.art.y / G)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(it);
  }
  const pad = MIN_COLLISION_GAP;
  const near = (a: Rect, b: Rect) => a.x - pad < b.x + b.width && a.x + a.width + pad > b.x && a.y - pad < b.y + b.height && a.y + a.height + pad > b.y;
  for (const [k, list] of grid) {
    const [gx, gy] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get(`${gx + dx},${gy + dy}`);
        if (!other) continue;
        for (const a of list) for (const b of other) if (a.id < b.id && near(a.art, b.art)) fn(a, b);
      }
    }
  }
};

interface Report { counts: Record<string, number>; sameLayerNear: number; sameLayerOver: number; crossOver: number; gapBad: number; examples: string[] }
const audit = (items: Item[]): Report => {
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.layer] = (counts[it.layer] ?? 0) + 1;
  const rep: Report = { counts, sameLayerNear: 0, sameLayerOver: 0, crossOver: 0, gapBad: 0, examples: [] };
  pairsNear(items, (a, b) => {
    if (a.fixed && b.fixed) return; // 固定の層どうし(研究所の壁・遮蔽)は数えの対象外(§2 監査2巡目A)
    const same = a.layer === b.layer;
    if (same) rep.sameLayerNear++;
    if (artOverlapRatio(a.art, b.art) > MAX_ART_OVERLAP) {
      if (same) rep.sameLayerOver++; else { rep.crossOver++; if (rep.examples.length < 5) rep.examples.push(`${a.id}~${b.id}`); }
    }
    if (a.col && b.col && collisionGap(a.col, b.col) < MIN_COLLISION_GAP) {
      rep.gapBad++;
      if (rep.examples.length < 10) rep.examples.push(`gap ${a.id}~${b.id} ${collisionGap(a.col, b.col).toFixed(1)}`);
    }
  });
  return rep;
};

const reports: Record<string, Report> = {};

afterEach(() => { clearDestroyedObstacles(); });
afterAll(() => {
  setTreesDisabled(false); setTorchesDisabled(false); setFlowersDisabled(false); setCityPropsDisabled(false);
  setPoiClearings([]); setHandPlacedAnchors([]); beginPropPlacementSortie('');
  // 数の報告(テストの出力に残す)
  for (const [k, r] of Object.entries(reports)) {
    console.log(`[propOverlap] ${k} counts=${JSON.stringify(r.counts)} sameLayerOver=${r.sameLayerOver}/${r.sameLayerNear} crossOver=${r.crossOver} gapBad=${r.gapBad}`);
  }
});

describe('置き物どうしを重ねすぎない(research/PROP_OVERLAP.md §4)', () => {
  for (const stageId of Object.keys(STAGES)) {
    describe(stageId, () => {
      it('絵の重なり率 0.25 超の組: 別の層は0・同じ層は交わり得る組の2%以下/判定の隙間 28px 未満が0', () => {
        setup(stageId, true);
        const r = audit(collect(stageId));
        reports[`${stageId}(手置きあり)`] = r;
        expect(r.crossOver, r.examples.join(' ')).toBe(0);
        expect(r.gapBad, r.examples.join(' ')).toBe(0);
        expect(r.sameLayerOver).toBeLessThanOrEqual(Math.max(0, r.sameLayerNear * 0.02));
      });

      it('置き物の数はステージごとに 85% 以上残る(手置きなしで前と同じ数え方)', () => {
        setup(stageId, false);
        const items = collect(stageId, -R, -R, R, R, 0);
        const r = audit(items);
        reports[`${stageId}(数)`] = r;
        for (const [layer, before] of Object.entries(BEFORE[stageId])) {
          expect(r.counts[layer] ?? 0, `${layer}`).toBeGreaterThanOrEqual(Math.floor(before * (MIN_KEEP[stageId]?.[layer] ?? 0.85)));
        }
      });

      it('手置きの物(拠点・POI の建物の絵・城・ボスの場所)に木・置物・松明・花が掛からない', () => {
        setup(stageId, true);
        const arts = poiBuildingArtRects();
        expect(arts.length).toBe(POIS.length);
        for (const it of collect(stageId)) {
          if (it.fixed || it.layer === 'puddle') continue; // 研究所の固定の層は手置きと同列/水たまりは別の余白(下のテスト)
          for (const a of ANCHORS) expect(hitsAnchor(it.art, a), `${it.id} ~ anchor`).toBe(false);
          for (const b of arts) expect(artOverlapRatio(it.art, b), `${it.id} ~ POI`).toBe(0);
        }
      });

      it('決定的・引く範囲によらず同じ答え(描画の範囲と当たり判定の範囲で食い違わない)', () => {
        setup(stageId, true);
        const big = collect(stageId, -2000, -2000, 2000, 2000);
        const key = (it: Item) => `${it.id}@${it.art.x.toFixed(3)},${it.art.y.toFixed(3)}`;
        const bigKeys = new Set(big.map(key));
        // メモを捨てて(新しい出撃)小さい範囲から引き直しても、同じ場所の物は同じ。
        beginPropPlacementSortie(STAGES[stageId].far, STAGES[stageId].treeSkin ?? STAGES[stageId].far);
        for (const [x0, y0] of [[-700, -500], [300, 900], [-1900, 1200], [1500, -1900]]) {
          const small = collect(stageId, x0, y0, x0 + 500, y0 + 400);
          for (const it of small) expect(bigKeys.has(key(it)), key(it)).toBe(true);
        }
        // 同じ範囲を2回引いて同じ。
        expect(collect(stageId, -2000, -2000, 2000, 2000).map(key)).toEqual(big.map(key));
      });
    });
  }

  it('松明: RELAX の追加確率の有無で位置は変わらない(増えるだけ)', () => {
    setup('stage-1', true);
    const base = torchesInRegion(-R, -R, R, R, 0);
    const relax = new Map(torchesInRegion(-R, -R, R, R, TORCH_RELAX_BONUS).map(t => [t.id, t]));
    for (const t of base) expect(relax.get(t.id)).toEqual(t);
    expect(relax.size).toBeGreaterThan(base.length);
  });

  it('壊された木・置物は壊される前の配置で決まる(壊しても他の物が動かない・湧かない)', () => {
    setup('stage-3', true);
    const before = collect('stage-3', -1500, -1500, 1500, 1500);
    const victims = before.filter(i => i.layer === 'tree').slice(0, 3).concat(before.filter(i => i.layer === 'prop').slice(0, 3));
    for (const v of victims) markObstacleDestroyed(v.id);
    const after = collect('stage-3', -1500, -1500, 1500, 1500);
    const gone = new Set(victims.map(v => v.id));
    expect(after.map(i => `${i.id}@${i.art.x},${i.art.y}`)).toEqual(before.filter(i => !gone.has(i.id)).map(i => `${i.id}@${i.art.x},${i.art.y}`));
  });

  it('研究所: 壁と保証の遮蔽は動かない(散布プロップの方が避ける)', () => {
    setup('stage-2', true);
    const walls = labWallsInRegionRaw(-R, -R, R, R);
    // 壁の列は baseX + k·150(設計上の不変条件)
    const byRun = new Map<string, number[]>();
    for (const w of walls) {
      const [, cx] = w.id.split('-');
      const k = `${cx}|${w.footY}`;
      (byRun.get(k) ?? byRun.set(k, []).get(k)!).push(w.footX);
    }
    for (const xs of byRun.values()) for (let i = 1; i < xs.length; i++) { const d = (xs[i] - xs[i - 1]) / 150; expect(Math.abs(d - Math.round(d))).toBeLessThan(1e-6); }
    const cover = labPropsInRegionRaw(-R, -LAB_ZONE, R, LAB_ZONE).filter(p => p.id.startsWith('lpc-'));
    expect(cover.length).toBeGreaterThan(10);
  });
});

// 段階6「逆向きの計算と画面の端」のソースの番人テスト(research/PERSPECTIVE_PROJECTION.md §3-9i 作る物10・§3-4 の2 の流儀)。
// ここで止めるのは「?proj=1 の分岐を持たない旧い矩形の間引き・旧い写像が、新しく足されて漏れる」こと。
import { describe, it, expect } from 'vitest';

const RAW = import.meta.glob([
  './pixiScene.ts', '../utils/projGameView.ts', '../utils/projFlag.ts', '../utils/horizonForestLine.ts', '../utils/groundBandLayout.ts',
  '../utils/viewTransform.ts', '../store/gameStore.ts', '../hooks/useGameLoop.ts', '../utils/escortView.ts', '../utils/heroBlast.ts',
  '../utils/heroTick.ts', '../utils/libertyTick.ts', '../utils/mapSightings.ts', '../utils/wraithTick.ts', '../utils/astroTick.ts', '../utils/npcSfx.ts',
], { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
/** src からの相対(例 'pixi/pixiScene.ts')で生の文字列を引く。 */
const src = (p: string): string => {
  const key = p.startsWith('pixi/') ? `./${p.slice(5)}` : `../${p}`;
  const s = RAW[key];
  if (typeof s !== 'string') throw new Error(`not loaded: ${p}`);
  return s;
};


const PIXI = src('pixi/pixiScene.ts').split('\n');

/** 行 i(0始まり)を含む関数(クラスのメソッド)の名前。`  private foo(` / `  foo(` の形を上へ探す。 */
const enclosingMethod = (lines: string[], i: number): string => {
  for (let k = i; k >= 0; k--) {
    const m = /^ {2}(?:private |protected |public )?(?:async )?([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\(/.exec(lines[k]);
    if (m) return m[1];
  }
  return '';
};

describe('② pixiScene の旧い矩形の間引き(grep ③)は ?proj=1 の分岐を持つか免除の一覧', () => {
  // 免除: 定義そのもの・?proj=1 では別の関数に置き換え済みの物(V20 effectNearViewport→projFxNear)・
  // 分母が旧い矩形であることが意図の物(V19 の漂う粒の面積の比・★#26 裁定 B)・projFrame が null の場面専用・
  // 計器の文字列(V18 の診断の view の中心は報告の文字列だけ)。
  const EXEMPT_METHODS = new Set([
    'visibleWorldRect', 'isPointNearViewport', 'distanceOutsideViewport',
    'effectNearViewport', // V20: ?proj=1 は projFxNear(段階3)
    'projAmbientRect', // V19: 確認だけ(面積の比の分母は旧い矩形が意図)
    'syncPoiMissDiag', // V18: placeFacts は分岐済み・旧い矩形は報告の文字列の中心だけ
  ]);
  const re = /distanceOutsideViewport\(|visibleWorldRect\(\)|isPointNearViewport\(/;
  it('漏れが無い', () => {
    const leaks: string[] = [];
    PIXI.forEach((line: string, i: number) => {
      if (!re.test(line)) return;
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/^ {2}(private |protected )?(visibleWorldRect|isPointNearViewport|distanceOutsideViewport)\(/.test(line)) return;
      const win = PIXI.slice(Math.max(0, i - 4), i + 2).join('\n');
      if (/proj|\bpf\b|\bfpf\b|\btpp\b|\bbpp\b/.test(win)) return;
      const m = enclosingMethod(PIXI, i);
      if (EXEMPT_METHODS.has(m)) return;
      leaks.push(`${i + 1}: ${m}: ${line.trim()}`);
    });
    expect(leaks).toEqual([]);
  });
});

describe('③ pixiScene の旧い写像(grep ④)を含む関数は、段階6で ?proj=1 の枝を持つ一覧か免除の一覧', () => {
  const STAGE6 = new Set(['sync', 'syncPlayerFx', 'syncRetaliationArrow', 'syncArrows']);
  const EXEMPT = new Set([
    'updateLabDarkLights', 'updateLabPitch', 'hideLabPitch', // 研究所
    'syncCorridorBackdrop', // 洋館
    'worldToUi', 'worldUiScale', // 定義
    'drawAcrasielPattern', 'drawEnemy', 'drawAcrasielBurstFragment', // originX が別の意味の局所の変数(予告の形の原点)
    'syncObjShadeOverlay', // 層の位置合わせ(中の物は段階1〜5で投影済み)
  ]);
  const re = /L\.world\.position\.[xy] \+ |toScreenX|toScreenY|worldToUi\(|originX \+ /;
  const hits = { n: 0 };
  it('grep ④ が当たる(網が空振りしていない)', () => {
    const all = PIXI.filter(l => re.test(l) && !/^\s*(\/\/|\*)/.test(l)).length;
    expect(all).toBeGreaterThan(10);
  });
  it('漏れの関数が増えていない(既知の残りは列挙)', () => {
    const found = new Set<string>();
    PIXI.forEach((line: string, i: number) => {
      if (!re.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
      const m = enclosingMethod(PIXI, i);
      if (STAGE6.has(m) || EXEMPT.has(m)) return;
      found.add(m);
    });
    hits.n = found.size;
    // 段階6の台帳の外で旧い写像を使う関数(段階1〜5で投影済みの経路の中の控え・UI の置き場所等)。新しく足されたらここで落ちる。
    // 一覧は着手時(段階6)に取った物。台帳に載せるか免除の理由を書いてから足すこと。
    const KNOWN = new Set<string>(KNOWN_OLD_MAPPING_METHODS);
    const added = [...found].filter(m => !KNOWN.has(m)).sort();
    expect(added).toEqual([]);
  });
});

/** 段階6の着手時点で旧い写像(grep ④)を含んでいた台帳の外の関数(確認済み・段階1〜5で ?proj=1 の経路を持つか、UI の固定の置き場所)。 */
const KNOWN_OLD_MAPPING_METHODS: string[] = [];

describe('⑥ utils/projGameView.ts は PixiJS・src/pixi を読まない', () => {
  it('import に pixi が無い', () => {
    const s = src('utils/projGameView.ts');
    const imports = s.split('\n').filter(l => /^import|from '/.test(l));
    for (const l of imports) {
      expect(l).not.toMatch(/pixi\.js|\/pixi\//);
    }
  });
  for (const f of ['utils/projFlag.ts', 'utils/horizonForestLine.ts', 'utils/groundBandLayout.ts']) {
    it(`${f} も pixi を読まない`, () => {
      const s = src(f);
      expect(s).not.toMatch(/from 'pixi\.js'|from '\.\.\/pixi\//);
    });
  }
});

describe('④ 段階6は赤い予告の時刻(meteorPhase)を読む所に触れない', () => {
  it('projGameView・viewTransform・horizonForestLine・projFlag は meteorPhase を読まない', () => {
    for (const f of ['utils/projGameView.ts', 'utils/viewTransform.ts', 'utils/horizonForestLine.ts', 'utils/projFlag.ts']) {
      expect(src(f)).not.toMatch(/meteorPhase|telegraphStyle/);
    }
  });
});

describe('⑤ ゲーム側の「見えているか」の差し替えは、旧い式を legacy として残す形(?proj=0 は今の答え)', () => {
  it('projSeen / projSeenPlayer の呼び出しは、旧い判定を最後の引数に持つ', () => {
    const files = ['store/gameStore.ts', 'hooks/useGameLoop.ts', 'utils/escortView.ts', 'utils/heroBlast.ts', 'utils/heroTick.ts',
      'utils/libertyTick.ts', 'utils/mapSightings.ts', 'utils/wraithTick.ts', 'utils/astroTick.ts', 'utils/npcSfx.ts'];
    let n = 0;
    for (const f of files) {
      const lines = src(f).split('\n');
      lines.forEach((l: string, i: number) => {
        if (!/projSeen(Player)?\(/.test(l) || /^import/.test(l)) return;
        n++;
        const win = lines.slice(i, i + 2).join(' ');
        expect(win, `${f}:${i + 1}`).toMatch(/isPointInZoomedViewport\(|(gameBounds|gb)\.(width|height) \/ 2|\.left && |>= view\.left|>= vw\.left|>= view0\.left/);
      });
    }
    expect(n).toBeGreaterThan(15);
  });
});

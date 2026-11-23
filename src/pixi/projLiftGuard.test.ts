import { describe, it, expect } from 'vitest';
import { PROJ_LIFT_ROWS, type ProjLiftRow } from '../utils/projLift';

// research/PERSPECTIVE_PROJECTION.md §3-8i 作る物10(段階5「高さ」のソースの番人・§3-4 の2 の流儀)。
// 高さを使う行(同じ行か、すぐ上の行)に `// proj-lift: Z10` のように台帳の番号を書く。免除は `// proj-lift: exempt(理由)`
// (理由は dead・lab・stage8・not-height・core=段階5の割り戻しの本体)。済の行も免除ではなく台帳の番号で印を付ける。1行に複数の番号は `// proj-lift: Z10 Z12`。

const sources = import.meta.glob(['./pixiScene.ts', '../utils/projLift.ts', '../utils/projShape.ts', '../utils/collisionUtils.ts', '../utils/endingScene.ts'], {
  eager: true, import: 'default', query: '?raw',
}) as Record<string, string>;
const byName = (n: string) => Object.entries(sources).find(([k]) => k.endsWith(n))?.[1] ?? '';
const src = byName('pixiScene.ts');
const lines = src.split('\n');

/** 3-8d の網羅の grep の正規表現(位置の式・関数の引数・Graphics の座標の引数・1文字の h・viewTopWorld・空とつながる物)。 */
const HEIGHT_RES: RegExp[] = [
  /position\.set\([^;]*[-+]\s*(liftHop|aiHop|kbHop|hop\w*|\w*Lift\w*|\w*Rise|\w*Bob|\w*Sink\w*|playerAirPx|brawlerJumpPx|\w*OffY|drop|bounce|lift|h)\b/,
  /\.y\s*[-+]=\s*[^;]*(lift|hop|rise|drop|fall|Lift|Rise)/,
  /(drawRainArrow|drawArrow|placeAstroArt|placeAstroFlyFlag|drawBountyWeapon|drawAstro\w+)\([^;]*[-+]\s*(h|lift|hop|drop|bounce|\w*Lift\w*)\b/,
  /\.(circle|ellipse|moveTo|lineTo|rect|texture)\([^;]*-\s*(h|lift|hop)\b/,
  /viewTopWorld/,
  /screenH\s*\//,
  /fallHeightPx/,
];
const MARK_RE = /proj-lift:\s*([^\n]*)/;
const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);
const markOf = (i: number): string | null => {
  const m = MARK_RE.exec(lines[i]) ?? (i > 0 && isComment(lines[i - 1]) ? MARK_RE.exec(lines[i - 1]) : null);
  return m ? m[1] : null;
};
const EXEMPT_RE = /^exempt\((dead|lab|stage8|not-height|core)\b/; // core=段階5の割り戻しの本体(高さの直しそのものの行)
const ROWS = PROJ_LIFT_ROWS as Record<string, ProjLiftRow>;

describe('投影の段階5: 高さの番人(§3-8i の10)', () => {
  it('pixiScene.ts を読めている', () => { expect(src.length).toBeGreaterThan(100000); });

  it('① 高さの正規表現に当たる行すべてに proj-lift: の印(台帳の番号か免除)がある', () => {
    const missing: string[] = [];
    lines.forEach((l, i) => {
      if (isComment(l)) return;
      if (!HEIGHT_RES.some((re) => re.test(l))) return;
      const m = markOf(i);
      if (!m || !(EXEMPT_RE.test(m.trim()) || /\bZ\d+\b/.test(m))) missing.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
    });
    expect(missing).toEqual([]);
  });

  it('② 印の番号は台帳に在り、台帳の行(外・材料を除く)には印が1つ以上ある', () => {
    const used = new Set<string>();
    const unknown: string[] = [];
    lines.forEach((l, i) => {
      const m = MARK_RE.exec(l);
      if (!m) return;
      for (const id of m[1].match(/\bZ\d+\b/g) ?? []) { if (ROWS[id]) used.add(id); else unknown.push(`${i + 1}: ${id}`); }
    });
    expect(unknown).toEqual([]);
    const unmarked = Object.entries(ROWS)
      .filter(([, r]) => !r.types.includes('dead') && !r.types.includes('material'))
      .map(([k]) => k).filter((k) => !used.has(k));
    expect(unmarked).toEqual([]);
  });

  it('③ PROJ_LIFT_MODE を読む所は projLiftScale の1か所だけ', () => {
    const lift = byName('projLift.ts');
    const reads = lift.split('\n').filter((l) => !isComment(l) && /PROJ_LIFT_MODE/.test(l) && !/export const PROJ_LIFT_MODE/.test(l));
    expect(reads.length).toBe(1);
    expect(reads[0]).toMatch(/projLiftScale/);
    for (const [k, s] of Object.entries(sources)) {
      if (k.endsWith('projLift.ts')) continue;
      expect(s.includes('PROJ_LIFT_MODE'), k).toBe(false);
    }
  });

  it('④ 投影の分岐の無い層(skyFxLayer・danceUiLayer・phillLayer)へ addChild する行は台帳か免除の印つき', () => {
    const missing: string[] = [];
    lines.forEach((l, i) => {
      if (isComment(l)) return;
      if (!/\.(skyFxLayer|danceUiLayer|phillLayer)\.addChild(At)?\(/.test(l) && !/\b(skyFxLayer|danceUiLayer|phillLayer)\b[^;]*addChild/.test(l)) return;
      const m = markOf(i);
      if (!m) missing.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
    });
    expect(missing).toEqual([]);
  });

  it('⑤ 段階5の印の行は予告の時刻(meteorPhase)と予告の層に触れない', () => {
    const bad = lines.filter((l) => MARK_RE.test(l) && /meteorPhase|telegraphStyleFor|\.tele\b/.test(l));
    expect(bad).toEqual([]);
    expect(byName('projLift.ts')).not.toMatch(/meteorPhase|telegraph/i);
  });

  it('⑥ 段階5は store と共有する utils(collisionUtils・endingScene)を変えない=高さの口を読まない', () => {
    for (const n of ['collisionUtils.ts', 'endingScene.ts']) {
      const s = byName(n);
      expect(s.length).toBeGreaterThan(100);
      expect(s).not.toMatch(/projLift|PROJ_LIFT/);
    }
    // 純関数は PixiJS・store・hooks・world を読まない
    const lift = byName('projLift.ts');
    expect(lift).not.toMatch(/from ['"](pixi\.js|\.\.\/store|\.\.\/hooks|\.\.\/world)/);
  });
});

import { describe, it, expect } from 'vitest';
import { PROJ_ACTOR_ROLES, projRoleMove } from '../utils/projActorPass';

// research/PERSPECTIVE_PROJECTION.md §3-6j 作る物10(段階4「形を持つもの」のソースの番人)。
// 段階4で書き換えた関数について、ソースを文字列で検査する(bakeRenderGuard / projActorGuard と同じ流儀)。
//   ① 図形の命令(circle・ellipse・poly・rect・moveTo・arc)は、`if (pf)` の分岐の else 側(または pf の分岐の後の今の行)か、
//      projKeep の申告つきの所にしか無い(= ?proj=1 で投影されない図形が分岐の中に紛れ込んでいない)
//   ② 流星の窓の関数で、?proj=1 の分岐が窓の入力(prog・circleSweepBand・bandSweepCenter)より後にある
//   ③ 濃さの列は ?proj=0 と同じ式(円窓・矩形の窓・扇の窓は、2つの分岐の濃さの行が1字も違わない)
//   ③b 段階4の関数の中で、world の Y の地平線・手前のフェード(horizonActorAlpha/foregroundActorAlpha)を ?proj=1 の分岐で使っていない
//   ④ 予告の役は後掛けの対象に入っていない
//   ⑤ ?proj の分岐の中で旧い遠近の倍率(depthScale・dsY・depthD)を予告の寸法に掛けていない
//   ⑥ メッシュ(makeProjGridMesh)を作る所は projTeleMesh だけで、projTeleMesh は projFrame がある時だけ呼ばれる(遅延生成)
// 書き換えた関数を足したら、下の一覧にも足す。

const sources = import.meta.glob('./pixiScene.ts', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
const src = Object.values(sources)[0] ?? '';

/** class メソッド(またはモジュール関数)の本文。sig の後の最初の `{` から対応する `}` まで(文字列・コメントを飛ばす)。 */
const bodyOf = (sig: string): string => {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  // 引数の括弧を閉じた後の最初の `{`
  let k = src.indexOf('(', i), d = 0;
  for (; k < src.length; k++) { if (src[k] === '(') d++; else if (src[k] === ')') { d--; if (d === 0) break; } }
  let j = src.indexOf('{', k);
  const start = j;
  d = 0;
  for (; j < src.length; j++) {
    if (src.startsWith('//', j)) { j = src.indexOf('\n', j); continue; }
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') { const q = c; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; } continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(start, j + 1); }
  }
  return '';
};

/** コメントを空白に置き換える(行の数と位置は保つ)。 */
const stripComments = (s: string): string => s.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/**
 * ①: 図形の命令が「?proj=1 の分岐の中」に生で書かれていないか。
 * 許す所: 同じ行に `else` がある / 三項 `pf ? 部品 : 今の命令` の else 側 / `} else {` の塊の中 /
 * `if (pf) { … return|continue; }` の後の今の行 / `if (!pf)` の中 / 同じ行に projKeep。
 * 数える命令: Graphics(o・g・bg・ot・gb)へ直に図形を足すもの。
 */
const rawInPfBranch = (body: string, cmdRe?: RegExp): string[] => {
  const s = stripComments(body);
  const bad: string[] = [];
  // ブロックの種類のスタック: 'pf'=if (pf) {…}、'else'=if (pf) の else、'npf'=if (!pf) {…}、'other'
  const stack: { kind: 'pf' | 'else' | 'npf' | 'other'; afterPfReturn: boolean }[] = [];
  let pendingKind: 'pf' | 'else' | 'npf' | 'other' = 'other';
  let lastClosedPf: { endedWithExit: boolean } | null = null;
  const lines = s.split('\n');
  const cmd = cmdRe ?? /\b(o|g|bg|ot|gb)\.(circle|ellipse|poly|rect|moveTo|arc)\(/;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // 行の中の { } を順に処理しつつ、命令の位置で判定する
    let pos = 0;
    while (pos <= line.length) {
      const rest = line.slice(pos);
      const m = cmd.exec(rest);
      const nextBrace = rest.search(/[{}]/);
      if (m && (nextBrace < 0 || m.index < nextBrace)) {
        const before = line.slice(0, pos + m.index);
        const okSameLine = /\belse\b/.test(before) || /:\s*\(?\s*$/.test(before.replace(/.*\?/, '')) && /\bpf\s*\?/.test(before)
          || /projKeep/.test(line) || /if \(!pf/.test(before);
        const inPf = stack.some((b) => b.kind === 'pf');
        const inElse = stack.some((b) => b.kind === 'else' || b.kind === 'npf' || b.afterPfReturn);
        const ternElse = /\bpf\s*\?[^:]*:\s*\(?\s*$/.test(before) || /\bpf\s*\?.*:\s*$/.test(before);
        if (inPf && !okSameLine && !ternElse) bad.push(line.trim().slice(0, 120));
        else if (!inPf && !inElse && !okSameLine && !ternElse) {
          // pf の分岐が1つも無い場所(=?proj=0 専用ではない共通の行)。段階4の関数では許さない。
          bad.push('[共通] ' + line.trim().slice(0, 110));
        }
        pos += m.index + m[0].length;
        continue;
      }
      if (nextBrace < 0) break;
      const bi = pos + nextBrace;
      const ch = line[bi];
      const head = (lines.slice(Math.max(0, li - 1), li).join(' ') + ' ' + line.slice(0, bi)).trimEnd();
      if (ch === '{') {
        let kind: 'pf' | 'else' | 'npf' | 'other' = 'other';
        if (/if \((this\.projFrame|pf|f)\)\s*$/.test(head) || /if \(pf\)\s*$/.test(line.slice(0, bi).trimEnd())) kind = 'pf';
        else if (/if \(!pf[^)]*\)\s*$/.test(line.slice(0, bi).trimEnd())) kind = 'npf';
        else if (/\belse\s+for\s*\(.*\)\s*$/.test(line.slice(0, bi).trimEnd()) && lastClosedPf) kind = 'else';
        else if (/\belse\s*$/.test(line.slice(0, bi).trimEnd()) && lastClosedPf) kind = 'else';
        else if (/\belse\s*$/.test(line.slice(0, bi).trimEnd()) && stack.some((b) => b.kind === 'else')) kind = 'else';
        stack.push({ kind, afterPfReturn: false });
        pendingKind = 'other';
      } else {
        const top = stack.pop();
        if (top?.kind === 'pf') {
          // pf の塊の最後の文が return/continue なら、親の残りは「今の行」(=else 側)
          const blockText = s.slice(0, s.split('\n').slice(0, li).join('\n').length + bi);
          const exit = /(return|continue)[^;]*;\s*$/.test(blockText.trimEnd().replace(/\s+$/, ''));
          lastClosedPf = { endedWithExit: exit };
          if (exit && stack.length > 0) stack[stack.length - 1].afterPfReturn = true;
        } else lastClosedPf = null;
      }
      pos = bi + 1;
    }
    void pendingKind;
  }
  return bad;
};

/** 段階4で書き換え済みの関数(全部の図形が分岐済み)。 */
const CONVERTED: string[] = [
  '  private drawSweepCircleFill(',
  '  private drawSweepRectFill(',
  '  private drawSweepSectorFill(',
  '  private drawAngelDashLine(',
  '  private drawMobBiteMeteor(',
  '  private drawRimNotches(',
  '  private drawAngelBeamLine(',
  '  private syncEggArmBlinks(',
  '  private syncPhantomTurretTelegraphs(',
  '  private syncSensorMines(',
  '  private syncBossFires(',
  '  private syncPumpkinTelegraph(',
  'const strokeBeamLayers = (',
  // 段階4の残り(v0.25.5753 の次の段)
  '  private syncBloodSpikes(',
  '  private syncArena(',
  '  private syncQuestTrigger(',
  '  private syncReturnCircle(',
  '  private syncHunterVision(',
  '  private syncShrines(',
  '  private syncBaseSites(',
  '  private drawArmory(',
  '  private drawHeroTelegraph(',
  '  private drawPhillLightrainCircles(',
  '  private drawAcrasielPattern(',
  '  private drawMaikoState(',
  '  private syncAcrasielSpears(',
  '  private syncLibertyArrows(',
  '  private syncWraithTelegraph(',
  '  private syncAstroThrowsBody(',
  '  private syncPlayerArrowRain(',
  '  private drawAlchemyRhythm(',
  // 監査 A-4(濃さを投影後のYへ)
  '  private syncAstroScatter(',
  '  private syncSkadiHazards(',
  // クリエイティブ監査8(予告の中の投影していない部分)
  '  private syncPhantomFlamer(',
];

describe('投影の段階4: 形を持つもの(番人)', () => {
  it('pixiScene.ts を読めている', () => {
    expect(src.length).toBeGreaterThan(100000);
    for (const sig of CONVERTED) expect(bodyOf(sig).length, sig).toBeGreaterThan(50);
  });

  it('① 書き換えた関数の図形の命令は ?proj=1 の分岐の else 側(今の行)か、申告つきの所にしか無い', () => {
    // 混在の表(§3-6b)の「投影しない」の列=projKeepFrom で申告している命令(関数ごとに、その命令の形で許す)。
    const KEEP: Record<string, RegExp[]> = {
      '  private syncSensorMines(': [/g\.(ellipse|circle)\(mx, my/], // 地雷の本体と待機のランプ(段階2で投影済みの表示座標)
      '  private syncBossFires(': [/g\.(circle|ellipse)\(f\.x( \+ sway \* 0\.\d)?, f\.y (\+ 2|- r \* )/], // 外周のグロウと炎の楕円3枚(派手さ)
      '  private syncAstroScatter(': [/g\.ellipse\((lx|p\.x \+ cr \* t)\b/], // 刺さった絵の切り口に沿う土(絵と一緒=段階3)
      '  private syncPhantomFlamer(': [/g\.(circle|ellipse)\(mx, my/], // 銃口の種火(判定を持たない飾り=④)
    };
    for (const sig of CONVERTED) {
      const keep = KEEP[sig] ?? [];
      const body = bodyOf(sig);
      // 段階3(§3-7b の D)で申告を「点/体の相似で写す」(projPointFrom・projBodyFrom)へ替えた所も同じ扱い
      if (keep.length > 0) expect(/projKeepFrom\(|projPointFrom\(|projBodyFrom\(/.test(body), sig).toBe(true);
      if (sig !== 'const strokeBeamLayers = (') expect(/\b(o|g|bg|ot|gb)\.(circle|ellipse|poly|rect|moveTo|arc)\(/.test(body), sig).toBe(true);
      const bad = rawInPfBranch(body).filter((l) => !keep.some((re) => re.test(l)));
      expect(bad, sig).toEqual([]);
    }
  });

  it('① の検出器自体が、分岐の外に生で書いた図形を拾う(自己点検)', () => {
    const bad = rawInPfBranch('{\n  const pf = this.projFrame;\n  if (pf) {\n    o.circle(1, 2, 3).fill(0);\n  }\n  g.moveTo(0, 0).lineTo(1, 1).stroke({});\n  if (pf) projSeg(g, pf, 0, 0, 1, 1, {}); else g.moveTo(0, 0).lineTo(1, 1).stroke({});\n}');
    expect(bad.length).toBe(2);
  });

  it('② 流星の窓の関数: ?proj=1 の分岐は窓の入力(prog から出す帯の位置)より後', () => {
    const pairs: [string, string][] = [
      ['  private drawSweepCircleFill(', 'circleSweepBand('],
      ['  private drawSweepRectFill(', 'circleSweepBand('],
      ['  private drawSweepSectorFill(', 'circleSweepBand('],
      ['  private drawSweepBand(', 'bandSweepCenter('],
      ['  private drawAngelBeamLine(', 'const baseW ='],
      ['  private drawAngelDashLine(', 'meteorPhase('],
    ];
    for (const [sig, input] of pairs) {
      const b = bodyOf(sig);
      const iIn = b.indexOf(input);
      const uses = [b.indexOf('if (pf)'), b.indexOf('pf ?')].filter((x) => x >= 0);
      const iPf = Math.min(...uses);
      expect(iIn, sig).toBeGreaterThan(0);
      expect(iPf, sig).toBeGreaterThan(iIn);
    }
  });

  it('③ 濃さの列は ?proj=0 と同じ式(円窓・矩形の窓・扇の窓は、2つの分岐の濃さの行が1字も違わない)', () => {
    for (const sig of ['  private drawSweepCircleFill(', '  private drawSweepRectFill(', '  private drawSweepSectorFill(']) {
      const b = bodyOf(sig);
      const rows = b.split('\n').filter((l) => /const a = Math\.min\(1, peakAlpha \* CIRCLE_SWEEP_A\) \* circleSweepAlphaAt\(r, band, halfW\);/.test(l));
      expect(rows.length, sig).toBe(2);
      const conts = b.split('\n').filter((l) => /if \(a <= 0\.003\) continue;/.test(l));
      expect(conts.length, sig).toBe(2);
    }
    // 帯の窓: スライスの濃さ(peak * winAt)と白芯(coreA * winAt)の式は1か所で、分岐の前に出す
    const band = bodyOf('  private drawSweepBand(');
    expect(band.split('const a = peak * winAt((s0 + s1) / 2);').length - 1).toBe(1);
  });

  it('③b 段階4の関数の中で、world の Y の地平線・手前のフェード(horizonActorAlpha/foregroundActorAlpha)を ?proj=1 の分岐で使っていない(§3-6j 作る物10 の ③)', () => {
    // world の Y を渡す呼び出し(投影後の点 bpp.y を渡す段階1の型は除く)。
    const worldFade = /this\.(horizonActorAlpha|foregroundActorAlpha)\((?!bpp\.y\))/;
    // 複数行の三項(`bpp ? { …投影後のY… } : { …今の式… }`)の ?proj=0 側(検出器は複数行の三項を追わないので、形で許す)
    const KEEP3: Record<string, RegExp[]> = {
      '  private syncShrines(': [/^\[共通\] alpha: horizonAlpha \* 0\.8 \* this\.foregroundActorAlpha\(footY\), shadowFade: fade,$/],
    };
    for (const sig of CONVERTED) {
      const bad = rawInPfBranch(bodyOf(sig), worldFade)
        .filter((l) => !(KEEP3[sig] ?? []).some((re) => re.test(l)))
        // 三項の ?proj=0 側(`pf ? 投影後のY : 今の式`)は許す
        .filter((l) => !/\b(pf|fpf|kpf|fq|bpp|this\.projFrame)\s*\?[^:]*:[^?]*this\.(horizonActorAlpha|foregroundActorAlpha)\(/.test(l));
      expect(bad, sig).toEqual([]);
    }
  });

  it('③b の検出器自体が、分岐の中/外の world の Y のフェードを拾う(自己点検)', () => {
    const worldFade = /this\.(horizonActorAlpha|foregroundActorAlpha)\((?!bpp\.y\))/;
    const bad = rawInPfBranch('{\n  const pf = this.projFrame;\n  const a = this.horizonActorAlpha(y);\n  if (pf) {\n    b = this.foregroundActorAlpha(y);\n  } else c = this.horizonActorAlpha(y);\n}', worldFade);
    expect(bad.length).toBe(2);
  });

  it('④ 予告の役は後掛けで動かさない(段階4でも役の表はそのまま)', () => {
    for (const key of ['tele', 'overlayTop', 'rings', 'bands', 'bandSlices'] as const) {
      expect(projRoleMove(PROJ_ACTOR_ROLES[key])).toBe('none');
    }
    // 段階4のメッシュは予告の名札で作る
    const tm = bodyOf('  private projTeleMesh(');
    expect(tm).toContain('this.projTag(m, key)');
  });

  it('⑤ ?proj=1 の分岐の中で旧い遠近の倍率を予告の寸法に掛けていない', () => {
    for (const sig of CONVERTED) {
      const lines = bodyOf(sig).split('\n').filter((l) => /\bproj(Circle|Ellipse|Band|ThickLine|Seg|Line|Poly|Rect|RectFrame|Ring|Annulus|Sector|ArcLine|GlyphCircle|GlyphEllipse)\(/.test(l));
      for (const l of lines) expect(/depthScale\w*\(|\bdsY\b|\bdepthD\b|\* d\b/.test(l), `${sig} ${l.trim()}`).toBe(false);
    }
  });

  it('⑥ メッシュは projFrame がある時だけ作る(遅延生成・?proj=0 では1つも作らない)', () => {
    const lines = src.split('\n');
    const mk = lines.filter((l) => /makeProjGridMesh\(/.test(l) && !/^\s*(import|\/\/|\*)/.test(l) && !/projRectFrame, projGlyph/.test(l));
    expect(mk.length).toBe(2); // projTeleMesh(予告の素材)と projSpriteMesh(地面の絵)の中だけ
    // projTeleMesh を呼ぶ所は全部 `if (pf) {` の塊の中(直前の数行に if (pf) がある)
    lines.forEach((l, i) => {
      if (!/this\.projTeleMesh\(/.test(l) || /private projTeleMesh\(/.test(l)) return;
      const back = lines.slice(Math.max(0, i - 4), i).join('\n');
      expect(/if \(pf\) \{/.test(back), l.trim()).toBe(true);
    });
    // projSpriteMesh は中で projFrame が無ければ何も作らずに戻る(遅延生成)。呼ぶ所も ?proj=1 の分岐の中(同じ行か直前の数行)
    expect(bodyOf('  private projSpriteMesh(')).toMatch(/const f = this\.projFrame;[\s\S]*if \(!f \|\| /);
    lines.forEach((l, i) => {
      if (!/this\.projSpriteMesh\(/.test(l) || /private projSpriteMesh\(/.test(l)) return;
      const back = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      expect(/if \((this\.projFrame|pf|fpf|kpf)\b/.test(back), l.trim()).toBe(true);
    });
    // 入れ物の外の円の Graphics(作る物6)も projFrame がある時に初めて作る
    expect(bodyOf('  private projShapeGfx(').length).toBeGreaterThan(50);
    lines.forEach((l, i) => {
      if (!/this\.projShapeGfx\(/.test(l) || /private projShapeGfx\(/.test(l)) return;
      const back = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
      expect(/if \((pf|this\.projFrame)\)/.test(back) || /pf \?/.test(back), l.trim()).toBe(true);
    });
  });

  it('★#23「予告の線の太さと遠近」: 線の太さの倍率は utils/projShape.ts の1か所(PROJ_TELE_LINE_MODE)', () => {
    expect(src).not.toMatch(/PROJ_TELE_LINE_MODE\s*[:=]/);
  });
});

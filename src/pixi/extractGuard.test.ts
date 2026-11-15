import { describe, it, expect } from 'vitest';
import { withoutLeakedDestroyListeners, type DestroyEmitter } from './extractGuard';

type Fn = (...a: unknown[]) => void;
const emitter = (): DestroyEmitter & { fns: Fn[] } => {
  const fns: Fn[] = [];
  return {
    fns,
    listeners: () => [...fns],
    off: (_e, fn) => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); },
  };
};

describe('withoutLeakedDestroyListeners', () => {
  it('run の間に増えた destroy の聞き手を1度呼んで外し、元からある聞き手は残す', () => {
    const src = emitter();
    let ownCalls = 0, addedCalls = 0;
    const own: Fn = () => { ownCalls++; };
    src.fns.push(own);
    const r = withoutLeakedDestroyListeners(src, () => { src.fns.push(() => { addedCalls++; }); return 42; });
    expect(r).toBe(42);
    expect(addedCalls).toBe(1);
    expect(ownCalls).toBe(0);
    expect(src.fns).toEqual([own]);
  });

  it('run が投げても増えた聞き手は外す(例外はそのまま投げる)', () => {
    const src = emitter();
    expect(() => withoutLeakedDestroyListeners(src, () => { src.fns.push(() => {}); throw new Error('x'); })).toThrow('x');
    expect(src.fns).toEqual([]);
  });

  it('聞き手が投げても外す', () => {
    const src = emitter();
    withoutLeakedDestroyListeners(src, () => { src.fns.push(() => { throw new Error('y'); }); });
    expect(src.fns).toEqual([]);
  });
});

// ★描画器の読み戻し(renderer.extract)は必ずこの番を通す(素通しの1行が増えると、出撃のたびに描画器が1世代残る)。
describe('renderer.extract は番を通す', () => {
  it('extract を呼ぶ行は withoutLeakedDestroyListeners の中だけ', () => {
    const sources = import.meta.glob('./**/*.ts', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
    expect(Object.keys(sources).some((f) => f.endsWith('pixiScene.ts'))).toBe(true); // 読めていないのに緑、を防ぐ
    const hits: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue;
      src.split('\n').forEach((line, i) => {
        if (!/\.extract\.\w+\(/.test(line)) return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (line.includes('withoutLeakedDestroyListeners(')) return;
        hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

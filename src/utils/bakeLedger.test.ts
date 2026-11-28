// ★#S-2(2026-09-20): **画面の `bake…MB` が増える一方だった**——焼いた RenderTexture を
// `bakeRenderTexture()`(数える入口)で作っておきながら、捨てる時に生の `destroy()` を
// 呼んでいた箇所があり、`releaseBakedTexture()`(数を引き戻す出口)を通っていなかった。
//
// 実測(ヘッドレス・同じ場面): 直す前 `bake13MB…56枚` / 直した後 `bake5MB…19枚`
// (実キャッシュは5.67MB)。半影は1枚焼くのに**3枚作って2枚捨てる**ので、実量の約3倍で伸びていた。
// ⇒ **計器が嘘をついていた**(CLAUDE.md「計測器を疑う」)。同型の再発をここで止める。
//
// 網の範囲(正直に書く): 「`bakeRenderTexture` の戻り値を受けた**変数**を直接 `destroy` していないか」
// までは機械で見られる。**別名を経由した破棄**(例: キャッシュに入れてから `entry.texture.destroy()`)
// は静的には追えないので、この網では捕まらない。そこは `releaseBakedTexture` を使う規約で守る。
import { describe, it, expect } from 'vitest';

const SOURCES = import.meta.glob('../pixi/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('★#S-2 焼いたテクスチャは必ず releaseBakedTexture で捨てる', () => {
  it('bakeRenderTexture の戻り値を受けた変数を、生の destroy で捨てていない', () => {
    const offenders: string[] = [];
    for (const [path, raw] of Object.entries(SOURCES)) {
      // ★コメントを外してから走査する(コメント中の `softRT.destroy(true)` という解説文を
      // 違反として拾ってしまうため)。行番号を保つため、コメントは長さを変えずに空白へ潰す。
      const blank = (m: string) => m.replace(/[^\n]/g, ' ');
      let src = raw.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);
      // `releaseBakedTexture` 自身の中の `rt.destroy(...)` は**正しい出口**なので対象外。
      const relStart = src.indexOf('const releaseBakedTexture');
      if (relStart >= 0) {
        const relEnd = src.indexOf('\n};', relStart);
        if (relEnd > relStart) src = src.slice(0, relStart) + blank(src.slice(relStart, relEnd)) + src.slice(relEnd);
      }
      const names = new Set<string>();
      for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*bakeRenderTexture\(/g)) names.add(m[1]);
      for (const m of src.matchAll(/this\.(\w+)\s*=\s*bakeRenderTexture\(/g)) names.add('this.' + m[1]);
      const lines = src.split('\n');
      for (const name of names) {
        const esc = name.replace('.', '\\.');
        lines.forEach((ln, i) => {
          if (new RegExp(`(?<![\\w.])${esc}\\.destroy\\(`).test(ln)) {
            offenders.push(`${path}:${i + 1} ${name}.destroy(…)`);
          }
        });
      }
    }
    expect(offenders, `生の destroy が残っている(releaseBakedTexture を通すこと):\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('前提: 走査対象のソースを実際に読めている(空振りで緑にならないこと)', () => {
    const joined = Object.values(SOURCES).join('');
    expect(Object.keys(SOURCES).length).toBeGreaterThan(0);
    expect(joined).toContain('bakeRenderTexture');
    expect(joined).toContain('releaseBakedTexture');
  });
});

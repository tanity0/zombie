import { describe, it, expect } from 'vitest';

// ★v0.25.5086: Pixi 8 は描いた根(RenderGroup)ごとに束ね役を作り、二度と捨てない。
// 焼くたびに使い捨ての Container を根にして `renderer.render` すると、焼き1回ぶんが永久に残る
// (社長実機「長く遊ぶと落ちる」の原因の一つ)。焼きは `renderBake`(使い回しの根1つ)を通すこと。
// 根を使い回している常設の描き先だけを許可表に書く。
const ALLOWED = [
  'this.renderer.render({ container: this.labRTScene,', // 研究所の常設シーン(根は1つを使い回し)
  'this.renderer.render(clear === undefined ? { container: root,', // renderBake 本体
];

describe('焼き直しは使い回しの根を通す', () => {
  it('renderer.render を直接呼ぶのは許可した場所だけ', () => {
    const sources = import.meta.glob('./**/*.ts', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>;
    expect(Object.keys(sources).some((f) => f.endsWith('pixiScene.ts'))).toBe(true); // 読めていないのに緑、を防ぐ
    const hits: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue;
      src.split('\n').forEach((line, i) => {
        if (!/\brenderer\.render\(/.test(line)) return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (ALLOWED.some((a) => line.includes(a))) return;
        hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

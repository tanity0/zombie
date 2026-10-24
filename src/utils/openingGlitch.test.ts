// オープニングの「たまに画面が乱れる」演出の作曲(社長指示2026-10-19・社長の答え「乱れは曖昧な記憶なので」・クリエイティブ監査2巡目)。
// 固定する不変条件:
//  ①主要な拍は作曲で固定: 道具・順番・時刻は乱数で変わらない(乱数は装飾=濃さ・ずれ幅・置き場所だけ)
//  ②乱れの長さ: 道具は 200ms〜1秒(人が抜ける 400〜700ms・止まるは1拍に1回だけ 250〜400ms)。2〜3コマの刻みは1拍に1か所まで
//  ③道具の入りは 100〜300ms ずつ順番に
//  ④段階は「何が乱れるか」で上がる(背景→空振り→主人公→時間→他人→主人公→全部→暗闇)
//  ⑤廊下の拍は意図した台詞にだけ重ね、その表示中に終わる(0.90 の台詞は 1500〜2200ms 後=読み終わってから)
//  ⑥アリーナ: パン!の1コマ後 / カット2回とも毎回(1コマ前に写し取り、カットの後に重ねる)/ 山場は 700〜1100ms で暗転前に終わる
//     / 赤は暗闇の拍だけ(蘇生と同じ鼓動)で、射撃シーンへの切替より前に終わる
//  ⑦BGM: 主は音量(80〜150ms で沈め・400ms 以上で戻す)。音程のよれは山場だけ、ごく小さく
//  ⑧立ち止まりの1回は打ち止めあり ⑨蘇生の字幕は v1 のまま
import { describe, it, expect } from 'vitest';
import {
  FRAME_MS, IDLE_MAX, actLen, actStart, beatSpan, planArenaBeats, planRevivalGlitches, planWalkBeats, planWalkIdleBeat,
  planWalkIdleWait, type Act, type Beat,
} from './openingGlitch';
import { mulberry32 } from './botUpgradePolicy';
import { OPENING_REVIVAL_LINES } from '../data/openingRevivalSequence';

const T = { panMs: 1050, cuts: [4200, 6200], blackStartMs: 8600, sceneStartMs: 10400 } as const;
const LINE_MS = 3600;
const shape = (bs: Beat[]) => bs.map(b => `${b.name}@${b.at}:${b.acts.map(a => `${a.tool}@${a.at}+${actLen(a)}`).join(',')}`).join(' | ');
const all = (seed: number) => [...planWalkBeats(mulberry32(seed)), ...planArenaBeats(mulberry32(seed), T)];

describe('作曲は固定(乱数は装飾だけ)', () => {
  it('どの乱数でも、拍の時刻・道具・順番・長さは同じ', () => {
    const ref = shape(all(1));
    for (let seed = 2; seed <= 100; seed++) expect(shape(all(seed))).toBe(ref);
  });
  it('装飾(濃さ・ずれ幅・置き場所)は揺らぐ', () => {
    const deco = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(all(i + 1).flatMap(b => b.acts))));
    expect(deco.size).toBeGreaterThan(40);
  });
});

describe('長さ・刻み・入りの順番', () => {
  const beats = all(7);
  it('道具は 200ms〜1秒。2〜3コマの刻みは1拍に1か所まで', () => {
    for (const b of beats) {
      const accents = b.acts.filter(a => actLen(a) < 200);
      expect(accents.length).toBeLessThanOrEqual(1);
      for (const a of accents) expect(actLen(a)).toBeLessThanOrEqual(Math.ceil(3 * FRAME_MS));
      for (const a of b.acts) if (actLen(a) >= 200) expect(actLen(a)).toBeLessThanOrEqual(1000);
    }
  });
  it('人が抜けるのは 400〜700ms・止まるは1拍に1回だけ 250〜400ms', () => {
    for (const b of beats) {
      for (const a of b.acts) if (a.tool === 'missing') { expect(actLen(a)).toBeGreaterThanOrEqual(400); expect(actLen(a)).toBeLessThanOrEqual(700); }
      const fr = b.acts.filter(a => a.tool === 'freeze');
      expect(fr.length).toBeLessThanOrEqual(1);
      for (const a of fr) { expect(actLen(a)).toBeGreaterThanOrEqual(250); expect(actLen(a)).toBeLessThanOrEqual(400); }
    }
  });
  it('道具の入りは 100〜300ms ずつ順番に(同時に立てない)', () => {
    for (const b of beats) {
      const starts = b.acts.map(a => a.at);
      for (let k = 1; k < starts.length; k++) {
        const d = starts[k] - starts[k - 1];
        expect(d).toBeGreaterThanOrEqual(100);
        expect(d).toBeLessThanOrEqual(300);
      }
    }
  });
  it('入りは ease-in で沈める長さ(60〜150ms)・戻りはそれより長い', () => {
    for (const b of beats) for (const a of b.acts) {
      // 色抜け(drain)は例外=ブツっと入ってブツっと戻す(社長指示2026-10-24)。
      if ('in' in a && a.tool !== 'red' && a.tool !== 'drain') {
        expect(a.in).toBeGreaterThanOrEqual(60); expect(a.in).toBeLessThanOrEqual(150);
        expect(a.out).toBeGreaterThan(a.in);
      }
    }
  });
  it('瞬時に戻るのは暗闇の閃き1か所だけ', () => {
    const inst = beats.flatMap(b => b.acts.filter(a => a.tool === 'sceneGhost' && a.instantOut).map(() => b.name));
    expect(inst).toEqual(['A5']);
  });
});

describe('段階は「何が乱れるか」で上がる', () => {
  it('背景→空振り→主人公→時間→時間→他人→主人公→全部→暗闇', () => {
    expect(all(3).map(b => b.subject)).toEqual(['bg', 'none', 'hero', 'time', 'time', 'others', 'hero', 'all', 'dark']);
  });
  it('空振りの拍は何も起きない(BGM が遠のくだけ)', () => {
    const w2 = planWalkBeats(mulberry32(1)).find(b => b.subject === 'none')!;
    expect(w2.acts).toEqual([]);
    expect(w2.bgm).not.toBeNull();
  });
  it('赤は暗闇の拍だけ', () => {
    for (const b of all(5)) for (const a of b.acts) if (a.tool === 'red') expect(b.name).toBe('A5');
  });
});

describe('廊下', () => {
  const w = planWalkBeats(mulberry32(9));
  it('拍は意図した台詞に重ね、その台詞の表示中に終わる', () => {
    expect(w.map(b => b.anchor?.line)).toEqual([1, 2, 3, 4]);
    for (const b of w) {
      const end = b.at + Math.max(beatSpan(b), b.bgm ? b.bgm.in + b.bgm.hold + b.bgm.out : 0);
      expect(end).toBeLessThan(LINE_MS);
    }
  });
  it('0.90 の台詞の1回は読み終わってから(1500〜2200ms)。顔が抜け→時間が止まり→置き去りの残像', () => {
    const w4 = w.find(b => b.anchor?.line === 4)!;
    expect(w4.at).toBeGreaterThanOrEqual(1500);
    expect(w4.at).toBeLessThanOrEqual(2200);
    expect(w4.acts.map(a => a.tool)).toEqual(['missing', 'freeze', 'ghost']);
    const ghost = w4.acts[2] as Extract<Act, { tool: 'ghost' }>;
    const freeze = w4.acts[1] as Extract<Act, { tool: 'freeze' }>;
    expect(ghost.anchor).toBe('world');
    expect(ghost.at).toBe(freeze.at + freeze.hold); // 動き出した瞬間、止まっていた所に姿が残る
  });
  it('「今日もかわいいですね」で主人公の色だけが抜ける', () => {
    const w3 = w.find(b => b.anchor?.line === 3)!;
    expect(w3.acts.map(a => a.tool)).toEqual(['drain']);
    // ブツっと入ってブツっと戻す(2026-10-24): 入りも戻りも0ms=フワッと変わらない。
    const d = w3.acts[0] as Extract<Act, { tool: 'drain' }>;
    expect(d.in).toBe(0);
    expect(d.out).toBe(0);
    expect(d.hold).toBeGreaterThan(0);
    // 色が抜けている間ずっと画面がガクガク飛ぶ(2026-10-24「セピアとカメラズレを合わせて」「分かりやすく」)。
    const j = d.jitter!;
    expect(j.length).toBeGreaterThanOrEqual(4);
    expect(j.reduce((t, k) => t + k.ms, 0)).toBe(d.hold); // 飛び始め=色が抜ける瞬間、飛び終わり=色が戻る瞬間
    const amp = Math.max(...j.map(k => Math.hypot(k.dx, k.dy)));
    expect(Math.max(...j.map(k => Math.abs(k.dx)))).toBeGreaterThanOrEqual(30); // 横ははっきり分かる幅で裂ける
    expect(amp).toBeLessThanOrEqual(64);    // 画面から人が外れるほどではない
    expect(new Set(j.map(k => k.ms)).size).toBeGreaterThan(2); // 刻みが等間隔でない
    expect(j.some(k => k.dx === 0 && k.dy === 0)).toBe(true); // 途中でいったん戻る(偽の回復)
    expect(j.filter(k => k.dy !== 0 && Math.abs(k.dy) > 10).length).toBe(1); // 縦に大きく動くのはロールの1回だけ
  });
  it('立ち止まりの1回は14〜20秒おき・背景だけ・打ち止めあり', () => {
    const rng = mulberry32(2);
    for (let i = 0; i < 50; i++) { const v = planWalkIdleWait(rng); expect(v).toBeGreaterThanOrEqual(14000); expect(v).toBeLessThanOrEqual(20000); }
    expect(planWalkIdleBeat(rng).subject).toBe('bg');
    expect(IDLE_MAX).toBeLessThanOrEqual(2);
  });
});

describe('アリーナ', () => {
  const a = planArenaBeats(mulberry32(4), T);
  const by = (n: string) => a.find(b => b.name === n)!;
  it('パン!の1コマ後に時間が止まる', () => {
    const b = by('A1');
    expect(b.at - T.panMs).toBe(Math.round(FRAME_MS));
    expect(b.acts.map(x => x.tool)).toEqual(['freeze']);
  });
  it('カットは2回とも毎回: 1コマ前に写し取り、カットの後に重ねる', () => {
    for (const [n, cut] of [['A2', T.cuts[0]], ['A3', T.cuts[1]]] as const) {
      const b = by(n);
      const g = b.acts.find(x => x.tool === 'sceneGhost') as Extract<Act, { tool: 'sceneGhost' }>;
      expect(b.at + g.take).toBeLessThanOrEqual(cut - Math.round(FRAME_MS));
      expect(b.at + g.at).toBeGreaterThan(cut);
    }
    expect(by('A2').subject).toBe('others');
    expect(by('A3').subject).toBe('hero');
  });
  it('帯のずれは人物を避けて流れて戻る(段で跳ばない=入り・保ち・戻りがある)', () => {
    const s = by('A3').acts.find(x => x.tool === 'slice') as Extract<Act, { tool: 'slice' }>;
    expect(s.in).toBeGreaterThanOrEqual(60);
    expect(s.out).toBeGreaterThanOrEqual(300);
    expect(['above', 'below']).toContain(s.place);
  });
  it('山場は順番に組んだ 700〜1100ms の流れで、暗転前の全明るさの所で終わる', () => {
    const b = by('A4');
    expect(b.acts.map(x => x.tool)).toEqual(['freeze', 'cold', 'missing', 'ghost']);
    const span = beatSpan(b);
    expect(span).toBeGreaterThanOrEqual(700);
    expect(span).toBeLessThanOrEqual(1100);
    expect(b.at + span).toBeLessThanOrEqual(T.blackStartMs);
    const ghost = b.acts[3] as Extract<Act, { tool: 'ghost' }>;
    expect(ghost.anchor).toBe('screen'); // 寄るカメラに置いていかれる
  });
  it('暗闇: 蘇生と同じ鼓動(立ち上がり約300ms・引き約500ms)で、頂点で2コマの閃き。切替より前に終わる', () => {
    const b = by('A5');
    const red = b.acts.find(x => x.tool === 'red') as Extract<Act, { tool: 'red' }>;
    expect(red.in).toBe(300);
    expect(red.out).toBe(500);
    const fl = b.acts.find(x => x.tool === 'sceneGhost') as Extract<Act, { tool: 'sceneGhost' }>;
    expect(fl.at).toBe(red.in);
    expect(b.at + beatSpan(b)).toBeLessThan(T.sceneStartMs);
    expect(b.at).toBeGreaterThan(T.blackStartMs + 800); // 暗転がほぼ黒になってから
  });
  it('拍どうしは重ならない', () => {
    for (let k = 1; k < a.length; k++) expect(a[k].at + Math.min(0, ...a[k].acts.map(actStart))).toBeGreaterThan(a[k - 1].at + beatSpan(a[k - 1]));
  });
});

describe('BGM', () => {
  it('80〜150ms で沈め・400ms 以上で戻す。音程のよれは山場だけ・ごく小さく', () => {
    for (const b of all(6)) {
      if (!b.bgm) continue;
      expect(b.bgm.in).toBeGreaterThanOrEqual(80); expect(b.bgm.in).toBeLessThanOrEqual(150);
      expect(b.bgm.out).toBeGreaterThanOrEqual(400);
      if (b.bgm.rate !== undefined) { expect(b.name).toBe('A4'); expect(b.bgm.rate).toBeGreaterThanOrEqual(0.95); }
    }
  });
});

describe('蘇生の字幕(v1のまま)', () => {
  it('中盤〜終盤から1〜2行(隣り合わせない)・行の表示中に収まる', () => {
    const n = OPENING_REVIVAL_LINES.length;
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const g = planRevivalGlitches(mulberry32(seed), OPENING_REVIVAL_LINES);
      counts.add(g.length);
      expect(g.length).toBeGreaterThanOrEqual(1);
      expect(g.length).toBeLessThanOrEqual(2);
      if (g.length === 2) expect(g[1].line - g[0].line).toBeGreaterThanOrEqual(2);
      for (const x of g) {
        expect(x.line).toBeGreaterThanOrEqual(Math.floor(n * 0.4));
        expect(x.line).toBeLessThan(n);
        expect(x.offsetMs).toBeGreaterThanOrEqual(260);
        expect(x.offsetMs + x.durMs).toBeLessThan(OPENING_REVIVAL_LINES[x.line].minDurationMs);
      }
    }
    expect(counts).toEqual(new Set([1, 2]));
  });
});

import { describe, it, expect } from 'vitest';
import {
  addScript, removeScript, setScriptZone, setScriptWeight, toggleScript,
  setStep, insertStep, removeStep, moveStep, stepCutoffIndex,
  serializeScripts, parseScripts, replaceScripts, scriptWarnings,
  SCRIPT_MAX, SCRIPT_STEP_MAX,
} from './bossScriptEdit';
import type { StringScript } from './bossSkeleton';

type M = 'aim' | 'fan' | 'orb' | 'punch';
const MOVES: M[] = ['aim', 'fan', 'orb', 'punch'];
const base = (): StringScript<M>[] => ([
  { zone: 'melee', weight: 50, moves: ['punch', 'fan'] },
  { zone: 'near', weight: 40, moves: ['fan', 'orb', 'aim'] },
]);

describe('台本の増減(社長の言い方=「台本の数の+-」)', () => {
  it('足すと1段だけの新しい台本ができる(既存の複製にしない)', () => {
    const l = base();
    expect(addScript(l, 'far', 'aim').ok).toBe(true);
    expect(l).toHaveLength(3);
    expect(l[2]).toEqual({ zone: 'far', weight: 30, moves: ['aim'] });
  });
  it('上限で止まる', () => {
    const l = base();
    while (l.length < SCRIPT_MAX) addScript(l, 'near', 'aim');
    const r = addScript(l, 'near', 'aim');
    expect(r.ok).toBe(false);
    expect(l).toHaveLength(SCRIPT_MAX);
  });
  it('消せるが、最後の1本は消せない(ボスが何もしなくなるため)', () => {
    const l = base();
    expect(removeScript(l, 0).ok).toBe(true);
    expect(l).toHaveLength(1);
    const r = removeScript(l, 0);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('最後の1本');
    expect(l).toHaveLength(1);
  });
  it('範囲外は何もしない', () => {
    const l = base();
    expect(removeScript(l, 9).ok).toBe(false);
    expect(setScriptZone(l, -1, 'far').ok).toBe(false);
    expect(l).toEqual(base());
  });
});

describe('段の編集(社長の言い方=「技の段は入れ放題」)', () => {
  it('差し替え・挿入・削除・並べ替え', () => {
    const l = base();
    setStep(l, 0, 1, 'orb');
    expect(l[0].moves).toEqual(['punch', 'orb']);
    insertStep(l, 0, 0, 'aim');            // 0段目の「後ろ」へ
    expect(l[0].moves).toEqual(['punch', 'aim', 'orb']);
    insertStep(l, 0, -1, 'fan');           // 先頭へ
    expect(l[0].moves).toEqual(['fan', 'punch', 'aim', 'orb']);
    moveStep(l, 0, 0, 1);
    expect(l[0].moves).toEqual(['punch', 'fan', 'aim', 'orb']);
    removeStep(l, 0, 2);
    expect(l[0].moves).toEqual(['punch', 'fan', 'orb']);
  });
  it('★「何かの後に撃つジャブ」が作れる(前段依存=2段目に置く)', () => {
    const l: StringScript<M>[] = [];
    addScript(l, 'near', 'punch');         // 1段目=殴り
    insertStep(l, 0, 0, 'aim');            // 2段目=ジャブ
    expect(l[0].moves).toEqual(['punch', 'aim']);
  });
  it('段の上限で止まる / 最後の1段は消せない', () => {
    const l = base();
    while (l[0].moves.length < SCRIPT_STEP_MAX) insertStep(l, 0, 0, 'aim');
    expect(insertStep(l, 0, 0, 'aim').ok).toBe(false);
    expect(l[0].moves).toHaveLength(SCRIPT_STEP_MAX);
    const one: StringScript<M>[] = [{ zone: 'near', weight: 10, moves: ['aim'] }];
    expect(removeStep(one, 0, 0).ok).toBe(false);
    expect(one[0].moves).toEqual(['aim']);
  });
  it('端では並べ替えが空振りする(配列を壊さない)', () => {
    const l = base();
    expect(moveStep(l, 0, 0, -1).ok).toBe(false);
    expect(moveStep(l, 0, 1, 1).ok).toBe(false);
    expect(l[0].moves).toEqual(['punch', 'fan']);
  });
});

describe('重みとゾーン', () => {
  it('重みは0以上の整数へ丸める', () => {
    const l = base();
    setScriptWeight(l, 0, -5);
    expect(l[0].weight).toBe(0);
    setScriptWeight(l, 0, 12.6);
    expect(l[0].weight).toBe(13);
    expect(setScriptWeight(l, 0, NaN).ok).toBe(false);
    expect(l[0].weight).toBe(13);
  });
  it('ゾーンを変えられる', () => {
    const l = base();
    setScriptZone(l, 1, 'far');
    expect(l[1].zone).toBe('far');
  });
});

describe('フェーズ上限で切られる位置(「書いたのに出ない」を見せるため)', () => {
  it('P1/P2の段数がそのまま境目', () => {
    expect(stepCutoffIndex(3, 4)).toEqual({ p1: 3, p2: 4 });
    expect(stepCutoffIndex(0, 1.6)).toEqual({ p1: 1, p2: 2 });
  });
});

describe('保存・貼り戻し', () => {
  it('往復して同じになる', () => {
    const l = base();
    const txt = serializeScripts(l);
    expect(txt).toBe('melee|50|punch,fan;near|40|fan,orb,aim');
    expect(parseScripts(txt, MOVES)).toEqual(l);
  });
  it('壊れた行は捨てて残りを活かす(1行の打ち間違いで全部消えない)', () => {
    const got = parseScripts('melee|50|punch,fan;こわれ;near|x|aim;far|20|aim', MOVES);
    expect(got).toEqual([
      { zone: 'melee', weight: 50, moves: ['punch', 'fan'] },
      { zone: 'far', weight: 20, moves: ['aim'] },
    ]);
  });
  it('★消した技名は落とす(技を消した後の古い保存を読んでもボスが固まらない)', () => {
    const got = parseScripts('near|40|fan,s9,orb', MOVES);
    expect(got).toEqual([{ zone: 'near', weight: 40, moves: ['fan', 'orb'] }]);
    // 全部が不明な技=その台本ごと落ちる。結果が空なら null(既定のままにする合図)。
    expect(parseScripts('near|40|s9,s8', MOVES)).toBeNull();
    expect(parseScripts('', MOVES)).toBeNull();
  });
  it('差し替えは**配列の参照を保つ**(ゲームが読んでいる実体を書き換える)', () => {
    const l = base();
    const ref = l;
    replaceScripts(l, [{ zone: 'far', weight: 9, moves: ['aim'] }]);
    expect(l).toBe(ref);
    expect(l).toEqual([{ zone: 'far', weight: 9, moves: ['aim'] }]);
    // 中身は複製される(渡した配列を後から触っても台本が動かない)。
    const srcMoves: M[] = ['fan'];
    replaceScripts(l, [{ zone: 'near', weight: 1, moves: srcMoves }]);
    srcMoves.push('orb');
    expect(l[0].moves).toEqual(['fan']);
  });
});

describe('警告(止めずに気づかせる)', () => {
  it('台本の無い距離帯と、出ない台本を挙げる', () => {
    const w = scriptWarnings([
      { zone: 'melee', weight: 0, moves: ['punch'] },
      { zone: 'near', weight: 10, moves: ['fan'] },
    ] as StringScript<M>[]);
    expect(w.join()).toContain('melee');   // 重み0しか無い=出ない
    expect(w.join()).toContain('mid');
    expect(w.join()).toContain('far');
    expect(w.join()).toContain('1本目');   // 重み0
    expect(w.join()).not.toContain('2本目');
  });
  it('off の台本は「生きている」と数えない(BOSS_MAKER.md §15-2-6)', () => {
    // near は重み>0のonが無い(1本目はoff・2本目は重み0)ので「出ない」警告が出る。
    // 一方、offの行そのものについて「段が空」「重み0」の個別警告は出さない(社長が意図して外した状態)。
    const w = scriptWarnings([
      { zone: 'near', weight: 40, moves: ['fan'], off: true },
      { zone: 'near', weight: 0, moves: ['aim'] },
    ] as StringScript<M>[]);
    expect(w.join()).toContain('near');
    expect(w.join()).not.toContain('1本目'); // off行は個別警告の対象外
    expect(w.join()).toContain('2本目');     // onで重み0の行は従来どおり警告
  });
});

describe('台本の on/off(BOSS_MAKER.md §15・A/B比較のための一時オフ)', () => {
  it('off にしても重みと段の並びは消えない(onへ戻すと元どおり)', () => {
    const l = base();
    const r = toggleScript(l, 0);
    expect(r.ok).toBe(true);
    expect(l[0]).toEqual({ zone: 'melee', weight: 50, moves: ['punch', 'fan'], off: true });
    const r2 = toggleScript(l, 0);
    expect(r2.ok).toBe(true);
    expect(l[0]).toEqual({ zone: 'melee', weight: 50, moves: ['punch', 'fan'] }); // off:false を残さない
  });
  it('最後に生きている(on の)1本は off にできない', () => {
    const l = base();
    toggleScript(l, 0);                       // 1本目をoff→2本目だけがon
    const r = toggleScript(l, 1);              // 最後のonをoffにしようとする
    expect(r.ok).toBe(false);
    expect(r.message).toContain('最後の1本');
    expect(l[1].off).toBeFalsy();              // 弾かれたので変化しない
  });
  it('直列化の往復: off は zone の前に `-` が付き、読み戻すと off が復元される', () => {
    const l = base();
    toggleScript(l, 1); // 2本目をoff
    const txt = serializeScripts(l);
    expect(txt).toBe('melee|50|punch,fan;-near|40|fan,orb,aim');
    const back = parseScripts(txt, MOVES);
    expect(back).toEqual(l);
    expect(back?.[1].off).toBe(true);
    expect(back?.[0].off).toBeUndefined();
  });
  it('★接頭辞なしの古い形式がそのまま読める(offを知らない保存=全部on)', () => {
    const got = parseScripts('melee|50|punch,fan;near|40|fan,orb,aim', MOVES);
    expect(got).toEqual(base());
    expect(got?.every(s => s.off === undefined)).toBe(true);
  });
});

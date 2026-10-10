import { describe, it, expect } from 'vitest';
import {
  pickNeighbor, stepInList, gridRows, stepInGrid, navStep, chooseInitial, itemKey, fullKey, NavMemory,
  pickBackByLayer, navInputKindOf, openConfirmGuard, enterConfirmGuard, releaseConfirm, confirmAllowed, discardsRepeat, isConfirmCode, NAV_CONFIRM_GUARD_MS, isPlayStationPad, isNintendoPad, padFamilyOf, padPromptStyle, stepRepeat, initRepeat, NAV_REPEAT_FIRST_MS, NAV_REPEAT_MS,
  promptItems, revealDelta, cubicBezier, navScrollEase,
  type NavItemInfo, type NavGroupInfo, type GridCell,
} from './navMap';

const r = (x: number, y: number, w = 100, h = 40) => ({ x, y, w, h });

describe('pickNeighbor(従来の幾何)', () => {
  it('その向きの一番近い物。無ければ -1', () => {
    expect(pickNeighbor(r(0, 0), [r(0, 60), r(0, 120)], 'down')).toBe(0);
    expect(pickNeighbor(r(0, 120), [r(0, 0), r(0, 60)], 'down')).toBe(-1);
  });
});

describe('list / row の中の次の番号と端', () => {
  it('list は上下で進み、端では edge(折り返さない)', () => {
    const f = [true, true, true];
    expect(stepInList(f, 0, 'down', 'list')).toEqual({ type: 'move', index: 1 });
    expect(stepInList(f, 2, 'down', 'list')).toEqual({ type: 'edge' });
    expect(stepInList(f, 0, 'up', 'list')).toEqual({ type: 'edge' });
  });
  it('list の左右・row の上下は並びの外(out)', () => {
    expect(stepInList([true, true], 0, 'left', 'list')).toEqual({ type: 'out' });
    expect(stepInList([true, true], 0, 'right', 'list')).toEqual({ type: 'out' });
    expect(stepInList([true, true], 0, 'up', 'row')).toEqual({ type: 'out' });
    expect(stepInList([true, true], 0, 'right', 'row')).toEqual({ type: 'move', index: 1 });
  });
  it('押せない物は飛ばす。飛ばした先が無ければ edge', () => {
    expect(stepInList([true, false, true], 0, 'down', 'list')).toEqual({ type: 'move', index: 2 });
    expect(stepInList([true, false, false], 0, 'down', 'list')).toEqual({ type: 'edge' });
  });
});

describe('grid の幾何', () => {
  // 3列 × 3行。(1,1) はロック=押せない。最終行は2つだけ。
  const cell = (c: number, row: number, focusable = true): GridCell => ({ rect: r(c * 110, row * 60, 100, 50), focusable });
  const cells: GridCell[] = [
    cell(0, 0), cell(1, 0), cell(2, 0),
    cell(0, 1), cell(1, 1, false), cell(2, 1),
    cell(0, 2), cell(1, 2),
  ];
  it('行は同じ高さに並ぶ物(列数は使わない)', () => {
    expect(gridRows(cells)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]]);
  });
  it('左右=同じ行の隣。ロック枠は飛ばす。行の端は -1', () => {
    expect(stepInGrid(cells, 3, 'right')).toBe(5);
    expect(stepInGrid(cells, 5, 'right')).toBe(-1);
    expect(stepInGrid(cells, 0, 'left')).toBe(-1);
  });
  it('上下=次の行で横位置が一番近い物。ロック枠へは行かない', () => {
    expect(stepInGrid(cells, 0, 'down')).toBe(3);
    expect(stepInGrid(cells, 1, 'down')).toBe(3); // 真下(1,1)はロック→同じ行の押せる物のうち近い方(左右が同距離なら左)
    expect(stepInGrid(cells, 5, 'down')).toBe(7); // 最終行は2つだけ → 横位置が近い方
    expect(stepInGrid(cells, 7, 'down')).toBe(-1);
    expect(stepInGrid(cells, 0, 'up')).toBe(-1);
  });
  it('その行に押せる物が無ければ次の行へ', () => {
    const c2: GridCell[] = [cell(0, 0), cell(0, 1, false), cell(0, 2)];
    expect(stepInGrid(c2, 0, 'down')).toBe(2);
    expect(stepInGrid(c2, 2, 'up')).toBe(0);
  });
  it('縦持ちで1列になっても同じ幾何で動く', () => {
    const one: GridCell[] = [cell(0, 0), cell(0, 1), cell(0, 2)];
    expect(gridRows(one)).toEqual([[0], [1], [2]]);
    expect(stepInGrid(one, 0, 'down')).toBe(1);
    expect(stepInGrid(one, 0, 'right')).toBe(-1);
  });
});

describe('navStep(1歩の総合)', () => {
  // 左=出撃(single)、右=行の list(3つ)、左下=オプション(single)
  const items: NavItemInfo[] = [
    { group: 0, rect: r(0, 100, 200, 80), focusable: true },   // 0 出撃
    { group: 1, rect: r(300, 50, 200, 40), focusable: true },  // 1 行A
    { group: 1, rect: r(300, 100, 200, 40), focusable: true }, // 2 行B
    { group: 1, rect: r(300, 150, 200, 40), focusable: true }, // 3 行C
    { group: 2, rect: r(0, 300, 120, 30), focusable: true },   // 4 オプション
  ];
  const groups: NavGroupInfo[] = [{ kind: 'single' }, { kind: 'list' }, { kind: 'single' }];
  it('list の中は上下。端でその向きに別の並びが無ければ bump', () => {
    expect(navStep(items, groups, 1, 'down')).toEqual({ type: 'move', index: 2, cross: false });
    expect(navStep(items, groups, 1, 'up')).toEqual({ type: 'bump' });
  });
  it('v4: 端でその向きに別の並びがあれば、幾何で一番近い物へ出る(折り返さない)', () => {
    expect(navStep(items, groups, 3, 'down')).toEqual({ type: 'move', index: 4, cross: true }); // 行C の下=オプション
    const single: NavItemInfo[] = [{ group: 0, rect: r(0, 0), focusable: true }, { group: 0, rect: r(0, 60), focusable: true }];
    expect(navStep(single, [{ kind: 'list' }], 1, 'down')).toEqual({ type: 'bump' }); // 外に何も無ければぶつかる
    expect(navStep(single, [{ kind: 'list' }], 0, 'up')).toEqual({ type: 'bump' }); // 折り返さない
  });
  it('並びの外へ: その向きに一番近い別の並びへ(single は全方向が外)', () => {
    expect(navStep(items, groups, 0, 'right')).toEqual({ type: 'move', index: 2, cross: true }); // 出撃と同じ高さの行B
    expect(navStep(items, groups, 0, 'down')).toEqual({ type: 'move', index: 4, cross: true });
    expect(navStep(items, groups, 2, 'left')).toEqual({ type: 'move', index: 0, cross: true });
    expect(navStep(items, groups, 4, 'up')).toEqual({ type: 'move', index: 0, cross: true });
    expect(navStep(items, groups, 4, 'down')).toEqual({ type: 'bump' }); // 下には何も無い
  });
  it('別の並びへ入る位置は、その並びで覚えている物(無ければ幾何で一番近い物)', () => {
    expect(navStep(items, groups, 0, 'right', g => (g === 1 ? 3 : undefined))).toEqual({ type: 'move', index: 3, cross: true });
    // 覚えている物が押せない/別の並びなら無視して幾何
    const locked = items.map((x, i) => (i === 3 ? { ...x, focusable: false } : x));
    expect(navStep(locked, groups, 0, 'right', g => (g === 1 ? 3 : undefined))).toEqual({ type: 'move', index: 2, cross: true });
    expect(navStep(items, groups, 0, 'right', () => 4)).toEqual({ type: 'move', index: 2, cross: true });
  });
  it('row は左右が中・上下が外', () => {
    const it2: NavItemInfo[] = [
      { group: 0, rect: r(0, 200, 74, 80), focusable: true },
      { group: 0, rect: r(80, 200, 74, 80), focusable: true },
      { group: 1, rect: r(300, 100, 150, 40), focusable: true }, // START
    ];
    const g2: NavGroupInfo[] = [{ kind: 'row' }, { kind: 'single' }];
    expect(navStep(it2, g2, 0, 'right')).toEqual({ type: 'move', index: 1, cross: false });
    expect(navStep(it2, g2, 1, 'right')).toEqual({ type: 'move', index: 2, cross: true }); // 端の右に別の並び(START)があれば出る
    expect(navStep(it2, g2, 0, 'left')).toEqual({ type: 'bump' }); // 左には何も無い
    expect(navStep(it2, g2, 1, 'up')).toEqual({ type: 'move', index: 2, cross: true });
  });
  it('grid は全方向が中。端でその向きに別の並びがあれば外へ(v4)・無ければ bump', () => {
    const it3: NavItemInfo[] = [
      { group: 0, rect: r(0, 0, 100, 50), focusable: true },
      { group: 0, rect: r(110, 0, 100, 50), focusable: true },
      { group: 1, rect: r(0, -100, 100, 40), focusable: true }, // 上の戻る
    ];
    const g3: NavGroupInfo[] = [{ kind: 'grid' }, { kind: 'single' }];
    expect(navStep(it3, g3, 0, 'right')).toEqual({ type: 'move', index: 1, cross: false });
    expect(navStep(it3, g3, 0, 'up')).toEqual({ type: 'move', index: 2, cross: true }); // 上の戻るへ
    expect(navStep(it3, g3, 1, 'right')).toEqual({ type: 'bump' });
    expect(navStep(it3, g3, 0, 'left')).toEqual({ type: 'bump' });
  });
});

describe('層に入った時の最初の物 / 覚える', () => {
  const c = [
    { key: '#0', focusable: true, isDefault: false },
    { key: 'id:x', focusable: true, isDefault: true },
    { key: '#2', focusable: true, isDefault: false },
  ];
  it('覚えている物 → default → 最初', () => {
    expect(chooseInitial(c, '#2')).toBe(2);
    expect(chooseInitial(c)).toBe(1);
    expect(chooseInitial(c.map(x => ({ ...x, isDefault: false })))).toBe(0);
    expect(chooseInitial([])).toBe(-1);
  });
  it('default が無ければ「最初の並び」の先頭(ヘッダの戻る等の単独の物より先)', () => {
    const c2 = [
      { key: '/#0', focusable: true, isDefault: false },                  // 戻る(単独)
      { key: 'stages/#0', focusable: true, isDefault: false, inGroup: true },
      { key: 'stages/#1', focusable: true, isDefault: false, inGroup: true },
    ];
    expect(chooseInitial(c2)).toBe(1);
    expect(chooseInitial(c2.map((x, i) => (i === 1 ? { ...x, focusable: false } : x)))).toBe(2); // ロック枠は選ばない
    expect(chooseInitial(c2.map(x => ({ ...x, inGroup: false })))).toBe(0); // 並びの宣言が無ければ最初の押せる物
  });
  it('覚えている物が押せない/無い時は default へ', () => {
    expect(chooseInitial(c.map(x => (x.key === '#2' ? { ...x, focusable: false } : x)), '#2')).toBe(1);
    expect(chooseInitial(c, 'none')).toBe(1);
  });
  it('名前: data-nav-id があればそれ、無ければ番号', () => {
    expect(itemKey('stage-1', 3)).toBe('id:stage-1');
    expect(itemKey(null, 3)).toBe('#3');
    expect(fullKey('rows', '#1')).toBe('rows/#1');
  });
  it('画面ごと・並びごとに覚える', () => {
    const m = new NavMemory();
    expect(m.recallScreen('home')).toBeUndefined();
    m.remember('home', 'rows', '#2');
    m.remember('home', '', '#0');
    expect(m.recallScreen('home')).toBe('/#0');
    expect(m.recallGroup('home', 'rows')).toBe('#2');
    expect(m.recallGroup('stage', 'rows')).toBeUndefined();
    m.clear();
    expect(m.recallScreen('home')).toBeUndefined();
  });
});

describe('戻るの優先(層)', () => {
  it('内側の層の物を押す。内側に無ければ外側', () => {
    expect(pickBackByLayer<string>([['detail-back'], ['header-back']])).toBe('detail-back');
    expect(pickBackByLayer<string>([[], ['header-back']])).toBe('header-back');
    expect(pickBackByLayer<string>([[], []])).toBeNull();
    expect(pickBackByLayer<string>([['a', 'b']])).toBe('a');
  });
});

describe('入力の種類(isTrusted)', () => {
  it('本物のキーだけ key。合成(パッドの B が送る Esc)は変えない', () => {
    expect(navInputKindOf({ isTrusted: true })).toBe('key');
    expect(navInputKindOf({ isTrusted: false })).toBeNull();
  });
  it('PlayStation 系のパッド判定', () => {
    expect(isPlayStationPad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe(true);
    expect(isPlayStationPad('DualSense Wireless Controller')).toBe(true);
    expect(isPlayStationPad('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe(false);
    expect(isPlayStationPad(undefined)).toBe(false);
    expect(isPlayStationPad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)')).toBe(false); // 名前に Wireless Controller を含む Xbox
    expect(isNintendoPad('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe(true);
    expect(isNintendoPad('Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)')).toBe(true);
    expect(isNintendoPad('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe(false);
    expect([padFamilyOf('DualSense Wireless Controller'), padFamilyOf('Pro Controller'), padFamilyOf('Xbox Wireless Controller'), padFamilyOf(undefined)]).toEqual(['ps', 'nin', 'xbox', 'xbox']);
    expect([padPromptStyle('ps'), padPromptStyle('nin'), padPromptStyle('xbox')]).toEqual(['padps', 'padnin', 'pad']);
  });
});

describe('押しっぱなしの繰り返し(初回320ms・以後110ms)', () => {
  it('新しく押したらすぐ動き、320ms 待って、以後 110ms ごと', () => {
    let s = initRepeat();
    let x = stepRepeat(s, 'down', 1000); s = x.state;
    expect(x).toMatchObject({ fire: true, fresh: true });
    x = stepRepeat(s, 'down', 1000 + NAV_REPEAT_FIRST_MS - 1); s = x.state;
    expect(x.fire).toBe(false);
    x = stepRepeat(s, 'down', 1000 + NAV_REPEAT_FIRST_MS); s = x.state;
    expect(x).toMatchObject({ fire: true, fresh: false });
    x = stepRepeat(s, 'down', 1000 + NAV_REPEAT_FIRST_MS + NAV_REPEAT_MS - 1); s = x.state;
    expect(x.fire).toBe(false);
    x = stepRepeat(s, 'down', 1000 + NAV_REPEAT_FIRST_MS + NAV_REPEAT_MS);
    expect(x.fire).toBe(true);
  });
  it('向きが変わったら新しい押下。離したら止まる', () => {
    let s = stepRepeat(initRepeat(), 'down', 0).state;
    const turn = stepRepeat(s, 'left', 50);
    expect(turn).toMatchObject({ fire: true, fresh: true });
    s = stepRepeat(turn.state, null, 60).state;
    expect(s.dir).toBeNull();
    expect(stepRepeat(s, 'left', 70)).toMatchObject({ fire: true, fresh: true });
  });
});

describe('案内(その画面にある操作だけ・機器に合わせる)', () => {
  it('キーボード', () => {
    expect(promptItems('key', { hasBack: true, hasTabs: false })).toEqual([
      { keys: ['Enter'], verb: '決定' }, { keys: ['Esc'], verb: '戻る' },
    ]);
  });
  it('戻るが無い画面は B を出さない / タブが無い画面は LB RB を出さない', () => {
    expect(promptItems('pad', { hasBack: false, hasTabs: false })).toEqual([{ keys: ['A'], verb: '決定' }]);
    expect(promptItems('pad', { hasBack: true, hasTabs: true })).toEqual([
      { keys: ['A'], verb: '決定' }, { keys: ['B'], verb: '戻る' }, { keys: ['LB', 'RB'], verb: '切替' },
    ]);
  });
  it('戻るの動詞は上書きできる(一時停止=再開)/ PlayStation 表記', () => {
    // 任天堂系: メニューは決定/戻るを入れ替える(右の A で決定・下の B で戻る=Switch の手のまま・gamepad.ts)
    expect(promptItems('padnin', { hasBack: true, hasTabs: true })).toEqual([
      { keys: ['A'], verb: '決定' }, { keys: ['B'], verb: '戻る' }, { keys: ['L', 'R'], verb: '切替' },
    ]);
    expect(promptItems('padps', { hasBack: true, backLabel: '再開', hasTabs: true })).toEqual([
      { keys: ['×'], verb: '決定' }, { keys: ['○'], verb: '再開' }, { keys: ['L1', 'R1'], verb: '切替' },
    ]);
  });
});

describe('スクロール量', () => {
  it('見える範囲に収まっていれば動かさない', () => {
    expect(revealDelta(0, 400, 100, 140, 40)).toBe(0);
  });
  it('下に隠れる時は先読みぶんの余白を持って送る', () => {
    expect(revealDelta(0, 400, 380, 420, 40)).toBe(420 + 40 - 400);
  });
  it('上に隠れる時は(sticky の帯を引いた)上端に先読みぶんの余白を持って戻す', () => {
    // 見える範囲は帯(60)を引いた 60..400。物は 20..60 にあって帯の下
    expect(revealDelta(60, 400, 20, 60, 30)).toBe(20 - 30 - 60);
  });
  it('先読みは見える範囲に収まる範囲まで(物が大きい時は小さくなる)', () => {
    expect(revealDelta(0, 60, 40, 50, 40)).toBe(50 + 25 - 60); // 余白は (60-10)/2=25 まで
  });
  it('入り切らない大きな物は先頭を揃える', () => {
    expect(revealDelta(0, 100, 150, 400, 40)).toBe(150);
  });
  it('ease は 0→1 で単調・端点が合う(慣性: 入りが速く終わりが緩い)', () => {
    expect(navScrollEase(0)).toBe(0);
    expect(navScrollEase(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) { const v = navScrollEase(i / 20); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(navScrollEase(0.2)).toBeGreaterThan(0.2);
    expect(cubicBezier(0, 0, 1, 1)(0.5)).toBeCloseTo(0.5, 3);
  });
});

describe('決定の誤爆よけ', () => {
  it('起動時は守っていない(すぐ決定できる)', () => {
    expect(confirmAllowed(openConfirmGuard(), 1000, 'Enter')).toBe(true);
  });
  it('層に入ってから 350ms は決定を無視', () => {
    const g = enterConfirmGuard(1000, []);
    expect(confirmAllowed(g, 1000, 'Enter')).toBe(false);
    expect(confirmAllowed(g, 1000 + NAV_CONFIRM_GUARD_MS - 1, 'pad')).toBe(false);
    expect(confirmAllowed(g, 1000 + NAV_CONFIRM_GUARD_MS, 'Enter')).toBe(true);
  });
  it('層に入った時に押されていた決定は、離すまで 350ms 過ぎても使わない', () => {
    let g = enterConfirmGuard(1000, ['Space', 'pad']);
    expect(confirmAllowed(g, 5000, 'Space')).toBe(false);
    expect(confirmAllowed(g, 5000, 'Enter')).toBe(true); // 押されていなかった別の入力は時間だけ
    g = releaseConfirm(g, 'Space');
    expect(confirmAllowed(g, 5000, 'Space')).toBe(true);
    expect(confirmAllowed(g, 5000, 'pad')).toBe(false);
    expect(releaseConfirm(g, 'Enter')).toBe(g); // 無関係な離しは何も変えない
  });
  it('離しても 350ms 以内なら使えない', () => {
    const g = releaseConfirm(enterConfirmGuard(1000, ['Enter']), 'Enter');
    expect(confirmAllowed(g, 1100, 'Enter')).toBe(false);
  });
  it('OS のリピートは決定にも戻る(Esc)にも使わない。最初の1回は使う', () => {
    expect(discardsRepeat('Enter', true)).toBe(true);
    expect(discardsRepeat('Space', true)).toBe(true);
    expect(discardsRepeat('NumpadEnter', true)).toBe(true);
    expect(discardsRepeat('Escape', true)).toBe(true);
    expect(discardsRepeat('Enter', false)).toBe(false);
    expect(discardsRepeat('ArrowDown', true)).toBe(false); // 矢印のリピートは別(間引き)
    expect(isConfirmCode('KeyA')).toBe(false);
  });
});

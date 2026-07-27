// 訓練(M0)「移動」チュートリアルの発火条件。**M0は毎出撃で出る**(社長指示v0.25.2266)ことと、
// 台帳(src/data/tutorials.ts)の体裁を固定する。
import { describe, it, expect } from 'vitest';
import { shouldShowMoveTutorial, M0_MOVE_TUTORIAL_AT_MS, nextM0Beat, m0AdvanceLimit, M0_BEATS, M0_PRACTICE_COUNT, type M0Beat } from './m0Tutorial';
import { AREA_THRESHOLDS } from './enemyUtils';
import { TUTORIALS, getTutorial } from '../data/tutorials';

const OPEN = { shownThisRun: false, popupOpen: false, menuOpen: false };

describe('shouldShowMoveTutorial', () => {
  it('待ち時間を過ぎたら出す', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS })).toBe(true);
  });

  it('待ち時間の前は出さない(開幕の登場演出とぶつけない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS - 1 })).toBe(false);
  });

  // **M0はチュートリアルステージなので毎出撃で出す**(社長指示v0.25.2266)。
  // 見るのは「この出撃で出したか」だけで、端末の既読(zombie:tutorialsSeen)は見ない。
  // v0.25.2264で端末既読ゲートを入れたのは取り違えだった。この2件がその撤回を固定する。
  it('同じ出撃で2回目は出さない(連発防止)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, shownThisRun: true, gameTimeMs: 9999 })).toBe(false);
  });

  it('端末で表示済みでも次の出撃では出る(M0は毎回)', () => {
    // 端末既読は引数に無い=そもそも参照しない設計。新しい出撃では shownThisRun=false から始まる。
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: 9999 })).toBe(true);
  });

  it('他ポップアップ/メニューが開いている間は出さない(UIを重ねない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, popupOpen: true, gameTimeMs: 9999 })).toBe(false);
    expect(shouldShowMoveTutorial({ ...OPEN, menuOpen: true, gameTimeMs: 9999 })).toBe(false);
  });
});

// CLAUDE.md「チュートリアルの作り方」= 本文台帳が唯一の出どころ。全件がその形を満たすことを機械化する。
describe('台帳の体裁(全チュートリアル共通)', () => {
  it('全件に題・本文・出典があり、idが重複しない', () => {
    for (const t of TUTORIALS) {
      expect(t.title.length, t.id).toBeGreaterThan(0);
      expect(t.lines.length, t.id).toBeGreaterThan(0);
      expect(t.where.length, t.id).toBeGreaterThan(0);
    }
    expect(new Set(TUTORIALS.map(t => t.id)).size).toBe(TUTORIALS.length);
  });

  it('全件に手本(img)が付いている', () => {
    for (const t of TUTORIALS) expect(t.img, `${t.id} に手本が無い`).toBeTruthy();
  });

  // 「本文に数値を書かない」(後でバランス調整した時に文面が嘘にならないようにする)。
  // px/秒/m などの単位つき数値が本文に混ざっていないことを見る。
  it('本文に単位つきの数値を書いていない', () => {
    for (const t of TUTORIALS) {
      const body = t.lines.join('');
      expect(body, `${t.id} の本文に数値がある`).not.toMatch(/\d+\s*(px|ピクセル|秒|ms|m)\b/);
    }
  });

  it('移動チュートリアルは台帳から引ける', () => {
    expect(getTutorial('move')?.title).toBe('移動');
  });
});

// --- 教習ビート(TUTORIAL_STAGE.md「M0 チュートリアル進行案」・社長裁定v0.25.2286〜2291) ---
const beatGate = (over: Partial<Parameters<typeof nextM0Beat>[0]> = {}): Parameters<typeof nextM0Beat>[0] => ({
  playerX: 0, playerLevel: 1, popupOpen: false, menuOpen: false,
  // 既定=「会話が終わり、台本の敵は片付いている」状態。位置ビートの検査をこれで邪魔しない。
  convoDone: true, scriptedEnemyAlive: false, scriptedWaveRemaining: 0, critUnlocked: false,
  fired: new Set<M0Beat>(), ...over,
});

describe('nextM0Beat(教習ビートの発火)', () => {
  it('開幕の会話が終わるまでは何も出さない(会話→戦闘を途切れさせない)', () => {
    expect(nextM0Beat(beatGate({ convoDone: false }))).toBeNull();
  });

  it('会話が終わっても、関門まで歩かないと射撃は始まらない(倒した直後に次が来ない=一拍)', () => {
    expect(nextM0Beat(beatGate({ playerX: 0, convoDone: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 300, convoDone: true }))?.id).toBe('shoot');
  });

  // 1体ずつ出すので、倒した直後は一瞬「敵0体」になる。そこで次のビートを出してしまうと
  // 練習が1体で打ち切られる(社長指示v0.25.2300「3体ずつ・一気に出さずに順番に」)。
  it('練習の残りがある間は、敵0体の一瞬でも次へ進まない', () => {
    const fired = new Set<M0Beat>(['shoot']);
    expect(nextM0Beat(beatGate({ playerX: 700, fired, scriptedEnemyAlive: false, scriptedWaveRemaining: 2 }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 700, fired, scriptedEnemyAlive: false, scriptedWaveRemaining: 0 }))?.id).toBe('melee');
  });

  it('台本の敵が生きている間は次(近接)へ進まない', () => {
    const fired = new Set<M0Beat>(['shoot']);
    expect(nextM0Beat(beatGate({ playerX: 700, fired, scriptedEnemyAlive: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 700, fired, scriptedEnemyAlive: false }))?.id).toBe('melee');
  });

  it('順に進めば定義順に出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (const playerX of [300, 700, 700, 700, 1100, 1500, 3000, 3160]) {
      const beat = nextM0Beat(beatGate({ playerX, fired, critUnlocked: fired.has('melee') }));
      if (beat) { order.push(beat.id); fired.add(beat.id); }
    }
    expect(order).toEqual(['shoot', 'melee', 'crit', 'finish', 'counter', 'area', 'hunter', 'ammo']);
  });

  it('ポップアップ/メニューが開いている間は出さない(重ねない)', () => {
    expect(nextM0Beat(beatGate({ playerX: 300, popupOpen: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 300, menuOpen: true }))).toBeNull();
  });

  it('一度出したビートは二度と出さない', () => {
    expect(nextM0Beat(beatGate({ playerX: 700, fired: new Set<M0Beat>(['shoot']) }))?.id).not.toBe('shoot');
  });

  it('走り抜けて複数が同時に条件を満たしても、定義順に1つずつ出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (let i = 0; i < 10; i++) {
      const beat = nextM0Beat(beatGate({ playerX: 3200, fired })); // いきなり最奥(クリ未解禁)
      if (!beat) break;
      order.push(beat.id); fired.add(beat.id);
    }
    // finish は「崩した瞬間」に出るものなので、最奥へ飛んだ場合は見送られる(後続は塞がない)。
    expect(order).toEqual(['shoot', 'melee', 'counter', 'area', 'hunter', 'ammo']);
  });

  it('強制クリティカルの直後に「クリティカル」→「フィニッシュ」の順で2本出す', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee']);
    expect(nextM0Beat(beatGate({ playerX: 900, fired, critUnlocked: false }))).toBeNull(); // まだ崩していない
    expect(nextM0Beat(beatGate({ playerX: 900, fired, critUnlocked: true }))?.id).toBe('crit');
    fired.add('crit');
    expect(nextM0Beat(beatGate({ playerX: 900, fired, critUnlocked: true }))?.id).toBe('finish');
  });

  it('フィニッシュはクリティカルの説明を前提にする(順番が入れ替わらない)', () => {
    expect(M0_BEATS.find(b => b.id === 'crit')!.requires).toBe('melee');
    expect(M0_BEATS.find(b => b.id === 'finish')!.requires).toBe('crit');
  });

  it('クリティカルが出ないまま先へ進んでも後続を塞がない', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'counter']);
    expect(nextM0Beat(beatGate({ playerX: 1500, critUnlocked: false, fired }))?.id).toBe('area');
  });

  it('レベルが上がったら成長を出す(位置ではなく成長で決まる)', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'counter']);
    expect(nextM0Beat(beatGate({ playerX: 1300, playerLevel: 2, fired }))?.id).toBe('levelup');
  });

  // ここが本命の網。敵を倒さずに走り抜けるとレベルが上がらないので、levelup が未発火のまま
  // 後続を塞ぐと area/hunter/ammo が二度と出ない(=チュートリアルが進行不能になる)。
  it('レベルが上がらないまま奥へ行っても、後続(区域/ハンター/弾薬)が塞がれない', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'counter']);
    expect(nextM0Beat(beatGate({ playerX: 1500, playerLevel: 1, fired }))?.id).toBe('area');
    fired.add('area');
    expect(nextM0Beat(beatGate({ playerX: 3000, playerLevel: 1, fired }))?.id).toBe('hunter');
    fired.add('hunter');
    expect(nextM0Beat(beatGate({ playerX: 3160, playerLevel: 1, fired }))?.id).toBe('ammo');
  });

  it('デンジャーまで来たら成長は見送る(今さら落ち着いた説明を割り込ませない)', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'counter', 'area']);
    expect(nextM0Beat(beatGate({ playerX: 3000, playerLevel: 2, fired }))?.id).toBe('hunter');
  });
});

describe('M0_BEATS の不変条件', () => {
  it('全ビートの本文が台帳にある(idの綴り違いをここで殺す)', () => {
    for (const b of M0_BEATS) expect(getTutorial(b.tutorial), b.id).toBeTruthy();
  });

  it('近接は必ず近接ビートで解禁される(それまで振れない=社長指示v0.25.2293の封印)', () => {
    expect(M0_BEATS.find(b => b.id === 'melee')!.unlock).toBe('melee');
    // 近接より前のビートで解禁してしまうと、教わる前に振れてしまう。
    const meleeIdx = M0_BEATS.findIndex(b => b.id === 'melee');
    for (let i = 0; i < meleeIdx; i++) expect(M0_BEATS[i].unlock, M0_BEATS[i].id).toBeUndefined();
  });

  it('射撃と近接には掛け声が付いている(説明より先に、状況の理由を言う)', () => {
    for (const id of ['shoot', 'melee'] as const) {
      expect(M0_BEATS.find(b => b.id === id)!.callouts?.length, id).toBeGreaterThan(0);
    }
  });

  it('位置ビートのxは単調増加(一本道で順に踏める)', () => {
    const xs = M0_BEATS.filter(b => b.atX !== undefined).map(b => b.atX!);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  // ここがズレると「区域が変わる」と言った瞬間に区域が変わらない(=説明が嘘になる)。
  it('区域の説明は「研究」入場、ハンターは「デンジャー」入場と一致する', () => {
    expect(M0_BEATS.find(b => b.id === 'area')!.atX).toBe(AREA_THRESHOLDS[0]);
    expect(M0_BEATS.find(b => b.id === 'hunter')!.atX).toBe(AREA_THRESHOLDS[1]);
  });

  // レベルは「敵を倒さなければ永久に上がらない」=条件が満たされないまま残りうる唯一の型。
  // 会話の終了・敵の掃討は必ず起きるので見送りxは要らない。
  it('レベルだけで決まるビートには必ず見送りxがある(後続を永久に塞がない)', () => {
    for (const b of M0_BEATS) {
      if (b.atLevel !== undefined && b.atX === undefined) expect(b.expireAfterX, b.id).toBeDefined();
    }
  });

  // 前提が無いと afterEnemyCleared が開幕(敵0体)で即成立し、近接が射撃を追い越す。
  it('「前の結果で始まる」ビートには前提ビートがある', () => {
    for (const b of M0_BEATS) {
      if (b.afterEnemyCleared) expect(b.requires, b.id).toBeDefined();
    }
  });

  it('封印を解くビートより先に、それを使う教習が出ない(カウンターは近接を前提にする)', () => {
    expect(M0_BEATS.find(b => b.id === 'counter')!.requires).toBe('melee');
  });

  it('練習を伴う教習は複数体(既定3体)を順に出す', () => {
    for (const id of ['shoot', 'melee', 'counter'] as const) {
      const b = M0_BEATS.find(x => x.id === id)!;
      expect(b.spawn, id).toBeDefined();
      expect(b.spawn!.count ?? M0_PRACTICE_COUNT, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('カウンターの相手は遠距離型(弾が飛んでこないと弾き返す教習にならない)', () => {
    expect(M0_BEATS.find(b => b.id === 'counter')!.spawn!.type).toBe('plant');
  });

  it('カウンターは近接より後(敵の攻撃モーションを一度見せてから教える)', () => {
    const idx = (id: M0Beat) => M0_BEATS.findIndex(b => b.id === id);
    expect(idx('shoot')).toBeLessThan(idx('melee'));
    expect(idx('melee')).toBeLessThan(idx('counter'));
  });
});

describe('m0AdvanceLimit(関門=ここより先へ進めない前線)', () => {
  it('未発火のうち最初の関門を返す。全部済めば制限なし', () => {
    expect(m0AdvanceLimit(new Set())).toBe(300);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot']))).toBe(700);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee']))).toBe(1100);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee', 'counter']))).toBeNull();
  });

  it('関門は単調増加(戻る前線を作らない)', () => {
    const gates = M0_BEATS.filter(b => b.gateX !== undefined).map(b => b.gateX!);
    for (let i = 1; i < gates.length; i++) expect(gates[i]).toBeGreaterThan(gates[i - 1]);
  });

  // 関門つきビートの前提が「出ないことがありうるビート」だと、壁が永久に残ってソフトロックする。
  it('関門つきビートの前提は、関門つきビート(=必ず順に消化される)だけ', () => {
    const gated = new Set(M0_BEATS.filter(b => b.gateX !== undefined).map(b => b.id));
    for (const b of M0_BEATS) {
      if (b.gateX !== undefined && b.requires) expect(gated.has(b.requires), b.id).toBe(true);
    }
  });

  it('クリティカルが一度も出なくても全ての関門を通過できる(ソフトロックしない)', () => {
    const fired = new Set<M0Beat>();
    for (let i = 0; i < 12; i++) {
      const limit = m0AdvanceLimit(fired);
      if (limit === null) break;
      const beat = nextM0Beat(beatGate({ playerX: limit, fired, critUnlocked: false, scriptedEnemyAlive: false }));
      if (!beat) throw new Error(`関門 ${limit} で進めなくなった(発火できるビートが無い)`);
      fired.add(beat.id);
    }
    expect(m0AdvanceLimit(fired)).toBeNull();
  });
});

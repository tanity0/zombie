// 訓練(M0)「移動」チュートリアルの発火条件。**M0は毎出撃で出る**(社長指示v0.25.2266)ことと、
// 台帳(src/data/tutorials.ts)の体裁を固定する。
import { describe, it, expect } from 'vitest';
import { shouldShowMoveTutorial, M0_MOVE_TUTORIAL_AT_MS, nextM0Beat, M0_BEATS, type M0Beat } from './m0Tutorial';
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
const beatGate = (over: Partial<Parameters<typeof nextM0Beat>[0]> = {}) => ({
  playerX: 0, playerLevel: 1, popupOpen: false, menuOpen: false,
  fired: new Set<M0Beat>(), ...over,
});

describe('nextM0Beat(教習ビートの発火)', () => {
  it('歩き出すまでは何も出さない', () => {
    expect(nextM0Beat(beatGate())).toBeNull();
  });

  it('順に歩けば定義順に出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (const playerX of [400, 800, 1200, 1500, 3000, 3160]) {
      const beat = nextM0Beat(beatGate({ playerX, fired }));
      if (beat) { order.push(beat.id); fired.add(beat.id); }
    }
    expect(order).toEqual(['shoot', 'melee', 'counter', 'area', 'hunter', 'ammo']);
  });

  it('ポップアップ/メニューが開いている間は出さない(重ねない)', () => {
    expect(nextM0Beat(beatGate({ playerX: 400, popupOpen: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 400, menuOpen: true }))).toBeNull();
  });

  it('一度出したビートは二度と出さない', () => {
    expect(nextM0Beat(beatGate({ playerX: 400, fired: new Set<M0Beat>(['shoot']) }))?.id).not.toBe('shoot');
  });

  it('走り抜けて複数が同時に条件を満たしても、定義順に1つずつ出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (let i = 0; i < 8; i++) {
      const beat = nextM0Beat(beatGate({ playerX: 3200, fired })); // いきなり最奥
      if (!beat) break;
      order.push(beat.id); fired.add(beat.id);
    }
    expect(order).toEqual(['shoot', 'melee', 'counter', 'area', 'hunter', 'ammo']);
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

  it('位置ビートのxは単調増加(一本道で順に踏める)', () => {
    const xs = M0_BEATS.filter(b => b.atX !== undefined).map(b => b.atX!);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  // ここがズレると「区域が変わる」と言った瞬間に区域が変わらない(=説明が嘘になる)。
  it('区域の説明は「研究」入場、ハンターは「デンジャー」入場と一致する', () => {
    expect(M0_BEATS.find(b => b.id === 'area')!.atX).toBe(AREA_THRESHOLDS[0]);
    expect(M0_BEATS.find(b => b.id === 'hunter')!.atX).toBe(AREA_THRESHOLDS[1]);
  });

  it('位置で決まらないビートには必ず見送りxがある(後続を永久に塞がない)', () => {
    for (const b of M0_BEATS) {
      if (b.atX === undefined) expect(b.expireAfterX, b.id).toBeDefined();
    }
  });

  it('カウンターは近接より後(敵の攻撃モーションを一度見せてから教える)', () => {
    const idx = (id: M0Beat) => M0_BEATS.findIndex(b => b.id === id);
    expect(idx('shoot')).toBeLessThan(idx('melee'));
    expect(idx('melee')).toBeLessThan(idx('counter'));
  });
});

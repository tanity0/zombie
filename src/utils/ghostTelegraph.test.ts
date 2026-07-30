// BOT_AND_GHOST.md §2.12 要件7(回避対応表の全ボス技化)の**網羅テスト**。
//
// 掟(CLAUDE.md v0.25.2426の教訓「同じ"動作"を持つ全員に付ける」): 予告は
// **汎用aiPhase系(gameStore=城ボス/グレン/EX)・城ボスg-*系・bossState系(角度が違う3実装経路:
// angelBossTick=天使6体 / useGameLoop=裏ボス4体+idol)** に分かれて実装されている。
// 1経路だけ書くと必ず取りこぼすので、**ソースを走査して状態名を全部拾い、台帳と突き合わせる**
// (constitution.test.ts と同じ「不変条件をテストで機械化する」流儀)。新しい技を足すと
// このテストが落ちる=分類しないと入らない。
import { describe, it, expect } from 'vitest';
import {
  GHOST_TELEGRAPH_LEDGER, ghostExtraTelegraphDodge, isTelegraphActive, isTelegraphState,
  type TelegraphLedgerEntry,
} from './ghostTelegraph';
import { telegraphDodge } from './botSkill';
import type { Enemy } from '../types/game';

// 走査対象=ボスの状態(aiPhase/bossState)を書いている全ファイル。ソースは vite の ?raw で読む
// (このリポジトリは @types/node を入れていないので node:fs は使わない)。
//  - gameStore.ts     : 城ボス(giantbat/グレン/EX)の aiPhase 'g-*' + 雑魚の汎用フェーズ
//  - angelBossTick.ts : 天使6体(ミゲル/ジブリル/ラフィ/ウリ/スリィエル/アクラシエル)の bossState
//  - useGameLoop.ts   : 裏ボス4体(ミーミル/ヨルムンガルド/スカジ/トール)+ idol の bossState
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts', './angelBossTick.ts', '../hooks/useGameLoop.ts'],
  { query: '?raw', import: 'default', eager: true },
);

// `bossState = 'x'` / `aiPhase: 'x'` / `st === 'x'` 形の直接指定と、
// `bossState = cond ? 'a' : 'b'` の三項(ミゲルの harai/tate がこの形)を拾う。
const DIRECT = /(?:bossState|aiPhase)\s*(?::|=|===|!==)\s*'([a-z0-9-]+)'/g;
const TERNARY = /(?:bossState|aiPhase)\s*=\s*[^;]*?\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g;

const scanStates = (): Map<string, string> => {
  const found = new Map<string, string>(); // 状態名 → 最初に見つけた場所(失敗時のメッセージ用)
  for (const [file, text] of Object.entries(SOURCES)) {
    text.split('\n').forEach((line: string, i: number) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return; // コメント行は拾わない
      for (const re of [DIRECT, TERNARY]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          for (const g of m.slice(1)) {
            if (g && !found.has(g)) found.set(g, `${file}:${i + 1}`);
          }
        }
      }
    });
  }
  return found;
};

// 台帳の1件から「その状態の敵」を作る。**台帳が宣言した図形のフィールドだけ**を載せる
// (= shared と言うからには既存表がその形で拾えること、none と言うからには何も拾えないこと、を検証できる)。
const probe = (state: string, entry: TelegraphLedgerEntry): Enemy => {
  const isPhase = state.startsWith('g-') || MOB_PHASES.has(state);
  const type = entry.types?.[0] ?? (isPhase ? 'giantbat' : 'thor');
  const base = {
    id: 'probe', x: 0, y: 0, width: 40, height: 40, speed: 0,
    health: 10, maxHealth: 10, damage: 1, type, experienceValue: 0, lastHit: 0, lastShot: 0,
    ...(isPhase ? { aiPhase: state } : { bossState: state }),
  } as unknown as Enemy;
  const shape = entry.sharedShape ?? (entry.ghostShape?.kind === 'band' ? 'band' : undefined);
  if (shape === 'band') {
    return { ...base, aiFromX: 0, aiFromY: 0, aiTargetX: 200, aiTargetY: 0 };
  }
  if (shape === 'circle-target' || entry.ghostShape?.kind === 'circle-target') {
    return { ...base, aiTargetX: 100, aiTargetY: 0 };
  }
  if (shape === 'stomp') return { ...base, gStompRadius: 92 };
  if (shape === 'tri-jump') return { ...base, gTriJumpPts: [80, 0, 160, 0], gTriJumpIdx: 0 };
  if (shape === 'delayed') {
    return { ...base, giantDelayedHits: [{ x: 60, y: 0, radius: 120, fireAt: 0 }] } as unknown as Enemy;
  }
  return base;
};
const MOB_PHASES = new Set(['charge', 'crouch', 'jump', 'recover', 'scream', 'windup']);

describe('§2.12 要件7: 予告台帳の網羅(ソース走査 vs 対応表)', () => {
  const scanned = scanStates();

  it('走査で見つかる状態が1件も台帳から漏れていない(新しい技を足したらここで落ちる)', () => {
    const missing = [...scanned.entries()]
      .filter(([state]) => GHOST_TELEGRAPH_LEDGER[state] === undefined)
      .map(([state, where]) => `${state} (${where})`);
    expect(missing, `台帳(ghostTelegraph.ts)へ分類を追加してください: ${missing.join(', ')}`).toEqual([]);
  });

  it('台帳に「もう存在しない状態」が残っていない(死んだキーを溜めない)', () => {
    const dead = Object.keys(GHOST_TELEGRAPH_LEDGER).filter(k => !scanned.has(k));
    expect(dead, `ソースに無い台帳キー: ${dead.join(', ')}`).toEqual([]);
  });

  it('走査の健全性: 3実装経路それぞれの代表状態が拾えている(正規表現が壊れたら落ちる)', () => {
    expect(scanned.has('g-stomp-windup')).toBe(true);  // 城ボス(aiPhase)
    expect(scanned.has('harai-windup')).toBe(true);    // 天使(bossState)
    expect(scanned.has('issen-windup')).toBe(true);    // 裏ボス・トール(bossState)
    expect(scanned.has('idol-roll')).toBe(true);       // idol(bossState)
    expect(scanned.has('tate')).toBe(true);            // 三項で代入される実行フェーズ
    expect(scanned.size).toBeGreaterThan(120);
  });

  it('全ボスが1技以上カバーされている(1経路だけ書いた取りこぼしの検出)', () => {
    // 各ボスの代表技が 'none' でないこと(=予告として扱われている)。
    const covered = [
      'g-sweep-windup',    // 城ボス/グレン/EX
      'harai-windup',      // ミゲル
      'sweep-windup',      // ラフィ/ウリ/スリィエル
      'spike-windup',      // アクラシエル
      'bite-windup',       // ミーミル
      'coil-windup',       // ヨルムンガルド
      'dash-windup',       // 裏ボス共通(スカジ含む)
      'issen-windup',      // トール
      'idol-punch-windup', // idol
    ];
    for (const state of covered) expect(isTelegraphState(state), state).toBe(true);
    // ジブリルは弾/火(別エンティティ)しか持たないため 'none' 分類だが、台帳には載っている。
    expect(GHOST_TELEGRAPH_LEDGER['lantern-windup']).toBeDefined();
  });

  it('分類が実装と一致する: shared=既存表が拾う / ghost=この表が足す / none=どちらも足さない', () => {
    for (const [state, entry] of Object.entries(GHOST_TELEGRAPH_LEDGER)) {
      const e = probe(state, entry);
      const sharedCount = telegraphDodge(10, 0, e).length;
      const ghostCount = ghostExtraTelegraphDodge(10, 0, e).length;
      if (entry.coverage === 'shared') {
        expect(sharedCount, `${state}: shared のはずが既存表が拾っていない`).toBeGreaterThan(0);
        expect(ghostCount, `${state}: shared なのに二重に足している`).toBe(0);
      } else if (entry.coverage === 'ghost') {
        expect(ghostCount, `${state}: ghost のはずがこの表が足していない`).toBeGreaterThan(0);
      } else if (entry.coverage === 'both') {
        expect(sharedCount, `${state}: both のはずが既存表が拾っていない`).toBeGreaterThan(0);
        expect(ghostCount, `${state}: both のはずがこの表が足していない`).toBeGreaterThan(0);
      } else {
        expect(sharedCount, `${state}: none のはずが既存表が拾っている`).toBe(0);
        expect(ghostCount, `${state}: none のはずがこの表が足している`).toBe(0);
      }
    }
  });

  it('全エントリに理由(note)が書かれている', () => {
    for (const [state, entry] of Object.entries(GHOST_TELEGRAPH_LEDGER)) {
      expect(entry.note.length, state).toBeGreaterThan(5);
    }
  });
});

describe('ghostExtraTelegraphDodge: 図形の向き', () => {
  const mk = (over: Partial<Enemy>): Enemy => ({
    id: 'b', x: 0, y: 0, width: 40, height: 40, speed: 0, health: 10, maxHealth: 10,
    damage: 1, type: 'giantbat', experienceValue: 0, lastHit: 0, lastShot: 0, ...over,
  } as unknown as Enemy);

  it('自己中心の輪(g-nova)からは外向きに逃げる', () => {
    const boss = mk({ aiPhase: 'g-nova-windup' as Enemy['aiPhase'] });
    const t = ghostExtraTelegraphDodge(100, 20, boss); // 中心(20,20)の右側に居る
    expect(t).toHaveLength(1);
    expect(t[0].ux).toBeGreaterThan(0); // 右=外向き
  });

  it('帯(実行中のsweep)からは直交方向へ逃げる', () => {
    const boss = mk({
      type: 'uri' as Enemy['type'], bossState: 'sweep',
      aiFromX: 0, aiFromY: 0, aiTargetX: 300, aiTargetY: 0,
    });
    const t = ghostExtraTelegraphDodge(150, 20, boss); // 帯(y=0)のすぐ下
    expect(t).toHaveLength(1);
    expect(t[0].uy).toBeGreaterThan(0); // 下へ抜ける
  });

  it('始点/終点が未確定の帯は足さない(図形をでっち上げない)', () => {
    const boss = mk({ type: 'uri' as Enemy['type'], bossState: 'sweep' });
    expect(ghostExtraTelegraphDodge(150, 20, boss)).toHaveLength(0);
  });

  it('同名の状態は type で分ける(burst: アクラシエル=大円 / 裏ボス=弾のみ)', () => {
    const acrasiel = mk({ type: 'acrasiel' as Enemy['type'], bossState: 'burst' });
    const mimir = mk({ type: 'mimir' as Enemy['type'], bossState: 'burst' });
    expect(ghostExtraTelegraphDodge(60, 20, acrasiel)).toHaveLength(1);
    expect(ghostExtraTelegraphDodge(60, 20, mimir)).toHaveLength(0);
  });

  it('急降下(g-dive-windup)は既存の帯に加えて着地円も足す(both)', () => {
    const boss = mk({
      aiPhase: 'g-dive-windup' as Enemy['aiPhase'],
      aiFromX: 0, aiFromY: 0, aiTargetX: 400, aiTargetY: 0,
    });
    const t = ghostExtraTelegraphDodge(430, 20, boss); // 着地点(420,20)の右
    expect(t).toHaveLength(1);
    expect(t[0].ux).toBeGreaterThan(0);
  });
});

describe('isTelegraphActive: 危険時(§2.12 要件3/4)の判定', () => {
  const mk = (over: Partial<Enemy>): Enemy => ({
    id: 'b', x: 0, y: 0, width: 40, height: 40, speed: 0, health: 10, maxHealth: 10,
    damage: 1, type: 'thor', experienceValue: 0, lastHit: 0, lastShot: 0, ...over,
  } as unknown as Enemy);

  it('予告中(windup)は true / 追跡・硬直は false', () => {
    expect(isTelegraphActive(mk({ bossState: 'issen-windup' }))).toBe(true);
    expect(isTelegraphActive(mk({ bossState: 'chase' }))).toBe(false);
    expect(isTelegraphActive(mk({ bossState: 'issen-recover' }))).toBe(false);
    expect(isTelegraphActive(null)).toBe(false);
  });

  it('aiPhase側(城ボス)も同じ関数で見る=実装経路の取りこぼしを作らない', () => {
    expect(isTelegraphActive(mk({ type: 'giantbat' as Enemy['type'], aiPhase: 'g-slam-windup' as Enemy['aiPhase'] }))).toBe(true);
    expect(isTelegraphActive(mk({ type: 'giantbat' as Enemy['type'], aiPhase: 'g-slam-recover' as Enemy['aiPhase'] }))).toBe(false);
  });
});

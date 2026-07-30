// プレイヤー名の台帳(v0.25.2477)。純関数+localStorageの契約を固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPlayerName, savePlayerName, normalizePlayerNameInput,
  PLAYER_NAME_MAX_LEN, PLAYER_NAME_WHEN_BLANK,
} from './playerName';

// jsdom を使わずに済む最小 localStorage スタブ(tutorialArchive.test.ts/playerTraits.test.tsと同じ作法)。
const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  return map;
};

// localStorageが常に例外を投げるスタブ(プライベートモード相当)。
const installBrokenStorage = () => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
    clear: () => { throw new Error('denied'); },
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('playerName: 台帳(load/save)', () => {
  beforeEach(() => { installStorage(); });

  it('保存が無ければ player+ランダム5桁 を生成して保存し、以後は同じ名前を返す', () => {
    const n = loadPlayerName();
    expect(n).toMatch(/^player\d{5}$/);
    expect(loadPlayerName()).toBe(n); // 2回目は保存済みを返す(呼ぶたびに変わらない)
  });

  it('savePlayerName: trimして保存し、確定名を返す', () => {
    expect(savePlayerName('  Tanity  ')).toBe('Tanity');
    expect(loadPlayerName()).toBe('Tanity');
  });

  it('savePlayerName: 最大10文字へ切り詰める', () => {
    const long = 'a'.repeat(PLAYER_NAME_MAX_LEN + 15);
    expect(savePlayerName(long)).toBe('a'.repeat(PLAYER_NAME_MAX_LEN));
    expect(loadPlayerName()).toBe('a'.repeat(PLAYER_NAME_MAX_LEN));
  });

  it('savePlayerName: 切り詰めはコードポイント単位(サロゲートペアを割らない)', () => {
    const emoji = '😀'.repeat(PLAYER_NAME_MAX_LEN + 3); // 1文字=2 UTF-16ユニット
    expect(savePlayerName(emoji)).toBe('😀'.repeat(PLAYER_NAME_MAX_LEN));
  });

  it('savePlayerName: 空文字/空白のみならランダム初期名を再生成して保存する', () => {
    savePlayerName('Tanity');
    const regenerated = savePlayerName('   ');
    expect(regenerated).toMatch(/^player\d{5}$/);
    expect(loadPlayerName()).toBe(regenerated);
  });

  it('loadPlayerName: 保存値の前後空白は取り除いて返す(空白のみの保存は無効=再生成)', () => {
    localStorage.setItem('zombie-player-name-v1', '  abc  ');
    expect(loadPlayerName()).toBe('abc');
    localStorage.setItem('zombie-player-name-v1', '   ');
    expect(loadPlayerName()).toMatch(/^player\d{5}$/);
  });
});

describe('playerName: localStorageが使えない環境(プライベートモード耐性)', () => {
  it('例外を投げず、毎回名前を返す(保存は効かないだけで壊れない)', () => {
    installBrokenStorage();
    expect(loadPlayerName()).toMatch(/^player\d{5}$/);
    expect(savePlayerName('Tanity')).toBe('Tanity'); // 確定名は返す
  });
});

// BOT_AND_GHOST.md §2.16 C-1(独立メニュー「守護霊」の名前決定・叩き台)。
describe('playerName: 入力欄の正規化(normalizePlayerNameInput)', () => {
  beforeEach(() => { installStorage(); });

  it('前後の空白を落として返す', () => {
    expect(normalizePlayerNameInput('  Tanity  ')).toBe('Tanity');
  });

  it('最大文字数へ切り詰める(コードポイント単位=サロゲートペアを割らない)', () => {
    expect(normalizePlayerNameInput('a'.repeat(30))).toBe('a'.repeat(PLAYER_NAME_MAX_LEN));
    expect(normalizePlayerNameInput('😀'.repeat(30))).toBe('😀'.repeat(PLAYER_NAME_MAX_LEN));
  });

  it('空/空白のみで確定したら「名無し」(ランダム名へは戻さない)', () => {
    expect(normalizePlayerNameInput('')).toBe(PLAYER_NAME_WHEN_BLANK);
    expect(normalizePlayerNameInput('   ')).toBe(PLAYER_NAME_WHEN_BLANK);
  });

  it('正規化した値は保存しても変化しない(二重適用で崩れない)', () => {
    const decided = normalizePlayerNameInput('   ');
    expect(savePlayerName(decided)).toBe(PLAYER_NAME_WHEN_BLANK);
    expect(loadPlayerName()).toBe(PLAYER_NAME_WHEN_BLANK);
  });
});

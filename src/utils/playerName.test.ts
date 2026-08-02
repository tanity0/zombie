// プレイヤー名の台帳(v0.25.2477)。純関数+localStorageの契約を固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPlayerName, savePlayerName, normalizePlayerNameInput, sanitizePlayerName,
  displayNameFrom,
  PLAYER_NAME_MAX_LEN, PLAYER_NAME_WHEN_BLANK, PLAYER_NAME_MAX_COMBINING,
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

  // v0.25.2765: 絵文字は文字種フィルタで落ちるので、サロゲートペアの検体は
  // 「許可される2ユニット文字」= CJK拡張B の 𠮟(U+20B9F) を使う。
  it('savePlayerName: 切り詰めはコードポイント単位(サロゲートペアを割らない)', () => {
    const wide = '𠮟'.repeat(PLAYER_NAME_MAX_LEN + 3); // 1文字=2 UTF-16ユニット
    expect(savePlayerName(wide)).toBe('𠮟'.repeat(PLAYER_NAME_MAX_LEN));
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
    expect(normalizePlayerNameInput('𠮟'.repeat(30))).toBe('𠮟'.repeat(PLAYER_NAME_MAX_LEN));
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

// ★v0.25.2765(社長指示「入れれない文字とか」): 文字種フィルタ。
// この名前は G6 で他人へ配られる=**送る側で塞ぐ**のがここ。不変条件をテストに固定する。
describe('playerName: 文字種フィルタ(sanitizePlayerName)', () => {
  beforeEach(() => { installStorage(); });

  // ★不可視文字の検体は必ず \u エスケープで書く(生の文字で置くと目視レビューできず、
  //   コピペやエディタの正規化で黙って消えても誰も気づけない)。

  it('日本語・英数・許可記号はそのまま通る', () => {
    expect(sanitizePlayerName('タニティ')).toBe('タニティ');
    expect(sanitizePlayerName('斬島 剣')).toBe('斬島 剣');
    expect(sanitizePlayerName('ひらがな々ー')).toBe('ひらがな々ー');
    expect(sanitizePlayerName('K.O.')).toBe('K.O.');
    expect(sanitizePlayerName('A_B-C・D')).toBe('A_B-C・D');
    expect(sanitizePlayerName('Ünïcode')).toBe('Ünïcode'); // アクセント付きラテンは通す
  });

  it('絵文字は落とす(端末フォント依存で他人の画面では別の絵/豆腐になるため)', () => {
    expect(sanitizePlayerName('あ😀い')).toBe('あい');
    expect(sanitizePlayerName('🏳️‍🌈')).toBe(''); // ZWJ結合の絵文字も丸ごと落ちる
    expect(sanitizePlayerName('😀')).toBe('');
  });

  it('制御文字・改行・タブは落とす', () => {
    expect(sanitizePlayerName('a\nb')).toBe('ab');
    expect(sanitizePlayerName('a\tb')).toBe('ab');
    expect(sanitizePlayerName('a\u0000\u001F\u007F\u009Fb')).toBe('ab');
  });

  it('★ゼロ幅文字は落とす(「見えない名前」=空欄チェックの抜け道を塞ぐ)', () => {
    expect(sanitizePlayerName('\u200B\u200C\u200D\uFEFF')).toBe('');
    expect(sanitizePlayerName('a\u200Bb')).toBe('ab');
  });

  it('★双方向制御文字は落とす(表示順を反転して別の名前に見せられるため)', () => {
    expect(sanitizePlayerName('\u202Eabc')).toBe('abc');
    expect(sanitizePlayerName('a\u202B\u202C\u2066\u2069b')).toBe('ab');
  });

  it('タグ文字・異体字セレクタは落とす(不可視で任意の文字列を埋め込めるため)', () => {
    expect(sanitizePlayerName('a\u{e0041}\u{e007f}b')).toBe('ab');
    expect(sanitizePlayerName('a\uFE0F\u{E0100}b')).toBe('ab');
  });

  it('★結合文字は基底1文字につき上限個まで(ザルゴ=上下へ突き抜ける名前を殺す)', () => {
    const ACUTE = '\u0301'; // COMBINING ACUTE ACCENT
    // 検体の基底は**NFKCで合成されない**ひらがなにする。ラテン(a+◌́)だとNFKCが1個目を
    // 合成済み文字(á)へ畳んでしまい、「フィルタが何個残したか」を測れない。
    expect(sanitizePlayerName('あ' + ACUTE.repeat(20)))
      .toBe('あ' + ACUTE.repeat(PLAYER_NAME_MAX_COMBINING));
    expect(sanitizePlayerName(ACUTE + 'abc')).toBe('abc'); // 基底の無い先頭の結合文字は落とす
    expect(sanitizePlayerName('a ' + ACUTE + 'b')).toBe('a b'); // 空白直後も基底が無いので落とす
  });

  it('★NFKCが1個目を合成するラテンでも、積み上がりは有界のまま', () => {
    const ACUTE = '\u0301';
    // a+◌́ は NFKC で á(合成済み1文字)になり、そこへフィルタが更に上限個だけ許す。
    // よって見た目の積み上がりは最大 1+上限 個で頭打ち=画面を突き抜けない(これが守りたい不変条件)。
    const out = sanitizePlayerName('a' + ACUTE.repeat(50));
    const marks = [...out].filter(c => /\p{Mn}/u.test(c)).length;
    expect(marks).toBeLessThanOrEqual(PLAYER_NAME_MAX_COMBINING);
    expect([...out].length).toBeLessThanOrEqual(1 + PLAYER_NAME_MAX_COMBINING);
  });

  it('NFKCで畳む(全角英数→半角・半角カナ→全角)=見た目そっくりの別名を作らせない', () => {
    expect(sanitizePlayerName('ＡＢＣ１２３')).toBe('ABC123');
    expect(sanitizePlayerName('ｱｲｳ')).toBe('アイウ');
  });

  it('各種の空白は半角空白へ畳み、連続空白は1つにして前後をtrimする', () => {
    expect(sanitizePlayerName('　全角　空白　')).toBe('全角 空白');
    expect(sanitizePlayerName('a\u00A0\u2003b')).toBe('a b');
    expect(sanitizePlayerName('a   b')).toBe('a b');
  });

  it('全部落ちて空になった入力は「名無し」/ 保存ならランダム初期名になる', () => {
    expect(normalizePlayerNameInput('😀🎉')).toBe(PLAYER_NAME_WHEN_BLANK);
    expect(savePlayerName('😀🎉')).toMatch(/^player\d{5}$/);
  });

  it('★NFKCで伸びる入力でも上限を超えない(切り詰めは正規化の後)', () => {
    // ㍿(1文字) は NFKC で「株式会社」(4文字)へ展開される。先に切り詰めると上限を破る。
    expect([...normalizePlayerNameInput('㍿'.repeat(5))].length).toBe(PLAYER_NAME_MAX_LEN);
  });

  it('sanitizeは冪等(二重適用で結果が変わらない)', () => {
    for (const s of ['タニティ', 'a\u200B\u{1F600}b', '　全角　', 'a' + '\u0301'.repeat(9), 'ＡＢ']) {
      expect(sanitizePlayerName(sanitizePlayerName(s))).toBe(sanitizePlayerName(s));
    }
  });

  it('★保存済みの旧い名前(絵文字入り)も読み出し時に浄化される', () => {
    localStorage.setItem('zombie-player-name-v1', '勇者😀');
    expect(loadPlayerName()).toBe('勇者');
    localStorage.setItem('zombie-player-name-v1', '😀😀'); // 全部落ちる → 初期名を作り直す
    expect(loadPlayerName()).toMatch(/^player\d{5}$/);
  });

  it('★初期ランダム名は上限の内側に収まっている(モジュールが自分の上限を破らない)', () => {
    const n = loadPlayerName();
    expect(n).toMatch(/^player\d{5}$/);
    expect([...n].length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LEN);
    expect(loadPlayerName()).toBe(n); // 読み出しを重ねても化けない
  });
});

// ★v0.25.2766: 品質監査で見つかった穴の回帰テスト。
// **どれも「テストが主張していない不変条件」から漏れていた**ので、主張ごと足す。
describe('playerName: 品質監査の回帰(v0.25.2766)', () => {
  beforeEach(() => { installStorage(); });

  it('★A-1: 不可視だが\\p{L}を通る文字で「見えない名前」を作れない', () => {
    // U+3164(HANGUL FILLER)は NFKC で U+1160 になり、U+1160 はカテゴリ Lo なので
    // \\p{L} を通ってしまっていた。長さ>0 なので空欄フォールバックも発火せず、
    // 「見えない名前」が確定・保存できていた(頭上ラベルは「(自分)」だけが浮く)。
    expect(sanitizePlayerName('\u3164\u3164\u3164')).toBe('');
    expect(normalizePlayerNameInput('\u3164\u3164\u3164')).toBe(PLAYER_NAME_WHEN_BLANK);
    expect(sanitizePlayerName('\u1160')).toBe('');
    expect(sanitizePlayerName('\u115F')).toBe('');
    expect(sanitizePlayerName('\uFFA0')).toBe('');
  });

  it('★A-2: 不可視文字はDefault_Ignorable全体で落ちる(個別列挙の取りこぼしが無い)', () => {
    // 手書きの異体字セレクタ範囲(FE00-FE0F / E0100-E01EF)では、まさに同じカテゴリの
    // MONGOLIAN FREE VARIATION SELECTOR(U+180B〜180F)や CGJ(U+034F)を取りこぼしていた。
    const invisible = [
      0x034F, 0x115F, 0x1160, 0x17B4, 0x17B5,
      0x180B, 0x180C, 0x180D, 0x180F, 0x3164, 0xFFA0,
      0x200B, 0x200C, 0x200D, 0xFEFF, 0x202E, 0xFE0F, 0x00AD,
    ];
    for (const cp of invisible) {
      const ch = String.fromCodePoint(cp);
      expect(sanitizePlayerName(ch)).toBe('');
      expect(sanitizePlayerName('a' + ch + 'b')).toBe('ab');
    }
  });

  it('★B: 〇(U+3007)は通る(Ndではなく Nl なので \\p{Nd} だけだと落ちていた)', () => {
    expect(sanitizePlayerName('\u3007\u3007')).toBe('\u3007\u3007');
    expect(normalizePlayerNameInput('\u3007\u3007')).toBe('\u3007\u3007');
  });

  it('★C-1: savePlayerName(loadPlayerName()) は不動点(初期名が1文字削られない)', () => {
    const n = loadPlayerName();
    expect(savePlayerName(n)).toBe(n);
    expect(loadPlayerName()).toBe(n);
  });

  it('★C-3: 読み出しは必ず sanitize済み かつ 上限以内 を返し、浄化結果を書き戻す', () => {
    localStorage.setItem('zombie-player-name-v1', '  a'.repeat(40));
    const got = loadPlayerName();
    expect([...got].length).toBeLessThanOrEqual(PLAYER_NAME_MAX_LEN);
    // 浄化した値が保存し直されている(汚れた生値を残さない)
    expect(localStorage.getItem('zombie-player-name-v1')).toBe(got);
  });

  it('★D-1/D-2: displayNameFrom は他所から来た名前を浄化し、文字列以外を拒否する', () => {
    expect(displayNameFrom('勇者')).toBe('勇者');
    expect(displayNameFrom('a'.repeat(40))).toBe('a'.repeat(PLAYER_NAME_MAX_LEN));
    expect(displayNameFrom('\u202Eabc')).toBe('abc');
    expect(displayNameFrom('\u3164')).toBeNull();   // 見えない名前は「無い」扱い
    expect(displayNameFrom('')).toBeNull();
    expect(displayNameFrom(undefined)).toBeNull();
    expect(displayNameFrom(12345)).toBeNull();       // 壊れたJSONが文字列連結へ流れない
    expect(displayNameFrom({})).toBeNull();
    expect(displayNameFrom(null)).toBeNull();
  });

  it('★clamp後も冪等(NFKCで伸びる入力を切った断面が壊れない)', () => {
    for (const raw of ['\u337F'.repeat(5), 'a'.repeat(40), '\u3000' + 'あ'.repeat(30)]) {
      const once = normalizePlayerNameInput(raw);
      expect(normalizePlayerNameInput(once)).toBe(once);
      expect(savePlayerName(once)).toBe(once);
    }
  });
});

// ★v0.25.2767(未決N-2・社長「おすすめで任せる」): 許可記号を `'` `!` `?` まで広げた。
describe('playerName: 許可記号の拡張(N-2)', () => {
  it("`'` `!` `?` は通る(O'Brien が OBrien に化けない)", () => {
    expect(sanitizePlayerName("O'Brien")).toBe("O'Brien");
    expect(sanitizePlayerName('やった!')).toBe('やった!');
    expect(sanitizePlayerName('だれ?')).toBe('だれ?');
  });

  it('★iOSのスマート引用符(U+2019)も `\'` へ寄せる(これが無いとiPhoneで打つと落ちる)', () => {
    // U+2019 はカテゴリ Pf なので、許可リストに ASCII の ' を足しただけでは落ちてしまう。
    // NFKC も U+2019 は畳まない。⇒ 明示的に寄せているかを固定する。
    expect(sanitizePlayerName('O\u2019Brien')).toBe("O'Brien");
    expect(sanitizePlayerName('O\u2018Brien')).toBe("O'Brien");
    expect(sanitizePlayerName('O\u02BCBrien')).toBe("O'Brien");
    expect(sanitizePlayerName('O\u2032Brien')).toBe("O'Brien");
    // 見た目が同じ4種が1つの形に畳まれる=「そっくりな別名」を作れない
    expect(new Set(['\u2019', '\u2018', '\u02BC', '\u2032'].map(c => sanitizePlayerName('a' + c))).size).toBe(1);
  });

  it('全角の ！？＇ は NFKC で半角へ畳まれてから通る', () => {
    expect(sanitizePlayerName('\uFF01\uFF1F')).toBe('!?');
    expect(sanitizePlayerName('a\uFF07b')).toBe("a'b");
  });

  it('許可していない記号は落としたまま(☆ ♪ @ # + など)', () => {
    expect(sanitizePlayerName('a\u2606b\u266Ac')).toBe('abc');
    expect(sanitizePlayerName('a@b#c+d')).toBe('abcd');
    expect(sanitizePlayerName('C++')).toBe('C');
  });
});

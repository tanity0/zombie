// プレイヤー名の台帳(社長指示v0.25.2477「守護霊にプレイヤーの名前を頭上に表示するようにしたい。
// 名前はオプションで設定可能。当初はplayer01234とかで数字が被らなそうなランダムで」)。
// tutorialArchive.ts / playerTraits.ts と同じ作法: 純関数+localStorage(try/catchでプライベートモード
// 耐性・store/React/PixiJS非依存=ヘッドレスでテスト可能)。
// この名前は守護霊プロファイル(playerTraits.PlayerProfile.srcName)にも記録される=将来オンラインで
// 他人のゴーストが来た時に「その人の名前」を頭上に出す構造(BOT_AND_GHOST.md §2.5 未決5=プロファイルは
// 将来の通信ペイロード)。

const STORAGE_KEY = 'zombie-player-name-v1';

/**
 * 手入力名の最大文字数(超過は切り詰め)。初期ランダム名(player+5桁=11文字)は生成物なので対象外。
 * ★v0.25.2765(社長指示「相場の数字で任せる」): 10 のまま据え置き。相場は
 * Switch 10 / Xbox 12 / X 15 / PSN 16 で、**頭上表示のある和ゲーとしては10が中央**。
 * 全角10文字は頭上表示だと既に横幅いっぱいなので、これ以上は増やさない。
 */
export const PLAYER_NAME_MAX_LEN = 10;

/**
 * ★結合文字(濁点・アクセント等)を基底1文字あたり何個まで許すか。
 * 1 に絞る理由は「ザルゴ文字」対策 — 結合文字は**字送りを進めずに上下へ積み上がる**ので、
 * 連打されると頭上の名前が**上下へ突き抜けて他のUIを覆う**(文字数の上限では防げない)。
 * é のような合成1個は通したいので 0 ではなく 1。
 */
export const PLAYER_NAME_MAX_COMBINING = 1;

// 初期名: `player`+ランダム5桁(0埋め)。例 player48291。「数字が被らなそうなランダム」(社長指示)
// =厳密な一意性は保証しない(現段階はローカル完結なので衝突しても実害なし。オンライン化時に採番可)。
// ※「手入力で player+5桁 を名乗れる=なりすまし」は**穴として扱わない**。この設計はアカウントを
//   持たない(社長明言「アカウントも何もいらない」)ので名前は元々一意ではなく、他人の名前を
//   名乗れること自体は初期名に限った話ではないため。
const generateName = (): string =>
  `player${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

/**
 * ★許可する記号(これ以外の記号・絵文字は落とす)。
 * 「K.O.」「A_B」「ジョン・ドゥ」程度が書ければ十分という判断で最小限に絞る。
 */
const EXTRA_ALLOWED = new Set([' ', '_', '-', '.', '・']);

/** 文字(L=漢字/かな/ラテン/長音符ー/々…)・数字(Nd)・結合文字(Mn)。絵文字はSoなのでここに入らない。 */
const ALLOWED_RE = /[\p{L}\p{Nd}\p{Mn}]/u;
const COMBINING_RE = /\p{Mn}/u;
const SPACE_RE = /\p{Zs}/u;

/**
 * ★異体字セレクタ。カテゴリが Mn なので ALLOWED_RE をすり抜けるが、**不可視**なので明示的に落とす
 * (放置すると「見た目が同じで中身が違う名前」を作れてしまう)。
 */
const isVariationSelector = (cp: number): boolean =>
  (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);

/**
 * ★純関数(v0.25.2765・社長指示「入れれない文字とか」): 名前として使えない文字を落とす。
 * **不許可文字は弾かずに除去する**(入力を拒否するとIME確定の途中で操作を奪うため。trim/切り詰めと同じ流儀)。
 *
 * 手順:
 *  1. **NFKC正規化** — 全角英数`Ａ`→`A` / 半角カナ`ｱ`→`ア` / 各種空白→半角空白。
 *     「見た目そっくりで別の文字列」を1つに畳む(他人に見せる名前なので、なりすましの余地を減らす)。
 *     ※長さの切り詰めは**この後**に行う(NFKCは`㍿`→`株式会社`のように伸びうるため)。
 *  2. 残った空白(Zs)は半角空白へ。
 *  3. **許可リスト方式**で1コードポイントずつ選別する。除外リストではなく許可リストにしているのは、
 *     これ1つで下記を**全部まとめて**塞げるため(個別に列挙すると必ず取りこぼす):
 *       - 制御文字(C0/C1)・改行・タブ … 描画崩れ
 *       - ゼロ幅文字(ZWSP/ZWNJ/ZWJ/BOM) … **「見えない名前」**が作れる=空欄チェックの抜け道
 *       - 双方向制御文字(LRO/RLO/PDF等) … **表示順を反転して別の名前に見せられる**(Trojan Source型)。
 *         オンラインで他人に見せる以上ここは必須。
 *       - タグ文字(U+E0000〜) … 不可視で任意の文字列を埋め込める
 *       - 絵文字(So) … ★端末のフォント依存で**他人の画面では別の絵/豆腐**になる。アプリ配布で
 *         フォントを同梱しても絵文字だけは外せない。相場(Switch/PSN/Xbox)も揃って不可。
 *  4. 結合文字は基底1文字につき `PLAYER_NAME_MAX_COMBINING` 個まで(ザルゴ対策)。基底の無い
 *     先頭・空白直後の結合文字は落とす。
 *  5. 連続空白は1つに畳んで trim。
 */
export const sanitizePlayerName = (raw: string): string => {
  let s: string;
  try {
    s = raw.normalize('NFKC');
  } catch {
    s = raw; // 正規化できない環境でも壊さない(以降の選別だけ効く)
  }
  let out = '';
  let marks = 0;      // 直近の基底文字に付いた結合文字の数
  let hasBase = false; // 直前が基底文字か(空白直後・先頭では false)
  for (const ch of s) {
    if (SPACE_RE.test(ch)) {
      out += ' ';
      marks = 0;
      hasBase = false;
      continue;
    }
    if (isVariationSelector(ch.codePointAt(0)!)) continue;
    if (COMBINING_RE.test(ch)) {
      if (!hasBase || marks >= PLAYER_NAME_MAX_COMBINING) continue;
      marks++;
      out += ch;
      continue;
    }
    if (!ALLOWED_RE.test(ch) && !EXTRA_ALLOWED.has(ch)) continue;
    marks = 0;
    hasBase = true;
    out += ch;
  }
  return out.replace(/ {2,}/g, ' ').trim();
};

// サロゲートペア(合成絵文字等)を割らないコードポイント単位の切り詰め。
// 切り詰めで末尾に空白が残りうるのでもう一度 trim する。
const clamp = (name: string): string =>
  [...sanitizePlayerName(name)].slice(0, PLAYER_NAME_MAX_LEN).join('').trim();

/**
 * 空欄で確定した時の名前(BOT_AND_GHOST.md §2.16 C-1 の叩き台「空なら『名無し』」)。
 * ※初期名(まだ一度も決めていない=保存が空)は従来どおりランダム生成の `player+5桁`。
 * 「空にして確定した」は**意思のある操作**なので、勝手にランダム名へ戻さずこの名前にする。
 */
export const PLAYER_NAME_WHEN_BLANK = '名無し';

/**
 * 入力欄の値を「確定する名前」へ正規化する純関数(§2.16 C-1)。
 * sanitize(文字種フィルタ) → 最大 PLAYER_NAME_MAX_LEN 文字(コードポイント単位)→ 空なら
 * PLAYER_NAME_WHEN_BLANK。
 * ★v0.25.2765: 旧コメントの「文字種フィルタは掛けない(オンライン化時に後決め)」は解消済み
 * =**送る側(この端末)で塞ぐ**のがここ。G6の受信側フィルタは BOT_AND_GHOST.md §2.11 の
 * 発注範囲(未実装)で、そこでもこの `sanitizePlayerName` を通す前提で設計してある。
 */
export const normalizePlayerNameInput = (raw: string): string => {
  const cleaned = clamp(raw);
  return cleaned.length > 0 ? cleaned : PLAYER_NAME_WHEN_BLANK;
};

/**
 * 現在のプレイヤー名。保存が無ければランダム初期名を生成して保存し、それを返す。
 * ★v0.25.2765: 保存値にも sanitize を掛ける(フィルタ導入前に保存された絵文字入りの名前が
 * そのまま頭上表示・オンライン送信へ流れるのを塞ぐ)。全部落ちて空になったら初期名を作り直す。
 * ★ただし**長さの切り詰めはここでは掛けない**。初期ランダム名は `player`+5桁=**11文字**で上限10を
 * 超えており、切り詰めると2回目の読み出しで `player1234` に化けるため(切り詰めは手入力に対する
 * 正規化=save/normalize側の責務。保存値はそのどちらかを通ってきたものしか無い)。
 * ※呼び出しは毎フレームではない(守護霊の湧き=directorTick / セッション確定=playerTraits)ので
 * 1回あたり十数文字の走査は無視できる。
 */
export const loadPlayerName = (): string => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const cleaned = sanitizePlayerName(raw);
      if (cleaned.length > 0) return cleaned;
    }
  } catch {
    /* 読めない環境では下の生成へ(保存も効かないだけで壊れない) */
  }
  const name = generateName();
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* 保存できなくても名前自体は返す(次回また生成されるだけ) */
  }
  return name;
};

/**
 * 名前を保存する: sanitize → 最大PLAYER_NAME_MAX_LEN文字へ切り詰め → 空文字ならランダム初期名を再生成。
 * 確定した名前を返す(UI側はこれで入力欄を正規化後の値に戻す)。
 */
export const savePlayerName = (name: string): string => {
  const cleaned = clamp(name);
  const next = cleaned.length > 0 ? cleaned : generateName();
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 保存できなくても確定名は返す(表示は成立する) */
  }
  return next;
};

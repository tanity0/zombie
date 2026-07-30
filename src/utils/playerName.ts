// プレイヤー名の台帳(社長指示v0.25.2477「守護霊にプレイヤーの名前を頭上に表示するようにしたい。
// 名前はオプションで設定可能。当初はplayer01234とかで数字が被らなそうなランダムで」)。
// tutorialArchive.ts / playerTraits.ts と同じ作法: 純関数+localStorage(try/catchでプライベートモード
// 耐性・store/React/PixiJS非依存=ヘッドレスでテスト可能)。
// この名前は守護霊プロファイル(playerTraits.PlayerProfile.srcName)にも記録される=将来オンラインで
// 他人のゴーストが来た時に「その人の名前」を頭上に出す構造(BOT_AND_GHOST.md §2.5 未決5=プロファイルは
// 将来の通信ペイロード)。

const STORAGE_KEY = 'zombie-player-name-v1';

/** 手入力名の最大文字数(超過は切り詰め)。初期ランダム名(player+5桁=11文字)は生成物なので対象外。 */
export const PLAYER_NAME_MAX_LEN = 10;

// 初期名: `player`+ランダム5桁(0埋め)。例 player48291。「数字が被らなそうなランダム」(社長指示)
// =厳密な一意性は保証しない(現段階はローカル完結なので衝突しても実害なし。オンライン化時に採番可)。
const generateName = (): string =>
  `player${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

// サロゲートペア(絵文字等)を割らないコードポイント単位の切り詰め。
const clamp = (name: string): string => [...name.trim()].slice(0, PLAYER_NAME_MAX_LEN).join('');

/**
 * 空欄で確定した時の名前(BOT_AND_GHOST.md §2.16 C-1 の叩き台「空なら『名無し』」)。
 * ※初期名(まだ一度も決めていない=保存が空)は従来どおりランダム生成の `player+5桁`。
 * 「空にして確定した」は**意思のある操作**なので、勝手にランダム名へ戻さずこの名前にする。
 */
export const PLAYER_NAME_WHEN_BLANK = '名無し';

/**
 * 入力欄の値を「確定する名前」へ正規化する純関数(§2.16 C-1)。
 * trim → 最大 PLAYER_NAME_MAX_LEN 文字(コードポイント単位)→ 空なら PLAYER_NAME_WHEN_BLANK。
 * 文字種フィルタは掛けない(オンライン化時にG-ON側の受信フィルタと合わせて後決め=§2.14)。
 */
export const normalizePlayerNameInput = (raw: string): string => {
  const cleaned = clamp(raw);
  return cleaned.length > 0 ? cleaned : PLAYER_NAME_WHEN_BLANK;
};

/** 現在のプレイヤー名。保存が無ければランダム初期名を生成して保存し、それを返す。 */
export const loadPlayerName = (): string => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw.trim().length > 0) return raw.trim();
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
 * 名前を保存する: trim → 最大PLAYER_NAME_MAX_LEN文字へ切り詰め → 空文字ならランダム初期名を再生成。
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

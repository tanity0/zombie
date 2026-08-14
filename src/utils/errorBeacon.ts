// 実機デバッグ用エラービーコン(v0.25.3324・アクラシエル診断)。
//
// このプロジェクトには「例外を1回だけconsoleへ出して以後は握り潰す」try/catchが数カ所ある
// (drawEnemy / 天使コントローラ / 裏ボス / アイドル)。実機(スマホ)ではconsoleが見えないため、
// そこで何かが起きても**誰にも観測できない**——アクラシエルの「白く歪んだまま固まる」報告
// (v0.25.3205→3207→3323で3度目)の実例外源が特定できない根本原因。
// ⇒ 握り潰した例外の要約を保持し、ゲーム内左下のバージョン表示(Game.tsx)に赤字で出す。
// 表示は最初の1件を保持(後続で上書きしない=初発が原因である可能性が最も高いため)。
let last: string | null = null;

/** 握り潰しcatchから呼ぶ。最初の1件だけ保持する。 */
export const reportSuppressedError = (tag: string, err: unknown): void => {
  if (last !== null) return;
  const e = err as Error | undefined;
  // メッセージ+スタック先頭1行(発生関数と行番号)だけの短い要約にする。
  const stackLine = (e?.stack ?? '').split('\n').find(l => l.includes('at ')) ?? '';
  last = `${tag}: ${e?.message ?? String(err)} ${stackLine.trim()}`.slice(0, 180);
};

/** 表示側(Game.tsx の ErrBeaconDebug)が1秒間隔で読む。無ければnull。 */
export const lastSuppressedError = (): string | null => last;

// 「連れて歩く」のオン/オフ(research/ESCORT_FOLLOW.md §9・社長指示2026-10-13)。
// 全拠点共通のスイッチ1つ。**既定はオフ**(社長指示2026-10-13「最初は連れていくをオフにして。縛りプレイの人もいるから」)。
// 端末に覚える(次の出撃でもそのまま)。オンにした人だけ '1' が残る=それ以外(未保存・壊れた値)はオフ。
// 判定(どこでボタンを出すか)も純関数でここに置く=React と store が同じ答えを使う。
const KEY = 'zombie.settings.escortFollow';

/** 保存値を読む。無い/壊れている時はオフ(既定オフ)。 */
export const loadEscortFollowEnabled = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export const saveEscortFollowEnabled = (on: boolean): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
};

/**
 * 切り替えのボタンを出すか: プレイヤーの中心が、解放済みの拠点の円の中に居る時だけ(§9-1)。
 * 円の中の拠点の id を返す(居なければ null)。押した時に「その拠点の軍人が一言返す」のに使う。
 */
export const followToggleBaseAt = (
  px: number, py: number,
  bases: readonly { id: string; x: number; y: number; status: string }[],
  radius: number,
): string | null => {
  for (const b of bases) {
    if (b.status === 'captured' && Math.hypot(px - b.x, py - b.y) <= radius) return b.id;
  }
  return null;
};

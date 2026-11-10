// 「連れて歩く」のオン/オフ(research/ESCORT_FOLLOW.md §9・社長指示2026-10-13)。
// 全拠点共通のスイッチ1つ。**既定はオフ**(社長指示2026-10-13「最初は連れていくをオフにして。縛りプレイの人もいるから」)。
// 端末に覚える(次の出撃でもそのまま)。オンにした人だけ '1' が残る=それ以外(未保存・壊れた値)はオフ。
// 切り替えはショップの画面の「軍人の同行」の1行だけ(§9-8・スマホも PC も同じ)。ここには、押した時に返事をする軍人を決める純関数も置く。
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
 * 返事をする拠点: プレイヤーの中心が、解放済みの拠点の円の中に居ればその拠点の id(居なければ null=武器商人の所など・返事なし)。
 * ショップで「軍人の同行」を押した時に「その拠点の軍人が一言返す」のに使う(§9-8)。ボタンを出すかどうかは決めない
 * (旧 v0.25.5014〜5020 は円の中だけ下中央に札を出す判定にも使っていた。札は撤去済み)。
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

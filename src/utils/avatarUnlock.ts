// ★手に入れて使えるようになるアバター(社長指示2026-11-20・research/BRAWLER.md §36 の後: 斗戦勝仏を初めて倒した報酬)。
// 依存は台帳の型だけ(store / PixiJS を読まない)。台帳 LOCKED_AVATARS に載っているアバターだけが「まだ持っていない」になり得る
// (載っていない既存のセットは今までどおり最初から選べる)。手に入れた物は端末の進行に1つのキーで持ち、resetProgress() で消える。
import type { AvatarId } from '../data/avatars';
import { isUnlockAllOn } from './unlockAll'; // 開発用「すべて解放」(選べるだけ。手に入れた記録は書き換えない)

/** 手に入れるまで選べないアバター。 */
export const LOCKED_AVATARS: readonly AvatarId[] = ['tosen-set'];
const KEY = 'zombie.progress.avatarUnlocks';

const readSet = (): Set<AvatarId> => {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? (raw.filter(v => typeof v === 'string') as AvatarId[]) : []);
  } catch { return new Set(); }
};

/** そのアバターを選べるか(台帳に無い物は常に選べる)。 */
export const isAvatarUnlocked = (id: AvatarId): boolean => !LOCKED_AVATARS.includes(id) || readSet().has(id) || isUnlockAllOn();

/** 手に入れる。初めて手に入れた時だけ true(帯・リザルトを出すのはこの時だけ)。 */
export const unlockAvatar = (id: AvatarId): boolean => {
  if (!LOCKED_AVATARS.includes(id)) return false;
  const s = readSet();
  if (s.has(id)) return false;
  s.add(id);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
  return true;
};

/** 進行リセット: 手に入れたアバターを消す。 */
export const clearAvatarUnlocks = (): void => {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY); } catch { /* ignore */ }
};

/** 斗戦勝仏(孫悟空の済=Lv5)を倒した時に手に入るアバター。 */
export const TOSEN_AVATAR: AvatarId = 'tosen-set';
/** 倒した孫悟空のレベルで手に入るアバター(無ければ null)。数える出撃かどうかは呼ぶ側(kenkiKillCounts)。 */
export const avatarRewardOnKenkiKill = (killedLv: number): AvatarId | null => (killedLv === 5 ? TOSEN_AVATAR : null);

// 名前の純粋な浄化処理は、ブラウザとCloudflare Workerで同じ実装を使う。
import {
  PLAYER_NAME_MAX_LEN,
  PLAYER_NAME_MAX_COMBINING,
  sanitizePlayerName,
  clampPlayerName,
  displayNameFrom,
} from '../../shared/playerName.mjs';

export {
  PLAYER_NAME_MAX_LEN,
  PLAYER_NAME_MAX_COMBINING,
  sanitizePlayerName,
  displayNameFrom,
};

const STORAGE_KEY = 'zombie-player-name-v1';
export const PLAYER_NAME_WHEN_BLANK = '名無し';

const generateName = (): string =>
  `player${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

export const normalizePlayerNameInput = (raw: string): string => {
  const cleaned = clampPlayerName(raw);
  return cleaned.length > 0 ? cleaned : PLAYER_NAME_WHEN_BLANK;
};

export const loadPlayerName = (): string => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const cleaned = clampPlayerName(raw);
      if (cleaned.length > 0) {
        if (cleaned !== raw) {
          try { localStorage.setItem(STORAGE_KEY, cleaned); } catch { /* 表示値は浄化済み */ }
        }
        return cleaned;
      }
    }
  } catch { /* 保存不可なら一時名へ */ }
  const name = generateName();
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* 一時名だけ返す */ }
  return name;
};

export const savePlayerName = (name: string): string => {
  const cleaned = clampPlayerName(name);
  const next = cleaned.length > 0 ? cleaned : generateName();
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 表示は継続できる */ }
  return next;
};

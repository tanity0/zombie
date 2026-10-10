import {
  GHOST_ARRIVAL_COMMENT_DEFAULT,
  GHOST_COMMENT_MAX_LEN,
  GHOST_DEPARTURE_COMMENT_DEFAULT,
  displayGhostComment,
  sanitizeGhostComment,
} from '../../shared/ghostSanitize.mjs';

export {
  GHOST_ARRIVAL_COMMENT_DEFAULT,
  GHOST_COMMENT_MAX_LEN,
  GHOST_DEPARTURE_COMMENT_DEFAULT,
  displayGhostComment,
  sanitizeGhostComment,
};

export interface GhostComments {
  arrivalComment: string;
  departureComment: string;
}

const STORAGE_KEY = 'zombie-ghost-comments-v1';

export const loadGhostComments = (): GhostComments => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const value = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    return {
      arrivalComment: displayGhostComment(value.arrivalComment, GHOST_ARRIVAL_COMMENT_DEFAULT),
      departureComment: displayGhostComment(value.departureComment, GHOST_DEPARTURE_COMMENT_DEFAULT),
    };
  } catch {
    return {
      arrivalComment: GHOST_ARRIVAL_COMMENT_DEFAULT,
      departureComment: GHOST_DEPARTURE_COMMENT_DEFAULT,
    };
  }
};

export const saveGhostComments = (comments: GhostComments): GhostComments => {
  const next = {
    arrivalComment: displayGhostComment(comments.arrivalComment, GHOST_ARRIVAL_COMMENT_DEFAULT),
    departureComment: displayGhostComment(comments.departureComment, GHOST_DEPARTURE_COMMENT_DEFAULT),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* 表示値は継続できる */ }
  return next;
};

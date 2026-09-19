export const PLAYER_NAME_MAX_LEN = 11;
export const PLAYER_NAME_MAX_COMBINING = 1;

const EXTRA_ALLOWED = new Set([' ', '_', '-', '.', '・', "'", '!', '?']);
const CANONICAL = new Map([
  ['‘', "'"], ['’', "'"], ['ʼ', "'"], ['′', "'"],
]);
const ALLOWED_RE = /[\p{L}\p{Nd}\p{Nl}\p{Mn}]/u;
const COMBINING_RE = /\p{Mn}/u;
const SPACE_RE = /\p{Zs}/u;
const IGNORABLE_RE = /\p{Default_Ignorable_Code_Point}/u;

/** Browser/Worker共通のニックネーム浄化。外部データは必ずここを通す。 */
export const sanitizePlayerName = (raw) => {
  if (typeof raw !== 'string') return '';
  let source;
  try { source = raw.normalize('NFKC'); } catch { source = raw; }
  let out = '';
  let marks = 0;
  let hasBase = false;
  for (const rawChar of source) {
    const ch = CANONICAL.get(rawChar) ?? rawChar;
    if (SPACE_RE.test(ch)) {
      out += ' ';
      marks = 0;
      hasBase = false;
      continue;
    }
    if (IGNORABLE_RE.test(ch)) continue;
    if (COMBINING_RE.test(ch)) {
      if (!hasBase || marks >= PLAYER_NAME_MAX_COMBINING) continue;
      marks += 1;
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

export const clampPlayerName = (raw) =>
  [...sanitizePlayerName(raw)].slice(0, PLAYER_NAME_MAX_LEN).join('').trim();

export const displayNameFrom = (raw) => {
  if (typeof raw !== 'string') return null;
  const cleaned = clampPlayerName(raw);
  return cleaned.length > 0 ? cleaned : null;
};

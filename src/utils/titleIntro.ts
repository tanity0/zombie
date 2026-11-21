// タイトルの描き上げ(TitleScreen)を「この起動でもう流したか」の1か所(App と TitleScreen が同じ物を読む)。
// 起動して最初にタイトルが出る時だけ流す。動きを減らす設定・`?nointro=1` では流さない。
let introPlayedThisLoad = false;

/** 描き上げをこれから流すか(=まだ控えているか)。 */
export const titleIntroWanted = (): boolean => {
  if (introPlayedThisLoad || typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get('nointro') === '1') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  } catch { /* 判定できなければ流す */ }
  return true;
};

export const markTitleIntroPlayed = (): void => { introPlayedThisLoad = true; };

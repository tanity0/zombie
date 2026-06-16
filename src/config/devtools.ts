// テスト開発中のみ見せるツール群(FPS/撃破数表示・ダンスモード・BENCH・各種デバッグ入力)の表示可否。
// 社長は本番サイト(GitHub Pages)で確認するため import.meta.env.DEV は使わない(本番でも見せたい)。
// 既定は ON。デモ等で隠したいときは URL に ?dev=0 を付ける。リリース時は DEFAULT を false にする。
const DEFAULT_DEV_TOOLS = true;

export const DEV_TOOLS_ENABLED: boolean = (() => {
  if (typeof window === 'undefined') return DEFAULT_DEV_TOOLS;
  const p = new URLSearchParams(window.location.search).get('dev');
  if (p === '0' || p === 'off' || p === 'false') return false;
  if (p === '1' || p === 'on' || p === 'true') return true;
  return DEFAULT_DEV_TOOLS;
})();

// キャラ選択の全画面立ち絵(社長提供)。クラス→立ち絵ファイルの対応=武器イメージで割当(差し替え容易)。
// MissionSelect から切り出した(社長報告v0.25.2224「バージョンあがってすぐだとキャラ選択の絵が
// 読み込めてない」対策で、起動時プリロード(App)と表示側(MissionSelect)の両方から同じURLを使うため。
// 2箇所に同じ生成規則を書くと将来ズレるので、ここを唯一の出どころにする)。
import type { CharacterClass } from '../types/game';

export const CLASS_PORTRAIT: Record<CharacterClass, string> = {
  warrior: 'portrait-shotgun',     // ヘビーガンナー(ショットガン)=タイトルの少女
  mage: 'portrait-sniper',         // マークスマン(マグナム/狙撃)=スコープ付き長銃の金髪
  rogue: 'portrait-knife',         // ストライカー(ファイティングナイフ)=短剣の赤髪
  necromancer: 'portrait-handgun', // スカベンジャー(ハンドガン)=拳銃の黒髪
};

// ?v=<version> はデプロイ更新を確実に反映させるためのキャッシュバスター(=バージョンが上がると
// 必ず再取得になる)。それ自体は意図どおりなので、下の先読みで「選択画面を開く前に取り終える」ことで
// 初回の空白を防ぐ。
export const portraitSrcFor = (id: CharacterClass): string =>
  `${import.meta.env.BASE_URL}sprites/portraits/${CLASS_PORTRAIT[id]}.png?v=${encodeURIComponent(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev')}`;

// 起動時に全クラスの立ち絵を先読みしてブラウザキャッシュに載せる。デコードまで済ませたいので
// decode() があれば待つ(失敗は無視=表示側が従来どおり onLoad で出す)。
export const preloadClassPortraits = (): Promise<void> => {
  if (typeof Image === 'undefined') return Promise.resolve();
  const jobs = (Object.keys(CLASS_PORTRAIT) as CharacterClass[]).map(id => new Promise<void>(resolve => {
    const im = new Image();
    im.onload = () => { (im.decode?.() ?? Promise.resolve()).catch(() => {}).finally(() => resolve()); };
    im.onerror = () => resolve();
    im.src = portraitSrcFor(id);
  }));
  return Promise.all(jobs).then(() => undefined);
};

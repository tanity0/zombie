// キャラ選択の全画面立ち絵(社長提供)。クラス→立ち絵ファイルの対応=武器イメージで割当(差し替え容易)。
// MissionSelect から切り出した(社長報告v0.25.2224「バージョンあがってすぐだとキャラ選択の絵が
// 読み込めてない」対策で、起動時プリロード(App)と表示側(MissionSelect)の両方から同じURLを使うため。
// 2箇所に同じ生成規則を書くと将来ズレるので、ここを唯一の出どころにする)。
import type { CharacterClass } from '../types/game';
import { CHARACTER_CLASSES } from './campaign';
import { ASSET_VERSION } from '../config/assetVersion';

export const CLASS_PORTRAIT: Record<CharacterClass, string> = {
  warrior: 'portrait-shotgun',     // ヘビーガンナー(ショットガン)=タイトルの少女
  mage: 'portrait-sniper',         // マークスマン(マグナム/狙撃)=スコープ付き長銃の金髪
  rogue: 'portrait-knife',         // ストライカー(ファイティングナイフ)=短剣の赤髪
  necromancer: 'portrait-handgun', // スカベンジャー(ハンドガン)=拳銃の黒髪
};

// キャッシュバスターは**素材用の固定版**(ASSET_VERSION)を使う。アプリ版(__APP_VERSION__)は毎pushで
// 上がるため、コードだけの変更でも立ち絵(計9.4MB)が毎回再DLになっていた(社長指摘v0.25.2240)。
// 立ち絵を同名で差し替えた時だけ config/assetVersion.ts を上げれば、そのときだけ確実に更新される。
export const portraitSrcFor = (id: CharacterClass): string =>
  `${import.meta.env.BASE_URL}sprites/portraits/${CLASS_PORTRAIT[id]}.png?v=${encodeURIComponent(ASSET_VERSION)}`;

// URLを1本先読みしてブラウザキャッシュに載せる。デコードまで済ませたいので decode() があれば待つ
// (失敗は無視=表示側が従来どおり onLoad で出す)。
const preloadImage = (url: string): Promise<void> => new Promise<void>(resolve => {
  const im = new Image();
  im.onload = () => { (im.decode?.() ?? Promise.resolve()).catch(() => {}).finally(() => resolve()); };
  im.onerror = () => resolve();
  im.src = url;
});

// 起動時に全クラスの立ち絵を先読みする。
export const preloadClassPortraits = (): Promise<void> => {
  if (typeof Image === 'undefined') return Promise.resolve();
  const jobs = (Object.keys(CLASS_PORTRAIT) as CharacterClass[]).map(id => preloadImage(portraitSrcFor(id)));
  return Promise.all(jobs).then(() => undefined);
};

// キャラ選択の下段で歩いているドット絵のコマURL(待機画像から導出)。表示側(MissionSelect)と
// 先読み側で同じ規則を使うため、ここを唯一の出どころにする(社長報告v0.25.2233「下のドット絵が読めてない」)。
export const menuWalkFrameSrc = (idleSrc: string, frame: number): string =>
  idleSrc.replace('-idle.png', `-walk-${frame}.png`);

// クラスの待機+歩き5コマ(=キャラ選択の下段タイル)を先読みする。1枚ずつが小さいので
// 全クラスまとめても軽い。これが無いと「選択画面を開いた瞬間に初取得」=更新直後は空欄になる。
export const preloadClassWalkSprites = (): Promise<void> => {
  if (typeof Image === 'undefined') return Promise.resolve();
  const urls: string[] = [];
  for (const c of CHARACTER_CLASSES) {
    urls.push(c.sprite);
    for (let f = 0; f < 5; f++) urls.push(menuWalkFrameSrc(c.sprite, f));
  }
  return Promise.all(urls.map(preloadImage)).then(() => undefined);
};

// ボスメーカー(開発用ツール)のエントリ。BOSS_MAKER.md §19-5 / §19-12。
//
// ★このページが**開発用の出撃メニューを持つ**(社長指示v0.25.2862「ボスメーカーは完全に切り分けた
//   ので、もうTOPにメニュー表示しないでください」「ボスメーカー側にメニューは移植してください」)。
//   ゲーム本編のタイトルからは入口ごと消した=プレイヤーの画面に開発用の物が出ない。
//
// 画面の出し分けは**URLに出撃フラグがあるか**の1点だけ:
//   - 無い  → 出撃メニュー(ボス戦テスト + 調整部屋)
//   - 有る  → その出撃(調整部屋なら調整UIも重ねる)
// メニューからの出撃は `window.location.search` の差し替え=ページ再読込。強制出現フラグは
// `useGameLoop` のモジュールロード時定数なので、**読込前にURLへ載っている必要がある**
// (だからこのページはリロードで入る。※ゲーム本編のボスラッシュは実行時状態へ移したのでリロード無し)。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App.tsx';
import '../../index.css';
import { bootstrapRuntime } from '../../bootstrap';
import { BossMakerPanel } from './BossMakerPanel';
import BossTestMenu from './BossTestMenu';
import { FORCE_PARAMS } from '../../utils/bossTest';

bootstrapRuntime();

const params = new URLSearchParams(window.location.search);
const isMaker = params.get('bossmaker') === '1';
const isRun = FORCE_PARAMS.some(k => params.get(k) === '1');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRun
      // bare: ゲームの画面(タイトル/メニュー/リザルト/OP等)を一切描かない(社長指示v0.25.2851)。
      ? <App bare playingOverlay={isMaker ? <BossMakerPanel /> : undefined} />
      : <BossTestMenu />}
  </StrictMode>
);

// ボスメーカー(開発用ツール)のエントリ。BOSS_MAKER.md §19-5。
//
// ★ここで起動クエリを注入してはいけない。
//   `?bossmaker=1` / `?nospawn=1` の判定は `useGameLoop.ts` の**モジュールスコープ定数**なので、
//   このファイルの本体が走る頃には既に false で焼き付いている(ESMは静的importを全部評価してから
//   モジュール本体を実行する)。注入は `bossmaker.html` のインライン classic script が行う(§19-5-a)。
//
// ★このページの役割は「ゲームと同じエンジンを起動し、その上に調整UIを重ねる」だけ。
//   エンジン(store/useGameLoop/pixi)は本編と**同じ物を import** する=複製しない。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App.tsx';
import '../../index.css';
import { bootstrapRuntime } from '../../bootstrap';
import { BossMakerPanel } from './BossMakerPanel';

bootstrapRuntime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* bare: ゲームの画面(タイトル/メニュー/リザルト/OP等)を一切描かない(社長指示v0.25.2851)。 */}
    <App bare playingOverlay={<BossMakerPanel />} />
  </StrictMode>
);

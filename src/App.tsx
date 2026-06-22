import React, { useEffect, useRef, useState } from 'react';
import Game from './components/Game';
import MissionSelect from './components/MissionSelect';
import TitleScreen from './components/TitleScreen';
import GameOverScreen from './components/GameOverScreen';
import LoadingScreen from './components/LoadingScreen';
import OrientationGuard from './components/OrientationGuard';
import type { BenchmarkResult } from './components/BenchmarkOverlay';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmScene, preloadAllAudio, unlockDanceAudio } from './audio/audioManager';
import { ensureTextures, preloadBackgrounds } from './pixi/pixiTextures';
import { getSelectedStageId, getSelectedFreeMode, markStageCleared } from './data/progress';
import { getStage } from './data/campaign';

const LOADING_MIN_MS = 650;

function App() {
  const [gameState, setGameState] = useState<GameState>('title'); // 最初にタイトル(the ONE)を即表示
  const [benchmarkMode, setBenchmarkMode] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingBenchmarkRef = useRef(false);
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);

  // 本物の素材ロード(テクスチャ+音声/BGM/SFX)を起動直後にバックグラウンドで開始。
  // ただし「ゾンビサバイバル」ローディング画面は出さず、タイトルを先に見せる。
  // 実際のロード完了待ちは START(同意)後の TitleScreen 'loading' フェーズで行う。
  const ensurePreload = (): Promise<void> => {
    if (!preloadPromiseRef.current) {
      const started = performance.now();
      preloadPromiseRef.current = Promise.all([
        ensureTextures().catch(() => {}),
        preloadBackgrounds().catch(() => {}), // 背景パノラマ/床/地平帯=出撃時フラッシュ防止のため先読み
        preloadAllAudio(),
      ]).then(async () => {
        const remaining = LOADING_MIN_MS - (performance.now() - started);
        if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      });
    }
    return preloadPromiseRef.current;
  };

  useEffect(() => {
    void ensurePreload(); // タイトル表示と並行して素材DLを先行開始(体感待ち時間を短縮)
  }, []);

  useEffect(() => {
    // menu=タイトル曲 / playing=ステージ曲 / その他(loading・gameOver・victory)=停止。
    // ステージBGMはステージデータから解決(stage.bgm 明示 > theme==='lab'は研究所曲 > 既定=stage1)。
    // ※ステージ2は屋外ラボ(indoorMode=false)なので、indoorMode ではなく theme で判定する。
    if (gameState === 'playing') {
      const st = getStage(getSelectedStageId());
      const bgmKey = st?.bgm ?? (st?.theme === 'lab' ? 'lab' : 'default');
      setBgmScene('game', bgmKey);
    }
    else if (gameState === 'menu') setBgmScene('menu');
    else setBgmScene('off');
  }, [gameState]);
  
  const startGame = async (characterClass: string, benchmark = false) => {
    // Web/iOS Safari BGM unlock workaround. Remove for native-app audio.
    unlockDanceAudio();
    const validClass = ['warrior', 'mage', 'rogue', 'necromancer'].includes(characterClass)
      ? characterClass as CharacterClass
      : 'warrior';

    pendingBenchmarkRef.current = benchmark;
    setBenchmarkMode(benchmark);
    setBenchmarkResult(null);
    // 素材ロード完了を待ってからゲーム開始(通常はタイトルのローディング段階で既に完了)。
    await ensurePreload();
    // 屋内(研究施設)ステージか。resetGame が labMap で初期化するため reset 前に渡す。ベンチは除外。
    const stageForRun = benchmark ? undefined : getStage(getSelectedStageId());
    useGameStore.getState().setPendingIndoor(!!stageForRun?.indoor);
    useGameStore.getState().setPendingStageTheme(stageForRun?.theme === 'lab' ? 'lab' : 'forest');
    useGameStore.getState().setPendingFarBackdrop(stageForRun?.farBackdrop ?? '');
    useGameStore.getState().setPendingNearHorizon(stageForRun?.nearHorizon ?? '');
    resetGame(validClass);
    // 出撃ごとの会話は選択ミッションから設定。フリー(周回)/未選択/ベンチは空=会話なし。
    const free = getSelectedFreeMode();
    const selectedStage = (benchmark || free) ? undefined : stageForRun;
    useGameStore.getState().setIntroDialogueLines(selectedStage?.main.dialogue ?? []);
    setBenchmarkMode(pendingBenchmarkRef.current);
    setGameState('playing');
  };

  const handleGameOver = () => {
    setGameState('gameOver');
  };

  const handleReturn = () => {
    // 商人「帰還」=任意撤収。進行(クリア解放)はさせず、スコア計上のリザルトへ。装備は持ち帰り可。
    setGameState('returned');
  };

  const handleVictory = () => {
    // 勝利したら選択中ステージのメインミッションをクリア扱いにし、次ステージを解放する。
    // (ダンス練習/ベンチは選択ステージを空にしているのでここでは何も起きない)
    // フリー(周回)出撃は進行に影響させない=クリア扱いにしない。
    const stageId = getSelectedStageId();
    if (stageId && !getSelectedFreeMode()) markStageCleared(stageId);
    setGameState('victory');
  };

  const returnToMenu = () => {
    setBenchmarkMode(false);
    setBenchmarkResult(null);
    setGameState('menu');
  };

  const handleBenchmarkComplete = (result: BenchmarkResult) => {
    setBenchmarkResult(result);
    setBenchmarkMode(false);
    setGameState('gameOver');
  };

  return (
    <div className="w-full h-full bg-gray-900 text-white">
      {gameState === 'title' && (
        <TitleScreen
          onStart={() => { unlockDanceAudio(); setBgmScene('menu'); }} // タップ瞬間にBGM解禁
          waitForAssets={ensurePreload}                                // 同意後の本物ローディング(完了待ち)
          onDone={() => setGameState('menu')}                          // 暗転し切ったらセレクトへ
        />
      )}

      {gameState === 'menu' && (
        <MissionSelect
          onStartGame={(characterClass) => startGame(characterClass, false)}
          onStartBenchmark={(characterClass) => startGame(characterClass, true)}
        />
      )}

      {gameState === 'loading' && <LoadingScreen startup />}
      
      {gameState === 'playing' && (
        <Game
          onGameOver={handleGameOver}
          onVictory={handleVictory}
          onReturn={handleReturn}
          benchmarkMode={benchmarkMode}
          onBenchmarkComplete={handleBenchmarkComplete}
        />
      )}

      {(gameState === 'gameOver' || gameState === 'victory' || gameState === 'returned') && (
        <GameOverScreen
          won={gameState === 'victory'}
          withdraw={gameState === 'returned'}
          stats={gameStats}
          benchmarkResult={benchmarkResult}
          onReturnToMenu={returnToMenu}
          onPlayAgain={() => startGame(useGameStore.getState().characterClass)}
        />
      )}

      {/* 縦持ちガード(タッチ端末を横向きにしたら全面表示。PCは対象外)。最前面。 */}
      <OrientationGuard />
    </div>
  );
}

export default App;

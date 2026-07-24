import { useEffect, useRef, useState } from 'react';
import Game from './components/Game';
import MissionSelect from './components/MissionSelect';
import TitleScreen from './components/TitleScreen';
import GameOverScreen from './components/GameOverScreen';
import EndingScreen from './components/EndingScreen';
import LoadingScreen from './components/LoadingScreen';
import OrientationGuard from './components/OrientationGuard';
import OpeningScene from './components/OpeningScene';
import MansionCorridorPreview from './components/MansionCorridorPreview';
import { getLoadProgressWindow, subscribeLoadProgress, loadProgressResetWindow } from './utils/loadProgress';
import type { BenchmarkResult } from './components/BenchmarkOverlay';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmScene, preloadAllAudio, unlockDanceAudio, primeMenuBgm, preloadStageBgm, setAudioSuspended, clearSfxThrottle, attachAudioGestureRecovery } from './audio/audioManager';
import { ensureTextures, preloadBackgrounds } from './pixi/pixiTextures';
import { loadProgressBegin, loadProgressDone } from './utils/loadProgress';
import {
  getSelectedStageId, setSelectedStageId, getSelectedFreeMode, markStageCleared, syncQuestStageClear,
  getSelectedMission, getStoryFlags, updateStoryFlags, getClearedStages,
} from './data/progress';
import { unlockRecordsForStage, unlockRecords, backfillStoryArchive, ENDING_RECORD_IDS } from './data/storyArchive';
import { subsAllCompletedFromMeta, endingFollowup } from './utils/storyProgress';
import { getEventQuestConfig } from './utils/eventQuest';
import { getStage } from './data/campaign';
import { isPixiRenderer } from './config/renderer';

const LOADING_MIN_MS = 650;

// 出撃ローディングのオーバーレイ(v0.25.1827・社長指示「出撃ローディングにも%表示」)。
// PixiStage初期化のウィンドウ進捗(loadProgressResetWindow基準)を購読して%を出す。
// キャッシュ済みなら一瞬で消えるので、%が見えるのは実際に読み込みが走っている時だけ。
function SortieLoadingOverlay() {
  const [pct, setPct] = useState(() => Math.round(getLoadProgressWindow() * 100));
  useEffect(() => subscribeLoadProgress(() => setPct(Math.round(getLoadProgressWindow() * 100))), []);
  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      <span className="text-[11px] tracking-[0.34em] tabular-nums text-purple-200/55">LOADING… {pct}%</span>
    </div>
  );
}

function App() {
  const [gameState, setGameState] = useState<GameState>('title'); // 最初にタイトル(the ONE)を即表示
  // オープニングシーン(社長支給v0.25.2002): 当面 ?opening=1 でプレビュー再生(タイトルの上に全画面オーバーレイ)。
  // ?opening=2 は射撃シーンから開始(調整用ショートカット)。?opening=3 は蘇生処置パート(字幕)から開始。
  // 本番の再生タイミングは後で確定。
  const [openingParam] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('opening'); } catch { return null; }
  });
  const [showOpening, setShowOpening] = useState(openingParam === '1' || openingParam === '2' || openingParam === '3');
  // ステージ6(洋館)奥行き通路の単体プレビュー(?corridor=1・v0.25.2077の相談用プロトタイプ)。
  const [corridorPreview] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('corridor') === '1'; } catch { return false; }
  });
  const [benchmarkMode, setBenchmarkMode] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const preloadPromiseRef = useRef<Promise<void> | null>(null);
  const pendingBenchmarkRef = useRef(false);
  const smokeHandledRef = useRef(false);
  // the ONE 通常エンディング(統合正本7章): M7(stage-7)勝利後、リザルトから「メニューに戻る」で
  // 聴取記録エンディングを挟む予約。出撃(startGame)でクリア=古い予約を持ち越さない。
  const pendingEndingRef = useRef(false);
  const resetGame = useGameStore(state => state.resetGame);
  const gameStats = useGameStore(state => state.gameStats);
  // Pixi レンダラの初フレームが出るまで true にならない(PixiStage が setRendererReady)。
  // 出撃時のレンダラ初期化/テクスチャGPUアップロード中は、黒画面ではなくローディング画面を被せる。
  const rendererReady = useGameStore(state => state.rendererReady);
  // フェイルセーフ: 何らかの理由で rendererReady が立たなくてもローディングが永久に残らないよう、
  // 出撃中に一定時間で強制的にオーバーレイを外す保険(PixiStage 側の catch と二重の安全網)。
  const [loadOverlayTimedOut, setLoadOverlayTimedOut] = useState(false);
  // 音声のジェスチャ復帰保険(v0.25.2160): どのタップ/キーでも「context resume+止まったBGMの拾い直し」。
  useEffect(() => { attachAudioGestureRecovery(); }, []);
  useEffect(() => {
    if (gameState !== 'playing' || rendererReady) { setLoadOverlayTimedOut(false); return; }
    const id = window.setTimeout(() => setLoadOverlayTimedOut(true), useGameStore.getState().corridorMode ? 16000 : 6000); // 洋館通路は通路テクスチャ待ちぶん延長(v0.25.2122)
    return () => window.clearTimeout(id);
  }, [gameState, rendererReady]);

  // 資料室の遡及解放(共有パッケージ2026-07-23): 起動時に1回、クリア済みステージ/EDフラグから
  // 本来解放されているべき資料を静かに差分追加する(初期資料01・02の保証もここ)。冪等・既読不変・
  // ポップアップなし(未読NEWバッジだけ付く)。
  useEffect(() => {
    backfillStoryArchive(getClearedStages(), id => getStage(id)?.main.unlockedRecordIds ?? [], getStoryFlags());
  }, []);

  // 本物の素材ロード(テクスチャ+音声/BGM/SFX)を起動直後にバックグラウンドで開始。
  // ただし「ゾンビサバイバル」ローディング画面は出さず、タイトルを先に見せる。
  // 実際のロード完了待ちは START(同意)後の TitleScreen 'loading' フェーズで行う。
  const ensurePreload = (): Promise<void> => {
    if (!preloadPromiseRef.current) {
      const started = performance.now();
      loadProgressBegin(1); // ローディング%(v0.25.1776): フォント待ちも1ユニットとして計上
      preloadPromiseRef.current = Promise.all([
        ensureTextures().catch(() => {}),
        preloadBackgrounds().catch(() => {}), // 背景パノラマ/床/地平帯=出撃時フラッシュ防止のため先読み
        preloadAllAudio(),
        // ゲームフォント(?font=)の読込完了を待つ。Pixi のダメージ数字アトラス/テキストが
        // フォールバックで焼かれて差し替わらないのを防ぐ(main.tsx で load を開始済み)。
        (typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve())
          .then(() => loadProgressDone()),
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

  // バックグラウンド化(タブ/アプリが裏に回る)でBGM(タイトル曲含む)とゲーム進行を一括で止め、
  // 復帰で再開する。再開時の時間ジャンプは useGameLoop 側の deltaTime クランプで吸収される。
  // ★この applyBackground は「後で再利用する前提」の単一窓口。将来ネイティブアプリ化したときの
  //   OSのpause/resumeブリッジ(AppState等)も、この同じ関数を呼べば挙動を完全に共有できる。
  useEffect(() => {
    const applyBackground = (bg: boolean) => {
      useGameStore.getState().setBackgrounded(bg); // ゲームシム(useGameLoop)を凍結/解凍
      setAudioSuspended(bg);                       // BGMを一時停止/再開(タイトル曲も対象)
    };
    const onVisibility = () => applyBackground(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    // pagehide/pageshow も拾う(iOS Safariで visibilitychange が来ないケースの保険)。
    const onPageHide = () => applyBackground(true);
    const onPageShow = () => applyBackground(false);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
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
    // v0.25.1568: 選択ステージのBGMを開始前に先読み(非デフォルトステージのステージ開始BGM遅延対策)。
    // gameState==='playing' の useEffect と同じキー導出。ベンチはBGM無しなので除外。
    if (!benchmark) {
      const selStage = getStage(getSelectedStageId());
      preloadStageBgm(selStage?.bgm ?? (selStage?.theme === 'lab' ? 'lab' : 'default'));
    }
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
    pendingEndingRef.current = false; // 新しい出撃で古いエンディング予約を破棄
    // 洋館［SUB］再訪(統合正本9章): selectedMission='revisit' かつ stage-6 の出撃だけ再訪ラン。
    const revisitRun = !benchmark && !getSelectedFreeMode()
      && getSelectedMission() === 'revisit' && stageForRun?.id === 'stage-6';
    // ステージ6(古い洋館)メイン出撃=奥行き通路モード(とりあえず統合v0.25.2105・社長指示)。
    // 再訪(SUB)・屋内・ベンチ・フリー周回は対象外。resetGame が pendingCorridor から corridorMode を決める。
    const corridorRun = !benchmark && !getSelectedFreeMode()
      && stageForRun?.id === 'stage-6' && !revisitRun && !stageForRun?.indoor;
    // stage-7 は本編M7(グレン戦・climax)。通常プレイは導入会話+グレン戦を出す。cine映像の実験台(?cine=1)の時だけ
    // イベントを止めてクリーンに確認できるようにする(社長指示v0.25.1876/1879)。
    // ※storyBossOnly は cine でも維持する=stage-7 を「storyBossステージ」のまま(通常湧き無し・護衛NPC無し)。
    //   cine時に止めるのは「グレン戦のボス出現(useGameLoop側)」と「導入会話(下の setIntroDialogueLines)」だけ。
    //   これで cine 実験台=護衛NPCの環境会話も出ない静かなステージになる(社長「cineテスト中は動かないように」)。
    const cineTestbed = !benchmark && stageForRun?.id === 'stage-7'
      && typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('cine') === '1';
    useGameStore.getState().setPendingIndoor(!!stageForRun?.indoor);
    useGameStore.getState().setPendingStageTheme(stageForRun?.theme === 'lab' ? 'lab' : 'forest');
    useGameStore.getState().setPendingFarBackdrop(stageForRun?.farBackdrop ?? '');
    useGameStore.getState().setPendingNearHorizon(stageForRun?.nearHorizon ?? '');
    useGameStore.getState().setPendingSuppression(stageForRun?.mainEvent === 'suppression');
    useGameStore.getState().setPendingStoryBoss(!benchmark && !!stageForRun?.storyBossOnly);
    useGameStore.getState().setPendingRevisit(revisitRun);
    useGameStore.getState().setPendingCorridor(corridorRun);
    useGameStore.getState().setPendingHiddenBoss(stageForRun?.hiddenBoss ?? null);
    resetGame(validClass);
    clearSfxThrottle(); // ラン開始でSEスロットル記録をリセット(前ランの終わり際の音が次ラン頭でブロックされるのを防ぐ)
    // 出撃ごとの会話は選択ミッションから設定。フリー(周回)/未選択/ベンチ/再訪(通信なし)は空=会話なし。
    const free = getSelectedFreeMode();
    const selectedStage = (benchmark || free || revisitRun) ? undefined : stageForRun;
    useGameStore.getState().setIntroDialogueLines(cineTestbed ? [] : (selectedStage?.main.dialogue ?? []));
    setBenchmarkMode(pendingBenchmarkRef.current);
    // 出撃ローディング%のウィンドウをここでリセット(v0.25.1829): オーバーレイの初期描画が
    // 前回ウィンドウの100%を一瞬見せないように(PixiStage側のリセットより先=マウント前に0%へ)。
    loadProgressResetWindow();
    setGameState('playing');
  };

  // テスト用クイックスタート(§6-追補・M25)。`?smoke`があればタイトル/メニューを全スキップし
  // 直接startGameへ入る。完全にopt-in(無指定時は今まで通り)=描画スモークをヘッドレスで1コマンド到達可能に。
  useEffect(() => {
    if (smokeHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const smokeParam = params.get('smoke');
    if (smokeParam === null) return;
    smokeHandledRef.current = true;
    const benchmark = smokeParam === 'bench' || params.get('bench') === '1';
    // 既定はステージ1(STAGES[0]はチュートリアル追加で先頭が変わったため固定・従来挙動を維持)。
    setSelectedStageId(params.get('stage') || 'stage-1');
    void startGame(params.get('class') ?? 'warrior', benchmark);
  }, []);

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
    // 二人組クエストのあるステージ(1/3/4/5)は解放条件が「城ボスクリアフラグ && 強制クリアフラグ」
    // (社長裁定v0.25.1686 #4)。勝利(帰還)そのものでは解放せず、両フラグが揃った時だけクリア扱い
    // (城ボス討伐時/強制納品時にも同じ同期が走る=どちらが後でもその瞬間に解放される)。
    const stageId = getSelectedStageId();
    const revisitRun = getSelectedMission() === 'revisit' && stageId === 'stage-6';
    if (stageId && !getSelectedFreeMode()) {
      if (revisitRun) {
        // 洋館再訪(秘密任務)はステージクリア扱いにしない(進行は useGlenMedicine が
        // storyFlags/ミッション単位クリアへ保存済み。軍向けの記録は残さない=統合正本9.4)。
      } else if (getEventQuestConfig(stageId)) syncQuestStageClear(stageId);
      else markStageCleared(stageId);
      // M7(stage-7)クリア → リザルトの後(メニューに戻る時)に通常エンディングを流す予約。
      if (!revisitRun && stageId === 'stage-7') pendingEndingRef.current = true;
    }
    setGameState('victory');
  };

  const returnToMenu = () => {
    setBenchmarkMode(false);
    setBenchmarkResult(null);
    // the ONE: M7勝利後の「メニューに戻る」は聴取記録エンディングを挟む(統合正本7章)。
    if (pendingEndingRef.current) {
      pendingEndingRef.current = false;
      setGameState('ending');
      return;
    }
    setGameState('menu');
  };

  // エンディング終了(統合正本8章 / 指示書6章): endingSeen を立て、サブ3本完了なら「グレンの薬」を
  // 付与+資料室へ解放(冪等・重複解放なし)。解放の通知はメニューの既存「資料が追加されました」
  // ポップアップ(latestUnlockedRecordIds)が拾う。未完了時のヒントはメニュー側(初回のみ)が出す。
  const finishEnding = () => {
    const follow = endingFollowup(getStoryFlags(), subsAllCompletedFromMeta());
    if (follow === 'medicine') {
      updateStoryFlags({ endingSeen: true, medicineOwned: true });
      unlockRecordsForStage('stage-7', ['mission-glen-medicine']);
    } else {
      updateStoryFlags({ endingSeen: true });
    }
    // 共有パッケージ2026-07-23: 通常エンディング後に真相資料(endingComplete群)を解放。
    // latestUnlockedへは追記マージ=直前の「グレンの薬」通知と合算で「資料が追加されました」が拾う。冪等。
    unlockRecords(ENDING_RECORD_IDS);
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
          // 更新情報OK直後にオープニングを再生(社長指示v0.25.2022)。音声はOKのジェスチャで解禁し、
          // メニューBGMはオープニング終了後(onDone)に開始=OP中のアリーナ音源と被らない。
          // OK時にBGMを必ず停止(v0.25.2072): プレビュー(?opening=…)を一周した後はonDoneでBGMが
          // 開始済みのため、OK→オープニング再再生でBGMが鳴りっぱなしになっていた(社長報告)。
          onNoticeOk={() => { setBgmScene('off'); unlockDanceAudio(); primeMenuBgm(); setShowOpening(true); }}
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

      {/* the ONE 通常エンディング(聴取記録→暗転→PHILL→スタッフロール)。終了でメニューへ。 */}
      {gameState === 'ending' && <EndingScreen onDone={finishEnding} />}
      
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

      {/* 出撃直後、Pixiレンダラ初期化(WebGL init＋テクスチャGPUアップロード)が終わるまでの繋ぎ。
          社長指示で「完全に暗転」=スピナー等のUIを一切出さず、全面を不透明な黒で覆う(後で一枚絵を差し込む余地)。
          z-[100] でHUD(z-40)や各種バッジ(z-50)より上、OrientationGuard(z-[9999])より下。
          レンダラ準備完了(初フレーム表示)で自動的に外れる。 */}
      {gameState === 'playing' && isPixiRenderer() && !rendererReady && !loadOverlayTimedOut && (
        <SortieLoadingOverlay />
      )}

      {/* オープニングシーン(?opening=1でプレビュー)。タイトルの上に全画面。暗転し切ったら onDone で外れる。 */}
      {/* BGMはオープニング完全終了(onDone=タイトルフェードイン明け)で開始(社長指示v0.25.2067
          「BGM流れるのは蘇生シーン終わってから」=フェードイン開始と同時のBGM開始を廃止)。 */}
      {showOpening && <OpeningScene onDone={() => { setShowOpening(false); setBgmScene('menu'); }} startAtShoot={openingParam === '2'} startAtRevival={openingParam === '3'} />}

      {/* ステージ6(洋館)通路プレビュー(?corridor=1)。タイトル等の上に全画面。 */}
      {corridorPreview && <MansionCorridorPreview />}

      {/* 縦持ちガード(タッチ端末を横向きにしたら全面表示。PCは対象外)。最前面。 */}
      <OrientationGuard />
    </div>
  );
}

export default App;

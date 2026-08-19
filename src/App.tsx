import { useEffect, useRef, useState, type ReactNode } from 'react';
import Game from './components/Game';
import MissionSelect from './components/MissionSelect';
import TitleScreen from './components/TitleScreen';
import GameOverScreen from './components/GameOverScreen';
import EndingScreen from './components/EndingScreen';
import LoadingScreen from './components/LoadingScreen';
import OrientationGuard from './components/OrientationGuard';
import OpeningScene from './components/OpeningScene';
import MansionCorridorPreview from './components/MansionCorridorPreview';
import { getLoadProgressWindow, subscribeLoadProgress, loadProgressResetWindow, getLoadProgress, getLoadInFlight } from './utils/loadProgress';
import type { BenchmarkResult } from './components/BenchmarkOverlay';
import { CharacterClass, GameState } from './types/game';
import { useGameStore } from './store/gameStore';
import { setBgmScene, preloadAllAudio, unlockDanceAudio, primeMenuBgm, preloadStageBgm, setAudioSuspended, clearSfxThrottle, attachAudioGestureRecovery } from './audio/audioManager';
import { ensureTextures, preloadBackgrounds } from './pixi/pixiTextures';
import { preloadClassPortraits, preloadClassWalkSprites } from './data/portraits';
import { loadProgressBegin, loadProgressDone } from './utils/loadProgress';
import {
  getSelectedStageId, setSelectedStageId, getSelectedFreeMode, markStageCleared, syncQuestStageClear,
  getSelectedMission, setSelectedMission, setSelectedFreeMode, getStoryFlags, updateStoryFlags, getClearedStages,
  type SelectedMission,
} from './data/progress';
import { unlockRecordsForStage, unlockRecords, backfillStoryArchive, ENDING_RECORD_IDS } from './data/storyArchive';
import { subsAllCompletedFromMeta, endingFollowup } from './utils/storyProgress';
import { getEventQuestConfig } from './utils/eventQuest';
import { getStage } from './data/campaign';
import { isPixiRenderer } from './config/renderer';
import { isPracticeRun, beginPracticeRun, endPracticeRun, type PracticeRestore, type PracticeSlot } from './utils/bossPractice';
import PracticeResult from './components/PracticeResult';
import GauntletRunner from './components/GauntletRunner';

const LOADING_MIN_MS = 650;

/**
 * ★ボス・ガントレット(開発用の全ボス自動テスト・`?gauntlet=1`。research/BOSS_GAUNTLET.md)。
 * 他のデバッグフラグと同じ作法で**モジュールロード時に1回だけ**読む。
 * 無指定なら本編の描画・分岐は**1つも変わらない**(全部この定数でゲートしてある)。
 */
const GAUNTLET_MODE = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('gauntlet') === '1';

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

/**
 * ★`playingOverlay`(v0.25.2849・BOSS_MAKER.md §19-5): プレイ中だけ上に重ねる差し込み口。
 * ボスメーカーのUIはここから入る。**ゲーム本編(`src/main.tsx`)はこれを渡さない**ので、
 * 道具のコードはゲームのバンドルから木ごと落ちる(道具は `bossmaker.html` の別エントリ)。
 * 本編では常に `undefined` = 描画も購読も一切増えない。
 */
interface AppProps {
  playingOverlay?: ReactNode;
  /**
   * ★`bare`(v0.25.2851・社長指示「ボスメーカーからは余計なものを排除。タイトルや他の要素もいらない」):
   * **ゲームの画面を一切描かない**モード。道具ページ(`bossmaker.html`)だけが true を渡す。
   * 消えるのは タイトル / ミッション選択 / 起動ローディング / エンディング / リザルト /
   * オープニング / 洋館通路プレビュー。残すのは **ゲーム本体・差し込み口・出撃時の暗転・縦持ちガード**だけ。
   *
   * ゲーム本編は `undefined`(=false)なので、下の描画条件は今までと**完全に同一**に評価される。
   */
  bare?: boolean;
}

function App({ playingOverlay, bare = false }: AppProps = {}) {
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
    // PixiStage 側と同じく**進捗が止まっている時だけ**外す(v0.25.2224)。旧実装は絶対時間6秒で外していたため、
    // バージョン更新直後(キャッシュが冷えて素材の再取得が走る)に読み込み途中の画面が見えていた。
    // 停滞判定はPixiStage(6秒)より少し長め=通常はPixiStage側の正規解除が先に立つ。
    const corridor = useGameStore.getState().corridorMode;
    const stallMs = corridor ? 18000 : 8000;
    const hardCapMs = corridor ? 70000 : 40000; // PixiStage側(60/30秒)より後ろに置く=通常はあちらが先に立つ
    const t0 = performance.now();
    let lastP = getLoadProgress();
    let lastAt = t0;
    const id = window.setInterval(() => {
      const now = performance.now();
      const p = getLoadProgress();
      if (p !== lastP) { lastP = p; lastAt = now; }              // 進捗あり=待つ
      else if (getLoadInFlight() > 0) lastAt = now;              // 未完了の通信がある=停滞ではない(v0.25.2230)
      if (now - lastAt < stallMs && now - t0 < hardCapMs) return;
      window.clearInterval(id);
      setLoadOverlayTimedOut(true);
    }, 500);
    return () => window.clearInterval(id);
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
        preloadClassPortraits().catch(() => {}), // キャラ選択の立ち絵(?v=でバージョン毎に再取得=更新直後の空白対策・v0.25.2224)
        preloadClassWalkSprites().catch(() => {}), // キャラ選択の下段=歩きドット絵(同・社長報告v0.25.2233)
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
  
  // retry=ゲームオーバー画面「もう一度プレイ」からの再出撃(社長指示v0.25.2462:
  // リトライは開始時の会話を飛ばす。M7はヘリ演出も無し=咆哮→即ボス)。
  const startGame = async (characterClass: string, benchmark = false, retry = false) => {
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
    // ★v0.25.3178(社長報告「通常プレイした後、なぜかボスモードに戻ってきちゃう」):
    // メニューの初期画面指定(`menuScreen`)を**出撃のたびに捨てる**。
    // 原因: `leavePracticeToList` が 'bossrush' を立てたまま**誰も戻さなかった**ため、その後に
    // 通常出撃 → リザルト → 「メニューへ」で MissionSelect が再マウントされると、
    // `initialScreen='bossrush'` が生きていてボス一覧が開いていた(練習ランは既に抜けているのに)。
    // 出撃は練習/通常のどちらも必ずここを通るので、ここで捨てれば漏れない。
    // 練習の導線は壊れない: 戻り先の指定は**リザルトの「ボスを選ぶ」を押した時**に
    // `leavePracticeToList` が改めて立てるため(出撃前に立てておく必要が無い)。
    setMenuScreen(null);
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
    useGameStore.getState().setPendingRetryRun(retry && !benchmark); // resetGameが消費(M7=ヘリ無し即ボス等)
    useGameStore.getState().setPendingStageTheme(stageForRun?.theme === 'lab' ? 'lab' : 'forest');
    useGameStore.getState().setPendingFarBackdrop(stageForRun?.farBackdrop ?? '');
    useGameStore.getState().setPendingNearHorizon(stageForRun?.nearHorizon ?? '');
    useGameStore.getState().setPendingSuppression(stageForRun?.mainEvent === 'suppression');
    useGameStore.getState().setPendingStoryBoss(!benchmark && !!stageForRun?.storyBossOnly);
    useGameStore.getState().setPendingRevisit(revisitRun);
    useGameStore.getState().setPendingCorridor(corridorRun);
    useGameStore.getState().setPendingHiddenBoss(stageForRun?.hiddenBoss ?? null);
    resetGame(validClass);
    // サブクエスト(research/SUBQUESTS.md): 補充は **resetGame の後**(中12: reset で消えるため)。
    // ベンチ(BENCH)は benchmarkRun で、練習/ガントレットは refillSubquests 内の isPracticeRun で除外。
    useGameStore.getState().setBenchmarkRun(benchmark);
    useGameStore.getState().refillSubquests();
    clearSfxThrottle(); // ラン開始でSEスロットル記録をリセット(前ランの終わり際の音が次ラン頭でブロックされるのを防ぐ)
    // 出撃ごとの会話は選択ミッションから設定。フリー(周回)/未選択/ベンチ/再訪(通信なし)は空=会話なし。
    const free = getSelectedFreeMode();
    const selectedStage = (benchmark || free || revisitRun) ? undefined : stageForRun;
    // M7の戦闘前会話は端末で一度だけ。既読後とリトライ(もう一度プレイ)は会話を丸ごと飛ばす。
    const skipSeenGlenIntro = selectedStage?.id === 'stage-7' && getStoryFlags().glenIntroSeen;
    useGameStore.getState().setIntroDialogueLines((cineTestbed || retry || skipSeenGlenIntro) ? [] : (selectedStage?.main.dialogue ?? []));
    setBenchmarkMode(pendingBenchmarkRef.current);
    // 出撃ローディング%のウィンドウをここでリセット(v0.25.1829): オーバーレイの初期描画が
    // 前回ウィンドウの100%を一瞬見せないように(PixiStage側のリセットより先=マウント前に0%へ)。
    loadProgressResetWindow();
    setGameState('playing');
  };

  // 練習リザルトの「ボスを選ぶ」の戻り先(v0.25.2861)。`?screen=<名前>` があればタイトルを飛ばして
  // メニューを開き、その画面から始める。素材ロードは出撃時の `startGame` が待つので先回り不要。
  const [menuScreen, setMenuScreen] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('screen')
  );
  useEffect(() => {
    if (menuScreen) setGameState('menu');
    // 初回のみ(URL指定でメニューを開く用)。以降は練習からの戻りで setMenuScreen する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // v0.25.2588(社長報告「ボスモードができない。パラメータが消えちゃう」): v0.25.2576で入れていた
    // 「クエリをアドレスバーから即除去」を**撤去**。フラグはモジュールロード時に読み終えているので
    // 機能自体は効くが、**URLが消えると再読込で通常モードに戻り、手でパラメータを足すこともできない**
    // (?ghostlog=1を足してログを取る等)。残留対策は returnToMenu の「素のURLで再起動」だけで足り、
    // 掛かっているモードはタイトルの現在モード表示(v0.25.2580)で見えるので、消す必要が無い。
    // ?retry=1(ボス戦テストメニュー用): 開始時会話をスキップ(GOの「もう一度プレイ」と同じ扱い)。
    void startGame(params.get('class') ?? 'warrior', benchmark, params.get('retry') === '1');
  }, []);

  /**
   * bare(道具ページ)の決着処理(v0.25.2851)。リザルト画面を描かないので、そのままだと
   * 部屋が固まる。**その場で部屋に入り直す**(調整中に死んでも戦い続けられる)。
   * ★**ゲームの進行(クリア解放・スコア)には一切触らない。** 道具で城ボスを倒したせいで
   * 本編のステージが解放される、といった副作用を作らないため。
   */
  const restartBareRoom = (): void => {
    void startGame(useGameStore.getState().characterClass, false, true);
  };

  /**
   * ★練習出撃(ボスラッシュ)。**通常の出撃と同じ `startGame` を通す**ので、ページ再読込は起きない
   * (社長指摘v0.25.2862「この導線おかしいでしょ。ゲームからそのままシームレスに戦闘に入らないと」)。
   * 強制出現フラグは `bossPractice` の実行時状態へ移したので、URLを触る必要が無くなった。
   *
   * 選択ステージ/ミッション/フリーは**書き換えない**(v0.25.3629)。旧実装はここで
   * `setSelectedStageId(slot.stageId)` 等を書いていたが、`beginPracticeRun` の後は practiceGuard
   * (練習中はlocalStorage書き込み全封鎖)が**その書き込みを黙って飲んでいた**=出撃先が
   * 選択中のステージのまま走る実バグ(ガントレットで発覚)。いまは data/progress の
   * getSelected* が**練習ラン中は practiceActiveSlot() を正として返す**ので、書く必要がない
   * (`revisit` 化け防止・BOSS_MAKER.md §20-7-a も同じ仕組みで担保)。restore は「万一の復元」用に残す。
   */
  const startPractice = (slot: PracticeSlot, characterClass: string): void => {
    beginPracticeRun(slot, {
      stageId: getSelectedStageId(), mission: getSelectedMission(), free: getSelectedFreeMode(),
    });
    void startGame(characterClass, false, true);
  };

  /**
   * ★ボス・ガントレット(開発用・`?gauntlet=1`。research/BOSS_GAUNTLET.md)。
   * **既存の練習ラン(startPractice)と同じ経路**で枠を出撃させるが、枠の切り替えだけが違う:
   *
   *   **次枠の `beginPracticeRun` を先に呼んで activeSlot を差し替えてから `startGame`**。
   *   `endPracticeRun` を先に呼ぶと一瞬 `isPracticeRun()===false` になり、遅れて来た勝敗遷移が
   *   通常経路(=進行の書き込み)へ落ちる。だからガントレット中は**一度も練習ランを抜けない**。
   *
   * 元へ戻すための値(`restore`)は**最初の1回だけ**控える(2枠目以降で控えると、既に書き換えた
   * 練習用の選択を「元の値」として保存してしまう)。
   */
  const gauntletRestoreRef = useRef<PracticeRestore | null>(null);
  const startGauntletSlot = (slot: PracticeSlot): void => {
    if (!gauntletRestoreRef.current) {
      gauntletRestoreRef.current = {
        stageId: getSelectedStageId(), mission: getSelectedMission(), free: getSelectedFreeMode(),
      };
    }
    // 出撃先の書き換えはしない(v0.25.3629: startPractice と同じ。practiceActiveSlot() が正)。
    beginPracticeRun(slot, gauntletRestoreRef.current);
    const cls = useGameStore.getState().characterClass
      || new URLSearchParams(window.location.search).get('class') || 'warrior';
    void startGame(cls, false, true);
  };

  /** ガントレット完走。練習ランを抜けて選択状態を戻し、メニューで止める(要約はRunnerが上に出す)。 */
  const finishGauntlet = (): void => {
    const restore = endPracticeRun();
    if (restore) {
      setSelectedStageId(restore.stageId);
      setSelectedMission(restore.mission as SelectedMission);
      setSelectedFreeMode(restore.free);
    }
    setGameState('menu');
  };

  /** 練習を抜けてボス一覧へ戻る。プレイヤーの選択状態を元に戻す。 */
  const leavePracticeToList = (): void => {
    const restore = endPracticeRun();
    if (restore) {
      setSelectedStageId(restore.stageId);
      setSelectedMission(restore.mission as SelectedMission);
      setSelectedFreeMode(restore.free);
    }
    setMenuScreen('bossrush');
    setGameState('menu');
  };

  const handleGameOver = () => {
    // ★ガントレット中は画面遷移を挟まない(駆動が次枠へ差し替える)。ここで gameState を動かすと
    // Game が一瞬アンマウントし、遅れて来た遷移が次の戦いの最中に届く事故になる。
    if (GAUNTLET_MODE) return;
    if (bare) { restartBareRoom(); return; }
    setGameState('gameOver');
  };

  const handleReturn = () => {
    if (GAUNTLET_MODE) return; // 同上(ガントレットは駆動側が進める)
    if (bare) { restartBareRoom(); return; }
    // 商人「帰還」=任意撤収。進行(クリア解放)はさせず、スコア計上のリザルトへ。装備は持ち帰り可。
    setGameState('returned');
  };

  const handleVictory = () => {
    if (GAUNTLET_MODE) return; // 同上(ガントレットは駆動側が次枠へ差し替える)
    // ★bare(道具ページ)は**進行に一切触らない**。下のクリア解放・エンディング予約を通さない。
    if (bare) { restartBareRoom(); return; }
    // ★練習ラン(ボスラッシュ)も進行に触らない(BOSS_MAKER.md §20-6)。リザルトは出すが、
    // クリア解放もエンディング予約もしない。永続化は practiceGuard が別途封じている
    // (=ここを1つ通してしまっても保存はされない)が、**エンディングが再生される**のは
    // 保存の問題ではないのでここで止める。
    if (isPracticeRun()) { setGameState('victory'); return; }
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
    // v0.25.2576(社長報告): ?smoke起動(ボス戦テスト等)のセッションは、メニューへ戻る時に
    // **素のURLで再読込**して終える。強制出現・?ghost=1等はモジュールロード時定数のため、ページを
    // 再起動しない限り効き続け、テスト後の通常出撃に守護霊やボス即出現が漏れていた。
    // 「もう一度プレイ」(retry)は再読込しない=同じボス戦テストを連続で回せる(意図どおり)。
    if (smokeHandledRef.current) {
      window.location.replace(window.location.pathname);
      return;
    }
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
      {!bare && gameState === 'title' && (
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

      {!bare && gameState === 'menu' && (
        <MissionSelect
          initialScreen={menuScreen}
          onStartPractice={startPractice}
          onStartGame={(characterClass) => startGame(characterClass, false)}
          onStartBenchmark={(characterClass) => startGame(characterClass, true)}
        />
      )}

      {!bare && gameState === 'loading' && <LoadingScreen startup />}

      {/* bare(道具ページ)の待ち: 素材ロード中の真っ黒を避ける最小限の合図だけ。
          `compact` はスピナーと LOADING… のみでゲームタイトルを出さない。 */}
      {bare && gameState !== 'playing' && <LoadingScreen compact />}

      {/* the ONE 通常エンディング(聴取記録→暗転→PHILL→スタッフロール)。終了でメニューへ。 */}
      {!bare && gameState === 'ending' && <EndingScreen onDone={finishEnding} />}
      
      {/* プレイ中の差し込み口(BOSS_MAKER.md §19-5)。道具ページだけがボスメーカーUIを渡す。
          本編は undefined なので何も描かない=本編の負荷は変わらない。 */}
      {gameState === 'playing' && playingOverlay}

      {gameState === 'playing' && (
        <Game
          onGameOver={handleGameOver}
          onVictory={handleVictory}
          onReturn={handleReturn}
          benchmarkMode={benchmarkMode}
          onBenchmarkComplete={handleBenchmarkComplete}
        />
      )}

      {/* 練習(ボスラッシュ)は専用の簡素なリザルト(社長指摘v0.25.2861「表示紛らわしい」)。
          既存のリザルトは報酬・ハイスコア・記録が並ぶが、練習ではそれらを全て封じてあるので
          **実際には何も増えていない**のに増えたように読めてしまう。 */}
      {!bare && !GAUNTLET_MODE && isPracticeRun() && (gameState === 'gameOver' || gameState === 'victory' || gameState === 'returned') && (
        <PracticeResult
          won={gameState === 'victory'}
          onRetry={() => { void startGame(useGameStore.getState().characterClass, false, true); }}
          onBackToList={leavePracticeToList}
        />
      )}

      {!bare && !GAUNTLET_MODE && !isPracticeRun() && (gameState === 'gameOver' || gameState === 'victory' || gameState === 'returned') && (
        <GameOverScreen
          won={gameState === 'victory'}
          withdraw={gameState === 'returned'}
          stats={gameStats}
          benchmarkResult={benchmarkResult}
          onReturnToMenu={returnToMenu}
          onPlayAgain={() => startGame(useGameStore.getState().characterClass, false, true)}
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
      {!bare && showOpening && <OpeningScene onDone={() => { setShowOpening(false); setBgmScene('menu'); }} startAtShoot={openingParam === '2'} startAtRevival={openingParam === '3'} />}

      {/* ステージ6(洋館)通路プレビュー(?corridor=1)。タイトル等の上に全画面。 */}
      {!bare && corridorPreview && <MansionCorridorPreview />}

      {/* ★ボス・ガントレット(開発用・?gauntlet=1)。枠順の自動出撃・観測・記録の駆動。
          本編(無指定)ではこの木ごと描かれない。 */}
      {GAUNTLET_MODE && <GauntletRunner onStartSlot={startGauntletSlot} onFinish={finishGauntlet} />}

      {/* 縦持ちガード(タッチ端末を横向きにしたら全面表示。PCは対象外)。最前面。 */}
      <OrientationGuard />
    </div>
  );
}

export default App;

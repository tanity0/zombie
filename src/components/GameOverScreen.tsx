import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameStats } from '../types/game';
import { formatTime } from '../utils/renderUtils';
import { calculateResultScore, topScoreItem } from '../utils/resultScoring';
import { useGameStore, skillGoldRushMult } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { equipmentById, equipmentDescription, equipIconName, hasEquipIcon, equipScrapGold } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import type { EquipSlot } from '../types/game';
import type { BenchmarkResult } from './BenchmarkOverlay';
import { getSelectedStageId, getSelectedMission, submitStageHighScore, getRunCores, pushRunCore, type RunCore } from '../data/progress';
import { getRunPois, isPoiRevealed } from '../world/pois';
import { getStage, stageDateLabel, REVISIT_MISSION } from '../data/campaign';
import { getArchiveRecord, unlockRecordsForStage, markRecordRead, type ArchiveRecord } from '../data/storyArchive';
import { AREA_ZONE_NAMES, AREA_THRESHOLDS } from '../utils/enemyUtils';
import { clampRank, promotionScore, PROMOTION_BOTTLENECK_LABEL } from '../utils/rankAssessor';
import { isKomaLogEnabled, komaLogSummary, logKomaSummary } from '../utils/komaLog';
import { hasPendingTraitRecords, settlePendingTraits, pendingBossClears, loadPlayerProfile } from '../utils/playerTraits';
import { buildRunTimeline, buildDuoRunTimeline } from '../utils/ghostAlbum';
import { duoClearsThisRun } from '../utils/duoRecords';
import { BossClearCardRow, BossClearStrip, GhostAllyCard } from './GhostRecordCards';
import {
  wallAchievementHeadline, metersToNextWall, rankLabel,
} from '../utils/wallProgress';
import DirectorResult from './DirectorResult';
import ResultReach from './ResultReach';

// PACING_PUZZLE.md §5.17 M14: 縦の深度メーターの表示スケール(深層域の余白込み)。表示専用の定数。
const WALL_METER_SCALE_MAX = AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + 1000;

// AIディレクター振り返り(緊張曲線+難易度スコア+ランク階段)。v0.25.1374(社長指示)から
// リザルトに常時表示(記録側DIRECTOR_ACTIVEは元々既定ON)。?director=0で記録ごと非表示。
const directorEnabled = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('director') !== '0';

// PACING_PUZZLE.md §5.19 バッチM18: リザルト画面の整理(3層化)。復帰フラグ=?resultclassic=1で
// 旧レイアウト(整理前)を全体表示。安全弁のため旧JSXは削除せずこのフラグの下に残す。
const resultClassicMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('resultclassic') === '1';

interface GameOverScreenProps {
  stats: GameStats;
  onReturnToMenu: () => void;
  onPlayAgain: () => void;
  won?: boolean;
  withdraw?: boolean; // 商人「帰還」=任意撤収。死亡ではない(装備ロスト無し)・クリアでもない(ボーナス/進行なし)。
  benchmarkResult?: BenchmarkResult | null;
}

const formatBenchmarkShareText = (result: BenchmarkResult): string => {
  const safeStage = result.stages.filter(stage => stage.grade === 'PASS').at(-1);
  const stopStage = result.stages.find(stage => stage.grade !== 'PASS');
  const stageLines = result.stages.map(stage =>
    `${stage.id} ${stage.category} ${stage.label}: ${stage.grade} avg ${stage.avgFps.toFixed(1)} min ${stage.minFps} drops ${stage.drops} n${stage.sampleCount} / ${stage.stress}`
  );

  // ★計測条件(URLのツマミ)を結果に焼き込む(v0.25.2682)。
  // これが無いと**後から「どの条件で測ったか」が分からない**——実際にそれで判定が止まった
  // (社長のベンチ結果を見て `?glowhalo=` を付けたか分からず、結論を書けなかった)。
  // 「計測結果は、条件が一緒に書かれていて初めて資料になる」。
  const knobs = (() => {
    if (typeof window === 'undefined') return '';
    const q = new URLSearchParams(window.location.search);
    // 描画負荷に効く/計測の解釈に効くものだけを拾う(全部出すと読みにくい)。
    const keys = ['glowhalo', 'glowcore', 'benchonly', 'pool', 'poolr', 'plight', 'res', 'bloom', 's5fire', 'zoomlock', 'dev'];
    const on = keys.filter(k => q.get(k) !== null).map(k => `${k}=${q.get(k)}`);
    return on.length ? on.join(' ') : 'なし(既定)';
  })();

  return [
    `BENCH v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'}`,
    `knobs: ${knobs}`,
    `grade: ${result.grade === 'PASS' ? 'SAFE' : result.grade}`,
    `summary: avg ${result.avgFps.toFixed(1)} min ${result.minFps} drops ${result.drops} enemy/fx ${result.maxEnemies}/${result.maxFx}`,
    `safe: ${safeStage?.safeStress ?? 'not found'}`,
    `stop: ${stopStage ? `${stopStage.label} ${stopStage.grade}` : 'max passed'}`,
    `device: ${result.diagnostics.verdict}`,
    `net: avg ${result.diagnostics.netRttAvg.toFixed(0)}ms max ${result.diagnostics.netRttMax.toFixed(0)}ms n${result.diagnostics.netSamples} fail${result.diagnostics.netFailures}`,
    `main: avg ${result.diagnostics.mainDelayAvg.toFixed(0)}ms max ${result.diagnostics.mainDelayMax.toFixed(0)}ms n${result.diagnostics.mainSamples}`,
    `weak: ${result.bottleneck}`,
    ...result.categorySummary,
    'stages:',
    ...stageLines,
  ].join('\n');
};

const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy failed');
};

const GameOverScreen: React.FC<GameOverScreenProps> = ({
  stats,
  onReturnToMenu,
  onPlayAgain,
  won = false,
  withdraw = false,
  benchmarkResult = null
}) => {
  const [benchmarkCopyState, setBenchmarkCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [komaCopyState, setKomaCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // PACING_PUZZLE.md §5.19 M18④: スコア内訳とAIディレクターは別々の開閉(独立トグル2つ・ローカルuseState)。
  const [scoreDetailOpen, setScoreDetailOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  // 研究所(ラボ)ステージか。speedBonus はラボ勝利のみ。stageTheme は勝利後も保持される
  // (ステージ2は屋外ラボ=indoorMode は false なので theme で判定する)。
  const isLab = useGameStore(s => s.stageTheme === 'lab');
  // 死亡時の「装備ロスト」明示用。装備していたかの派生ブール(静的画面なので再描画コスト無し)。
  const hadEquipment = useGameStore(s => Object.values(s.player.equipment).some(Boolean));
  // 死因(直近の被弾原因)。
  const deathCause = useGameStore(s => s.lastDamageSource);
  // PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)の登場結果(このランで出現した場合のみ表示)。
  const namedFoeResult = useGameStore(s => s.namedFoeResult);
  // 小烏丸解禁(社長指示): このランでトール初回討伐=小烏丸を永続解禁したか(静的画面なので毎フレ再描画なし)。
  // 解禁したランのリザルトで1回だけ解禁ポップアップを出す(OK/×で閉じる=setKogarasuPopupOpen(false))。
  const kogarasuUnlockedThisRun = useGameStore(s => s.kogarasuUnlockedThisRun);
  const [kogarasuPopupOpen, setKogarasuPopupOpen] = useState(true);
  // PACING_PUZZLE.md §5.17 M14: 到達譜=二軸の壁(深さ×ランク)。ステージ毎の自己最深/自己最高ランク。
  const wallMeta = useGameStore(s => s.wallMeta);
  // PACING_PUZZLE.md §5.17-追補/§5.19 M18: 昇格度(惜しさ)。直近に完了した「通常」コマのスナップショット
  // (コマ切替の度にしか変わらないので毎フレーム購読ではない・静的画面のReact規律に抵触しない)。
  const lastKomaAssessmentInput = useGameStore(s => s.lastKomaAssessmentInput);
  // クリア時の「装備1個持ち帰り」選択。装備ロードアウト(静的画面なので安定参照)。
  const carriedLoadout = useGameStore(s => s.player.equipment);
  const takeHomeEquipment = useGameStore(s => s.takeHomeEquipment);
  const [carriedPick, setCarriedPick] = useState<string | null>(null); // null=未選択 / '__none__'=持ち帰らない / defId
  const pickCarry = (defId: string | null) => {
    playSfx('ui-select');
    takeHomeEquipment(defId);   // localStorage へ即時保存(持ち帰り確定)
    setCarriedPick(defId ?? '__none__');
  };
  // BOT_AND_GHOST.md §2.7 制約2(G3): このランで守護霊(ゴースト)が発動したか(静的画面なので再描画コスト無し)。
  // 発動していたら totalScore が×0.5 される(掛け算は合流点=calculateResultScore の1箇所。黙って半分にしない
  // ため、下のSCORE欄に「守護霊が共闘: スコア半分」の1行を出す)。ゴールド換金は対象外(誇り=順位だけを差し出す)。
  const ghostSummoned = useGameStore(s => s.ghostSummonedThisRun);
  // BOT_AND_GHOST.md §2.6(保存の保留化・社長裁定v0.25.2476): このランで守護霊プロファイルの保留記録
  // (ボス交戦セッション)が1件以上あるか。モジュールシングルトンをマウント時に1回だけ読む(リザルト
  // 表示中は不変)。チェック状態もローカルstateのみ=毎フレーム変化するstore購読なし(React再描画規律)。
  // ボス交戦なし/守護霊装備/?ghost=1のランは保留が空(そもそも計測されていない)のでチェックは出ない。
  const [hasPendingTraits] = useState(() => hasPendingTraitRecords());
  const [traitOptOut, setTraitOptOut] = useState(false);
  // BOT_AND_GHOST.md §2.13/§2.16 B: 撃破の年表。**マウント時に1回だけ**読む3つ(保留中の撃破/
  // 反映前の保存プロファイル/同行守護霊)からカードを組み立てる。以後リザルト表示中は不変=
  // 毎フレーム変わるstoreの購読はしない(React再描画規律)。撃破が無いランは空配列=年表を出さない。
  const [runClears] = useState(() => pendingBossClears());
  const [profileBeforeSettle] = useState(() => loadPlayerProfile());
  const timeline = useMemo(
    () => buildRunTimeline(runClears, profileBeforeSettle),
    [runClears, profileBeforeSettle]
  );
  // 「守護霊へ採用」チェック。**既定=全部ON**(叩き台・§2.16 B)。ローカルstateのみ。
  const [adoptedSlots, setAdoptedSlots] = useState<Set<string>>(() => new Set(runClears.map(c => c.slotKey)));
  const toggleAdopt = (slotKey: string, next: boolean) => {
    playSfx('ui-select');
    setAdoptedSlots(prev => {
      const s = new Set(prev);
      if (next) s.add(slotKey); else s.delete(slotKey);
      return s;
    });
  };
  // §2.17(GHOST-DUO-RECORDS): 同行枠の年表。守護霊同行ランの撃破は打刻時に台帳へ確定済みなので、
  // ここは**マウント時に1回だけ**読む表示専用ビュー(以後不変=毎フレーム変わるstore購読なし)。
  // ソロ枠(timeline)とは構造的に排他: 同行ランは計測されない(保留=空)/ソロランは同行台帳に積まれない。
  const [duoClears] = useState(() => duoClearsThisRun());
  const duoTimeline = useMemo(() => buildDuoRunTimeline(duoClears), [duoClears]);
  // §2.15/§2.16 B: このランに同行した守護霊(召喚時に1回だけ書かれる不変の写し=購読しても安定)。
  const ghostAlly = useGameStore(s => s.ghostAlly);
  // リザルトを閉じる3操作(OK/もう一度プレイ/メニューに戻る)の合流点=commit/破棄の唯一の分岐点。
  // チェックなし(既定)=保留をcommit(従来どおりEMA反映・結果は旧実装とビット一致)/
  // チェックあり=全破棄。resetGame(次ラン開始)より前に呼ばれるのでbotTelemetryの分母も生きている。
  // v0.25.2553(§2.16 A): 年表が出ているランは**採用スロットの一覧**を渡す(全不採用=反映しない)。
  // 年表が無いラン(撃破なし)は undefined=従来どおり全採用のまま(既定経路の結果は不変)。
  const settleAnd = (navigate: () => void) => () => {
    settlePendingTraits(traitOptOut, timeline.length > 0 ? [...adoptedSlots] : undefined);
    navigate();
  };
  const {
    damageScore,
    finisherScore,
    comboScore,
    treasureScore,
    eliteBossScore,
    scrapScore,
    survivalScore,
    speedBonus,
    clearBonus,
    totalScore,
    goldEarned: goldEarnedBase,
  } = calculateResultScore(stats, won, isLab, ghostSummoned);
  // スキル: ゴールドラッシュ(§6.10 M33⑪) = リザルトのラン獲得ゴールド ×1.2/1.35/1.5(Lv・四捨五入)。
  // そのランで装備していた場合に適用(storeのplayerはこのランの状態のまま)。表示と加算で同じ値を使う。
  const goldRushMult = useGameStore(s => skillGoldRushMult(s.player));
  const goldEarned = Math.round(goldEarnedBase * goldRushMult);
  // このランで得たゴールドを永続財布へ加算(マウント時1回。ベンチマークは加算しない)。
  const isBenchmarkRun = benchmarkResult !== null;
  const addGold = useGameStore(s => s.addGold);
  const goldBalance = useGameStore(s => s.goldBalance);
  // 死亡時: 失う装備を tier ぶんゴールド換金(各部位ごと。銃は装備外なので対象外)。
  const isDeathRun = !isBenchmarkRun && !won && !withdraw;
  const equipmentGold = isDeathRun
    ? (['body', 'arms', 'accessory'] as EquipSlot[]).reduce((sum, slot) => {
        const id = carriedLoadout[slot];
        const def = id ? equipmentById(id) : null;
        return sum + (def ? equipScrapGold(def) : 0);
      }, 0)
    : 0;
  const creditedRef = useRef(false);
  useEffect(() => {
    if (creditedRef.current || isBenchmarkRun) return;
    const total = goldEarned + equipmentGold;
    if (total <= 0) return;
    creditedRef.current = true;
    addGold(total);
  }, [isBenchmarkRun, goldEarned, equipmentGold, addGold]);

  // 掘削記録(社長指示v0.25.2333): このランの到達を履歴へ1回だけ追記し、断面図に過去ランの竪坑を並べる。
  // **追記の前の履歴**を state に持つ(そうしないと「今回」が過去側にも重複して立つ)。
  // 表示専用の記録なので、ベンチは記録しない(自己最深/最高ランクの正本は wallMeta のまま=不変)。
  const runEnd: RunCore['end'] = won ? 'won' : withdraw ? 'withdraw' : 'death';
  const [runHistory, setRunHistory] = useState<RunCore[]>([]);
  const [runEndedAt, setRunEndedAt] = useState(0);
  const coreRef = useRef(false);
  useEffect(() => {
    if (coreRef.current || isBenchmarkRun) return;
    coreRef.current = true;
    const sid = getSelectedStageId();
    setRunHistory(getRunCores(sid));            // 追記前=過去だけ
    const now = Date.now();
    setRunEndedAt(now);
    pushRunCore(sid, { dist: Math.max(0, stats.maxDepthDist), rank: clampRank(stats.maxRankReached), at: now, end: runEnd });
  }, [isBenchmarkRun, stats.maxDepthDist, stats.maxRankReached, runEnd]);

  // 断面図の深度計に刺す「世界の目印」。**既存のPOIルールと同じ**=その方角の拠点を解放したものだけ
  // (画面端の方向矢印と出す条件を揃える)。到達していない深さにも刺さる=次に潜る理由になる。
  const baseSites = useGameStore(s => s.baseSites);
  const hiddenBoss = useGameStore(s => s.hiddenBoss);
  // §6.24 M48: hospital/armory/police は resetGame で1度だけ確定する位置(毎フレーム参照は変わらない
  // ので購読して良い=CLAUDE.mdの「毎フレーム変わるオブジェクトは購読しない」規律には抵触しない)。
  // 断面図は「このランに世界として存在したか」を示す(取得済みでも消さない=live矢印とは別の目的)。
  const hospitalPos = useGameStore(s => s.hospital);
  const armoryPos = useGameStore(s => s.armory);
  const policePos = useGameStore(s => s.police);
  const reachPois = useMemo(() => {
    const label: Record<string, string> = { boss: '裏ボスの巣', hospital: '廃病院', armory: '武器庫', police: '警察署', cave: '洞窟' };
    return getRunPois(hiddenBoss, [
      { kind: 'hospital', pos: hospitalPos },
      { kind: 'armory', pos: armoryPos },
      { kind: 'police', pos: policePos },
    ])
      .filter(p => isPoiRevealed(p, baseSites))
      .map(p => ({ dist: Math.hypot(p.x, p.y), label: label[p.kind] ?? p.kind, kind: p.kind }));
  }, [hiddenBoss, hospitalPos, armoryPos, policePos, baseSites]);

  // ハイスコア更新(ベンチ以外。死亡/クリア問わずスコアを記録)。更新できたら HIGH SCORE 表示。
  const [isHighScore, setIsHighScore] = useState(false);
  const hsRef = useRef(false);
  useEffect(() => {
    if (hsRef.current || isBenchmarkRun) return;
    hsRef.current = true;
    if (submitStageHighScore(getSelectedStageId(), totalScore)) setIsHighScore(true);
  }, [isBenchmarkRun, totalScore]);

  // PACING_PUZZLE.md §6.17 M40 / STORY_UI_SPEC.md 5章・7章: 任務報告+回収資料(勝利クリア時のみ)。
  // ステージIDの解決はハイスコア送信と同じ getSelectedStageId()(localStorage・store外の既存正本)。
  // 死亡/撤退/ベンチでは won=false なので mission は undefined のまま=任務報告欄は出ない。
  const stageId = won ? getSelectedStageId() : '';
  // PACING_PUZZLE.md §6.19 M42: clearReport/資料解放は選択したミッションのデータだけを参照する。
  // 洋館［SUB］再訪(selectedMission='revisit')は REVISIT_MISSION を参照=MAINの報告/資料と混同しない。
  const stage = stageId ? getStage(stageId) : undefined;
  const missionKind = won ? getSelectedMission() : 'main';
  const mission = missionKind === 'revisit' ? REVISIT_MISSION : stage?.main;
  // 統合正本9.4 / 指示書7.3: suppressDebrief=任務報告欄そのものを出さない(debriefフォールバックも抑止)。
  const clearReportLines = mission?.suppressDebrief
    ? []
    : ((mission?.clearReport?.length ? mission.clearReport : mission?.debrief) ?? []);
  const [unlockedRecordIds, setUnlockedRecordIds] = useState<string[]>([]);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [archiveListOpen, setArchiveListOpen] = useState(false);
  const archiveUnlockedRef = useRef(false);
  useEffect(() => {
    // クリア確定時に1回だけ呼ぶ(冪等な関数だが、呼び出し自体もrefガードで重複させない)。
    if (archiveUnlockedRef.current || !won || !stageId) return;
    archiveUnlockedRef.current = true;
    // 秘密再訪は資料解放なし(統合正本9.4「軍の任務記録・資料室へ投薬結果を追加しない」)。
    const recordIds = (missionKind === 'revisit' ? [] : mission?.unlockedRecordIds) ?? [];
    if (recordIds.length) setUnlockedRecordIds(unlockRecordsForStage(stageId, recordIds));
  }, [won, stageId, mission, missionKind]);
  const unlockedRecords = unlockedRecordIds
    .map(id => getArchiveRecord(id))
    .filter((r): r is ArchiveRecord => !!r);
  const openRecord = openRecordId ? getArchiveRecord(openRecordId) : null;
  const handleOpenRecord = (id: string) => {
    playSfx('ui-select');
    markRecordRead(id);
    setOpenRecordId(id);
  };
  // §5「閉じるとリザルト画面へ戻る」: 一覧/本文どちらの閉じるも、回収資料フロー全体を閉じてリザルトへ戻す。
  const closeArchive = () => {
    playSfx('ui-select');
    setOpenRecordId(null);
    setArchiveListOpen(false);
  };

  const remainingStraps = Math.max(0, stats.strapsCollected - stats.strapsSpent);
  // PACING_PUZZLE.md §5.17 M14: 到達譜(掛け合わせ見出し+深度メーター+惜しさ)。
  const wallHighestRank = clampRank(stats.maxRankReached);
  const wallHeadline = wallAchievementHeadline(stats.maxAreaReached, wallHighestRank);
  const wallSelfBestUpdated = stats.maxDepthDist > 0 && stats.maxDepthDist >= wallMeta.selfDeepestDist;
  const wallMetersToNext = metersToNextWall(stats.maxDepthDist);
  const wallMeterPct = (d: number) => Math.max(0, Math.min(100, (d / WALL_METER_SCALE_MAX) * 100));
  // 社長指示(v0.25.2385): **ステージ7のリザルトでは「深さのレビュー」と「罪の達成」を出さない。**
  // stage-7 は物語の最終戦(グレン)で、深さを掘る回でも大罪の段を上げる回でもない。
  // 「到達譜(深さ5区域×七つの大罪)」も「深度メーター(到達ランク/最深区域/自己最深)」も、
  // その回にやっていないことの成績表になってしまうため、まとめて隠す。
  // ※対象は stage-7 のみ(社長指示どおり)。EXステージ(stage-ex1)は指示が無いので現状維持。
  const hideDepthReview = getSelectedStageId() === 'stage-7';
  // PACING_PUZZLE.md §5.17-追補/§5.19 M18: 昇格度(惜しさ)。死亡時のみ・スナップショットがある時だけ。
  // ★未決事項(PACING_PUZZLE.md参照): 「総合が低い時はランク行を出さない」の閾値が未定義のため、
  // 現状は閾値を設けず常に表示する(暫定)。
  const promotion = (isDeathRun && lastKomaAssessmentInput) ? promotionScore(lastKomaAssessmentInput) : null;
  const statsItems = [
    { label: '生存時間', value: formatTime(stats.timeAlive) },
    { label: '撃破', value: stats.enemiesKilled },
    { label: '与ダメ', value: Math.ceil(stats.damageDealt) },
    { label: 'Lv', value: stats.maxLevel },
    { label: '最大コンボ', value: stats.maxCombo },
    { label: 'トレジャー', value: stats.treasuresCollected },
    // PACING_REDESIGN.mdバッチ2(計測): ラン中の最深到達エリア。挙動には影響しない表示のみ。
    { label: '最深到達', value: AREA_ZONE_NAMES[stats.maxAreaReached] ?? AREA_ZONE_NAMES[0] },
    { label: 'スクラップ残', value: remainingStraps },
    { label: 'ゴールド', value: goldEarned },
    ...(isBenchmarkRun ? [] : [{ label: '所持ゴールド', value: goldBalance }]),
  ];
  const scoreItems = [
    { label: 'ダメージスコア', value: damageScore },
    { label: 'KILLスコア', value: finisherScore },
    { label: 'コンボスコア', value: comboScore },
    { label: 'トレジャー', value: treasureScore },
    ...(eliteBossScore > 0 ? [{ label: '強敵撃破', value: eliteBossScore }] : []),
    { label: 'スクラップスコア', value: scrapScore },
    ...(survivalScore > 0 ? [{ label: '被ダメージスコア', value: survivalScore }] : []),
    // 研究所クリア時のみ「残り時間」ボーナスを表示(早いほど高い)。
    ...(speedBonus > 0 ? [{ label: '残り時間', value: speedBonus }] : []),
    ...(clearBonus > 0 ? [{ label: 'クリアボーナス', value: clearBonus }] : [])
  ];
  // PACING_PUZZLE.md §5.19 M18②: 「一番効いた項目」= scoreItems の argmax(同点は先勝ち)。
  const topScoreItemResult = topScoreItem(scoreItems);
  // §5.19 M18③: RESULTグリッドの要点4つ / 詳細▾へ回す残り。
  const resultCoreItems = [
    { label: '生存時間', value: formatTime(stats.timeAlive) },
    { label: '撃破', value: stats.enemiesKilled },
    { label: 'Lv', value: stats.maxLevel },
    { label: '最大コンボ', value: stats.maxCombo },
  ];
  const resultDetailItems = [
    { label: '与ダメ', value: Math.ceil(stats.damageDealt) },
    { label: 'トレジャー', value: stats.treasuresCollected },
    { label: 'スクラップ残', value: remainingStraps },
  ];
  const showLostEquipmentBox = isDeathRun && hadEquipment;
  const isBenchmark = benchmarkResult !== null;
  const safeBenchmarkStage = benchmarkResult?.stages.filter(stage => stage.grade === 'PASS').at(-1);
  const stoppedBenchmarkStage = benchmarkResult?.stages.find(stage => stage.grade !== 'PASS');
  const benchmarkShareText = useMemo(
    () => benchmarkResult ? formatBenchmarkShareText(benchmarkResult) : '',
    [benchmarkResult]
  );

  // v0.25.2374(実機テストチャットの指摘③): `?komalog=1` の時だけ、ランク較正の要約を**画面に出す**。
  // この機能の狙いは「実機で社長が普通に遊んだ1ラン」を測ることなのに、取り出し口が
  // `console.log` と `window.__KOMA_LOG__` の2つしか無く、**スマホには開発者コンソールが無い**ため
  // 実機で読めなかった(=存在しないのと同じだった)。リザルトは死亡/クリア/帰還の3経路すべてが通る唯一の画面。
  const komaText = useMemo(
    () => isKomaLogEnabled() ? JSON.stringify(komaLogSummary()) : '',
    []
  );
  // 指摘②: コンソール出力が「死亡」と「ボットのクリア」の2箇所しか無く、
  // **人間のクリア/帰還では1行も出ていなかった**。ここで3経路すべてを拾う(二重出力は once ガードで防ぐ)。
  useEffect(() => { logKomaSummary(); }, []);

  const handleCopyKoma = async () => {
    if (!komaText) return;
    try {
      await copyText(komaText);
      setKomaCopyState('copied');
      window.setTimeout(() => setKomaCopyState('idle'), 1600);
    } catch {
      setKomaCopyState('failed');
      window.setTimeout(() => setKomaCopyState('idle'), 2200);
    }
  };

  // スコア欄直下に置く小さなオプトアウト行(既定=オフ=反映する)。既存リザルトのトーン(bg-black/20・
  // text-[11px])に合わせ、新規演出なし。classic/新レイアウト両方の分岐から同じものを差し込む。
  const traitOptOutRow = hasPendingTraits ? (
    <label className="mb-3 flex items-center gap-2 rounded-none bg-black/20 px-3 py-2 text-[11px] text-white/60 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={traitOptOut}
        onChange={e => { playSfx('ui-select'); setTraitOptOut(e.target.checked); }}
        className="h-4 w-4 shrink-0 accent-sky-400"
      />
      <span>今回のプレイを守護霊に反映しない</span>
    </label>
  ) : null;

  // BOT_AND_GHOST.md §2.13/§2.16 B: 撃破年表(撃破順のアイコン帯+1件ずつのカード)。
  // 撃破が無いラン(timeline空)はセクションごと出さない=従来のリザルトのまま。
  // 文言・並び・見た目は叩き台(実機で社長調整前提)。新規演出(強glow等)は使わない=負荷1/10。
  const ghostTimelineSection = timeline.length > 0 ? (
    <div className="mb-3 rounded-none bg-purple-400/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-white/45">討伐年表</span>
        <span className="text-[10px] text-white/40">チェックした撃破を守護霊へ記録</span>
      </div>
      <BossClearStrip cards={timeline} />
      <div className="mt-1 space-y-2">
        {timeline.map(card => (
          <BossClearCardRow
            key={card.slotKey}
            card={card}
            checked={adoptedSlots.has(card.slotKey)}
            onToggle={toggleAdopt}
          />
        ))}
      </div>
      {adoptedSlots.size === 0 && (
        <p className="mt-2 text-[10px] text-white/45">全て未採用＝今回のプレイを守護霊に反映しません。</p>
      )}
    </div>
  ) : null;

  // §2.17(GHOST-DUO-RECORDS): 同行枠の年表(守護霊同行ランの撃破)。**採用チェック無し**(写し不可)・
  // 評価数値無し(計測しない)。撃破タイム+同行者(名前+クラス絵)+ベスト更新表示のみ。
  // 撃破が無い同行ラン(duoTimeline空)はセクションごと出さない。文言・見た目は叩き台。
  const duoTimelineSection = duoTimeline.length > 0 ? (
    <div className="mb-3 rounded-none bg-sky-400/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-white/45">討伐年表（同行）</span>
        <span className="text-[10px] text-white/40">守護霊と共闘した撃破の記録</span>
      </div>
      <BossClearStrip cards={duoTimeline} />
      <div className="mt-1 space-y-2">
        {duoTimeline.map(card => (
          <BossClearCardRow key={`${card.slotKey}:${card.at}`} card={card} duo />
        ))}
      </div>
    </div>
  ) : null;

  // §2.15/§2.16 B: 同行守護霊のフルカード(持ち主名+ビルド+ステータス)。年表とは独立で、
  // 守護霊が召喚されたランなら撃破の有無に関わらず出す(いいねボタンは置かない=裁定どおり)。
  const ghostAllySection = ghostAlly ? (
    <div className="mb-3">
      <GhostAllyCard ally={ghostAlly} />
    </div>
  ) : null;

  const handleCopyBenchmark = async () => {
    if (!benchmarkShareText) return;
    try {
      await copyText(benchmarkShareText);
      setBenchmarkCopyState('copied');
      window.setTimeout(() => setBenchmarkCopyState('idle'), 1600);
    } catch {
      setBenchmarkCopyState('failed');
      window.setTimeout(() => setBenchmarkCopyState('idle'), 2200);
    }
  };

  return (
    <div
      className="screen-in min-h-screen w-full flex items-center justify-center px-3"
      style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto overscroll-contain touch-pan-y rounded-none">
        <div className="px-4 pt-5 pb-2 text-center">
          <h2 className={`text-2xl font-semibold tracking-tight ${won || withdraw ? 'text-amber-300' : 'text-white'}`}>
            {isBenchmark ? 'ベンチ結果' : won ? '任務達成' : withdraw ? '帰還' : '任務失敗'}
          </h2>
          {/* PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-6: 「任務クリア」の直下に日時/場所名/
              ミッション名を表示(追補1-6の表示順どおり)。勝利時・ステージ情報が引けた時だけ。 */}
          {won && stage && mission && (
            <p className="mt-1 text-[12px] text-purple-200/70 tracking-wide">
              {stageDateLabel(stage)}{'　'}{stage.locationTitle}{'　'}{mission.title}
            </p>
          )}
          {/* 任務報告=日時/場所ヘッダー直下・「〜に到達」の上へ移設(社長指示v0.25.1945・赤ライン位置)。勝利クリア時のみ。text-leftで中央寄せ打ち消し。 */}
          {won && clearReportLines.length > 0 && (
            <div className="mt-3 mb-1 rounded-none bg-amber-400/5 px-3 py-2.5 text-left">
              <div className="mb-1.5 text-[10px] uppercase tracking-widest text-amber-200/70">任務報告</div>
              <div className="space-y-1 text-[12px] leading-relaxed text-white/85" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
                {clearReportLines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
              {unlockedRecords.length > 0 && (
                <button
                  type="button"
                  onClick={() => { playSfx('ui-select'); setArchiveListOpen(true); }}
                  className="mt-2.5 w-full rounded-none bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-100"
                >
                  回収資料を見る（{unlockedRecords.length}）
                </button>
              )}
            </div>
          )}
          {/* 勝利時の「森を生き延びた」は撤去(社長指示v0.25.1671)。ベンチ/撤退の文言のみ残す。 */}
          {(isBenchmark || withdraw) && (
            <p className="text-[13px] text-white/60 mt-1">
              {isBenchmark ? '段階式の描画負荷テストが完了しました' : '装備を持って撤収した'}
            </p>
          )}
          {resultClassicMode ? (
            <>
              {!isBenchmark && !hideDepthReview && (
                <div className="mt-2">
                  <p className="text-[15px] font-semibold tracking-wide" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
                    <span className="text-white/95">{wallHeadline}</span>
                  </p>
                  <div className="mx-auto mt-0.5 h-[2px] w-24 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #ffd700, transparent)' }} />
                  <p className="mt-1 text-[10px] text-white/50">
                    {AREA_ZONE_NAMES[stats.maxAreaReached]} × {rankLabel(wallHighestRank)}
                  </p>
                </div>
              )}
              {!isBenchmark && !won && !withdraw && deathCause && (
                <p className="mt-2 text-[12px] text-white/70">
                  死因：<span className="font-semibold text-rose-200">{deathCause}</span>
                </p>
              )}
              {/* PACING_PUZZLE.md §5.17 M14: 惜しさ(死亡時のみ・燃料)。数字だけ1回明滅・派手にしない。 */}
              {/* 「◯◯まであと1昇格」は同語反復(R7以外なら常に真)なので撤去(社長指示v0.25.2342)。距離だけ残す。 */}
              {!isBenchmark && !hideDepthReview && !won && !withdraw && wallMetersToNext !== null && (
                <p className="mt-1 text-[11px] text-white/60">
                  次の壁 {AREA_ZONE_NAMES[stats.maxAreaReached + 1]} まで あと約<span className="font-semibold text-white/90" style={{ animation: 'wall-tantalize-flicker 1.6s ease-out 1' }}>{wallMetersToNext}</span>m
                </p>
              )}
              {!isBenchmark && namedFoeResult && (
                <p className="mt-1 text-[12px] font-semibold text-amber-300">
                  宿敵 {namedFoeResult.name}：{namedFoeResult.defeated ? '討伐' : '取り逃がし'}
                </p>
              )}
            </>
          ) : (
            <>
              {/* 到達譜(v0.25.2332 社長指示で全面刷新): 上から下へ掘り下げる2本の縦坑。
                  左=深さ(5区域)・右=七つの大罪(7段を常に全部並べる)。自己最高を金の⚑で残し、
                  最後に「次の一手」を1行だけ出す=次がやりたくなる理由をここに集約する。
                  昇格度(診断寄りの数字)は前面から外して「詳細▾」へ移した。 */}
              {!isBenchmark && !hideDepthReview && (
                <ResultReach
                  dist={stats.maxDepthDist}
                  rank={wallHighestRank}
                  bestRank={wallMeta.selfHighestRank}
                  zoneIdx={stats.maxAreaReached}
                  end={runEnd}
                  at={runEndedAt}
                  history={runHistory}
                  pois={reachPois}
                  namedFoe={namedFoeResult}
                />
              )}
              {!isBenchmark && !won && !withdraw && deathCause && (
                <p className="mt-2 text-[12px] text-white/70">
                  死因：<span className="font-semibold text-rose-200">{deathCause}</span>
                </p>
              )}
            </>
          )}
        </div>
        <div className="px-4 pb-4">
          {benchmarkResult && (
            <div className={`mb-3 rounded-none border px-3 py-2 ${
              benchmarkResult.grade === 'PASS'
                ? 'bg-emerald-950/50 border-emerald-300/35'
                : benchmarkResult.grade === 'CAUTION'
                  ? 'bg-amber-950/50 border-amber-300/35'
                  : 'bg-rose-950/50 border-rose-300/35'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/50">BENCHMARK</div>
                  <div className="text-2xl font-bold text-white">{benchmarkResult.grade === 'PASS' ? 'SAFE' : 'FAIL'}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-[11px] text-white/70 tabular-nums">
                  <span>avg</span><span className="text-white">{benchmarkResult.avgFps.toFixed(1)}</span>
                  <span>min</span><span className="text-white">{benchmarkResult.minFps}</span>
                  <span>drops</span><span className="text-white">{benchmarkResult.drops}</span>
                  <span>enemy/fx</span><span className="text-white">{benchmarkResult.maxEnemies}/{benchmarkResult.maxFx}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-none bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
                <div className="min-w-0">
                  <span className="block text-white/40">safe</span>
                  <span className="block truncate text-emerald-100/80">{safeBenchmarkStage?.safeStress ?? 'not found'}</span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="block text-white/40">stop</span>
                  <span className="block truncate text-rose-100/80">{stoppedBenchmarkStage ? `${stoppedBenchmarkStage.label} ${stoppedBenchmarkStage.grade}` : 'max passed'}</span>
                </div>
              </div>
              <div className="mt-2 rounded-none bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
                <div className="grid grid-cols-[44px_1fr] gap-2">
                  <span className="text-white/40">device</span>
                  <span className="truncate text-purple-100/80">{benchmarkResult.diagnostics.verdict}</span>
                </div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 text-white/55">
                  <span className="truncate">
                    NET avg {benchmarkResult.diagnostics.netRttAvg.toFixed(0)}ms max {benchmarkResult.diagnostics.netRttMax.toFixed(0)}ms n{benchmarkResult.diagnostics.netSamples}
                    {benchmarkResult.diagnostics.netFailures > 0 ? ` fail${benchmarkResult.diagnostics.netFailures}` : ''}
                  </span>
                  <span className="truncate text-right">
                    MAIN avg {benchmarkResult.diagnostics.mainDelayAvg.toFixed(0)}ms max {benchmarkResult.diagnostics.mainDelayMax.toFixed(0)}ms n{benchmarkResult.diagnostics.mainSamples}
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded-none bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
                <div className="grid grid-cols-[44px_1fr] gap-2">
                  <span className="text-white/40">weak</span>
                  <span className="truncate text-rose-100/80">{benchmarkResult.bottleneck}</span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-0.5">
                  {benchmarkResult.categorySummary.map(line => (
                    <span key={line} className="truncate text-white/55">{line}</span>
                  ))}
                </div>
              </div>
              <div className="mt-2 space-y-1 rounded-none bg-black/20 px-2 py-2">
                {benchmarkResult.stages.map(stage => (
                  <div key={stage.id} className="grid grid-cols-[44px_1fr_42px] items-start gap-2 text-[10px] text-white/65 tabular-nums">
                    <span className="text-white/80">{stage.id}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{stage.category} {stage.label} avg {stage.avgFps.toFixed(1)} min {stage.minFps} drops {stage.drops} n{stage.sampleCount}</span>
                      <span className="block truncate text-white/45">start {stage.stress}</span>
                      <span className={stage.adjusted ? 'block truncate text-amber-100/80' : 'block truncate text-emerald-100/70'}>
                        40+ {stage.safeStress}
                      </span>
                    </span>
                    <span className={
                      stage.grade === 'PASS'
                        ? 'text-emerald-200'
                        : stage.grade === 'CAUTION'
                          ? 'text-amber-200'
                          : 'text-rose-200'
                    }>
                      {stage.grade}
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopyBenchmark}
                className="mt-2 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[11px] font-semibold text-white/85"
              >
                {benchmarkCopyState === 'copied'
                  ? 'コピーしました'
                  : benchmarkCopyState === 'failed'
                    ? 'コピー失敗'
                    : 'ベンチ結果をコピー'}
              </button>
            </div>
          )}
          {komaText && (
            <div className="mb-3 rounded-none border border-sky-400/30 bg-sky-400/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-sky-200/70">RANK CALIBRATION</div>
              <div className="mt-1 break-all text-[10px] leading-relaxed text-white/75 tabular-nums">{komaText}</div>
              <button
                type="button"
                onClick={handleCopyKoma}
                className="mt-2 w-full rounded-none bg-sky-400/10 px-3 py-2 text-[11px] font-semibold text-white/85"
              >
                {komaCopyState === 'copied'
                  ? 'コピーしました'
                  : komaCopyState === 'failed'
                    ? 'コピー失敗'
                    : '較正データをコピー'}
              </button>
            </div>
          )}
          {resultClassicMode ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-none bg-purple-400/5 px-3 py-2">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">RESULT</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {statsItems.map(item => (
                      <div key={item.label} className="min-w-0">
                        <div className="text-[9px] tracking-wide text-white/45 truncate">{item.label}</div>
                        <div className="text-[15px] font-semibold text-white tabular-nums truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-none bg-black/25 px-3 py-2">
                  <div className="mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-white/45">SCORE</span>
                      {isHighScore && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-400/25 text-amber-100 animate-pulse">
                          HIGH SCORE
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-2xl font-bold text-amber-200 tabular-nums leading-tight">{totalScore}</div>
                    {ghostSummoned && (
                      <div className="mt-0.5 text-[10px] text-sky-300/85">守護霊が共闘: スコア半分</div>
                    )}
                  </div>
                  <div className="space-y-1 text-[11px] text-white/65 tabular-nums">
                    {scoreItems.map(item => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <span>{item.label}</span>
                        <span className="text-right text-white/80">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {ghostTimelineSection}
              {duoTimelineSection}
              {ghostAllySection}
              {traitOptOutRow}
              {/* PACING_PUZZLE.md §5.17 M14: 到達譜=縦の深度メーター(壁4本の目盛り+今回バー+自己最深旗)。 */}
              {/* stage-7 は深さも大罪も動かない回なので丸ごと隠す(社長指示v0.25.2385・上の hideDepthReview 参照)。 */}
              {!isBenchmark && !hideDepthReview && (
                <div className="mb-3 rounded-none bg-black/25 px-3 py-2.5 flex items-center gap-3">
                  <div className="relative shrink-0" style={{ width: 14, height: 96 }}>
                    <div className="absolute inset-x-0 bottom-0 top-0 rounded-full bg-white/10" />
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-sky-300/70 to-amber-200/80"
                      style={{ height: `${wallMeterPct(stats.maxDepthDist)}%` }}
                    />
                    {AREA_THRESHOLDS.map(t => (
                      <div key={t} className="absolute inset-x-[-3px] h-px bg-white/40" style={{ bottom: `${wallMeterPct(t)}%` }} />
                    ))}
                    {wallMeta.selfDeepestDist > 0 && (
                      <div
                        className="absolute inset-x-[-5px] h-[2px] bg-amber-300"
                        style={{ bottom: `${wallMeterPct(wallMeta.selfDeepestDist)}%` }}
                        title="自己最深"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-[11px] text-white/70 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/50">到達ランク</span>
                      <span className="font-semibold tabular-nums" style={{ color: '#ff6a55' }}>{rankLabel(wallHighestRank)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/50">最深区域</span>
                      <span className="font-semibold text-sky-200">{AREA_ZONE_NAMES[stats.maxAreaReached]}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white/50">自己最深</span>
                      <span className="font-semibold tabular-nums" style={{ color: '#ffd700' }}>
                        {Math.round(Math.max(stats.maxDepthDist, wallMeta.selfDeepestDist))}m
                        {wallSelfBestUpdated && <span className="ml-1">⚑更新</span>}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {directorEnabled && !isBenchmark && <DirectorResult />}
            </>
          ) : (
            <>
              {/* PACING_PUZZLE.md §5.19 M18③: RESULTは要点4つ。総合スコアを主役に、内訳は詳細▾へ。 */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-none bg-purple-400/5 px-3 py-2">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/45">RESULT</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {resultCoreItems.map(item => (
                      <div key={item.label} className="min-w-0">
                        <div className="text-[9px] tracking-wide text-white/45 truncate">{item.label}</div>
                        <div className="text-[15px] font-semibold text-white tabular-nums truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-none bg-black/25 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-white/45">SCORE</span>
                    {isHighScore && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-400/25 text-amber-100 animate-pulse">
                        HIGH SCORE
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-2xl font-bold text-amber-200 tabular-nums leading-tight">{totalScore}</div>
                  {ghostSummoned && (
                    <div className="mt-0.5 text-[10px] text-sky-300/85">守護霊が共闘: スコア半分</div>
                  )}
                  {topScoreItemResult && (
                    <div className="mt-0.5 text-[11px] text-white/60 truncate">
                      {topScoreItemResult.label} <span className="font-semibold text-white/85 tabular-nums">{topScoreItemResult.value}</span>
                    </div>
                  )}
                </div>
              </div>
              {ghostTimelineSection}
              {duoTimelineSection}
              {ghostAllySection}
              {traitOptOutRow}
              {/* PACING_PUZZLE.md §5.19 M18②③: スコア内訳+残りの数字は「詳細▾」で開閉(既定は畳む)。 */}
              <button
                type="button"
                onClick={() => setScoreDetailOpen(v => !v)}
                className="mb-3 w-full flex items-center justify-between rounded-none bg-purple-400/5 px-3 py-1.5 text-[11px] text-white/60"
              >
                <span>詳細</span>
                <span>{scoreDetailOpen ? '▴' : '▾'}</span>
              </button>
              {scoreDetailOpen && (
                <div className="mb-3 rounded-none bg-black/20 px-3 py-2.5 space-y-2.5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {resultDetailItems.map(item => (
                      <div key={item.label} className="min-w-0">
                        <div className="text-[9px] tracking-wide text-white/45 truncate">{item.label}</div>
                        <div className="text-[13px] font-semibold text-white tabular-nums truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1 border-t border-white/10 pt-2 text-[11px] text-white/65 tabular-nums">
                    {scoreItems.map(item => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <span>{item.label}</span>
                        <span className="text-right text-white/80">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  {/* 昇格度(惜しさ)は診断寄りの数字なので前面から降ろした(v0.25.2332)。
                      死亡時のみ・スナップショットがある時だけ。 */}
                  {promotion && (
                    <div className="border-t border-white/10 pt-2 text-[11px] text-white/65">
                      <span className="text-white/45">昇格度</span>{' '}
                      <span className="font-semibold tabular-nums" style={{ color: '#ffd700' }}>{Math.round(promotion.total)}</span>
                      <span className="text-white/40"> —— 阻んだのは</span>{' '}
                      <span className="font-semibold text-rose-200">
                        {PROMOTION_BOTTLENECK_LABEL[promotion.bottleneck]}({Math.round(promotion[promotion.bottleneck])})
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* PACING_PUZZLE.md §5.19 M18④: AIディレクターは既定で畳む(社長指示v0.25.1374を今回の承認で上書き)。 */}
              {directorEnabled && !isBenchmark && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setDirectorOpen(v => !v)}
                    className="w-full flex items-center justify-between rounded-none bg-purple-400/5 px-3 py-1.5 text-[11px] text-white/60"
                  >
                    <span>AIディレクター</span>
                    <span>{directorOpen ? '閉じる▴' : '開く▾'}</span>
                  </button>
                  {directorOpen && <div className="mt-2"><DirectorResult /></div>}
                </div>
              )}
              {/* PACING_PUZZLE.md §5.19 M18③: ゴールド/所持ゴールドは「お金の枠」へ移動。
                  死亡+装備ロストがある時は換金額と同居(下のロスト装備ボックス)。それ以外はここで単独表示。 */}
              {!isBenchmark && !showLostEquipmentBox && (
                <div className="mb-3 rounded-none bg-black/20 px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-white/60">
                  <span>獲得 <span className="font-semibold text-amber-200 tabular-nums">+{goldEarned}g</span></span>
                  <span>所持 <span className="font-semibold text-white tabular-nums">{goldBalance}g</span></span>
                </div>
              )}
            </>
          )}
          {/* 任務報告は上(日時/場所ヘッダー直下)へ移設済み(社長指示v0.25.1945)。ここには出さない。 */}
          {showLostEquipmentBox && (
            <div className="mb-3 rounded-none bg-rose-400/5 px-3 py-2.5">
              {/* PACING_PUZZLE.md §5.19 M18③: ゴールド/所持ゴールドを「お金の枠」(ロスト装備の換金額と
                  同居)へ集約。旧レイアウトは換金額のみだった行を、獲得/所持込みに拡張する。 */}
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[11px] font-semibold text-rose-200">失った装備</span>
                {resultClassicMode ? (
                  equipmentGold > 0 && (
                    <span className="text-[11px] font-semibold text-amber-200 tabular-nums">換金 +{equipmentGold}g</span>
                  )
                ) : (
                  <span className="text-[10px] text-white/60 tabular-nums truncate">
                    獲得 <span className="font-semibold text-amber-200">+{goldEarned}g</span>
                    {equipmentGold > 0 && <> / 換金 <span className="font-semibold text-amber-200">+{equipmentGold}g</span></>}
                    {' '}/ 所持 <span className="font-semibold text-white">{goldBalance}g</span>
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {(['body', 'arms', 'accessory'] as EquipSlot[]).map(slot => {
                  const defId = carriedLoadout[slot];
                  if (!defId) return null;
                  const def = equipmentById(defId);
                  if (!def) return null;
                  const isSp = def.special;
                  const iconImg = hasEquipIcon(defId) ? spritePath(equipIconName(defId)) : null;
                  return (
                    <div
                      key={slot}
                      className="text-left p-2 rounded-none bg-purple-400/5 flex items-center gap-2.5 opacity-80"
                    >
                      <div className="w-8 h-8 rounded-none bg-purple-400/10 flex items-center justify-center overflow-hidden shrink-0 text-base grayscale">
                        {iconImg
                          ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                          : (isSp ? '🏯' : '🛡️')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white/85 truncate line-through decoration-rose-300/60">{def.name}</span>
                          {isSp
                            ? <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-400/25 text-amber-100 shrink-0">特殊</span>
                            : <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-600/25 text-purple-100 shrink-0">R{def.tier}</span>}
                        </div>
                        <div className="text-[10px] text-white/55 leading-snug truncate">{equipmentDescription(def)}</div>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-200 tabular-nums shrink-0">+{equipScrapGold(def)}g</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(won || withdraw) && hadEquipment && (
            <div className="mb-3 rounded-none bg-amber-400/5 px-3 py-2.5">
              <div className="text-[11px] font-semibold text-amber-200 mb-2">持ち帰る装備を1つ選択（他は破棄）</div>
              <div className="flex flex-col gap-1.5">
                {(['body', 'arms', 'accessory'] as EquipSlot[]).map(slot => {
                  const defId = carriedLoadout[slot];
                  if (!defId) return null;
                  const def = equipmentById(defId);
                  if (!def) return null;
                  const sel = carriedPick === defId;
                  const isSp = def.special;
                  const iconImg = hasEquipIcon(defId) ? spritePath(equipIconName(defId)) : null;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => pickCarry(defId)}
                      className={`text-left p-2 rounded-none border flex items-center gap-2.5 transition-colors ${sel ? 'bg-amber-400/25 border-amber-300/70' : isSp ? 'bg-amber-400/10 border-amber-300/40 active:bg-amber-400/20' : 'bg-purple-400/5 border-purple-400/10 active:bg-purple-400/10'}`}
                    >
                      <div className="w-8 h-8 rounded-none bg-purple-400/10 flex items-center justify-center overflow-hidden shrink-0 text-base">
                        {iconImg
                          ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                          : (isSp ? '🏯' : '🛡️')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white truncate">{def.name}</span>
                          {isSp
                            ? <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-400/30 text-amber-100 shrink-0">特殊</span>
                            : <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-600/30 text-purple-100 shrink-0">R{def.tier}</span>}
                        </div>
                        <div className="text-[10px] text-white/65 leading-snug truncate">{equipmentDescription(def)}</div>
                      </div>
                      {sel && <span className="text-amber-200 text-sm shrink-0">✓</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => pickCarry(null)}
                  className={`text-left p-2 rounded-none border text-[12px] ${carriedPick === '__none__' ? 'bg-purple-400/15 border-purple-400/40 text-white' : 'bg-purple-400/5 border-purple-400/10 text-white/60 active:bg-purple-400/10'}`}
                >
                  持ち帰らない
                </button>
              </div>
              <div className="mt-1.5 text-[9px] text-white/45">
                {carriedPick && carriedPick !== '__none__'
                  ? '次のランに持ち越されます（死亡で全ロスト）'
                  : carriedPick === '__none__'
                    ? '持ち帰りません'
                    : 'タップで選択。未選択なら持ち帰りなし'}
              </div>
            </div>
          )}
          {/* 社長指示v0.25.2315: **クリア(任務達成)時だけ**は二択(もう一度プレイ/メニューに戻る)を
              やめて「OK」の一択にする。押した時の遷移は従来の「メニューに戻る」と同じ(=M7クリア後の
              通常エンディング予約もこの経路に乗っているので変えない)。死亡/撤退/ベンチは従来どおり二択。 */}
          {won ? (
            <button
              onClick={settleAnd(onReturnToMenu)}
              className="w-full py-3 rounded-none text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95))',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)'
              }}
            >
              OK
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={settleAnd(onPlayAgain)}
                className="w-full py-3 rounded-none text-sm font-semibold text-white"
                style={{
                  background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
                }}
              >
                もう一度プレイ
              </button>
              <button
                onClick={settleAnd(onReturnToMenu)}
                className="w-full py-3 rounded-none text-sm font-semibold text-white/90 bg-purple-400/10"
              >
                メニューに戻る
              </button>
            </div>
          )}
        </div>
      </div>
      {/* PACING_PUZZLE.md §6.17 M40 / STORY_UI_SPEC.md 5章: 「回収資料を見る」の一覧→本文モーダル。
          既存リザルトと同じトーン(glass-panel・金色明朝見出し)。強glow等の新規演出は使わない(負荷1/10)。
          一覧/本文どちらの「閉じる」も回収資料フロー全体を閉じてリザルトへ戻す(§5「閉じるとリザルト
          画面へ戻る」)。 */}
      {(archiveListOpen || openRecord) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3"
          style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
        >
          <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto overscroll-contain touch-pan-y rounded-none">
            {openRecord ? (
              <div className="px-4 py-5">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-200/70">回収資料</div>
                <h3
                  className="mb-3 text-lg font-semibold text-amber-100"
                  style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                >
                  {openRecord.title}
                </h3>
                <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
                  {openRecord.body.map((line, i) => <p key={i}>{line}</p>)}
                </div>
                {/* 本文の「閉じる」は一覧へ戻す(設計チャット調整v0.25.1746: 4件連続で読む動線を1タップに。
                    リザルトへ戻るのは一覧側の閉じる=仕様書5章どおり)。 */}
                <button
                  type="button"
                  onClick={() => { playSfx('ui-select'); setOpenRecordId(null); setArchiveListOpen(true); }}
                  className="mt-4 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[12px] font-semibold text-white/85"
                >
                  一覧へ戻る
                </button>
              </div>
            ) : (
              <div className="px-4 py-5">
                <div className="mb-3 text-[10px] uppercase tracking-widest text-amber-200/70">回収資料（今回分）</div>
                <div className="flex flex-col gap-1.5">
                  {unlockedRecords.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleOpenRecord(r.id)}
                      className="text-left p-2.5 rounded-none bg-amber-400/5 active:bg-amber-400/10"
                    >
                      <span className="text-[13px] font-semibold text-amber-100">{r.title}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={closeArchive}
                  className="mt-4 w-full rounded-none bg-purple-400/10 px-3 py-2 text-[12px] font-semibold text-white/85"
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 小烏丸解禁ポップアップ(社長指示): 裏ボス「トール」初回討伐のランのリザルトで1回だけ出す。
          won/lost/withdraw・resultClassicMode を問わず出すため、最外殻コンテナ(回収資料モーダルと同じ層)に置く。
          既存リザルトと同じトーン(暗幕・glass-panel・金色アクセント=WEAPON MERCHANT見出し)。新規演出は無し(負荷1/10)。 */}
      {kogarasuUnlockedThisRun && kogarasuPopupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-3 bg-black/70">
          <div className="glass-panel w-full max-w-sm rounded-none px-5 py-6 text-center">
            <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200/65">NEW WEAPON UNLOCKED</div>
            <h3
              className="mt-2 text-2xl font-bold text-amber-300"
              style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
            >
              小烏丸 解放
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed text-white/85">
              裏ボス『トール』討伐報酬。刀をLv3(MAX)まで強化すると武器商人に小烏丸が並ぶ。
            </p>
            <button
              type="button"
              onClick={() => { playSfx('ui-select'); setKogarasuPopupOpen(false); }}
              className="mt-5 w-full rounded-none bg-amber-400/15 px-3 py-2.5 text-sm font-bold text-amber-100"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameOverScreen;

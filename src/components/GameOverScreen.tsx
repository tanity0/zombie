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
import { getSelectedStageId, getSelectedMission, submitStageHighScore } from '../data/progress';
import { getStage, stageDateLabel, REVISIT_MISSION } from '../data/campaign';
import { getArchiveRecord, unlockRecordsForStage, markRecordRead, type ArchiveRecord } from '../data/storyArchive';
import { AREA_ZONE_NAMES, AREA_THRESHOLDS } from '../utils/enemyUtils';
import { clampRank, promotionScore, PROMOTION_BOTTLENECK_LABEL } from '../utils/rankAssessor';
import {
  wallAchievementHeadline, metersToNextWall, isOneRankAwayFromNext, nextRankName, WALL_RANK_NAMES,
} from '../utils/wallProgress';
import DirectorResult from './DirectorResult';

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

  return [
    `BENCH v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'}`,
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
  } = calculateResultScore(stats, won, isLab);
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
  const wallNextRank = isOneRankAwayFromNext(wallHighestRank) ? nextRankName(wallHighestRank) : null;
  const wallMeterPct = (d: number) => Math.max(0, Math.min(100, (d / WALL_METER_SCALE_MAX) * 100));
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
            {isBenchmark ? 'ベンチ結果' : won ? 'ステージクリア！' : withdraw ? '帰還' : 'ゲームオーバー'}
          </h2>
          {/* PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-6: 「任務クリア」の直下に日時/場所名/
              ミッション名を表示(追補1-6の表示順どおり)。勝利時・ステージ情報が引けた時だけ。 */}
          {won && stage && mission && (
            <p className="mt-1 text-[12px] text-purple-200/70 tracking-wide">
              {stageDateLabel(stage)}{'　'}{stage.locationTitle}{'　'}{mission.title}
            </p>
          )}
          {/* 勝利時の「森を生き延びた」は撤去(社長指示v0.25.1671)。ベンチ/撤退の文言のみ残す。 */}
          {(isBenchmark || withdraw) && (
            <p className="text-[13px] text-white/60 mt-1">
              {isBenchmark ? '段階式の描画負荷テストが完了しました' : '装備を持って撤収した'}
            </p>
          )}
          {resultClassicMode ? (
            <>
              {!isBenchmark && (
                <div className="mt-2">
                  <p className="text-[15px] font-semibold tracking-wide" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
                    <span className="text-white/95">{wallHeadline}</span>
                  </p>
                  <div className="mx-auto mt-0.5 h-[2px] w-24 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #ffd700, transparent)' }} />
                  <p className="mt-1 text-[10px] text-white/50">
                    {AREA_ZONE_NAMES[stats.maxAreaReached]} × {WALL_RANK_NAMES[wallHighestRank]}
                  </p>
                </div>
              )}
              {!isBenchmark && !won && !withdraw && deathCause && (
                <p className="mt-2 text-[12px] text-white/70">
                  死因：<span className="font-semibold text-rose-200">{deathCause}</span>
                </p>
              )}
              {/* PACING_PUZZLE.md §5.17 M14: 惜しさ(死亡時のみ・燃料)。数字だけ1回明滅・派手にしない。 */}
              {!isBenchmark && !won && !withdraw && (wallMetersToNext !== null || wallNextRank) && (
                <p className="mt-1 text-[11px] text-white/60">
                  {wallMetersToNext !== null && (
                    <>次の壁 {AREA_ZONE_NAMES[stats.maxAreaReached + 1]} まで あと約<span className="font-semibold text-white/90" style={{ animation: 'wall-tantalize-flicker 1.6s ease-out 1' }}>{wallMetersToNext}</span>m</>
                  )}
                  {wallMetersToNext !== null && wallNextRank && ' / '}
                  {wallNextRank && (
                    <><span className="font-semibold text-rose-300">{wallNextRank}</span> まで あと1昇格だった</>
                  )}
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
              {/* PACING_PUZZLE.md §5.19 M18①: 到達譜を1ヒーロー枠に統合(見出し+深度メーター+
                  自己最深+宿敵行+昇格度)。旧・小字/RESULT最深到達/メーター内到達ランク・最深区域行は削除。 */}
              {!isBenchmark && (
                <div className="mt-2">
                  <p className="text-[15px] font-semibold tracking-wide" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
                    <span className="text-white/95">{wallHeadline}</span>
                  </p>
                  <div className="mx-auto mt-0.5 h-[2px] w-24 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #ffd700, transparent)' }} />
                  <div className="mt-2.5 flex items-center gap-3 text-left">
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
                        <span className="text-white/50">自己最深</span>
                        <span className="font-semibold tabular-nums" style={{ color: '#ffd700' }}>
                          {Math.round(Math.max(stats.maxDepthDist, wallMeta.selfDeepestDist))}m
                          {wallSelfBestUpdated && <span className="ml-1">⚑更新</span>}
                        </span>
                      </div>
                      {namedFoeResult && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-white/50">宿敵 {namedFoeResult.name}</span>
                          <span className="font-semibold text-amber-300">{namedFoeResult.defeated ? '討伐' : '取り逃がし'}</span>
                        </div>
                      )}
                      {/* PACING_PUZZLE.md §5.17-追補: 昇格度(惜しさ)。死亡時のみ・スナップショットがある時だけ。 */}
                      {promotion && (
                        <div className="pt-0.5">
                          <span className="text-white/50">昇格度</span>{' '}
                          <span className="font-semibold tabular-nums" style={{ color: '#ffd700' }}>{Math.round(promotion.total)}</span>
                          <span className="text-white/40"> —— 阻んだのは</span>{' '}
                          <span className="font-semibold text-rose-200">
                            {PROMOTION_BOTTLENECK_LABEL[promotion.bottleneck]}({Math.round(promotion[promotion.bottleneck])})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
              {/* PACING_PUZZLE.md §5.17 M14: 到達譜=縦の深度メーター(壁4本の目盛り+今回バー+自己最深旗)。 */}
              {!isBenchmark && (
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
                      <span className="font-semibold tabular-nums" style={{ color: '#ff6a55' }}>{WALL_RANK_NAMES[wallHighestRank]}</span>
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
                  {topScoreItemResult && (
                    <div className="mt-0.5 text-[11px] text-white/60 truncate">
                      {topScoreItemResult.label} <span className="font-semibold text-white/85 tabular-nums">{topScoreItemResult.value}</span>
                    </div>
                  )}
                </div>
              </div>
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
          {/* PACING_PUZZLE.md §6.17 M40 / STORY_UI_SPEC.md 5章: 任務報告(勝利クリア時のみ)。
              スコア/報酬の下・[回収資料を見る]/次への上、というSTORY_UI_SPEC.mdの推奨レイアウト順。
              死亡/撤退/ベンチには一切出さない(clearReportLines は won=false だと空になる)。 */}
          {won && clearReportLines.length > 0 && (
            <div className="mb-3 rounded-none bg-amber-400/5 px-3 py-2.5">
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPlayAgain}
              className="w-full py-3 rounded-none text-sm font-semibold text-white"
              style={
                won
                  ? {
                      background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.95), rgba(245, 158, 11, 0.95))',
                      boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)'
                    }
                  : {
                      background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.95), rgba(59, 130, 246, 0.95))',
                      boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)'
                    }
              }
            >
              もう一度プレイ
            </button>
            <button
              onClick={onReturnToMenu}
              className="w-full py-3 rounded-none text-sm font-semibold text-white/90 bg-purple-400/10"
            >
              メニューに戻る
            </button>
          </div>
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
    </div>
  );
};

export default GameOverScreen;

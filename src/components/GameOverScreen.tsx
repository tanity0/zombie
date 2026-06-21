import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameStats } from '../types/game';
import { formatTime } from '../utils/renderUtils';
import { calculateResultScore } from '../utils/resultScoring';
import { useGameStore } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { equipmentById, equipmentDescription, equipIconName, hasEquipIcon, equipScrapGold } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import type { EquipSlot } from '../types/game';
import type { BenchmarkResult } from './BenchmarkOverlay';
import { getSelectedStageId, submitStageHighScore } from '../data/progress';

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
  // 研究所(屋内)クリアかどうか。勝利後も indoorMode は保持されている。
  const indoor = useGameStore(s => s.indoorMode);
  // 死亡時の「装備ロスト」明示用。装備していたかの派生ブール(静的画面なので再描画コスト無し)。
  const hadEquipment = useGameStore(s => Object.values(s.player.equipment).some(Boolean));
  // 死因(直近の被弾原因)。
  const deathCause = useGameStore(s => s.lastDamageSource);
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
    comboScore,
    treasureScore,
    strapScore,
    timeBonus,
    clearBonus,
    totalScore,
    goldEarned,
  } = calculateResultScore(stats, won, indoor);
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

  const remainingStraps = Math.max(0, stats.strapsCollected - stats.strapsSpent);
  const statsItems = [
    { label: '生存時間', value: formatTime(stats.timeAlive) },
    { label: '撃破', value: stats.enemiesKilled },
    { label: '与ダメ', value: Math.floor(stats.damageDealt) },
    { label: 'Lv', value: stats.maxLevel },
    { label: '最大コンボ', value: stats.maxCombo },
    { label: 'トレジャー', value: stats.treasuresCollected },
    { label: 'スクラップ残', value: remainingStraps },
    { label: 'ゴールド', value: goldEarned },
    ...(isBenchmarkRun ? [] : [{ label: '所持ゴールド', value: goldBalance }]),
  ];
  const scoreItems = [
    { label: '与ダメ', value: damageScore },
    { label: '最大コンボ', value: comboScore },
    { label: 'トレジャー', value: treasureScore },
    { label: '残スクラップ', value: strapScore },
    // 研究所クリア時のみ「残り時間」ボーナスを表示(早いほど高い)。
    ...(timeBonus > 0 ? [{ label: '残り時間', value: timeBonus }] : []),
    ...(clearBonus > 0 ? [{ label: 'クリアボーナス', value: clearBonus }] : [])
  ];
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
      className="min-h-screen w-full flex items-center justify-center px-3"
      style={{ background: 'rgba(11, 11, 18, 0.85)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      <div className="glass-panel max-h-[calc(100svh-36px)] w-full max-w-lg overflow-y-auto rounded-3xl">
        <div className="px-4 pt-5 pb-2 text-center">
          <h2 className={`text-2xl font-semibold tracking-tight ${won || withdraw ? 'text-amber-300' : 'text-white'}`}>
            {isBenchmark ? 'ベンチ結果' : won ? 'ステージクリア！' : withdraw ? '帰還' : 'ゲームオーバー'}
          </h2>
          <p className="text-[13px] text-white/60 mt-1">
            {isBenchmark ? '段階式の描画負荷テストが完了しました' : won ? '森を生き延びた' : withdraw ? '装備を持って撤収した' : '闇に飲み込まれました'}
          </p>
          {!isBenchmark && !won && !withdraw && deathCause && (
            <p className="mt-2 text-[12px] text-white/70">
              死因：<span className="font-semibold text-rose-200">{deathCause}</span>
            </p>
          )}
          {!isBenchmark && !won && !withdraw && hadEquipment && (
            <p className="mt-2 inline-block rounded-full border border-rose-300/40 bg-rose-500/15 px-3 py-1 text-[12px] font-semibold text-rose-200">
              装備をすべてロストしました
            </p>
          )}
        </div>
        <div className="px-4 pb-4">
          {benchmarkResult && (
            <div className={`mb-3 rounded-2xl border px-3 py-2 ${
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
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
                <div className="min-w-0">
                  <span className="block text-white/40">safe</span>
                  <span className="block truncate text-emerald-100/80">{safeBenchmarkStage?.safeStress ?? 'not found'}</span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="block text-white/40">stop</span>
                  <span className="block truncate text-rose-100/80">{stoppedBenchmarkStage ? `${stoppedBenchmarkStage.label} ${stoppedBenchmarkStage.grade}` : 'max passed'}</span>
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
                <div className="grid grid-cols-[44px_1fr] gap-2">
                  <span className="text-white/40">device</span>
                  <span className="truncate text-sky-100/80">{benchmarkResult.diagnostics.verdict}</span>
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
              <div className="mt-2 rounded-xl bg-black/20 px-2 py-2 text-[10px] text-white/65 tabular-nums">
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
              <div className="mt-2 space-y-1 rounded-xl bg-black/20 px-2 py-2">
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
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/85"
              >
                {benchmarkCopyState === 'copied'
                  ? 'コピーしました'
                  : benchmarkCopyState === 'failed'
                    ? 'コピー失敗'
                    : 'ベンチ結果をコピー'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
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
            <div className="rounded-2xl bg-black/25 border border-white/10 px-3 py-2">
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/45">SCORE</span>
                  {isHighScore && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-400/25 text-amber-100 border border-amber-300/50 animate-pulse">
                      HIGH SCORE
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-amber-200 tabular-nums leading-tight">{totalScore}</div>
              </div>
              <div className="space-y-1 text-[11px] text-white/65 tabular-nums">
                {scoreItems.map(item => (
                  <div key={item.label} className="flex items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span className="text-right text-white/80">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[9px] leading-tight text-white/45">
                ゴールド = SCORE / 2000
              </div>
            </div>
          </div>
          {!isBenchmark && !won && !withdraw && hadEquipment && (
            <div className="mb-3 rounded-2xl bg-rose-400/5 border border-rose-300/25 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-rose-200">失った装備</span>
                {equipmentGold > 0 && (
                  <span className="text-[11px] font-semibold text-amber-200 tabular-nums">換金 +{equipmentGold}g</span>
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
                      className="text-left p-2 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2.5 opacity-80"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 text-base grayscale">
                        {iconImg
                          ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                          : (isSp ? '🏯' : '🛡️')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white/85 truncate line-through decoration-rose-300/60">{def.name}</span>
                          {isSp
                            ? <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-400/25 text-amber-100 border border-amber-300/30 shrink-0">特殊</span>
                            : <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-500/25 text-blue-100 border border-blue-300/25 shrink-0">R{def.tier}</span>}
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
            <div className="mb-3 rounded-2xl bg-amber-400/5 border border-amber-300/30 px-3 py-2.5">
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
                      className={`text-left p-2 rounded-xl border flex items-center gap-2.5 transition-colors ${sel ? 'bg-amber-400/25 border-amber-300/70' : isSp ? 'bg-amber-400/10 border-amber-300/40 active:bg-amber-400/20' : 'bg-white/5 border-white/10 active:bg-white/10'}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center overflow-hidden shrink-0 text-base">
                        {iconImg
                          ? <img src={iconImg} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />
                          : (isSp ? '🏯' : '🛡️')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white truncate">{def.name}</span>
                          {isSp
                            ? <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-400/30 text-amber-100 border border-amber-300/40 shrink-0">特殊</span>
                            : <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-500/30 text-blue-100 border border-blue-300/30 shrink-0">R{def.tier}</span>}
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
                  className={`text-left p-2 rounded-xl border text-[12px] ${carriedPick === '__none__' ? 'bg-white/15 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/60 active:bg-white/10'}`}
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
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white"
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
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white/90 bg-white/10 border border-white/10"
            >
              メニューに戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverScreen;

import React from 'react';
import { useGameStore } from '../store/gameStore';
import { isBossType } from '../utils/enemyUtils';

// UI_OVERHAUL.md §1(社長裁定2026-08-28「上から0pxに1px幅で横いっぱいにライン引いて…」)。
// 旧DirectorLine(上部30px下・幅72px固定・下地に刻み7つ)を置き換え。
//  層1: 色+脈動 = ディレクターのコマ(リラックス青緑・静止/ハーベスト金・ゆらぎ/通常 白・弱明滅/
//        ピーク赤・速い脈動。1pxのため太さ変化は廃止し脈動=opacityのみ)
//  層2: 満ち幅 = ランク1〜7(中央から左右へ均等に伸びる。ランク7で画面幅いっぱい)
//  層3: 上書き = 紅き夜=紫が全体を乗っ取り(①) / コマ色(②) / ボス戦中=両端(フェード帯)を金に
//  層4: ランク変化の瞬間だけ、幅を持つ本体とは別の兄弟オーバーレイをkey再マウントしてフラッシュ
//       (本体をkey再マウントすると幅のtransitionが一度も走らない=着手前監査A-1)。
// 再レンダー規律: hudDirector はdirectorTickが**変化時のみ**書くミラー(コマ=約40秒に1回・ランク変化時)。
// ボス有無/紅き夜は boolean 派生値の購読(変わった時だけ再描画)。脈動・フラッシュはCSSアニメ=毎フレームJSなし。
const KOMA_STYLE: Record<string, { color: string; dur: string }> = {
  relax:   { color: '#2dd4bf', dur: '0s' },    // 青緑・静止
  harvest: { color: '#fbbf24', dur: '2.6s' },  // 金・ゆっくり
  normal:  { color: '#e5e7eb', dur: '1.8s' },  // 白・弱い明滅
  peak:    { color: '#ef4444', dur: '0.55s' }, // 赤・速い脈動
};

const BOSS_GOLD = '#fbbf24';

// 監査A-7: top:0(文字通り0px=safe-areaより上)が既定。ノッチ帯に掛かって欠けが気になる実機では
// ?linetop=1 で safe-area 下へ退避できる切替ツマミ(既定=0px・LowHpVignette.tsx:5と同型)。
const LINE_TOP_SAFE_AREA = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('linetop') === '1';

const DirectorLine: React.FC = () => {
  const hud = useGameStore(s => s.hudDirector);
  const redNight = useGameStore(s => s.redNight?.phase === 'active');
  const bossBattle = useGameStore(s => s.enemies.some(e => isBossType(e.type)));
  const st = KOMA_STYLE[hud.koma] ?? KOMA_STYLE.relax;
  const mainColor = redNight ? '#a855f7' : st.color; // 紅き夜=紫が色の文法ごと乗っ取る(優先順位①>②)
  const peak = hud.koma === 'peak';
  const rank = Math.max(1, Math.min(7, hud.rank));
  const fillPct = (rank / 7) * 100; // 幅 = rank/7 × 100vw

  // 両端フェード帯(%・要素自身の幅基準): 22%×(1−(rank−1)/6)。ランク7で0=端までベタ(監査A-6・連続式)。
  const fadePct = 22 * (1 - (rank - 1) / 6);
  const maskImg = `linear-gradient(to right, transparent 0%, black ${fadePct}%, black ${100 - fadePct}%, transparent 100%)`;

  // ボス戦: 両端(フェード帯)を金に差し替え(叩き台)。フェード帯が畳まれるランク7では
  // 「両端の最外2%だけ金」になるよう下限2%でフロアする(仕様§1-6の叩き台をそのまま反映)。
  const colorBandPct = bossBattle ? Math.max(fadePct, 2) : fadePct;
  const edgeColor = bossBattle ? BOSS_GOLD : mainColor;
  const backgroundImg = `linear-gradient(to right, ${edgeColor} 0%, ${mainColor} ${colorBandPct}%, ${mainColor} ${100 - colorBandPct}%, ${edgeColor} 100%)`;

  const barStyle: React.CSSProperties = {
    position: 'absolute',
    top: LINE_TOP_SAFE_AREA ? 'env(safe-area-inset-top)' : 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: `${fillPct}vw`,
    height: 1,
    backgroundImage: backgroundImg,
    maskImage: maskImg,
    WebkitMaskImage: maskImg,
    boxShadow: peak ? `0 0 6px ${mainColor}` : 'none',
    transition: 'width 400ms ease, background-image 500ms ease',
    animation: st.dur !== '0s' ? `dlPulse ${st.dur} ease-in-out infinite` : undefined,
  };

  return (
    <>
      <style>{`@keyframes dlPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes dlRankFlash { 0% { opacity: 0.85; filter: brightness(2.4); } 100% { opacity: 0; filter: brightness(1); } }`}</style>
      {/* 本体(幅を持つ)。key を持たせない=widthのtransitionが常に走る(監査A-1)。 */}
      <div style={barStyle} />
      {/* ランク変化フラッシュ: 兄弟オーバーレイをkey再マウントして1回だけ光らせる。本体には触れない。 */}
      <div
        key={rank}
        aria-hidden
        style={{
          position: 'absolute',
          top: LINE_TOP_SAFE_AREA ? 'env(safe-area-inset-top)' : 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${fillPct}vw`,
          height: 1,
          background: mainColor,
          animation: 'dlRankFlash 500ms ease-out 1',
          pointerEvents: 'none',
        }}
      />
    </>
  );
};

export default DirectorLine;

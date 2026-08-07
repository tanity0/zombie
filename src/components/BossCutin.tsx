// §6.36 ボス出現カットイン「BOSS-INTRO-CUTIN」のDOMオーバーレイ。
// 社長裁定(2026-08-07): 画面全体に被写体+名前をバン!と出す。ぼかしは使わない(上下がぼけるのはNG)。
// 絵はボス絵台帳 bossIconSrc(ステージ別城ボス/グレン専用アート込み)をそのまま大写しする。
//
// タイミングはattentionレコード基準: in(360)→hold(1900)→★cutin(1100・カメラ静止のまま)→out(360)。
// このコンポーネントはcutin窓の間だけ表示する。ゲームは凍結中(hitstop延長済み)なので負荷は演出のみ。
//
// React再レンダー規律: attentionスライスだけ購読。attentionは発火/解除時にしか参照が変わらない
// (毎フレーム書き換えられない)ので、このコンポーネントが毎フレーム再レンダーすることはない。
import React, { useEffect, useState } from 'react';
import { useGameStore, ATTENTION_IN_MS, ATTENTION_HOLD_MS } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';

const BossCutin: React.FC = () => {
  const attention = useGameStore(s => s.attention);
  const [visible, setVisible] = useState(false);

  const cutin = attention?.cutin ?? null;
  const startReal = attention?.startReal ?? 0;
  const cutinMs = attention?.cutinMs ?? 0;

  // 監査指摘6: 絵はカットイン表示の約2.3秒前(attention発火時)に先読みしてデコードを済ませる。
  // 1.1秒の窓の先頭を「読み込み中の空白」で空振りしない(「絵が出ていない事故」の再発防止)。
  useEffect(() => {
    if (cutin?.art) { const im = new Image(); im.src = cutin.art; }
  }, [cutin]);

  useEffect(() => {
    if (!cutin || cutinMs <= 0) { setVisible(false); return; }
    const showAt = startReal + ATTENTION_IN_MS + ATTENTION_HOLD_MS;
    const hideAt = showAt + cutinMs;
    const now = Date.now();
    if (now >= hideAt) { setVisible(false); return; }
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setVisible(true);
      playSfx('heavy-impact'); // 名前の突き付けSE(§6.36: heavy-impact流用)
      hideTimer = setTimeout(() => setVisible(false), Math.max(0, hideAt - Date.now()));
    };
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    if (now >= showAt) show();
    else showTimer = setTimeout(show, showAt - now);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); setVisible(false); };
  }, [cutin, startReal, cutinMs]);

  if (!visible || !cutin) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      <style>{`
        @keyframes bossCutinBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bossCutinArt {
          0% { transform: scale(1.14); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: scale(1.0); opacity: 1; }
        }
        @keyframes bossCutinName {
          0% { transform: scale(1.35); opacity: 0; }
          22% { transform: scale(0.97); opacity: 1; }
          34% { transform: scale(1.0); }
          100% { transform: scale(1.0); opacity: 1; }
        }
        @keyframes bossCutinFlash { 0% { opacity: 0.85; } 100% { opacity: 0; } }
        @keyframes bossCutinRule { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
      `}</style>
      {/* 暗幕(ぼかし無し=社長裁定「上下がぼけるのは避けたい」)。凍結中の実画面の上に敷く。 */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(2,2,8,0.72)', animation: 'bossCutinBackdrop 130ms ease-out both' }}
      />
      {/* 被写体=ボス絵台帳の絵を画面全体に(contain)。ドット絵なのでpixelatedで拡大する。 */}
      {cutin.art && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={cutin.art}
            alt=""
            draggable={false}
            className="max-h-[78vh] max-w-[86vw] object-contain"
            style={{ imageRendering: 'pixelated', animation: 'bossCutinArt 240ms cubic-bezier(0.16,1,0.3,1) both' }}
          />
        </div>
      )}
      {/* 名前がバン! */}
      <div className="absolute inset-x-0 bottom-[16vh] flex flex-col items-center gap-2">
        <div
          className="h-px w-[52vw] origin-center bg-red-500/70"
          style={{ animation: 'bossCutinRule 220ms ease-out both' }}
        />
        <div
          className="px-4 text-center font-black text-white"
          style={{
            fontSize: 'clamp(28px, 7.5vw, 64px)',
            letterSpacing: '0.14em',
            textShadow: '0 0 18px rgba(239,68,68,0.85), 0 2px 0 rgba(127,29,29,0.9), 0 0 46px rgba(239,68,68,0.4)',
            animation: 'bossCutinName 300ms cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {cutin.name}
        </div>
        <div
          className="h-px w-[52vw] origin-center bg-red-500/70"
          style={{ animation: 'bossCutinRule 220ms ease-out both' }}
        />
      </div>
      {/* 白フラッシュ1発 */}
      <div
        className="absolute inset-0 bg-white"
        style={{ animation: 'bossCutinFlash 180ms ease-out both' }}
      />
    </div>
  );
};

export default BossCutin;

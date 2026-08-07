// §6.36 ボス出現カットイン「BOSS-INTRO-CUTIN」のDOMオーバーレイ。
// 社長裁定(2026-08-07): 画面全体に被写体+名前をバン!と出す。ぼかしは使わない(上下がぼけるのはNG)。
// 絵はボス絵台帳 bossIconSrc(ステージ別城ボス/グレン専用アート込み)をそのまま大写しする。
//
// タイミング(社長指示v0.25.2956「アテンションしたときの、ダン!ってSEと同時に紹介表示に変更」):
// attention発火の瞬間(=ダン!SE・boss-appear)と同時に表示し、cutinMs(1.1秒)で消える。カメラの
// in→hold は暗幕の裏で進み、カード が消えると実物のボスがホールドで映っている、という順番。
// attentionの尺・hitstopは素のattentionと同一(延長なし)。ゲームは凍結中なので負荷は演出のみ。
//
// React再レンダー規律: attentionスライスだけ購読。attentionは発火/解除時にしか参照が変わらない
// (毎フレーム書き換えられない)ので、このコンポーネントが毎フレーム再レンダーすることはない。
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

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
    // 表示はattention開始と同時(ダン!SE=boss-appearと同期・社長指示)。専用SEはもう鳴らさない
    // (開始SEと重ねると濁るため heavy-impact は廃止)。
    const hideAt = startReal + cutinMs;
    const now = Date.now();
    if (now >= hideAt) { setVisible(false); return; }
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), hideAt - now);
    return () => { clearTimeout(hideTimer); setVisible(false); };
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
          className="px-4 text-center font-bold text-white"
          style={{
            // 書体はエリア/地名系と同じ明朝スタック(社長指示「ボス名前の表示はエリアとかと同じ文字で」)。
            fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
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

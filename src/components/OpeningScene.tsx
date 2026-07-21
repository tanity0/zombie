import React, { useEffect, useRef } from 'react';

// オープニングシーン(社長支給・v0.25.2002): 引きのアリーナ→中央ステージの3人にカメラが寄りつつ
// 正面→斜め→真横とアングルを切替(回り込み)→暗転。素材は public/opening/。
// カメラは実3Dではなくプリレンダの3アングル(arena / arena-diag / arena-side)をクロスフェードで切替。
// 3人(色あり=センター/両サイド=シルエット)は各アングルのステージ位置に合わせて配置(前向きビルボード)。
// 縦画面では横長アリーナをレターボックス(横幅フィット)で全体を見せ、ズームで画面いっぱいへ寄る。
//
// 【重要】ズーム/フェードは CSS keyframe(コンポジタ駆動)で行う。以前は rAF で毎フレーム setState して
// transform を書き換えていたが、(1) React 毎フレーム再描画禁止(CLAUDE.md)に抵触、(2) drop-shadow付きの
// 変形サブツリーをsetStateで動かすとコンポジタが前フレームの残像(画面上部の幽霊キャラ)を残す不具合が出た。
// CSSアニメに寄せることで両方解消(JSはonDoneのタイマーとスキップのみ)。

const BASE = import.meta.env.BASE_URL;
const A = (f: string) => `${BASE}opening/${f}`;
const HERO = A('hero-blue.png'), TWIN = A('sil-twin.png'), BOB = A('sil-bob.png');
const ARENA_AR = 1.5; // 素材の縦横比(3:2)

interface CharPos { src: string; x: number; y: number; h: number } // x=中心/y=足元(アリーナ画像%)、h=高さ(アリーナ画像高さ%)
interface Shot { bg: string; ox: number; oy: number; zf: number; zt: number; chars: CharPos[] }

// タイムライン(ms)
const STARTS = [0, 2800, 5200];
const SHOT_DUR = [3200, 2900, 3200];
const FADE_IN_MS = 700;
const BLACK_START = 7600;
const BLACK_MS = 1600;
const TOTAL = 9400;

// 各アングルのステージ上の3人配置(叩き台・実機で微調整)。x=中心,y=足元(アリーナ画像基準%)、h=高さ(%)。
const SHOTS: Shot[] = [
  // 正面(引き): アリーナ全体。3人は中央ステージ上=遠く小さい点。ここからステージ(3人)へ大きくズームイン。
  // スケールは社長支給の試し置き準拠(キャラ高さ≒画像の2%・足元y≒49.2%・中心x≒52.3%)。
  { bg: A('arena.jpg'), ox: 52, oy: 48, zf: 1.0, zt: 3.6, chars: [
    { src: TWIN, x: 51.0, y: 49.2, h: 1.8 }, { src: HERO, x: 52.3, y: 49.3, h: 2.0 }, { src: BOB, x: 53.6, y: 49.2, h: 1.8 },
  ] },
  // 斜め: ステージを斜めから。3人は階段上・中央。
  { bg: A('arena-diag.jpg'), ox: 48, oy: 62, zf: 1.4, zt: 2.3, chars: [
    { src: TWIN, x: 44, y: 66, h: 22 }, { src: HERO, x: 50, y: 66.5, h: 24 }, { src: BOB, x: 56, y: 66, h: 22 },
  ] },
  // 真横: ステージを横から。社長支給の試し置き準拠=奥行きスタッガー(左ツイン=奥で小・中央ヒーロー・右ボブ=手前で大)。
  // スケール/位置は arena-side 実測%(足元y・中心x・高さ)。cover切出でxは中央寄せ補正済。
  { bg: A('arena-side.jpg'), ox: 49, oy: 82, zf: 1.7, zt: 2.1, chars: [
    { src: TWIN, x: 43, y: 81, h: 25 }, { src: HERO, x: 49, y: 86, h: 28 }, { src: BOB, x: 58, y: 95, h: 35 },
  ] },
];

const OpeningScene: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const doneRef = useRef(false);
  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };

  useEffect(() => {
    const id = window.setTimeout(finish, TOTAL);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ズーム(各アングルのscale)・クロスフェード・暗転をCSS keyframeで定義。
  const css =
    SHOTS.map((s, i) => `@keyframes opzoom${i}{from{transform:scale(${s.zf})}to{transform:scale(${s.zt})}}`).join('\n') +
    `\n@keyframes opfade{from{opacity:0}to{opacity:1}}\n@keyframes opblack{from{opacity:0}to{opacity:1}}`;

  return (
    <div
      onClick={finish}
      // z-index はタイトルのモーダル(更新情報等)より上・OrientationGuard(9999)より下。
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9990, cursor: 'pointer' }}
    >
      <style>{css}</style>

      {SHOTS.map((shot, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', inset: 0, zIndex: i,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: i === 0 ? 1 : 0,
            animation: i === 0 ? undefined : `opfade ${FADE_IN_MS}ms linear ${STARTS[i]}ms both`,
          }}
        >
          {/* カメラ(ズーム)= CSS keyframeでscale。原点はステージ位置。 */}
          <div
            style={{
              position: 'relative', width: '100%',
              transformOrigin: `${shot.ox}% ${shot.oy}%`,
              animation: `opzoom${i} ${SHOT_DUR[i]}ms linear ${STARTS[i]}ms both`,
            }}
          >
            {/* ステージ=アリーナ画像の縦横比の枠(横幅フィット・レターボックス)。子はこの枠基準の% */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
              <img src={shot.bg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              {shot.chars.map((c, ci) => (
                <img
                  key={ci} src={c.src} alt="" draggable={false}
                  style={{
                    position: 'absolute', left: `${c.x}%`, top: `${c.y}%`, height: `${c.h}%`,
                    transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* 暗転 */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, zIndex: 50, pointerEvents: 'none', animation: `opblack ${BLACK_MS}ms linear ${BLACK_START}ms both` }} />

      {/* スキップ */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); finish(); }}
        style={{
          position: 'absolute', bottom: 18, right: 18, zIndex: 60,
          padding: '6px 14px', fontSize: 12, color: 'rgba(255,255,255,0.75)',
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999,
        }}
      >
        スキップ ▶
      </button>
    </div>
  );
};

export default OpeningScene;

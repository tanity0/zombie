import React, { useEffect, useRef, useState } from 'react';

// オープニングシーン(社長支給): 引きのアリーナ→中央ステージの3人にカメラが寄りつつ
// 正面→斜め→真横とアングルを切替(回り込み)→暗転。素材は public/opening/。
// カメラは実3Dではなくプリレンダの3アングル(arena / arena-diag / arena-side)。
// アングル間は【重ねない=ハードカット切替】(社長指示v0.25.2005)。各アングル内でカメラがズームイン。
// 3人(色あり=センター/両サイド=シルエット)は各アングルのステージ位置に合わせて配置(前向きビルボード)。
// 縦画面では横長アリーナをレターボックス(横幅フィット)で全体を見せ、ズームで画面いっぱいへ寄る。
//
// 【重要】ズームは CSS keyframe(コンポジタ駆動)。以前は rAF で毎フレーム setState して transform を
// 書き換えていたが (1) React毎フレーム再描画禁止(CLAUDE.md)に抵触 (2) 変形サブツリーの残像不具合、で廃止。
// アングル切替は phase state のみ(数回のsetTimeout)。現在アングル1枚だけを描画=重ならない(クロスフェード無し)。

const BASE = import.meta.env.BASE_URL;
const A = (f: string) => `${BASE}opening/${f}`;
const HERO = A('hero-blue.png'), TWIN = A('sil-twin.png'), BOB = A('sil-bob.png');
const ARENA_AR = 1.5; // 素材の縦横比(3:2)

interface CharPos { src: string; x: number; y: number; h: number } // x=中心/y=足元(アリーナ画像%)、h=高さ(%)
interface Shot { bg: string; ox: number; oy: number; zf: number; zt: number; flip?: boolean; chars: CharPos[] }

// タイムライン(ms)。CUTS=各アングルの開始/切替時刻。SHOT_DUR=各アングルのズーム時間(=表示窓長)。
const CUTS = [0, 2800, 5200];
const SHOT_DUR = [2800, 2400, 2400];
const BLACK_START = 7600;
const BLACK_MS = 1600;
const TOTAL = 9400;

// 各アングルのステージ上の3人配置(実機調整済)。x=中心,y=足元(アリーナ画像基準%)、h=高さ(%)。
const SHOTS: Shot[] = [
  // 正面(引き): アリーナ全体。3人は中央ステージ上=遠く小さい点→大きくズームイン。画面センターに来るよう配置(v0.25.2005)。
  { bg: A('arena.jpg'), ox: 50, oy: 48, zf: 1.0, zt: 3.6, chars: [
    { src: TWIN, x: 48.7, y: 49.2, h: 1.8 }, { src: HERO, x: 50, y: 49.3, h: 2.0 }, { src: BOB, x: 51.3, y: 49.2, h: 1.8 },
  ] },
  // 斜め: ステージを斜めから。3人は階段上・中央。
  { bg: A('arena-diag.jpg'), ox: 48, oy: 62, zf: 1.4, zt: 2.3, chars: [
    { src: TWIN, x: 44, y: 66, h: 22 }, { src: HERO, x: 50, y: 66.5, h: 24 }, { src: BOB, x: 56, y: 66, h: 22 },
  ] },
  // 真横: ステージを横から。奥行きスタッガー。キャラの向きを反転(flip=左右ミラー・社長指示v0.25.2005)。
  { bg: A('arena-side.jpg'), ox: 49, oy: 82, zf: 1.7, zt: 2.1, flip: true, chars: [
    { src: TWIN, x: 43, y: 81, h: 25 }, { src: HERO, x: 49, y: 86, h: 28 }, { src: BOB, x: 58, y: 95, h: 35 },
  ] },
];

const OpeningScene: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [phase, setPhase] = useState(0); // 0=正面 / 1=斜め / 2=真横
  const doneRef = useRef(false);
  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };

  useEffect(() => {
    // 背景を先読み(ハードカットは切替時に次アングルのimgをマウントするため、未キャッシュだと一瞬黒む)。
    [...SHOTS.map(s => s.bg), HERO, TWIN, BOB].forEach(src => { const im = new Image(); im.src = src; });
    const t1 = window.setTimeout(() => setPhase(1), CUTS[1]);
    const t2 = window.setTimeout(() => setPhase(2), CUTS[2]);
    const t3 = window.setTimeout(finish, TOTAL);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const css =
    SHOTS.map((s, i) => `@keyframes opzoom${i}{from{transform:scale(${s.zf})}to{transform:scale(${s.zt})}}`).join('\n') +
    `\n@keyframes opblack{from{opacity:0}to{opacity:1}}`;

  const shot = SHOTS[phase];

  return (
    <div
      onClick={finish}
      // z-index はタイトルのモーダル(更新情報等)より上・OrientationGuard(9999)より下。
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9990, cursor: 'pointer' }}
    >
      <style>{css}</style>

      {/* 現在アングルの1枚だけを描画(=重ならない/ハードカット)。key=phase で切替毎にズームを最初から。 */}
      <div key={phase} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* カメラ(ズーム)= CSS keyframeでscale。原点はステージ位置。 */}
        <div
          style={{
            position: 'relative', width: '100%',
            transformOrigin: `${shot.ox}% ${shot.oy}%`,
            animation: `opzoom${phase} ${SHOT_DUR[phase]}ms linear both`,
          }}
        >
          {/* ステージ=アリーナ画像の縦横比の枠(横幅フィット・レターボックス)。子はこの枠基準の% */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
            <img src={shot.bg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* キャラ層。flip指定のアングルは左右ミラー(向きを反転)。 */}
            <div style={{ position: 'absolute', inset: 0, transform: shot.flip ? 'scaleX(-1)' : undefined, transformOrigin: '50% 50%' }}>
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
      </div>

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

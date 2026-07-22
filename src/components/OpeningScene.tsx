import React, { useEffect, useRef, useState } from 'react';

// オープニングシーン(社長支給): 引きのアリーナ→中央ステージの3人にカメラが寄りつつ
// 正面→斜め→真横とアングルを切替(回り込み)→暗転→【射撃シーン(backstage)】→暗転で終了。
// 素材は public/opening/(アングル3枚+キャラ3枚)と public/opening/shoot/(射撃シーンのコマ)。
// アングル間は【シームレスなクロスフェード】(社長指示v0.25.2007: フェードイン/アウトが重なる切替。
// 前アングルはズームを続けたまま表示し続け、次アングルがその上にフェードイン→完了で前を外す=ディゾルブ)。
// アリーナ中はBGM2音源(op-arena-a/b)を同時ループ再生し、射撃シーンへの場面転換で止める(終端は短フェード)。
// 3人(色あり=センター/両サイド=シルエット)は各アングルのステージ位置に合わせて配置(前向きビルボード)。
// 縦画面では横長素材をレターボックス(横幅フィット)で全体を見せる。
//
// 射撃シーン(社長指示v0.25.2006): 暗転し切った後、場面転換=backstage(関係者出口)。
// 撃つ子(ツインテのシルエット・左右反転済=銃は左向き)が右、主人公が左。
// コマ順は社長指定: 撃つ子=1-3-4-5-2-6 / 主人公(被弾)=1-2-3-4-5。発砲(4)と被弾(2)を同期。
// コマ画像は足元中心アンカーで共通キャンバスに焼いてあるので、src差し替えだけで芝居になる。
//
// 【重要】ズームは CSS keyframe(コンポジタ駆動)。rAF毎フレームsetStateは残像不具合+React再描画禁止で不可。
// フェーズ/コマ進行は少数のsetTimeoutのみ(毎フレーム更新なし)。

const BASE = import.meta.env.BASE_URL;
const A = (f: string) => `${BASE}opening/${f}`;
const HERO = A('hero-blue.png'), TWIN = A('sil-twin.png'), BOB = A('sil-bob.png');
const SHOOTER = (n: number) => A(`shoot/shooter-${n}.png`);
const VICTIM = (n: number) => A(`shoot/victim-${n}.png`);
const ARENA_AR = 1.5; // 素材の縦横比(3:2・backstageも同じ)

interface CharPos { src: string; x: number; y: number; h: number } // x=中心/y=足元(画像%)、h=高さ(%)
interface Shot { bg: string; ox: number; oy: number; zf: number; zt: number; flip?: boolean; chars: CharPos[] }

// ── アリーナ3アングルのタイムライン(ms) ──
// 斜め・横への切替は早め(社長指示v0.25.2008)。各ショットのズームは切替までに完了させ、
// 「寄り切ったサイズ≒次アングルの見え方」の繋がり(v0.25.2003)は維持したままテンポを上げる。
const CUTS = [0, 2000, 3400];
const SHOT_DUR = [2000, 1400, 2400];
const FADE_MS = 700; // アングル間クロスフェード長(次がフェードインし切るまで前を重ねて表示)
const BLACK_START = 5800;
const BLACK_MS = 1600;
const SCENE_START = 7600; // 暗転し切ったら射撃シーンへハードカット
const ARENA_AUDIO = [`${BASE}audio/op-arena-a.mp3`, `${BASE}audio/op-arena-b.mp3`]; // 2音源を同時ループ(社長指示)

// ── 射撃シーンのタイムライン(シーン内ms)と配置 ──
// コマ: {t=切替時刻, s=撃つ子コマ番号, v=主人公コマ番号}。s4(発砲)とv2(被弾火花)を同期。
const SHOOT_STEPS = [
  { t: 0, s: 1, v: 1 },     // 対峙
  { t: 900, s: 3, v: 1 },   // 銃を構える
  { t: 1800, s: 4, v: 2 },  // 発砲=被弾(同期)
  { t: 2500, s: 5, v: 3 },  // よろける
  { t: 3200, s: 2, v: 4 },  // 崩れ落ちる
  { t: 3900, s: 6, v: 5 },  // 硝煙・倒れ伏す
];
const SHOOT_FADE_START = 5200;
const SHOOT_FADE_MS = 1200;
const SHOOT_TOTAL = 6600;
// 配置(backstage画像基準%・足元アンカー)。主人公=左、撃つ子=右(反転済=銃が左向き)。h=コマキャンバス高さ。
const VICTIM_POS = { x: 38, y: 80, h: 26 };
const SHOOTER_POS = { x: 66, y: 86, h: 30 };

// 各アングルのステージ上の3人配置(実機調整済)。x=中心,y=足元(アリーナ画像基準%)、h=高さ(%)。
const SHOTS: Shot[] = [
  // 正面(引き): アリーナ全体。3人は中央ステージ上=遠く小さい点→大きくズームイン。センター配置。
  { bg: A('arena.jpg'), ox: 50, oy: 48, zf: 1.0, zt: 3.6, chars: [
    { src: TWIN, x: 48.7, y: 49.2, h: 1.8 }, { src: HERO, x: 50, y: 49.3, h: 2.0 }, { src: BOB, x: 51.3, y: 49.2, h: 1.8 },
  ] },
  // 斜め: ステージを斜めから。3人は階段上・中央。
  { bg: A('arena-diag.jpg'), ox: 48, oy: 62, zf: 1.4, zt: 2.3, chars: [
    { src: TWIN, x: 44, y: 66, h: 22 }, { src: HERO, x: 50, y: 66.5, h: 24 }, { src: BOB, x: 56, y: 66, h: 22 },
  ] },
  // 真横: ステージを横から。奥行きスタッガー。キャラの向きを反転(flip=左右ミラー)。
  { bg: A('arena-side.jpg'), ox: 49, oy: 82, zf: 1.7, zt: 2.1, flip: true, chars: [
    { src: TWIN, x: 43, y: 81, h: 25 }, { src: HERO, x: 49, y: 86, h: 28 }, { src: BOB, x: 58, y: 95, h: 35 },
  ] },
];

const OpeningScene: React.FC<{ onDone: () => void; startAtShoot?: boolean }> = ({ onDone, startAtShoot }) => {
  const [ready, setReady] = useState(false); // 全素材decode完了までタイムラインを始めない(下記コメント)
  const [phase, setPhase] = useState(startAtShoot ? 3 : 0); // 0-2=アリーナ各アングル / 3=射撃シーン
  const [prevShot, setPrevShot] = useState<number | null>(null); // クロスフェード中の前アングル(下敷き)
  const [step, setStep] = useState(0); // 射撃シーンのコマ番号(SHOOT_STEPS index)
  const doneRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const stopAudio = () => { audioRef.current.forEach(a => { a.pause(); a.src = ''; }); audioRef.current = []; };
  const finish = () => { if (!doneRef.current) { doneRef.current = true; stopAudio(); onDone(); } };

  useEffect(() => {
    // 【重要】タイムライン(タイマー+CSSアニメ)は「素材が描ける状態」になってから開始する。
    // mount起点だと初回ロード(コールド)では画面が出るまでに数秒かかり、その間に芝居が進んで
    // 頭のコマが飛ぶ(ヘッドレス実測: コールドではstep0が写らずstep3から見えた)。
    // 全imgをdecodeし切ってからreadyを立て、描画ツリーもreadyまでマウントしない
    // (CSSアニメのdelayはマウント時起点のため、ツリーごと遅らせて同期を取る)。
    // 壊れ画像等で永久に待たないようフォールバック上限3秒。
    let cancelled = false;
    const ids: number[] = [];
    const all = [
      ...SHOTS.map(s => s.bg), HERO, TWIN, BOB, A('shoot-stage.png'),
      ...[1, 2, 3, 4, 5, 6].map(SHOOTER), ...[1, 2, 3, 4, 5].map(VICTIM),
    ];
    const decodes = all.map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => {}); });
    const fallback = new Promise<void>(res => { ids.push(window.setTimeout(res, 3000)); });
    Promise.race([Promise.all(decodes).then(() => {}), fallback]).then(() => {
      if (cancelled) return;
      setReady(true);
      const base = startAtShoot ? 0 : SCENE_START;
      if (!startAtShoot) {
        // アングル切替=クロスフェード: 切替時刻に次を出しつつ前を下敷きで残し、FADE_MS後に前を外す。
        [1, 2].forEach(i => {
          ids.push(window.setTimeout(() => { setPhase(i); setPrevShot(i - 1); }, CUTS[i]));
          ids.push(window.setTimeout(() => setPrevShot(null), CUTS[i] + FADE_MS));
        });
        ids.push(window.setTimeout(() => setPhase(3), SCENE_START));
        // アリーナBGM2音源を同時ループ再生。場面転換の直前に短フェードで止める(ブツ切りポップ防止)。
        // 自動再生がブロックされる環境(ジェスチャ無しのプレビュー等)では黙って無音のまま進める。
        audioRef.current = ARENA_AUDIO.map(src => { const a = new Audio(src); a.loop = true; return a; });
        audioRef.current.forEach(a => { a.play().catch(() => {}); });
        [0.66, 0.33, 0.12].forEach((v, k) => {
          ids.push(window.setTimeout(() => audioRef.current.forEach(a => { a.volume = v; }), SCENE_START - 450 + k * 150));
        });
        ids.push(window.setTimeout(stopAudio, SCENE_START));
      }
      SHOOT_STEPS.forEach((st, i) => { if (i > 0) ids.push(window.setTimeout(() => setStep(i), base + st.t)); });
      ids.push(window.setTimeout(finish, base + SHOOT_TOTAL));
    });
    return () => { cancelled = true; ids.forEach(id => window.clearTimeout(id)); stopAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const css =
    SHOTS.map((s, i) => `@keyframes opzoom${i}{from{transform:scale(${s.zf})}to{transform:scale(${s.zt})}}`).join('\n') +
    `\n@keyframes opblack{from{opacity:0}to{opacity:1}}` +
    `\n@keyframes opfade{from{opacity:0}to{opacity:1}}` +
    `\n@keyframes opshzoom{from{transform:scale(1)}to{transform:scale(1.12)}}`;

  const cur = SHOOT_STEPS[step];

  return (
    <div
      onClick={finish}
      // z-index はタイトルのモーダル(更新情報等)より上・OrientationGuard(9999)より下。
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 9990, cursor: 'pointer' }}
    >
      <style>{css}</style>

      {!ready ? null : phase < 3 ? (
        // ── アリーナ3アングル(クロスフェード)。前アングル(prevShot)はズームを続けたまま下敷き、
        //    現アングルがその上にフェードイン(key=アングル番号でReactが同一要素を維持=ズーム継続)。 ──
        <>
          {([prevShot, phase].filter(v => v !== null) as number[]).map((si, order) => (
            <div
              key={si}
              style={{
                position: 'absolute', inset: 0, zIndex: order,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                // 最初のアングル以外はフェードインで登場(前が下敷きにいる間=クロスフェード)。
                animation: si === 0 ? undefined : `opfade ${FADE_MS}ms linear both`,
              }}
            >
              <div
                style={{
                  position: 'relative', width: '100%',
                  transformOrigin: `${SHOTS[si].ox}% ${SHOTS[si].oy}%`,
                  animation: `opzoom${si} ${SHOT_DUR[si]}ms linear both`,
                }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
                  <img src={SHOTS[si].bg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  {/* キャラ層。flip指定のアングルは左右ミラー(向きを反転)。 */}
                  <div style={{ position: 'absolute', inset: 0, transform: SHOTS[si].flip ? 'scaleX(-1)' : undefined, transformOrigin: '50% 50%' }}>
                    {SHOTS[si].chars.map((c, ci) => (
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
          ))}
        </>
      ) : (
        // ── 射撃シーン(backstage)。コマ画像は足元アンカー共通キャンバス=src差し替えで芝居。 ──
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative', width: '100%',
              transformOrigin: '52% 78%',
              animation: `opshzoom ${SHOOT_TOTAL}ms linear both`,
            }}
          >
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
              <img src={A('shoot-stage.png')} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <img
                src={VICTIM(cur.v)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${VICTIM_POS.x}%`, top: `${VICTIM_POS.y}%`, height: `${VICTIM_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                }}
              />
              <img
                src={SHOOTER(cur.s)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${SHOOTER_POS.x}%`, top: `${SHOOTER_POS.y}%`, height: `${SHOOTER_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                }}
              />
            </div>
          </div>
          {/* シーン終わりの暗転 */}
          <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, pointerEvents: 'none', animation: `opblack ${SHOOT_FADE_MS}ms linear ${SHOOT_FADE_START}ms both` }} />
        </div>
      )}

      {/* アリーナ→射撃シーン間の暗転(phase<3の間だけ重ねる。phase3は上の分岐ごと消えるのでカットで明ける) */}
      {ready && phase < 3 && !startAtShoot && (
        <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, zIndex: 50, pointerEvents: 'none', animation: `opblack ${BLACK_MS}ms linear ${BLACK_START}ms both` }} />
      )}

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

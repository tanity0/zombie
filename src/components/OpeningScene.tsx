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
const BLOOD = (n: number) => A(`shoot/blood-${n}.png`);
const ARENA_AR = 1.5; // 素材の縦横比(3:2・backstageも同じ)

interface CharPos { src: string; x: number; y: number; h: number } // x=中心/y=足元(画像%)、h=高さ(%)
// flipScene: シーン全体を180度(左右)反転して見せる(社長指示v0.25.2009)。実装は背景imgを左右反転し、
// キャラは素の座標/向きで置く(=画面全体としてミラーに見える。二重反転になる個別キャラflipは廃止)。
interface Shot { bg: string; ox: number; oy: number; zf: number; zt: number; flipScene?: boolean; chars: CharPos[] }

// ── アリーナ3アングルのタイムライン(ms) ──
// 斜め・横への切替は早め(社長指示v0.25.2008)。各ショットのズームは切替までに完了させ、
// 「寄り切ったサイズ≒次アングルの見え方」の繋がり(v0.25.2003)は維持したままテンポを上げる。
// v0.25.2035(社長指示): 冒頭は引きのまま紙吹雪の噴き上げを見せ(1.2s)、それからズーム開始。
const FRONT_ZOOM_DELAY = 1200;
const CUTS = [0, 1200 + 2000, 1200 + 3400];
const SHOT_DUR = [2000, 1400, 2400];
const FADE_MS = 700; // アングル間クロスフェード長(次がフェードインし切るまで前を重ねて表示)
const BLACK_START = 7000;
const BLACK_MS = 1600;
const SCENE_START = 8800; // 暗転し切ったら射撃シーンへハードカット
const ARENA_AUDIO = [`${BASE}audio/op-arena-a.mp3`, `${BASE}audio/op-arena-b.mp3`]; // 2音源を同時ループ(社長指示)

// 紙吹雪(社長指示v0.25.2031→2033→2034修正)。2系統:
// ①パーン=ステージ【両サイド】の砲から真上へ噴射し【画面場外まで突き抜けて消える】(落下はしない)。
// ②雨=その後(1.0s〜)、画面全体に均等な紙吹雪が降り続けるループ層(斜め・横でもきらめきながら継続。
//   負のanimation-delayで表示された瞬間から空中に満ちている)。CSSアニメのみ=負荷1/10。
// 赤一色(社長指示v0.25.2037)。単色ベタだと沈むので赤の明暗4トーン=「全部赤」の見え方できらめきは残す。
const CONFETTI_COLORS = ['#f87171', '#ef4444', '#dc2626', '#b91c1c'];
// v0.25.2036(社長指示「もっと勢いよく・アイドルのライブの噴射」): 噴射0.55〜0.9秒で場外へ・
// 柱を細く垂直に・ほぼ一斉発射・80枚に増量・回転も高速。
const CONFETTI_BURST = Array.from({ length: 80 }, (_, i) => {
  const leftSide = i % 2 === 0;                  // 半分ずつ左右の砲から
  const inward = (3 + Math.random() * 7) * (leftSide ? 1 : -1); // わずか内向き(ステージ中央へ)
  return {
    key: i,
    x: leftSide ? 16 + Math.random() * 12 : 72 + Math.random() * 12, // 両サイドの砲口(枠%)
    y: 50 + Math.random() * 10,
    cx1: inward * 0.8 + (Math.random() * 2 - 1) * 4, // 中間点(細い柱=横ブレ小)
    cy1: -(38 + Math.random() * 22),
    cx2: inward * 1.6 + (Math.random() * 2 - 1) * 6, // 終点=そのまま上へ
    cy2: -(85 + Math.random() * 35),             // 画面上端の外まで突き抜ける(枠高%)
    dur: 0.55 + Math.random() * 0.35,            // 鋭い噴射(0.55〜0.9秒で場外へ)
    delay: Math.random() * 0.15,                 // ほぼ一斉のパーン
    sd: 0.35 + Math.random() * 0.35,             // 飛翔中の回転(高速)
    sw: (Math.random() * 2 - 1) * 8,
    r1: `${Math.round((Math.random() * 2 - 1) * 200)}deg`,
    w: 8 + Math.random() * 7, h: 5 + Math.random() * 6, // 粒大きめ(社長指示v0.25.2038)
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});
const CONFETTI_RAIN_START_MS = 1000; // 噴き上げが場外へ抜けた頃から雨を開始
const CONFETTI_GLITTER = Array.from({ length: 60 }, (_, i) => {
  const dur = 3.5 + Math.random() * 2.5;         // 上から下へ通過する時間
  return {
    key: i,
    x: Math.random() * 100,                       // 画面全体に均等分布
    dur,
    delay: -Math.random() * dur,                  // 負のdelay=表示された瞬間すでに空中に満ちている
    td: 0.4 + Math.random() * 0.5,                // きらめき周期(秒)
    r1: `${Math.round((Math.random() * 2 - 1) * 240)}deg`,
    w: 5 + Math.random() * 5, h: 4 + Math.random() * 4, // 粒大きめ(社長指示v0.25.2038)
    color: CONFETTI_COLORS[(i * 3 + 1) % CONFETTI_COLORS.length],
  };
});

// ── 射撃シーンのタイムライン(シーン内ms)と配置 ──
// 2人は独立テンポで進むため【トラックを別々に定義し、変化点のマージは自動生成】する。
// (v0.25.2016の教訓: 手動マージは片方の時刻を動かすと順序が壊れ、もう片方のコマが巻き戻る実バグになった)
// 順序(社長指示v0.25.2019): 発砲一閃(f4・通常背景のまま0.1s)→跳ね上げ(f5)の瞬間に【赤反転+被弾(v2)】→
// そこから2秒静止(社長指示v0.25.2017)→各自のテンポで再開。
// 撃つ側(v0.25.2010→2018): 立ち1秒→構え1秒→一閃0.1→跳ね上げで静止→次0.2→最後(硝煙)は保持。
// 撃たれ側(v0.25.2011→2012→2014→2016): 被弾=赤反転と同期→(静止)→次0.4→次0.4→最後(倒れ伏す)は保持。
// 静止明け: f2(0.2s)→f6硝煙→1秒後にf2へ戻して以降停止(社長指示v0.25.2028)。
const SHOOTER_TRACK = [{ t: 0, f: 1 }, { t: 1000, f: 3 }, { t: 2000, f: 4 }, { t: 2100, f: 5 }, { t: 4100, f: 2 }, { t: 4300, f: 6 }, { t: 5300, f: 2 }];
const VICTIM_TRACK = [{ t: 0, f: 1 }, { t: 2100, f: 2 }, { t: 4100, f: 3 }, { t: 4500, f: 4 }, { t: 4900, f: 5 }];
// 血飛沫(社長支給): 赤背景の瞬間(2.1s)に1コマ目を出し、キャラと同じく【2秒静止】(社長指示v0.25.2027)。
// 静止明け(4.1s)から残り2コマを100msずつ→消える(f:0=非表示)。
const BLOOD_TRACK = [{ t: 0, f: 0 }, { t: 2100, f: 1 }, { t: 4100, f: 2 }, { t: 4200, f: 3 }, { t: 4300, f: 0 }];
const RED_FROM = 2100; // 跳ね上げの瞬間から背景を赤一色に(v0.25.2019で一閃の後ろへ移動。以降ずっと赤のまま暗転へ)
const frameAt = (track: { t: number; f: number }[], t: number) => track.reduce((f, e) => (e.t <= t ? e.f : f), track[0].f);
const SHOOT_STEPS = [...new Set([...SHOOTER_TRACK, ...VICTIM_TRACK, ...BLOOD_TRACK].map(e => e.t))]
  .sort((a, b) => a - b)
  .map(t => ({ t, s: frameAt(SHOOTER_TRACK, t), v: frameAt(VICTIM_TRACK, t), b: frameAt(BLOOD_TRACK, t), red: t >= RED_FROM }));
// 血飛沫の位置: 右端センター=傷口(後頭部)。被弾ポーズ(v2)の頭の左脇に置き、血は左へ飛ぶ。h=枠高%。
const BLOOD_POS = { x: 36.5, y: 57, h: 18 };
const SHOOT_FADE_START = 6200; // 最終コマを約1.3秒見せてから暗転(保持長は従来踏襲の叩き台)
const SHOOT_FADE_MS = 1200;
const SHOOT_TOTAL = 7600;
// 倒れ伏し(v5)は足元重心アンカーの副作用で体がv4より右に出る(実測: 体重心 v4=36.7% vs v5=49.6%)
// → v5だけ左へ寄せて落下位置を揃える(社長指示v0.25.2014「最後の倒れてる絵、少し左へ」)。単位=bg幅%。
const VICTIM_DX: Record<number, number> = { 5: -4 };
// 配置(backstage画像基準%・足元アンカー)。主人公=左、撃つ子=右(反転済=銃が左向き)。h=コマキャンバス高さ。
const VICTIM_POS = { x: 38, y: 80, h: 26 };
const SHOOTER_POS = { x: 66, y: 86, h: 30 };

// 各アングルのステージ上の3人配置(実機調整済)。x=中心,y=足元(アリーナ画像基準%)、h=高さ(%)。
const SHOTS: Shot[] = [
  // 正面(引き): アリーナ全体。3人は中央ステージ上=遠く小さい点→大きくズームイン。センター配置。
  // 【共通アンカー(社長指示v0.25.2022)】ズームの着地点=ヒーロー足元が(枠x50%, y86%)に来るよう原点を設定。
  // 以降の斜め/横も同じ(50%,86%)にヒーローを固定=「彼女だけ動かず周りが回る」。
  { bg: A('arena.jpg'), ox: 50, oy: 35.2, zf: 1.0, zt: 3.6, chars: [
    { src: TWIN, x: 48.7, y: 49.2, h: 1.8 }, { src: HERO, x: 50, y: 49.3, h: 2.0 }, { src: BOB, x: 51.3, y: 49.2, h: 1.8 },
  ] },
  // 斜め: ステージを斜めから。ズーム廃止=1.4で静止(社長指示v0.25.2015)。
  // 【立ち位置合わせv0.25.2024】3人は元のステージ壇上(y66=絵と接地が合う位置)に戻し、
  // カメラ原点(48.3,17.8)側を動かしてヒーロー足元を共通アンカー(218,569)に一致させる(=絵とのズレ解消)。
  // v0.25.2025: ステージに対してキャラが大きすぎ→縮小(h22/24→15/16)。間隔もサイズに合わせて詰める。
  { bg: A('arena-diag.jpg'), ox: 48.3, oy: 17.8, zf: 1.4, zt: 1.4, chars: [
    { src: TWIN, x: 45.5, y: 66, h: 15 }, { src: HERO, x: 50, y: 66.5, h: 16 }, { src: BOB, x: 54.5, y: 66, h: 15 },
  ] },
  // 真横: ステージを横から。奥行きスタッガー。シーン全体を180度反転(flipScene・社長指示v0.25.2009)。
  // 【共通アンカー(社長指示v0.25.2019→2022)】ヒーロー=(50%,86%)・ズーム原点もヒーロー自身=ズーム中ドリフト0。
  // 正面の着地点・斜めと画面座標が完全一致(彼女は動かず世界が回る)。シルエットは同Δで隊形維持・接地不変。
  // v0.25.2025: キャラ縮小(h25/28/35→17/19/24)+シルエットの足元をステージ面(花道の傾斜)に沿わせる。
  { bg: A('arena-side.jpg'), ox: 50.7, oy: 86, zf: 1.7, zt: 2.1, flipScene: true, chars: [
    { src: TWIN, x: 45.5, y: 81, h: 17 }, { src: HERO, x: 50.7, y: 86, h: 19 }, { src: BOB, x: 57, y: 92, h: 24 },
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
      ...[1, 2, 3, 4, 5, 6].map(SHOOTER), ...[1, 2, 3, 4, 5].map(VICTIM), ...[1, 2, 3].map(BLOOD),
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
    `\n@keyframes opshzoom{from{transform:scale(1)}to{transform:scale(1.12)}}` +
    // 紙吹雪: 軌道(パーン=急減速の噴き上げ→等速のヒラヒラ落下)と、紙の羽ばたき(3D回転+横揺れ)を分離。
    `\n@keyframes opconfT{0%{transform:translate(0,0);animation-timing-function:cubic-bezier(0.16,1,0.3,1)}16%{transform:translate(var(--cx1),var(--cy1));animation-timing-function:linear}100%{transform:translate(var(--cx2),var(--cy2))}}` +
    `\n@keyframes opconfS{0%{transform:rotateZ(0) rotateX(0) translateX(0)}25%{transform:rotateZ(var(--r1)) rotateX(72deg) translateX(var(--sw))}50%{transform:rotateZ(calc(var(--r1)*1.6)) rotateX(160deg) translateX(0)}75%{transform:rotateZ(var(--r1)) rotateX(250deg) translateX(calc(var(--sw)*-1))}100%{transform:rotateZ(0) rotateX(344deg) translateX(0)}}` +
    // キラキラ層: 画面上端の外から下端の外まで通過するループ落下+きらめき(不透明度パルス+回転)。
    `\n@keyframes opconfK{from{transform:translateY(-6vw)}to{transform:translateY(76vw)}}` +
    `\n@keyframes opconfW{0%{opacity:0.25;transform:rotateZ(0) rotateX(0)}50%{opacity:1;transform:rotateZ(var(--r1)) rotateX(170deg)}100%{opacity:0.25;transform:rotateZ(0) rotateX(340deg)}}`;

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
                  // 正面のみ: 紙吹雪の噴き上げを見せてからズーム開始(FRONT_ZOOM_DELAY)。
                  animation: `opzoom${si} ${SHOT_DUR[si]}ms linear ${si === 0 ? FRONT_ZOOM_DELAY : 0}ms both`,
                }}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}` }}>
                  {/* flipScene=背景を左右反転(キャラは素の座標=画面全体がミラーに見える) */}
                  <img src={SHOTS[si].bg} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: SHOTS[si].flipScene ? 'scaleX(-1)' : undefined }} />
                  <div style={{ position: 'absolute', inset: 0 }}>
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
          {/* 紙吹雪レイヤー(カメラ非追従・アングル切替を跨いで存続。zIndex=アングルより上・暗転(50)より下。
              座標系: 横=vw(枠幅=画面幅)、縦=枠高換算(×0.667vw)。 */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${ARENA_AR}`, overflow: 'hidden' }}>
              {/* ①パーン: ステージ両サイドの砲から真上へ噴射→ヒラヒラ落下 */}
              {CONFETTI_BURST.map(p => (
                <div
                  key={p.key}
                  style={{
                    position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                    '--cx1': `${p.cx1.toFixed(1)}vw`, '--cy1': `${(p.cy1 * 0.667).toFixed(1)}vw`,
                    '--cx2': `${p.cx2.toFixed(1)}vw`, '--cy2': `${(p.cy2 * 0.667).toFixed(1)}vw`,
                    animation: `opconfT ${p.dur.toFixed(2)}s both`, animationDelay: `${p.delay.toFixed(2)}s`,
                  } as React.CSSProperties}
                >
                  <div
                    style={{
                      width: p.w, height: p.h, background: p.color,
                      '--r1': p.r1, '--sw': `${p.sw.toFixed(1)}px`,
                      animation: `opconfS ${p.sd.toFixed(2)}s linear infinite`,
                    } as React.CSSProperties}
                  />
                </div>
              ))}
              {/* ②雨: 噴き上げ後(1.0s〜)、画面全体に均等な紙吹雪がきらめきながら降り続けるループ層。
                  各粒は負のdelayで最初から空中に満ちている。斜め・横カットでも継続。 */}
              <div style={{ position: 'absolute', inset: 0, opacity: 0, animation: `opfade 500ms linear ${CONFETTI_RAIN_START_MS}ms both` }}>
                {CONFETTI_GLITTER.map(p => (
                  <div
                    key={p.key}
                    style={{
                      position: 'absolute', left: `${p.x.toFixed(1)}%`, top: 0,
                      animation: `opconfK ${p.dur.toFixed(2)}s linear infinite`, animationDelay: `${p.delay.toFixed(2)}s`,
                    } as React.CSSProperties}
                  >
                    <div
                      style={{
                        width: p.w, height: p.h, background: p.color,
                        '--r1': p.r1,
                        animation: `opconfW ${p.td.toFixed(2)}s linear infinite`,
                      } as React.CSSProperties}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
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
              {/* 撃った瞬間から背景=赤一色(舞台絵と差し替え)。キャラはその上に残る。 */}
              {cur.red
                ? <div style={{ position: 'absolute', inset: 0, background: '#d40000' }} />
                : <img src={A('shoot-stage.png')} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <img
                src={VICTIM(cur.v)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${VICTIM_POS.x + (VICTIM_DX[cur.v] ?? 0)}%`, top: `${VICTIM_POS.y}%`, height: `${VICTIM_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                  // 撃たれた瞬間のコマ(v2)だけ黒シルエット化(社長指示v0.25.2023)=赤バックに黒抜きのショックカット。
                  filter: cur.v === 2 ? 'brightness(0)' : undefined,
                }}
              />
              <img
                src={SHOOTER(cur.s)} alt="" draggable={false}
                style={{
                  position: 'absolute', left: `${SHOOTER_POS.x}%`, top: `${SHOOTER_POS.y}%`, height: `${SHOOTER_POS.h}%`,
                  transform: 'translate(-50%, -100%)', imageRendering: 'pixelated',
                }}
              />
              {/* 血飛沫(被弾の瞬間・3コマ40msずつ)。右端センター=傷口を後頭部に合わせ、左へ飛ぶ。 */}
              {cur.b > 0 && (
                <img
                  src={BLOOD(cur.b)} alt="" draggable={false}
                  style={{
                    position: 'absolute', left: `${BLOOD_POS.x}%`, top: `${BLOOD_POS.y}%`, height: `${BLOOD_POS.h}%`,
                    // scaleX(-1)=左右反転(v0.25.2024): 素材は「尖端(傷口)が左・飛ぶほど右へ広がる」絵。
                    // 反転して尖端=右端(後頭部)に合わせ、左へ行くほど広がる=飛散方向へ正しく拡散。
                    transform: 'translate(-100%, -50%) scaleX(-1)', imageRendering: 'pixelated',
                    // OPの血飛沫は黒シルエット(社長指示v0.25.2023・ゲーム内は赤のまま)。
                    filter: 'brightness(0)',
                  }}
                />
              )}
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

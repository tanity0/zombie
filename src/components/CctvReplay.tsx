import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OpeningScene from './OpeningScene';
import { startCctvStatic } from '../audio/audioManager';
import {
  CCTV_AFTERGLOW_MS, CCTV_CLOCK_START_SEC, CCTV_POWER_OFF_MS, CCTV_SWITCH_BLANK_MS,
  cctvCameraLabel, cctvEndingMs, formatCctvClock,
} from '../utils/cctvReplay';

// 監視カメラ映像(社長指示2026-11-18): EXクリア後の記録(ExEndingScreen)のあとに、オープニングのコンサート(廊下の後)と
// 銃撃事件現場を「監視カメラの記録映像」として淡々と流す。絵と芝居の尺は OpeningScene(cctv)がそのまま出し、
// ここは被せ物だけ: 白黒+冷たい色味・少し甘い解像感・走査線・粒のちらつき・周辺減光・焼き込みの時刻とカメラ名。
// 音は「ザー」だけ(合成・audioManager.startCctvStatic)。カメラが替わる所は一瞬黒くなってザーも途切れ、映ったらまた鳴る。
// 最後はブラウン管の電源断(横一本の光る線→点→黒)でザーも同時に切れ、黒を置いてからリザルトへ。タップで飛ばすと即プツン。
// 負荷: 全画面1枚の CSS filter(白黒+軽いぼかし)+静的な重ね物、粒は起動時に1回だけ作る4コマのタイル(steps送り)=3/10。

// 映像の枠(3:2・画面中央)の半分の高さ。縦長では上下が黒帯になるので、カメラ名は枠のすぐ上・日時は枠のすぐ下に置く
// (社長指示2026-11-18「数字は黒帯の少し下、STAFF EXITも黒帯の少し上」)。横長で枠が画面に収まらない時は画面の隅で止める。
const FRAME_HALF_H = 'min(50vh, 33.333vw)';
const MONO = '"Courier New", "Menlo", "Consolas", monospace';
const NOISE_TILE = 128; // 粒タイル1コマの一辺(px)
const NOISE_FRAMES = 4;

// 粒のタイル(4コマを横に並べた1枚)。起動時に1回だけ作る=毎フレームのJSなし。
const makeNoiseSheet = (): string => {
  try {
    const c = document.createElement('canvas');
    c.width = NOISE_TILE * NOISE_FRAMES; c.height = NOISE_TILE;
    const g = c.getContext('2d');
    if (!g) return '';
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 40 + Math.random() * 70;
    }
    g.putImageData(img, 0, 0);
    return `url(${c.toDataURL('image/png')})`;
  } catch { return ''; }
};

const CSS =
  `@keyframes cctvgrain{from{background-position:0 0}to{background-position:-${NOISE_TILE * NOISE_FRAMES}px 0}}` +
  `\n@keyframes cctvroll{from{transform:translateY(-30%)}to{transform:translateY(130%)}}` +
  `\n@keyframes cctvrec{0%,55%{opacity:1}56%,100%{opacity:0}}` +
  // プツン: 縦に潰れて横一本の光る線→横も潰れて点。急な ease-in(電源断の速さ)。
  `\n@keyframes cctvoff{0%{transform:scale(1,1)}62%{transform:scale(1,0.004)}100%{transform:scale(0.002,0.004)}}` +
  `\n@keyframes cctvflash{0%{opacity:0}45%{opacity:0.9}100%{opacity:1}}` +
  // 残光の点: ふくらみを残してしぼみながら消える(ease-out)。
  `\n@keyframes cctvdot{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(0.25)}}`;

/** 日時のモザイクの1マス(px)。文字高12pxに対して約4マス=数字の並びとは分かるが読めない粗さ(社長指示2026-11-18)。 */
const CLOCK_MOSAIC_PX = 3;
const CLOCK_FONT_PX = 12;
const CLOCK_W = 176, CLOCK_H = 16; // 「YYYY-MM-DD HH:MM:SS」が収まる枠(CSS px)

/** 時刻表示(モザイク)。1秒ごとに自分だけ描き直す小部品。等倍で文字を描いてから粗い格子へ縮め、引き伸ばして出す(canvas 1枚・1秒に4回だけ)。 */
const CctvClock: React.FC = () => {
  const t0 = useRef(performance.now());
  const [ms, setMs] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);
  const src = useMemo(() => document.createElement('canvas'), []);
  useEffect(() => {
    const id = window.setInterval(() => setMs(performance.now() - t0.current), 250);
    return () => window.clearInterval(id);
  }, []);
  const text = formatCctvClock(CCTV_CLOCK_START_SEC, ms);
  useEffect(() => {
    const out = ref.current; if (!out) return;
    const sw = CLOCK_W * 2, sh = CLOCK_H * 2; // 原寸は2倍で描いて縮める=マスの色が平均されて滑らかな粗さになる
    src.width = sw; src.height = sh;
    const g = src.getContext('2d'); const o = out.getContext('2d');
    if (!g || !o) return;
    g.clearRect(0, 0, sw, sh);
    g.font = `${CLOCK_FONT_PX * 2}px ${MONO}`;
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(232,236,236,0.86)';
    g.fillText(text, 0, sh / 2);
    o.imageSmoothingEnabled = true;
    o.clearRect(0, 0, out.width, out.height);
    o.drawImage(src, 0, 0, out.width, out.height);
  }, [text, src]);
  return (
    <canvas
      ref={ref}
      width={Math.ceil(CLOCK_W / CLOCK_MOSAIC_PX)}
      height={Math.ceil(CLOCK_H / CLOCK_MOSAIC_PX)}
      aria-hidden
      style={{ width: CLOCK_W, height: CLOCK_H, imageRendering: 'pixelated', display: 'block', filter: 'drop-shadow(1px 1px 0 rgba(0,0,0,0.75))' }}
    />
  );
};

interface CctvReplayProps {
  onDone: () => void;
}

/** 出てからこれだけは飛ばしを受け付けない(前の画面を閉じた入力の持ち越し対策)。 */
const CCTV_SKIP_ARM_MS = 1000;

const CctvReplay: React.FC<CctvReplayProps> = ({ onDone }) => {
  const noise = useMemo(makeNoiseSheet, []);
  const [cam, setCam] = useState<number | null>(null); // null=まだ何も映っていない(読み込み中)
  const [blank, setBlank] = useState(false);            // カメラ切替の空白(黒・無音)
  const [cut, setCut] = useState<null | 'end' | 'skip'>(null);
  const staticRef = useRef<ReturnType<typeof startCctvStatic> | null>(null);
  const timers = useRef<number[]>([]);
  const camRef = useRef<number | null>(null);
  const cutRef = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  // ザー: 作るのはマウント時(直前のタップの操作権のうちに)。最初のカメラが映るまでは黙らせておく。
  useEffect(() => {
    const st = startCctvStatic();
    st.gate(false);
    staticRef.current = st;
    const ids = timers.current;
    return () => { st.stop(); staticRef.current = null; ids.forEach(id => window.clearTimeout(id)); };
  }, []);

  const onCamera = useCallback((c: number) => {
    if (cutRef.current) return;
    const prev = camRef.current;
    camRef.current = c;
    setCam(c);
    if (prev === null) { staticRef.current?.gate(true); return; }
    if (prev === c) return;
    // カメラが替わる: 一瞬黒+ザーがブツっと途切れ、新しいカメラが映ったらまた鳴る。
    staticRef.current?.gate(false);
    setBlank(true);
    timers.current.push(window.setTimeout(() => {
      if (cutRef.current) return;
      setBlank(false);
      staticRef.current?.gate(true);
    }, CCTV_SWITCH_BLANK_MS));
  }, []);

  const powerOff = useCallback((skipped: boolean) => {
    if (cutRef.current) return;
    cutRef.current = true;
    staticRef.current?.stop(); // プツンと同時にザーも切れる
    setCut(skipped ? 'skip' : 'end');
    timers.current.push(window.setTimeout(() => doneRef.current(), cctvEndingMs(skipped)));
  }, []);

  const onSceneEnd = useCallback(() => powerOff(false), [powerOff]);

  // 飛ばしの受付は出てから少し後(社長報告2026-11-18「一瞬で終わっちゃって写らない」): 前の記録画面を閉じたタップ
  // (pointerup)の直後に、同じ指の click がこの画面へ届いて即プツンになっていた。押し始めがこの画面の上で、かつ受付後のものだけ数える。
  const armedRef = useRef(false);
  const downInsideRef = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => { armedRef.current = true; }, CCTV_SKIP_ARM_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !armedRef.current) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); powerOff(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [powerOff]);

  const osd: React.CSSProperties = {
    position: 'absolute', fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', lineHeight: 1.3,
    color: 'rgba(232,236,236,0.86)', textShadow: '1px 1px 0 rgba(0,0,0,0.75)', whiteSpace: 'pre', pointerEvents: 'none',
  };

  return (
    <div
      data-testid="cctv-replay"
      onPointerDown={() => { downInsideRef.current = armedRef.current; }}
      onClick={() => { if (downInsideRef.current) powerOff(true); downInsideRef.current = false; }}
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', zIndex: 50, cursor: 'default', userSelect: 'none' }}
    >
      <style>{CSS}</style>
      {/* 映像(画+焼き込みの表示)。プツンではこの箱ごと潰れる。 */}
      <div
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden', isolation: 'isolate', transformOrigin: '50% 50%',
          animation: cut ? `cctvoff ${CCTV_POWER_OFF_MS}ms cubic-bezier(0.55,0,0.9,0.35) forwards` : undefined,
        }}
      >
        {/* 画: 白黒→冷たい色味(セピアを青緑へ回す)・コントラスト高め・少し甘く。 */}
        <div style={{
          position: 'absolute', inset: 0, isolation: 'isolate',
          filter: 'grayscale(1) sepia(0.35) hue-rotate(165deg) saturate(0.55) contrast(1.15) brightness(1.08) blur(0.6px)',
        }}>
          <OpeningScene cctv onDone={onSceneEnd} onCctvCamera={onCamera} />
        </div>
        {cam !== null && (
          <>
            {/* 走査線 */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10,
              background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.26) 0px, rgba(0,0,0,0.26) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)',
            }} />
            {/* ゆっくり下へ流れる明るい帯(ブラウン管の映り込み) */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11, overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: '22%',
                background: 'linear-gradient(to bottom, rgba(220,235,235,0) 0%, rgba(220,235,235,0.06) 50%, rgba(220,235,235,0) 100%)',
                animation: 'cctvroll 7.5s linear infinite',
              }} />
            </div>
            {/* 粒のちらつき(4コマのタイルを steps で送る) */}
            {noise && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12, opacity: 0.55,
                backgroundImage: noise, backgroundSize: `${NOISE_TILE * NOISE_FRAMES}px ${NOISE_TILE}px`,
                animation: `cctvgrain 0.36s steps(${NOISE_FRAMES}) infinite`,
              }} />
            )}
            {/* 周辺減光(レンズの落ち) */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 13,
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
            }} />
            {/* カメラ切替の空白(黒) */}
            {blank && <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 14 }} />}
            {/* 焼き込みの表示(カメラの機械が出す文字。映像と一緒に潰れる) */}
            <div style={{ ...osd, zIndex: 15, top: `max(calc(max(env(safe-area-inset-top), 0px) + 14px), calc(50vh - ${FRAME_HALF_H} - 22px))`, left: 'calc(max(env(safe-area-inset-left), 0px) + 14px)' }}>
              {cctvCameraLabel(cam)}
            </div>
            {/* 右上はミュートのボタンが居るので REC は右下 */}
            <div style={{ ...osd, zIndex: 15, bottom: 'calc(max(env(safe-area-inset-bottom), 0px) + 14px)', right: 'calc(max(env(safe-area-inset-right), 0px) + 14px)' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'rgba(225,60,50,0.9)', marginRight: 6, verticalAlign: '1px', animation: 'cctvrec 1.2s steps(1) infinite' }} />
              REC
            </div>
            <div style={{ ...osd, zIndex: 15, top: `min(calc(100vh - max(env(safe-area-inset-bottom), 0px) - 30px), calc(50vh + ${FRAME_HALF_H} + 8px))`, left: 'calc(max(env(safe-area-inset-left), 0px) + 14px)' }}>
              <CctvClock />
            </div>
          </>
        )}
        {/* プツンの光: 潰れていく画を白く飛ばす=横一本の光る線になる */}
        {cut && (
          <div style={{
            position: 'absolute', inset: 0, background: '#f4f8f8', zIndex: 20, pointerEvents: 'none',
            animation: `cctvflash ${CCTV_POWER_OFF_MS}ms ease-in forwards`,
          }} />
        )}
      </div>
      {/* 潰れ切った後の残光の点 */}
      {cut && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%', width: 6, height: 4, borderRadius: '50%',
          background: '#fff', boxShadow: '0 0 10px 4px rgba(220,240,240,0.7)', opacity: 0, pointerEvents: 'none',
          animation: `cctvdot ${CCTV_AFTERGLOW_MS}ms cubic-bezier(0.2,0.7,0.3,1) ${CCTV_POWER_OFF_MS}ms forwards`,
        }} />
      )}
    </div>
  );
};

export default CctvReplay;

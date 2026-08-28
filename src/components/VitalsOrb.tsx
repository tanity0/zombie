import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { hasEquipIcon, equipIconName } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';

// コンパクトなバイタル表示: HP は「数字主体の球体(オーブ)」、その外周を EXP の白いリングが一周。
// 一周溜まる=レベルアップ。被弾した瞬間はオーブを点滅+パンチさせて分かりやすくする。
//
// UI_OVERHAUL.md §2(社長裁定2026-08-28「ワイングラスにワインが注がれてるようなイメージ」)。
// 液体だけ SVG矩形塗り(280ms ease)から専用canvasへ置き換え、2層サイン波+慣性で「波打つHP」を
// 表現する。器(76px円)・EXPリング・HP数字・Lvバッジ・被弾パンチ/白フラッシュ・色(現行紫の
// 2段階hpHi/hpLo・裁定待ち)は変えない(MUST)。危険演出は足さない(液体の動きだけ=裁定に忠実)。
//
// DOM構造(監査A-2/A-3で確定): 暗い土台円+液体=canvas(opacity:0.7=旧<g opacity={0.7}>の継承)→
// ガラス艶/縁(SVG・モックの形)→EXPリング・HP数字・
// Lvバッジ・白フラッシュ=既存SVGを絶対配置でcanvasの上に重ねる。被弾パンチは key 再マウントを
// やめ、常時マウントのまま el.animate()(WAAPI)で都度再生する(再マウントするとcanvasの波・
// shownHpが被弾のたびに消えて波が最大になるべき瞬間に飛ぶ)。
//
// 再描画規律: player 丸ごとではなく必要な数値だけを個別購読(HP/EXP は被弾・取得イベントでのみ変化)。
// 波のアニメは rAF ローカル(Reactのstate/storeを毎フレーム触らない・CLAUDE.md 再レンダ規律)。
const SIZE = 76;          // 全体の一辺(px)
const STROKE = 5;         // レイアウト用(オーブ径の基準。形は維持)
const RING_STROKE = 3.5;  // EXPリングの「描画」太さ(社長指示で少し細く)
const RING_R = (SIZE - STROKE) / 2 - 1;       // EXPリング半径
const RING_C = 2 * Math.PI * RING_R;          // 円周
const ORB_R = RING_R - STROKE - 2;            // 内側オーブ半径
const CX = SIZE / 2;
const CY = SIZE / 2;

// ?wineorb=0 で旧・静的SVG塗り(canvas無し)へ復帰(LowHpVignette.tsx:5と同型のモジュール定数)。
const WINE_ORB_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('wineorb') === '0';

// ガラスの輪の実素材(hp-orb-glass.png)は社長指示2026-08-28「HPの渡した枠の素材、削除で
// モックの形に揃えて」で撤去した。器の枠はモックどおりSVG(ガラス艶ellipse+紫の縁stroke)が正。

// 液体シミュレーションの叩き台定数(UI_OVERHAUL.md §2の数値どおり。実機調整はここだけ触ればよい)。
const FOLLOW_RATE = 3.2;     // shownHpの実HPへの指数追従(1/s・注ぎ/流出の速度感)
const DECAY_RATE = 1.9;      // 波の振幅減衰(1/s・ワイン=粘る)
const AMPLITUDE_K = 0.55;    // ΔHP比→振幅の加算係数
const AMPLITUDE_CAP = 0.16;  // 振幅の上限(ORB_R比)
const RIPPLE_DURATION = 900; // 着水波紋の寿命(ms)
const STOP_HP_EPS = 0.001;   // 停止条件: shownHpと実HPの差
const STOP_AMP_EPS = 0.02;   // 停止条件: 振幅
const DT_CLAMP = 0.05;       // タブ復帰/ポーズ明けの巨大dtで液面が飛ばないように

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const topYFor = (hp: number, maxHp: number) => {
  const frac = clamp01(maxHp > 0 ? hp / maxHp : 0);
  return CY + ORB_R - 2 * ORB_R * frac;
};

// 2層サイン波(位相逆行)+端(オーブの円周付近)の振幅減衰。x はcanvas座標(px)、tSec は秒。
// 戻り値はy方向オフセット(px)。
const waveOffset = (x: number, tSec: number, amplitudePx: number): number => {
  const nx = (x - CX) / ORB_R;
  const edge = Math.max(0, 1 - Math.min(1, Math.abs(nx)) * Math.min(1, Math.abs(nx))); // 端でゼロへ
  const w1 = Math.sin(nx * Math.PI * 2.1 + tSec * 2.6);
  const w2 = Math.sin(nx * Math.PI * 3.3 - tSec * 1.7 + Math.PI); // 位相逆行の第2層
  return amplitudePx * edge * (w1 * 0.65 + w2 * 0.35);
};

type AnimState = {
  shownHp: number;
  amplitude: number;
  lastPrevHealth: number;
  rippleStartTime: number | null;
  rippleY: number;
  rafId: number | null;
  lastT: number | null;
  ctx: CanvasRenderingContext2D | null;
};

// canvas 1枚に「暗い土台円+液体本体+液面ハイライト+注ぎ+着水波紋」を描く(純関数・状態は引数で受け取る)。
const drawLiquid = (
  ctx: CanvasRenderingContext2D,
  state: AnimState,
  health: number,
  maxHealth: number,
  tSec: number,
) => {
  ctx.save();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.beginPath();
  ctx.arc(CX, CY, ORB_R, 0, Math.PI * 2);
  ctx.clip();

  // 暗い土台円(旧: rgba(10,10,16,0.78) 塗り)。
  ctx.fillStyle = 'rgba(10,10,16,0.78)';
  ctx.fillRect(CX - ORB_R - 4, CY - ORB_R - 4, ORB_R * 2 + 8, ORB_R * 2 + 8);

  const shownFrac = clamp01(maxHealth > 0 ? state.shownHp / maxHealth : 0);
  const baseTopY = topYFor(state.shownHp, maxHealth);
  const amplitudePx = state.amplitude * ORB_R;

  // 液体本体: ★モックで踏んだバグ対策(社長報告2026-08-28「HP増えると細くなる中身が」)=
  // 弦幅(その高さでの円の実際の幅)ではなく常に円の全幅(±R超)で塗り、円クリップに削らせる。
  // 弦幅を使うのは下の液面ハイライト線だけ。
  const leftX = CX - ORB_R - 4;
  const rightX = CX + ORB_R + 4;
  const bottomY = CY + ORB_R + 4;
  const steps = 32;
  ctx.beginPath();
  ctx.moveTo(leftX, bottomY);
  ctx.lineTo(leftX, baseTopY + waveOffset(leftX, tSec, amplitudePx));
  for (let i = 0; i <= steps; i++) {
    const x = leftX + ((rightX - leftX) * i) / steps;
    ctx.lineTo(x, baseTopY + waveOffset(x, tSec, amplitudePx));
  }
  ctx.lineTo(rightX, bottomY);
  ctx.closePath();

  // HPは紫(社長指示・裁定待ち=現行の2段階のまま「動きだけ」)。上=明るい紫→下=濃い紫。
  const hpHi = shownFrac > 0.5 ? '#b070f5' : shownFrac > 0.25 ? '#9333ea' : '#7e22ce';
  const hpLo = shownFrac > 0.25 ? '#3b0764' : '#2a043f';
  const grad = ctx.createLinearGradient(CX, baseTopY, CX, CY + ORB_R);
  grad.addColorStop(0, hpHi);
  grad.addColorStop(1, hpLo);
  ctx.fillStyle = grad;
  ctx.fill();

  // 液面ハイライト線(白35%・波線・弦幅を使ってよい唯一の場所)。
  const chordHalf = Math.sqrt(Math.max(0, ORB_R * ORB_R - (baseTopY - CY) ** 2));
  if (chordHalf > 0.5 && shownFrac > 0.02 && shownFrac < 0.99) {
    ctx.beginPath();
    const hSteps = 20;
    for (let i = 0; i <= hSteps; i++) {
      const x = CX - chordHalf + (chordHalf * 2 * i) / hSteps;
      const y = baseTopY + waveOffset(x, tSec, amplitudePx);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 回復=注がれる: shownHpが実HPへまだ追いついていない(回復中)の間だけ、上端→液面の細い注ぎ。
  if (health - state.shownHp > 0.5) {
    ctx.beginPath();
    ctx.moveTo(CX, CY - ORB_R - 2);
    ctx.lineTo(CX, baseTopY);
    ctx.strokeStyle = 'rgba(230,210,255,0.55)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // 着水点の波紋(~0.9秒)。
  if (state.rippleStartTime != null) {
    const elapsedMs = tSec * 1000 - state.rippleStartTime;
    if (elapsedMs >= RIPPLE_DURATION) {
      state.rippleStartTime = null;
    } else {
      const t = elapsedMs / RIPPLE_DURATION;
      const r = ORB_R * 0.55 * t;
      ctx.beginPath();
      ctx.ellipse(CX, state.rippleY, r, r * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  ctx.restore();
};

const VitalsOrb: React.FC = () => {
  const health = useGameStore(s => s.player.health);
  const maxHealth = useGameStore(s => s.player.maxHealth);
  const experience = useGameStore(s => s.player.experience);
  const expToNext = useGameStore(s => s.player.experienceToNextLevel);
  const level = useGameStore(s => s.player.level);
  // 装備(部位ごとに個別購読=装備変更時のみ再描画)。アイコンがある装備だけ表示。
  const equipBody = useGameStore(s => s.player.equipment.body);
  const equipArms = useGameStore(s => s.player.equipment.arms);
  const equipAccessory = useGameStore(s => s.player.equipment.accessory);
  const equipIcons = [equipBody, equipArms, equipAccessory]
    .filter((id): id is string => hasEquipIcon(id))
    .map(id => ({ id, src: spritePath(equipIconName(id)) }));

  // 被弾検知(現行踏襲): HP が下がった瞬間に hitKey をインクリメント。
  const prevHealth = useRef(health);
  const [hitKey, setHitKey] = useState(0);
  useEffect(() => {
    if (health < prevHealth.current - 0.01) setHitKey(k => k + 1);
    prevHealth.current = health;
  }, [health]);

  // 被弾パンチ/白フラッシュの再生: key再マウントをやめ、常時マウントのまま el.animate()(WAAPI)で
  // 都度再生する(監査A-2/A-3: 再マウントするとcanvasの波・shownHpが被弾のたびに消えてしまう)。
  // 器(ガラスの輪)にも液体にも同じスケールが掛かるよう、canvas/画像/SVGすべてを punchRef の中に置く。
  const punchRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (hitKey === 0) return; // 初回マウントでは再生しない
    const punch = punchRef.current;
    if (punch?.animate) {
      punch.animate(
        [{ transform: 'scale(1.18)' }, { transform: 'scale(0.97)', offset: 0.6 }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(0.16, 1.4, 0.3, 1)' },
      );
    }
    const flash = flashRef.current;
    if (flash?.animate) {
      flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
    }
  }, [hitKey]);

  const hpFrac = maxHealth > 0 ? clamp01(health / maxHealth) : 0;
  const expFrac = expToNext > 0 ? clamp01(experience / expToNext) : 0;
  const dash = `${RING_C * expFrac} ${RING_C}`;

  // ?wineorb=0 の旧・静的SVG経路でのみ使う値(通常経路はcanvas側で自前に計算する)。
  const fillTopY = CY + ORB_R - 2 * ORB_R * hpFrac;
  const hpHiStatic = hpFrac > 0.5 ? '#b070f5' : hpFrac > 0.25 ? '#9333ea' : '#7e22ce';
  const hpLoStatic = hpFrac > 0.25 ? '#3b0764' : '#2a043f';

  // --- ワインHP(canvas)の状態とrAFループ ---
  // 最新値をrefへ都度反映(rAFループはReactの再レンダーを介さずここを読む=CLAUDE.md 再レンダ規律)。
  const healthRef = useRef(health);
  healthRef.current = health;
  const maxHealthRef = useRef(maxHealth);
  maxHealthRef.current = maxHealth;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<AnimState | null>(null);
  if (!animRef.current) {
    animRef.current = {
      shownHp: health, // 初期マウントはスナップ(出撃直後に注ぎ演出はしない)
      amplitude: 0,
      lastPrevHealth: health,
      rippleStartTime: null,
      rippleY: CY,
      rafId: null,
      lastT: null,
      ctx: null,
    };
  }

  const tick = (nowMs: number) => {
    const state = animRef.current;
    const ctx = state?.ctx;
    if (!state || !ctx) return;
    if (state.lastT == null) state.lastT = nowMs;
    const dt = Math.min(DT_CLAMP, (nowMs - state.lastT) / 1000);
    state.lastT = nowMs;

    const hp = healthRef.current;
    const maxHp = Math.max(1, maxHealthRef.current);

    // ΔHP検知: 振幅を加算(増減とも)。回復(増加)時だけ注ぎ+着水波紋を開始する。
    const deltaHp = hp - state.lastPrevHealth;
    if (Math.abs(deltaHp) > 0.001) {
      const deltaFrac = deltaHp / maxHp;
      state.amplitude = Math.min(AMPLITUDE_CAP, state.amplitude + AMPLITUDE_K * Math.abs(deltaFrac));
      if (deltaHp > 0) {
        state.rippleStartTime = nowMs;
        state.rippleY = topYFor(state.shownHp, maxHp);
      }
      state.lastPrevHealth = hp;
    }

    // shownHpは実HPへ指数追従、振幅は指数減衰(慣性MUST=パッと出ない・スッと消えない)。
    state.shownHp += (hp - state.shownHp) * (1 - Math.exp(-FOLLOW_RATE * dt));
    state.amplitude *= Math.exp(-DECAY_RATE * dt);

    drawLiquid(ctx, state, hp, maxHp, nowMs / 1000);

    // 停止条件(数値で): shownHpが実HPへ十分近く・振幅が十分小さく・波紋も終わっていたら
    // shownHpをスナップして停止する(指数追従は漸近=これが無いと永久に止まらない)。
    const settled = Math.abs(hp - state.shownHp) < STOP_HP_EPS
      && state.amplitude < STOP_AMP_EPS
      && state.rippleStartTime == null;
    if (settled) {
      state.shownHp = hp;
      drawLiquid(ctx, state, hp, maxHp, nowMs / 1000);
      state.rafId = null;
      state.lastT = null;
      return; // 再スケジュールしない=アイドルでCPUを食わない
    }
    state.rafId = requestAnimationFrame(tick);
  };

  const ensureRunning = () => {
    const state = animRef.current;
    if (!state || !state.ctx || state.rafId != null) return; // 多重起動ガード
    state.lastT = null;
    state.rafId = requestAnimationFrame(tick);
  };

  // canvasのセットアップ(マウント1回・DPR対応)。初回はスナップ描画してからループを起こす。
  useLayoutEffect(() => {
    if (WINE_ORB_DISABLED) return;
    const canvas = canvasRef.current;
    const state = animRef.current;
    if (!canvas || !state) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.ctx = ctx;
    drawLiquid(ctx, state, healthRef.current, Math.max(1, maxHealthRef.current), performance.now() / 1000);
    ensureRunning();
    return () => {
      if (state.rafId != null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      state.ctx = null;
    };
    // マウント1回だけ。以後の再起動はHP変化を検知する下のeffectが担う(refで最新値を読むため)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HP/EXPの購読は現行のままイベント駆動: HPが変わるたびに、止まっていればループを再び起こす。
  useEffect(() => {
    if (WINE_ORB_DISABLED) return;
    ensureRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health, maxHealth]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <div ref={punchRef} style={{ width: SIZE, height: SIZE, position: 'relative' }}>
          {!WINE_ORB_DISABLED && (
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: SIZE, height: SIZE, opacity: 0.7 }}
            />
          )}
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ position: 'absolute', inset: 0 }}
          >
            <defs>
              <clipPath id="orbClip">
                <circle cx={CX} cy={CY} r={ORB_R} />
              </clipPath>
              <linearGradient id="hpFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hpHiStatic} />
                <stop offset="100%" stopColor={hpLoStatic} />
              </linearGradient>
              {/* EXP進捗の色: 左=濃い→右=薄い(社長指示)。リングは描画群が rotate(-90) されるので
                  gradientTransform で打ち消して画面の左右方向に合わせる。 */}
              <linearGradient id="expGrad" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(90 0.5 0.5)">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.28)" />
              </linearGradient>
            </defs>

            {/* ?wineorb=0(旧経路)専用: 静的な液体塗り。通常経路はcanvasが描く。 */}
            {WINE_ORB_DISABLED && (
              <g opacity={0.7}>
                <circle cx={CX} cy={CY} r={ORB_R} fill="rgba(10,10,16,0.78)" />
                <g clipPath="url(#orbClip)">
                  <rect
                    x={CX - ORB_R}
                    y={fillTopY}
                    width={ORB_R * 2}
                    height={Math.max(0, CY + ORB_R - fillTopY)}
                    fill="url(#hpFill)"
                    style={{ transition: 'y 280ms ease-out, height 280ms ease-out' }}
                  />
                  {hpFrac > 0.02 && hpFrac < 0.99 && (
                    <rect x={CX - ORB_R} y={fillTopY} width={ORB_R * 2} height={2} fill="rgba(255,255,255,0.35)" />
                  )}
                </g>
              </g>
            )}

            {/* ガラスの艶・縁(モックの形=常時SVGで描く。社長指示2026-08-28で実素材の輪は撤去)。 */}
            <ellipse cx={CX} cy={CY - ORB_R * 0.42} rx={ORB_R * 0.6} ry={ORB_R * 0.32} fill="rgba(255,255,255,0.12)" />
            <circle cx={CX} cy={CY} r={ORB_R} fill="none" stroke="rgba(192,132,252,0.4)" strokeWidth={1.5} />

            {/* EXP リング: トラック + 進捗(細め・右ほど薄い) */}
            <g transform={`rotate(-90 ${CX} ${CY})`}>
              <circle cx={CX} cy={CY} r={RING_R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={RING_STROKE} />
              <circle
                cx={CX}
                cy={CY}
                r={RING_R}
                fill="none"
                stroke="url(#expGrad)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={dash}
                style={{ transition: 'stroke-dasharray 280ms ease-out', filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.5))' }}
              />
            </g>

            {/* HP 数字(主役・即時反映のまま=shownHpではなく実HPを表示) */}
            <text
              x={CX}
              y={CY + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontWeight="800"
              fontSize={ORB_R * 0.78}
              fill="#ffffff"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {Math.max(0, Math.ceil(health))}
            </text>
          </svg>

          {/* 被弾フラッシュ(白い円が一瞬光ってフェード)。常時マウント・el.animate()で都度再生。 */}
          <span
            ref={flashRef}
            aria-hidden
            style={{
              position: 'absolute',
              left: CX - ORB_R,
              top: CY - ORB_R,
              width: ORB_R * 2,
              height: ORB_R * 2,
              borderRadius: '9999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(192,132,252,0.5) 60%, transparent 72%)',
              pointerEvents: 'none',
              opacity: 0,
            }}
          />
        </div>

        {/* レベル(オーブ下の小バッジ): 半透明の背景・1行固定(折り返さない) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap"
          style={{ bottom: -8, backgroundColor: 'rgba(13,10,20,0.6)', border: '1px solid rgba(168,85,247,0.4)' }}
        >
          Lv {level}
        </div>
      </div>

      {/* 装備アイコン(HP右隣)。アイコンを持つ装備のみ縦に並べる。 */}
      {equipIcons.length > 0 && (
        <div className="flex flex-col gap-1">
          {equipIcons.map(ic => (
            <img
              key={ic.id}
              src={ic.src}
              alt=""
              draggable={false}
              className="w-6 h-6 rounded-md hud-translucent p-0.5 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default VitalsOrb;

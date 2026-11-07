import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { hasEquipIcon, equipIconName } from '../data/equipment';
import { spritePath } from '../utils/spriteLoader';
import { bloodOrbTarget } from '../utils/bloodAwaken';

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
// モックの形に揃えて」で撤去した(事実)。
// ★2026-08-30: 社長が新しい外枠素材を支給(「HPの外枠素材」=紫のガラスリング)→ hp-orb-frame.png
// として再導入。重ね順=液体(canvas)の上・SVG(艶/EXPリング/数字)の下——枠の帯はEXPリング帯と
// 同じ半径帯に重なるので、EXPの白い進捗が枠の上に描かれて読める。`?hpframe=0` で非表示(比較用)。
const HP_FRAME_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('hpframe') === '0';
const FRAME_SCALE = 1.0; // 枠画像の一辺=SIZE×この値(叩き台。素材512px・リング帯=半径194〜212/512)
// ★素材は再センタリング済み(v0.25.4077・社長報告「ガラスが少しずれてる」): 支給PNGはリング円の
// 中心が画像中心より14px上(512px基準・表示で約2px)に描かれていたため、画素を+14px下へ平行移動して
// 画像中心=リング中心に正規化した。コード側は中心一致(CX/CY)のまま=オフセット補正を持たない。

// ★液体の中身テクスチャ(社長支給2026-08-30「HPバーの液体の中身」+「マスクとして使えば液体っぽく
// なる？」→はい): 波形パス(=今の水の動きの塗り)をclipにして、この球素材をオーブにフィットさせて
// drawImageする。水位・波・慣性は現行のまま、塗りの質感だけが素材になる。素材は球のbboxで正方形
// クロップ→256pxに正規化済み(=マスク円いっぱいに乗る)。`?hpliquid=0`で従来のグラデ塗りへ復帰。
const HP_LIQUID_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('hpliquid') === '0';
let hpLiquidImg: HTMLImageElement | null = null;
const liquidTexture = (): HTMLImageElement | null => {
  if (HP_LIQUID_DISABLED || typeof window === 'undefined') return null;
  if (!hpLiquidImg) {
    hpLiquidImg = new Image();
    hpLiquidImg.src = spritePath('hp-orb-liquid');
  }
  return hpLiquidImg;
};

// 液体シミュレーションの叩き台定数(UI_OVERHAUL.md §2の数値どおり。実機調整はここだけ触ればよい)。
const FOLLOW_RATE = 3.2;     // shownHpの実HPへの指数追従(1/s・注ぎ/流出の速度感)
// ★v0.25.4082(社長指示「もう少し長く激しく」): 減衰1.9→1.0(揺れが約2倍長く続く)・
// 振幅係数0.55→0.9/上限0.16→0.26(波が約1.6倍高い)。
const DECAY_RATE = 1.0;      // 波の振幅減衰(1/s・ワイン=粘る)
const AMPLITUDE_K = 0.9;     // ΔHP比→振幅の加算係数
const AMPLITUDE_CAP = 0.26;  // 振幅の上限(ORB_R比)
const RIPPLE_DURATION = 900; // 着水波紋の寿命(ms)
const STOP_HP_EPS = 0.001;   // 停止条件: shownHpと実HPの差
const STOP_AMP_EPS = 0.02;   // 停止条件: 振幅
const DT_CLAMP = 0.05;       // タブ復帰/ポーズ明けの巨大dtで液面が飛ばないように

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// B10 血の覚醒(THEONE_ROUND2 §3-2): 液体の色は血の量で紫→赤へ寄る(覚醒の赤 #e0263a / #6a0a14 と同じ家族)。
// 量(shownBlood)は shownHp と同じ指数追従+rAFローカル(補間を新設しない・React を毎フレーム起こさない)。
const BLOOD_HI = [0xf0, 0x1e, 0x30] as const; // 朱 #f01e30
const BLOOD_LO = [0x6a, 0x0a, 0x14] as const; // 暗いワイン #6a0a14
const BLOOD_OVERLAY_ALPHA_ADD = 0.6; // 素材テクスチャ経路でグラデを重ねる濃さ(0.35)に足す量=赤が素材の紫に負けない(0.45 では6割でもほぼ紫だった・実測)
const bloodCurve = (t: number) => Math.pow(clamp01(t), 0.6); // 血は早めに赤く見え始める(線形だと半分まで紫のまま)
const BLOOD_STOP_EPS = 0.002;         // 停止条件: shownBloodと目標の差
const BLOOD_STAGE_SPLIT = 0.5;        // 二段の境目: 前半=紫→暗いワイン / 後半=ワイン→朱
// 満ちた瞬間の合図(クリエイティブ監査): 液面全体が一瞬リムまで迫り上がって引く。上がりは ease-out・戻りは ease-in(慣性)。
const OVERFLOW_MS = 500;              // 迫り上がって引くまでの長さ
const OVERFLOW_UP_FRAC = 0.4;         // そのうち「上がり」に使う割合(残りが戻り)
// 満ちた瞬間の波(同じく監査): 被弾スプラッシュ(AMPLITUDE_CAP + rippleStartTime + rippleY=topY)とは別の装置で、下から沸く向き。
const BOIL_AMPLITUDE_FRAC = 0.5;      // 振幅は被弾(上限 AMPLITUDE_CAP)の半分
const BOIL_RIPPLE_MS = 1500;          // 波紋の寿命(被弾の着水波紋 RIPPLE_DURATION=900 より長い=周期が長い)
const BOIL_RIPPLE_STAGGER_MS = 380;   // 2つ目の波紋の遅れ
const BOIL_RIPPLE_COUNT = 2;
const BOIL_RIPPLE_BASE_Y = 0.55;      // 波紋の出どころ(底寄り・オーブ中心から ORB_R の何倍下か)
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const mixRgb = (from: readonly [number, number, number], to: readonly [number, number, number], t: number): [number, number, number] => {
  const m = (a: number, c: number) => Math.round(a + (c - a) * t);
  return [m(from[0], to[0]), m(from[1], to[1]), m(from[2], to[2])];
};
const rgbStr = (c: readonly [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
/**
 * 液体の上(明部)の色: 二段。前半(0〜0.5)で元の紫を**暗いワイン**へ沈め(ハイライトの明るい紫を先に殺す=血が混ざった液体は暗くなる)、
 * 後半(0.5〜1)でワインから朱へ寄せる。線形RGB補間は紫→赤の途中がマゼンタに見えた。
 */
const bloodHiColor = (hex: string, t: number): string => {
  if (t <= 0.001) return hex;
  const base = hexToRgb(hex);
  if (t <= BLOOD_STAGE_SPLIT) return rgbStr(mixRgb(base, BLOOD_LO, t / BLOOD_STAGE_SPLIT));
  return rgbStr(mixRgb(BLOOD_LO, BLOOD_HI, (t - BLOOD_STAGE_SPLIT) / (1 - BLOOD_STAGE_SPLIT)));
};
/** 液体の底(暗部)の色: 前半で暗いワインへ沈み、後半はワインのまま(朱は上の明部だけ=深さが残る)。 */
const bloodLoColor = (hex: string, t: number): string => {
  if (t <= 0.001) return hex;
  return rgbStr(mixRgb(hexToRgb(hex), BLOOD_LO, Math.min(1, t / BLOOD_STAGE_SPLIT)));
};
/** 満ちた合図の迫り上がり(0=いつもの液面 / 1=リム)。0〜OVERFLOW_UP_FRAC で ease-out に上がり、残りで ease-in に戻る。 */
const overflowLift = (elapsedMs: number): number => {
  const k = clamp01(elapsedMs / OVERFLOW_MS);
  if (k < OVERFLOW_UP_FRAC) {
    const u = k / OVERFLOW_UP_FRAC;
    return 1 - (1 - u) * (1 - u);
  }
  const d = (k - OVERFLOW_UP_FRAC) / (1 - OVERFLOW_UP_FRAC);
  return 1 - d * d;
};

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
  shownBlood: number;           // B10: 液体の赤み(0..1・指数追従)
  awakenSeenAt: number;         // B10: 最後に見た覚醒の始まり(gameTime)。変わったら「満ちた」演出
  overflowStartTime: number | null; // B10: 満ちた瞬間の「液面の迫り上がり」の始まり(rAF時計ms)
  boilStartTime: number | null;     // B10: 満ちた瞬間の「下から沸く」波紋の始まり(rAF時計ms・被弾のrippleStartTimeとは別)
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
  const settledTopY = topYFor(state.shownHp, maxHealth);
  // B10 満ちた合図: 液面全体が一瞬リムまで迫り上がって引く(液面の高さだけを動かす=色・形は液体のまま)。
  let baseTopY = settledTopY;
  if (state.overflowStartTime != null) {
    const el = tSec * 1000 - state.overflowStartTime;
    if (el >= OVERFLOW_MS) state.overflowStartTime = null;
    else baseTopY = settledTopY + (CY - ORB_R - settledTopY) * overflowLift(el);
  }
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
  const blood = bloodCurve(state.shownBlood);
  const hpHi = bloodHiColor(shownFrac > 0.5 ? '#b070f5' : shownFrac > 0.25 ? '#9333ea' : '#7e22ce', blood);
  const hpLo = bloodLoColor(shownFrac > 0.25 ? '#3b0764' : '#2a043f', blood);
  const grad = ctx.createLinearGradient(CX, settledTopY, CX, CY + ORB_R); // 色は迫り上がりに引きずられない(いつもの液面を起点)
  grad.addColorStop(0, hpHi);
  grad.addColorStop(1, hpLo);
  const tex = liquidTexture();
  if (tex && tex.complete && tex.naturalWidth > 0) {
    // 素材テクスチャ経路: 波形パス(カレントパス)をマスクにして球素材を描く。テクスチャは波の中心
    // オフセットの半分だけ縦に揺れる(=中身も液面と同源の慣性で動く。±数px)。マージン4pxは
    // その揺れで円の縁に隙間が出ないための余白。上に従来グラデを薄く重ね、HP残量による
    // 2段階の色変化(明→暗)の情報を保つ。
    ctx.save();
    ctx.clip();
    const bob = waveOffset(CX, tSec, amplitudePx) * 0.5;
    ctx.drawImage(tex, CX - ORB_R - 4, CY - ORB_R - 4 + bob, ORB_R * 2 + 8, ORB_R * 2 + 8);
    ctx.globalAlpha = 0.35 + BLOOD_OVERLAY_ALPHA_ADD * blood;
    ctx.fillStyle = grad;
    ctx.fillRect(leftX, CY - ORB_R - 4, rightX - leftX, bottomY - (CY - ORB_R - 4));
    ctx.restore();
  } else {
    // 従来経路(?hpliquid=0 / 素材ロード前): グラデ塗り。
    ctx.fillStyle = grad;
    ctx.fill();
  }

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

  // B10: 満ちた瞬間の「下から沸く」波紋。被弾の着水波紋(液面=topY から広がる)とは逆に、底寄りから湧き上がりながら広がる。
  // 被弾より振幅は半分(tick 側)・寿命は長い。2つを少し遅らせて重ねる。色は液体の赤の家族(明るい血色)。
  if (state.boilStartTime != null) {
    const el = tSec * 1000 - state.boilStartTime;
    if (el >= BOIL_RIPPLE_MS + BOIL_RIPPLE_STAGGER_MS * (BOIL_RIPPLE_COUNT - 1)) {
      state.boilStartTime = null;
    } else {
      for (let i = 0; i < BOIL_RIPPLE_COUNT; i++) {
        const t = (el - BOIL_RIPPLE_STAGGER_MS * i) / BOIL_RIPPLE_MS;
        if (t <= 0 || t >= 1) continue;
        const e = 1 - (1 - t) * (1 - t); // ease-out(勢いよく湧いて、広がりながら鎮まる)
        const r = ORB_R * 0.7 * e;
        const y = CY + ORB_R * BOIL_RIPPLE_BASE_Y - ORB_R * 0.35 * e; // 底寄りから上へ沸き上がる
        ctx.beginPath();
        ctx.ellipse(CX, y, r, r * 0.34, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,150,158,${(0.4 * (1 - t) * (1 - t)).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
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
  // B10 血の覚醒: 血の量は 2% 刻みの整数と覚醒の始まりだけを購読(乾きは書かれない=rAFが getState で導く。毎フレーム再レンダしない)。
  const bloodStep = useGameStore(s => Math.round(s.player.bloodMeter * 50));
  const awakenStartedAt = useGameStore(s => s.player.bloodAwakenStartedAt);
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
      shownBlood: 0,
      awakenSeenAt: useGameStore.getState().player.bloodAwakenStartedAt,
      overflowStartTime: null,
      boilStartTime: null,
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

    // B10: 血の量(覚醒中は残り時間の割合=10秒で赤→紫へ戻る)へ同じ指数追従。満ちた瞬間(覚醒の始まりが変わった)は波を立てて縁を一筋走らせる。
    const gs = useGameStore.getState();
    const bloodTarget = bloodOrbTarget(gs.player, gs.gameTime);
    state.shownBlood += (bloodTarget - state.shownBlood) * (1 - Math.exp(-FOLLOW_RATE * dt));
    if (gs.player.bloodAwakenStartedAt !== state.awakenSeenAt) {
      if (gs.player.bloodAwakenUntil > gs.gameTime) {
        // 被弾スプラッシュと同じ装置(AMPLITUDE_CAP + rippleStartTime + rippleY=topY)は使わない。下から沸く別の波紋・半分の振幅。
        state.amplitude = Math.max(state.amplitude, AMPLITUDE_CAP * BOIL_AMPLITUDE_FRAC);
        state.boilStartTime = nowMs;
        state.overflowStartTime = nowMs;
      }
      state.awakenSeenAt = gs.player.bloodAwakenStartedAt;
    }

    drawLiquid(ctx, state, hp, maxHp, nowMs / 1000);

    // 停止条件(数値で): shownHpが実HPへ十分近く・振幅が十分小さく・波紋も終わっていたら
    // shownHpをスナップして停止する(指数追従は漸近=これが無いと永久に止まらない)。
    // B10: 血が在る間(乾き・覚醒の戻りは目標が動き続ける)は止めない。血が0で目標に追いついたら止まる。
    const bloodSettled = bloodTarget <= 0.001 && state.shownBlood < BLOOD_STOP_EPS;
    const settled = Math.abs(hp - state.shownHp) < STOP_HP_EPS
      && state.amplitude < STOP_AMP_EPS
      && state.rippleStartTime == null
      && state.overflowStartTime == null
      && state.boilStartTime == null
      && bloodSettled;
    if (settled) {
      state.shownHp = hp;
      state.shownBlood = 0;
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
    // 液体テクスチャのロード完了で1回描き直す(初回マウント時にロードが間に合わず、波が止まった
    // まま=rAFが再始動しないと従来塗りのまま静止し続けるのを防ぐ)。
    const tex = liquidTexture();
    const onTexLoad = tex && !tex.complete
      ? () => {
        const st = animRef.current;
        if (st?.ctx) drawLiquid(st.ctx, st, healthRef.current, Math.max(1, maxHealthRef.current), performance.now() / 1000);
      }
      : null;
    if (tex && onTexLoad) tex.addEventListener('load', onTexLoad);
    return () => {
      if (tex && onTexLoad) tex.removeEventListener('load', onTexLoad);
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
  }, [health, maxHealth, bloodStep, awakenStartedAt]);

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
          {/* 外枠素材(社長支給2026-08-30)。液体の上・SVG(艶/EXPリング/数字)の下。 */}
          {!HP_FRAME_DISABLED && (
            <img
              src={spritePath('hp-orb-frame')}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: CX - (SIZE * FRAME_SCALE) / 2,
                top: CY - (SIZE * FRAME_SCALE) / 2,
                width: SIZE * FRAME_SCALE,
                height: SIZE * FRAME_SCALE,
                pointerEvents: 'none',
              }}
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

            {/* モック由来のガラス描き込み(上部の白い艶楕円・紫の縁リング線)は社長指示2026-08-30で
                全て撤去(「ベタ塗りの白い楕円は消して」「紫の線も消して」)。器の質感は外枠素材
                (hp-orb-frame)と液体テクスチャが担う。 */}

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
              stroke="#020617"
              strokeWidth={ORB_R * 0.78 * 0.14}
              strokeLinejoin="round"
              paintOrder="stroke fill"
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
          className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap gt-solid"
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

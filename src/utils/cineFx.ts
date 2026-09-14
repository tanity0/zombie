// 寄り演目に乗るVFX(research/CINEMATIC_CAMERA.md §8 v2・社長承認2026-09-14)の純関数側。
// 判定・尺・ばらし方の計算はここに置き、pixiScene(描画)はこれを読むだけ。
// ★掟: カメラの台本(cineCamera.ts)の値を読んで動く絵だけを足す。無関係に光るだけの絵は作らない。
import type { CineKind } from './cineCamera';

/** VFXの演目。`cineEvent.kind` に「PvP致命(自分が殺される)」を足した区分。 */
export type CineFxKind = CineKind | 'fatal-on-player';

/** ステージの語彙(§8-2・farBackdrop 7値+研究所を明示分岐で受ける。板と違い「光・空気」は屋内でも成立する)。 */
export type CineFxVocab = 'forest' | 'city' | 'lab' | 'none';

/**
 * ステージ語彙。**全値を明示で受け、既定は 'none'**(v1は森/雪/廃都の3つしか書いておらず
 * stage5(城塞)・stage7(星雲)・ending が未定義だった)。
 * 訓練・エンディング・通路・EX は呼び出し側(pushOnly)で先に落とす。
 */
export const cineFxVocab = (farBackdrop: string, stageTheme: string): CineFxVocab => {
  if (stageTheme === 'lab') return 'lab';                 // 研究所=語彙を差し替えて出す(社長裁定・★未決#4)
  if (farBackdrop === '' || farBackdrop === 'snow') return 'forest';
  if (farBackdrop === 'city') return 'city';
  if (farBackdrop === 'stage5' || farBackdrop === 'stage7') return 'forest'; // 城塞/星雲=屋外の空気として扱う
  return 'none';                                          // tutorial / ending / 未知
};

/** 逆光の色(§8-2・場面ごと。赤=予告/紫=カウンター不可 は使わない)。 */
export const cineFxBacklightTint = (vocab: CineFxVocab): number =>
  vocab === 'city' ? 0xffd9a0 : vocab === 'lab' ? 0xe8f0f4 : 0xcfe6ff;

/** 研究所は蛍光灯=条(アナモルフィックの筋)を作らない。 */
export const cineFxHasStreak = (vocab: CineFxVocab): boolean => vocab !== 'lab';

// ─────────────────────────────────────────────────────────────────────────
// 尺と大きさ(§8-6)
// ─────────────────────────────────────────────────────────────────────────
export const CINE_FX_SHUTTER_HOLD_MS = 40;   // 立ち上がりは1コマ(カット=瞬間で正しい)→ここで保持
export const CINE_FX_SHUTTER_OUT_MS = 70;    // ease-out で抜ける(計 ~125ms=HITSTOP 100 の中で沈み、明ける頃に戻る)
export const CINE_FX_SHUTTER_ALPHA = 0.62;
export const CINE_FX_SHUTTER_TINT = 0x14090a; // 暗い血錆色。黒はどの作品にも属さない色
export const CINE_FX_SHUTTER_DESAT = 0.35;    // 沈んでいる間だけ彩度を落とす(抜けた瞬間に色が戻る=打撃感)

export const CINE_FX_WIPE_MS = 120;           // 指向性ワイプ(斬った軸に1本)。集中線は語彙違いで不採用
export const CINE_FX_WIPE_COUNTER_MS = 110;   // カウンターに配る1本(★未決#5・社長裁定)
export const CINE_FX_WIPE_W_FRAC = 1.8;       // 画面幅比

export const CINE_FX_VIGNETTE_TO = 0.90;      // 既存 this.vignette の alpha を押し込みで持ち上げる(0.70→)
export const CINE_FX_VIGNETTE_INNER_TO = 0.34; // 同 inner(0.55→)。新規に焼かない
export const CINE_FX_VIGNETTE_LAG_MS = 180;   // カメラが止まった後も沈み続ける(光の落ち方は運動より遅れる)

export const CINE_FX_BACKLIGHT_W_MULT = 2.2;  // 相手の幅の何倍(画面基準ではなく相手基準)
export const CINE_FX_BACKLIGHT_ALPHA = 0.70;
export const CINE_FX_BACKLIGHT_STRETCH_TO = 1.35; // 押し込みで横だけ伸びる(回転は入れない=3°は実機で見えない)
export const CINE_FX_RIM_ALPHA = 0.55;        // 相手の縁取り(三日月・slash_02)。★未決#3=社長が「3も足して」

export const CINE_FX_BOKEH = 4;               // 前景のボケ輪(手前2=9pxボケ / 奥2=2pxボケ)
export const CINE_FX_BOKEH_BLOOD = 2;         // うち血の玉(★未決#1・レンズに付いた血)
export const CINE_FX_BLOOD_TINT = 0x5a0f12;
export const CINE_FX_BLOOD_DRIP_FRAC = 0.06;  // 押し込みの間に画面高の何割ぶん垂れるか

export const CINE_FX_DUST_NEAR = 3;           // 手前の埃(大きく少なく)
export const CINE_FX_MOTES = 24;              // 火の粉(小さく多く)。「8+4」のような似た数の等分にしない
export const CINE_FX_DUST_NEAR_SPEED = 0.28;  // W/秒・カメラの横滑りと**逆符号**(手前ほど速く逆向き=視差)
export const CINE_FX_DUST_FAR_SPEED = 0.05;   // W/秒・同符号(奥はカメラに連れられる)
export const CINE_FX_DUST_DRIFT = 0.04;       // 終端速度(W/秒)。指数減衰で 0 に貼り付かせない
export const CINE_FX_DUST_DECAY = 0.97;       // 1フレーム(16.7ms)あたりの減衰。**強く減衰させると保持の尺で動く量が消える**
                                              // (0.90 だと 560ms の総移動が画面幅の5%=「小さくて見えない」側。テストで 10% 以上を固定)

export const CINE_FX_STAGGER_MS = [0, 33, 50] as const; // シャッター=0 / ワイプ=+2コマ / 逆光=+3コマ
export const CINE_FX_REPEAT_MS = 8000;        // 直近この時間に演目があったら打撃の層を弱める
export const CINE_FX_REPEAT_MULT = 0.45;      // 画作りの層(逆光・減光・埃)は据え置き

/** 死亡だけ: 逆光を出してから消す(「光が失われる」)。押し込みがこの値を越えると落ち始める。 */
export const CINE_FX_DEATH_FADE_FROM = 0.5;
export const CINE_FX_DEATH_FADE_MS = 400;

// ─────────────────────────────────────────────────────────────────────────
// 演目ごとに何を出すか(§8-1/§8-9)
// ─────────────────────────────────────────────────────────────────────────
export interface CineFxSet {
  shutter: boolean;
  wipe: boolean;
  backlight: boolean;
  rim: boolean;      // 相手の縁取り(三日月)
  bokeh: boolean;
  dust: boolean;
  vignette: boolean;
  /** 死亡系: 逆光は出してから消す / 減光は上から降りる / 埃は重力(横滑りではない)。 */
  dying: boolean;
}

const NONE: CineFxSet = { shutter: false, wipe: false, backlight: false, rim: false, bokeh: false, dust: false, vignette: false, dying: false };

/**
 * 演目→出すものの表。
 * - kill / execute = 全部。
 * - death / fatal-on-player(幻影→自分の致命)= **種類を変える**(減らすのではない・★未決#2 社長裁定)。
 * - counter = **ワイプ1本**(短い演目には鋭い物を1つ。弱い物を1つではない・★未決#5)。
 * - rescue = 出さない(台本なし)。
 */
export const cineFxSetFor = (kind: CineFxKind): CineFxSet => {
  switch (kind) {
    case 'kill':
    case 'execute':
      return { shutter: true, wipe: true, backlight: true, rim: true, bokeh: true, dust: true, vignette: true, dying: false };
    case 'death':
    case 'fatal-on-player':
      return { shutter: false, wipe: false, backlight: true, rim: false, bokeh: true, dust: true, vignette: true, dying: true };
    case 'counter':
      return { ...NONE, wipe: true };
    default:
      return NONE;
  }
};

/** 相手が自分自身(死亡/PvP致命)=「相手の背後」が定義できない演目か。 */
export const cineFxTargetsSelf = (kind: CineFxKind): boolean => kind === 'death' || kind === 'fatal-on-player';

// ─────────────────────────────────────────────────────────────────────────
// 押し込みの追従値(§8-5)
// ─────────────────────────────────────────────────────────────────────────
/**
 * ★`cam.pushNorm` をそのまま読んではいけない理由(品質監査13):
 *  - `counter`/`rescue` は pushNorm が**定数1**(配線するとカウンター/救援のたびに減光が全開で点く)。
 *  - 割り込み(`startFrac`)では kill の pushNorm が**1フレームで 0↔1 に跳ぶ**(慣性MUST違反)。
 * so: 上限速度つきの追従値にする。カメラが止まった後も CINE_FX_VIGNETTE_LAG_MS かけて目標へ沈み続ける。
 * 追従は dt 基準(60fps前提の定数を書かない)。
 */
export const cineFxPushFollow = (prev: number, target: number, dtMs: number): number => {
  const t = Math.max(0, Math.min(1, target));
  const maxStep = Math.max(0, dtMs) / Math.max(1, CINE_FX_VIGNETTE_LAG_MS);
  const d = t - prev;
  if (Math.abs(d) <= maxStep) return t;
  return prev + Math.sign(d) * maxStep;
};

/** シャッターの包絡線(立ち上がり1コマ→保持→ease-out)。0..1。 */
export const cineFxShutterAt = (tMs: number): number => {
  if (tMs < 0) return 0;
  if (tMs <= CINE_FX_SHUTTER_HOLD_MS) return 1;
  const u = (tMs - CINE_FX_SHUTTER_HOLD_MS) / CINE_FX_SHUTTER_OUT_MS;
  if (u >= 1) return 0;
  return 1 - (1 - (1 - u) ** 3); // ease-out で抜ける
};

/** ワイプの進み(0=寄り先 … 1=画面外)とα。出は速く、消えは遅れる。 */
export const cineFxWipeAt = (tMs: number, durMs: number): { frac: number; alpha: number } => {
  const u = Math.max(0, Math.min(1, tMs / Math.max(1, durMs)));
  const frac = 1 - 2 ** (-10 * u);           // easeOutExpo=刃が通った速さ
  const alpha = u < 0.15 ? u / 0.15 : 1 - ((u - 0.15) / 0.85) ** 2; // 立ち上がりは鋭く、消えは遅れる
  return { frac, alpha: Math.max(0, alpha) };
};

/** 死亡の「光が失われる」: 押し込みが CINE_FX_DEATH_FADE_FROM を越えてからの経過で落ちる。0..1。 */
export const cineFxDeathLight = (push: number, msSinceFadeStart: number): number => {
  if (push < CINE_FX_DEATH_FADE_FROM) return 1;
  const u = Math.max(0, Math.min(1, msSinceFadeStart / CINE_FX_DEATH_FADE_MS));
  return 1 - u * u; // 落ちは加速する(光が消えるのは最後が速い)
};

/** 反復への減衰(★未決#6): 打撃の層(シャッター・ワイプ)だけ弱める。画作りの層は据え置き。 */
export const cineFxRepeatMult = (lastFxAt: number, now: number): number =>
  lastFxAt > 0 && now - lastFxAt < CINE_FX_REPEAT_MS ? CINE_FX_REPEAT_MULT : 1;

// ─────────────────────────────────────────────────────────────────────────
// ばらし方(§8-5「ばらすとだけ書くと等確率乱数=均質の別名になる」)
// ─────────────────────────────────────────────────────────────────────────
export interface CineFxParticle {
  /** 画面比の初期位置(0..1)。 */ fx: number; fy: number;
  /** 大きさの倍率。 */ scale: number;
  /** 出だしの遅れ(ms)。 */ delayMs: number;
  /** 速度の個体差(倍率)。 */ speedMult: number;
  /** ボケ量(px)。手前ほど大きい。 */ blurPx: number;
  /** 手前(視差で逆向き)か。 */ near: boolean;
}

const lcg = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

/**
 * 手前の埃の配り方。**1枚だけ他の 2.5倍**を必ず混ぜる(人の目は「例外が1つある」ことで自然さを判定する)。
 * 等確率乱数で「全部ほどほどに違う」形にしない。
 */
export const cineFxNearDust = (seed: number, count = CINE_FX_DUST_NEAR): CineFxParticle[] => {
  const r = lcg(seed);
  const out: CineFxParticle[] = [];
  const outlier = Math.floor(r() * count); // 突出して大きい1枚
  for (let i = 0; i < count; i++) {
    out.push({
      fx: 0.08 + r() * 0.84, fy: 0.15 + r() * 0.7,
      scale: 0.6 + r() * 0.5,               // 画面高の 0.6〜1.1倍(素の散らばり)
      delayMs: i === outlier ? 0 : r() * 90, // 大きい1枚は最初から居る
      speedMult: 0.75 + r() * 0.5,
      blurPx: i === outlier ? 9 : 4 + r() * 5,
      near: true,
    });
  }
  // ★突出は「自分の素の大きさ×2.5」ではなく「**他の最大×2.5**」。素の散らばりが 0.6〜1.1 あるので、
  // 自分基準で掛けると小さい個体が当たった回に他と並んでしまう(=例外が消えて均質に戻る)。
  const maxOther = Math.max(...out.filter((_, i) => i !== outlier).map(p => p.scale), 0.6);
  out[outlier].scale = maxOther * 2.5;
  return out;
};

/** 火の粉(小さく多く)。手前/奥を混ぜ、ボケ量も分ける。 */
export const cineFxMotes = (seed: number, count = CINE_FX_MOTES): CineFxParticle[] => {
  const r = lcg(seed ^ 0x9e3779b9);
  const out: CineFxParticle[] = [];
  for (let i = 0; i < count; i++) {
    const near = r() < 0.35;
    out.push({
      fx: r(), fy: r(),
      scale: (near ? 0.7 : 0.35) + r() * 0.45, // 4〜10px 相当(呼び手が基準サイズを掛ける)
      delayMs: r() * 160,
      speedMult: 0.6 + r() * 0.9,
      blurPx: near ? 6 + r() * 3 : 2,
      near,
    });
  }
  return out;
};

/** 埃の速度更新(終端速度を残す=指数減衰で 0 に貼り付かせない)。返すのは W/秒。 */
export const cineFxDustStep = (v: number, driftV: number, dtMs: number): number => {
  const k = Math.pow(CINE_FX_DUST_DECAY, Math.max(0, dtMs) / 16.667); // dt 基準(60fps前提の定数を書かない)
  return v * k + driftV * (1 - k);
};

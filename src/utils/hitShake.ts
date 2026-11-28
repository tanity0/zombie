// ★近接のヒットストップの作り直し(research/HITSTOP.md・社長「推薦の通りで、さらにプレイヤーやボス倒した時にも参考のヒットストップスローはいい感じに入れて」)。
// 桜井政博『8つのヒットストップ仕様』をこのゲームに当てはめた部品のうち、純関数だけをここに置く(store と pixi の両方が読む・PixiJS に依存しない)。
//  1/2. 当てた敵の「絵だけ」が震える(自分は震えない・判定は1pxも動かない)。震えの欄は格闘と同じ brawlerShakeUntil(二重にしない・§6)。
//  3.   地上の敵は横だけ・浮いている敵は当てた向きのまま(全方向)。「浮いている」=描画で敵を持ち上げている高さの合計が 2px を超える。
//  5.   止めの長さ = 既存の長さ × MELEE_HITSTOP_STRETCH × 技の係数(会心・まとめ当ての上乗せはその後に足す)。格闘には掛けない。
//  6.   止めの間、斬撃の弧と鞭の縄の先だけが等速の 6% でじわっと進む(明けで跳ばない)。
//  7.   画面が引いている時は震えを大きく(×1/倍率・上限 ×2.5・寄っている時は ×1)。
// 判定・ダメージ・押しの距離・段の間隔・カウンターは何も変えない(ここは絵の値と止めの長さの表だけ)。

// ---- 3. 空中の判定 ----

/** これを超えて絵が持ち上がっていたら「空中」(px)。 */
export const HIT_SHAKE_AIR_MIN_PX = 2;

/** 描画で敵の絵を上へずらしている高さの内訳(px・+が上)。 */
export interface EnemyDrawLiftParts {
  /** 近接のとどめ・会心の跳ね(sin(liftT·π)·BOSS_FINISH_LIFT_PX)。 */
  finishLiftPx: number;
  /** 格闘の浮き・締めの跳ね・鞭の弱浮き(brawlerJuggleHeightRel × 基準)。 */
  brLiftPx: number;
  /** 鞭で投げられて飛ぶ高さ・叩きつけの担ぎ上げ。 */
  whipFlyLiftPx: number;
}

/** 敵の絵を持ち上げている高さの合計(px)。描画(足元からの持ち上げ)と空中の判定の両方がこれを読む(値は描画の今の式のまま=足すだけ)。 */
export const enemyDrawLiftPx = (p: EnemyDrawLiftParts): number => p.finishLiftPx + p.brLiftPx + p.whipFlyLiftPx;

/** 絵が浮いているか(震えを縦にも出すか)。 */
export const isDrawnAirborne = (liftPx: number): boolean => liftPx > HIT_SHAKE_AIR_MIN_PX;

// ---- 7. ズーム ----

/** 引いている時の震えの倍率の上限。 */
export const HIT_SHAKE_ZOOM_MAX_MUL = 2.5;
/**
 * 端末の基準の倍率(worldGroup の倍率・何もしていない時)。スマホも PC も 1(端末ごとの見える範囲は stage の倍率=utils/viewport が持ち、
 * worldGroup には入らない)ので、ここは端末で変わらない。
 */
export const HIT_SHAKE_BASE_ZOOM = 1;

/** 震えの幅の倍率 = 引いている(倍率<基準)時だけ 基準/倍率(上限 ×2.5)。寄っている時は 1(小さくしない)。 */
export const hitShakeZoomMul = (drawZoom: number, baseZoom = HIT_SHAKE_BASE_ZOOM): number => {
  if (!(drawZoom > 0) || !(baseZoom > 0)) return 1;
  const r = drawZoom / baseZoom;
  return r < 1 ? Math.min(HIT_SHAKE_ZOOM_MAX_MUL, 1 / r) : 1;
};

// ---- 1/3. 震えの向き ----

/**
 * 震えの絵のずれ(px)。amp=brawlerShakeWave の符号つきの振れ・dirX/dirY=当てた向き(単位)。
 * 地上(airborne=false)は向きの横成分だけ(縦は0)・空中は当てた向きのまま。zoomMul を幅に掛ける。
 */
export const hitShakeOffset = (amp: number, dirX: number, dirY: number, airborne: boolean, zoomMul = 1, ampMul = 1): { x: number; y: number } => ({
  x: amp * dirX * zoomMul * ampMul,
  y: airborne ? amp * dirY * zoomMul * ampMul : 0,
});

/** 震えの欄(格闘と同じ欄)。meleeShakeUntil=ナイフ・鞭・刀が書いた印(brawlerShakeUntil と同じ値の時だけ近接の決まりを使う)。 */
export interface HitShakeFields {
  brawlerShakeUntil?: number;
  brawlerShakeDx?: number;
  brawlerShakeDy?: number;
  meleeShakeUntil?: number;
  /** 近接の震えの幅の倍率(鞭の先端の当たり=WHIP_TIP_SHAKE.ampMul・それ以外=1)。 */
  meleeShakeAmp?: number;
}

/** ★鞭の先端で当てた時の震え(社長指示2026-11-27「鞭は雑魚でも先端当てで…ストップ揺れ長めにして」・叩き台): 長さ ×1.5・幅 ×1.3。根元は今のまま。 */
export const WHIP_TIP_SHAKE = { lenMul: 1.5, ampMul: 1.3 } as const;

/**
 * ナイフ・鞭・刀の当たりの震えの欄。stopUntil=この当たりの止めが明ける時刻(雑魚・強個体=hitStunUntil・ボス級=当たり+ボス用の長さ)。
 * 明けが今以前なら書かない(null)。走っている震えより短くはしない。向き=自分の中心→敵の中心(重なっていれば横)。
 */
export const meleeShakePatch = (
  prevShakeUntil: number | undefined, stopUntil: number | undefined, now: number,
  ecx: number, ecy: number, pcx: number, pcy: number,
  mul: { lenMul: number; ampMul: number } = { lenMul: 1, ampMul: 1 },
): Required<HitShakeFields> | null => {
  if (stopUntil === undefined || !(stopUntil > now)) return null;
  const own = now + (stopUntil - now) * Math.max(0, mul.lenMul);
  const until = Math.max(prevShakeUntil !== undefined && prevShakeUntil > now ? prevShakeUntil : 0, own);
  const dx = ecx - pcx, dy = ecy - pcy, dl = Math.hypot(dx, dy);
  const ux = dl > 1e-6 ? dx / dl : 1, uy = dl > 1e-6 ? dy / dl : 0;
  return { brawlerShakeUntil: until, meleeShakeUntil: until, brawlerShakeDx: ux, brawlerShakeDy: uy, meleeShakeAmp: Math.max(0, mul.ampMul) };
};

/**
 * 止めが後から延びた時(まとめ当ての上乗せ)に、走っている近接の震えを止めの明けまで延ばす。近接の震えでない・走っていない・延びていないなら null。
 */
export const extendMeleeShake = (f: HitShakeFields & { hitStunUntil?: number }, now: number, lenMul = 1): Pick<HitShakeFields, 'brawlerShakeUntil' | 'meleeShakeUntil'> | null => {
  if (!isMeleeShake(f) || !(f.brawlerShakeUntil! > now)) return null;
  const u = f.hitStunUntil !== undefined ? now + (f.hitStunUntil - now) * lenMul : undefined;
  if (u === undefined || !(u > f.brawlerShakeUntil!)) return null;
  return { brawlerShakeUntil: u, meleeShakeUntil: u };
};

/** この震えがナイフ・鞭・刀の当たりの物か(地上=横だけ・ズームの倍率を使う)。格闘・空中の弾の震えは今のまま。 */
export const isMeleeShake = (f: HitShakeFields): boolean =>
  f.meleeShakeUntil !== undefined && f.meleeShakeUntil === f.brawlerShakeUntil;

// ---- 5. 止めの長さの係数 ----

/**
 * 技ごとの止めの係数(叩き台)。自分の止め(描画)と敵の止めの両方に、MELEE_HITSTOP_STRETCH を掛けた後に掛ける。
 * light=各武器の1段目・軽い当たり / normal=通常 / finisher=各武器の締めの段・刀の一閃 / whipTip=鞭の先端の当たり。
 * 格闘(抉り打ちを含む)は時計ごと止める作りなので掛けない(別件で社長判断待ち)。
 */
export const HITSTOP_MOVE_K = { light: 0.8, normal: 1.0, finisher: 1.3, whipTip: 1.6 } as const;
export type HitstopMoveKind = keyof typeof HITSTOP_MOVE_K;

/** 3連撃(ナイフ・鞭)の段の係数。1段目=軽い・2段目=通常・3段目=締め。段の外は通常。 */
export const comboStageMoveKind = (stage: number): HitstopMoveKind => (stage === 1 ? 'light' : stage === 3 ? 'finisher' : 'normal');
/** 刀の技の係数。一閃・燕返し(一閃の派生)=締め・それ以外(連撃・殺陣・自動斬り)=通常。 */
export const katanaMoveKind = (move: string): HitstopMoveKind => (move === 'issen' || move === 'tsubame' ? 'finisher' : 'normal');

/**
 * 止めの長さに係数を掛ける(整数 ms)。stretchedMs=既に MELEE_HITSTOP_STRETCH を掛けた長さ・addMs=会心・まとめ当ての上乗せ(係数の後に足す)。
 */
export const applyHitstopK = (stretchedMs: number, kind: HitstopMoveKind, addMs = 0): number =>
  (stretchedMs > 0 ? Math.round(stretchedMs * HITSTOP_MOVE_K[kind]) : 0) + Math.max(0, addMs);

// ---- 6. 刃先・鞭の先のじわ進み ----

/** 止めの間の絵の時計の進み(等速に対する割合・叩き台)。 */
export const HITSTOP_CREEP_RATE = 0.06;

/**
 * 止めの間もごく遅く進む絵の時計(斬撃の弧・鞭の縄の先)。rawSince=実の経過・stopSince=止めた経過・selfMs=止めの長さ。
 * 止めの間 = 止めた所 + 経過×6%。明けた後 = 今 − 止めの長さ + 止めの長さ×6%(進んだ所から等速で続く=明けで跳ばない)。
 * stopSince<0 / selfMs<=0 ならそのまま。画面全体の止めの間は rawSince 自体が進まない(凍った時計を渡す)ので何も進まない。
 */
export const creepDrawSince = (rawSince: number, stopSince: number, selfMs: number, rate = HITSTOP_CREEP_RATE): number => {
  if (!(stopSince >= 0) || !(selfMs > 0) || !(rawSince >= 0)) return rawSince;
  if (rawSince <= stopSince) return rawSince;
  const inStop = Math.min(rawSince - stopSince, selfMs);
  return rawSince - inStop + inStop * Math.max(0, Math.min(1, rate));
};

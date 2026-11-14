/**
 * ★敵の浮く動作の見た目の直し(社長承認2026-11-14「敵の浮く動作がまだ少しぎごちない」)。描画だけが読む純関数(判定・位置・時間は変えない)。
 *  ③ 拾い直しののけぞりの続き(flinchContinueFromMs)
 *  ④ 空中の膨らみの支点を体の中ほどへ(airSwellPivotShiftPx)
 *  ⑤ 止めの震えを実時間の滑らかな波へ(brawlerShakeWave)
 *  ⑥ 押されている/浮いている間は歩きの揺れを出さない(walkMotionGateStep・切り替えは滑らかに)
 * PixiJS に依存しない(pixiScene と計測のテストが同じ式を読む)。
 */

/** 止めの震えの周期(ms)。旧の矩形波(16ms ごとに +1/−0.6 を交互=周期 32ms・フレームとずれて不規則)の代わり。 */
export const BRAWLER_SHAKE_PERIOD_MS = 72;
/** 震えの振れの山(旧の +1/−0.6 の山から山=1.6 と同じ幅=±0.8)。 */
export const BRAWLER_SHAKE_WAVE_AMP = 0.8;
/** 震えの終わりで振れが 0 へ寄る長さ(ms)。旧は終わりの1フレームで 1px から 0 へ切れていた。 */
export const BRAWLER_SHAKE_FADE_MS = 30;

/**
 * 止めの震えの符号つきの振れ(px・当てた方向に沿って掛ける)。leftMs=震えの残り(ms)・sinceMs=震えの始まり(当たり)からの実時間(ms)。
 * 包絡(残りとともに減衰・最大 4.5)は旧と同じ。波を sin にし、始まりは 0 から・終わりも 0 へ寄せる。
 */
export const brawlerShakeWave = (leftMs: number, sinceMs: number): number => {
  if (!(leftMs > 0)) return 0;
  const env = Math.min(4.5, 1 + leftMs / 28) * Math.min(1, leftMs / BRAWLER_SHAKE_FADE_MS);
  return env * BRAWLER_SHAKE_WAVE_AMP * Math.sin((Math.max(0, sinceMs) / BRAWLER_SHAKE_PERIOD_MS) * Math.PI * 2);
};

/**
 * のけぞり(出は ease-out で 0→1・戻りは cos で 1→0)を、新しい当たりで 0 から出直さず今の姿勢から続ける時の「出の何 ms 目から始めるか」。
 * prevSinceMs=前の当たりからの(のけぞりの式に渡していた)経過 ms。出の途中・頂点ならそこから続け、戻りの途中なら同じ傾きの出の点から上がり直す。
 * のけぞりが出ていない(範囲の外)なら 0(今どおり 0 から)。
 */
export const flinchContinueFromMs = (prevSinceMs: number, flinchMs: number, riseFrac: number): number => {
  const peak = flinchMs * riseFrac;
  if (!(prevSinceMs > 0) || prevSinceMs >= flinchMs) return 0;
  if (prevSinceMs <= peak) return prevSinceMs;
  const u = (prevSinceMs - peak) / Math.max(1e-6, flinchMs - peak);
  const w = (1 + Math.cos(u * Math.PI)) / 2; // 戻りの今の深さ
  return peak * (1 - Math.sqrt(Math.max(0, 1 - w))); // 出の式 1-(1-t/peak)² = w を解いた点
};

/**
 * 空中の膨らみ(縦横 airScale 倍)を体の中ほどを支点にする時の、絵の足元の下げ(px・+が下)。
 * bodyH=膨らむ前の絵の高さ(px)。足元支点のままだと膨らみの分だけ頭が上がり続ける(足の頂点の後も頭が上がる)。
 * liftPx=今の浮きの高さ(px)。足が地面より下へ出ないよう、下げはこれを超えない(重い区分・爆発の低い浮きでも足が地面に刺さらない)。
 */
export const airSwellPivotShiftPx = (airScale: number, bodyH: number, liftPx: number): number =>
  airScale > 1 ? Math.min((airScale - 1) * Math.max(0, bodyH) / 2, Math.max(0, liftPx)) : 0;

/** 歩きの揺れを押し/浮きで止める・戻す時の追従(ms)。0/1 の切り替えで1フレームに揺れが切れない(慣性)。 */
export const WALK_MOTION_GATE_TAU_MS = 60;
/** 歩きの揺れの掛け(0..1)を1フレーム進める。off=押されている/浮かされている(歩きのコマ側の pushedOrLifted と同じ条件)。 */
export const walkMotionGateStep = (prev: number | undefined, off: boolean, dtMs: number): number => {
  const want = off ? 0 : 1;
  const p = prev ?? want;
  const k = 1 - Math.exp(-Math.max(0, Math.min(400, dtMs)) / WALK_MOTION_GATE_TAU_MS);
  const v = p + (want - p) * k;
  return Math.abs(v - want) < 0.002 ? want : v;
};

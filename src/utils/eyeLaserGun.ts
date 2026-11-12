// UNIQUE_WEAPONS.md §16-2/§17-2(バッチC-1「アイレーザー」rifle-t3-eyelaser)。
// 溜め700ms→照射3000ms(100msごとに20ダメージ)→リロードの状態機械のうち、定数と
// 「1サイクル」実効DPS(§5-2)だけをここに置く(純関数・依存ゼロ=ヘッドレスでテスト可能)。
// 状態機械そのもの(gameTime駆動のフェーズ遷移・パルス適用)はsrc/hooks/useGameLoop.tsに置く
// (敵配列/壁/store書き込みが要るため。goldRing.tsと同じ役割分担)。
//
// ★リロードは既存武器と同じ標準経路(startReload/tickReload・Date.now基準)へ合流する
// (CATALOGのreloadMs=2500・raw値。effectiveReloadMsのRELOAD_TIME_MULT=2で実効5000msになり、
// これが下のサイクル式が使う値と一致する=§5-2「アイレーザー: 溜め700+照射3000+リロード5000」)。
// 溜め/照射/パルスの時計はgameTime(CLAUDE.md「時計はすべてgameTime」・落としやすい点3)。

export const EYE_LASER_CHARGE_MS = 700;
export const EYE_LASER_FIRE_MS = 3000;
export const EYE_LASER_PULSE_MS = 100;
export const EYE_LASER_PULSES_PER_FIRE = EYE_LASER_FIRE_MS / EYE_LASER_PULSE_MS; // 30
export const EYE_LASER_HALFWIDTH = 7; // レーザー半幅(px)。既定値の指定が無いため金環(§19-2)の7pxに揃えた
export const EYE_LASER_PULSE_DAMAGE = 20; // CATALOGのdamageと同値(1パルス=100msごとのダメージ)。社長裁定2026-11-12「慣性で遅くした分ダメージ量はあげて」で14→20
export const EYE_LASER_MAG_SIZE = 6;
export const EYE_LASER_RELOAD_MS_RAW = 2500; // CATALOGへ書く生値(§17-2)。実効値はeffectiveReloadMsが2倍する

// リロードの「実装のリロード」(§5の式=max(250, reloadMs*2))。CATALOGの生reloadMsとサイクル式の
// 二重管理を避けるため、この1本から両方を導出する。
export const eyeLaserEffectiveReloadMs = (reloadMsRaw = EYE_LASER_RELOAD_MS_RAW): number =>
  Math.max(250, reloadMsRaw * 2);

/**
 * 1サイクル(溜め→照射→リロード)の実効DPS(UNIQUE_WEAPONS.md §5-2)。
 * pulseDamage=1パルスの確定ダメージ(gunShotBaseDamageの結果=CATALOGのdamageに各種倍率を掛けた値)。
 * 戻り値は「全パルスが当たった時の上限」。社長裁定2026-11-12(照射を慣性つきで遅くし、外れるパルスが出る
 * 代わりに1パルス14→20)で、既定rifle-t3(45.83)の±10%帯の外(上限68.97=+50.5%)へ出た。
 */
export const eyeLaserCycleDps = (pulseDamage: number, reloadMsRaw = EYE_LASER_RELOAD_MS_RAW): number => {
  const totalDamage = pulseDamage * EYE_LASER_PULSES_PER_FIRE;
  const cycleMs = EYE_LASER_CHARGE_MS + EYE_LASER_FIRE_MS + eyeLaserEffectiveReloadMs(reloadMsRaw);
  return (totalDamage / cycleMs) * 1000;
};

// ★社長裁定2026-11-12「アイレーザーの仕様を変えよう。慣性を持たせて速度を落とす。」
// 「(案=照射中はずっと慣性つきの振りで追う・いちばん速い時で毎秒約70度)はい。その分ダメージ量はあげてください。」
// ⇒ **照射中は毎フレームこの1本の振り(stepEyeLaserAim)で光線の向きを動かす**。標的に張り付く(直接狙う)
// 経路は無い。合った後も、標的が動けば同じ慣性で追い直す。次の標的へ移る時も同じ1本(特別扱いなし)。
// (旧2026-09-07の作り: 次の標的へ振る時だけ慣性つき(MAX2.6rad/s)で、合ったら直接狙う=張り付き。)
//
// ★等速で振らない(CLAUDE.md「慣性MUST」)。角速度を持ち、**加速→減速**で合わせにいく:
//   ①目標角との差から「出したい角速度」を作る(差が小さいほど遅い=**終わりで減速**)
//   ②今の角速度をそこへ**加速度の上限**で寄せる(止まっている所から急に最大速度にならない=**出だしで加速**)
// ★値の根拠(実測・dt=1/60): 止まった状態から90度の振りが **約1.75秒**で収まり(±0.05rad以内)、
// 行き過ぎは0度(揺り戻し無し)。MAX=1.2(≈69°/s) / ACC=6 / GAIN=3。
// 横切る標的には光線が遅れる=外れている間のパルスは当たらない(これが今回の狙い)。
export const EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC = 1.2; // 振りの最大角速度(≈69°/s)
export const EYE_LASER_AIM_ACCEL_RAD_PER_SEC2 = 6.0;   // 角加速度の上限(出だしの溜め/止まる時の減速)
export const EYE_LASER_AIM_APPROACH_GAIN = 3.0;        // 目標角へ寄せる強さ(終わりの減速)
export const EYE_LASER_AIM_SETTLE_RAD = 0.05;          // これ以内に入ったら「合った」とみなす(テスト・計測用。振りは止めない)

/** -π..π へ畳んだ角度差(最短回り)。 */
export const shortestAngleDiff = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface EyeLaserAim { angle: number; vel: number }

/**
 * 照射中の光線の向きを1フレーム動かす(純関数・照射中は毎フレームこれだけを通す)。
 * targetAngle=null(標的が居ない)なら「出したい角速度」を0にする=同じ加速度の上限で減速して止まり、
 * 以後はその向きのまま(急停止しない=慣性MUST)。
 * `settled` は「今、目標角の±EYE_LASER_AIM_SETTLE_RAD以内か」を返すだけで、振りを終わらせる合図ではない。
 */
export const stepEyeLaserAim = (
  aim: EyeLaserAim,
  targetAngle: number | null,
  dtSec: number,
): EyeLaserAim & { settled: boolean } => {
  const err = targetAngle === null ? 0 : shortestAngleDiff(aim.angle, targetAngle);
  // ①出したい角速度(差に比例・最大値でクランプ=終わりで自然に減速する。標的なしは0)
  const want = targetAngle === null ? 0 : Math.max(
    -EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC,
    Math.min(EYE_LASER_AIM_MAX_RATE_RAD_PER_SEC, err * EYE_LASER_AIM_APPROACH_GAIN),
  );
  // ②今の角速度を、加速度の上限でそこへ寄せる(出だしの加速)
  const dv = want - aim.vel;
  const maxDv = EYE_LASER_AIM_ACCEL_RAD_PER_SEC2 * dtSec;
  const vel = aim.vel + Math.max(-maxDv, Math.min(maxDv, dv));
  const angle = aim.angle + vel * dtSec;
  const settled = targetAngle === null ? false : Math.abs(shortestAngleDiff(angle, targetAngle)) <= EYE_LASER_AIM_SETTLE_RAD;
  return { angle, vel, settled };
};

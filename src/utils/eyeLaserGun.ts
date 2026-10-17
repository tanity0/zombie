// UNIQUE_WEAPONS.md §16-2/§17-2(バッチC-1「アイレーザー」rifle-t3-eyelaser)。
// 溜め700ms→照射3000ms(100msごとに14ダメージ)→リロードの状態機械のうち、定数と
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
export const EYE_LASER_PULSE_DAMAGE = 14; // CATALOGのdamageと同値(1パルス=100msごとのダメージ)
export const EYE_LASER_MAG_SIZE = 6;
export const EYE_LASER_RELOAD_MS_RAW = 2500; // CATALOGへ書く生値(§17-2)。実効値はeffectiveReloadMsが2倍する

// リロードの「実装のリロード」(§5の式=max(250, reloadMs*2))。CATALOGの生reloadMsとサイクル式の
// 二重管理を避けるため、この1本から両方を導出する。
export const eyeLaserEffectiveReloadMs = (reloadMsRaw = EYE_LASER_RELOAD_MS_RAW): number =>
  Math.max(250, reloadMsRaw * 2);

/**
 * 1サイクル(溜め→照射→リロード)の実効DPS(UNIQUE_WEAPONS.md §5-2)。
 * pulseDamage=1パルスの確定ダメージ(gunShotBaseDamageの結果=CATALOGのdamageに各種倍率を掛けた値)。
 * 帯テスト(±10%の+寄り)はこの関数の戻り値を既定rifle-t3(45.83)と比べる。
 */
export const eyeLaserCycleDps = (pulseDamage: number, reloadMsRaw = EYE_LASER_RELOAD_MS_RAW): number => {
  const totalDamage = pulseDamage * EYE_LASER_PULSES_PER_FIRE;
  const cycleMs = EYE_LASER_CHARGE_MS + EYE_LASER_FIRE_MS + eyeLaserEffectiveReloadMs(reloadMsRaw);
  return (totalDamage / cycleMs) * 1000;
};

// ★社長指示2026-09-07「アイレーザー、敵が死んだら時間までは次の標的に少しゆっくり合わせにいくように
// して」。**#U15の裁定(2026-09-06「再ターゲットは無し」)を差し替える**——照射は打ち切らず、
// **残り時間いっぱいまで続けて、次の標的へゆっくり振る**。
//
// ★等速で振らない(CLAUDE.md「慣性MUST」)。角速度を持ち、**加速→減速**で合わせにいく:
//   ①目標角との差から「出したい角速度」を作る(差が小さいほど遅い=**終わりで減速**)
//   ②今の角速度をそこへ**加速度の上限**で寄せる(止まっている所から急に最大速度にならない=**出だしで加速**)
// これで「振り始めはゆっくり、途中で速く、狙いに近づくとまた減速して収まる」動きになる。
// ★値の根拠(実測): 照射は3秒しかないので、振りが長いと「合わせている間に終わる」。
// 90度の振りが **約0.97秒**(=照射の1/3)で収まる組み合わせにした。MAX=2.6 / ACC=12 / GAIN=5。
export const EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC = 2.6; // 振りの最大角速度(≈149°/s)
export const EYE_LASER_RETARGET_ACCEL_RAD_PER_SEC2 = 12.0;  // 角加速度の上限(出だしの溜め)
export const EYE_LASER_RETARGET_APPROACH_GAIN = 5.0;        // 目標角へ寄せる強さ(終わりの減速)
export const EYE_LASER_RETARGET_SETTLE_RAD = 0.05;          // これ以内に入ったら「合った」とみなす

/** -π..π へ畳んだ角度差(最短回り)。 */
export const shortestAngleDiff = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface EyeLaserAim { angle: number; vel: number }

/**
 * 次の標的へ「少しゆっくり」振る1ステップ(純関数)。
 * `settled` が true になったら振りは終わり(以後は通常の追尾=直接狙う)。
 */
export const stepEyeLaserAim = (
  aim: EyeLaserAim,
  targetAngle: number,
  dtSec: number,
): EyeLaserAim & { settled: boolean } => {
  const err = shortestAngleDiff(aim.angle, targetAngle);
  // ①出したい角速度(差に比例・最大値でクランプ=終わりで自然に減速する)
  const want = Math.max(
    -EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC,
    Math.min(EYE_LASER_RETARGET_MAX_RATE_RAD_PER_SEC, err * EYE_LASER_RETARGET_APPROACH_GAIN),
  );
  // ②今の角速度を、加速度の上限でそこへ寄せる(出だしの加速)
  const dv = want - aim.vel;
  const maxDv = EYE_LASER_RETARGET_ACCEL_RAD_PER_SEC2 * dtSec;
  const vel = aim.vel + Math.max(-maxDv, Math.min(maxDv, dv));
  const angle = aim.angle + vel * dtSec;
  return { angle, vel, settled: Math.abs(shortestAngleDiff(angle, targetAngle)) <= EYE_LASER_RETARGET_SETTLE_RAD };
};

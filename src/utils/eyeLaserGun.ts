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

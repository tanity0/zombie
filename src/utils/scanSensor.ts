// research/NEW_GUNS.md §4(第4版): スキャンセンサー(handgun-t2-scan)。
// 弾を撃たない銃。出撃中ずっと 1.2 秒ごとに「拍」が回り、拍が来た時にこの銃を持っていれば
// 向いている方へ細い扇(開き40°・長さ260)を 0.25 秒かけて根元から先へ掃く。掃き終わった時に
// まだこの銃を持っていれば、扇に入った敵へ 3 秒の「印」を付ける(重ねても強くならない・入り直せば3秒に戻る)。
// §4-2(社長指示2026-10-31「近接で叩いた時だけ倍率に」): 印の倍率が乗るのは**手動の近接で叩いた一撃だけ**
// (ナイフの振り・盾のバッシュ・気絶中の強個体への一撃・鞭・ワイヤーの斬り下ろし・刀の一閃)。叩くと重ねを使い切る(起爆)。
// 銃・サブ・仲間・自動で斬る系(刀の自動斬り・分身・スラッシャーの追撃・フィニッシュの波及)には倍率が乗らない。
// 1振りで倍率が効くのは「一番近い印付きの1体」だけ。
//
// このモジュールは**純関数と定数だけ**(storeを読まない)。掛ける場所は
//  - 手動の近接の各経路 = `pickScanMarkTarget` + `scanMarkMeleeMult` + `noteScanDetonation`
//  - 拍と扇= `scanBeatIndex` / `scanFanSweepFrac` / 扇は地面に倒した形(`scanFanContains`・`scanFanScreenPoint`)
import type { Enemy, EnemyType } from '../types/game';
import { usesBossCrit } from './enemyUtils';
import { stunnedMeleeOutcome, usesBossStunnedMelee, type StunnedMeleeEnemy } from './meleeExecute';

export const SCAN_WEAPON_KEY = 'handgun-t2-scan';
/** 守護霊・幻影・ボットはスキャンセンサーの代わりにこの銃で撃つ(§4・既存の「手動専用の銃は代わりの銃で撃つ」前例どおり)。 */
export const SCAN_FALLBACK_GUN_KEY = 'handgun-t2';
/** カウンターの名目の damage(ハンドガン T2 の1発・§4「カウンター」)。CATALOG の damage にこの値を書く。 */
export const SCAN_NOMINAL_DAMAGE = 9;

export const SCAN_BEAT_MS = 1200;
export const SCAN_FAN_HALF_ANGLE_RAD = (40 / 2) * Math.PI / 180;
export const SCAN_FAN_LENGTH_PX = 260;
export const SCAN_SWEEP_MS = 250;
export const SCAN_MARK_MS = 3000;

/** 印付きの雑魚への近接の会心 +15%(色の補正の後・上限の前)。 */
export const SCAN_MARK_MELEE_CRIT_BONUS = 0.15;
/** 印付きのボスへの近接の当たりで、'melee' の体勢削り 0.04 を 0.09 相当へ(impactMult)。 */
export const SCAN_MARK_MELEE_POSTURE_MULT = 0.09 / 0.04;

export type ScanMeleeKind = 'melee' | 'katana' | 'whip';

/** 拍の番号(gameTime はランの頭で0から始まる=持ち替えと関係なく回る)。 */
export const scanBeatIndex = (gameTime: number): number => Math.floor(Math.max(0, gameTime) / SCAN_BEAT_MS);

/** 拍の中の位置(0..1)。HUD の目盛りが読む。 */
export const scanBeatPhase = (gameTime: number): number => {
  const g = Math.max(0, gameTime);
  return (g % SCAN_BEAT_MS) / SCAN_BEAT_MS;
};

// ── 印の重ね(§4-2・社長指示2026-10-30「重ねられるようにするか？」「5段目でクリティカル扱い」) ──
/** 印の最大段。 */
export const SCAN_STACK_MAX = 5;
/**
 * 手動の近接の印の倍率(雑魚・重ねごと・叩くと使い切る)。ボス級はこれに SCAN_STACK_BOSS_RATIO、刀の一閃は SCAN_STACK_KATANA_RATIO を掛ける。
 * 溜めるほど得になるよう、重ね1つあたりの上乗せが重ねるほど大きくなる曲線(1重ねで叩き続けるより5重ねで叩く方が強い)。
 */
export const SCAN_STACK_MELEE_MOB_MULT = [1, 1.6, 2.8, 4.0, 5.4, 7.2] as const;
export const SCAN_STACK_BOSS_RATIO = 1.7;
export const SCAN_STACK_KATANA_RATIO = 3.1 / 2.75;

/**
 * 今の段。最後に掃いた時の段(scanStacks)から、印の時間(3秒)が切れるたびに1段ずつ減る。
 * 旧形式(scanStacks が無く scanMarkUntil だけ)は1段とみなす。
 */
/** 5重ねのクリティカル状態の長さ(ms・社長指示「3秒で自動解除(クリティカルは独自の解除)」)。 */
export const SCAN_CRIT_MS = 3000;
/** クリティカル状態(5重ねで入る)の最中か。この間はスキャンが入らない。 */
export const isScanCrit = (e: Pick<Enemy, 'scanCritUntil'>, gameTime: number): boolean =>
  e.scanCritUntil !== undefined && gameTime < e.scanCritUntil;
export const scanStacksAt = (e: Pick<Enemy, 'scanMarkUntil' | 'scanStacks' | 'scanCritUntil'>, gameTime: number): number => {
  if (e.scanMarkUntil === undefined) return 0;
  // クリティカル状態の間は5重ねのまま、解けたら0に戻る(独自の解除)。
  if (e.scanCritUntil !== undefined) return gameTime < e.scanCritUntil ? SCAN_STACK_MAX : 0;
  const base = Math.max(0, Math.min(SCAN_STACK_MAX, e.scanStacks ?? 1));
  if (gameTime < e.scanMarkUntil) return base;
  const lost = 1 + Math.floor((gameTime - e.scanMarkUntil) / SCAN_MARK_MS);
  return Math.max(0, base - lost);
};
/** 扇に入った時に書く値(1段重ね・残り時間は3秒に戻る)。 */
export const scanMarkAddStack = (e: Pick<Enemy, 'scanMarkUntil' | 'scanStacks' | 'scanCritUntil'>, gameTime: number): { scanStacks: number; scanMarkUntil: number; scanCritUntil: undefined } => ({
  scanStacks: Math.min(SCAN_STACK_MAX, scanStacksAt(e, gameTime) + 1),
  scanMarkUntil: gameTime + SCAN_MARK_MS,
  scanCritUntil: undefined,
});
/** 手動の近接で起爆した(重ねを使い切った)後に書く値。クリティカル状態も解く。 */
export const SCAN_DETONATED: { scanStacks: undefined; scanMarkUntil: undefined; scanCritUntil: undefined } = { scanStacks: undefined, scanMarkUntil: undefined, scanCritUntil: undefined };
// 起爆の予約(手動の近接の各経路が「この敵で起爆した」と書く→亡霊ではなく新しい銃の制御が次のフレームの頭でまとめて重ねを消す)。
// 経路ごとに敵の書き換え方が違うため、消す処理を1か所に集める(同じフレームの自動の斬りは重ねの倍率を使ってよい=消すのは次のフレーム)。
const scanDetonations = new Map<string, { x: number; y: number }>();
export const noteScanDetonation = (enemyId: string, x: number, y: number): void => { scanDetonations.set(enemyId, { x, y }); };
export const drainScanDetonations = (): Map<string, { x: number; y: number }> | null => {
  if (scanDetonations.size === 0) return null;
  const out = new Map(scanDetonations); scanDetonations.clear(); return out;
};
/** 次の1重ねが減るまでの残り(0..1)。足元の輪が欠けていく割合。印が無ければ 0。 */
export const scanStackRemainFrac = (e: Pick<Enemy, 'scanMarkUntil' | 'scanStacks' | 'scanCritUntil'>, gameTime: number): number => {
  if (e.scanMarkUntil === undefined || scanStacksAt(e, gameTime) <= 0) return 0;
  if (gameTime < e.scanMarkUntil) return Math.max(0, Math.min(1, (e.scanMarkUntil - gameTime) / SCAN_MARK_MS));
  return 1 - ((gameTime - e.scanMarkUntil) % SCAN_MARK_MS) / SCAN_MARK_MS;
};

/** 印が今効いているか(段が1以上)。 */
export const isScanMarked = (e: Pick<Enemy, 'scanMarkUntil' | 'scanStacks' | 'scanCritUntil'>, gameTime: number): boolean =>
  scanStacksAt(e, gameTime) > 0;

/** 印の残り(0..1)。描画の輪が欠けていく割合に使う。 */
export const scanMarkRemainFrac = (e: Pick<Enemy, 'scanMarkUntil'>, gameTime: number): number =>
  e.scanMarkUntil === undefined ? 0 : Math.max(0, Math.min(1, (e.scanMarkUntil - gameTime) / SCAN_MARK_MS));

/** 雑魚/ボス級の区分。ボス級=ボス式の会心(×5)を受ける型(usesBossCrit)。 */
export const scanMarkIsBossClass = (t: EnemyType): boolean => usesBossCrit(t);

/** 手動の近接・刀の一閃・鞭の印の倍率(§4-2: 重ねに比例・ナイフの段/Lvには関係なし)。印が無ければ 1。 */
export const scanMarkMeleeMult = (
  e: Pick<Enemy, 'type' | 'scanMarkUntil' | 'scanStacks' | 'scanCritUntil'>, gameTime: number, kind: ScanMeleeKind,
): number => {
  const n = scanStacksAt(e, gameTime);
  if (n <= 0) return 1;
  const mob = SCAN_STACK_MELEE_MOB_MULT[n];
  const m = scanMarkIsBossClass(e.type) ? mob * SCAN_STACK_BOSS_RATIO : mob;
  return kind === 'katana' ? m * SCAN_STACK_KATANA_RATIO : m;
};
/** 扇で印が最大段に「上がった瞬間」か(社長指示2026-10-30「5段目のスキャンでクリティカル状態」=止めるのは上がった時だけ)。 */
export const scanStackReachedFull = (before: number, after: number): boolean => before < SCAN_STACK_MAX && after >= SCAN_STACK_MAX;

/**
 * 1振りで倍率が効く「一番近い印付きの1体」を選ぶ。候補は**この振りが実際に当てる敵**を渡す
 * (届かない・壁越しの敵を混ぜない)。距離は呼び手の物差し(近接は enemyMeleeDist)。印付きが居なければ undefined。
 */
export const pickScanMarkTarget = <T extends Pick<Enemy, 'id' | 'scanMarkUntil'>>(
  candidates: readonly T[], gameTime: number, distOf: (e: T) => number,
): string | undefined => {
  let best: string | undefined;
  let bestD = Infinity;
  for (const e of candidates) {
    if (!isScanMarked(e, gameTime)) continue;
    const d = distOf(e);
    if (d < bestD) { bestD = d; best = e.id; }
  }
  return best;
};

/** 近接の会心率に足す印の上乗せ(印付きの雑魚だけ)。呼び手は「色の補正の後」の値に足してから上限を取る。 */
export const scanMarkMeleeCritBonus = (e: Pick<Enemy, 'type' | 'scanMarkUntil'>, gameTime: number): number =>
  isScanMarked(e, gameTime) && !scanMarkIsBossClass(e.type) ? SCAN_MARK_MELEE_CRIT_BONUS : 0;

/**
 * 気絶中の敵への近接が「強個体の3倍」になる相手か(社長決定2026-10-18: ここにも印の近接倍率を掛け、1体だけの枠も使う)。
 * 即死(処刑・紫中の強個体)とボスの気絶への5倍は false=印を掛けない。気絶していなければ false。
 */
export const isEliteHeavyStun = (
  e: StunnedMeleeEnemy & { stunUntil?: number; bossFullStunUntil?: number }, gameTime: number,
): boolean => e.stunUntil !== undefined && gameTime < e.stunUntil
  && !usesBossStunnedMelee(e.type) && stunnedMeleeOutcome(e, gameTime) === 'heavy';

/** 印付きのボスへの近接の 'melee' 削りの倍率(impactMult)。それ以外は 1。 */
export const scanMarkMeleePostureMult = (e: Pick<Enemy, 'type' | 'scanMarkUntil'>, gameTime: number): number =>
  isScanMarked(e, gameTime) && scanMarkIsBossClass(e.type) ? SCAN_MARK_MELEE_POSTURE_MULT : 1;

// ─────────────────────────────────────────────────────────────────────────
// 地面に倒した扇(社長決定2026-10-18)。扇は「地面の上の扇(開き40°・長さ260)」を縦に 0.36 で潰した形。
// 絵(pixi/newGunsFx.ts)と判定(pickScanFanHits)は**どちらも下の2つの関数で点を作る/戻す**ので形がずれない。
// 縦の潰し率は印の足元の輪(rx×0.36)と同じ。地面の赤い予告円は真円で描かれている(縦横比1)ので使っていない。
// 根元はプレイヤーの足元、敵は足元(当たり矩形の下辺の中央)で見る。
export const SCAN_FAN_GROUND_Y_SCALE = 0.36;

/** 画面上の向き(照準)→ 地面の上での扇の中心線の角度。潰して画面へ戻すと中心線は照準と同じ向きになる。 */
export const scanFanGroundAngle = (dirX: number, dirY: number): number =>
  Math.atan2(dirY / SCAN_FAN_GROUND_Y_SCALE, dirX);

/** 地面の上の角度・距離の点を画面へ置く(描画の扇の点はすべてこれで作る)。 */
export const scanFanScreenPoint = (ox: number, oy: number, groundAngle: number, rr: number): { x: number; y: number } => ({
  x: ox + Math.cos(groundAngle) * rr,
  y: oy + Math.sin(groundAngle) * rr * SCAN_FAN_GROUND_Y_SCALE,
});

/** 画面上の点が、地面に倒した扇(根元 ox,oy・照準 dir)の中か。tolPx=地面の上での距離の余裕(敵の足の幅)。 */
export const scanFanContains = (
  ox: number, oy: number, dirX: number, dirY: number, px: number, py: number,
  lengthPx = SCAN_FAN_LENGTH_PX, halfAngleRad = SCAN_FAN_HALF_ANGLE_RAD, tolPx = 0,
): boolean => {
  const gx = px - ox, gy = (py - oy) / SCAN_FAN_GROUND_Y_SCALE; // 地面の上へ戻す
  const d = Math.hypot(gx, gy);
  if (d > lengthPx + tolPx) return false;
  if (d < 1e-6) return true;
  let diff = Math.atan2(gy, gx) - scanFanGroundAngle(dirX, dirY);
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= halfAngleRad;
};

/** 掃き終わりに印を付ける敵: 足元(当たり矩形の下辺の中央)が地面の扇に入っている敵。余裕は足の幅の半分。 */
export const pickScanFanHits = <T extends Pick<Enemy, 'x' | 'y' | 'width' | 'height'>>(
  ox: number, oy: number, dirX: number, dirY: number, enemies: readonly T[],
): T[] => enemies.filter(e => scanFanContains(ox, oy, dirX, dirY, e.x + e.width / 2, e.y + e.height, SCAN_FAN_LENGTH_PX, SCAN_FAN_HALF_ANGLE_RAD, e.width / 2));

// ─────────────────────────────────────────────────────────────────────────
// 扇(描画と判定が同じ時計を読む)
export interface ScanFan {
  /** 拍の番号(同じ拍で2回出さない)。 */
  beat: number;
  /** 掃き始めの gameTime。 */
  startAt: number;
  dirX: number;
  dirY: number;
  /** 掃き終わりで印を付けたか(付けたら true。持ち替えで付かなかった時も「済み」にする)。 */
  resolved: boolean;
  /** 印を付けられた(=掃き終わりまでスキャンセンサーを持っていた)か。描画の締め方が変わる。 */
  marked: boolean;
  /** 持ち替え等で途中で止まった gameTime(描画のフェード起点)。 */
  abortedAt?: number;
}

/** 根元→先への掃きの進み(0..1)。加速→減速(ease-in-out)=等速で始まり瞬間停止しない(慣性)。 */
export const scanFanSweepFrac = (fan: Pick<ScanFan, 'startAt'>, gameTime: number): number => {
  const t = Math.max(0, Math.min(1, (gameTime - fan.startAt) / SCAN_SWEEP_MS));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** 拍が来たか(前に見た拍の番号から変わったか)。 */
export const scanBeatArrived = (prevBeat: number, gameTime: number): boolean => scanBeatIndex(gameTime) !== prevBeat;

/** 印の期限(もう一度入れば3秒に戻る=延長でも短縮でもなく「今から3秒」)。 */
export const scanMarkUntilFrom = (gameTime: number): number => gameTime + SCAN_MARK_MS;

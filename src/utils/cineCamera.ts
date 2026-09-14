// ダイナミック・カメラワーク(research/CINEMATIC_CAMERA.md v2・社長承認2026-09-14「はい」)。
// 寄りズームのイベント(KILL/処刑・カウンター成立・死亡・救急/救援)に**演目ごとのキーフレーム台本**を与える純関数。
// 出力は既存のパンチズーム(zoomDecay=hold→ramp の包絡線)に掛ける**倍率と構図**だけ。判定・座標・HUD・zwarp(斜め)の入力は不変。
// pixiScene は読むだけ(CLAUDE.md「PixiJS only draws」)。数値は叩き台=実機で絞る。
export type CineKind = 'kill' | 'counter' | 'death' | 'rescue';
/** 重なりの優先順(高い方が割り込む。同じ/低い新イベントは捨てる)。 */
export const CINE_PRIORITY: Readonly<Record<CineKind, number>> = { death: 3, kill: 2, counter: 1, rescue: 0 };
export interface CineEvent {
  kind: CineKind;
  startAt: number;   // Date.now(実時間・zoomStart と同じ時計)
  endAt: number;
  hasTarget: boolean;
  targetX: number;   // 相手(世界座標)。KILL=倒した敵 / カウンター=成立位置 / 死亡=自機
  targetY: number;
}
/** 台本を適用できる範囲。full=全部 / cutPush=ズーム引き中(pan が効かない)=カット+押し込みだけ / pushOnly=訓練・通路・EX=押し込みだけ */
export type CineMode = 'full' | 'cutPush' | 'pushOnly';
export interface CineCamera {
  zoomFrac: number;   // zoomMag に掛ける(1=台本なし)。KILL: カット70%→押し込み100%。カウンター: 112%→100%のばね。死亡: 60→100%をじり寄る
  orbitFrac: number;  // 横滑り(画面幅比・符号は呼び手が奥側で決める)。full 以外は0
  thirds: boolean;    // 相手を三分割線へ(自機と相手の内分点を寄り先にする)。full 以外は false
  outPow: number;     // 戻りの形: 共有包絡線(easeOut)に掛ける冪。1=そのまま / >1=保ってから速く落ちる(硬く切る) / <1=来た時より遅く帰る
}
// クリエイティブ監査(v0.25.4295・1巡)の反映: 押し込みに距離を持たせる(85→70%)/押し込みと横滑りを重ねて経路を1本に/
// 横滑りは長く怠く・押し込みは短く鋭く(尺で性格を分ける)/カウンターの行き過ぎを見える量に/振りは速く出てゆっくり戻る/
// 死亡は着いて止めてから来た時より遅く帰る。
// ---- KILL/処刑 ----
export const CINE_KILL_CUT_FRAC = 0.7;       // カット(命中の瞬間に飛ぶ寄り)。1.7→2.0 へ押し込む距離を持たせる
export const CINE_KILL_PUSH_START_MS = 100;  // ストップ明けから押し込み(HITSTOP_MS と同じ)
export const CINE_KILL_PUSH_MS = 224;        // 保持560msの前半40%で100%へ(「一番寄る瞬間=スローの一番遅い区間」の裁定を保つ)
export const CINE_KILL_ORBIT_FRAC = 0.08;    // 横滑り(画面幅比)
export const CINE_KILL_ORBIT_START_MS = 200; // 押し込みの後半から重ねて滑り出す(終点と始点を同じ瞬間にしない=速度0の角を作らない)
export const CINE_KILL_ORBIT_MS = 260;       // 長く怠く(押し込みより長い)。t=460 で到達=斜め(zwarp)がほどけ切る頃に合わせる
export const CINE_KILL_OUT_POW = 1;
// ---- カウンター成立 ----
export const CINE_COUNTER_OVERSHOOT = 0.12;  // 112%→100%(2倍ズームで+6%=見える量)
export const CINE_COUNTER_IN_MS = 70;
export const CINE_COUNTER_ORBIT_FRAC = 0.05; // 逆側へ1拍
export const CINE_COUNTER_ORBIT_OUT_MS = 60; // 速く出て
export const CINE_COUNTER_ORBIT_BACK_MS = 180; // ゆっくり戻る
export const CINE_COUNTER_OUT_POW = 3;       // 硬く切る(保ってから速く落ちる)
// ---- 死亡 ----
export const CINE_DEATH_FROM_FRAC = 0.6;
export const CINE_DEATH_IN_MS = 900;         // 保持1150の前に着いて 250ms 止める
export const CINE_DEATH_OUT_POW = 0.6;       // 来た時より遅く帰る
/** 三分割: 自機→相手の内分(相手寄り)。 */
export const CINE_THIRDS_T = 0.65;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeInQuad = (u: number) => u * u;
const smoothstep = (u: number) => u * u * (3 - 2 * u);

export const cineCameraAt = (kind: CineKind, tMs: number, mode: CineMode): CineCamera => {
  const t = Math.max(0, tMs);
  const full = mode === 'full';
  switch (kind) {
    case 'kill': {
      const zoomFrac = t < CINE_KILL_PUSH_START_MS
        ? CINE_KILL_CUT_FRAC
        : CINE_KILL_CUT_FRAC + (1 - CINE_KILL_CUT_FRAC) * easeOutCubic(clamp01((t - CINE_KILL_PUSH_START_MS) / CINE_KILL_PUSH_MS));
      const ou = clamp01((t - CINE_KILL_ORBIT_START_MS) / CINE_KILL_ORBIT_MS);
      return { zoomFrac, orbitFrac: full ? CINE_KILL_ORBIT_FRAC * smoothstep(ou) : 0, thirds: full, outPow: CINE_KILL_OUT_POW };
    }
    case 'counter': {
      const u = clamp01(t / CINE_COUNTER_IN_MS);
      const zoomFrac = 1 + CINE_COUNTER_OVERSHOOT * (1 - easeOutCubic(u));
      // 逆側へ1拍: 速く出て(60ms・ease-out)、ゆっくり戻る(180ms・ease-out)=往復を対称にしない
      const t1 = t - CINE_COUNTER_IN_MS;
      let orbit = 0;
      if (t1 > 0) {
        orbit = t1 < CINE_COUNTER_ORBIT_OUT_MS
          ? -CINE_COUNTER_ORBIT_FRAC * easeOutCubic(t1 / CINE_COUNTER_ORBIT_OUT_MS)
          : -CINE_COUNTER_ORBIT_FRAC * (1 - easeOutCubic(clamp01((t1 - CINE_COUNTER_ORBIT_OUT_MS) / CINE_COUNTER_ORBIT_BACK_MS)));
      }
      return { zoomFrac, orbitFrac: full ? orbit : 0, thirds: full, outPow: CINE_COUNTER_OUT_POW };
    }
    case 'death': {
      // 止まらずにじり寄る(ease-in)→保持(DEATH_ZOOM_HOLD_MS までの残り)で止める→来た時より遅く帰る(outPow<1)
      const u = clamp01(t / CINE_DEATH_IN_MS);
      return { zoomFrac: CINE_DEATH_FROM_FRAC + (1 - CINE_DEATH_FROM_FRAC) * easeInQuad(u), orbitFrac: 0, thirds: false, outPow: CINE_DEATH_OUT_POW };
    }
    case 'rescue':
    default:
      return { zoomFrac: 1, orbitFrac: 0, thirds: false, outPow: 1 };
  }
};

/** 新しい演目を受け付けるか(優先順)。進行中(now<endAt)より低い/同じ順位は捨てる。 */
export const cineAccepts = (current: CineEvent | null, kind: CineKind, now: number): boolean =>
  !current || now >= current.endAt || CINE_PRIORITY[kind] > CINE_PRIORITY[current.kind];

/** 三分割の寄り先=自機と相手の内分点(相手寄り CINE_THIRDS_T)。 */
export const thirdsPoint = (px: number, py: number, tx: number, ty: number): { x: number; y: number } =>
  ({ x: px + (tx - px) * CINE_THIRDS_T, y: py + (ty - py) * CINE_THIRDS_T });

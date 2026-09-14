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
  zoomFrac: number;   // zoomMag に掛ける(1=台本なし)。KILL: カット85%→押し込み100%。カウンター: 104%→100%のばね。死亡: 60→100%をゆっくり
  orbitFrac: number;  // 横滑り(画面幅比・符号は呼び手が奥側で決める)。full 以外は0
  thirds: boolean;    // 相手を三分割線へ(自機と相手の内分点を寄り先にする)。full 以外は false
}
// ---- KILL/処刑 ----
export const CINE_KILL_CUT_FRAC = 0.85;      // カット(命中の瞬間に飛ぶ寄り)
export const CINE_KILL_PUSH_START_MS = 100;  // ストップ明けから押し込み(HITSTOP_MS と同じ)
export const CINE_KILL_PUSH_MS = 224;        // 保持560msの前半40%で100%へ(「一番寄る瞬間=スローの一番遅い区間」の裁定を保つ)
export const CINE_KILL_ORBIT_FRAC = 0.08;    // 横滑り(画面幅比)
export const CINE_KILL_ORBIT_START_MS = CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS; // 押し込みが着いてから滑る
export const CINE_KILL_ORBIT_MS = 220;
// ---- カウンター成立 ----
export const CINE_COUNTER_OVERSHOOT = 0.04;  // 104%→100%
export const CINE_COUNTER_IN_MS = 40;
export const CINE_COUNTER_ORBIT_FRAC = 0.05; // 逆側へ1拍(往復)
export const CINE_COUNTER_ORBIT_MS = 240;
// ---- 死亡 ----
export const CINE_DEATH_FROM_FRAC = 0.6;
export const CINE_DEATH_IN_MS = 1150;
/** 三分割: 自機→相手の内分(相手寄り)。 */
export const CINE_THIRDS_T = 0.65;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
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
      return { zoomFrac, orbitFrac: full ? CINE_KILL_ORBIT_FRAC * smoothstep(ou) : 0, thirds: full };
    }
    case 'counter': {
      const u = clamp01(t / CINE_COUNTER_IN_MS);
      const zoomFrac = 1 + CINE_COUNTER_OVERSHOOT * (1 - easeOutCubic(u));
      const ou = clamp01((t - CINE_COUNTER_IN_MS) / CINE_COUNTER_ORBIT_MS);
      // 逆側へ1拍=負の符号で往復(sin の1山)
      return { zoomFrac, orbitFrac: full ? -CINE_COUNTER_ORBIT_FRAC * Math.sin(Math.PI * ou) : 0, thirds: full };
    }
    case 'death': {
      const u = clamp01(t / CINE_DEATH_IN_MS);
      return { zoomFrac: CINE_DEATH_FROM_FRAC + (1 - CINE_DEATH_FROM_FRAC) * easeInOutCubic(u), orbitFrac: 0, thirds: false };
    }
    case 'rescue':
    default:
      return { zoomFrac: 1, orbitFrac: 0, thirds: false };
  }
};

/** 新しい演目を受け付けるか(優先順)。進行中(now<endAt)より低い/同じ順位は捨てる。 */
export const cineAccepts = (current: CineEvent | null, kind: CineKind, now: number): boolean =>
  !current || now >= current.endAt || CINE_PRIORITY[kind] > CINE_PRIORITY[current.kind];

/** 三分割の寄り先=自機と相手の内分点(相手寄り CINE_THIRDS_T)。 */
export const thirdsPoint = (px: number, py: number, tx: number, ty: number): { x: number; y: number } =>
  ({ x: px + (tx - px) * CINE_THIRDS_T, y: py + (ty - py) * CINE_THIRDS_T });

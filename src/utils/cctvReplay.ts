// 監視カメラ映像(EXクリア後の記録のあとに流す・社長指示2026-11-18)の尺と表示の決め。
// 画は OpeningScene(cctv)の会場3アングル+舞台裏、白黒・走査線・時刻・ザーは CctvReplay が被せる。値は全て叩き台(実機で調整)。

/** カメラが切り替わる時の空白(画は黒・ザーも途切れる)。 */
export const CCTV_SWITCH_BLANK_MS = 300;
/** 最後のプツン: 画が横一本の光る線→点へ潰れる尺(急な ease-in)。 */
export const CCTV_POWER_OFF_MS = 220;
/** 潰れ切った点の残光が消える尺。 */
export const CCTV_AFTERGLOW_MS = 420;
/** 黒のまま置いてからリザルトへ。 */
export const CCTV_BLACK_HOLD_MS = 1200;
/** タップで飛ばした時の黒の置き(短め)。 */
export const CCTV_BLACK_HOLD_SKIP_MS = 450;

/** 時刻表示の起点(その日の秒)。21:14:37。 */
export const CCTV_CLOCK_START_SEC = 21 * 3600 + 14 * 60 + 37;
/** 日付(叩き台。物語上の日付が決まったら差し替える)。 */
export const CCTV_DATE = '2025-07-19';

/** OpeningScene の phase(0-2=会場の3アングル / 3=舞台裏)→ カメラ名。 */
const CAMERA_LABELS = ['CAM 01  HALL A', 'CAM 02  STAGE L', 'CAM 04  STAGE R', 'CAM 09  STAFF EXIT'];
export const cctvCameraLabel = (cam: number): string => CAMERA_LABELS[Math.max(0, Math.min(CAMERA_LABELS.length - 1, Math.floor(cam)))];

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** 起点(その日の秒)から elapsedMs 経った時刻を "YYYY-MM-DD HH:MM:SS" で(日付は繰り上げない=映像は数十秒)。 */
export const formatCctvClock = (startSec: number, elapsedMs: number, date: string = CCTV_DATE): string => {
  const t = ((Math.floor(startSec + Math.max(0, elapsedMs) / 1000) % 86400) + 86400) % 86400;
  return `${date} ${pad2(Math.floor(t / 3600))}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
};

/** 終わり方の尺(プツン→残光→黒の置き)。skipped=タップで飛ばした時。 */
export const cctvEndingMs = (skipped: boolean): number =>
  CCTV_POWER_OFF_MS + CCTV_AFTERGLOW_MS + (skipped ? CCTV_BLACK_HOLD_SKIP_MS : CCTV_BLACK_HOLD_MS);

// §15 2相テレグラフ=追尾相の純関数層(パイロット: 城ボスsweep限定・PACING_PUZZLE.md §15)。
// 社長のゴール: 「予告を伸ばす代わりに追尾慣性を入れ、目視時間を+0.5秒しつつギリギリ感は保つ」。
// 裁定: Q1=(a)追いかけながら狙う / Q2=(a)中断は現行規則のまま(track相はwindupと同じく気絶で消える)。
//
// ★追尾の物理は stepLaserAim(mimirLaserTrack.ts)を共有し、**キャップはこの技専用**
// (監査A9: mimirLaserTrackCaps を触るとミーミルのレーザーの「反転が効く窓」が壊れる。
//  触手 glenReachTrackCaps と同じ「物理は共有・キャップだけ技ごと」の作法)。
// ★ランプ/振り切りは使わない(progress01=1固定+振り切り窓なし=監査A10: 既定MIMIR_OVERSHOOTは
//  3000ms前提の窓で、500msの追尾相に当てるとロックの瞬間に通り過ぎた位置で焼かれる)。
//  尺非依存=TELEGRAPH_TRACK_MS をいくら変えても追尾の質が変わらない(「後から伸ばすのは容易」)。
import { stepLaserAim, type MimirLaserAim, type OvershootConfig } from './mimirLaserTrack';

/** 追尾相の長さ(ms・atkUntil経由=ENEMY_ATTACK_SPEED_MULTで割られる点はwindupと同じ)。
 *  `?ttrack=<ms>` で実機調整・**0=track相に入らない**(完全ロールバック=§15-7条件4)。
 *  履歴: 500(v0.25.4075叩き台) → 1000(v0.25.4079・社長指示2026-08-30「もう0.5足して」)。 */
export const TELEGRAPH_TRACK_MS = (() => {
  if (typeof window === 'undefined') return 1000;
  const raw = new URLSearchParams(window.location.search).get('ttrack');
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 1000;
})();

/** sweep追尾のキャップ(叩き台)。基準歩速104.4の1.5倍/加速3倍=ミーミル基準系と同じ比率の固定値。
 *  (パイロットではプレイヤー実効速度スケールを入れない=決定的でテスト可能。全展開時に§15-2へ寄せる。) */
export const SWEEP_TRACK_MAX_PX_S = 157;
export const SWEEP_TRACK_ACCEL = 313;

/** 振り切り窓なし(from>=1で一度も発火しない)。到着減速は常時=臨界制動で振動しない。 */
const TRACK_NO_OVERSHOOT: OvershootConfig = { from: 1.01, to: 1.01, floor: 1 };

/** 追尾相の照準1tick(決定的・乱数なし)。dtSecは秒。 */
export const stepTrackAim = (
  aim: MimirLaserAim, tgtX: number, tgtY: number, dtSec: number,
): MimirLaserAim =>
  stepLaserAim(aim, tgtX, tgtY, dtSec, SWEEP_TRACK_MAX_PX_S, SWEEP_TRACK_ACCEL, 1, TRACK_NO_OVERSHOOT);

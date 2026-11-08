// ★格闘のステップの PC 入力(research/BRAWLER.md §12-3): 同じ方向キーの素早い2度押し。
// 数値はタッチの2連タップ(スケボーの判定と同じ値=VirtualJoystick の SKATER_* / pcPress の PC_SKATER_*)に揃える。
export const STEP_KEY_DOUBLETAP_MS = 300; // 1回目の離し→2回目の押下 までの許容間隔
export const STEP_KEY_TAP_MAX_MS = 220;   // 1回目を「短い押し」とみなす最大の押下時間

export interface StepKeyState { dir: string; downAt: number; upAt: number; wasTap: boolean }
/** 方向キーを押した(押しっぱなしの repeat は呼ばない)。2度押しなら true(=ステップ)。state は呼び手が持つ。 */
export const stepKeyDown = (st: StepKeyState | null, dir: string, now: number): { state: StepKeyState; step: boolean } => {
  const step = !!st && st.dir === dir && st.wasTap && st.upAt >= st.downAt && now - st.upAt <= STEP_KEY_DOUBLETAP_MS;
  // 押している間は upAt=-1(離した時に stepKeyUp が書く)。ステップになった押下は離しても「短い押し」にしない=3度押しで2回出さない。
  return { state: { dir, downAt: now, upAt: -1, wasTap: false }, step };
};
/** 方向キーを離した。 */
export const stepKeyUp = (st: StepKeyState | null, dir: string, now: number, stepped: boolean): StepKeyState | null => {
  if (!st || st.dir !== dir) return st;
  return { ...st, upAt: now, wasTap: !stepped && now - st.downAt < STEP_KEY_TAP_MAX_MS };
};

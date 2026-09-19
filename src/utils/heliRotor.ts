// 登場演出のヘリコプターのローター回転(社長素材2026-09-19・18コマ横並び)。
//
// ★社長の言葉: 「**最後の7コマが高速回転のループだと思う。そこまでのコマは回し始めと、
// 回し終わりの助走回転コマ**」。
//   - コマ 0〜10(11枚) = **助走**(止まっている状態から速度に乗るまで / その逆)
//   - コマ 11〜17(7枚) = **高速回転のループ**
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。描画は pixiScene が読むだけ。

/** 素材のコマ数(`public/sprites/helicopter-rotor.png` は 8000x234 の横一列)。 */
export const HELI_ROTOR_FRAMES = 18;
/** 高速回転のループに入る最初のコマ(=ここから最後までの7枚がループ)。 */
export const HELI_ROTOR_LOOP_FROM = 11;
/** 高速回転の1コマあたりの表示時間(ms)。7枚で約1周=84ms/周。 */
export const HELI_ROTOR_LOOP_MS = 12;
/** 助走(止まり→高速 / 高速→止まり)にかける時間(ms)。 */
export const HELI_ROTOR_SPINUP_MS = 900;

export type HeliRotorPhase = 'spin-up' | 'loop' | 'spin-down';

/**
 * 経過msから表示するコマ番号(0..17)を返す。
 *
 * - `loop`: 最後の7枚だけを回し続ける。
 * - `spin-up`: 助走の11枚を**加速しながら**通り、終わったらループの先頭へ。
 *   ★等間隔で送らない(CLAUDE.md「動きの絶対ルール: 慣性」。回り始めは遅く、だんだん速く)。
 * - `spin-down`: `spin-up` の逆順(高速→止まり)。
 */
export const heliRotorFrame = (elapsedMs: number, phase: HeliRotorPhase = 'loop'): number => {
  const t = Math.max(0, elapsedMs);
  if (phase === 'loop') {
    const span = HELI_ROTOR_FRAMES - HELI_ROTOR_LOOP_FROM;
    return HELI_ROTOR_LOOP_FROM + (Math.floor(t / HELI_ROTOR_LOOP_MS) % span);
  }
  const u = Math.min(1, t / HELI_ROTOR_SPINUP_MS);
  // 加速のカーブ(easeInQuad)。0→1 を助走コマの 0→10 に写す。
  const eased = phase === 'spin-up' ? u * u : 1 - (1 - u) * (1 - u);
  const idx = Math.round(eased * (HELI_ROTOR_LOOP_FROM - 1));
  return phase === 'spin-up' ? idx : (HELI_ROTOR_LOOP_FROM - 1) - idx;
};

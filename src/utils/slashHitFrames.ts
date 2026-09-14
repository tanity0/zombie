// 通常斬撃ヒット炸裂(社長支給35コマ・v0.25.4322)のコマ送り。
// 爆発(6コマ)と同じ作法だが、コマ数と尺をここ1箇所で持つ(描画と store が同じ値を引く)。

/** 素材のコマ数。`public/sprites/fx/slash-hit-00.png` 〜 `-34.png`。 */
export const SLASH_HIT_FRAMES = 35;
/** 既定の尺(ms)。35コマを 0.5秒=70コマ/秒相当で送る(速い方が打撃に見える)。 */
export const SLASH_HIT_MS = 500;

/** 経過(0..1)→ コマ番号。最後のコマで止めて、尺を過ぎても溢れない。 */
export const slashHitFrame = (t: number): number =>
  Math.min(SLASH_HIT_FRAMES - 1, Math.max(0, Math.floor(t * SLASH_HIT_FRAMES)));

/** テクスチャ名(0埋め2桁)。 */
export const slashHitTexture = (frame: number): string =>
  `fx/slash-hit-${String(Math.min(SLASH_HIT_FRAMES - 1, Math.max(0, frame))).padStart(2, '0')}`;

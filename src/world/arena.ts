// 円形アリーナ(囲い系イベント)の閉じ込めコリジョン。
// 既存の障害物は矩形 AABB(resolveAabb)のみだったが、囲いイベントは「円の内側へ拘束」する
// ため、円コリジョン専用の最小ヘルパをここに新設する。
// ★レンダラ非依存(PixiJS を import しないこと)。CLAUDE.md の "World data は renderer-agnostic"。

export interface Circle { x: number; y: number; radius: number; }

// rect(プレイヤーの当たり矩形)の中心を、中心 (c.x,c.y)・半径 c.radius の円の内側へクランプする。
// 矩形が円から大きくはみ出さないよう、有効半径から矩形の外接半分を差し引く(inset)。
// 既に内側なら位置を変えない(= 円の縁にだけ効く軽量クランプ)。
export const clampRectInsideCircle = (
  rect: { x: number; y: number; width: number; height: number },
  c: Circle,
): { x: number; y: number } => {
  const rcx = rect.x + rect.width / 2;
  const rcy = rect.y + rect.height / 2;
  const dx = rcx - c.x;
  const dy = rcy - c.y;
  const d = Math.hypot(dx, dy);
  const inset = Math.max(0, c.radius - Math.max(rect.width, rect.height) / 2);
  if (d <= inset || d < 0.0001) return { x: rect.x, y: rect.y };
  const k = inset / d;
  return { x: c.x + dx * k - rect.width / 2, y: c.y + dy * k - rect.height / 2 };
};

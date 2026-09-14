// 台本の拍の種類(依存ゼロの葉モジュール)。impactBurst.ts と gameStore の配線が同じ1本を引く。
export type ImpactBurstKind =
  | 'flash'       // 接触点の白熱(局所の光。画面全体ではない)
  | 'slashBurst'  // 斬りの帯(刃の走った向き)
  | 'shock'       // 衝撃の輪(地面に沿って広がる)
  | 'spark'       // 火花(速度方向に伸びる粒)
  | 'debris'      // 破片(回って落ちて着地する)
  | 'smoke'       // 土煙(足元から上へ)
  | 'stain';      // 地面に残る跡(消える光より残る染み)

// 手榴弾(heavy-grenade)の基礎仕様。旧は useGameLoop.ts のローカルconstだったが、idolの手榴弾技
// (社長指示v0.25.3442「プレイヤーの手榴弾と同じ仕様」)で idolTick / idolScript / pixiScene からも
// 同じ値を読むため、依存ゼロの葉モジュールへ移動(v0.25.3390の循環import事故の再発防止ルール)。
// 値は移動のみ=不変。転がり物理(バウンド0.86/減速1.45/下限24)は gameStore.ts 側が正。
export const HEAVY_GRENADE_FUSE_MS = 2000; // 信管: 投げてから爆発まで
export const HEAVY_GRENADE_RADIUS = 66;    // 爆発半径(敵手榴弾の赤円=この値と厳密一致させること)
export const HEAVY_GRENADE_DAMAGE = 42;    // 基礎ダメージ(減衰式 0.55+0.45×falloff は呼び出し側)
export const HEAVY_GRENADE_SPEED = 118;    // 投擲初速(px/s)

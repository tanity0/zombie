/**
 * 近接のタップの振りに「斬撃の弧」(弧の7コマ・振り抜きの弧・残光)を出すか。
 * 刀/村雨を持っている時はタップで敵を攻撃しない(開くのはカウンターの受付だけ)ので、
 * 振りの絵から斬撃の弧を外す(社長指示2026-11-22「刀のタップの振りの絵から、斬撃の絵を無くしたい」)。
 * 武器の実絵・体のポーズは対象外(弧だけ)。描画の判定のみ=判定・カウンター・SE には関わらない。
 * プレイヤー本人と守護霊(計測時ビルドの subWeapons)で同じ式を使う。
 */
export const meleeTapArcVisible = (subWeapons: readonly string[] | undefined): boolean =>
  !(subWeapons?.includes('katana') || subWeapons?.includes('murasame'));

// プレイヤー立ち絵(歩き/走り)の「コマ並び」だけを持つ純データ。PixiJS を import しないので
// ユニットテストから素材(public/sprites)と突き合わせられる。
//
// **なぜ切り出したか(v0.25.2316の実バグ)**: テクスチャ名は `${prefix}-${frame}` で組み立て、
// drawPlayer は `getTexture(name) ?? getTexture('player')` でフォールバックする。つまり
// **シートに実在しないコマ番号を並びに入れると、その瞬間だけ既定スキン(player.png)が描かれる**。
// 武将立ち絵は3コマしか無いのにクラス絵の5コマ用の並び([0,1,2,3,4,3,2,1])をそのまま渡していたため、
// 歩行1周期の8スロット中3スロット(frame 3/4/3)が既定スキンに化けていた。
// → 並びは必ずここに置き、`playerWalkSheets.test.ts` が「並びの最大コマ番号 < 実在コマ数」を機械的に守る。

/** 5コマ立ち絵(全4クラス)の歩き: 端(0,4)を重複させずに往復してループ=滑らかな折り返し。 */
export const WALK_SEQ_5: readonly number[] = [0, 1, 2, 3, 4, 3, 2, 1];
/** 立ち絵が2コマしか無い場合の既定(不明クラス等)。 */
export const WALK_SEQ_2: readonly number[] = [0, 1];
/** 武将立ち絵(3コマ: 0=接地A / 1=中割り / 2=接地B)の歩き。5コマ勢と同じ「端を重複させない往復」。 */
export const WALK_SEQ_WARLORD: readonly number[] = [0, 1, 2, 1];
/** 走り5コマ(マークスマン/ストライカー/スカベンジャー)= 前方ループ(折り返さない)。 */
export const RUN_SEQ_5: readonly number[] = [0, 1, 2, 3, 4];
/** 走り6コマ(ヘビーガンナー)= 前方ループ。 */
export const RUN_SEQ_6: readonly number[] = [0, 1, 2, 3, 4, 5];

/**
 * テクスチャ名の接頭辞 → その接頭辞で引かれるコマ並び。
 * テストが `public/sprites/<prefix>-<n>.png` の実在数と突き合わせるための台帳。
 * ここに載っていない並びを pixiScene 側で直書きしない(直書きすると検査から漏れる)。
 */
export const WALK_SHEET_SEQUENCES: ReadonlyArray<{ prefix: string; sequence: readonly number[] }> = [
  { prefix: 'player-magnum-walk', sequence: WALK_SEQ_5 },
  { prefix: 'player-shotgun-walk', sequence: WALK_SEQ_5 },
  { prefix: 'player-striker-walk', sequence: WALK_SEQ_5 },
  { prefix: 'player-scavenger-walk', sequence: WALK_SEQ_5 },
  { prefix: 'player-magnum-run', sequence: RUN_SEQ_5 },
  { prefix: 'player-striker-run', sequence: RUN_SEQ_5 },
  { prefix: 'player-scavenger-run', sequence: RUN_SEQ_5 },
  { prefix: 'player-shotgun-run', sequence: RUN_SEQ_6 },
  // 武将セット(特殊3点)フル装備の立ち絵。小烏丸ありは刀(赤)・無しは銃(青)の**別シート**
  // (tintではない)。どちらも3コマなので同じ並びを使う。
  { prefix: 'player-warlord-gun-walk', sequence: WALK_SEQ_WARLORD },
  { prefix: 'player-warlord-katana-walk', sequence: WALK_SEQ_WARLORD },
];

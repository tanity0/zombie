// ★プレイヤーの体の各コマの「頭の位置」台帳(社長指示2026-10-26「このアバターの位置取りについて、今後も流用するので
// 覚えておいて。毎回アバターごとにずれると面倒なので」)。
//
// アバター(耳・帽子・髪飾り…)は全部この台帳の頭に付く=**アバターを足す時に位置合わせは要らない**
// (台帳 src/data/avatars.ts の offsetXFrac/offsetYFrac は「待機絵の頭」からの置き方だけを決める)。
//  - x = 頭の中心の横位置(絵の横中心から・右向きの絵で右=正・art px)
//  - y = 頭頂の高さ(足元=絵の下端から上へ・art px)
//  - 値は `node scripts/avatar-head-anchors.mjs --write` が、待機絵の頭を手本にしたテンプレート照合で出す
//    (「絵の一番上の点」は使わない=振り上げた拳・銃・刀を頭と取り違えない。旧方式はヘビーガンナー/マークスマンの
//    振りとマークスマンの走りでずれた・v0.25.5218)。同じスクリプトが確認用の画(各コマに頭の印)を出すので、
//    **体の絵を差し替えた/コマを足した時は回して、画を目で見る**。違っていたら値を直して `manual: true` を付ける
//    (スクリプトは manual の行を上書きしない)。
//  - 台帳に無いコマは従来の自動計測(pixiTextures の頭頂計測)へ落ちる。
export interface PlayerHeadAnchor { x: number; y: number; manual?: boolean }

export const PLAYER_HEAD_ANCHORS: Readonly<Record<string, PlayerHeadAnchor>> = {
  'player-magnum-idle': { x: 0, y: 63 },
  'player-magnum-melee-ready': { x: 2, y: 49 },
  'player-magnum-melee-swing': { x: 0, y: 57 },
  'player-magnum-run-0': { x: 1, y: 62 },
  'player-magnum-run-1': { x: 1, y: 61 },
  'player-magnum-run-2': { x: 0, y: 62 },
  'player-magnum-run-3': { x: 1, y: 61 },
  'player-magnum-run-4': { x: 1, y: 62 },
  'player-magnum-run-5': { x: 0, y: 60 },
  'player-magnum-walk-0': { x: 0, y: 63 },
  'player-magnum-walk-1': { x: 0, y: 65 },
  'player-magnum-walk-2': { x: 0, y: 64 },
  'player-magnum-walk-3': { x: 0, y: 63 },
  'player-magnum-walk-4': { x: 0, y: 64 },
  'player-magnum-walk-5': { x: 0, y: 65 },
  'player-shotgun-idle': { x: 0, y: 64 },
  'player-shotgun-melee-ready': { x: 7, y: 49 },
  'player-shotgun-melee-swing': { x: 5, y: 58 },
  'player-shotgun-run-0': { x: 1, y: 61 },
  'player-shotgun-run-1': { x: 2, y: 62 },
  'player-shotgun-run-2': { x: 1, y: 64 },
  'player-shotgun-run-3': { x: 1, y: 61 },
  'player-shotgun-run-4': { x: 2, y: 62 },
  'player-shotgun-run-5': { x: 1, y: 63 },
  'player-shotgun-walk-0': { x: 4, y: 63 },
  'player-shotgun-walk-1': { x: 3, y: 64 },
  'player-shotgun-walk-2': { x: 3, y: 64 },
  'player-shotgun-walk-3': { x: 3, y: 63 },
  'player-shotgun-walk-4': { x: 3, y: 64 },
  'player-shotgun-walk-5': { x: 3, y: 64 },
  'player-striker-idle': { x: 0, y: 64 },
  'player-striker-melee-ready': { x: 9, y: 47 },
  'player-striker-melee-swing': { x: 5, y: 59 },
  'player-striker-run-0': { x: 1, y: 61 },
  'player-striker-run-1': { x: 1, y: 60 },
  'player-striker-run-2': { x: 1, y: 63 },
  'player-striker-run-3': { x: 1, y: 61 },
  'player-striker-run-4': { x: 1, y: 61 },
  'player-striker-run-5': { x: 1, y: 63 },
  'player-striker-walk-0': { x: 0, y: 63 },
  'player-striker-walk-1': { x: 0, y: 64 },
  'player-striker-walk-2': { x: 0, y: 64 },
  'player-striker-walk-3': { x: -1, y: 63 },
  'player-striker-walk-4': { x: 0, y: 64 },
  'player-striker-walk-5': { x: 0, y: 64 },
  'player-scavenger-idle': { x: 0, y: 64 },
  'player-scavenger-melee-ready': { x: 0, y: 48 },
  'player-scavenger-melee-swing': { x: 2, y: 62 },
  'player-scavenger-run-0': { x: 0, y: 62 },
  'player-scavenger-run-1': { x: -1, y: 63 },
  'player-scavenger-run-2': { x: -1, y: 64 },
  'player-scavenger-run-3': { x: 0, y: 62 },
  'player-scavenger-run-4': { x: -1, y: 64 },
  'player-scavenger-run-5': { x: -1, y: 64 },
  'player-scavenger-walk-0': { x: 0, y: 63 },
  'player-scavenger-walk-1': { x: 0, y: 64 },
  'player-scavenger-walk-2': { x: 0, y: 64 },
  'player-scavenger-walk-3': { x: 0, y: 63 },
  'player-scavenger-walk-4': { x: 0, y: 64 },
  'player-scavenger-walk-5': { x: 0, y: 64 },
  'player-warlord-gun-walk-0': { x: -9.5, y: 108 },
  'player-warlord-gun-walk-1': { x: -11.5, y: 107 },
  'player-warlord-gun-walk-2': { x: -12.5, y: 107 },
  'player-warlord-katana-walk-0': { x: 19, y: 108 },
  'player-warlord-katana-walk-1': { x: 19, y: 108 },
  'player-warlord-katana-walk-2': { x: 19, y: 108 },
};

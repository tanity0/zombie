# originals — 社長から受領した元素材の倉庫(配信されない・加工の起点は常にここ)

クラス名とゲーム内ファイル名の対応(歴史的に反転しているので注意):
| フォルダ(クラス名) | ゲーム内ファイル(public/sprites/) |
|---|---|
| heavy-gunner(ヘビーガンナー) | player-shotgun-* |
| marksman(マークスマン) | player-magnum-* |
| striker(ストライカー) | player-scavenger-* |
| scavenger(スカベンジャー) | player-striker-* |

- 受領記録は DEVELOPMENT_LOG.md を参照。加工は「標準LANCZOS縮小のみ」(PACING_PUZZLE.md §5.9)。

## 受領メモ
- heavy-gunner: idle.png + walk-sheet.png(v0.25.1452受領)。
- striker: walk-sheet.png のみ(v0.25.1453受領・社長確認済み)。**2コマ目(index=1)が
  ストップ絵を兼任**(専用idleなし・社長指定)。
- marksman: walk-sheet.png のみ(v0.25.1454受領)。**2コマ目(index=1)がストップ絵を兼任**(社長指定)。
- scavenger: walk-sheet.png + stop-purplebg.jpeg(v0.25.1455受領)。ストップ絵は**JPEG・紫背景**
  なのでキー抜きが必要(v6と同手順)。PNG透過版が見つかれば差し替え推奨。

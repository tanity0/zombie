# Test Bridge(P0-1)の実機確認 — 2026-09-17

`c2995e55`「テストブリッジ(?testbridge=1)」の着地確認。**判定はしない**(分析・裁定は設計チャット)。

## 0. 条件
| 項目 | 値 |
|---|---|
| 版 | **v0.25.4435**(`gitCommit=c2995e55`。**Bridge が自分で返した値**) |
| サーバ | **`vite preview` 4173(本番ビルド)** ← ここで読めることが目的 |
| URL | `http://localhost:4173/zombie/?smoke=1&autotut=1&testbridge=1&bot=standard&botskill=casual&stage=stage-1` |
| ランナー | `TEST_HANDOFF/run-observe.mjs`(`OBSERVE_BASE` で 4173 を指す) |
| 走行 | headed 実Chrome・1280x800・3分 |

## 1. ★結果: **preview で状態が読めた**
ランナーの状態源が **`bridge`**(従来は dev の `gameStore` のみ)。発注した項目が全部埋まっている。

```
buildVersion = "0.25.4435"     gitCommit = "c2995e55"      stageId = "stage-1"
screenId = "gameplay"          gameTime = 149606           isPaused = false
pauseReason = null             playerAlive = true          health = 27      level = 3
botPersona = "standard"        botSkill = "casual"         botGoal = "none"
enemyCount = 10                bossTypes = []              resultState = null
deathCause = null              botReportReady = false
lastProgressAt = 1789640364526 lastSignificantEventAt = 1789640352136
```

- `lastProgressAt` と `lastSignificantEventAt` に **12.4秒の差**があり、2つが別々に動いていることを確認。
- ランナー側の名前の翻訳(`screenId`→`screen` / `botReportReady`→`botReport`)も効いており、
  **preview でイベント検知が成立**した(下記21件)。

## 2. 観測したイベント(21件・抜粋)
```
 gameplayStarted / maxEnemies 同時3→6→9体 / levelUp Lv1→Lv2(71s)
 damageTaken ×11(130 → 27 まで)/ levelUp Lv2→Lv3(132s)/ timeout(181s)
```
3分で死亡に至らず時間切れ(`endedReason=timeLimit`)。**これは異常ではない**(ボットが生き残っただけ)。

## 3. ★consoleエラー 1件(本番ビルドで発生)
実47秒。**`?testbridge=1` とは無関係の描画経路**。

```
[PixiStage] sync error (suppressed after first): TypeError: Cannot read properties of null (reading 'set')
    at v (bootstrap-VaQ1m7un.js:1337:258029)
    at jt.drawRim   (…:258263)
    at jt.syncRimLights (…:256755)
    at jt.sync      (…:111844)
    at oF.T [as _fn] (…:542822)
    at oF.emit      (…)
```
- 該当は `src/pixi/pixiScene.ts` の **`syncRimLights`(16854行)→ `drawRim`(16925行)**。
  `sync`(9069行)から毎フレーム呼ばれる経路。
- 「suppressed after first」なので**1回だけ記録され、以降は握り潰されている**。実際に何回起きたかは不明。
- **ゲームは止まらず、3分間そのまま進んだ**(gameTime 149.6秒・被弾も発生)。
- 原因調査はしていない(テストチャットの担当外)。**事実のみ記録。**

## 4. 成果物
- `20260917-1016-observe-smoke.json` — Run Manifest(条件・イベント21件・consoleエラー全文・Bridgeの戻り値)
- `20260917-1016-smoke-timeout.png` — 終了時の画面(候補4枚のうち1枚だけ残した。残りは一時領域)

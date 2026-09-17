# 発注: レビュー精度向上 P0 のうち **src/ 側** の実装(2026-09-17・テストチャット → 設計チャット)

出どころ: 社長から渡された `2026-09-17_the_one_ai_review_accuracy_dev_requirements.md` の **P0-1〜P0-5**。
そのうち **`src/` を触るものだけ**をここに書く(テストチャットは `TEST_HANDOFF/` しか触らないため)。

**TEST_HANDOFF 側は着地済み**: `TEST_HANDOFF/run-observe.mjs`(P0-3 Run Manifest / P0-4 イベント連動キャプチャ /
P0-5 のランナー部)。**開発サーバ(5173)では既に動いている**。下の4件が入ると preview でも動き、精度が上がる。

> **並行開発の注意(社長指示2026-09-17)**: 裏で雑魚敵の行動AI強化が進行中。取り合うのは
> `package.json` / `src/data/changelog.ts` / `DEVELOPMENT_LOG.md` の3つだけ。こちらはそこを触っていない。

---

## A. P0-1 Local Test Bridge(preview でも状態を読めるようにする)

### 何が問題か
状態の読み取り口 `window.__gameStore` は `src/store/gameStore.ts` の **`import.meta.env.DEV` ゲート**で、
**開発サーバ(5173)にしか生えない**。本番ビルド(`vite preview` 4173)では読めないので、
「停滞」「死亡後の停止」「商人画面」「進行中」を区別できず、**preview のランは事実上スクショだけ**になる。

### 先例(そのまま流用できる)
`src/hooks/useGameLoop.ts` の **`__BOT_SAMPLE__`** は `DEV_LOADOUT_ACTIVE`(URLツマミ由来のゲート・
`src/utils/devTestKnobs.ts`)で生えるので、**本番ビルドでもツマミを付けた時だけ**露出する。
**同じ作法**で `__TEST_BRIDGE__` を1つ足すのが最短(新しい窓口の増設ではなく、既存の型の踏襲)。

### 仕様(要件書の最低限セットに合わせる)
```ts
window.__TEST_BRIDGE__ = {
  read(): {
    buildVersion, gitCommit,
    stageId, screenId,                  // screenId は title/updateModal/opsRoom/stagePick/briefing/charSelect/gameplay/result
    gameTime, isPaused, pauseReason,    // ★pauseReason は現状どこにも無い(下記)
    showShopMenu, showEventQuestMenu, showUpgradeMenu, tutorialPopup,
    playerAlive, health, level, x, y,
    botPersona, botSkill, botGoal,
    enemyCount, bossTypes,
    resultState, deathCause, botReportReady,
    lastProgressAt, lastSignificantEventAt,
  },
  closeBlockingMenu(): void,            // ★書き込みはこれ1つだけ
}
```
- **ゲートは `?testbridge=1`(または既存ツマミのどれか)**。無指定では**何も定義しない**=本番で常時露出しない。
- **書き込みは `closeBlockingMenu()` だけ。** 移動・攻撃・数値変更の口は作らない(要件書の指示どおり)。
- **`pauseReason`**: 今は `isPaused: true` を立てている箇所が複数あり(`gameStore.ts` 内に少なくとも5箇所)、
  **外から理由を区別できない**。ここが「固まった」と「仕様どおり止まっている」を取り違える主因なので、
  `isPaused` を立てる時に理由文字列を一緒に持たせてほしい(例: `tutorial` / `upgrade` / `shop` / `eventQuest` / `result`)。

### 受け入れ条件
- `?testbridge=1` を付けた **preview(4173)** で `__TEST_BRIDGE__.read()` が上の形を返す。
- **無指定の本番ビルドでは `window.__TEST_BRIDGE__` が `undefined`**。
- ゲーム挙動は一切変わらない(読み取り専用+既存の閉じる操作のみ)。

---

## B. P0-2 Structured Event Timeline(src/ でしか出せないイベント)

### 外から取れている分(これは実装不要)
`run-observe.mjs` が**状態のポーリング差分**で既に出している:
`boot / gameplayStarted / damageTaken / levelUp / bossSpawn / maxEnemies / shopOpened / death / clear /
timeout / stall60s / consoleError / pageError`。

### 外からは取れない分(**ここだけ発注**)
差分観測では原理的に拾えない短命イベント。1秒ポーリングの隙間で消える。

| イベント | なぜ外から取れないか |
|---|---|
| `dodge` | 回避の成立は状態に残らない(フレーム内で消える) |
| `counter` | 同上。成功/失敗/窓の開閉が区別できない |
| `skillUsed` | サブウェポン発動は残らない |
| `upgradeOptions` / `upgradeSelected` | 選択画面は**ボットが即閉じる**ので、開いた事実も選んだ中身も観測できない |
| `enemySpawn` | 湧きの瞬間(数だけは見えるが、どの型がいつ湧いたかが消える) |
| `bossDefeated` | 消滅としか見えない(撃破か退去かが区別できない) |
| `paused` / `resumed` | 理由つきで残らない(A の `pauseReason` と同根) |

### 仕様
- 1ランぶんを**配列 or JSON Lines** で溜め、`window.__TEST_EVENTS__`(または Bridge の `readEvents()`)で読めるようにする。
- 各件に **`realTime` / `gameTime` / `eventType` / 主要値 / `seed`**。
- **ゲートは A と同じ**(無指定では溜めない=本番で常時コストを払わない)。
- 上限を決めて捨てる(例: 5000件でリングバッファ)。**溜め続けてメモリを食わない**こと。

---

## C. P0-3 の seed(src/ 側だけ未着手)

### 現状
`src/hooks/useGameLoop.ts` の `botRandRef` は **`mulberry32(1)` のベタ書き**で、
**レベルアップ自動選択の乱数しか固定されていない**。敵の湧き・AI・ドロップの乱数は別系統で、URLから指定する口が無い。

### 仕様
- **`?seed=<整数>`** を受け、ランの乱数系を初期化する。
- **実際に使われた seed を読み取れるようにする**(Bridge の `read()` か `__TEST_EVENTS__` のヘッダ)。
  指定が無い時は**生成した値を返す**(=後から同じランを再現できる)。
- どの系統を seed 配下に入れたかを1行で書き残してほしい(**全部入るとは限らないはず**なので、
  「入っている系統/入っていない系統」が分かれば、こちらは再現性の範囲を正しく報告できる)。

### なぜ要るか
広告候補のA/B、版どうしの比較、雑魚AI強化の前後比較が、**現状は同条件で撮り直せない**。

---

## D. P0-5 の `data-testid`(★これが無いと初見導線の計測が成立しないことを実測した)

### 実測でわかったこと(2026-09-17・v0.25.4427・dev 5173)
`smoke=1` を使わずタイトルから実クリックで出撃する **First-run Observation Mode を4回試して、全部失敗した**。
原因は**文言と実装の当て方が安定しないこと**で、こちらの実装の粗さだけではない。

| 試した当て方 | 結果 |
|---|---|
| `button/[role=button]/a/div/span` の textContent | 更新情報の本文を抱えた**祖先要素**を掴んで空振り |
| 押せる要素に限定+**最短の文字列**を選ぶ | タイトルの入口が見つからない |
| textContent → **aria-label** → title の順で拾う | 同上 |
| 可視判定を `offsetParent` → **矩形**へ(fixed対策) | 同上 |

**実際に採取できた事実**(停滞時の `finalState.buttons`):
```
["v0.25.4427STARTCAMERANEWS", "CAMERA", "NEWS"]
```
タイトルの入口は **`START` という文字列を含む親要素の中**にあり、**単独の押せる要素になっていない**。
一方、アプリ内ブラウザで同じ画面を開いた時は **`button "タップして開始"`**(aria-label)が見えた。
**文脈によって入口の名前が変わる**ので、**文言ベースの当て方では安定しない**。

### 発注
要件書 P0-5 の「UI要素へ安定した `data-testid` を付ける」を、**下の7箇所だけ**でよいので実施してほしい。

| 画面 | 押す物 | 提案する `data-testid` |
|---|---|---|
| 更新情報モーダル | OK | `testid="changelog-ok"` |
| タイトル | 開始 | `testid="title-start"` |
| オープニング | スキップ | `testid="opening-skip"` |
| OPERATIONS ROOM | 出 撃 | `testid="ops-sortie"` |
| 作戦地域の一覧 | 各ステージのカード | `testid="stage-card-<stageId>"` |
| ブリーフィング | ジョブ選択 | `testid="briefing-jobselect"` |
| ジョブ選択 | スタート | `testid="charselect-start"` |

- **見た目・レイアウトは変えない**(属性を足すだけ)。
- 付いたら `run-observe.mjs` の firstrun を `data-testid` ベースへ切り替える(こちらの作業)。
- ついでに **各画面に `data-screen="<screenId>"`** が付くと、A の `screenId` がそのまま取れる。

---

## 優先順位(要件書の実装順そのまま)
1. **A(Test Bridge)** — これが無いと preview のランが観測不能のまま
2. **B(Event Timeline)** — 回避/カウンター/強化選択は外から取れない
3. **C(seed)** — A/B比較と版比較の前提
4. **D(data-testid)** — 初見導線を測るなら必須。**無い間 P0-5 は保留**

## テスト側の状態
- **P0-3 Run Manifest / P0-4 イベント連動キャプチャ: 実装済み・実走で確認済み**
  (`gameplayStarted` / `maxEnemies` / `damageTaken` / `firstLevelUp` / `bossSpawn` / `timeout` が発火し、
  候補を一時領域へ撮って **最大5枚だけ** `results/` へ移す動作まで確認)。
- **P0-5: 保留**(上のD待ち)。ランナー側の骨組みは入っているので、`data-testid` が付けば繋ぐだけ。
- `run-observe.mjs` は **`__TEST_BRIDGE__` があればそちらを優先**する作りなので、A が入れば**こちらの修正なしで** preview でも動く。

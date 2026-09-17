# 発注: レビュー精度向上 P0 のうち **src/ 側** の実装(2026-09-17・テストチャット → 設計チャット)

出どころ: 社長から渡された `2026-09-17_the_one_ai_review_accuracy_dev_requirements.md` の **P0-1〜P0-5**。
そのうち **`src/` を触るものだけ**をここに書く(テストチャットは `TEST_HANDOFF/` しか触らないため)。

**TEST_HANDOFF 側は着地済み**: `TEST_HANDOFF/run-observe.mjs`(P0-3 Run Manifest / P0-4 イベント連動キャプチャ /
**P0-5 First-run Observation Mode**)。**開発サーバ(5173)で実走確認済み**
(証拠: `results/20260917-0724-observe-firstrun.json` ほか)。下の A〜C が入ると preview でも動き、精度が上がる。

> **並行開発の注意(社長指示2026-09-17)**: 裏で雑魚敵の行動AI強化が進行中。
> **こちらは `src/` を1バイトも触っていない**。ただし下の A・B・C は `src/hooks/useGameLoop.ts` と
> `src/store/gameStore.ts` に手を入れる必要があり、**雑魚AI強化と同じファイル**。
> 「取り合うのは `package.json` / `changelog.ts` / `DEVELOPMENT_LOG.md` の3つだけ」は
> **こちら(テストチャット)との関係の話**であって、この発注を実装する時は当てはまらない。
> **着手のタイミングは雑魚AI強化との兼ね合いで設計チャットが決めてほしい。**

---

## A. P0-1 Local Test Bridge(preview でも状態を読めるようにする)

### 何が問題か
状態の読み取り口 `window.__gameStore` は `src/store/gameStore.ts` の **`import.meta.env.DEV` ゲート**で、
**開発サーバ(5173)にしか生えない**。本番ビルド(`vite preview` 4173)では読めないので、
「停滞」「死亡後の停止」「商人画面」「進行中」を区別できず、**preview のランは事実上スクショだけ**になる。

### ★ゲートの作り方は社長裁定が要る(2案)
社長の言葉は **「本番公開では無効になるローカルテスト限定機能」**。要件書も「本番配信では無効にする」。
**既存の `__BOT_SAMPLE__` 方式(URLツマミ `?weapon=`/`?sub=` で生える)は、この条件を満たさない**——
コードは本番バンドルに残り、公開 Pages でもクエリを付ければ露出する。

| 案 | 中身 | 本番公開での露出 |
|---|---|---|
| **①ビルド時 define(推薦)** | `vite.config.ts` の `define` に `__TEST_BRIDGE_ENABLED__` を足し、**ローカル用のビルドでだけ true**。false 側はコードごと落ちる(tree-shake) | **無し**(バンドルに存在しない) |
| ②URLツマミ | `?testbridge=1` で生やす。`__BOT_SAMPLE__` と同じ作法 | クエリを付ければ**露出する** |

**推薦は①。** 社長の言葉が「本番公開では無効」なので、露出の余地を残さない方が合う。
なお **既存の `__BOT_SAMPLE__` は②の形**(`useGameLoop.ts` の `DEV_LOADOUT_ACTIVE` ゲート)である、
という事実だけ併記する(前例に合わせるなら②)。**どちらにするかは社長が決める。**

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
- **書き込みは `closeBlockingMenu()` だけ。** 移動・攻撃・数値変更の口は作らない(要件書の指示どおり)。
- **`pauseReason`**: 今は `isPaused: true` を立てている箇所が **7箇所**
  (`gameStore.ts` 5・`useGameLoop.ts` 1・`playtestDriver.ts` 1)あり、**外から理由を区別できない**。
  ここが「固まった」と「仕様どおり止まっている」を取り違える主因なので、
  `isPaused` を立てる時に理由文字列を一緒に持たせてほしい(例: `tutorial` / `upgrade` / `shop` / `eventQuest` / `result`)。
- **`gitCommit`**: `vite.config.ts` の `define` に commit は**無い**。`__GIT_COMMIT__` を足す指示が要る
  (`execSync('git rev-parse --short HEAD')` の結果を define する。無ければ `null` で可)。
- **`lastSignificantEventAt` の定義**(要件書が語を決めていないので、こちらの提案):
  **プレイヤーのHPが減った / レベルが上がった / ボスが出た・消えた / 結果画面に入った** のいずれかが起きた時刻。
  「敵が1体湧いた」「弾が出た」は含めない(停滞の判定に使うので、**止まっていても動くもの**を入れない)。
  この定義でよいかは設計チャットの判断。

### 受け入れ条件
- ローカル用ビルドの **preview(4173)** で `__TEST_BRIDGE__.read()` が上の形を返す。
- **公開ビルドでは `window.__TEST_BRIDGE__` が `undefined`**(案①なら定義ごと存在しない)。
- ゲーム挙動は一切変わらない(読み取り専用+既存の閉じる操作のみ)。

---

## B. P0-2 Structured Event Timeline(src/ でしか出せないイベント)

### 外から取れている分(これは実装不要)
`run-observe.mjs` が**状態のポーリング差分**で既に出している:
`boot / sortieStarted / gameplayStarted / damageTaken / levelUp / bossSpawn / maxEnemies / shopOpened /
death / clear / timeout / stall60s / consoleError / pageError`。

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
- 各件に **`realTime`(絶対時刻)/ `gameTime` / `eventType` / 主要値 / `seed`**。
- **ゲートは A と同じ**(無効なら溜めない=本番でコストを払わない)。
- 上限を決めて捨てる(例: 5000件でリングバッファ)。**溜め続けてメモリを食わない**こと。

---

## C. P0-3 の seed(src/ 側だけ未着手)

### 現状
`src/hooks/useGameLoop.ts:1823` の `botRandRef` は **`mulberry32(1)` のベタ書き**で、
**レベルアップ自動選択の乱数しか固定されていない**。URLから指定する口は無い。
**敵の湧き・AI・ドロップがどの乱数系を使っているかは、こちらでは特定できていない**(要調査)。

### 仕様
- **`?seed=<整数>`** を受け、ランの乱数系を初期化する。
- **実際に使われた seed を読み取れるようにする**(A の `read()` か `__TEST_EVENTS__` のヘッダ)。
  指定が無い時は**生成した値を返す**(=後から同じランを再現できる)。
- どの系統を seed 配下に入れたかを1行で書き残してほしい(**全部入るとは限らないはず**なので、
  「入っている系統/入っていない系統」が分かれば、こちらは再現性の範囲を正しく報告できる)。

### なぜ要るか
広告候補のA/B、版どうしの比較、雑魚AI強化の前後比較が、**現状は同条件で撮り直せない**。

---

## D. P0-5 の `data-testid`(**あると壊れにくい。ただし今は無くても動く**)

### 状況(2026-09-17・v0.25.4427・dev 5173 で実走確認)
**`smoke=1` を使わない初見導線は、いま通っている。** 7ステップを実クリックで通過し、
**24秒で出撃・25秒でゲーム開始**まで到達した(`results/20260917-0724-observe-firstrun.json`)。

| 順 | 画面 | 押す物 | 実装上の名前の出どころ |
|---|---|---|---|
| 1 | 更新情報モーダル | OK | textContent |
| 2 | タイトル | 開始 | **ルートdiv全体が `role="button"` + `aria-label="タップして開始"`**(`TitleScreen.tsx`)。textContent は `v0.25.xxxxSTARTCAMERANEWS` |
| 3 | オープニング | スキップ | textContent |
| 4 | OPERATIONS ROOM | 出 撃 | textContent(**間に空白**) |
| 5 | 作戦地域の一覧 | ステージのカード | textContent(`捜索記録洞窟地帯MAIN座標捜索`) |
| 6 | ブリーフィング | ジョブ選択 | textContent |
| 7 | ジョブ選択 | スタート | textContent |

### それでも `data-testid` を推す理由(判断は設計チャット)
- **2は aria-label でしか名前を持たない**。こちらは「aria-label を先に見る」で通したが、
  **文言を1文字変えると黙って空振りする**(空振りしても画面は進まないだけなので、気づくのが遅れる)。
- **5はカード全体の textContent に依存**していて、表示情報(日付・MAIN/SUB)が変わると壊れる。
- `TEST_HANDOFF/README.md` の旧記載(はじめる → 狂い咲きの森 → ▶出撃準備 → ▶START)は
  **現在どれも存在しない**。文言ベースは実際に腐った前例がある。

### 提案(付けるならこの7箇所+1)
| 画面 | 押す物 | `data-testid` |
|---|---|---|
| 更新情報モーダル | OK | `changelog-ok` |
| タイトル | 開始 | `title-start` |
| オープニング | スキップ | `opening-skip` |
| OPERATIONS ROOM | 出 撃 | `ops-sortie` |
| 作戦地域の一覧 | 各ステージのカード | `stage-card-<stageId>` |
| ブリーフィング | ジョブ選択 | `briefing-jobselect` |
| ジョブ選択 | スタート | `charselect-start` |
| 各画面のルート | — | `data-screen="<screenId>"`(A の `screenId` がそのまま取れる) |

**見た目・レイアウトは変えない**(属性を足すだけ)。付いたら `run-observe.mjs` を testid ベースへ切り替える(こちらの作業)。

---

## 優先順位(要件書の実装順そのまま)
1. **A(Test Bridge)** — これが無いと preview のランが観測不能のまま。**ゲートの方式は社長裁定待ち**
2. **B(Event Timeline)** — 回避/カウンター/強化選択は外から取れない
3. **C(seed)** — A/B比較と版比較の前提
4. **D(data-testid)** — 今は無くても通る。**壊れにくくするための投資**

## テスト側の状態(2026-09-17時点)
- **P0-3 Run Manifest / P0-4 イベント連動キャプチャ / P0-5 First-run: 実装済み・実走確認済み。**
- `run-observe.mjs` は Bridge があれば `screenId`→`screen`、`botReportReady`→`botReport` と
  **名前を翻訳して**使う。商人画面の解除も Bridge があれば `closeBlockingMenu()` を呼ぶ。
- **積んである宿題(今は直さない)**:
  - events の時刻が相対秒のみ(要件書は `realTime` 絶対時刻)。Manifest の `startedAt` から逆算は可能。
  - 「初回 counter / 大技」の撮影トリガーが無い(**B が着地しないと検知できない**)。
  - firstrun の「戻る操作」は未記録(要件書 P0-5)。
  - firstrun は非 smoke のため `stage=` が効かない(アプリが読むのは smoke 時のみ)。
    **実際に出撃したステージは A の `stageId` 待ち**。
  - `run-observe.mjs` は `headless:false` 固定で、他3本のような `request.config.json` 参照ではない
    (実機専用のため意図的。README に追記済み)。

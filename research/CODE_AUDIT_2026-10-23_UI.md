# コード監査 2026-10-23 — 画面(React)・音・入力・進行の保存

社長の依頼(そのまま): 「ソースコード調査させてバグないか調査。ついでに改善、改良などアドバイスあればメモらせといて」

担当範囲: `src/App.tsx` / `src/components/`(Game・GameHUD・PauseMenu・ShopMenu・UpgradeMenu・GameOverScreen・TitleScreen・
OpeningScene・MissionSelect・NpcDialogue・IntroDialogue・TutorialPopup・StoryReturnPrompt・MobileControls・VirtualJoystick ほか)/
`src/audio/audioManager.ts` / `src/utils/gamepad.ts`・`menuNav.ts`・`inputDevice.ts`・`pcPress.ts`・`hudHints.ts` /
進行の保存(`localStorage` を読む utils・`data/progress.ts`)。ループ(`useGameLoop.ts`)と store は**UI と接する部分だけ**見た。

対象版: v0.25.5190(HEAD `94c966bc`)。**ソース・テスト・他文書は1文字も触っていない**(この文書のみ新規)。

「確認の度合い」の凡例: **[確]**=コードで経路を最後まで追って確かめた / **[測]**=使い捨てのヘッドレス計測で数字を取った /
**[推]**=機構はコードで確認したが、実機でそう見えるかは未確認(推測)。

---

## ① 先に結論(重い順・上位5件)

| # | 名札 | 一言 | 重さ | 確認 |
|---|---|---|---|---|
| **B-2** | **タイマー依存のUI群** | 「死んだ→リザルト」「レベルアップ窓の表示」「ジュンのゆっくり文字送り」「銘打ちの送り」が**全部 `setTimeout` でしか進まない**。描画(rAF)が回っていてもタイマーが来なければ、社長の症状4つのうち3つ(死んでも終わらない・名前だけで本文が空・一時停止しても何も出ない=Lvup待ち)がそのまま出る | 出荷を止める(症状の直接の機構) | 機構[確]・タイマーが止まる根本原因は端末側で[推] |
| **B-1** | **死亡演出700ms切断** | `Game.tsx:171` の保険(HP0→700msでリザルト)が、ループ側の正規の予約(`PLAYER_DEATH_TO_RESULT_MS`=2000ms)より**必ず先に**発火。寄り+スロー(1700ms・保持1150ms)は700msで打ち切られ、Game ごとアンマウント=キャンバスも消える。「死亡演出を見せ切ってから」の設計が**毎回**死んでいる | 遊びに支障(演出が存在しない) | [確](両タイマーの値と順序。実機の見え方は未確認) |
| **B-3** | **App の gameStats 丸ごと購読** | `App.tsx:126` がルートで `gameStats` を購読。撃破・与ダメ・被弾・XP取得のたびに新参照→**App→Game→HUD全部**が再描画(memo無し・`onVictory`/`onReturn` も毎回新しい関数)。ヘッドレス実測: 14フレームで6回差し替わった(60fpsなら毎秒20〜25回のルート再描画)。CLAUDE.md が名指しで禁じている購読 | 遊びに支障(重さの一因。単独で症状は起こさない) | [確][測] |
| **B-4** | **ポーズピルがフラグを見ない** | `MobileControls.tsx:12-16` は `isPaused` を**無条件に反転**。キーボード側(`Game.tsx:196`)は5フラグを見るのに、指のピルは見ない。レベルアップ窓は `showUpgradeMenu` が立ってから**450ms後**にしか出ない(`Game.tsx:211`)ので、その間にピルを押すと `isPaused=false` のまま `showUpgradeMenu=true` → **動いているゲームの上にレベルアップ窓** | 遊びに支障(再現条件は狭い) | [確] |
| **B-5** | **全画面 backdrop-filter** | 一時停止(`PauseMenu.tsx:119` blur18px)・レベルアップ(`UpgradeMenu.tsx:83` blur20px)・`glass-panel`(index.css:150 blur14px)が **Pixi のキャンバス全面にぼかしを敷く**。`VirtualJoystick.tsx` のコメントが「モバイル WKWebView で重い」と記録済み。GPUメモリ逼迫時(テクスチャ200〜300MB)に全画面のぼかし層が確保できず「DOMは出ているのに見えない/何秒もかかる」なら、「時間だけ止まってメニューが出ない」に合う | 遊びに支障(当たれば出荷を止める) | [推] |

---

## ② バグの一覧

| # | 名札 | 場所 | 何が起きるか(筋書き・再現条件) | 重さ | 確認 |
|---|---|---|---|---|---|
| B-1 | 死亡演出700ms切断 | `src/components/Game.tsx:169-174` / `src/hooks/useGameLoop.ts:1514,2325` / `src/store/gameStore.ts:2750-2751` | 死亡で `health=0`(`damagePlayer` は `Math.max(0, …)`)→ Game.tsx の effect が **700ms** で `onGameOver` → `setGameState('gameOver')` → Game アンマウント(ループの2000msの予約は cleanup で消える)。`DEATH_ZOOM_MS=1700`/`HOLD=1150` の「見せる時間の本体」は一度も最後まで映らない。ENGINEERING_NOTES §0 の v0.25.4957 の行も「保険(700ms)で先にリザルトが出て」と事実だけ書いている | 遊びに支障 | [確] |
| B-2 | タイマー依存のUI群 | 下の個票 | **描画は回るのにタイマーが来ない**状態で止まるもの: ①死亡→リザルト(`Game.tsx:171` と `useGameLoop.ts:2325` の**両方**が setTimeout)②レベルアップ窓の表示(`Game.tsx:211` の450ms。立つまで `isPaused=true` で**何も表示が無い**。しかもこの間 PauseMenu は `showUpgradeMenu` で抑止=一時停止を押しても出ない)③ジュンの slow 行(`NpcDialogue.tsx:73-97` SlowLine=120ms刻みの setTimeout 鎖。**名前は親が即描く・本文は0文字のまま未表示部が opacity:0**=「名前だけ出て本文が空」そのもの。slow 行は**ステージ4のジュン離脱の一言だけ**)④銘打ちの送り(`WallInscription.tsx:21` 4秒で dequeue。止まると `wallEventQueue` が溜まる)⑤ボスカットイン(`BossCutin.tsx:40-52`)⑥覚醒帯/血の覚醒帯/壁の帯(`AwakenCutin.tsx:21`・`BloodAwakenBanner.tsx:22`・`WallBand.tsx:17`)⑦取得表示の消去(`GameHUD.tsx:145`)⑧ショップのファストトラベル(`ShopMenu.tsx:263`、来ないと `leaving` の暗転のまま) | 出荷を止める | 機構[確]・飢餓の原因[推] |
| B-3 | App の gameStats 丸ごと購読 | `src/App.tsx:126,689` | `gameStats` は結果画面に渡すためだけに購読されているが、書き換えは `gameStore.ts:8758/9771/10207/11009/11325/12530/12709/12783/13620…`(撃破・与ダメ・被弾・XP・購入)。1戦闘中は毎秒十数回〜。App 再描画→`Game` に新しい `onVictory`/`onReturn`(useCallback無し)→ Game 配下(GameHUD/RunHud/PixiStage/WallBand/BossCutin/IntroDialogue…)が**React.memo が1つも無い**(grep 0件)ので全部再描画。実測(ヘッドレス・stage-4・bot=standard・40秒): 14フレーム中 gameStats 6回差し替え | 遊びに支障 | [確][測] |
| B-4 | ポーズピルがフラグを見ない | `src/components/MobileControls.tsx:12-16` vs `src/components/Game.tsx:191-204` | ピルは `useGameStore.setState(s => ({ isPaused: !s.isPaused }))`。①Lvup 450ms窓(上記)で押す→ゲーム再開+窓が後から出る ②`showUpgradeMenu=true` のまま再度押すと `isPaused=true` でも PauseMenu は出ない(`Game.tsx:289` の抑止)=「止まるだけ」。PC(マウス)でも同じピルを押せる | 遊びに支障(狭い) | [確] |
| B-5 | 全画面 backdrop-filter | `PauseMenu.tsx:119` / `UpgradeMenu.tsx:83` / `src/index.css:150` | 上記。切り分け用のURLツマミは**無い**(`tsBool/tsNum` の一覧に backdrop/blur 系なし) | 遊びに支障〜出荷停止 | [推] |
| B-6 | isPaused の多重所有 | 開く側: `gameStore.ts:9158,13898,19857,20692,21110`, `useGameLoop.ts:17584` / 閉じる側: `gameStore.ts:13195-13335(selectUpgrade),13912(closeShop),13921(returnToBase),20695(closeTutorialPopup),21125,21134(answerStoryReturnPrompt)` | 開く側は `pauseReason` を書くが、**閉じる側は全員が無条件に `isPaused:false`**。`pauseReason` は**誰も読んでいない**(grep: 書き手のみ)。今はループ停止中に別の窓が開かない構造で実害を免れているが、1つ入口が増えた瞬間に「内側の窓を閉じたら外側の窓の下でゲームが走る」になる。`OrientationGuard.tsx:44-55` だけが「自分が掛けた分だけ戻す」を自前でやっている | 軽微(保守性・時限爆弾) | [確] |
| B-7 | bare(道具)部屋の二重再出撃・死亡ガード固着 | `src/App.tsx:434-440,513-519` / `useGameLoop.ts:1850-1858,2325` / `gameOverTriggeredRef` を false に戻す箇所=**0件** | ボスメーカー(`bare`)では死んでも Game がアンマウントされない(`gameState` が 'playing' のまま `startGame`)。→ ①`Game.tsx` 700ms→`restartBareRoom` ②ループの2000ms→`restartBareRoom` が**両方届く**(v0.25.4957 の「アンマウントで clearTimeout」は bare では効かない)=新しい部屋に入って1.3秒後にもう一度リセット ③`gameOverTriggeredRef` が true のまま残るので**2回目以降の死は死亡演出・SEが出ない**(700msの保険だけで部屋が戻る)。ガントレット(`GAUNTLET_MODE`)も同型の疑い | 軽微(開発道具のみ) | [確](bare)・[推](ガントレット) |
| B-8 | ジョイスティックが指の移動ごとに React 再描画 | `src/components/VirtualJoystick.tsx:43-44,243-244,278,345-385` | `setOrigin`/`setDelta` を pointermove ごとに呼ぶ=指を置いている間(このゲームは常時)60〜120Hz で React の render+commit。使い道はノブの `left/top` だけ | 遊びに支障(軽〜中・恒常) | [確] |
| B-9 | setFps が毎秒 Game 全体を再描画 | `src/hooks/useGameLoop.ts:1566,2842` / `Game.tsx:125,264,279` | `fps` は PerfOverlay/BenchmarkOverlay(統計トグルON/ベンチ時)しか使わないのに**常時** state 更新 → 毎秒 Game とその子全部が再描画 | 軽微 | [確] |
| B-10 | BossCutin が attention を丸ごと購読 | `src/components/BossCutin.tsx:18` / `useGameLoop.ts:2638,2676` | ループが追従で毎フレーム `attention: {...att, x, y}` を差し替える → アテンション中は BossCutin が毎フレーム再描画(非表示時は null 返しで軽い) | 軽微 | [確] |
| B-11 | startGame の順序でリザルトが「0」で1回描かれる | `src/App.tsx:371-397` | `resetGame()` → `refillSubquests()` → … → `setGameState('playing')` の順。App が `gameStats`/`rendererReady` を購読しているので、`resetGame` の瞬間に **`gameState='gameOver'` のまま GameOverScreen がリセット後の統計で再描画**される(ゴールド加算・記録・ハイスコアは ref ガードで二重計上なし=実害は一瞬の0表示の可能性)。B-3 を直せば消える | 軽微 | [確](描画の瞬間は[推]) |
| B-12 | PauseMenu の台帳引きが無防備+ErrorBoundary 無し | `src/components/PauseMenu.tsx:76,219` / ErrorBoundary: grep 0件 / `src/main.tsx` | `SKILLS[k].name` は runBuild に台帳外キーが入ると throw。React 18 は境界が無いと**ルートごとアンマウント**=HUDもキャンバスも消えて真っ暗(ループは生きる)。今は runBuild が当ランで生成されるので起きにくい | 軽微 | [推] |
| B-13 | `showEventQuestMenu` は死んだフラグ | `Game.tsx:109,196,289` / `useGameLoop.ts:2886` / `gameStore.ts:13954,23317` | **true を書く場所が無い**(grep 0件)。条件式に残っていて読み手を惑わす | 軽微(保守性) | [確] |
| B-14 | `unlockDanceAudio` が出撃ごとに Audio 要素を作る | `src/audio/audioManager.ts:1086-1103` / `App.tsx:297,619,624` | 出撃・リトライ・タイトルOKのたびに `GAME_BGM.default + REVERSE_BGM` 本数の `new Audio()` を作って play→pause。参照は捨てるので GC 待ち。WebKit は同時メディア要素数に上限があり、`crashWatch.ts` の「何度もリプレイしてたら落ちた」(2026-10-17)の一因になり得る | 軽微 | [推] |
| B-15 | 「もう一度」連打の二重 startGame | `src/App.tsx:692` / `GameOverScreen.tsx:329-335,1233` | `startGame` は `await ensurePreload()` を挟む非同期。`settleAnd` は進行の精算をするが**二重押し防止は無い**。2回走ると `resetGame`+`refillSubquests` が2回(補充の台帳は2回目で冪等に見えるが未検証) | 軽微 | [推] |

**見たが問題なしと判断したもの(再調査の節約用)**: `IntroDialogue.tsx`(rAF駆動・Date.now基準=正しい型)/ `menuNav.ts` の MutationObserver は `html.kbnav` 中かつゲーム停止中だけ observe(スマホでは一度も動かない)/ `gamepad.ts` の rAF ポーリングは接続時のみ開始・切断で解放 / `audioManager.ts` の gesture recovery・devicechange は登録1回ガード済み、`hurricaneVoices` は毎 pump で間引き、`peakLayerFadeTimer` は張り直し前に clear / `progress.ts`・`tutorialArchive.ts`・`gameStore.ts` の localStorage は全て try で囲まれている(awk で「前行に try が無い」と出た行は全部 try ブロック内の else 枝) / `runRoutes.ts` は 2400 点で間引き、`mapSightings` は Set / `npcDialogueQueue` はイベント経路が3件上限(`gameStore.ts:14610`)、他は積む回数が有限 / PixiStage の pause 購読は解除あり。

---

## ③ 重点の症状(ステージ4で長く遊ぶと重くなり、一時停止・ショップ・ゲームオーバー・文字送りが出ない)について分かったこと

### 3-1. 症状の4つは「2つの機構」に分かれる
| 症状 | 動かしているもの | 止まる機構 |
|---|---|---|
| 死んでも終わらない | `setTimeout` のみ(`Game.tsx:171`・`useGameLoop.ts:2325`)。rAF 側に代替経路は**無い** | タイマー飢餓 |
| 通信の文字送りが止まる(名前だけ出て本文が空) | SlowLine の `setTimeout` 鎖(`NpcDialogue.tsx:84-86`)。**ステージ4のジュンの slow 行だけ**がこの型(他の会話は本文を即描く) | タイマー飢餓 |
| 一時停止を押しても時間だけ止まる(Lvup待ちの時) | `showUpgradeMenu=true` → 450ms 後に窓(`Game.tsx:211`)。その間 PauseMenu も抑止 | タイマー飢餓 |
| 一時停止を押しても時間だけ止まる(通常時)/ ショップが開かない | **React の同期描画**(zustand の外部ストア更新は React 18 でマイクロタスクで flush=タイマー無関係)。ヘッドレスでは `isPaused=true` から**77ms**で「一時停止」が DOM に出た(③-3) | **別の機構**: 全画面 backdrop-filter の合成(B-5)か、React のレンダーが極端に長い |

⇒ **タイマー飢餓だけでは「通常時の一時停止で何も出ない」は説明できない。** 2系統が同時に起きている前提で切り分ける。

### 3-2. 計測器は既に正しい所に付いている(v0.25.5190 の ErrBeacon)
`Game.tsx:393-416` の `tm`(タイマーが最後に動いてからの ms・250ms間隔の setInterval)と `停止[…]`(isPaused 中に立っているフラグ名)がそのまま判定表になる:
| 行の見え方 | 意味 | 次の1手 |
|---|---|---|
| `tm` が数千ms に伸び続ける | **タイマー飢餓が本物**(B-2 の経路が全部止まる) | 3-4 の仮説を社長の3問で絞る |
| 一時停止を押しても `停止[…]` が**出ない** | `isPaused` が立っていない=ピルの押下が届いていない(入力イベントも後回しにされている) | 入力の層(タッチ→pointerdown)の遅延。タイマー飢餓と同根の疑い |
| `停止[Lvup]` なのに窓が無い | B-2②(450ms が来ていない) | A-1 で rAF 駆動化 |
| `停止[メニュー]` なのに何も見えない | React は `isPaused` を見ているはず → **描画(合成)側**=B-5 の疑い | A-8 のツマミで backdrop を切って再現 |
| `停止[店]` なのに店が無い | 同上(ShopMenu は `bg-black/55`+`glass-panel` の blur) | 同上 |

※一時停止中は PixiStage が ticker を止める(`PixiStage.tsx:241-243`)ので、**ポーズ中にキャンバスが動いて見えたら別問題**(ticker が止まっていない)。「描画は回っている」は ErrBeacon の `fps`(自前の rAF)で見るのが正。

### 3-3. ヘッドレスで確かめたこと(使い捨て・`scratchpad/ui-audit-probe.mjs`・dev サーバは PID 指定で停止済み)
- stage-4 / `?smoke=1&autotut=1&bot=standard` / 430×932 / 40秒: 14フレーム・store `set` 127回・**gameStats 6回差し替え**・player 13回・enemies 17回・attention 0・npcDialogueQueue 最大1・wallEventQueue 最大0・effects 最大8。GPU無し環境で 0.3秒ぶんしか進まないため**比率だけ**が読める(gameStats は約2.3フレームに1回)。
- `isPaused=true` を store に書いてから「一時停止」の文字が DOM に出るまで **77ms**(React 経路は健全。実機の症状は React のコードの誤りではなく、端末の負荷・合成側に寄っている)。
- タイマー飢餓そのものはヘッドレスでは再現できない(連続タッチも実 GPU も無い)。

### 3-4. タイマーが来なくなる原因の仮説(全部[推]・社長に聞く3問つき)
1. **連続タッチジェスチャ中のタイマー後回し**: このゲームは**指を画面に置き続ける**操作。Chromium の main-thread scheduler はタッチジェスチャ中に timer タスクの優先度を下げ、フレームが長い(各フレーム数百ms)と**タイマーが rAF と入力に挟まれて飢える**。WebKit も rendering 優先。→ **問①「指を離して待つと `tm` が戻るか / メニューが出るか」**。戻るなら、A-1(UI の時計を rAF に乗せる)で症状4つのうち3つは消える。
2. **GPU メモリ逼迫で全画面 backdrop-filter の層が作れない**(B-5)→ **問②「`停止[メニュー]` と出ているのに何も見えないか、`停止[…]` 自体が出ないか」**。前者なら B-5、後者なら入力遅延。
3. **React のレンダーが極端に長い**(PauseMenu の snapshot: `currentRoute()` 最大2400点の SVG + `PauseMap`)。1枚のレンダーが数秒なら rAF も止まるはずなので「描画は回っている」と矛盾=可能性低。→ **問③「重くなった状態でも敵は動いている(=ループは回っている)か、雲だけか」**。

### 3-5. React 側に「時間とともに増える物」は見つからなかった
`npcDialogueQueue`(3件上限)・`wallEventQueue`(タイマー停止時のみ溜まる=結果であって原因ではない)・`runRoutes`(2400点で間引き)・`mapSightings`(Set)・`danceTapLog`/`GhostDamageLog`/`KbLogOverlay`(URLフラグ時のみ)。**「長く遊ぶと重くなる」の本体は React 層の外(描画器・テクスチャ・store の配列)にある**と見る。React 層が足しているのは**恒常の固定費**(B-3 毎秒十数回のルート再描画・B-8 指の移動ごとの再描画・B-9 毎秒1回の全体再描画)で、重い状態を**悪化させる側**。

---

## ④ 改善・改良のアドバイス(全部「提案」。実装していない。「より面白くなる方」の1行つき)

| # | 名札 | 提案 | なぜ面白くなるか / 効く理由 | 関係するバグ |
|---|---|---|---|---|
| A-1 | **UI の時計を rAF に乗せる** | ループは既に `levelUpIntroUntil`(`useGameLoop.ts:17583`)と `updateNpcDialogue(gameTime)` を**rAF で時刻比較**している。同じ型で ①死亡→リザルト(`deathResultAt` を store に置き、ループが `Date.now()>=` で `onGameOver`)②Lvup 窓の450ms(`showUpgradeOverlayAt`)③SlowLine(表示文字数を `npcDialogue.shownSince` からの経過で算出=IntroDialogue と同じ)④WallInscription の4秒、を setTimeout から外す | **描画が回っている限り UI も必ず進む**=「死んでも終わらない」「本文が空」が機構ごと消える。死亡演出も最後まで見せられる(B-1 と一緒に直る) | B-1, B-2 |
| A-2 | **一時停止の門を1本に** | store に `togglePause()` を1つ作り、`Game.tsx:196` の5フラグ判定をそこへ移す。ピル(MobileControls)・ESC/P・パッドの START(`gamepad.ts:235 escapeKey`)が全部それを呼ぶ | 入口が増えても漏れない。Lvup 450ms 窓でゲームが動き出す事故が消える | B-4 |
| A-3 | **HUD 層に ErrorBoundary を1枚** | `Game.tsx` の HUD 群(GameHUD/PauseMenu/ShopMenu…)を境界で包み、落ちたら**その窓だけ**消して ErrBeacon に赤字で出す(キャンバスとループは生かす) | 「真っ暗になって落ちた」を「メニューだけ出ない+原因が左下に出る」に変える=実機で原因が読める | B-12 |
| A-4 | **App から gameStats 購読を外す** | `GameOverScreen` が自分で `useGameStore(s => s.gameStats)` を読む(結果画面ではシムが止まっているので安全)。併せて `handleVictory`/`handleReturn` を `useCallback` に(`handleGameOver` は済んでいる) | 戦闘中のルート再描画(毎秒十数回)が0になる。B-11 の「0が一瞬映る」も消える | B-3, B-11 |
| A-5 | **ジョイスティックのノブを ref 直書き** | `origin`/`delta` を state にせず、ノブの div の `style.transform` を pointermove で直接書く(`LightDebug`/`ErrBeacon` と同じ作法)。`origin` だけは「置いた/離した」の2回で state にしてよい | 指を置いている間の React コミット(60〜120Hz)が消える=手触りがそのまま軽くなる | B-8 |
| A-6 | **fps を React state から外す** | `fps` は ref に入れ、PerfOverlay/BenchmarkOverlay が自前の rAF で読む(両方とも元々「毎フレーム更新の孤立小コンポーネント」の型) | 毎秒1回の Game 全体再描画が消える | B-9 |
| A-7 | **閉じる側が `pauseReason` を見る** | `closeShop`/`selectUpgrade`/`closeTutorialPopup`/`answerStoryReturnPrompt` は「自分の reason の時だけ `isPaused:false`」。手動ポーズは `reason:'manual'` | 窓が重なった時に下でゲームが走らない。OrientationGuard の自前ロジックも不要になる | B-6 |
| A-8 | **backdrop-filter の切替ツマミ** | `?blur=0` で全画面 backdrop-filter を外す(PauseMenu/UpgradeMenu/glass-panel)。実機で「メニューが出ない」が消えるかで B-5 を確定する。消えるなら**スマホは blur 無し・PC だけ blur**(VirtualJoystick が v0.25 初期に通った道) | 切り分けが1回で済む。メニューが「必ず出る」方が面白い(ぼかしは出ない時に無意味) | B-5 |
| A-9 | **死亡の見せ方を決め直す** | B-1 を直すと死亡演出が初めて最後まで映る。その上で「寄り→スロー→血→黒幕→リザルト」の尺(1700/1150/+300)を実機で見て決める | 死に方が**見せ場**になる(今は0.7秒で切れて見せ場が無い) | B-1 |
| A-10 | **bare 部屋の後始末** | `restartBareRoom` で `gameOverTriggeredRef`/`deathToResultTimerRef` を戻す口を `useGameLoop` が公開する(または bare でも Game を key で作り直す) | 道具で死んだ後も演出が出る=調整中に当たりの重さが分かる | B-7 |
| A-11 | **「もう一度」「出撃」の二重押しガード** | `startGame` に `startingRef` を置き、走っている間は2回目を捨てる | 連打で2回リセットされる事故の芽を摘む | B-15 |
| A-12 | **死んだフラグの掃除** | `showEventQuestMenu` を型・初期値・条件式から外す | 読み手が「どこで立つのか」を探さなくて済む | B-13 |

---

## ⑤ 調べた範囲と調べ切れなかった範囲

### 調べた(読んだ/grep で経路を追った)
- `src/App.tsx` 全体(購読・startGame・結果遷移・smoke/ending パラメータ)
- `src/components/`: Game.tsx(全)・PauseMenu.tsx(全)・MobileControls.tsx(全)・NpcDialogue.tsx(全)・IntroDialogue.tsx(全)・WallInscription.tsx(全)・OrientationGuard.tsx(全)・HudScale.tsx(全)・GameHUD.tsx(購読部)・ShopMenu.tsx(購読部・ファストトラベル)・UpgradeMenu.tsx(購読部〜描画の頭)・TutorialPopup.tsx(本体)・BossCutin.tsx(購読〜タイマー)・VirtualJoystick.tsx(移動・描画)・GameOverScreen.tsx(購読・effect・ボタン)・TitleScreen.tsx(開始〜ローディング)・MissionSelect.tsx/OpeningScene.tsx(タイマー・interval の cleanup のみ)
- `src/hooks/useGameControls.ts`(全)・`useGameLoop.ts`(死亡・ポーズ・watchdog・Lvup・会話・attention の各箇所のみ)
- `src/audio/audioManager.ts`(BGM 要素・play 再試行・gesture recovery・hurricane・peak・preload・playSfx)
- `src/utils/gamepad.ts`・`menuNav.ts`(観測者・文脈判定)・`inputDevice.ts`・`pcPress.ts`・`hudHints.ts`(全)・`crashWatch.ts`(全)・`runRoutes.ts`・`mapSightings.ts`・`playerDeathWatch.ts`
- `src/store/gameStore.ts`: `isPaused`/5フラグの全書き込み箇所・`damagePlayer` の死亡枝・`updateNpcDialogue`・`openShop/closeShop`・`levelUp` の窓を開く枝・`refillSubquests`・localStorage の全使用箇所(try 有無)
- `src/data/progress.ts` の保存関数(try 有無)
- ヘッドレス計測1本(stage-4・40秒・③-3)

### 調べ切れなかった(次の人へ)
- **描画器(`src/pixi/`)とテクスチャ常駐**: 「長く遊ぶと重くなる」の本体がここにある可能性が高いが担当外。ErrBeacon の `tex…MB`・`bk`・`sceneDiagText` の読みは描画担当へ。
- **MissionSelect.tsx(2964行)・OpeningScene.tsx(1430行)・GameOverScreen.tsx(1346行)の本文**: タイマー/interval の後始末と購読だけ見た。文言・導線・結果画面の計算は未監査。
- **gameStore のシミュ本体・敵AI**: `effects`/`enemies` の配列の増え方(ErrBeacon が `st[fx pk pj sm]` で数えている物)は担当外。
- **タイマー飢餓の実機再現**: ヘッドレスでは不可能(③-3)。社長の実機で ErrBeacon の `tm` と「指を離すと戻るか」(③-4 問①)を見るのが唯一の確かめ方。
- **B-5(backdrop-filter)の確定**: ツマミ(A-8)が無いので今回は推測止まり。
- **B-15 の `refillStageSubquests` が2回呼ばれた時の台帳の挙動**: 冪等かどうか未検証。
- `src/utils/testBridge.ts`・`tutorialArchive.ts`・`progress.ts` の読み出し側(JSON parse の防御)は grep で try を確認したのみ。

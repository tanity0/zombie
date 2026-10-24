# コード監査 2026-10-23 — シミュレーション側(store / useGameLoop / utils / world)

- 依頼: 社長「ソースコード調査させてバグないか調査。ついでに改善、改良などアドバイスあればメモらせといて」
- 担当範囲: `src/store/gameStore.ts`(24,374行)・`src/hooks/useGameLoop.ts`(17,879行)・`src/utils/`・`src/world/`。
  描画(`src/pixi/`)は、シミュ側の配列がそのまま表示物になる箇所だけ併せて読んだ。
- 基準版: v0.25.5190(`94c966bc`)。調査日時 2026-10-24 01:30 JST。
- 重点: 社長実機「ステージ4で8〜9分遊ぶと急に重くなる。一時停止しても時間が止まるだけでメニューが出ない・ショップが開かない・死んでも終わらない・通信の文字送りが止まる。表示物 obj 926→2436」。
- 「確認の度合い」の書き分け: **実測**=使い捨てテストで数字を見た / **コード**=実在の配線を読んで確かめた(動かしてはいない) / **推測**=筋書きは通るが未検証。

---

## ① 先に結論(重い順・上位5件)

| # | 名札 | 一言 | 重さ | 確認 |
|---|---|---|---|---|
| **S-1** | **拾い物の無制限蓄積** | `pickups` は**上限も寿命も画面外の片付けも無い**。拾う(触れる)・磁石・幻影の犬でしか消えない。経験値の玉が倒した場所に残り続け、描画側は**全部の拾い物を毎フレーム描く**(1個=表示物5個+影1個・画面外も)。obj の +1,510 は玉 **約300個**ぶんに一致する | 遊びに支障(重さ) | コード(構造)。個数は実機の計器 `maps(...pickupsN)` で確定できる |
| **S-2** | **gameStats 毎フレーム書き換え→ルートが60回/秒再レンダー** | ループが毎tick `updateGameStats({timeAlive})` を呼び、`gameStats` が毎回新しいオブジェクトになる。**App.tsx(ルート)が `gameStats` を丸ごと購読**しているので、**React の木全体が毎フレーム再レンダー**される(Game は memo されていない)。使い道はゲームオーバー画面の1箇所だけ | 遊びに支障(常時の負荷・CLAUDE.md の再レンダー規律に違反) | コード(構造) |
| **S-3** | **タイマー頼みの仕組みが一斉に止まる構造** | メニュー(React)・ゲームオーバー(`setTimeout`×2)・通信の文字送り(1文字ごと `setTimeout`)・銘打ちの送り(`setTimeout`)・ループの番犬(`setInterval`)は**全部タイマー/React スケジューラ**で動き、シミュ・Pixi・左下の計器は **rAF** で動く。重い時にタイマー側だけ回されないと、社長の見た4つの症状が**同時に**出る。rAF 側に予備の経路が1本も無い | 出荷を止める(症状そのもの) | 構造はコード。飢餓の因果は推測(v0.25.5188 の `tm` 計器が確かめる) |
| **S-4** | **重い時はゲーム時間が1/4速になる** | `baseDeltaTime = min(0.05, rawDelta)`。1フレーム200msかかると gameTime は50msしか進まない=**「時間が止まるだけ」に見える**。さらに **gameTime 基準の時計(技の溜め・予告)と Date.now 基準の時計(ノックバック・ヒットストップ・気絶)の進み方が4倍ずれる**=重い時だけ技の見え方が狂う | 遊びに支障(重い時のみ) | クランプはコード。時計のずれの実害は推測 |
| **S-5** | **毎フレームの `set` が多い+配列の作り直し** | ループ側だけで `useGameStore.setState(` が118箇所、store のアクションも毎tick十数本。zustand は `set` のたびに **React の購読 204 本すべての selector を回す**。`syncBreakableProps` は中身が変わらなくても毎tick新しい配列を返す | 軽微〜中(土台の重さ) | コード。回数の実測はヘッドレスの部分集合で 5〜7.5回/tick(全景ではない) |

**重点の症状への答え(短く)**: 「時間とともに増える物」でシミュ側に見つかったのは **S-1 の拾い物だけ**(他の台帳・Map・ref は全部キャップか出撃ごとのクリアがあった=下の②に一覧)。**S-1 が描画の表示物を増やし、S-2 が毎フレームの React の仕事を上乗せし、焼き置きの天井張り付き(v0.25.5184)と足し合わさって1フレームが長くなり、S-3 の構造でタイマー側が先に死ぬ**、が今いちばん筋の通る筋書き。

---

## ② バグ・リスクの一覧

| # | 名札 | 場所 | 何が起きるか(筋書き・再現) | 重さ | 確認 |
|---|---|---|---|---|---|
| S-1 | 拾い物の無制限蓄積 | `gameStore.ts:19650-19705 addPickup`(`[...state.pickups, …]` のみ)/ 消す経路は `collectPickup`(接触)・`removePickup`(幻影の犬 `useGameLoop.ts:10367`)・磁石(`gameStore.ts:19831`)の3つだけ。寿命・上限・画面外の片付け・合体は**無い**(`pickups.filter` の出どころを全部数えた) | 遠距離の銃・タレット・地雷・錬金・軍人側の倒しで出た経験値の玉(1体 2〜4個 `xpOrbCountForEnemy`)が倒した場所に残る。ステージ4は北へ進む行軍なので**後ろに残した玉は二度と拾わない**。描画 `pixiScene.ts:33090 syncPickups` は**全件を毎フレーム `drawPickup`**(カリングは地平線のαだけ・`cullable` は pixiScene 内で0件)。1個=Container+Graphics×2+(経験値は)グロー Sprite×2=**5個**、さらに `pickupShadows` に影1個。300個で約1,800 | 遊びに支障 | コード。ヘッドレスのボットは3分で死ぬ/行き止まりで止まるため**9分の蓄積は再現できなかった**(⑤)。実機の計器に `pickups` の Map の件数が既に出る(`maps…(pickupsN)`)=次の重い時の行で確定 |
| S-2 | gameStats 毎フレーム書き換え | 書き手 `useGameLoop.ts:3285 updateGameStats({ timeAlive: gameTime / 1000 })`(毎tick・無条件)/ 実装 `gameStore.ts:22564`(`{...state.gameStats, ...stats}`=毎回新参照)/ 読み手 `App.tsx:126 useGameStore(state => state.gameStats)`(等価判定なし=Object.is)→ 使うのは `App.tsx:689` のゲームオーバー画面のみ | `App` が毎フレーム再レンダー → 子の `Game`(`Game.tsx:76`・memo なし)以下が毎フレーム reconcile。CLAUDE.md「React re-render discipline」の禁じ手そのもの | 遊びに支障(常時) | コード |
| S-3 | タイマー頼みの構造 | ゲームオーバー: `useGameLoop.ts:2325 window.setTimeout(onGameOver, PLAYER_DEATH_TO_RESULT_MS)`+保険 `Game.tsx:171 setTimeout(onGameOver, 700)` / 文字送り: `NpcDialogue.tsx:75-86`(1文字ごと `setTimeout`) / 銘打ち: `WallInscription.tsx:21` / 番犬: `useGameLoop.ts:17810 setInterval(500)` | 重い時にタイマーが回されないと、**死んでもリザルトへ行かない・通信は名前だけで本文が空・一時停止のメニュー(React)が出ない**が同時に起きる。rAF 側(ループ)に「死亡から N ms 経ったら onGameOver」の予備が無い。番犬自身もタイマーなので、この状況では番犬も死んでいる | 出荷を止める(症状) | 構造はコード。因果は推測 |
| S-4 | 1/4速の時間と時計のずれ | `useGameLoop.ts:2597 baseDeltaTime = Math.min(0.05, rawDelta)` | 5fps で gameTime は実時間の1/4。`stunUntil`/`knockbackUntil`/`hitstopUntil`(Date.now)は実時間で明けるが、`aiPhaseUntil`/予告(gameTime)は4倍遅く進む=**重い時だけ「気絶がすぐ明けるのに溜めは長い」**。ENGINEERING_NOTES「時計の混在」の、負荷で顕在化する版 | 遊びに支障(重い時) | クランプはコード。ずれの実害は推測 |
| S-5a | `syncBreakableProps` 毎tick新配列 | `gameStore.ts:20049-20121`(`return { breakableProps: out, mineAmbushAnchor }` を無条件に返す) | 変化が無くても毎tick `set` が走り、全購読者が起きる。React で `breakableProps` を購読する部品は無いので実害は selector 204本の空回りと pixi の同期だけ | 軽微 | コード |
| S-5b | 毎フレームの `set` 回数 | `useGameLoop.ts` 内 `useGameStore.setState(` 118箇所+store アクション(setGameTime / updateGameStats / movePlayer / fireWeapons / updateEnemies / updateProjectiles / updateEffects / setCameraPosition / tickReload / updateSuppression / flushImpacts …) | zustand v4 は `set` ごとに全リスナーへ通知。React 側は 204 本の `useGameStore(` が selector を回す。1本は安いが「回数×204」が土台に乗る | 軽微〜中 | コード(回数の全景は未実測) |
| S-6 | 銘打ちキューの肥大(S-3 の派生) | `gameStore.ts:24339 enqueueWallEvent`(毎回ソート)/ 消費は `WallInscription.tsx:21` のタイマーのみ | タイマーが止まると `wallEventQueue` が減らず、積むたびに全体をソート。軽い | 軽微 | コード |
| S-7 | ヘッドレスの網が effects を進めない | `src/utils/playtestDriver.ts`(`updateEffects` を呼ばない) | 使い捨てテストで `effects` が**上限400に張り付いたまま**になった(実機では `updateEffects` が刈る)。実害はゲームではなくテストの忠実度=「長時間で増える物」をヘッドレスで見張れない | 軽微(網の穴) | 実測 |

### ②-2 「増え続けないか」を数えて**問題なし**だった物(再調査の手間を省くための記録)
- store の配列: `effects`(上限400・`spawnEffect`/`spawnSpray`/`spawnFireJet` で splice)/ 血粒子 `BLOOD_PARTICLE_CAP=120` / `projectiles`(`updateProjectiles` が最大引きの可視域で cull・壁で消す)/ 死体(`corpseUntil` で `updateEnemies` 末尾が除去)/ `npcDialogueQueue`(3で止める)/ `shieldBreakGhosts`(直近3)/ `skadiIceMarkers`・`skadiIceBlades`(本体が居なければ空)/ `danceTapLog`(60)/ `escorts`(`escortsChanged` で `set` を間引く)。
- モジュール変数・ref: `impactLastFiredAt`・`cutinShownThisRun`・`shieldChargedKeys`(48)・`scanMarkNumberNotes`(毎tick clear)・`critDecay ledger`(LEDGER_CAP)・`handcannonDecay`(CAP+生存IDで掃除)・`heroRehit`(64)・`chaffMotion traitsCache`(MAX で clear)・`mapSightings seen`(型×ID・出撃で clear)・`runRoutes raw`(2,400で間引き)・`komaLog`(MAX_RECORDS)・`aiDirectorDebug samples`(SAMPLE_CAP)・`ghostDmgLines`/`kbLogLines`(14)・`ENEMY_REMOVE_CAUSE`(200)・`fireJetEnemyAtRef`(256で掃除)・`decoyPulseRef`/`shieldHitRef`/`turretFireRef`/`turretAimRef`/`boomPulseRef`(生存IDで掃除)・`player.iframeBySource`(期限切れを掃除 `gameStore.ts:12604`)。
- 既存テスト: `clockLedger.test`(17)・`constitution.test`(13)・`sheetResidency.test`(6)を回して緑。

---

## ③ 重点の症状について分かったこと

1. **シミュ側で「時間とともに増える」のは拾い物(S-1)だけ。** 敵数は `MAX_ENEMIES=10`+コマ管理の上限、effects は400、弾は可視域で cull、台帳類は全部キャップ済み(②-2)。
2. **obj +1,510 の正体は拾い物でほぼ説明がつく。** 1個=表示物5(+影1)。経験値の玉 **約300個**(=倒した敵 100〜150体ぶん)で一致。9分の行軍なら自然な数。
   - **確かめ方(実機の次の行)**: v0.25.5188 の計器は `maps…(上位3)` に `pickupsN` を出す(`pixiScene.ts:38657` の `['pickups', this.pickups.size]`)。重い時の行で `pickups` が上位に居て N が数百なら確定。`obj[…]` 側は `groundLayer` が伸びる。
3. **「時間は止まるのにメニューが出ない/死んでも終わらない/本文が空」は、同じ1つの構造(S-3)から出る。** 4つの症状の共通項は「タイマーか React の再描画で動く」で、動き続けているのは rAF だけ。sim 側に rAF 駆動の予備が無いので、タイマーが止まった瞬間に **全部一緒に** 止まる(=症状の束ね方と一致)。
4. **重さの中身は3層の足し算**と読む: ①焼き置きの天井張り付き(v0.25.5184 で間引き済み・計器では天井のまま)②拾い物の描画(S-1・画面外も毎フレーム)③毎フレームの React 再レンダー(S-2)+`set` の通知(S-5)。②③は**重くなる前から**乗っているが、②だけが時間で伸びる。
5. **ステージ4固有の増殖は見つからなかった。** `farBackdrop==='snow'` の分岐はループ側で1箇所(`useGameLoop.ts:3091` の snowTheme・湧きの表の切替)だけ。ジュンの倒れ・変身(`useGameLoop.ts:2630-2687`)はアテンション中に実時間で進み、毎フレームの `set` は `attention` の座標だけ=短時間。4人の軍人の `updateSuppression` は敵10体×軍人4〜5人の走査で軽い。**ステージ4で出るのは「長く遊べる(死ににくい)ステージで、北へ歩き続け、拾い残しが後ろに溜まる」からで、ステージの仕組みではない**(推測)。
6. **ヘッドレスでは再現できない**: `playtestDriver` のボットは標準ペルソナで約3分で死に、歩き回るペルソナは最深部で行き止まりになって撃破が止まる(⑤の実測)。長時間の蓄積を見張るには、無敵+歩き続け+`updateEffects` を足した「長時間ラン」の網が要る(④-4)。

---

## ④ 改善・改良のアドバイス(仕様に触れる物は「提案」。実装はしていない)

### ④-1 拾い物(S-1)— 面白くなる方向で片付ける【提案・仕様変更】
- **推薦: 「置き去りの玉は合体して追いかけてくる」**。画面外に一定時間(例: 20秒)残った経験値の玉は、近いもの同士で**1個の大きな玉に合体**し(価値は合算・色は合算値で決まる=既存の青/緑/赤の規則どおり)、プレイヤーの進行方向の少し先へ**慣性つきで滑ってきて**床に落ちる。
  - なぜ面白いか: 「取りこぼした報酬が自分から戻ってくる」は爽快で、行軍中に後ろを振り返らなくてよくなる(ステージ4の手触りに合う)。合体の大玉は「稼いだ」の実感も強い。
  - 性能: 玉の総数に上限がつく(例: 160個・超えたら古い順に合体)。表示物は 5個/玉のまま数だけ減る。負荷スコア 1/10(減る側)。
  - 代案A: レベルアップの瞬間に場の玉を全部吸う(VS系の定番)。代案B: 単純な寿命(60秒で消える)=一番安いが「報酬が消える」は面白くない方。
- **描画側(別担当へ渡す1行)**: `syncPickups` は可視域の外の拾い物を `visible=false` にして `drawPickup` を飛ばせる(判定・位置は不変)。これは仕様変更ではない。

### ④-2 S-3 — rAF 側に予備の経路を1本ずつ【バグ修正寄り・仕様は不変】
- 死亡→リザルト: ループ(`gameLoop`)に「`player.health<=0` かつ `nowMs >= 死亡時刻 + PLAYER_DEATH_TO_RESULT_MS` なら `onGameOver`」を置く(タイマーは残してよい=二重呼びは `gameOverTriggeredRef` で既に防げる構造)。
- 通信の文字送り: 1文字ごとの `setTimeout` を、`NpcDialogue` 内の rAF 1本(または gameTime ベースの経過時間から文字数を算出する純関数)へ。見え方は同じ、落ちない。
- 銘打ち: 同様に rAF/経過時間基準へ。
- 一時停止のメニュー: React そのものなので予備は作れない。**だからこそ S-2/S-5 で React の毎フレームの仕事を減らす**のが実効策。

### ④-3 S-2 / S-5 — React と `set` の毎フレーム負荷【保守性・性能・仕様は不変】
- `App.tsx:126` の `gameStats` 購読をやめ、ゲームオーバー画面を出す瞬間に `useGameStore.getState().gameStats` を読む(または `GameOverScreen` 側で購読)。これだけで**ルートの毎フレーム再レンダーが消える**。
- `updateGameStats({timeAlive})` を毎tickではなく1秒に1回(`Math.floor` の変化時)にする、または `timeAlive` をリザルト時に `gameTime` から導く。
- `setGameTime`+`updateGameStats`+`setCameraPosition` のように**毎フレーム必ず書く値は1回の `set` に束ねる**(zustand の通知回数が減る)。
- `syncBreakableProps`: 生成した id 集合が前回と同じなら `{}` を返す(参照を据え置く)。
- 計測の提案: `useGameStore.subscribe` で1秒あたりの通知回数を計器の行に足す(`set/s`)。S-5 の「回数×204」を実機の数字にできる。

### ④-4 S-4 — 重い時の時間【提案・要裁定】
- 現状の 50ms クランプは「テレポート防止」として正しい。問題は**2本の時計の進みが変わる**こと。選択肢: (A) 重い時は Date.now 基準の窓も gameTime に合わせて延ばす(=全部スロー)/(B) 現状維持で、重さを S-1〜S-3 で潰す。**推薦は B**(時計の統一は大工事で、重さが取れれば顕在化しない)。

### ④-5 網(テスト)— 長時間で増える物を機械で見張る【保守性】
- `playtestDriver` に `updateEffects` を足す(S-7)+「無敵・歩き続け」のオプションを足し、**9分相当ランの末尾で `pickups.length`・`effects.length`・表示物に対応する配列の長さが天井以下**を assert する1本を `npm test` に(重いので `SIM_FUZZ` 側でも可)。
- 使い捨てテストは scratchpad に置いた(`/tmp/claude-0/-home-user-zombie/cc082381-7eda-5d5f-ac62-3a839bc0d89c/scratchpad/longrun.test.ts`)。リポジトリには入れていない。

---

## ⑤ 調べた範囲と調べ切れなかった範囲

### 調べた(読んだ・数えた)
- `useGameLoop.ts`: ループの頭(時間原点・アテンション・ヒットストップ・納品ロック・一時停止の分岐・ボット分岐)と尻(flushImpacts・rAF の張り直し・番犬・クリーンアップ)、死亡→リザルトの配線、拾い物の回収ブロック、ジュンの倒れ/変身、ref で持つ Map/Set/配列の掃除(全部)。
- `gameStore.ts`: `GameState` の配列・Map フィールド全列挙と、それぞれの刈り方(②-2)。`addPickup`/`removePickup`/`dropEnemyXp`/`collectPickup`、`updateEffects`/`spawnEffect` 系のキャップ、`updateEnemies` の頭と尻(死体除去・交戦フラグ)、`updateProjectiles` の cull、`updateNpcDialogue`/`tryNpcLine`、`updateSuppression` の骨格、`syncBreakableProps`、`updateGameStats`、`setPaused`、モジュール変数の台帳(全部)。
- `utils/`: 台帳を持つモジュール(runRoutes / mapSightings / komaLog / habitEpisode / critDecay / handcannonDecay / heroBlast / chaffMotion / aiDirectorDebug / duoRecords)のキャップ。`playtestDriver` の守備範囲。
- 描画との接点: `pixiScene.syncPickups`/`drawPickup`/`pickupShadows`/`diagCountsText`(拾い物が表示物になる経路と計器の読み方)。
- React 側の購読(本来は別担当): `useGameStore(` 204本の selector を機械的に列挙し、毎フレーム変わる物を購読している所を探した(→ `App.tsx:126 gameStats` と、Pixi 時は mount されない `GameCanvas.tsx` のみ)。
- 実測: ヘッドレス9分相当×2本(標準ペルソナ=3分で死亡 / 歩き回り+無敵=最深部で行き止まり)。1tick 1.8〜3.0ms(node・テストのオーバーヘッド込み)、`set` 5〜7.5回/tick(ドライバが呼ぶ部分集合)。拾い物は無敵ランで 25個生成/18個残存(行き止まりで撃破が止まったため蓄積は再現できず)。

### 調べ切れなかった(次に見る所)
- 敵のAI・技の個別(城ボス `g-*`・ボス `bossState`・天使・賞金首・幻影・ステージ2のアイドル/変異塊・削岩/伐採)の中身。数万行あり、今回は「増える物」「毎フレームの重い処理」の軸で頭と尻だけ読んだ。`combatTick`・`directorTick` の中身も同様。
- 進行/セーブ(`data/progress.ts`・localStorage の読み書き)と、ドロップの確率表の妥当性。
- 「全敵×全敵」の二重走査: `updateEnemies` の中で `enemies.find/some` が22箇所あるが、敵数が10前後で上限されるため**今回の重さの犯人ではない**と判断して個別には追っていない。
- S-3 の因果(タイマー飢餓)そのもの: 実機でしか確かめられない。v0.25.5188 の `tm` が伸びているかが決め手。
- 描画側の `obj` 内訳の実測(社長の次の重い行待ち)。

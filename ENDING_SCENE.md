# エンディングシーン(社長指示2026-08-28〜)— 設計書

> 状態は PROJECT_STATUS.md。素材は社長から順次支給される(この台帳で受領を管理)。

## 社長の言葉(2026-08-28・原文)
「エンディングシーン作ります。まずステージから(見せるだけのステージ)。
横長で、チュートリアルステージみたいな構造。戦場です。まず遠景」

## 確定していること
- **見せるだけのステージ**(=戦闘/進行の目的を持たない演出用ステージ)。
- **横長レイアウト・チュートリアルステージ(M0)と同じ構造**を土台にする
  (実装参照: farBackdrop 'tutorial' の専用比率・PixiStage.tsx の tut* 素材注入列・横長の帯構造)。
- **テーマ=戦場**(燃える廃都・夕暮れ・墜ちる流星と黒煙の遠景)。

## 素材台帳(受領・待ち)
| レイヤー | 状態 | ファイル | 備考 |
|---|---|---|---|
| 遠景パノラマ | **受領 2026-08-28** | `public/backgrounds/ending-far-battlefield.jpg`(2172×724・255KB) | 原本PNG 2172×724をJPG(q88)化(既存パノラマの作法・重量掟) |
| 地面 | **受領 2026-08-28** | `public/backgrounds/ending-ground.jpg`(1254×1254・415KB) | 焦土+熾火。継ぎ目実測 LR8.8/TB8.6=シームレス実用域。JPG q88 |
| 地平帯(遠景と地面の継ぎ) | **受領 2026-08-28** | `public/backgrounds/ending-horizon-ruins.png`(2172×397・806KB) | 廃墟スカイライン+夕陽の照り返し+煙。実アルファ付き(上端透過)。原本724高の透明上部327pxをトリム |
| 近景バンド | **受領 2026-08-28** | `public/backgrounds/ending-near-rubble.png`(2172×497・1.2MB) | 瓦礫・焼けた車・土嚢・街灯・火+煙。実アルファ(下端接地251)。透明上部227pxトリム |
| 前景バンド | **受領 2026-08-28** | `public/backgrounds/ending-front-rubble.png` | 折れ梁・金網・有刺鉄線の暗いシルエット。※原本は市松模様が焼き込まれた偽透過(RGB)だったため、市松2色を推定してアルファを再構築(白煙の淡部は除去=前景帯なので許容)。プレビューで抜けを確認済み |
| 黒煙アニメ | **受領 2026-08-28** | `public/backgrounds/ending-smoke-anim.png`(1428×1024=6コマ横並び・セル幅238) | 火元つき黒煙6本。原本1536×1024は列間隔が不均一だったため列検出→均等セルに再パック(stage7雲アニメと同じ「等分スライス」で使える形)。実アルファ付き |

## 実装状況(仮組み・v0.25.4029〜)
**「見せるだけ」の中身を確定して実装した**: プレイヤーが歩けるだけ。敵0・湧き0・イベント0・NPC0・
目的なし。HUDは現行のまま(社長指示2026-08-28)。本番の入り口(勝利後遷移等)は未着手=下記★未決。

- **ステージ定義**: `src/data/campaign.ts` の `stage-ending`(`kind:'ex'` + `hidden:true` = stage-ex2と
  同じ作法でミッション一覧に一切出さない)。`farBackdrop:'ending'` / `nearHorizon:'ending'`。
- **横長の移動可能帯**: `src/world/playableArea.ts` の `clampRectToPlayableArea` で
  `farBackdrop==='tutorial'` の分岐に `'ending'` を相乗り(M0と同じ ±100px の帯。前進壁
  `m0AdvanceLimitX` はM0台本専用値なのでエンディングでは誰もセットせず自然に無効)。
- **素材注入**: `src/pixi/stageTextures.ts`(`SORTIE_STAGE_TEXTURE_PATHS`+`STAGE_TEXTURE_GROUPS.ending`+
  `NEAR_HORIZON_TEXTURES.ending`+`stageTextureSkin.ts`)→ `src/pixi/PixiStage.tsx`(位置結合の分割代入に
  `endFar/endGround/endHorizon/endNear/endFront/endSmoke`を追加・出撃ステージがendingの時だけロード=
  既存の`neededStageTextures`の仕組みに乗せただけ)→ `src/pixi/pixiScene.ts` の
  `setFarBackdropTexture/setGroundOverride/setHorizonOverride/setNearHorizonTexture/setFrontOverride`
  にキー`'ending'`で注入。
- **描画の専用比率**: 遠景の縦比率(`farBackdropHeight`)・地平帯Y・前景Yオフセット等は
  **tutorial専用値を流用せず、city/stage5と同じ既定の汎用ロジックへ素通し**にした(実寸確認の結論=
  戦場パノラマ2172×724はtutorialの洞窟専用比率を要さない・不要な特殊分岐を増やさない)。
- **夜の暗転(ENV_TINT)を掛けない**: `pixiScene.ts` の `this.daylight` に `farBackdrop==='ending'` を
  city同様に加えた(遠景/地面/地平帯/近景/前景の全レイヤーが夕暮れ素材の色をそのまま出す)。
- **城の構造物**: `syncCastle` の「チュートリアルは城を出さない」分岐に `'ending'` を追加(見せるだけの
  戦場にボス城のランドマークは不要)。
- **黒煙アニメ(仮配線)**: `pixiScene.ts` に `setEndingSmokeAnim`+`applyEndingSmoke`(社長提供
  `ending-smoke-anim.png`・6コマ横並びをstage7雲アニメと同じ等分スライスで切り出し)。地平帯の上・
  近景帯の下(tutorialの岩間霧と同じ挿入位置)に3本、位相をずらした単純ループ(フェード/下降波なし=
  最小実装)。本数・位置(`ENDING_SMOKE_X_FRACS`)・高さ・速度は全部叩き台コメント付き定数
  (`?esmokeperiod=` 等で調整可)。**演出の作り込み(本数・動き・タイミング)は★未決のまま**。
- **敵/湧き/イベントの全停止**: `src/hooks/useGameLoop.ts` に `endingStage`
  (`farBackdrop==='ending'`)を新設し、`tutorialStage`が既に揃えていた抑止ゲート(通常湧き2経路・
  城ボス・囲い/紅き夜イベント・ハンター・死神・賞金首・叫喚型ディレクター・弾薬エアドロップ・武器箱
  補給)に同じ条件で相乗り(専用ゲートを新設せず既存の網羅的な消去法に従った=CLAUDE.md実装精度の
  規律7)。`puzzleActiveNow`/`gateFireOk`の定義自体に`!endingStage`を足したので、そこから連鎖する
  副次ゲート(叫喚型ディレクター含む)も一括で止まる。
- **NPC0/寄り道POI0**: `src/store/gameStore.ts` の `escortRoster`(護衛4人)・`detourVisible`
  (病院/武器庫/警察署)・`baseSites`(4拠点制圧)に `farBackdrop==='ending'` を追加して空にした。
  木/松明/緑卵も `setTreesDisabled`/`setTorchesDisabled`/`setMinesDisabled` に相乗りさせて出さない。
- **直行パラメータ `?ending=1`**: `src/App.tsx` に既存の `?smoke=1&stage=<id>` 直行と同型の
  `useEffect`(タイトル/メニュー全skip→`setSelectedStageId('stage-ending')`→`startGame`)を追加。
  `?ending=1&class=mage` のようにクラス指定も可(`?smoke`と同じ書式)。

## ★未決(次に詰める)
- **本番の入り口**(どこから遷移するか: エンディング分岐? 資料室? 勝利後?)。今回は開発用の
  `?ending=1` のみで、本編導線には未接続。
- 演出の中身(登場人物・カメラワーク・尺・黒煙以外の動く物があれば)。
- BGM/SE(現状は既定BGMにフォールバック=専用曲は未指定)。
- 黒煙アニメの仕上げ(本数・配置・速度・フェード等の演出作り込み。現状は叩き台の単純ループ)。

## 演出仕様v1(社長指示2026-08-28・監査前・実装待ち)
社長の言葉: 「元々いるヘルメットの兵士たちを右から左に歩かせて、ループで何人も。歩いて、立ち止まって
左に向かって銃を撃つ。これを繰り返す兵士たちを何人も。不規則に歩いていく様に並べて。
フィルはそのステージを左から右にカメラ共に歩いていく予定。」+「ヘルメット兵士はチュートリアル
ステージで使われてる」(=素材特定済み: `rescue/shooter-0/1`・92×120・2コマ歩行。護衛軍人/M0随行と同じ絵)。

- **兵士たち**: `rescue/shooter` を使い、**右→左へ歩く・ループで何人も**(右画面外から入り、
  左画面外へ抜けたら再利用=プール)。
- **各兵士の行動ループ**: 歩く → 立ち止まる → **左(画面外の戦場)へ向けて発砲**(マズルフラッシュ+
  薬莢+SE・発数は個体乱数・叩き台) → また歩く。
- **不規則**: 歩行時間・停止時間・発砲数・歩速・Y位置(帯内)を個体ごとに乱数で散らす(行進にしない)。
- **フィル**: **左→右へ自動歩行・カメラ随伴**(プレイヤー操作なし=「プレイヤーもいない見せるだけ」の
  裁定どおり。仮組みの操作プレイヤーは演出実装時に差し替え)。兵士たちと逆行してすれ違う構図。
  ※実在確認: フィルの「人間形態の歩行素材」は現状リポジトリに無い(あるのはEXボス絵 phill.png・
  ポートレート)。**歩けるフィルの素材(横向き歩行2〜3コマ)が必要=社長へ依頼**。届くまでの
  仮実装はプレイヤー歩行絵で代替可(叩き台)。
- **フィルの素材(受領 2026-08-28)**: 歩行3コマ=`public/sprites/npc/phill-walk-0..2.png`/
  **救護(倒れた兵士に薬を取り出す)6コマ**=`public/sprites/npc/phill-heal-0..5.png`
  (シートから列検出で切り出し・ドット等倍・上トリムのみ・下端=接地)。
- **★新要素(素材から判明)**: フィルは道中の**倒れている兵士**の所で立ち止まり、鞄から薬を取り出して
  救護する(かがみ→取り出し6コマ)。⇒ **「倒れている兵士(寝姿)」の絵が必要=社長へ依頼**
  (現状rescue/shooterは立ち歩き2コマのみ。仮実装はshooterを回転して寝かせる叩き台で進められる)。
- **尺・終わり方・文字・BGM**: ★未決のまま(後日)。

## 裁定追記(2026-08-28)
- 「実際はプレイヤーもいない見せるだけのシーンですが、一旦(歩ける仮組みでよい)」=最終形は
  プレイヤー不在・操作なしの観賞シーン。`?ending=1`の歩ける形は確認用の一時措置。

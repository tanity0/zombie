# M2(stage-2・PHILL研究所)横長廊下+視線切りステルス仕様

社長承認v0.25.2175・実装と同時に確定。

対象: `stageTheme === 'lab'`(stage-2「研究所跡」)の屋外スクロール("野外ラボ")経路。
`indoorMode`(手書きグリッド迷路・`src/world/labMap.ts`)は campaign.ts の明示コメントどおり
このステージでは不採用のため対象外(将来用に残置)。

## 1. 上下固定(M0式クランプ)
- 新定数 `LAB_CORRIDOR_Y_LIMIT_PX = 100`(`src/store/gameStore.ts`)。
- プレイヤー中心Yを ±100px に数値クランプ。X方向は無制限(現状のまま)。
- 実装はM0チュートリアルの前例(`TUTORIAL_MOVE_Y_LIMIT_PX` クランプ)を `labTheme` 分岐で複製。
- 対象はプレイヤーのみ。敵は対象外(自由に動ける)。
- 実装箇所: `updatePlayer` 内、壁解決の直後・囲いイベントクランプの前(チュートリアルクランプの直後)。

## 2. 壁の小型化+密度均一化(`src/world/labWalls.ts`)
- 壁バー幅: 150 → **90**(奥行22は不変)。`WALL_RUN_SPACING`(150・中心間隔)は不変。
- `isDeepCell`/`LAB_DEEP_Y` による密度勾配(通常帯1〜5本・deep帯6〜13本)を**廃止**。
  生成対象セル(下記)全域で **区画あたり1〜3本**(`runLen = 1 + Math.floor(hash*3)`)に統一。
- 生成範囲: セル中心 `|Y| ≤ LAB_DEEP_Y(=900)` のみ(廊下帯の視線に関わる範囲)。
  それを超える奥のセルは壁を生成しない(プロップ/UVバーは元々この境界で既に生成を止めていたので
  今回で3者とも同じ境界に統一)。
- 役割は「通行障害」ではなく「視線切り遮蔽」。
- **廊下(±100帯)を横に完全封鎖しないかの確認**: 壁のY配置式(`footY = cy*LAB_ZONE + LAB_ZONE*(0.3+0.4*hash)`)
  は未変更。footRect はY=footYを矩形の**下端**とする(`src/world/obstacles.ts` の `footRect` 規約)ため、
  廊下に隣接する2セル(`cy=0`→footY∈[270,630]、`cy=-1`→footY∈[-630,-270])のいずれでも壁矩形の
  Y範囲は `[foot-22, foot]` で **|Y|≥248** に収まり、±100の廊下帯には物理的に重ならない。
  → 幅90化・密度1〜3化のいずれもこの不変条件を壊さない(Y配置式は触っていない)ため、
  **追加のブロッキング防止ルールは不要と確認済み**(数式で証明済み。上記の値のいずれかを
  変更する場合は再確認が必要)。

## 3. ヘッドショット応戦の高さ
- ±100幅(合計200px)で開始。**追加変更なし**(狙いにくければ後で定数調整、の社長合意どおり)。

## 4. 見失い(新挙動・`src/utils/labStealth.ts`)
- 旧 `isLabOffscreenLost`(画面外で即再休眠)を**廃止**。新関数 `evaluateLabLoseSight` に置き換え。
- 覚醒中の `lab-zombie*` が次のいずれかの状態になったら「見えていない」:
  - `segmentBlocked`(既存・`labWallRects`+`labPropRects`)で視線が遮られている、または
  - プレイヤーとの距離 `> LAB_LOSE_SIGHT_RANGE(=450)`。
- 「見えていない」が `LAB_LOSE_SIGHT_MS(=1000)` ms 継続したら `dormant=true` に戻る。
- ヒステリシス: 覚醒=300px+LOS(既存・不変) / 見失い=450px+LOS切れ1秒継続。
- 継続時間の計測は敵ごとのフィールド `enemy.losLostSince`(見えなくなり始めた `gameTime`。
  見えている間は `undefined`)。純関数の入出力: 入力=LOS遮断有無・距離・`losLostSince`・`now`
  → 出力={ shouldDormant, losLostSince(更新後) }。呼び出し側(`gameStore.updateEnemies`)が
  `segmentBlocked`/距離を計算し、返ってきた `losLostSince` を敵に書き戻す。
- 覚醒条件(300px+LOS)は不変。

## 固定配置の整合確認
`stageTheme==='lab' && !indoor` の書類/ガード(`gameStore.ts` の `labDoc`/`mkGuard` 生成箇所)を確認。

| 要素 | 旧 | 新 | 備考 |
|---|---|---|---|
| 書類(labDoc.y・クリアアイテム兼ガード基準) | `-400 + rand()*800`(range ±400) | `-30 + rand()*60`(range ±30) | Xは不変(`side*(6000+rand*1800)`) |
| ガード lab-zombie-3(labDoc.y) | range ±400 | range ±30 | Xは不変 |
| ガード lab-zombie-2(labDoc.y - 70) | range [-470,330] | range [-100,-40] | Xは不変 |
| ガード lab-zombie-1(labDoc.y + 70) | range [330,470] | range [40,100] | Xは不変 |

新レンジは「書類 ±30」を基準に、ガードの ±70 オフセットを足しても両端がちょうど ±100 に収まるよう
逆算した最小の範囲(Yのみ変更・Xは触っていない)。

## 調整ノブ一覧
| 定数 | 値 | 場所 |
|---|---|---|
| `LAB_CORRIDOR_Y_LIMIT_PX` | 100 | `src/store/gameStore.ts` |
| 壁バー幅(`H_LEN`) | 90 | `src/world/labWalls.ts` |
| 壁の奥行(`H_DEPTH`) | 22(不変) | `src/world/labWalls.ts` |
| 区画あたりの壁本数 | 1〜3(`1 + hash*3`) | `src/world/labWalls.ts` `labWallsInRegion` |
| 壁生成レンジ(セル中心) | `|Y| ≤ LAB_DEEP_Y(900)` | `src/world/labWalls.ts` |
| `LAB_LOSE_SIGHT_RANGE` | 450 | `src/utils/labStealth.ts` |
| `LAB_LOSE_SIGHT_MS` | 1000 | `src/utils/labStealth.ts` |

## 受け入れ条件
- `player.y`(中心)がプレイ中常に `[-100, 100]` の範囲に収まる(敵は対象外)。
- 壁バーの幅が90pxで描画され、区画あたり1〜3本、セル中心 `|Y|>900` の区画には壁が無い。
- 覚醒中のlab-zombieについて、LOS遮断 or 距離>450 の状態が1秒未満なら覚醒を維持し、
  1秒以上継続したら dormant に戻る。1秒未満で再度見えた場合はタイマーがリセットされ
  再休眠しない。
- 書類・3体のガードのY座標が常に `[-100, 100]` の範囲内で生成される。

## ★未決事項(実装チャットでは判断せず記録のみ・設計チャット/社長裁定待ち)

### ★1: 「PHILL弾3箇所」固定ピックアップは現在のstage-2(屋外)経路に存在しない
指示書は「gameStore.ts 9975-9990行付近のlab固定要素(PHILL弾3箇所・書類/ガード・クリアアイテム等)」
のY座標確認を求めているが、調査の結果 **`LAB_AMMO_PICKUPS`(PHILL弾3箇所・`src/world/labMap.ts`)は
`indoorMode` 専用の初期配置(`gameStore.ts` の `runPickups` の `indoor ? [...] : ...` 分岐)にのみ
使われており、stage-2は `campaign.ts` の明示コメント「屋内迷路モード indoor は本作では不採用。
indoorMode 基盤は将来用に残置するがこのステージでは使わない」のとおり `indoor=false` で走る**。
そのため屋外(stage-2実運用)経路には固定PHILL弾ピックアップは存在せず(PHILL弾は武器商人からの
購入のみ・`gameStore.ts:6229`)、確認対象は実質「書類(labDoc)+ガード3体+クリアアイテム
(labDocument・書類と同一座標)」のみだった。上表のとおりこれらのYは帯内に収めた。
`LAB_AMMO_PICKUPS` 自体(indoor専用データ)は変更していない。
**PHILL弾の固定配置を屋外stage-2に新設すべきかは設計判断のため何もしていない。**

### ★2(重要度: 高): 武器商人が新クランプ後に到達不能になる
`createWeaponMerchant()`(`gameStore.ts:500`、`x:0, y:-130`)は **全ステージ共通**(屋内/チュートリアル
以外の全出撃で使用)の固定配置で、`MERCHANT_INTERACT_RADIUS=58`。今回追加した
`LAB_CORRIDOR_Y_LIMIT_PX=100` クランプ下では、プレイヤー中心Yは `[-100,100]` までしか届かないため、
商人への必要距離(`|y-(-130)|≤58` → `y∈[-188,-72]`)と交わらず、**stage-2では商人に一生近づけない**。
研究所は「商人はPHILL弾のみ販売」「武器商人がPHILLガンを無料配布」(`gameStore.ts:6229/6235`)の
唯一の入手経路なので、これはPHILL銃/弾を一切入手できずステージが事実上詰む可能性がある。
この関数は他の全ステージ(forest等)でも共用のため、**Yを直接書き換えると他ステージの商人位置が
変わってしまい「Aを直してと言われたらAだけ直す」規律に抵触する**ため実装チャットでは変更していない。
対応案(例・要社長裁定):
  (a) `labTheme` 専用の商人配置(例: `y: 0` 付近)を新設し、他ステージは `createWeaponMerchant()` のまま。
  (b) `labTheme` のときだけ `MERCHANT_INTERACT_RADIUS` を拡張する。
  (c) その他。
**この★未決は本バッチの受け入れ条件に含まれていなかったため実装は保留し、最終報告で最優先に共有する。**

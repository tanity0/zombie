# ステージ難度の階段(育成前提の後半再バランス)v1(2026-08-20)

★優先規則: 本書内で記述が食い違う場合は「# v2 実装設計(発注文)」が勝つ(v1は裁定の経緯)。

## ゴール(社長の言葉のまま・2026-08-20)
「まず小ボスはステージで分けて、強さを階段にする。
1はバス停でそのまま/2は馬乗りで/3は鋏/4は舞妓。
階段は今後の雑魚と同じ倍率で強く。
雑魚はHPと攻撃力が増える。なので案が近い(=雑魚用ステージ係数の新設=案2)。
小ボスやその他ボスもそれに伴い強化する」

前提(確定済み): 育成(v0.25.3661)の導入に伴う再調整。受け入れ条件の下限=
**無育成+カウンターサイクル習熟で突破可能**(GROWTH.md・社長原則)。

## 裁定の整理
1. **小ボス(賞金首)はローテ廃止→ステージ固定割当**(社長修正2026-08-20
   「小ボスは1 3 4 5だけ。6は小ボス無し」——S2はラボ=元々対象外、割当は強さ順にずらす):
   - stage-1 = バス停(bounty-ranged)…現状のまま
   - stage-3 = 馬乗り(bounty-melee)
   - stage-4 = 鋏(bounty-balance)
   - stage-5 = 舞妓(bounty-maiko)
   - **stage-6 = 小ボス無し**(湧き自体をスキップ)。stage-2/7も出さない。
   - ※現行はラン内ローテ(takeNextBountyRotationType・4種重複なし)。これをステージで固定する。
   - ※割当の並びは前裁定(バス停→馬乗り→鋏→舞妓)の順序を保ってずらした読み。違えば台帳1行で差し替え。
2. **ステージ難度係数(雑魚)を新設**(=先の案2): 雑魚の**HPと攻撃力**にステージ別倍率。
   走査の確定事実: 雑魚の強さにステージ軸は存在しない(距離+時間+色のみ)ので新しい口が要る。
3. **小ボス・その他ボス(城ボス/ゲート2/裏ボス)も同じ倍率で強化**(「階段は今後の雑魚と同じ倍率」)。

## ★係数カーブ(社長裁定 2026-08-20・HP側は確定/攻撃側は検討中)
| stage | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| **HP倍率(確定)** | **1.0** | 固定(1.0) | **1.2** | **1.4** | **1.6** | **1.8** | 固定(下記) |
| **攻撃倍率(確定・社長2026-08-20「とかかなぁ」=叩き台トーンだが数値指定)** | **1.0** | 固定(1.0) | **1.1** | **1.2** | **1.3** | **1.4** | 固定(1.0) |
- **stage-2(ラボ)と stage-7 は階段に乗せない(固定値)**(社長「2と7は固定値でいい」)。
- **stage-7 の固定分(社長裁定「7は単純にHPを第一と第2それぞれ2倍くらいに」)**:
  ラスボス(グレン)の第一・第二形態のHPをそれぞれ約2倍にする。
  ※実装はv2側が正: **台帳 STAGE_BOSS_HEALTH_BY_STAGE['stage-7'] 6000→12000 の1箇所だけ**
  (第二形態は同じ台帳を読むため自動で2倍。「第二形態も別に2倍」は24000=二重になる)。
- 攻撃力カーブは案A(半分の傾き)で社長確定(2026-08-20)。HPはしっかり階段・被ダメは緩やか
  =無育成の即死圧・カウンターのリスクを守る。数値は叩き台(実機で社長調整)。

# v2 実装設計(発注文・2026-08-20。全裁定済み)

## 台帳(src/config/stageDifficulty.ts・新規・依存ゼロの葉)
```ts
// 未掲載のステージ(stage-1/2/7/ex系)は 1.0(=現状不変)。
export const STAGE_HP_MULT:  Partial<Record<string, number>> =
  { 'stage-3': 1.2, 'stage-4': 1.4, 'stage-5': 1.6, 'stage-6': 1.8 };
export const STAGE_DMG_MULT: Partial<Record<string, number>> =
  { 'stage-3': 1.1, 'stage-4': 1.2, 'stage-5': 1.3, 'stage-6': 1.4 };
export const stageHpMult  = (stageId: string | null | undefined): number => STAGE_HP_MULT[stageId ?? ''] ?? 1;
export const stageDmgMult = (stageId: string | null | undefined): number => STAGE_DMG_MULT[stageId ?? ''] ?? 1;
```

## 雑魚への適用(取りこぼしを構造的に防ぐ形)
- **セッター方式**(`setTreesDisabled`(trees.ts:49-50)と同じ既存作法): enemyUtils にモジュール変数
  `stageDiffHpMult / stageDiffDmgMult`(既定1)と `setStageDifficultyMults(hp, dmg)` を置き、
  **resetGame が出撃のたびに1回セットする**(通常出撃=選択ステージの係数/
  **ボスメーカー・ガントレットは1.0**=育成と同じ計測路の中立化)。全出撃(通常/練習/ガントレット/
  ボスメーカー)は App.tsx:259 経由で resetGame を必ず通る=セット点は1つで足りる(監査確認済み)。
- 適用点(監査指摘2の反映): HP係数は `hpMult` に乗算。**攻撃係数は `diffDmg` 自体に乗算**——
  接触ダメージ(buildEnemy=enemyUtils.ts:636 の `damage:` 行)と**敵弾ダメージ**(645 の `difficultyMultiplier`→
  enemyUtils.ts:851 が弾生成で読む)の**両方が同時に動く**(damage:行だけに掛けると
  plant等の撃つ雑魚の弾が据え置きになる)。`fixed ? 1 : diffDmg` のガードで固定型の除外も自動。
- **CONSTANT_STRENGTH_TYPES と LAB_FIXED_TYPES には掛けない**(城ボス・賞金首・幻影・reaper・天使・
  裏ボス・idol はここを通っても係数1=下の個別適用と二重にしない。ラボ敵はS2固定=対象外)。
- **pumpkin と hunter は雑魚側の階段に乗せる**(監査指摘5の明確化): 両者は CONSTANT に入っておらず
  エリア/色でスケールする型(hunter は enemyUtils.ts:101-105 に明記)。isBossType での除外は
  **しない**——「雑魚はHPと攻撃力が増える」の雑魚スケール系に元から乗っている型はそのまま階段にも
  乗せ、個別適用はしない(二重なし)。
- speed・経験値・色ティア・時間スケーリングは**触らない**(HPと攻撃だけの階段=裁定どおり)。

## 小ボス(賞金首)
- 台帳(stageDifficulty.ts に併置): `BOUNTY_TYPE_BY_STAGE: Partial<Record<string, EnemyType文字列>>` =
  { 'stage-1': 'bounty-ranged', 'stage-3': 'bounty-melee', 'stage-4': 'bounty-balance', 'stage-5': 'bounty-maiko' }。
- **湧き判定(監査指摘6の明確化)**: 既存の `bountySpawnBlocked`(bountyTick.ts:2126-2128・
  labTheme/corridorMode/storyBossOnly)は**置き換えず残す**。その上で、湧き入口
  (useGameLoop:3967 の if→spawnBountyEncounter)に**「台帳に行が無いステージは湧かせない」を追加**
  (実際に新たに塞がるのは stage-6 の再訪/フリー周回だけ——corridorMode は本編のみ・
  gameStore:16345 `!pendingRevisit`)。S2/S7 の既存挙動は不変。
- **ローテ撤去の影響範囲(監査指摘7)**: gameStore.ts:2877-2891(shuffleBountyRotation /
  takeNextBountyRotationType / BOUNTY_ROTATION_TYPES)+storeフィールド bountyRotation
  (4975/5439/16218)+呼び出し useGameLoop.ts:4001-4002 を撤去し台帳引きへ。
  **`src/store/bountyRotation.test.ts` は台帳引きのテストに書き換える**(放置するとCIが赤)。
  `?bountynow=1`(種別未指定・useGameLoop:6252-6260 の4種ランダム)は**選択ステージの台帳を引く**
  (台帳に無いステージでは従来どおりランダム=デバッグ用の自由度を残す)。
  **★6263-6264 の `practiceBossType()` 優先は必ず残す**——練習の賞金首4枠は bountyType を持たず
  この優先で種別が決まっている。丸ごと台帳引きに置き換えると馬乗り/鋏/舞妓の練習枠が全部
  stage-1=バス停に落ちる(監査指摘)。
- 強さ: スポーン時(spawnBountyEncounter=useGameLoop:3921 の1本・HPは3941)に
  `health/maxHealth ×stageHpMult`・`damage ×stageDmgMult`
  (既存の bountyEffectiveValueMult とは乗算で重なる=どちらも「基準値への倍率」)。
  **★攻撃係数で動くのは接触ダメージ(combatTick:1053 の enemy.damage)だけ**——賞金首の技は
  bountyScript の専用定数(sweep25/leap22/whip360=12/snipe22/shot10/laser24等)で enemy.damage を
  通らない=**据え置き**(城ボス・天使も技ごとにまちまち。g-*系は boss.damage を渡すので動く)。
  技定数まで階段に乗せるかは実機後の個別裁定(本発注では触らない)。
- 練習(ボスモード)の賞金首枠: **特別な分岐を書かない**(監査指摘10)。練習枠の出撃先は stage-1
  (bossPractice.ts:202-216)で getSelectedStageId が枠の stageId を返すため、台帳を引けば自動で1.0。
  掲載裁定「基準値2000を出す」も従来のまま成立する。

## その他ボス(スポーン時に個別乗算・ステージ固定なので一意)
- **★裁定待ち(監査指摘4=構造の明示)**: ボスHP台帳は**既にステージ階段**
  (城3500→5500/天使5000→9000/裏ボス14000→22000)なので、係数を掛けると**階段×階段**になる
  (例: S6スリィエル 9000×1.8=16200・S5トール 22000×1.6=35200)。掛けるか(推薦)/掛けないかは
  下の★残裁定。以下は「掛ける」前提の記述。
- **城ボス(giantbat)**: HP上書き行(useGameLoop **2668** の `stageBossHealthFor(...)`)に×stageHpMult、
  `damage` に×stageDmgMult。ストーリーボス(**2756**)も同様。
- **ゲート2ボス(天使)**: スポーン箇所は**2つ**(監査指摘3)——本編の自然発火(useGameLoop **3028**)と
  **練習/デバッグ経路(4767・?gateboss/practiceForces)**。**両方**に health/maxHealth×stageHpMult・
  damage×stageDmgMult。裏ボスは1箇所(**4822**・自然/強制共通)。stage-ex1 は表未掲載=1.0。
  **ボス→ステージの対応は既存の正本を引く**(監査指摘9・表を2本にしない):
  天使=gateBoss.ts の `stageIdForGateBoss`/裏ボス=bossPractice.ts の `stageIdForHiddenBoss`
  (**非exportなのでexportする**)。設計書内の「rafi=S4…」の列挙は説明であって写経先ではない。
  practiceBossHealth の表示も同じ係数を掛ける(「練習画面の表示と実戦が原理的に一致する」を保つ)。
- **stage-7 グレン(固定分・監査指摘1の訂正)**: 第二形態(useGameLoop **2836**)は
  **第一形態と同じ台帳エントリ(stageBossHealthFor('stage-7'))を読む**ため、
  **台帳 STAGE_BOSS_HEALTH_BY_STAGE['stage-7'] を 6000→12000 にするだけで両形態が2倍になる**
  (「台帳2倍+第二形態も2倍」と実装すると第二形態が24000=二重)。攻撃力は据え置き。
- **計測路(監査指摘8の明確化)**: ボスメーカー/ガントレットでは**ボスの個別係数も掛けない(1.0)**
  ——育成と同じ「計測の基準を動かさない」原則(TTKの過去ログと比較可能に保つ)。
  実装: 個別乗算の係数取得を1本のヘルパ `stageBossDiffMults()` に集約し、その中で
  `isBossMakerRun() || isGauntletRun()` なら1.0を返す(掛け忘れ/掛けすぎの分岐を散らさない)。
  **置き場所=新規 `src/utils/stageDiffMults.ts`**(import は config/stageDifficulty・bossTest・
  gauntletMode の3つ=いずれも葉。台帳 config/stageDifficulty.ts の「依存ゼロの葉」宣言は保つ。
  bossPractice→このヘルパ、gameStore→bossPractice の並びでも循環なし)。
  **表示(practiceBossHealth→BossRush一覧)は常に係数込み**(プレイヤーが見る実戦の値)。
  ガントレットは一覧表示を持たないため矛盾は生じない——不変条件テストの「表示=実戦の一致」は
  **通常経路(非計測路)に限定**して書く。
- 技ごとの専用ダメージ定数(mimirレーザー42・jibril火30・idol弾20・skadi氷38/20等)は
  **enemy.damage を通らない**ため、この係数では動かない=**据え置き**(触らない。
  動かすかは実機後の個別裁定)。

## 残裁定 → **案Aで確定(社長裁定2026-08-20「案A」)**
- **既存のボスHP台帳に新係数を掛ける(階段×階段)**。既存台帳の傾き=元の設計、
  新係数=育成への対抗の上乗せ、と役割が別。実効例: S6スリィエル 9000×1.8=16,200・
  S5トール 22,000×1.6=35,200・S5城ボス 5,500×1.6=8,800。数値は台帳/係数のどちらでも実機調整可。
- **これで全裁定が揃った=監査通過後に実装バッチ発注可。**

## 不変条件テスト(同コミット)
- 台帳: HP/攻撃とも掲載ステージで単調増加・S1/S2/S7/ex は1.0。
- 雑魚: セッター1.0のとき buildEnemy の結果が現行と完全一致/係数セット時に
  CONSTANT_STRENGTH_TYPES・LAB_FIXED_TYPES の実効値が動かない。
- 賞金首: 台帳の4割当・S6で湧かない・係数がHP/damageに乗る。
- 計測路: ボスメーカー/ガントレットの resetGame 後はセッターが1.0。
- 練習: 天使/裏ボスの practiceBossHealth = 実戦スポーン値(係数込みで一致)。
  **通常経路(非計測路)に限定**して検証する(ガントレット中は実戦=1.0/表示=係数込みで
  一致しないのが仕様——表示は常に「プレイヤーが見る実戦の値」)。

## 性能
負荷 1/10(スポーン時の乗算のみ・per-frameゼロ)。

# ステージ難度の階段(育成前提の後半再バランス)v1(2026-08-20)

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
  ラスボス(グレン)の**第一形態・第二形態のHPをそれぞれ約2倍**にする(係数ではなくHP台帳の変更。
  第一形態=STAGE_BOSS_HEALTH_BY_STAGE['stage-7'] 6000→12000/第二形態=useGameLoop 2834 の値を2倍)。
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
- **セッター方式**(`setTreesDisabled` と同じ既存作法): enemyUtils にモジュール変数
  `stageDiffHpMult / stageDiffDmgMult`(既定1)と `setStageDifficultyMults(hp, dmg)` を置き、
  **resetGame が出撃のたびに1回セットする**(通常出撃=選択ステージの係数/
  **ボスメーカー・ガントレットは1.0**=育成と同じ計測路の中立化)。
  spawn経路(25箇所以上)のシグネチャは触らない=渡し忘れが構造的に起きない。
- 適用点は `buildEnemy` の2行だけ: `hpMult`(現 areaBase×COLOR_TIER_HP×ENEMY_HP_MULT)に×HP係数、
  `damage = round(stats.damage × diffDmg)` に×攻撃係数。
- **CONSTANT_STRENGTH_TYPES と LAB_FIXED_TYPES には掛けない**(ボス・賞金首・幻影・reaper・天使・
  裏ボス・idol はここを通っても係数1=下の個別適用と二重にしない。ラボ敵はS2固定=対象外)。
- speed・経験値・色ティア・時間スケーリングは**触らない**(HPと攻撃だけの階段=裁定どおり)。

## 小ボス(賞金首)
- 台帳(stageDifficulty.ts に併置): `BOUNTY_TYPE_BY_STAGE: Partial<Record<string, EnemyType文字列>>` =
  { 'stage-1': 'bounty-ranged', 'stage-3': 'bounty-melee', 'stage-4': 'bounty-balance', 'stage-5': 'bounty-maiko' }。
- 湧き判定: **表に無いステージ(2/6/7/ex)は賞金首を湧かせない**。
  ローテ(takeNextBountyRotationType+storeフィールド)は撤去(死コードを残さない。台帳引きへ)。
- 強さ: スポーン時に `health/maxHealth ×stageHpMult`・`damage ×stageDmgMult`
  (既存の bountyEffectiveValueMult とは乗算で重なる=どちらも「基準値への倍率」)。
- 練習(ボスモード)の賞金首枠: 掲載裁定「基準値2000を出す」は据え置き(練習はステージ文脈が無いため
  係数を掛けない=従来どおり。表示との一致も従来のまま)。

## その他ボス(スポーン時に個別乗算・ステージ固定なので一意)
- **城ボス(giantbat)**: HP上書き行(useGameLoop 2666 の `stageBossHealthFor(...)`)に×stageHpMult、
  `damage` に×stageDmgMult。ストーリーボス(2753)も同様。
- **ゲート2ボス(天使)/裏ボス**: スポーン時に health/maxHealth×stageHpMult・damage×stageDmgMult
  (rafi=S4・uri=S5・suriel=S6/skadi=S4・thor=S5 等。stage-ex1 は表未掲載=1.0)。
  ボス練習(ボスモード)は**当該ボスの所属ステージの係数を適用**し、practiceBossHealth の表示も
  同じ係数を掛ける(「練習画面の表示と実戦が原理的に一致する」不変条件を保つ)。
- **stage-7 グレン(固定分)**: STAGE_BOSS_HEALTH_BY_STAGE['stage-7'] **6000→12000**+
  第二形態(useGameLoop 2834)のHPを**2倍**。攻撃力は据え置き。
- 技ごとの専用ダメージ定数(mimirレーザー42・jibril火30・idol弾20・skadi氷38/20等)は
  **enemy.damage を通らない**ため、この係数では動かない=**据え置き**(触らない。
  動かすかは実機後の個別裁定)。

## 不変条件テスト(同コミット)
- 台帳: HP/攻撃とも掲載ステージで単調増加・S1/S2/S7/ex は1.0。
- 雑魚: セッター1.0のとき buildEnemy の結果が現行と完全一致/係数セット時に
  CONSTANT_STRENGTH_TYPES・LAB_FIXED_TYPES の実効値が動かない。
- 賞金首: 台帳の4割当・S6で湧かない・係数がHP/damageに乗る。
- 計測路: ボスメーカー/ガントレットの resetGame 後はセッターが1.0。
- 練習: 天使/裏ボスの practiceBossHealth = 実戦スポーン値(係数込みで一致)。

## 性能
負荷 1/10(スポーン時の乗算のみ・per-frameゼロ)。

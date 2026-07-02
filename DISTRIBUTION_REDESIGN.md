# 分布図再構築(ハイブリッド)設計書 — Sonnet実装用ハンドオフ

社長承認済みの方針(v0.25.1292時点のチャットで合意):
**「距離=土台(強さ倍率・レア基礎率・構成の基礎)/台本+AI=その上の演出(構成上書き・レア増減・数・速度)」**。
距離の全廃はしない。この文書は実装者(Sonnet)がこのまま作業できる粒度で書く。

## 0. 変えないもの(触るの禁止)
- `AREA_BASE_DIFFICULTY = [1.0, 1.2, 1.45, 1.75, 2.1]`(距離→強さ倍率。探索リスクの本体)
- `COLOR_TIER_MULT`(青1.2/紫1.5/赤2)、レアのサイズ倍率(青1.1/紫1.2/赤1.3)
- `COLOR_RATE_BY_AREA` の基礎値そのもの(レアの土台は距離のまま)
- plant同時2体キャップ / werewolf同時2体キャップ(v0.25.1291)
- 緩シーンの zombie 抑制(`suppressed:['zombie']`×0.4、v0.25.1291)
- 台本 `PHASES`(時刻・countCap・フェーズ構成)
- エリア境界(0-1500/3000/5000/7500)と `areaIndexForPos`

## 1. 変更① シーンのfeaturedはエリア制限を突破できる(無双シーンの骨抜き解消)

### 問題
`AREA_WEIGHT` で bat はエリア2以降・skeleton はエリア3以降が重み0。featured は乗算バイアス
(×2.5)なので 0×2.5=0 のままで、中盤以降(プレイヤーはほぼエリア2+)の無双シーン
(`SCENE_MOWDOWN`: bat/skeleton 主役)が意図した「弱雑魚を高速大量」を出せていない。
relief-pumpkin(エリア0-2ではpumpkin重み0)も同様。

### 仕様
- `src/utils/enemyUtils.ts` の `selectEnemyType`:
  featured 指定された型は、エリア補正を `Math.max(areaWeight, FEATURED_MIN_AREA_WEIGHT)` で
  評価する(エリアで0でも床0.5で出現可能)。featured でない型は従来どおり(0なら候補外)。
  ```ts
  const FEATURED_MIN_AREA_WEIGHT = 0.5; // featured限定のエリア床(シーン中だけの特例)
  // pool の map 内:
  const areaW = (AREA_WEIGHT[type]?.[area]) ?? 0;
  const effAreaW = featured.includes(type) ? Math.max(areaW, FEATURED_MIN_AREA_WEIGHT) : areaW;
  ```
- **距離リサイクルとの整合(重要・ghostバグの再発防止)**: エリア外の型をシーンで湧かせると、
  既存の「エリア不適合→5秒で強制回収」に即座に消される。対策:
  - `src/types/game.ts` の `Enemy` に `sceneSpawn?: boolean` を追加。
  - `buildEnemy`(enemyUtils)で、選ばれた型が `isValidForArea(type, spawnArea)===false` の時だけ
    `sceneSpawn: true` を立てる(通常スポーンにはフラグを付けない=挙動不変)。
  - `useGameLoop.ts` の距離リサイクルの「エリア不適合の強制回収」判定で
    `enemy.sceneSpawn` なら免除(reaper/ghost/boss の `preserveEnemyState` と同じ箇所。
    ただし preserveEnemyState に足すのではなく、エリア不適合チェック側で
    `!enemy.sceneSpawn` を条件に足す)。画面外に離れた時の通常回収は従来どおり効く
    (=シーンが終われば自然に掃ける)。

### 想定挙動の確認値(実装後に手元で概算チェック)
- 深部(エリア3)での mowdown: bat 100×0.5×2.5=125 / skeleton 55×0.5×2.5≈69(※変更②適用後は
  床でなく実重みを使う)で、チャフが選択プールの過半になること。
- エリア0での relief-pumpkin: pumpkin 22×0.5×2.5=27.5 ≒ プール全体の約15%(「練習に時々1体」)。

## 2. 変更② AREA_WEIGHT v2(分布図の再構築)

### 設計原則
1. **全エリアに「刈れる雑魚(チャフ)」を最低限残す**。深部でチャフが完全消滅すると、キル
   フロー(コンボ/XP/爽快感)が枯れ、緩シーンも重い敵だらけで休憩にならない(社長報告:
   「ゾンビ固いので緩の時に多数はやめて」の根本原因の一つ)。
2. 深さの恐怖は「重い型の**比率**」と「強さ**倍率**(AREA_BASE_DIFFICULTY)」で出す。
   チャフの絶滅で出さない。
3. zombie は「固い壁」役。中域まで主力、深部では比率を下げる(固い雑魚の飽和防止)。

### 新テーブル(`src/utils/enemyUtils.ts` の `AREA_WEIGHT` を差し替え)
```ts
const AREA_WEIGHT: Partial<Record<EnemyType, number[]>> = {
  bat:      [1.0, 0.7, 0.35, 0.25, 0.2 ], // 旧 [1.0,0.7,0,0,0]   深部にも少量のチャフ
  skeleton: [1.0, 1.0, 0.8,  0.5,  0.35], // 旧 [1.0,1.0,0.8,0,0]
  zombie:   [0.6, 1.0, 1.0,  0.9,  0.7 ], // 旧 [0.6,1.0,1.0,1.0,0.8] 深部で比率減
  plant:    [0,   1.0, 1.0,  1.0,  1.0 ], // 変更なし(同時2キャップ済み)
  ghost:    [0,   0,   0.8,  1.0,  1.1 ], // 変更なし
  werewolf: [0,   0,   0.7,  1.1,  1.2 ], // 変更なし(同時2キャップ済み)
  pumpkin:  [0,   0,   0,    0.1,  0.3 ], // 変更なし
  lich:     [0,   0,   0.7,  1.1,  1.2 ], // 変更なし(ステージ4限定ゲートも従来どおり)
};
```
- 副次効果: bat/skeleton が全エリア有効になるため、`isValidForArea` による深部での強制回収も
  自然に起きなくなる(変更①のフラグは pumpkin 系シーン等のために依然必要)。
- 深部の「怖さ」はゾンビ0.7でも倍率2.1倍が掛かるので維持される。体感が緩すぎたら
  bat/skeleton の深部値(0.2/0.35)を下げる方向で実機調整(この2値が調整ノブ)。

## 3. 変更③ レアのシーン/Rank連動(基礎=距離、演出=AI)

### 仕様
- `src/utils/difficultyDirector.ts` の `SpawnScene` に `rareMult?: number` を追加(省略=1)。
  シーン定義:
  | シーン | rareMult | 意図 |
  |---|---|---|
  | relief-sparse / relief-pumpkin / relief-wolf | **0** | 緩ではレア無し(休憩を汚さない) |
  | mowdown | **0.5** | 無双の群れに時々1体の青は良いスパイス |
  | gate-pumpwolf / gate-mass-ranged | **1.2** | 山場の顔 |
  | gate-chaos | **1.35** | クライマックスの顔 |
  | boss | **1.0** | 素のまま |
- `src/utils/directorRank.ts` の `RankAdjust` に `rareBoost` を追加:
  rank0=0 / rank1=0.15 / rank2=0.3。**rareMult が 1 以上のシーン(=山場)でのみ**
  `(1 + rareBoost)` を乗算する。緩(0)は0のまま=Rankが高くても休憩は休憩。
- `src/utils/enemyUtils.ts` の `rollColorTierForArea(area, esc)` に第3引数 `rareMult = 1` を追加。
  基礎率(COLOR_RATE_BY_AREA)に `rareMult` を乗じてから従来の esc ブーストと
  `DDA_COLOR_SUM_CAP(0.85)` クランプを適用する(クランプは既存のまま流用)。
  `rareMult=0` なら色付きは一切出ない。
- `buildEnemy` / `generateEnemy` に `rareMult = 1` パラメータを追加して貫通させる
  (`forcedType` 指定の特殊スポーン=screamer/ハンター/ボス等は従来どおり触らない。
  これらは rollColorTierForArea を通っても fixed 型なので影響なし、が現状仕様のはず。
  実装時に fixed 判定を確認すること)。
- `src/hooks/useGameLoop.ts` のスポーナ:
  ```ts
  const sceneRareBase = scene ? (scene.rareMult ?? 1) : 1;
  const sceneRareMult = sceneRareBase >= 1
    ? sceneRareBase * (1 + rankAdj.rareBoost)   // 山場のみRankで増幅
    : sceneRareBase;                             // 緩(0)/無双(0.5)はそのまま
  ```
  を generateEnemy へ渡す(屋内/ラボ/シーン無効時は 1)。

## 4. テスト(同一コミットで追加・更新)
- `enemyUtils.test.ts`:
  - featured 床: エリア0で `featured:['pumpkin']` を大量試行→pumpkin が選ばれ得る。
    featured なしなら選ばれない(0のまま)。
  - AREA_WEIGHT v2: エリア3/4 で bat/skeleton が選ばれ得る(大量試行)。
  - `rollColorTierForArea(area, 0, 0)` は常に undefined(レア無し)。
    `rareMult=2` で青率が概ね2倍方向(統計テストは緩め or 内部重みを直接検証できる形に)。
  - `isValidForArea` が bat/skeleton 全エリア true になること。
- `directorRank.test.ts`: rank0/1/2 の rareBoost(0/0.15/0.3)、rank0が厳密無補正のまま。
- `difficultyDirector.test.ts`: 各シーンの rareMult 値の存在(緩=0/無双=0.5/関所≥1.2)。
- `sim.test.ts` フル走行がNaN/クラッシュ無しで通ること(既存)。

## 5. 実装順(推奨)
1. 変更②(テーブル差し替えのみ・独立で安全) → 検証一式
2. 変更①(featured床+sceneSpawnフラグ+リサイクル免除) → 検証一式
3. 変更③(rareMult/rareBoost 貫通) → 検証一式
※ 1コミットずつ version bump + DEVELOPMENT_LOG 追記(いつものルール)。

## 6. 実装後の実機確認ポイント(社長プレイ用)
- 中盤以降(エリア2+)の無双シーンで bat/skeleton の群れが実際に出るか(v0.25.1292以前は出ない)。
- 緩シーン中に色付き(青/紫/赤)が出ないこと。関所中は今までよりレアがやや多いこと。
- シーンで湧いたエリア外チャフが「その場で5秒後に消える」ことがないこと(sceneSpawn免除の確認)。
- 深部の体感難易度が下がりすぎていないか(下がりすぎなら bat/skeleton の深部値 0.2/0.35 を下げる)。

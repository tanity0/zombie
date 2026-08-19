# 守護霊ボス「幻影」設計 v2(監査21件反映)

## ゴール(社長の言葉のまま)
「試しに、ボスモードに守護霊の最強データを一体、ボスとして配線できる?プレイヤーと守護霊を戦わせてみたい」
(骨子=第1弾3技構成は社長「はい」=GO済み)

## 「ではない」条件(労力をかけない所)
- 第1弾: サブウェポン群・スキル群・装備効果のフル再現は第2弾
- 本編組み込み・オンライン対戦ではない/専用素材は作らない/バランス精密さは対象外(数値=叩き台)

## 決定事項(v2で確定)
- **相手=鴉(karasu)**: fixedGuardians の performance.score 最上位(77)。id/名前を固定で名指しする
  (「最上位を引く」抽選ではなく確定1体。台帳が変わったら手で差し替え)。
- **敵type名=`guardian-phantom`**(監査19: "ghost boss"は既存コードで**守護霊が戦う相手**を指す
  (GHOST_BOSS_HP_MULT等)ため逆義衝突。状態接頭辞=`gp-`)。表示名「鴉(幻影)」。
- **台帳から効かせるデータ(監査9/10)**: ①クラス立ち絵(rogue) ②名前 ③profile.preferredDist
  ④profile.counterChance/reactionMs(頭脳の反応) ⑤移動リズム(stationaryFrac等・decideGhost経由)
  ⑥snapshot.activeGunKey→銃撃ダメージの基礎値。melee/issenの寸法・ダメージは第1弾は固定値
  (見た目が読める判定を優先)。読み出しパスの正: score=`performance.score` /
  preferredDist=`profile.preferredDist` / gunKey=`profile.snapshot.activeGunKey`(監査8)。

## 方式
### 入口(監査1/5/7)
- PRACTICE_SLOTS 末尾に独立枠 `guardian-phantom@practice`・新カテゴリ **'duel'**。
  - `PracticeSlot` に **`alwaysUnlocked?: true`** を新設し、BossRush の unlocked 判定を
    `slot.alwaysUnlocked || encountered.has(...)` へ(遭遇記録の輪は既存の掟のまま断つ)。
  - `PRACTICE_CATEGORY_ORDER` 末尾へ 'duel' 追加+BossRush.tsx の `PracticeCategory` 型/ラベル表
    (「決闘」)/`categoryOf` に duel 分岐を追加(未知キーは'story'に落ちるため必須)。
  - **テスト改訂(明記・監査5/7)**: bossPractice.test の①台帳不変条件=「+bounty4+duel1」
    ②カテゴリ順sort=5値 ③「HPが引ける」= practiceBossHealth に guardian-phantom 分岐
    (=GUARDIAN_PHANTOM_HEALTH を返す)を追加。**bossHints.test**= BOSS_HINTS に幻影のヒント3行を
    追加(本文に半角数字禁止の掟)。
- 出撃: stage-1・新 PracticeParam `phantomnow`。強制スポーンは賞金首と同じ**4点セット**(監査15):
  ①モジュール定数 FORCE_PHANTOM ②`FORCE_PHANTOM || practiceForces('phantomnow')` ③force ref
  ④gameTime巻き戻しでの再アーム。
- **ガントレット除外(監査6)**: `GAUNTLET_SKIP_SLOT_KEYS` に追加(未検証ボスを自動テストへ混ぜない。
  安定後に外す)。

### 敵実体(監査3/4/12/13)
- `guardian-phantom` を EnemyType へ追加。**ENEMY_STATS**: width 40 / height 56(プレイヤー級)/
  speed=87(プレイヤー基準)/ **contact damage 0**(接触では削らない=技でのみ削る決闘仕様)/
  experienceValue 200(叩き台)。
- **HP=裏ボス方式**: `CONSTANT_STRENGTH_TYPES` に編入+`GUARDIAN_PHANTOM_HEALTH=3000` 固定
  (ENEMY_HP_MULT/エリア/色倍率を通さない。色ティア抽選対象外)。
- **ボス扱いの集合(監査4)**: `isBossType` と **`ENGAGEABLE_BOSS_TYPES`** の両方へ編入
  (HPバー/体勢値=紫/ボス引きズーム/致命の一撃はこちら由来)。ただし
  **`isGhostEligibleBoss` からは賞金首と同様に除外**(守護霊召喚/bossClock/notifyBossClear/
  duoRecords/ghostOnline の5系統へ幻影を混入させない)。年表(chronicle)にも載せない
  (triggerDramaticDeathの対象判定に幻影の除外1行)。
- **通常追跡AIから除外(監査12)**: updateEnemies の追跡・接触ブロックを素通りする型ガードを追加
  (isHiddenBoss と同じ作法の専用述語 `isGuardianPhantom`)。動かすのは phantomTick だけ。
- **反応表・技表には載せない(監査20・第1弾の割り切り)**: MOVE_REACTION_KEYS へ gp-* を足すと
  固定守護霊20体全員に「幻影の技への反応」の偽データが自動生成されるため載せない。
  =幻影戦の被弾は技キー無し(記録の穴として既知)。ガントレット除外(上)と整合。

### 頭脳(監査10=decideGhost流用に転換)
- **既存 `decideGhost`(ghostDriver)を「対プレイヤー」アダプタで流用**する。標的取得
  (boundBossId/pickTarget)を「プレイヤーの矩形・座標」を返すアダプタへ差し替えるだけで、
  preferredDist・counterChance・reactionMs・移動リズム(stationaryFrac/approachPerMin)が
  そのまま生きる=「守護霊らしさ」をデータで出す(自前ステアは書かない)。
- decideGhost の出力(接近/離脱/攻撃意図)を phantomTick が bossState 機械へ写す。
  技の抽選: 近(≤preferredDist)=melee / 中=issen or shot / 遠=shot。技間の休み900ms(叩き台)。
- **移動は毎tick `clampRectToPlayableArea` を通す(CLAUDE.md MUST・監査11)**。一閃の終点も
  クランプ。上下移動の5副作用表(地平線/減光/遠近/可視域/移動帯)はstage-1野外=帯なしだが、
  実装時に表を1回確認して結果をログへ書く。

### 技3つ(カウンター文法準拠。状態名は規約どおり -windup/-active/-recover・監査17)
| 技 | 状態 | 予告 | 判定 |
|---|---|---|---|
| 近接 `gp-melee` | `gp-melee-windup`(500ms)→`gp-melee-active`(180ms)→`gp-melee-recover` | 赤帯(=判定) | 前方帯 160×40 / dmg 18 |
| 銃撃 `gp-shot` | `gp-shot-windup`(400ms)→`gp-shot-active`(3連・gap120ms)→`gp-shot-recover` | 構えの張り | **共通の赤二重丸弾**・弾速480・dmg=gunKeyの武器基礎値から導出(下限6) |
| 一閃 `gp-issen` | `gp-issen-windup`(700ms)→`gp-issen-active`(260ms)→`gp-issen-recover` | 赤ライン(帯=判定) | ライン420×36に沿って高速移動・dmg 22 |

### カウンターの成立(監査2=宣言だけでは成立しない)
- `COUNTER_REACH_DECL` に登録: `gp-melee-windup`=帯 / `gp-issen-windup`=帯 /
  recover 2種=自分の体(body)。
- **成立側の配線を phantomTick 自身が持つ**(bountyTick と同型): windup/recover 中に
  プレイヤーのカウンター窓+`inCounterReach` を毎tick判定し、成立したら
  ①技を中断して `gp-stagger`(ノックバック+硬直・dashParriedEnemyPatch と同じ作法)
  ②体勢値を积む(ボス標準) ③counterMasterのCDリファンド等は既存の成立共通処理を通す。
- 弾は共通弾=既存の打ち返し文法がそのまま効く(配線不要)。
- **counterReach 完全性テスト(監査18)**: `gp-` 系統の州リストを export して missing() を追加。
  「bounty:/hidden:/idol: 以外は body 禁止」の既存テストは **prefix許可リストへ 'gp-' を追加**する
  改訂を行う(理由コメント付き)。

### 描画(監査14)
- **敵アクター側に専用分岐 `drawGuardianPhantom`** を新設(drawGhostAlly の直接流用はしない——
  Summon主語・単一インスタンスキャッシュ・味方半透明が前提のため)。中身は同じ部品の写し:
  クラス立ち絵(playerTextureName・rogue)+歩きコマ、**alpha=1(半透明にしない)**、
  ダーク系tint、**赤い目=小glowスプライト(強glow=投影影は使わない・監査21)**。
  遠近は **depthScaleEnemy**。頭上に名前ラベル(宿敵ラベル=namedFoeLabels の流用)。
  予告(赤帯/赤ライン)は既存のボス予告描画と同じ作法。
- **出現(監査16・慣性MUST)**: holo-mini(簡易出現魔法陣・既存素材)を足元に+本体は下から
  スッと立ち上がるフェードイン(ease-out)。出撃時は他の練習枠と同じアテンション+
  eventBanner「鴉(幻影)」(cutin台帳には足さない=素材なし)。討伐時は標準の崩壊演出。
  BossRush/PracticeResult のアイコンは BOSS_ICON 未登録=「?」のままで良い(開発実験枠)。

## 性能(監査21・CLAUDE.md必須)
**負荷 1/10**。毎フレームの追加は phantomTick(1体・軽量判定)と描画1体ぶんのみ。
赤目は小glow(pooled sprite=実測ただ)。**強glow(投影影)は使わない**。パーティクルは既存プール流用。

## 実装地図(Opusバッチ1本・中)
1. 台帳読み: `strongestGuardian()`=鴉を返す純関数+テスト(score最上位の機械検証つき)
2. 入口: PracticeSlot.alwaysUnlocked+duel枠+カテゴリ+テスト改訂4件+BOSS_HINTS 3行
3. 敵: EnemyType/ENEMY_STATS/CONSTANT_STRENGTH/ENGAGEABLE編入+isGhostEligible除外+
   通常AI除外述語+力スポーン4点セット(phantomnow)
4. 頭脳+技: `src/utils/phantomTick.ts`(decideGhostアダプタ+bossState機械+カウンター成立配線・
   ユニットテスト)+counterReach宣言+テスト改訂
5. 描画: drawGuardianPhantom(立ち絵+tint+赤目小glow+赤予告+名前ラベル+出現演出)
6. 検証: typecheck/lint+関連テスト(bossPractice/bossHints/counterReach/憲法)

## 監査の記録
- v1監査: 21件。**全件反映**(このv2)。要点: 入口の永久ロック(#1→alwaysUnlocked)/カウンター
  成立配線の欠落(#2→phantomTick内で成立させる)/HP倍率機構(#3→裏ボス方式)/ボス扱いの実体は
  ENGAGEABLE集合(#4→両編入+ghost系5系統から除外)/落ちるテスト2件+カテゴリ(#5/#7→改訂を明記)/
  ガントレット混入(#6→SKIP)/台帳パスと「誰か」(#8→鴉)/データが効かない(#9/#10→decideGhost流用へ
  転換)/clamp未指定(#11)/二重駆動(#12)/寸法(#13)/描画の前提(#14)/force4点(#15)/出現演出(#16)/
  州名規約(#17)/完全性テストの網(#18)/命名衝突(#19→guardian-phantom)/反応表汚染(#20→載せない)/
  負荷スコア(#21)。不採用ゼロ(※#20は「載せる」ではなく「載せない」を明文化する形で採用)。

## 実装の記録(v0.25.3629)
実装地図1〜6を**全部**実装済み。詳細は DEVELOPMENT_LOG.md v0.25.3629。数字は `src/utils/phantomScript.ts`
(依存ゼロの葉)、頭脳+技は `src/utils/phantomTick.ts`、描画は `pixiScene.drawGuardianPhantom`。

### ★未決事項
- **速度: 解決済み(社長裁定v0.25.3631「幻影はプレイヤー並みにして」)**。生値 87→**130**
  (実効 130×2/3≈87=PLAYER_BASE_SPEED と同等)。ENEMY_STATS の該当行に裁定コメント付きで反映済み。

### 設計書に指定が無くて実装側で埋めた値(叩き台・意図は変えていない)
- 3技の**硬直(recover)**: melee 420 / shot 500 / issen 600 ms。根拠は phantomScript.ts のコメント。
- **出現位置**: プレイヤーから 380〜500px(画面内に収まり出現演出が見える距離)。賞金首の
  700〜1000px は「探しに行く」設計だが、決闘は一騎打ちなので近くに出す。
- **一閃の踏み込み距離**: 帯の長さ×0.85(1.0 だと終点=帯の先端に立ち「斬り抜けた」に見えないため)。

---

# v4 幻影v2「守護霊ミラー」(社長裁定反映・設計監査18件反映)

## ゴール(社長の言葉のまま)
「めちゃくちゃ弱いなー。やはりプレイヤーと条件を一緒にしないと(ステータスとか装備とかじゃなくて)」
「守護霊のシステムをそのまま、プレイヤーへの被弾に切り替えるだけではだめなの?」
**裁定(2026-08-19)**: 「**全てプレイヤーと同条件。じゃないと意味がないので。最終的にオンライン対戦を
意識してください。(する予定はないが、AIでそこまで再現したい)ただし、実装が重いなら考えます。」

## 北極星と今回の範囲(「重いなら考えます」への回答)
- **北極星=「AIが操作するもう1人のプレイヤー」**。ただし真の実現(プレイヤー実体の2人目を store に
  立てる)は**大改修(実装コスト8/10・単一プレイヤー前提の全系統に波及)**なので今回はやらない。
- **今回(v2)=敵シャーシの上でルールを対称化**する(実装コスト中・実行時負荷2/10)。
  **オンライン意識の具体化は「写経禁止」**: 幻影側の数値・ルールは**プレイヤー側の定数・武器表を
  直接参照**する(INVULN_MS / createWeapon(activeGunKey) / PLAYER_BASE_SPEED)。プレイヤー側を
  調整すれば幻影も自動で追従=将来2人目実体へ移行する時も数値の正が1つ。

## 「ではない」条件(労力をかけない所)
- 数値の精密バランス(叩き台・実機で社長が調整)/専用素材なし/UIの磨きなし
- サブウェポン・スキル・装備効果のフル再現、**プレイヤーの隙読み(punish系)**は第3弾
  (監査9: 現行の持ち越しは構造的に死んでいるため**削除**し、隙読みは次弾で設計し直す)

## 裁定による決定(全て「プレイヤーと同条件」)
1. **通常被弾で技を中断しない**(監査・問い1-①の真因対処): プレイヤーが被弾しても攻撃・行動が
   止まらないのと同条件。幻影は通常ヒットの**ノックバック・100ms固めを受けない**(`isFrozen` の
   knockbackUntil 参照から幻影を外す)。**例外=カウンター成立の gp-stagger だけ**(従来どおり中断+
   硬直。「幻影を止める手段はカウンターだけ」がこの決闘の文法になる)。
2. **被弾無敵=プレイヤーと同じ `INVULN_MS`(定数を直接参照・例外なし)**: 無敵中の打撃はHPダメージ0。
   カウンター反撃も同条件でゲートされる(貫通例外は作らない=対称優先)。カウンターの報酬は
   gp-stagger(硬直・その間に1発は素で入る)。**体勢値の扱いは★未決Q1(再監査R1: ボス標準の
   体勢値は通常近接でも積もり、紫=5秒フルスタンが裁定1を裏口から壊す)——社長裁定待ち**。
3. **銃=台帳武器の実性能をプレイヤーの武器仕様ごと写す(M4: 新実装を書かない)**:
   **守護霊(ghost-ally)に同じミラーが完成済み**(useGameLoop の霊体武器ループ:
   `createWeapon`+`effectiveFireCooldown`+`beginWeaponReload/finishWeaponReload`(リザーブ∞)+
   「リロード中/マガジン0は射程0=撃たない」+射程 `zoomedGunRange(RANGE_BY_CATEGORY)`)。
   **この形をそのまま流用**し、phantomTick に2つ目のリロード実装を生やさない。
   - 銃状態(weapon実体・reloadEndsAt)は **PhantomTickState** に持つ(Enemy型を汚さない)。
   - 弾速=`projectileSpeed×PROJECTILE_SPEED_MULT`(プレイヤー実弾と同じ)、クリ5%も**撃つ**
     (handgun-t3が実際に持つ=同条件)。`GP_T.shot` は**ブロックごと撤去**(damageFloor/count/速度の
     手書き値も廃止。台帳実測: handgun-t3 = damage7 / cooldown100 / mag30 / reload1300ms)。
   - 予告なし・即発(プレイヤーの射撃に予告が無いのと同条件)。弾の見た目だけ**共通の赤二重丸**
     (CLAUDE.md「弾は全ボス共通」・打ち返し文法が効く)。gp-shot(windup型bossState)は廃止。
4. **HP=1200(叩き台・3000から変更)**: 無敵導入で通るダメージが毎秒1発に落ちるため、3000のままだと
   戦闘が桁で伸びる(監査重大5)。数値は実機で社長が調整する前提の初期値。

## 監査18件+再監査(R2)の反映(設計の穴の解消)
### 対幻影ダメージのゲート(監査重大2/3・R2/R3・M1〜M3の解)
- **ゲートの置き場所(再監査3の解)**: phantomScript.ts には置かない(counterReach が読む「依存ゼロの葉」
  なので gameStore⇄葉 の循環=起動全損の型)。**新しい葉 `src/utils/phantomGate.ts`** に**純関数**として
  置き、必要な値は**全部引数で受ける**(invulnMs / counterChance / rand / gameTime / enemyの当該
  フィールド)。phantomGate は型以外を import しない。gameStore が自分の INVULN_MS を渡す
  (=プレイヤー定数の直参照は呼び出し側で満たす)。
- **適用順(R2)**: `damageEnemy` では isCorpse / jump系フェーズの早期returnの**直後・
  `applyBrokenGunReward`/`applyBrokenMeleeFatal`(紫の報酬予算の消費)と紅き夜補正より前**。
  0ダメージ化したヒットが紫の報酬予算を食わないこと(受け入れ条件に含める)。
- **合流点は1箇所ではない。以下の7系統を名指しで全てゲートする**(全site が phantomGate を呼ぶ):
  ① `damageEnemy`(gameStore 銃弾・サブウェポン・召喚etc.の合流点)
  ② `triggerCounter` 3系統(バッシュ/気絶フィニッシュ/通常)
  ③ `shadowCloneStrike`(分身) ④ `performKatanaStrike`(刀) ⑤ `performWhipStrike`(鞭)
  ⑥ `skaterBoardHit`(スケボー) ⑦ 接触(combatTick=v0.25.3632で素通り済み・変更なし)
- **ゲートの返り値は「実効ダメージ+副作用可否」**。無効化(無敵/パリィ)した打撃の副作用抑止は
  **実配線どおりに3系統+2打刻を名指しで**(R3/M1):
  - `slashAt` に**積まない**(ここが①ナイフコンボ加算 ②スラッシャーのチェーン開始/射程記憶
    ③ヒットストップ、を駆動している)。
  - `meleeHitEnemyIds` に**積まない**(吸血回復・救難信号の発火源)。`meleeDamageNumbers` も積まない。
  - `lastHit` を**打たない**(通常の被弾フラッシュ・KB免疫・meleeAggro の起点。無効化の絵は下の
    `gpBlockedAt` で別系統にする)。ノックバック・100ms固めも立てない。
  - **戻り値の契約(M1)**: triggerCounter 等の戻り値 `hit/finish/killed` に無効化ヒットを**数えない**
    (VirtualJoystick が戻り値で `slash-damage` 等のSEを鳴らすため。鞭 `whip-hit`・刀のSE経路も同様に
    「実効ダメージ>0」を条件にする)。
  - **`phantomCounterHit` の演出もゲート対象(M2)**: ゲート7系統の外にあるが、金のクリ数字・
    Counter!コールアウト・報酬SEを**無条件で出している**。実効0なら白点滅のみに落とす。
  - 体勢値の扱いは★未決Q1(下)の裁定に従う。
- **source の定義(M3)**: ゲートは明示の `source` 引数を取る。「カウンター反撃」=
  `postureImpact==='counter'` で `damageEnemy` を呼ぶ全呼び出し(phantomTick.phantomCounterHit と
  combatTick の弾パリィ/ダッシュパリィ 2箇所)を**counter系=パリィ不可**として扱う(意図的)。
  triggerCounter 側にカウンター反撃の枝は無い(通常近接のみ=パリィ可)。
- 受け入れ条件: **7系統それぞれに「無敵中は0」のユニットテスト or 結合テスト**(1経路でも素通りが
  あれば「無敵が存在しない」に等しい・監査の予言を機械で塞ぐ)+**phantomGate は幻影以外の敵に恒等**。
### パリィ(counterChanceのミラー)
- **対象=近接系すべて**(監査中7: ナイフ/刀/鞭/分身/シールドバッシュ/スラッシャー追撃/スケボー
  =上のゲート②〜⑥。銃弾・サブウェポン爆発は対象外=cの回避で躱す)。判定は `phantomHitGate` の中で
  行う(=経路の取りこぼしが構造的に起きない)。
- **カウンター反撃(triggerCounterの確定クリ)はパリィ不可**(監査中8の定義): `source==='counter'`
  はパリィ抽選をスキップ(同じタップの**通常近接**は「通常近接=パリィ可」として扱う。カウンター
  成立時は幻影が gp-stagger に入るので、stagger中はそもそもパリィ判定自体をしない=定義が閉じる)。
- **発火のハンドシェイク(監査中6)**: gameStore側は `enemy.gpParriedAt = gameTime` を立てるだけ。
  **次tickの phantomTick が消費**して即反撃(gp-melee)を begin する(二重書き手・循環importを作らない)。
  counterChance の読み出しは葉(phantomScript経由で fixedGuardians)から。
- パリィCD 1000ms(叩き台・enemy.gpParryCdUntil / gameTime時計)。パリィ成立の絵=**青白いスパーク+
  弾き音(既存SEから流用・新規素材なし)**。**無敵中ヒットの絵=小さな白点滅のみ・ヒットSEを鳴らさない**
  (監査中11: 通常の被弾フラッシュを流用すると「当たったのに減らない=バグ」に見える)。
### 一閃と即発銃撃の共存(監査・問い1-②/M5/M6)
- 銃撃は bossState 機械から**独立**させる(プレイヤーが移動しながら撃つのと同じ層)。
  技の抽選(nextMoveAt)は**近接/一閃だけ**になる。
- **抽選の律速(M5: 毎tick引き直すと実質100%になる)**:
  - 近接: 従来どおり **`decision.action==='melee'` が門番**(台帳の meleeBias/リズムが効く形を維持)。
  - 一閃: **nextMoveAt 到達時のみ**中距離なら ISSEN_MID_CHANCE で抽選。**外れたら
    `nextMoveAt = now + MOVE_RETRY_MS(500ms・叩き台)`** を置いて次の抽選まで待つ(引き直し禁止)。
- 距離の単位(M6): **`decidePhantom` が decideGhost へ注入している既存の `edgeDistTo`
  (phantomTick.ts内・プレイヤー矩形の最近点)と同じ関数で測る**(enemyRangeRect は「敵の」矩形を
  返す関数なので使わない=単位取り違えの再演防止)。
### 弾回避(監査・問い1-③/小16/小18)
- **実態**: decidePhantom は既にプレイヤー弾を渡しているが、botSkill.projectileDodge が
  1行目 `if (!p.hostile) return null;` で**全部捨てている**。botSkill はテストボット共用のため触らない。
  **幻影側で `{...p, hostile: true}` に写してから渡す**(1行のアダプタ)。
- 挙動の正: DODGE_PROJECTILE_DIST(220px)+stepGhostDanger の反応遅延(reactionMs)=既存機構のまま。
  「reactionMs以内に届く弾を〜」という新機構は**作らない**(文言を実態に合わせるのが正)。
- 技中(windup/active/recover)は decidePhantom を呼ばない現状は**許容**(プレイヤーも振り中は
  行動をコミットする=同条件と読める。監査小18は記録として残す)。
### 近接の予告(監査中10・再監査で「即フル表示」は撤回)
- **「即フル表示」は書かない**(再監査: 流星式の実装では prog=1 は「描き終わって消えた」=素直に
  実装すると帯が1フレームも出ず「赤くないのに当たる」の最上位違反になる。かつ流星式は社長指示の
  連続(v3444/3474/3476)なので幻影だけ反転しない)。**扱いは★未決Q2——社長裁定待ち**
  (推薦: 流星式のまま windup 400ms(叩き台)で「流星が走り切った=着弾」の読みを成立させる)。
- 受け入れ条件: **社長が実機で「見てから取れる」こと**(取れなければ windup を上げる調整余地を明記)。
### gp-shot撤去の波及(監査中12+再監査S2の訂正)
- 撤去対象: `types/game.ts` の bossState union(gp-shot 3州)/ **phantomScript の `shot` ブロック全部**
  (実フィールドは {windup,gapMs,count,recover,speed,size,range,damageFloor}。銃ミラーが台帳武器の
  実性能を使うため全て不要。`phantomShotDamage`(=max(damageFloor,…))も撤去)/
  `lastRangedShotAt` の死んだ書き込み / phantomTick.test の①(中・遠でgp-shotを期待する4本)・
  ③(phantomShotDamage固定)・⑤(shotsRemaining)。**counterReach の gp-shot 宣言は存在しない=
  撤去作業なし**(空作業を書かない)。
### テスト(監査中4/中13)
- **runPhantomTick に乱数注入口**(`rand?: () => number` 既定 Math.random)を追加。
- 結合テスト(bountyTick.test の型: resetGame→盤面→tick刻み→検査)最低5本:
  ①一閃が発火する(rand固定) ②被弾無敵中は7系統ゲートでダメージ0(代表3経路+単体でヘルパ全分岐)
  ③パリィ成立→gpParriedAt→次tickで反撃begin(ヘルパ単体+ハンドシェイク) ④銃撃で敵弾が生成され
  マガジン切れでリロード停止する ⑤通常被弾で技が中断しない(knockback中もbossStateが進む)。
- パリィの抽選固定は **phantomHitGate に rand 引数**(発火点が gameStore 側のため、ゲート単体で固定)。
### その他
- BOSS_HINTS 3行を v2 仕様に改訂(パリィ・無敵・即発銃撃。半角数字禁止の掟・監査小14)。
- 銃の絵(監査小17+再監査S4): **素材の実在確認を先に行う**——既存のプレイヤー武器スプライトが
  敵レイヤーで参照できるならそれを手元に出す。**できなければ銃の絵は出さず、マズルフラッシュ+反動
  (戻りease=慣性MUST)のみ**(「専用素材なし」条件を優先)。
- 無効化ヒットの絵(再監査S3): 既存の被弾フラッシュ(lastHit起点)は**使わない**。新フィールド
  **`gpBlockedAt`(gameTime打刻)**をゲート成立時に立て、drawGuardianPhantom が小さな白点滅を出す
  (ヒットSEなし)。パリィは `gpParriedAt` と同様のハンドシェイク。
- 押し道具(再監査S1): 鞭・シールドバッシュの `knockbackShoveUntil` は**幻影にも効かせる**
  (shove窓の間、phantomTick は自分の移動で x/y を上書きしない)。プレイヤーも押し合いの対象になる
  世界なので同条件の範囲内。
- 守護霊・分身の近接(再監査S5): **パリィ対象に含む**(同じゲートを通るため追加配線なし。
  「近接系は全てゲート経由」の帰結として明記)。
- 中5(punish持ち越し)は**削除**(構造的に死んでいる。隙読みは第3弾で設計し直す・上の「ではない」)。
- 歩き二重(監査小7): ENEMY_MOTION_TABLE に guardian-phantom を登録して千鳥足を止める
  (立ち絵の歩きコマ側だけにする)。

## ★未決事項(社長裁定待ち・実装バッチはこの3つの裁定後に発注)
- **Q1 体勢値(紫)の扱い**(再監査R1): ボス標準の体勢値は**通常近接でも積もる**(25発で紫=5秒
  フルスタン)ため、裁定1「殴り続けても技は止まらない・止めるのはカウンターだけ」を裏口から壊す。
  さらに紫の報酬(HP25%分の予算・5倍処刑)はHPダメージなので無敵ゲートで実質死ぬ。
  **案A(推薦)**: 幻影の体勢値は**カウンター系(counter/reflect)でだけ積む**+**紫(ブレイク)中は
  被弾無敵を止める**=「カウンターを重ねる→紫→フルダメージの報酬窓」と文法が一本化。
  案B: 幻影だけ体勢値を外す(紫ゲージが飾りになる)。案C: 現行のまま(裁定1が壊れる)。
- **Q2 近接予告の赤帯**: 全ボス統一の流星式(社長指示v3444/3474/3476)と短windupの両立。
  **案A(推薦)**: 流星式のまま windup 400ms(叩き台)。案B: 幻影だけ即フル表示の例外(文法分岐が増える
  +実装は別書きが必要)。
- **Q3 「幻影だけ予告・硬直を持つ」非対称の承認**(再監査S6): プレイヤーの近接は即発・無予告だが、
  幻影の近接/一閃には予告と硬直がある(=カウンターで取れる)。厳密な「全て同条件」からは外れるが、
  これが無いとプレイヤー側のカウンター(決闘の見せ場)が幻影戦から消える。
  **案A(推薦)**: この非対称だけ例外として残す(幻影=「読める攻撃をする対戦相手」)。
  案B: 幻影の近接も即発化(カウンター文法が消えた純粋な差し合い)。

## 受け入れ条件(v4)
- 実機で: 撃ってくる(即発・リロードの息継ぎがある)/短予告の近接(見てから取れる)/一閃が出る/
  弾をサイドステップ/近接がときどき弾かれ反撃される/殴り続けても技が止まらない/被弾は1秒1回。
- プレイヤー文法の不変: 赤帯・赤ラインのカウンター成立/gp-stagger中は素で殴れる/体勢値が積める/
  弾は打ち返せる。
- `?phantomnow` 無しで既存挙動不変(全分岐が幻影の型ガードで閉じる)。**phantomHitGate は
  幻影以外の敵に対して恒等関数**(通常敵のダメージ・副作用に1bitも影響しない)をテストで固定。
- 負荷 2/10(per-frame新規=距離判定と弾写し1本。強glow不使用は不変)。

## 実装地図(Opusバッチ1本・大。★未決Q1〜Q3の裁定後に発注)
1. **新しい葉 phantomGate.ts**: phantomHitGate(無敵/パリィ/副作用可否・全値引数渡し・rand注入)+
   phantomScript の parry/melee 定数整理・shotブロック撤去
2. gameStore: 7系統のゲート呼び出し(適用順=報酬予算より前)+副作用の抑止(slashAt/meleeHitEnemyIds/
   meleeDamageNumbers/lastHit を名指し)+戻り値契約(hit/finish/killed)+gpParriedAt/gpBlockedAt
3. phantomTick: 銃撃ミラー(守護霊の霊体武器ループを流用・状態はPhantomTickState)/一閃の独立抽選
   (nextMoveAt律速+MOVE_RETRY_MS)/knockback凍結の除外(shove窓は移動を書かない)/
   パリィ消費→即反撃/phantomCounterHit演出のゲート/gp-shot州の撤去
4. 描画: 銃素材の実在確認→手元の銃orマズル+反動のみ/パリィ青白スパーク/無敵中の白点滅(gpBlockedAt)/
   近接予告=Q2の裁定どおり/モーション整理
5. counterReach/型/テスト改訂+結合テスト5本+BOSS_HINTS改訂
6. 検証: typecheck/lint+関連テスト(phantomTick/counterReach/bossPractice/憲法+ゲート恒等)

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

---

# v5 裁定確定(2026-08-19・社長「そもそも紫ゲージ無くす。予告無し。全て同じ。」)

**v4の★未決Q1〜Q3への裁定。以下が v4 と食い違う場合はこの v5 が勝つ。**

## 裁定と帰結
- **Q1=紫ゲージ(体勢値)そのものを幻影から無くす**: `usesPostureSystem` の対象から guardian-phantom を
  除外(専用述語で1箇所)。体勢値UI(紫ゲージ)・ブレイク・紫の報酬予算・5倍処刑、全て幻影には無し。
  bossPosture 経路(`applyBossPostureDamage`)は幻影に対して no-op。
- **Q2/Q3=予告無し・全て同じ(完全対称)**:
  - **幻影の攻撃から予告(赤帯・赤ライン)と windup/recover を全廃**。プレイヤーの近接がタップ即発で
    予告も硬直も無いのと同条件。
  - **近接=即発ミラー**: gp-melee の windup/active/recover 州を撤去し、**プレイヤーの近接と同じ
    「即時ヒット+同じ周期」**にする(周期はプレイヤー近接の実効周期=COUNTER_WINDOW+COUNTER_COOLDOWN
    を**定数直参照**。判定形状は現行の前方カプセル・dmg18=叩き台のまま)。振りの絵(モーション)は残す
    (絵は出すが判定に予告的意味は無い=プレイヤーと同じ)。
  - **一閃(gp-issen)は廃止**: プレイヤーの標準操作に無い動作(相当物は刀サブウェポン)。
    サブウェポン再現の第3弾で対称に戻す(v4の一閃抽選・MOVE_RETRY_MS・ISSEN_MID_CHANCE も撤去)。
  - **プレイヤー側のカウンターは幻影の攻撃には成立しなくなる**(取る対象のwindupが存在しないため。
    帰結として phantomTick のカウンター成立配線・gp-stagger・COUNTER_REACH_DECL の gp-* 宣言・
    counterReach テストの 'gp:' 許可を**全て撤去**)。**弾の打ち返しだけは残る**(共通赤二重丸=
    シューティング文法・全ボス共通。プレイヤーの弾を幻影は躱す/プレイヤーは幻影の弾を打ち返せる、で対称)。
  - **幻影のパリィ(counterChance)は維持**(プレイヤーが「カウンター」を持つことの鏡。成立時の即反撃は
    即発近接として出す)。gp-stagger が消えるため、v4の「stagger中はパリィ判定なし」の行は削除。
    パリィ成立時のプレイヤー小ノックバックは維持。
- **決闘の構図(帰結の明文化)**: 幻影を「止める」手段は無くなる。勝敗は**回避と手数の差し合い**で決まる
  (両者とも被弾は1秒1回・リロードの息継ぎあり・近接は同周期)。これが「全て同じ」の意図どおりであること。

## v4からの主な撤去リスト(実装地図の差分)
- 州: gp-melee 3州 / gp-issen 3州 / gp-stagger(bossState union から全撤去。幻影は bossState を使わない)
- counterReach: gp-* 宣言と 'gp:' prefix 許可・完全性テストの gp 節(撤去の理由コメントを残す)
- phantomTick: カウンター成立配線・一閃の移動/抽選・技の州機械(残るのは: decideGhost 移動/
  即発近接(周期タイマー)/銃ミラー/パリィ消費/被弾無敵/弾回避)
- 描画: 赤帯・赤ライン予告の描画/zoneCapsule・dashLine の幻影分岐(振りモーション・銃・マズル・
  パリィスパーク・無敵白点滅は v4 のまま)
- moveCancelGuard 等が gp 州を参照していれば併せて掃除(実装時に grep で確認し報告に列挙)
- BOSS_HINTS: 「予告なし・カウンター不成立・弾は打ち返せる・パリィされる」前提の3行へ改訂

## 受け入れ条件(v5で置き換え)
- 実機で: 幻影が撃つ(即発・リロード息継ぎ)/即発の近接を振る/弾をサイドステップ/こちらの近接が
  ときどき弾かれ即反撃される/**殴り続けても止まらない・紫ゲージが出ない・赤い予告が一切出ない**/
  被弾は互いに1秒1回。
- プレイヤー文法: 弾の打ち返しは効く。カウンターは幻影の攻撃に成立しない(仕様)。
- `?phantomnow` 無しで既存挙動不変+phantomGate は幻影以外に恒等(v4のまま)。
- 負荷 2/10(州機械が消える分 v4 より軽い)。

---

# v6 実装仕様(最終・これだけ読めば作れる)

**v4/v5は経緯。実装は本節のみを正とする。v4の受け入れ条件・実装地図・★未決Q1〜Q3は全て廃止**
(裁定は出た: 「そもそも紫ゲージ無くす。予告無し。全て同じ。」)。v4から生きて引き継ぐ節は
「phantomHitGate(置き場所・適用順・7系統・副作用抑止・戻り値契約)」「銃ミラー(M4)」「弾回避」
「北極星と写経禁止」「ではない条件」のみ。それ以外でv4と本節が食い違えば本節が勝つ。

## 幻影v2の最終形
1. **頭脳・移動**: decideGhost 対プレイヤーアダプタ(既存のまま)。移動は毎tick clamp(既存)。
   - **通常被弾で止まらない**: `phantomTick.isFrozen` から knockbackUntil 参照を外す。
   - **押し道具は効く**: `knockbackShoveUntil` 窓中は phantomTick が自分の移動で x/y を上書きしない。
   - **クリティカルの移動半減だけ外す**(D4・監査4周目#2で精密化): `bossSlowMult` を丸ごと外すと
     グラビティ/アイスショットの鈍足まで消える(過剰除去)。**`bossSlowUntil`(クリ由来)だけ幻影では
     無視し、`gravitySlowUntil`/`iceSlowUntil` は残す**(スキルの鈍足はプレイヤーの攻撃効果=効く)。
     usesBossCrit のダメージ倍率側は残す=プレイヤー弾のクリはちゃんと痛い。
   - 技中も含め **decidePhantom は毎tick呼ぶ**(州が無くなるので弾回避・危険記憶が常時効く)。
2. **近接=即発ミラー**(D1/D2/B1の解):
   - 発火=**自前周期タイマー単独**。周期は **`GHOST_COUNTER_MELEE_PERIOD_MS`(ghostDriver.ts:256・
     COUNTER_WINDOW+COUNTER_COOLDOWN由来の既存定数)を import して流用**(写経禁止)。
     `decision.action==='melee'` は**使わない**(縁74px以内でしか立たず、reach160の外側が死ぬため)。
     ※帰結: 台帳 meleeBias は近接頻度に効かなくなる(間合い管理=preferredDist で個性は残る)。明記。
   - 条件: 縁距離(既存 edgeDistTo)≤ melee.reach(160)。カプセル起点終点=**発火時に phantomTick が
     直接計算**(幻影中心→プレイヤー中心方向・長さ reach・半幅 halfWidth。beginMove/aiFrom* は廃止)。
   - ダメージ=**damagePlayer 直**(dmg18叩き台)。呼び方を固定(監査4周目#1):
     **`damagePlayer(18, '鴉(幻影)の斬撃', 幻影中心X, 幻影中心Y, 'guardian-phantom')`**
     (fromX/fromY を渡さないとプレイヤーのノックバックが出ない)。**被弾SEは phantomTick が既存
     `player-damage` を鳴らす**(damagePlayer直は「本当に何も出ない」前例あり=gameStore 8566の注記)。
     **守護霊(ghost-ally)には当てない**(第3弾で対称に検討)。
   - **汎用爆風(applyPumpkinBlastDamage)は使わない**。理由2つ(どちらも必須): ①全画面オレンジ
     フラッシュ+r20リングが820ms周期で明滅し判定と絵が不一致(B1) ②**爆風経路の帯はプレイヤーが
     カウンターで弾ける**(combatTick 216-219)ため、相乗りすると裁定「カウンターは幻影に成立しない」が
     裏口から破れる(監査4周目#5)。カプセルだけの相乗りも禁止。
   - **重なり判定式**=既存の共有純関数 **`distToBandRect(点, 始点, 終点, halfWidth) ≤
     プレイヤー半径(max(w,h)/2)`**(utils/geometry・counterReach/combatTick と同じ1本。写経禁止)。
   - **振りの絵は新規に組む(既存素材の流用のみ)**: 斬撃弧=**`fx/slash-streak-4`(4コマ目)のみ**を
     使う(0〜3コマは部分線で「見えない」——KILL演出v0.25.3618と★実在確認の掟が名指しする前例)。
     **カプセルと同角に回転・長さは reach(160)に合わせて拡大**(2分類①: 危険を伝える絵=判定に揃える)
     +本体の小さな踏み込み→戻り(ease=慣性MUST)。
3. **銃ミラー**: v4のM4節のとおり(守護霊の霊体武器ループ流用/状態は PhantomTickState/
   敵弾=共通赤二重丸/実弾速=projectileSpeed×PROJECTILE_SPEED_MULT/クリ5%も撃つ/
   リロード=beginWeaponReload/finishWeaponReload・リザーブ∞/射程=zoomedGunRange(RANGE_BY_CATEGORY))。
4. **被弾=phantomGate**: v4のゲート節のとおり(新しい葉 phantomGate.ts・全値引数渡し・適用順=
   報酬予算より前・7系統名指し・副作用抑止(slashAt/meleeHitEnemyIds/meleeDamageNumbers/lastHit)・
   戻り値契約 hit/finish/killed・幻影以外に恒等)。
   - **counterChance は呼び出し側(gameStore)が `strongestGuardian().profile.counterChance` を渡す**
     (C3解消: phantomGate は型以外 import しない、を守る)。
   - **パリィ即反撃はハンドシェイク**: ゲート成立→ `enemy.gpParriedAt=gameTime` → 次tickの
     phantomTick が消費し、**近接周期を無視して1回割り込みで即発近接**を出す(D3)。反撃後は
     周期タイマーをリセット。パリィCD 1000ms(gpParryCdUntil)・プレイヤー小ノックバックは維持。
   - パリィ音=既存 'counter' キー流用。無効化ヒット=gpBlockedAt→白点滅・SEなし(v4のまま)。
   - **source='counter'(パリィ不可)の生き残りは combatTick.ts:362(刃の爆風パリィ)の1本だけ**
     (C2訂正: ダッシュパリィ1159は980の幻影素通りで到達しない。phantomCounterHit は撤去される)。
5. **無くなる物(裁定)**: 体勢値(usesPostureSystem から幻影除外=1箇所。紫ゲージ・報酬帯は
   postureBoss ガード済みで自動的に出なくなる・確認済み)/予告(赤帯・赤ライン)/一閃/
   gp-* 州すべて/プレイヤー側カウンターの成立(弾の打ち返しだけ残る)。

## 撤去の完全リスト(監査3周目A系・全て実在確認済み)
- `counterReach.ts`: COUNTER_REACH_DECL の gp宣言+**counterReachShapeFor の case 2つ(L274-277)**+
  L35 の GP_T import(未使用化=lintで落ちる)
- `counterReach.test.ts`: L17(状態リストimport)/L19(GP_T)/L44-46(幻影missing)/L50-56('gp:'許可)/
  **L106-112(melee/issen halfWidthテスト)**
- `pixiScene.ts`: 赤帯・赤ライン(zoneCapsule/dashLine)の幻影分岐+L176 の GP_T import
- `phantomScript.ts`: shotブロック/**issenブロック/restMs/issenTravelFrac/PhantomBand の
  windup・active・recover**。残すのは melee の reach/halfWidth/damage+パリィ定数のみ
- `phantomTick.ts`: 州機械・カウンター成立配線・phantomCounterHit・一閃移動・**未使用import一式**
  (数は固定しない——hitCapsule廃止で knockbackSpeedFor、D4で bossSlowMult 等も未使用化する。
  **lintエラー0で機械的に担保**する・監査4周目#6)・`counterEnabled` 引数
  (+useGameLoop 側の実引数 BOSS_COUNTER_ENABLED)
- `PhantomSfx`: alert/counter/reward を撤去し **parry を追加(音は既存'counter')**+useGameLoop の写像
- `types/game.ts`: bossState union の gp州全部
- `phantomTick.test.ts`: 生存は pickActivePhantom/createPhantomTickState のみ=v6仕様で書き直し
- 波及なし(確認済み・触らない): bossPractice.test の HP 定数参照/bossPosture.test/moveCancelGuard

## テスト(v6版・D5/D6)
結合テスト(bountyTick.test の型)5本+不変条件1本:
① 即発近接が周期どおり出てプレイヤーHPが減る(縁距離reach内・タイマー消化)
② 被弾無敵中は7系統でダメージ0(代表経路+phantomGate単体で全分岐・rand注入)
③ パリィ: ゲート成立→gpParriedAt→次tickで割り込み近接が出る(rand固定)
④ 銃ミラー: 敵弾が生成され、マガジン切れでリロード中は撃たない
⑤ knockbackUntil 中も移動・射撃が継続する(通常被弾で止まらない)
⑥ 【不変条件】幻影に体勢値が積まれない+phantomGate は幻影以外の敵に恒等

## 受け入れ条件(v6・これのみが正)
- 実機: 撃つ(即発・リロード息継ぎ)/即発近接(斬撃弧が判定どおりに見える・全画面フラッシュは出ない)/
  弾をサイドステップ/こちらの近接がときどき弾かれ即反撃/殴り続けても止まらない/紫ゲージも赤予告も
  一切出ない/被弾は互いに1秒1回。
- プレイヤー文法: 弾の打ち返しは効く。カウンターは幻影に成立しない(仕様)。
- `?phantomnow` 無しで既存挙動不変。typecheck 0 / lint 0エラー(未使用import掃除込み)。
- 負荷 2/10。

## 実装地図(v6・Opusバッチ1本・大)
1. 葉: phantomGate.ts 新設+phantomScript の撤去と整理
2. gameStore: 7系統ゲート+副作用抑止+戻り値契約+gpParriedAt/gpBlockedAt+counterChance受け渡し
3. phantomTick: 州機械撤去→即発近接(周期タイマー+割り込み反撃)/銃ミラー/凍結除外/毎tick decidePhantom
4. 描画: 斬撃弧(slash-streak流用)+踏み込み戻り/マズル+反動/白点滅/パリィスパーク/赤予告と
   赤ライン分岐の撤去/モーション整理(ENEMY_MOTION_TABLE登録)
5. 撤去リストの完全消化(counterReach/型/テスト/未使用import)+BOSS_HINTS改訂
6. テスト6本+既存改訂/typecheck/lint

---

## 実装の記録(v6・v0.25.3639)

実装地図1〜6を**全部**実装した。詳細は DEVELOPMENT_LOG.md v0.25.3639。

- 新しい葉 `src/utils/phantomGate.ts`(無敵/パリィ・全値引数渡し・rand注入・幻影以外に恒等)。
- `gameStore`: 7系統に `gatePhantomHit` を配線(damageEnemy / triggerCounter 3枝 / 分身 / 刀 / 鞭 /
  スケボー、接触は素通り済み)。適用順=早期returnの直後・報酬予算と紅き夜補正より前。
  無効化ヒットは slashAt / meleeHitEnemyIds / meleeDamageNumbers / lastHit のどれにも積まない。
- `phantomTick`: 州機械・一閃・カウンター成立配線・phantomCounterHit を撤去し、
  即発近接(周期=`GHOST_COUNTER_MELEE_PERIOD_MS`)+銃ミラー+パリィ消費+毎tick decidePhantom へ。
- 撤去は完全消化(counterReach の gp 宣言と case、pixiScene の赤帯/赤ライン、phantomScript の
  shot/issen/restMs/issenTravelFrac、types の gp 州 union、テストの gp 参照)。
- 体勢値は `usesPostureSystem` から幻影を除外(1箇所)=紫ゲージ・ブレイク・報酬予算・5倍処刑が消える。

### 設計書に指定が無くて実装側で埋めた値(叩き台・意図は変えていない)
- **振りの絵の尺** `GUARDIAN_PHANTOM_TUNING.swingFxMs = 260ms`(判定は即発の1回。絵の尺だけ)。
- **踏み込み/反動/マズル**(描画のみ): 踏み込み 22px / 反動 9px / マズル 120ms・34px・前方18px /
  無効化の白点滅 140ms。全て両端で速度0のイーズ((1-cos)/2)=慣性MUST。
- **パリィのプレイヤー小ノックバック**: 46px / 180ms(設計書は「小ノックバック」とだけ指定)。
- **銃のクリ**: 台帳武器の `critChance` を引き、当たりは `CRIT_DAMAGE_MULT` 倍(弾の見た目は不変)。
- **PhantomSfx の顔ぶれ**: 撤去リストは「alert/counter/reward を撤去し parry を追加」だが、
  本文が要求する被弾SE(`player-damage`)と発砲SEの置き場が要るため `swing / shot / parry / hurt` の
  4つにした(全て**既存キーの流用**=新規素材ゼロ、という条件は満たしている)。

### ★未決事項(v6実装)
- **HP**: v4の「HP=1200へ変更」は v6 が引き継ぐ節に含まれず、撤去リストも
  「bossPractice.test の HP 定数参照=波及なし・触らない」としているため、**HP は 3000 のまま**にした。
  被弾無敵(毎秒1発)が入ったので戦闘時間は伸びる。下げるなら社長裁定が要る(数値=仕様)。

---

# v7 裁定追記(2026-08-19・「初期状態のプレイヤー」化)

社長裁定: 「**ステータスもそのままにできない?こっちがステータス初期だから、守護霊も初期かも。
いまってスキルまだ無いんだよね?そしたら武器とかも初期で**」

- スキル・サブウェポンの再現が無い現段階(第3弾前)は、**装備・ステータスも初期に揃える**
  =「初期プレイヤー vs 初期状態の幻影」の決闘。
- **HP**: 3000 → **初期プレイヤーと同値**(`PLAYER_PROFILES[台帳クラス].maxHp`=110。
  config/bossHealth.ts が data の葉2つから導出=写経なし)。v6の★未決(HP)はこれで解決。
- **銃**: snapshot.activeGunKey(handgun-t3)→ **台帳クラスの初期銃**(rogue=handgun-t1)。
- **近接ダメージ**: 固定18 → **台帳クラスの初期近接武器の実ダメージ**(rogue=machete-t3=22)。
  判定の形(reach/halfWidth)は据え置き(叩き台)。クリは未適用(叩き台)。
- 第3弾(スキル/サブ再現)が入ったら、snapshot装備へ戻すのが自然(その時に再裁定)。

---

# v8 弾パリィ=打ち返し(社長指摘 2026-08-20「鴉、銃の弾反撃しないよ?」・v0.25.3665実装)

- **プレイヤーの直接銃弾('bullet')もパリィ対象**にする(プレイヤーがカウンターで敵弾を
  打ち返せるのと同条件)。抽選は近接と同じ counterChance・CDも共有(gpParryCdUntil)。
- 成立時の合図は**近接と別打刻**: `gpBulletParriedAt`。同tickの弾ヒット処理(useGameLoop)が消費し、
  **その弾を打ち返す**= reflectProjectile(反転・敵対化 asHostile=true・×REFLECT_DAMAGE_MULTIPLIER・
  非貫通)。プレイヤーの打ち返しと同じ規則=同条件。既に反射済みの弾は倍率1で返す
  (ラリーでダメージが指数増殖しない)。近接反撃・プレイヤーへのshoveは出さない
  (遠距離でプレイヤーが押される不自然を作らない)。SEはプレイヤーの打ち返しと同じ'counter'。
- **対象は直接銃弾のみ**(directPlayerGun)。サブウェポン・爆発・護衛/守護霊の弾は従来どおり
  'ranged'=パリィ不可(プレイヤーも爆発は打ち返せない=対称)。
- 同時修正: **パリィ反撃の空振り**(社長報告「すごい距離から斬撃っぽいの」)——分身・守護霊の近接が
  パリィされた時、プレイヤー本人が遠くにいても反撃スイングの絵とshoveが出ていた。
  反撃・shoveは近接射程(reach)内の時だけに変更(スパーク・SEは無条件=パリィ自体の演出)。

## v8追記: 対人ダメージ1/10(社長裁定 2026-08-20「プレイヤー同士の戦いではダメージ1/10で一旦」)
- `PVP_DAMAGE_SCALE = 0.1`(phantomScript・葉)。**双方向**:
  - プレイヤー→幻影: phantomGate が実効ダメージ(damage)と damageScale を返す。
    damageEnemy経由(銃/サブ/爆発/カウンター反撃/スラッシャー/守護霊)はゲート③で自動適用。
    近接掃引5経路(ナイフ/分身/刀/鞭/スケボー)は既存の幻影分岐で gp.damageScale を自前のダメージに掛ける。
  - 幻影→プレイヤー: 近接(phantomTick)・銃弾(生成時)・打ち返し弾(reflect倍率)に掛ける。
- 打ち返しの合成: 素の弾×10(打ち返し)×0.1(対人)=**素の弾ダメージで返る**。プレイヤーが
  再打ち返し(×10)→幻影ゲート(×0.1)=やはり素≒ラリーでダメージは増殖しない。
- 「一旦」=叩き台(定数1つで実機調整)。幻影以外の通常戦闘には一切効かない(damageScale=1恒等)。

---

# v9 パリィの反応速度モデル化(社長裁定 2026-08-20「すぐにやろう」)

## 社長の言葉(そのまま)
1.「近接について、そもそもカウンター取ったらカウンターのエフェクトは出ないとおかしい。
   その他の部分は2の実装によって改善されるよね?」
2.「すぐにやろう すると、近接についてはたまたまカウンターを取れる以外なくなる
   (近づいてきたら近接狙ってるな はわかるから、あてずっぽうでカウンター狙う以外不可能なはず)」

## 設計(推薦・監査対象)
### 1. 近接パリィ=「窓」モデル(counterChance抽選の廃止)
- プレイヤーの近接は予告ゼロの即発=人間は見てから反応できない。よって幻影の近接パリィは
  **「あてずっぽうに構えた窓にたまたま重なった時だけ」**成立する形へ。
- **実装はプレイヤーの機構の完全な鏡**: プレイヤーの triggerCounter は「スイング=攻撃であり
  カウンター窓(COUNTER_WINDOW=400ms)でもある」。幻影も同じにする——
  **幻影のスイング(swingPhantomMelee・周期PHANTOM_MELEE_PERIOD_MS=820ms)が、スイング時刻から
  COUNTER_WINDOW(400ms)の窓を開く**。プレイヤーの近接がこの窓中に当たったらパリィ成立。
  **窓外なら素通り(ダメージが通る)**。phantomGate②の melee 抽選(counterChance)は**廃止**。
- プレイヤーから**読める**: 幻影のスイングは絵に出ているので、「振った直後の隙(COUNTER_COOLDOWN
  相当420ms)を狙って斬る」という読み合いが成立する(あてずっぽう vs 後の先)。
- counterChance(台帳0.82)は近接パリィでは使わない(下の弾パリィ専用に残す)。
  ※対称性を最優先(「全てプレイヤーと同条件」)。個性は反応速度(reactionMs)が担う。

### 2. 弾パリィ=反応時間モデル
- **弾の飛翔時間(発射点→幻影の距離 ÷ 弾速)≧ 台帳の reactionMs(鴉=100ms)**の時だけ、
  従来どおり counterChance 抽選+パリィCD(1000ms)で打ち返す。
- 飛翔時間 < reactionMs の弾は**抽選なしで反応不可**=接近して撃ち込めば打ち返されない
  (近距離射撃のリスクに報酬が付く)。遠距離からの撃ち合いは従来どおり打ち返される。

### 3. パリィ成立の演出=プレイヤーのカウンターと同じ組(社長指摘1)
- 現行の青白スパーク独自演出を、**プレイヤーのカウンター成立と同じ文法**へ置き換える:
  SE 'counter'+ヒットストップ+カウンターの成立エフェクト(useGameLoop 5182周辺の実物と同じ
  呼び出しの組。実装時に写経ではなく同じ関数を呼ぶ形にできるなら共通化)。
- 弾の打ち返し成立時も同様(v8の青白リングを同文法へ)。

### 4. 不変
- i-frame(1秒)・パリィ成立→即反撃(gpParriedAt/gpBulletParriedAt のハンドシェイク)・
  近接反撃とshoveの射程ゲート(v0.25.3665)・対人1/10(PVP_DAMAGE_SCALE)・'counter'ソースの
  パリィ不可・リーチ74は全て不変。
- 幻影のスイングが「攻撃+窓」を兼ねるのはプレイヤーと同一(新しい状態は作らない=gpSwingAt を
  窓の起点として読むだけ)。

### 期待される体感(社長の読みどおり)
- 近接: 幻影のスイング周期820msのうち窓400ms=約半分。タイミングを読まない近接は約半々で
  弾かれるが、**スイング直後の隙を狙えば確実に通る**(v2の「82%で問答無用に弾かれる」が消える)。
- 銃: 中〜遠距離は従来どおりの打ち返し合戦・近距離は通る。

### 将来(第3弾・録画側): 反応速度の技別計測
- playerTraits の reactionSamplesMs を**技(反応対象)別のキー**へ拡張し、技ごとの反応中央値を台帳へ。
  サンプル不足の技は全体中央値へフォールバック。counterChance→反応速度の線形写像(案2)は
  計測ゼロの新規プレイヤー用フォールバック。→「予告の長い技は取れる・速い技は取れない」AIになる。
  (これは録画・第3弾の仕事=本バッチには含めない)
- **距離帯×行動の癖(社長発案・同日)**: 距離帯(近接圏/中/遠)ごとに「近接を振る頻度・
  離脱(距離を取る)頻度」を計測すれば、「近距離では常にナイフを振る人」「詰められたらすぐ下がる人」
  などの条件付きの癖が組める。既存の preferredDist / meleeBias(1次元の好み)を
  **距離帯別の頻度マトリクス**へ拡張する形(これも第3弾の計測拡張に積む)。

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

# v3 幻影v2「守護霊ミラー」(社長GO 2026-08-19)

## ゴール(社長の言葉のまま)
「めちゃくちゃ弱いなー。やはりプレイヤーと条件を一緒にしないと(ステータスとか装備とかじゃなくて)」
「守護霊のシステムをそのまま、プレイヤーへの被弾に切り替えるだけではだめなの?」→ 提案(下記)にGO。

## 「ではない」条件(労力をかけない所)
- 数値の精密バランスは対象外(全て叩き台・実機で社長が調整)。
- サブウェポン群・スキル群・装備効果のフル再現は対象外(第3弾があるなら)。
- 専用素材は作らない/オンライン対戦ではない/UIの磨きは対象外。

## 方針: 「そのまま切り替え」できない3点だけ極性アダプタを書く
頭脳(decideGhost)は既に対プレイヤーで流用済み。守護霊システムで極性(敵に当てる/敵から受ける)が
固定なのは①攻撃の当て先 ②カウンターの発火源(敵windupを読む) ③被弾の受け方、の3点。そこだけ写す。

## 変更項目
1. **銃撃=即発ミラー(gp-shot廃止)**: decideGhost の `action==='shoot'` をそのまま**敵弾**で実行。
   - 弾=**全ボス共通の赤二重丸**(打ち返し文法がそのまま効く。CLAUDE.md「弾は全ボス共通」)。
   - ダメージ=台帳 snapshot 武器の基礎値(現行 `phantomShotDamage()`=下限6 を流用)。連射リズムは
     decideGhost 内部(lastShotAt)が管理=**リズムも台帳由来**。windup型の予告は付けない
     (**プレイヤーの射撃に予告が無いのと同条件**にするのが本件の主旨。赤文法は判定持ちの
     melee帯/一閃ラインだけに残る=2分類と整合)。
   - 描画: マズルフラッシュ+小さな反動(慣性MUST: 反動は戻りにease)。
2. **近接=短予告化**: gp-melee は維持、windup 500→**250ms(叩き台)**。赤帯=判定の厳密一致は不変
   (カウンター可を残す=決闘の見せ場)。
3. **一閃=維持**: v0.25.3632 の中距離抽選(ISSEN_MID_CHANCE)を継承。
4. **受け(ここが本丸)**:
   - a. **被弾無敵 1000ms**: プレイヤーの INVULN_MS と同値。**対幻影ダメージの唯一の合流点を特定して
     1箇所で**「幻影かつ無敵中→0+白点滅」を実装する(近接/銃/サブウェポン/召喚/打ち返し弾の全経路が
     同じ合流点を通ることを実装時に確認し、通らない経路があれば列挙して同じ判定を通す)。
     無敵中の見た目=既存の被弾点滅の流用(新規素材なし)。
   - b. **パリィ(カウンターのミラー)**: プレイヤーの**近接**が幻影に当たる瞬間、台帳の
     `counterChance` で抽選(成立時: ダメージ無効+青白スパーク+プレイヤー小ノックバック+
     即 gp-melee で反撃)。連発防止=パリィ後クールダウン 1000ms(叩き台)。
     **例外: プレイヤーのカウンター反撃(成立報酬の確定クリ)はパリィ不可**(カウンターを取った
     報酬を消さない=プレイヤー側の文法を守る)。銃弾はパリィせず c で躱す。
   - c. **弾回避**: decideGhost の危険察知(danger/dodge)へ**プレイヤーの弾**を写して渡す
     (reactionMs 以内に届く弾をサイドステップ)。躱すかどうかは台帳の反応値がそのまま決める。
5. **v1監査の残件を同梱**(同じ箇所を作り直すため):
   - 中5: `punishContext`/`punishMode`/`tankedBulletKey/Until` の持ち越しを PhantomTickState.ghost へ追加。
   - 中4: **runPhantomTick の結合テスト必須**(bountyTick.test の型: resetGame→盤面→tick刻み→検査。
     最低4本: 一閃が発火する(rand固定)/パリィが成立する/被弾無敵中はダメージ0/銃撃で敵弾が生成される)。
   - 小7: 歩きモーション二重の解消(ENEMY_MOTION_TABLE に guardian-phantom を登録して千鳥足を止め、
     立ち絵の歩きコマ側だけにする)。
   - 小8: 事実として記載——台帳銃 handgun-t3 の基礎値7は下限6とほぼ同じ(対プレイヤーでは
     7×台帳リズムで妥当かは実機判断。数値は対象外)。

## 受け入れ条件
- 幻影が: 撃ってくる(敵弾・台帳リズム)/短予告の近接/一閃/弾をサイドステップで躱す/近接を
  counterChance でパリィして反撃/被弾は1秒に1回まで、が**全て実機で目視できる**。
- プレイヤー側の文法が壊れない: 赤帯・赤ラインのカウンター成立は従来どおり/カウンター反撃はパリィ不可/
  弾は打ち返せる。
- `?phantomnow` 無しで既存挙動が1bitも変わらない(全分岐が幻影の型ガードで閉じる)。
- 負荷 2/10(1体分の判定追加のみ・per-frame新規は距離判定と弾走査1本。強glow不使用は不変)。

## 実装地図(Opusバッチ1本・中)
1. phantomScript: melee.windup 250 / parry(cd 1000ms)定数追加、shot(windup型)の定数撤去
2. phantomTick: 銃撃ミラー(敵弾生成)/パリィ成立(counterChance・例外=カウンター反撃)/被弾無敵/
   弾回避の危険写し/中5の持ち越し
3. 対幻影ダメージ合流点の特定と無敵判定(経路の列挙を実装報告に明記)
4. 描画: マズルフラッシュ+反動/パリィの青白スパーク/gp-shot予告系の残骸掃除/小7のモーション整理
5. counterReach: gp-shot 系宣言の撤去(状態が消えるため)+完全性テスト改訂
6. テスト: 中4の結合テスト4本+既存テスト改訂(gp-shot撤去に伴う分)


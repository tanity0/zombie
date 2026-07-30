# 守護霊(ゴースト)完全パリティ 全数監査表(2026-07-30・走査サブエージェント)

正本原則: `BOT_AND_GHOST.md` §2.11(訂正版・2026-07-30 commit `b2cb30f`)。
**除外は2群のみ**: ①カメラズーム/時間停止/スローモーション演出 ②弾薬非消費/テレメトリ除外/SE距離減衰/スコア×0.5(運用系)。
**それ以外の差は全て漏れ=バグ扱い**(スキル倍率・装備ボーナス・射撃クリティカルも再現対象。旧v0.25.2459「素の武器性能」「クリ無し」は廃止)。

## 読み方
- 「ゴースト現状」列: **同一**=プレイヤーと同じ経路/式を通る / **部分**=一部の層だけ再現 / **無し**=未実装(漏れ) / **除外1・除外4**=正本の除外群に該当(バグではない)。
- 行番号は目安(社長方針どおり)。走査時点コミット `b2cb30f`(HEAD)+作業ツリーにuseGameLoop.ts/weaponUtils.tsの未コミットWIP(GHOST-GUN-PARITY銃弾バッチ・下記§1参照)。
- 本表はコードリードのみで作成。実装はしていない。

---

## 1. 銃(全銃種の発射挙動)

| # | 機能 | プレイヤー実装 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 1-1 | count(散弾数)ループ・拡散角 | `weaponUtils.ts:291`(`computeShotDirections`)+`fireWeapon`呼び出し345-349 | **同一(WIP未コミットで修正済み)** | 旧手書き実装は常に1発だった(TEST_HANDOFF 20260730-0944実測)。作業ツリーの`buildGhostGunShots`(weaponUtils.ts:528)が共通ヘルパ経由で揃えた。**★未コミット**=push前に確認要。 |
| 1-2 | 弾速(`PROJECTILE_SPEED_MULT`×1.5込み) | `weaponUtils.ts:314`(`projectileFlightStats`) | **同一(WIP未コミット)** | 同上。旧実装は`gun.projectileSpeed`生値(×1.5抜け)だった。 |
| 1-3 | projectileSize(武器値) | `weaponUtils.ts:317` | **同一(WIP未コミット)** | 旧実装は9×9固定だった。 |
| 1-4 | passthrough/pierce(貫通) | `weaponUtils.ts:393,396-398` | **同一(WIP未コミット・pierceも渡す)** | 旧実装は`pass:false`固定でライフルの貫通が死んでいた。 |
| 1-5 | 発射時crit抽選→着弾時ロール(critChance) | `weaponUtils.ts:376`(生成時critChance算出)+`useGameLoop.ts:8195-8207`(着弾時ロール) | **無し** | `buildGhostGunShots`(weaponUtils.ts:555)が`critChance: 0`固定。加えて`useGameLoop.ts:8219`(`isAllyOwnedShot`)がghost-gun弾を`isDirectGunWeaponKey`から除外し、trapCritBonus/weakCritのロール自体もスキップ(8178,8190)。§2.11訂正により**再現対象**(旧v0.25.2459方針は廃止済み)。 |
| 1-6 | ダメージ=武器damage×scavMult×skillAttackShooterGunMult×equipBonus.damageMult×skillLastMagazineMult | `weaponUtils.ts:367` | **無し** | `buildGhostGunShots`は`damage: gun.damage`の素値のみ(weaponUtils.ts:544)。スカベンジャー/アタックシューター/装備火力/ラストマガジンが一切乗らない。 |
| 1-7 | クリ倍率(skillCritMult)+クリ時skillOutgoingDamageMult/sniperGunMult/comboMasterMult | `useGameLoop.ts:8220-8234` | **明示的に除外** | `isAllyOwnedShot`(8219)がghost-gunをescortと同枠にし、`critMult`はスキル無視の固定倍率(8221-8223)、`dmg`計算も`skillOutgoingDamageMult`等を丸ごとスキップ(8232-8233)。コード内コメント(8215-8218)で「ビルド強化がゴーストに二重に乗らないよう安全側」と明記=**§10で訂正された旧方針そのもの**。統一修正が必要。 |
| 1-8 | リロード/弾切れ/マガジンのリズム | `weaponUtils.ts:194,325-343` | 除外4(運用系) | ゴーストは弾薬消費しない=リロード概念が無い(正本除外②)。バグではない。 |
| 1-9 | PHILL特殊(頭部命中確定クリ+2倍ノックバック) | `useGameLoop.ts`(PHILL専用ブロック・手動照準) | **概念不成立** | ゴーストは中心狙いのオート射撃(部位判定なし)。PHILLを装備中に召喚された場合の挙動は要検討(★未決候補)。 |
| 1-10 | 射程ゲート(`RANGE_BY_CATEGORY`) | `weaponUtils.ts:220-225,340-343` | **同一** | `ghostDriver.ts`の`weapon.gunRangePx`に`RANGE_BY_CATEGORY[gun.category]`をそのまま渡す(`useGameLoop.ts:7174`)。 |
| 1-11 | 標的選択(スタン敵は後回し) | `weaponUtils.ts:236-253`(`pickTarget`) | **不成立(仕様が違う)** | ゴーストは紐付きボス固定(`boundBossId`優先)。プレイヤーの「非スタン優先」ロジックはボス1体構造では出番がない=実害なし。 |

**総括**: 飛翔特性(count/速度/サイズ/貫通)は本セッション時点で修正WIPが存在(未コミット)。**ダメージ倍率層とクリ層は依然完全に欠落**しており、§2.11訂正の眼目(スキル倍率・射撃クリも再現)にまだ追いついていない。

---

## 2. クリ・補正の全層

| # | 機能 | プレイヤー実装 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 2-1 | critChance合成(武器+レベルアップ+装備+バフ) | `weaponUtils.ts:376`: `weapon.critChance + player.critChance + equipBonus.critBonus + quickMagCritBonus + skillBenkeiCritBonus + skillWarmUpCritBonus` | **無し** | ghost-gunは§1-5のとおり0固定。近接系(下記2-4)も同型の合成式を通らない。 |
| 2-2 | skillCritMult(クリ倍率+0.5/0.75/1.0) | `gameStore.ts:1141` | **無し**(銃=8221-8223で明示除外/近接=下記) | |
| 2-3 | skillOutgoingDamageMult(バーサーカー等・全攻撃) | `gameStore.ts:1134` | **無し** | 銃(useGameLoop.ts:8234で明示スキップ)・近接(ghostのdamageEnemy呼び出しは生damageのみ)ともに未適用。 |
| 2-4 | コンボ倍率(skillMeleeComboMult=knife-master+combo-master / skillComboMasterMult=銃含む全攻撃) | `gameStore.ts:1180,1193` | **無し** | ghostの近接ヒット(`useGameLoop.ts:7240`)・銃ヒット(8234)ともに合成しない。 |
| 2-5 | sniperGunMult(停止敵+距離補正) | `gameStore.ts:1223` | **無し** | 銃着弾ロールでisAllyOwnedShot分岐によりスキップ(8234)。 |
| 2-6 | 着弾時ロール: トラップ拘束+10% / 弱点+10% | `useGameLoop.ts:8182-8192` | **無し** | `isDirectGunWeaponKey`(weaponUtils.ts:116)がghost-gunを含まないため`isDirectWeaponHit=false`→両ロールともスキップ。 |
| 2-7 | equipBonus(damageMult/fireRateMult/reloadMult/critBonus/moveSpeedMult/killGraceMult/ammoDropBonus/scrapBonus) | `types/game.ts:231-240`(定義)+各所(`weaponUtils.ts:329,367,376,191`等) | **無し** | ghost-gun/ghost-meleeとも`player.equipBonus`を一切参照しない。装備アクセサリ(クリ系/火力系/取り回し系等)がゴーストに反映されない。 |
| 2-8 | 弱点/トラップの着弾ロール(近接版) | `gameStore.ts:4726`(`trapCritBonus + weakCritBonus`) | **無し** | ghostの近接ヒットは固定`crit=false`(`useGameLoop.ts:7251`)なので、そもそもクリ抽選自体が走らない。 |
| 2-9 | 近接crit判定式(meleeCritChance+player.critChance+各種ボーナス) | `gameStore.ts:4726,5068,5685`(ナイフ/分身/鞭で同型) | **無し** | 上記のとおりghost近接は常時crit=false固定(通常スイング時)。カウンター成立時のみ別枠で確定クリ(§4参照)。 |
| 2-10 | ボスクリの中央適用(移動半減+CD2倍+紫蓄積=CRIT-UNIFY §9.2) | `gameStore.ts` `damageEnemy`内 `crit && isBossType` 分岐(COUNTER_CRIT_LEDGER §9.7) | **部分(カウンター経路のみ同一)** | `ghostCounter.ts:121`の`damageEnemy(boss.id, dmg, false, true)`はcrit=trueを渡すので①の効果(半減+CD2倍+紫蓄積)は**乗る**。しかし通常銃/近接ヒットはcrit=falseのため、この経路自体が発生しない=紫蓄積の主要な発生源(銃連射のクリ)がゴーストには無い。 |
| 2-11 | PHILLヘッドショット確定クリ(裁定Cの補正の外) | `useGameLoop.ts:8198-8207`(headshot===true) | **概念不成立** | 1-9と同じ理由。 |
| 2-12 | 分身(shadow-clone)のクリ→bumpBossCrit | `gameStore.ts:5062`付近(CRIT-UNIFY実装済み) | **対象外** | ghostは分身サブを使用できるがghostドライバ自体は分身の動作を再現しない(§7参照)。 |

**総括**: §2.11/§10訂正の「スキル倍率・装備ボーナス・射撃クリも再現する」に対し、**現行コードは体系的に全層を素通り**している(むしろ`isAllyOwnedShot`のように明示的にスキップするコードが書かれている)。ここが本監査の最大の未消化ブロック。

---

## 3. 近接(スイング・リーチ・コンボ・気絶フィニッシュ・ノックバック・クリ気絶)

| # | 機能 | プレイヤー実装 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 3-1 | 近接リーチ(MELEE_RADIUS=74) | `gameStore.ts:787` | **同一(値の複製)** | `ghostDriver.ts:165`の`GHOST_MELEE_RANGE=74`はコメントで明記された複製値。ただし刀レベル別リーチ(`KATANA_RANGE_BY_LEVEL`=76/92/110・`gameStore.ts:903-907`)やhunting拡張(`HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL`)は反映されない=常に74固定。 |
| 3-2 | スイングダメージ本体 | `gameStore.ts:4726-4727`等(meleeDamage×crit×skillOutgoingDamageMult×meleeComboMult) | **部分(素damageのみ)** | `useGameLoop.ts:7240`: `Math.max(1, Math.round(meleeWeapon?.damage ?? 6))`。§2の全補正が抜ける。 |
| 3-3 | 気絶敵への近接フィニッシュ(処刑・即死) | `gameStore.ts:4710-4711`(ナイフ)/`5450-5451`(刀)/`5678-5679`(鞭)/分身5062 | **無し** | ghostの近接は`damageEnemy(boundBoss.id, dmg, ...)`固定ダメージのみ(`useGameLoop.ts:7251`)。stunned判定・finisher分岐が存在しない。ボス限定ターゲットなので実害は「気絶したボスへの即死処刑が出ない」程度(ボスは即死しない設計=CRIT-UNIFY §9.5と整合するので優先度は低いが、正本上は「全ダメージ/確率補正」の欠落として記録)。 |
| 3-4 | ノックバック付与(敵へ) | `gameStore.ts:2455-2469`(counterMasterKnockback)・`knockbackEnemy`呼び出し各所 | **無し** | ghostの近接命中は`damageEnemy`のみ呼び、`knockbackEnemy`を一切呼ばない。 |
| 3-5 | クリ気絶(5秒スタン=通常敵/半減+CD2倍=ボス) | `gameStore.ts:4727`等 | **部分** | ghostの通常スイングはcrit=false固定なのでクリ気絶が発生しない。カウンター成立時のみ確定クリ(crit=true)経由でボス半減+CD2倍+紫蓄積が乗る(§2-10参照)。 |
| 3-6 | 近接3発目確定クリ(教習用) | `gameStore.ts:4722`コメント | **不成立** | ghostにはヒットカウント概念がない。実害は軽微(演出/教習目的の仕組みのため)。 |

---

## 4. カウンター家系(5系統)

COUNTER_CRIT_LEDGER.md §1・§9.3・§10 が正本。ゴースト側は`ghostCounter.ts`の「請求(claim)→per-bossハンドラ消費」方式(v0.25.2480〜)で本物化済み。

| # | 系統 | プレイヤー成立条件/場所 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 4-1 | 弾反射(窓400ms中の敵弾反射) | `combatTick.ts:447`(`applyEnemyProjectileHits`) | **無し** | ghostは弾を「反射」する経路を持たない(被弾はi-frame頼み)。COUNTER_CRIT_LEDGER §9.3では言及なし=未着手のまま。 |
| 4-2 | ブラストパリィ(着地/爆発AoE無効化+反撃) | `combatTick.ts:223-321` | **部分(giantbat系のみ)** | `ghostCounter.ts`のTTL窓(150ms・`GHOST_COUNTER_CLAIM_TTL_MS`)を使ったパリィがCRIT-UNIFY実装(COUNTER_CRIT_LEDGER §9.7末尾)でgiantbat/pumpkin系の着地爆発に追加された。**crit=trueで確定クリ**(§9.3裁定どおり)。他ボス族(裏4/天使6/idol)のブラスト技への適用は個別確認が必要(未検証)。 |
| 4-3 | 接触パリィ(dashParried=突進/硬直/気絶中敵) | `combatTick.ts:678-807` | **部分** | giantbat系は`combatTick.applyGhostBossParry`(568-655)で対応。気絶パリィ(気絶中ボスへの接触無効化)はCOUNTER_CRIT_LEDGER §9.7★1で「ゴーストに該当する接触被弾経路自体が存在しないためクローズ」= 仕様上N/A判定済み(欠落ではない)。 |
| 4-4 | per-boss体当てカウンター(thor/裏3/idol/天使6) | `useGameLoop.ts`各ブロック+`angelBossTick.ts:280` | **同一** | `ghostCounter.ts`のconsumeGhostCounterClaimを各per-bossハンドラのghost分岐が消費し、プレイヤー成立と同じ機械的効果(技中断+確定クリ+bumpBossCrit)を与える(v0.25.2480実装・BOT_AND_GHOST.md §8)。 |
| 4-5 | 気絶パリィの副作用(気絶解除) | `combatTick.ts`(dashParriedEnemyPatchが`stunUntil: undefined`) | **N/A(対象経路なし)** | COUNTER_CRIT_LEDGER §9.7★1で確認済み。 |
| 4-6 | カウンター反撃ダメージ式 | プレイヤー: `borrowedGun.damage × BOSS_CRIT_DAMAGE_MULT`(装備/スキル倍率あり) | **部分(スキル倍率なし)** | `ghostCounter.ts:72-75`(`ghostCounterDamage`)は`(borrowedGunDamage ?? 12) × BOSS_CRIT_DAMAGE_MULT`のみ。equipBonus/skillCritMult/skillOutgoingDamageMultは明記コメントで「乗せない(v0.25.2459方針)」=**§10訂正で再検討が必要な箇所**。 |
| 4-7 | 成立時の付与無敵(INVULN_MS) | プレイヤー: `invulnerable+invulnerableTime` | **同一** | `ghostCounter.ts:112-119`が専用フィールド`ghostInvulnUntil`へINVULN_MS付与(v0.25.2489で追加・パリティ漏れ修正済み)。 |
| 4-8 | 演出(青Counter!+金クリ層+SE) | `triggerCounter`系 | **同一** | `applyGhostCounterEffect`(ghostCounter.ts:97-127)がプレイヤーと同型の視覚(リング/バースト/glow/コールアウト)+SE(距離減衰)を出す。 |

---

## 5. 刀モード(katana/murasame)

| # | 機能 | プレイヤー実装 | ゴースト現状 |
|---|---|---|---|
| 5-1 | 一閃ダッシュ(`triggerKatanaDash`・固定距離154px/180ms高速移動・ダメージ×3) | `gameStore.ts:6044-`(`KATANA_DASH_DISTANCE`等 902-931) | **無し** |
| 5-2 | オート斬撃(600ms間隔の自動スイング) | `gameStore.ts:910`(`KATANA_SLASH_INTERVAL_MS`) | **無し** |
| 5-3 | 村雨(クールダウン無し連発) | `gameStore.ts:1000-1003`(`hasMurasame`) | **無し** |
| 5-4 | フィニッシュ一閃(気絶敵への即死一閃) | `gameStore.ts:5450-5451` | **無し** |
| 5-5 | 着地後硬直(KATANA_DASH_RECOVERY_MS=200ms) | `gameStore.ts:923` | **無し(概念不成立)** |
| 5-6 | 刀専用ロコモーション(入力無視の固定方向高速移動) | `gameStore.ts:3628-3709`(`katanaDashUntil`) | **無し** |

BOT_AND_GHOST.md §6(v0.25.2449)で既知の未対応として記録済み: 「katana/murasame/whip: サブCDではなくカウンター窓経済で動く=ゴーストの『CDが明けたら使う』意思決定と形が合わない」。ghostがkatanaを装備している間の`meleeWeapon`(=`player.weapons.find(w=>w.isMelee)`)には刀オブジェクトが乗らない可能性が高い(刀はsubWeaponsであり、通常武器スロットのisMelee近接とは別枠)ため、**ghost自体が「刀を持っていないナイフ役」として振る舞っている可能性が高い**(要コード確認=★実装バッチの下調べ項目)。

---

## 6. 鞭・四神・ジャンク等の近接置換/連動サブ

| # | 機能 | プレイヤー実装 | ゴースト現状 |
|---|---|---|---|
| 6-1 | 鞭(whip)のリーチ延長スイング(`whipMult`) | `gameStore.ts:5595-5686` | **無し**(§6未対応リスト。CDではなくカウンター窓経済) |
| 6-2 | 鞭のbumpBossCrit紫蓄積(v0.25.2506で解消済み・§9.4踏襲) | `gameStore.ts`(コミットa75b425) | **対象外**(鞭自体を振らないため無関係) |
| 6-3 | 四神舞(shijin・リズム入力で技発動。刀と同じ排他グループ) | `gameStore.ts:11789-`(タップ/フリック判定+`SHIJIN_BY_ARROW`) | **無し**(§6未対応リスト「CD概念なし・常駐/リズム系」) |
| 6-4 | ジャンクウェポン(junk-weapon・近接スイング同時発射5連弾) | `weaponUtils.ts:479-516`(`buildJunkWeaponPellets`)・発動入口=`triggerCounter`系近接スイング | **無し**(§6未対応リスト「発動入口が近接スイング=ゴーストの近接スイングに相乗りさせる配線が必要」) |
| 6-5 | 賢者の石(sage-stone・alchemyの上位・ハリケーン) | `gameStore.ts:5836-5837`(`sageStoneHurricaneMult`) | **無し**(§6「CD概念なし=常駐召喚」) |

---

## 7. サブウェポン全種(SUB_WEAPON_KEYS・`campaign.ts:653-677`+murasame/sage-stone含む24種)

オーナー抽象化(G2.6・`subWeaponOwner.ts`)は入口レベルで全種に対応済みだが、**実際にゴーストが発動できるのは以下の対応表**(BOT_AND_GHOST.md §6・v0.25.2449時点の記録を本走査で再確認)。

| サブウェポン | G2.6オーナー抽象化 | ゴースト発動 | メモ |
|---|---|---|---|
| heavy-grenade | ✅ | ✅ | 予約方式(`shouldGhostClaimSub`)で発動。狙い先=紐付きボス。 |
| marksman-trap | ✅ | ✅ | 同上。 |
| decoy | ✅ | ✅ | 同上(狙い無し設置系)。 |
| shield | ✅ | ✅ | 設置+バッシュ含め動作(SubStyle計測対象)。 |
| turret | ✅ | ✅ | 同上。青白tint済み。 |
| fire-knife | ✅ | ✅ | 狙いを持つ2種の一つ(`pickSubAimTarget`)。 |
| striker-quick-mag | 未対応 | **無し** | 「プレイヤーが拾いに行く」前提の設計。ゴースト位置から投げると回収不能。 |
| dog | 未対応 | **無し** | フェッチ状態機械がプレイヤー座標を毎フレーム直読み。 |
| katana / murasame | 未対応 | **無し** | §5参照(カウンター窓経済)。 |
| whip | 未対応 | **無し** | §6参照(同上)。 |
| alchemy / sage-stone | 未対応 | **無し** | CD概念なし(常駐召喚)。 |
| shijin | 未対応 | **無し** | CD概念なし(リズム)。 |
| drone-boomerang | 未対応 | **無し** | 発動入口が近接スイング。 |
| wire-anchor | 未対応 | **無し(移動系・特記対象)** | 効果=オーナーの体の高速移動(スラム/プラント/ホップ)。ghostDriverの移動系への特殊配線が必要=**現在オーナー常にプレイヤー固定**。§2.11では「除外1/4に該当しない=写す対象」。優先度が高い個別項目。 |
| homing | 未対応 | **無し** | ロック蓄積=タッチ入力の押しっぱなし/離しで発射という入力方式そのもの。 |
| shadow-clone | 未対応 | **無し** | 発動入口が近接スイング。 |
| molotov | 未対応 | **無し** | 「本人が移動中のみ足元へ設置」=本人の移動と結合。 |
| first-aid-kit | 未対応 | **無し** | CD概念なし(1ラン使い切り)。 |
| sensor-mine | 未対応 | **無し** | チャージ制(個別チャージが別々に回復)でCD正規化を見送り済み(★未決2)。 |
| support-sniper | 未対応 | **無し** | 専用タイマーが「プレイヤー移動中のみ」進行。 |
| flare-gun | 未対応 | **無し** | 発動入口が近接スイング。 |
| junk-weapon | 未対応 | **無し** | 同上(§6-4参照)。 |
| striker-hunting | 未対応 | **無し** | CD概念なし(静止チャージ)。 |

**未対応14種+対応6種+murasame/sage-stone(katana/alchemyの上位で同枠)=合計24種中6種のみ実働。**

---

## 8. 被弾系

| # | 機能 | プレイヤー実装 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 8-1 | i-frame長(INVULN_MS=700ms) | `gameStore.ts:1797`+`damagePlayer`(`invulnerable`/`invulnerableTime`) | **同一** | `damageSummon`(`gameStore.ts:6022-6042`)が同じINVULN_MSでi-frame判定。値の複製ではなく同一定数を共有。 |
| 8-2 | 被弾ノックバック(PLAYER_KNOCKBACK_SPEED=460・260ms) | `gameStore.ts:6347-6357,6384-6386`(`damagePlayer`) | **無し** | `damageSummon`(6022-6042)は`health`と`lastHit`のみ更新。knockbackVx/Vy/knockbackUntilの類が一切存在しない。ボス技ヒット(`combatTick.ts:106`の`damageGhostAllyByBossMove`)も同じdamageSummon止まり。 |
| 8-3 | 被弾点滅(白フラッシュ・ENEMY_HIT_FLASH) | `pixiScene.ts:9036-9055`(`view.hitFlash`・`e.lastHit`基準) | **無し** | `drawGhostAlly`(pixiScene.ts:7971-8194)内に`hitFlash`/`lastHit`の参照が無い(grep確認済み)。ghost-allyは常時固定の青白tint(`GHOST_ALLY_TINT`)のみで、被弾の瞬間を伝える追加フラッシュが無い。 |
| 8-4 | 被弾音 | `damagePlayer`系のSE | **同一** | BOT_AND_GHOST.md §2.9「被弾音」節(v0.25.2480)。`useGameLoop.ts:7111-7134`が`lastHit`エッジ検知で`player-damage`SEを距離減衰付きで再生。 |
| 8-5 | 被弾時の被ダメ補正(skillIncomingDamageMult=ナイト×0.8/バーサーカー×1.2) | `gameStore.ts:6307`(`damagePlayer`) | **無し** | `damageSummon`は`amount`を素通しで減算するのみ、補正なし。 |
| 8-6 | 画面シェイク(被弾方向) | `gameStore.ts:6373-6378`(`damagePlayer`) | **N/A(意図的)** | ghost被弾でプレイヤー画面を揺らす設計ではない(ghostCounter.tsのGHOST_FX_SHAKE_ENABLEDは「ゴースト**起因の攻撃**」用シェイクで被弾とは別)。除外1(演出)の範囲内と解釈できるが明記なし=★未決候補。 |
| 8-7 | ワクチン(vaccineRevives)復活 | `gameStore.ts:6320-6345` | **N/A** | ghostにはvaccine概念がない(妥当。プレイヤー専用消費アイテム)。 |

---

## 9. 移動系

| # | 機能 | プレイヤー実装 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 9-1 | 歩行速度(基礎+装備+スキル反映済みの`player.speed`) | `types/game.ts:27` | **部分(召喚時点の1回スナップショット)** | `directorTick.ts:683`: `speed: snap?.speed ?? player.speed`。召喚成立の瞬間の値を固定するだけで、以後ラン中に速度バフ(スキル/装備/ダンスモード等)が変化してもゴーストへ反映されない。 |
| 9-2 | 速度ランプ(MOVEMENT_REWORK.md・持続移動で加速) | `types/game.ts:113-118`(`speedRampSustainMs/DirX/DirY`) | **無し** | ghostの移動は`ghostNow.speed * deltaTime`固定(`useGameLoop.ts:7180`)で、速度ランプ状態機械を一切参照しない。 |
| 9-3 | ワイヤーアンカー移動(スラム/プラント/ホップの高速移動) | `gameStore.ts`(`wireDashUntil`等・§8参照) | **無し** | §7でも指摘した「移動系・特記対象」。サブウェポンの効果自体が「オーナーの体の移動」なのでghostDriverへの特殊配線が必須。 |
| 9-4 | 刀ダッシュ(一閃・固定距離高速移動) | `gameStore.ts:3628-3709` | **無し** | §5参照。 |
| 9-5 | 四神スライド(shijinSlideUntil・フリックで固定方向へ滑走) | `gameStore.ts:3638-3639,11961` | **無し** | §6参照。 |
| 9-6 | 追従リーシュ(600px超で瞬間ワープ) | (ゴースト専用機構) | **ゴースト専用仕様** | `ghostDriver.ts:375-387`(`ghostLeashWarp`)。プレイヤーには存在しない挙動=パリティ対象外(霊体の世界観として意図的に追加された機能)。 |
| 9-7 | 木/岩などのオブジェクトすり抜け | (プレイヤーは衝突する) | **意図的な差** | `useGameLoop.ts:7183-7186`のコメントで「霊体はオブジェクトをすり抜ける」と明記=社長指示による意図的差分(詰まって置き去りになる事故の根絶)。バグ扱いにしない。 |
| 9-8 | 停止/旋回の慣性(vx/vy 0.3秒の入力追従) | `types/game.ts:16-19`コメント | **無し** | ghostは`decideGhost`の`moveX/moveY`をそのままstep積算(即応答)。プレイヤーの滑らかな慣性モデルとは別の動き方。 |

---

## 10. スナップショットの不足(完全再現に必要な計測時ビルド情報)

現行 `PlayerProfile.snapshot`(`playerTraits.ts:69,105`) = `{ maxHealth: number; speed: number; level: number }` のみ(+別フィールドの`srcClass`)。
`§2.11`「含意=スナップショットのビルド化…現行snapshotを拡張する」に対し、**以下が丸ごと欠落**している:

| # | 欠落項目 | 用途(再現に必要な理由) | 現状の代替(暫定挙動) |
|---|---|---|---|
| 10-1 | 武器ロードアウト(装備銃キー・武器レベル/tier・近接武器キー) | ghost-gun/近接ダメージの元になる武器性能そのもの | `directorTick`/`useGameLoop`が**召喚時点の"現在装備"を都度借用**(`getActiveGun(gsPlayer)`・`useGameLoop.ts:7144`)。計測時のビルドではなく**召喚時のプレイヤーの今の装備**を使う設計になっている(BOT_AND_GHOST.md §3裁定2「攻撃力=プレイヤーの現在装備を借りる」)ため、必ずしも不足とは言えないが、**「その撃破ランのビルドを再現する」という完全パリティの趣旨とは異なる**=設計判断の要確認点。 |
| 10-2 | 装備スキル(skills[]・skillLevels) | skillCritMult/skillOutgoingDamageMult/各種パッシブの再現に必須 | 保存なし。ghostはプレイヤーの**現在の**`player.skills`を経由しない(§2の全補正が無い根本原因の一つ)。 |
| 10-3 | 装備3点(equipment: EquipLoadout)/equipBonus | equipBonus.damageMult等8種の再現に必須(`types/game.ts:231-240`) | 保存なし。参照経路も無い。 |
| 10-4 | critChance(計測時のplayer.critChance本体) | クリ層の再現に必須 | 保存なし。 |
| 10-5 | パッシブ累積(stunDurationMult/ammoDropBonus/scrapMult/passiveCounts) | クリ気絶時間・ドロップ率等の再現 | 保存なし(スコープ外である可能性は高いが正本の「全ダメージ/確率補正」に含まれ得るため列挙)。 |
| 10-6 | サブウェポン所持(subWeapons[]・subWeaponLevels) | どのサブを何Lvで持っていたか(G2.6対応6種の発動性能に影響) | 保存なし。ghostは**召喚時点の**`player.subWeapons`(暗黙に現在値)を経由(`shouldGhostClaimSub`呼び出し元・`useGameLoop.ts:7192`はプレイヤーの現在CD状態を共有=「1つの財布」の設計なので必然だが、計測時と異なるビルドで召喚された場合にズレる)。 |
| 10-7 | キャラ固有スキル(スカベンジャー/マークスマン/ヘビーガンナー等)の有効状態 | scavMult等の再現 | 保存なし(`srcClass`はあるが、これは「絵の選択用」であり性能には使われていない)。 |

**設計論点(実装前に確認が必要)**: 現行は「攻撃力=召喚時点でのプレイヤーの**今の**装備を借りる」(§3裁定2・変更するかは★未決)。これを維持するなら10-1/10-6は「不足」ではなく仕様として妥当。一方10-2〜10-5(スキル/装備/クリ率/パッシブ)は**召喚時点の"今の"player state からそのまま計算に使える値**なので、スナップショット保存は不要で「ghost-gun/ghost-melee計算時に`useGameStore.getState().player`から都度読む」だけで§2の欠落は解消できる可能性が高い(=実装コストは見た目ほど大きくない。純粋なスナップショット拡張が必要なのは「その撃破ランのビルドを再現したい」場合のみ)。

---

## 未対応・部分対応の全リスト(実装バッチ候補・優先順・工数感S/M/L)

優先順は「①社長が明示的に名指しした項目(刀・一閃・ワイヤー・被弾反射)」「②§2.11/§10訂正の主眼(スキル倍率・装備・射撃クリ)」「③実害の大きさ(体験に出るか)」の順で並べた。

| 優先 | 項目 | 該当箇所 | 工数感 | 備考 |
|---|---|---|---|---|
| 1 | ✅**済(v0.25.2514)** **銃ダメージ倍率層の全復元**(scavMult/skillAttackShooterGunMult/equipBonus.damageMult/skillLastMagazineMult) | weaponUtils.ts `buildGhostGunShots`(528-557)+useGameLoop.ts 8208-8234の`isAllyOwnedShot`分岐撤去 | **M** | §2.11/§10訂正の中心。`useGameStore.getState().player`から都度計算すれば大きな新規実装は不要(既存fireWeaponの式を横展開)。**現在未コミットのGHOST-GUN-PARITY WIPと同一コミットにまとめるのが自然**(既にダメージ計算箇所を触っている)。 |
| 2 | ✅**済(v0.25.2514)** **銃クリの復元**(critChance算出+着弾時ロール対象化) | weaponUtils.ts 555の`critChance:0`固定を撤去+useGameLoop.ts 8178の`isDirectGunWeaponKey`にghost-gunを含める判断+8219の`isAllyOwnedShot`からghost-gun除外 | **M** | 社長「射撃クリティカルも再現しないと」に直接該当。ボス×0.5+下限5%(CRIT-UNIFY式)もそのまま使える。 |
| 3 | ✅**済(v0.25.2514)** **近接ダメージ倍率層の全復元**(skillOutgoingDamageMult/meleeComboMult/critChance判定) | useGameLoop.ts 7237-7292(ghost近接ブロック)を`gameStore.ts`の`triggerCounter`系と同じ式に寄せる | **M** | 通常スイングとカウンター反撃の両方に影響。カウンター反撃ダメージ式(`ghostCounter.ts:72-75`)も同時見直しが必要。 |
| 4 | ✅**済(v0.25.2514)** **装備(equipBonus)の全面適用** | weaponUtils.ts/gameStore.tsの各damage式にequipBonus参照を追加(ghost用) | **M** | 上記1・3と同時実装が効率的(同じ計算式に差し込むだけ)。 |
| 5 | **刀モード(一閃ダッシュ/オート斬撃/村雨/フィニッシュ一閃)の再現** | 新規: ghostDriver.tsに刀専用の意思決定分岐+useGameLoop.tsに`triggerKatanaDash`相当のゴースト実行ブロック | **L** | 社長が名指しで「刀とか一閃とかも全部再現して」と明言した最重要項目の一つ。専用ロコモーション(katanaDashUntil系)をghost用に複製する必要があり、既存のカウンター窓経済(CD不使用)ともghostDriverの意思決定モデル(reactionMs/counterChance抽選)が根本的に噛み合わない=設計から要検討。 |
| 6 | **ワイヤーアンカー(スラム/プラント/ホップ)のゴースト対応** | ghostDriver.ts(移動系への特殊配線)+useGameLoop.tsのwire実行ブロックにownerパラメータ拡張 | **L** | 社長が名指し。§2.8で「移動系=現在オーナー常にプレイヤー=未対応→写す対象」と特記済み。オーナー抽象化(subWeaponOwner.ts)は入口があるが、実際の高速移動処理(katanaDashUntil型のロコモーション上書き)をghost実体に適用する仕組みが無い。 |
| 7 | ✅**済(v0.25.2514)** **被弾ノックバックの復元** | gameStore.ts `damageSummon`(6022-6042)にknockbackVx/Vy/knockbackUntil相当を追加 | **S** | 社長が名指し。damagePlayerの式をSummon型に横展開するだけ(Summon型にknockback系フィールドの追加が必要な場合はSで収まらずM)。 |
| 8 | **弾反射(カウンター家系#1)のゴースト対応** | combatTick.ts `applyEnemyProjectileHits`(447)にghost分岐を追加 | **M** | 社長が名指し(「弾反射も全部再現」)。現状ghostは反射する経路自体が無い=新規実装。反射弾の生成(弾の`reflected`フラグ書き換え等)をゴースト起点で行う設計が必要。 |
| 9 | ✅**済(v0.25.2514)** **被弾点滅(白フラッシュ)の追加** | pixiScene.ts `drawGhostAlly`(7971-8194)にhitFlash相当を追加 | **S** | 描画のみ。既存`view.hitFlash`パターン(9036-9055)を流用可能。 |
| 10 | **気絶敵への近接フィニッシュ(処刑)のゴースト対応** | useGameLoop.ts 7237-7292のghost近接ブロックにfinisher分岐追加 | **S** | 実害は小さい(ghostは基本ボス専属でボスは即死しない設計=CRIT-UNIFY §9.5)が、正本上は欠落。 |
| 11 | **サブウェポン未対応14種の個別配線**(wire-anchor除く: striker-quick-mag/dog/katana系/whip/alchemy系/shijin/drone-boomerang/homing/shadow-clone/molotov/first-aid-kit/sensor-mine/support-sniper/flare-gun/junk-weapon) | 各サブの発動入口(BOT_AND_GHOST.md §6の表参照) | **L(種によりS〜L)** | 「近接スイング相乗り型」(drone-boomerang/sensor-mine/flare-gun/junk-weapon/shadow-clone)は5-6と共通の近接実行ブロック整備で束ねられる可能性がある=先に近接まわりを整備すると割安。dog/molotov/support-sniper/homingは個別のプレイヤー直読み箇所の置き換えが必要でLサイズ。 |
| 12 | ✅**済(v0.25.2514)** **スナップショットのビルド拡張**(skills/skillLevels/equipment/equipBonus/critChance/subWeapons/subWeaponLevels) | playerTraits.ts `PlayerProfile.snapshot`型拡張+計測箇所(directorTick.ts等) | **S〜M** | §10で論じたとおり、「召喚時点の"今の"player stateを都度参照する」方式で1〜4を実装するなら**スナップショット拡張自体は不要**になる可能性がある。「その撃破ランのビルドを再現したい」という要求が明確になった場合のみ本項目が必要=先に設計判断を仰ぐのが安い(実装前に★未決として提起すべき)。 |
| 13 | ✅**済(v0.25.2514)** **被弾時のskillIncomingDamageMult(ナイト/バーサーカー)** | gameStore.ts `damageSummon` | **S** | 12(装備/スキル復元)と合わせて実装すると安い。 |
| 14 | ✅**裁定3で決着(出さない)** **画面シェイク(被弾時)の扱い明確化** | ghostCounter.ts / useGameLoop.ts | **S(判断が主)** | 実装というより「除外1(演出)に含めるか」の裁定が先。 |
| 15 | ✅**済(v0.25.2514・裁定4=率の再現)** **PHILL特殊(頭部確定クリ)のゴースト適用可否** | useGameLoop.ts PHILLブロック | **S(判断が主)** | ghostのオート照準は部位判定を持たないため、そもそも概念が成立するか要裁定。 |

### 実装前に裁定が必要な★未決(本走査で発見)
1. **攻撃力の基準**: 「召喚時点の今の装備を借りる」(既存裁定・§3)のままでよいか、「計測時(その撃破ラン)のビルドを再現する」へ変えるか。後者ならスナップショット拡張(項目12)が必須になり、工数が跳ね上がる。
2. **刀/ワイヤーの実装方式**: ghostDriverの意思決定モデル(reactionMs/counterChance/mobility抽選)とカウンター窓経済/ロコモーション上書き系サブウェポンは設計の前提が異なる。個別に「ゴースト版の簡易モデル」を作るか、既存の状態機械(katanaDashUntil等)をSummon型にも持たせて完全共有するかの方針決定が要る。
3. **被弾時の画面シェイク/カメラ演出**の要否(除外1の範囲かどうか)。
4. **PHILL(部位判定武器)をゴーストが装備している時の挙動**(ヘッドショット概念の代替案が必要)。

## 実装ログ: バッチGHOST-BUILD-1(v0.25.2514・優先1-4+項目12-13+項目9+項目7)

**消し込み(✅=このバッチで解消)**

| 項目 | 状態 | 実装 |
|---|---|---|
| 12 スナップショットのビルド拡張 | ✅ | `types/game.ts` に `PlayerBuildSnapshot`(旧3項目の上位互換=先頭3つ必須・以降は全て任意で後方互換)。記録は `playerTraits.tickPlayerTraits`(ボス交戦中の毎tickに `snapshotPlayerBuild` の純粋コピー)→ `endSession` で保留レコードへ。消費は `Summon.ghostBuild`(召喚時に `directorTick` が載せる)。 |
| 1 銃ダメージ倍率層 | ✅ | `weaponUtils.gunShotBaseDamage`(fireWeaponから抽出した**唯一の式**)を `buildGhostGunShots` が疑似Playerで通す=scavenger/attack-shooter/equip.damageMult/last-magazine が乗る。 |
| 2 銃クリの復元 | ✅ | `weaponUtils.gunShotCritChance`(同じく抽出)で `critChance` を運ぶ。着弾時は既存 `projectileHitCritChance`(ボス×0.5+下限5%)でロール=プレイヤーと同式。`isDirectGunWeaponKey` に `ghost-gun` を追加=トラップ+10%/弱点+10%のロール対象化。`isAllyOwnedShot` から ghost-gun を**撤去**(escortのみ残置)。crit時は `skillCritMult`+`skillOutgoingDamageMult`+`sniperGunMult`(距離はゴースト基準)が乗り、`damageEnemy(crit=true)` 経由で bumpBossCrit(紫蓄積)+ボス移動半減も中央適用される。 |
| 3 近接ダメージ倍率層 | ✅ | `gameStore.meleeSwingBaseDamage`(5箇所から抽出)+`gameStore.meleeHitCritChance`(4箇所から抽出)を守護霊の近接が共有。クリ抽選が走るようになり(旧: crit=false固定)、金の数字/バーストも出る。 |
| 4 装備(equipBonus)の全面適用 | ✅ | 上記1・3・カウンター反撃の全式が疑似Playerの `equipBonus` を読む(疑似Playerの equipBonus は**計測時の集計済み値**)。 |
| 4-6 カウンター反撃ダメージ式 | ✅ | `gameStore.counterReplyDamage`(プレイヤーの6箇所から抽出した唯一の式)へ `ghostCounterDamage` が委譲。基準銃=計測時ビルドのアクティブ銃。 |
| 13 被弾時 skillIncomingDamageMult | ✅ | `damageSummon` が ghost-ally のみ `skillIncomingDamageMult(buildPseudoPlayer(s.ghostBuild, live))` を適用(錬金術召喚は従来どおり素通し)。 |
| 7 被弾ノックバック | ✅ | `Summon` に knockbackVx/Vy/Until。`damageSummon(id, amount, fromX, fromY)` が `PLAYER_KNOCKBACK_SPEED/MS` でプレイヤーと同式に付与、`updateSummons` の ghost-ally 分岐が線形減衰で消化(壁解決なし=霊体のすり抜け仕様を維持)。KB中はゴースト自身の移動を止める(プレイヤーが入力を無視されるのと同型)。源の位置は接触/爆発/カプセル/床/敵弾の各経路から渡す。**被弾シェイクは出さない(裁定3)**。 |
| 9 被弾点滅 | ✅ | `pixiScene.drawGhostAlly` に敵と同じ `hitFlash`(白シルエット加算・`ENEMY_HIT_FLASH_MS`)を流用。描画のみ。 |
| 1-9 PHILL | ✅(裁定4の範囲) | 計測=`recordPhillShot`(gameStore.firePhillShot 1行)+`recordPhillHeadshot`(useGameLoop 着弾で headshot===true の1行)→ ラン累計を撃破セッションのビルド写しへ `phillHeadshotRate` として焼く。再現=ゴーストがPHILLを持つ時、その確率で `Projectile.headshot=true` を立てて撃つ(着弾ロールを飛ばして確定クリ)。 |
| 10-1/10-6 武器・サブの保存 | ✅(保存のみ) | ロードアウト(gunKeys/activeGunKey/meleeKey)とサブ(subWeapons/subWeaponLevels)を保存。**銃・近接は召喚時にスナップショットから復元**(「今の装備借用」は欠損時のみのフォールバックへ降格)。サブの選択は「1つの財布」設計のまま(項目11=別バッチ)。 |

**実装メモ(次バッチが踏む前提)**
- 共通化の要は `src/utils/playerBuild.ts`(純粋・store非依存=記録側と共有)と `src/utils/ghostBuild.ts`(createWeaponで武器を復元・summon.id で1件メモ化)。**倍率は疑似Playerを既存関数へ渡すだけ**で、ゴースト用の式は1本も書いていない(§2.11補足のドクトリン)。
- 疑似Playerの一時バフ窓(quickMagCritUntil/benkeiBuffUntil/scavengerBuffUntil/knifeCombo*)は**中立化**した(ゴーストが自分で得られない本人の瞬間バフを二重取りしないため)。よって scavenger(弾薬拾得後3秒)は実質×1、弁慶/クイックマガジンは0。将来ゴースト側にこれらの窓を持たせれば同じ式でそのまま効く。
- 位置/HP依存の倍率(sniperGunMult の距離・berserker の失HP)は `ghostActorPlayer` で**ゴースト実体の値**で評価する。ゴースト解散後に残った在弾は「最後に解決したビルド」で着弾する(メモ化を残す設計)。
- パッシブ累積(項目10-5: stunDurationMult/ammoDropBonus/scrapMult)は発注のスコープ外=スナップショットに入れていない(疑似Playerでは本人の現在値が使われる)。
- 守護霊がPHILLを持つ場合、弾の `weaponType` は `gun.category`='phill' のため pixiScene の弾描画は default 分岐(白い丸)になる(PHILL弾の専用絵は 'phill-bullet' 分岐)。**元からの状態**でこのバッチでは変えていない=絵を揃えるなら別途裁定。

## ★未決(GHOST-BUILD-1で発生・社長裁定待ち)
1. **ゴースト側のコンボ計数**: `skillComboMasterMult`(全攻撃)/`skillMeleeComboMult`(近接)はフィニッシュコンボ数・
   ナイフコンボ数を要求するが、ゴーストはこの計数を持たないため常に中立(×1)。プレイヤーのコンボを借りると
   「本人のコンボがゴーストにも乗る」二重取りになるため中立にした。ゴースト自身のコンボ計数
   (Summonに knifeCombo/finishCombo 相当を持たせる)を作るかは要裁定。
2. **バーサーカーの失HP基準**: 疑似Playerの health/maxHealth は**ゴースト実体**の値にした(ゴーストが傷つくほど
   強くなる=「その時のあなた」の写しとして自然な解釈)。「計測時のHP割合で固定」にするなら要裁定。

## ★未決の裁定(2026-07-30・社長)
1. **攻撃力の基準=計測時のステータス・ビルドをそのまま再現**(確定)。→ 項目12(スナップショットの
   ビルド拡張)は**必須の前提**に昇格: 武器ロードアウト・スキル+Lv・装備(equipBonus)・critChance・
   サブウェポン+Lvを撃破セッション確定時に丸ごと保存し、召喚時はそのビルドで戦う(「今の装備借用」廃止)。
2. **刀/ワイヤーの実装方式=共有**(確定)。Summon型に状態(katanaDashUntil/wire系相当)を持たせ、
   既存状態機械の主語を差し替える=ドクトリン「写すな、共通化しろ」どおり。簡易モデル禁止。
3. **ゴースト被弾時の画面シェイク=出さない**(確定・除外1の演出枠)。
4. **PHILL=撃破ラン中の「撃った数とヘッドショット率」を計測・保存し、ゴーストはその確率で
   ヘッドショット(確定クリ)を再現**(確定)。→ G4a計測に phillShots/phillHeadshots を追加し
   スロットへ保存。**ボス側の対策(嵌め防止)は社長が後日別途裁定**=今は確率再現のみ実装。

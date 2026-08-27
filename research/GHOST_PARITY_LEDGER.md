# 守護霊(ゴースト)完全パリティ 全数監査表(2026-07-30・走査サブエージェント)

正本原則: `BOT_AND_GHOST.md` §2.11(訂正版・2026-07-30 commit `b2cb30f`)。
**除外は2群のみ**: ①カメラズーム/時間停止/スローモーション演出 ②リザーブ弾薬非消費/テレメトリ除外/SE距離減衰/スコア×0.5(運用系)。
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
| 1-8 | リロード/弾切れ/マガジンのリズム | `weaponUtils.ts`(共通の装填/リロード/発射後状態) | ✅**同一(v0.25.2830)** | 旧「リザーブ弾非消費=マガジン/リロードも無い」は解釈漏れ。Weapon[]・容量・装填数/時間補正・連射補正・ゴーストシューター・ラストマガジン・クイックマガジンをプレイヤーと同じ共通式へ接続。リザーブ在庫だけ除外4で非消費。 |
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
| 3-3 | 気絶敵への近接フィニッシュ(処刑・即死) | `gameStore.ts:4710-4711`(ナイフ)/`5450-5451`(刀)/`5678-5679`(鞭)/分身5062 | ✅**同一(v0.25.2525)** | ghostの近接は`damageEnemy(boundBoss.id, dmg, ...)`固定ダメージのみ(`useGameLoop.ts:7251`)。**v0.25.2525(GHOST-REFLECT-MELEE-SUBS 発注B)で解消**: 裁定を純関数 `meleeExecute.resolveStunnedMeleeHit` へ抽出し、プレイヤーのナイフスイングと守護霊の近接スイング(`applyGhostMeleeFinisher`)が同じ1本を通る(刀経路は v0.25.2522 で解消済み)。旧記述: stunned判定・finisher分岐が存在しない。ボス限定ターゲットなので実害は「気絶したボスへの即死処刑が出ない」程度(ボスは即死しない設計=CRIT-UNIFY §9.5と整合するので優先度は低いが、正本上は「全ダメージ/確率補正」の欠落として記録)。 |
| 3-4 | ノックバック付与(敵へ) | `gameStore.ts:2455-2469`(counterMasterKnockback)・`knockbackEnemy`呼び出し各所 | **無し** | ghostの近接命中は`damageEnemy`のみ呼び、`knockbackEnemy`を一切呼ばない。 |
| 3-5 | クリ気絶(5秒スタン=通常敵/半減+CD2倍=ボス) | `gameStore.ts:4727`等 | **部分** | ghostの通常スイングはcrit=false固定なのでクリ気絶が発生しない。カウンター成立時のみ確定クリ(crit=true)経由でボス半減+CD2倍+紫蓄積が乗る(§2-10参照)。 |
| 3-6 | 近接3発目確定クリ(教習用) | `gameStore.ts:4722`コメント | **不成立** | ghostにはヒットカウント概念がない。実害は軽微(演出/教習目的の仕組みのため)。 |

---

## 4. カウンター家系(5系統)

COUNTER_CRIT_LEDGER.md §1・§9.3・§10 が正本。ゴースト側は`ghostCounter.ts`の「請求(claim)→per-bossハンドラ消費」方式(v0.25.2480〜)で本物化済み。

| # | 系統 | プレイヤー成立条件/場所 | ゴースト現状 | メモ |
|---|---|---|---|---|
| 4-1 | 弾反射(窓400ms中の敵弾反射) | `combatTick.ts:447`(`applyEnemyProjectileHits`) | ✅**同一(v0.25.2525)** | **GHOST-REFLECT-MELEE-SUBS 発注A で解消**: 反射1回分を `applyCounterReflect(projId, now, subject, tunables, ghostId?)` へ主語引数化し、守護霊は `Summon.ghostCounterWindowEnd`(近接スイング起点・`COUNTER_WINDOW`)中の被弾を同じ反射弾生成で打ち返す。反射のたびの窓延長(`COUNTER_EXTEND_PER_HIT`)も同一。反射弾は `ghost-reflect` 帰属=計測除外/ヘイト'ghost'/倍率の主語=疑似Player。 |
| 4-2 | ブラストパリィ(着地/爆発AoE無効化+反撃) | `combatTick.ts:223-321` | **部分(giantbat系のみ)** | `ghostCounter.ts`のTTL窓(150ms・`GHOST_COUNTER_CLAIM_TTL_MS`)を使ったパリィがCRIT-UNIFY実装(COUNTER_CRIT_LEDGER §9.7末尾)でgiantbat/pumpkin系の着地爆発に追加された。**crit=trueで確定クリ**(§9.3裁定どおり)。他ボス族(裏4/天使6/idol)のブラスト技への適用は個別確認が必要(未検証)。**★2026-08-11「プレイヤーと揃えろ」対応で再調査(下記「CDパリティ対応」節★未決参照): `applyPumpkinBlastDamage`(`combatTick.ts:250`)の`inAttackZone: true`は、v0.25.2597で社長報告(「離れた位置でカウンター」)を受けて意図的に追加された設計であり、単純に外すと「ボスが動かず衝撃波だけ飛ばす技(踏み鳴らし等)」がどの距離からも弾けなくなる=カウンター不能側に倒れるリスクがあるため、★**社長裁定v0.25.3167で『現状維持』に決着**(ゾーン型は距離を見ないのが正=プレイヤーと実質同条件。この1点は差分として再提起しないこと)。** |
| 4-3 | 接触パリィ(dashParried=突進/硬直/気絶中敵) | `combatTick.ts:678-807` | **部分** | giantbat系は`combatTick.applyGhostBossParry`(568-655)で対応。気絶パリィ(気絶中ボスへの接触無効化)はCOUNTER_CRIT_LEDGER §9.7★1で「ゴーストに該当する接触被弾経路自体が存在しないためクローズ」= 仕様上N/A判定済み(欠落ではない)。 |
| 4-4 | per-boss体当てカウンター(thor/裏3/idol/天使6) | `useGameLoop.ts`各ブロック+`angelBossTick.ts:280` | **同一** | `ghostCounter.ts`のconsumeGhostCounterClaimを各per-bossハンドラのghost分岐が消費し、プレイヤー成立と同じ機械的効果(技中断+確定クリ+bumpBossCrit)を与える(v0.25.2480実装・BOT_AND_GHOST.md §8)。 |
| 4-5 | 気絶パリィの副作用(気絶解除) | `combatTick.ts`(dashParriedEnemyPatchが`stunUntil: undefined`) | **N/A(対象経路なし)** | COUNTER_CRIT_LEDGER §9.7★1で確認済み。 |
| 4-6 | カウンター反撃ダメージ式 | プレイヤー: `borrowedGun.damage × BOSS_CRIT_DAMAGE_MULT`(装備/スキル倍率あり) | **部分(スキル倍率なし)** | `ghostCounter.ts:72-75`(`ghostCounterDamage`)は`(borrowedGunDamage ?? 12) × BOSS_CRIT_DAMAGE_MULT`のみ。equipBonus/skillCritMult/skillOutgoingDamageMultは明記コメントで「乗せない(v0.25.2459方針)」=**§10訂正で再検討が必要な箇所**。 |
| 4-7 | 成立時の付与無敵(INVULN_MS) | プレイヤー: `invulnerable+invulnerableTime` | **同一** | `ghostCounter.ts:112-119`が専用フィールド`ghostInvulnUntil`へINVULN_MS付与(v0.25.2489で追加・パリティ漏れ修正済み)。 |
| 4-8 | 演出(青Counter!+金クリ層+SE) | `triggerCounter`系 | **同一** | `applyGhostCounterEffect`(ghostCounter.ts:97-127)がプレイヤーと同型の視覚(リング/バースト/glow/コールアウト)+SE(距離減衰)を出す。 |

### 実装ログ: CDパリティ対応(社長指示「プレイヤーと揃えろ」・2026-08-11・実装チャット)

守護霊のカウンターが「プレイヤーのクールダウンを一切見ておらず連発できる」実機報告を受け、4差分のうち3つを解消。

1. **CD(旧: 600ms・近接と共用 → 新: 820ms・カウンター試行専用)**: `ghostDriver.ts`に
   `GHOST_COUNTER_MELEE_PERIOD_MS = COUNTER_WINDOW + COUNTER_COOLDOWN`(プレイヤーの定数を**import**、
   手写ししない)を追加。新フィールド`GhostSelf.lastCounterAttemptAt`/`GhostDecision.lastCounterAttemptAt`
   (永続化=`Summon.ghostLastCounterAttemptAt`)でカウンター試行の起点だけを別枠管理し、`counterWatching`
   分岐の発火条件に`counterMeleeReady`を追加。**通常近接(`GHOST_MELEE_COOLDOWN_MS=600`・§3-1/line394の
   `lastMeleeAt`)は変更していない**(社長指示「通常近接まで遅くしてはいけない」)。
2. **位置条件(旧: `GHOST_MELEE_RANGE=74px`の距離判定 → 新: 矩形オーバーラップ)**:
   `ghostCounter.ts`の`peekGhostCounterClaim`(接触型=既定の位置ゲート)を、プレイヤーの
   `checkPlayerEnemyCollisions`と同じ2関数(`collisionUtils.playerHitbox`をexport化+既存`enemyContactBox`)
   による`checkCollision`判定へ置換。74pxの距離閾値は撤去。
3. **請求の積まれ方(旧: `useGameLoop.ts`が独立に`isBossCounterableNowApprox`を再計算→通常近接でも
   請求が積まれていた → 新: ghostDriverの意図フラグを使う)**: `GhostDecision.meleeIsCounterAttempt`を
   新設し、`counterWatching`分岐で実際にカウンター狙いで振った時だけtrueにする。`useGameLoop.ts`の
   2箇所の`wasCounterMelee`はこのフラグをそのまま見る形に変更(ボス状態の独立再計算を廃止)。
4. **ブラストパリィの間合いスキップ(4-2参照)**: ★**社長裁定v0.25.3167 =「現状維持」で決着**
   (指示「守護霊パリィは推薦で」)。`inAttackZone: true` は**残す**。
   理由: v0.25.2597の意図的な設計(ゾーン型攻撃はボスの体の距離と無関係に成立させる)であり、外すと
   「ボスが動かず衝撃波だけ飛ばす技(踏み鳴らし等)」を守護霊が**原理的に一度も弾けなくなる**。
   プレイヤー側もこの技には「ボスの体との距離」判定が無く(ゾーンの幾何だけ)、**実質すでに同条件**。
   ⇒ **この1点は「パリティ未達」ではなく「揃っている」と扱う。今後ここを差分として再提起しないこと。**

テスト: `ghostDriver.test.ts`(GHOST-COUNTER-PARITY節・820ms周期/通常近接不変/意図フラグ)、
`ghostCounter.test.ts`(位置条件=矩形オーバーラップ節)に追加。`npm run typecheck`/`npm run lint`= エラー0。

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
| 6-4 | ジャンクウェポン(junk-weapon・近接スイング同時発射5連弾) | `weaponUtils.ts:479-516`(`buildJunkWeaponPellets`)・発動入口=`triggerCounter`系近接スイング | ✅**同一(v0.25.2525)** — 発注Cで相乗り配線済み(スクラップは除外4で非消費) |
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
| striker-quick-mag | ✅ | ✅**(v0.25.2563 / 即時装填v0.25.2830)** | GHOST-SUBS-FINAL: 投擲+**自分で回収**(回収の移動目標=`decideGhost.retrieveTarget`。間合い管理より優先・回避には譲る)。`Pickup.ownerGhostId`付き=本人だけが拾う。回収時はプレイヤーと同じ共通式で即時装填・リロード解除し、実際に装填できた時だけクリ窓を得る。リザーブ在庫だけ除外4で非消費。 |
| dog | 未対応 | **無し(★未決6で停止)** | フェッチの成果物=**世界のドロップ**。§2.11追補3「霊体は世界の物に触れない/財布なし」と衝突するため GHOST-SUBS-FINAL では**この種だけ止めた**(★未決6の裁定待ち)。 |
| katana / murasame | 未対応 | **無し** | §5参照(カウンター窓経済)。 |
| whip | 未対応 | **無し** | §6参照(同上)。 |
| alchemy / sage-stone | 未対応 | **無し** | CD概念なし(常駐召喚)。 |
| shijin | 未対応 | **無し** | CD概念なし(リズム)。 |
| drone-boomerang | ✅ | ✅**(v0.25.2525)** | 発注C: ゴーストの近接スイングに相乗り(共通ヘルパ `fireDroneBoomerangOnSwing`)。CDは1つの財布。 |
| wire-anchor | 未対応 | **無し(移動系・特記対象)** | 効果=オーナーの体の高速移動(スラム/プラント/ホップ)。ghostDriverの移動系への特殊配線が必要=**現在オーナー常にプレイヤー固定**。§2.11では「除外1/4に該当しない=写す対象」。優先度が高い個別項目。 |
| homing | ✅ | ✅**(v0.25.2563)** | GHOST-SUBS-FINAL: 「押す」を模擬。ロック蓄積は共有純関数`stepHomingLocks`、押す時間は**計測平均**(G4a `subStyles.homing.holdMsAvg`)を満タン到達時間でclamp。計測なし=満タン発射。 |
| shadow-clone | 未対応 | **無し(★未決5で停止)** | 発動入口が近接スイング。v0.25.2525で着手したが「分身の帰属/見た目/計測」が未決のため**この種だけ停止**(★未決5)。 |
| molotov | ✅ | ✅**(v0.25.2563)** | GHOST-SUBS-FINAL: 判定は同じ`computeMolotovTick`、移動判定=ゴーストの実移動(`ghostIsMoving`)。火は`GroundFire.ownerGhostId`付きで、DoTの倍率評価は置いた本人の疑似Player。 |
| first-aid-kit | ✅ | ✅**(v0.25.2563)** | GHOST-SUBS-FINAL: 自前在庫1(`Summon.ghostFirstAidKit`)。**自分のHPへ**使う(HP50%未満=プレイヤーの回復払い出しと同じ定数/回復量は`HEAL_FRACTION`)。弾薬・爆弾は鞄に入っていない(除外4/追補3)。空になったら同じ`spawnThrownBag`。 |
| sensor-mine | 未対応 | **無し** | チャージ制(個別チャージが別々に回復)でCD正規化を見送り済み(★未決2)。 |
| support-sniper | ✅ | ✅**(v0.25.2563)** | GHOST-SUBS-FINAL: 自前タイマー(`ghostSupportSniperCdMs`)+同じ`computeSupportSniperTick/Entry`。NPC枠は世界の1枠のまま(`ownerGhostId`で主語を持ち、弾の倍率評価はその守護霊)。 |
| flare-gun | ✅ | ✅**(v0.25.2525)** | 発注C: 同上(`fireFlareGunOnSwing`)。 |
| junk-weapon | ✅ | ✅**(v0.25.2525)** | 発注C: 同上(`fireJunkWeaponOnSwing`)。スクラップ非消費=除外4。 |
| striker-hunting | 未対応 | **無し** | CD概念なし(静止チャージ)。 |

**(2026-07-31 v0.25.2563 GHOST-SUBS-FINAL 時点)** 対応=heavy-grenade / marksman-trap / decoy / shield / turret /
fire-knife / drone-boomerang / flare-gun / junk-weapon / shadow-clone / sensor-mine / wire-anchor / katana(murasame含む) /
molotov / first-aid-kit / support-sniper / homing / striker-quick-mag。
**残る未対応は dog(★未決6=追補3と衝突・停止中)と、CD概念を持たない常駐/リズム/静止チャージ系
(whip / alchemy・sage-stone / shijin / striker-hunting)のみ。**

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
| 5 | ✅**済(v0.25.2522)** **刀モード(一閃ダッシュ/オート斬撃/村雨/フィニッシュ一閃)の再現** | 主語引数化: `performKatanaStrike`/`triggerKatanaDash` に `ghostId` / 抽出: `utils/dashLocomotion.ts`(ロコモーション)・`utils/katanaAuto.ts`(オート斬撃の標的選択) | **L** | 社長が名指しで「刀とか一閃とかも全部再現して」と明言した最重要項目の一つ。専用ロコモーション(katanaDashUntil系)をghost用に複製する必要があり、既存のカウンター窓経済(CD不使用)ともghostDriverの意思決定モデル(reactionMs/counterChance抽選)が根本的に噛み合わない=設計から要検討。 |
| 6 | ✅**済(v0.25.2522)** **ワイヤーアンカー(スラム/プラント/ホップ)のゴースト対応** | 主語引数化: `triggerWireAnchor`/`startWireDash`/`startWireHop` に `ghostId`+useGameLoopのwire毎フレーム処理を `runWireAnchorTick(wp, ghostId)` へ | **L** | 社長が名指し。§2.8で「移動系=現在オーナー常にプレイヤー=未対応→写す対象」と特記済み。オーナー抽象化(subWeaponOwner.ts)は入口があるが、実際の高速移動処理(katanaDashUntil型のロコモーション上書き)をghost実体に適用する仕組みが無い。 |
| 7 | ✅**済(v0.25.2514)** **被弾ノックバックの復元** | gameStore.ts `damageSummon`(6022-6042)にknockbackVx/Vy/knockbackUntil相当を追加 | **S** | 社長が名指し。damagePlayerの式をSummon型に横展開するだけ(Summon型にknockback系フィールドの追加が必要な場合はSで収まらずM)。 |
| 8 | ✅**済(v0.25.2525)** **弾反射(カウンター家系#1)のゴースト対応** | combatTick.ts `applyEnemyProjectileHits`(447)にghost分岐を追加 | **M** | 社長が名指し(「弾反射も全部再現」)。現状ghostは反射する経路自体が無い=新規実装。反射弾の生成(弾の`reflected`フラグ書き換え等)をゴースト起点で行う設計が必要。 |
| 9 | ✅**済(v0.25.2514)** **被弾点滅(白フラッシュ)の追加** | pixiScene.ts `drawGhostAlly`(7971-8194)にhitFlash相当を追加 | **S** | 描画のみ。既存`view.hitFlash`パターン(9036-9055)を流用可能。 |
| 10 | ✅**済(v0.25.2525)** **気絶敵への近接フィニッシュ(処刑)のゴースト対応** | useGameLoop.ts 7237-7292のghost近接ブロックにfinisher分岐追加 | **S** | 実害は小さい(ghostは基本ボス専属でボスは即死しない設計=CRIT-UNIFY §9.5)が、正本上は欠落。 |
| 11 | 一部済(v0.25.2525: drone-boomerang/flare-gun/junk-weapon / **v0.25.2541: shadow-clone・sensor-mine**+claim経由6種が主語ごとのCD帳簿で回るように) **サブウェポン未対応の個別配線**(wire-anchor除く: striker-quick-mag/dog/katana系/whip/alchemy系/shijin/drone-boomerang/homing/shadow-clone/molotov/first-aid-kit/sensor-mine/support-sniper/flare-gun/junk-weapon) | 各サブの発動入口(BOT_AND_GHOST.md §6の表参照) | **L(種によりS〜L)** | 「近接スイング相乗り型」(drone-boomerang/sensor-mine/flare-gun/junk-weapon/shadow-clone)は5-6と共通の近接実行ブロック整備で束ねられる可能性がある=先に近接まわりを整備すると割安。dog/molotov/support-sniper/homingは個別のプレイヤー直読み箇所の置き換えが必要でLサイズ。 |
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
   **(v0.25.2522 追記)** 刀の共有(GHOST-KATANA-WIRE)でも同じ扱いを踏襲した=守護霊の刀スイング/一閃/
   フィニッシュは**プレイヤーのコンボ台帳を書かない**(`meleeFinishComboCount`/`knifeCombo*`/`maxCombo`)。
   ゴースト自身のコンボを持たせる裁定が出れば、同じ共有関数へ計数を渡すだけで効く形にしてある。
2. **バーサーカーの失HP基準**: 疑似Playerの health/maxHealth は**ゴースト実体**の値にした(ゴーストが傷つくほど
   強くなる=「その時のあなた」の写しとして自然な解釈)。「計測時のHP割合で固定」にするなら要裁定。
3. **【新規・GHOST-REFLECT-MELEE-SUBS(v0.25.2525)で発生】分身(shadow-clone)を守護霊が使えるか**
   ——発注Cの4種のうち**この1種だけ実装せず停止**した(発注文「未決に当たったらその種だけ止める」に従う)。
   共有方式で書こうとすると、設計書に無い裁定が**3つ**必要になる:
   1. **分身の枠(帰属)**: 分身はストアの**グローバル1枠**(`shadowClone`・生成条件が `!get().shadowClone`)。
      守護霊が振ると同じ枠を占有し、**プレイヤーが分身を出せなくなる**(逆も同じ)。1枠を取り合う仕様で
      よいか、守護霊専用枠(`ghostShadowClone`)を足すか。CDは「1つの財布」なので枠だけの話ではない。
   2. **見た目**: `ShadowCloneState.characterClass` はプレイヤーのクラス固定(絵=本人の分身)。守護霊の
      分身は守護霊のクラス(`ghostClass`)+青白tintにするのか、本人の絵のままにするのか。
   3. **攻撃の主語と計測**: `shadowCloneStrike` は `get().player` を主語に固定(近接武器・クリ率・
      コンボ・`skillOutgoingDamageMult`・XP/通貨の受け手・`recordKill('melee')`)。守護霊の分身なら
      主語=疑似Player・ヘイト='ghost'・計測除外(除外4)が筋だが、これは1「誰の分身か」の裁定に従属する。
      加えて `tickShadowClone` は毎フレーム**プレイヤーの状態**を読む(主語引数化の範囲が広い)。
   → **裁定が出れば実装は小さい**(入口は `fireGhostMeleeSwingSubs` に1本足すだけ)。
   ※`sensor-mine` は発注で明示的に対象外(★未決2=チャージ制の正規化が未裁定)のため手を付けていない。
   **✅クローズ(v0.25.2541・GHOST-SAME-SPEC)**: §2.11追補の裁定「守護霊=独立した2人目のプレイヤー」で
   3点とも決着=①枠は**主語ごと**(`Summon.ghostShadowClone`。取り合いなし) ②絵は**そのビルドのクラス+
   青白tint** ③主語=疑似Player・ヘイト='ghost'・計測除外。実装済み(下の実装ログ参照)。
   **★未決2(sensor-mine のチャージ制正規化)も同裁定でクローズ**=チャージ帳簿を主語ごとに持つ
   (`Summon.ghostSensorMineCharges`)ことで正規化の要否そのものが消えた。

## ★裁定(2026-08-23・社長)— **サブウェポンのCDは全て別財布**

社長の言葉: 「**そもそも、守護霊も全部別財布にする必要がある**」
「**開発後は特に指標がないなら全て独立させて、ちゃんとしたい。**」

- **確定**: サブウェポンのクールダウン帳簿は **主語ごとに独立**。プレイヤー / 守護霊(ghost-ally) /
  幻影(guardian-phantom) が**それぞれ自分の財布**を持つ。**取り合いは発生しない**。
- **★現在地の訂正(2026-08-23・段0の走査で判明)**: 裁定時に「**現行はプレイヤーとCDを共有している**」と
  報告したが**誤り**。**守護霊の別財布は既に実装済み**だった:
  `Summon.ghostSubWeaponCooldowns`(`types/game.ts:1139`)を `gameStore.combatActorPlayer` が
  疑似Playerの `subWeaponCooldowns` に載せ(`gameStore.ts:3312`)、書き戻しも専用の宛先へ振り分けている
  (`gameStore.ts:3348`)。発動口の `subSubject`(`useGameLoop.ts:7706`)は
  **ゴースト自前の帳簿で CD 明けを判定**している。
  - `shouldGhostClaimSub` は**財布ではなく「いつ使うと決めるか」の頻度ノブ**。この2つを混同していた。
  - 誤認の原因は `useGameLoop.ts:7674` 付近の**腐ったコメント**(「共有の1本=1つの財布」)。
    v0.25.2541 の別財布化に追随しておらず、**実装より上に古い説明が乗っていた**。v0.25.3846 で訂正済み。
  - ⇒ **裁定そのもの(全て独立)は有効**だが、**残りの作業は「幻影に自前の帳簿を持たせる」だけ**。
    守護霊側は追加作業なし。
- **確認事項**: 「他者が使ったせいでプレイヤーが使えない」は**バグ扱い**に格上げする(この方針は不変)。
- **根拠(実行時コストの検討結果・2026-08-23)**: 別財布のコストは**開発リソースだけで、データも処理も
  事実上タダ**と判定した。
  - データ量: 主語ごとに「サブキー→最終使用時刻」の小さな帳簿(24キー)。**localStorageには載せない
    =実行時のみ**。数百バイト規模。
  - 処理: CD判定は引き算1回と比較1回。**帳簿を分けても判定の回数は変わらない**(読む場所が変わるだけ)
    =per-frameの増分ゼロ。
  - 実際に増えるのは「盤面に出る物」だが、CLAUDE.mdの実測(v0.25.2690の新計測器)では
    **敵36(重量級)+弾70+粒子64+リング8+斬12+数字12+画像6+松明12 = 60fps張り付き**。
    弾・タレット・召喚が増えても効かない。
  - **唯一の有料項目=同時に出ている強glow(`kind:'glow'` かつ `radius >= STRONG_GLOW_RADIUS`=44px)の数**。
    実測で1個あたり約2ms/フレーム(予算の約12%)。爆発系サブを3者が同時に撃つと瞬間的に同時数が増える
    (寿命は240〜900msなので持続はしない)。**発注時に「強glowを出すサブは同時上限を持つ」と明記すること。**
  - ⇒ **実行時の指標で「独立させない」を選ぶ材料は無い**=社長の判断どおり全て独立で進める。
- **幻影(GHOST_BOSS.md 第3弾)にも同じ裁定が効く**(敵なのだから共有はそもそもあり得ない・社長指摘)。

---

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

---

## 発注仕様: バッチ GHOST-KATANA-WIRE(裁定2実装・v0.25.2517発注)

**目的**: 台帳 項目5(刀モード L)+項目6(ワイヤーアンカー L)を裁定2「共有方式」で実装する。
守護霊が刀ビルド/ワイヤービルドを引いた時、プレイヤーと同じ状態機械・同じ定数で戦う。
**簡易モデル(ゴースト用の別実装)は禁止**——既存のプレイヤー状態機械の主語(オーナー)を
引数化し、Summon型に状態を持たせて共有する(§2.11補足「写すな、共通化しろ」)。

### A. 刀モード(katana/murasame・台帳§5)
- **発動条件**: ゴーストのビルド(PlayerBuildSnapshot.subWeapons)に katana / murasame がある時のみ。
  無いビルドは現状のナイフ役のまま(変更しない)。
- **写す対象**(全てプレイヤーの既存実装を共通化して使う。定数・式の複製禁止):
  1. オート斬撃(KATANA_SLASH_INTERVAL_MS=600ms間隔・刀レベル別リーチ KATANA_RANGE_BY_LEVEL)
  2. 一閃ダッシュ(triggerKatanaDash 相当: KATANA_DASH_DISTANCE=154px/180ms・ダメージ×3・
     着地後硬直 KATANA_DASH_RECOVERY_MS=200ms・katanaDashUntil ロコモーション)
  3. 村雨(hasMurasame: CD無し連発)
  4. フィニッシュ一閃(気絶敵への処刑)——**共有した結果としてプレイヤーと同じ条件分岐が走ること**。
     ボス除外等の既存条件はそのまま(ゴースト用に条件を変えない)。
- **ダメージ・クリ**: GHOST-BUILD-1 の疑似Player(ghostBuild.ts)を主語に、プレイヤーと同じ純関数を通す
  (×3等の倍率はプレイヤー式のまま。刀クリ率は既に meleeHitCritChance で共有済み=そこへ乗せる)。
- **意思決定**: 「いつ一閃を撃つか」はさしあたり既存 ghostDriver の近接タイミング流用でよい
  (行動品質は次バッチ§2.12で別途)。**実行**に入った後の挙動(距離・速度・硬直・判定)は完全共有。

### B. ワイヤーアンカー(wire-anchor・台帳§9-3)
- **発動条件**: ビルドの subWeapons に wire-anchor がある時のみ。
- **写す対象**: アンカー刺し→スラム/プラント/ホップ(wireHop 離脱含む)の一連を、
  wireDashUntil 系状態機械の主語差し替えで共有。**無敵・硬直・離脱の防御規格も同一**
  (守護霊速死の根治=「ワイヤーの規格がゴーストに無かった」診断への対処)。
- ゴースト実体の移動(x/y)へロコモーション上書きが乗ること(霊体すり抜け=9-7の意図的差分は維持)。

### C. 共通の掟
- **除外1/4のみ非適用**: ズーム/ヒットストップ/スロー演出は乗せない。弾薬消費・計測(botTelemetry)・
  スコアはゴースト起因にしない(weaponKey/hateSource の既存分離を踏襲)。
- 斬撃弧などの攻撃エフェクトはプレイヤーと同じものを出す(CLAUDE.md「危険を伝える絵=判定に揃える」)。
- Summon型への状態追加は最小限のフィールドで(katanaDash系/wire系)。プレイヤー側の式・定数・分岐は
  1文字も変えない(抽出リファクタのみ=BUILD-1と同じ流儀)。
- 未決(設計書に無い値・挙動)に当たったら**本台帳の★未決へ追記して停止**(設計判断しない)。
- BOT_AND_GHOST.md は設計チャットが編集中の可能性があるため**触らない**。git add は変更ファイルの
  明示列挙(検証: typecheck+lint→rebase後origin+1でbump→changelog/DEVELOPMENT_LOG→push打刻)。
- 抽出した純関数にはユニットテストを同コミットで(配線直書き禁止=実装精度の規律4)。

---

## 実装ログ: バッチGHOST-KATANA-WIRE(v0.25.2522・項目5=刀モード / 項目6=ワイヤーアンカー)

**方式(裁定2「共有方式」の実装形)**: ゴースト用の実装は1本も書いていない。既存のプレイヤー状態機械の
**主語(オーナー)を引数化**し、状態を `Summon.ghostDash` へ持たせて共有した。

### 共通の土台
| 何を | どこに |
|---|---|
| 刀/ワイヤーの状態(21フィールド) | `types/game.ts` の **`DashLocomotionState`** に切り出し、**`Player extends DashLocomotionState`**(プレイヤーは従来どおり直付け)。`Summon.ghostDash?: DashLocomotionState` を追加(Summonへの追加はこの**1フィールドのみ**)。 |
| ロコモーション上書き(優先順・速度・目標ベクトル) | 新規 `utils/dashLocomotion.ts`(純関数)。`dashModeAt`(wireDash>wireHop>katanaDash>katanaRecovery)/`dashOverride`/`dashStep`/`dashStateOf`/`emptyDashState`。`movePlayer` のインライン判定をこれへ置換(値・順序は不変)。 |
| オート斬撃の標的選択 | 新規 `utils/katanaAuto.ts` の `pickKatanaSlashTarget`(useGameLoopのインラインから抽出。スタン敵は後回し/リーパー除外/射程は注入した距離関数=`enemyMeleeDist`)。 |
| 主語の解決 | `gameStore.combatActorPlayer(ghostId?)` = **1枚の疑似Player**。①GHOST-BUILD-1のビルド(スキル/装備/クリ率/サブ+Lv) ②ゴースト実体の座標/寸法/HP(`ghostActorPlayer`) ③`ghostDash` を着せる。これで `player.x` / `subWeapons` / `katanaDashUntil` / `wireDashUntil` … の**既存の読みが全部そのまま通る**。書き込みだけ `setActorDashState` で宛先を振り分ける。 |

### A. 刀モード(項目5)
- `performKatanaStrike(targetIds, damageMult, allowFinisher, **ghostId?**)`: 主語を差し替えただけ。刀Lv別
  ダメージ/リーチ・クリ率(`meleeHitCritChance`)・`skillCritMult`/`skillOutgoingDamageMult`・気絶敵の
  フィニッシュ分岐(ボス5×/強個体3×/通常即死)・ノックバック・紫蓄積(`bumpBossCrit`)・斬撃弧/血/
  ダメージ数字/黄リング/STUN!・`grantMeleeKillRewards`(XP/通貨/弾薬拾得)・リーパー波及・救難信号——
  **全部プレイヤーと同じ1本**が走る。
- `triggerKatanaDash(dirX, dirY, **ghostId?**)`: 154px/180ms/×3/経路判定(半幅26)/村雨のCD無し/
  着地硬直200ms/軌跡trail/「斬」+暗転+血 も共有。着地(`setTimeout`)で主語を**再解決**するので、
  途中でゴーストが解散したら何も起きない。
- 実行の入口(`useGameLoop`のゴーストブロック): ビルドに katana/murasame があれば `isKatanaMode(疑似Player)`
  が真 → **プレイヤーと同じ封印**(銃の自動射撃を止める・`decideGhost` へ渡す `gunRangePx` も0)、
  近接アクション=**一閃**、それとは独立に**オート斬撃(600ms・`gameTime`基準)**が回る。
  一閃のSEはプレイヤーのフリックと同じ `katana-dash`(距離減衰のみ差分)。
- カウンター請求(`setGhostCounterClaim`)は一閃でも積む(一閃も「近接スイング」=窓を拾う)。発動しなかった
  フレーム(硬直/CD)では積まない。

### B. ワイヤーアンカー(項目6)
- `triggerWireAnchor(dirX, dirY, **ghostId?**)` / `startWireDash(ghostId?)` / `startWireHop(x, y, ghostId?)`:
  刺し判定(線上・射程・空中無敵は刺さらない)・スラム/プラント分岐・待ち1秒・速度算出は共有。
- `useGameLoop` の毎フレーム処理を **`runWireAnchorTick(wp: Player, ghostId?)`** へ主語引数化し、
  プレイヤー→守護霊の順で1回ずつ回す(すり抜けダメージ/Lv3すり抜け爆発/着地爆撃/強制ノックバック/
  斬り下ろしフィニッシュ/ホップ開始が同じ1本)。重複防止レジスタ(`wireLandedDashRef`/`wirePassHitRef`)は
  主語別キーにした。
- **防御規格の同一化(速死の根治)**: プレイヤーの「`invulnerableTime` を過去へずらす逆算打刻」は
  実効「now+技の長さ まで無敵」なので、ゴーストは同じ終了時刻を `ghostInvulnUntil`(damageSummonが見る)へ
  入れる=スラム/ダッシュ/ホップの全区間で無敵。硬直・離脱の長さも共有定数のまま。
- 発動の意思決定は既存のサブ予約(`ghostSubClaim`=「CDが明けたら使う」)を流用し、狙いは紐付きボス。
  CDは「1つの財布」= `player.subWeaponCooldowns` を共有。上位のサブ発動入口(6種)が先に予約を消費するので
  二重発動しない。

### 除外1/4の非適用(ここだけ差分)
- 除外1(演出): `triggerFinishImpact`(停止+スロー+寄りズーム)はゴースト起因では呼ばない。シェイクのみ
  `GHOST_FX_SHAKE_ENABLED` 経由で出す(既存の掟どおり)。
- 除外4(運用系): `recordDamageDealt`/`recordMeleeSwing`/`recordWireAnchorUse`(G4a様式計測)はゴースト起因では
  積まない。ワイヤーのダメージは `damageChannel=null` + `hateSource='ghost'`(既存のゴースト銃/近接と同じ)。
  ゴースト起因のSEは距離減衰(`npcSfxDistGain`)。
- **プレイヤーのコンボ台帳(`meleeFinishComboCount`/`meleeFinishComboUntil`/`player.knifeCombo*`/`maxCombo`)は
  ゴーストのスイングでは動かさない**(本人のコンボが伸びる=二重取りになるため。★未決1と同じ扱い)。
  キル数/与ダメの集計(`enemiesKilled`/`damageDealt`/`eliteKills`/`bossKills`)は `damageEnemy` がゴースト弾/
  近接でも積んでいるのと同じ扱いで積む(経路による食い違いを作らない)。

### 実装メモ(次バッチが踏む前提)
- プレイヤー側は**式・定数・分岐を1文字も変えていない**(抽出と主語引数化のみ)。`ghostId` 未指定時は
  疑似Player=本物のプレイヤー・`damageEnemy` の追加引数も既定値と同値を明示しただけ。
- プレイヤーの `counterCooldownEnd` 延長(刀の一閃がカウンターCDを食う)に**対応するフィールドはゴーストに無い**
  =ゴーストの近接間隔は `ghostDriver` の `lastMeleeAt`(GHOST_MELEE_COOLDOWN_MS)が持ち、一閃自体のCDは
  共有の `katanaDashCooldownEnd` が持つ。新規フィールドを作らずこの2本で閉じている。
  **★2026-08-11 更新**: この節が指摘した「対応するフィールドが無い」ギャップが実機で「カウンター連発」
  バグとして顕在化したため、上の「4. カウンター家系」節末尾の実装ログで専用CD
  (`lastCounterAttemptAt`/`GHOST_COUNTER_MELEE_PERIOD_MS`)を新設して解消した。`lastMeleeAt`
  (通常近接=600ms)は本節の記述どおり不変。
- 刀ビルドのゴーストの**間合い**は `profile.preferredDist`(計測値)のまま。スロットはビルドと動きが一体
  (§2.10)なので刀ランのゴーストは近い間合いを持つが、行動品質の詰めは §2.12 のバッチで扱う。
- 描画(pixiScene)は無改変=ゴーストが刀/ワイヤーを持っている絵(刀身・ワイヤー線・アンカー)は出ない。
  攻撃エフェクト(斬撃弧・血・リング・「斬」)はストアのエフェクト経由なのでプレイヤーと同じものが出る。
- テスト: `utils/dashLocomotion.test.ts`(7件)・`utils/katanaAuto.test.ts`(5件)・
  `utils/ghostKatanaWire.test.ts`(17件=主語解決/一閃の状態機械・無敵窓・硬直・村雨/ワイヤーのプラント・
  スラム・ダッシュ・ホップ・共有CD・刀の排他/除外1・4の効き+**プレイヤー対照**)・`ghostBuild.test.ts` に4件追加。

---

## 発注仕様: バッチ GHOST-REFLECT-MELEE-SUBS(v0.25.2523発注)

**目的**: 台帳 項目8(弾反射 M)+項目3-3(気絶フィニッシュ)+近接スイング相乗り型サブ4種の配線。
方式は前2バッチと同じ**共有方式**(簡易モデル禁止・主語引数化・プレイヤー側の式/定数/分岐は1文字も変えない)。

### A. 弾反射(台帳§4-1・社長名指し「弾反射も全部再現」)
- プレイヤーの弾反射(`combatTick.ts` `applyEnemyProjectileHits`・カウンター窓中の敵弾反射)を
  主語引数化し、**守護霊も同じ窓・同じ条件・同じ反射弾生成**で反射する。
- 窓の開き方もプレイヤーと同じ発生源(近接スイング起点)に揃える。ゴースト側に窓フィールドが
  必要なら Summon へ最小追加(打刻はプレイヤーと同じ定数)。
- 反射弾の主語: ゴースト反射弾がプレイヤーの計測を汚さない(除外4=既存の分離方針)。
  反射ダメージの倍率評価は疑似Player(ghostBuild)。

### B. 気絶フィニッシュ(台帳§3-3)
- ゴーストの通常近接(ナイフ役)のヒットに、プレイヤーの気絶敵フィニッシュ(処刑)分岐を共有で通す
  (`gameStore.ts` ナイフ4710付近の分岐を主語引数化)。ボス除外等の既存条件は不変。
- 除外1: フィニッシュ演出のヒットストップ/スロー/ズームはゴースト起因では出さない
  (KATANA-WIREバッチの triggerFinishImpact 不使用と同じ扱い)。

### C. 近接スイング相乗り型サブ4種(台帳§7・item 11の前倒し分)
対象: **drone-boomerang / flare-gun / junk-weapon / shadow-clone**(発動入口=近接スイング)。
- ゴーストのビルド(subWeapons)に当該サブがある時、**ゴーストの近接スイング**を入口として
  プレイヤーと同じ発動条件・同じ効果で発動する(主語引数化。効果の狙い先はゴースト基準)。
- shadow-clone(分身)の分身実体の扱いで未決(誰の分身か・見た目・計測)に当たったら
  ★未決へ書いて**その種だけ止める**(他3種は進める)。
- **sensor-mine は対象外**(チャージ制の★未決2が未裁定のため。手を付けない)。
- 残る未対応サブ(dog/molotov/support-sniper/homing/striker-quick-mag/alchemy系/shijin/
  first-aid-kit/striker-hunting/sensor-mine)は**本バッチ対象外**=構造ズレ組として設計チャットが
  裁定リストを別途用意する。

### D. 共通の掟(前2バッチと同一)
- 除外1/4のみ非適用(演出のズーム/停止/スロー・弾薬/計測/スコア)。SEは距離減衰(npcSfxDistGain)。
- 未決は本台帳★未決へ追記して停止(設計判断しない)。コードコメントに質問を書かない。
- BOT_AND_GHOST.md は編集禁止。git add は明示列挙。抽出純関数にはユニットテスト同コミット。
- ゲート: typecheck 0(grepのexit code罠に注意)+lint エラー0。related テスト実行。フルビルド不要。
- 版管理: rebase後 origin+1・changelog先頭・DEVELOPMENT_LOG(JST打刻)・台帳ステータス更新。

---

## 実装ログ: バッチGHOST-REFLECT-MELEE-SUBS(v0.25.2525・項目8=弾反射 / 項目10=気絶フィニッシュ / 項目11の一部=相乗りサブ3種)

**方式**: 前2バッチと同じ**共有方式**(コピー実装ゼロ・主語引数化+純関数抽出)。プレイヤー側は
**式・定数・分岐を1文字も変えていない**(抽出と主語引数化のみ。ghostId未指定=従来と完全同一)。

### A. 弾反射(項目8・台帳§4-1)
| 何を | どこに |
|---|---|
| 反射1回分(反射弾生成+ボムカウンター化+窓延長) | `combatTick.applyCounterReflect(projId, now, subject, tunables, ghostId?)`。プレイヤー分岐は従来のコードそのまま(`lastCounterSuccessTime`+`refundCounterCooldown`)、ゴースト分岐は窓(`ghostCounterWindowEnd`)の延長のみ。 |
| 守護霊の窓 | `Summon.ghostCounterWindowEnd`(**Summonへの追加はこの1フィールドだけ**)。近接スイング(通常スイング/刀の一閃)の成立時に `nowMs + COUNTER_WINDOW` を打つ=**プレイヤーのスイングが `counterWindowEnd` を開くのと同じ起点・同じ定数**。 |
| 反射の判定位置 | `applyEnemyProjectileHits` の既存ゴースト分岐(G4b)。**プレイヤー解決の後**という順序も不変で、ゴーストに当たる弾(=ボス弾)が窓中なら反射、窓外なら従来どおり被弾。 |
| 反射弾の帰属 | `weaponUtils.GHOST_REFLECT_WEAPON_KEY='ghost-reflect'`。`reflectProjectile(id, multiplier?, weaponKey?)` の第3引数で差し替え(未指定=プレイヤーの反射と1bit同値)。着弾側(useGameLoop)は `isGhostShot` に合流=**倍率の主語=疑似Player / ヘイト='ghost' / 計測除外(`classifyProjectileDamageChannel`→null) / 被弾SEは距離減衰**。着弾ロール(トラップ/弱点)は**入れない**=プレイヤーの反射弾と同じ。 |
| 成立演出 | `ghostCounter.applyGhostReflectCounterFx`(青リング/バースト/glow43/`Counter!`+シェイク+counter SEの距離減衰)。既存 `applyGhostCounterEffect` と共通部(`ghostCounterBlueLayer`)を共有。**除外1**: `triggerHitImpact`(停止+スロー+寄りズーム)は呼ばない。**除外4**: `notifyMoveCounter`/`addMeleeFinishCombo`/CDリファンド/`lastCounterSuccessTime` はゴーストでは触らない。 |

### B. 気絶フィニッシュ(項目10・台帳§3-3)
- 裁定を純関数 `meleeExecute.resolveStunnedMeleeHit(enemy, baseDamage, gameTime, bossStunMult)` へ抽出
  (ボス5×・完全気絶中のみ気絶維持 / 強個体3×+気絶解除 / それ以外は即時処刑。**優先順もプレイヤーのまま**)。
  プレイヤーのナイフスイング(`triggerCounter`)をこの関数へ差し替え(値・条件は不変)。
- 守護霊側は `gameStore.applyGhostMeleeFinisher(ghostId, enemyId)` が同じ関数を通し、素ダメージも同じ式
  (`meleeSwingBaseDamage`・主語=疑似Player)。適用は `damageEnemy(..., viaMeleeFinish=true, channel=null, 'ghost')`
  +金のダメージ数字+(倒しきれない時)気絶解除/浮き(`MELEE_STUN_LIFT_MS=420`)。フィニッシュ時はクリ抽選を
  走らせない(プレイヤーも気絶敵にはクリを振らない=RNG消費も同型)。SEは `melee-finish`(距離減衰)。
- **除外1**: `triggerFinishImpact`(停止/スロー/寄りズーム)はゴースト起因では出さない(KATANA-WIREと同じ)。
- **除外4**: `recordFinisherKill` はゴーストでは積まない。**同じ理由で刀経路(`performKatanaStrike`)の
  `recordFinisherKill` も `if (!isGhost)` に揃えた**(v0.25.2522の積み残し。プレイヤー側は不変)。

### C. 近接スイング相乗り型サブ(項目11の一部)
- `triggerCounter` に直書きされていた3ブロックを、主語(actor=倍率/所持/Lv、owner=座標/向き)引数の
  共通ヘルパへ抽出: `fireDroneBoomerangOnSwing` / `fireFlareGunOnSwing` / `fireJunkWeaponOnSwing`。
  プレイヤーは同じ順序(ブーメラン→フレア→ジャンク)で呼ぶだけ=挙動不変。
- 守護霊側の入口は `gameStore.fireGhostMeleeSwingSubs(ghostId)`(疑似Player+`ghostAsOwner`)で、
  useGameLoop のゴースト近接スイング(通常スイング/一閃)から呼ぶ。刀モード中は
  `subWeaponBlockedByKatana` がプレイヤーと同じく全サブを止める(=同じ条件)。
- 差分は**除外4だけ**: ①SEトリガ(`boomerangThrowFxAt`/`junkShotFxAt`=等倍)はプレイヤーのみで、
  ゴーストは戻り値を見て距離減衰付きに鳴らす ②**ジャンクウェポンのスクラップ(=この武器の弾薬)は
  消費せず在庫ゲートも通さない**(ghost-gunが弾薬/リロードの概念を持たないのと同じ扱い。ダメージはLv固定)。
- 弾には既存のゴースト発動サブと同じ `ownerGhost: true`(視覚専用マーカー)を付ける。
- **shadow-clone は★未決5として停止**(上記)。**sensor-mine は発注で対象外**。

### 同時に直したパリティ実バグ(新規テストで検出)
- **「1つの財布」が召喚時点で凍っていた**: `combatActorPlayer` の疑似Playerはビルドのメモ化写しなので
  `subWeaponCooldowns` が召喚時のスナップショットのままで、**ゴーストのサブCD判定が更新されなかった**
  (v0.25.2522のワイヤーも同症状)。疑似Playerに**プレイヤーの現在の `subWeaponCooldowns` / `straps`**
  を重ねて解消(ゴースト側のみの変更)。

### 実装メモ(次バッチが踏む前提)
- ゴーストが反射できるのは**ゴーストに当たる弾=ボス弾(`isEngageableBoss`)だけ**。雑魚弾がゴーストに
  当たらないのは G4b の既存仕様で、本バッチはその集合を広げていない(広げるなら別裁定)。
- ゴーストのカウンター窓の**可視化は無い**(プレイヤーは pixiScene が窓リングを描く)。反射の瞬間は
  `Counter!`+青リングが出るので伝わるが、「今なら弾ける」の予告は出ていない=描画バッチ候補。
- ゴーストのブーメランは `drone-boomerang-projectile` の描画分岐で tint を白に固定しているため、
  `ownerGhost` の青白tintが乗らない(見た目のみ・判定は同一)。
- テスト: `utils/meleeExecute.test.ts` に6件追加(裁定の不変条件+ボス優先順)、
  `utils/ghostReflectMeleeSubs.test.ts` 新規19件(反射の成立/不成立/帰属/窓延長/プレイヤー不変+
  **プレイヤー対照**/フィニッシュ4種/サブ3種+刀排他+財布)。related実行=23ファイル403件パス。

---

## 発注仕様: バッチ GHOST-BEHAVIOR(§2.12行動品質・v0.25.2526発注)

**目的**: BOT_AND_GHOST.md §2.12(正本・読むだけ)の行動品質を実装する。
**原則「選択=計測値・実行=常に本気」**。これは**ゴースト固有の意思決定層(ghostDriver)の改修**であり、
パリティ各バッチと違いプレイヤー共有コードの主語引数化ではない(プレイヤー挙動には一切触れない)。
数値は全て叩き台=実機調整前提として定数名を付けて1箇所に置く。

### 要件(§2.12の機構を実装に落とす)
1. **dodgeStrength逆写像の廃止**: hitsPerMin→dodgeStrength の変換と、それによる回避ベクトルの
   減衰を撤去。**dodgeVectorは常に全力**。関連する定数・補間も削除(死コードを残さない)。
2. **反応遅延**: 回避/カウンター待ちの開始を、計測 reactionMs(100-800にclamp)だけ遅らせる。
   予告(windup)を認知してから reactionMs 後に行動開始=「気づきの早さ」が個性になる。
3. **距離の取り方**: 平時の間合い=計測 preferredDist(近接派は近く・銃派は遠く)。
   **ボスwindup中のみ**安全マージン(叩き台定数)を足して退避する(そのwindupに対して
   dodge/tankロールを引いていない場合)。
4. **移動リズム**: stationaryFrac / approachPerMin を平時の移動に反映(足を止めがちな人は止まる)。
   **危険時(windup中・床範囲内)は必ず動く**=リズムは平時のみ。
5. **tank率**: 苦手技は食らう(現行機構を維持。変更しない)。
6. **カウンター待ちの時限**: カウンター待ち状態は**約1秒(叩き台定数)**で見切り、成立しなければ離脱
   (現行の無時限待ち=張り付いたまま被弾、を廃止)。
7. **回避対応表(telegraphDodge)の全ボス技化**: 予告→回避方向の対応表を全ボスの全予告へ拡張する。
   **「この技」ではなく「この動作」で洗う**(CLAUDE.mdの教訓v0.25.2426): 汎用aiPhase系・城ボスg-*系・
   ボスbossState系の**全実装経路**を列挙して対応表に載せる(1経路だけ書くと必ず取りこぼす)。
   網羅の確認としてテストで「予告状態の全列挙 vs 対応表のキー」を突き合わせる(憲法テストの流儀)。

### 掟
- **プレイヤー挙動・計測(playerTraits)・ボス側は一切変更しない**。ghostDriver(+必要ならSummonの
  最小フィールド)に閉じる。意思決定は純関数化してユニットテスト(実装精度の規律4)。
- 数値の意図をコメントに書く(叩き台と明記)。未決に当たったら本台帳★未決へ追記して停止。
- BOT_AND_GHOST.md 編集禁止。git add 明示列挙。ゲート: typecheck 0+lintエラー0+related。
- 版管理: rebase後origin+1・changelog先頭(体験の変化=守護霊の立ち回り改善を短く)・
  DEVELOPMENT_LOG(JST打刻)・台帳ステータス更新。

---

## 実装ログ: バッチGHOST-BEHAVIOR(§2.12 行動品質・v0.25.2529・ステータス=実装済み)

詳細(要件別の実装方式・網羅の内訳・申し送り)は DEVELOPMENT_LOG.md v0.25.2529 が正本。ここは要約。

**原則「選択=計測値・実行=常に本気」。プレイヤー挙動・計測(playerTraits)・ボス側は1文字も変更していない**
(触ったのは `ghostDriver.ts` / 新規 `ghostTelegraph.ts` / `botSkill.ts`の**export追加のみ(挙動不変)** /
`types/game.ts`のSummon 1フィールド追加 / `useGameLoop.ts`のゴースト配線1往復)。

| 要件 | 実装 | 定数(全て叩き台・`ghostDriver.ts`の定数節1箇所) |
|---|---|---|
| 1 逆写像廃止 | `hitsPerMinToDodgeStrength`+`HITS_PER_MIN_DODGE_REF`を**削除**。回避は常に dodgeStrength=1 | — |
| 2 反応遅延 | `ghostReactionMs()`でclamp。危険の初認知時刻 `dangerSeenAt`(Summon: `ghostDangerSeenAt`)から経過するまで回避しない。カウンター成立判定も同じclamp値 | `GHOST_REACTION_MIN_MS=100` / `GHOST_REACTION_MAX_MS=800` |
| 3 間合い | `ghostDesiredDist()`。平時=preferredDist / ボスwindup中のみ+マージン(dodge・tankロール時は足さない) | `GHOST_WINDUP_SAFE_MARGIN_PX=120` |
| 4 移動リズム | `ghostMoveChance(mobility, stationaryFrac)`=平均 / `ghostApproachChance(approachPerMin)`=`/6`・床0.25。**危険時は両ゲート無視で必ず動く** | `GHOST_APPROACH_REF_PER_MIN=6` / `GHOST_APPROACH_MIN_CHANCE=0.25` / 欠損既定 `0.35`・`3` |
| 5 tank率 | **無改変**(`rollGhostMoveReaction`はそのまま) | — |
| 6 カウンター見切り | 窓が開いて1秒で `counterWatching=false`→通常行動へ。見切り後は`counter`ロールでも詰めない=離脱 | `GHOST_COUNTER_WAIT_MS=1000` |
| 7 回避対応表 | 新規 `src/utils/ghostTelegraph.ts`=**予告台帳(159状態を全分類)**+既存表が拾えない分だけ足す差分回避 | 実寸は複製値(nova400/dive220/spike310/burst140/ringspin92/bite92/punch90/warp92/beam2600) |

**要件7の網羅(3実装経路の全数)**: `gameStore.ts`(aiPhase: 城ボス/グレン/EX の `g-*`+雑魚の汎用) /
`angelBossTick.ts`(bossState: 天使6体) / `useGameLoop.ts`(bossState: 裏ボス4体+idol)の3ファイルを
**ソース走査**して状態名を全部拾い、台帳と突き合わせるテストで機械化(`ghostTelegraph.test.ts`)。
内訳 = **shared 48(既存`telegraphDodge`が拾う) / ghost 22(この表が足す) / both 1(`g-dive-windup`) /
none 88(硬直51・弾のみ12・別エンティティ9・リング状2・移動7・突進先未確定1・雑魚6)= 159**。
分類と実装の一致(shared→既存表が拾う/ghost→この表が足す/none→どちらも足さない)もテストが検証する。

### 実装メモ(次バッチが踏む前提)
- **`botSkill.telegraphDodge` は変更していない**=テストAI(playtestBot)の回避挙動は1bitも動いていない。
  ゴーストの追加分は `ghostTelegraph.ghostExtraTelegraphDodge` 側にだけあり、二重計上もしない
  (shared分類の状態には足さない)。ボット側も強くしたい場合は**別発注**(仕様が別物のため)。
- `hitsPerMin` はゴーストの**挙動に効かなくなった**(計測・保存・表示は従来どおり)。下手さの主表現は
  tank率(§2.12(4))へ一本化。
- 未対応(意図的・台帳に理由記載): リング状の技2種(ジブリル聖別/スカジ氷結の檻=逃げ向きが定義できない)、
  別エンティティで危険を撒く技(骨/刃/氷/火=Enemyの予告フィールドに乗らない)。拾うなら
  「エンティティ側の回避」という別の器が必要=別バッチ。
- ★未決: **なし**(仕様に無い値は全て「叩き台」として定数化し、意図をコメントに明記した)。

---

## 発注仕様: バッチ GHOST-SAME-SPEC(§2.11追補ドクトリン実装・v0.25.2537発注)

**正本**: BOT_AND_GHOST.md §2.11追補(2026-07-31社長裁定)「守護霊は独立した2人目のプレイヤー。
共有帳簿・専用枠・例外を一生作らない。実プレイヤーが2人いたらどうなるか、で決める」。

### A. サブCD帳簿の分離(既存実装の是正)
- 現状: 疑似Player(combatActorPlayer)がプレイヤーの `subWeaponCooldowns`/`straps` を重ねる
  「1つの財布」(v0.25.2522/2525)。**これを廃止**し、Summonに**ゴースト自前のCD帳簿**
  (例: `ghostSubWeaponCooldowns`)を持たせる。召喚時は空(=全サブ即使用可。実プレイヤーの参戦と同じ)。
- `setSubWeaponCooldown` 系の書き込みを主語で振り分け(setActorDashStateと同型)。
  読みは疑似Playerに自前帳簿を重ねる(strapsの重ねは廃止=ジャンクは既に非消費で不要)。
- 効果: プレイヤーとゴーストのサブが独立に回る(2人分)。挙動変更をchangelogに明記。

### B. 分身(shadow-clone)の主語ごと化
- storeのグローバル1枠(`shadowClone`)を**主語ごと**へ(プレイヤー枠は現行のまま・ゴースト枠を
  Summon側に同型のStateで持つ。※「ゴースト専用の別モデル」ではなく**同じ型を主語ごとに持つ**=ドクトリン準拠)。
- 発動入口: ゴーストの近接スイング(相乗りサブ4種と同じ入口=fireGhostMeleeSwingSubsへ追加)。
  生成条件・寿命5秒・1秒毎の自動近接・CD(自前帳簿)・Lv別値は全てプレイヤーと同一の定数/関数を共有。
- 見た目: 分身は持ち主の写し=**ゴーストのクラス絵(計測ビルドのcharacterClass)+守護霊と同じ青白tint**。
  描画はpixiSceneの既存分身描画を流用(ownerGhost視覚マーカーの前例=ブーメラン/弾)。
- 分身の攻撃: 主語=疑似Player・計測は汚さない(除外4)・ヘイトは'ghost'。
- ※ゴーストのビルドにshadow-cloneが無ければ何も変わらない。

### C. センサーマイン(sensor-mine)の主語ごと化
- ゴースト自前のチャージ帳簿(SensorMineState同型)をSummonに持たせ、設置上限・チャージ個別回復・
  起爆・スキルCD補正など**全てプレイヤーと同じ関数**を主語引数化で共有(utils/sensorMine.tsの純関数群)。
- 発動: 既存のサブ予約(ghostSubClaim)経由。設置位置はゴースト基準。地雷の帰属(計測・ヘイト)は除外4準拠。
- ★未決2(チャージ制のCD正規化見送り)は本裁定で解消=クローズ。

### D. 掟(全バッチ共通+本裁定の追加)
- プレイヤー側の式・定数・分岐は1文字も変えない(主語引数化のみ)。除外1/4のみ非適用。
- **「共有/例外/ゴースト専用モデル」を新設しない**。迷ったら「実プレイヤー2人ならどうなるか」。
  未決は本台帳★未決へ追記して停止。
- BOT_AND_GHOST.md編集禁止。git add明示列挙。抽出純関数はユニットテスト同コミット。
- ゲート: `npm run typecheck` 0(素のnpx tscは無効)+lintエラー0+related。
- 版管理: rebase後origin+1・changelog先頭(A/Bの体験変化を明記)・DEVELOPMENT_LOG(JST打刻)・
  台帳ステータス更新(★未決2・★未決5をクローズ)。
- **並走注意**: FX-V3V4エージェントが pixiScene.ts / pixiTextures.ts を編集中。pixiSceneを触る場合
  (分身の青白tint)は**最小差分**にし、コンフリクトしたらrebaseで自分の差分を薄く保つこと。

---

## 実装ログ: バッチGHOST-SAME-SPEC(§2.11追補ドクトリン・v0.25.2541・ステータス=実装済み)

正本ドクトリン= BOT_AND_GHOST.md §2.11追補「**守護霊は独立した2人目のプレイヤー**。共有帳簿・専用枠・
例外を一生作らない」。**プレイヤー側の式・定数・分岐は1文字も変えていない**(主語引数化のみ)。
差分は除外1(演出=停止/スロー/ズームを出さない)/除外4(計測・SE距離減衰)だけ。

### A. サブCD帳簿の分離(「1つの財布」の廃止)
| 何を | どう |
|---|---|
| ゴースト自前の帳簿 | `Summon.ghostSubWeaponCooldowns`(型はプレイヤーと同じ `Partial<Record<SubWeaponKey, number>>`)。**召喚時は空=全サブ即使用可**(実プレイヤーの参戦と同じ)。 |
| 読み | `combatActorPlayer(ghostId)` が疑似Playerへ**自前帳簿**を重ねる(旧: `st.player.subWeaponCooldowns`+`straps` の重ね=廃止)。 |
| 書き | 新 `setActorSubWeaponCooldown(ghostId, key, readyAt)`(`setActorDashState` と同型)。CD補正(オーバークロック→タイムキーパー)は**同じ純関数 `applySubCooldownSkills`** を、ゴースト自身のビルドを主語に通す。計測(`recordSubUse`/`recordOverclockProc`)は除外4=積まない。 |
| 合流させた発動口 | ブーメラン/フレア/ワイヤー(スラム・プラント)/分身/センサー地雷+**claim経由の6種**(heavy-grenade / marksman-trap / decoy / shield / turret / fire-knife)。 |
| claim経由の主語決定 | 新ヘルパ `subSubject(key)`(useGameLoop): 予約中のゴーストが**その種を自分のビルドに持ち、自分のCDも明けている**時だけ主語=ゴースト。それ以外はプレイヤー(予約は残す)。→ **ゴーストが持っていない種でプレイヤーのサブが止まる事故を作らない**。予約が無い間は `{subWeaponPlayer, playerOwner}` = 従来と1bit同じ。 |
| 同時に揃えた取りこぼし | ジャンクウェポンの `recordSubUse` がゴースト発動でも計測に乗っていた(v0.25.2525)→ プレイヤーのみへ(`recordWireAnchorUse` の ghostId 分岐と同じ流儀・挙動不変)。 |

### B. 分身(shadow-clone)の主語ごと化
- **枠**: プレイヤー=`store.shadowClone`(現行のまま)/ 守護霊=`Summon.ghostShadowClone`(**同じ `ShadowCloneState` 型**)。取り合いなし=2人が同時に分身を出せる。
- **入口**: 生成本体を共通ヘルパ `spawnShadowCloneOnSwing(get, actor, owner, gameTime)` へ抽出し、`triggerCounter`(プレイヤー)と `fireGhostMeleeSwingSubs`(守護霊)が**同じ1本**を通る(相乗り型サブ3種と同じ形)。刀モード排他も同じ `subWeaponBlockedByKatana`。
- **共有した規則**: 寿命5秒(`SHADOW_CLONE_DURATION_MS`)/1秒毎×最大5回/Lv別CD(`SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL`)/画面外で消滅。`tickShadowClone(ghostId?)`・`expireShadowClone(ghostId?)`・`shadowCloneStrike(clone, ghostId?)` の3アクションを主語引数化(未指定=プレイヤー=完全同一)。useGameLoop は**主語ごとに1回ずつ**回す。
- **見た目**: 守護霊の分身=**計測ビルドの `characterClass` の立ち絵+守護霊と同じ青白tint(`GHOST_ALLY_TINT`)+霊体の薄さ(`GHOST_ALLY_ALPHA`)**。振る武器の絵は `ghostBuild.meleeKey`。描画は既存の分身描画を `drawCloneSlot(slot, …)` へ主語引数化し、スプライト一式を**主語ごとに1組**(`cloneSlots.player/.ghost`)持つ=描画コードは1本。
- **攻撃**: 主語=疑似Player(計測ビルドの近接武器・クリ率・スキル倍率)。除外4=`recordDamageDealt` を積まない/コンボ台帳(`knifeCombo*`)は書かない(★未決1と同じ)/ヘビーガンナーのバフ窓(`registerMultiHit`)も本人のものは伸ばさない。除外1=`triggerFinishImpact`(停止+スロー+ズーム)を出さない。**ヘイト='ghost'**(damageEnemy を通らない直接更新経路なので、`hateGhostBuckets`(対象ボス)+`ghostHateUntil`(雑魚)を damageEnemy と同じ2種の効き方で付ける)。キル報酬(XP/通貨/弾薬)は `grantMeleeKillRewards` を共有=刀と同じ扱い。

### C. センサー地雷(sensor-mine)の主語ごと化
- **チャージ帳簿**: プレイヤー=`store.sensorMineCharges` / 守護霊=`Summon.ghostSensorMineCharges`(同じ「回復待ち readyAt 配列」表現・同じ `SENSOR_MINE_CHARGE_COOLDOWN_MS`)。
- **盤面**: `store.sensorMines` の1本のまま(世界の設置物。実プレイヤー2人でも世界に置かれる物は1つの配列)。ただし **`SensorMineState.ownerGhostId` で主語を持ち、上限(`SENSOR_MINE_CAP_BY_LEVEL`)は同じオーナーの地雷だけを数えて最古置換**する(`placeSensorMine` を主語対応に。プレイヤー単独の盤面では1bit不変)。
- **入口**: 設置本体を共通ヘルパ `placeSensorMineOnSwing(get, actor, owner, gameTime)` へ抽出し、`triggerCounter` と `fireGhostMeleeSwingSubs` が同じ1本を通る。設置位置はオーナーの足元。
  - ※発注文の「発動=ghostSubClaim経由」は、**プレイヤー側の入口が近接スイングである**ため近接スイング入口に合流させた(claim経路は「プレイヤー側が自動発動する6種」の器。ここへゴースト専用の発動口を足すと"ゴースト専用モデル"になる)。ドクトリン「実プレイヤー2人ならどうなるか」に従った解釈。
- **起爆**: 倍率評価の主語=置いた本人(ボマー/エクスプローダー/ヘビーガンナー/`skillOutgoingDamageMult`)。守護霊の地雷は `damageEnemy(..., null, 'ghost')`(計測分離+ヘイト)。ヘビーガンナーのバフ窓は本人のものを伸ばさない。

### テスト
- 新規 `src/utils/ghostSameSpec.test.ts`(19件): A=帳簿の独立(疑似Playerの読み/主語別の書き/プレイヤーCDが増えない/`ownerGhostId`)、B=枠の独立・再生成条件・Lv別CDの宛先・寿命/回数の共有定数・本人コンボ台帳を汚さない、C=`placeSensorMine` の主語別上限(プレイヤーの地雷が消えない)・チャージ切れ/回復・設置位置。
- 既存更新: `ghostKatanaWire.test.ts`(ワイヤーCDの宛先を自前帳簿へ)/`ghostReflectMeleeSubs.test.ts`(同・戻り値に clone/mine を追加)。
- `npx vitest related`(変更ファイル)= **28ファイル 395件パス**(2 skipped)。ゲート: `npm run typecheck` 0 / `npm run lint` エラー0(既存warning 8)。

### 実装メモ(次バッチが踏む前提)
- **残る「プレイヤー主語固定」のサブ**(項目11の残り): dog / molotov / striker-quick-mag / homing / first-aid-kit / support-sniper。claim を消費する器に載っていないため、ゴーストは**そもそも発動しない**(=帳簿の共有も起きない)。載せるなら各サブの発動本体を `(actor, owner)` 引数の関数へ抽出するのが筋(claim経由6種と同じ形)。
- 疑似Playerが**本人の一時バフ窓**を読む箇所は GHOST-BUILD-1 の中立化リスト(quickMag/benkei/scavenger/knifeCombo)止まりで、`heavyGunnerExpBuffUntil` は live のまま(=本人がヘビーガンナー窓中なら守護霊の爆発半径にも乗る)。書き込みは主語ごとに閉じた(本バッチ)。中立化まで揃えるなら別裁定。
- 守護霊の地雷は**見た目がプレイヤーの地雷と同じ**(pixiScene の `syncSensorMines` は共通の Graphics)。青白の主語マーカーを付けるかは未発注(判定・危険域の絵としては同一で問題なし)。
- 分身の描画スプライトは主語ごとに1組=同時に生きる強glowは増えない(**負荷 1/10**: プール済みスプライト差し替えのみ・per-frame Graphics/Text 生成なし)。
- ★未決: **なし**(裁定済みのドクトリンで全て決まった。上の「解釈」1点は実装ログに明記)。

---

## 発注仕様: バッチ GHOST-BULLET-TECH(弾も技・v0.25.2542発注)

**正本方針(社長2026-07-31)**:「弾も技である以上、記録に弾を避ける確率、避ける動きもあるべき。
それも含めたボスとの距離の取り方の癖という個性もある」。§2.11追補ドクトリン(独立した2人目の
プレイヤー・例外なし)にも準拠する。

### A. 認知の持続(反応遅延の是正・即効の溶け止め)
- 現状の穴: `dangerSeenAt` は危険が一瞬途切れるたびに undefined へ戻り、**弾の波ごとに100-800msの
  盲目窓が再発生**する(近距離弾は200-500msで着弾=ほぼ確定被弾。i-frame飽和で毎分~85発ペース)。
- 修正: 危険が消えても **GHOST_DANGER_MEMORY_MS(叩き台2000ms)** は認知を保持し、反応遅延は
  **危険エピソードにつき1回だけ**払う。エピソードが本当に終わって(記憶切れ)から次の危険で再び遅れる。
  反応の遅い記録は弾幕の**初弾を食らいやすい**(=個性・人間らしさ)が、以降は本気で避ける。

### B. 弾技の計測拡張(技別の「食らう/避ける」個性)
- 現状: 弾でmoveKeyが付くのは g-bolt のみ。他のボス弾技(裏ボスburst/radial・天使volley/uri bolt・
  idol射撃など)は被弾が技別に記録されず、ゴーストは弾技の個性を再現できない。
- 実装:
  1. **Projectileに発射元の技キー**を持たせ、ボス(isEngageableBoss)の全弾技の発射箇所でタグ付け
     (gameStore/useGameLoop/angelBossTickの全経路を洗う=「同じ動作を持つ全員に」の掟)。
  2. プレイヤー被弾時、そのmoveKeyで既存の技別記録(notifyMoveDamage)へ合流。**エピソード数(n)の
     計上**も既存の技の記録方式(playerTraitsのG4a)と同じ流儀で弾技に足す(方式はコードの現行実装を
     読んで合わせる。新しい記録モデルを発明しない)。
  3. ゴースト側: 弾技にも rollGhostMoveReaction(dodge/tank抽選=計測hitRate)を適用。
     **tankロールを引いた弾技の弾は避けない**(苦手の再現)/dodgeならAの規格で本気回避。
     弾のmoveKeyで回避対象をフィルタする(タグ無し弾=従来どおり常時回避対象)。
- 過去の記録に弾技データは無い=貯まるまで従来挙動(フォールバック)。プロファイル互換は保つ
  (moveReactionsテーブルへのキー追加のみ・スキーマ版vは上げない)。

### C. 掟(共通)
- プレイヤーの被ダメ・弾の挙動・ボス側は一切変えない(タグ=記録専用の付加のみ)。
- 数値は全て叩き台と明記し定数節へ。未決は本台帳★未決へ追記して停止。
- BOT_AND_GHOST.md編集禁止。git add明示列挙。純関数化+ユニットテスト同コミット
  (A=エピソード保持の状態遷移/B=タグ→記録→ロール適用)。
- **並走注意**: FX-V3V4エージェントが pixiScene.ts/pixiTextures.ts/sprites/fx を編集中=触らない。
  ゲート: `npm run typecheck` 0+lintエラー0+related。
- 版管理: rebase後origin+1・changelog先頭・DEVELOPMENT_LOG(JST打刻)・台帳ステータス更新。

---

## 実装ログ: バッチGHOST-BULLET-TECH(弾も技・v0.25.2543・ステータス=実装済み)

正本= 上の発注仕様(社長方針2026-07-31「弾も技である以上、記録に弾を避ける確率、避ける動きもあるべき」)。
**プレイヤーの被ダメ・弾の挙動・ボス側の判定/ダメージ/タイミングは1文字も変えていない**
(`Projectile.srcMoveKey` は記録専用の付加。判定・ダメージ・描画は読まない)。

### 0. 前提の穴の是正(**最も体験が変わった点**・発注文には無かった発見)
`GHOST_DODGE_PROFILE.dodge` が `'aoe'` 段=botSkillの段階表では
**`dodgeHandles('aoe','projectile') === false`「弾を1発も避けない段」**で、守護霊はこれまで
**敵弾を一切避けていなかった**。発注Bの「タグ無し弾=従来どおり常時回避対象」「tankした弾技の弾だけ
外す」が成立する前提が無かったため `'all'` へ是正。差分は**弾だけ**('jump'/'charge'/'aoe' は
'aoe' 段でも既に true、'contact' は `ghostDodgeVector` が maxHealth=0 を渡すので不活性のまま)。
不変条件をテストで固定(「弾を避けない段に戻したら落ちる」)。

### A. 認知の持続(状態遷移=純関数 `stepGhostDanger`)
| 状態 | 条件 | 振る舞い |
|---|---|---|
| 危険なし | memory=undefined・危険なし | 何もしない |
| 認知 | 危険を見た最初のtick | `seenAt=now` を記録・**まだ回避しない** |
| 反応済み | `now - seenAt >= reactionMs` | 回避を実行(以後このエピソードでは即応=遅延を払い直さない) |
| 記憶 | 危険が消えた | `seenAt` を保持(`lastDangerAt` は進めない) |
| 失効 | `now - lastDangerAt > GHOST_DANGER_MEMORY_MS`(**叩き台2000ms**) | memory=undefined=次の危険で改めて遅れる |

- 状態は `Summon.ghostDangerSeenAt`(既存)+ `ghostDangerLastAt`(新設)の2フィールドのみ。
  「反応済み」は `now - seenAt >= reactionMs` の**導出**なので持たない(エピソードが続く限り真のまま)。
- `lastDangerAt` 未設定(旧Summon)は「記憶は生きている」扱い=移行tickで遅延を払い直さない。

### B. 弾技の計測拡張
**タグ付けは `createEnemyProjectile` の1箇所**(`projectileMoveKeyForEnemy(enemy)`)。発射経路
(gameStore/useGameLoop/angelBossTick の12箇所)には触らないので**取りこぼしが構造的に起きない**。

| ボス | 弾技キー | 拾う状態(全フェーズ) | 発射経路 |
|---|---|---|---|
| giantbat | `g-bolt`(既存) | `g-bolt-*`(既存の `moveKeyForEnemy`) | gameStore: 咆哮弾 連射(burst)/扇(fan) |
| mimir | `mimir-burst` / `mimir-radial` | aim-burst/burst/burst-recover、aim-radial/radial/radial-recover | useGameLoop `fireBullet` |
| jormungand | `jormungand-burst` / `jormungand-radial` | 同上 | useGameLoop `fireBullet`(3-way扇 / 螺旋16発) |
| skadi | `skadi-burst` / `skadi-radial` | 同上 | useGameLoop `fireBullet` |
| thor | `thor-burst` / `thor-radial` | 同上 | useGameLoop `fireBullet`(**`?thorscript=0` の旧3択専用**。台本では弾を撃たない) |
| miguel | `miguel-volley` | volley-windup/volley/volley-recover | angelBossTick(台本/旧の**2経路**) |
| jibril | `jibril-volley` | 同上 | angelBossTick(台本/旧の**2経路**・snipe/closeとも同キー) |
| uri | `uri-bolt` | bolt-windup/bolt/bolt-recover | angelBossTick |
| suriel | `suriel-gaze` | gaze-windup/gaze-recover | angelBossTick(windupの終わりに1発) |
| acrasiel | `acrasiel-gaze` | gaze-windup/gaze-recover | angelBossTick |
| idol | `idol-aim` / `idol-fan` | idol-aim-windup/recover、idol-fan-windup/recover | useGameLoop `idolFireBullet` |

**入れなかったもの(意図的)**: acrasielの`burst`=自己中心の**爆発**(弾ではない)/ rafiの骨・skadiの氷/刃・
jibrilの炎=**別エンティティ**(Projectileではない)/ idolのroll・punch=近接。

- 記録: combatTick の `boltMoveKey`(ownerType推定)を廃止し `proj.srcMoveKey` を
  `damagePlayer(..., damageSourceMove)` → 既存 `notifyMoveDamage` へ渡すだけ。**エピソード数(n)は
  既存の `stepMoveReactions` が技の状態で開閉して数える**(新しい記録モデルは作っていない。
  型ホワイトリスト giantbat/thor を「技キーが導出できるか」に置換しただけ=giantbat/thorの計測は不変)。
- ゴースト: `rollGhostMoveReaction` の技キー導出を `anyMoveKeyForEnemy`(近接AoE台帳→弾技台帳)へ一本化。
  **tankを引いた弾技の弾は `GHOST_BULLET_TANK_MS`(=`ENEMY_PROJECTILE_DURATION` 4000ms)だけ回避対象から
  外す**(技の状態は弾より先に終わるので、状態だけ見ると「撃たれた瞬間だけ避けない」になる)。
- 記録が無い弾技は従来どおり fallback、かつ**乱数を消費しない**=既存プロファイルのRNG列は不変。
  `moveReactions` へのキー追加のみでスキーマ版 `v` は据え置き。

### テスト
- `moveReaction.test.ts` +15件: 発射箇所の全数表(型×状態×キー)/溜め・実行・硬直が同キーへ寄る/
  状態名衝突の型ゲート/弾を撃たない技はタグ無し/近接AoEキーは弾に載らない安全弁/弾技エピソードの
  暴露・残響・counter優先/giantbat・thorの既存計測が不変。**網羅の機械化2件**=台帳の状態名がソースに
  実在するか(リネーム検知)+ `createEnemyProjectile(` の箇所数を12に固定(**新しい発射経路を足すと落ちる**)。
- `ghostDriver.test.ts` +12件: `stepGhostDanger` の5遷移/記憶中に危険が戻れば即応/旧状態の移行/
  守護霊が弾を回避対象にする不変条件+接触は不活性/弾技ロール/tank記憶の発生・持続・失効。
  既存の「危険が消えたらリセット」は**新仕様(記憶切れでリセット)へ更新**。
- `npx vitest related`(変更6ファイル)= **41ファイル 799件パス**(4 skipped)。
  ゲート: `npm run typecheck` 0 / `npm run lint` エラー0(既存warning 8)。負荷 **1/10**。

### 実装メモ(次バッチが踏む前提)
- `markMoveReactionCounter` は「開いているエピソード全部(無ければ残響)」へ付ける既存仕様のため、
  giantbat/thorの残響と他ボスの弾技エピソードが**同時に生きている**場面ではマーク先が残響から
  開いている側へ移る。実運用ではボスは同時に1体なので影響しない(仕様の解釈は変えていない)。
- 弾以外で危険を撒く技(骨/刃/氷/火=別エンティティ)は今回も対象外。拾うなら
  GHOST-BEHAVIOR の申し送りと同じ「エンティティ側の回避」という別の器が要る。
- ★未決: **なし**(発注文に無い値は全て叩き台として定数化し、意図をコメントに明記した)。

---

## 構造ズレ組サブ6種の裁定案(2026-07-31・設計チャット→社長。基準=§2.11追補「実プレイヤーが2人いたらどうなるか」)

残る未対応サブ6種を新基準で洗い直した。**結論: 6種すべて「写す(主語引数化)」が答えになり、
例外・簡易化の余地は無い。** 個別の論点だけ裁定を求める。

| サブ | 実プレイヤー2人なら | 実装方式 | 論点 |
|---|---|---|---|
| **犬(dog)** | 各自の犬が各自に持ってくる | フェッチ状態機械のプレイヤー座標直読みを主語引数化 | なし(M) |
| **火炎瓶(molotov)** | 各自が移動中に自分の足元へ設置 | 「本人が移動中」判定を主語引数化(ghostの移動判定は既存のオービット含む) | なし(S) |
| **救急鞄(first-aid-kit)** | 各自が自分の鞄を1回使う | 自前在庫1(Summonへ)・自分のHPへ使用。使用判断=HP閾値(叩き台50%) | 使用タイミングの閾値だけ叩き台(S) |
| **支援狙撃(support-sniper)** | 各自の移動でタイマーが進む | 「プレイヤー移動中のみ進行」の主語引数化+自前タイマー | なし(S) |
| **ホーミング(homing)** | 各自が押しっぱなし→離しで撃つ | 意思決定が「押す/離す」を模擬(ロック蓄積時間=叩き台でロック満タンまで押す) | 離すタイミングの癖は計測なし=一律「満タンで発射」でよいか(M) |
| **クイックマガジン(striker-quick-mag)** | 各自が投げて自分で拾いに行く | 投擲+**回収の移動目標**をghost意思決定へ追加(拾うまで間合い管理より優先) | **回収AIが行動に割り込む**(戦闘中に拾い歩きする=人間もそうしている)。これを許容するか(M) |
- 提案: 6種まとめて1バッチ(GHOST-SUBS-FINAL・合計L)。論点3つ(救急鞄の閾値・ホーミング発射則・
  クイマガ回収の割り込み)は上記の叩き台で実装し実機調整。
- これが入ると**サブウェポン24種は全種ゴースト対応**=§7の未対応表が消える。

### 裁定(社長2026-07-31「それで」=6種すべて承認)+ホーミングの改良指示
- **ホーミングの発射則は固定則ではなく計測**(社長「ロックは秒数平均だけ持っておけば?
  大体3秒くらいで撃ってるなーとか」): プレイヤーの**押す→離すまでの保持時間の平均(EMA)**を
  G4a計測に追加(ノブ名叩き台: `homingHoldMsAvg`)。ゴーストはその平均時間だけ「押して」から発射
  (clamp: ロック満タン到達時間を上限・最短は最初のロック成立まで)。**計測が無い(旧プロファイル/
  未使用)場合のフォールバック=ロック満タンで発射**。
- 救急鞄=HP50%叩き台/クイマガ回収の割り込み=許容、で確定。
- **発注タイミング**: GHOST-RESULT-UIエージェントと同一ファイル(playerTraits等)を触るため、
  RESULT-UI着地後に直列で発注する(並走ツリーの同一ファイルWIP衝突の回避)。

---

## 実装ログ: バッチGHOST-RESULT-UI(§2.16 年表リザルト+独立メニュー+同行カード・v0.25.2553・ステータス=実装済み)

### A. データ層(playerTraits)
- **スロット別決算**: `settlePendingTraits(optOut, adoptedSlotKeys?)`。判定は純関数
  `selectPendingForSettlement(records, adopted)` に切り出した(規律4)。規則=①`undefined`は
  1件も落とさない(年表を出さないラン=従来経路のビット一致を保つ) ②保留に撃破が無ければそのまま通す
  ③採用0件=全破棄(=「反映しない」と同義) ④一部採用=採用スロットのbossStyleだけ残し、軸1
  (session/subStyle)は反映する。
- **同行守護霊の保存**: `BossStyleSlot.ally?`(持ち主名+`PlayerBuildSnapshot`写し+クラス+isOwn)。
  写しの作り方は `playerBuild.ghostAllySnapshot(findGhostAlly(summons))` の**1枚だけ**で、記録側
  (`notifyBossClear`の第3引数・gameStoreの2つの撃破合流点)と表示側(`store.ghostAlly`=召喚時に1回)が
  同じ関数を通る(§2.11補足「写すな、共通化しろ」)。
- スコアは**保存していない**(裁定どおり)。年表の数値は `pendingBossClears()` が返す生値
  (clearTimeMs/hitsPerMin/counterChance)を表示時に合成するだけ。

### B/C. UI
- 表示用の純関数は `src/utils/ghostAlbum.ts`(`buildRunTimeline` / `buildAlbumCards` / 比較の向き /
  書式)。カード部品 `src/components/GhostRecordCards.tsx` を**リザルトと討伐記録一覧で共用**。
  ボスアイコンの対応表は `src/utils/bossIcon.ts` へ集約し、タイトル画面の歴史年表も同じ表を引くよう
  差し替えた(表を2箇所に持たない)。
- リザルト: 撃破順アイコン帯+カード(撃破タイム/被弾per分/カウンター成功率+現記録との良化悪化)+
  採用チェック(既定ON)。同行守護霊のフルカードは**年表とは独立**に出す(いいねボタンは置かない)。
- 独立メニュー「守護霊」: 拠点(資料室の下)に入口。名前の決定(既存 `PlayerNameSettings` を共用・
  空欄確定=「名無し」)+討伐記録一覧(同行者は名前のみ・タップでビルドのポップアップ)。
  アップロードボタンは置いていない。資料室は不変。

### ★未決1(構造・要裁定): 討伐記録の「同行者名」は現状オフラインでは**必ず空**になる
- §2.7 制約1(守護霊装備/`?ghost=1`のランは計測を丸ごと停止)により、守護霊が同行したランでは
  セッションが開かない=`notifyBossClear` が発火しない。よって `BossStyleSlot.ally` は
  **オフラインでは原理的に埋まらない**(器と配線は仕様どおり入れたが、実際に入るのはオンラインで
  「他人の霊が来ても自分の計測は続ける」形になった後)。
- 影響: §2.15 ③(討伐記録で名前タップ→ビルド)は当面**空振り**。リザルトの同行カード(B)は
  `store.ghostAlly`(召喚時の写し)から出しているので**今でも出る**=体験としては成立している。
- 選択肢: (a) 現状維持(オンライン化で自然に埋まる) / (b) ゴーストラン中も「撃破記録だけ」は
  残す(軸1・軸2の学習はしないまま、討伐記録の行だけ作る)。**(b)は計測の掟に触れるため実装せず、
  裁定を待つ。**

### ★未決2(軽微): プレイヤー名の入力欄が2箇所になった
- 名前の決定は「守護霊」メニューが本籍(§2.16 C-1)だが、既存のオプション内 `PlayerNameSettings` は
  **同じ部品のまま残した**(勝手に削らない/文言・挙動は1箇所で共有=食い違わない)。
  オプション側を畳むかは社長裁定。

---

## 実装ログ: バッチGHOST-SUBS-FINAL(構造ズレ組サブ・v0.25.2563・ステータス=実装済み(犬のみ停止))

正本= 上の「構造ズレ組サブ6種の裁定案」+「裁定(社長2026-07-31)」。ドクトリンは BOT_AND_GHOST.md
§2.11追補(独立した2人目のプレイヤー=状態は主語ごと)と §2.11追補3(霊体は世界の物に触れない)。
**プレイヤー側の式・定数・分岐は1文字も変えていない**(主語引数化と純関数の共有だけ)。差分は
除外1(演出=停止/スロー/ズームを出さない)と除外4(計測・弾薬・SE距離減衰)のみ。

### 実装した5種(入口タイプ / 追加した主語ごとの状態 / 共有した関数)

| サブ | 入口タイプ | Summonへ足した状態 | 共有(主語引数化)した関数・定数 |
|---|---|---|---|
| **火炎瓶 molotov** | 自走(プレイヤーと同じ「移動中のみ」の常時処理を主語ごとに1本ずつ) | `ghostMolotovCycle`(store.molotovCycleと同型)/ `ghostIsMoving` | `computeMolotovTick`(判定)/ `spawnGroundFire(x,y,ghostId)` / `tickGroundFires` は **主語ごとに1パス**(倍率=置いた本人の疑似Player・`GroundFire.ownerGhostId`) |
| **援護射撃 support-sniper** | 自走(同上・専用タイマー) | `ghostSupportSniperCdMs` | `computeSupportSniperTick` / `computeSupportSniperEntry` / `applySubCooldownSkills`(CD補正の主語=ゴースト) / `buildSupportSniperShot(主語, …)`。NPCは世界の1枠のまま`SupportSniperNpcState.ownerGhostId`で主語を持つ |
| **救急鞄 first-aid-kit** | 自走(1ラン使い切り) | `ghostFirstAidKit`(FirstAidKitStateと同型) | `computeFirstAidKitTick`(しきい値=`FIRST_AID_KIT_HEAL_THRESHOLD_FRAC`=HP50%未満) / `isFirstAidKitEmpty` / `spawnThrownBag`+`FIRST_AID_KIT_THROW_DAMAGE` / 回復量=`HEAL_FRACTION`(回復ピックアップと同じ) |
| **ホーミング homing** | ghostSubClaim + `subSubject('homing')`(CD型) | `ghostHomingLocks` / `ghostHomingHoldStartAt` / `ghostHomingNextLockAt` | 新設の共有純関数 `stepHomingLocks`(プレイヤーの旧インライン実装をそのまま抽出)/ `fireHoming(ghostId?)`(弾・威力・CDは同じ1本)/ `ghostHomingHoldMs`(clamp) |
| **クイックマガジン striker-quick-mag** | ghostSubClaim + `subSubject('striker-quick-mag')`(CD型) | `ghostQuickMagCritUntil`(player.quickMagCritUntilと同型) | `safeThrowDirection` / `checkPlayerPickupCollisions`(回収判定) / `QUICK_MAG_CRIT_WINDOW_MS`(プレイヤーの拾得と同じ窓)。回収の移動目標は `decideGhost.retrieveTarget` |

- **ホーミングの計測(社長の改良指示)**: `SubStyleProfile.homing = { n, holdMsAvg }` をG4aへ追加。
  記録点は**useGameLoopのホーミングブロック1箇所**(指を離した瞬間、ロックが1個以上=発射が成立した時だけ
  `recordHomingHold(押していたms)`)。集計はwire/shieldと同じ流儀(ラン単位tally→`foldSubStyleTallies`→
  EMA α=0.3・初回はサンプルそのまま)。消費は `subStyleHomingHoldMs` → `GhostProfile.homingHoldMsAvg`
  (directorTickが召喚時に載せる)→ `ghostHomingHoldMs` で **[0, 満タン到達時間] にclamp**。
  **計測なし(旧プロファイル/未使用)=満タンで発射**(フォールバック)。**スキーマ版 `v` は据え置き**
  (キー追加のみ+`normalizeSubStyles` で欠損を既定値で埋める後方互換)。
- **回収の割り込み**: `decideGhost` の移動決定に `retrieveTarget` 分岐を1つ足した。優先順は
  **カウンター > 回避 > 回収 > 間合い管理/移動リズム**。`retrieveTarget` が無い時は乱数消費も含めて従来と同一
  (テストで固定)。
- **世界の物に触れない(§2.11追補3)の守り方**:
  - 守護霊のマガジンは `Pickup.ownerGhostId` 付き=**プレイヤーの拾得判定から外す**(守護霊が居ないランは
    1件も該当せず1bit不変)。守護霊は**自分の物だけ**を拾う(世界のドロップには一切触らない)。
  - 救急鞄は世界へアイテムを撒かず**自分のHPへ**使う。弾薬(除外4)と爆弾(追補3)は鞄に入っていない
    =初期在庫を「払い出し済み」で作る(残り1つ=回復)。
  - 犬(dog)は成果物が世界のドロップそのもの=**停止**(★未決6)。

### 犬(dog)を止めた理由 → ★未決6(社長裁定待ち)
裁定案(v0.25.2551)の時点では「各自の犬が各自に持ってくる」だったが、その後に出た**§2.11追補3
(v0.25.2554「霊体は世界の物に触れない/財布なし/ラン中のビルド成長なし」)が上位ドクトリン**であり、
犬のフェッチは `collectPickup`(弾薬・回復・武器・スクラップ等の**世界資源の拾得**)そのものなので衝突する。
取り得る形は次の3つで、いずれも設計判断が要る:
1. **守護霊の犬は出さない**(現状・追補3に忠実。「同じ仕様にする」ドクトリンには反する)。
2. 守護霊の犬も拾い、**成果はプレイヤーへ**(=霊が世界の物に触れて本人へ渡す。オンラインで
   「他人の霊の犬が自分のドロップを持って行く/くれる」形になる)。
3. 守護霊の犬は**噛みつき(移動軌道上のDOG_BITE_DAMAGE)だけ**行い、拾得はしない
   (=拾い物の主語問題を回避しつつ絵と手数は再現。ただし「犬の仕様の一部だけ写す」ことになる)。
→ **裁定が出れば実装は小さい**(フェッチ状態機械の `dogFetchRef` を主語ごとに持ち、プレイヤー座標の
直読み4箇所をオーナー引数に替えるだけ)。

### テスト
- 新規 `src/utils/ghostSubsFinal.test.ts`(23件): ①ロック蓄積の共有純関数(近い順/2ロック目/上限/
  射程外/死亡ロック破棄/リーパー除外) ②押す時間のclampとフォールバック ③保持時間の計測(初回=サンプル・
  2回目=EMA・optOut破棄・旧プロファイル欠損耐性) ④主語ごとの帳簿(`fireHoming(ghostId)`がゴーストの
  ロック/CDだけを動かす・プレイヤー経路は不変・疑似Playerが自前のクイマガ窓を読む・火の主語) ⑤救急鞄の
  在庫(HP50%まで使わない/1回だけ/弾薬・爆弾は入っていない) ⑥回収の割り込み(間合いより優先・危険中は不変)。
- 既存更新: `playerTraits.test.ts` / `ghostAlbum.test.ts` の `subStyles` リテラルへ `homing` を追加
  (**それ以外の既存期待値は無修正で通過**=軸1のビット一致要件を維持)。
- `npx vitest related`(変更ファイル)= **30ファイル 603件パス**(4 skipped)。
  ゲート: `npm run typecheck` 0 / `npm run lint` エラー0(既存warning 8)。
- 負荷 **1/10**: 追加は「守護霊が居る時だけ」動く分岐のみ。per-frameの新規Graphics/Text生成なし・
  強glowを増やさない(火/リング/バーストは既存のプール済み経路)。store書き込みも変化時のみ
  (ロック追加=最短500msに1回・CDタイマーは既存のプレイヤー側と同頻度)。

### 自己点検(実装精度の規律5)
- **プレイヤー不変**: 触れたプレイヤー経路は「ロック蓄積のインライン→同一手順の純関数呼び出し」
  「`5000`→`QUICK_MAG_CRIT_WINDOW_MS`(同値)」「`setSubWeaponCooldown`→`setActorSubWeaponCooldown(undefined,…)`
  (同じ関数へ委譲)」「拾得候補から`ownerGhostId`付きを除外(守護霊不在なら0件)」の4点で、いずれも値・順序・
  乱数消費が変わらない。`tickGroundFires` も守護霊の火が無ければ従来と同じ1パス。
- **ドクトリン**: 共有帳簿・ゴースト専用モデルを新設していない(状態はすべて「プレイヤーと同じ型を主語ごと」)。
  例外は裁定済みの除外1/4のみ。判断に迷った1点(犬)は実装せず★未決へ。
- **§2.11追補3**: 守護霊は世界のドロップ・スクラップ・弾・武器に一切触れない(拾うのは自分が投げた
  マガジンだけ/救急鞄は世界へ撒かず自分に使う/プレイヤーのドロップは守護霊の判定に入らない)。
- 憲法第4条(初心者ゾーン)・第5条(緩を荒らさない)への抵触なし(ボス交戦中の守護霊の挙動のみ・
  スポーン/ランク/配分には触れていない)。

### ★未決6(新規・社長裁定待ち): 守護霊の犬(dog)の扱い
→ 上の「犬(dog)を止めた理由」節の3案から裁定を求める(実装は裁定後・小さい)。

## 発注仕様: バッチ GHOST-CMD-1(§2.18 Phase 1a: 技への反応の袋式化・v0.25.2574発注)

**正本**: BOT_AND_GHOST.md §2.18(コマンド方式・社長裁定2026-07-31「よし、ではそれで行こう。サイコロも提案の案で」)。
**スコープ**: 消費側のみ=技への反応ロールを「毎回確率抽選」→「境界ガード付き袋式」へ置換。
**計測(playerTraits/G4a)は1行も触らない**(味付け計測はPhase 1bで別発注)。

### 1. 新規純モジュール `src/utils/commandBag.ts`
- **袋の中身は既存記録から導出**(スキーマ変更なし): `MoveReaction {n, counterRate, hitRate}` →
  枚数 `counter = round(n×counterRate)` / `tank = min(round(n×hitRate), n−counter)` /
  `dodge = n−counter−tank`(clamp≥0・この順で決める=決定的)。
- **引き=残枚数から一様に1枚**(シャッフル済みデッキのpopと等価)。空になったら詰め直し。
- **境界ガード**(§2.18-7): moveKeyごとに「連続で'tank'を引いた回数」を持ち、
  **streak≥GHOST_BAG_MAX_HIT_STREAK(=2・定数)かつ袋に非tank札が残っていれば、その引きは非tank札から一様に引く**。
  - 詰め直し境界に限定せず毎引きに適用する(実装が単純で、[食食食避]のような偏袋の袋内3連も抑えられる)。
  - **並べ替えであって中身の変更ではない**=引き切れば割合は記録どおり(§2.18の思想と矛盾しない)。
  - **tank専用袋(全部「食」)はガード不発**(非tank札が無い)=「苦手技は食らい続ける」個性を壊さない(仕様)。
- **状態はラン単位のモジュールシングルトン**(duoRecordsのengagement/resetの前例):
  `resetGhostCommandBags()` を gameStore.resetGame から呼ぶ(ラン間リセット・ラン内は交戦を跨いでも保持)。
- 乱数は**注入**(decideGhostのrandを渡す)。Math.random直呼び禁止。

### 2. `ghostDriver.rollGhostMoveReaction` の置換
- ロールの状態機械(技1回につき1回・持ち越し・タイムアウト・キー変化でリセット)は**不変**。
  変えるのは「決定の出どころ」だけ: 確率ロール → `commandBag` からの1枚引き。
- **ゲート変更: `GHOST_MOVE_ROLL_MIN_N` 3 → 1**(§2.18裁定「n=1は確定行動=仕様として許容」。
  n統計デフォは実績null時のみ)。n=0/キー未定義は従来どおり 'fallback'(1bit不変)。
- 既存テストの追随: 極端率(0/1)のテストは袋でも同じ決定になるはず。「n<3はfallback」テストは
  新ゲート(n<1)に合わせて書き換え(コメントに§2.18裁定を記す)。

### 3. テスト(commandBag.test.ts 新設+ghostDriver.test.ts 追随)
- 枚数導出(丸め規則・clamp)/引き切りで割合=記録どおり/ガード: 混合袋で非tank残がある限り3連被弾しない/
  tank専用袋はガード不発(3連以上も出る)/n=1=確定行動/詰め直し/リセット/n=0はfallback。

### 4. 掟
- 計測パス不触・BOT_AND_GHOST.md編集禁止・fallback経路は乱数消費含め1bit不変・
  ゲート=`npm run typecheck`+`npm run lint`(エラー0)+`npx vitest related`(触ったファイル)・
  DEVELOPMENT_LOG.md先頭に「(未採番)」エントリ・git操作/バージョンbump禁止・未決はこの台帳へ追記して停止。

## 発注仕様: バッチ GHOST-CMD-1B(§2.18 Phase 1b: 味付け=避け方向の癖・v0.25.2580発注)

**正本**: BOT_AND_GHOST.md §2.18(コマンド方式)の「意図3分類×味付け2層」(C案)のうち、
**dodgeの味付け=避け方向の癖(横に流す/後ろへ下がる/前へ抜ける)**の計測と適用。
※「動き出しの早さ」は**既存のreactionMs計測で実装済み=本バッチでは何も足さない**(重複計測しない)。
※ tankの「撃ち続けるか」・counterの「待ち位置」・「前へ抜ける」の真実装(敵を横切る移動)は
**Phase 2スコープ=本バッチ対象外**(★未決にもしない)。

### 1. 計測(moveReaction.ts+playerTraits.ts)
- `MoveEpisode` に変位アキュムレータを追加: エピソード中の毎tick、プレイヤー変位(dx,dy)を
  **その敵への半径方向/接線方向へ分解**して累積する(radialOut / lateral / radialIn の3スカラー。
  前tick座標は `MoveReactionState` に持たせる。`stepMoveReactions` は既に player と enemies を
  毎tick受けている=新しい引数は増やさない)。
- `foldEpisode` で**結果がdodge**(exposed && !countered && !hit)のエピソードだけ、累積の
  **最大軸で3分類**(radialOut優勢→'away' / lateral優勢→'lateral' / radialIn優勢→'through')し、
  `MoveReactionState` に新設する `dodgeDirTally {away, lateral, through}` へ加算(技キー横断=
  グローバルな癖。技別には持たない=§2.18-2「味付けはスカラー」・標本を薄めない)。
- `endMoveReactions` の返り値に dodgeDirTally を含め、セッションレコード→プロファイルへ:
  - `PlayerProfile.dodgeDir?: { n: number; awayRate: number; lateralRate: number }`(throughRateは
    1−away−lateralで導出)。混合は `blendMoveReactionTable` と同じ数式(初回=サンプルそのまま・
    以後EMA・nは累計)を1キー分だけ適用。スキーマ版`v`は据え置き+normalize補完(欠損=undefined)。
  - `BossStyleSlot` にも同名フィールドを写す(丸ごと写しの一部)。`PendingBossStyleRecord`/
    `PendingSessionRecord` に dodgeDirSample を追加。
- ゴーストラン破棄・30秒フロア等の既存ゲートに**新しい例外を作らない**(sessionレコードに乗る=
  自然に同じゲートに従う)。

### 2. 消費(ghostDriver.ts+ghostTelegraph.ts)
- `GhostProfile.dodgeDir?`(同形)を追加し、directorTickの effectiveGhostProfile 経路で載せる。
- **バイアスは円形脅威のみ**(成功が主・癖は従=§2.18-3): `ghostExtraTelegraphDodge` が返す
  DodgeThreat に `shape?: 'circle'` タグを追加し(circleThreat生成箇所)、`ghostDodgeVector` で
  円形タグ付きの脅威単位ベクトルだけを**接線方向へ回転**してから合成する:
  - 回転角 θ = min(45°, 45° × lateralFrac)。lateralFrac = lateralRate + throughRate(前抜けは
    v1では横に畳む・コメントに明記)。回転の向き=ghost.orbitSign の接線側。
  - **上限45°**(円から必ず脱出できる角度=成功優先)。帯・突進・弾・接触の回避は幾何のまま触らない。
- `dodgeDir` 欠損(旧プロファイル・n=0)= バイアス0=**従来とビット一致**(乱数消費も不変。
  回転は決定的でrandを使わない)。
- **botSkill.ts は1文字も触らない**(テストボット共用のため。baseベクトル内の着地円は本バッチでは
  バイアス対象外=対象は台帳(ghostTelegraph)の円形脅威のみ、とコメントに明記)。

### 3. テスト
- 計測: 横移動でdodge確定→lateral加算/後退→away/敵へ向かう→through/被弾・カウンター・暴露なしは
  dodgeDirに数えない/セッション→プロファイル混合(初回そのまま・EMA・n累計)。
- 消費: 円形脅威が接線へ≤45°回転(lateralFrac=1で45°・0.5で22.5°)/帯脅威は不変/
  dodgeDir欠損=完全に従来どおり(ベクトル一致)/randを消費しない。

### 4. 掟
- botSkill.ts無改変・BOT_AND_GHOST.md編集禁止・§2.7計測ゲートに例外を作らない・
  ゲート=`npm run typecheck`+`npm run lint`(エラー0)+`npx vitest related <触ったファイル>`・
  DEVELOPMENT_LOG.md先頭に「(未採番)」エントリ・git操作/バージョンbump禁止・未決はこの台帳へ追記して停止。

## 発注仕様: バッチ GHOST-CMD-2A(§2.18追補: 隙コマンド・v0.25.2584発注)

**正本**: BOT_AND_GHOST.md §2.18「追補: 抜けカードの裁定」の隙コマンド(社長裁定2026-07-31)。
発端=社長実機報告「紫サークルになったら基本的に叩きに行ったはずなのに、AIは近づいていく気配すらなく
中距離から撃ってた」。**数値がなければデフォ=詰めて叩く/数値があれば記録が常に勝つ**(決めつけ禁止)。

### 1. 文脈(3つ・1機構)
隙(punish window)の開始をイベント錨点にする:
- **stun**: 交戦中ボスの気絶(完全気絶(紫)含む)。判定は既存の気絶述語を流用(weaponUtils.pickTargetが
  使う isStunned / meleeExecute.resolveStunnedMeleeHit の成立条件と同じ出どころ。**新しい判定を発明しない**)。
- **recover**: ボスの技後硬直。aiPhase/bossState の語尾 `-recover`(既存の語尾流儀=isBossCounterableNowApproxと同類。
  giantの`g-*-recover`+裏ボス/天使のrecover系)。
- **afterCounter**: カウンター成立直後の追撃窓(叩き台=成立から1200ms・export定数)。
  プレイヤー側=lastCounterSuccessTime、ゴースト側=applyGhostCounterEffect成立時刻(Summonへ
  `ghostLastCounterAt`を追加して打刻)。

### 2. 計測(playerTraits.ts・文脈ごとに1エピソード1票)
- 窓が開いた(文脈発生)→閉じたまでを1エピソードとし、**窓中にプレイヤーの近接ダメージが出たか**で
  2分類: 出た='rush'(叩きに行った)/出ない='shoot'。近接ダメージ検知は**botTelemetryの
  damageDealt.meleeの区間差分**(セッションtickで毎tick取れる=新しいnotify配線を作らない)。
- 保存: `PlayerProfile.punish?: Partial<Record<'stun'|'recover'|'afterCounter', {n, rushRate}>>`
  (疎・文脈ごと・技キー横断)。混合はdodgeDirと同じ数式(初回そのまま・EMA・n累計)。
  スキーマv据え置き+normalize補完。BossStyleSlotへも写す(丸ごと写し)。
- 既存ゲート(ゴーストラン破棄・30秒フロアの現行v0.25.2579形)に新しい例外を作らない。

### 3. 消費(ghostDriver.ts+useGameLoop配線)
- `GhostProfile.punish?`(同形)追加+effectiveGhostProfile経路(1Bと同じ形)。
- 紐付きボスで文脈が開いた瞬間に**2モード袋**から1枚引く(文脈×ランで引き切り・詰め直し=
  commandBagと同じ寿命規則。境界ガードは不要=被弾の意味を持たない)。**n=0/欠損のデフォ='rush'**
  (社長裁定「ベストは数値がなければ」)。乱数はdecideGhostのrandを注入(消費は文脈開始tickの1回のみ)。
- 'rush'を引いたら、その窓の間**カウンター接近と同じ型**で移動を上書き: 縁74pxまで詰め、射程内で
  melee(気絶中は既存のapplyGhostMeleeFinisher経路が処刑を面倒見る。meleeBias抽選は通さない=
  「行くと決めた」ので確実に出す)。**回避(dodge)は上位のまま**(他の脅威は避けながら詰める)。
  'shoot'は従来どおり。窓が閉じたら通常の意思決定へ戻る(持ち越し状態はGhostSelf/GhostDecisionの
  既存パターン=フラット項目で)。
- **2モード袋は汎用形で新設**(`src/utils/modeBag.ts`等・{n, rate}→2種札・一様引き・引き切り・
  ラン単位リセット(resetGameから)・rand注入)。以後のPhase 2サブモード%で流用する前提のAPIにする。

### 4. テスト
計測: stun窓で近接デルタあり→rush票/なし→shoot票/窓外の近接は数えない/文脈別に独立。
消費: n=0→常にrush(デフォ)/rushRate=0の記録→常にshoot(決めつけない)/引き切りで割合一致/
rush中は接近(縁基準)+melee・dodge優先維持/窓が閉じたら通常へ/欠損=従来とビット一致・乱数消費は
文脈開始時の1回のみ。

### 5. 掟
botSkill.ts無改変・BOT_AND_GHOST.md編集禁止・気絶/硬直の判定を発明しない(既存述語・語尾流儀の流用)・
ゲート=`npm run typecheck`+`npm run lint`(エラー0)+`npx vitest related`・DEVELOPMENT_LOG.md先頭に
「(未採番)」エントリ・git操作/バージョンbump禁止・未決はこの台帳へ追記して停止。

---

## ★仕様: 守護霊カウンターの判定時置換ミラー(社長裁定2026-08-27・設計チャット直轄・監査1巡反映済み v2)

### 社長のゴール(言葉のまま)
「いまだに、守護霊がカウンターできてない」→ 提案3案のうち案A(プレイヤーと同じ判定時置換)に対し
**「守護霊もプレイヤーの動きに揃えるに決まってるでしょう」**。
= カウンター憲法(「攻撃判定と窓の重なった瞬間だけが成立」)を、プレイヤーと同じ原理・同じ関数で
守護霊にも適用し、実機で守護霊のカウンターが再び成立するようにする。

### 現状の壊れ方(診断済みの事実・2026-08-27)
1. **窓の意味が旧式のまま**: 守護霊の請求(claim)はスイング**解決時**(前隙200ms後)に積まれ、
   TTL150msの間に「ボスがACTIVE州のまま」+「守護霊と矩形重なり」が要る。憲法(v3947)で機会が
   短い実行州のみになった結果、反応遅延(100〜800ms)+前隙(200ms)の後にこの偶然が揃うことは
   実質無い(v3962の消費側配線は必要だったが時間の勘定は直っていなかった)。
2. **idolは消費側ごと削除**(v3947で counterHit 撤去・`countered=false`固定)+機会州リスト
   (COUNTER_OPPORTUNITY_STATES)にidol州が無い=構えすら発生しない。
3. **当たらない技が多い**(2026-08-27走査): 守護霊にダメージが入る経路は5つだけ
   (①爆風/帯=pumpkinBlasts ②ボス弾 ③汎用接触 ④トール/ミーミルのカプセル技 ⑤グレン血溜まり床)。
   天使の斬撃群・賞金首の鞭/コンボ/狙撃・idol狙撃は**守護霊に当たらない**。
   ⇒「守護霊が実際に食らう瞬間の置換」だけでは成立場面が足りず、**プレイヤーと同じ
   「成立域(赤い予告の図形)にいるか」の再評価**が必要。

### 原理(プレイヤーの写し・二重実装禁止)
プレイヤーの成立 = **攻撃の成立域(counterReachの図形/実ダメージ解決)に体があり、
窓(押した瞬間から `COUNTER_ACCEPT_MS`=300ms)が生きている瞬間**。
守護霊の成立 = 同じ式で「プレイヤーの体」→「守護霊の体」、「プレイヤーの窓」→「守護霊の窓(下記)」
に置き換えたもの。**成立域の図形・成立州・判定関数はプレイヤーが使うものをそのまま使う。**
**「守護霊の体」= その成立地点で置換する元のプレイヤー判定が使っている体と同じ流儀**
(監査M2: 図形reach=生の矩形 / カプセル=中心+max(w,h)/2の円 / 接触=生のsummon矩形。
`playerHitbox(ghost)`(2/3縮小)の独自流儀は請求側位置ゲートごと廃止)。

### 窓(構え)の定義(監査R3/M1反映)
- **窓の正本は既存の `ghostCounterWindowEnd`**(振り始めに `+COUNTER_ACCEPT_MS` で開き、被弾で0に
  閉じる=起点・長さ・閉じ方がプレイヤーの隻狼型と同一の既存実装)。**新しい窓は作らない**(M1)。
- 請求(claim)は**意図とデータの運び手**に縮退: `{bossId, ghostX/Y, dmg, atMs=振り始めDate.now}`。
  **積む時刻=振り始め**(gPendingSwingAt打刻の瞬間。旧: 前隙解決時)。
- **請求の有効判定は1関数に集約**(ghostCounter.ts): `now <= ghost.ghostCounterWindowEnd`(被弾
  クローズ込み)**かつ** `now - claim.atMs <= COUNTER_ACCEPT_MS`(直後の通常スイングで窓が開き直しても
  古い請求が延命しない保険)。旧TTL150は廃止。
- **時間の勘定(R3・数字で明記)**: 窓=[振り始め, +300]。前隙200msの間も窓は生きている=
  **プレイヤーが押した瞬間から受付されるのと同じ算術**(プレイヤーも押下+200msで刃が出るが、
  窓[0,300]の間の被弾は置換される)。前隙解決後の残りは100ms——旧[+200,+350]より解決後は50ms
  短いが、**構え中(0〜200ms)に成立できるようになる**のが本改修の主目的(旧方式は構え中の着弾を
  一切取れなかった)。
- **請求側の位置ゲート(矩形重なり)と `GhostClaimGateOpts`(inAttackZone)は、成立域の再評価を
  新設する経路(下の1〜4と6)についてのみ不要**(成立の瞬間に成立域判定へ守護霊の体を入れるため)。
  **城ボス(5)は現行のpeekゲート(inAttackZone含む)を維持**——v2594/2597「ありえない位置で
  カウンター」の再発防止(R1)。実装形: 有効判定関数に opts を残し、5だけ従来ゲートを通す。
- 最新1件のみ・対象ボスのみ・1成立で消費、は従来どおり。

### 成立地点(全系統・プレイヤーの判定と同居・プレイヤー優先)
プレイヤー不成立のフレームだけ守護霊を同じ式で判定する(同フレーム二重成立の禁止=L4のテスト対象)。
1. **裏4+トール ACTIVE図形**(useGameLoop hiddenブロック): hiddenReachOverlapNow と同じ判定を
   守護霊の体+窓で再評価。成立→既存 thorCounterHit / hiddenBossCounterHit(GhostCounterFire)。
2. **裏4+トールの判定時置換カプセル技**(一閃/突き/払い/突進斬り抜けの**4箇所**。
   ※ミーミルレーザーは紫=カウンター不可の色文法どおり**対象外**——検収1巡(中6)で記述を実装に合わせて是正):
   applyGhostAllyCapsuleHit の**戻り値を種別付きに変更**(R5)。窓が生きていれば
   ダメージを出さずに 'countered' を返し、**呼び出し5箇所がプレイヤー側と同じ countered を立てて
   技を中断**(per-bossハンドラ=thorCounterHit/hiddenBossCounterHit を呼ぶ)。プレイヤーが同
   フレームに成立済みなら守護霊は評価しない。
3. **賞金首**(bountyTick カウンターブロック): inCounterReach(プレイヤーと同じ図形)を守護霊の
   体+窓で再評価(現行の「請求があれば成立」を置換)。tryMovingCounter(移動後図形)にも同じ
   守護霊分岐(プレイヤー不成立時のみ)。**成立時の後始末(comboStep=0/resetBrShotCycle/chase復帰)
   は現行のghost成立分岐と同じものを共有**(L3)。
4. **天使6**(angelBossTick): プレイヤーの成立式と同形へ——
   `(isCounterOpportunityNow(boss) || isBodySlamNow(boss)) && 体の重なり(bodyOverlapNowと同じ
   生矩形判定を守護霊で) && 窓`(M5)。
   **★検収1巡(重4)=裁定待ち**: 守護霊は縁74pxで止まる+体28pxのため「体の重なり」は自力では
   起きない=その場で振る技(tate/sweep/downslash/thrust/ring-*)は実質成立ゼロ、成立するのは
   体当たり(mdash-move)だけ。①技の判定図形で再評価へ広げる(推薦)②現状(体当たりのみ)を受容
   ③天使だけ旧式(州+請求)へ戻す——の3案を社長へ提示中。裁定まで現実装(②の形)を維持。
5. **城ボス(giantbat/グレン)**: 爆風(combatTick 請求消費)と接触パリィ(applyGhostBossParry)は
   既に「当たる/触れる瞬間」型=**窓の定義変更が効くだけ**。現行のpeek位置ゲート・inAttackZoneを維持。
6. **汎用ボス接触**(useGameLoop 敵→summon接触ブロック): 交戦対象ボス(isEngageableBoss)の本体
   接触が守護霊に入る瞬間、窓が生きていれば置換(プレイヤーの接触受け流しの写し)。
   プレイヤー側と同じ除外(shouldSkipBossContactParry)を通す。**giantbatは対象外**(5の
   applyGhostBossParry が先に走って請求を扱うため=M4の順序衝突回避)。
7. **idol**: プレイヤーも近接カウンター無し(憲法どおり)→守護霊も無し=対称。弾反射・爆風パリィのみ。
   ghostDriverがidolへ構えない現状は正しい(変えない)。
8. **グレン血溜まり床**: プレイヤーもカウンター不可の床ダメージ→守護霊も対象外(現状維持)。

### ★州→担当の対応表(監査R2。機械検査=L4のテストで固定する)
`COUNTER_OPPORTUNITY_STATES`(ghostDriverが構える州)の全数に消費担当を割り当てる:
| 州 | 消費担当 |
|---|---|
| dash | 6(接触・到達フレームで先着=プレイヤー側と同型の順序)+1(ACTIVE図形=接近中の従担当)(検収1巡・中7の実態注記) |
| thor-dash-move | 1(ACTIVE図形)+2(カプセル斬り抜け)。接触はshouldSkipで除外 |
| issen-dash / tsuki / harai | 2(カプセル) |
| jump-attack / jump-attack-air(トール/ラフィ) | **着地爆風=5の爆風経路**(着地AoEはpumpkinBlasts)+滞空中の体当たりは6(接触) |
| bm-charge | 3(賞金首ACTIVE図形。接触6はshouldSkipで除外=3が担当) |
| bm-whip360 / mk-spin | 3(賞金首ACTIVE図形) |
| leap / leap-air(鋏) | **6(接触)**——プレイヤーも接触受け流しで取る州(v3953)と同型 |
| mdash-move / tate / sweep / downslash / thrust / ring-active / ring-spin(天使) | 4(天使ブロック) |
| aiPhase='charge' / g-dash-charge(城ボス系) | 5(applyGhostBossParry=現行のまま) |
※担当の無い州を作らない。新しい技/州を足す時はこの表とテストに足す(counterReach.test.tsと同じ流儀)。

### 構え(ghostDriver)の狙い直し(監査R4反映・検収1巡 重1/重2/重3/重5で改訂)
- **溜め(windup)中に構えられるようにする**: 機会条件へ加えるのは**宣言表
  `IMPACT_AT_WINDUP_END_BOSS_STATES`(ghostCounterAim.ts)に載っている予告だけ**——
  条件は①その予告の終了フレームから判定が生きる ②守護霊の消費担当がその判定を拾う。
  総当たり(isTelegraphActive)にすると、終わりに着弾しない予告(トールjump/突進)での早振り(重2)・
  消費担当の無いidol/紫レーザーでの棒立ち(重3=v3948の再発)・ACTIVE州の反応遅延消滅(重5)が起きる。
  giantbatは既存のGIANT_IMPACT_AT_WINDUP_END(aiPhase基準)が引き続き担当。
  **検収2巡の是正**: ①表のキーは`type:state`(重A=同名州'harai-windup'をミゲルからすくわない型ゲート)
  ②「windup終了フレームで爆風(hitCapsule→pumpkinBlasts)を積む技」も条件①②を満たすので全数掲載
  (重B: バス停の押し/三連・馬乗りコンボ3段・バランスの薙ぎ/三連・舞子の薙刀3種。消費担当=
  combatTickのブラストパリィ。mk-suiu-hop*は着地点が毎ホップ再抽選のため対象外)。
- **表の州の見切り=「着弾までの残り>1000ms」**(重1→2巡中C/中Dで是正)——無条件の見切り無効化は
  待ちの上限を失う(bossStateUntilが後退する賞金首KB中に無限棒立ち)ため、基準を着弾時刻へ置換。
  構えの錨(counterPendingAt)は**州が変わったら張り直す**(中C: 長い予告→ACTIVEの持ち越しで
  初フレーム見切りになるのを防ぐ。抽選counterWillAttemptは引き直さない=1機会1回)。
- **振る時刻=着弾予定時刻から逆算**: 既存A-2(giantbat限定)を表の予告へ拡張。
  **leadの再定義(R4)**: 窓が[振り始め,+300]になったので、lead(着弾の何ms前に振り始めるか)は
  **[70, 230]ms**(基準70+反応の遅さ×160。検収2巡(C)Iで実装値どおりに是正——着弾時の窓の残りは
  300−lead=最遅で70ms)。個性は「遅い霊ほどleadが大きい=着弾時に窓の残りが
  少ない=着弾が予定よりズレる技・多段技で失敗しやすい」という形で**部分的に残る**
  (旧「遅い霊はTTL切れで必ず失敗」の個性は算術的に消える——事実として記す。
  ghostCounterAim.ts の定数コメント(TTL150根拠)は新根拠へ書き替える)。
- **時計の混在(R4)**: 逆算は gameTime 系(aiPhaseUntil/bossStateUntil − gameTime)で完結させ、
  窓の生死判定は Date.now 系(claim.atMs/ghostCounterWindowEnd)で完結させる。**2つの時計を
  直接比較する式を書かない。**
- 実行中(ACTIVE)州は従来どおり反応遅延で振る(隙を叩く)。
- 乱数消費順は変わる(機会条件の拡張)=意図的な仕様変更。ビット一致は要求しない。

### 見込みの留保(監査M3/L1・実機で見る点)
- 'body'成立の州(dash/charge系)は**ボスが守護霊へ突っ込んで重なる瞬間**に成立する(プレイヤーが
  進路上に立って取るのと同型)。守護霊の待機距離(縁74px)は変えない。帯図形の技はヘイトが守護霊を
  狙った時に帯が守護霊へ向く=「自分に来た攻撃を取る」のはプレイヤーと同じ。
- 前隙中(構え0〜200ms)の被弾は窓を閉じる(プレイヤーと同じ規則)。回避が構えより優先の場面では
  構え自体が起きないため、被弾クローズで成立率が伸び悩む可能性はある——実機で頻度を見る。

### ではない条件(監査・実装への指示)
- 新しい演出・新しいダメージ式は作らない(applyGhostCounterEffect/青Counter!/確定クリ=現行)。
- プレイヤー側の判定・値は1bitも変えない。
- 「ボスの技が守護霊にダメージを与えるようにする」拡張はしない(当たらない技は当たらないまま)。
  ヘイトで守護霊を狙った技の実ダメージ化は別案件。
- 弾反射の**成立機構**(reflectProjectile等)は触らない。窓 `ghostCounterWindowEnd` を正本として
  読む共有は本仕様の範囲(M1)。
- UI/表示の追加はしない。

### 受け入れ条件(監査M6反映)
1. **機械ゲート**: `npm run typecheck`+`npm run lint`エラー0+ユニットテスト全緑。テストは最低:
   窓の意味(振り始め+300ms/被弾クローズ/1成立1消費/COUNTER_ACCEPT_MS参照/請求延命保険)、
   賞金首・裏ボスの守護霊成立(図形+窓)、**同フレームのプレイヤー優先=二重成立しない(経路ごと)**、
   **州→担当表の全数に担当がある機械検査**、idol対称(構えない)、着弾逆算のclamp。
2. プレイヤーのカウンター挙動・数値に変化が無いこと(既存テスト全緑で担保)。
3. 実機の頻度確認は**社長の目視**(受け入れ条件からは外す=数値基準を発明しない)。

### 実装メモ(軽指摘の反映)
- L2: useGameLoop「鞭なら250」コメントは実装(meleeWindupMs=常に200)と食い違い→実装時に修正(C)。
- 実装は設計チャット直轄(サブエージェント発注しない)=発注の掟は不要(L5)。

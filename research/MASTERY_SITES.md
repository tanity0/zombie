# 熟練度の「掛ける所・積む所」台帳(読み取り調査・HEAD 3e824fe9)

調査範囲: `src/` 全体(テストを除く)。`research/MASTERY.md` §1/§5/末尾「監査で分かった事」を先に読んだ上で、コードを実読して書いた。推測は「未確認」と明記。

## 0. 数え上げ(最初にここ)

| 項目 | 件数 | 内訳・注 |
|---|---|---|
| `damageEnemy(` を含む行(指定コマンド `grep -n "damageEnemy(" useGameLoop.ts gameStore.ts utils/*.ts`・テスト除く) | **75 行** | コメント・説明文の言及を含む。型宣言(`gameStore.ts:9224`)と本体定義(`17012`)は `damageEnemy(` の形では出ない |
| 実際の**呼び出し** (コメント除去後に数え直し) | **62 件** | useGameLoop **30** / gameStore **20** / utils **12**(angelBossTick 1・astroTick 1・bountyTick 1・combatTick 2・ghostCounter 1・heroBlast 2・newGunsTick 1・phantomTick 1・playtestDriver 1・weaponUtils 1)。`src/` の他のディレクトリ(components/pixi/world 等)に呼び口は**無い**(全 src を grep 済) |
| `damageEnemy` の関数参照渡し | 1 | `useGameLoop.ts:2217`(`useGameStore(state => state.damageEnemy)`)を `:18587` の deps へ。呼び口は上の 62 件に含まれる |
| `damageEnemy` を**通らず**敵の `health` を直接書く所 | **13 行**(5 関数) | すべて `gameStore.ts`。skaterBoardHit 1(11513)・triggerCounter 3(12358/12419/12479)・shadowCloneStrike 3(12978/12990/13003)・performKatanaStrike 3(13704/13729/13774)・performWhipStrike 3(14074/14088/14124)。`useGameLoop.ts`・utils には**無い**(`health:` 書き込みは湧き・回復・上書きのみ) |
| 中央の減らし口 | 2 | `damageEnemy` 内 `gameStore.ts:17134`(`newHealth = max(0, enemy.health - eff)`)と `17252`(`health: newHealth` を書く)。**`appliedDamage = eff` は `17133`** |
| `recordDamageDealt(` の呼び出し | **6** | `11537`(skaterBoardHit・'other')・`12597`(triggerCounter・'melee')・`13034`(shadowCloneStrike・'other'・`!isGhost` のみ)・`13849`(katana・'melee'・`!isGhost` のみ)・`14168`(whip・'melee')・`17340`(damageEnemy・チャネル別) |
| `gunShotBaseDamage(` の呼び口 | **10 件**(本体定義 `weaponUtils.ts:1091`) | 下の §2 |
| 銃の素ダメ式の**インライン複製**(`gunShotBaseDamage` を通らない) | **4 件** | PHILL `gameStore.ts:15866`・レールガン `15957`・シグナルランチャー `16038`・援護射撃の弾 `weaponUtils.ts:1502`。+ カウンター反撃は `getActiveGun(..)?.damage ?? 12` を直接読む(6 か所・§1 の A 欄) |
| `meleeSwingBaseDamage(` の呼び口 | **10 件**(本体 `gameStore.ts:4154`) | 下の §3 |
| 近接の素ダメ式の**インライン複製**(`meleeSwingBaseDamage` を通らない) | **4 件** | 鞭 `gameStore.ts:13989`(`meleeBase`・ストライカー/装備を**含まない**)・スキル防衛 `useGameLoop.ts:14656`・ワイヤーアンカー `useGameLoop.ts:16613`・パニッシャー `gameStore.ts:21296`(装備倍率を**含まない**) |
| `applyBeamPulse(` の呼び口 | **4 件**(定義 `useGameLoop.ts:14693`) | 下の §4 |
| 弾(Projectile)を作る所(プレイヤー側+共用) | 約 24 | 下の §5 |

**重要な共通の事実(表を読む前に)**
1. `skillOutgoingDamageMult(player)`(`gameStore.ts:2474`)は「全攻撃」倍率(召喚数・育成・カード・英雄・バーサーカー等)で、**全部の与ダメが通るわけではない**。掛かっていない行は表の「式」欄に「**outgoing 無し**」と書いた(タレット爆風・デコイ爆発・発火ナイフ直撃・グレネード系の転がり弾/ロケット壁/シグナルの元値・錬金砲の起爆・パニッシャー・血の履帯 等)。
2. `damageEnemy` は**戻り値が `boolean`(killed)だけ**。通った量は内側のローカル `appliedDamage`(`17133`)で、中で①幻影ゲート(`gatedAmount`)②紫の致命/5×/3×(`meleeFatal`/`pvpFatal`/`gunReward`)③クリ状態の銃 ×1.2(`critStateGun`)④紅き夜の半減(`eff`)で増減する。
3. 同じ呼び口が**プレイヤー本人・守護霊(ghost)・幻影(phantom)で共用**されている所が多い。見分ける変数名を表の注に書いた(`ownerGhost` は**視覚専用マーカー**で判定には使わない、と `types/game.ts:2860` に明記されている点に注意)。
4. 銃の「種類」(handgun/shotgun/rifle/glauncher/phill)は `Weapon.category`、弾からは `weaponKey` → `catalogCategoryTier(key).category`(`weaponUtils.ts:643` の `isGrenadeGunKey` が同じ道)。ユニーク銃もこの `category` で 5 種に落ちる(例: アイレーザー=rifle・火炎放射器=shotgun・呪銃(衛星)=shotgun・グラヴィティガン(塊)=glauncher・錬金砲/ロケット/シグナル=glauncher・スキャン=handgun)。

---

## 1. 本表(1行=1つの呼び口。ファイル順)

凡例: **体力を減らす所**=「DE」は `damageEnemy`(中央 `gameStore.ts:17134/17252`)、「直」は `health` を直接書く行。**キー**の `none(…)` は理由。`※迷い` は §6 に再掲。

### 1-A. `src/hooks/useGameLoop.ts`(damageEnemy 30)

| # | ファイル:行 | 何の当たりか | 威力を決めている式(outgoing の有無) | 体力を減らす所 | 熟練度キー | 根拠・注意 |
|---|---|---|---|---|---|---|
| 1 | useGameLoop.ts:2481 | 四神ダンスフロア(退役 `shijin`)の技の1打(`shijinHitEnemy`) | `:2479` `damage × skillOutgoingDamageMult(st.player)` | DE(既定=player/'other') | **none(退役・最初から最大)** | `shijin` は MASTERY §1 の「最初から最大」に列挙。呼び口は `:2505/2550/2593/2594/2613/10243`(朱雀・白虎・処刑・タップ) |
| 2 | useGameLoop.ts:7168 | トール(裏ボス)のカウンター反撃(プレイヤー成立) | `:7165` `counterReplyDamage(getActiveGun(cp)?.damage ?? 12, cp, BOSS_CRIT)` → `gameStore.ts:4163-4171`(`skillOutgoingDamageMult` は `4170` で掛かる) | DE(crit=true, 'other', 'counter') | **銃の種類**(その時の `getActiveGun(cp).category`)※迷い | 守護霊の成立は同関数の `ghost` 分岐(`applyGhostCounterEffect`→`ghostCounter.ts:294`=none)。本人かどうかの変数: `ghost`(引数)。MASTERY §5-3 は「銃の種類」、§末尾 #6 の推薦は「loadout の平均」で食い違う |
| 3 | useGameLoop.ts:7269 | ミーミル/ヨルムンガンド/スカディ(裏ボス3体)のカウンター反撃 | `:7268` 上に同じ(`counterReplyDamage`) | DE(同上) | **銃の種類**※迷い | 同上(`hiddenBossCounterHit` の `ghost` 引数) |
| 4 | useGameLoop.ts:11098 | ドッグの噛みつき(往復の道中) | `:11097` `DOG_BITE_DAMAGE × skillOutgoingDamageMult(player)` | DE('dot') | **dog** | 英雄の犬の代行中は `activeFetch.heroDog` で skip(=none)。ドッグはプレイヤー専用(幻影の犬は `:10949` で別経路=プレイヤーに当たる側) |
| 5 | useGameLoop.ts:11562 | 矢の雨(着地した矢) | `:11547` `ARROW_RAIN_DAMAGE × skillOutgoingDamageMult(player)` | DE(既定) | **arrow-rain** | プレイヤー専用(守護霊は `arrowRain` を持たない=未確認だが `arrowRainShots` はストア直置きでオーナー欄なし) |
| 6 | useGameLoop.ts:13500 | 守護霊の近接スイング(束縛ボスへ) | `:13484-13487` `meleeSwingBaseDamage(meleeWeapon, ghostOwner) × crit × skillOutgoingDamageMult(ghostOwner)` | DE(channel=null, hate='ghost') | **none(守護霊)** | 本人でない見分け: ここは守護霊専用ブロック(`ghostOwner`)。フィニッシュ成立時(`ghostFinish`)は §1-B の #51/#52 |
| 7 | useGameLoop.ts:14009 | 自動タレットの消滅爆発(Lv問わず) | `:14008` `TURRET_EXPLOSION_DAMAGE(36) × tExMult(=skillExplosionMult(player)) × 距離減衰`。**outgoing 無し** | DE('dot', blast) | **turret** | **守護霊と共用**(`turret.ownerGhost`)。敵対(幻影)は `tHostile` で上の分岐が処理=ここに来ない。ghost 所有でも `damageEnemy` の hate は既定 'player'・倍率の主語は本人固定=ghost の爆風が本人の熟練度に積まれる恐れ |
| 8 | useGameLoop.ts:14167 | デコイLv3の時間切れ爆発 | `:14166` `decoy.damage(DECOY_LV3_EXPLOSION_DAMAGE=40, 設置 :11296) × dExMult × 距離減衰`。**outgoing 無し** | DE(blast) | **decoy** | 守護霊と共用(`decoy.ownerGhost`)。幻影のデコイ(`hostile`)はこの `filter` を通るか**未確認** |
| 9 | useGameLoop.ts:14297 | 手榴弾の爆発(通常/Lv別) | `:14296` `grenadeBaseDamage × grenadeExMult × grenadeOutMult(:14266, skillOutgoingDamageMult(**player 固定**)) × 距離減衰` | DE(blast) | **heavy-grenade**※迷い | **守護霊と共用**(`grenade.ownerGhost`・倍率は本人の値で評価されている)。**ボマー子手榴弾**(スキル。`bomberSpawned`・`explodeRadius`・`weaponKey` が同じ 'sub-heavy-grenade')も同じ行を通る。敵対(`grenade.hostile`)は上で別処理して `continue` |
| 10 | useGameLoop.ts:14359 | グレネードランチャー(t1/t2)の転がり弾の起爆 | `:14349` `shell.damage × GRENADE_BLAST_DAMAGE_MULT × exMult`。`shell.damage`=`fireWeapon` の `gunShotBaseDamage`(`weaponUtils.ts:1345`)。**outgoing 無し** | DE(blast) | **glauncher** | `rollDetonatePx` を持つ弾だけ(コメント: タレット/朱雀/爆撃は付かない)。プレイヤー専用の判定(`!p.hostile`)。守護霊の弾は 'ghost-gun' で別 |
| 11 | useGameLoop.ts:14471 | センサー地雷の爆発(**守護霊の地雷**の枝) | `:14467` `SENSOR_MINE_DAMAGE(50) × smExMult × smOutMult(:14428, skillOutgoingDamageMult(smActor)) × 距離減衰` | DE(channel=null, hate='ghost', blast) | **none(守護霊)** | 見分け: `smIsGhost = mine.ownerGhostId !== undefined`。`smActor` は守護霊の疑似Player |
| 12 | useGameLoop.ts:14472 | センサー地雷の爆発(**プレイヤーの地雷**の枝) | `:14467` 上に同じ | DE(既定, blast) | **sensor-mine** | 同じ for 内。幻影の地雷(`mine.hostile`)は上の `continue` 側 |
| 13 | useGameLoop.ts:14564 | 発火ナイフの爆発(刺さって2秒後) | `:14563` `FIRE_KNIFE_EXPLOSION_DAMAGE × fkExMult × fkOutMult(:14525) × 距離減衰` | DE(blast, 守護霊は 'dot'/他は 'other') | **fire-knife** | **守護霊と共用**(`knife.ownerGhost`)。ghost 所有も hate='player' で積まれる |
| 14 | useGameLoop.ts:14593 | 発火ナイフの直撃(刺さる瞬間) | `knife.damage`=`FIRE_KNIFE_HIT_DAMAGE(24)`(`:11876` 生成時)。**outgoing 無し** | DE(守護霊は 'dot') | **fire-knife** | 守護霊と共用(`knife.ownerGhost`)。幻影のナイフは `hostile` で別 |
| 15 | useGameLoop.ts:14631 | ドローンブーメランの往復の接触 | `:14630` `boom.damage × skillOutgoingDamageMult(player)`。`boom.damage`=`meleeSwingBaseDamage`(下 §3 の #6/#10 から**借りる**。生成 `gameStore.ts:7374`・打ち返し `7347`) | DE(blast=false, 'other') | **drone-boomerang** | **近接の素ダメを借りる**。守護霊も同じ行(ブーメランに ghost 印は `weaponKey` に無い=未確認。`boom` から本人/ghost を見分ける欄が無い) |
| 16 | useGameLoop.ts:14665 | ドローンブーメランの停止中パルス/スキル「防衛」(`poi-guard`)の周回パルス | `:14656-14658` `(baseDamage / DRONE_BOOM_STOP_DMG_DIV) × pulseExMult × skillOutgoingDamageMult(pulsePlayer)`。`isGuardOrbit` の時の `baseDamage` は**近接の素ダメ式のインライン複製**(`:14656`) | DE(blast) | **drone-boomerang**(`isGuardOrbit`=false)/ **loadout**(`isGuardOrbit`=true=スキル防衛)※迷い | 同じ行に 2 系統。区別子 `boom.weaponKey === 'poi-guard'` |
| 17 | useGameLoop.ts:14717 | **共通の光線の口 `applyBeamPulse`**(金環・氷槍ライフルの床・アイレーザー・火炎放射器) | `:14714` `pulseDamage × outMult`(`:14710` `outMult = skillOutgoingDamageMult(hitActor)`、`hitActor` は `ownerGhostId` で守護霊の疑似Player) | DE('dot', hate=`ownerGhostId`?'ghost':'player') | **引数で渡す**: 金環=gold-ring/氷槍・アイレーザー=rifle/火炎放射器=shotgun/`ownerGhostId`有=none | 呼び口 4 件の詳細は §4。口の中では武器の見分けが付かない=キー引数が必要 |
| 18 | useGameLoop.ts:14861 | ロケットランチャーの壁ヒット爆発 | `:14852` `rp.damage × GRENADE_BLAST_DAMAGE_MULT × exMult`(`rp.damage`=`fireWeapon` の `gunShotBaseDamage`)→`:14860` 距離減衰。**outgoing 無し** | DE(blast) | **glauncher** | プレイヤー専用(`rp.weaponKey === ROCKET_WEAPON_KEY`・主語は `rkState.player`) |
| 19 | useGameLoop.ts:14969 | シグナルランチャーの空爆(着弾点の円) | `:14966` `strike.damage × 距離減衰`。`strike.damage`=`gameStore.ts:16038`(インライン複製・`gunShotBaseDamage` を通らない)。**outgoing 無し** | DE('other', 'heavy', 体勢×1.5, blast) | **glauncher** | プレイヤー専用(手動銃) |
| 20 | useGameLoop.ts:15770 | **弾(Projectile)の直撃**(全部の弾) | `:15741-15745` `damage × critMult × pierceDecayMult × skillOutgoingDamageMult(shotOwner) × bloodGunMult × sniperGunMult × comboMasterMult × handcannonMult`(護衛弾 `isAllyOwnedShot` は掛けない) | DE(`dmgChannel`=`classifyProjectileDamageChannel`、hate=`hateShotSource`) | **弾の `weaponKey` で分岐**(§5 の対応表)※迷い | 守護霊の弾 'ghost-gun'/'ghost-reflect'・護衛 'escort' は none。主語の見分け変数: `isGhostShot`・`isEscortShot`・`shotOwner`・`ghostShotBuild` |
| 21 | useGameLoop.ts:15975 | 錬金砲(`glauncher-t2-alchemy`)の破裂(直撃と同額を範囲に配る+石付与) | `:15974` `acDmg = round(dmg)`(`dmg`=#20 の `:15741` と同じ値) | DE(blast) | **glauncher** | 錬金砲の弾だけ(`weaponKey === ALCHEMY_WEAPON_KEY`)。直撃の積み(#20)と同じ弾の続き=**二重に積まない注意**(直撃で積み、破裂の別の敵ぶんは別行) |
| 22 | useGameLoop.ts:16033 | グレネード系(`isGrenadeGunKey`)の着弾スプラッシュ | `:16023` `splashBase = dmg × GRENADE_BLAST_DAMAGE_MULT × exMult`→`:16032` 距離減衰(`dmg` は #20 と同じ) | DE(blast) | **glauncher**※迷い | **`weaponKey='glauncher-t1'` を借りるタレットのランチャー弾(`:14092`)・スキル爆撃(`:5208`)も通る**(`GRENADE_WEAPON_KEY`=`:641`)。ロケット/グレネード/錬金/シグナル/グラヴィティの弾は同 category=glauncher |
| 23 | useGameLoop.ts:16094 | `explodeOnHit` 弾の小爆発 | `:16084` `splashBase = dmg × explodeDamageMult × exMult`→`:16093` 距離減衰(`dmg` は #20 と同じ) | DE(blast) | **homing / loadout の 2 系統**※迷い | 出どころ 3 つ: ①ホーミング弾(`gameStore.ts:16546`・'sub-homing')②ファイアシューター(スキル・`weaponUtils.ts:1403`・銃の弾に付く)③ボムカウンター(`combatTick.ts:961`・反射弾に付く) |
| 24 | useGameLoop.ts:16554 | 緑の卵(地雷)の爆発 | `MINE_DAMAGE`(定数) | DE | **none(環境)** | プレイヤー側の与ダメではない |
| 25 | useGameLoop.ts:16646 | ワイヤーアンカーLv3 のすり抜け爆発(範囲) | `:16613` `meleeDmg`(**近接の素ダメ式のインライン複製**×`skillOutgoingDamageMult(wp)`)→`:16627` `meleeDmg × WIRE_BOMB_DAMAGE_MULT` | DE('other'|null, hate=`wireHate`, blast) | **wire-anchor** | **守護霊と共用**(`ghostId !== undefined`→`wireChannel=null`・`wireHate='ghost'`・主語 `wp`=守護霊の疑似Player)。**近接武器の damage を借りる** |
| 26 | useGameLoop.ts:16667 | ワイヤー Lv1/2 のすり抜け1打 | `:16613` + `:16627` `meleeDmg × WIRE_PASS_DAMAGE_MULT` | DE | **wire-anchor** | 同上 |
| 27 | useGameLoop.ts:16710 | ワイヤー斬り下ろし(ボス系・近接フィニッシュ ×5) | `bdmg = meleeDmg × BOSS_MELEE_STUN_MULT`・紫中は `meleeDmg`・印で ×`wireScanMult` | DE(viaMeleeFinish, 'heavy') | **wire-anchor** | 守護霊と共用(`wireHate`)。`meleeDmg` に outgoing 済 |
| 28 | useGameLoop.ts:16713 | ワイヤー斬り下ろし(通常敵・即死) | 量=`tgt.health + 1`(式ではない) | DE(viaMeleeFinish) | **wire-anchor** | **積む量が「残り体力+1」**=熟練度に積む値としては不適(やり過ぎが入る) |
| 29 | useGameLoop.ts:16748 | ワイヤー着地のLv3 爆撃(円) | `:16731` `dmg = meleeDmg × WIRE_BOMB_DAMAGE_MULT × wireExMult` | DE(blast) | **wire-anchor** | 守護霊と共用 |
| 30 | useGameLoop.ts:18443 | ボムカウンター(スキル)の自分中心爆発 | `:18420` `BOMB_COUNTER_BLAST_DAMAGE × exMult × bcDmgMult × equipBonus.damageMult × skillOutgoingDamageMult(currentPlayer)` → 距離減衰 | DE(blast) | **loadout** | スキル。プレイヤー専用 |

### 1-B. `src/store/gameStore.ts`(damageEnemy 20)

| # | ファイル:行 | 何の当たりか | 威力を決めている式 | 体力を減らす所 | 熟練度キー | 根拠・注意 |
|---|---|---|---|---|---|---|
| 31 | gameStore.ts:1010 | 護衛の軍人の近接(軍人のナイフ) | `escortKnifeHit(Math.random, CRIT)`(`:994`) | DE('other', hate=`escortHateSide(h.id)`) | **none(護衛の軍人)** | |
| 32 | gameStore.ts:5918 | 格闘の**気功**の爆発(`explodeBrawlerKiko`) | `:5900-5904` `meleeSwingBaseDamage × BRAWLER_KIKO_MULT × exMult × skillOutgoingDamageMult × 足の速さ × brawlerKikoGunMult × skillBloodAwaken`→`:5914` 距離減衰×ダメージ補正×sniper | DE('other', blast) | **brawler** | プレイヤー専用(`p = st.player`)。**近接の素ダメ+銃の素ダメ倍率(scavenger/attackShooter/consumable)を借りる** |
| 33 | gameStore.ts:7144 | スキル「リーパー」の波及(ボス系に 5×) | `:7143` `baseMeleeDamage(引数=呼び元の swingBaseDamage) × BOSS_MELEE_STUN_MULT`。**outgoing 無し** | DE(viaMeleeFinish) | **loadout** | `applyMeleeFinishSkillSpread`(`:7109`)は近接 4 経路(通常/分身/刀/鞭)+守護霊から呼ばれる。守護霊判別: `player.pseudoActor`(未確認: 呼び元ごとに `player` 引数が疑似Player か) |
| 34 | gameStore.ts:7148 | リーパーの波及(通常敵・即死) | 量=`e.health + 1` | DE(viaMeleeFinish) | **loadout** | 積む量が「残り体力+1」 |
| 35 | gameStore.ts:7185 | スキル「処刑の衝撃波」(爆発) | `:7167` `dmg = baseMeleeDamage × pct × exMult`。**outgoing 無し** | DE(blast) | **loadout** | 同 `applyMeleeFinishSkillSpread` |
| 36 | gameStore.ts:7859 | スキル「スラッシャー」の追撃 | `:7812` `meleeSwingBaseDamage(melee, player)`→`:7815` `× SLASHER_MULTS[step] × skillOutgoingDamageMult × skillBloodAwaken × comboMult` | DE('other', gpSource='melee') | **loadout**(MASTERY の指示=スキルの追撃)※迷い | **近接の素ダメを借りる**。通常の近接スイングとは別 `set` |
| 37 | gameStore.ts:13353 | **燃焼DoT**(`tickBurningEnemies`・250ms刻み) | `hits[].dmg = e.burnDpsTick`(敵の状態から読む。式は付けた側で決まる) | DE('dot', hate=`burnByGhost?'ghost':undefined`) | **決めきれない**※迷い | 燃焼を**付ける側が 6 系統**で、付けた時点の出処は敵に残らない: モロトフ(`:13296`=molotov)・延焼弾(スキル `useGameLoop.ts:16286`=loadout)・延焼の感染(`:13334`)・火炎放射器の炎(`flamerBurnPatch`=`useGameLoop.ts:15219`=shotgun)・格闘の気功(`:5955`=brawler)。ghost の火は `burnByGhost` で分かる |
| 38 | gameStore.ts:13402 | スキル「血の履帯」の棘の持続ダメ | `bloodTreadsParams(lv).dps`。outgoing 無し | DE('dot') | **loadout** | プレイヤー専用 |
| 39 | gameStore.ts:13496 | スキル「救難信号」の援軍の着弾 | `a.damage`=`applyRescueSignalProc(.., swingBaseDamage, ..)`(`:6944-6947`・近接の素ダメを渡す)。outgoing 無し | DE('dot') | **loadout**※迷い | コードのコメントは「味方の援護=本人の攻撃ではない」。MASTERY §2 は「プレイヤー本人の当たりだけ積む」。**近接の素ダメを借りる** |
| 40 | gameStore.ts:13592 | 救急鞄(空鞄)の爆発 | `:13571` `baseDmg = b.damage(FIRST_AID_KIT_THROW_DAMAGE) × exMult × skillOutgoingDamageMult(player)`→`:13591` 距離減衰 | DE(blast) | **loadout**(依頼の指示)※迷い | MASTERY §1 本文(28行)は「救急鞄を投げた時の爆発には熟練度を掛けない」=**none** と書いてある。依頼文は loadout。食い違い |
| 41 | gameStore.ts:14331 | 賢者の石ハリケーン(鞭の竜巻)の巻き込み | `:14329` `HURRICANE_DAMAGE × sageStoneHurricaneMult × skillOutgoingDamageMult(player)` | DE('dot') | **whip** | MASTERY §1: 竜巻には鞭の熟練度。発動は `triggerCounter` の鞭の分岐(`:12077`)。プレイヤー専用 |
| 42 | gameStore.ts:14635 | 錬金術の召喚の接触/死神AoE/賢者の石AoE(+スキル「使役」のペット) | `:14633-14634` `h.amount × summonOutMult(skillOutgoingDamageMult(player))`。`h.amount`=`s.damage`(`ALCHEMY_SUMMON_DAMAGE`・`utils/summonUtils.ts:36`)または `rareDmg`(`:14575`) | DE('dot') | **alchemy**(`persistent`でない通常個体+レア死神)/ **loadout**(`persistent:true`=スキル「使役」のペット)※迷い | 同じ `attackHits` の for を通る。区別子は `s.persistent`(`attackHits` に印が無い=呼び出し側で足す必要あり) |
| 43 | gameStore.ts:14641 | 英雄の犬の噛み | `s0.damage`(固定威力・倍率なし) | DE('dot', hate='dog') | **none(英雄の犬)** | `dogBites` ブロック |
| 44 | gameStore.ts:15188 | 守護霊の処刑(即死) | 量=`enemy.health + 1` | DE(viaMeleeFinish, hate='ghost') | **none(守護霊)** | `applyGhostMeleeFinisher`(`:15166`) |
| 45 | gameStore.ts:15203 | 守護霊のフィニッシュ(ボス 5×/強個体 3×) | `:15176` `hit.dmg`(`meleeSwingBaseDamage(melee, actor) × actor.growthAtkMult` 経由で `resolveStunnedMeleeHit`) | DE(viaMeleeFinish, hate='ghost') | **none(守護霊)** | 同上 |
| 46 | gameStore.ts:15626 | スキル「反射神経」の反撃爆発 | `:15607` `[0,60,80,100][rfLv] × exMult × skillOutgoingDamageMult(p)`→`:15625` 距離減衰 | DE(blast) | **loadout** | 被弾イベント由来。プレイヤー専用 |
| 47 | gameStore.ts:16108 | 錬金砲の石の起爆(トリガーを離した瞬間) | `:16085` `gunShotBaseDamage({damage: baseDamage, magazine}, player, gameTime)`(カテゴリ引数なし)→`eDmg`。**outgoing 無し** | DE(blast) | **glauncher** | 起爆は `weapon.key === ALCHEMY_WEAPON_KEY` の時だけ=カテゴリは glauncher |
| 48 | gameStore.ts:21750 | スキル「パニッシャー」(巻き込み) | `:21296` `(melee?.damage ?? 6) × strikerMeleeMult × punisherDmgMult`(**近接式のインライン複製**・装備倍率なし)。outgoing 無し | DE(既定) | **loadout** | **近接の素ダメを借りる** |
| 49 | gameStore.ts:22169 | 救出生存者(`rescue-shooter`)の接触/射撃 | `RESCUE_SHOOTER_DAMAGE` | DE('dot') | **none(味方NPC)** | |
| 50 | gameStore.ts:25388 | 護衛の射撃(`damageShots`) | `d.dmg` | DE('dot') | **none(護衛の軍人)** | |

### 1-C. `src/utils/*.ts`(damageEnemy 12)

| # | ファイル:行 | 何の当たりか | 威力を決めている式 | 体力を減らす所 | 熟練度キー | 根拠・注意 |
|---|---|---|---|---|---|---|
| 51 | utils/angelBossTick.ts:302 | ゲート2の天使のカウンター反撃 | `:301` `counterReplyDamage(getActiveGun(cp)?.damage ?? 12, cp, BOSS_CRIT)` | DE(crit, 'counter') | **銃の種類**※迷い | #2 と同じ |
| 52 | utils/astroTick.ts:390 | 隕石の巻き添え | `t.damage` | DE(null, 'neutral') | **none(敵どうし/環境)** | |
| 53 | utils/bountyTick.ts:582 | 賞金首のカウンター反撃 | `:580` `counterReplyDamage(getActiveGun(cp)?.damage ?? 12, cp, BOSS_CRIT)` | DE(crit, 'counter') | **銃の種類**※迷い | #2 と同じ |
| 54 | utils/combatTick.ts:705 | ジャンプ敵の弾き(パリィ)の反撃 | `:701` `hit.noDamage ? 0 : counterReplyDamage(cBase, bp, ..)`(`cBase=getActiveGun(bp)?.damage ?? 12`) | DE(crit, 'counter') | **銃の種類**※迷い | `noDamage`(刃のパリィ)は量 0 |
| 55 | utils/combatTick.ts:2221 | 突進/気絶パリィの反撃 | `:2217` `counterReplyDamage(counterBase, collPlayer, ..)` | DE(crit, 'counter') | **銃の種類**※迷い | |
| 56 | utils/ghostCounter.ts:294 | 守護霊のカウンター反撃 | `ghostCounterDamage(...)`→`counterReplyDamage(borrowedGunDamage, buildPlayer, ..)` | DE(null, 'ghost', 'counter') | **none(守護霊)** | |
| 57 | utils/heroBlast.ts:45 | 敵の攻撃が英雄に当たる | `amount × HERO_INCOMING_MULT` | DE(null, 'neutral') | **none(敵どうし)** | |
| 58 | utils/heroBlast.ts:114 | 英雄の爆発が敵に当たる | `b.damage × HERO_VS_ENEMY_MULT` | DE(null, 'neutral') | **none(英雄)** | |
| 59 | utils/newGunsTick.ts:163 | 銃の当たりの共通口 `hitEnemy`(塊弾の脈 `:290` と 衛星の接触 `:391`) | 塊: `:319` `gunShotBaseDamage({BLOB_TICK_DAMAGE}, p, gt)` → `:287` `tickDamage × outgoingGunMult`。衛星接触: `:379` `gunShotBaseDamage({SAT_CONTACT_DAMAGE})` → `:390` `× outgoingGunMult`。`outgoingGunMult`=`:140` `skillOutgoingDamageMult × bloodAwaken × sniper × comboMaster` | DE('gun', 'player', killChainSlowOk) | **引数で渡す**: 塊=glauncher / 衛星の接触=shotgun | `hitEnemy` は銃を知らない=呼び口(290/391)がキーを持つ必要。プレイヤー専用(`gunLocked` と `p=st.player`) |
| 60 | utils/phantomTick.ts:808 | 幻影へのカウンター(量 0・体勢だけ削る) | `amount=0` | DE('other','counter') | **none(量0)** | 量が 0 なので積みようがない |
| 61 | utils/playtestDriver.ts:218 | ボット(ヘッドレスの試験走行)の銃の当たり | `damage × critMult × skillOutgoingDamageMult × sniper × comboMaster` | DE('gun'/'other') | **none(ボット=積まない・倍率1)** | MASTERY 末尾 #4: ボットは倍率も 1。`fireWeapon` もここ(`:427`)から呼ぶ |
| 62 | utils/weaponUtils.ts:1258 | ガンブレードの至近モード(弾を作らない近接) | `:1253` `gunShotBaseDamage(shotWeapon, player, meleeGt) × critMult × skillOutgoingDamageMult × skillBloodAwaken` | DE('gun' 判定は `classifyProjectileDamageChannel('handgun', key)`, 'heavy', gpSource='melee') | **handgun** | ガンブレードの category は handgun(`handgun-t3-gunblade`)。プレイヤー専用の `fireWeapon` 内 |

### 1-D. `damageEnemy` を通らず体力を直接減らす所(13 行)

| # | ファイル:行 | 何の当たりか | 威力を決めている式 | 体力を減らす所 | 熟練度キー | 根拠・注意 |
|---|---|---|---|---|---|---|
| 63 | gameStore.ts:11513 | スケボーの着弾バッシュ(覚醒=爆発) | `:11479` `meleeSwingBaseDamage(:11470) × SHIELD_BASH_DAMAGE_MULT × skExMult × (覚醒のみ skillOutgoingDamageMult)`→`:11509` `eDmg`(覚醒は距離減衰) | 直(`nh`)。集計 `recordDamageDealt('other', dealtSum)` `:11537` | **loadout** | スケボー。**近接の素ダメを借りる**。プレイヤー専用(呼び元 `useGameLoop.ts:15551`) |
| 64 | gameStore.ts:12358 | 盾バッシュ(triggerCounter) | `:12337-12338` `meleeDamage × SHIELD_BASH_DAMAGE_MULT × gpDmgScale`→`× 印 × 空中` | 直(`newHealth`)。集計 `:12597` `recordDamageDealt('melee', ..)` | **loadout** | 盾は「最初から最大」で熟練度が付かない・依頼文では「シールドバッシュ=loadout」。**`meleeDamage`=`swingBaseDamage`(`:11871`)×縮地×格闘の足** |
| 65 | gameStore.ts:12419 | 気絶した敵への近接フィニッシュの強個体 3×/ボス 5×(triggerCounter) | `:12381` `resolveStunnedMeleeHit(enemy, meleeExecBase × gpDmgScale, ..)`(`meleeExecBase=:11877 meleeDamage × growthAtkMult`、**outgoing を通らない**)→`:12399` `dmg` | 直 | **`bs ? 'brawler' : 'melee'`** | 格闘装備中は全入力が `bs`(格闘)に変換される(`:11780` 付近)。処刑(即死)側 `:12383-12392` の `killed.push({finisher:true})` は**量を持たない** |
| 66 | gameStore.ts:12479 | 通常の近接スイング(格闘の段・技を含む) | `:12459` `meleeDamage × crit × skillOutgoingDamageMult × skillBloodAwaken × meleeComboMult × gpDmgScale × retMult × scanMult × brProration × meleeAirMult` | 直。集計 `:12597` | **`bs ? 'brawler' : 'melee'`** | **本命の近接口**。`bs`(`BrawlerStrikeOpts`)有=格闘の段・技・秘奥義・被弾反撃(格闘中)。`bs`無=ナイフ等。`retMult`=被弾反撃の倍率。プレイヤー専用 |
| 67 | gameStore.ts:12978 | 分身の攻撃(ボス 5×・気絶中) | `:12973` `meleeExecBase(=meleeSwingBaseDamage `:12918` × growthAtkMult) × BOSS_MELEE_STUN_MULT` | 直(`nh`)。集計 `:13034` `recordDamageDealt('other', ..)`(`!isGhost`) | **shadow-clone**(`isGhost`=none) | **近接の素ダメを借りる**。**守護霊と共用**(`ghostId`/`isGhost`)。幻影の分身は別関数(`phantomShadowCloneStrike` `:13112`=プレイヤーが標的=none) |
| 68 | gameStore.ts:12990 | 分身の攻撃(強個体 3×) | `:12986` `meleeExecBase × ELITE_MELEE_STUN_MULT` | 直(`nh`) | **shadow-clone** | 同上 |
| 69 | gameStore.ts:13003 | 分身の通常の攻撃 | `:12999` `meleeDamage × crit × skillOutgoingDamageMult × meleeComboMult × gpDmgScale × 空中` | 直(`nh`) | **shadow-clone** | 同上 |
| 70 | gameStore.ts:13704 | 刀(一閃)・ボス 5× | `:13699` `katanaExecBase(=KATANA_DAMAGE_BY_LEVEL[lv] × damageMult × strikeMult × growthAtkMult) × gpDmgScale × BOSS_MELEE_STUN_MULT` | 直(`newHealth`)。集計 `:13849` `recordDamageDealt('melee', ..)`(`!isGhost`) | **katana**(`isGhost`=none) | 小烏丸(`murasame`)も同じ関数=katana。**守護霊と共用**(`ghostId`/`isGhost`)。呼び口: `useGameLoop.ts:10615`(オート斬り)・`:13554`(守護霊)・`gameStore.ts:10944`(縮地)・`11975`(被弾反撃)・`14965`(一閃ダッシュ) |
| 71 | gameStore.ts:13729 | 刀・強個体 3× | `:13725` `katanaExecBase × gpDmgScale × ELITE_MELEE_STUN_MULT × heavyScanMult` | 直 | **katana** | 同上 |
| 72 | gameStore.ts:13774 | 刀の通常の当たり(オート斬り/一閃) | `:13754` `baseDamage × damageMult × strikeMult × crit × skillOutgoingDamageMult × skillBloodAwaken × meleeComboMult × gpDmgScale × scan × 空中` | 直 | **katana** | 同上 |
| 73 | gameStore.ts:14074 | 鞭・ボス 5× | `:14069` `whipExecBase(=strikeBase × whipMult × growthAtkMult × gpDmgScale) × BOSS_MELEE_STUN_MULT`。`strikeBase=meleeBase(:13989 近接の素damage・ストライカー/装備を**含まない**) × 縮地` | 直。集計 `:14168` `recordDamageDealt('melee', ..)` | **whip** | **近接武器の damage を借りる**(`meleeWeapon?.damage`)。プレイヤー専用(守護霊は鞭を持たない=未確認) |
| 74 | gameStore.ts:14088 | 鞭・強個体 3× | `:14084` `whipExecBase × ELITE_MELEE_STUN_MULT × heavyScanMult` | 直 | **whip** | 同上 |
| 75 | gameStore.ts:14124 | 鞭の通常の当たり | `:14105` `strikeBase × whipMult × crit × skillOutgoingDamageMult × skillBloodAwaken × meleeComboMult × gpDmgScale × whipScanMult × 空中` | 直 | **whip** | 巻き込み中(`inHurricane`)は `whipMult=1`。同上 |

**中央の2行(上記 DE の合流点)**: `gameStore.ts:17134`(`const newHealth = Math.max(0, enemy.health - eff)`)・`:17252`(`health: newHealth` を敵配列へ書く)。ここに `appliedDamage = eff`(`:17133`)があり、`recordDamageDealt(...)` が `:17340`。**熟練度の「積む量」を取るならこの `appliedDamage`(紅き夜の半減後・幻影ゲート後・致命後)が「実際に通った量」**。

**即死(量を持たない)の行**(積む量が定まらない): triggerCounter の処刑 `gameStore.ts:12383-12392`(`killed.push({finisher:true})`)・刀 `13736-13742`・鞭 `14092` 付近・分身の処刑 `12965` 付近・damageEnemy(…, `health+1`) の 4 行(#28 ワイヤー・#34 リーパー・#44 守護霊)。

---

## 2. `gunShotBaseDamage(` の全呼び口(10 件)と、同式のインライン複製(4 件)

| # | ファイル:行 | 何のための呼び出し | 銃の種類は取れるか | 守護霊/本人 |
|---|---|---|---|---|
| G1 | weaponUtils.ts:1345 | `fireWeapon` の `shotDamage`(通常の撃ち・全 5 種の銃・全弾に `damage` として載る) | `weapon.category`(`shotWeapon` は dualRange/cycle/focus/gunblade のモード別スタッツ) | プレイヤー本人(守護霊は G10) |
| G2 | weaponUtils.ts:1253 | ガンブレード至近モードの1打(弾を作らない) | handgun | 本人 |
| G3 | weaponUtils.ts:1602 | `buildGhostGunShots`(守護霊の銃弾) | `effGun.category` | **守護霊**(`build.player`=疑似Player) |
| G4 | useGameLoop.ts:13334 | 守護霊の火炎放射器の炎1回(`ghostFlamerPulse.damage`) | shotgun | **守護霊**(`ghostOwner`) |
| G5 | useGameLoop.ts:15083 | アイレーザー(rifle)の1パルス(溜め完了で `eyeLaserPulseDamage` に確定) | rifle | 本人(`elPlayer`) |
| G6 | useGameLoop.ts:15262 | 火炎放射器(shotgun)の1パルス | shotgun | 本人(`flPlayer`) |
| G7 | gameStore.ts:16085 | 錬金砲の石の起爆(`{damage: baseDamage, magazine}` を作って渡す=銃を渡さない) | glauncher(`weapon.key===ALCHEMY_WEAPON_KEY` 確認済み) | 本人 |
| G8 | newGunsTick.ts:319 | グラヴィティガン(塊弾)の脈ダメ(`BLOB_TICK_DAMAGE`) | glauncher | 本人 |
| G9 | newGunsTick.ts:379 | 呪銃(衛星)の接触ダメ(`SAT_CONTACT_DAMAGE`・`magazine:undefined`) | shotgun | 本人 |
| G10 | newGunsTick.ts:414 | 呪銃(衛星)の放たれた弾の `damage`(`SAT_SHOT_DAMAGE`) | shotgun | 本人 |
| (複製1) | gameStore.ts:15866 | PHILL銃(`firePhillShot`)の `phillDamage` | phill | 本人 |
| (複製2) | gameStore.ts:15957 | レールガン(`fireRailgunShot`)の `railgunDamage` | rifle | 本人 |
| (複製3) | gameStore.ts:16038 | シグナルランチャー(`fireSignalLauncher`)の `strikeDamage` | glauncher | 本人 |
| (複製4) | weaponUtils.ts:1502 | 援護射撃の弾(`buildSupportSniperShot`)。**`CATALOG['rifle-t1'].damage`(=30)基準**で `CATALOG['rifle-t2']` の飛翔特性 | キーは 'rifle-t2'(=rifle と衝突) | 本人/**守護霊**(`ssSubject`)/**幻影**(`ssNpc.hostile`) |
| (別) | 反撃6か所 | `getActiveGun(cp)?.damage ?? 12`(素の `weapon.damage`・倍率を掛けず `counterReplyDamage` で `skillCritMult/outgoing/血の覚醒/装備` を掛ける) | `getActiveGun(cp)?.category`(銃が無ければ 12 固定=undefined) | 本人(守護霊は `ghostCounterDamage`) |

この 10 件+複製 4 件+反撃式が、「銃の素ダメ」の全部。**`counterReplyDamage` は銃の `category` を受け取らない**(`gameStore.ts:4163`)。

---

## 3. `meleeSwingBaseDamage(` の全呼び口(10 件)と近接式のインライン複製(4 件)

本体は `gameStore.ts:4154`(`(melee?.damage ?? 6) × strikerMeleeMult(player) × (equipBonus.damageMult ?? 1)`。`growthAtkMult`/`skillOutgoingDamageMult` は**含まない**)。

| # | ファイル:行 | 何のための呼び出し | 熟練度キー(その結果が使われる先) |
|---|---|---|---|
| M1 | gameStore.ts:11871 | `triggerCounter` の `swingBaseDamage`。①`meleeDamage`(`:11872`)→通常の近接/盾バッシュ/処刑(#64-66) ②ドローンブーメランへ引数(`:11893`)③金環・地雷・フレア・ジャンクは受け取らない ④小物を壊す `×2.5`(`:11993/12049/12877`・敵ダメではない) ⑤`damageHostilePlacements`(`:12172`・幻影の設置物) ⑥`applyMeleeFinishSkillSpread`(`:12835`=#33-35)⑦`applyRescueSignalProc`(`:12837`=#39) | 通常=`bs?'brawler':'melee'`。借り先: ドローン=drone-boomerang・リーパー/処刑の衝撃波/救難信号=loadout |
| M2 | gameStore.ts:5900 | 格闘の気功の爆発(#32) | brawler |
| M3 | gameStore.ts:4496 | 掌底で小物(卵)を壊す(`brawlerPalmBreakProps`・**敵ダメではない**) | 積む対象なし |
| M4 | gameStore.ts:7812 | スラッシャー追撃(#36) | loadout(迷い) |
| M5 | gameStore.ts:11470 | スケボー着弾バッシュ(#63) | loadout |
| M6 | gameStore.ts:12918 | 分身の攻撃(#67-69)。`shadowCloneStrike`・**守護霊と共用**(`ghostId`) | shadow-clone / ghost=none |
| M7 | gameStore.ts:13124 | 幻影の分身(`phantomShadowCloneStrike`・標的はプレイヤー) | none(敵側) |
| M8 | gameStore.ts:15176 | 守護霊のフィニッシュ(#45) | none |
| M9 | gameStore.ts:15240 | 守護霊のスイングで出るブーメランの接触ダメ(`fireGhostMeleeSwingSubs`) | none |
| M10 | useGameLoop.ts:13484 | 守護霊の近接スイング(#6) | none |
| (複製) | gameStore.ts:13989 | 鞭の `meleeBase`(ストライカー・装備**無し**) | whip |
| (複製) | useGameLoop.ts:14656 | スキル防衛(`poi-guard`)の周回パルスの基準 | loadout |
| (複製) | useGameLoop.ts:16613 | ワイヤーアンカーの `meleeDmg`(`× skillOutgoingDamageMult(wp)` 込み) | wire-anchor |
| (複製) | gameStore.ts:21296 | パニッシャー(装備倍率なし) | loadout |

---

## 4. 共通の光線の口 `applyBeamPulse`(`useGameLoop.ts:14693-14738`)の呼び口(4 件)

口の中で `outMult = skillOutgoingDamageMult(hitActor)`(`:14710`)を掛けて `damageEnemy(.., 'dot', hateSource)`(`:14717`)を呼ぶ。引数に武器の識別は**無い**(`burstColor` と `xpIdPrefix` だけ)=熟練度のキーを渡す引数を足す必要がある。

| # | 呼び口 | 威力を作って渡している所 | 熟練度キー | 本人/守護霊 |
|---|---|---|---|---|
| B1 | useGameLoop.ts:14793 金環 | `GOLD_RING_DAMAGE_BY_LEVEL[lvl]`(`utils/goldRing.ts:22`・[0,6,8,10])を `gameStore.ts:7425` `dmgPerPulse`→`ring.damagePerPulse`(`:7446`)→`beam.damage`(`useGameLoop.ts:14774`)。金環生成は近接スイング相乗り(`fireGoldRingOnSwing` `gameStore.ts:7403`) | **gold-ring** | 共用: `ring.ownerGhostId`(守護霊=none) |
| B2 | useGameLoop.ts:15005 氷槍ライフルの床 | `iceLanceFloorPulseDamage(p0.damage)`(`utils/iceLanceFloor.ts:34`)。`p0.damage`=`fireWeapon` の `gunShotBaseDamage`(G1)。床生成 `useGameLoop.ts:10540-10600` | **rifle** | 本人のみ(`ownerGhostId`引数 undefined) |
| B3 | useGameLoop.ts:15184 アイレーザー | `elGun.eyeLaserPulseDamage`(溜め完了で G5 が確定。`:15083`→`:15102`) | **rifle** | 本人のみ |
| B4 | useGameLoop.ts:15213(`fireFlamerPulse` の中) 火炎放射器 | 引数 `pulseDamage`=G6(`:15262`・本人)または G4(`:13334`・守護霊の `ghostFlamerPulse`)。燃焼 DoT の付与は同関数 `:15219`(`flamerBurnPatch`=#37) | **shotgun**(守護霊=none) | 共用: `ownerGhostId` |

---

## 5. 弾(Projectile)を作る所と `weaponKey`(プレイヤー側+共用)

弾の命中は `useGameLoop.ts:15741`(式)/`:15770`(DE・#20)の 1 本を通る(ボットは `playtestDriver.ts:218`)。**熟練度のキーを弾に持たせる場合、下の「衝突」列が要る**(`weaponKey` だけでは見分けられない行)。

| 作る所 | `weaponKey` | 何の弾 | 熟練度キー | 衝突/注意 |
|---|---|---|---|---|
| weaponUtils.ts:1371 `fireWeapon` | `weapon.key`(全銃 36 + ユニーク) | プレイヤーの銃弾(通常/ファイアシューターの爆発弾 `:1403`/ラストマガジン延焼 等) | `category`(handgun/shotgun/rifle/glauncher) | **爆発弾(ファイアシューター・スキル)は同じ `weaponKey` のまま `explodeOnHit`**(#23) |
| gameStore.ts:15884, 15905 `firePhillShot` | 'phill-revolver' | PHILL弾 | **phill** | 素ダメは複製式(§2 複製1) |
| gameStore.ts:15974, 15996 `fireRailgunShot` | 'rifle-t3-railgun' | レールガン | **rifle** | 複製2 |
| newGunsTick.ts:424 | 'shotgun-t2-satellite' | 呪銃の放たれた弾 | **shotgun** | G10 |
| weaponUtils.ts:1513 `buildSupportSniperShot` | **'rifle-t2'** | 援護射撃(サブ) | **support-sniper** | **rifle の直接銃キーと衝突**(`isDirectGunWeaponKey('rifle-t2')`=真→貫通・クリ減衰等の扱いが直接銃と同じになる)。守護霊が呼んだ援護射撃も同じキーで、弾に守護霊の印が**無い**(幻影は `ownerPhantom`/`hostile` 有) |
| weaponUtils.ts:1557 `buildJunkWeaponPellets` | 'sub-junk-weapon' | ジャンクウェポン(散弾5発・Lv固定ダメ) | **junk-weapon** | 守護霊は `ownerGhost:true`(`gameStore.ts:7516`) |
| gameStore.ts:16537 | 'sub-homing' | ホーミング弾(+着弾の小爆発 #23) | **homing** | 守護霊は `ownerGhost` |
| useGameLoop.ts:14106 | 'sub-turret' | 自動タレットの弾(`weaponType:'handgun'`) | **turret** | 守護霊は `ownerGhost`・幻影は `hostile` |
| useGameLoop.ts:14092 | **'glauncher-t1'**(`GRENADE_WEAPON_KEY`) | タレットLv3の10%ランチャー弾(`TURRET_LAUNCHER_DAMAGE=44`) | **turret** | **グレネードランチャーの直接銃キーと衝突**(#22 の着弾爆発に乗る) |
| useGameLoop.ts:5208 | **'glauncher-t1'** | スキル「爆撃」(`poi-bombing`) | **loadout** | 同上の衝突 |
| useGameLoop.ts:10777, 14246, 14413, 16148 / utils/bomberScatter.ts:45 | 'sub-heavy-grenade' | 手榴弾(10777)とスキル「ボマー」の子手榴弾(14246/14413/16148/bomberScatter・`bomberSpawned:true`) | heavy-grenade / loadout(ボマー子) | **同じ `weaponKey`**。区別子は `bomberSpawned` のみ。爆発は #9 |
| useGameLoop.ts:10819 | 'sub-marksman-trap' | トラップ | none(最初から最大) | |
| useGameLoop.ts:11303 | 'sub-decoy' | デコイ(`damage` は Lv3 のみ爆発量) | decoy | #8 |
| useGameLoop.ts:11383 | 'sub-shield' | シールド(置物) | none(最初から最大) | |
| useGameLoop.ts:11447 | 'sub-turret'(`weaponType:'turret'`) | 置かれたタレット本体 | turret | #7 |
| useGameLoop.ts:11876 | 'sub-fire-knife' | 発火ナイフ | fire-knife | #13/#14 |
| gameStore.ts:7374 | 'sub-drone-boomerang' | ドローンブーメラン | drone-boomerang | #15/#16 |
| useGameLoop.ts:5227 | 'poi-guard' | スキル「防衛」の周回ブーメラン | loadout | #16 |
| gameStore.ts:11460 | 'skater' | 降車で投げるスケボー(`damage:0`・当たりは `skaterBoardHit`) | loadout | #63 |
| useGameLoop.ts:16264 | 'skill-ice-shot' | スキル「アイスショット」覚醒の氷片 | loadout | |
| useGameLoop.ts:16189 | **親の `weaponKey`** | スキル「跳弾」の弾(`damage = projectile.damage × 0.5..0.7`) | (親の銃 / loadout)※迷い | 親の `damage` に銃の熟練度が**既に焼かれている**と二重になる |
| useGameLoop.ts:~16213 `...projectile` | 親の `weaponKey` | スキル「エコーショット」の複製弾(`echoed`) | 同上※迷い | 同上 |
| (敵弾の打ち返し) `gameStore.ts:22361 reflectProjectile` / `combatTick.ts:927-961` | 元の敵弾のまま(undefined)か 'ghost-reflect' | カウンターで打ち返した弾(×`REFLECT_DAMAGE_MULTIPLIER=10`・ボムカウンターは `explodeOnHit` を付ける) | **loadout**(本人)/ none('ghost-reflect') | |
| gameStore.ts:24640, 24790, 25397 | 'escort' | 護衛の軍人の弾 | none | |
| weaponUtils.ts:1614 | 'ghost-gun' | 守護霊の銃弾 | none | |
| utils/idolTick.ts:899 | 'idol-heavy-grenade' | 偶像の手榴弾(敵対) | none | |

**弾ヒット(#20)のキー対応表(案)**
`ghost-gun`/`ghost-reflect`/`escort` → none。`sub-turret`→turret。`sub-junk-weapon`→junk-weapon。`sub-homing`→homing。`skill-ice-shot`/反射弾(`projectile.reflected`)→loadout。直接銃キー(`isDirectGunWeaponKey`)→`category`。ただし**'rifle-t2'(援護射撃)と 'glauncher-t1'(タレットのランチャー弾・爆撃)は上の衝突があるため、弾に `masteryKey` を足さないと決まらない**(MASTERY §5-3 の「弾に `masteryKey` の欄を足す」は妥当)。

---

## 6. キーを決めきれなかった行(自分で決めつけない)

| 番号 | 行 | 迷った理由 |
|---|---|---|
| 1 | gameStore.ts:13353(#37 燃焼DoT) | 燃焼を付ける側が 6 系統(モロトフ=molotov・延焼弾=loadout・延焼の感染・火炎放射器=shotgun・気功=brawler・守護霊の炎)。敵の状態は `burnDpsTick`・`burnUntil`・`burnByGhost` しか持たず、出処のキーが残らない。キーを決めるには敵に出処の欄を足すか、付ける所で積む(=1行では決まらない)必要がある |
| 2 | useGameLoop.ts:15770(#20 弾の直撃) | ①'rifle-t2'(援護射撃)と 'glauncher-t1'(タレットのランチャー弾・爆撃スキル)が直接銃キーと衝突 ②守護霊が呼んだ援護射撃の弾に守護霊の印が無い(turret/junk/homing は `ownerGhost` 有・判定には使わない規約) ③跳弾/エコー複製は親の `weaponKey` を継ぐので、親の銃の熟練度として積むか loadout にするか未定 |
| 3 | useGameLoop.ts:16033(#22 グレネード系の着弾スプラッシュ) | 同じ行をタレットのランチャー弾(turret か)・スキル爆撃(loadout)も通る(`weaponKey='glauncher-t1'` の借用) |
| 4 | useGameLoop.ts:16094(#23 explodeOnHit) | 出どころ 3 つ(ホーミング=homing・ファイアシューター=loadout か銃の種類か・ボムカウンター=loadout)が同じ行。ファイアシューターの弾は銃の `damage × 0.3`(`weaponUtils.ts:1404`)で、**銃の熟練度が焼かれた後の `dmg`** をそのまま爆発に使うため二重掛けの恐れ |
| 5 | useGameLoop.ts:14297(#9 手榴弾の爆発) | スキル「ボマー」の子手榴弾(loadout)が同じ行・同じ `weaponKey`。区別子 `bomberSpawned` はあるが、MASTERY §1 はボマーの扱いを書いていない |
| 6 | useGameLoop.ts:7168・7269 / combatTick.ts:705・2221 / bountyTick.ts:582 / angelBossTick.ts:302(カウンター反撃 6 行) | MASTERY §5-3 は「その時の銃の種類」、末尾 #6 の推薦は「loadout の平均」。`counterReplyDamage` は `category` を受け取らない。銃が無い時の `?? 12` 固定の扱いも未定 |
| 7 | gameStore.ts:13592(#40 救急鞄の爆発) | MASTERY §1(28 行)は「掛けない」、依頼文は loadout |
| 8 | gameStore.ts:13496(#39 救難信号の援軍) | コードの注釈は「本人の攻撃ではない」(チャネル 'dot')、MASTERY §2 は「本人の当たりだけ積む」。スキルの援軍をどちらと読むか |
| 9 | gameStore.ts:14635(#42 錬金召喚/使役ペット) | `attackHits` に出処の印が無い。通常個体・レア死神(alchemy)とスキル「使役」のペット(`persistent:true`・loadout か)が同じ行 |
| 10 | gameStore.ts:7859(#36 スラッシャー追撃) | 依頼文は「スキルの追撃=loadout」。ただし式は `meleeSwingBaseDamage` を使う(近接の熟練度と見分けて loadout にするのか、近接に寄せるのか) |
| 11 | useGameLoop.ts:14665(#16 ドローンの停止パルス/スキル防衛) | 同じ行に drone-boomerang と(スキル防衛=)loadout。区別子は `boom.weaponKey === 'poi-guard'` |

決めきれなかったのは **11 項目(行数にすると 17 行)**。

---

## 7. 実装する時に効きそうな事実(キー判断以外・簡潔に)

- 「本人かどうか」の見分け方が行ごとにバラバラ: `isGhost`(刀・分身)・`ghostId`/`ghostId !== undefined`(ワイヤー・鞭なし)・`ownerGhostId`(光線・地雷・金環・援護射撃)・`ownerGhost`(弾/置物の視覚専用旗)・`hateSource === 'ghost'`(DE の引数)・`isGhostShot`/`isEscortShot`(弾ヒット)・`player.pseudoActor`(疑似Player)。**積む側は `hateSource==='player'` かつ `damageChannel !== null` で絞る手もあるが、タレット/手榴弾/発火ナイフ/デコイの爆風は守護霊所有でも hate='player' で通っている**(#7,#8,#9,#13,#14)。
- 倍率を `gunShotBaseDamage` の中で掛けると、反撃式・PHILL/レール/シグナル/援護射撃の 4 複製には効かない。`meleeSwingBaseDamage` の中で掛けると、鞭・ワイヤー・防衛・パニッシャー(4 複製)には効かず、ドローン・スケボー・気功・分身・スラッシャー・リーパー波及・救難信号・小物壊しにも乗る。
- 「outgoing 無し」の行(#7 #8 #10 #14 #18 #19 #21 #22(元値)#23(元値)#33 #35 #38 #39 #47 #48)は、`skillOutgoingDamageMult` の隣に挿す方式では漏れる(熟練度を足す場所が別)。

# 判定と結び付いた「形」の絵の全数台帳(段階4「形を持つもの」の入力)

- 用途: `research/PERSPECTIVE_PROJECTION.md` §3-2 の段階4(赤い予告・攻撃範囲・射程の円・判定を持つ床・静的な床の印・水たまり・光だまり・床のひび)を、地面と同じ投影で描き直す時の**漏れ止め**。
- 合格条件: **漏れゼロ**。この台帳を見ない監査役がコードから数え直して突き合わせる前提で、**数え方(grep の式・入口の一覧)を §1・§2 に残す**。
- 対象のコード: `claude/chat-context-continuity-saxlH` の `f2bd4f8`(v0.25.5748)。**行番号はこの版の値**(版が進むとずれる。名札と関数名で引き直すこと)。
- **取り直しの記録(v0.25.5747)**: 初版は `155a300`(v0.25.5741)で書いた。行番号は `git diff -U0 155a300 6227427` の差分の区切りで旧い行から新しい行へ写して全部取り直した(変わっていない行は厳密に写る)。v0.25.5743(予告の直し=`research/TELEGRAPH_FIXES.md`)で書き換わった所(突進の線・ランス・凝視・車輪・懲罰狙撃・手榴弾・地雷・ランタン火・ウリ)は今のコードを読んで取り直し、その版で足された予告(A21〜A23・D06b・E02b・E12b)と、備考の事実の変化(N01・N05・N06・N12・I05・E05b ほか)を反映した。§6-3 の本文は 5741 の時点の記録(直した物は「直した」と書き足した)。
- **2回目の取り直し(v0.25.5748)**: 行番号を `git diff -U0 6227427 f2bd4f8` で同じ方法で写した。卵の起爆の点滅(A21)・表外の図形4つ(§6-4)・K15・「確かめた場面」の欄(§3 の各表の右端・場面の名札は §3-0)を足した。
- 書いた人は**読んだだけ**(コードは1行も変えていない)。

## 0. 略号

| 略号 | 正式 |
|---|---|
| `pS:` | `src/pixi/pixiScene.ts` |
| `gS:` | `src/store/gameStore.ts` |
| `uGL:` | `src/hooks/useGameLoop.ts` |
| `cT:` | `src/utils/combatTick.ts` |
| `aBT:` | `src/utils/angelBossTick.ts` |
| `bT:` | `src/utils/bountyTick.ts` |
| `iT:` | `src/utils/idolTick.ts` |
| 「爆風経由」 | 積む側が `pumpkinBlasts` へ1件積み、`cT:287 applyPumpkinBlastDamage` が当てる(円=中心距離 ≤ 半径+自機半身14px・帯=`capsule`・扇=`fan`) |
| 「遅延キュー」 | `Enemy.giantDelayedHits`(`types/game.ts:1375`)。積む側→`gS:20742` が `fireAt` で `pumpkinBlasts` へ書き写す→爆風経由 |

### 層の略号

| 略号 | 実体 | 置き場所 |
|---|---|---|
| tele | 敵ごとの `view.tele`(Graphics) | **敵の入れ物の子**(`actorLayer`・`pS:8565-8569`)。焼き素材(`view.rings`/`bands`/`bandSlices`/`clawMarks`/`shockwaves`/`spikeThrust`/`burstFrag`/`dashWind`)も同じ入れ物の中(`pS:37160`・`37176` の `addChildAt`) |
| oT | 敵ごとの `view.overlayTop` | 同上(入れ物の最前面) |
| pT | `pumpkinTelegraph` | `groundLayer`(`pS:6757`) |
| mM | `mobMeteorGfx` | `groundLayer`(`pS:6758`・pT の直上) |
| cr | `crawlerTelegraph` | `groundLayer`(`pS:6759`) |
| skH | `skadiHazardGfx` | **`effectLayer`**(`pS:6846`) |
| gb | `graveBandGfx` | `groundLayer`(`pS:19870`) |
| ffl | `phantomFlamerGfx` | **`effectLayer`**(`pS:20576`) |
| acS | `acrasielSpearGfx` | `groundLayer`(`pS:21036`) |
| lib | `libArrowGroundGfx` | `groundLayer`(`pS:21075`) |
| ast | `astroGroundGfx` | `groundLayer`(`pS:21156`) |
| bf | `bossFireGfx`(加算) | `groundLayer`(`pS:21991`) |
| sm | `sensorMineGfx` | `groundLayer`(`pS:22063`) |
| wr | `wraithTeleGfx` | `groundLayer`(`pS:42559`) |
| egg | `eggArmBlinkGfx`(A21・v0.25.5748。旧 `eggTeleGfx` は社長指示で撤去)・型抜き `eggArmBlinkMask` | `groundLayer`(`pS:16493` の `if (!g.parent)`) |
| tur | `turretTeleGfx`(v0.25.5743) | `groundLayer`(`pS:34406` の `if (!g.parent)`) |
| pj | 弾ごとの Graphics(`drawProjectile`) | `frontObjectLayer` |
| pfx | 主人公の `playerFx`(Graphics・輪の Sprite `counterReachRing` は同じ親の子) | `effectLayer`(`pS:6937`・PERSPECTIVE_PROJECTION.md §3-7 の監査で足した略号) |
| ngf | `NewGunsFx` の `fanGfx` | `groundLayer`(`newGunsFx.ts:96`・同上) |
| G | `groundLayer` に直に並ぶ床の Graphics 群(`pS:6742-6770`: arena/questTrigger/return/baseSites/castleFightRing/tutorialBounds/exBarrier/hospital/armory/police/shrine/hunterVision ほか) | `groundLayer` |

### 流星の位相の略号(欄11)

| 略号 | 実体 | 備考 |
|---|---|---|
| 円窓 | `drawSweepCircleFill`(`pS:36583`)/`drawSweepSectorFill`(`pS:36979`)→ `utils/circleSweep.ts` の `circleSweepBand` | 外周→中心へ流れ、`prog=1` で消え切る。`prog` は**呼び出し側が自前で計算**(多くは `1 - 残り/溜めの総時間`) |
| 帯窓 | `drawSweepBand`(`pS:37025`)/`bandSweepSliceAlpha`/`bandSweepCenter` → `utils/bandSweep.ts` | 始点→終点へ窓が流れる。既定ON(`?bsweep=0` で下の「流星」へ戻る) |
| 流星 | `meteorPhase`(`utils/telegraphStyle.ts:105`・`PixiScene.meteorPhase` は委譲) | 線(`dashLineTick` `pS:33576`/`drawAngelDashLine` `pS:33418`)と、帯の縁取り焼き素材(`drawTelegraphBand` `pS:37189`)・雑魚/ボスの噛みの線 |
| 自前 | 上の3つを通らない独自の進み方 | 個別に備考へ |
| 濃 | 溜めが進むほど濃く/太くなるだけ(流星ではない) | 掟①の違反の疑い(備考に書く) |
| 常 | 一定(常設の判定) | 流星にしない意図があるもの |
| — | 位相を持たない(判定なしの印・床) | |

**頂点ごとの投影(欄12)**: 形を持つ物(円・帯・扇・線・多角形)は全部「要」。円は「中心+半径」ではなく**周の頂点を投影**する必要がある(地面の円は投影すると楕円・台形に歪むため)。

---

## 1. 入口の一覧(技の側から数えた物)

### 1-1. 数え方(grep の式)

```sh
# (a) aiPhase / bossState の正本=types/game.ts の和集合(コメント行を除いて文字列リテラルを抜く)
python3 - <<'EOF'
import re
src=open('src/types/game.ts').read()
for name in ['aiPhase','bossState']:
    i=src.index(f'  {name}?:'); j=src.index(';',i)
    body=re.sub(r'//[^\n]*','',src[i:j])
    u=re.findall(r"'([a-z0-9-]+)'",body); print(name,len(u),len(set(u)))
EOF
# (b) 実装で使われている州(和集合との突き合わせ用)
grep -rhoE "(bossState|aiPhase|bs|bs2|gph|ph)\s*(:|=|===|!==)\s*'[a-z0-9-]+'" src/store src/utils src/hooks src/pixi --include=*.ts | sed -E "s/.*'([a-z0-9-]+)'/\1/" | sort -u
# (c) 命中を積む所(爆風経由): moveKey の文字列
grep -rnoE "moveKey: ?['\`][^'\`]+['\`]" src --include=*.ts | grep -v "\.test\.ts"
# (d) 命中を積む所(全部): pumpkinBlasts を書く所
grep -rn "pumpkinBlasts" src --include=*.ts | grep -v "\.test\.ts" | grep -v "^src/pixi"
# (e) 天使・賞金首・偶像の直接当て
grep -n "damagePlayer(\|pumpkinBlasts: \[\|pushBlast(\|hitCapsule(" src/utils/angelBossTick.ts src/utils/bountyTick.ts src/utils/idolTick.ts src/utils/heroTick.ts src/utils/phantomBrawlerTick.ts
# (f) 遅れて当たる・設置して当たる物の器(Enemy と GameState の配列)
grep -n "fireAt\|landAt\|hitAt\|Queue" src/types/game.ts
grep -n "^  [a-zA-Z]*: .*\[\];" src/store/gameStore.ts   # GameState の配列(9960行〜)
```

### 1-2. 件数

| 入口 | 件数 | 出し方 |
|---|---|---|
| `aiPhase` の州 | **97**(重複なし) | (a)。うち城ボス `g-*` が **61**、それ以外 **36** |
| `bossState` の州 | **257 個のリテラル・256 種**(`'burst'` が2回=ミーミル族の弾3連とアクラシエルの爆発で同名) | (a) |
| 和集合 | **352 種**(`'dash-recover'` が両方にある) | (a) |
| 城ボス `g-*` の技 | **20 技**(bite/bolt/boon/dash/dive/glide/jump/nihil/nova/quad/reach/slam/stomp/sweep/sweepbeam/tailslam/talon/trijump/trishot/wing)・**61 州** | `grep '^g-'` |
| 溜めの州(語尾 `-windup`) | bossState **76**・aiPhase **23** | `grep -c -- '-windup$'` |
| `chaffMove`(雑魚の技の種類) | **4**(`bat-grab`/`skel-bite`/`zombie-double`/`lich-blink`・`types/game.ts:845`) | 目視 |
| `heroMove`(英雄の技) | **9**(overhead/combo/upper/sweep/rear/leap/charge/tackle/leapcharge・`utils/heroScript.ts:107`)。州は `hero-*` で共通、形は `heroShape`(円/扇/帯) | 目視 |
| 爆風経由の `moveKey` リテラル | **29 種**(行は §3 の各行の欄9) | (c)。変数で渡す所(フィルの `pushBlast`・英雄の `moveKeyFor`・宇宙飛行士の `` `astro-${kind}` ``)は別に数えた |
| 予約で積む器 | **Enemy 側 7**: `giantDelayedHits`(城ボスの遅延起爆+**旗手の矢の雨も同じ器**=`moveKey 'liberty-arrow'`)・`gReachShots`・`gTriJumpPts`・`phillLightrainQueue`・`jormRainLobs`・`jormFreezeRings`・`lanceLanterns`(ランスの追尾ランタン)。**GameState 側 11**: `pumpkinBlasts`(即時の受け皿)・`skadiIceMarkers`・`skadiIceBlades`(氷刃・骨刃・羽根・墓石を共用)・`bossFires`・`acrasielSpears`・`astroThrows`・`libertyOrphanArrows`(旗手が死んだ後の矢)・`groundFires`・`iceLanceFloors`・`bloodSpikes`・`sensorMines`(最後の4つはプレイヤー側) | (f) |
| 噛みつき(接触の代わり) | **1 経路で全敵**: `biteAt` を持つ非免除の敵全部(免除=死神/使者/幻影・`utils/enemyUtils.ts:397`)。尺の表は `utils/enemyBite.ts` の `BITE_BY_TYPE`(zombie/lich/skeleton/pumpkin/driller/logger)+`BITE_BY_MOVE`+`BITE_BY_PHASE` | `enemyBite.ts:80-365` |

### 1-3. 州のうち「形を持たない」と判断して表に行を作らなかった物

台帳の行は**絵の単位**(1行=1つの予告や形の絵)なので、州は行に畳まれる。行を持たない州は次のどれか(全部、下の §4「予告なし」か §3 の該当行の備考に名前を出してある):

- **硬直**(語尾 `-recover`・`laser-broken`・`mk-repose`・`idol-rest`・`hero-recover` 等): 技は終わっている。ただしスリィエル/城ボスの「完了ラッチ」は硬直に入った後も**赤が尾を引く**(§3 の E16〜E18・B 系の備考)。
- **移動だけ**(`chase`/`return`/`backstep`/`orbit-step`/`counter-leap`/`backroll`/`mk-backroll`/`bb-backroll`/`br-roll`/`idol-roll`/`idol-leap-crouch`/`idol-leap`/`warp-windup`/`warp-out`/`ring-move-windup`/`w-retreat`/`z-retreat`/`s-retreat`/`b-approach`/`b-orbit`/`b-release`/`z-wait`/`z-lunge-in`/`s-crouch`/`s-arc`(ただし `s-arc` の頭から噛みの線が出る=A01)/`hero-idle`/`hero-turn`/`hero-roar`/`hero-flinch`/`hero-ascend`/`phill-summon-*`)。
- **弾を撃つだけ**(弾は全ボス共通の赤い二重丸=弾そのものが危険の絵。地面には形を出さない)→ §4 の「弾」。

---

## 2. 描く側の一覧(絵の側から数えた物)

### 2-1. 数え方(grep の式)

```sh
# (g) 予告の描画関数の呼び出しを、囲んでいるメソッドごとに数える(scan.py は「行頭2字下げの メソッド名(」で区切る)
python3 scan.py src/pixi/pixiScene.ts '\b(drawSweepCircleFill|drawAngelZoneCapsule|drawTelegraphRing|drawTelegraphBand|drawSweepBand|drawSweepSectorFill|drawShockwave|drawShockwaveCut|drawSweepRectFill|drawSlashArc|drawHeroTelegraph|meteorPhase|zoneCapsuleTick|thorNihilCircleTick|drawMobBiteMeteor|bossBiteTick|mobMeteorTick|drawGazeFlash|drawAngelBeamLine|drawShieldedAngelBeam|drawWarpCircle|drawJormRain|drawSkadiLattice|syncPumpkinTelegraph|syncWraithTelegraph|drawPhillRingtoss|drawPhillSkylightColumn|latchGroundCrack|drawGroundCrack|drawBloodPool|dashLineTick|drawAngelDashLine)\('
# (h) 予告の色(赤・紫)を直に塗っている所(ヘルパを通らない予告を拾う)
python3 scan.py src/pixi/pixiScene.ts '0xff2a2a|0xff3b3b|0x9333ea|0xc084fc|0xdc2626|0xef4444|0xff0000|0xe11d48'
#   → 221 行。0xa855f7(紫の芯)も別に grep した
# (i) drawEnemy の中の分岐の骨組み(州の比較と描画の呼び出しだけを並べる)
awk 'NR>=27254 && NR<=32567 { s=$0; if (s ~ /^\s*\/\//) next; if (s ~ /(if \(|else if).*(\x27[a-z][a-z0-9-]*\x27)/ || s ~ /(drawSweep|drawTelegraph|drawAngel|zoneCapsuleTick|dashLineTick|meteorPhase|drawShock|drawSlashArc|drawWarp|drawGaze|drawJorm|drawSkadi|thorNihil|latchGround|drawBloodPool|drawHero|drawPhill|drawMaiko|drawAcrasiel|0xff2a2a|0x9333ea|0xa855f7)/) print NR": "s}' src/pixi/pixiScene.ts
# (j) 床の Graphics の置き場所
sed -n 6737,6777p src/pixi/pixiScene.ts
grep -n "if (!g.parent)\|g.parent !== this.L" src/pixi/pixiScene.ts
```

`scan.py`(scratchpad に置いた使い捨て・15行)は「直前のメソッド宣言(`^  (private )?名前(`)」を見出しにして、各行の一致を数えるだけの物。

### 2-2. 予告を描いている関数(色の grep (h) が当たった見出し=38。うち `untrackBakedTexture`・`hasFullWarlordSet`・`beamPtsToXY` の3つは関数の外の定数行が直前の見出しに付いただけ)

`syncLabCrawler` / `syncPumpkinTelegraph` / `syncSkadiHazards` / `syncPhantomFlamer` / `drawAcrasielPattern` / `syncAcrasielSpears` / `syncLibertyArrows` / `syncAstroThrowsBody` / `syncBossFires` / `syncSensorMines` / **`drawEnemy`(`pS:25759-32553`。色を直に書いている行=0xff2a2a 49・0xff3b3b 50・0x9333ea 12・0xc084fc 13・紫の芯 0xa855f7 10。v0.25.5748 で数え直し)** / `drawAngelZoneCapsule` / `zoneCapsuleTick` / `drawAngelDashLine` / `thorNihilCircleTick` / `dashLineTick` / `drawSkadiLattice` / `drawSweepBand` / `drawProjectile` / `drawHeroTelegraph` / `syncWraithTelegraph` / `drawPhillLightrainCircles` / `drawMaikoState` / `flamerSprayTextures`(幻影の炎の絵)/(赤系だが予告ではない: `syncGroundReflections`・`drawShadowSlot`(デバッグ)・`syncLockIndicators`(照準)・`syncBloodSpikes`(プレイヤーの床=I06)・`spawnKillFxBlood`(血)・`drawBoltFx`・`syncArena`(柵=J01)・`drawDrainSprite`・`syncArrows`(画面外の矢印)・`syncGravityWells`(I07)・`constructor`・定数行)

ヘルパ経由だけで色を持たない予告(色を引数で受ける): `drawTelegraphRing`(`pS:37147`)・`drawTelegraphBand`(`pS:37189`)・`drawAngelBeamLine`(`pS:33836`)・`drawShieldedAngelBeam`(`pS:33795`)・`drawSweepRectFill`(`pS:36951`)・`drawJormRain`(`pS:36615`)・`bossBiteTick`(`pS:16453`)・`mobMeteorTick`(`pS:16309`)。

---

## 3. 本表(1行=1つの予告や形の絵)

### 3-0. 確かめた場面(各表の右端の欄の名札・PERSPECTIVE_PROJECTION.md §3-6k の受け入れ条件4はこの欄から場面を引く)

| 名札 | 場面(呼び出し方の目安) | 行 |
|---|---|---|
| S01 | ステージ1の雑魚の群れ(ゾンビ・骸骨・コウモリ・リッチ・犬・パンプキン・削岩型・伐採人・ハンター) | A01 A03 A05〜A08 A23 I03 K08(リッチ) |
| S02 | 使者(hangedman)の追跡 | A04 |
| S03 | 宇宙飛行士群(mutant-astro)の投げ物と降る残骸 | A10〜A14 K15 |
| S04 | 変異群の英雄・旗手・亡霊(mutant-hero / -liberty / -wraith) | A15〜A17 A19 A20 K10 |
| S05 | 守護霊の幻影(guardian-phantom)の火炎放射・タレット・手榴弾・地雷・罠・デコイ | A18 A22 と G07・I01・I02・I10 の幻影の側 |
| S06 | 城ボス戦(ステージ1〜5の各ボス・グレン)+ボスの噛み | A02 B01〜B28 K02(爆発)・K06・K09 |
| S07 | 裏ボス(ミーミル・ヨルムンガンド・スカジ) | C01〜C10 K11 K12 |
| S08 | トール | D01〜D06 D06b |
| S09 | 天使6体(ミゲル・ジブリル・ラフィ・ウリ・スリィエル・アクラシエル) | E01〜E21 E02b E05b(ジブリルのランタン火の起動後) E12b K08(天使)・K14 |
| S10 | フィル(EX) | F01〜F10 |
| S11 | 偶像(idol) | G01〜G07 K06(着地) |
| S12 | 賞金首4型(バス停・馬乗り・鋏・舞妓) | H01〜H15 K09 |
| S13 | プレイヤーのサブ・スキル・武器(地雷・デコイ・重力井戸・金環・罠・ドローン・火炎瓶・氷槍・血の履帯・矢の雨) | I01 I02 I04〜I08 I10 I11 K13 |
| S14 | 床の印(囲いイベント・レスキュー・帰還・拠点・武器庫・祠・城ボス戦の移動制限・訓練・EX結界・区域のテープ・錬金・商人) | J01〜J04 J06〜J11 J13 J15 |
| S15 | 天候・光(ステージ7の雨上がりの水たまり・ステージ1の夜の松明と月) | K01 K02(松明) K03 K05 |
| S16 | 抱卵型の卵の畑・待ち伏せ(卵を踏んで起爆させる) | A21 |

### A. 雑魚・強個体・終端・変異(汎用 `aiPhase`・§16・噛みつき化・各 tick)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 雑魚の噛みの流星線 | 1 | 赤(返せる)/紫(返せない) | 線+終点の潰れ楕円の印 | 噛みつき化した非ボス全部(ゾンビ・骸骨・コウモリ・研究所Lv1/2/3・犬・パンプキン・削岩型・伐採人・ハンター・プラント除く) | `biteAt`。前置きの線=`preBiteTelegraphLine`(ゾンビ `z-red-pause`/`z-stagger`・骸骨 `s-arc`)→`z-bite1`/`z-bite2`/`s-bite`/`b-windup`〜`b-grab`(`chaffMove` 込み・`utils/biteTelegraph.ts:177-258`) | 集め: `syncPumpkinTelegraph` `pS:16129-16138`/描く: `mobMeteorTick` `pS:16309`(呼び `pS:16249`)・`drawMobBiteMeteor` `pS:16399`・中断の退き `mobMeteorEndFrame` `pS:16381` | mM | `cT:1739-1746`: `biteFxRect`(`src/utils/biteFxHit.ts:33`)と `playerArtRect` の重なり。焼いた点が無い時は `biteBodyOverlapsPlayer`(`enemyBite.ts:875`)。※`cT:1775` の `isInBiteRect` は構え始めの届く範囲の判定 | ゾンビ2連=2本(同じキーで続く・2発目は印を2回打つ) | 流星(`biteTelegraph.ts` の `meteorTiming`) | 要(両端+印の楕円) | **線は足元へ写して描く**(判定の中心 `fx,fy/tx,ty` に `footFromOff/footToOff` を足す=絵と判定の中心が意図的にずれている)。群れの強弱(近い3本だけ通常)・軍人を狙う線あり。リッチの転移噛みは出さない(A03) | S01 |
| A02 ボス級の噛みの線 | 1 | 赤/紫(`BITE_TG_RED`/`PURPLE` `pS:16038-16044`) | 線 | 噛みつき化したボス級(城ボス・裏ボス・天使・賞金首・偶像・フィル 等。死神/使者/幻影は免除。英雄・旗手・宇宙飛行士群・亡霊・変異塊・案山子は damage 0 で入らない=`enemyBite.ts:718`・`cT:1701`) | `biteAt`(追跡中の接触の代わり) | `bossBiteTick` `pS:16453`(呼び `pS:16136`)・`bossBiteEndFrame` | pT | A01 と同じ(`cT:1739-1746`: `biteFxRect`(`src/utils/biteFxHit.ts:33`)と `playerArtRect` の重なり。焼いた点が無い時は `biteBodyOverlapsPlayer`(`enemyBite.ts:875`)。※`cT:1775` の `isInBiteRect` は構え始めの届く範囲の判定) | 単 | 流星(`pS:16460`) | 要 | 腰の高さで引く(雑魚の線は足元・ボスは腰=層も別) | S06 |
| A03 リッチの転移噛みの円 | 1 | 赤 | 円 | リッチ | `chaffMove==='lich-blink'`(`aiPhase 'lich-blink'`) | `syncPumpkinTelegraph` `pS:16165-16187` | pT | `cT:1741` `isInBiteCircle`(`enemyBite.ts:913`・半径 `LICH_BLINK_RADIUS_PX`) | 単 | 円窓 | 要 | 攻撃先(焼いた点)だけに描く。ワープ元・先の緑の陣は K08 | S01 |
| A04 使者の足元の紫の円 | 2(常設の接触判定) | 紫 | 円 | 使者(hangedman) | 常時(死体・HP0・気絶中を除く=`hangedmanContactCircleLive`) | `syncPumpkinTelegraph` `pS:16152-16159` | pT | `utils/collisionUtils.ts:221 hangedmanContactHit`(`cT:1618` 経由・半径28) | — | 常(流星にしない・出入りフェードも無し=意図) | 要 | 足元中心。段階4で中心を足元の投影点にする | S02 |
| A05 跳びの着地円 | 1 | 赤 | 円 | パンプキン・研究所Lv3・ハンター・拳鬼(幻影 `phantomUnique==='brawler'`)・城ボス(台本OFF時のみ) | `aiPhase 'crouch'→'jump'`(`groundJumpStyleOf` `pS:2322`) | `syncPumpkinTelegraph` `pS:16195-16222` | pT | `gS:22532`(爆風経由・半径 `PUMPKIN_EXPLOSION_RADIUS`)→`cT:287` | 単 | 円窓(進み=着地までの残り÷滞空の総時間) | 要 | 円は `jump` の間だけ(`crouch` の間は出ない)。判定は+14px(`RED_CIRCLE_AUDIT.md` #R2) | S01 |
| A06 突進の流星ライン(汎用) | 1 | 赤 | 線 | 犬(werewolf)・研究所Lv2・ハンター・城ボス(台本OFF時) | `aiPhase 'windup'`→`'charge'` | `dashBodyLineTick` `pS:16232`(定義 `pS:33695`)→`dashRunLineTick` `pS:33718`→`drawAngelDashLine` `pS:33418` | pT | 走行中の体当たり: `cT:1618`(`isBodySlamNow` `enemyBite.ts:686` の間だけ接触が生きる) | 単 | 流星(溜め)→走りの間は走者が線を食う(`utils/dashTelegraph.ts`) | 要(両端) | v0.25.5743 で直した(TELEGRAPH_FIXES.md N01)=走り出しても線は消えない。曲がる型=毎フレーム「今の体の中心→狙い点」へ張り直す。体幅の帯は出さない(社長裁定 2026-09-18)。段階4では線の区間を投影 | S01 |
| A07 削岩型の突きの帯 | 1 | 赤 | 帯 | 削岩型(driller) | `driller-thrust-windup`/`-active` | `drawEnemy` `pS:27248-27309`(`drawSweepBand` 27304・縁 `drawTelegraphBand` 27308) | tele | `gS:23471`(爆風経由 `moveKey 'driller-thrust'`) | 単 | 帯窓(`?bsweep=0` で流星 `pS:27292`) | 要 | | S01 |
| A08 伐採人の薙ぎ払いの帯 | 1 | 赤 | 帯(横帯) | 伐採人(logger) | `logger-sweep-windup`/`-active` | `drawEnemy` `pS:27335-27401` | tele | `gS:23571`(`'logger-sweep'`) | 単 | 帯窓(流星 `pS:27384`) | 要 | | S01 |
| A09 這う塊の叩きつけ円 | 1 | 赤 | 円 | 研究所の変異塊(lab-crawler) | 塊の叩きつけ(`labCrawler.slamX/Y`) | `syncLabCrawler` `pS:13480-13482` | cr | `utils/labCrawlerTick.ts:384`(`'crawler-slam'`) | 単 | 円窓 | 要 | 研究所テーマ(段階1の対象外=§1-6)でも予告は段階4の対象に入れるかを要決定 | 対象外(研究所) |
| A10 宇宙飛行士の投げ物の着弾円 | 1 | 赤 | 円 | 宇宙飛行士群(mutant-astro) | `astroThrows` kind `missile`/`debris`(技) | `syncAstroThrowsBody` `pS:21355-21357` | ast | `utils/astroTick.ts:374`(`` `astro-${kind}` ``) | 1投1円・同時に多数 | 円窓(進み=`bornAt→hitAt`) | 要 | | S03 |
| A11 周りに降る残骸の円 | 2 | 紫 | 円 | 同上 | `debris` かつ `ambient`(技ではない方) | `pS:21342-21353` | ast | 同上 | 多数 | 円窓 | 要 | 弾けない=紫 | S03 |
| A12 隕石の着弾円 | 2 | 紫 | 円+影の楕円2枚 | 同上 | kind `meteor` | `pS:21358-21367` | ast | 同上(`noParry`) | 単 | 円窓 | 要(円も影の楕円も頂点ごと・影の `* dsY` を外す) | 影の楕円は判定なし。大きさに `* dsY`(`pS:21364-21367`)が掛かっている=段階4では打ち消して world の寸法で投影 | S03 |
| A13 旗の帯 | 1 | 赤 | 帯 | 同上 | kind `flag`(`capsule`) | `pS:21368-21383`(帯窓を自前で刻む) | ast | 同上 | 単 | 帯窓(`bandSweepCenter` を直に呼ぶ) | 要 | | S03 |
| A14 花束の円 | 3(良い効果の範囲円) | 白(0xf2ece2 α0.04)+花弁 | 円 | 同上 | kind `bouquet` | `pS:21384-21398` | ast | `utils/astroTick.ts:403-415`(回復の範囲) | — | — | 要 | 判定あり=回復(監査で確認) | S03 |
| A15 旗手の矢の雨の着弾円 | 1 | 赤 | 円 | 解放軍の旗手(mutant-liberty)+旗手が死んだ後の孤児の矢 | 旗手の `giantDelayedHits`(`moveKey 'liberty-arrow'`)・`libertyOrphanArrows.hits` の `fireAt`(描く側 `pS:21117`/`21120`) | `syncLibertyArrows` `pS:21072-21089` | lib | `utils/libertyTick.ts:479/504/554`(`'liberty-arrow'`) | 多数(各矢が別時刻) | 円窓 | 要 | 画面外の旗手でも描く。刺さった矢(`stuck`)は絵 | S04 |
| A16 亡霊の叫びの紫の円 | 2 | 紫 | 円 | 亡霊(mutant-wraith) | `wraithScreamAt`(溜め `WRAITH_SCREAM_WINDUP_MS`) | `syncWraithTelegraph` `pS:42557-42570` | wr | `utils/wraithTick.ts:201`(`'wraith-scream'`) | 単 | 円窓 | 要 | | S04 |
| A17 呪いの墓石の通り道 | 1 | 赤 | 帯(太い線) | 亡霊 | `skadiIceBlades` の `visual==='grave'` | `syncSkadiHazards` `pS:19908-19970`(墓石は `gb` へ) | gb | `gS:23902-23909`(`'wraith-grave'`・`parryLocal`) | 多数 | 帯窓(自前でスライス) | 要 | 刃の行(C11)と同じ関数。墓石だけ層が `groundLayer` | S04 |
| A18 幻影の炎の紫の扇 | 2 | 紫 | 扇 | 守護霊の幻影(guardian-phantom の火炎放射) | `phantomFlamerPhase`(`utils/flamerCone.ts:42`) | `syncPhantomFlamer` `pS:20573-20593` | ffl | `utils/phantomTick.ts:1082/1107 phantomFlamerFan` | 単(噴射中は縁が残る) | 円窓(扇) | 要 | 層が `effectLayer` | S05 |
| A19 英雄の技の形 | 1 | 赤 | 円/扇/帯(`heroShape`) | 英雄(mutant-hero) | `hero-windup`/`hero-motion`×`heroMove` 9種×`heroStep` | `drawHeroTelegraph` `pS:42340-42382`(呼び `pS:27703`。円 42371・扇 42376・帯=`drawAngelZoneCapsule` 42381) | tele | `utils/heroTick.ts:728`→`184`(爆風経由・扇は `fan`) | 段ごと(連撃は段ごとに形を置き直す) | 円窓/扇=円窓/帯=帯窓 | 要 | 進み=`bossWindupStartAt→heroHitAt` | S04 |
| A20 旗手の旗振りの形 | 1 | 赤 | 同上 | 旗手(mutant-liberty) | 同上 | 同上(`pS:27702` は英雄と旗手の両方) | tele | `libertyTick.ts:471`(`'liberty-flag'`) | 同上 | 同上 | 要 | | S04 |
| A21 卵の起爆の点滅の輪 | 2 | 紫(線 `0xc084fc`・塗りなし) | 円(線だけ) | 抱卵型の卵(`breakableProps` type `mine`) | 起爆モード(アーム)に入った瞬間だけ | `syncEggArmBlinks` `pS:16491`(円の線 `pS:16507`・濃さ `eggArmBlinkAlpha`・間引き `distanceOutsideViewport` `pS:16505`・地平線の型抜き `eggArmBlinkMask` `pS:16509-16518`) | `eggArmBlinkGfx`(groundLayer) | N06 の判定(`uGL:17255-17271`・半径 `EGG_BLAST_RADIUS`)と同じ中心と半径 | 卵ごと(アームの瞬間に1回) | 短く2回点滅(約250ms)。常に出る予告は無い | 要(`projCircle` の線) | **社長裁定(2026-11-22)「起爆モードに入った一瞬、ピピっとサークルの線で範囲を表示」**・v0.25.5748(f2bd4f8)で実装。中心=判定と同じ(`footX, footY − height×0.5`)。v0.25.5743 の紫の円窓(`eggTeleGfx`)は社長指示「緑卵の爆発範囲内表示やめる」で撤去済み。卵の本体の光(紫のひび・小さめの光の輪)は残る。段階4は `projCircle` の線・型抜きは使わない(PERSPECTIVE_PROJECTION.md §3-6b の混在の表) | S16 |
| A22 幻影のタレットの消滅の紫の円 | 2 | 紫 | 円 | 守護霊の幻影のタレット(hostile) | `createdAt + duration` の前 | `syncPhantomTurretTelegraphs` `pS:34404`(円窓 `pS:34419`・縁 `pS:34422`・刻み `drawRimNotches` `pS:34423`) | `turretTeleGfx`(groundLayer・`pS:5072`) | N12 の判定(`uGL:14591-14630`) | タレットごと | 円窓 | 要 | v0.25.5743 で足した(TELEGRAPH_FIXES.md N12)。間引き `distanceOutsideViewport` `pS:34415` | S05 |
| A23 ゾンビの紫の追尾の印 | 2 | 紫 | 線+潰れた楕円の印 | ゾンビ | `zrush` の体当たりの間(`isZombieRushBodySlamNow` `enemyBite.ts:668`) | `zombieRushMarkTick` `pS:33643`(呼び `pS:16254`)→`dashRunLineTick`(印つき) | pT | N05 の判定 | 単 | `zombieRushMarkPhase`(`utils/zombieRushMark.ts`) | 要(線)・印は中心だけ投影 | v0.25.5743 で足した(TELEGRAPH_FIXES.md N05)。体幅の帯は出さない | S01 |

### B. 城ボス `g-*`(giantbat=搬送体/樹木管理員/衛生兵/軍隊/グレン)

ヘルパ: 帯=`drawGiantCapsuleZone`(`pS:30703-30741`・`drawSweepBand`+`drawTelegraphBand`)/扇=`drawGiantFanZone`(`pS:30744-30774`・`drawSweepSectorFill`)。どれも tele。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B01 踏み鳴らしの円 | 1 | 赤 | 円 | 城ボス | `g-stomp-windup` | `pS:31806-31822` | tele | `gS:21185`(`'g-stomp'`・半径 `gStompRadius`) | 単 | 円窓 | 要 | | S06 |
| B02 薙ぎ払いの照準(追尾相) | 1 | 赤(イーズイン) | 帯 | 城ボス | `g-sweep-track` | `pS:31823-31936`(`gTrackEase`) | tele | 判定なし(ロック後の B03 が当てる) | — | 自前(照準が動く間は流星でない) | 要 | ロック時に白い全形の残像(`pS:31921-31935`) | S06 |
| B03 薙ぎ払いの帯 | 1 | 赤 | 帯+白芯 | 城ボス | `g-sweep-windup`/`-active` | `pS:31823-31936`(流星 31859・`drawSweepBand` 31887・縁 31911・軸 31915) | tele | `gS:21242-21244`(`'g-sweep'`) | 単 | 帯窓 | 要 | 斬撃の弧 `drawSlashArc` `pS:30946`(①の武器の弧・段階3の扱い) | S06 |
| B04 跳びかかりの着地円 | 1 | 赤 | 円 | 城ボス | `g-jump-windup`/`g-jump-air` | `pS:31937-31958` | tele | `gS:21336`(`'g-jump'`) | 単 | 円窓 | 要 | | S06 |
| B05 連続ジャンプの着地円×3 | 1 | 赤 | 円×3 | グレン | `g-trijump-windup`/`-air`(`gTriJumpPts`) | `pS:31959-31986` | tele | `gS:21402`(`'g-trijump'`・1着地ごと) | **3段・段ごと** | 円窓(次の円だけ濃く=`lead`) | 要 | | S06 |
| B06 突進の流星ライン | 1 | 赤 | 線 | 城ボス | `g-dash-windup`→`g-dash-charge` | `dashBodyLineTick` `pS:31799` | tele | 走行中の体当たり `cT:1618` | 単 | 流星(溜め)→走りの間は走者が線を食う | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md N01)=走り出しても線は消えない(曲がる型) | S06 |
| B07 三連突進の紫ライン | 2 | 紫 | 線 | 城ボス(ステージ4) | `g-quad-windup`→`g-quad-charge` | `dashBodyLineTick` `pS:31802` | tele | 同上 | 突進3回=回ごとに引き直し | 流星(溜め)→走りの間は走者が線を食う | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md N01)=走り出しても線は消えない(曲がる型・段ごとに別の線) | S06 |
| B08 氷の横薙ぎ(溜め)の扇 | 1 | 赤 | 扇 | 城ボス(ステージ4) | `g-quad-breath-windup` | `pS:32055-32057`(`drawGiantFanZone`) | tele | B09 の判定 | — | 円窓(扇) | 要 | 最終的に薙ぐ全域の先出し | S06 |
| B09 氷の横薙ぎ(実行)の回る帯 | 1 | 赤 | 帯(回転) | 同上 | `g-quad-breath-active` | `pS:32058-32069` | tele | `gS:21771`(`'g-quad'`・`giantActiveHit` で1回) | 持続 | 自前(`giantSweepWindowProg`→帯窓) | 要 | 回転する帯=毎フレーム頂点が変わる | S06 |
| B10 三連突進が残す氷の遅延円×3 | 1 | 赤 | 円×3 | 同上 | 遅延キュー(`ice`) | 遅延キューの描画 `pS:32325-32437`(円の枝 32408-32413) | tele | `gS:21783`→`gS:20742`→爆風経由 | **3つ・別時刻** | 円窓(`bornAt→fireAt`) | 要 | | S06 |
| B11 噛みつきの帯 | 1 | 赤 | 帯 | 城ボス(ステージ1) | `g-bite-windup`/`-hold`/`-active` | `pS:31987-32009` | tele | `gS:21482-21484`(`'g-bite'`) | 二相(溜め→溜め直し) | 帯窓(`twoPhaseTelegraphProg`) | 要 | | S06 |
| B12 のしかかりの帯 | 1 | 赤 | 帯 | 城ボス | `g-slam-windup`/`-active` | `pS:32010-32019` | tele | `gS:21510-21512`(`'g-slam'`) | 単 | 帯窓 | 要 | 技表で**未割当=実戦に出ない**(BOSS_MOVE_INVENTORY) | S06 |
| B13 滑空薙ぎの帯 | 1 | 赤 | 帯 | 城ボス(ステージ3) | `g-glide-windup`/`-active` | `pS:32020-32030` | tele | `gS:21543-21545`(`'g-glide'`) | 二撃(B14) | 帯窓 | 要 | | S06 |
| B14 滑空の二撃目の遅延円 | 1 | 赤 | 円 | 同上 | 遅延キュー | `pS:32408-32413` | tele | `gS:21593`→`gS:20742` | 単 | 円窓 | 要 | | S06 |
| B15 急降下の着弾円 | 1 | 赤 | 円 | 城ボス(ステージ3) | `g-dive-windup` | `pS:32031-32042` | tele | `gS:21623`(`'g-dive'`) | 単 | 円窓 | 要 | 本体が消えている間も描く(tele は敵の入れ物の子=本体の alpha の影響を要確認) | S06 |
| B16 氷結波(溜め)の円と外周 | 1 | 赤 | 円(内)+外周の縁 | 城ボス(ステージ4) | `g-nova-windup` | `pS:32071-32083` | tele | B17 の判定 | — | 円窓(内円)・外周の縁は `telStrokeA`(濃) | 要 | | S06 |
| B17 氷結波の広がる輪 | 1 | 赤 | 輪(太い線) | 同上 | `g-nova-active` | `pS:32084-32091` | tele | `gS:21866`(`'g-nova'`・`giantActiveHit` で1回) | 持続(輪が動く) | 溜め=円窓(開始半径・`g-nova-windup`)/実行=判定そのものの輪(④) | 要 | 輪の位置そのものが判定。**§6-3 5 から外した**(TELEGRAPH_FIXES.md B17=(b)) | S06 |
| B18 翼撃の円 | 1 | 赤 | 円 | 城ボス(ステージ1) | `g-wing-windup`/`-active` | `pS:32110-32131` | tele | `gS:21939-21941`(`'g-wing'`) | 単 | 円窓(active では消える) | 要 | | S06 |
| B19 三連射の帯×2 | 1 | 赤 | 帯×2 | 城ボス(ステージ5) | `g-trishot-windup`/`-active` | `pS:32092-32109` | tele | `gS:21896-21901`(`'g-trishot'`・`beam`) | 2本同時+三拍目 B20 | 帯窓 | 要 | 衝撃波(盾で切る `drawShockwaveCut`)は② | S06 |
| B20 三連射の三拍目(遅延帯) | 1 | 赤 | 帯 | 同上 | 遅延キュー(`capsule`) | 遅延キューの帯の枝 `pS:32338-32404`(`drawSweepBand` 32349・縁 32378) | tele | `gS:21915`→`gS:20742` | 単 | 帯窓(`?bsweep=0` で流星 32080) | 要 | | S06 |
| B21 掃射(溜め)の扇(内径つき) | 1 | 赤 | 環状の扇 | 城ボス(ステージ5) | `g-sweepbeam-windup` | `pS:32139-32142`(`drawGiantFanZone` の innerR) | tele | B22 の判定 | — | 円窓(扇) | 要(内側の弧も) | | S06 |
| B22 掃射(実行)の回る帯 | 1 | 赤 | 帯(回転・盾で割る) | 同上 | `g-sweepbeam-active` | `pS:32143-32166` | tele | `gS:22011`(`'g-sweepbeam'`) | 持続 | 自前(`giantSweepWindowProg`)+盾の切り | 要 | 盾の影で帯を割る計画(`shieldBeamPlan`) | S06 |
| B23 血の爪痕の遅延帯×3 | 1 | 赤 | 帯×3 | グレン | `g-talon-windup`(遅延キュー `capsule`) | 遅延キューの帯の枝 `pS:32338-32404` | tele | `gS:21068`→`gS:20742` | 3本(同時刻) | 帯窓 | 要 | 爪痕の焼き素材 `drawClawMark`(`pS:32418-32458`)は② | S06 |
| B24 血の弧の遅延円×5 | 2 | **紫**(`floorUntil` 付きは紫 `pS:32333`) | 円×5 | グレン | `g-boon-windup`(遅延キュー) | `pS:32408-32413` | tele | `gS:21092`→`gS:20742` | 5つ | 円窓 | 要 | 爆ぜた後は B25 の床になる | S06 |
| B25 グレンの血溜まり(床・E-5) | 4 | 紫の縁+血の絵 | 円(絵は円形の血) | グレン | 遅延キューの `floorUntil` | `drawBloodPool` `pS:37759`(呼び `pS:32436`)+縁 `pS:32412` | **血の絵は `groundLayer`**(`pS:37772`)・縁は tele | `cT:784 applyGlenFloorDamage` | 床の間ずっと | — | 要(縁)・血の絵は4隅 | 「血だが判定を持つ床」(CLAUDE.md の実例) | S06 |
| B26 虚無の三唱の大円 | 1 | 赤 | 円 | グレン | `g-nihil-chant1〜3`(遅延キュー1件) | `pS:32408-32413` | tele | `gS:21148`→`gS:20742` | 1件(3唱の合計で1回) | 円窓 | 要 | | S06 |
| B27 伸びる触手の帯(複数本) | 1 | 赤+白い針 | 帯+針の線(oT) | グレン | `g-reach-windup`(`gReachShots` ごと) | `pS:32168-32208` | tele+oT | `gS:22095-22097`(`'g-reach'`・1本ごと) | **本数ぶん・別時刻** | 帯窓+白い針(`rprog` に比例・自前) | 要 | 針は oT=入れ物の最前面 | S06 |
| B28 尻尾の叩きつけの帯 | 1 | 赤 | 帯 | グレン(第二形態) | `g-tailslam-windup`/`-active` | `pS:32209-32225` | tele | `gS:22189-22191`(`'g-tailslam'`) | 単(後に弾の連射=§4) | 帯窓 | 要 | 長さ=尻尾のパーツの長さ | S06 |

### C. 裏ボス(ミーミル・ヨルムンガンド・スカジ)`bossState`

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 裏ボスの突進ライン | 1 | 赤 | 線 | 3体 | `dash-windup`→`dash` | `dashBodyLineTick` `pS:28995` | tele | 走行中の体当たり `cT:1618` | 単 | 流星(溜め)→走りの間は走者が線を食う | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md N01)=走り出しても線は消えない(曲がる型) | S07 |
| C02 ミーミルの群体の噛みつき円 | 1 | 赤 | 円 | ミーミル | `bite-windup` | `pS:29013-29025` | tele | `uGL:8704`(爆風経由・`MIMIR_BITE_RADIUS`) | 単 | 円窓 | 要 | 描く半径 `MIMIR_BITE_RADIUS_VIS` は判定 `MIMIR_BITE_RADIUS` の別名(216)=一致を確認済み | S07 |
| C03 レーザー(カラオケ塗り) | 2 | 紫 | 帯(根元→足元へ伸びる) | ミーミル・バス停(`usesMimirLaser`) | `laser-windup`/`laser-fire` | `pS:28248-28321`(溜め 28274・発射 28313/28319) | tele | ミーミル `uGL:8552-8561`/バス停 `bT:1038` | 発射中は持続(追尾) | 自前(カラオケ塗り=掟①の唯一の例外) | 要 | 盾で割る(`strokeBeamLayers`=モジュール関数 `pS:2985`・呼び `pS:28312`・半幅 `MIMIR_LASER_VIS_HALFWIDTH`) | S07 |
| C04 ミーミルの紫の車輪 | 2 | 紫 | 線×スポーク(回転) | ミーミル | `wheel-windup`/`wheel-fire` | `pS:28330-28492` | tele | `uGL:8664`(`'capsule:mimir-wheel'`) | スポーク本数ぶん同時・持続 | 帯窓(根元→先端・`prog = tW / W.windupMs`) | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md C04)。スポークの線は `winLine` `pS:28347`(土台の帯=幅 `W.halfWidth*2` `pS:28414`・線 28416・芯 28417)。回転レーザーは `strokeBeamLayers` `pS:28446`/`28481`。寄り集まる玉(`pS:28388-28403`)は判定なしの② | S07 |
| C05 うねり薙ぎの帯 | 1 | 赤 | 帯 | ヨルムンガンド | `coil-windup`(実行 `coil`) | `pS:29065-29070`(`drawAngelZoneCapsule`) | tele | `uGL:8721`(爆風経由 `HB_JO.coil.halfWidth`) | 単 | 帯窓 | 要 | **描く幅は `HB_TH.harai.halfWidth`(トールの値)・判定は `HB_JO.coil.halfWidth`**=今は両方40だが出どころが別(§6)。実行中の胴(`coilBody`)は絵 | S07 |
| C06 叩きつけ(体を広げた枠) | 1 | 赤 | 矩形(段ごとに大きく) | ヨルムンガンド | `jslam-windup`/`jslam-hit`/`jslam-rewind` | `pS:29080-29099`(`drawSweepRectFill` `pS:36951`) | tele | `uGL:8747-8748`(`'jo-slam'`・帯=`utils/jormDanmaku.ts:20 jormSlamRect`) | **2連/3連・段ごと** | 自前(矩形の窓) | 要(4隅) | | S07 |
| C07 スカジの氷塊の円(設置) | 1 | 赤 | 円 | スカジ | `skadi-ice-windup`→`skadiIceMarkers`(`fireAt`=2秒) | `syncSkadiHazards` `pS:19875-19887` | **skH(effectLayer)** | `gS:23833`(爆風経由 `ice`) | 多数・別時刻 | 円窓 | 要 | | S07 |
| C08 スカジの氷結の檻(氷塊の環) | 1 | 赤 | 円×count | スカジ | `cage-windup` 明けに氷塊を環に置く(`uGL:8973-8982`) | C07 と同じ描画 | skH | `gS:23833` | count個・同時刻 | 円窓 | 要 | 溜め中(`cage-windup`)の地面の予告は無い=体の震えだけ(§4) | S07 |
| C09 スカジの氷の刃の通り道 | 1 | 赤 | 帯(太い線) | スカジ | `skadi-blade-windup`→`skadiIceBlades` | `syncSkadiHazards` `pS:19908-19970` | skH | `gS:23905/23909`(`parryNoDamage`) | 刃ごと | 帯窓(自前スライス `pS:19933-19965`) | 要 | 刃の線は発射前 `SKADI_BLADE_LINE_PRE_MS` から | S07 |
| C10 スカジの氷の格子 | 2 | 紫 | 帯×10/段 | スカジ | `lattice-windup` | `drawSkadiLattice` `pS:36823`(呼び `pS:28324`) | tele | `uGL:9009`(`'capsule:skadi-lattice'`) | **段ごと** | 帯窓(紫) | 要 | | S07 |

### D. トール

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D01 無の境地の紫の円 | 2 | 紫 | 円 | トール | `issen-nihil` | `thorNihilCircleTick` `pS:33532`(呼び `pS:28782`) | tele | ダメージなし。円の中で近接を振ると一閃(`utils/thorNihil.ts:34 isInsideNihilCircle`・半径 `thorNihilRadius()`) | — | 自前(慣性つきで開閉) | 要 | 「判定の半径を見せる円」でもある | S08 |
| D02 一閃の帯 | 1 | 赤 | 帯 | トール | `issen-windup`→`issen-dash` | `pS:28521-28569` | tele | `uGL:9152`(`'capsule:thor-issen'` 9169) | 単 | 帯窓(流星 28365) | 要 | | S08 |
| D03 突きの帯 | 1 | 赤 | 帯 | トール | `tsuki-windup`→`tsuki` | `pS:28576-28625` | tele | `uGL:9239`(9253) | 単 | 帯窓(流星 28424) | 要 | 溜め中は追従(trackFrac) | S08 |
| D04 払いの帯 | 1 | 赤 | 帯+軸 | トール | `harai-windup`→`harai` | `pS:28633-28673` | tele | `uGL:9294`(9308) | 単 | 帯窓(流星 28469) | 要 | | S08 |
| D05 飛び掛かりの着地円 | 1 | 赤 | 円 | トール | `jump-windup`/`jump-attack` | `pS:28688-28713` | tele | `uGL:9439-9441`(`'thor-jump'`) | 単 | 円窓 | 要 | | S08 |
| D06 突進の流星ライン | 1 | 赤 | 線 | トール | `thor-dash-windup`→`thor-dash-move` | `dashRunLineTick` `pS:28821`(走る道の細い線・28788-28828) | tele | `uGL:9380-9395`(`distToBandRect`・半幅 `HB_TH.harai.halfWidth`・長さ `HB_TH.harai.range`。`thor-dash-move` の到達時=`uGL:9367`→`9380`)。`uGL:9401` は守護霊向け | 単 | 流星(溜め)→走りの間は走者が線を食う・到着後は州の終わりで0 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md 1h+1i)=線は走りの間も残る。判定の幅の帯は D06b。線の幅6px は走る道の印(判定の幅ではない) | S08 |
| D06b 突進の斬り抜けの帯 | 1 | 赤 | 帯 | トール | 溜め始め→斬る瞬間(`dashTelegraphPhase` の band) | `zoneCapsuleTick` `pS:28825`(始点=`thorDashArrival`・終点=`dashStrikeBandEnd`・半幅 `HB_TH.harai.halfWidth`) | tele | D06 と同じ | 単 | 帯窓(溜め+走りの通しで1本) | 要 | v0.25.5743 で足した(TELEGRAPH_FIXES.md 1h)。斬る瞬間に消え切る。斬り抜けの判定が残る `strikeMs` の間は斬撃の絵(社長裁定5で④を外す区間) | S08 |

### E. 天使6体(ミゲル・ジブリル・ラフィ・ウリ・スリィエル・アクラシエル)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E01 払い/縦払いの帯 | 1 | 赤 | 帯 | ミゲル | `harai-windup`→`harai`→`tate-windup`→`tate` | `pS:29568-29593`(`drawAngelZoneCapsule` 29577)+完了ラッチ `pS:30091-30113` | tele | `aBT:839-848`(旧経路 `aBT:1116-1125`) | **2段(払い→縦払い・段ごとに溜め)** | 帯窓 | 要 | | S09 |
| E02 踏み込みの線 | 1 | 赤 | 線 | ミゲル | `mdash-windup`→`mdash-move` | `dashRunLineTick` `pS:29527`(29507-29536・ミゲルとウリの共通の枝) | tele | `aBT:962-969` | 単 | 流星(溜め)→走りの間は走者が線を食う・到着後は州の終わりで0 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md 1i)。通る技=走行中も線が残る。斬り抜けの帯は E02b | S09 |
| E02b 踏み込みの斬り抜けの帯 | 1 | 赤 | 帯 | ミゲル | 溜め始め→斬る瞬間 | `zoneCapsuleTick` `pS:29534`(半幅 `MG_T.harai.halfWidth`) | tele | `aBT:962-969` | 単 | 帯窓 | 要 | v0.25.5743 で足した(TELEGRAPH_FIXES.md 1i) | S09 |
| E03 ランスの帯 | 1 | 赤 | 帯×3 | ジブリル | `lance-windup`/`lance` | `pS:29641-29693`(本数 29645・帯 29681) | tele | `aBT:1443-1491`(爆風経由 `capsule`・1479) | **3本・1秒おきに別の時刻** | 帯窓(進み=経過÷(経過+発射までの残り)・`lanceRemainingMs`・ランタンごとに単調) | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md E03)=上限0.97 を撤去。ランスの帯は `strokeBeamLayers` `pS:29660`(幅=判定 `JB_T.lance.halfWidth`)。追尾ランタン(`lanceLanterns`)は絵 | S09 |
| E04 ランタン火の円 | 2 | 紫 | 円 | ジブリル | `lantern` → `bossFires` | `syncBossFires` `pS:21989-22013` | bf | `aBT:3940/3956 tickAngelBossFires` | 多数・別時刻 | 円窓 | 要 | 描く半径=`TG_SRC.jibrilFireRadius()`(=判定 `JB_T.fire.radius`・`pS:21993`・v0.25.5743)。有効中の紫の炎は絵(`pS:22021-22024`) | S09 |
| E05 聖別の火の環 | 2 | 紫 | 円×N | ジブリル | `consecrate-windup` 明けに火を環に置く(`aBT:1569-1573`) | E04 と同じ | bf | E04 と同じ | N個・同時 | 円窓 | 要 | 溜め中の地面の予告は無い(ランタンを掲げる絵だけ) | S09 |
| E05b ランタン火の起動後(床) | 4 | 紫の縁+紫の炎の絵+グロー | 円(判定と同じ半径の縁)+炎とグロー | ジブリル | E04・E05 の火が起動した後(`active`) | `syncBossFires` `pS:22018-22043`(縁 `pS:22038-22039`・外周のグロー r*3.2 `pS:22021`) | bf | `aBT:3948-3956`(`active && hypot ≤ JB_T.fire.radius + 自機の半身`) | 火ごと | 常(起動中は一様・`expireAt` でちょうど0=`bossFireRimAlpha`) | 要(縁)。炎とグローは投影しない側(混在) | v0.25.5743 で直した(TELEGRAPH_FIXES.md E05b)=判定と同じ半径の紫の縁を足した。同じ Graphics(bf)に炎の楕円とグローが混ざる=段階4は縁と予告の円だけ投影(PERSPECTIVE_PROJECTION.md §3-6b の混在の表) | S09 |
| E06 骨刃の通り道 | 1 | 赤 | 帯(太い線) | ラフィ | `bone-windup`→`skadiIceBlades`(`visual 'bone'`・`aBT:1900`) | `syncSkadiHazards` `pS:19908-19970` | skH | `gS:23905/23909` | 刃ごと | 帯窓 | 要 | | S09 |
| E07 刃2連の通り道 | 1 | 赤 | 帯 | ラフィ | `quickblades-windup`→刃 | 同上 | skH | 同上 | 2本 | 帯窓 | 要 | | S09 |
| E08 跳びかかりの着地円 | 1 | 赤 | 円 | ラフィ | `jump-windup`/`jump-attack` | `pS:29724-29742` | tele | `aBT:1953`(旧 `aBT:2146`) | 単 | 円窓 | 要 | | S09 |
| E09 薙ぎの帯 | 1 | 赤 | 帯 | ラフィ | `sweep-windup`/`sweep` | `pS:29694-29723`(29699)+ラッチ `pS:30149-30166` | tele | `aBT:1975`(カウンター窓 `aBT:1989`) | 単 | 帯窓 | 要 | 描く幅=`HB_TH.harai.halfWidth`・判定=`RF_T.sweep.halfWidth`(今は両方40・出どころ別=§6) | S09 |
| E10 大薙ぎの帯 | 1 | 赤 | 帯 | ウリ | `sweep-windup`/`sweep` | `pS:29748-29769`(29753)+ラッチ `pS:30167-30178` | tele | `aBT:2330-2339`(`UR_T.sweep.halfWidth`) | 単 | 帯窓 | 要 | 描く幅=`HB_TH.harai.halfWidth`(同上・今は40=40) | S09 |
| E11 振り下ろしの帯 | 1 | 赤 | 帯 | ウリ | `downslash-windup`/`downslash` | `zoneCapsuleTick` `pS:29492-29500`(呼び 29496・半幅 29499)+ラッチ `pS:30179-30189` | tele | `aBT:2383-2388`(**`UR_T.downslash.halfWidth`=40**) | 単 | 帯窓 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md E11)=描く半幅を判定と同じ `UR_T.downslash.halfWidth`(40)へ(`TG_SRC.uriDownslashHalfWidth()`) | S09 |
| E12 踏み込み突きの線 | 1 | 赤 | 線 | ウリ | `thrust-windup`→`thrust` | `dashLineTick` `pS:29531`(線は溜めの中で消し切る) | tele | `aBT:2453-2460` | 単 | 流星 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md 1i)。体当たり無し=走りの間の赤は斬り抜けの帯 E12b だけ | S09 |
| E12b 踏み込み突きの斬り抜けの帯 | 1 | 赤 | 帯 | ウリ | 溜め始め→斬る瞬間 | `zoneCapsuleTick` `pS:29534`(半幅 `TG_SRC.uriThrustHalfWidth()`) | tele | `aBT:2453-2460` | 単 | 帯窓 | 要 | v0.25.5743 で足した(TELEGRAPH_FIXES.md 1i) | S09 |
| E13 環の射出ビーム | 1 | 赤 | 帯(長い線・盾で割る) | スリィエル | `ring-beam-windup`→`ring-active` | `drawShieldedAngelBeam` `pS:29821-29840`→`drawAngelBeamLine` `pS:33836`+完了ラッチ `pS:30254-30265` | tele | `aBT:2719-2765` | 環が2つなら2本 | 帯窓(`bandSweepSliceAlpha`) | 要 | 起点=環の位置(本体ではない) 射出の帯は `strokeBeamLayers` `pS:33802`(幅=判定 `SR_T.beam.halfWidth`)・溜めの線は `drawAngelBeamLine` `pS:33799`(`baseW`) | S09 |
| E14 環の回転斬の円 | 1 | 赤 | 円 | スリィエル | `ring-spin-windup`→`ring-spin` | `pS:29841-29864`+尾 `pS:30275-30291` | tele | `aBT:2818-2823` | 単 | 円窓 | 要 | 硬直へ入った後も尾が残る(`RED_CIRCLE_AUDIT.md` D-3) | S09 |
| E15 本体の薙ぎの帯 | 1 | 赤 | 帯 | スリィエル | `sweep-windup`→`sweep` | `pS:29865-29882`+尾 `pS:30302-30316` | tele | `aBT:2873-2878`(`SR_T.sweep.halfWidth`) | 単 | 帯窓(実行中は全形) | 要 | 描く幅=`HB_TH.harai.halfWidth`(今は40=40) | S09 |
| E16 放射棘の扇×8(隙間あり) | 1 | 赤 | 扇×8 | アクラシエル | `spike-windup`/`spike` | `drawAcrasielPattern` `pS:20921-20936`(呼び `pS:29488`) | tele | `aBT:3166/3185` | 8本同時 | 円窓(扇)・実行中は一様 | 要 | | S09 |
| E17 結晶の槍の狙い円(溜め) | 1 | 赤 | 円×狙い数 | アクラシエル | `spear-windup` | `pS:20938`(内部の `circle` ヘルパ 20898-20915) | tele | E18 の判定 | 狙い数ぶん | 円窓 | 要 | | S09 |
| E18 結晶の槍(設置物)の円 | 1 | 赤 | 円 | アクラシエル | `acrasielSpears`(`fireAt`) | `syncAcrasielSpears` `pS:21034-21051` | acS | `aBT:3969/4015 tickAcrasielSpears` | 多数・別時刻 | 円窓 | 要 | 槍の絵(Sprite)は `groundLayer` | S09 |
| E19 爆発の円 | 1 | 赤 | 円 | アクラシエル | `burst-windup`/`burst` | `pS:20945-20949`(`acrasielBurstRed`) | tele | `aBT:3246` | 単 | 円窓→live(④) | 要 | 破片(`burstFrag`)は②。**§6-3 5 から外した**(TELEGRAPH_FIXES.md H12・H15・E19・E20=(b)) | S09 |
| E20 転移衝撃の円 | 1 | 赤 | 円 | アクラシエル | `warp-out`/`warp-in`(`warp-active`) | `pS:20950-20953`(`acrasielWarpRed`) | tele | `aBT:3223/3229` | 単 | 円窓→live(④) | 要 | 中心=出現先(`aiTarget`)。**§6-3 5 から外した**(同上) | S09 |
| E21 凝視の多射線 | 1 | 赤 | 線×5〜9 | アクラシエル | `gaze-windup`→`gaze-active` | `drawAngelBeamLine` `pS:20975`(20954-20983) | tele | 弾(`aBT:3255` の `addProjectile`) | 本数同時 | 帯窓 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md E21)=偶像の狙い撃ちと同じ帯窓へ。半幅=凝視の弾の半身。起点=本体の中心(撃つ側と同じ点) | S09 |

### F. フィル(EX)

羽攻撃の武器絵は `phillLayer`(②)。予告は全部 tele・`PixiScene.PHILL_TG_STYLE`。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F01 祝福(光の雨)の円 | 1 | 赤 | 円×キュー | フィル | `phill-lightrain-windup`/`-active`(`phillLightrainQueue` の `at`) | `drawPhillLightrainCircles` `pS:43426-43439`(呼び 29895/29900)+光柱 `drawPhillBlessingSpotlights`(②) | tele | `aBT:3517`(`'phill-lightrain'`) | **キューごとに別時刻** | 円窓 | 要 | CLAUDE.md の「1発目が描かれない」前例の技 | S10 |
| F02 羽斬りの帯 | 1 | 赤 | 帯 | フィル | `phill-wingslash-windup` | `pS:29904-29925`(29914) | tele | `aBT:3573` | 単 | 帯窓 | 要 | | S10 |
| F03 羽突きの帯 | 1 | 赤 | 帯 | フィル | `phill-wingthrust-windup` | `pS:29926-29950`(29931) | tele | `aBT:3596` | 単 | 帯窓 | 要 | | S10 |
| F04 羽連撃の帯×2 | 1 | 赤 | 帯×2 | フィル | `phill-wingcombo-windup`→`active1`→`gap`→`active2` | `pS:29951-29990`(1本目 29972・2本目 29967) | tele | `aBT:3619/3635` | **2段・段ごと** | 帯窓 | 要 | | S10 |
| F05 金環の大円 | 1 | 赤(縁は金 0xffd166) | 円 | フィル | `phill-goldring-windup` | `pS:29991-30005` | tele | `aBT:3686` | 単 | 円窓 | 要 | | S10 |
| F06 裁きの光の円 | 1 | 赤 | 円 | フィル | `phill-judgment-windup` | `pS:30006-30023`+天の光柱 `drawPhillJudgmentSkylight` `pS:32675`(②) | tele | `aBT:3710` | 単 | 円窓 | 要 | 描く半径はズームでクランプ(`phillZoomSafeRadius`)・判定は生値(`RED_CIRCLE_AUDIT.md` D-2) | S10 |
| F07 羽根の檻の円(収縮) | 1 | 赤 | 円(半径が縮む) | フィル | `phill-cage-windup` | `pS:30024-30042` | tele | `aBT:3737`(`closeRadius`) | 単 | 円窓 | 要 | 描く半径 `startR→closeRadius` へ収縮。判定は `closeRadius`=溜め中の大きい赤の外周部は当たらない(当たる瞬間には一致) | S10 |
| F08 光輪投げの往復帯 | 1 | 赤 | 帯×2(往・復) | フィル | `phill-ringtoss-windup`→`-out`→`-back` | `pS:30043-30065`(30055/30058)+輪の絵 `drawPhillRingtoss` `pS:32694` | tele | `aBT:3790/3798` | **2段(往・復)** | 帯窓 | 要 | | S10 |
| F09 急降下の着地円 | 1 | 赤 | 円 | フィル | `phill-dive-windup`(追尾)→`-fall`(ロック) | `pS:30066-30080` | tele | `aBT:3834` | 単 | 円窓 | 要 | | S10 |
| F10 羽根散弾の通り道 | 1 | 赤 | 帯 | フィル | `phill-feathershot-windup`→`skadiIceBlades`(`visual 'feather'`) | `syncSkadiHazards` `pS:19908-19970` | skH | `gS:23905/23909` | 刃ごと | 帯窓 | 要 | | S10 |

### G. 偶像(idol)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G01 狙い撃ちの線 | 1 | 赤 | 線(弾の幅) | 偶像 | `idol-aim-windup` | `drawAngelBeamLine` `pS:29207-29215` | tele | 弾(当たるのは弾そのもの) | 単 | 帯窓 | 要 | 弾の通り道の予告 | S11 |
| G02 連射の扇の線 | 1 | 赤 | 線×3/5 | 偶像 | `idol-fan-windup` | `pS:29217-29233` | tele | 弾 | 本数同時 | 帯窓 | 要 | | S11 |
| G03 狙撃線 | 2 | 紫 | 帯 | 偶像 | `idol-snipe-windup`→`idol-snipe` | `drawAngelZoneCapsule` `pS:29236-29240` | tele | `iT:939` | 単 | 帯窓 | 要 | | S11 |
| G04 追尾弾の線 | 1 | 赤 | 線 | 偶像 | `idol-orb-windup` | `pS:29242-29265` | tele | 弾 | 本数同時 | 帯窓 | 要 | | S11 |
| G05 メーカーの射撃枠の線 | 1 | 赤 | 線 | 偶像 | `idol-s*-windup`(`IDOL_SHOT_SLOTS`) | `pS:29267-29289` | tele | 弾 | 本数同時 | 帯窓 | 要 | 既定OFF | S11 |
| G06 殴りの帯 | 1 | 赤 | 帯 | 偶像 | `idol-punch-windup` | `drawAngelZoneCapsule` `pS:29291-29300` | tele | `iT:953`(`hitCapsule`→`iT:576`) | 単 | 帯窓 | 要 | | S11 |
| G07 手榴弾の爆発円 | 2 | 紫 | 円(弾に付く) | 偶像・**幻影**(`utils/phantomTick.ts:195`) | `idol-nade-windup`→`idol-nade`(敵の手榴弾=`p.hostile`) | `drawProjectile` `pS:38979-38990` | **pj(frontObjectLayer・弾の Graphics の原点=弾の位置)** | `uGL:14840-14854`(`HEAVY_GRENADE_RADIUS`) | 単 | 円窓(信管 `fu`) | 要 | 円が弾と一緒に動く=段階4では円の中心=弾の地面の位置。v0.25.5743 で半径と縁の太さを `/ depthD` で打ち消した(`pS:38986`・`38991`)=段階4ではこの打ち消しを外し、world の半径で投影(PERSPECTIVE_PROJECTION.md §3-6b の倍率の打ち消しの表) | S11・S05(幻影の手榴弾) |

### H. 賞金首4型(`isBountyType`)

賞金首の帯は**毎フレーム無条件で `zoneCapsuleTick`(`pS:33365`)を呼ぶ**形(中断の消し継続のため)。ブロック=`pS:27709-28246`。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H01 押しのけの帯 | 1 | 赤 | 帯 | バス停 | `br-push-windup`→`br-push` | `zoneCapsuleTick` `pS:27744` | tele | `bT:979` | 単 | 帯窓 | 要 | | S12 |
| H02 三段突きの帯×3 | 1 | 赤 | 帯×3 | バス停 | `br-triple-windup`→`br-triple-1/2/3` | `pS:27773-27804`(段ごとの `zoneCapsuleTick` 27802) | tele | `bT:1148`(段ごと) | **3段・段ごとに別の時刻** | 帯窓 | 要 | 起点=毎フレームの本体中心(踏み込みに付いていく) | S12 |
| H03 レーザー | 2 | 紫 | 帯 | バス停 | `laser-windup`/`laser-fire` | C03 と同じ描画 | tele | `bT:1038` | 持続 | 自前(カラオケ) | 要 | 行は C03 に数えた(重複して数えない) | S12(描画は C03=S07 と同じ) |
| H04 突進の流星ライン | 1 | 赤 | 線 | 馬乗り | `bm-charge-windup`→`bm-charge` | `dashBodyLineTick` `pS:27769` | tele | 走行中の体当たり(`bT:1331` 以降) | 単 | 流星(溜め)→走りの間は走者が線を食う | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md N01)=走り出しても線は消えない(直進の型=走者の位置の割合で食う) | S12 |
| H05 360度ムチの円 | 1 | 赤 | 円 | 馬乗り | `bm-whip360-windup`/`bm-whip360` | `pS:28068-28103` | tele | `bT:1366` | 実行中は持続(窓がループ=`loopSweepProg`) | 円窓 | 要 | | S12 |
| H06 3段コンボの帯 | 1 | 赤 | 帯 | 馬乗り | `bm-combo1/2/3-windup` | `zoneCapsuleTick` `pS:27749` | tele | `bT:1389`(段ごと) | **3段・段ごとに溜め** | 帯窓 | 要 | | S12 |
| H07 懲罰狙撃の帯 | 2 | 紫(溜めも発射中も) | 帯 | 馬乗り | `bm-snipe-windup`→`bm-snipe` | 溜め `zoneCapsuleTick` `pS:27756`/発射 `strokeBeamLayers` `pS:28022`(28018-28031) | tele | `bT:1456` | 単 | 帯窓/発射は一様(④) | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md H07)=発射中も紫 | S12 |
| H08 薙ぎの帯 | 1 | 赤 | 帯 | 鋏 | `bb-sweep-windup` | `zoneCapsuleTick` `pS:27760` | tele | `bT:1561` | 単 | 帯窓 | 要 | | S12 |
| H09 薙ぎ3連の帯 | 1 | 赤 | 帯 | 鋏 | `bb-triple1/2/3-windup` | `zoneCapsuleTick` `pS:27765` | tele | `bT:1580`(段ごと) | **3段** | 帯窓 | 要 | | S12 |
| H10 跳びかかりの円 | 1 | 赤 | 円 | 鋏 | `leap-windup`/`leap-air` | `pS:28178-28209` | tele | `bT:1665`(半径の帯=点の帯) | 単 | 円窓 | 要 | | S12 |
| H11 毬の薙ぎの帯 | 1 | 赤 | 帯 | 舞妓 | `mk-naginata-windup`/`mk-naginata1/2-windup` | `drawMaikoState` `pS:43967-43970` | tele | `bT:1833/1852/1876` | 型B=2段 | 帯窓 | 要 | | S12 |
| H12 毬回しの円 | 1 | 赤 | 円 | 舞妓 | `mk-spin-windup`/`mk-spin` | `pS:44018-44038` | tele | `bT:1937` | 実行中も一様 | 円窓→live(④) | 要 | **§6-3 5 から外した**(同上) | S12 |
| H13 水鳥乱舞の着地円 | 1 | 赤 | 円 | 舞妓 | `mk-suiu-windup`→`hop1/2/3` | `pS:44043-44104` | tele | `bT:1980`(跳ねごと) | **3段・段ごと** | 円窓 | 要 | | S12 |
| H14 手毬打ちの流星ライン | 1 | 赤 | 線 | 舞妓 | `mk-boom-windup` | `dashLineTick` `pS:43971-43974` | tele | H15 の判定 | — | 流星 | 要 | | S12 |
| H15 飛ぶ手毬の当たり円 | 1 | 赤 | 円(移動) | 舞妓 | `mk-boom-out`/`mk-boom-back` | `pS:44116-44130` | tele | `bT:2068` | 持続(通る技) | live(④・`telFillA(1,1)`) | 要 | 円が毬と一緒に動く。**§6-3 5 から外した**(同上) | S12 |

### I. プレイヤー側・設置物の範囲(種3・種4)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| I01 センサー地雷の範囲円 | 2(幻影の地雷)/プレイヤーの地雷は敵に当たる側 | 幻影=紫・プレイヤー=赤(感知後の点滅) | 円 | プレイヤー(サブ)・**幻影**(幻影の地雷はプレイヤーに当たる=`utils/sensorMine.ts:125`・`uGL:15108-15125`) | `sensorMines`(感知→起爆) | `syncSensorMines` `pS:22061-22108`(円 `pS:22103-22104`) | sm | `cT:1195 applyMineDamage`・`utils/sensorMine.ts:98 tickSensorMines`(`SENSOR_MINE_RADIUS`) 半径=`m.blastR`(`sensorMineBlastRadius`・起爆と同じ式) | 地雷ごと | 円窓 | 要 | v0.25.5743 で直した(TELEGRAPH_FIXES.md I01)=幻影は紫・半径は起爆と同じ式。同じ Graphics(sm)に地雷の本体(段階2で投影済み)が混ざる | S13・S05(幻影の地雷) |
| I02 デコイの射程の円 | 3 | 青 | 円(二重線) | プレイヤー(サブ)・**幻影**(`uGL:11906`) | 置いたデコイ(`p.area`) | `syncDecoys` `pS:34327-34332` | **frontObjectLayer**(デコイの入れ物の子) | `uGL:12922`(`decoy.area`) | — | — | 要 | | S13・S05(幻影のデコイ) |
| I03 ハンターの視界の円 | 3 | 薄紫 | 円 | ハンター | 巡回・索敵中 | `syncHunterVision` `pS:35485-35501` | G(`hunterVisionGfx`) | `HUNTER_VISION_RANGE`(`gS:3624`)・`uGL:932` | — | — | 要 | 当たる円ではなく「見つかる円」 | S01 |
| I04 火炎瓶の地面の火 | 4 | 炎の絵 | 円(判定)・**絵は炎の Sprite** | プレイヤー(サブ) | `groundFires` | `syncGroundFires` `pS:21774-21843`/子の炎 `pS:21845` | actorLayer(子の足元で奥行き) | `utils/molotov.ts:85/104`(円・半径 `groundFireRadiusAt` 155) | 火ごと | — | 点(炎=1枚ずつ足元を投影・`d` を s に)・光の広がり(`view.light`)=格子メッシュ | 段階4に入れるかは「形を描いていない」ので要決定 | S13 |
| I05 氷槍の床(線) | 4 | 氷塊の絵 | 氷塊の Sprite の列(判定は幅28の帯) | プレイヤー(武器 rifle-t2-icelance) | `iceLanceFloors` | `syncIceLanceFloors` `pS:20250-20323` | effectLayer | `utils/iceLanceFloor.ts:71`(幅28) | — | — | 点(氷塊と砕けを1つずつ) | 判定幅の目安の帯(`halo`)は社長指示 2026-09-14「氷ライフルのエフェクト、青いラインは消して」で出していない(`pS:20269-20270`)=段階4でも戻さない。氷塊(`pS:20282-20296`)と砕けの Sprite だけ | S13 |
| I06 血の履帯の棘 | 4 | 赤黒 | 小円 | プレイヤー(スキル) | `bloodSpikes` | `syncBloodSpikes` `pS:21888-21905` | `groundLayer` | `gS:15276`(`BLOOD_TREADS_RADIUS_PX`) | 多数 | — | 要(小円を頂点ごと・`* d` を外す。判定を持つので方針⑥の省略はしない) | | S13 |
| I07 重力井戸の輪 | 3 | 紫系 | 輪(Sprite: 輪の素材 `getRingTexture`+柔らかい闇 `getSoftGlowTexture`) | プレイヤー(サブ) | `gravityWells` | `syncGravityWells` `pS:40213-40241` | effectLayer | 判定の行は未確認 | — | — | 格子メッシュ | §7 | S13 |
| I08 金環(サブ)の輪 | 3 | 金 | 輪(Sprite `suriel-ring`)+光線(Sprite `beamCore`/`beamHalo`) | プレイヤー(サブ) | `goldRings` | `syncGoldRings` `pS:20147-20233` | effectLayer | `utils/goldRing.ts`(行は未確認) | — | — | 輪=格子メッシュ・光線は着手時に分類(立つ光なら段階5) | §7 | S13 |
| I09 研究所の休眠ゾンビの視界 | 3 | 薄い赤 | 多角形(扇状の視界) | 研究所の休眠ゾンビ | 研究所で見える時 | `updateLabVisionCones` `pS:15196` | `groundLayer`(`labVisionLayer`・`pS:15204`) | 見つかる範囲(`utils/labStealth.ts`・行は未確認) | — | — | 要 | I03 と同じ「見つかる形」 | 対象外(研究所) |
| I10 マークスマン罠の範囲円 | 3 | 青 | 円 | プレイヤー(サブ)・**幻影**(`hostile`・`uGL:11417`) | 置いた罠(`p.area`) | `drawProjectile` `case 'trap'` `pS:39038-39045` | pj | 幻影の罠はプレイヤーを捕まえる `uGL:16002-16020` | — | — | 要 | 半径は `radius / depthD` で遠近の拡大を打ち消してある。**幻影の罠も状態異常=シアンのまま**(攻撃ではなく状態異常の印=紫の文法の対象外・TELEGRAPH_FIXES.md N04 の罠=(b)) | S13・S05(幻影の罠) |
| I11 ドローン・ブーメランの範囲リング | 3 | シアン | 円 | プレイヤー(サブ) | 止まっている間(`p.area`) | `drawProjectile` `pS:39019-39027` | pj | 行は未確認 | — | — | 要 | | S13 |
| I12 近接のリーチの輪と三日月 | 3 | 青白 `0x9ecbff`(輪)・`0x2a78ff`/`0xeaf8ff`(三日月) | 円(焼いた輪の Sprite `counterReachRing`)+弧(三日月) | プレイヤー(近接。格闘は出さない) | 近接の振りの当たる瞬間(`meleeSwingCommitAt`)から 140ms | `syncPlayerFx` `pS:46610-46666`(輪 `pS:46627-46647`・三日月 `pS:46650-46665`) | pfx | 半径 `r = huntingMeleeRadius(player)`(`pS:46516`)。判定側の行は着手時に確かめる | — | — | 要(縁の太さ=段階3の線の規則=今の太さ×k・1px の下限・濃さは落とさない) | PERSPECTIVE_PROJECTION.md §3-7 の1巡目監査 A-1 で足した(v0.25.5760 時点の漏れ)。輪は焼いた素材=格子メッシュ・三日月は弧の線(太さは判定を表さない) | S13(段階3の画=PERSPECTIVE_PROJECTION.md §3-7m の P15) |
| I13 ハンティングの溜まりの輪 | 3 | 青 `0x60a5fa`・`0xbfdbfe`・白 | 円(三重の線) | プレイヤー | `player.huntingCharged` の間 | `syncPlayerFx` `pS:46667-46676` | pfx | 半径=今の近接武器の届く距離(刀 `katanaReach`・鞭 `whipReach`・それ以外 `huntingMeleeRadius`) | — | — | 要(縁の太さ=段階3の線の規則=今の太さ×k・1px の下限・濃さは落とさない) | 同上(A-1) | S13(段階3の画=PERSPECTIVE_PROJECTION.md §3-7m の P15) |
| I14 近接のクールダウンの輪 | 3 | 灰 `0x94a3b8` | 円(線) | プレイヤー(刀以外) | `now < player.counterCooldownEnd` | `syncPlayerFx` `pS:46677-46679` | pfx | 半径 `r`(I12 と同じ) | — | — | 要(縁の太さ=段階3の線の規則=今の太さ×k・1px の下限・濃さは落とさない) | 同上(A-1) | S13(段階3の画=PERSPECTIVE_PROJECTION.md §3-7m の P15) |
| I15 刀の一閃のクールダウンの輪 | 3 | 灰 `0x94a3b8` | 円(線) | プレイヤー(刀) | 一閃のクールダウン中(`katanaDashCooldownEnd`) | `syncPlayerFx` `pS:46683-46685` | pfx | 半径 `katanaRange(player)` | — | — | 要(縁の太さ=段階3の線の規則=今の太さ×k・1px の下限・濃さは落とさない) | 同上(A-1) | S13(段階3の画=PERSPECTIVE_PROJECTION.md §3-7m の P15) |
| I16 スキャンの扇 | 3 | `newGunsFx.ts` の扇の色 | 扇(地面に倒した形=world の縦を `SCAN_FAN_GROUND_Y_SCALE` 0.36 で潰した扇) | プレイヤー(スキャンの銃) | 照準の向き(`scanFanGroundAngle`) | `NewGunsFx` `newGunsFx.ts:513-529`(`fanGfx`・`scanFanScreenPoint`) | ngf | `utils/scanSensor.ts:176 scanFanContains`(縦の潰し 0.36=`scanSensor.ts:163`) | — | — | 要(★#29=A・縁の太さ=段階3の線の規則) | 同上(A-11)。**判定に揃える形**: ★#29=A(社長裁定 2026-11-23・B から変更)で、判定の扇(0.36 で潰したまま・中心角 `scanFanGroundAngle`)をそのまま頂点ごとに投影する=描いた扇=判定の扇 | S13(段階3の画=PERSPECTIVE_PROJECTION.md §3-7m の P16) |

### J. 静的な床の印(種5)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| J01 囲いイベントの柵リング | 5 | ボスの時だけ赤系(0xef4444)・救助は緑 0x4ade80・horde は青 0x38bdf8(`pS:34726`) | 円 | 床(イベント) | `activeEvent` | `syncArena` `pS:34719-34749` | G | ゲートの半径 `aBT:152 GATE_ARENA_RADIUS`(他のイベントは未確認) | — | — | 要 | | S14 |
| J02 レスキューの待機トリガー円 | 5 | イベント色 | 円 | 床(NPC) | 待機トリガー | `syncQuestTrigger` `pS:34750-34774` | G | `utils/rescueQuestGate.ts`(行は未確認) | — | — | 要 | | S14 |
| J03 帰還サークル | 5 | — | 円 | 床 | `returnCircle` | `syncReturnCircle` `pS:34775-34824` | G | `isInReturnCircle`(`uGL:110` の import 元)・半径 `returnCircle.radius` | — | — | 要 | | S14 |
| J04 拠点候補地サークル | 5 | — | 円 | 床 | `baseSites` | `syncBaseSites` `pS:35449` | G | 行は未確認 | — | — | 要 | | S14 |
| J05 病院サークル(**撤去済み**) | 5 | — | 円 | 床 | 病院 | `syncHospital` `pS:34867`(今は円を描いていない=`pS:34928-34930` のコメント) | G | 行は未確認 | — | — | 要 | 描いているのは入口の光=K07。段階4で描く物は無い | — |
| J06 武器庫サークル | 5 | — | 円(半径50) | 床 | 制圧済み拠点の中心(`pS:35477`)・研究所のアイドル手前(`pS:35454`)・ステージ2の出張武器商人(`pS:35455`) | `drawArmory` `pS:35426-35430`(`syncArmory` `pS:34936` は円を描かない=`pS:34995-34997`) | G | 行は未確認 | — | — | 要 | 3か所から呼ばれる | S14 |
| J07 武将の祠の3秒サークル | 5 | — | 円 | 床 | 祠 | `syncShrines` `pS:35303` | G(+光 `shrineGlowGfx`=actorLayer) | 行は未確認 | — | — | 要 | | S14 |
| J08 城ボス戦の移動制限リング | 5 | 赤系(0xf87171) | 円(半径4500) | 床 | `castleFightNow` | `sync` 内 `pS:11874-11883` | G | `src/world/playableArea.ts:152/164`(`CASTLE_FIGHT_MAX_DIST`) | — | — | 要(巨大な円=分割数に注意) | | S14 |
| J09 訓練の移動制限ライン | 5 | 青 | 線(縦) | 床 | `farBackdrop==='tutorial'` | `sync` 内 `pS:11884-11906` | G | `TUTORIAL_MOVE_*`(`uGL:90` の import 元) | — | — | 要 | | S14 |
| J10 EX結界/南の膜 | 5 | 金 | 帯(横の膜) | 床 | `s.exBarrier` | `sync` 内 `pS:11908-` | G | 行は未確認 | — | — | 要 | | S14 |
| J11 区域の境界テープ | 5 | — | 線 | 床 | 区域の境 | `syncAreaBoundaryTape` `pS:45396` | `groundLayer`(`pS:6901`) | 行は未確認 | — | — | 要 | | S14 |
| J12 研究所の床のプレート | 5 | — | 矩形 | 床 | `updateLabFloorPlate(show)` | `pS:8878-8891` | 未確認 | 行は未確認 | — | — | 要 | | 対象外(研究所) |
| J14 ボスの当たり判定の枠(開発用・**段階4の対象外**) | 5 | 赤系 | 矩形 | ボス | `?bosshitbox=1`・ボスメーカーの判定トグル | `drawEnemy` `pS:27191-27228` | tele | 判定の箱そのもの | — | — | 対象外 | 既定OFF。製品の画面には出ない | — |
| J13 錬金の陣(足元) | 5(判定は未確認) | シアン | 円(Sprite `magic-circle`)+リズムの輪(Graphics `alchemyRhythmGfx`) | プレイヤー | 錬金のリズム | `syncAlchemyCircle` `pS:12528-12564`(`alchemyCircle`/`alchemyRhythmGfx`) | G | 判定の有無は未確認 | — | — | 陣=格子メッシュ・リズムの輪=陣と同じ中心と半径で投影 | §7 | S14 |
| J15 商人の滞在サークル | 5 | — | 円 | 床(商人) | 商人の前 | `syncMerchant` `pS:13560-13575` | 未確認 | `gS:19024 updateMerchantDwell` | — | — | 要 | | S14 |
| J16 研究所のボタンの円 | 5 | — | 円(`LAB_BUTTON.radius`=60・`world/labMap.ts:104-110`) | 床(研究所) | ボタン | `syncLab` `pS:39381-39382` | 未確認 | `uGL:17849-17854` | — | — | 要 | | 対象外(研究所) |
| J17 研究所のゴール区画の矩形 | 5 | — | 矩形(`LAB_GOAL_TRIGGER`) | 床(研究所) | ゴール | `syncLab` `pS:39383` | 未確認 | `world/labMap.ts:142`・`uGL:17844` | — | — | 要(4隅) | J12 とは別の絵 | 対象外(研究所) |

### K. 判定を持たない地面の形(種6)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 | 多段 | 位相 | 頂点投影 | 備考 | 確かめた場面 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| K01 水たまり | 6 | — | 不定形 | 床(天候「雨上がり」) | `?weather=wet`・ステージ7の雨 | `WeatherWetLayer.sync` `src/pixi/weatherWet.ts:505`(呼び `pS:14262`) | `groundLayer`(+雨粒 `danceUiLayer`) | なし | — | — | 要 | 1,380行の別ファイル=中の図形は数えていない(§7) | S15 |
| K02 強glowの光だまり | 6 | 光源の色 | 楕円 | 光源 | `registerWorldLight` の `pool` | `syncGlowGroundPools` `pS:6086` | `glowGroundLayer`(groundLayer の中) | なし | — | — | 要 | | S06(爆発の強glow)・S15(松明) |
| K03 プレイヤーの光だまり | 6 | — | 楕円 | プレイヤー | 常時 | `playerGroundPool`/`playerLight`(`pS:6763-6764`)の更新(関数名は未確認) | groundLayer | なし | — | — | 要 | | S15 |
| K04 松明の床の光だまり | 6 | 暖色 | 楕円 | 松明・焚き火 | 常時 | `makeProp` の `reflection`(`pS:8587-8592`) | groundLayer | なし | — | — | 段階1で点として通す方針(§2-1 の表) | | 段階1で済み |
| K05 月の光だまり | 6 | — | 楕円 | 床 | 月明かり | `syncMoonPool` `pS:7734`(`stageLightShaftGfx`) | 未確認 | なし | — | — | 要 | | S15 |
| K06 床のひび | 6 | — | 放射のひび | 着地・踏み込み | 敵の跳び着地 `pS:30657`・偶像の着地 `pS:30683`・城ボスの踏み込み `pS:30909`・プレイヤーのワイヤー `pS:24473` | `latchGroundCrack` `pS:38178`→`drawGroundCrack` `pS:38145`(`crackPool`) | groundLayer | なし | 回ごと | — | 要 | | S06(踏み込み・着地)・S11(偶像の着地) |
| K07 建物の入口の光の線 | 6 | 白 | 線 | 病院・武器庫・交番 | 常時 | `drawPoiThreshold` `pS:35008-35051`(交番 `syncPolice` `pS:35058`) | G | なし | — | — | 段階1で処理済み(`a4/b4` は投影済みの点) | 段階1の表にある | 段階1で済み |
| K08 ワープ・召喚の魔法陣 | 6 | 緑/紫/黄 | 円(焼き素材) | リッチ(`pS:30395-30428`)・アクラシエル(`pS:30367-30388`)・ジブリル(`pS:30434-30450`) | ワープ・転移 | `drawWarpCircle` `pS:33975` | 未確認(`pruneWarpCircles` `pS:25256`) | なし(②) | 開閉 | — | 要(寝かせた陣) | | S01(リッチ)・S09(天使) |
| K09 城ボス/賞金首の召喚陣 | 6 | 赤系/金 | 円(焼き素材) | 城・賞金首 | 出現 | `castleSummonCircle`(`syncCastle` `pS:13044`)・`drawBountySummonCircle` `pS:43359` | groundLayer/effectLayer | なし | — | — | 要 | | S06・S12 |
| K10 英雄の突進の道筋(蹄跡) | 6 | 骨色 | 小楕円の列 | 英雄 | `heroMove` charge/leapcharge | `drawHeroTelegraph` `pS:42350-42365` | tele | なし(赤にしない=当たらない意図) | — | — | 要(`drawHeroTelegraph` の tele の Graphics=部品で頂点ごと) | | S04 |
| K11 星弓の落下点の影 | 6 | 黒+青 | 楕円 | ヨルムンガンド | `jrain`(`jormRainLobs` の `landAt`) | `drawJormRain` `pS:36623-36635` | 未確認(`drawJormRain` 内の g) | なし(着地で弾を撒くだけ `uGL:8839-8846`) | 多数 | — | 要 | | S07 |
| K12 凍てつく牙の輪の印 | 6 | 青 | 円・弧の印 | ヨルムンガンド | `jfreeze`(`jormFreezeRings`) | `drawJormRain` `pS:36665-36765` | 同上 | なし(当たるのは弾) | 輪ごと | — | 要 | | S07 |
| K14 ホロの魔法陣 | 6 | ホロ色 | 円(焼き素材) | ミゲル・ジブリル | `volley-windup`/`volley`(`drawHoloVolleyCircle` `pS:41433`)・ジブリル `warp-windup`(`drawHoloMiniAt` `pS:41452`) | 呼び `pS:29541-29555` | 未確認 | なし(②) | — | — | 要(寝かせた陣) | K08 と同じ扱い | S09 |
| K13 プレイヤーの矢の雨の影 | 6 | 黒 | 小楕円 | プレイヤー(スキル) | `arrowRainShots`/`arrowRainStuck` | `syncPlayerArrowRain` `pS:21729-21767` | groundLayer | 当たるのは矢の着地点(`utils/arrowRain.ts`) | 多数 | — | 要(`ds` を外して頂点ごと・PERSPECTIVE_PROJECTION.md §3-6b の倍率の表) | | S13 |
| K15 宇宙飛行士の残骸の地面の楕円 | 6 | 黒・暗い土色 | 楕円(影・跡) | 宇宙飛行士群(周りに降る残骸 `ambient`) | 残骸が地面に落ちた後 | `syncAstroScatter` `pS:21180`(地面の楕円 `gu`・`g` の `ellipse`・`s = 0.95 * p.scale * ds`) | `gu`/`g`(`syncAstroScatter` の引数の Graphics) | なし | 多数 | — | 要(`ds` を外して頂点ごと) | v0.25.5748 の監査で表外として見つかった(§6-4)。間引き `distanceOutsideViewport` `pS:21185` | S03 |

---

## 4. 総数と種類ごとの件数(監査の反映後に数え直し)

**表の行数 = 167**(A23・B28・C10・D7(D06b を含む)・E24(E05b・E02b・E12b を含む)・F10・G7・H15・I11・J17・K15)。v0.25.5747 で A21〜A23・D06b・E02b・E12b の6行を足した(初版は160)。
うち H03(バス停のレーザー)は C03 と**同じ描画**を持ち主ごとに分けた行なので、**描く物としては 158**(J05 病院サークルは撤去済みの記録行=描く物なし)。
J14(ボスの当たり判定の枠)は開発用で**段階4の対象外**。

**追記(PERSPECTIVE_PROJECTION.md §3-7 段階3の1巡目監査 A-1・A-11)**: I12〜I16 の5行を足した(主人公の近接・ハンティング・クールダウンの輪とスキャンの扇=判定の半径を持つ形で、v0.25.5748 の取り直しで漏れていた物)。**表の行数は 172・種3 は 13 行**(下の表と式の数はこの5行を足す前の値のまま)。投影は段階3の作業の中で段階4の部品を使って行う。

| 種類(依頼の1〜6) | 行数 | 行 |
|---|---|---|
| 1 赤い予告 | **101** | A01 A02 A03 A05 A06 A07 A08 A09 A10 A13 A15 A17 A19 A20 / B01〜B06 B08〜B23 B26〜B28 / C01 C02 C05〜C09 / D02〜D06 D06b / E01〜E03 E02b E06〜E21 E12b / F01〜F10 / G01 G02 G04〜G06 / H01 H02 H04〜H06 H08〜H15 |
| 2 紫の予告 | **21** | A04(使者の常設の接触円) A21(卵の起爆の点滅の輪) A22(幻影のタレット) A23(ゾンビの印) A11 A12 A16 A18 B07 B24(血の弧の遅延円=紫) C03 C04 C10 D01(無の境地) E04 E05 G03 G07 H03 H07(v0.25.5743 で発射中も紫) I01(幻影の地雷=v0.25.5743 で紫) |
| 3 攻撃範囲・射程の円 | **8** | A14(花束=回復の範囲) I02 I03 I07 I08 I09 I10 I11 |
| 4 判定を持つ床 | **5** | B25(グレンの血溜まり) E05b(ランタン火の起動後) I04 I05 I06 |
| 5 静的な床の印 | **17** | J01〜J17(J14 は対象外の注記つき・J05 は撤去済みの記録行) |
| 6 判定を持たない地面の形 | **15** | K01〜K15 |

- 段階4で**判定と結び付く行**(種1〜4)= A〜I の **135 行**(初版の129+v0.25.5747 で足した6行)。
- 形の内訳(足した6行は 円2(A21=線だけ・A22)・線1(A23)・帯3(D06b・E02b・E12b)。以下は E05b を足す前の A〜I の128行・「形」欄の先頭の語で機械的に数えた。E05b は円=円 +1): 円 **53**・帯 **48**・線 **17**・扇 **3**・輪 **3**・同上 **1**・環状の扇 **1**・矩形 **1**・多角形 **1**(A19 の「円/扇/帯」は円に入れ、A20 は「同上」)。
- 層の内訳(種1・2の116行): 敵の入れ物の子(tele/oT)が大半。**groundLayer の Graphics**=A01〜A06(pT/mM)・A09(cr)・A10〜A13(ast)・A15(lib)・A16(wr)・A17(gb)・E04/E05(bf)・E18(acS)・I01(sm)。**effectLayer**=A18・C07〜C09・E06・E07・F10。**弾の Graphics(frontObjectLayer)**=G07。

> 数え直し用の式: `grep -cE "^\| [A-K][0-9][0-9][a-z]? " research/TELEGRAPH_INVENTORY.md` → 167 / `grep -cE "^\| [A-I][0-9][0-9][a-z]? "` → 135 / `grep -c "^| N[0-9][0-9] "` → 15(§5・うち N03 と N11 は「攻撃ではない」記録の行=攻撃は13) / 種類ごと=各行の2列目の先頭の数字。

## 5. 「予告なし」の攻撃(当たるのに、地面に赤/紫の形が出ない物)

段階4とは別件(CLAUDE.md の「赤い予告の4つの掟」では、予告の無い攻撃は違反)。**分類**: ①=本当に何も出ない ②=弾(全ボス共通の赤い二重丸が危険の絵=地面には出さない文法) ③=形は出ないが体の色(点滅)で知らせる ④=社長裁定で意図的に出さない。

> **訂正(research/TELEGRAPH_FIXES.md §8 順14 の反映)**: 設計書の分類 (b)「記録の訂正で済む」と「社長裁定で予告なし」(2026-11-22)を下の表の各行の備考に書き込んだ。(b)=N04 の銃・援護射撃/発火ナイフの飛翔/発火ナイフの爆発/罠・N07・N08・N09・N10・N15・B17(本表 C の行)・H12/H15/E19/E20(本表の行)。社長裁定で予告なし=N04 の格闘・近接・拳鬼の秘奥義/N13 幻影のドッグ/N14 幻影の分身。(a) で直した物(N01・N02・N05・N06・N12・G07・I01 ほか)は設計書の側が正。

| # | 攻撃 | 持ち主・入口 | 判定 | 分類 | 備考 |
|---|---|---|---|---|---|
| N01 | 突進の走行中の体当たり | 犬・研究所Lv2・ハンター・城ボス(`g-dash-charge`/`g-quad-charge``)・裏ボス `dash`・トール `thor-dash-move`(判定は帯=D06)・馬乗り `bm-charge`・ミゲル `mdash-move` | `cT:1618`(`isBodySlamNow`) | ④ | 城ボスの `g-dive-windup` は外した(溜めの間は本体が -20000 へ退いていて触れられない=`gS:3907`・`gS:20988`・`gS:21619`)。 ミゲルは線が走行中も残る(E02)。ウリの `thrust` は体当たりではなく帯の判定(`aBT:2448-2460`・E12)。体幅の帯は**社長裁定 2026-09-18 で撤去**(CLAUDE.md)。**訂正(v0.25.5743・TELEGRAPH_FIXES.md N01・1-0)**: 「他は走り出しで赤が消える」は今は誤り。犬・研究所Lv2・大蝙蝠・ハンター(A06)・城ボス(B06・B07)・裏ボス(C01)・馬乗り(H04)は走り出しても線が残り、走者が根元から食う(`dashBodyLineTick`)。トール・ミゲル・ウリは走る道の線+斬り抜けの帯(D06/D06b・E02/E02b・E12/E12b) |
| N02 | 跳びの滞空中の体の接触 | ラフィ `jump-attack`・鋏 `leap-air` の2型だけ | 着地円(E08・H10)とは別に飛行経路の体の接触が生きている(`cT:1618` の接触) | ① | パンプキン等の `jump`(`cT:1974`)・舞妓 `mk-suiu-hop*`・フィル `phill-dive-fall` は体に触れてもダメージなし=外した。トールの `tsuki`・`issen-dash`・`jump-attack` は `cT:1956-1957` で除外。急降下の溜めは N01 |
| N03 | (訂正)死神本体の接触 | 死神(reaper) | **ダメージなし**(`cT:1970-1973`・`isReaperFamily` は `reaper` だけ=`enemyUtils.ts:364`) | — | 予告なしの攻撃ではない(記録のみ)。接触で当たるのは使者だけ=A04 |
| N04 | 幻影の格闘・武器・サブウェポン(拳鬼の格闘含む) | guardian-phantom(`gp-brawler` 等)。サブウェポンの経路は `uGL` 側(タレット・ドッグ・分身・地雷・罠・囮・手榴弾・援護射撃=紫の弾・発火ナイフ・炎の延焼) | `utils/phantomBrawlerTick.ts:275`・`utils/phantomTick.ts`・`uGL`(下の N12〜N15・援護射撃と発火ナイフ `uGL:12321`・`12838`・`12461-12489`) | ④ | 「プレイヤーと同じ即発」の設計(GHOST_BOSS.md v6)。拳鬼の秘奥義の気功の爆ぜ(`phantomBrawlerTick.ts:640-690`・`:686`)も予告なし。形が出るのは炎の扇 A18・地雷 I01・罠 I10・囮 I02・手榴弾 G07 だけ。**訂正**: 格闘・近接の振り・拳鬼の秘奥義の気功の爆ぜ・踏み・蹴り(`phantomBrawlerTick.ts:275 strikePlayer`・`:676-689`)=**社長裁定 2026-11-22 で予告なし**(即発の決闘の設計)。銃・援護射撃=紫の弾(`noCounter`)=弾の文法で読める(b)。発火ナイフの飛翔=紫に塗った刃が見えている(b)。発火ナイフの爆発=刺さる相手・爆発の相手は敵だけでプレイヤーに当たる経路が無い=**攻撃ではない**のでこの行から外す(b)。罠=状態異常の印でシアンのまま(b・I10)。幻影のタレットの爆発は N12・手榴弾は G07・地雷は I01 で予告を足した |
| N05 | ゾンビの紫の追尾(体当たり) | ゾンビ `zpause`→`zrush` | `enemyBite.ts:656 ZOMBIE_RUSH_BODY_SLAM_MS`・`isBodySlamNow` | ③ | 体の紫の点滅(`BITE_BLINK_TINT` `enemyBite.ts:934`)だけ。**v0.25.5743 で予告を足した**=ゾンビの紫の追尾の印(A23・判定と同じ述語 `isZombieRushBodySlamNow`) |
| N06 | 抱卵型の卵(地雷) | 抱卵型(ghost)が撒く `breakableProps` type `mine`・世界に置かれる卵(畑・待ち伏せ・圧力=`src/world/mines.ts:14 MineInstance`)・包囲イベントの卵の輪(`gS:24425 spawnEggRing`・`egg-evt-`) | `gS:5125/17043/25847`(壊れた時の処理) | ① | 当たる(同じ爆発の処理 `uGL:17255-17271`・半径80)。卵の絵が armed で光るだけで**範囲の円は無い**=予告なしで確定。v0.25.5743 で紫の円窓を足した(社長裁定6「紫に揃える」)が、社長指示「緑卵の爆発範囲内表示やめる」で撤去。**さらに社長裁定(2026-11-22)「起爆モードに入った一瞬、ピピっとサークルの線で範囲を表示」に変更**=起爆モードに入った瞬間だけ、判定と同じ中心と半径の紫の線(`0xc084fc`・塗りなし)を短く2回点滅(約250ms)=A21。常に出る予告は無い。卵の本体の光(紫のひび・小さめの光の輪)は残る |
| N07 | スカジの氷結の檻の溜め | `cage-windup` | 溜め明けに氷塊が置かれ、その円(C08)が予告になる | ③ | 溜めの間は体の震えだけ。**訂正(b)**: 溜めそのものは当たらない。当たる物(氷塊)は置いた瞬間から円窓の流星で出る(C08)=「攻撃の予告なし」から外す |
| N08 | ジブリルの聖別の溜め | `consecrate-windup` | 同上(E05) | ③ | ランタンを掲げる絵だけ。**訂正(b)**: 同上(火の環 E05 が置いた瞬間から出る)=「攻撃の予告なし」から外す |
| N09 | 弾の技(地面の形なし) | ミーミル族 `aim-burst`/`burst`(ミーミル族の方)/`aim-radial`/`radial`・`jwave`/`jrain`/`jfreeze` の弾・城ボス `g-bolt-*`/`g-tailslam-volley`・ミゲル/ジブリル `volley`・ウリ `bolt`・スリィエル/アクラシエル `gaze`(アクラシエルは線 E21 あり)・鋏 `bb-quickshot`・フィル `phill-lancefan`/`phill-meteor`・偶像 `idol-aim`/`fan`/`orb`/`s*`(線 G01-G05 あり)・プラントの種・拳鬼の気功(`phantomBrawlerTick.ts:630`)・アクラシエルの転移の破片弾(`aBT:3215-3222`)・爆発の破片弾(`aBT:3236-3240`)・結晶の槍の起爆の3方向の破片弾(`aBT:4003-4011`)・ミーミルの車輪の追尾弾(`uGL:8669-8681 mimirWheelHoming`)・グレン第二形態の胴体弾(`gS:24118-24125`・`srcMoveKey 'g-parts'`)・バス停の中立射撃(`brPattern` の charge/fan・`bT:887-926`)・幻影の援護射撃(hostile+noCounter=紫の弾)と発火ナイフ(`uGL:12321`・`12838`・`12461-12489`)(※刃=氷刃・骨刃・羽根・墓石は通り道の帯がある=C09 E06 E07 F10 A17) | `cT:1007 applyEnemyProjectileHits` | ② | 弾そのものが共通の赤い二重丸(CLAUDE.md「色と形の文法」③)。**偶像は線を出すのに他のボスは出さない**=揃っていない。**訂正(b)**: 弾は最初のフレームから描かれ発射の閃光も出る・画面外の間引きなし=弾の文法で読める(違反ではない)。全ボスへ射線は足さない(弾を見てから捌く読みが弾の価値) |
| N10 | 噛みつきの線が出ない噛み | 噛みつき化した敵のうち `biteDirX/Y` が未設定の瞬間 | `biteTelegraph.ts:265` で線を返さない | ① | 起きうるかは未確認(§7)。**訂正(b)**: 前提「`biteDirX/Y` が未定義で線が出ない」は誤り。**線は出る。踏み込み `lp` が小さい噛みでは長さが下限(`MIN_DRAWN_PX`)まで縮む場合がある**(`biteLineLength.test.ts` が全敵の噛みで下限以上を固定) |
| N12 | 幻影のタレットが消える時の爆発 | 幻影のタレット | `uGL:14591-14630`(`TURRET_EXPLOSION_RADIUS×tExMult`) | ① | 範囲の円なし。**v0.25.5743 で紫の円を足した**(A22・半径は幻影のビルド=社長裁定2) |
| N13 | 幻影のドッグの噛み | 幻影のドッグ | `uGL:11524-11549`(`DOG_BITE_RADIUS`) | ④ | **社長裁定 2026-11-22 で予告なし**(紫の円の案に「いらない」)。検討の記録は TELEGRAPH_FIXES.md §9 |
| N14 | 幻影の分身の近接 | 幻影の分身(`gpShadowClone`・`uGL:12867-12869`) | `gS:14997-15025 phantomShadowCloneStrike`(中心から `meleeRange` の円・`gS:15018`・当たると `damagePlayer` `gS:15025`) | ④ | プレイヤーに当たる=コードで確認。**社長裁定 2026-11-22 で予告なし**(幻影の近接に含める)。元からある紫の斬撃+リング(`gS:15028-15029`)はそのまま |
| N15 | 幻影の炎の延焼 | 幻影の火炎放射(A18 の扇の後) | `phantomTick.ts:1147-1163 tickPlayerFlamerBurn`(約2.5秒=`flamerCone.ts:17 FLAMER_BURN_MS`) | — | 紫の扇を出た後も削り続ける。幻影が倒れた後も続く。**訂正(b)**: 攻撃の予告なしではなく**状態(延焼)**。原因の扇は A18、燃えている間は体の炎(`syncPlayerBurn`) |
| N11 | (参考)骸骨の噛みの前の溜め(しゃがみ) | `s-crouch` | 判定なし(線は `s-arc` の頭から) | — | 判定を持たないので違反ではない(記録のみ) |

---

## 6. 片方にしか無かった物と、その解決/台帳を作る途中で見つけた食い違い

### 6-1. 入口にあって絵に無かった物

| 入口 | 解決 |
|---|---|
| `g-bolt-*`・`g-tailslam-volley`・`aim-burst`/`radial`/`jwave`/`jrain`/`jfreeze`・`volley`・`bolt`・`gaze`・`phill-lancefan`/`meteor`・`bb-quickshot` | 弾だけ=§5 N09 |
| `cage-windup`(スカジ)・`consecrate-windup` | 溜め明けに設置物が出て、その円が予告=C08・E05(§5 N07・N08) |
| `lattice-windup` | 色の grep には `drawEnemy` の呼び出し1行しか出ない → `drawSkadiLattice` を開いて紫の帯と確認(C10) |
| `g-talon-windup`/`g-boon-windup`/`g-nihil-chant*` | `drawEnemy` の分岐の骨組み(i)には出ない(遅延キューの描画が状態を見ずに回る)→ `giantDelayedHits` の描画 `pS:32325` で拾った(B23・B24・B26) |
| `idol-nade-windup` | `drawEnemy` には震えだけ → 弾の描画 `drawProjectile` の `p.hostile` 枝で拾った(G07) |
| `lich-blink` | `drawEnemy` 側は緑の陣だけ → `syncPumpkinTelegraph` で赤い円(A03) |
| `hero-*` 全部 | 州は共通、形は `heroShape` → `drawHeroTelegraph` 1本(A19・A20) |
| `ring-move-windup` | 環が動くだけで判定なし(`aBT:2666-2688` を読んで確認)=行なし |
| `issen-nihil` | 判定(ダメージ)なし・振ると一閃の円 → D01 として載せた |

### 6-2. 絵にあって入口の数えに出なかった物

| 絵 | 解決 |
|---|---|
| `syncSkadiHazards` の刃の帯 | 入口は `skadiIceBlades`(GameState)で、**4者が共用**(スカジの刃・ラフィの骨刃/刃2連・フィルの羽根・亡霊の墓石)→ 持ち主ごとに行を分けた(C09・E06・E07・F10・A17) |
| `syncLibertyArrows`・`syncAstroThrowsBody`・`syncWraithTelegraph`・`syncLabCrawler` | 州ではなく各 tick の配列/時刻が入口(変異は `aiPhase`/`bossState` を使わない)→ A09-A16 |
| `syncPhantomFlamer` | 幻影の武器の時刻(`flamerCone.ts`)が入口 → A18 |
| `syncSensorMines`・`syncDecoys`・`syncHunterVision` | プレイヤー側/視界=種3 → I01-I03 |
| `bossBiteTick`・`mobMeteorTick` | 州ではなく `biteAt` が入口(全敵共通の噛みつき化)→ A01・A02 |
| 完了ラッチ(スリィエル `pS:30254-30316`・ミゲル/ラフィ/ウリ `pS:30091-30200`) | 硬直に入った後も尾を引く**同じ予告の続き**=別の行にせず、元の行の欄7に行番号を足した |

### 6-3. 食い違い(台帳づくりの途中で見つけた・初版の時点では直していない)

> **v0.25.5747 の追記**: 1・1b(E11)・1c(G07)・1d(I01)・1e(E03)・1f(E05b)・1h・1i(突進)・2(描く幅の出どころ)・4(H07)・5 の E21/C04 は **v0.25.5743 で直した**(`research/TELEGRAPH_FIXES.md`。直し方と今の形は本表の各行の備考)。6(A01)は段階4の設計(PERSPECTIVE_PROJECTION.md §3-6b の原則1=ずらした点をそのまま投影)で扱いを決めた。7 は今も事実。

1. **E11 ウリの振り下ろし: 赤の半幅=`HB_TH.tsuki.halfWidth`(15)/判定の半幅=`UR_T.downslash.halfWidth`(40)**(`pS:29775`・`pS:29783` と `aBT:2383`)。`angelScript.ts:201` のコメントに「halfWidth 15→40 = v0.25.3589 ボスメーカー貼り戻し(社長確定)」とあり、**描く側だけ15のまま**に見える=「赤くないのに当たる」の疑い。実機で未確認。
1b. **(確定・監査)** 上の1は監査で確定: 描く半幅15=`hiddenBossScript.ts:307 HB_TH.tsuki.halfWidth`(`pS:29775`/`29783`)、判定の半幅40=`angelScript.ts:202 UR_T.downslash.halfWidth`(`aBT:2383`)。
1c. **敵の手榴弾の紫の円が遠近で拡大・縮小される**(G07): `pS:38856` で設置物扱い→円は `HEAVY_GRENADE_RADIUS`(`pS:38988-38990`)→`pS:39112` の `g.scale.set(depthD)` で **R×depthD** になる。罠(I10)と囮は `radius / depthD` で補正済みだが手榴弾だけ抜けている。判定は固定(`uGL:14835-14854`)。
1d. **幻影の地雷(I01)の色と半径**: 返せない攻撃なのに赤で描く(`pS:22102`)。爆発半径は判定=`SENSOR_MINE_RADIUS × skillExplosionMult × heavyGunnerExplosionMult(smActor)`(`uGL:15076-15080`)、描く円は固定(`pS:22102-22104`)=smActor がプレイヤーに戻る時にプレイヤーのエクスプローダーで判定だけ広がる(潜伏)。
1e. **E03 ランスの進みの上限 0.97**(`pS:29672`): 3本が別の時刻で当たる技で、赤が消え切る前に当たる=掟③(消え切る=当たる)からわずかに外れる。
1f. **ジブリルのランタン火の起動後(E05b)**: 当たる間(`aBT:3948-3956`)に判定と一致する形が無い(炎の絵とグロー r*3.2 だけ=`pS:22018-22043`)。
1h. **D06 トールの突進**: 線は `thor-dash-windup` の間だけ(`pS:28799-28803`)で、当たるのは `thor-dash-move` の到達時(`uGL:9367`→`9380`・230ms後)=赤が消えてから当たる(掟③④の違反)。ミゲル(E02)・ウリ(E12)は走る間も線が残る。
1i. **D06・E02・E12 の突進線の幅**: 線は幅6px(`drawAngelDashLine` `pS:33448-33450`)、判定の帯は幅80(半幅40)=赤くないのに当たる。
2. **描く幅と判定の幅の出どころが別の帯**(今は値が一致=潜伏): C05 うねり(描く `HB_TH.harai`/判定 `HB_JO.coil`)・E09 ラフィ(`HB_TH.harai`/`RF_T.sweep`)・E10 ウリ大薙ぎ(`HB_TH.harai`/`UR_T.sweep`)・E15 スリィエル(`HB_TH.harai`/`SR_T.sweep`)。ボスメーカーで片方だけ動かすと崩れる。段階4で描き直す時に**判定と同じ定数を読む**よう揃えるのが安全。
   - E04/E05 ランタン火の予告円: 描く側は直書きの `HITR = 22`(`pS:21993`)、判定は `JB_T.fire.radius`=22(今は一致=潜伏)。
3. **C02 ミーミルの噛みの円**: 監査で一致を確認(別名・216)=食い違いではない。
4. **H07 懲罰狙撃**: 溜めは紫(返せない)・発射中の線は赤(`pS:28023`・`28029`)。
5. **掟①(流星)から外れて見える物**: E21 アクラシエルの凝視の線(濃くなるだけ)・C04 ミーミルの車輪(紫・濃くなるだけ・例外のレーザーとは別の技)・B17 氷結波の輪(一定)・H12/H15/E19/E20 の実行中の一様な塗り(当たり得る間の赤=掟④側の扱いとして意図かもしれない)。
   - **訂正(TELEGRAPH_FIXES.md)**: B17・H12/H15/E19/E20 は (b)=溜めは円窓・実行中は判定そのもの/live(④)でここから外した。E21・C04 は (a) で流星へ直した。
6. **A01 雑魚の噛みの線は足元へ写して描く**(判定の中心から `e.height/2` 等ずらしてある)=段階4で「判定どおりの位置」を投影すると今の絵と位置が変わる。どちらを正にするかは要決定。
7. **層が `effectLayer` の予告**: C07-C09・E06・E07・F10(skH)・A18(ffl)。他の予告(groundLayer/敵の入れ物)と層が違う。

---

### 6-4. v0.25.5748 の整合監査で見つかった表外の図形(行を作らず、段階4の扱いだけ決めた物+K15)

| 図形 | 描く関数 | 扱い |
|---|---|---|
| 光線の先端の段と粒 | `drawBeamTipGfx` `pS:20505`(段=Graphics の四角 `pS:20543`・粒=Sprite。呼び: レーザー・回転レーザー・ランス・E13 射出 ほか) | 段階4で**投影する**(四角は `projPoly`・粒は自分の点+s)。親の行(C03・C04・E03・E13)の続きとして扱う |
| 円の縁の刻み | `drawRimNotches` `pS:34427`(A22 幻影のタレットの円 ほか) | 段階4で**投影する**(刻みの両端を world で出して細い線) |
| 凝視の金の閃光 | `drawGazeFlash` `pS:33874`(判定の無い飾り) | **段階3**(派手さの絵) |
| 宇宙飛行士の残骸の地面の楕円 | `syncAstroScatter` `pS:21180` | **K15 として行を足した** |

## 7. 数えられなかった・自信のない所

- **`drawEnemy`(`pS:25759-32553`・約6,800行)は全部は読んでいない。** 分岐の骨組み(§2-1 (i))と色の grep (h) で予告の行を拾い、拾った行の前後だけ読んだ。**ヘルパを通らず、赤・紫以外の色で予告を描いている所**(例: 0xff5555・0xff6b6b・0xff3030 だけを使う所)は (h) の式に入っていない色があり、取りこぼしの可能性がある。監査で数え直す時は `0xff3030|0xff5555|0xff5a5a|0xff6b6b|0xa855f7|0xd8b4fe` も足すこと。
- **`pS:25759-27242`(`drawEnemy` の前半=体の描き方)** には州の比較が多数あるが、予告の色の行は出なかった(体の色・スカッシュ・武器だけと判断)。
- **段階1の物(デカール・入口の帯・伸びる影)・段階2の物(足元の影)は数えていない**(依頼の6種に入らないと判断)。
- **`weatherWet.ts`(1,380行)・`stage1Night.ts`・`stage5Battlefield.ts`・`objShadeOverlay.ts` の中の地面の図形**は関数単位で1行(K01 等)にまとめ、中の図形は数えていない。
- **判定の行が未確認**: J01(ゲート以外のイベント)・J02・J04-J07・J10-J13・I07・I08・K03・K05 の層。
- **N10**(噛みつきで線が出ない瞬間)が実際に起きるか未確認。
- **I04 火炎瓶の床**は判定が円なのに円を描いていない(炎の絵だけ)。段階4の扱いは決めた=炎を1枚ずつ点で置く(PERSPECTIVE_PROJECTION.md §3-6a)。
- **行番号の幅**(`pS:29568-29593` 等)は分岐の範囲の目安。予告の図形の呼び出し行は単独の行番号で書いた方が正確(欄7のカッコ内)。
- **実機の画は見ていない**(ヘッドレス撮影はしていない)。「描く関数がある」=「画面に出ている」ではない(CLAUDE.md「実在確認の掟」)。とくに F01 は「1発目が描かれない」前例がある技。
- **`GIANT_SCRIPT_ENABLED` が偽の時の城ボス**(汎用の `jump`/`windup` を使う=A05・A06 に乗る)は、今の既定でどちらが動いているかを確かめていない。
- 赤い予告の焼き素材(`rings`・`bands`・`bandSlices`)は欄7で予告の行に含めた。**衝撃波(`drawShockwave`)・爪痕(`drawClawMark`)・斬撃の弧(`drawSlashArc`)・爆発の破片(`burstFrag`)・棘の突き出し(`spikeThrust`)は②(派手さ)と判断して行を作っていない**(段階3と4のどちらで扱うかは決めた=予告に沿って置かれる絵なので段階4・斬撃の弧だけ段階3。PERSPECTIVE_PROJECTION.md §3-6a)。

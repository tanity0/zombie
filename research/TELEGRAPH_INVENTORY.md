# 判定と結び付いた「形」の絵の全数台帳(段階4「形を持つもの」の入力)

- 用途: `research/PERSPECTIVE_PROJECTION.md` §3-2 の段階4(赤い予告・攻撃範囲・射程の円・判定を持つ床・静的な床の印・水たまり・光だまり・床のひび)を、地面と同じ投影で描き直す時の**漏れ止め**。
- 合格条件: **漏れゼロ**。この台帳を見ない監査役がコードから数え直して突き合わせる前提で、**数え方(grep の式・入口の一覧)を §1・§2 に残す**。
- 対象のコード: `claude/chat-context-continuity-saxlH` の `155a300`(v0.25.5741)。**行番号はこの版の値**(版が進むとずれる。名札と関数名で引き直すこと)。
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
| 「爆風経由」 | 積む側が `pumpkinBlasts` へ1件積み、`cT:286 applyPumpkinBlastDamage` が当てる(円=中心距離 ≤ 半径+自機半身14px・帯=`capsule`・扇=`fan`) |
| 「遅延キュー」 | `Enemy.giantDelayedHits`(`types/game.ts:1366`)。積む側→`gS:20554` が `fireAt` で `pumpkinBlasts` へ書き写す→爆風経由 |

### 層の略号

| 略号 | 実体 | 置き場所 |
|---|---|---|
| tele | 敵ごとの `view.tele`(Graphics) | **敵の入れ物の子**(`actorLayer`・`pS:8534-8538`)。焼き素材(`view.rings`/`bands`/`bandSlices`/`clawMarks`/`shockwaves`/`spikeThrust`/`burstFrag`/`dashWind`)も同じ入れ物の中(`pS:36525`・`36541` の `addChildAt`) |
| oT | 敵ごとの `view.overlayTop` | 同上(入れ物の最前面) |
| pT | `pumpkinTelegraph` | `groundLayer`(`pS:6726`) |
| mM | `mobMeteorGfx` | `groundLayer`(`pS:6727`・pT の直上) |
| cr | `crawlerTelegraph` | `groundLayer`(`pS:6728`) |
| skH | `skadiHazardGfx` | **`effectLayer`**(`pS:6815`) |
| gb | `graveBandGfx` | `groundLayer`(`pS:19777`) |
| ffl | `phantomFlamerGfx` | **`effectLayer`**(`pS:20483`) |
| acS | `acrasielSpearGfx` | `groundLayer`(`pS:20926`) |
| lib | `libArrowGroundGfx` | `groundLayer`(`pS:20965`) |
| ast | `astroGroundGfx` | `groundLayer`(`pS:21046`) |
| bf | `bossFireGfx`(加算) | `groundLayer`(`pS:21874`) |
| sm | `sensorMineGfx` | `groundLayer`(`pS:21930`) |
| wr | `wraithTeleGfx` | `groundLayer`(`pS:41911`) |
| pj | 弾ごとの Graphics(`drawProjectile`) | `frontObjectLayer` |
| G | `groundLayer` に直に並ぶ床の Graphics 群(`pS:6711-6739`: arena/questTrigger/return/baseSites/castleFightRing/tutorialBounds/exBarrier/hospital/armory/police/shrine/hunterVision ほか) | `groundLayer` |

### 流星の位相の略号(欄11)

| 略号 | 実体 | 備考 |
|---|---|---|
| 円窓 | `drawSweepCircleFill`(`pS:35948`)/`drawSweepSectorFill`(`pS:36344`)→ `utils/circleSweep.ts` の `circleSweepBand` | 外周→中心へ流れ、`prog=1` で消え切る。`prog` は**呼び出し側が自前で計算**(多くは `1 - 残り/溜めの総時間`) |
| 帯窓 | `drawSweepBand`(`pS:36390`)/`bandSweepSliceAlpha`/`bandSweepCenter` → `utils/bandSweep.ts` | 始点→終点へ窓が流れる。既定ON(`?bsweep=0` で下の「流星」へ戻る) |
| 流星 | `meteorPhase`(`utils/telegraphStyle.ts:105`・`PixiScene.meteorPhase` は委譲) | 線(`dashLineTick` `pS:33251`/`drawAngelDashLine` `pS:33143`)と、帯の縁取り焼き素材(`drawTelegraphBand` `pS:36554`)・雑魚/ボスの噛みの線 |
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
| `chaffMove`(雑魚の技の種類) | **4**(`bat-grab`/`skel-bite`/`zombie-double`/`lich-blink`・`types/game.ts:838`) | 目視 |
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
awk 'NR>=27100 && NR<=32280 { s=$0; if (s ~ /^\s*\/\//) next; if (s ~ /(if \(|else if).*(\x27[a-z][a-z0-9-]*\x27)/ || s ~ /(drawSweep|drawTelegraph|drawAngel|zoneCapsuleTick|dashLineTick|meteorPhase|drawShock|drawSlashArc|drawWarp|drawGaze|drawJorm|drawSkadi|thorNihil|latchGround|drawBloodPool|drawHero|drawPhill|drawMaiko|drawAcrasiel|0xff2a2a|0x9333ea|0xa855f7)/) print NR": "s}' src/pixi/pixiScene.ts
# (j) 床の Graphics の置き場所
sed -n 6705,6745p src/pixi/pixiScene.ts
grep -n "if (!g.parent)\|g.parent !== this.L" src/pixi/pixiScene.ts
```

`scan.py`(scratchpad に置いた使い捨て・15行)は「直前のメソッド宣言(`^  (private )?名前(`)」を見出しにして、各行の一致を数えるだけの物。

### 2-2. 予告を描いている関数(色の grep (h) が当たった見出し=38。うち `untrackBakedTexture`・`hasFullWarlordSet`・`beamPtsToXY` の3つは関数の外の定数行が直前の見出しに付いただけ)

`syncLabCrawler` / `syncPumpkinTelegraph` / `syncSkadiHazards` / `syncPhantomFlamer` / `drawAcrasielPattern` / `syncAcrasielSpears` / `syncLibertyArrows` / `syncAstroThrowsBody` / `syncBossFires` / `syncSensorMines` / **`drawEnemy`(0xff2a2a 51・0xff3b3b 50・0x9333ea 9・0xc084fc 13 箇所)** / `drawAngelZoneCapsule` / `zoneCapsuleTick` / `drawAngelDashLine` / `thorNihilCircleTick` / `dashLineTick` / `drawSkadiLattice` / `drawSweepBand` / `drawProjectile` / `drawHeroTelegraph` / `syncWraithTelegraph` / `drawPhillLightrainCircles` / `drawMaikoState` / `flamerSprayTextures`(幻影の炎の絵)/(赤系だが予告ではない: `syncGroundReflections`・`drawShadowSlot`(デバッグ)・`syncLockIndicators`(照準)・`syncBloodSpikes`(プレイヤーの床=I06)・`spawnKillFxBlood`(血)・`drawBoltFx`・`syncArena`(柵=J01)・`drawDrainSprite`・`syncArrows`(画面外の矢印)・`syncGravityWells`(I07)・`constructor`・定数行)

ヘルパ経由だけで色を持たない予告(色を引数で受ける): `drawTelegraphRing`(`pS:36512`)・`drawTelegraphBand`(`pS:36554`)・`drawAngelBeamLine`(`pS:33338`)・`drawShieldedAngelBeam`(`pS:33297`)・`drawSweepRectFill`(`pS:36316`)・`drawJormRain`(`pS:35980`)・`bossBiteTick`(`pS:16398`)・`mobMeteorTick`(`pS:16254`)。

---

## 3. 本表(1行=1つの予告や形の絵)

### A. 雑魚・強個体・終端・変異(汎用 `aiPhase`・§16・噛みつき化・各 tick)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 雑魚の噛みの流星線 | 1 | 赤(返せる)/紫(返せない) | 線+終点の潰れ楕円の印 | 噛みつき化した非ボス全部(ゾンビ・骸骨・コウモリ・研究所Lv1/2/3・犬・パンプキン・削岩型・伐採人・ハンター・プラント除く) | `biteAt`。前置きの線=`preBiteTelegraphLine`(ゾンビ `z-red-pause`/`z-stagger`・骸骨 `s-arc`)→`z-bite1`/`z-bite2`/`s-bite`/`b-windup`〜`b-grab`(`chaffMove` 込み・`utils/biteTelegraph.ts:177-258`) | 集め: `syncPumpkinTelegraph` `pS:16094-16103`/描く: `mobMeteorTick` `pS:16254`(呼び `pS:16199`)・`drawMobBiteMeteor` `pS:16344`・中断の退き `mobMeteorEndFrame` `pS:16326` | mM | `cT:1736-1743`: `biteFxRect`(`src/utils/biteFxHit.ts:33`)と `playerArtRect` の重なり。焼いた点が無い時は `biteBodyOverlapsPlayer`(`enemyBite.ts:873`)。※`cT:1772` の `isInBiteRect` は構え始めの届く範囲の判定 | ゾンビ2連=2本(同じキーで続く・2発目は印を2回打つ) | 流星(`biteTelegraph.ts` の `meteorTiming`) | 要(両端+印の楕円) | **線は足元へ写して描く**(判定の中心 `fx,fy/tx,ty` に `footFromOff/footToOff` を足す=絵と判定の中心が意図的にずれている)。群れの強弱(近い3本だけ通常)・軍人を狙う線あり。リッチの転移噛みは出さない(A03) |
| A02 ボス級の噛みの線 | 1 | 赤/紫(`BITE_TG_RED`/`PURPLE` `pS:16004-16010`) | 線 | 噛みつき化したボス級(城ボス・裏ボス・天使・賞金首・偶像・フィル・英雄 等。死神/使者/幻影は免除) | `biteAt`(追跡中の接触の代わり) | `bossBiteTick` `pS:16398`(呼び `pS:16101`)・`bossBiteEndFrame` | pT | A01 と同じ(`cT:1736-1743`: `biteFxRect`(`src/utils/biteFxHit.ts:33`)と `playerArtRect` の重なり。焼いた点が無い時は `biteBodyOverlapsPlayer`(`enemyBite.ts:873`)。※`cT:1772` の `isInBiteRect` は構え始めの届く範囲の判定) | 単 | 流星(`pS:16405`) | 要 | 腰の高さで引く(雑魚の線は足元・ボスは腰=層も別) |
| A03 リッチの転移噛みの円 | 1 | 赤 | 円 | リッチ | `chaffMove==='lich-blink'`(`aiPhase 'lich-blink'`) | `syncPumpkinTelegraph` `pS:16122-16144` | pT | `cT:1738` `isInBiteCircle`(`enemyBite.ts:911`・半径 `LICH_BLINK_RADIUS_PX`) | 単 | 円窓 | 要 | 攻撃先(焼いた点)だけに描く。ワープ元・先の緑の陣は K08 |
| A04 使者の足元の紫の円 | 2(常設の接触判定) | 紫 | 円 | 使者(hangedman) | 常時(死体・HP0・気絶中を除く=`hangedmanContactCircleLive`) | `syncPumpkinTelegraph` `pS:16109-16116` | pT | `utils/collisionUtils.ts:221 hangedmanContactHit`(`cT:1615` 経由・半径28) | — | 常(流星にしない・出入りフェードも無し=意図) | 要 | 足元中心。段階4で中心を足元の投影点にする |
| A05 跳びの着地円 | 1 | 赤 | 円 | パンプキン・研究所Lv3・ハンター・拳鬼(幻影 `phantomUnique==='brawler'`)・城ボス(台本OFF時のみ) | `aiPhase 'crouch'→'jump'`(`groundJumpStyleOf` `pS:2292`) | `syncPumpkinTelegraph` `pS:16152-16179` | pT | `gS:22344`(爆風経由・半径 `PUMPKIN_EXPLOSION_RADIUS`)→`cT:286` | 単 | 円窓(進み=着地までの残り÷滞空の総時間) | 要 | 円は `jump` の間だけ(`crouch` の間は出ない)。判定は+14px(`RED_CIRCLE_AUDIT.md` #R2) |
| A06 突進の流星ライン(汎用) | 1 | 赤 | 線 | 犬(werewolf)・研究所Lv2・ハンター・城ボス(台本OFF時) | `aiPhase 'windup'`→`'charge'` | `dashLineTick` `pS:16187`→`pS:33251`(`drawAngelDashLine` `pS:33143`) | pT | 走行中の体当たり: `cT:1615`(`isBodySlamNow` `enemyBite.ts:684` の間だけ接触が生きる) | 単 | 流星 | 要(両端) | **走り出すと赤が消える**(掟④の体帯は社長裁定 2026-09-18 で撤去済み)。段階4では両端の投影だけ |
| A07 削岩型の突きの帯 | 1 | 赤 | 帯 | 削岩型(driller) | `driller-thrust-windup`/`-active` | `drawEnemy` `pS:27106-27167`(`drawSweepBand` 27162・縁 `drawTelegraphBand` 27166) | tele | `gS:23283`(爆風経由 `moveKey 'driller-thrust'`) | 単 | 帯窓(`?bsweep=0` で流星 `pS:27150`) | 要 | |
| A08 伐採人の薙ぎ払いの帯 | 1 | 赤 | 帯(横帯) | 伐採人(logger) | `logger-sweep-windup`/`-active` | `drawEnemy` `pS:27193-27259` | tele | `gS:23383`(`'logger-sweep'`) | 単 | 帯窓(流星 `pS:27242`) | 要 | |
| A09 這う塊の叩きつけ円 | 1 | 赤 | 円 | 研究所の変異塊(lab-crawler) | 塊の叩きつけ(`labCrawler.slamX/Y`) | `syncLabCrawler` `pS:13446-13448` | cr | `utils/labCrawlerTick.ts:384`(`'crawler-slam'`) | 単 | 円窓 | 要 | 研究所テーマ(段階1の対象外=§1-6)でも予告は段階4の対象に入れるかを要決定 |
| A10 宇宙飛行士の投げ物の着弾円 | 1 | 赤 | 円 | 宇宙飛行士群(mutant-astro) | `astroThrows` kind `missile`/`debris`(技) | `syncAstroThrowsBody` `pS:21245-21247` | ast | `utils/astroTick.ts:374`(`` `astro-${kind}` ``) | 1投1円・同時に多数 | 円窓(進み=`bornAt→hitAt`) | 要 | |
| A11 周りに降る残骸の円 | 2 | 紫 | 円 | 同上 | `debris` かつ `ambient`(技ではない方) | `pS:21232-21243` | ast | 同上 | 多数 | 円窓 | 要 | 弾けない=紫 |
| A12 隕石の着弾円 | 2 | 紫 | 円+影の楕円2枚 | 同上 | kind `meteor` | `pS:21248-21257` | ast | 同上(`noParry`) | 単 | 円窓 | 要(円)・影の楕円は点+倍率でも可 | 影の楕円は判定なし(大きさは `depthScale` 済み) |
| A13 旗の帯 | 1 | 赤 | 帯 | 同上 | kind `flag`(`capsule`) | `pS:21258-21273`(帯窓を自前で刻む) | ast | 同上 | 単 | 帯窓(`bandSweepCenter` を直に呼ぶ) | 要 | |
| A14 花束の円 | 3(良い効果の範囲円) | 白(0xf2ece2 α0.04)+花弁 | 円 | 同上 | kind `bouquet` | `pS:21274-21288` | ast | `utils/astroTick.ts:403-415`(回復の範囲) | — | — | 要 | 判定あり=回復(監査で確認) |
| A15 旗手の矢の雨の着弾円 | 1 | 赤 | 円 | 解放軍の旗手(mutant-liberty)+旗手が死んだ後の孤児の矢 | 旗手の `giantDelayedHits`(`moveKey 'liberty-arrow'`)・`libertyOrphanArrows.hits` の `fireAt`(描く側 `pS:21007`/`21010`) | `syncLibertyArrows` `pS:20962-20979` | lib | `utils/libertyTick.ts:479/504/554`(`'liberty-arrow'`) | 多数(各矢が別時刻) | 円窓 | 要 | 画面外の旗手でも描く。刺さった矢(`stuck`)は絵 |
| A16 亡霊の叫びの紫の円 | 2 | 紫 | 円 | 亡霊(mutant-wraith) | `wraithScreamAt`(溜め `WRAITH_SCREAM_WINDUP_MS`) | `syncWraithTelegraph` `pS:41909-41922` | wr | `utils/wraithTick.ts:201`(`'wraith-scream'`) | 単 | 円窓 | 要 | |
| A17 呪いの墓石の通り道 | 1 | 赤 | 帯(太い線) | 亡霊 | `skadiIceBlades` の `visual==='grave'` | `syncSkadiHazards` `pS:19815-19877`(墓石は `gb` へ) | gb | `gS:23714-23721`(`'wraith-grave'`・`parryLocal`) | 多数 | 帯窓(自前でスライス) | 要 | 刃の行(C11)と同じ関数。墓石だけ層が `groundLayer` |
| A18 幻影の炎の紫の扇 | 2 | 紫 | 扇 | 守護霊の幻影(guardian-phantom の火炎放射) | `phantomFlamerPhase`(`utils/flamerCone.ts:42`) | `syncPhantomFlamer` `pS:20480-20500` | ffl | `utils/phantomTick.ts:1078/1103 phantomFlamerFan` | 単(噴射中は縁が残る) | 円窓(扇) | 要 | 層が `effectLayer` |
| A19 英雄の技の形 | 1 | 赤 | 円/扇/帯(`heroShape`) | 英雄(mutant-hero) | `hero-windup`/`hero-motion`×`heroMove` 9種×`heroStep` | `drawHeroTelegraph` `pS:41692-41734`(呼び `pS:27561`。円 41723・扇 41728・帯=`drawAngelZoneCapsule` 41733) | tele | `utils/heroTick.ts:728`→`184`(爆風経由・扇は `fan`) | 段ごと(連撃は段ごとに形を置き直す) | 円窓/扇=円窓/帯=帯窓 | 要 | 進み=`bossWindupStartAt→heroHitAt` |
| A20 旗手の旗振りの形 | 1 | 赤 | 同上 | 旗手(mutant-liberty) | 同上 | 同上(`pS:27560` は英雄と旗手の両方) | tele | `libertyTick.ts:471`(`'liberty-flag'`) | 同上 | 同上 | 要 | |

### B. 城ボス `g-*`(giantbat=搬送体/樹木管理員/衛生兵/軍隊/グレン)

ヘルパ: 帯=`drawGiantCapsuleZone`(`pS:30433-30471`・`drawSweepBand`+`drawTelegraphBand`)/扇=`drawGiantFanZone`(`pS:30474-30504`・`drawSweepSectorFill`)。どれも tele。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B01 踏み鳴らしの円 | 1 | 赤 | 円 | 城ボス | `g-stomp-windup` | `pS:31531-31547` | tele | `gS:20997`(`'g-stomp'`・半径 `gStompRadius`) | 単 | 円窓 | 要 | |
| B02 薙ぎ払いの照準(追尾相) | 1 | 赤(イーズイン) | 帯 | 城ボス | `g-sweep-track` | `pS:31548-31661`(`gTrackEase`) | tele | 判定なし(ロック後の B03 が当てる) | — | 自前(照準が動く間は流星でない) | 要 | ロック時に白い全形の残像(`pS:31646-31660`) |
| B03 薙ぎ払いの帯 | 1 | 赤 | 帯+白芯 | 城ボス | `g-sweep-windup`/`-active` | `pS:31548-31661`(流星 31584・`drawSweepBand` 31612・縁 31636・軸 31640) | tele | `gS:21054-21056`(`'g-sweep'`) | 単 | 帯窓 | 要 | 斬撃の弧 `drawSlashArc` `pS:30676`(①の武器の弧・段階3の扱い) |
| B04 跳びかかりの着地円 | 1 | 赤 | 円 | 城ボス | `g-jump-windup`/`g-jump-air` | `pS:31662-31683` | tele | `gS:21148`(`'g-jump'`) | 単 | 円窓 | 要 | |
| B05 連続ジャンプの着地円×3 | 1 | 赤 | 円×3 | グレン | `g-trijump-windup`/`-air`(`gTriJumpPts`) | `pS:31684-31711` | tele | `gS:21214`(`'g-trijump'`・1着地ごと) | **3段・段ごと** | 円窓(次の円だけ濃く=`lead`) | 要 | |
| B06 突進の流星ライン | 1 | 赤 | 線 | 城ボス | `g-dash-windup`→`g-dash-charge` | `dashLineTick` `pS:31526` | tele | 走行中の体当たり `cT:1615` | 単 | 流星 | 要 | 走り出しで消える(A06 と同じ裁定) |
| B07 三連突進の紫ライン | 2 | 紫 | 線 | 城ボス(ステージ4) | `g-quad-windup`→`g-quad-charge` | `dashLineTick` `pS:31528` | tele | 同上 | 突進3回=回ごとに引き直し | 流星 | 要 | |
| B08 氷の横薙ぎ(溜め)の扇 | 1 | 赤 | 扇 | 城ボス(ステージ4) | `g-quad-breath-windup` | `pS:31780-31782`(`drawGiantFanZone`) | tele | B09 の判定 | — | 円窓(扇) | 要 | 最終的に薙ぐ全域の先出し |
| B09 氷の横薙ぎ(実行)の回る帯 | 1 | 赤 | 帯(回転) | 同上 | `g-quad-breath-active` | `pS:31783-31794` | tele | `gS:21583`(`'g-quad'`・`giantActiveHit` で1回) | 持続 | 自前(`giantSweepWindowProg`→帯窓) | 要 | 回転する帯=毎フレーム頂点が変わる |
| B10 三連突進が残す氷の遅延円×3 | 1 | 赤 | 円×3 | 同上 | 遅延キュー(`ice`) | 遅延キューの描画 `pS:32050-32162`(円の枝 32133-32138) | tele | `gS:21595`→`gS:20554`→爆風経由 | **3つ・別時刻** | 円窓(`bornAt→fireAt`) | 要 | |
| B11 噛みつきの帯 | 1 | 赤 | 帯 | 城ボス(ステージ1) | `g-bite-windup`/`-hold`/`-active` | `pS:31712-31734` | tele | `gS:21294-21296`(`'g-bite'`) | 二相(溜め→溜め直し) | 帯窓(`twoPhaseTelegraphProg`) | 要 | |
| B12 のしかかりの帯 | 1 | 赤 | 帯 | 城ボス | `g-slam-windup`/`-active` | `pS:31735-31744` | tele | `gS:21322-21324`(`'g-slam'`) | 単 | 帯窓 | 要 | 技表で**未割当=実戦に出ない**(BOSS_MOVE_INVENTORY) |
| B13 滑空薙ぎの帯 | 1 | 赤 | 帯 | 城ボス(ステージ3) | `g-glide-windup`/`-active` | `pS:31745-31755` | tele | `gS:21355-21357`(`'g-glide'`) | 二撃(B14) | 帯窓 | 要 | |
| B14 滑空の二撃目の遅延円 | 1 | 赤 | 円 | 同上 | 遅延キュー | `pS:32133-32138` | tele | `gS:21405`→`gS:20554` | 単 | 円窓 | 要 | |
| B15 急降下の着弾円 | 1 | 赤 | 円 | 城ボス(ステージ3) | `g-dive-windup` | `pS:31756-31767` | tele | `gS:21435`(`'g-dive'`) | 単 | 円窓 | 要 | 本体が消えている間も描く(tele は敵の入れ物の子=本体の alpha の影響を要確認) |
| B16 氷結波(溜め)の円と外周 | 1 | 赤 | 円(内)+外周の縁 | 城ボス(ステージ4) | `g-nova-windup` | `pS:31796-31808` | tele | B17 の判定 | — | 円窓(内円)・外周の縁は `telStrokeA`(濃) | 要 | |
| B17 氷結波の広がる輪 | 1 | 赤 | 輪(太い線) | 同上 | `g-nova-active` | `pS:31809-31816` | tele | `gS:21678`(`'g-nova'`・`giantActiveHit` で1回) | 持続(輪が動く) | 常(一定の濃さの輪が広がる) | 要 | 輪の位置そのものが判定 |
| B18 翼撃の円 | 1 | 赤 | 円 | 城ボス(ステージ1) | `g-wing-windup`/`-active` | `pS:31835-31856` | tele | `gS:21751-21753`(`'g-wing'`) | 単 | 円窓(active では消える) | 要 | |
| B19 三連射の帯×2 | 1 | 赤 | 帯×2 | 城ボス(ステージ5) | `g-trishot-windup`/`-active` | `pS:31817-31834` | tele | `gS:21708-21713`(`'g-trishot'`・`beam`) | 2本同時+三拍目 B20 | 帯窓 | 要 | 衝撃波(盾で切る `drawShockwaveCut`)は② |
| B20 三連射の三拍目(遅延帯) | 1 | 赤 | 帯 | 同上 | 遅延キュー(`capsule`) | 遅延キューの帯の枝 `pS:32063-32129`(`drawSweepBand` 32074・縁 32103) | tele | `gS:21727`→`gS:20554` | 単 | 帯窓(`?bsweep=0` で流星 32080) | 要 | |
| B21 掃射(溜め)の扇(内径つき) | 1 | 赤 | 環状の扇 | 城ボス(ステージ5) | `g-sweepbeam-windup` | `pS:31864-31867`(`drawGiantFanZone` の innerR) | tele | B22 の判定 | — | 円窓(扇) | 要(内側の弧も) | |
| B22 掃射(実行)の回る帯 | 1 | 赤 | 帯(回転・盾で割る) | 同上 | `g-sweepbeam-active` | `pS:31868-31891` | tele | `gS:21823`(`'g-sweepbeam'`) | 持続 | 自前(`giantSweepWindowProg`)+盾の切り | 要 | 盾の影で帯を割る計画(`shieldBeamPlan`) |
| B23 血の爪痕の遅延帯×3 | 1 | 赤 | 帯×3 | グレン | `g-talon-windup`(遅延キュー `capsule`) | 遅延キューの帯の枝 `pS:32063-32129` | tele | `gS:20880`→`gS:20554` | 3本(同時刻) | 帯窓 | 要 | 爪痕の焼き素材 `drawClawMark`(`pS:32143-32183`)は② |
| B24 血の弧の遅延円×5 | 2 | **紫**(`floorUntil` 付きは紫 `pS:32058`) | 円×5 | グレン | `g-boon-windup`(遅延キュー) | `pS:32133-32138` | tele | `gS:20904`→`gS:20554` | 5つ | 円窓 | 要 | 爆ぜた後は B25 の床になる |
| B25 グレンの血溜まり(床・E-5) | 4 | 紫の縁+血の絵 | 円(絵は円形の血) | グレン | 遅延キューの `floorUntil` | `drawBloodPool` `pS:37124`(呼び `pS:32161`)+縁 `pS:32137` | **血の絵は `groundLayer`**(`pS:37137`)・縁は tele | `cT:783 applyGlenFloorDamage` | 床の間ずっと | — | 要(縁)・血の絵は4隅 | 「血だが判定を持つ床」(CLAUDE.md の実例) |
| B26 虚無の三唱の大円 | 1 | 赤 | 円 | グレン | `g-nihil-chant1〜3`(遅延キュー1件) | `pS:32133-32138` | tele | `gS:20960`→`gS:20554` | 1件(3唱の合計で1回) | 円窓 | 要 | |
| B27 伸びる触手の帯(複数本) | 1 | 赤+白い針 | 帯+針の線(oT) | グレン | `g-reach-windup`(`gReachShots` ごと) | `pS:31893-31933` | tele+oT | `gS:21907-21909`(`'g-reach'`・1本ごと) | **本数ぶん・別時刻** | 帯窓+白い針(`rprog` に比例・自前) | 要 | 針は oT=入れ物の最前面 |
| B28 尻尾の叩きつけの帯 | 1 | 赤 | 帯 | グレン(第二形態) | `g-tailslam-windup`/`-active` | `pS:31934-31950` | tele | `gS:22001-22003`(`'g-tailslam'`) | 単(後に弾の連射=§4) | 帯窓 | 要 | 長さ=尻尾のパーツの長さ |

### C. 裏ボス(ミーミル・ヨルムンガンド・スカジ)`bossState`

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 裏ボスの突進ライン | 1 | 赤 | 線 | 3体 | `dash-windup`→`dash` | `dashLineTick` `pS:28774-28778` | tele | 走行中の体当たり `cT:1615` | 単 | 流星 | 要 | |
| C02 ミーミルの群体の噛みつき円 | 1 | 赤 | 円 | ミーミル | `bite-windup` | `pS:28794-28806` | tele | `uGL:8699`(爆風経由・`MIMIR_BITE_RADIUS`) | 単 | 円窓 | 要 | 描く半径 `MIMIR_BITE_RADIUS_VIS` は判定 `MIMIR_BITE_RADIUS` の別名(216)=一致を確認済み |
| C03 レーザー(カラオケ塗り) | 2 | 紫 | 帯(根元→足元へ伸びる) | ミーミル・バス停(`usesMimirLaser`) | `laser-windup`/`laser-fire` | `pS:28102-28175`(溜め 28128・発射 28167/28173) | tele | ミーミル `uGL:8549-8558`/バス停 `bT:1038` | 発射中は持続(追尾) | 自前(カラオケ塗り=掟①の唯一の例外) | 要 | 盾で割る(`strokeBeamLayers`) |
| C04 ミーミルの紫の車輪 | 2 | 紫 | 線×スポーク(回転) | ミーミル | `wheel-windup`/`wheel-fire` | `pS:28184-28310` | tele | `uGL:8659`(`'capsule:mimir-wheel'`) | スポーク本数ぶん同時・持続 | 濃(塗りと太りが溜めで増す=流星でない) | 要 | 寄り集まる玉(`pS:28207-28222`)は判定なしの②。**掟①: 紫で流星でない=例外の1件(レーザー)に入らない**(§6) |
| C05 うねり薙ぎの帯 | 1 | 赤 | 帯 | ヨルムンガンド | `coil-windup`(実行 `coil`) | `pS:28846-28851`(`drawAngelZoneCapsule`) | tele | `uGL:8716`(爆風経由 `HB_JO.coil.halfWidth`) | 単 | 帯窓 | 要 | **描く幅は `HB_TH.harai.halfWidth`(トールの値)・判定は `HB_JO.coil.halfWidth`**=今は両方40だが出どころが別(§6)。実行中の胴(`coilBody`)は絵 |
| C06 叩きつけ(体を広げた枠) | 1 | 赤 | 矩形(段ごとに大きく) | ヨルムンガンド | `jslam-windup`/`jslam-hit`/`jslam-rewind` | `pS:28861-28880`(`drawSweepRectFill` `pS:36316`) | tele | `uGL:8742-8743`(`'jo-slam'`・帯=`utils/jormDanmaku.ts:20 jormSlamRect`) | **2連/3連・段ごと** | 自前(矩形の窓) | 要(4隅) | |
| C07 スカジの氷塊の円(設置) | 1 | 赤 | 円 | スカジ | `skadi-ice-windup`→`skadiIceMarkers`(`fireAt`=2秒) | `syncSkadiHazards` `pS:19782-19794` | **skH(effectLayer)** | `gS:23645`(爆風経由 `ice`) | 多数・別時刻 | 円窓 | 要 | |
| C08 スカジの氷結の檻(氷塊の環) | 1 | 赤 | 円×count | スカジ | `cage-windup` 明けに氷塊を環に置く(`uGL:8968-8977`) | C07 と同じ描画 | skH | `gS:23645` | count個・同時刻 | 円窓 | 要 | 溜め中(`cage-windup`)の地面の予告は無い=体の震えだけ(§4) |
| C09 スカジの氷の刃の通り道 | 1 | 赤 | 帯(太い線) | スカジ | `skadi-blade-windup`→`skadiIceBlades` | `syncSkadiHazards` `pS:19815-19877` | skH | `gS:23717/23721`(`parryNoDamage`) | 刃ごと | 帯窓(自前スライス `pS:19840-19872`) | 要 | 刃の線は発射前 `SKADI_BLADE_LINE_PRE_MS` から |
| C10 スカジの氷の格子 | 2 | 紫 | 帯×10/段 | スカジ | `lattice-windup` | `drawSkadiLattice` `pS:36188`(呼び `pS:28178`) | tele | `uGL:9004`(`'capsule:skadi-lattice'`) | **段ごと** | 帯窓(紫) | 要 | |

### D. トール

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D01 無の境地の紫の円 | 2 | 紫 | 円 | トール | `issen-nihil` | `thorNihilCircleTick` `pS:33207`(呼び `pS:28600`) | tele | ダメージなし。円の中で近接を振ると一閃(`utils/thorNihil.ts:34 isInsideNihilCircle`・半径 `thorNihilRadius()`) | — | 自前(慣性つきで開閉) | 要 | 「判定の半径を見せる円」でもある |
| D02 一閃の帯 | 1 | 赤 | 帯 | トール | `issen-windup`→`issen-dash` | `pS:28339-28387` | tele | `uGL:9147`(`'capsule:thor-issen'` 9164) | 単 | 帯窓(流星 28365) | 要 | |
| D03 突きの帯 | 1 | 赤 | 帯 | トール | `tsuki-windup`→`tsuki` | `pS:28394-28443` | tele | `uGL:9234`(9248) | 単 | 帯窓(流星 28424) | 要 | 溜め中は追従(trackFrac) |
| D04 払いの帯 | 1 | 赤 | 帯+軸 | トール | `harai-windup`→`harai` | `pS:28451-28491` | tele | `uGL:9289`(9303) | 単 | 帯窓(流星 28469) | 要 | |
| D05 飛び掛かりの着地円 | 1 | 赤 | 円 | トール | `jump-windup`/`jump-attack` | `pS:28506-28531` | tele | `uGL:9440-9442`(`'thor-jump'`) | 単 | 円窓 | 要 | |
| D06 突進の流星ライン | 1 | 赤 | 線 | トール | `thor-dash-windup`→`thor-dash-move` | `dashLineTick` `pS:28610-28616` | tele | `uGL:9402`(`'capsule:thor-dash'`) | 単 | 流星 | 要 | |

### E. 天使6体(ミゲル・ジブリル・ラフィ・ウリ・スリィエル・アクラシエル)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E01 払い/縦払いの帯 | 1 | 赤 | 帯 | ミゲル | `harai-windup`→`harai`→`tate-windup`→`tate` | `pS:29300-29325`(`drawAngelZoneCapsule` 29309)+完了ラッチ `pS:29821-29843` | tele | `aBT:811-820`(旧経路 `aBT:1088-1097`) | **2段(払い→縦払い・段ごとに溜め)** | 帯窓 | 要 | |
| E02 踏み込みの線 | 1 | 赤 | 線 | ミゲル | `mdash-windup`→`mdash-move` | `drawAngelDashLine` `pS:29341`(29326-29363) | tele | `aBT:934-941` | 単 | 流星(走行で消しが進む `merase`) | 要 | 通る技=走行中も線が残る |
| E03 ランスの帯 | 1 | 赤 | 帯×3 | ジブリル | `lance-windup`/`lance` | `pS:29376-29412`(本数 29380・帯 29400) | tele | `aBT:1415-1463`(爆風経由 `capsule`・1451) | **3本・1秒おきに別の時刻** | 帯窓(進みは 0.97 が上限=`pS:29398`) | 要 | 進みの上限で掟③からわずかに外れる(§6-3)。追尾ランタン(`lanceLanterns`)は絵 |
| E04 ランタン火の円 | 2 | 紫 | 円 | ジブリル | `lantern` → `bossFires` | `syncBossFires` `pS:21872-21896` | bf | `aBT:3912/3928 tickAngelBossFires` | 多数・別時刻 | 円窓 | 要 | 有効中の紫の炎は絵(`pS:21904-21907`) |
| E05 聖別の火の環 | 2 | 紫 | 円×N | ジブリル | `consecrate-windup` 明けに火を環に置く(`aBT:1541-1545`) | E04 と同じ | bf | E04 と同じ | N個・同時 | 円窓 | 要 | 溜め中の地面の予告は無い(ランタンを掲げる絵だけ) |
| E05b ランタン火の起動後(床) | 4 | 紫の炎の絵+グロー | 円(判定)・**絵は炎とグローだけ** | ジブリル | E04・E05 の火が起動した後(`active`) | `syncBossFires` `pS:21901-21910`(外周のグロー r*3.2) | bf | `aBT:3920-3928`(`active && hypot ≤ JB_T.fire.radius + 自機の半身`) | 火ごと | — | 要(判定の円を描くなら) | **当たる間に判定と一致する形が無い**(§6-3)。B24/B25 と同じ分け方 |
| E06 骨刃の通り道 | 1 | 赤 | 帯(太い線) | ラフィ | `bone-windup`→`skadiIceBlades`(`visual 'bone'`・`aBT:1872`) | `syncSkadiHazards` `pS:19815-19877` | skH | `gS:23717/23721` | 刃ごと | 帯窓 | 要 | |
| E07 刃2連の通り道 | 1 | 赤 | 帯 | ラフィ | `quickblades-windup`→刃 | 同上 | skH | 同上 | 2本 | 帯窓 | 要 | |
| E08 跳びかかりの着地円 | 1 | 赤 | 円 | ラフィ | `jump-windup`/`jump-attack` | `pS:29443-29461` | tele | `aBT:1925`(旧 `aBT:2118`) | 単 | 円窓 | 要 | |
| E09 薙ぎの帯 | 1 | 赤 | 帯 | ラフィ | `sweep-windup`/`sweep` | `pS:29413-29442`(29418)+ラッチ `pS:29879-29896` | tele | `aBT:1947`(カウンター窓 `aBT:1961`) | 単 | 帯窓 | 要 | 描く幅=`HB_TH.harai.halfWidth`・判定=`RF_T.sweep.halfWidth`(今は両方40・出どころ別=§6) |
| E10 大薙ぎの帯 | 1 | 赤 | 帯 | ウリ | `sweep-windup`/`sweep` | `pS:29467-29488`(29472)+ラッチ `pS:29897-29908` | tele | `aBT:2302-2311`(`UR_T.sweep.halfWidth`) | 単 | 帯窓 | 要 | 描く幅=`HB_TH.harai.halfWidth`(同上・今は40=40) |
| E11 振り下ろしの帯 | 1 | 赤 | 帯 | ウリ | `downslash-windup`/`downslash` | `pS:29489-29510`(29494)+ラッチ `pS:29909-29919` | tele | `aBT:2355-2360`(**`UR_T.downslash.halfWidth`=40**) | 単 | 帯窓 | 要 | **★描く幅=`HB_TH.tsuki.halfWidth`=15、判定=40**=「赤くないのに当たる」の疑い(§6) |
| E12 踏み込み突きの線 | 1 | 赤 | 線 | ウリ | `thrust-windup`→`thrust` | `drawAngelDashLine` `pS:29526`(29511-29550) | tele | `aBT:2425-2432` | 単 | 流星 | 要 | 通る技 |
| E13 環の射出ビーム | 1 | 赤 | 帯(長い線・盾で割る) | スリィエル | `ring-beam-windup`→`ring-active` | `drawShieldedAngelBeam` `pS:29551-29570`→`drawAngelBeamLine` `pS:33338`+完了ラッチ `pS:29984-29995` | tele | `aBT:2691-2737` | 環が2つなら2本 | 帯窓(`bandSweepSliceAlpha`) | 要 | 起点=環の位置(本体ではない) |
| E14 環の回転斬の円 | 1 | 赤 | 円 | スリィエル | `ring-spin-windup`→`ring-spin` | `pS:29571-29594`+尾 `pS:30005-30021` | tele | `aBT:2790-2795` | 単 | 円窓 | 要 | 硬直へ入った後も尾が残る(`RED_CIRCLE_AUDIT.md` D-3) |
| E15 本体の薙ぎの帯 | 1 | 赤 | 帯 | スリィエル | `sweep-windup`→`sweep` | `pS:29595-29612`+尾 `pS:30032-30046` | tele | `aBT:2845-2850`(`SR_T.sweep.halfWidth`) | 単 | 帯窓(実行中は全形) | 要 | 描く幅=`HB_TH.harai.halfWidth`(今は40=40) |
| E16 放射棘の扇×8(隙間あり) | 1 | 赤 | 扇×8 | アクラシエル | `spike-windup`/`spike` | `drawAcrasielPattern` `pS:20828-20843`(呼び `pS:29269`) | tele | `aBT:3138/3157` | 8本同時 | 円窓(扇)・実行中は一様 | 要 | |
| E17 結晶の槍の狙い円(溜め) | 1 | 赤 | 円×狙い数 | アクラシエル | `spear-windup` | `pS:20845`(内部の `circle` ヘルパ 20805-20822) | tele | E18 の判定 | 狙い数ぶん | 円窓 | 要 | |
| E18 結晶の槍(設置物)の円 | 1 | 赤 | 円 | アクラシエル | `acrasielSpears`(`fireAt`) | `syncAcrasielSpears` `pS:20924-20941` | acS | `aBT:3941/3987 tickAcrasielSpears` | 多数・別時刻 | 円窓 | 要 | 槍の絵(Sprite)は `groundLayer` |
| E19 爆発の円 | 1 | 赤 | 円 | アクラシエル | `burst-windup`/`burst` | `pS:20852-20856`(`acrasielBurstRed`) | tele | `aBT:3218` | 単 | 円窓→実行中は一様(`live`) | 要 | 破片(`burstFrag`)は② |
| E20 転移衝撃の円 | 1 | 赤 | 円 | アクラシエル | `warp-out`/`warp-in`(`warp-active`) | `pS:20857-20860`(`acrasielWarpRed`) | tele | `aBT:3195/3201` | 単 | 円窓→一様 | 要 | 中心=出現先(`aiTarget`) |
| E21 凝視の多射線 | 1 | 赤(0xff5555) | 線×5〜9 | アクラシエル | `gaze-windup`→`gaze-active` | `pS:20861-20868` | tele | 弾(`aBT:3227` の `addProjectile`) | 本数同時 | **濃**(溜めで濃く太くなるだけ) | 要 | **掟①の違反の疑い**(流星でない)(§6) |

### F. フィル(EX)

羽攻撃の武器絵は `phillLayer`(②)。予告は全部 tele・`PixiScene.PHILL_TG_STYLE`。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F01 祝福(光の雨)の円 | 1 | 赤 | 円×キュー | フィル | `phill-lightrain-windup`/`-active`(`phillLightrainQueue` の `at`) | `drawPhillLightrainCircles` `pS:42778-42791`(呼び 29625/29630)+光柱 `drawPhillBlessingSpotlights`(②) | tele | `aBT:3489`(`'phill-lightrain'`) | **キューごとに別時刻** | 円窓 | 要 | CLAUDE.md の「1発目が描かれない」前例の技 |
| F02 羽斬りの帯 | 1 | 赤 | 帯 | フィル | `phill-wingslash-windup` | `pS:29634-29655`(29644) | tele | `aBT:3545` | 単 | 帯窓 | 要 | |
| F03 羽突きの帯 | 1 | 赤 | 帯 | フィル | `phill-wingthrust-windup` | `pS:29656-29680`(29661) | tele | `aBT:3568` | 単 | 帯窓 | 要 | |
| F04 羽連撃の帯×2 | 1 | 赤 | 帯×2 | フィル | `phill-wingcombo-windup`→`active1`→`gap`→`active2` | `pS:29681-29720`(1本目 29702・2本目 29697) | tele | `aBT:3591/3607` | **2段・段ごと** | 帯窓 | 要 | |
| F05 金環の大円 | 1 | 赤(縁は金 0xffd166) | 円 | フィル | `phill-goldring-windup` | `pS:29721-29735` | tele | `aBT:3658` | 単 | 円窓 | 要 | |
| F06 裁きの光の円 | 1 | 赤 | 円 | フィル | `phill-judgment-windup` | `pS:29736-29753`+天の光柱 `drawPhillJudgmentSkylight` `pS:32400`(②) | tele | `aBT:3682` | 単 | 円窓 | 要 | 描く半径はズームでクランプ(`phillZoomSafeRadius`)・判定は生値(`RED_CIRCLE_AUDIT.md` D-2) |
| F07 羽根の檻の円(収縮) | 1 | 赤 | 円(半径が縮む) | フィル | `phill-cage-windup` | `pS:29754-29772` | tele | `aBT:3709`(`closeRadius`) | 単 | 円窓 | 要 | 描く半径 `startR→closeRadius` へ収縮。判定は `closeRadius`=溜め中の大きい赤の外周部は当たらない(当たる瞬間には一致) |
| F08 光輪投げの往復帯 | 1 | 赤 | 帯×2(往・復) | フィル | `phill-ringtoss-windup`→`-out`→`-back` | `pS:29773-29795`(29785/29788)+輪の絵 `drawPhillRingtoss` `pS:32419` | tele | `aBT:3762/3770` | **2段(往・復)** | 帯窓 | 要 | |
| F09 急降下の着地円 | 1 | 赤 | 円 | フィル | `phill-dive-windup`(追尾)→`-fall`(ロック) | `pS:29796-29810` | tele | `aBT:3806` | 単 | 円窓 | 要 | |
| F10 羽根散弾の通り道 | 1 | 赤 | 帯 | フィル | `phill-feathershot-windup`→`skadiIceBlades`(`visual 'feather'`) | `syncSkadiHazards` `pS:19815-19877` | skH | `gS:23717/23721` | 刃ごと | 帯窓 | 要 | |

### G. 偶像(idol)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G01 狙い撃ちの線 | 1 | 赤 | 線(弾の幅) | 偶像 | `idol-aim-windup` | `drawAngelBeamLine` `pS:28988-28996` | tele | 弾(当たるのは弾そのもの) | 単 | 帯窓 | 要 | 弾の通り道の予告 |
| G02 連射の扇の線 | 1 | 赤 | 線×3/5 | 偶像 | `idol-fan-windup` | `pS:28998-29014` | tele | 弾 | 本数同時 | 帯窓 | 要 | |
| G03 狙撃線 | 2 | 紫 | 帯 | 偶像 | `idol-snipe-windup`→`idol-snipe` | `drawAngelZoneCapsule` `pS:29017-29021` | tele | `iT:939` | 単 | 帯窓 | 要 | |
| G04 追尾弾の線 | 1 | 赤 | 線 | 偶像 | `idol-orb-windup` | `pS:29023-29046` | tele | 弾 | 本数同時 | 帯窓 | 要 | |
| G05 メーカーの射撃枠の線 | 1 | 赤 | 線 | 偶像 | `idol-s*-windup`(`IDOL_SHOT_SLOTS`) | `pS:29048-29070` | tele | 弾 | 本数同時 | 帯窓 | 要 | 既定OFF |
| G06 殴りの帯 | 1 | 赤 | 帯 | 偶像 | `idol-punch-windup` | `drawAngelZoneCapsule` `pS:29072-29081` | tele | `iT:953`(`hitCapsule`→`iT:576`) | 単 | 帯窓 | 要 | |
| G07 手榴弾の爆発円 | 2 | 紫 | 円(弾に付く) | 偶像・**幻影**(`utils/phantomTick.ts:194`) | `idol-nade-windup`→`idol-nade`(敵の手榴弾=`p.hostile`) | `drawProjectile` `pS:38344-38352` | **pj(frontObjectLayer・弾の Graphics の原点=弾の位置)** | `uGL:14826-14840`(`HEAVY_GRENADE_RADIUS`) | 単 | 円窓(信管 `fu`) | 要 | 円が弾と一緒に動く=段階4では円の中心=弾の地面の位置。**円が遠近で拡大・縮小される**(§6-3) |

### H. 賞金首4型(`isBountyType`)

賞金首の帯は**毎フレーム無条件で `zoneCapsuleTick`(`pS:33090`)を呼ぶ**形(中断の消し継続のため)。ブロック=`pS:27567-28100`。

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H01 押しのけの帯 | 1 | 赤 | 帯 | バス停 | `br-push-windup`→`br-push` | `zoneCapsuleTick` `pS:27602` | tele | `bT:979` | 単 | 帯窓 | 要 | |
| H02 三段突きの帯×3 | 1 | 赤 | 帯×3 | バス停 | `br-triple-windup`→`br-triple-1/2/3` | `pS:27629-27660`(段ごとの `zoneCapsuleTick` 27658) | tele | `bT:1148`(段ごと) | **3段・段ごとに別の時刻** | 帯窓 | 要 | 起点=毎フレームの本体中心(踏み込みに付いていく) |
| H03 レーザー | 2 | 紫 | 帯 | バス停 | `laser-windup`/`laser-fire` | C03 と同じ描画 | tele | `bT:1038` | 持続 | 自前(カラオケ) | 要 | 行は C03 に数えた(重複して数えない) |
| H04 突進の流星ライン | 1 | 赤 | 線 | 馬乗り | `bm-charge-windup`→`bm-charge` | `dashLineTick` `pS:27627` | tele | 走行中の体当たり(`bT:1331` 以降) | 単 | 流星 | 要 | |
| H05 360度ムチの円 | 1 | 赤 | 円 | 馬乗り | `bm-whip360-windup`/`bm-whip360` | `pS:27922-27957` | tele | `bT:1366` | 実行中は持続(窓がループ=`loopSweepProg`) | 円窓 | 要 | |
| H06 3段コンボの帯 | 1 | 赤 | 帯 | 馬乗り | `bm-combo1/2/3-windup` | `zoneCapsuleTick` `pS:27607` | tele | `bT:1389`(段ごと) | **3段・段ごとに溜め** | 帯窓 | 要 | |
| H07 懲罰狙撃の帯 | 2(発射中は赤=§6-3) | **溜め=紫・発射中の線=赤** | 帯 | 馬乗り | `bm-snipe-windup`→`bm-snipe` | 溜め `zoneCapsuleTick` `pS:27614`(紫)/発射 `pS:27874-27885`(halo 0xff2a2a) | tele | `bT:1456` | 単 | 帯窓/発射は一様 | 要 | **色の食い違いの疑い**(返せない=紫のはずが、当たっている最中の線は赤)(§6) |
| H08 薙ぎの帯 | 1 | 赤 | 帯 | 鋏 | `bb-sweep-windup` | `zoneCapsuleTick` `pS:27618` | tele | `bT:1561` | 単 | 帯窓 | 要 | |
| H09 薙ぎ3連の帯 | 1 | 赤 | 帯 | 鋏 | `bb-triple1/2/3-windup` | `zoneCapsuleTick` `pS:27623` | tele | `bT:1580`(段ごと) | **3段** | 帯窓 | 要 | |
| H10 跳びかかりの円 | 1 | 赤 | 円 | 鋏 | `leap-windup`/`leap-air` | `pS:28032-28063` | tele | `bT:1665`(半径の帯=点の帯) | 単 | 円窓 | 要 | |
| H11 毬の薙ぎの帯 | 1 | 赤 | 帯 | 舞妓 | `mk-naginata-windup`/`mk-naginata1/2-windup` | `drawMaikoState` `pS:43319-43322` | tele | `bT:1833/1852/1876` | 型B=2段 | 帯窓 | 要 | |
| H12 毬回しの円 | 1 | 赤 | 円 | 舞妓 | `mk-spin-windup`/`mk-spin` | `pS:43370-43390` | tele | `bT:1937` | 実行中も一様 | 円窓(溜め)/一様(実行) | 要 | |
| H13 水鳥乱舞の着地円 | 1 | 赤 | 円 | 舞妓 | `mk-suiu-windup`→`hop1/2/3` | `pS:43395-43456` | tele | `bT:1980`(跳ねごと) | **3段・段ごと** | 円窓 | 要 | |
| H14 手毬打ちの流星ライン | 1 | 赤 | 線 | 舞妓 | `mk-boom-windup` | `dashLineTick` `pS:43323-43326` | tele | H15 の判定 | — | 流星 | 要 | |
| H15 飛ぶ手毬の当たり円 | 1 | 赤 | 円(移動) | 舞妓 | `mk-boom-out`/`mk-boom-back` | `pS:43468-43482` | tele | `bT:2068` | 持続(通る技) | 一様(`telFillA(1,1)`) | 要 | 円が毬と一緒に動く |

### I. プレイヤー側・設置物の範囲(種3・種4)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| I01 センサー地雷の範囲円 | 2(返せない=紫の文法のはずが赤で描く=§6-3) | 赤(感知後の点滅) | 円 | プレイヤー(サブ)・**幻影**(幻影の地雷はプレイヤーに当たる=`utils/sensorMine.ts:111`・`uGL:15078-15095`) | `sensorMines`(感知→起爆) | `syncSensorMines` `pS:21928-21966`(円 21962-21964) | sm | `cT:1193 applyMineDamage`・`utils/sensorMine.ts:84 tickSensorMines`(`SENSOR_MINE_RADIUS`) | 地雷ごと | 円窓 | 要 | プレイヤーの地雷は敵に当たる。幻影の地雷はプレイヤーに当たる |
| I02 デコイの射程の円 | 3 | 青 | 円(二重線) | プレイヤー(サブ)・**幻影**(`uGL:11902`) | 置いたデコイ(`p.area`) | `syncDecoys` `pS:33823-33828` | **frontObjectLayer**(デコイの入れ物の子) | `uGL:12916`(`decoy.area`) | — | — | 要 | |
| I03 ハンターの視界の円 | 3 | 薄紫 | 円 | ハンター | 巡回・索敵中 | `syncHunterVision` `pS:34850-34866` | G(`hunterVisionGfx`) | `HUNTER_VISION_RANGE`(`gS:3500`)・`uGL:929` | — | — | 要 | 当たる円ではなく「見つかる円」 |
| I04 火炎瓶の地面の火 | 4 | 炎の絵 | 円(判定)・**絵は炎の Sprite** | プレイヤー(サブ) | `groundFires` | `syncGroundFires` `pS:21664-21733`/子の炎 `pS:21735` | actorLayer(子の足元で奥行き) | `utils/molotov.ts:85/104`(円・半径 `groundFireRadiusAt` 155) | 火ごと | — | 点で足りる(円を描いていない) | 段階4に入れるかは「形を描いていない」ので要決定 |
| I05 氷槍の床(線) | 4 | 氷の絵 | 帯(線) | プレイヤー(武器 rifle-t2-icelance) | `iceLanceFloors` | `syncIceLanceFloors` `pS:20157-20230` | effectLayer | `utils/iceLanceFloor.ts:71`(幅28) | — | — | 要(線の両端) | |
| I06 血の履帯の棘 | 4 | 赤黒 | 小円 | プレイヤー(スキル) | `bloodSpikes` | `syncBloodSpikes` `pS:21778-21795` | `groundLayer` | `gS:15126`(`BLOOD_TREADS_RADIUS_PX`) | 多数 | — | 要(小円・省略⑥の候補) | |
| I07 重力井戸の輪 | 3 | 紫系 | 輪 | プレイヤー(サブ) | `gravityWells` | `syncGravityWells` `pS:39574-39602` | effectLayer | 判定の行は未確認 | — | — | 要 | §7 |
| I08 金環(サブ)の輪 | 3 | 金 | 輪+光線 | プレイヤー(サブ) | `goldRings` | `syncGoldRings` `pS:20054-20140` | effectLayer | `utils/goldRing.ts`(行は未確認) | — | — | 要 | §7 |
| I09 研究所の休眠ゾンビの視界 | 3 | 薄い赤 | 多角形(扇状の視界) | 研究所の休眠ゾンビ | 研究所で見える時 | `updateLabVisionCones` `pS:15162` | `groundLayer`(`labVisionLayer`・`pS:15170`) | 見つかる範囲(`utils/labStealth.ts`・行は未確認) | — | — | 要 | I03 と同じ「見つかる形」 |
| I10 マークスマン罠の範囲円 | 3 | 青 | 円 | プレイヤー(サブ)・**幻影**(`hostile`・`uGL:11413`) | 置いた罠(`p.area`) | `drawProjectile` `case 'trap'` `pS:38399-38406` | pj | 幻影の罠はプレイヤーを捕まえる `uGL:15972-15990` | — | — | 要 | 半径は `radius / depthD` で遠近の拡大を打ち消してある |
| I11 ドローン・ブーメランの範囲リング | 3 | シアン | 円 | プレイヤー(サブ) | 止まっている間(`p.area`) | `drawProjectile` `pS:38380-38388` | pj | 行は未確認 | — | — | 要 | |

### J. 静的な床の印(種5)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 ファイル:行 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| J01 囲いイベントの柵リング | 5 | 赤系(0xef4444) | 円 | 床(イベント) | `activeEvent` | `syncArena` `pS:34165-34195` | G | ゲートの半径 `aBT:152 GATE_ARENA_RADIUS`(他のイベントは未確認) | — | — | 要 | |
| J02 レスキューの待機トリガー円 | 5 | イベント色 | 円 | 床(NPC) | 待機トリガー | `syncQuestTrigger` `pS:34196-34220` | G | `utils/rescueQuestGate.ts`(行は未確認) | — | — | 要 | |
| J03 帰還サークル | 5 | — | 円 | 床 | `returnCircle` | `syncReturnCircle` `pS:34221-34270` | G | `isInReturnCircle`(`uGL:109` の import 元)・半径 `returnCircle.radius` | — | — | 要 | |
| J04 拠点候補地サークル | 5 | — | 円 | 床 | `baseSites` | `syncBaseSites` `pS:34814` | G | 行は未確認 | — | — | 要 | |
| J05 病院サークル | 5 | — | 円 | 床 | 病院 | `syncHospital` `pS:34313` | G | 行は未確認 | — | — | 要 | 入口の光の線は K07 |
| J06 武器庫サークル | 5 | — | 円 | 床 | 武器庫 | `syncArmory` `pS:34382` | G | 行は未確認 | — | — | 要 | |
| J07 武将の祠の3秒サークル | 5 | — | 円 | 床 | 祠 | `syncShrines` `pS:34668` | G(+光 `shrineGlowGfx`=actorLayer) | 行は未確認 | — | — | 要 | |
| J08 城ボス戦の移動制限リング | 5 | 赤系(0xf87171) | 円(半径4500) | 床 | `castleFightNow` | `sync` 内 `pS:11841-11850` | G | `src/world/playableArea.ts:152/164`(`CASTLE_FIGHT_MAX_DIST`) | — | — | 要(巨大な円=分割数に注意) | |
| J09 訓練の移動制限ライン | 5 | 青 | 線(縦) | 床 | `farBackdrop==='tutorial'` | `sync` 内 `pS:11851-11873` | G | `TUTORIAL_MOVE_*`(`uGL:89` の import 元) | — | — | 要 | |
| J10 EX結界/南の膜 | 5 | 金 | 帯(横の膜) | 床 | `s.exBarrier` | `sync` 内 `pS:11875-` | G | 行は未確認 | — | — | 要 | |
| J11 区域の境界テープ | 5 | — | 線 | 床 | 区域の境 | `syncAreaBoundaryTape` `pS:44748` | `groundLayer`(`pS:6870`) | 行は未確認 | — | — | 要 | |
| J12 研究所の床のプレート | 5 | — | 矩形 | 床 | `updateLabFloorPlate(show)` | `pS:8847-8860` | 未確認 | 行は未確認 | — | — | 要 | |
| J14 ボスの当たり判定の枠(開発用・**段階4の対象外**) | 5 | 赤系 | 矩形 | ボス | `?bosshitbox=1`・ボスメーカーの判定トグル | `drawEnemy` `pS:27049-27086` | tele | 判定の箱そのもの | — | — | 対象外 | 既定OFF。製品の画面には出ない |
| J13 錬金の陣(足元) | 5(判定は未確認) | シアン | 円 | プレイヤー | 錬金のリズム | `syncAlchemyCircle` `pS:12494-12530`(`alchemyCircle`/`alchemyRhythmGfx`) | G | 判定の有無は未確認 | — | — | 要 | §7 |

### K. 判定を持たない地面の形(種6)

| # 名札 | 種 | 色 | 形 | 持ち主 | 技の入口 | 描く関数 ファイル:行 | 層 | 判定 | 多段 | 位相 | 頂点投影 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| K01 水たまり | 6 | — | 不定形 | 床(天候「雨上がり」) | `?weather=wet`・ステージ7の雨 | `WeatherWetLayer.sync` `src/pixi/weatherWet.ts:505`(呼び `pS:14228`) | `groundLayer`(+雨粒 `danceUiLayer`) | なし | — | — | 要 | 1,380行の別ファイル=中の図形は数えていない(§7) |
| K02 強glowの光だまり | 6 | 光源の色 | 楕円 | 光源 | `registerWorldLight` の `pool` | `syncGlowGroundPools` `pS:6055` | `glowGroundLayer`(groundLayer の中) | なし | — | — | 要 | |
| K03 プレイヤーの光だまり | 6 | — | 楕円 | プレイヤー | 常時 | `playerGroundPool`/`playerLight`(`pS:6732-6733`)の更新(関数名は未確認) | groundLayer | なし | — | — | 要 | |
| K04 松明の床の光だまり | 6 | 暖色 | 楕円 | 松明・焚き火 | 常時 | `makeProp` の `reflection`(`pS:8556-8561`) | groundLayer | なし | — | — | 段階1で点として通す方針(§2-1 の表) | |
| K05 月の光だまり | 6 | — | 楕円 | 床 | 月明かり | `syncMoonPool` `pS:7703`(`stageLightShaftGfx`) | 未確認 | なし | — | — | 要 | |
| K06 床のひび | 6 | — | 放射のひび | 着地・踏み込み | 敵の跳び着地 `pS:30387`・偶像の着地 `pS:30413`・城ボスの踏み込み `pS:30639`・プレイヤーのワイヤー `pS:24331` | `latchGroundCrack` `pS:37543`→`drawGroundCrack` `pS:37510`(`crackPool`) | groundLayer | なし | 回ごと | — | 要 | |
| K07 建物の入口の光の線 | 6 | 白 | 線 | 病院・武器庫・交番 | 常時 | `drawPoiThreshold` `pS:34454-34497`(交番 `syncPolice` `pS:34504`) | G | なし | — | — | 段階1で処理済み(`a4/b4` は投影済みの点) | 段階1の表にある |
| K08 ワープ・召喚の魔法陣 | 6 | 緑/紫/黄 | 円(焼き素材) | リッチ(`pS:30125-30158`)・アクラシエル(`pS:30097-30118`)・ジブリル(`pS:30164-30180`) | ワープ・転移 | `drawWarpCircle` `pS:33471` | 未確認(`pruneWarpCircles` `pS:25114`) | なし(②) | 開閉 | — | 要(寝かせた陣) | |
| K09 城ボス/賞金首の召喚陣 | 6 | 赤系/金 | 円(焼き素材) | 城・賞金首 | 出現 | `castleSummonCircle`(`syncCastle` `pS:13010`)・`drawBountySummonCircle` `pS:42711` | groundLayer/effectLayer | なし | — | — | 要 | |
| K10 英雄の突進の道筋(蹄跡) | 6 | 骨色 | 小楕円の列 | 英雄 | `heroMove` charge/leapcharge | `drawHeroTelegraph` `pS:41702-41717` | tele | なし(赤にしない=当たらない意図) | — | — | 点で足りる | |
| K11 星弓の落下点の影 | 6 | 黒+青 | 楕円 | ヨルムンガンド | `jrain`(`jormRainLobs` の `landAt`) | `drawJormRain` `pS:35988-36000` | 未確認(`drawJormRain` 内の g) | なし(着地で弾を撒くだけ `uGL:8834-8841`) | 多数 | — | 要 | |
| K12 凍てつく牙の輪の印 | 6 | 青 | 円・弧の印 | ヨルムンガンド | `jfreeze`(`jormFreezeRings`) | `drawJormRain` `pS:36030-36130` | 同上 | なし(当たるのは弾) | 輪ごと | — | 要 | |
| K14 ホロの魔法陣 | 6 | ホロ色 | 円(焼き素材) | ミゲル・ジブリル | `volley-windup`/`volley`(`drawHoloVolleyCircle` `pS:40785`)・ジブリル `warp-windup`(`drawHoloMiniAt` `pS:40804`) | 呼び `pS:29273-29287` | 未確認 | なし(②) | — | — | 要(寝かせた陣) | K08 と同じ扱い |
| K13 プレイヤーの矢の雨の影 | 6 | 黒 | 小楕円 | プレイヤー(スキル) | `arrowRainShots`/`arrowRainStuck` | `syncPlayerArrowRain` `pS:21619-21657` | groundLayer | 当たるのは矢の着地点(`utils/arrowRain.ts`) | 多数 | — | 点で足りる | |

---

## 4. 総数と種類ごとの件数(監査の反映後に数え直し)

**表の行数 = 157**(A20・B28・C10・D6・E22(E05b を含む)・F10・G7・H15・I11・J14・K14)。
うち H03(バス停のレーザー)は C03 と**同じ描画**を持ち主ごとに分けた行なので、**描く物としては 156**。
J14(ボスの当たり判定の枠)は開発用で**段階4の対象外**。

| 種類(依頼の1〜6) | 行数 | 行 |
|---|---|---|
| 1 赤い予告 | **98** | A01 A02 A03 A05 A06 A07 A08 A09 A10 A13 A15 A17 A19 A20 / B01〜B06 B08〜B23 B26〜B28 / C01 C02 C05〜C09 / D02〜D06 / E01〜E03 E06〜E21 / F01〜F10 / G01 G02 G04〜G06 / H01 H02 H04〜H06 H08〜H15 |
| 2 紫の予告 | **18** | A04(使者の常設の接触円) A11 A12 A16 A18 B07 B24(血の弧の遅延円=紫) C03 C04 C10 D01(無の境地) E04 E05 G03 G07 H03 H07(溜め=紫・発射中=赤) I01(幻影の地雷=返せないのに赤で描く) |
| 3 攻撃範囲・射程の円 | **8** | A14(花束=回復の範囲) I02 I03 I07 I08 I09 I10 I11 |
| 4 判定を持つ床 | **5** | B25(グレンの血溜まり) E05b(ランタン火の起動後) I04 I05 I06 |
| 5 静的な床の印 | **14** | J01〜J14(J14 は対象外の注記つき) |
| 6 判定を持たない地面の形 | **14** | K01〜K14 |

- 段階4で**判定と結び付く行**(種1〜4)= A〜I の **129 行**。
- 形の内訳(E05b を足す前の A〜I の128行・「形」欄の先頭の語で機械的に数えた。E05b は円=円 +1): 円 **53**・帯 **48**・線 **17**・扇 **3**・輪 **3**・同上 **1**・環状の扇 **1**・矩形 **1**・多角形 **1**(A19 の「円/扇/帯」は円に入れ、A20 は「同上」)。
- 層の内訳(種1・2の116行): 敵の入れ物の子(tele/oT)が大半。**groundLayer の Graphics**=A01〜A06(pT/mM)・A09(cr)・A10〜A13(ast)・A15(lib)・A16(wr)・A17(gb)・E04/E05(bf)・E18(acS)・I01(sm)。**effectLayer**=A18・C07〜C09・E06・E07・F10。**弾の Graphics(frontObjectLayer)**=G07。

> 数え直し用の式: `grep -cE "^\| [A-K][0-9][0-9][a-z]? " research/TELEGRAPH_INVENTORY.md` → 157 / `grep -cE "^\| [A-I][0-9][0-9][a-z]? "` → 129 / `grep -c "^| N[0-9][0-9] "` → 15(§5・うち N03 と N11 は「攻撃ではない」記録の行=攻撃は13) / 種類ごと=各行の2列目の先頭の数字。

## 5. 「予告なし」の攻撃(当たるのに、地面に赤/紫の形が出ない物)

段階4とは別件(CLAUDE.md の「赤い予告の4つの掟」では、予告の無い攻撃は違反)。**分類**: ①=本当に何も出ない ②=弾(全ボス共通の赤い二重丸が危険の絵=地面には出さない文法) ③=形は出ないが体の色(点滅)で知らせる ④=社長裁定で意図的に出さない。

| # | 攻撃 | 持ち主・入口 | 判定 | 分類 | 備考 |
|---|---|---|---|---|---|
| N01 | 突進の走行中の体当たり | 犬・研究所Lv2・ハンター・城ボス(`g-dash-charge`/`g-quad-charge`/`g-dive-windup`)・裏ボス `dash`・トール `thor-dash-move`・馬乗り `bm-charge`・ミゲル `mdash-move` | `cT:1615`(`isBodySlamNow`) | ④ | ミゲルは線が走行中も残る(E02)。城ボスの `g-dive-windup`(急降下の溜め)も貫通表 `enemyMotion.ts:21` に入り `isBodySlamNow`(`enemyBite.ts:690`)が真=溜めの間に体へ触れると当たる(`cT:1970-1977` の除外も通る)。赤いのは着地円 B15 だけ(§6-3)。ウリの `thrust` は体当たりではなく帯の判定(`aBT:2420-2432`・E12)。他は走り出しで赤が消える=掟④の体帯は**社長裁定 2026-09-18 で撤去**(CLAUDE.md) |
| N02 | 跳びの滞空中の体の接触 | ラフィ `jump-attack`・鋏 `leap-air` の2型だけ | 着地円(E08・H10)とは別に飛行経路の体の接触が生きている(`cT:1615` の接触) | ① | パンプキン等の `jump`(`cT:1970`)・舞妓 `mk-suiu-hop*`・フィル `phill-dive-fall` は体に触れてもダメージなし=外した。トールの `tsuki`・`issen-dash`・`jump-attack` は `cT:1952-1953` で除外。急降下の溜めは N01 |
| N03 | (訂正)死神本体の接触 | 死神(reaper) | **ダメージなし**(`cT:1966-1969`・`isReaperFamily` は `reaper` だけ=`enemyUtils.ts:364`) | — | 予告なしの攻撃ではない(記録のみ)。接触で当たるのは使者だけ=A04 |
| N04 | 幻影の格闘・武器・サブウェポン(拳鬼の格闘含む) | guardian-phantom(`gp-brawler` 等)。サブウェポンの経路は `uGL` 側(タレット・ドッグ・分身・地雷・罠・囮・手榴弾・援護射撃=紫の弾・発火ナイフ・炎の延焼) | `utils/phantomBrawlerTick.ts:275`・`utils/phantomTick.ts`・`uGL`(下の N12〜N15・援護射撃と発火ナイフ `uGL:12315`・`12832`・`12455-12483`) | ④ | 「プレイヤーと同じ即発」の設計(GHOST_BOSS.md v6)。拳鬼の秘奥義の気功の爆ぜ(`phantomBrawlerTick.ts:640-690`・`:686`)も予告なし。形が出るのは炎の扇 A18・地雷 I01・罠 I10・囮 I02・手榴弾 G07 だけ |
| N05 | ゾンビの紫の追尾(体当たり) | ゾンビ `zpause`→`zrush` | `enemyBite.ts:655 ZOMBIE_RUSH_BODY_SLAM_MS`・`isBodySlamNow` | ③ | 体の紫の点滅(`BITE_BLINK_TINT` `enemyBite.ts:932`)だけ |
| N06 | 抱卵型の卵(地雷) | 抱卵型(ghost)が撒く `breakableProps` type `mine`・世界に置かれる卵(畑・待ち伏せ・圧力=`src/world/mines.ts:14 MineInstance`)・包囲イベントの卵の輪(`gS:24237 spawnEggRing`・`egg-evt-`) | `gS:5001/16873/25659`(壊れた時の処理) | ① | 当たる(同じ爆発の処理 `uGL:17225-17241`・半径80)。卵の絵が armed で光るだけで**範囲の円は無い**=予告なしで確定 |
| N07 | スカジの氷結の檻の溜め | `cage-windup` | 溜め明けに氷塊が置かれ、その円(C08)が予告になる | ③ | 溜めの間は体の震えだけ |
| N08 | ジブリルの聖別の溜め | `consecrate-windup` | 同上(E05) | ③ | ランタンを掲げる絵だけ |
| N09 | 弾の技(地面の形なし) | ミーミル族 `aim-burst`/`burst`(ミーミル族の方)/`aim-radial`/`radial`・`jwave`/`jrain`/`jfreeze` の弾・城ボス `g-bolt-*`/`g-tailslam-volley`・ミゲル/ジブリル `volley`・ウリ `bolt`・スリィエル/アクラシエル `gaze`(アクラシエルは線 E21 あり)・鋏 `bb-quickshot`・フィル `phill-lancefan`/`phill-meteor`・偶像 `idol-aim`/`fan`/`orb`/`s*`(線 G01-G05 あり)・プラントの種・拳鬼の気功(`phantomBrawlerTick.ts:630`)・アクラシエルの転移の破片弾(`aBT:3187-3194`)・爆発の破片弾(`aBT:3208-3212`)・結晶の槍の起爆の3方向の破片弾(`aBT:3975-3983`)・ミーミルの車輪の追尾弾(`uGL:8664-8676 mimirWheelHoming`)・グレン第二形態の胴体弾(`gS:23930-23937`・`srcMoveKey 'g-parts'`)・バス停の中立射撃(`brPattern` の charge/fan・`bT:887-926`)・幻影の援護射撃(hostile+noCounter=紫の弾)と発火ナイフ(`uGL:12315`・`12832`・`12455-12483`)(※刃=氷刃・骨刃・羽根・墓石は通り道の帯がある=C09 E06 E07 F10 A17) | `cT:1006 applyEnemyProjectileHits` | ② | 弾そのものが共通の赤い二重丸(CLAUDE.md「色と形の文法」③)。**偶像は線を出すのに他のボスは出さない**=揃っていない |
| N10 | 噛みつきの線が出ない噛み | 噛みつき化した敵のうち `biteDirX/Y` が未設定の瞬間 | `biteTelegraph.ts:265` で線を返さない | ① | 起きうるかは未確認(§7) |
| N12 | 幻影のタレットが消える時の爆発 | 幻影のタレット | `uGL:14585-14616`(`TURRET_EXPLOSION_RADIUS×tExMult`) | ① | 範囲の円なし |
| N13 | 幻影のドッグの噛み | 幻影のドッグ | `uGL:11520-11545`(`DOG_BITE_RADIUS`) | ① | |
| N14 | 幻影の分身の近接 | 幻影の分身(`gpShadowClone`・`uGL:12861-12863`) | `gS:14847-14875 phantomShadowCloneStrike`(中心から `meleeRange` の円・`gS:14868`・当たると `damagePlayer` `gS:14875`) | ① | プレイヤーに当たる=コードで確認 |
| N15 | 幻影の炎の延焼 | 幻影の火炎放射(A18 の扇の後) | `phantomTick.ts:1143-1159 tickPlayerFlamerBurn`(約2.5秒=`flamerCone.ts:17 FLAMER_BURN_MS`) | ① | 紫の扇を出た後も削り続ける。幻影が倒れた後も続く |
| N11 | (参考)骸骨の噛みの前の溜め(しゃがみ) | `s-crouch` | 判定なし(線は `s-arc` の頭から) | — | 判定を持たないので違反ではない(記録のみ) |

---

## 6. 片方にしか無かった物と、その解決/台帳を作る途中で見つけた食い違い

### 6-1. 入口にあって絵に無かった物

| 入口 | 解決 |
|---|---|
| `g-bolt-*`・`g-tailslam-volley`・`aim-burst`/`radial`/`jwave`/`jrain`/`jfreeze`・`volley`・`bolt`・`gaze`・`phill-lancefan`/`meteor`・`bb-quickshot` | 弾だけ=§5 N09 |
| `cage-windup`(スカジ)・`consecrate-windup` | 溜め明けに設置物が出て、その円が予告=C08・E05(§5 N07・N08) |
| `lattice-windup` | 色の grep には `drawEnemy` の呼び出し1行しか出ない → `drawSkadiLattice` を開いて紫の帯と確認(C10) |
| `g-talon-windup`/`g-boon-windup`/`g-nihil-chant*` | `drawEnemy` の分岐の骨組み(i)には出ない(遅延キューの描画が状態を見ずに回る)→ `giantDelayedHits` の描画 `pS:32050` で拾った(B23・B24・B26) |
| `idol-nade-windup` | `drawEnemy` には震えだけ → 弾の描画 `drawProjectile` の `p.hostile` 枝で拾った(G07) |
| `lich-blink` | `drawEnemy` 側は緑の陣だけ → `syncPumpkinTelegraph` で赤い円(A03) |
| `hero-*` 全部 | 州は共通、形は `heroShape` → `drawHeroTelegraph` 1本(A19・A20) |
| `ring-move-windup` | 環が動くだけで判定なし(`aBT:2638-2660` を読んで確認)=行なし |
| `issen-nihil` | 判定(ダメージ)なし・振ると一閃の円 → D01 として載せた |

### 6-2. 絵にあって入口の数えに出なかった物

| 絵 | 解決 |
|---|---|
| `syncSkadiHazards` の刃の帯 | 入口は `skadiIceBlades`(GameState)で、**4者が共用**(スカジの刃・ラフィの骨刃/刃2連・フィルの羽根・亡霊の墓石)→ 持ち主ごとに行を分けた(C09・E06・E07・F10・A17) |
| `syncLibertyArrows`・`syncAstroThrowsBody`・`syncWraithTelegraph`・`syncLabCrawler` | 州ではなく各 tick の配列/時刻が入口(変異は `aiPhase`/`bossState` を使わない)→ A09-A16 |
| `syncPhantomFlamer` | 幻影の武器の時刻(`flamerCone.ts`)が入口 → A18 |
| `syncSensorMines`・`syncDecoys`・`syncHunterVision` | プレイヤー側/視界=種3 → I01-I03 |
| `bossBiteTick`・`mobMeteorTick` | 州ではなく `biteAt` が入口(全敵共通の噛みつき化)→ A01・A02 |
| 完了ラッチ(スリィエル `pS:29984-30046`・ミゲル/ラフィ/ウリ `pS:29821-29930`) | 硬直に入った後も尾を引く**同じ予告の続き**=別の行にせず、元の行の欄7に行番号を足した |

### 6-3. 食い違い(台帳づくりの途中で見つけた・**直していない**)

1. **E11 ウリの振り下ろし: 赤の半幅=`HB_TH.tsuki.halfWidth`(15)/判定の半幅=`UR_T.downslash.halfWidth`(40)**(`pS:29494`・`pS:29502` と `aBT:2355`)。`angelScript.ts:201` のコメントに「halfWidth 15→40 = v0.25.3589 ボスメーカー貼り戻し(社長確定)」とあり、**描く側だけ15のまま**に見える=「赤くないのに当たる」の疑い。実機で未確認。
1b. **(確定・監査)** 上の1は監査で確定: 描く半幅15=`hiddenBossScript.ts:307 HB_TH.tsuki.halfWidth`(`pS:29494`/`29502`)、判定の半幅40=`angelScript.ts:202 UR_T.downslash.halfWidth`(`aBT:2355`)。
1c. **敵の手榴弾の紫の円が遠近で拡大・縮小される**(G07): `pS:38221` で設置物扱い→円は `HEAVY_GRENADE_RADIUS`(`pS:38350-38352`)→`pS:38473` の `g.scale.set(depthD)` で **R×depthD** になる。罠(I10)と囮は `radius / depthD` で補正済みだが手榴弾だけ抜けている。判定は固定(`uGL:14821-14840`)。
1d. **幻影の地雷(I01)の色と半径**: 返せない攻撃なのに赤で描く(`pS:21962`)。爆発半径は判定=`SENSOR_MINE_RADIUS × skillExplosionMult × heavyGunnerExplosionMult(smActor)`(`uGL:15046-15050`)、描く円は固定(`pS:21962-21964`)=smActor がプレイヤーに戻る時にプレイヤーのエクスプローダーで判定だけ広がる(潜伏)。
1e. **E03 ランスの進みの上限 0.97**(`pS:29398`): 3本が別の時刻で当たる技で、赤が消え切る前に当たる=掟③(消え切る=当たる)からわずかに外れる。
1f. **ジブリルのランタン火の起動後(E05b)**: 当たる間(`aBT:3920-3928`)に判定と一致する形が無い(炎の絵とグロー r*3.2 だけ=`pS:21901-21910`)。
1g. **城ボスの急降下の溜め(`g-dive-windup`)**: 体に触れると当たる(`enemyMotion.ts:21`・`enemyBite.ts:690`・`cT:1970-1977`)のに、赤いのは着地円 B15 だけ。溜めの間に体が画面に見えているかは未確認。
2. **描く幅と判定の幅の出どころが別の帯**(今は値が一致=潜伏): C05 うねり(描く `HB_TH.harai`/判定 `HB_JO.coil`)・E09 ラフィ(`HB_TH.harai`/`RF_T.sweep`)・E10 ウリ大薙ぎ(`HB_TH.harai`/`UR_T.sweep`)・E15 スリィエル(`HB_TH.harai`/`SR_T.sweep`)。ボスメーカーで片方だけ動かすと崩れる。段階4で描き直す時に**判定と同じ定数を読む**よう揃えるのが安全。
3. **C02 ミーミルの噛みの円**: 監査で一致を確認(別名・216)=食い違いではない。
4. **H07 懲罰狙撃**: 溜めは紫(返せない)・発射中の線は赤(`pS:27879`・`27883`)。
5. **掟①(流星)から外れて見える物**: E21 アクラシエルの凝視の線(濃くなるだけ)・C04 ミーミルの車輪(紫・濃くなるだけ・例外のレーザーとは別の技)・B17 氷結波の輪(一定)・H12/H15/E19/E20 の実行中の一様な塗り(当たり得る間の赤=掟④側の扱いとして意図かもしれない)。
6. **A01 雑魚の噛みの線は足元へ写して描く**(判定の中心から `e.height/2` 等ずらしてある)=段階4で「判定どおりの位置」を投影すると今の絵と位置が変わる。どちらを正にするかは要決定。
7. **層が `effectLayer` の予告**: C07-C09・E06・E07・F10(skH)・A18(ffl)。他の予告(groundLayer/敵の入れ物)と層が違う。

---

## 7. 数えられなかった・自信のない所

- **`drawEnemy`(`pS:25617-32279`・約6,700行)は全部は読んでいない。** 分岐の骨組み(§2-1 (i))と色の grep (h) で予告の行を拾い、拾った行の前後だけ読んだ。**ヘルパを通らず、赤・紫以外の色で予告を描いている所**(例: 0xff5555・0xff6b6b・0xff3030 だけを使う所)は (h) の式に入っていない色があり、取りこぼしの可能性がある。監査で数え直す時は `0xff3030|0xff5555|0xff5a5a|0xff6b6b|0xa855f7|0xd8b4fe` も足すこと。
- **`pS:25617-27100`(`drawEnemy` の前半=体の描き方)** には州の比較が多数あるが、予告の色の行は出なかった(体の色・スカッシュ・武器だけと判断)。
- **段階1の物(デカール・入口の帯・伸びる影)・段階2の物(足元の影)は数えていない**(依頼の6種に入らないと判断)。
- **`weatherWet.ts`(1,380行)・`stage1Night.ts`・`stage5Battlefield.ts`・`objShadeOverlay.ts` の中の地面の図形**は関数単位で1行(K01 等)にまとめ、中の図形は数えていない。
- **判定の行が未確認**: J01(ゲート以外のイベント)・J02・J04-J07・J10-J13・I07・I08・K03・K05 の層。
- **N10**(噛みつきで線が出ない瞬間)が実際に起きるか未確認。
- **I04 火炎瓶の床**は判定が円なのに円を描いていない(炎の絵だけ)=段階4の対象にするか要決定。
- **行番号の幅**(`pS:29300-29325` 等)は分岐の範囲の目安。予告の図形の呼び出し行は単独の行番号で書いた方が正確(欄7のカッコ内)。
- **実機の画は見ていない**(ヘッドレス撮影はしていない)。「描く関数がある」=「画面に出ている」ではない(CLAUDE.md「実在確認の掟」)。とくに F01 は「1発目が描かれない」前例がある技。
- **`GIANT_SCRIPT_ENABLED` が偽の時の城ボス**(汎用の `jump`/`windup` を使う=A05・A06 に乗る)は、今の既定でどちらが動いているかを確かめていない。
- 赤い予告の焼き素材(`rings`・`bands`・`bandSlices`)は欄7で予告の行に含めた。**衝撃波(`drawShockwave`)・爪痕(`drawClawMark`)・斬撃の弧(`drawSlashArc`)・爆発の破片(`burstFrag`)・棘の突き出し(`spikeThrust`)は②(派手さ)と判断して行を作っていない**(PERSPECTIVE_PROJECTION.md §3-5b では予告の焼き素材と同じ並びに置かれているので、段階3と4のどちらで扱うかは要決定)。

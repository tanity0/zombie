# コード監査 2026-10-23 — 描画と性能・メモリ(src/pixi / PixiStage / renderStats / memoryTier / bakeGovernor)

- 依頼: 社長「ソースコード調査させてバグないか調査。ついでに改善、改良などアドバイスあればメモらせといて」
- 担当範囲: `src/pixi/pixiScene.ts`(38,829行・grepで当たりを付けて部分読み)・`pixiTextures.ts`・`lighting.ts`・`PixiStage.tsx`・
  `utils/renderStats.ts`・`memoryTier.ts`・`bakeGovernor.ts`。シミュ側(`useGameLoop`/`gameStore`)は描画と直結する箇所(rAFの鎖・dtの頭打ち・一時停止)だけ読んだ。
- 基準版: v0.25.5190(`94c966bc`)。調査日時 2026-10-24 01:00〜02:00 JST。
- 重点: 社長実機「ステージ4で8〜9分遊ぶと急に重くなる。一時停止しても時間が止まるだけでメニューが出ない・ショップが開かない・死んでも終わらない・通信の文字送りが止まる」
  計器 `tex162MB bake41MB(縁16/影16/白8/他1)732枚`・落ちる直前 `t546s 峰214(particle×195,damageNumber×7) obj2436 maps1099(texContent335,silTex236,rimTex2xx)`(起動直後 obj約926・maps約200)。
- 「確認の度合い」: **実測**=ヘッドレス(Chromium+SwiftShader・430×932・DPR1・`?smoke=1&stage=stage-4&bot=standard`)で数字を見た /
  **コード**=実在の配線を読んで確かめた / **推測**=筋書きは通るが数字は取れていない。
  ヘッドレスは描画が約2fpsなので、シミュのrAFだけを `setTimeout` 駆動(1回で最大12歩・50ms刻み)に差し替えてゲーム時間を実時間の約0.6倍で進めた
  (使い捨て: scratchpad `leak-stage4.mjs` / `sat-stage4.mjs` / `pickup-cost.mjs`)。**ヘッドレスの端末格は `pc`**(`navigator.userAgentData.mobile=false`)なので、
  スマホの天井(縁16/影16/白8)は `?rimbudget=16&silbudget=16&whitebudget=8` で明示して再現した。

---

## ① 先に結論(重い順・上位5件)

| # | 名札 | 一言 | 重さ | 確認 |
|---|---|---|---|---|
| **R-1** | **描画側に「画面外の間引き」が無い物が、シミュ側の無制限蓄積(SIM監査 S-1 拾い物)を2〜6倍に増幅する** | 拾い物1個につき地面層に Container+Graphics×2、影プールに Sprite×2(+メッシュ)が作られ、**画面からどれだけ離れていても毎フレーム全部を更新する**(`syncPickups`/`placeShadowV9` に視野判定が無い)。拾い物が数百個溜まると表示物は千〜二千個増え、`obj2436` と符合する。 | 遊びに支障 | コード+実測(下③) |
| **R-2** | **焼き直し(影・縁・白)が天井に張り付くと、1枚ごとに `BlurFilter`×2・`ColorMatrixFilter` を新規生成し、影は3パス(blur quality3)+`extract.pixels` の同期読み戻し** | v0.25.5184 の間引き(150ms)で回数は下がったが、**1回の焼きの重さ**は変わっていない。影1枚=フィルタ付き描き込み3回+GPU→CPU同期読み戻し1回(初見の絵)。ヘッドレス実測: 天井に当たる前は**1描画フレームに約7回**焼いていた(sat-run 最初の30秒 297回/43フレーム)。 | 遊びに支障 | コード+実測 |
| **R-3** | **研究所の床テクスチャ(約10MB)が全ステージで常駐する** | 画面左下の版数表示(`Game.tsx:338`)が `getTexture('lab-floor/lab-floor-stage2')`/`('lab-floor/lab-floor-ground')` を毎レンダーで呼ぶ → 遅延組の安全網(`pixiTextures.getTexture`)が**ステージ4でも6.0MB+3.8MBを読み込む**。実測: ステージ4の `__texList` 上位1位と5位がこの2枚。 | 遊びに支障(メモリ天井の端末) | コード+実測 |
| **R-4** | **「天井に張り付いた影」のフォールバックが、壊れた(destroy済み)焼きテクスチャを貼りうる** | 退避(`silhouetteEvictToBudget`)は「**いま可視のメッシュ**が使う物」しか守らない。非可視スロットの `lastTexture` が指す焼きは捨てられうるのに、`placeShadowV9` の `bakedNow ?? sl.lastTexture` は `destroyed` を見ずにメッシュへ貼る。 | 軽微〜遊びに支障(影が白/黒の矩形・または例外で以降の描画更新が飛ぶ) | コード(実測では未発生=影の天井に届かなかった) |
| **R-5** | **一時停止で Pixi のtickerは止まるのに、重さが続くならそれは描画以外の仕事** | `PixiStage.applyTickerState` は `isPaused` で ticker を**完全停止**する(sync も render も走らない)。「時間は止まるのにメニューが出ない」が本当なら、その瞬間の主スレッドを塞いでいるのは **Pixi の描画ではない**(GC/メモリ圧・React・タイマーの渋滞)。切り分けの鍵は v0.25.5188 の `tm`/`fps` の実機値。 | (切り分けの指針) | コード |

**重点の症状への答え(短く)**: 描画側で「時間とともに勝手に増える物」(Map/表示物の解放漏れ)は**見つからなかった**(2分弱のゲーム時間で `obj`・各Mapは頭打ち。表は全部 delete/clear の対がある)。
増えるのは**シミュ側の配列が増えた分の写し**で、その代表が拾い物(R-1)。重さの「急変」は①拾い物の蓄積が閾値を越える ②焼きの天井張り付き(R-2)
③メモリ圧(tex162+bake41+JSヒープ+画面RT ≒ 250〜300MB・iOSの殺され帯)の3つが同じ頃に重なる構図で説明でき、**①②は描画側の間引きで、③は常駐の削減(R-3ほか)で**軽くできる。

---

## ② バグ・リスクの一覧

| # | 名札 | 場所 | 何が起きるか(筋書き・再現) | 重さ | 確認 |
|---|---|---|---|---|---|
| R-1 | 画面外の拾い物も全部描く | `pixiScene.ts:33088-33114 syncPickups`(全 `pickups` を走査・`drawPickup` で毎フレーム `glow.clear()`/`g.clear()`)/ `:33172 pickupShadows.push`(全拾い物が影の要求になる)/ `:15655-15716 placeShadowV9`(早期returnは alpha と寸法だけ・視野判定なし) | 拾い物はシミュ側に上限・寿命・片付けが無い(SIM監査 S-1)。描画側も間引かないので、**1個=地面層3物+影層2〜3物**が永久に毎フレーム更新。蓄積が進むほど `sync()` が線形に重くなる。 | 遊びに支障 | コード+実測: 画面外(自機から1500〜2200px)に拾い物を置いただけで **183個 → 表示物 1068→1928(+860=1個あたり4.7物)・影プール 13→116・`sync()` 平均 13.8→18.8ms(+36%)**(`pickup-cost.mjs`・ボット静止・2fps) |
| R-2a | 焼き1回ごとにフィルタを新規生成 | `pixiScene.ts:15295 / 15304 / 15306`(`new BlurFilter` 影・1枚で2個)/ `:19864,19890`(`new ColorMatrixFilter` 灰・白)/ `:19959,19974`(縁・白と黒の2個) | `wrap.destroy({children:true})` は Pixi 8 ではフィルタを破棄しない(`Container.destroy` は `effects=null` にするだけ)。WebGL では GC で回収されるが、**毎回シェーダ束縛・UniformGroup・BindGroup を作り直す**=焼きの固定費。WebGPU 経路(iOS26 Safari 等)では BindGroup が破棄されず残る可能性。 | 遊びに支障(天井張り付き時) | コード |
| R-2b | 影の焼きは3パス+同期読み戻し | `:15276-15320 bakeSilhouette`(hard/soft/合成の3回 `renderBake`・blur quality 3)/ `:15449-15488 textureContentBottomFrac`(`renderer.extract.pixels` = `gl.readPixels` 同期・初見の絵ごと1回・`SHADOW_CONTENT_MEASURE_PER_FRAME=1`) | 読み戻しはGPUの待ち行列を**全部待つ**ので、1回でもそのフレームの他の描画と直列になる。初見の絵が続く場面(新しい敵型・攻撃シートの初回・拾い物の新種)で1フレームずつ刺さる。 | 遊びに支障(局所) | コード。ヘッドレス実測 sync max 97ms(初回30秒) |
| R-3 | 研究所の床が全ステージ常駐 | `src/components/Game.tsx:338`(版数表示の `floor:…` が `getTexture('lab-floor/…')` を呼ぶ)/ `pixiTextures.ts:1540-1546 getTexture`(未ロードの遅延組を**読みに行く**安全網) | 診断表示が安全網を踏み、ステージ無関係に `lab-floor-ground`(1254² = 6.0MB)+`lab-floor-stage2`(1000² = 3.8MB)が常駐。ステージ4の `tex158〜167MB` のうち約10MBがこれ。 | 遊びに支障(落ちる帯の端末) | コード+実測(`__texList` 1位・5位) |
| R-4 | 捨てた焼きを影が貼りうる | `:15880 const tex = bakedNow ?? sl.lastTexture`(`destroyed` 未確認)/ `:15385-15415 silhouetteEvictToBudget`(守るのは `mesh.visible` の物だけ)/ `:16002 sl.lastTexture = sl.texture` | 影の天井に張り付き+間引き(150ms)で `bakedNow=null` が続く間、非可視だったスロットが再び可視になると destroy 済み RT を `mesh.texture` に代入。Pixi 8 は destroyed source を描こうとして例外か空描画。`PixiStage` の try/catch が握るので**そのフレームの以降の同期が丸ごと飛ぶ**(v0.25.4442 と同型)。 | 軽微〜遊びに支障 | コード(実測は影天井に未到達・`meshDestroyed=0`) |
| R-5 | 一時停止中は描画が止まる | `PixiStage.tsx:238-251 applyTickerState`(`isPaused` で `ticker.stop()`) | バグではなく事実。社長の症状が「一時停止で時間だけ止まりメニューが出ない」なら、その時に主スレッドを塞いでいるのは Pixi 以外。`tm` が大きい=タイマー渋滞(GC・メモリ圧・React の長い再レンダー) / `tm` が小さいのにメニューが出ない=React 側の条件(`Game.tsx:289` の5フラグ)。 | — | コード |
| R-6 | 計器 `rimTex`/`texContent` は「見た絵の種類数」で減らない | `:19938-19939`(`rimTexCache` の外側 Map は空になっても delete されない)/ `:15479`(`textureContentCache` は無期限) | 両方とも**小さい値オブジェクト**なのでメモリの実害は無いが、左下の `maps…` が右肩上がりに見えて漏れと誤読する。実機の `texContent335/rimTex2xx` はこれ(=その出撃で一度でも影/縁を付けた絵の種類数)。 | 軽微(計器の読み違い) | コード+実測(ヘッドレス texContent 38→59 で頭打ち) |
| R-7 | 切り出しテクスチャが破棄されない(小) | `:30966 shockSliceTex`(Sprite 鍵・view破棄後も残る)/ `:31362-31368 clawMarkTex`(view ごと・container.destroy では Texture は破棄されない) | Pixi 8 の `Texture` は `source.on('resize', …)` を張るので、未破棄の切り出し1枚=共有 source のリスナ1本。敵の数だけ積もる(数百〜千本・数十KB級)。 | 軽微 | コード |
| R-8 | 焼き置きの天井が「使用中の総量」より小さい設計 | `memoryTier.ts:42-56`(スマホ 縁16/影16/白8)/ `pixiScene.ts:3307 SHADOW_BAKE_MAX_LONG_EDGE=512` | 影1枚は実測平均 70〜110KB(ヘッドレス silMB/sil)だが、長辺512へ縮めても大型の敵・ボスは1枚 1MB 級。ボス帯が複数体+歩き16コマ×光の向きで**使用中だけで天井超え**=退避できず、間引きで「一瞬出ない」が常態化する。 | 遊びに支障(見え方) | コード+実測(縁は16MBに到達・張り付き) |
| R-9 | 縁ライティングの候補は「画面に居る物」ではなく「表に居る物」全部 | `:20043-20058 syncRimLights`(trees/wallObjs/propObjs/cityPropObjs/breakableProps を全件 views に積む)→ `drawRim` で全件 `sampleRim` | 木・プロップは `syncTrees` 等が画面マージン内に刈るので有界だが、ステージ4は散布物(テント28/バス23/塔20=実測71枚)が多く、**光源数×71** の距離計算を毎フレーム行う。時間で増えないので「急に重い」の主因ではない。 | 軽微 | コード+実測 |
| R-10 | 強glowの投影影は依然 per-frame Graphics | `:13637-13835 syncLocalEventLighting`(強glow 1個ごとに最大22体×図形を `Graphics` で描き直し) | CLAUDE.md 実測どおり glow 1個≈2ms。時間で増えないが、R-1 で拾い物が増えても候補には入らない(候補は敵/味方/プロップ)=ここは無関係。 | (既知) | コード |
| R-11 | ヘッドレスの端末格が `pc` | `memoryTier.ts:16-27`(`userAgentData.mobile` が取れたら優先) | Playwright の `isMobile:true` でも Chromium の UA-CH は `mobile=false` → 天井が 64/32/32 で測られる。**ヘッドレスで「スマホの天井に張り付く」を再現する時は `?rimbudget=16&silbudget=16&whitebudget=8` を必ず付ける**(v0.25.5184 の検証も同じ罠を踏みうる)。 | 軽微(検証手順) | 実測 |

---

## ③ 重点の症状について分かったこと

### 3-1. 時間で増える物の実測(ヘッドレス・ステージ4・約2分のゲーム時間)
| 指標 | 開始 | 2分後 | 読み |
|---|---|---|---|
| `obj`(表示物) | 1072 | 1402〜1450 | 1.3倍。増分は groundLayer(210→444)と actorLayer(358→510)。**ボットが拾うので pk≦14**。地面層の増分は血溜まり/砂埃のプール(hidden 60枚)・影プール(27→52)・拾い物。 |
| `texContent`/`silTex` | 38 | 52〜59 | 頭打ち。=見た絵の種類数(R-6) |
| `rimBakes` | 177 | 377(27MB・pc天井64) | スマホ天井16MBだと **約30秒で張り付く**(sat-run: 169枚/15.8MB) |
| JSヒープ | 140〜172MB(dev・HMR込み) | 変動・右肩上がりではない | |
| `sync()` 平均 | 14ms(初回30秒) | 4.6〜5.7ms | 初回は焼き+読み戻しで重く、以後は軽い=「途中までは快適」と一致 |
| Pixi 内部 `_batchersByInstructionSet` | 2 | 2 | v0.25.5086 の直しは効いている |

**スマホの天井を明示した長回し(sat-run・ゲーム時間 4.6分・`?rimbudget=16&silbudget=16&whitebudget=8`・2秒ごとに体力を戻してボットを生かした)**:
| 経過(ゲーム時間) | 焼き回数/描画フレーム | 縁 | 影 | 白 | `sync()` 平均 | 壊れた焼きを貼った影 |
|---|---|---|---|---|---|---|
| 〜17s | **6.9**(297/43) | 169枚 15.8MB(**天井到達**) | 48枚 6.7MB | 19枚 1.0MB | 15.3ms | 0 |
| 〜67s | 0.7 | 219枚 16.0MB(張り付き) | 59枚 7.5MB | 23枚 | 5.4ms | 0 |
| 〜146s | 0.8 | 360枚 16.0MB | 95枚 9.6MB | 35枚 | 6.2ms | 0 |
| 〜278s | 0.2〜1.2 | 305枚 16.0MB | 103枚 10.0MB | 40枚 2.2MB | 5.3〜7.2ms | 0 |
- **縁は30秒以内に16MBへ張り付き、以後ずっと張り付いたまま**(散布物71枚+木+敵×8方向×倍率段)。間引き(150ms)は効いていて、焼きは 7→1回/フレーム以下へ落ちる。
- 影は 10MB で天井(16)に届かず、R-4 の「壊れた焼きを貼る」は**この条件では起きなかった**(`meshDestroyed=0`・`lastDestroyed=0`)。
- `sync()` も JS ヒープ(133〜182MB・dev)も**時間で伸びない**。ヘッドレスのボットは拾い物を拾ってしまうので(pk≦14)、社長の遊び方で起きる R-1 の蓄積はここでは出ない。

**描画側の表(Map)で delete/clear の対が無い物は無かった**(`shadowPoolV9`/`rimViews`/`fxLatches`/`effects`/`pickups`/`escortFlashSprites`/各種メモ: 全部に削除経路あり・`diagCountsText` も頭打ち)。
よって `obj2436` は**シミュ側の配列(拾い物・死体・効果)が増えた分の写し**と見るのが筋。SIM監査 S-1「拾い物の無制限蓄積」が描画側では R-1 の倍率で効く。

### 3-2. 最有力の筋書き(3つが同じ頃に重なる)
1. **拾い物の蓄積**(SIM S-1)× **描画側に間引きが無い**(R-1): 経験値の玉・弾・薬が画面外に数百個 → 地面層・影層に千〜二千の表示物 → 毎フレームの `sync()` と Pixi の描画命令生成が線形に伸びる。`obj2436` はこの倍率(1個=5〜6物)でちょうど説明できる。
2. **焼きの天井張り付き**(R-2/R-8): ステージ4は散布物71枚+木+敵型が多く、縁は約30秒で16MBに届く。間引き後も**1回の焼きが重い**(3パス+読み戻し)。張り付いた瞬間から「1〜2回/フレームの重い焼き」が常態化する。
3. **メモリ圧**: `tex162MB`(うち約10MBは研究所の床=R-3)+`bake41MB`+JSヒープ(dev実測140〜170MB・本番はもっと小さいが100MB級)+画面RT ≒ **250〜300MB**。iOS が WebContent を殺す帯(200〜400MB)に入るとその前段で**GCと再確保が激しくなり全体が重くなる**。社長の「落ちる直前の記録」が残っている=最終的に殺されているので、この帯に居たことは確か。

### 3-3. 確かめ方(実機・優先順)
1. **左下の `tm` と `fps`**(v0.25.5188): 重い時に `tm` が数千ms なら「タイマー渋滞」=一時停止でメニューが出ない理由はこれ(R-5)。`fps` が一桁で `bk` が 5〜10 なら焼き(R-2)、`bk` が 0〜2 で重いなら表示物(R-1)かメモリ圧。
2. **`st[pk…]` の値**(crashWatch の行に既にある): 重い時に `pk` が百を超えていれば R-1 確定。`?hidelayer=` に拾い物/影があればそれで切る(無ければ `__gameStore.setState({pickups:[]})` を DEV で叩いて軽くなるか見る)。
3. **`?rimbudget=16&silbudget=16&whitebudget=8` をPCで付けて同じ場面を遊ぶ**: PCでも張り付きの重さ(R-2)が出るかで、焼きの寄与を切り分けられる(`bk` を見る)。
4. **R-3 の確認**: ステージ4で左下の `tex` が約10MB下がれば直った(`floor:S G` の表示を `--` にしても絵は1pxも変わらない)。

---

## ④ 改善・改良のアドバイス(仕様を変える物は「提案」・実装はしていない)

### 性能(重い順)
- **A-1(R-1)拾い物と影に視野の間引きを入れる**: `syncPickups` で `effectNearViewport` と同じ判定(ズーム引き `ZOOM_MIN_ABS` 込みの可視矩形)の外は `hideEffectView` 相当で隠し、影の要求も積まない。影は `placeShadowV9` の冒頭で `shadowVisibleRect()`(既にある)で早期return。**見た目は変わらない**(画面外の物を描かないだけ)。負荷 1/10(下げる側)。シミュ側の上限(SIM S-1)と**両方**やるのが筋——描画だけ間引いても配列の走査は残る。
- **A-2(R-2a)焼き用フィルタを使い回す**: `BlurFilter`×2(hard/soft)・白/黒の `ColorMatrixFilter`・縁の2個を `penumbraFilter` と同じく**インスタンス1つずつ**持ち、`strength`/`matrix` だけ書き換える。焼きの固定費が消え、WebGPU 経路の BindGroup 増殖も防げる。見た目不変。
- **A-3(R-2b)読み戻しをやめる(提案)**: `extract.pixels` は「絵の実体の上下左右端」を測るためだけ。これは**ビルド時に台帳化できる**(`scripts/asset-masters.mjs` に alpha の外接矩形を書き足し、実行時は表を引くだけ)。GPU→CPU の同期待ちがゲーム中から消える。シート切り出し(コマ)も同じ表で引ける。
- **A-4(R-8)影の焼きを「表示px基準」へ(提案)**: いまは元素材(長辺≦512)で焼くが、影は台形に伸ばしてぼかすので**画面での表示px(縦85〜180)程度**で足りる。縁(`rimTexture`)が既にやっている「shown から逆算して段で丸める」と同じ作法にすると、1枚 1MB 級が 100KB 級になり、**16MB の天井に使用中の総量が収まる**=張り付き自体が起きにくい。見え方は実機で確認が要る(CLAUDE.md「毎回画を見て」)。
- **A-5 焼きの合計に1つの財布を持つ**: 縁/影/白を別々の天井で守っているが、ENGINEERING_NOTES が指摘するとおり**合計を誰も見ていない**。`renderStats` の `liveBakes` が既に全部を知っているので、合計の上限(例: スマホ 40MB)を1つ置き、超えたら**一番古い種別から**退避する。

### メモリ
- **M-1(R-3)版数表示の `floor:` 診断を外すか、`textures.has()` 系の「読まない問い合わせ」に替える**: `getTexture` は安全網として読みに行く設計なので、診断で呼ぶと副作用がある。`pixiTextures` に `peekTexture(name)`(読みに行かない)を1本足して診断はそれを使う。即効で約10MB。
- **M-2 近接スイングのシートが過大**: `knife-swing-2/3` が 1202×694(3.18MB×2・+1枚目)で**常駐**。表示は刀身数十px。CLAUDE.md「ドット数≒表示px」に照らすと 1/4〜1/8 寸で足りる(原盤は `public/` に残し、出力側で縮める規約どおり)。他にも `fx/blood-pool`・`fx/dust`(2048×512=4MB×2)、`castle-church`(3.56MB)が上位。ステージ4の常駐 **168MB(674枚)** の内訳(`__texList` を1階層目で集計): **fx=58.4 / lab-floor=10.9 / mutant=9.6 / props=8.8 / lab-zombie=6.9 / knife=6.8 / zombie=5.7 / castle=4.6 / lab-props=4.6 / treasure=3.1 / hunter=2.8**(MB)。
- **M-5 ステージ2専用の素材が全ステージで常駐**: `lab-zombie/*`(歩き/跳び・計6.9MB)と `lab-props/*`(4.6MB)は起動マニフェストの常駐側(`pixiTextures.ts:781-817` 付近・`SHEET_RESIDENCY` でも deferred にされていない)。研究所の床(R-3)と合わせると**ステージ2以外で約22MBが無駄に常駐**している。CLAUDE.md の決め方(「そのステージにしか出ないか」)に照らすと `deferred` 側(`lab` グループ)へ移す候補。
- **M-3 出なくなった敵型のシートを畳む(提案)**: `warmEnemySheets` は現れたら読むが、**その後消す経路が無い**ので、ステージ内で登場した全型のシートが最後まで常駐する。「最後に描いてから N 分見ていない型」は `Assets.unload` して `deferred` に戻す(再登場時は網が拾う=立ち絵フォールバックで一拍遅れるだけ)。
- **M-4 計器の読みを正す(R-6)**: `rimTexCache` の外側 Map は空になったら delete、`texContent` は「種類数」と分かる名前(例 `seenTex`)に。実機の数字で漏れを疑う時間が減る。

### 見え方
- **V-1(R-4)destroyed の焼きを貼らない**: `sl.lastTexture?.destroyed` なら null 扱い(接地2枚の簡易影へ)。1行の防御で「白い矩形の影」「以降の同期が飛ぶ」を塞げる。
- **V-2 天井張り付き時の「一瞬出ない」を均す(提案)**: いまは間引きで**縁が出ない/光らない**フレームが点在してチラつく。張り付いている間は**新規の焼きを止めて既存だけで描く**(縁は出ない方向へ倒す)方が、出たり消えたりより落ち着いて見える。社長が実機で選ぶ所。

### 保守性
- **K-1 焼きの入口を1クラスに**: `bakeRenderTexture`/`renderBake`/`allowBake`/各 `enforce*Budget`/`silhouetteEvictToBudget` が pixiScene の離れた場所に散っている。`BakeCache`(種別・天井・LRU・フィルタの使い回し・計器)を `src/pixi/bakeCache.ts` に切り出すと、A-2/A-5/V-1 が1箇所で済み、`bakeLedger.test` のような純関数テストも書ける。
- **K-2 ヘッドレス手順に端末格の罠を書く(R-11)**: `TEST_HANDOFF/HEADLESS.md` に「Playwright の isMobile は `memoryTier` を phone にしない。天井の再現は `?rimbudget=16&silbudget=16&whitebudget=8`」を1行。
- **K-3 `__pixiScene` の診断に「層ごとの中身」を足す**: 今回の調査で一番効いたのは「groundLayer/actorLayer の子を `constructor+label+texture名` で数える」ことだった(散布物71枚・hidden プール60枚が即見えた)。`diagCountsText` の `obj…[層]` の次段として `?objdiag=1` で出せると、実機の「どの絵が増えたか」が1行で分かる。

### 「より面白くなる方」への添え書き
- A-1/A-4 で浮いた描画予算は、**強glowの投影影(CLAUDE.md 実測で唯一高い物)を増やす側**に回せる=爆発の光で世界中の影が揺れる場面を減らさずに済む。今は天井に当たって縁が消える方向へ倒れているので、まず「消えない」を取り戻すのが面白さに直結する。

---

## ⑤ 調べた範囲と調べ切れなかった範囲

### 調べた
- `pixiScene.ts`: 焼き系(`bakeSilhouette`/`drainSilhouetteQueue`/`silhouetteEvictToBudget`/`rimTexture`/`enforceRimBudget`/`whiteSilhouette`/`enforceWhiteBudget`/`renderBake`/`bakeRenderTexture`/`releaseBakedTexture`)・影(`syncShadowsV9`/`placeShadowV9`/`drawShadowSlot`/GC)・縁(`syncRimLights`/`drawRim`/`pruneRims`)・強glow投影影(`syncLocalEventLighting`)・`sync()` 冒頭・`syncEffects`・`syncPickups`/`drawPickup`・`syncTrees`・軍人の沈み(`escortSunkTexture`)・`diagCountsText`/`destroy`・Map 193本の set/delete の対応(全部に削除経路あり)。
- `pixiTextures.ts`: 遅延組(`DEFERRED_SPRITE_GROUPS`/`getTexture` の網)・`textureMemoryMB`/`textureBreakdown`/`__texList`。
- `PixiStage.tsx`: 初期化(解像度=スマホ1/PC2・`antialias:false`)・ticker と一時停止・`tick` の try/catch。
- `useGameLoop.ts`: dt の頭打ち(`min(0.05, raw)`)・rAF の鎖の見張り(`LOOP_WATCHDOG_STALL_MS=1500`・`cancelAnimationFrame` してから張り直す=二重の鎖にはならない)。
- Pixi 8.19 内部: `RenderTargetSystem`(読み戻しの RenderTarget は source 鍵・destroy で消える=漏れなし)・`GlTextureSystem.getPixels`(frame 範囲の `readPixels`)・`Container.destroy`(フィルタは破棄しない)・`Texture`(source の `resize` を購読)・`BatcherPipe`(束ね役は2個のまま)。
- ヘッドレス実測: 4本(leak-stage4 ×2・sat-stage4 ×1=ゲーム時間4.6分・pickup-cost ×1)。コンソールの警告は AudioContext の自動再生と `[sprites] player-*-game-*: 幅96px>基準78px`(既知の素材規格の注意)のみで、描画の例外は0件。

### 調べ切れなかった
- **実機のみで出る3つ**: ①`tm`(タイマー渋滞)の実値 ②iOS のメモリ圧の挙動(ヘッドレスでは `performance.memory` の JS ヒープしか見えない・GPU常駐は推定) ③WebGPU 経路(iOS26 Safari が WebGPU を既定で持つなら Pixi は WebGPU を選びうる。`renderer.type` を計器に出すと分かる)。
- **9分ぶんのゲーム時間**: ヘッドレスはシミュ駆動を差し替えても約2〜5分が限度(ボットが死ぬ/CPUが詰まる)。拾い物の蓄積は社長の遊び方(拾わずに走る)に依存するので、ボットでは再現しない=R-1 は「置いて測る」形で確かめた。
- **pixiScene の全域**: 38,829行のうち読んだのは焼き・影・縁・効果・拾い物・木・軍人・診断に関わる約4,000行。ボス個別の技の絵(`phill*`/`bounty*`/`jibril*` 等の Map 群)は set/delete の対の有無だけ確認し、中身は読んでいない。
- **lighting.ts**: 焼いたテクスチャ(glow/ring/fog 等)は全部モジュール単位の1回キャッシュで、per-frame の生成は無いことだけ確認(`Texture.from(canvas)` 29箇所・全部 memo)。
- **音・HUD(React)**: 別担当(UI監査)の範囲。

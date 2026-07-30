# テスト依頼 #6: 守護霊(ゴーストAI)総合+新FX+POI-UX(v0.25.2544)

> **全体の目安 60分・パート順に優先度が下がる**。時間が足りなければ後ろから切る
> (パート1が本題。パート4は放置可)。

## 目的
守護霊のパリティ工事一式(v0.25.2489〜2543の約20版: 刀/ワイヤー・行動品質・弾回避・サブ独立CD・
分身/センサーマイン)と新FX(v0.25.2544)の**実走確認**。ロジックはユニットテスト済みなので、
見たいのは**①守護霊が実戦で生存できるか(数字) ②絵が実際に出るか(スクショ)**。

## 前提(依頼#5と同じ流儀)
- **PCの本物のChromeを headed(`headless:false`)で**。`npm run dev` の開発サーバ必須
  (ワープ/計測に使う `window.__gameStore` はDEVビルド限定)。
- `git pull` して package.json の version が **0.25.2544 以上**であること。
- viewport **390×844(縦)**。URL: `http://localhost:5173/zombie/?smoke&ghost=1&stage=stage-1`
  (**`ghost=1` を忘れない**=装備なしで守護霊召喚が有効になる開発フラグ)。

## パート1(本題・約25分): 弾幕ボス戦での守護霊の生存性
1. ゲーム開始後、F12コンソールで**ゴーストHPサンプラー**を仕込む:
```js
setInterval(()=>{const s=window.__gameStore.getState();const g=s.summons.find(u=>u.kind==='ghost-ally');
const b=s.enemies.find(e=>['mimir','jormungand','skadi','thor'].includes(e.type));
console.log('[GHOST]',Math.round(s.gameTime/1000)+'s','ghostHP='+(g?Math.round(g.health)+'/'+Math.round(g.maxHealth):'none'),
'bossHP='+(b?Math.round(b.health):'none'));},1000);
```
2. **裏ボスの巣へワープ**(ステージ1=ミーミルは**西9000**):
```js
window.__gameStore.setState(s=>({player:{...s.player,x:-8600,y:0}}));
```
3. ボス戦が始まると守護霊が自動召喚される。**ボット任せで戦闘を見届ける**(死んだら再ラン)。
   これを**3ラン**。
4. 記録してほしいもの(ランごと):
   - `[GHOST]` ログ全文(=守護霊HPの時系列。**何秒生きたか**が最重要)
   - 守護霊が**立ち止まらず横歩き**しているか(目視・10秒ほど観察してのメモ)
   - **弾を避ける動き**をするか(ミーミルのバースト/全方位弾で。全部は食らわないはず)
   - `Counter!`(青)・`Kill!`(赤)の文字・カウンター窓リング(短い輪のフラッシュ)を見たら都度メモ
   - スクショ2枚以上(戦闘中・守護霊が写っているもの)
   - consoleエラー全文(なければ0件と明記)
- **合否の目安**: 守護霊がボス戦を通して**60秒以上**生存する(旧: 数秒〜十数秒で溶けていた)。

## パート2(約15分): ミーミル戦の新FX(パート1と同時進行でよい)
- **噛みつきの上下顎**: ミーミルの噛みつき(bite)の予告中に上下の顎が開いて閉じる絵が出るか。スクショ。
- 出なかった場合は「出ない」の証拠スクショ(噛みつきの瞬間)を撮る=それが収穫。

## パート3(約10分): POI-UX+武器庫=銃
1. 新しいランを開始(同URL)。**警察署へワープ**(ステージ1の配置はランダムなので、まず座標を出す):
```js
const s=window.__gameStore.getState();console.log('police',s.police,'armory',s.armory,'hospital',s.hospital);
```
出た座標の**手前80px**あたりへ x/y ワープ(上のsetStateの式を流用)。
2. 確認: **進入時に左上へ通信**が出るか(警察署=アリーナ発動時)/制圧後に**入手トースト
   (スキル名+説明)**と**「警察署 解放」帯**が出るか。スクショ。
3. 同様に**武器庫**へ。サークル3秒→**銃(Tier3)が付与される**か(装備ではなく銃!)・トースト表示。
   スクラップ不足なら警告が出るか。スクショ。
4. 病院も余裕があれば(通信+ワクチントースト)。

## パート4(任意・放置・約20分): 回帰ボットラン
- `node scripts/botrun-local.mjs`(request.config.json は ghost-regression 2構成に更新済み)。
- 見るもの: consoleエラー0件・`[BOT_REPORT]` 生JSON(結果に貼る)。

## 結果の書き方
- `results/<YYYYMMDD-HHMM>-ghost-fx-poi.md`(+同名.json に [GHOST]ログ・[BOT_REPORT]生データ)。
- 各パートの合否メモ+スクショ+consoleエラー全文。**判断はしない**(分析は設計チャット)。

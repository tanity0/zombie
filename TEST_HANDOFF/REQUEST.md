# テスト依頼 #5: 廃病院オブジェクトの実地確認(v0.25.2331)

## 目的
新規追加した**廃病院**(近づくとサークル→3秒滞在でワクチン入手→建物がフェードアウトして消える)が、
実際のゲーム上で **出る / 見える / 取れる / 詰まらない** かを確認する。ユニットテスト(純関数17ケース)は
既に通っているので、**確認したいのは描画と配線**(素材が出るか・サークルが出るか・付与が走るか)。

**今回は botrun ではない。`request.config.json` は使わない**(`scripts/botrun-local.mjs` は回さなくてよい)。
ボットは病院(原点から6250px)まで歩いて行かないので、**プレイヤーをワープさせて直接確認する**。

## 前提(ここが今回の肝)
- **必ず `npm run dev` の開発サーバでテストする**(`npm run build` + preview では不可)。
  ワープに使う `window.__gameStore` は **DEVビルド限定**のデバッグハンドルで、本番ビルドには付かないため。
- `git pull` して **HEAD が v0.25.2331 以上**であること(`package.json` の version で確認)。
- ブラウザはローカルChrome(Playwright `channel:'chrome'`)。headless で可。viewport は 390×844(縦持ち想定)。
- URL: `http://localhost:5173/zombie/?smoke&stage=stage-1`
  (ポートは `npm run dev` の出力を見て合わせる。`?smoke` でタイトルを飛ばして即プレイに入る)
- ステージ1の裏ボスは西なので、**病院は東= `(x=6250, y=0)`** に立つ。
- 座標系: **上が -y**。病院の当たり判定は足元基準で `y ∈ [-80, 0]`・幅260(`x ∈ [6120, 6380]`)。
  サークルの中心は足元 `(6250, 0)`・半径95。

## やること(この順で)

### 0) 起動して病院の座標を確認
```js
// page.evaluate
const s = window.__gameStore.getState();
return { hospital: s.hospital, taken: s.hospitalTaken, dwell: s.hospitalDwellMs };
```
→ `hospital` が `{x: 6250, y: 0}`(誤差1px以内)であること。`null` なら**そこで止めて報告**(以降は無意味)。

### 1) 建物が描かれるか(スクショ2枚)
```js
window.__gameStore.setState(st => ({ player: { ...st.player, x: 6250, y: 420 } }));
```
→ 1秒待ってスクショ **`hospital-far.png`**(病院が画面上方に見えるはず)。
```js
window.__gameStore.setState(st => ({ player: { ...st.player, x: 6250, y: 240 } }));
```
→ 1秒待ってスクショ **`hospital-near.png`**(**緑のサークル**が足元に出はじめているはず)。

**見てほしいこと(判定はしなくていい。事実だけ書く)**
- 建物の絵が出ているか(真っ白/透明/箱だけ、なら素材ロード失敗)
- 建物の大きさは画面に対してどのくらいか(だいたいの画面比でよい)
- サークルは出ているか、建物のどのあたりに出ているか

### 2) 歩いて近づく→当たり判定→3秒滞在→ワクチン入手
```js
window.__gameStore.setState(st => ({
  player: { ...st.player, x: 6250, y: 300 },
  hospitalDwellMs: 0, hospitalTaken: false,
}));
```
→ そのあと **`W`(上)キーを押しっぱなしで5秒**(`keyboard.down('w')` → 5000ms待つ → `keyboard.up('w')`)。
→ 押している間、**1秒ごとに**次を記録(5点):
```js
const s = window.__gameStore.getState();
return { x: Math.round(s.player.x), y: Math.round(s.player.y),
         dwell: Math.round(s.hospitalDwellMs), taken: s.hospitalTaken,
         vac: s.player.vaccineRevives, banner: s.eventBannerText };
```

**期待している動き(違ったらそれが報告価値のある事実)**
- プレイヤーは `y≈0` あたりで**止まる**(建物の土台に当たる)。`y` が `-80` より上へ進んでいたら**すり抜け**。
- 止まったあと `dwell` が 0 → 3000 へ増えていく。
- 3秒到達で `taken:true` / `vac` が **1 増える** / `banner` が「ワクチンを入手」。
- そこで**スクショ `hospital-taken.png`**(バナーが出ている瞬間)。

### 3) フェードアウトで消えるか
2)の入手から **1.5秒後**にスクショ **`hospital-gone.png`**。
→ 建物・サークル・影が**消えている**か(残っていたらその旨を書く)。
→ 続けて、消えたあと**同じ場所を通り抜けられるか**を確認:
```js
window.__gameStore.setState(st => ({ player: { ...st.player, x: 6250, y: 300 } }));
```
→ `W` 押しっぱなし4秒 → 最終 `y` を記録(**`-200` くらいまで通れれば素通りOK**。`0` で止まったら当たり判定が残っている)。

### 4) 方角マーク(拠点解放で出る緑の十字)
ページを**リロード**して(`?smoke&stage=stage-1` で入り直し)、まず**制圧前**のスクショ
**`hospital-arrow-before.png`**(原点付近で1枚。マークが**出ていない**ことの対比用)。そのあと:
```js
// 東(base-0)を制圧済みにする=病院の方角の拠点
window.__gameStore.setState(st => ({
  baseSites: st.baseSites.map(b => b.id === 'base-0' ? { ...b, status: 'captured' } : b),
  player: { ...st.player, x: 0, y: 0 },
}));
```
→ 1秒待ってスクショ **`hospital-arrow.png`**。画面の**右端あたりに緑の丸+白い十字**のマークが出ているか。

### 5) 最大ズーム引きで破綻しないか(CLAUDE.md「ズーム引き考慮」)
`http://localhost:5173/zombie/?smoke&stage=stage-1&zoomlock=1` で入り直し、
```js
window.__gameStore.setState(st => ({ player: { ...st.player, x: 6250, y: 300 } }));
```
→ 1秒待ってスクショ **`hospital-zoomlock.png`**。
→ 建物・サークル・影が**画面からはみ出す/二重になる/位置がズレる**ことがないか。

## 記録してほしいこと
- 上の**スクショ7枚**(`TEST_HANDOFF/results/` に置く。ファイル名は上記のまま)
- 各ステップの `page.evaluate` の**戻り値そのまま**(丸めない・要約しない)
- **consoleエラー/警告の全文**(0件なら「0件」と明記)。特に `hospital` テクスチャの404が無いか
- 実行環境(OS/Chromeバージョン/headless か headed/viewport)と HEAD のコミットハッシュ+version
- 気づき(任意)。**判定・原因分析はしなくてよい**(設計チャットがやる)

## 目安
**10〜15分**(ボットランなし・ワープ主体なので短い)。

## 結果の出し方
`TEST_HANDOFF/results/<YYYYMMDD-HHMM>-hospital.md`(+スクショ)にまとめ、
`[test-report]` コミットで `claude/chat-context-continuity-saxlH` へ push。

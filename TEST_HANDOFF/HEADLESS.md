# ヘッドレスでゲーム画面を撮る手順(2026-08-22・実測で確立)

**毎回ここでつまづくので手順を固定した**(社長指示)。ゲームは起動時に複数の関門があり、
素直に開くだけでは**戦闘画面に到達しない**。以下を上から順にやれば通る。

## 1. ブラウザは環境の Chromium を使う(`npx playwright install` は絶対にやらない)

プロジェクトの `playwright` が期待するバージョンと、環境に入っているバージョンは**違う**。
そのまま `chromium.launch()` すると
`Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-<新>/…` で落ちる。

```js
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',   // ← シンボリックリンク。これを必ず指定
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
```
`--use-gl=swiftshader` が無いと WebGL が出ず canvas が生成されない(GPU が無い環境のため)。

## 2. スクリプトは**プロジェクト直下**で実行する

`/tmp` に置いた `.mjs` を `node /tmp/…` で実行すると `ERR_MODULE_NOT_FOUND`(node_modules を解決できない)。

```
node --input-type=module -e "…"
```
の形にする(cwd がプロジェクトなら import が通る)。

## 3. ★関門を「押す」のではなく「先に潰す」

**ここが毎回の失敗点。** クリックで突破しようとすると、
`更新情報 → OK → OP → スキップ → また更新情報 …` とループして**戦闘画面に入れない**(実測3回失敗)。
**クリックに頼らず、localStorage を先に仕込んでから開く。**

```js
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
// ★ページを開く前に、同じオリジンで localStorage を仕込む
await p.addInitScript(() => {
  try {
    // 更新情報ポップアップの既読(キー名は src/components/ の changelog 表示側を grep して確認する)
    localStorage.setItem('zombie:changelogSeen', '9999.9999.9999');
    localStorage.setItem('zombie:opSeen', '1');   // OP の既読
  } catch {}
});
await p.goto('http://localhost:5173/zombie/?…');
```
**キー名はバージョンで変わりうるので、`grep -rn "localStorage.setItem" src/` で実物を確認してから書く。**
(この手順書を書いた時点では実キー未確認=次にやる人が確認して**ここへ実キー名を追記すること**)

## 4. 戦闘画面へ直行するクエリ

| 目的 | クエリ |
|---|---|
| フィル(EXボス)の練習 | `?phillnow=1` |
| 城ボスの練習 | `?castlenow=1` |
| 裏ボスの練習 | `?bossnow=1` |
| 賞金首の練習 | `?bountynow=1` |
| 幻影 | `?phantomnow=1` |
| ゲート2ボス | `?gateboss=1` |
| 全ボス自動巡回 | `?gauntlet=1&bot=standard&botskill=master` |
| チュートリアル自動送り | `&autotut=1` |
| ズーム固定(引きの確認) | `&zoomlock=0.4` |

## 5. canvas が出るまで待つ(固定待ちにしない)

```js
await p.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 60000 });
await p.waitForTimeout(8000);  // テクスチャのロードと演出の落ち着き待ち
await p.screenshot({ path: '…/shot.png' });
```
`canvas: none` のままなら**まだ関門を抜けていない**。スクショを見て、どの画面で止まっているか確認する。

## 6. dev サーバ

```
npm run dev            # http://localhost:5173/zombie/
```
バックグラウンドで起動し、`ready in` が出るまで待つ(約6秒)。**pull した後は必ず再起動する**
(版ラベルが古いまま焼かれる事故が過去にあった)。

## ★やってはいけないこと
- `npx playwright install`(環境のブラウザを壊す/ダウンロードが走る)
- クリックのループで関門を抜けようとする(**3で潰す**)
- `/tmp` に置いたスクリプトを直接 node で実行する(**2**)

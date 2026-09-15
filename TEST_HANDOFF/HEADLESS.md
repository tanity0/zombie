# ヘッドレスでゲーム画面を撮る手順(2026-08-22制定・2026-09-08実物確認で全面改訂)

**毎回ここでつまづくので手順を固定した**(社長指示)。ゲームは起動時に複数の関門があり、
素直に開くだけでは**戦闘画面に到達しない**。以下を上から順にやれば通る。

## ★0. 起動の土台は既存のランナーを読むこと(推測で書かない)
このファイルの正本は **`TEST_HANDOFF/run-e2e-sweep.mjs`** と **`scripts/botrun-local.mjs`**。
どちらも実際に動いているスクリプトで、そこで使われているクエリ・localStorageキーが実物。
新しく手順を書く/直す時は、まずこの2本を読んでから書く。

## 1. ブラウザは環境の Chromium を使う(`npx playwright install` は絶対にやらない)

プロジェクトの `playwright` が期待するバージョンと、環境に入っているバージョンは**違う**。
そのまま `chromium.launch()` すると
`Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-<新>/…` で落ちる。

```js
const b = await chromium.launch({ headless: true, channel: 'chrome' })
  .catch(() => chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',   // ← シンボリックリンク。これを必ず指定
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  }));
```
`--use-gl=swiftshader` が無いと WebGL が出ず canvas が生成されない(GPU が無い環境のため)。
`channel:'chrome'` が失敗した時だけ環境の Chromium にフォールバックする形が
`run-e2e-sweep.mjs`/`botrun-local.mjs` の実装(ローカル=Chrome優先・コンテナ=フォールバック)。

## 2. スクリプトは**プロジェクト直下**で実行する

`/tmp` に置いた `.mjs` を `node /tmp/…` で実行すると `ERR_MODULE_NOT_FOUND`(node_modules を解決できない)。

```
node --input-type=module -e "…"
```
の形にする(cwd がプロジェクトなら import が通る)。

## 3. ★関門は「押す」のではなく「`?smoke=1` で丸ごと迂回する」(実物確認済み・旧版の記載は誤り)

**旧版のこの節は「`zombie:changelogSeen`/`zombie:opSeen` を localStorage に仕込む」という手順を
書いていたが、そのキーは src のどこにも存在しない(grep 0件)。実際の関門の抜け方は別にある。**

`App.tsx` の `?smoke=1` ハンドラ(`smokeHandledRef`)は、**タイトル画面(更新情報モーダル含む)も
オープニング演出も丸ごと通らずに `startGame` へ直行する**(`onNoticeOk` 経由でしか `OpeningScene` は
マウントされないが、smoke経路はその呼び出し自体を踏まない)。**localStorageの事前注入は一切不要**。

```js
await p.goto(`http://localhost:5173/zombie/?smoke=1&stage=stage-1&autotut=1&bot=standard`);
```

**`?smoke=1` が何らかの理由で不発だった場合のフォールバック**(`run-e2e-sweep.mjs`/`botrun-local.mjs`
と同じ実装)は、タイトルの「**はじめる**」を1回クリックするだけでよい(以降は `?smoke=1` が
自動出撃させるので、ステージ選択〜出撃準備のクリック列は不要=空振りする)。

```js
await p.waitForTimeout(9000);
const titleTxt = await p.evaluate(() => document.body.innerText).catch(() => '');
if (titleTxt.includes('はじめる')) {
  await p.getByText('はじめる', { exact: false }).first().click({ timeout: 15000 }).catch(() => {});
}
```

### 3-1. チュートリアルポップアップ(`isPaused` が立つ)は `?autotut=1` で迂回
`?autotut=1` はポップアップを出さず既読処理のみ行う・ポーズしない(`useGameLoop.ts` の
`AUTOTUT`/`evParam('autotut')`)。レベルアップ/宝箱の選択画面もボットと同じ決定的ポリシーで
自動選択され、ポーズで `gameTime` が凍結しない(TEST_HANDOFF/README.md の申し送りと同一)。

### 3-2. 武器商人の購買画面(`showShopMenu`)
出撃地点近くの商人に触れると開く。ボットは自分で閉じられないので、**毎ポーリングで
`showShopMenu` が true なら false に戻す**(TEST_HANDOFF/README.md 既存の申し送りのとおり)。

### 3-3. 実際に使われている localStorage キー(2026-09-08 grep 確認・`botrun-local.mjs`)
サブウェポン/スキルを事前に持たせたい時は、**ページを開く前に** `addInitScript` で以下を仕込む
(`?smoke=1` はこれらを読み替えない=進行データの体裁を借りるだけの通常の仕組み):

| キー | 中身 | 備考 |
|---|---|---|
| `zombie:loadoutSubs` | `SubWeaponKey[]` のJSON | 装備サブ(`pendingLoadout`)。`purchasedSubLevels>=1` で絞られるため、未購入のキーを混ぜても出撃時に落ちる(下記4参照) |
| `zombie:loadoutSkills` | `SkillKey[]` のJSON | 装備スキル |
| `zombie:ownedSkills` | `SkillKey[]` のJSON | 所持スキル一覧 |
| `zombie:ownedSkillLevels` | `{[key]: number}` のJSON | スキルLv(botrun-local.mjsは全指定スキルをLv3で注入) |

`zombie:tutorialsSeen`(`src/utils/tutorialArchive.ts`)はチュートリアル資料室の既読記録で、
戦闘画面到達には無関係(`?autotut=1` を使えばこのキーを触らなくても迂回できる)。
`zombie:changelogSeen` / `zombie:opSeen` という名前のキーは**存在しない**(旧版の誤記)。

## 4. `?weapon=<key>` / `?sub=<key>`(研究/WEAPON_AI_TEST.md S1-b・武器AI実機テスト専用ツマミ)
出撃時に対象武器/サブウェポンを強制する開発導線(`?unlockall=1` と同じ扱い=進行データには
一切書き込まない)。全武器AIテストの走査ではこれを他のクエリと併用する。

```
?smoke=1&stage=stage-1&autotut=1&bot=standard&botskill=master&weapon=handgun-t3-gunblade&sub=gold-ring
```
- `weapon`: 21ユニーク+各カテゴリ既定キー(`src/data/weaponSlots.ts` の `SLOT_CANDIDATES` を参照)。
  無効なキーは黙って無視(従来どおり装備設定のスロット選択に従う)。
- `sub`: `src/data/campaign.ts` の `SUB_WEAPON_KEYS`/`CHARACTER_SUBWEAPON_KEYS` のいずれか。
  購入済み判定を経由せずそのまま所持サブへ加わる(`?sub=gold-ring` 等、未購入でも持てる)。

## 5. 戦闘画面へ直行するクエリ(ボス練習・全ボス巡回)

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
| 腕前の段階 | `&botskill=novice\|casual\|skilled\|master`(既定 casual) |

これらは `?smoke=1` と両立する(`run-e2e-sweep.mjs` の各シナリオが実例。例:
`smoke=1&stage=stage-1&castlenow=1&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=master`)。

## 6. canvas が出るまで待つ(固定待ちにしない)

```js
await p.waitForFunction(() => !!document.querySelector('canvas'), { timeout: 60000 });
await p.waitForTimeout(8000);  // テクスチャのロードと演出の落ち着き待ち
await p.screenshot({ path: '…/shot.png' });
```
`canvas: none` のままなら**まだ関門を抜けていない**。スクショを見て、どの画面で止まっているか確認する。

## 7. ラン終了レポートの窓口(`window.__BOT_REPORT__` / `window.__BOT_SAMPLE__`)
- `window.__BOT_REPORT__`(`useGameLoop.ts`): botモード時のみ・1ラン1回だけ(死亡/クリア/帰還)
  console + windowへ出る集計。`page.evaluate(() => window.__BOT_REPORT__)` で回収する
  (既存の `run-e2e-sweep.mjs`/`botrun-local.mjs` がこの形でポーリングしている)。
- `window.__BOT_SAMPLE__()`(research/WEAPON_AI_TEST.md S2-b・`?weapon=`/`?sub=` のどちらかが
  立っている時だけ定義される): 毎秒呼べる「今のスナップショット」取得関数。
  `page.evaluate(() => window.__BOT_SAMPLE__?.())` で武器/弾/敵の位置・状態を読める。

## 8. dev サーバ

```
npm run dev            # http://localhost:5173/zombie/
```
バックグラウンドで起動し、`ready in` が出るまで待つ(約6秒)。**pull した後は必ず再起動する**
(版ラベルが古いまま焼かれる事故が過去にあった)。ローカルビルド前提の一括走査
(`scripts/botrun-local.mjs`/`run-e2e-sweep.mjs`)は `npm run build` → `vite preview --port 4173` を
自前で行うので dev サーバは不要(2本を使う時はこの手順を読まなくてよい)。

## ★やってはいけないこと
- `npx playwright install`(環境のブラウザを壊す/ダウンロードが走る)
- クリックのループで関門を抜けようとする(**3で `?smoke=1` を使う**)
- `/tmp` に置いたスクリプトを直接 node で実行する(**2**)
- 存在しない localStorage キー(`zombie:changelogSeen`/`zombie:opSeen`)を仕込む手順を復活させない
  (2026-09-08 に実 grep で存在しないと確認済み。関門は `?smoke=1` で迂回する)

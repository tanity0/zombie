# テスト依頼 #2: 新計測(M35)による実測ソーク=CD/発動率/収支/被弾スケール(v0.25.1721)

## 目的
依頼#1で測れなかった項目を、M35で追加された計測(subUses/overclockProcs/scrapEarned/scrapSpent/
damageTaken/goldEarned)で実測する。センサー地雷はM36で**チャージ制**(Lv個数まで連続設置・1個ずつ10秒回復)に
変わっているので、その挙動確認も兼ねる。

## やること
1. `git pull` → `npm install`(初回のみ)。
2. `node scripts/botrun-local.mjs`(構成は `request.config.json`=6構成×最大15分・放置可)。
3. 結果を `TEST_HANDOFF/results/<YYYYMMDD-HHMM>-m35-metrics.md`(+自動出力の.json)にまとめ、
   `[test-report]` コミットで push。

## 構成と見たい数字
| 構成 | 見たい数字 |
|---|---|
| baseline | 比較基準(kills/damageTaken/goldEarned) |
| sensor-mine + overclock/time-keeper | `subUses['sensor-mine']`(チャージ制: 冒頭に3連続→以後1個/10秒×0.7(TK)ペースか)・`overclockProcs`(発動の~30%成立か=Lv3) |
| junk-weapon + scrap-builder/magnet | `scrapEarned/scrapSpent`(初期+150と取得+30%込みの収支)・`subUses['junk-weapon']`(発射機会が増えたか。依頼#1の19キルから改善するか) |
| heavy-grenade + berserker/exploder | `damageTaken`とkillsの関係(被弾が多いランほど伸びるか)・`subUses['heavy-grenade']`・`goldEarned` |
| support-sniper + overclock/last-magazine | `subUses['support-sniper']`(移動中3秒CD×OCでどこまで増えるか)・`overclockProcs` |
| flare-gun + gold-rush/warm-up | `goldEarned`(ゴールドラッシュ×1.5が乗って妥当な額か)・`subUses['flare-gun']` |

## 記録してほしいこと
- 各構成の[BOT_REPORT]全文(新項目込み)・consoleエラー(0件なら明記)
- 気づき(任意): センサー地雷の置かれ方(冒頭バースト→ポツポツ、になっているか)、その他見た目の異常

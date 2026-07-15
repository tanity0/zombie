# テスト依頼 #3: M38松明フォレージの経済実測+バーサーカー/ゴールドラッシュのON/OFF比較(v0.25.1730)

## 目的
1. **M38(v0.25.1729)の効果測定**: ボットが手空き時に近くの松明を壊すようになった。
   依頼#2でスクラップ供給ゼロ同然だったジャンク構成(獲得5/消費155)の収支がどう変わるか。
2. **依頼#2で分離できなかった2点のON/OFF比較**(同一構成・スキル有無だけ変えて各2ラン):
   - バーサーカー(被弾で火力が伸びるスキル)がkills/生存にどれだけ寄与しているか。
   - ゴールドラッシュのgoldEarned×1.5が実測で乗っているか。

## やること
1. `git pull`(HEADがv0.25.1729以上=M38入りであること)。
2. `node scripts/botrun-local.mjs`(構成は `request.config.json`=**10ラン**×最大15分。
   実測では多くが2〜4分で死亡するので**全体目安30〜45分・放置可**)。
   - ※前回Windowsで落ちたspawn問題(`npx ENOENT`)は**v0.25.1725で修正済み**(shell:true+error捕捉)。
     今回は正規スクリプトで動くはず。**動いたかどうか自体も報告項目**。もしまた落ちたら
     エラー全文を結果に貼り、前回同様の一時ランナー回避でOK(ゲームコードはHEADのままで)。
3. 結果を `TEST_HANDOFF/results/<YYYYMMDD-HHMM>-m38-economy-abtest.md`(+自動出力の.json)にまとめ、
   `[test-report]` コミットで push。

## 構成と見たい数字
| 構成(×ラン数) | 見たい数字 |
|---|---|
| junk-weapon + scrap-builder/magnet **×2** | `scrapEarned`(**依頼#2は5**。M38の松明壊しで増えるか)・`scrapSpent`・`subUses['junk-weapon']`(弾が続くようになったか)・kills(依頼#2は62) |
| grenade + **berserker**/exploder ×2 ↔ grenade + exploder(berserker無し)×2 | ON/OFF間で kills・damageTaken・生存秒を比較(バーサーカーの寄与を分離)。判定は設計チャット |
| flare-gun + **gold-rush**/warm-up ×2 ↔ flare-gun + warm-up(gold-rush無し)×2 | ON/OFF間で `goldEarned` を比較(×1.5が乗っているか)。kills/生存秒も併記(正規化用) |

## 記録してほしいこと
- 各ランの[BOT_REPORT]全文(表にまとめてよい)・consoleエラー(0件なら明記)
- **正規スクリプト(botrun-local.mjs)がWindowsでそのまま動いたか**(v1725修正の実地確認)
- 気づき(任意): 見た目の異常など。判定・分析はしなくてよい(設計チャットがやる)

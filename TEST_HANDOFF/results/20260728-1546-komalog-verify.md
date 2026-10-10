# 動作確認: `?komalog=1`(ランク較正ログ)【2026-07-28 15:46 JST】

- 対象: v0.25.2370 で追加された実機ランク較正ログ。**社長が本気ラン1本を無駄にしないための事前確認**。
- 環境: 本物Chrome headed(GPU)・`npm run dev`(5173)・**v0.25.2370**・src変更なし(掟)。

## 結論
**配線は正しく動く。ただし「短いランでは1件も取れない」ため、遊び方に条件がある。**
加えて**実機(スマホ)では読み出す手段が無い**のと、**帰還(撤退)では出力されない**の2点が実運用の穴。

## ✅ 動いたこと
| 確認項目 | 結果 |
|---|---|
| `?komalog=1` で `window.__KOMA_LOG__` が生える | **OK**(`keys=["jsonl","records","summary"]`) |
| 記録が溜まる | **OK**(2.5分で1件) |
| `summary()` の中身 | **OK** — `{koma, finalRank, maxRank, maxDist, runMinutes, hitsTotal, windowsAtRank, windowsClearing, clearRatePct}` |
| `jsonl()` の中身 | **OK** — 1行に `rank/dist/maxHealth/input{capReached,perfAvg,intensAvg,dmgRatio,starveRatio,hits}/delta/pace{windowsAtRank,windowsClearing,hitStreakMs}` |
| ラン終了時に `[KOMA_LOG]` がコンソールへ出る | **OK**(死亡で1回) |
| **フラグ無しでは何も溜まらない** | **OK**(`__KOMA_LOG__` が生えない・records取得不可)=既定OFFの担保 |

実際に取れたsummaryの例:
```
{"koma":1,"finalRank":3,"maxRank":3,"maxDist":1585,"runMinutes":2.5,
 "hitsTotal":7,"windowsAtRank":3,"windowsClearing":0,"clearRatePct":0}
```

## ⚠ 見つかった問題(3つ)

### ① 短いランは**0件**になる(最重要・遊ぶ前に知る必要がある)
コマは `KOMA_ORDER = relax → harvest → normal → peak` の順で巡回し、**ランは `relax` から始まる**。
記録されるのは **`normal` と `peak` の終了時だけ**(`directorTick.ts:352/359`)。
コマ長は **base 40秒(+台本待ちで最大+30秒)**。
→ **最初の1件が出るまで最短120秒(2分)、実測2.5分。**
- 実測A: 2.5分時点で `koma:1` が記録された。
- 実測B: **99.5秒で死亡 → `{"koma":0}`**(何も取れず)。
- **社長への依頼: 較正ランは最低でも3分、できれば5分以上生存してほしい。** 2分未満だと成果ゼロになる。

### ② **帰還(撤退)では出力されない**
`logKomaSummary()` の呼び出しは **死亡(`useGameLoop.ts:1323`)とクリア(`:1652`)の2箇所だけ**で、
すぐ下の **`gameReturned`(`:1653`)には付いていない**。
→ 武器商人の「**帰還する**」で終わると `[KOMA_LOG]` は**コンソールに出ない**
(`__KOMA_LOG__.summary()` を手で叩けば読めるので、データ自体は失われない)。
**設計チャット判断**: 意図的か、付け忘れか。付け忘れなら1行で直る。

### ③ **スマホには開発者コンソールが無い**(実運用の最大の穴)
今の取り出し口は `console.log` と `window.__KOMA_LOG__` の2つで、**どちらもデベロッパーツール前提**。
仕様書の狙いは「**実機で社長が普通に遊んだ1ラン**」だが、**スマホでは読めない**。
現実的な選択肢:
- **(a) PCのChromeで遊ぶ** → F12コンソールに `[KOMA_LOG]` が出る/`__KOMA_LOG__.summary()` も叩ける。**今すぐ使える唯一の方法**。
- (b) スマホ+PCのUSBリモートデバッグ(`chrome://inspect`)→ 手間が大きい。
- (c) **★提案(設計チャット判断)**: 死亡リザルト画面に `?komalog=1` の時だけ**要約を画面表示**する
  (コピー用のテキストでも可)。これがあれば実機で完結する。実装は小さいはず。

## 社長への使い方(現時点で確実な手順)
1. **PCのChrome**で開く: `http://localhost:5173/zombie/?komalog=1`
   (Pages版なら `https://tanity0.github.io/zombie/?komalog=1`。※Pages版は反映待ちに注意)
2. **F12でコンソールを開いた状態**で、**3分以上**を目安に普通に遊ぶ。
3. 死亡すると `[KOMA_LOG] {...}` が1行出る。**それをコピーして設計チャットへ渡す**。
4. もっと細かいデータが要るなら、コンソールに `__KOMA_LOG__.jsonl()` と打つと全コマの生データが出る。
   `copy(__KOMA_LOG__.jsonl())` でクリップボードへコピーできる。
5. **「帰還する」で終わらせると①の行は出ない**ので、その場合は手で `__KOMA_LOG__.summary()` を叩く。

## 手法メモ
- 検証は headless ではなく headed の実Chrome。ボットで走らせて配線を確認しただけで、
  **人間のプレイデータそのものは取っていない**(それは社長の実プレイでしか取れない、というのが元々の主旨)。

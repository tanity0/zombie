# 接触ダメージ全面置換(噛みつき)+カウンター改定の実機確認 — 2026-08-25

REQUEST(2026-08-25)の実行結果。**知りたい2点(敵が攻撃してくるか / 止まる・固まる・エラーが出ないか)**だけを書く。
分析・裁定は設計チャット。バランス・勝率・見た目の評価は対象外(REQUESTの「ではない」条件どおり)。

## 0. 環境
| 項目 | 値 |
|---|---|
| 版 | **v0.25.3928**(要件を満たす)。**画面左下の表示も v0.25.3928** で一致 |
| 走行 | headed 実Chrome(`channel:chrome`)・1280x800・Windows 11 Pro 10.0.26200 |
| A | `npm run build` → `vite preview 4173`(=ビルド成果物に `0.25.3928` が焼かれていることを確認済み) |
| B | `vite dev 5173`(**pull後に再起動**。商人画面を戻す掟に `__gameStore` が要るため dev) |

### 手順の変更点(1つだけ・報告義務として明記)
`node scripts/botrun-local.mjs` は **`request.config.json` の `configs` 配列を読む作り**だが、今回の設定ファイルに
`configs` が無く**そのままでは実行できない**。加えてスクリプトは URL に `stage=stage-1` を直書きしており、
**stage-2 のランが作れない**(`stage` は先勝ちなので extraQuery で上書き不可)。
そこで**スクリプトと同じ流れ**(`?smoke=1` → 起動の関門を押す → `__BOT_REPORT__` 待ち → スクショ/consoleエラー収集)を
stage だけ差し替えられる形で実施した。**コード・数値は一切変更していない。**

---

# A. 通常ラン(3本)— ★結論: 敵は無害化していない

| ラン | ステージ | **damageTaken** | **deathCause** | consoleエラー | 生存(実) |
|---|---|---|---|---|---|
| 1 | stage-1 | **176** | 変異体(獣化型) | **0件** | 391s |
| 2 | stage-1 | **175** | 変異体(肥大型)の落下攻撃 | **0件** | 288s |
| 3 | stage-2 | **130** | 地雷 | **0件** | 276s |

- ★**3ランとも `damageTaken` が0ではない**(176 / 175 / 130)。REQUESTの重大条件には**該当しない**。
- 3本とも `outcome=death` で終了。**60秒以上進まなくなった場面は無し**。
- **`deathCause` に「噛みつき」は出ていない**。ただし死因はいずれも別の攻撃(獣化型・肥大型の落下・地雷)なので、
  **噛みつきが機能していない証拠にはならない**(事実のみ記載)。
- 生JSON全文は `20260825-2136-bite-counter-rework.json` の `A_runs[].botReport`。

---

# B. ボス・ガントレット(21枠)— ★結論: 完走。接敵は全枠で成立

```
version: 0.25.3928
conditions: bot=standard / botskill=master / class=warrior / lv=1 / companion=なし / renderer=pixi / timeout=180s
slots: 21/21  skipped: giantbat@stage-2, guardian-phantom@practice(いずれも城ボス不在=出ないためスキップ)
result: win 2 / death 18 / timeout 1  findings 101
```
- 実時間 **22分**(前回61分)。**商人画面0回**、起動の関門(OK/スキップ)を各1回。
- **ページ側の console エラーは 0件**(ハーネス収集・製品側の `err` 列も全枠0)。
- ★**一度も接敵しない枠は無し**。**60秒以上進まない枠も無し**。
  前回2ラン連続で未接敵だった **giantbat@stage-7(グレン)は今回 death(接敵)**、
  前回の `giantbat@stage-ex1` 枠は **`phillboss@stage-ex1` に差し替わっており、こちらも接敵**。
- `jormungand` のみ timeout だが **`movesMissing` が0=技を全種観測**しているので、**未接敵ではない**
  (倒し切れずに180秒経過。REQUESTの「タイムアウトは対象外」に当たる)。

## B-1. 21枠の要約(完走画面「コピー」より)
| 枠 | 結果 | 秒 | 発見 | 切 | 固 | 例 | 異 | 未出 |
|---|---|---|---|---|---|---|---|---|
| bounty-ranged@practice | death | 58 | 0 | 0 | 0 | 0 | 0 | 0 |
| bounty-melee@practice | win | 46 | 0 | 0 | 0 | 0 | 0 | 1 |
| bounty-balance@practice | win | 64 | 0 | 0 | 0 | 0 | 0 | 0 |
| bounty-maiko@practice | death | 79 | 0 | 0 | 0 | 0 | 0 | 0 |
| giantbat@stage-1 | death | 83 | 0 | 0 | 0 | 0 | 0 | 13 |
| **giantbat@stage-3** | death | 76 | **97** | 0 | 0 | 0 | **97** | 13 |
| **giantbat@stage-4** | death | 85 | **1** | **1** | 0 | 0 | 0 | 14 |
| giantbat@stage-5 | death | 52 | 0 | 0 | 0 | 0 | 0 | 14 |
| giantbat@stage-7 | death | 35 | 0 | 0 | 0 | 0 | 0 | 14 |
| phillboss@stage-ex1 | death | 32 | 0 | 0 | 0 | 0 | 0 | 6 |
| miguel | death | 31 | 0 | 0 | 0 | 0 | 0 | 0 |
| jibril | death | 21 | 0 | 0 | 0 | 0 | 0 | 1 |
| rafi | death | 28 | 0 | 0 | 0 | 0 | 0 | 2 |
| uri | death | 16 | 0 | 0 | 0 | 0 | 0 | 1 |
| **suriel** | death | 40 | **1** | **1** | 0 | 0 | 0 | 0 |
| acrasiel | death | 34 | 0 | 0 | 0 | 0 | 0 | 0 |
| mimir | death | 27 | 0 | 0 | 0 | 0 | 0 | 0 |
| jormungand | **timeout** | 167 | 0 | 0 | 0 | 0 | 0 | **0** |
| skadi | death | 9 | 0 | 0 | 0 | 0 | 0 | 4 |
| thor | death | 16 | 0 | 0 | 0 | 0 | 0 | 4 |
| **idol** | death | 56 | **2** | 0 | **1** | 0 | **1** | 2 |

## B-2. 発見101件の中身(全部)
発見が出たのは**4枠だけ**。内訳は以下がすべて(重複は距離の数値違い)。

### giantbat@stage-3 — 97件すべて「異常(距離)」
```
anomaly: ボスとの距離が異常(29458px 〜 30665px > 4000px)  ×97
```
- 値は 29458 → 30119 → 30665px と**連続的に増減**しており、瞬間的なワープではなく**離れた場所に居続けた**形。
- この枠は結果 death・`movesSeen` 7種なので、**戦闘自体は成立している**(距離異常は戦闘の前後どちらかの区間)。

### giantbat@stage-4 — 1件「技の切れ目」
```
cancel: g-quad-charge(active) → g-quad(windup): 前の技を出し切る前に次の技が始まった
```

### suriel — 1件「技の切れ目」
```
cancel: ring-move(windup) → ring-beam(windup): 前の技を出し切る前に次の技が始まった
```

### idol — 2件(固まり1・距離異常1)
```
softlock: ボスが15秒動かない
anomaly:  ボスとの距離が異常(6080px > 4000px)
```
- ただし枠自体は 56秒で death 決着しており、**画面が止まったわけではない**(ボスが動かない区間があった、の記録)。

---

# C. 目視の観察点
**headedで走らせていたが、C表の各項目を狙って確認する場面には行き当たっていない。**
REQUESTの「該当場面が来なければ『見ていない』と書けばよい」に従い、以下はすべて **見ていない** と記す。
1 点滅の色 / 2 足元の四角い線 / 3 踏み込みの動き / 4 ゾンビの3拍 / 5 削岩型の槍 / 6 赤い予告の濃さ /
8 装備画面の取得済みスキル一覧 / 9 死体の挙動 → **いずれも見ていない**。
7 オープニング: **スキップボタンで飛ばした**(ガントレット/通常ランとも右下のボタンのみを押している)。
ボタン以外を触って飛ぶかは**試していない**。

---

# D. 成果物
- `20260825-2136-bite-counter-rework.json` — A3本の `[BOT_REPORT]` 生JSON全文 / Bの「コピー」全文(31850文字)/
  `localStorage['zombie:gauntlet']` 全文(21レコード)/ consoleエラー配列(空)
- `20260825-2136-bite-counter-rework-gauntlet-final.png` — ガントレット完走画面
- `20260825-2136-bite-counter-rework-stage1a.png` — Aラン1本目の終了画面

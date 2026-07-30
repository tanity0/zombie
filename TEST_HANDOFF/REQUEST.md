# テスト依頼 #7: 守護霊の被弾源の内訳(10分・v0.25.2546)

## 目的
依頼#6パート1で守護霊が「38ダメージ×3発」で死んでいた**実因の確定**。v0.25.2546で
`?ghostlog=1` を付けると、守護霊が被弾するたびに**何に殴られたか**がconsoleに出るようになった:
```
[GHOSTDMG] 12.3s contact:mimir dmg=38 hp→72
```
タグの読み方: `contact:*`=体当たり / `blast:*`=円AoE(噛みつき等) / `capsule:*`=帯技(レーザー等) /
`proj:*`=弾 / `floor:*`=床 / `untagged`=想定外の経路(これが出たら大発見なので必ず報告)。

## 手順(依頼#6パート1と同じ+ghostlog)
- `git pull`(package.json が **0.25.2546 以上**)・`npm run dev`・headed Chrome・390×844。
- URL: `http://localhost:5173/zombie/?smoke&ghost=1&stage=stage-1&bossnow=1&autotut=1&ghostlog=1`
  (**依頼#6の穴1対応=bossnow付き**)
- 西へワープ(`window.__gameStore.setState(s=>({player:{...s.player,x:-8600,y:0}}))`)→ボス戦。
- **交戦維持の介入**(依頼#6であなたが入れた「ボスがreturn/700px超で240px手前へ戻す」)は今回も**あり**で。
- 守護霊が死ぬまで見届ける×**2ラン**。
## 記録してほしいもの
- **`[GHOSTDMG]` 全行**(これが全て)+ ランごとの被弾源の集計(contact何発/blast何発…)
- consoleエラー全文(なければ0件)
- 結果: `results/<YYYYMMDD-HHMM>-ghostdmg.md`(+.jsonにログ生データ)。判断はしない(分析は設計チャット)。

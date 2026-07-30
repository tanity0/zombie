# 技×ヴィジュアル2軸の棚卸しと補完計画(社長方針v0.25.2463)

> 社長: 「技でヴィジュアルが付いてないやつをどんどん付けたい。二軸ある。1=武器や牙、爪などの物理的
> 見た目 2=爪痕や血痕、砂埃などのエフェクトの見た目。**これらはセットであるべき**。砂埃とか多用されてる
> やつはバリエーションあった方がいい。敵がプレイヤーに触れてダメージを与える時、強めに前屈みに歪む
> エフェクトを入れたい(食らって後ろに歪むの逆)」

全数棚卸し(走査サブエージェント・v0.25.2465時点)の要約。**技ごとの詳細表の正本はDEVELOPMENT_LOGでは
なく走査報告**(要点のみここに転記)。コードが正。

## 現状の要点
- 予告(分類①)はv0.25.2436の横展開でほぼ全ボスに整備済み。**穴は物理の絵(分類②の主体側)と
  結果エフェクト**。
- 敵の弾は全種共通で `enemy_bolt`(赤い二重丸)。**発射炎・着弾FXがどの敵にも無い**。
- 斬撃ストリーク/バースト(fx/slash-*)を持つのは thor3技+miguel harai/tate+rafi sweep+uri sweep/
  downslash のみ。衝撃波素材は城ボス帯技6技のみ。
- **両方無い技(最優先)**: suriel sweep/gaze・acrasiel spike/burst/warp/gaze・裏ボス3体(mimir/jorm/
  skadi)のdashとburst/radial・弾技全般(g-bolt/miguel volley/jibril volley/uri bolt/plant種弾)。
- **同じ動作なのに揃っていない**(掟「同じ動作を持つ全員に」違反状態): dashの砂埃が
  mimir/jorm/skadi dash・miguel mdash・uri thrust・idol roll・g-dive着地に無い。

## 補完計画(3バッチ)

### V1: 素材不要・即実装(発注済み)
1. **弾技の共通FX(合流点方式)**: 敵弾(enemy_bolt系)の発射時に小さな発射フラッシュ、着弾/消滅時に
   小さな爆ぜ(既存 spawnRing/spawnBurst/pooled sprite の流用・強glow不使用)。1箇所で全弾技
   (g-bolt/burst/radial/volley/uri bolt/gaze/plant種弾/idol射撃)が埋まる。
2. **dashの砂埃を残り全員へ**: mimir/jorm/skadi dash・miguel mdash・uri thrust・idol roll・
   g-dive着地(既存の蹴り出し+停止latchの横展開)。
3. **前屈みエフェクト(社長指示)**: 敵が接触ダメージを与えた瞬間、その敵が強めに前のめりに歪む
   (被弾時の後ろ歪みの逆・~180ms・視覚のみ)。全接触敵共通。
4. **砂埃のばらつき**: 出現ごとに反転/回転/スケールの決定的ジッター(ID由来・チラつかない)。
   素材追加なしのバリエーション第一弾。

### V2: 既存素材の流用で埋まる(V1後に発注)
- suriel sweep(衝撃波 or ストリーク流用)/acrasiel spike・burst・warp・spear起爆(汎用爆発FX+
  リング流用)/mimir bite・jorm coil の результат強化。裏ボスburst/radialの発射演出はV1が吸収。

### V3: 新素材が要る=社長支給待ちリスト(物理の絵)
| 素材 | 使う技 |
|---|---|
| 牙(噛みつきの絵) | g-bite・mimir bite |
| 爪を振る絵 | g-talon(爪痕D-2はあるが「振る主体」が無い) |
| 翼を振る絵 | g-wing |
| 触手 | g-reach |
| 拳 | idol punch |
| 種を吐く口/植物の反動 | plant種弾 |
| (任意)砂埃の別絵1〜2種 | 多用箇所のバリエーション第二弾 |
- 支給されたものから順次バッチ化。「素材が来たのに絵が出ない」事故防止のため、各バッチは
  **社長の実機確認を完了条件**にする(v0.25.2465の透明守護霊=見えない事故6件目の教訓)。

## 実装状況
- [x] V1(v0.25.2468実装済み・**社長の実機確認待ち**=見えない事故対策の完了条件)
  - 1 弾FX=レンダラの合流点方式(syncProjectilesの出現/消滅エッジ検出。addProjectile側は不介入)。
  - 2 dash砂埃=bossState 'dash'(mimir/jorm/skadi)/'mdash-move'/'thrust'/'idol-roll' を既存latchへ追加+g-dive着地。
  - 3 前屈み=combatTick.applyContactDamage(接触の唯一の合流点)で lastContactAttackAt/Dir 打刻→レンダラ変形。
  - 4 砂埃ジッター=latch焼き付け時刻を種に反転/±12°回転/±15%スケール(決定的・チラつきなし)。
- [ ] V2(V1検収後)
- [ ] V3(素材支給待ち)

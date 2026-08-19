// research/GHOST_BOSS.md(守護霊ボス「幻影」)の**数字だけ**を持つ表。
//
// なぜ分けるか(BOSS_MAKER.md §2-2「台本はコード / 数字はテーブル」・bountyScript.ts と同じ流儀):
// **判定(phantomTick)・成立域(counterReach)・描画(pixiScene)が同じテーブルの同じ場所を読む**ので、
// 「赤いのに当たらない / 赤くないのに当たる」が原理的に起きない。寸法を各所へ写経しない。
//
// ★このファイルは**依存ゼロの葉**(store も pixi も import しない)。counterReach.ts が読むため、
//   ここが重くなると循環importで起動全損(v0.25.3390)を再演する。
//
// 数値は全て**叩き台**(社長の実機確認で調整する前提)。設計書に無い値(硬直など)は
// 「設計の穴を埋めた」ものなので、下のコメントでその旨を明示してある。

/** 帯(カプセル)1本ぶんの寸法。`reach`=長さ / `halfWidth`=半幅(=見た目の幅の半分)。 */
export interface PhantomBand {
  reach: number;
  halfWidth: number;
  damage: number;
  windup: number;
  active: number;
  recover: number;
}

export const GUARDIAN_PHANTOM_TUNING = {
  /**
   * 近接 `gp-melee`。設計書の表そのまま: 溜め500 → 実行180 / 前方帯 160×40 / dmg 18。
   * `recover` は設計書に指定が無い(=穴)ため 420ms を置いた。根拠: カウンターを狙える硬直を
   * 「溜めと同じくらい」確保する(溜め500に対して少し短い)。挙動の意図は変えていない。
   */
  melee: {
    reach: 160, halfWidth: 20, damage: 18,
    windup: 500, active: 180, recover: 420,
  } satisfies PhantomBand,
  /**
   * 一閃 `gp-issen`。溜め700 → 実行260 / ライン 420×36 / dmg 22。実行中は**ライン上を高速移動**する
   * (加速→減速のイーズ付き=CLAUDE.md「慣性」)。`recover` は同上の理由で 600ms(大技ぶん長い)。
   */
  issen: {
    reach: 420, halfWidth: 18, damage: 22,
    windup: 700, active: 260, recover: 600,
  } satisfies PhantomBand,
  /**
   * 銃撃 `gp-shot`。溜め400 → 3連(gap 120ms)→ 硬直。弾は**全ボス共通の赤い二重丸**(絵替え禁止)。
   * `damage` はここに書かない: 台帳(profile.snapshot.activeGunKey)の武器基礎値から導出する
   * (=「守護霊らしさ」をデータで出す・設計書の決定事項)。下限は `damageFloor`。
   * `range` = この距離までなら撃つ(頭脳 decideGhost の銃射程ゲートにも同じ値を渡す)。
   */
  shot: {
    windup: 400, gapMs: 120, count: 3, recover: 500,
    speed: 480, size: 12, range: 600, damageFloor: 6,
  },
  /**
   * 技と技の間の休み(ms・gameTime基準)。設計書の「技間の休み900ms(叩き台)」。
   * ★この休みは**硬直が明けてから**数える(硬直中に次の技を選ばない=moveCancelGuard の規則)。
   */
  restMs: 900,
  /**
   * 一閃の踏み込みで進む距離の割合(帯の長さに対して)。1.0 だと終点=帯の先端に立つことになり、
   * 「斬り抜けた」ではなく「相手の向こう側へワープした」に見えるので少し手前で止める(叩き台)。
   */
  issenTravelFrac: 0.85,
} as const;

// PACING_PUZZLE.md「★ボスの「止める効果」の作り直し」(社長裁定2026-08-15「スタンは1+2かな」)。
// ①逓減(DR)側の実装(②体勢/ポイズゲージは既に src/utils/bossPosture.ts が実装済み=今回は触らない)。
//
// 経緯: 自動タレットの連射でボスが永久に動けなくなる実機バグ(v0.25.3477で
// BOSS_KNOCKBACK_STOP_IMMUNE_MS=1200msの固定CDとして応急修正)。恒久策として社長裁定「1+2」
// (①逓減+②体勢ゲージ)が確定し、今回は①だけを実装する。v0.25.3477のCDはノックバック専用の
// 一点対策だったが、社長整理により「黄色クリの窓と罠の拘束は"同じ効果"」と判明したため、
// 「止める」効果(ノックバック/黄色クリの窓/罠の拘束/気絶)を**1カテゴリに統合して数える**
// 汎用DRへ発展させる(=v0.25.3477の対症療法をこの1関数へ一本化)。
//
// 段(叩き台・数値は今回のバッチで決めた叩き台。社長裁定の骨格「1回目=全効果→2回目=半分→
// 3回目=無効」に沿う):
//   1回目 = 効果そのまま(durationMult=1)
//   2回目 = 効果時間50%(durationMult=0.5)
//   3回目 = 無効化 + 完全耐性(BOSS_STOP_DR_IMMUNE_MS=3000ms)。この間は「止め」を一切通さない。
//
// リセットの解釈(★実装上の裁定・要確認事項として最終報告に明記):
//   社長裁定文中の2つの記述「3回目=無効(数秒の完全耐性)」と「最後に止められてから15000ms
//   (10〜18秒が定番)何も入らなければ1段目に戻る」を、以下のように分けて実装した:
//   (a) 3回目まで進んで完全耐性(3000ms)に入った場合 → **耐性が明けた瞬間に1段目へ自動で戻る**
//       (体勢ゲージ側のrebreakロック=BOSS_POSTURE_REBREAK_LOCK_MS明けに満タンへ戻る、と同じ
//       「耐性=次の周回への明示的な区切り」という設計に揃えた)。
//   (b) 1〜2回目で止まったまま(3回目=耐性まで進まなかった)場合 → 最後の適用からBOSS_STOP_DR_RESET_MS
//       (15000ms)経てば1段目に戻る。
//   (a)を「耐性明けでも15000ms未満なら3回目=耐性が延々と連鎖する」設計にしなかった理由:
//   3000msという明示的な数値が指示にある以上、耐性明けの次の一撃は素通しして周回を再開するのが
//   自然で、無限耐性ループ(=「止める効果」がゼロのまま固定される)を避けられるため。
//
// 対象外: 紫(体勢崩し・bossFullStunUntil)。あちらは体勢ゲージ側の別系統で、既に6秒の再崩壊ロック
// (BOSS_POSTURE_REBREAK_LOCK_MS)を持つため、このDRとは無関係(bossPosture.tsを参照)。
//
// なぜ2つの時計(gameTime/Date.now)を混ぜないか: このモジュールの3フィールド
// (bossStopDrStage/bossStopDrLastAt/bossStopDrImmuneUntil)は**必ずDate.now()基準**で統一する。
// 呼び出し元は knockbackUntil(Date.now基準)/ bossSlowUntil・rootUntil・stunUntil(gameTime基準)
// と時計がバラバラだが、DRの計上そのもの(何回目か・耐性がいつ明けるか)は「壁時計でどれだけ
// 間が空いたか」で測るべき値なので、既存のBOSS_KNOCKBACK_STOP_IMMUNE_MS(knockbackImmuneUntil・
// Date.now基準)の流儀をそのまま踏襲する。呼び出し元は evaluateBossStopDr が返す durationMult を
// **自分の時計の底(gameTime/Date.now)に掛けるだけ**でよく、DR自身の内部時計とは独立に扱える。

export const BOSS_STOP_DR_STAGE_MULT: readonly number[] = [1, 0.5]; // index=経過した「止め」回数(0始まり)
export const BOSS_STOP_DR_IMMUNE_MS = 3000; // 3回目で無効化した後の完全耐性の長さ(叩き台)
export const BOSS_STOP_DR_RESET_MS = 15000; // 1〜2回目止まりの時、最後の適用からこれだけ経てば1段目へ戻る(叩き台)

export interface BossStopDrFields {
  bossStopDrStage?: number;
  bossStopDrLastAt?: number;
  bossStopDrImmuneUntil?: number;
}

export interface BossStopDrResult {
  /** false=この「止め」は今回まったく適用しない(完全耐性中)。呼び出し側は元の効果を出さない。 */
  allowed: boolean;
  /** 適用時に効果時間へ掛ける倍率(1 or 0.5)。allowed=false の時は 0。 */
  durationMult: number;
  /** enemy へマージするDR状態の差分(常にこれをpatchへ含めること)。 */
  patch: Partial<BossStopDrFields>;
}

/**
 * 「止める」効果(ノックバック/黄色クリの窓/罠の拘束/気絶)を今適用してよいかを判定する純関数。
 * **ボス系のみ呼ぶ**こと(雑魚は呼び出し元で isBossType 判定して素通しする=このモジュールは
 * 「呼ばれたら常にDRを掛ける」。ボスか否かの判定はここではしない=呼び出し側の責務)。
 * `now` は Date.now() 基準の壁時計(呼び出し元の時計がgameTime/Date.now何であっても、DR自身の
 * 内部状態はこの壁時計だけで進む=上のモジュールコメント参照)。
 */
export const evaluateBossStopDr = (enemy: BossStopDrFields, now: number): BossStopDrResult => {
  const immuneUntil = enemy.bossStopDrImmuneUntil;
  if (immuneUntil !== undefined && now < immuneUntil) {
    // 完全耐性中: 何も適用しない・状態も変えない(耐性の長さそのものは延長しない=固定3000ms)。
    return { allowed: false, durationMult: 0, patch: {} };
  }
  // 耐性をちょうど今抜けた(または耐性を経験していない)場合は1段目から再開する(上のコメント(a))。
  const justExitedImmune = immuneUntil !== undefined && now >= immuneUntil;
  const expired = !justExitedImmune
    && now - (enemy.bossStopDrLastAt ?? -Infinity) >= BOSS_STOP_DR_RESET_MS;
  const stage = (justExitedImmune || expired) ? 0 : (enemy.bossStopDrStage ?? 0);
  if (stage >= BOSS_STOP_DR_STAGE_MULT.length) {
    // 3回目(またはそれ以降): 無効化して完全耐性を新規に立てる。
    return {
      allowed: false,
      durationMult: 0,
      patch: {
        bossStopDrStage: stage,
        bossStopDrLastAt: now,
        bossStopDrImmuneUntil: now + BOSS_STOP_DR_IMMUNE_MS,
      },
    };
  }
  return {
    allowed: true,
    durationMult: BOSS_STOP_DR_STAGE_MULT[stage],
    // 耐性明け直後の1段目再開では、古い耐性の終了時刻を残さない(次回 immuneUntil!==undefined の
    // 分岐に迷い込まないよう明示的にundefinedへ戻す)。
    patch: { bossStopDrStage: stage + 1, bossStopDrLastAt: now, bossStopDrImmuneUntil: undefined },
  };
};

// ★対人トラップの効果(社長裁定2026-08-25)。research/SAME_ARENA.md §3-g が仕様の正。
//
// 敵に対するトラップは従来どおり**拘束**(`Enemy.rootUntil`=その場に固定)。
// 対人(幻影のトラップ→プレイヤー)では**拘束を使わない**——プレイヤーをその場に固定する手段が
// このゲームには元々1つも無く、新設すると★未決9「雑魚の永久足止め」をプレイヤー側で再現するため。
// 代わりに社長が指定した4つの効果を掛ける:
//   ①移動が等倍のみ(かさまし%・ダッシュが無効)②クリティカル率アップ(=**貰う側**が貰いやすくなる)
//   ③リロード時間1.5倍 ④サブウェポンのCD短縮系も無効
//
// この4つの実装は**掛かる場所が4箇所に分かれる**(移動=movePlayer / クリ=phantomAtkMults /
// リロード=effectiveReloadMs / CD=applySubCooldownSkills の呼び出し側)。判定だけはここ1本に集め、
// 各所は `isTrapDebuffed()` を呼ぶだけにする(同じ時刻比較を4回書かない)。
//
// 時計は **Date.now**(プレイヤー側の他のタイマー=counterWindowEnd / lungeUntil / knockbackUntil と
// 同じ系。敵側の rootUntil だけが gameTime 系なので、混ぜないこと)。

/** 効果時間。敵側の拘束(useGameLoop.MARKSMAN_TRAP_STUN_MS)と**同じ長さ**に揃える。 */
export const TRAP_PVP_DEBUFF_MS = 3000;

/** ③リロード時間の倍率(社長指示「リロード時間1.5倍」)。 */
export const TRAP_PVP_RELOAD_MULT = 1.5;

/**
 * ②クリティカル率アップの量。**対人と対敵で同じ値を使う**(数字を2組に持たない):
 * - 対敵: 拘束中の敵は近接クリを +10% 貰う(`gameStore.meleeHitCritChance`)。
 * - 対人: トラップ効果中のプレイヤーは幻影の銃のクリを +10% 貰う(`phantomTick.phantomAtkMults`)。
 */
export const TRAP_ROOT_CRIT_BONUS = 0.10;

/**
 * トラップ効果中か。`trapDebuffUntil` を持たない主語(幻影の疑似Player・守護霊)は常に false
 * =**対人のみ**(社長指示)がフィールドの有無だけで自然に成立する。
 */
export const isTrapDebuffed = (
  p: { trapDebuffUntil?: number } | undefined,
  now: number = Date.now(),
): boolean => (p?.trapDebuffUntil ?? 0) > now;

/** ④CD短縮系の無効化。オーバークロックの抽選確率を0にする。 */
export const trapGatedOverclockChance = (
  p: { trapDebuffUntil?: number } | undefined, chance: number, now?: number,
): number => (isTrapDebuffed(p, now) ? 0 : chance);

/** ④CD短縮系の無効化。タイムキーパー等のCD倍率を1(=短縮なし)にする。 */
export const trapGatedCooldownMult = (
  p: { trapDebuffUntil?: number } | undefined, mult: number, now?: number,
): number => (isTrapDebuffed(p, now) ? 1 : mult);

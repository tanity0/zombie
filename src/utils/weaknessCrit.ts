// PACING_PUZZLE.md §5.6 バッチM7(社長採用v0.25.1389・数値はv0.25.1391改訂が最終):
// チャフ(基本セット3種)の武器弱点クリティカル。序盤ダレの解消=「どれを何で倒すか」の
// マイクロ判断を作る。ご褒美のみ(ペナルティ・HP/ダメージ倍率の変更は一切なし)。
// 問題児・ボスは対象外(表に無い型は常に0)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyType } from '../types/game';

export type WeaponKind = 'gun' | 'melee';

interface WeaknessEntry {
  weaponKind: WeaponKind;
  bonus: number;
}

// 社長確定値: バット=銃+20%/スケルトン=近接+25%(v0.25.1391の20%から社長指示で改訂)/
// ゾンビ=銃+10%(据え置き)。表に無い型(問題児・ボス等)は対象外。
const CHAFF_WEAKNESS: Partial<Record<EnemyType, WeaknessEntry>> = {
  bat: { weaponKind: 'gun', bonus: 0.20 },
  skeleton: { weaponKind: 'melee', bonus: 0.25 },
  zombie: { weaponKind: 'gun', bonus: 0.10 },
};

/**
 * ★社長指示2026-09-19「雑魚のクリティカル補正一旦外して」: この弱点クリ
 * (バット=銃 / スケルトン=近接 / ゾンビ=銃)を**既定で切る**。
 * 「一旦」なので**表も経路も消していない**——ここを `true` に戻すか、実機で `?weakcrit=1` を
 * 付ければ元どおり(3経路=近接・銃・ヘッドレスのボットが同時に戻る)。
 */
export const WEAKNESS_CRIT_DEFAULT_ON = false;

/**
 * `?weakcrit=` の生値 → 有効/無効。明示された `0`/`1` が既定より強い。
 * ★**既定の出どころをここ1本にする**ため、URLを読む側(gameStore の近接経路 / useGameLoop の
 * 銃経路)も、URLを持たないヘッドレス(playtestDriver)も、全部この関数を通す。
 */
export const parseWeakCritEnabled = (raw: string | null | undefined): boolean => {
  if (raw === '0') return false;
  if (raw === '1') return true;
  return WEAKNESS_CRIT_DEFAULT_ON;
};

export const weaknessCritBonus = (enemyType: EnemyType, weaponKind: WeaponKind): number => {
  const entry = CHAFF_WEAKNESS[enemyType];
  return entry && entry.weaponKind === weaponKind ? entry.bonus : 0;
};

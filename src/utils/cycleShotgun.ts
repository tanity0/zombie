// UNIQUE_WEAPONS.md §16-2/§17-7「切替式ショットガン」(shotgun-t1-cycle・バッチB): リロードを境に
// 散弾⇔スラッグのモードが入れ替わる。反転のフックは「装填が発生した時」(通常リロード完了/
// クイックマガジン/オーバークロック覚醒の3経路。ハンドキャノンの減衰リセットと同じ場所=§17-7)。
// ★距離では切り替えない(社長指定)。純関数のみ=ヘッドレスでユニットテスト可能。

export type CycleMode = 'shot' | 'slug';

export interface CycleModeStats {
  damage: number;
  count: number;
  spreadRadOverride: number;
}

// UNIQUE_WEAPONS.md §16-1/§17-1: 散弾 6/1000/count5/spread1.10rad、スラッグ 30/1000/count1/spread0。
// cooldown(1000)・magSize(3)・reloadMs(1000)は両モード共通=CATALOG側の固定値(切り替えない)。
export const CYCLE_MODE_STATS: Record<CycleMode, CycleModeStats> = {
  shot: { damage: 6, count: 5, spreadRadOverride: 1.10 },
  slug: { damage: 30, count: 1, spreadRadOverride: 0 },
};

/** リロード(装填)が発生した瞬間に呼ぶ反転。未設定(undefined)は既定'shot'からの反転として扱う。 */
export const nextCycleMode = (mode: CycleMode | undefined): CycleMode =>
  (mode ?? 'shot') === 'shot' ? 'slug' : 'shot';

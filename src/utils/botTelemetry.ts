// M35(§6.12): ボットレポート用の計測シングルトン(killTelemetryStateと同パターン=Zustandの
// per-frame set()経由にしない・購読者を起こさない)。**計測のみ=ゲーム挙動・数値は一切不変**。
// 加算はスカラーのインクリメントだけなので誰も読まなくてもコストは無視できる。
//  - recordSubUse: サブウェポン発動回数。合流点=gameStore.setSubWeaponCooldown(CD式サブを自動カバー・
//    オーバークロック成立でCDが付かない場合も「発動」として数える=proc判定より前に記録)+
//    手動3箇所(ジャンク発射/援護射撃発射/救急鞄の払い出し)。
//  - recordOverclockProc: オーバークロック成立回数(setSubWeaponCooldownの成立分岐+援護射撃タイマー側)。
//  - リセット: gameStore.resetGame(ラン開始)で全カウンタ0(実機/ヘッドレス両ハーネスをカバー)。
import type { SubWeaponKey } from '../types/game';

export interface BotTelemetry {
  subUses: Partial<Record<SubWeaponKey, number>>;
  overclockProcs: number;
}

const createTelemetry = (): BotTelemetry => ({ subUses: {}, overclockProcs: 0 });

let telemetry: BotTelemetry = createTelemetry();

export const recordSubUse = (key: SubWeaponKey): void => {
  telemetry.subUses[key] = (telemetry.subUses[key] ?? 0) + 1;
};

export const recordOverclockProc = (): void => {
  telemetry.overclockProcs += 1;
};

export const getBotTelemetry = (): Readonly<BotTelemetry> => telemetry;

// アンカー保存用ディープコピー(実装精度の規律3: 生きた参照を保存すると差分が常に0になる)。
export const snapshotBotTelemetry = (): BotTelemetry => ({
  subUses: { ...telemetry.subUses },
  overclockProcs: telemetry.overclockProcs,
});

export const resetBotTelemetry = (): void => {
  telemetry = createTelemetry();
};

// 救急鞄(first-aid-kit)サブウェポン: 既存Pickup(ammo-*/health/bomb)を条件付きで払い出す「いつ・何を」
// の判定だけを純関数に閉じ込める(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// 新規アイテムロジックは一切追加しない(社長指示)——実際のpickup生成/収集効果適用は既存の
// addPickup / collectPickup をそのまま使う。useGameLoop はこの結果を store(firstAidKitState)へ
// 書き込み、addPickupを呼ぶだけ。
//
// 中身とレベル開放(社長指定): Lv1=弾薬のみ / Lv2=弾薬+回復 / Lv3=弾薬+回復+爆弾。
// 各中身は「1ラン(1回のプレイ)につき最大1回」だけ払い出す(dispensed flagで管理・useGameLoopが
// gameStore.firstAidKitState として保持し、初期状態/resetGameの両方でリセットする)。
// 開放中の中身を全て払い出し終えたら鞄(空)を最寄りの敵へ投げる——その判定は isFirstAidKitEmpty
// (このファイル)が担い、実際に敵へ命中させる/thrownを立てるのは useGameLoop 側(ターゲットが
// 画面に居ない間は投げそこねないよう、空判定とthrown確定を分離してある)。
//
// 数値は全て叩き台(仮値)。

export type FirstAidKitAmmoType = 'handgun' | 'shotgun' | 'rifle'; // ammo-phillは対象外(研究所専用・★要確認=報告参照)

export interface FirstAidKitState {
  ammoHandgunDispensed: boolean;
  ammoShotgunDispensed: boolean;
  ammoRifleDispensed: boolean;
  healDispensed: boolean;
  bombDispensed: boolean;
  thrown: boolean; // 空になった鞄を最寄りの敵へ投げ終えたか(1ラン1回・使い切り)
}

export const createFirstAidKitState = (): FirstAidKitState => ({
  ammoHandgunDispensed: false,
  ammoShotgunDispensed: false,
  ammoRifleDispensed: false,
  healDispensed: false,
  bombDispensed: false,
  thrown: false,
});

export type FirstAidKitDispenseKind = 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle' | 'health' | 'bomb';

export interface FirstAidKitTickInput {
  level: number; // subWeaponLevels['first-aid-kit'](1..3にクランプ済み想定。呼び出し側の既存流儀に合わせる)
  ammoTypesUsed: readonly FirstAidKitAmmoType[]; // 現在プレイヤーが所持する銃のammoType(重複なし)
  ammoHandgun: number;
  ammoShotgun: number;
  ammoRifle: number;
  health: number;
  maxHealth: number;
  onScreenEnemyCount: number;
  state: FirstAidKitState;
}

export interface FirstAidKitTickResult {
  // このフレームで払い出す中身。無ければnull(呼び出し側はaddPickupしない)。
  dispense: FirstAidKitDispenseKind | null;
  nextState: FirstAidKitState; // dispenseがnullなら入力state と同一参照(無駄な書き込み回避)
}

const AMMO_ORDER: readonly FirstAidKitAmmoType[] = ['handgun', 'shotgun', 'rifle'];
export const FIRST_AID_KIT_HEAL_THRESHOLD_FRAC = 0.5; // health < maxHealth×この割合 で回復を払い出す
export const FIRST_AID_KIT_BOMB_ONSCREEN_THRESHOLD = 5; // 画面内の敵がこの数以上で爆弾を払い出す

const ammoDispensedFlag = (state: FirstAidKitState, type: FirstAidKitAmmoType): boolean => {
  if (type === 'handgun') return state.ammoHandgunDispensed;
  if (type === 'shotgun') return state.ammoShotgunDispensed;
  return state.ammoRifleDispensed;
};

// 1フレーム分の判定。「今フレーム何を払い出すか」(最大1個・優先度=弾薬→回復→爆弾)と
// 次フレームへ持ち越すdispensed状態を返す(副作用なし)。
export const computeFirstAidKitTick = ({
  level,
  ammoTypesUsed,
  ammoHandgun,
  ammoShotgun,
  ammoRifle,
  health,
  maxHealth,
  onScreenEnemyCount,
  state,
}: FirstAidKitTickInput): FirstAidKitTickResult => {
  // 鞄は既に投げ切って使い切り済み(1ラン1回)。以後は何もしない。
  if (state.thrown) return { dispense: null, nextState: state };

  const healApplicable = level >= 2;
  const bombApplicable = level >= 3;
  const reserveByType: Record<FirstAidKitAmmoType, number> = {
    handgun: ammoHandgun, shotgun: ammoShotgun, rifle: ammoRifle,
  };

  let dispense: FirstAidKitDispenseKind | null = null;
  for (const type of AMMO_ORDER) {
    if (!ammoTypesUsed.includes(type)) continue; // その武器種を使っていない=対象外
    if (ammoDispensedFlag(state, type)) continue; // 既に払い出し済み
    if (reserveByType[type] > 0) continue; // まだリザーブが残っている
    dispense = `ammo-${type}`;
    break;
  }
  if (!dispense && healApplicable && !state.healDispensed && health < maxHealth * FIRST_AID_KIT_HEAL_THRESHOLD_FRAC) {
    dispense = 'health';
  }
  if (!dispense && bombApplicable && !state.bombDispensed && onScreenEnemyCount >= FIRST_AID_KIT_BOMB_ONSCREEN_THRESHOLD) {
    dispense = 'bomb';
  }

  if (!dispense) return { dispense: null, nextState: state };

  const nextState: FirstAidKitState = {
    ...state,
    ammoHandgunDispensed: dispense === 'ammo-handgun' ? true : state.ammoHandgunDispensed,
    ammoShotgunDispensed: dispense === 'ammo-shotgun' ? true : state.ammoShotgunDispensed,
    ammoRifleDispensed: dispense === 'ammo-rifle' ? true : state.ammoRifleDispensed,
    healDispensed: dispense === 'health' ? true : state.healDispensed,
    bombDispensed: dispense === 'bomb' ? true : state.bombDispensed,
  };
  return { dispense, nextState };
};

// 「鞄を投げる=空になったか」。社長決定v0.25.1657: **弾3種(handgun/shotgun/rifle)すべて**を配り終え、
// さらにレベルで開放される回復(Lv2)・爆弾(Lv3)も配り終えて初めて空=投擲(爆発範囲攻撃)。
// これにより「銃種を1つしか使っていない段階で早々に投げてしまい、後から拾った銃種の弾を配れない」問題を解消
// (3種すべて配り終えるまで鞄は手元に残り、後発の銃種の弾も配れる)。ammoTypesUsedは空判定には使わない
// (=「使った銃種だけ」ではなく「3種すべて」で判定する。使っていない銃種の弾は payout ロジック側で配られない
// ため、その銃種を使うまで空にはならない=鞄は投げられない)。
export const isFirstAidKitEmpty = (
  state: FirstAidKitState,
  level: number,
): boolean => {
  const healApplicable = level >= 2;
  const bombApplicable = level >= 3;
  if (!state.ammoHandgunDispensed || !state.ammoShotgunDispensed || !state.ammoRifleDispensed) return false;
  if (healApplicable && !state.healDispensed) return false;
  if (bombApplicable && !state.bombDispensed) return false;
  return true;
};

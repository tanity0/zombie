// 救急鞄(first-aid-kit)サブウェポン: 既存Pickup(ammo-*/health/bomb)を条件付きで払い出す「いつ・何を」
// の判定だけを純関数に閉じ込める(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// 新規アイテムロジックは一切追加しない(社長指示)——実際のpickup生成/収集効果適用は既存の
// addPickup / collectPickup をそのまま使う。useGameLoop はこの結果を store(firstAidKitState)へ
// 書き込み、addPickupを呼ぶだけ。
//
// 中身とレベル開放(社長指定): Lv1=弾薬のみ / Lv2=弾薬+回復 / Lv3=弾薬+回復+爆弾。
// 各中身は「鞄1つにつき最大1回」だけ払い出す(dispensed flagで管理・useGameLoopが
// gameStore.firstAidKitState として保持し、初期状態/resetGameの両方でリセットする)。
// 開放中の中身を全て払い出し終えたら鞄(空)を最寄りの敵へ投げる——その判定は isFirstAidKitEmpty
// (このファイル)が担い、実際に敵へ命中させる/thrownを立てるのは useGameLoop 側(ターゲットが
// 画面に居ない間は投げそこねないよう、空判定とthrown確定を分離してある)。
// 投げた空鞄が爆発(着弾)した瞬間に鞄の中身は全部補充される(refillFirstAidKit・社長指示2026-11-25
// 「救急鞄は爆発の後、補充される様にしよう」)。飛んでいる間は空(thrown=true)のまま=使い切りではない。
// 補充の後は「条件が新しく起きた時だけ」出す(社長裁定2026-11-25): 各中身(弾は銃種ごと/回復/爆弾)は、
// 払い出し条件が**一度解けて、また成り立った時**(立ち上がり)にだけ出る。補充の瞬間に既に成り立っている
// 条件は、一度解けるまで出さない(armed*=false で始まり、条件が解けたフレームで true になる)。
// 出撃開始時の初期状態は armed*=true=今どおり条件が成り立っていれば即出す。
// また、中身を1つも出していない鞄(anyDispensed=false)は空判定でも投げない(Lv1守護霊の連投防止)。
//
// 数値は全て叩き台(仮値)。

export type FirstAidKitAmmoType = 'handgun' | 'shotgun' | 'rifle'; // ammo-phillは対象外(研究所専用・★要確認=報告参照)

export interface FirstAidKitState {
  ammoHandgunDispensed: boolean;
  ammoShotgunDispensed: boolean;
  ammoRifleDispensed: boolean;
  healDispensed: boolean;
  bombDispensed: boolean;
  thrown: boolean; // 空になった鞄を最寄りの敵へ投げ、まだ爆発していないか(爆発で refillFirstAidKit により false へ戻る)
  // 立ち上がり判定(社長裁定2026-11-25「条件が新しく起きた時だけ」): その中身の払い出し条件が成り立てば
  // 出してよいか。出撃開始時は true(=即出す)、補充の瞬間に false、条件が解けたフレームで true へ戻る。
  armedHandgun: boolean;
  armedShotgun: boolean;
  armedRifle: boolean;
  armedHeal: boolean;
  armedBomb: boolean;
  anyDispensed: boolean; // 出撃開始(または直近の補充)の後に中身を1つでも出したか。false の鞄は空でも投げない
}

export const createFirstAidKitState = (): FirstAidKitState => ({
  ammoHandgunDispensed: false,
  ammoShotgunDispensed: false,
  ammoRifleDispensed: false,
  healDispensed: false,
  bombDispensed: false,
  thrown: false,
  armedHandgun: true,
  armedShotgun: true,
  armedRifle: true,
  armedHeal: true,
  armedBomb: true,
  anyDispensed: false,
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
  nextState: FirstAidKitState; // 状態が何も変わらなければ入力state と同一参照(無駄な書き込み回避)。
  // dispense=null でも armed*(立ち上がり待ちの解除)が進めば新しい参照になる=呼び出し側は参照比較で書き込む
}

const AMMO_ORDER: readonly FirstAidKitAmmoType[] = ['handgun', 'shotgun', 'rifle'];
export const FIRST_AID_KIT_HEAL_THRESHOLD_FRAC = 0.5; // health < maxHealth×この割合 で回復を払い出す
export const FIRST_AID_KIT_BOMB_ONSCREEN_THRESHOLD = 5; // 画面内の敵がこの数以上で爆弾を払い出す

const ammoDispensedFlag = (state: FirstAidKitState, type: FirstAidKitAmmoType): boolean => {
  if (type === 'handgun') return state.ammoHandgunDispensed;
  if (type === 'shotgun') return state.ammoShotgunDispensed;
  return state.ammoRifleDispensed;
};
const AMMO_ARMED_KEY: Record<FirstAidKitAmmoType, 'armedHandgun' | 'armedShotgun' | 'armedRifle'> = {
  handgun: 'armedHandgun', shotgun: 'armedShotgun', rifle: 'armedRifle',
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
  // 鞄は空のまま飛んでいる(爆発=補充まで)。その間は何もしない。
  if (state.thrown) return { dispense: null, nextState: state };

  const healApplicable = level >= 2;
  const bombApplicable = level >= 3;
  const reserveByType: Record<FirstAidKitAmmoType, number> = {
    handgun: ammoHandgun, shotgun: ammoShotgun, rifle: ammoRifle,
  };
  // 各中身の払い出し条件(レベル開放とは別に、条件そのものが成り立っているか)。
  // 立ち上がり判定はこの生の条件で見る(レベルが上がっただけでは「条件が解けた」扱いにしない)。
  const ammoCond = (type: FirstAidKitAmmoType): boolean =>
    ammoTypesUsed.includes(type) && reserveByType[type] <= 0; // 使っている銃種のリザーブが尽きた
  const healCond = health < maxHealth * FIRST_AID_KIT_HEAL_THRESHOLD_FRAC;
  const bombCond = onScreenEnemyCount >= FIRST_AID_KIT_BOMB_ONSCREEN_THRESHOLD;

  // 1) 立ち上がりの準備: まだ出していない中身のうち、条件が解けているものを armed へ戻す。
  const armedPatch: Partial<Pick<FirstAidKitState, 'armedHandgun' | 'armedShotgun' | 'armedRifle' | 'armedHeal' | 'armedBomb'>> = {};
  const arm = (key: keyof typeof armedPatch) => { armedPatch[key] = true; };
  for (const type of AMMO_ORDER) {
    const key = AMMO_ARMED_KEY[type];
    if (!ammoDispensedFlag(state, type) && !state[key] && !ammoCond(type)) arm(key);
  }
  if (!state.healDispensed && !state.armedHeal && !healCond) arm('armedHeal');
  if (!state.bombDispensed && !state.armedBomb && !bombCond) arm('armedBomb');

  // 2) 払い出し: armed かつ条件成立の中身を、弾薬→回復→爆弾の優先順で最大1個。
  //    (1で armed へ戻したものは条件が解けているので、同じフレームには出ない=立ち上がり待ち)
  let dispense: FirstAidKitDispenseKind | null = null;
  for (const type of AMMO_ORDER) {
    if (ammoDispensedFlag(state, type)) continue; // 既に払い出し済み
    if (!state[AMMO_ARMED_KEY[type]]) continue; // 補充後、条件がまだ一度も解けていない
    if (!ammoCond(type)) continue; // 使っていない銃種/まだリザーブが残っている
    dispense = `ammo-${type}`;
    break;
  }
  if (!dispense && healApplicable && !state.healDispensed && state.armedHeal && healCond) {
    dispense = 'health';
  }
  if (!dispense && bombApplicable && !state.bombDispensed && state.armedBomb && bombCond) {
    dispense = 'bomb';
  }

  if (!dispense) {
    return { dispense: null, nextState: Object.keys(armedPatch).length > 0 ? { ...state, ...armedPatch } : state }; // 何も変わらなければ同一参照
  }

  const nextState: FirstAidKitState = {
    ...state,
    ...armedPatch,
    ammoHandgunDispensed: dispense === 'ammo-handgun' ? true : state.ammoHandgunDispensed,
    ammoShotgunDispensed: dispense === 'ammo-shotgun' ? true : state.ammoShotgunDispensed,
    ammoRifleDispensed: dispense === 'ammo-rifle' ? true : state.ammoRifleDispensed,
    healDispensed: dispense === 'health' ? true : state.healDispensed,
    bombDispensed: dispense === 'bomb' ? true : state.bombDispensed,
    anyDispensed: true,
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
  // 中身を1つも出していない鞄は、空判定でも投げない(社長裁定2026-11-25)。守護霊の Lv1 は中身(回復)が
  // 開放されていない=何も出さないので、出撃開始時も補充後も投げない。
  if (!state.anyDispensed) return false;
  const healApplicable = level >= 2;
  const bombApplicable = level >= 3;
  if (!state.ammoHandgunDispensed || !state.ammoShotgunDispensed || !state.ammoRifleDispensed) return false;
  if (healApplicable && !state.healDispensed) return false;
  if (bombApplicable && !state.bombDispensed) return false;
  return true;
};

// 守護霊の鞄の初期在庫(GHOST-SUBS-FINAL v0.25.2563)。**型はプレイヤーと同じ**FirstAidKitStateで、
// 弾薬(除外4=守護霊は弾薬を消費しない)と爆弾(§2.11追補3=世界へアイテムを撒かない)は
// 「最初から払い出し済み」にしてある=残る中身は自分への回復1つ(裁定「自前在庫1」)。
export const createGhostFirstAidKitState = (): FirstAidKitState => ({
  ...createFirstAidKitState(),
  ammoHandgunDispensed: true,
  ammoShotgunDispensed: true,
  ammoRifleDispensed: true,
  bombDispensed: true,
});

// 投げた空鞄が爆発(着弾)した瞬間の補充(社長指示2026-11-25)。払い出し済みフラグと thrown を
// その持ち主の初期状態へ戻す=以後また条件を満たせば中身を出し、出し切ればまた投げる。
// 待ち時間は入れない(爆発=即補充)。守護霊の鞄は守護霊の初期在庫(回復のみ)へ戻す。
// 初期状態との違いは armed*=false の1点(社長裁定2026-11-25「条件が新しく起きた時だけ」):
// 補充の瞬間に成り立っている条件では出さず、一度解けてまた成り立った時に出す。
export const refillFirstAidKit = (owner: 'player' | 'ghost'): FirstAidKitState => ({
  ...(owner === 'ghost' ? createGhostFirstAidKitState() : createFirstAidKitState()),
  armedHandgun: false,
  armedShotgun: false,
  armedRifle: false,
  armedHeal: false,
  armedBomb: false,
});

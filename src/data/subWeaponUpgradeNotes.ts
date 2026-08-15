// サブウェポンの「強化ポイント」台帳(社長指示: ショップの説明欄を陳列在庫の内部用語から
// 「どう強くなるか」表示へ差し替えるため新設)。SubWeaponKey ごとに Lv2/Lv3 へ上げた時に何が
// 強くなるかを1行(全角15〜24字目安)で持つ。仕様値そのもの(数値)は書かない
// (CLAUDE.md「本文に数値を書かない」)。
//
// ★各行は実際のコードの定数・分岐を読んで書いた(推測禁止・CLAUDE.md実装精度の規律)。
// 根拠ファイル:行はコメントで併記。レベルで変化しない武器は note を null にし、
// 「変化なし」と機械的に分かる形にする(嘘を書かない)。
//
// データと表示を分離: ここは台帳(データ)のみ。表示文言の組み立ては
// subWeaponUpgradeNoteText()(このファイル)を呼ぶ側(ShopMenu 等)で行う。
import type { SubWeaponKey } from '../types/game';

export interface SubWeaponUpgradeNote {
  /** Lv1→Lv2で強くなるポイント。null = このサブウェポンはレベルで変化しない。 */
  lv2: string | null;
  /** Lv2→Lv3で強くなるポイント。null = このサブウェポンはレベルで変化しない。 */
  lv3: string | null;
}

// SubWeaponKey の Record にすることで、型チェックが「取りこぼしゼロ」を強制する
// (types/game.ts に新しい SubWeaponKey が増えるとここが typecheck エラーになる)。
export const SUB_WEAPON_UPGRADE_NOTES: Record<SubWeaponKey, SubWeaponUpgradeNote> = {
  // 手榴弾: レベルで同時に投げる発数が1→2→3に増える(拡散)。爆発力・半径は変わらない。
  // 根拠: src/hooks/useGameLoop.ts:542-546 GRENADE_SPREAD_BY_LEVEL
  'heavy-grenade': {
    lv2: '同時に投げる本数が増える',
    lv3: '同時に投げる本数が増える',
  },
  // マークスマントラップ: レベルで捕縛範囲だけが広がる(スタン時間・クリ補正・CDは全Lv共通)。
  // 根拠: src/hooks/useGameLoop.ts:426 MARKSMAN_TRAP_RADIUS_BY_LEVEL=[0,50,78,106]
  'marksman-trap': {
    lv2: '罠の範囲が広がる',
    lv3: '罠の範囲が広がる',
  },
  // クイックリロード: レベルで再使用までのクールダウンが短くなる。
  // 根拠: src/hooks/useGameLoop.ts:427 STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL=[0,10000,8000,6000]
  'striker-quick-mag': {
    lv2: '再使用の間隔が短くなる',
    lv3: '再使用の間隔が短くなる',
  },
  // ハンティング(近接強化): レベルで溜め時間が短縮され、間合いも伸びる。
  // 根拠: src/config/hunting.ts:1-2 HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL / HUNTING_CHARGE_MS_BY_LEVEL
  'striker-hunting': {
    lv2: '溜めが速く間合いも伸びる',
    lv3: '溜めが速く間合いも伸びる',
  },
  // ドッグ: レベルで回収の再出発が速くなり、捜索範囲・回収範囲も広がる。
  // 根拠: src/hooks/useGameLoop.ts:430,432,433
  // DOG_PICKUP_COOLDOWN_BY_LEVEL / DOG_FETCH_TARGET_RADIUS_BY_LEVEL / DOG_COLLECT_RADIUS_BY_LEVEL
  dog: {
    lv2: '回収が速く範囲も広くなる',
    lv3: '回収が速く範囲も広くなる',
  },
  // 刀: レベルで射程・威力・会心率がすべて上がる。
  // 根拠: src/store/gameStore.ts:1211-1221
  // KATANA_RANGE_BY_LEVEL / KATANA_DAMAGE_BY_LEVEL / KATANA_CRIT_CHANCE_BY_LEVEL
  katana: {
    lv2: '射程・威力・会心率が上がる',
    lv3: '射程・威力・会心率が上がる',
  },
  // 小烏丸(murasame): 刀Lv3到達で商人に1回だけ並ぶ特殊枠。unlockedShopSkillCards['murasame']は
  // 常に1で止まる(それ以上の陳列レベルは発行されない)ため、購入後にLv2/Lv3へ上げる動線自体が
  // 存在しない=レベルで変化しない(性能は刀Lv3基準に固定)。
  // 根拠: src/store/gameStore.ts:1327-1334(hasMurasame/katanaLevel), 1393-1396(maybeUnlockMurasame)
  murasame: {
    lv2: null,
    lv3: null,
  },
  // デコイ: レベルで持続時間・迎撃射程が伸び、Lv3では寿命切れ時に自爆(爆発)が追加される。
  // 根拠: src/hooks/useGameLoop.ts:444,450(DECOY_DURATION_BY_LEVEL/DECOY_RANGE_BY_LEVEL),
  // 453-459,7136(Lv3限定の自爆=DECOY_LV3_EXPLOSION_*)
  decoy: {
    lv2: '持続時間と迎撃範囲が伸びる',
    lv3: '消える時に爆発が追加される',
  },
  // 設置シールド: レベルで耐久力だけが上がる(設置間隔・持続は全Lv共通)。
  // 根拠: src/hooks/useGameLoop.ts:460-465(コメントに明記)/465 SHIELD_HP_BY_LEVEL=[0,10,30,60]
  shield: {
    lv2: '耐久力が上がる',
    lv3: '耐久力が上がる',
  },
  // 鞭: レベルでハリケーン(奥義)に必要なヒット数が減り(出しやすくなる)、
  // ハリケーンの吸引範囲・持続時間も伸びる。鞭本体の射程は全Lv共通。
  // 根拠: src/store/gameStore.ts:1367-1369
  // WHIP_CHARGE_HITS_BY_LEVEL / HURRICANE_RADIUS_BY_LEVEL / HURRICANE_DURATION_MS_BY_LEVEL
  whip: {
    lv2: '奥義が出しやすく範囲も伸びる',
    lv3: '奥義が出しやすく範囲も伸びる',
  },
  // 錬金術: レベルで召喚する仲間の種類がより強力なものに変わり、耐久HPも上がる。
  // 根拠: src/utils/summonUtils.ts:11-12
  // ALCHEMY_SUMMON_HP_BY_LEVEL / ALCHEMY_SUMMON_TYPE_BY_LEVEL(zombie→werewolf→pumpkin)
  alchemy: {
    lv2: '召喚する仲間が強くなる',
    lv3: '召喚する仲間が強くなる',
  },
  // タレット: 現状レベルによる変化なし(TURRET_DURATION_BY_LEVEL は全Lv同値。他の攻撃力/発射間隔
  // もレベルを参照していない)。コメントに「Lv2/3はTODO(暫定据置)」とあり=未実装の穴。
  // 報告事項(設計チャットへ)。
  // 根拠: src/hooks/useGameLoop.ts:499 TURRET_DURATION_BY_LEVEL=[0,15000,15000,15000]
  turret: {
    lv2: null,
    lv3: null,
  },
  // 四神舞(shijin): レベルでリズムのテンポ(BPM)が上がり、こなせる手数が増える。
  // 根拠: src/config/shijin.ts:7-8 RHYTHM_BPM_BY_LEVEL=[120,100,120,140](コメントに明記)
  shijin: {
    lv2: 'リズムが速くなり手数が増える',
    lv3: 'リズムが速くなり手数が増える',
  },
  // 火炎ナイフ: レベルで再使用間隔が短くなり、爆発範囲も広がる。
  // 根拠: src/hooks/useGameLoop.ts:533,535
  // FIRE_KNIFE_COOLDOWN_BY_LEVEL / FIRE_KNIFE_RADIUS_BY_LEVEL
  'fire-knife': {
    lv2: '再使用が速く爆発範囲も広がる',
    lv3: '再使用が速く爆発範囲も広がる',
  },
  // ドローンブーメラン: レベルで飛距離が伸び、先端での滞留時間(=攻撃機会)も長くなる。
  // 根拠: src/store/gameStore.ts:2409-2410
  // DRONE_BOOM_STOP_MS_BY_LEVEL / DRONE_BOOM_DIST_BY_LEVEL
  'drone-boomerang': {
    lv2: '飛距離と滞留時間が伸びる',
    lv3: '飛距離と滞留時間が伸びる',
  },
  // ワイヤーアンカー: レベルで刺す距離(移動距離)が伸びる(再使用CDは全Lv共通)。
  // 根拠: src/store/gameStore.ts:1234,1239 WIRE_DIST_BY_LEVEL / WIRE_COOLDOWN_BY_LEVEL
  'wire-anchor': {
    lv2: '刺す距離が伸びる',
    lv3: '刺す距離が伸びる',
  },
  // 賢者の石(sage-stone): 錬金術Lv3到達で商人に1回だけ並ぶ特殊枠。murasameと同じ仕組みで
  // unlockedShopSkillCards['sage-stone']は常に1で止まる=購入後にLv2/Lv3へ上げる動線が無い
  // (効果はハリケーン倍率固定ブーストのみで、レベルという概念を持たない)。
  // 根拠: src/store/gameStore.ts:1393,1396-1402(maybeUnlockSageStone), 1560(sageStoneHurricaneMult)
  'sage-stone': {
    lv2: null,
    lv3: null,
  },
  // ホーミング: レベルで同時ロックできる数が増える(=一斉発射の弾数が増える)。
  // 根拠: src/utils/homing.ts:12 HOMING_MAX_LOCKS_BY_LEVEL=[0,3,6,10]
  homing: {
    lv2: '同時ロック数が増える',
    lv3: '同時ロック数が増える',
  },
  // 分身: レベルで再出現までのクールダウンが短くなる。
  // 根拠: src/store/gameStore.ts:1026 SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL=[3000,3000,2000,1000]
  'shadow-clone': {
    lv2: '再出現が速くなる',
    lv3: '再出現が速くなる',
  },
  // 火炎瓶: レベルで1サイクルに設置する本数が増える。
  // 根拠: src/utils/molotov.ts:10 MOLOTOV_FIRES_BY_LEVEL=[0,3,5,7]
  molotov: {
    lv2: '一度に置く本数が増える',
    lv3: '一度に置く本数が増える',
  },
  // 救急鞄: レベルで払い出せる中身の種類が増える。Lv2で回復、Lv3でさらに爆弾が対象になる
  // (Lv1は弾薬のみ)。
  // 根拠: src/utils/firstAidKit.ts:82-83(healApplicable=level>=2 / bombApplicable=level>=3),
  // src/hooks/useGameLoop.ts:7465コメント「Lv1=弾薬のみ/Lv2=+回復/Lv3=+爆弾」
  'first-aid-kit': {
    lv2: '回復も払い出すようになる',
    lv3: '爆弾も払い出すようになる',
  },
  // センサー地雷: レベルで同時に設置できる数が増える。
  // 根拠: src/utils/sensorMine.ts:12 SENSOR_MINE_CAP_BY_LEVEL=[0,3,4,5]
  'sensor-mine': {
    lv2: '同時設置数が増える',
    lv3: '同時設置数が増える',
  },
  // 援護狙撃: レベルで呼べる間隔(クールダウン)が短くなる。
  // 根拠: src/utils/supportSniper.ts:7 SUPPORT_SNIPER_CD_MS_BY_LEVEL=[0,6000,5000,4000]
  'support-sniper': {
    lv2: '呼べる間隔が短くなる',
    lv3: '呼べる間隔が短くなる',
  },
  // フレアガン: レベルで再使用間隔(クールダウン)が短くなる。
  // 根拠: src/utils/flareGun.ts:9 FLARE_GUN_CD_MS_BY_LEVEL=[0,9000,7000,5000]
  'flare-gun': {
    lv2: '再使用の間隔が短くなる',
    lv3: '再使用の間隔が短くなる',
  },
  // ジャンクウェポン: レベルで1発の威力が上がる(その分、消費するスクラップも増える)。
  // 根拠: src/utils/junkWeapon.ts:9-10,24-30
  // JUNK_WEAPON_SCRAP_PER_PELLET_BY_LEVEL / JUNK_WEAPON_DAMAGE_PER_SCRAP / computeJunkShot
  'junk-weapon': {
    lv2: '一発の威力が上がる(消費も増)',
    lv3: '一発の威力が上がる(消費も増)',
  },
};

/**
 * 商人カードの説明欄に出す1行を返す。nextLevel は「これから買おうとしているレベル」。
 * - nextLevel<=1: 初回習得(まだ強化ポイントの前提=既存レベルが無い)なので専用文言。
 * - nextLevel が2/3以外(想定外): フォールバックとして空文字を返す(呼び出し側が別文言に差し替える)。
 * - 台帳の該当レベルが null(=そのサブウェポンはレベルで変化しない): その旨が分かる文言。
 */
export const subWeaponUpgradeNoteText = (key: SubWeaponKey, nextLevel: number): string => {
  if (nextLevel <= 1) return '装備できるようになる';
  const note = SUB_WEAPON_UPGRADE_NOTES[key];
  if (nextLevel === 2) return note.lv2 ?? 'このLvでは変化しない';
  if (nextLevel === 3) return note.lv3 ?? 'このLvでは変化しない';
  return '';
};

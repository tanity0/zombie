// PACING_PUZZLE.md §6.22 M47仕様①→§6.38 B3(E-1裁定・社長宣言による既存behavior変更)。
// 雑魚は無条件即死(弾切れ救済ループ=不変)。強個体(タイプ/フラグ判定。ランタイムHPの絶対値
// では判定しない=深部の雑魚を巻き込まない)は**HPに関わらず即死しない**——常に近接ダメージ×
// ELITE_MELEE_STUN_MULTを与えて気絶解除する(ボス5×打と同じ「フィニッシュ経路」扱い=crit扱いの
// 金数字表示)。
// ★E-1確定(社長裁定v0.25.3171「パンプキンもだけど即死無しだよ。致命の一撃ではあるけど」・
// PACING_PUZZLE.md §6.38 v3裁定): 旧仕様(HP<maxHealth×ELITE_EXECUTE_HP_RATIOなら即死)は撤去。
// パンプキン/lab-zombie-3/isNamed/questTargetの瀕死処刑を廃止=強個体は削り切る(HP0)以外で死なない。
// 呼び出し側(gameStore.ts の finisher **5箇所**=ナイフ/守護霊/分身/刀/鞭+ここ)の「ボスか否か」は
// **usesBossStunnedMelee** で判定する(v0.25.3171・案A)。
// 旧コメントは「isBossType 分岐より後段に置くこと」だったが、
// それだと pumpkin / lab-zombie-3 に強個体規定が永久に届かなかった。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(実装精度の規律4)。
import type { EnemyColorTier, EnemyType } from '../types/game';
import { isBossType, isPumpkinTier } from './enemyUtils';

export const ELITE_MELEE_STUN_MULT = 3;

// 強個体の**タイプ**判定(個体フラグ・色は含まない=個体単位の判定は下の `isEliteEnemy`)。
// §6.38 v7(社長裁定「城ボスをコピーして作り直して」): 賞金首4型は旧v6 A-1でここへ名指し追加
// されていたが、v7でisBossTypeへフル編入されたため撤去(=賞金首は下のusesBossStunnedMeleeで
// 普通に「ボス」として扱われ、致命の一撃はboss式×BOSS_MELEE_STUN_MULT・keepStunもboss枝が担う。
// 二重登録の解消)。E-1(強個体処刑の撤去=パンプキン/lab-zombie-3側)は§6.38 B3で実施済み
// (このファイル内=stunnedMeleeOutcomeのHP閾値撤去)。
const isEliteType = (t: EnemyType): boolean => isPumpkinTier(t) || t === 'lab-zombie-3';

/**
 * ★気絶中の近接を「ボス式」(=即死しない・近接×BOSS_MELEE_STUN_MULT)で受ける型か。
 * **= `isBossType` から強個体(pumpkin / lab-zombie-3)を除いたもの。**
 *
 * 社長裁定v0.25.3171(案A)。**M47(§6.22 仕様①)はこの2体を「強個体」と名指ししていた**のに、
 * 実装は全ての呼び出し側で `isBossType` を**先に**見ており、pumpkin / lab-zombie-3 は必ずボス枝へ
 * 落ちていた=**M47の規定がこの2体に一度も届いていなかった**(v0.25.2422以降はそもそもクリで
 * 固まらなくなっていたので誰も踏まなかった。v0.25.3169で固まるようになって表面化)。
 * ⇒ 気絶近接の「ボスか否か」はこの述語で判定する。**呼び出し側で `isBossType` を書かない。**
 */
export const usesBossStunnedMelee = (t: EnemyType): boolean => isBossType(t) && !isEliteType(t);

export interface StunnedMeleeEnemy {
  type: EnemyType;
  isNamed?: boolean;
  questTarget?: boolean;
  // ★v0.25.3547(社長裁定「強個体です」): 赤い個体は強個体。色ティアも強個体判定の入力。
  colorTier?: EnemyColorTier;
  health: number;
  maxHealth: number;
}

/**
 * ★強個体か(個体単位の判定・唯一の出どころ)。
 *
 * 内訳: **タイプ**(pumpkin / lab-zombie-3) または **個体フラグ**(isNamed / questTarget)
 * または **★色ティアが赤**(v0.25.3547)。
 *
 * 赤が入った経緯(社長裁定v0.25.3546→3547): ピークのコマに赤を1体確定で置く(案A)ことにした際、
 * 社長が「赤は強個体扱いにするってのは？」と提起し、実装報告に対して**「強個体です」**と裁定した。
 * ⇒ **ピークの赤に限らず、赤い個体はすべて強個体**(深いエリアの色抽選で出た赤も同じ)。
 *   色で2種類の赤を作るとプレイヤーに説明できないため。
 *
 * 赤(HP5×/攻3×)は既に雑魚とは別物の強さを持っているのに、**気絶させれば1発で即死**していた。
 * 強個体にすることで「削り切る以外で死なない」=山の頂点として立つ。
 */
export const isEliteEnemy = (enemy: Pick<StunnedMeleeEnemy, 'type' | 'isNamed' | 'questTarget' | 'colorTier'>): boolean =>
  isEliteType(enemy.type) || !!enemy.isNamed || !!enemy.questTarget || enemy.colorTier === 'red';

export type StunnedMeleeOutcome = 'execute' | 'heavy';

export const stunnedMeleeOutcome = (enemy: StunnedMeleeEnemy): StunnedMeleeOutcome => {
  // §6.38 v7: 旧v6 B1.5-1の「賞金首は全HP帯でexecuteを返さない」早期returnは撤去。
  // v7で賞金首はisBossType(=usesBossStunnedMelee)側へ入るため、この関数(強個体/雑魚の裁定)
  // には到達しなくなった(呼び出し側は必ずusesBossStunnedMeleeを先に見る=下のコメントどおり)。
  // §6.38 B3(E-1確定): 強個体(pumpkin/lab-zombie-3/isNamed/questTarget)はHPに関わらずexecuteを
  // 返さない(常にheavy)。旧HP50%閾値は撤去=瀕死処刑の廃止(既存behavior変更=社長宣言による)。
  // ★v0.25.3547: 判定は `isEliteEnemy` へ一本化(赤い個体=強個体を含む)。
  return isEliteEnemy(enemy) ? 'heavy' : 'execute'; // 雑魚は無条件即死・強個体は常にheavy(即死しない)
};

// ---------------------------------------------------------------------------
// 気絶敵への近接フィニッシュ(処刑)の裁定 — 唯一の出どころ。
// research/GHOST_PARITY_LEDGER.md §3-3(項目10)+発注B(v0.25.2525・GHOST-REFLECT-MELEE-SUBS)。
// プレイヤーのナイフスイング(gameStore.triggerCounter)と**守護霊の近接スイング**が同じ1本を通る
// (BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」=ゴースト用に分岐を複製しない)。
// 値・条件はプレイヤーの既存分岐そのまま(ボス5×・気絶維持は完全気絶中のみ / 強個体3× / 雑魚即死)。
// レンダラ非依存の純関数(判定のみ・副作用なし)=ヘッドレスでテスト可能。
// ---------------------------------------------------------------------------

/** 気絶中の敵に「フィニッシュ可能な近接」が当たった時の裁定。 */
export type StunnedMeleeHit =
  /**
   * ボス(賞金首4型を含む・§6.38 v7): 即死しない=近接ダメージ×BOSS_MELEE_STUN_MULT。
   * keepStun=完全気絶(紫・bossFullStunUntil)中は気絶を解除しない=何度でもこの致命の一撃を
   * 受け続けられる(タイマー切れまで)。v6時代は賞金首だけ'heavy'kindにkeepStunを個別追加していた
   * (§6.38実機FB4)が、v7でisBossType編入した結果この'boss'枝がそのまま賞金首にも適用されるように
   * なったため、その特例パッチは撤去した(=このboss枝1本で全ボス共通に正しく動く)。
   */
  | { kind: 'boss'; dmg: number; keepStun: boolean }
  /**
   * 強個体(pumpkin/lab-zombie-3)/isNamed・questTarget: §6.38 B3(E-1確定)によりHPに関わらず
   * 即死しない=常に近接ダメージ×ELITE_MELEE_STUN_MULT+気絶解除(1発で解除・keepStunなし)。
   */
  | { kind: 'heavy'; dmg: number }
  /** 雑魚(強個体以外): 即時処刑(即死)。強個体はどのHPでもここに来ない(B3で瀕死処刑を撤去)。 */
  | { kind: 'execute' };

/** 気絶判定+フィニッシュ裁定。null=気絶していない(呼び出し側は通常ヒット経路へ)。 */
export const resolveStunnedMeleeHit = (
  enemy: StunnedMeleeEnemy & { stunUntil?: number; bossFullStunUntil?: number },
  baseDamage: number,
  gameTime: number,
  bossStunMult: number, // = gameStore.BOSS_MELEE_STUN_MULT(値の二重管理を避けて注入)
): StunnedMeleeHit | null => {
  const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
  if (!stunned) return null;
  if (usesBossStunnedMelee(enemy.type)) {
    // 通常の気絶は1発で解除するが、「完全気絶(紫)」中は解除せずタイマー切れまで5×し放題
    // (§6.38 v7以降、賞金首もこの枝を通る=城ボス等と完全に同じ扱い)。
    const bossFull = enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil;
    return { kind: 'boss', dmg: baseDamage * bossStunMult, keepStun: bossFull };
  }
  if (stunnedMeleeOutcome(enemy) === 'heavy') {
    return { kind: 'heavy', dmg: baseDamage * ELITE_MELEE_STUN_MULT };
  }
  return { kind: 'execute' };
};

/** フィニッシュ打(ボス5×/強個体3×)で敵が浮く時間(ms)。プレイヤーの既存値(420)。 */
export const MELEE_STUN_LIFT_MS = 420;

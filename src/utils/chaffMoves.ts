// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」・v4=平坦化版2026-09-16)の**共通部**。
// §16-8b の実装順 1〜4(名前と型 / enemyBite.ts の土台 / combatTick.ts / gameStore.ts の共通部)の
// うち、bat/skeleton/ゾンビの個別の状態機械(§16-8b 5〜7)に**依存しない**土台だけをここへ置く
// (§16-8「新しい定数は1ファイル(例 src/utils/chaffMoves.ts)にまとめ」)。
//
// ★§16-8b手順5(ゾンビの状態機械=gameStore.ts)でこのファイルの `deriveChaffMoveGrants` /
// `endChaffMove` を初めて呼ぶようになった。★手順6〜7(bat/skeleton)も本ファイルへ実装済み
// (下の「§16-1 bat」「§16-2 skeleton」節)。
//
// ★「できるだけシビアに」(社長指示2026-09-17)。シビアの定義(設計者確定):
// 「手数が増え、読む時間が減る。ただし読めば必ず返せるし、返せば必ず殴れる」=削るのは
// **予告の長さ**と**技後CD**だけ。**硬直(プレイヤーの取り分)・同時に構えられる数(2体)・
// 判定/ダメージ量は削らない**(削ると理不尽になる)。bat/skeletonの値は§16-8台帳の叩き台から
// この指示ぶん差し替えてある(各定数のコメント参照)。ゾンビは対象外(設計チャット側)。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy, EnemyType, Player } from '../types/game';
import { biteSpecFor } from './enemyBite';
import { spriteVariantIndex } from './enemyVariant';

/** §16の技(雑魚の「詰めさせない技」)を持つ型。lab-zombie/lich等は別バッチで足す(§16-0)。 */
export const CHAFF_MOVE_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>(['bat', 'skeleton', 'zombie']);

/**
 * ★同時に構えられるのは2体まで(PACING_PUZZLE.md §16-8「同時に構えられる数」・カウンターを
 * 答えとして保つため=820ms周期)。3体目は枠が無いので技に入らない(待たせない・紫へ倒さない)。
 */
export const CHAFF_MOVE_SLOT_CAP = 2;

/**
 * 枠を「占有中」とみなす aiPhase(型ごと)。
 * ★s-recover/s-retreat(硬直・後退)は占有に**数えない**(社長裁定2026-09-16「s-recoverに入った
 * 時点で解放する」・§16-7b)——硬直・後退は「構えて」いないので、ここを占有し続けると2体が
 * 延々と枠を握って3体目が一生技を出さない。bat の b-release(留まる→離す→後ずさる)も同じ理由で
 * 占有しない。b-approach/z-wait(技の間合いに届く前の移動)もまだ「構えて」いないので占有しない
 * (取る=技の間合いに達した瞬間・§16-1)。
 */
const CHAFF_HOLDING_PHASES: ReadonlySet<string> = new Set([
  'b-orbit', 'b-windup', 'b-lunge', 'b-grab',
  's-crouch', 's-arc', 's-bite',
  // ★z-lunge-in(検収監査A-2): ゾンビは§16-7b「chaffMoveの立つ位置」がz-lunge-inなので、
  // 占有もここから始まる(bat/skeletonの構え開始相と同じ扱い)。
  'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2',
]);

/** この個体はいま枠(同時に構えられる2体)を占有しているか。 */
export const isChaffSlotHolding = (
  enemy: Pick<Enemy, 'type' | 'aiPhase'>,
): boolean =>
  CHAFF_MOVE_TYPES.has(enemy.type) && enemy.aiPhase !== undefined && CHAFF_HOLDING_PHASES.has(enemy.aiPhase);

/**
 * ★枠の前段(PACING_PUZZLE.md §16-1「枠は"状態"として持たない。毎フレーム導出する」・
 * 実装者視点監査A-6)。
 *
 * `updateEnemies` は `enemies.map(...)` の個体ごとの写像なので、「近い順で2体」は写像の前に
 * 全体を見る前段が要る。カウンタを持ち回すと、死亡・画面外リサイクル・カウンター・クリ気絶で
 * 枠が漏れて「誰も技を出さなくなる」(最悪の壊れ方で、しかも静かに起きる)ため、**このフレームの
 * enemies から毎回作り直す**こと。
 *
 * ★選び方=プレイヤーに近い順(整合監査A-9。配列順だと「常に同じ個体だけが技を出す」に見える)。
 * ★紫の追尾(zrush等)は数えない。型をまたいで数える(bat/skeleton/ゾンビが1つの枠を共有する)。
 *
 * 返り値は「このフレーム、枠を持ってよい個体のid集合」——既に占有中の個体(`isChaffSlotHolding`)と、
 * 空いた枠ぶんだけ`wantsSlot`で「技の間合いに達した」と申告した個体のうち近い順の分。
 * 呼び手(bat/skeleton/ゾンビの状態機械=§16-8b 5〜7)は、自分のidがこの集合に入っているかを見て
 * 構えに入る/入らない(枠を取れなかった個体は§16-1どおり歩いて詰める=旧挙動)を決める。
 */
export const deriveChaffMoveGrants = (
  enemies: readonly Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'x' | 'y' | 'width' | 'height'>[],
  pcx: number, pcy: number,
  wantsSlot: (enemy: Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'x' | 'y' | 'width' | 'height'>) => boolean,
): ReadonlySet<string> => {
  const held = enemies.filter(isChaffSlotHolding);
  const grants = new Set<string>(held.map(e => e.id));
  const openSlots = CHAFF_MOVE_SLOT_CAP - held.length;
  if (openSlots <= 0) return grants;
  const candidates = enemies
    .filter(e => CHAFF_MOVE_TYPES.has(e.type) && !isChaffSlotHolding(e) && wantsSlot(e))
    .map(e => {
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      return { id: e.id, d2: (ecx - pcx) ** 2 + (ecy - pcy) ** 2 };
    })
    .sort((a, b) => a.d2 - b.d2);
  for (let i = 0; i < Math.min(openSlots, candidates.length); i++) grants.add(candidates[i].id);
  return grants;
};

/**
 * ★旧 `deferFrozenClocksBy`(凍結dtの繰り下げ)は **PACING_PUZZLE.md §16-H で破棄した**
 * (社長指示2026-09-19「硬直中は全ての時計が止まる」)。
 *
 * 破棄の理由(H-1④/H-3): `updateEnemies` は `deltaTime * MOVE_SPEED_MULT`(=×1.2)で回るのに
 * `gameTime` は `+deltaTime*1000`(未スケール)で進むので、**毎フレーム dtMs を足す方式は構造的に
 * 1.2倍ズレる**。丸め/フレーム落ちの累積・硬直の重なりでの二重加算・コントローラとの順序依存も付いて回る。
 * 置き換え先は `src/utils/enemyClocks.ts` の `tickEnemyClockFreeze`(残りを預かって、明けた瞬間に
 * 絶対値で書き直す=足し算を1度もしない)。**加算方式を復活させないこと。**
 */

/**
 * ★技の終わり(PACING_PUZZLE.md §16-7 穴2の訂正・検収監査A-4)。
 *
 * 「正常解決(`biteClears`)では `chaffMove` を消さない・技後CDも書かない」に規則が訂正された
 * ことで、**技の終わり(後退の終わり=s-recover/s-retreatの終わり・ゾンビ2連なら2発目の解決)で
 * `chaffMove` を消し技後CDを書く**役目は**状態機械(§16-8b 5〜7・bat/skeleton/ゾンビの実装。
 * 別バッチ)**に移った。ここはその**公開された1本の関数**——状態機械はここを呼ぶだけでよい
 * (計算式を個別に持たない=biteClears/dashParriedEnemyPatchと同じ「いま出している技」の
 * spec(`biteSpecFor`)から recoverMs を引く作法に揃える)。
 *
 * ★§16-8b手順5(ゾンビ)で初めて呼ばれる(2発目=z-bite2の解決の瞬間・1箇所のみ)。
 * skeleton/batを実装する時も同じ1本をs-retreat/b-releaseの終わりから呼ぶこと
 * (§16-7b「後退の相も技の続きとして扱う。chaffMoveは後退が終わるまで立てたまま」)。
 *
 * ★技後CDに±12%の個体差を掛ける(PACING_PUZZLE.md §16-6「個体差の幅: 技後CD ±12%
 * (`chaffTraits`と同幅)」・§16-7b「停止長・技後CD…用のハッシュ枝を新設する(id由来=決定的。
 * 乱数を引かない)」)。群れの位相をずらすための個体差なので`chaffTraits`とは別の枝(idUnitHash)を
 * 使う(見せたい差ではない=chaffTraitsを流用して結合させない)。
 * ★②種に`spawnedAt`を混ぜる(§16-3z)。未設定ならidだけにフォールバック(`idRespawnUnitHash`)。
 */
export const endChaffMove = (
  enemy: Pick<Enemy, 'id' | 'type' | 'chaffMove' | 'aiPhase' | 'spawnedAt'>,
  gameTime: number,
): Pick<Enemy, 'chaffMove' | 'chaffMoveCdUntil'> => {
  const techSpec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  const jitter = 1 + (idRespawnUnitHash(enemy.id, enemy.spawnedAt, CHAFF_CD_JITTER_SALT) * 2 - 1) * CHAFF_CD_JITTER;
  return { chaffMove: undefined, chaffMoveCdUntil: gameTime + techSpec.recoverMs * jitter };
};

// =================================================================================================
// id由来の決定的ハッシュ(§16-7b「個体差の引き方はid由来の決定的なばらつき。乱数を引かない」)。
// `chaffTraits`(chaffMotion.ts)と同じ mix を使うが、**別ファイル**(循環import回避: chaffMotion.ts
// はこのファイルを知らない)なので複製する。salt を変えることで複数の独立した枝を1つのidから取れる
// (chaffTraitsが1つのhからrRole/rSpeed/rTau/rSpinを取り出すのと同じ考え方)。
// =================================================================================================
const mixHash = (h: number): number => {
  let x = h | 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822507);
  x ^= x >>> 13; x = Math.imul(x, 3266489909);
  x ^= x >>> 16;
  return x >>> 0;
};
/** id+salt → 0..1 の決定的な値(毎フレーム呼んでも揺れない・ヘッドレスで再現する)。 */
const idUnitHash = (id: string, salt: number): number => {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (mixHash(h) % 100000) / 100000;
};

/**
 * ★②個体差の種に「出直し回数」を混ぜる(社長裁定2026-09-16「新しいフィールドは要らない。
 * 既にある`spawnedAt`(湧いた時刻)をidに混ぜてください」)。同じ個体でも**湧き直せば別の癖**に
 * なる(=「型で押した動き」に見えるのを崩す)。`spawnedAt`が未設定(既存の呼び手・古いセーブ等)
 * なら**従来どおりidだけ**にフォールバックする(乱数は引かない・決定的のまま)。
 */
export const idRespawnUnitHash = (id: string, spawnedAt: number | undefined, salt: number): number =>
  idUnitHash(spawnedAt !== undefined ? `${id}#${spawnedAt}` : id, salt);

/** 技後CDの個体差(§16-6「個体差の幅: 技後CD ±12%」)。saltはchaffTraitsの枝と衝突しない値。 */
const CHAFF_CD_JITTER_SALT = 0x43_4451; // 'CDQ' の適当なビット列(単なる枝分け用の定数)
const CHAFF_CD_JITTER = 0.12;

// =================================================================================================
// ゾンビ赤(PACING_PUZZLE.md §16-3・§16-8の台帳)。★§16-8b手順5=このバッチの本体。
// =================================================================================================

/** 帯(§16-3)。外縁に入ったら待ちの尺を引き、内縁に達したら赤/紫が確定する。 */
export const ZOMBIE_BAND_OUTER_PX = 200;
/**
 * 帯の内縁=停止/追尾ループの境界(★§16-3「停止/追尾ループの境界を`MELEE_RADIUS`(74)→100pxへ
 * 上げる。74と100の二重基準にしない」)。旧`MELEE_RADIUS`はプレイヤーの近接リーチという別概念の値で、
 * たまたま同じ用途に流用されていただけなので、ここでは独立した定数として持つ。
 */
export const ZOMBIE_BAND_INNER_PX = 100;
/** 帯に入った時に引く「待ちの尺」の範囲(§16-3「抽選ではなく尺を散らす」・id由来の決定的な値)。 */
export const ZOMBIE_RED_WAIT_MIN_MS = 300;
export const ZOMBIE_RED_WAIT_MAX_MS = 2800;
/** 赤の停止(その場・色なし)。★2026-09-17「できるだけシビアに」で 2000→1200ms(§16-8台帳)。 */
export const ZOMBIE_RED_PAUSE_MS = 1200;
/** 踏み込みの終端=1発目が届く上限(§16-3「射程75pxの根拠」)。 */
export const ZOMBIE_LUNGE_RANGE_PX = 75;

/**
 * ★踏み込み(`z-lunge-in`)の上限時間(社長指摘2026-09-17
 * 「**ゾンビみたいに台本の中で詰め寄ってくる時間に上限ある？なければ設けて**」)。
 *
 * ★**無かった。** 実在確認: `z-lunge-in` は「射程75pxに入るまで走り続ける」だけで、
 * **期限を1つも見ていなかった**(skeletonの弧は `SKELETON_ARC_MS`、batの踏み込みは BiteSpec、
 * 紫の追尾は `ZOMBIE_RUSH_MS` で**全部上限を持っている**。ゾンビの赤の踏み込みだけが例外)。
 *
 * ★どれくらい不味いか(実測の計算): 踏み込みの実効速度は
 * 42(基礎) × 2/3(`ENEMY_SPEED_MULT`) × 1.2(`ZOMBIE_SPEED_MULT`) × 2.8(`ZOMBIE_LUNGE_SPEED_MULT`)
 * = **約94px/s**。プレイヤーの基礎速度は**87px/s**なので、**下がり続けられると詰め寄り速度は
 * 差し引き7px/s**——帯の外縁(200px)から射程(75px)までの125pxを詰めるのに**約18秒**かかる。
 * しかも `z-lunge-in` は**枠を占有する相**なので、その間**他の敵が技を出せない**
 * (社長の「A-Bが攻撃→CD→その間にC-Dが解除される」回転が止まる)。
 *
 * ★上限に達したら**その場で噛む**(=空振りする)。諦めて引き返すのではない理由:
 * **技の3拍(技→硬直→離れる)を全型で守る**ため。空振りしても硬直はプレイヤーの取り分になり、
 * §12の「逃げれば空振り」と同じ読み方に揃う。**逃げ切った側が報われる。**
 * 値は叩き台(1800ms ≒ 170px ぶんの移動。止まっている相手なら帯のどこからでも届く)。
 */
export const ZOMBIE_LUNGE_MAX_MS = 1800;
/** 2連の一拍(よろけ)。 */
export const ZOMBIE_STAGGER_MS = 160;
/**
 * 2発目の向きを1発目からわずかにずらす角度(rad)。★台帳に度数の指定は無い(§16-3「向きも
 * 僅かにずらす」とだけ規定)ので、既存の`chaffTraits`と同じ「見せたい差だけ大きく振る」思想の
 * 範囲で叩き台として選んだ実装値(社長裁定を要する数値ではなく演出の微調整=実機で振る)。
 */
export const ZOMBIE_BITE2_ANGLE_OFFSET_RAD = 0.22; // ≒12.6°

/**
 * ★①均質を壊す(§16-3z「内縁の引き金に幅」)。実測(2026-09-16・設計者): ゾンビの実速度は
 * 約63px/s・帯100pxの通過は約1.6秒なので、待ちの尺(0.3〜2.8秒)の約半分は「100px到達」が
 * 先に勝ち、**同じ見えない線の上で止まる**。⇒ 「待ちの尺を終わらせる距離」自体をid由来で散らす
 * (判定・射程=`ZOMBIE_BAND_INNER_PX`(帯の内縁・紫ループの境界)は変えない。散らすのは
 * **z-waitの待ちが距離で切れる引き金だけ**)。
 */
export const ZOMBIE_RED_TRIGGER_MIN_PX = 88;
export const ZOMBIE_RED_TRIGGER_MAX_PX = 118;

/**
 * 帯(200〜100px)に入った時に引く「待ちの尺」(id由来・決定的=乱数を引かない)。
 * ★②種に`spawnedAt`を混ぜる(§16-3z・社長裁定): 未設定ならidだけにフォールバック。
 */
export const zombieRedWaitMs = (id: string, spawnedAt?: number): number =>
  ZOMBIE_RED_WAIT_MIN_MS + idRespawnUnitHash(id, spawnedAt, 0x2b1a) * (ZOMBIE_RED_WAIT_MAX_MS - ZOMBIE_RED_WAIT_MIN_MS);

/**
 * z-waitの待ちを距離で終わらせる引き金(88〜118px・id由来・決定的=乱数を引かない)。
 * ★クリエイティブ監査#9是正: 他3値(zombieRedWaitMs/zombieRedPauseMs/zombieBite2AngleRad)は
 * すべて`spawnedAt`(出直し回数)を種に混ぜているのに、この値だけidのみだった。揃える
 * (未設定ならidだけにフォールバック=idRespawnUnitHashの既定挙動)。
 */
export const zombieRedTriggerPx = (id: string, spawnedAt?: number): number =>
  ZOMBIE_RED_TRIGGER_MIN_PX + idRespawnUnitHash(id, spawnedAt, 0x71c3) * (ZOMBIE_RED_TRIGGER_MAX_PX - ZOMBIE_RED_TRIGGER_MIN_PX);

/**
 * ★赤が先(§16-3)。帯の内縁(100px)に達した時、**枠が取れていれば赤**。この関数は
 * `deriveChaffMoveGrants` の `wantsSlot` に渡す「この個体は今フレーム枠を欲しがっているか」の
 * ゾンビ専用実装——「尺切れ **または** 距離が100pxに達した」のどちらか(先に来た方)を
 * `aiPhase==='z-wait'` の間だけ判定する。
 *
 * ★CD中の個体を候補から外すのはここ(呼び手)の仕事(§16-7b「枠の導出はこれを読まない。
 * CD中の個体を候補から外すのは呼び手のwantsSlotの仕事」)。
 */
export const zombieWantsChaffRedSlot = (
  enemy: Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'aiPhaseUntil' | 'chaffMoveCdUntil' | 'x' | 'y' | 'width' | 'height' | 'spawnedAt'>,
  gameTime: number, pcx: number, pcy: number,
): boolean => {
  if (enemy.type !== 'zombie' || enemy.aiPhase !== 'z-wait') return false;
  if (enemy.chaffMoveCdUntil !== undefined && gameTime < enemy.chaffMoveCdUntil) return false;
  const timeUp = enemy.aiPhaseUntil !== undefined && gameTime >= enemy.aiPhaseUntil;
  if (timeUp) return true;
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  // ★①均質を壊す(§16-3z): 帯の内縁そのもの(判定・紫ループの境界=ZOMBIE_BAND_INNER_PX)は
  // 変えず、「待ちを距離で終わらせる引き金」だけid由来で88〜118pxへ散らす。
  return Math.hypot(pcx - ecx, pcy - ecy) <= zombieRedTriggerPx(enemy.id, enemy.spawnedAt);
};

// =================================================================================================
// §16-3z「★『歯応え』の仕上げ」(社長指示2026-09-16「エルデンリングみたいに動きに歯応えがある形に」)。
// ★③技の後(一番効く): 2連の後の硬直。 / ②重さ: 踏み込みの加速・オーバーシュート。 / ①読める: 赤の脈。
// =================================================================================================

/**
 * ★③2連の後の硬直(§16-3z「技の後は必ずプレイヤーの番」)。その場で伸び切ったまま
 * **下がらない**(ゾンビ=詰め切って居座る敵。bat/skeletonの「出入りする敵」とは型が違う)。
 * 硬直中は移動も次の技も入らない(gameStore.ts の状態機械が z-recover 中は vx:0,vy:0 を返す・
 * `BITE_OK_PHASES`/`CHAFF_MOVE_PHASES` にも z-recover を足して新しい§12噛みも始めさせない)。
 * ★s-recoverと同じ「技の続き」(chaffMoveは立てたまま=枠だけ解放・§16-7b)。
 * 技後CD(2500ms)は**この硬直が明けてから**数える(endChaffMoveをz-recoverの終わりで呼ぶ)。
 * ★硬直明けは下がらず、その代わり§16-A7条目で**後退(z-retreat)へ続く**(硬直が先・後退が後)。
 * ★600→900ms(社長裁定2026-09-17「推薦で」・PACING_PUZZLE.md §16-A受け入れ条件)。実測で
 * 1発目の命中から数えると前半316msが被弾無敵(INVULN_MS=1000)と重なり正味284msしか無く、
 * 近接1振り(COUNTER_WINDOW=368ms)が入らなかった。900msなら実効約584ms=条件(350ms)を満たす。
 */
export const ZOMBIE_RECOVER_MS = 900;

/**
 * ★§16-A 7条目「技を出し切ったら得意な距離まで離れる」(社長指示2026-09-17)。
 * ゾンビの得意な距離=帯(100〜200px)の真ん中=**150px**(§16-A表「ここへ戻るから、また出る」)。
 * z-recover(硬直)明け→ここまで**後退が先ではなく硬直が先**(skeletonと同じ順)。
 * ★紫のループ(zpause→zrush)の後も同じ150pxまで離れる(§16-A「ここが90回出ている本体」)。
 * 離れきったら帯(200px)へ戻るので、赤の台本がまた出せる(=これが狙い)。
 */
export const ZOMBIE_RETREAT_TARGET_PX = 150;
/** 後退の速さ(§16-A「skeletonと同じ作法で1.5倍速」)。skeletonのSKELETON_RETREAT_SPEED_MULTと同値。 */
export const ZOMBIE_RETREAT_SPEED_MULT = 1.5;
/**
 * ★後退にも慣性を入れる(CLAUDE.md「動きの絶対ルール: 慣性」・0→満速の段差を作らない)。
 * ZOMBIE_RECOVER_WALK_RAMP_MS(250ms・硬直明けの通常歩行の立ち上がり)と同じ考え方・同じ尺の
 * ease-out cubic(zombieLungeRampMulと同型)。台帳に無い実装細部の叩き台(社長裁定を要する値ではない)。
 */
export const ZOMBIE_RETREAT_RAMP_MS = 250;

export const zombieRetreatRampMul = (retreatAt: number | undefined, gameTime: number): number => {
  if (retreatAt === undefined) return 1;
  const u = Math.max(0, Math.min(1, (gameTime - retreatAt) / ZOMBIE_RETREAT_RAMP_MS));
  return 1 - (1 - u) ** 3; // ease-out cubic(出足側=立ち上がりが速い。zombieLungeRampMulと同型)
};

/**
 * ★②踏み込みの解放を鋭くする(PACING_PUZZLE.md §16-3z 監査#8・設計者が受け入れた)。
 * 旧360ms+左右対称smoothstepは「止まりに向かって減速する曲線」で、攻撃の出足には向かない。
 * 重い敵の重さは**長い予備+短く鋭い解放+長い硬直**で出る——z-lunge-inの解放だけ180〜220ms・
 * 出足側の曲線(ease-out cubic=立ち上がりが速く、終盤だけ緩む)へ短縮する。
 * ★通常移動の立ち上がり(§16-6「ゾンビ=立ち上がり≒360ms」)は**触らない**(別の定数・chaffMotion.ts側)。
 * `chaffMoveAt`(z-lunge-inへ入った瞬間に焼かれる=§16-7b)からの経過msをこの尺で立ち上げる。
 */
export const ZOMBIE_LUNGE_RAMP_MS = 200;

export const zombieLungeRampMul = (chaffMoveAt: number | undefined, gameTime: number): number => {
  if (chaffMoveAt === undefined) return 1;
  const u = Math.max(0, Math.min(1, (gameTime - chaffMoveAt) / ZOMBIE_LUNGE_RAMP_MS));
  return 1 - (1 - u) ** 3; // ease-out cubic(出足側=立ち上がりが速い)
};

/**
 * ★③硬直→歩きの出足(§16-3zクリエイティブ監査#3是正)。z-recoverが明けた瞬間、旧実装は
 * 0→満速の1フレーム段差だった。硬直明けの一歩目だけ、歩行速度にこの尺で滑らかな立ち上がりを掛ける
 * (smoothstep=このプロジェクトの慣性の定番曲線)。`zombieWalkRampAt`(Enemy.ts)は
 * z-recoverが明けた瞬間に焼かれ、以後は経過msがこの尺を超えた時点で1(無効化)に収束する。
 */
export const ZOMBIE_RECOVER_WALK_RAMP_MS = 250;

export const zombieRecoverWalkRampMul = (rampAt: number | undefined, gameTime: number): number => {
  if (rampAt === undefined) return 1;
  const u = Math.max(0, Math.min(1, (gameTime - rampAt) / ZOMBIE_RECOVER_WALK_RAMP_MS));
  return u * u * (3 - 2 * u);
};

/**
 * ★赤は「状態」ではなく「合図の句読点」(PACING_PUZZLE.md §16-3z・社長指示2026-09-16
 * 「ゾンビの攻撃、赤くなるのは走り始めのとき2回点滅するだけにして」)。
 *
 * ★2026-09-17 全雑魚へ統一(社長指示「**雑魚が赤くなりながら突っ込んでくるのをやめて、雑魚の攻撃は
 * すべてゾンビと同じ文脈にしたい。つまりスーパーアーマーに入るタイミングで赤点滅。紫なら紫点滅**」)。
 * bat/skeleton だけ別形(`chaffRedGlowStrength`=技の頭から決着まで**光り続ける**)だったのを**廃止**し、
 * この関数を**全 `chaffMove` 共通**にした。型で分岐しない。
 * ★合図の錨は `chaffMoveAt`=**技が立った瞬間**で、これは `isEnemyAttacking` が true になる瞬間
 * (=スーパーアーマーに入る瞬間)と同じ。**社長の言う「タイミング」はこの1点**なので、
 * 3体それぞれの相(z-lunge-in / b-windup / s-crouch)を数え上げる必要がない。
 * ★紫(§12の噛みつき=カウンター不可)は `biteAt` 基準の既存の2回点滅(`biteBlinkOn`)がそのまま
 * 同じ文脈——あちらも**スーパーアーマーに入る瞬間**(chaffMove を持たない攻撃では `biteAt`)が錨。
 *
 * 旧実装(v0.25.4409)は相ごとに強さを返す=踏み込みから決着まで平坦に赤く光り続け、
 * 踏み込みは最長1.9秒あるため「1.5秒以上の赤い照明」になっていた(クリエイティブ監査#12)。
 * **社長指示はこれを根本から置き換える**——強さや尺の調整ではない。
 *
 * ★いつ: `z-lunge-in` に入った瞬間(`chaffMoveAt`)だけ。 ★何回: 2回の点滅
 * (点灯→消灯→点灯→消灯)。 ★その後: 技の終わりまで(踏み込みの残り・噛み1・よろけ・噛み2・硬直)
 * 赤は一切出ない=このフェーズ以外は常に0を返す。
 */
export const CHAFF_BLINK_ON_MS = 70;
export const CHAFF_BLINK_OFF_MS = 70;
export const CHAFF_BLINK_COUNT = 2;

export const chaffMoveBlinkStrength = (
  enemy: Pick<Enemy, 'chaffMove' | 'chaffMoveAt'>,
  gameTime: number,
): number => {
  if (enemy.chaffMove === undefined) return 0;
  const startedAt = enemy.chaffMoveAt;
  if (startedAt === undefined) return 0;
  const elapsed = gameTime - startedAt;
  const cycleMs = CHAFF_BLINK_ON_MS + CHAFF_BLINK_OFF_MS;
  const totalMs = cycleMs * CHAFF_BLINK_COUNT;
  if (elapsed < 0 || elapsed >= totalMs) return 0;
  return (elapsed % cycleMs) < CHAFF_BLINK_ON_MS ? 1 : 0;
};

/**
 * ★①停止の長さ±30%(社長裁定2026-09-16「3段を比例で伸縮させる」)。
 *
 * `ZOMBIE_RED_PAUSE_MS`(★2026-09-17「できるだけシビアに」で2000→1200ms)は**基準値として残す**
 * (1箇所で動かせること)。実際に個体が使う全長は `ZOMBIE_RED_PAUSE_MS × (0.7〜1.3)`
 * (id+spawnedAt由来・決定的)。
 * ★3段の比(止まる:起こす:詰めの溜め = 25%:45%:30%、元の 500:900:600 と同じ比)は
 * **全長によらず一定**(`ZOMBIE_RP_STUMBLE_FRAC`等)——一部だけ固定にすると、短い個体で
 * 「溜め」だけが相対的に長くなり形が変わってしまうため、pixiScene側の姿勢はこの比率を
 * 「全長に対する割合」で読む(絶対msで段の境目を書かない)。
 * ★2026-09-17の詰め(§16-8「比はそのまま。全長が1200msになるだけ」)で`ZOMBIE_RED_PAUSE_MS`
 * 自体を動かしたため、比率は**元の基準(2000ms=500:900:600)から**計算する
 * (`ZOMBIE_RED_PAUSE_MS`で割ると分母が変わって比が壊れるため、割合は下の独立した定数で持つ)。
 */
export const ZOMBIE_RED_PAUSE_JITTER = 0.3;
export const zombieRedPauseMs = (id: string, spawnedAt?: number): number =>
  ZOMBIE_RED_PAUSE_MS * (1 + (idRespawnUnitHash(id, spawnedAt, 0x5ed9) * 2 - 1) * ZOMBIE_RED_PAUSE_JITTER);

/** 3段の比率(§16-3z「止まる500→起こす900→詰めの溜め600」=25%:45%:30%。全長によらず一定)。 */
export const ZOMBIE_RP_STUMBLE_FRAC = 0.25;
export const ZOMBIE_RP_RISE_FRAC = 0.45;
export const ZOMBIE_RP_TREMBLE_FRAC = 0.30;

/**
 * ★②2発目の角度にも`spawnedAt`を混ぜる(社長裁定2026-09-16)。
 *
 * `ZOMBIE_BITE2_ANGLE_OFFSET_RAD`(0.22rad)自体は演出の叩き台(社長裁定を要する値ではない)
 * なので変えない。**向き**(左右どちらへずらすか)は従来どおり`chaffTraits().flankSign`
 * (既存の確立された左右振り分けの出どころ・呼び手が渡す)のまま——ここを差し替えると他の
 * chaffTraits依存の絵(回り込み等)との左右一貫性が崩れる。**大きさ**だけ、停止の長さと同じ
 * ±30%(「見せたい差」§16-6の幅)をid+spawnedAt由来で掛ける。
 */
export const ZOMBIE_BITE2_ANGLE_JITTER = 0.3;
export const zombieBite2AngleRad = (id: string, spawnedAt: number | undefined, spin: number): number => {
  const mul = 1 + (idRespawnUnitHash(id, spawnedAt, 0x8a41) * 2 - 1) * ZOMBIE_BITE2_ANGLE_JITTER;
  return ZOMBIE_BITE2_ANGLE_OFFSET_RAD * mul * spin;
};

// =================================================================================================
// §16-1 bat — 回りながら詰めて掴む(PACING_PUZZLE.md §16-1・§16-8の台帳)。★§16-8b手順6。
// =================================================================================================

/** 円の半径(§16-1「規則」= MELEE_RADIUS(74) + 帯の半幅(18.1) + 余白8px ≒ 100px。中心間で書く)。 */
export const BAT_ORBIT_RADIUS_PX = 100;
/**
 * ★②円を回る尺(社長指示2026-09-17「できるだけシビアに」で 1500〜3000ms → **900〜1800ms**。
 * 「仕掛けが早くなる」=予告そのものの長さを削る側)。
 */
export const BAT_ORBIT_MIN_MS = 900;
export const BAT_ORBIT_MAX_MS = 1800;
/**
 * 円の速さ。★2026-09-17 に **0.45→1(等倍)** へ(社長指示「**一定距離まできたら近づいてくるのを
 * やめさせたい…保ち方はやはり半分の速度で円展開…するとバットの攻撃パターンと被るので、バットの
 * 台本の円の方は半分の速度をやめて等倍に**」)。
 * ⇒ **「半分の速度で回る」は、これからは全員が持つ"間合いを保つ動き"の側の言葉**になった。
 * bat の台本の円は**技の一部**なので、そちらと区別がつくよう等倍で回す。
 * (旧: §16-1「flankより明確に遅いこと。遅いのは円の間だけ」=0.45。**この意図は間合い保持側が引き継ぐ**。)
 */
export const BAT_ORBIT_SPEED_MULT = 1;
/** 円の中心の追従時定数(一次遅れ・叩き台=§16-8「叩き台0.12」)。ロックオン軌道にしない。 */
export const BAT_ORBIT_TAU_S = 0.12;
/** 刻む横歩き(§16-1クリエイティブ監査#13): 動く尺0.4〜0.7秒・止まり0.2〜0.3秒。 */
export const BAT_STRAFE_MIN_MS = 400;
export const BAT_STRAFE_MAX_MS = 700;
export const BAT_HOLD_MIN_MS = 200;
export const BAT_HOLD_MAX_MS = 300;
/** 円の内側へどれだけ踏み込まれたら「詰めた」引き金(b)とみなすか(円の自然な半径維持の揺れを
 * 誤検知しないための余白。台帳に無い実装細部の叩き台=演出の微調整・社長裁定を要する値ではない)。 */
export const BAT_ORBIT_INTRUDE_MARGIN_PX = 15;
/**
 * ★掴まれている尺(社長裁定2026-09-16「つかみは文字通り...プレイヤーの時間を止めてダメージ」・
 * §16-8「叩き台500ms」)。「できるだけシビアに」の対象外(判定・ダメージ量とセットで変えない)。
 * b-release の「一拍留まる」もこれと同じ尺(掴んでいる敵と掴まれているプレイヤーは同じ拍)。
 */
export const BAT_GRAB_HOLD_MS = 500;

const BAT_SALT_ORBIT_MS = 0x6b1a;
const BAT_SALT_STRAFE_MS = 0x6b1b;
const BAT_SALT_HOLD_MS = 0x6b1c;

/** 円を回る尺(id+spawnedAt由来・決定的)。 */
export const batOrbitDurationMs = (id: string, spawnedAt: number | undefined): number =>
  BAT_ORBIT_MIN_MS + idRespawnUnitHash(id, spawnedAt, BAT_SALT_ORBIT_MS) * (BAT_ORBIT_MAX_MS - BAT_ORBIT_MIN_MS);
/** 刻む横歩きの「動く」尺(id+spawnedAt由来・決定的)。 */
export const batStrafeMs = (id: string, spawnedAt: number | undefined): number =>
  BAT_STRAFE_MIN_MS + idRespawnUnitHash(id, spawnedAt, BAT_SALT_STRAFE_MS) * (BAT_STRAFE_MAX_MS - BAT_STRAFE_MIN_MS);
/** 刻む横歩きの「止まり」尺(id+spawnedAt由来・決定的)。 */
export const batHoldMs = (id: string, spawnedAt: number | undefined): number =>
  BAT_HOLD_MIN_MS + idRespawnUnitHash(id, spawnedAt, BAT_SALT_HOLD_MS) * (BAT_HOLD_MAX_MS - BAT_HOLD_MIN_MS);

/**
 * ★回転方向(§16-8「添字0=右回り/添字1=左回り。spriteVariantIndex(id,2)。batは添字0が男」)。
 * +1=右回り(時計回り) / -1=左回り。
 */
export const batOrbitSpin = (id: string): 1 | -1 => (spriteVariantIndex(id, 2) === 0 ? 1 : -1);

/**
 * ★刻む横歩きの角速度の包絡線(0..1)。動く区間(strafeMs)は0→山→0(加速して最大→減速して止まる
 * =慣性MUST)、止まり区間(holdMs)は0(完全静止)。`t`はこのセットが始まってからの経過ms(モジュロで
 * 周期を扱うので、呼び手はセットの開始時刻さえ渡せばよい=専用の内部状態を持たない純関数)。
 */
export const batStrafeAngularMul = (t: number, strafeMs: number, holdMs: number): number => {
  const cycle = Math.max(1, strafeMs + holdMs);
  const tm = ((t % cycle) + cycle) % cycle;
  if (tm >= strafeMs) return 0; // 止まり
  const u = tm / Math.max(1, strafeMs);
  return Math.sin(u * Math.PI); // 0→1→0(なだらかな山=段差のない加減速)
};

/**
 * ★枠の申告(bat版・zombieWantsChaffRedSlotと同じ作法)。「取る=技の間合い(100px)に達した瞬間」
 * (§16-1)。bat には「尺切れ」に相当する待ちが無い(合図そのものが円=zombieのz-waitに当たる
 * 事前の待機フェーズを持たない)ので、距離条件だけで申告する。CD中の個体を候補から外すのは
 * ここ(呼び手)の仕事(§16-7b「枠の導出はこれを読まない」)。
 */
export const batWantsChaffSlot = (
  enemy: Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'chaffMoveCdUntil' | 'x' | 'y' | 'width' | 'height'>,
  gameTime: number, pcx: number, pcy: number,
): boolean => {
  if (enemy.type !== 'bat') return false;
  if (enemy.aiPhase !== undefined) return false; // 「構え前(b-approach=aiPhase未設定)」だけが対象
  if (enemy.chaffMoveCdUntil !== undefined && gameTime < enemy.chaffMoveCdUntil) return false;
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  return Math.hypot(pcx - ecx, pcy - ecy) <= BAT_ORBIT_RADIUS_PX;
};

// =================================================================================================
// §16-2 skeleton — 回り込んで横から噛む(PACING_PUZZLE.md §16-2・§16-8の台帳)。★§16-8b手順7。
// =================================================================================================

/** 発火距離(社長裁定2026-09-16「3、出す」で70→100px。§16-8「変えない」対象)。 */
export const SKELETON_TRIGGER_PX = 100;
/**
 * ★しゃがみ(合図)の尺(社長指示2026-09-17「できるだけシビアに」で 2000→**900ms**「大きく詰めます」)。
 * ★元は社長指定の値(2000ms)だった——今回の指示で設計者が詰めた(DEVELOPMENT_LOGに明記)。
 * ★予告の下限800ms(社長指示)を守っている(900>800)。
 */
export const SKELETON_CROUCH_MS = 900;
/** 回り込み(弧)の尺(シビア反映: 900→700ms)。 */
export const SKELETON_ARC_MS = 700;
/** 弧の深さ(0=直線・1=大回り。直線に近づけられる下限=0.35)。§16-8「変えない」対象。 */
export const SKELETON_ARC_DEPTH = 0.55;
export const SKELETON_ARC_DEPTH_MIN = 0.35;
/**
 * ★噛み後の硬直(社長裁定「その代わりディレイ」・プレイヤーの取り分)。
 * ★「できるだけシビアに」でも変えない(社長指示「噛み後の硬直500ms=★変えない」)。
 */
export const SKELETON_RECOVER_MS = 500;
/** 距離の取り方(発火距離まで1.5倍速で後退・§16-8「変えない」対象)。 */
export const SKELETON_RETREAT_SPEED_MULT = 1.5;

/**
 * ★枠の申告(skeleton版)。「取る=技の間合い(100px)に達した瞬間」(§16-2)。approach中
 * (aiPhase未設定)だけが対象。CD中は外す(呼び手の仕事・§16-7b)。
 */
export const skeletonWantsChaffSlot = (
  enemy: Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'chaffMoveCdUntil' | 'x' | 'y' | 'width' | 'height'>,
  gameTime: number, pcx: number, pcy: number,
): boolean => {
  if (enemy.type !== 'skeleton') return false;
  if (enemy.aiPhase !== undefined) return false;
  if (enemy.chaffMoveCdUntil !== undefined && gameTime < enemy.chaffMoveCdUntil) return false;
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  return Math.hypot(pcx - ecx, pcy - ecy) <= SKELETON_TRIGGER_PX;
};

/**
 * ★弧の軌道(PACING_PUZZLE.md §16-2「弧を描いてプレイヤーの横へ」「直線にしない」)。
 * 開始点(しゃがんでいた位置)→終点(プレイヤー中心から`SKELETON_TRIGGER_PX`の横。回り込んでも
 * 間合いは変えない=整合監査A-7)を、2次ベジェで**外側へ膨らませて**結ぶ(直線だと人狼の突進の
 * 画になる=§16-2)。`side`=true/falseでどちら側へ回り込むか(「いま向いている側」で決める・
 * クリエイティブ監査#16。添字は使わない)。`u`は0..1の進捗(呼び手がease済みの値を渡す=
 * ここは幾何だけを担う純関数)。
 */
export const skeletonArcPoint = (
  startX: number, startY: number, pcx: number, pcy: number, side: boolean, u: number,
): { x: number; y: number } => {
  const toStartX = startX - pcx, toStartY = startY - pcy;
  const distStart = Math.max(0.001, Math.hypot(toStartX, toStartY));
  const rx = toStartX / distStart, ry = toStartY / distStart; // プレイヤー→開始点の単位ベクトル(放射)
  const sign = side ? 1 : -1;
  const tx = -ry * sign, ty = rx * sign; // 接線(横)方向
  const endX = pcx + tx * SKELETON_TRIGGER_PX, endY = pcy + ty * SKELETON_TRIGGER_PX;
  const midX = (startX + endX) / 2, midY = (startY + endY) / 2;
  const outX = midX - pcx, outY = midY - pcy; // プレイヤー→中点=外向き
  const outLen = Math.max(0.001, Math.hypot(outX, outY));
  const bulge = SKELETON_TRIGGER_PX * SKELETON_ARC_DEPTH;
  const ctrlX = midX + (outX / outLen) * bulge, ctrlY = midY + (outY / outLen) * bulge;
  const uu = Math.max(0, Math.min(1, u));
  const omu = 1 - uu;
  return {
    x: omu * omu * startX + 2 * omu * uu * ctrlX + uu * uu * endX,
    y: omu * omu * startY + 2 * omu * uu * ctrlY + uu * uu * endY,
  };
};

// =================================================================================================
// プレイヤーの拘束(bat の掴み。§16-1・社長裁定2026-09-16)。
// =================================================================================================

/**
 * ★対人体勢の`isPvpIncapacitated`と**同じ形**(CLAUDE.md「実装は対人体勢で動けないと同じ形で書く」)。
 * 移動(movePlayer)・射撃(useGameLoopのpvpLocked相当)・近接(beginMeleeSwing)の3ゲートが
 * これを見る。時間切れで自動失効=専用の解除経路を作らない。
 */
export const isPlayerGrabbed = (
  player: Pick<Player, 'grabbedUntil'>, gameTime: number,
): boolean => player.grabbedUntil !== undefined && gameTime < player.grabbedUntil;


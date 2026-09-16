// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」・v4=平坦化版2026-09-16)の**共通部**。
// §16-8b の実装順 1〜4(名前と型 / enemyBite.ts の土台 / combatTick.ts / gameStore.ts の共通部)の
// うち、bat/skeleton/ゾンビの個別の状態機械(§16-8b 5〜7)に**依存しない**土台だけをここへ置く
// (§16-8「新しい定数は1ファイル(例 src/utils/chaffMoves.ts)にまとめ」)。
//
// ★§16-8b手順5(ゾンビの状態機械=gameStore.ts)でこのファイルの `deriveChaffMoveGrants` /
// `endChaffMove` を初めて呼ぶようになった。bat/skeleton(手順6〜7)はまだ未実装で、
// `CHAFF_MOVE_TYPES` には残っているが `wantsSlot` 側(下・ゾンビ専用)が型で弾くので
// 挙動には出ない。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy, EnemyType } from '../types/game';
import { biteSpecFor } from './enemyBite';

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
 * ★凍結dtの繰り下げ(PACING_PUZZLE.md §16-7 穴4・実装者視点監査A-3)。
 *
 * `updateEnemies` には AI 本体を丸ごと飛ばす早期return が2本ある(ノックバック/`hitStunUntil`)。
 * その間も store の `gameTime` は進み続けるので、`biteAt` 基準で進捗を出す
 * `biteLungeFrac`(gameStore.ts)は「凍結中に本当は進んでいたはずの分」を**取り戻せないまま
 * 失う**(=距離が消える。bat の掴みは円100px−必要68pxの余白がわずか2pxしか無いので、
 * 殴られながら掴む bat は原理的にほぼ必ず空振る)。
 *
 * 直し方は社長裁定①と同じ作法(`kbOnlyStop` と同型)=**時計を止めて続きから**。この1フレーム
 * ぶん凍結していた(`dtMs`)なら、`biteAt`/`chaffMoveAt`/`aiPhaseUntil`/`chaffMoveCdUntil` を
 * まとめて `dtMs` だけ繰り下げる。
 *
 * ★§12の噛みつき(`chaffMove` が undefined)は1bitも変えない(§16の「ではない」条件=
 * 触るのは§16-8に明記した2値のみ)。§16の技(`chaffMove` が定義されている個体)だけに効く。
 */
export const deferFrozenClocksBy = (enemy: Enemy, dtMs: number): Enemy => {
  if (dtMs <= 0 || enemy.chaffMove === undefined) return enemy;
  const patch: Partial<Enemy> = {};
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) patch.biteAt = enemy.biteAt + dtMs;
  if (enemy.chaffMoveAt !== undefined) patch.chaffMoveAt = enemy.chaffMoveAt + dtMs;
  if (enemy.aiPhaseUntil !== undefined) patch.aiPhaseUntil = enemy.aiPhaseUntil + dtMs;
  if (enemy.chaffMoveCdUntil !== undefined) patch.chaffMoveCdUntil = enemy.chaffMoveCdUntil + dtMs;
  return Object.keys(patch).length > 0 ? { ...enemy, ...patch } : enemy;
};

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
const idRespawnUnitHash = (id: string, spawnedAt: number | undefined, salt: number): number =>
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
/** 赤の停止(その場・色なし)。 */
export const ZOMBIE_RED_PAUSE_MS = 2000;
/** 踏み込みの終端=1発目が届く上限(§16-3「射程75pxの根拠」)。 */
export const ZOMBIE_LUNGE_RANGE_PX = 75;
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
 * 技後CD(4000ms)は**この硬直が明けてから**数える(endChaffMoveをz-recoverの終わりで呼ぶ)。
 */
export const ZOMBIE_RECOVER_MS = 600;

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
 * 旧実装(v0.25.4409)は相ごとに強さを返す=踏み込みから決着まで平坦に赤く光り続け、
 * 踏み込みは最長1.9秒あるため「1.5秒以上の赤い照明」になっていた(クリエイティブ監査#12)。
 * **社長指示はこれを根本から置き換える**——強さや尺の調整ではない。
 *
 * ★いつ: `z-lunge-in` に入った瞬間(`chaffMoveAt`)だけ。 ★何回: 2回の点滅
 * (点灯→消灯→点灯→消灯)。 ★その後: 技の終わりまで(踏み込みの残り・噛み1・よろけ・噛み2・硬直)
 * 赤は一切出ない=このフェーズ以外は常に0を返す。
 */
export const ZOMBIE_RED_BLINK_ON_MS = 70;
export const ZOMBIE_RED_BLINK_OFF_MS = 70;
export const ZOMBIE_RED_BLINK_COUNT = 2;

export const zombieRedGlowStrength = (
  enemy: Pick<Enemy, 'type' | 'chaffMove' | 'aiPhase' | 'chaffMoveAt'>,
  gameTime: number,
): number => {
  if (enemy.type !== 'zombie' || enemy.chaffMove === undefined) return 0;
  if (enemy.aiPhase !== 'z-lunge-in') return 0; // 走り始め以外は色なし(合図の句読点はここだけ)
  const startedAt = enemy.chaffMoveAt;
  if (startedAt === undefined) return 0;
  const elapsed = gameTime - startedAt;
  const cycleMs = ZOMBIE_RED_BLINK_ON_MS + ZOMBIE_RED_BLINK_OFF_MS;
  const totalMs = cycleMs * ZOMBIE_RED_BLINK_COUNT;
  if (elapsed < 0 || elapsed >= totalMs) return 0;
  return (elapsed % cycleMs) < ZOMBIE_RED_BLINK_ON_MS ? 1 : 0;
};

/**
 * ★①停止の長さ±30%(社長裁定2026-09-16「3段を比例で伸縮させる」)。
 *
 * `ZOMBIE_RED_PAUSE_MS`(2000ms)は**基準値として残す**(1箇所で動かせること)。実際に個体が
 * 使う全長は `ZOMBIE_RED_PAUSE_MS × (0.7〜1.3)`(id+spawnedAt由来・決定的)。
 * ★3段の比(止まる:起こす:詰めの溜め = 25%:45%:30%、元の 500:900:600 と同じ比)は
 * **全長によらず一定**(`ZOMBIE_RP_STUMBLE_FRAC`等)——一部だけ固定にすると、短い個体で
 * 「溜め」だけが相対的に長くなり形が変わってしまうため、pixiScene側の姿勢はこの比率を
 * 「全長に対する割合」で読む(絶対msで段の境目を書かない)。
 */
export const ZOMBIE_RED_PAUSE_JITTER = 0.3;
export const zombieRedPauseMs = (id: string, spawnedAt?: number): number =>
  ZOMBIE_RED_PAUSE_MS * (1 + (idRespawnUnitHash(id, spawnedAt, 0x5ed9) * 2 - 1) * ZOMBIE_RED_PAUSE_JITTER);

/** 停止2000ms(基準)の3段の比率(§16-3z「止まる500→起こす900→詰めの溜め600」と同じ比)。 */
export const ZOMBIE_RP_STUMBLE_FRAC = 500 / ZOMBIE_RED_PAUSE_MS;
export const ZOMBIE_RP_RISE_FRAC = 900 / ZOMBIE_RED_PAUSE_MS;
export const ZOMBIE_RP_TREMBLE_FRAC = 600 / ZOMBIE_RED_PAUSE_MS;

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

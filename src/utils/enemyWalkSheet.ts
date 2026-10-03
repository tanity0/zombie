// ★敵の歩きモーション(社長支給2026-09-20「バット女の歩きモーション」)。
//
// ★何を決める葉か: **どのコマを出すか**だけ。判定・速度・AI・当たり判定は1msも触らない
// (CLAUDE.md「Visual vs. hitbox」)。アスペクト(=`enemyHitStrip` の元)も**登録しない**——
// 登録すると歩きシートの縦横比で当たり判定が動く(立ち絵 356×512 と歩き 180×260 は比が僅かに違う)。
//
// ★先例に揃える: プレイヤーの `playerWalkFrame`(pixiScene)と同じ形
//   「歩いていなければ0コマ目 / 歩いていれば周期で送る」。新しい作法を発明しない。
//
// ★1つだけ足したもの=**個体ごとの位相ずらし**。同じ型が並んだ時に全員が同じ足を出すと
//   行進に見える(CLAUDE.md「均質は"AIっぽさ"の筆頭」)。`keepSpin`/`spriteVariantIndex` と
//   同じく**IDから決まる固定値**なので、同じ個体は生涯ずっと同じ位相で歩く(ちらつかない)。
import { spriteVariantIndex } from './enemyVariant';
export { ENEMY_WALK_SHEETS, walkSheetName, walkSheetFrames } from './enemySheets';
import { walkPlayback, type SheetPlayback } from './enemySheets';


/**
 * ★★**位相は「時計」ではなく「進んだ距離」で刻む**(クリエイティブ監査2026-09-20 #3の是正)。
 *
 * 旧実装は `now % 720ms` の固定周期だった。実測すると**足が3〜5割滑っていた**——
 * このシートの1周期の歩幅は**身長の0.46倍**(接地点が半周期で原盤520px中120px進む)なので、
 * 画面上の身長60〜90pxなら1周期28〜41px。720ms固定だと絵が示す速度は38〜58px/s だが、
 * バットの素の速度は**75px/s**。しかも:
 *  - **氷鈍化**(`iceSlowUntil`)で体が這っても脚は全速のまま
 *  - **2倍速の踏み込み**でも歩調が同じ
 *  - 世界のスローでも脚だけ等速(実時計 `Date.now()` を割っていたため)
 * ⇒ **距離で刻めば、速度も氷もスローも突進も全部が自動で正しくなる**(掛ける倍率が1つも要らない)。
 * 隣の歩行二次モーションが `iceTempoMul`/`zombieTempoMul` で同じ問題を**個別に**潰しているのに対し、
 * こちらは**そもそも倍率が要らない形**にする。
 *
 * 1周期で進む距離 ÷ 見た目の身長。★シートの実測値(接地点が半周期で身長の0.23倍=1周期0.46倍)。
 */
export const ENEMY_WALK_STRIDE_PER_HEIGHT = 0.46;

/** 歩いていると見なす実効速度(px/s)。プレイヤーの幻影(GP_WALK_MIN_SPEED)と同じ考え方。 */
export const ENEMY_WALK_MIN_SPEED = 6;

/** 個体ごとの位相ずらし(0..1)。IDから決まる固定値=同じ個体は生涯同じ位相。 */
export const enemyWalkPhase = (id: string, frames: number): number =>
  frames > 1 ? spriteVariantIndex(`w:${id}`, frames) / frames : 0;

/**
 * ★**歩いてはいけない状態**(クリエイティブ監査2026-09-20 #1の是正)。
 *
 * 実測で確かめた出荷バグ: `vx/vy` は**死体になっても消えない**(撃破直後のバットで
 * vx=-7.4 / vy=-99.7 =速さ100が残っていた)。速度だけを見ていると
 * **KILLで吹き飛ぶ死体が、滑っている間ずっと歩く**。ノックバックも同じで、
 * **後ろへ飛ばされながら脚は前へ歩く**。
 * ⇒ **「自分の足で進んでいる」時だけ歩かせる。** 押されている/倒れている時は歩かない。
 */
export interface EnemyWalkGate {
  corpse?: boolean;
  dormant?: boolean;
  /** gameTime 系の凍結(気絶・拘束)。 */
  stunned?: boolean;
  /** Date.now 系(ノックバック・持ち上げ)。★2つの時計を混ぜないため、呼び手が真偽で渡す。 */
  pushedOrLifted?: boolean;
}

export const canWalkAnimate = (g: EnemyWalkGate): boolean =>
  !g.corpse && !g.dormant && !g.stunned && !g.pushedOrLifted;

/**
 * 出すコマ。**歩いていなければ null**(=呼び手は従来どおり立ち絵を出す)。
 * @param distPx   その個体が**自分の足で進んだ通算距離**(px)。呼び手が積む。
 * @param heightPx 見た目の身長(px)。歩幅はこれに比例する(絵の大きさが変わっても滑らない)。
 */
export const enemyWalkFrame = (
  id: string, frames: number, distPx: number, heightPx: number, gate: EnemyWalkGate,
  playback: SheetPlayback = 'loop', strideMul = 1,
): number | null => {
  if (frames <= 1 || !canWalkAnimate(gate)) return null;
  // ★歩幅は「絵の高さ × 0.46 × 個体の倍率」。倍率の既定は1で、**自転車だけ**が別の値を持つ
  //   (`ENEMY_WALK_STRIDE_MUL` / 突進中は `ENEMY_WALK_DASH_GEAR`=ギアを上げる)。理由は表のコメント。
  const stride = Math.max(1, heightPx * ENEMY_WALK_STRIDE_PER_HEIGHT * (strideMul > 0 ? strideMul : 1));
  // ★ピンポンは**1往復で1歩幅**(行き帰りで同じ絵を2度使うので、片道の歩幅は半分)。
  // ここを揃えないと、折り返す個体だけ足が倍の速さで動く。
  const steps = playback === 'pingpong' ? (frames - 1) * 2 : frames;
  const t = (distPx / stride + enemyWalkPhase(id, frames)) % 1;
  const k = Math.floor(((t % 1) + 1) % 1 * steps);
  const i = playback === 'pingpong' && k >= frames ? steps - k : k;
  return Math.min(frames - 1, Math.max(0, i));
};

/** その立ち絵の送り方を引く窓口(描画側が表を手写ししないため)。 */
export const enemyWalkPlaybackFor = (idleTexName: string | null | undefined): SheetPlayback =>
  walkPlayback(idleTexName);

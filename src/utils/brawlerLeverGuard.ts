// ★格闘のレバーガード(research/BRAWLER.md §12-1c・社長指示2026-11-10)。純関数だけ(store・描画を読まない)。
//  社長の言葉: 「格闘 は、攻撃の方向と逆にレバー入れてる状態で攻撃を食らうと、ガードになる。(ダメージ半減、浮かない、少しノックバック)」
//  - 成立: 食らった瞬間に、レバー(スティック・移動キー・パッドの左スティック)が攻撃してきた相手から離れる向き(左右60°まで)に入っている。
//    相手の位置(弾の向き・爆心)が分からない被弾・持続ダメージ・自分が動作の最中(通常攻撃・技・ステップ・秘奥義)は成立しない。
//  - 効果: ダメージ半減(切り上げ・最低1)/浮かない/元の大きな押しを、相手から離れる向きの小さい押し(加速→減速)に置き換える。
//  - 解決の順: ①今あるカウンター(赤の予告へのカウンターの窓・構え・打ち返し)→ ②レバーガード → ③普通の被弾。①は呼び手と damagePlayer の入口が先に決める。
//  拳鬼(格闘の幻影)も同じ関数を使う(research/BRAWLER_PHANTOM.md §16-10。拳鬼の「レバー」=その tick に頭脳が決めた歩く向き)。

/**
 * ★向きの符号。true=攻撃してきた相手から離れる向きにレバーが入っているとガード(格闘ゲームの後ろ入れガード)。
 * false にすると「相手へ向かう向き」に入れ替わる(社長確認2026-11-10 で「相手から離れる向き」に確定。入れ替えの口は残す)。
 */
export const BRAWLER_LEVER_GUARD_AWAY = true;
/** 向きの許し幅(レバーの向きと、ガードの向きのなす角の余弦の下限)。0.5=左右60°まで(叩き台)。 */
export const BRAWLER_LEVER_GUARD_COS = 0.5;
/** ガードした時のダメージの倍率(切り上げ・最低1)。 */
export const BRAWLER_LEVER_GUARD_DAMAGE_MULT = 0.5;
/** ガードで押される距離(px)と長さ(ms)。加速→減速の1山(格闘のステップと同じ形)。相手から離れる向き。 */
export const BRAWLER_LEVER_GUARD_PUSH_PX = 40;
export const BRAWLER_LEVER_GUARD_PUSH_MS = 160;
/** 相手の位置が自分と重なっている(向きが取れない)とみなす距離(px)。構えで押される向き(brawlerGuard)と同じ値。 */
export const BRAWLER_LEVER_GUARD_MIN_DIST = 8;
/** 腕で受ける影(構えの腕ガードの影を短く)を出している長さ(ms・ゲーム内の時間)。 */
export const BRAWLER_LEVER_GUARD_STAND_MS = 260;
/** ガードした時の画面の揺れの倍率(普通の被弾の揺れに掛ける。受け止めた=軽い)。 */
export const BRAWLER_LEVER_GUARD_SHAKE_MULT = 0.5;

/**
 * 演出つきの技の被弾の技キー(damagePlayer の damageSourceMove)。ガードが成立しても半減だけ掛け、押し・怯み・演出は今どおり(§12-1c)。
 * 掴み・覆いかぶさりは技キーを持たないので、呼び手が damagePlayer へ leverGuard:'damageOnly' を渡す(combatTick)。
 */
export const LEVER_GUARD_DAMAGE_ONLY_MOVES: ReadonlySet<string> = new Set(['brawler-secret']); // 拳鬼の秘奥義(ワープの9連撃と締め)
export const leverGuardDamageOnlyMove = (moveKey: string | undefined): boolean => moveKey !== undefined && LEVER_GUARD_DAMAGE_ONLY_MOVES.has(moveKey);

export interface Vec2 { x: number; y: number }
type Keys = { up?: boolean; down?: boolean; left?: boolean; right?: boolean };

const unitOf = (x: number, y: number): Vec2 | null => {
  const l = Math.hypot(x, y);
  return l > 1e-6 && Number.isFinite(l) ? { x: x / l, y: y / l } : null;
};

/**
 * いまのレバーの向き(長さ1)。入っていなければ null。
 * store が持っている移動の入力そのまま: スティック(タッチ・パッドの左スティック=swipeDirection)が入っていればそれ、無ければ移動キー。
 * (移動の式 movePlayer と同じ優先順。上下・左右を同時に押して打ち消し合った時は「入っていない」。)
 */
export const moveLeverDir = (swipe: Vec2 | null | undefined, keys: Keys | null | undefined): Vec2 | null => {
  if (swipe) return unitOf(swipe.x, swipe.y);
  if (!keys) return null;
  return unitOf((keys.right ? 1 : 0) - (keys.left ? 1 : 0), (keys.down ? 1 : 0) - (keys.up ? 1 : 0));
};

/**
 * 攻撃が進む向き(長さ1)=「攻撃してきた相手 → 自分」。分からなければ null(=ガードは成立しない)。
 *  1) travel: 弾が飛んできた向き(弾の速度)。弾は撃ち主が動いた後も「飛んできた向き」で見る。
 *  2) center: 爆発・範囲技の中心(爆心・帯の根元)。そこから離れる向き。
 *  3) body: 体で殴ってきた個体の中心(体当たり・噛みつき・近接の技=個体が名指しされた被弾)と、光線の撃ち主。
 *     (光線の「被弾の点」は光の軸の上の一番近い点=そこから離れると真横になる。撃ち主から離れる向きで見る。)
 *  4) hit: 被弾の点(damagePlayer の fromX/fromY。手榴弾・罠・置かれた火など、持ち主から離れた物の中心)。
 *  5) enemy: 攻撃の持ち主(記録用の個体・型だけなら一番近い同じ型)。上のどれも取れない時の最後の手がかり。
 * どれも自分との距離が BRAWLER_LEVER_GUARD_MIN_DIST 未満(真上・重なり)なら向きが取れない=次の候補へ。
 */
export const leverGuardAttackDir = (
  pc: Vec2, o: { travel?: Vec2 | null; center?: Vec2 | null; body?: Vec2 | null; hit?: Vec2 | null; enemy?: Vec2 | null },
): Vec2 | null => {
  if (o.travel) {
    const u = unitOf(o.travel.x, o.travel.y);
    if (u) return u;
  }
  for (const q of [o.center, o.body, o.hit, o.enemy]) {
    if (!q) continue;
    const dx = pc.x - q.x, dy = pc.y - q.y;
    if (Math.hypot(dx, dy) >= BRAWLER_LEVER_GUARD_MIN_DIST) return unitOf(dx, dy);
  }
  return null;
};

/** レバーの向きはガードの向きか(攻撃の進む向き=相手から離れる向きに対して左右60°まで)。away=false なら相手へ向かう向き。 */
export const leverGuardDirOk = (lever: Vec2 | null, attackDir: Vec2 | null, away: boolean = BRAWLER_LEVER_GUARD_AWAY): boolean => {
  if (!lever || !attackDir) return false;
  const l = unitOf(lever.x, lever.y), a = unitOf(attackDir.x, attackDir.y);
  if (!l || !a) return false;
  const dot = l.x * a.x + l.y * a.y;
  return (away ? dot : -dot) >= BRAWLER_LEVER_GUARD_COS - 1e-9;
};

export interface LeverGuardInput {
  /** 格闘を持っている(格闘の出番=刀へ持ち替えていない)。 */
  has: boolean;
  /** その被弾の、ガードする前のダメージ。0以下(無敵・無効)ではガードも無い。 */
  amount: number;
  /** 持続ダメージ(延焼・毒)。対象外。 */
  dot?: boolean;
  /** 自分が動ける状態(待機か歩いている時)。動作の最中(通常攻撃・技・ステップ・秘奥義)・怯み・掴まれ・吹き飛びの最中は false。 */
  free: boolean;
  /** 構え(カウンター)の最中。構えが優先=レバーガードにはしない。 */
  stance?: boolean;
  lever: Vec2 | null;
  attackDir: Vec2 | null;
  away?: boolean;
}
/** レバーガードが成立するか。 */
export const brawlerLeverGuardHolds = (o: LeverGuardInput): boolean =>
  o.has && o.amount > 0 && !o.dot && o.free && !o.stance && leverGuardDirOk(o.lever, o.attackDir, o.away ?? BRAWLER_LEVER_GUARD_AWAY);

/** ガードした後のダメージ(半減・切り上げ・最低1)。0以下はそのまま(ガードで増やさない)。 */
export const brawlerLeverGuardDamage = (amount: number, mult: number = BRAWLER_LEVER_GUARD_DAMAGE_MULT): number =>
  amount > 0 ? Math.max(1, Math.ceil(amount * mult - 1e-9)) : amount;

/**
 * 腕で受ける影(構えの腕ガードの影を短く)の濃さ 0..1。el=ガードしてからの経過(ms・ゲーム内の時間)。
 * 出だしは速く立ち上がり(受けた瞬間に在る)、後半でゆっくり引く(慣性)。尺の外は 0。
 */
export const leverGuardStandAlpha = (el: number, ms: number = BRAWLER_LEVER_GUARD_STAND_MS): number => {
  if (!(el >= 0) || el >= ms) return 0;
  const p = el / ms;
  const rise = Math.min(1, el / 40);
  const fall = p < 0.35 ? 1 : 1 - ((p - 0.35) / 0.65) ** 2;
  return 0.85 * rise * fall;
};

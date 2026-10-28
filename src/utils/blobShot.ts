// research/NEW_GUNS.md §2(第4版): 塊弾(glauncher-t2-blob)。
// 大きな塊(半径26)を狙った方へゆっくり(秒速110)撃つ。塊は敵を押しのけながら進み、
// 壁・木・岩・ボス・強個体(押せない敵)に当たったらそこで止まり、残りの時間はその場で当たり続ける。
// 寿命4秒・最後の0.4秒は縮みながら薄れて消える(この間はダメージ無し)。
// 触れている敵に200msごとに10(銃の扱い 'gun'・銃のスキル倍率が乗る・会心なし。品質監査の実測で12→10)。
// ダメージの数字は同じ敵には600msごとにまとめて出す。
//
// このモジュールは**純関数と定数だけ**(storeを読まない)。押しのけ先を行ける帯へ収める
// (clampRectToPlayableArea)・壁の判定・ダメージの適用は呼び手(utils/newGunsTick.ts)の責務。

export const BLOB_WEAPON_KEY = 'glauncher-t2-blob';
export const BLOB_RADIUS_PX = 26;
export const BLOB_SPEED_PX_PER_SEC = 110;
export const BLOB_LIFE_MS = 4000;
export const BLOB_FADE_MS = 400;
export const BLOB_TICK_MS = 200;
// 品質監査(撃ち出し位置18px前・半径26・敵の半幅を入れた実測)で12だと標準比+30〜47%。10で距離120が約+8%。
// 2巡目: 10だと距離110〜120・30fpsで当たる回数が1回増えると+15%になるため 9.5(全条件で+10%以内)。
// 小数のまま HP へ当てる(丸めない)。数字は accumulateBlobNumber が整数にまとめて出す。
export const BLOB_TICK_DAMAGE = 9.5;
export const BLOB_NUMBER_BATCH_MS = 600;
export const BLOB_COOLDOWN_MS = 1700;
export const BLOB_MAG_SIZE = 3;
export const BLOB_RELOAD_MS_RAW = 2000; // CATALOGへ書く生値(全銃共通の×2で実効4000ms)
/** 場に置ける塊の上限(プールの上限。周期1.7秒×寿命4秒なら同時3個が最大=これを超えることは無い)。 */
export const BLOB_MAX_ALIVE = 4;
// 撃ち出しの慣性: 出た瞬間は秒速110の1.6倍で、120msの時定数で110へ落ち着く(パッと出て等速、を作らない)。
// 足される距離は 110×0.6×0.12 ≒ 8px だけ=「届くまでの時間」の検算(§2)はほぼ変わらない。
export const BLOB_LAUNCH_KICK = 0.6;
export const BLOB_LAUNCH_TAU_MS = 120;
/** 撃ち出す位置(プレイヤー中心から前へ)。 */
export const BLOB_MUZZLE_PX = 18;
/** 当たっている間に進める距離(px)=消え始めるまでの道のり。これを射程の上限にする(ズーム補正しない)。 */
export const blobReachPx = (): number => {
  const t = (BLOB_LIFE_MS - BLOB_FADE_MS) / 1000;
  return BLOB_SPEED_PX_PER_SEC * (t + BLOB_LAUNCH_KICK * (BLOB_LAUNCH_TAU_MS / 1000) * (1 - Math.exp(-t * 1000 / BLOB_LAUNCH_TAU_MS)));
};

// 塊弾の弾の絵(10コマ・1コマ70×66)。1〜7コマ=撃ち出し(彗星→渦へ育つ)を順に1回、8〜10コマ=ループ。
// 1ドット=世界1px で、ループのコマの中身(約62px)が当たり(直径52)より少し外へはみ出す=渦の芯と輪が当たりの大きさ。
export const BLOB_SHEET_FRAMES = 10;
export const BLOB_INTRO_FRAMES = 7;
export const BLOB_INTRO_FRAME_MS = 45;
export const BLOB_LOOP_FRAME_MS = 90;
/** 塊弾の弾のコマ(年齢 ms から)。撃ち出しの7コマを1回→残り3コマをループ。 */
export const blobSheetFrame = (ageMs: number): number => {
  const a = Math.max(0, ageMs);
  const intro = BLOB_INTRO_FRAMES * BLOB_INTRO_FRAME_MS;
  if (a < intro) return Math.floor(a / BLOB_INTRO_FRAME_MS);
  return BLOB_INTRO_FRAMES + (Math.floor((a - intro) / BLOB_LOOP_FRAME_MS) % (BLOB_SHEET_FRAMES - BLOB_INTRO_FRAMES));
};

export interface BlobShot {
  id: string;
  /** 塊の中心(世界px)。 */
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  /** 撃った gameTime。 */
  bornAt: number;
  /** 止まった gameTime(壁/押せない敵)。未定義=進んでいる。 */
  stoppedAt?: number;
  /** 次のダメージの gameTime。 */
  nextTickAt: number;
  /** 1回のダメージ(撃った時に確定した銃のスキル倍率込み・出す側の倍率は適用時)。 */
  tickDamage: number;
}

export interface BlobRect { x: number; y: number; width: number; height: number }

/** 円(中心cx,cy・半径r)と矩形が重なるか。 */
export const circleOverlapsRect = (cx: number, cy: number, r: number, e: BlobRect): boolean => {
  const qx = Math.max(e.x, Math.min(cx, e.x + e.width));
  const qy = Math.max(e.y, Math.min(cy, e.y + e.height));
  const dx = cx - qx, dy = cy - qy;
  return dx * dx + dy * dy < r * r;
};

/**
 * 円から矩形を押し出す量(押しのけ)。重なっていなければ null。
 * 円の中心が矩形の中に入っている時は、中心どうしの向き(重なりきって向きが無ければ進む向き)へ押す。
 */
export const blobPushOut = (
  cx: number, cy: number, r: number, e: BlobRect, fallbackDirX: number, fallbackDirY: number,
): { dx: number; dy: number } | null => {
  const qx = Math.max(e.x, Math.min(cx, e.x + e.width));
  const qy = Math.max(e.y, Math.min(cy, e.y + e.height));
  const vx = qx - cx, vy = qy - cy;
  const d = Math.hypot(vx, vy);
  if (d >= r) return null;
  if (d > 1e-6) {
    const pen = r - d;
    return { dx: (vx / d) * pen, dy: (vy / d) * pen };
  }
  // 中心が矩形の中: 矩形の中心から離れる向きへ、矩形の半幅ぶん+半径だけ押す。
  let nx = e.x + e.width / 2 - cx, ny = e.y + e.height / 2 - cy;
  let nl = Math.hypot(nx, ny);
  if (nl < 1e-6) { nx = fallbackDirX; ny = fallbackDirY; nl = Math.hypot(nx, ny) || 1; }
  nx /= nl; ny /= nl;
  const half = Math.abs(nx) * e.width / 2 + Math.abs(ny) * e.height / 2;
  return { dx: nx * (r + half), dy: ny * (r + half) };
};

/** 経過時間(ms)での速さ(撃ち出しの慣性込み)。 */
export const blobSpeedAt = (ageMs: number): number =>
  BLOB_SPEED_PX_PER_SEC * (1 + BLOB_LAUNCH_KICK * Math.exp(-Math.max(0, ageMs) / BLOB_LAUNCH_TAU_MS));

/** 消えかけ(最後の0.4秒)か。この間はダメージ無し。 */
export const isBlobFading = (b: Pick<BlobShot, 'bornAt'>, gameTime: number): boolean =>
  gameTime - b.bornAt >= BLOB_LIFE_MS - BLOB_FADE_MS;

/** 寿命が尽きたか。 */
export const isBlobExpired = (b: Pick<BlobShot, 'bornAt'>, gameTime: number): boolean =>
  gameTime - b.bornAt >= BLOB_LIFE_MS;

/** 描画の大きさ(0..1)。出る時は減速しながら膨らみ、消える時は加速しながら縮む(慣性)。 */
export const blobVisualScale = (b: Pick<BlobShot, 'bornAt'>, gameTime: number): number => {
  const age = gameTime - b.bornAt;
  const grow = Math.max(0, Math.min(1, age / 180));
  const growE = 1 - Math.pow(1 - grow, 3);
  const fade = Math.max(0, Math.min(1, (age - (BLOB_LIFE_MS - BLOB_FADE_MS)) / BLOB_FADE_MS));
  const fadeE = fade * fade;
  return (0.35 + 0.65 * growE) * (1 - fadeE);
};

/** 当たりの半径(絵の大きさと同じ=blobVisualScale)。 */
export const blobHitRadius = (b: Pick<BlobShot, 'bornAt'>, gameTime: number): number => BLOB_RADIUS_PX * blobVisualScale(b, gameTime);
/** 「触れている」の余白(押し出した直後・接して止まった直後は重なり0)。 */
export const BLOB_TOUCH_SLACK_PX = 2;

export interface BlobStepEnemy extends BlobRect { id: string }

export interface BlobStepResult {
  blob: BlobShot;
  /** 押しのけ(呼び手が行ける帯へ収めてから敵の位置へ足す)。 */
  pushes: { id: string; dx: number; dy: number }[];
  /** この step でダメージを受ける敵(200msごと)。 */
  hitIds: string[];
  /** この step で止まった。 */
  stoppedNow: boolean;
}

/**
 * 塊を1 step 進める(純関数)。
 * @param isBlocked 塊の外接矩形が壁/木/岩/建物に食い込むか(呼び手の壁の定義をそのまま使う)
 * @param isPushable 押しのけられる敵か(区分のノックバック耐性。false=ボス・強個体=当たったら止まる)
 */
export const stepBlobShot = (
  blob: BlobShot, dtSec: number, gameTime: number, enemies: readonly BlobStepEnemy[],
  isBlocked: (r: BlobRect) => boolean, isPushable: (e: BlobStepEnemy) => boolean,
): BlobStepResult => {
  let b = blob;
  let stoppedNow = false;
  const pushes: { id: string; dx: number; dy: number }[] = [];
  // ★当たりの大きさ=絵の大きさ(出る180ms・消える0.4秒の膨らみ/縮みと揃える)。消える間は押しのけ・止まる判定もしない。
  const R = blobHitRadius(b, gameTime);
  const fading = isBlobFading(b, gameTime);
  if (b.stoppedAt === undefined) {
    const speed = blobSpeedAt(gameTime - b.bornAt);
    const nx = b.x + b.dirX * speed * dtSec;
    const ny = b.y + b.dirY * speed * dtSec;
    const collides = (x: number, y: number): boolean =>
      isBlocked({ x: x - R, y: y - R, width: R * 2, height: R * 2 })
      || enemies.some(e => !isPushable(e) && circleOverlapsRect(x, y, R, e));
    if (!fading && collides(nx, ny)) {
      // ★接する位置まで詰めて止まる(手前で止まって当たらない、を作らない)。今の位置から次の位置までを二分探索。
      let lo = 0, hi = 1;
      if (collides(b.x, b.y)) hi = 0; // 既に食い込んでいる(膨らみ途中など)=その場で止まる
      for (let i = 0; i < 10 && hi > 0; i++) {
        const mid = (lo + hi) / 2;
        if (collides(b.x + (nx - b.x) * mid, b.y + (ny - b.y) * mid)) hi = mid; else lo = mid;
      }
      b = { ...b, x: b.x + (nx - b.x) * lo, y: b.y + (ny - b.y) * lo, stoppedAt: gameTime };
      stoppedNow = true;
    } else {
      b = { ...b, x: nx, y: ny };
    }
  }
  // 押しのけ(止まった後も、重なってきた押せる敵は外へ押し出す=塊の中に敵が埋まらない)。消える間はしない。
  if (!fading) {
    for (const e of enemies) {
      if (!isPushable(e)) continue;
      const p = blobPushOut(b.x, b.y, R, e, b.dirX, b.dirY);
      if (p) pushes.push({ id: e.id, dx: p.dx, dy: p.dy });
    }
  }
  const hitIds: string[] = [];
  if (gameTime >= b.nextTickAt) {
    if (!fading) {
      // 押し出す前の重なりで当てる(押しのけた敵=触れている敵)。触れている判定は半径+わずかな余白
      // (押し出した直後・接して止まった直後は重なり0のため)。
      for (const e of enemies) {
        if (circleOverlapsRect(b.x, b.y, R + BLOB_TOUCH_SLACK_PX, e)) hitIds.push(e.id);
      }
    }
    // 取りこぼした周期は捨てて今から数え直す(処理落ちで一度に何発も入らない)。
    const next = b.nextTickAt + BLOB_TICK_MS;
    b = { ...b, nextTickAt: next > gameTime ? next : gameTime + BLOB_TICK_MS };
  }
  return { blob: b, pushes, hitIds, stoppedNow };
};

/** 新しい塊(撃った瞬間)。最初のダメージは触れた瞬間に入る(nextTickAt=今)。 */
export const createBlobShot = (
  id: string, x: number, y: number, dirX: number, dirY: number, gameTime: number, tickDamage: number,
): BlobShot => {
  const l = Math.hypot(dirX, dirY) || 1;
  return { id, x, y, dirX: dirX / l, dirY: dirY / l, bornAt: gameTime, nextTickAt: gameTime, tickDamage };
};

/** 同じ敵への数字を600msごとにまとめる帳簿(敵id → 溜まった量と前に出した時刻)。 */
export interface BlobNumberLedgerEntry { acc: number; lastShownAt: number }
export type BlobNumberLedger = Map<string, BlobNumberLedgerEntry>;

/**
 * 量を足し、出す時刻なら出す値を返す(出さない時は null)。最初の1回は即出す(当たった手応えを遅らせない)。
 */
export const accumulateBlobNumber = (
  ledger: BlobNumberLedger, enemyId: string, amount: number, gameTime: number,
): number | null => {
  const cur = ledger.get(enemyId);
  // 表示は整数に丸め、丸めた端数は次のまとめへ持ち越す(合計は実ダメージとずれない)。
  if (!cur) {
    const shown = Math.max(1, Math.round(amount));
    ledger.set(enemyId, { acc: amount - shown, lastShownAt: gameTime });
    return shown;
  }
  cur.acc += amount;
  if (gameTime - cur.lastShownAt >= BLOB_NUMBER_BATCH_MS) {
    const shown = Math.round(cur.acc);
    if (shown < 1) return null;
    cur.acc -= shown;
    cur.lastShownAt = gameTime;
    return shown;
  }
  return null;
};

/** 帳簿の掃除(居なくなった敵・しばらく当たっていない敵の端数を捨てる)。 */
export const pruneBlobNumberLedger = (ledger: BlobNumberLedger, aliveIds: ReadonlySet<string>, gameTime: number): void => {
  for (const [id, e] of ledger) {
    if (!aliveIds.has(id) || gameTime - e.lastShownAt > BLOB_NUMBER_BATCH_MS * 4) ledger.delete(id);
  }
};

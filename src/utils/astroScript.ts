// 宇宙飛行群(変異)の純関数(research/ASTRONAUT_HORDE.md)。store も PixiJS も読まない=ヘッドレスでテストする。
// 「群」はヘルメットの中に複数体いるという設定で、場に出るのは1体(社長 2026-10-29)。

// ---- 絵(シート) ----
/** 浮遊のシート(mutant-astro-hover): 11コマ・1コマ156px。0=着地の立ち → 3〜=噴射 → 8〜10=浮遊。 */
export const ASTRO_HOVER_FRAMES = 11;
export const ASTRO_HOVER_FRAME_W = 156;
/** 投げのシート(mutant-astro-throw): 13コマ・1コマ146px。 */
export const ASTRO_THROW_FRAMES = 13;
export const ASTRO_THROW_FRAME_W = 146;
export const ASTRO_SHEET_H = 182;
/** 浮遊の1コマ(ms・叩き台)。 */
export const ASTRO_HOVER_FRAME_MS = 60;
/** 移動中にピンポンする範囲(最後の3コマ)。浮き切ったとみなすコマ(持ち上げが満ちる・投げの間合いを数え始める)。 */
export const ASTRO_HOVER_LOOP_LO = 8;
/**
 * 浮遊の往復(8〜10コマ)で体を固定する寄せ(絵のドット・[横, 縦])。シートの中でヘルメットが8コマ目から
 * 9コマ目で(+4.7, +4.4)、10コマ目で(−1.8, +7.8)ずれている(実測)ので、その分だけ絵を逆へ寄せる=
 * ヘルメットと胴は止まったまま、脚と噴射だけが動く(社長指示2026-10-29「移動中は体を固定」「動いてる時のアニメーションが止まってる」)。
 */
export const ASTRO_HOVER_ALIGN: Readonly<Record<number, readonly [number, number]>> = { 9: [-4.7, -4.4], 10: [1.8, -7.8] };
export const ASTRO_HOVER_TOP = ASTRO_HOVER_FRAMES - 1;
/** 動き出してよいコマ(浮き上がりの途中から慣性でゆっくり動き出す・§8 A4)。 */
export const ASTRO_MOVE_FRAME = 6;
/** 投げの1コマ(ms)と、手を離すコマ(社長「はい」=7コマ目)。 */
export const ASTRO_THROW_FRAME_MS = 70;
export const ASTRO_RELEASE_FRAME = 7;
export const ASTRO_RELEASE_MS = ASTRO_RELEASE_FRAME * ASTRO_THROW_FRAME_MS; // 490
export const ASTRO_THROW_ANIM_MS = ASTRO_THROW_FRAMES * ASTRO_THROW_FRAME_MS; // 910

/** 描画の持ち上げ(絵だけ・判定は地面のまま)。 */
export const ASTRO_LIFT_PX = 26; // クリエイティブ監査#11: 18では大きな体に対して浮いているのが読めない

// ---- 動き ----
/** 巡回の速さ(px/s)。 */
export const ASTRO_PATROL_SPEED = 70;
/** 交戦中の速さ=プレイヤーの素の移動速度のこの倍まで(下がっても追いつける)。 */
export const ASTRO_ENGAGE_SPEED_MULT = 0.7;
/** 慣性: 最高速まで約0.9秒・止まるまで約1.2秒・曲がりは1秒に70°まで(叩き台)。 */
export const ASTRO_ACCEL_S = 0.9;
export const ASTRO_DECEL_S = 1.2;
export const ASTRO_TURN_RAD_PER_S = (70 * Math.PI) / 180;
/** 止まり切った(着地の逆再生に入ってよい)=最高速のこの割合未満。 */
export const ASTRO_STOPPED_FRAC = 0.1;
/** 交戦中に留まる距離の帯。 */
export const ASTRO_BAND_MIN_PX = 260;
export const ASTRO_BAND_MAX_PX = 520;
/** 投げの間隔(浮き直しが終わってから)。 */
export const ASTRO_THROW_GAP_MIN_MS = 3500;
export const ASTRO_THROW_GAP_MAX_MS = 5000;
/** POI に着いてからの休み。 */
export const ASTRO_REST_MIN_MS = 2000;
export const ASTRO_REST_MAX_MS = 4000;
/** 投げていない時も定期的に降りて休む(社長指示2026-10-29「定期的に着地するようにして(アニメも)」)。浮き切ってからこの間で降り、着いてからこの間休む。 */
export const ASTRO_PERIODIC_LAND_GAP_MIN_MS = 6000;
export const ASTRO_PERIODIC_LAND_GAP_MAX_MS = 10000;
export const ASTRO_PERIODIC_LAND_REST_MIN_MS = 1500;
export const ASTRO_PERIODIC_LAND_REST_MAX_MS = 2500;

/** 定期の着地の時計。nextAt=次に降り始める時刻(null=まだ浮き切っていない)、holdUntil=降りている(-1=着くまで・それ以上=この時刻まで休む・null=飛んでいる)。 */
export interface AstroPeriodicLand { nextAt: number | null; holdUntil: number | null }

/** 定期の着地を1回分進める。frame=浮遊のコマ。返り値の land=今は降りたい(呼び手は止まってから降ろす)。 */
export const stepAstroPeriodicLand = (p: AstroPeriodicLand, gt: number, frame: number, rng: () => number): AstroPeriodicLand & { land: boolean } => {
  let { nextAt, holdUntil } = p;
  if (holdUntil !== null) {
    if (holdUntil === -1 && frame === 0) holdUntil = gt + ASTRO_PERIODIC_LAND_REST_MIN_MS + rng() * (ASTRO_PERIODIC_LAND_REST_MAX_MS - ASTRO_PERIODIC_LAND_REST_MIN_MS);
    if (holdUntil !== -1 && gt >= holdUntil) { holdUntil = null; nextAt = null; return { nextAt, holdUntil, land: false }; }
    return { nextAt, holdUntil, land: true };
  }
  if (nextAt === null) {
    if (frame >= ASTRO_HOVER_LOOP_LO) nextAt = gt + ASTRO_PERIODIC_LAND_GAP_MIN_MS + rng() * (ASTRO_PERIODIC_LAND_GAP_MAX_MS - ASTRO_PERIODIC_LAND_GAP_MIN_MS);
    return { nextAt, holdUntil, land: false };
  }
  if (gt >= nextAt) return { nextAt, holdUntil: -1, land: true };
  return { nextAt, holdUntil, land: false };
};
/** 着いた=POI の点からこの距離以内。詰まり=この時間でこの距離も近づけない。 */
export const ASTRO_ARRIVE_PX = 220;
export const ASTRO_STUCK_MS = 6000;
export const ASTRO_STUCK_PX = 40;
/** 殴られてからこの間(ms・実時間)は「見つけた」扱い(解放軍群と同じ)。 */
export const ASTRO_HIT_ALERT_MS = 600;
export const ASTRO_LOSE_MS = 3000;

// ---- 投げる物(§4・§9) ----
export type AstroThrowKind = 'missile' | 'flag' | 'debris' | 'meteor' | 'bouquet';
/** 抽選の重み(叩き台)。同じ物を2回続けない。隕石は自分の間隔あり。 */
export const ASTRO_THROW_WEIGHTS: Readonly<Record<AstroThrowKind, number>> = {
  missile: 30, flag: 25, debris: 20, bouquet: 15, meteor: 10,
};
export const ASTRO_METEOR_COOLDOWN_MS = 20000;

export const ASTRO_MISSILE_FLY_MS = 600;
export const ASTRO_MISSILE_RADIUS = 110;
export const ASTRO_MISSILE_DAMAGE = 22;

export const ASTRO_FLAG_FLY_MS = 120;
/** 国旗はプレイヤーの少し後ろまで届く(§12-3・社長指示2026-10-29)。近すぎる時も最低この長さ。 */
export const ASTRO_FLAG_BEYOND_PX = 120;
export const ASTRO_FLAG_MIN_LENGTH = 220;
export const ASTRO_FLAG_HALF_W = 18;
export const ASTRO_FLAG_DAMAGE = 26;
/** 刺さった旗が残る(判定なし)・最後に薄れる。 */
export const ASTRO_FLAG_STUCK_MS = 5000;

export const ASTRO_DEBRIS_COUNT = 8;
/** 投げ始めのプレイヤーの位置を中心にこの半径の内へ落とす(§12-2「明確にプレイヤーに当たりを付けた範囲内でランダム落下」)。1枚はプレイヤーの所そのもの。 */
export const ASTRO_DEBRIS_SPREAD_PX = 260;
export const ASTRO_DEBRIS_GAP_PX = 60;
export const ASTRO_DEBRIS_RADIUS = 46;
export const ASTRO_DEBRIS_DAMAGE = 14;
/** 1枚目は離してから300ms、以後1枚ごとに120ms(社長指示2026-10-29「予告もっと短くていい。よけるのが簡単すぎる」・旧700/150)。 */
export const ASTRO_DEBRIS_FIRST_MS = 300;
export const ASTRO_DEBRIS_STEP_MS = 120;
/** 残骸の種類(社長支給の絵=8種)。1回の投げで8枚とも違う絵になる。 */
export const ASTRO_DEBRIS_VARIANTS = 8;
/** 投げる物の絵(fx/astro-throws・66×66×12)のコマ。左からミサイル/花束/国旗/隕石/残骸8種(社長「左上から順番通り」)。 */
export const ASTRO_THROW_ART_FRAMES = 12;
export const astroThrowArtFrame = (kind: AstroThrowKind, variant = 0): number =>
  kind === 'missile' ? 0 : kind === 'bouquet' ? 1 : kind === 'flag' ? 2 : kind === 'meteor' ? 3
    : 4 + (((variant % ASTRO_DEBRIS_VARIANTS) + ASTRO_DEBRIS_VARIANTS) % ASTRO_DEBRIS_VARIANTS);
export const ASTRO_DEBRIS_LIE_MS = 2600; // 刺さった外板が残る時間(絵だけ)

export const ASTRO_METEOR_FALL_MS = 4000;
export const ASTRO_METEOR_RADIUS = 380;
export const ASTRO_METEOR_DAMAGE = 60;

export const ASTRO_BOUQUET_FLY_MS = 700;
export const ASTRO_BOUQUET_RADIUS = 60;
/** 最大体力に対する回復の割合(叩き台)。 */
export const ASTRO_BOUQUET_HEAL_FRAC = 0.05;
export const ASTRO_BOUQUET_LIE_MS = 3000;
/** 着弾の跡(絵だけ): 隕石のクレーター・ミサイルの焦げ跡が残る時間(クリエイティブ監査#24)。 */
export const ASTRO_METEOR_CRATER_MS = 6000;
export const ASTRO_MISSILE_SCORCH_MS = 3000;

/** 投げ始めからの命中時刻(ms)。 */
export const astroHitOffsetMs = (kind: AstroThrowKind, i = 0): number => {
  switch (kind) {
    case 'missile': return ASTRO_RELEASE_MS + ASTRO_MISSILE_FLY_MS;
    case 'flag': return ASTRO_RELEASE_MS + ASTRO_FLAG_FLY_MS;
    case 'debris': return ASTRO_RELEASE_MS + ASTRO_DEBRIS_FIRST_MS + ASTRO_DEBRIS_STEP_MS * i;
    case 'meteor': return ASTRO_RELEASE_MS + ASTRO_METEOR_FALL_MS;
    case 'bouquet': return ASTRO_RELEASE_MS + ASTRO_BOUQUET_FLY_MS;
  }
};

/** 台帳の1件=予告1つ+当たり1つ(残骸は8件)。投げ始めに全部積み、手を離す前に取り消されたら投げ単位で消す。 */
export interface AstroThrowEntry {
  id: string;
  throwId: string;
  ownerId: string;
  kind: AstroThrowKind;
  /** 予告が出た時刻(=投げ始め)・手を離す時刻・命中の時刻(ゲーム時間)。 */
  bornAt: number;
  releaseAt: number;
  hitAt: number;
  /** 投げた手元(地面の点)。弧・旗の飛ぶ起点。 */
  fromX: number; fromY: number;
  /** 着弾点(旗は刺さる点)。 */
  x: number; y: number;
  radius: number;
  damage: number;
  /** 国旗の帯(起点=投げ始めの投げ手の位置で固定・§8 B2)。 */
  capsule?: { fx: number; fy: number; tx: number; ty: number; halfWidth: number };
  /** 残骸の形の種類・傾き。 */
  variant?: number;
  tilt?: number;
  /** 周りに降り注ぐ残骸(§12-1)の当たり: 予告と当たりだけを持ち、絵は周りの残骸の台帳(`astroScatter`)が描く。 */
  ambient?: boolean;
  /** 命中を解決した(以後は残る絵だけ)。 */
  resolved?: boolean;
  /** 花束がプレイヤーに当たって跳ね返った。 */
  bounced?: boolean;
  /** 花束が向いた相手が守護霊だった(当たっても回復しない・跳ね返る絵だけ)。 */
  toGhost?: boolean;
}

/** 解決のあとに絵が残る時間(この後に台帳から消える)。 */
export const astroLingerMs = (kind: AstroThrowKind): number =>
  kind === 'flag' ? ASTRO_FLAG_STUCK_MS
    : kind === 'debris' ? ASTRO_DEBRIS_LIE_MS
    : kind === 'bouquet' ? ASTRO_BOUQUET_LIE_MS
    : kind === 'meteor' ? ASTRO_METEOR_CRATER_MS
    : ASTRO_MISSILE_SCORCH_MS;

/**
 * 次に投げる物を選ぶ(重み付き)。直前と同じ物は選ばない。隕石は前回から20秒は選ばない。
 * rng は 0..1。
 */
export const pickAstroThrow = (
  prev: AstroThrowKind | null, meteorReadyAt: number, now: number, rng: () => number,
): AstroThrowKind => {
  const kinds = (Object.keys(ASTRO_THROW_WEIGHTS) as AstroThrowKind[])
    .filter(k => k !== prev && !(k === 'meteor' && now < meteorReadyAt));
  const total = kinds.reduce((s, k) => s + ASTRO_THROW_WEIGHTS[k], 0);
  let r = rng() * total;
  for (const k of kinds) {
    r -= ASTRO_THROW_WEIGHTS[k];
    if (r < 0) return k;
  }
  return kinds[kinds.length - 1];
};

/**
 * 1回の投げの台帳(投げ始め=start)。狙いは target(投げ始めに固定)、起点は投げ手の中心(地面)。
 * 予告は全部 start に出て、各自の hitAt に消え切る(残骸は1枚ずつ別の時刻=多段は段ごと)。
 */
export const astroThrowPlan = (
  kind: AstroThrowKind, throwId: string, ownerId: string,
  from: { x: number; y: number }, target: { x: number; y: number }, start: number, rng: () => number,
): AstroThrowEntry[] => {
  const base = { throwId, ownerId, kind, bornAt: start, releaseAt: start + ASTRO_RELEASE_MS, fromX: from.x, fromY: from.y };
  switch (kind) {
    case 'missile':
      return [{ ...base, id: `${throwId}-0`, hitAt: start + astroHitOffsetMs('missile'), x: target.x, y: target.y, radius: ASTRO_MISSILE_RADIUS, damage: ASTRO_MISSILE_DAMAGE }];
    case 'meteor':
      return [{ ...base, id: `${throwId}-0`, hitAt: start + astroHitOffsetMs('meteor'), x: target.x, y: target.y, radius: ASTRO_METEOR_RADIUS, damage: ASTRO_METEOR_DAMAGE }];
    case 'bouquet':
      return [{ ...base, id: `${throwId}-0`, hitAt: start + astroHitOffsetMs('bouquet'), x: target.x, y: target.y, radius: ASTRO_BOUQUET_RADIUS, damage: 0 }];
    case 'flag': {
      const dx = target.x - from.x, dy = target.y - from.y, l = Math.hypot(dx, dy);
      const ux = l > 1e-6 ? dx / l : 1, uy = l > 1e-6 ? dy / l : 0;
      const len = Math.max(ASTRO_FLAG_MIN_LENGTH, l + ASTRO_FLAG_BEYOND_PX);
      const tx = from.x + ux * len, ty = from.y + uy * len;
      return [{
        ...base, id: `${throwId}-0`, hitAt: start + astroHitOffsetMs('flag'), x: tx, y: ty, radius: ASTRO_FLAG_HALF_W, damage: ASTRO_FLAG_DAMAGE,
        capsule: { fx: from.x, fy: from.y, tx, ty, halfWidth: ASTRO_FLAG_HALF_W },
      }];
    }
    case 'debris': {
      const out: AstroThrowEntry[] = [];
      // 8枚とも違う外板にする(並びは毎回ばらす)。
      const kinds = Array.from({ length: ASTRO_DEBRIS_VARIANTS }, (_, k) => k);
      for (let k = kinds.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)) % (k + 1); [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
      // 置く所: 1枚はプレイヤーの立っていた所そのもの(何番目に落ちるかは無作為)、残りは円の中に無作為(枚どうし離す)。
      const onTarget = Math.floor(rng() * ASTRO_DEBRIS_COUNT) % ASTRO_DEBRIS_COUNT;
      const pts: { x: number; y: number }[] = [{ x: target.x, y: target.y }];
      for (let tries = 0; pts.length < ASTRO_DEBRIS_COUNT && tries < 400; tries++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * ASTRO_DEBRIS_SPREAD_PX;
        const q = { x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r };
        if (tries < 300 && pts.some(p => Math.hypot(p.x - q.x, p.y - q.y) < ASTRO_DEBRIS_GAP_PX)) continue;
        pts.push(q);
      }
      [pts[0], pts[onTarget]] = [pts[onTarget], pts[0]];
      for (let i = 0; i < ASTRO_DEBRIS_COUNT; i++) {
        out.push({
          ...base, id: `${throwId}-${i}`, hitAt: start + astroHitOffsetMs('debris', i),
          x: pts[i].x, y: pts[i].y, radius: ASTRO_DEBRIS_RADIUS, damage: ASTRO_DEBRIS_DAMAGE,
          variant: kinds[i % kinds.length], tilt: (rng() - 0.5) * 1.2,
        });
      }
      return out;
    }
  }
};

// ---- 浮遊のコマ(§3) ----
export interface AstroHoverAnim { frame: number; acc: number; dir: 1 | -1 }

/**
 * 浮遊のコマを進める。wantAir=浮きたい(0→10→8〜10ピンポン)/ 降りたい(今のコマから0まで逆に)。
 * 往復の間の体のずれは描画が ASTRO_HOVER_ALIGN で消す(体は固定・脚と噴射だけ動く)。
 * collapse=崩し・気絶で落ちる(推力が抜けて、地面に近いほど速く落ちる=重力の加速・§10)。普通の着地も上でためて最後を速める。
 */
export const stepAstroHover = (a: AstroHoverAnim, wantAir: boolean, dtMs: number, collapse = false): AstroHoverAnim => {
  let { frame, acc, dir } = a;
  acc += Math.max(0, dtMs);
  for (let guard = 0; guard < 64; guard++) {
    // 崩れて落ちる時は推力が抜けて加速しながら落ちる(上=60ms → 地面の手前=24ms・重力の向き)。
    // 浮遊のピンポンは折り返し(8・10)で一拍溜める=機械的な等間隔の震えにしない(クリエイティブ監査#2・#12)。
    const per = !wantAir && collapse
      ? ASTRO_HOVER_FRAME_MS * (0.4 + 0.6 * (frame / ASTRO_HOVER_TOP))
      : wantAir && (frame === ASTRO_HOVER_TOP || (frame === ASTRO_HOVER_LOOP_LO && dir === -1)) ? ASTRO_HOVER_FRAME_MS * 1.6
      // 降りる時は浮き上がりの巻き戻しにしない: 上で推力を絞って一瞬ため、地面が近づくほど速く落ちてドスンで止まる(監査2巡目#6)。
      : !wantAir ? ASTRO_HOVER_FRAME_MS * (0.55 + 0.75 * (frame / ASTRO_HOVER_TOP))
      : ASTRO_HOVER_FRAME_MS;
    if (acc < per) break;
    acc -= per;
    if (wantAir) {
      if (frame < ASTRO_HOVER_LOOP_LO) { frame++; dir = 1; }
      else {
        if (frame >= ASTRO_HOVER_TOP) dir = -1;
        else if (frame <= ASTRO_HOVER_LOOP_LO) dir = 1;
        frame += dir;
      }
    } else if (frame > 0) {
      frame--; dir = -1;
    } else {
      acc = 0;
      break;
    }
  }
  return { frame, acc, dir };
};

/** 動いてよいコマに達しているか(浮き上がりの途中から慣性でゆっくり動き出す)。 */
export const astroCanMove = (frame: number): boolean => frame >= ASTRO_MOVE_FRAME;

/**
 * 描画の持ち上げ(px・絵だけ)。0〜2コマ=0、3〜8コマ=比例して0→ASTRO_LIFT_PX、浮き切った後は一定(移動中は体を固定=上下に揺らさない・社長指示2026-10-29)。
 * frame はコマの合間の値(小数)でよい=60msごとの階段にしない。
 */
export const astroLiftPx = (frame: number): number => {
  if (frame <= 2) return 0;
  const k = Math.min(1, (frame - 2) / (ASTRO_HOVER_LOOP_LO - 2));
  return k * k * (3 - 2 * k) * ASTRO_LIFT_PX; // 浮き始めと浮き切りで緩む
};

/** 浮遊のコマの合間の値(描画の持ち上げを滑らかにするため)。 */
export const astroHoverFrameF = (frame: number, acc: number, dir: 1 | -1): number =>
  Math.max(0, Math.min(ASTRO_HOVER_TOP, frame + dir * Math.min(1, acc / ASTRO_HOVER_FRAME_MS) * 0.999));

// ---- 慣性つきの速度(§2・§2c) ----
/**
 * 向き(ラジアン)と速さを、望む向き・速さへ寄せる。曲がりは1秒に70°まで=速いまま曲がると外へ膨らむ。
 * 速さは最高速 vmax まで ASTRO_ACCEL_S 秒で上がり、ASTRO_DECEL_S 秒で止まる。
 */
export const stepAstroVelocity = (
  cur: { heading: number; speed: number }, want: { heading: number; speed: number }, vmax: number, dt: number,
): { heading: number; speed: number } => {
  let dh = want.heading - cur.heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const maxTurn = ASTRO_TURN_RAD_PER_S * dt;
  // 止まっている時は向きを素直に合わせる(止まった物の向きに慣性は無い)。
  const heading = cur.speed < vmax * ASTRO_STOPPED_FRAC
    ? want.heading
    : cur.heading + Math.max(-maxTurn, Math.min(maxTurn, dh));
  const up = (vmax / ASTRO_ACCEL_S) * dt, down = (vmax / ASTRO_DECEL_S) * dt;
  const speed = want.speed > cur.speed ? Math.min(want.speed, cur.speed + up) : Math.max(want.speed, cur.speed - down);
  return { heading, speed: Math.max(0, speed) };
};

/**
 * 止まる地点の手前で速さを落とす(減速の距離=v²/(2a))。残り dist で止まり切れる最大の速さ。
 */
export const astroArriveSpeed = (dist: number, vmax: number): number => {
  const a = vmax / ASTRO_DECEL_S;
  return Math.min(vmax, Math.sqrt(Math.max(0, 2 * a * dist)));
};

// ---- 巡回(§2b・§8) ----
export interface AstroPoi { x: number; y: number }

/**
 * 巡回先の候補。位置の無い物は除く。2か所未満なら start から半径 rMin〜rMax の無作為な点を足して2か所以上にする。
 */
export const astroPoiCandidates = (
  pois: readonly ({ x: number; y: number } | null | undefined)[], start: { x: number; y: number },
  rMin: number, rMax: number, rng: () => number,
): AstroPoi[] => {
  const out: AstroPoi[] = [];
  for (const p of pois) if (p) out.push({ x: p.x, y: p.y });
  while (out.length < 2) {
    const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
    out.push({ x: start.x + Math.cos(a) * r, y: start.y + Math.sin(a) * r });
  }
  return out;
};

/** 次の巡回先(添字)。直前の所(prev)は選ばない。候補が1つしか無い時はそれ。 */
export const pickAstroPoi = (n: number, prev: number | null, rng: () => number): number => {
  if (n <= 1) return 0;
  const pool: number[] = [];
  for (let i = 0; i < n; i++) if (i !== prev) pool.push(i);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
};

/**
 * 置く場所: 候補のうち player から minDist 以上離れた物を無作為に1つ(無ければ一番遠い物)。
 * 返すのは候補の添字と、その POI の ASTRO_ARRIVE_PX 手前(player 側)に置く点。
 */
export const astroSpawnPick = (
  cands: readonly AstroPoi[], player: { x: number; y: number }, minDist: number, rng: () => number,
): { index: number; x: number; y: number } => {
  const far = cands.map((c, i) => ({ i, d: Math.hypot(c.x - player.x, c.y - player.y) }));
  const ok = far.filter(f => f.d >= minDist);
  const pick = ok.length > 0
    ? ok[Math.min(ok.length - 1, Math.floor(rng() * ok.length))]
    : far.reduce((m, f) => (f.d > m.d ? f : m), far[0]);
  const c = cands[pick.i];
  const l = pick.d > 1e-6 ? pick.d : 1;
  return { index: pick.i, x: c.x + ((player.x - c.x) / l) * ASTRO_ARRIVE_PX, y: c.y + ((player.y - c.y) / l) * ASTRO_ARRIVE_PX };
};

/** 交戦の帯へ寄せる望みの距離差(+=寄る・−=離れる・0=帯の中)。 */
export const astroBandPull = (dist: number): number =>
  dist < ASTRO_BAND_MIN_PX ? dist - ASTRO_BAND_MIN_PX : dist > ASTRO_BAND_MAX_PX ? dist - ASTRO_BAND_MAX_PX : 0;

// ---- 隕石の揺れ(派手さの絵) ----
/** 落下の進み u(0..1)での画面の揺れの強さ(0..1)。弱→強、最後の0.5秒が最大。 */
export const astroMeteorShake = (msToHit: number): number => {
  if (msToHit <= 500) return 1;
  const u = 1 - Math.min(1, (msToHit - 500) / (ASTRO_METEOR_FALL_MS - 500));
  return 0.12 + 0.88 * u * u;
};

// ---- 周りに降り注ぐ残骸(§12-1・社長指示2026-10-29「プレイヤーが敵との距離700px以内に入ったら、空から残骸が降り始める」) ----
/**
 * 降り始める距離・間隔・落ちる輪・最初の1枚のプレイヤーからの距離・上限・予告の尺(=降り始めから刺さるまで)・叩きつける尺・古い物が沈んで消える尺。
 * 社長指示2026-10-29「1000px以内に変更 すぐプレイヤーの近くに1つ目は降ってくる。1秒-1.5秒置きに降ってくる。ちなみにこれもダメージあり」。
 */
export const ASTRO_RAIN_NEAR_PX = 1000;
export const ASTRO_RAIN_GAP_MIN_MS = 1000;
export const ASTRO_RAIN_GAP_MAX_MS = 1500;
export const ASTRO_RAIN_RING_MIN = 120;
export const ASTRO_RAIN_RING_MAX = 450;
export const ASTRO_RAIN_FIRST_MIN_PX = 70;
export const ASTRO_RAIN_FIRST_MAX_PX = 170;
export const ASTRO_RAIN_CAP = 8;
export const ASTRO_RAIN_WARN_MS = 700;
export const ASTRO_RAIN_FALL_MIN_MS = 170;
export const ASTRO_RAIN_FALL_MAX_MS = 280;
export const ASTRO_RAIN_SINK_MS = 600;
export const ASTRO_SCATTER_SMOKE_FRAC = 0.4;

export interface AstroScatterPiece {
  id: string;
  /** 刺さる所(足元)。 */
  x: number; y: number;
  /** 外板の絵(0..7)・刺さった傾き(rad)・大きさ・埋まらずに見えている割合・煙が昇るか・左右反転。 */
  variant: number; rot: number; scale: number; keep: number; smoke: boolean; flip?: boolean;
  /** 予告が出た時刻・刺さる(=当たる)時刻・空から叩きつける尺(gameTime・ms)。 */
  bornAt: number; landAt: number; fallMs: number;
  /** 上限を超えて沈み始めた時刻(この後 ASTRO_RAIN_SINK_MS で消える)。 */
  sinkAt?: number;
}

/** nextAt=次に降らせる時刻・wasNear=前の回に近かったか・firstPending=次の1枚はプレイヤーのそば・lastAt=最後に降らせた時刻。 */
export interface AstroRainState { nextAt: number; seq: number; wasNear?: boolean; firstPending?: boolean; lastAt?: number }

/**
 * 周りに降り注ぐ残骸を1回分進める。astro=場にいる宇宙飛行群の足元(居なければ null)、player=プレイヤーの中心。
 * 近ければ間隔ごとに1枚降らせる(近づいた最初の1枚はすぐ・プレイヤーのそば、以後は本体の周りの輪)。当たりは呼び手が予告つきで積む。
 * 上限を超えたら一番古い物を沈める。沈み切った物は消す。
 * canPlace=建物・木などに埋まらない所か。変わらなければ同じ配列を返す。
 */
export const astroRainStep = (
  pieces: readonly AstroScatterPiece[], astro: { x: number; y: number } | null, player: { x: number; y: number },
  canPlace: (x: number, y: number) => boolean, gt: number, rng: () => number, st: AstroRainState,
): AstroScatterPiece[] => {
  let out: AstroScatterPiece[] | null = null;
  const edit = () => (out ??= pieces.slice());
  // 沈み切った物を消す。
  if (pieces.some(p => p.sinkAt !== undefined && gt >= p.sinkAt + ASTRO_RAIN_SINK_MS)) {
    out = pieces.filter(p => p.sinkAt === undefined || gt < p.sinkAt + ASTRO_RAIN_SINK_MS);
  }
  const near = !!astro && Math.hypot(player.x - astro.x, player.y - astro.y) <= ASTRO_RAIN_NEAR_PX;
  // 近づいた瞬間に1枚目(プレイヤーのそば)。ただし前に降らせてから最低の間隔は空ける=境目を出入りしても詰まらない(品質監査 A3)。
  if (near && !st.wasNear) {
    st.firstPending = true;
    st.nextAt = Math.max(gt, (st.lastAt ?? -Infinity) + ASTRO_RAIN_GAP_MIN_MS);
  }
  st.wasNear = near;
  if (!near) { st.firstPending = false; st.nextAt = Math.max(st.nextAt, gt); }
  else if (gt >= st.nextAt) {
    const first = !!st.firstPending;
    st.nextAt = gt + ASTRO_RAIN_GAP_MIN_MS + rng() * (ASTRO_RAIN_GAP_MAX_MS - ASTRO_RAIN_GAP_MIN_MS);
    for (let tries = 0; tries < 8; tries++) {
      const a = rng() * Math.PI * 2;
      // 1枚目はプレイヤーのそば(「近くにいる」を最初の一撃で知らせる)。以後は本体の周りの輪の中で面積に一様。
      const r = first ? ASTRO_RAIN_FIRST_MIN_PX + rng() * (ASTRO_RAIN_FIRST_MAX_PX - ASTRO_RAIN_FIRST_MIN_PX)
        : Math.sqrt(ASTRO_RAIN_RING_MIN ** 2 + rng() * (ASTRO_RAIN_RING_MAX ** 2 - ASTRO_RAIN_RING_MIN ** 2));
      const c = first ? player : astro!;
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
      if (!canPlace(x, y)) continue;
      // 大きい塊を少し・小さい破片を多め。煙は大きい塊から。
      const big = rng() < 0.35;
      edit().push({
        id: `astro-rain-${++st.seq}`, x, y,
        variant: Math.floor(rng() * ASTRO_DEBRIS_VARIANTS) % ASTRO_DEBRIS_VARIANTS,
        rot: (rng() - 0.5) * 0.52, // ±15°まで(描き込まれた光の向きを壊さない)
        scale: big ? 1.15 + rng() * 0.45 : 0.45 + rng() * 0.35, keep: 0.55 + rng() * 0.3,
        smoke: big ? rng() < 0.85 : rng() < ASTRO_SCATTER_SMOKE_FRAC * 0.25, flip: rng() < 0.5,
        bornAt: gt, landAt: gt + ASTRO_RAIN_WARN_MS, fallMs: ASTRO_RAIN_FALL_MIN_MS + rng() * (ASTRO_RAIN_FALL_MAX_MS - ASTRO_RAIN_FALL_MIN_MS),
      });
      st.lastAt = gt;
      st.firstPending = false;
      break;
    }
  }
  // 上限: 沈んでいない物が上限を超えたら、古い順に沈める(パッと消さない)。
  const cur: readonly AstroScatterPiece[] = out ?? pieces;
  const live = cur.filter(p => p.sinkAt === undefined);
  if (live.length > ASTRO_RAIN_CAP) {
    const drop = new Set(live.slice(0, live.length - ASTRO_RAIN_CAP).map(p => p.id));
    out = cur.map(p => (drop.has(p.id) ? { ...p, sinkAt: gt } : p));
  }
  return out ?? (pieces as AstroScatterPiece[]);
};

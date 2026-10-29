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
/** 移動中にピンポンする範囲(最後の3コマ)。 */
export const ASTRO_HOVER_LOOP_LO = 8;
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
export const ASTRO_BOB_PX = 4.2;

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
export const ASTRO_FLAG_LENGTH = 700;
export const ASTRO_FLAG_HALF_W = 18;
export const ASTRO_FLAG_DAMAGE = 26;
/** 刺さった旗が残る(判定なし)・最後に薄れる。 */
export const ASTRO_FLAG_STUCK_MS = 5000;

export const ASTRO_DEBRIS_COUNT = 8;
export const ASTRO_DEBRIS_SPREAD_PX = 350;
export const ASTRO_DEBRIS_RADIUS = 46;
export const ASTRO_DEBRIS_DAMAGE = 14;
/** 1枚目は離してから700ms、以後1枚ごとに150ms。 */
export const ASTRO_DEBRIS_FIRST_MS = 700;
export const ASTRO_DEBRIS_STEP_MS = 150;
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
      const tx = from.x + ux * ASTRO_FLAG_LENGTH, ty = from.y + uy * ASTRO_FLAG_LENGTH;
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
      for (let i = 0; i < ASTRO_DEBRIS_COUNT; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * ASTRO_DEBRIS_SPREAD_PX;
        out.push({
          ...base, id: `${throwId}-${i}`, hitAt: start + astroHitOffsetMs('debris', i),
          x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r, radius: ASTRO_DEBRIS_RADIUS, damage: ASTRO_DEBRIS_DAMAGE,
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
 * 描画の持ち上げ(px・絵だけ)。0〜2コマ=0、3〜8コマ=比例して0→ASTRO_LIFT_PX、浮遊中(8〜10)は揺れを足す。
 * frame はコマの合間の値(小数)でよい=60msごとの階段にしない。揺れは2つの周期を重ねて不揃いに。t=揺れの時計(ms)。
 */
export const astroLiftPx = (frame: number, t: number): number => {
  if (frame <= 2) return 0;
  const k = Math.min(1, (frame - 2) / (ASTRO_HOVER_LOOP_LO - 2));
  const s = k * k * (3 - 2 * k); // 浮き始めと浮き切りで緩む
  const bobK = Math.max(0, Math.min(1, frame - (ASTRO_HOVER_LOOP_LO - 1)));
  const bob = (Math.sin(t / 520) * 3 + Math.sin(t / 233 + 1.3) * 1.2) * (ASTRO_BOB_PX / 4.2) * bobK;
  return s * ASTRO_LIFT_PX + bob;
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

// ---- 周りに散らばる残骸(§11・社長指示2026-10-29「先にそれを見て、あ、近くにいるなってわかる感じ」) ----
/** 置く範囲の半径・個数・残骸どうしの間・消す距離(半径の倍)・見直しの間隔。叩き台。 */
export const ASTRO_SCATTER_RADIUS = 950;
export const ASTRO_SCATTER_COUNT = 14;
export const ASTRO_SCATTER_GAP = 70;
export const ASTRO_SCATTER_KEEP_MULT = 1.15; // 後ろへ尾を引いて溜めない(品質監査 A1)
export const ASTRO_SCATTER_STEP_MS = 250;
export const ASTRO_SCATTER_SMOKE_FRAC = 0.4;
/** 新しく足す所は進む向きへこの割合(半径に対して)だけ寄せる=行く先に残骸が先にある(品質監査 A1)。 */
export const ASTRO_SCATTER_LEAD_FRAC = 0.8;
/** 進んでいる時、後ろ側はこの割合(半径に対して)より離れたら手放す。 */
export const ASTRO_SCATTER_BEHIND_FRAC = 0.7;
/** 本体の足元のすぐ近くには置かない。 */
export const ASTRO_SCATTER_MIN_FROM_CENTER = 140;
/** 画面の中に置いてよいのは上側の霞の帯だけ(この割合より上)=遠くから浮かび上がる。目の前では湧かない(品質監査 A2)。 */
export const ASTRO_SCATTER_HAZE_FRAC = 0.3;
/** 霞の中から浮かび上がる尺(画面の外に置いた物は短く)。 */
export const ASTRO_SCATTER_FADE_HAZE_MS = 1500;
export const ASTRO_SCATTER_FADE_MS = 400;

export interface AstroScatterPiece {
  id: string;
  x: number; y: number;
  /** 外板の絵(0..7)・傾き(rad)・大きさ・埋まらずに見えている割合・煙が昇るか・左右反転。 */
  variant: number; rot: number; scale: number; keep: number; smoke: boolean; flip?: boolean;
  /** 置いた時刻(gameTime・描画の薄れて現れる起点)。 */
  bornAt: number;
  /** 画面の上側の霞の中に置いた(ゆっくり浮かび上がる)。 */
  haze?: boolean;
}

/**
 * 残骸の置き直し。center=宇宙飛行群の足元(居なければ null=新しく置かない)、dir=進む向き(単位ベクトル・止まっていれば null)。
 * view=画面の見えている範囲(描画の範囲より広めに取った物)。置くのは画面の外か、画面の上側の霞の帯(遠く)だけ。
 * 消すのは画面の外だけ(画面の中の遠い残骸は、画面から出るまで残す)。canPlace=建物・木などに埋まらない所か。
 */
export const astroScatterStep = (
  pieces: readonly AstroScatterPiece[], center: { x: number; y: number } | null, dir: { x: number; y: number } | null,
  view: { left: number; right: number; top: number; bottom: number }, canPlace: (x: number, y: number) => boolean,
  gt: number, rng: () => number, seq: { n: number },
): AstroScatterPiece[] => {
  const keepR = ASTRO_SCATTER_RADIUS * ASTRO_SCATTER_KEEP_MULT;
  const inView = (x: number, y: number) => x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
  const hazeBottom = view.top + (view.bottom - view.top) * ASTRO_SCATTER_HAZE_FRAC;
  // 残す=本体の円の中。進んでいる時は、通り過ぎた後ろ側を早めに手放す(半径の0.7倍より後ろ)=行く先に残骸が集まる。
  const keepHere = (p: { x: number; y: number }): boolean => {
    if (!center) return false;
    const dx = p.x - center.x, dy = p.y - center.y, d = Math.hypot(dx, dy);
    if (d > keepR) return false;
    if (dir && dx * dir.x + dy * dir.y < 0 && d > ASTRO_SCATTER_RADIUS * ASTRO_SCATTER_BEHIND_FRAC) return false;
    return true;
  };
  const out = pieces.filter(p => inView(p.x, p.y) || keepHere(p));
  if (!center) return out.length === pieces.length ? (pieces as AstroScatterPiece[]) : out;
  const near = out.filter(keepHere).length;
  let need = ASTRO_SCATTER_COUNT - near;
  const lead = dir ? { x: center.x + dir.x * ASTRO_SCATTER_RADIUS * ASTRO_SCATTER_LEAD_FRAC, y: center.y + dir.y * ASTRO_SCATTER_RADIUS * ASTRO_SCATTER_LEAD_FRAC } : center;
  for (let tries = 0; need > 0 && tries < 48; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * ASTRO_SCATTER_RADIUS;
    const x = lead.x + Math.cos(a) * r, y = lead.y + Math.sin(a) * r;
    const dc = Math.hypot(x - center.x, y - center.y);
    if (dc > ASTRO_SCATTER_RADIUS || dc < ASTRO_SCATTER_MIN_FROM_CENTER) continue; // 置くのは本体の円の中だけ
    const vis = inView(x, y);
    if (vis && y > hazeBottom) continue; // 画面の中は上側の霞の帯だけ
    if (out.some(p => Math.hypot(p.x - x, p.y - y) < ASTRO_SCATTER_GAP)) continue;
    if (!canPlace(x, y)) continue;
    // 大きい塊を少し・小さい破片を多め(どれも同じ大きさだと置物を並べたように見える)。煙と火は大きい塊から。
    const big = rng() < 0.35;
    out.push({
      id: `astro-scatter-${++seq.n}`, x, y,
      variant: Math.floor(rng() * ASTRO_DEBRIS_VARIANTS) % ASTRO_DEBRIS_VARIANTS,
      rot: (rng() - 0.5) * 0.52, // ±15°まで(描き込まれた光の向きを壊さない)
      scale: big ? 1.15 + rng() * 0.45 : 0.45 + rng() * 0.35, keep: 0.55 + rng() * 0.3,
      smoke: big ? rng() < 0.85 : rng() < ASTRO_SCATTER_SMOKE_FRAC * 0.25, flip: rng() < 0.5, bornAt: gt, haze: vis,
    });
    need--;
  }
  // 変わっていなければ同じ配列を返す(店へ無駄に書かない)。
  if (out.length === pieces.length && out.every((p, i) => p === pieces[i])) return pieces as AstroScatterPiece[];
  return out;
};

// 解放軍群(変異)の純関数(research/LIBERTY_HORDE.md)。store も PixiJS も読まない=ヘッドレスでテストする。
import { variantTextureName } from './enemyVariant';

/** 後ろに連なるバット男の数(社長「常にコイツの後ろに赤レアのバット男が5体連なっている」)。 */
export const LIB_ESCORTS = 5;
/** 列の間隔(旗手から i 体目まで (i+1)×この距離 後ろ)。 */
export const LIB_SLOT_GAP_PX = 56;
/** 足跡を置く間隔。 */
export const LIB_TRAIL_STEP_PX = 20;
/** 足跡を持つ数(5体ぶん+余り)。 */
export const LIB_TRAIL_MAX = Math.ceil(((LIB_ESCORTS + 1) * LIB_SLOT_GAP_PX) / LIB_TRAIL_STEP_PX) + 4;
/** 見失う: 索敵範囲のこの倍より外、または画面外が続いたら。 */
export const LIB_LOSE_RANGE_MULT = 1.5;
export const LIB_LOSE_MS = 3000;
/** 列へ戻るバット男の歩き(px/s)。 */
export const LIB_RETURN_SPEED = 150;
/** 戻り切ったとみなす距離(手前で減速して寄せるので小さくてよい=列へ吸い付く跳びを作らない)。 */
export const LIB_RETURN_ARRIVE_PX = 6;
/** 戻りの減速: 残り距離×この係数(/s)を速さの上限にする(手前でゆるむ=慣性MUST)。 */
export const LIB_RETURN_EASE_PER_S = 4;
/** 旗手の歩き出し/止まりの加減速(px/s²)。周回の速さ(約48px/s)まで約0.3秒。 */
export const LIB_BEARER_ACCEL = 150;
/** 叫喚の発生点=足元からこの高さ(絵の口〜旗の根元あたり。絵は約230px)。 */
export const LIB_HEAD_PX = 185;
/** 叫喚の輪・発光の寸法の倍率(叫喚型の絵は約105px・旗手は約230px)。 */
export const LIB_SCREAM_FX_SCALE = 1.7;
/** 殴られてからこの間(ms・実時間=lastHit と同じ時計)は「見つけた」扱い。 */
export const LIB_HIT_ALERT_MS = 600;
/** 列のばらつき(1体ごとに決まった遅れ・横ズレの最大量)。同じ個体はいつも同じだけずれる=癖。 */
export const LIB_JITTER_PX = 10;
/** 補充は旗手の真後ろ(向きの反対側)へこの距離。 */
export const LIB_REFILL_BEHIND_PX = 60;

/**
 * 周回の半径(社長裁定2026-10-04「深層域の位置は推薦で」)= **深層域に (デンジャーゾーンの幅の半分) 入った所**。
 * 英雄(デンジャーゾーンの入口からその幅の半分=輪の真ん中)と同じ取り方。今の境界なら 11250 + 1500 = 12750。
 */
export const libPatrolRadius = (areaThresholds: readonly number[]): number =>
  areaThresholds[3] + (areaThresholds[2] - areaThresholds[1]) / 2;

/**
 * 足跡(古い→新しいの順。最後が旗手のいちばん近く)を、新しい側から `dist` px たどった点。
 * 足跡が足りなければ、いちばん古い点からさらに同じ向きへ延ばした点を返す(出現直後・列が詰まらない)。
 */
export const trailPointAt = (
  trail: readonly { x: number; y: number }[], head: { x: number; y: number }, dist: number,
): { x: number; y: number } => {
  let prev = head;
  let left = dist;
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    const seg = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (seg >= left && seg > 0) {
      const k = left / seg;
      return { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k };
    }
    left -= seg;
    prev = p;
  }
  // 足りない: 最後の向き(いちばん古い2点、無ければ head→最古)のまま延ばす。
  const a = trail.length >= 2 ? trail[1] : head;
  const b = trail.length >= 1 ? trail[0] : head;
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return { x: b.x, y: b.y + left };
  return { x: b.x + (dx / l) * left, y: b.y + (dy / l) * left };
};

/**
 * バット男の見た目は敵IDのハッシュで男女が決まる(`variantTextureName`)。**男になるまでIDに枝番を付けて引き直す**
 * (品質監査 A-2)。決定的(同じ元IDなら同じ結果)。
 */
export const maleBatId = (baseId: string): string => {
  if (variantTextureName('bat', baseId) === 'bat-male') return baseId;
  for (let k = 1; k < 64; k++) {
    const id = `${baseId}-m${k}`;
    if (variantTextureName('bat', id) === 'bat-male') return id;
  }
  return baseId;
};

/** 輪の上で、ある角度から時計回り側(=反時計回りに進む旗手の後ろ)へ弧長 `back` px の点。出現時の仮の足跡用。 */
export const ringPointBehind = (angle: number, R: number, back: number): { x: number; y: number } => {
  const a = angle + back / Math.max(1, R);
  return { x: Math.cos(a) * R, y: Math.sin(a) * R };
};

/**
 * 列の1体ごとの癖(遅れ・横ズレ。どちらも ±LIB_JITTER_PX)。敵IDから決まる=同じ個体はいつも同じ。
 * 定規で引いたような等間隔の列にしない(クリエイティブ監査 #6)。
 */
export const hordeJitter = (id: string): { gap: number; lat: number } => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 1000) / 999, b = (((h >>> 10) >>> 0) % 1000) / 999;
  return { gap: (a * 2 - 1) * LIB_JITTER_PX, lat: (b * 2 - 1) * LIB_JITTER_PX };
};

/** 社長指示2026-10-04「プレイヤーが100px以内に近づくとゆっくり距離を取る」: 体(判定の矩形)の縁からの距離。 */
export const LIB_RETREAT_RANGE_PX = 100;
/** 距離を取る歩きの速さ(px/s)=周回と同じゆっくりした歩き。 */
export const LIB_RETREAT_SPEED = 48;
/** 向きを変える速さ(1秒あたりの寄せ率)。急に向きが跳ばない=慣性。 */
export const LIB_TURN_PER_S = 6;

/**
 * 旗手の体(矩形)の縁からプレイヤー中心までが range 以内なら、離れる向き(単位ベクトル)。外なら null。
 * 向きは体の中心からプレイヤーの反対側(重なっている時も中心基準で決まる)。
 */
export const libRetreatDir = (
  rect: { x: number; y: number; width: number; height: number }, px: number, py: number, range: number,
): { x: number; y: number } | null => {
  const nx = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  if (Math.hypot(px - nx, py - ny) > range) return null;
  const dx = rect.x + rect.width / 2 - px, dy = rect.y + rect.height / 2 - py;
  const l = Math.hypot(dx, dy);
  return l > 1e-6 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 };
};

// ---- 旗振り(社長指示2026-10-04「120px以内に近づいてきたら、この旗を振って来る範囲攻撃」・LIBERTY_HORDE §4b) ----
/** 振り始める距離: 体(判定の矩形)の縁からプレイヤー中心まで。 */
export const LIB_FLAG_TRIGGER_PX = 120;
/** 扇の半径(体の中心から)。縁から120pxの相手に届く(体の半幅55+120)+余裕。 */
export const LIB_FLAG_RADIUS = 200;
/** 扇の開き(度)。 */
export const LIB_FLAG_ARC_DEG = 140;
/** 溜め(赤い予告が出て、消え切る=当たるまで)。 */
export const LIB_FLAG_WINDUP_MS = 800;
/** 振り抜いた後の残心。 */
export const LIB_FLAG_RECOVER_MS = 600;
/** 次に振れるまで(残心の終わりから)。 */
export const LIB_FLAG_COOLDOWN_MS = 2500;
/** 当たった時のダメージ(叩き台・英雄の横薙ぎ22より軽い)。 */
export const LIB_FLAG_DAMAGE = 16;

/** 点 (px,py) から矩形の縁までの距離(中なら0)。 */
export const edgeDistToRectPt = (
  rect: { x: number; y: number; width: number; height: number }, px: number, py: number,
): number => {
  const nx = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  return Math.hypot(px - nx, py - ny);
};

/** 旗振りの扇(体の中心から相手の方へ)。 */
export const libFlagFan = (
  rect: { x: number; y: number; width: number; height: number }, tx: number, ty: number,
): { kind: 'fan'; cx: number; cy: number; angle: number; halfArc: number; radius: number } => {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return { kind: 'fan', cx, cy, angle: Math.atan2(ty - cy, tx - cx), halfArc: (LIB_FLAG_ARC_DEG / 2) * (Math.PI / 180), radius: LIB_FLAG_RADIUS };
};

// ---- 矢の雨(社長指示2026-10-04「全射程で、上から矢がランダムに沢山振って来る広範囲攻撃」・LIBERTY_HORDE §4c) ----
/** 1回の号令で降る矢の数・うち相手の近くを狙う本数。 */
export const LIB_VOLLEY_ARROWS = 30;
export const LIB_VOLLEY_NEAR = 10;
/** 相手の近くを狙う矢の散らばり(相手の位置から)。 */
export const LIB_VOLLEY_NEAR_SPREAD_PX = 150;
/** 矢を落とし始める間隔の合計(最初の矢から最後の矢の予告が出るまで)。 */
export const LIB_VOLLEY_SPAN_MS = 1800;
/** 1本ごとの予告(赤い円が出てから刺さるまで)。 */
export const LIB_ARROW_WINDUP_MS = 1000;
/** 1本の当たりの半径・ダメージ。 */
export const LIB_ARROW_RADIUS = 34;
export const LIB_ARROW_DAMAGE = 28; // 社長裁定2026-10-04「8は低い。無敵時間で基本1発・エンドコンテンツなので強め」=英雄の跳躍の着地と同じ重さ
/** 号令の構え(旗手が立ち止まる時間)・号令の間隔・見つけてから最初の号令まで。 */
export const LIB_VOLLEY_CAST_MS = 700;
export const LIB_VOLLEY_COOLDOWN_MS = 9000;
export const LIB_VOLLEY_FIRST_DELAY_MS = 2500;
/** 刺さった矢が残る時間(描画だけ)。 */
export const LIB_ARROW_STUCK_MS = 1500;
/**
 * 画面の上のこの割合は空と遠景(プレイヤーが立てない地平線の帯)=矢を落とさない(クリエイティブ監査 #5)。
 * 「全射程」は「プレイヤーが居られる所すべて」と読む。
 */
export const LIB_VOLLEY_SKY_FRAC = 0.3;
/** 遅れて落ちる矢(斉射の尾)の本数。 */
export const LIB_VOLLEY_STRAGGLERS = 3;

export interface LibArrow { x: number; y: number; bornAt: number; fireAt: number }

/**
 * 号令1回ぶんの矢(全射程=いま見えている画面いっぱい+相手の近く)。rng は 0..1。
 * 予告が出る時刻(bornAt)は start から SPAN の間にばらし、刺さる時刻は bornAt+WINDUP(1本ごとに別々=多段は段ごと)。
 */
export const libVolleyArrows = (
  bounds: { left: number; right: number; top: number; bottom: number },
  target: { x: number; y: number }, start: number, rng: () => number,
): LibArrow[] => {
  const out: LibArrow[] = [];
  for (let i = 0; i < LIB_VOLLEY_ARROWS; i++) {
    let x: number, y: number;
    if (i < LIB_VOLLEY_NEAR) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * LIB_VOLLEY_NEAR_SPREAD_PX;
      x = target.x + Math.cos(a) * r; y = target.y + Math.sin(a) * r;
    } else {
      const top = bounds.top + (bounds.bottom - bounds.top) * LIB_VOLLEY_SKY_FRAC;
      x = bounds.left + rng() * (bounds.right - bounds.left);
      y = top + rng() * (bounds.bottom - top);
    }
    // 斉射の形(クリエイティブ監査 #10): 最初の数本→中ほどが密→遅れて数本。一様にばらさない。
    const straggler = i >= LIB_VOLLEY_ARROWS - LIB_VOLLEY_STRAGGLERS;
    const u = straggler ? 0.9 + 0.1 * rng() : 0.85 * (rng() + rng()) / 2;
    const bornAt = start + Math.round(u * LIB_VOLLEY_SPAN_MS);
    out.push({ x, y, bornAt, fireAt: bornAt + LIB_ARROW_WINDUP_MS });
  }
  return out.sort((a, b) => a.bornAt - b.bornAt);
};

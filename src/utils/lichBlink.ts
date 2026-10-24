/**
 * ★リッチの技「転移噛み」(PACING_PUZZLE.md §16-C・社長確定2026-09-18)。
 *
 * 社長の言葉: 「リッチは射程70pxに入ったら1秒硬直、ワープして目の前に現れて即噛みつき発動 を技にしよう。
 * これは赤予告でカウンター可能。目の前の狭い範囲に赤サークル予告(ジャンプの小さい版)」
 * (発火距離はその後「140pxに変更」と裁定=C-1)。
 *
 * リッチの**最初で唯一の技**。`CHAFF_MOVE_TYPES`(bat/skeleton/zombie)には入れない
 * (§16の枠(同時2体)・抽選の対象にしない=lich専用経路。C-3-b8)。
 *
 * この純関数の台帳が持つのは:
 *  - 発火条件(中心間140px・CD明け)
 *  - 着地点(=攻撃先・「目の前」)の幾何
 *  - 見た目の進行(体の消える/現れる姿・陣の進み)
 * 判定そのもの(円の中/外)は既存 `enemyBite.isInBiteCircle` を再利用する(新しく発明しない・C-3-a1)。
 */
import type { Enemy } from '../types/game';

/** 発火の中心間距離(社長変更2026-09-18「ワープ元を140pxに変更」・C-1)。 */
export const LICH_BLINK_TRIGGER_PX = 140;

/** 溜めの総尺(=赤い予告が出てから消え切るまで)。社長の「1秒硬直」。★動かすツマミではない(C-2b)。 */
export const LICH_BLINK_HOLD_MS = 1000;
/**
 * ★現れる幅=カウンター受付幅(社長裁定2026-09-18「b」・C-2b)。「本体が現れる」「カウンター受付が
 * 開く」「噛みの振りが始まる」は全部この幅の頭(=溜め明け)で同時に起きる。
 * ★動かすツマミはここだけ。総尺(`LICH_BLINK_HOLD_MS`)は動かさない。
 */
export const LICH_BLINK_BITE_MS = 200;
/** 溜め(硬直)の尺。独立した値として持たない(C-2b「windupMsはHOLD-BITEで導く」)。 */
export const LICH_BLINK_WINDUP_MS = LICH_BLINK_HOLD_MS - LICH_BLINK_BITE_MS;
/**
 * 溜めが総尺に占める割合(0.8)。**線・帯の予告(`meteorPhase` 経路)でしか使えない値**で、
 * ★この技の**円**の予告には効かない——`drawSweepCircleFill`→`circleSweepBand` は
 * `drawFrac` を読まないため(prog/radius/halfW/ease/easePow のみ)。
 * C-3-c18「長く描いて短く消す」は円では `easePow`(MOB既定=2)が担っている
 * (帯が序盤ゆっくり外側に留まり、終盤で一気に中心へ吸い込まれる)。
 * ここには**台帳としての値**だけを置く(将来、円が drawFrac を取るようになった時の出どころ)。
 */
export const LICH_BLINK_DRAW_FRAC = LICH_BLINK_WINDUP_MS / LICH_BLINK_HOLD_MS;

/**
 * 当たり判定=予告円の半径(px)。「ジャンプの小さい版」= `PUMPKIN_EXPLOSION_RADIUS`(54)より
 * 小さい狭い円(C-1・C-2表)。
 * ★設計書に具体的な数値の指定は無いため、この値は実装者の叩き台(このプロジェクトの他の
 * 「叩き台」定数と同じ扱い=実機で社長が詰める。最終報告に明記)。
 * 予告の半径と実判定は**この1つの定数**から出す(C-4「赤円全数監査の作法」)。
 */
export const LICH_BLINK_RADIUS_PX = 40;

/**
 * 着地点(=攻撃先)をプレイヤーの中心からどれだけ寄せるか(px)。リッチが居た側へこの距離だけ
 * 寄せることで「目の前」の絵になる(判定はプレイヤー中心からの円なので、寄せても外さない限り必ず
 * 円の中に収まる)。★具体的な数値は設計書に無いため実装者の叩き台。
 */
export const LICH_BLINK_LAND_OFFSET_PX = 24;

/** ワープ元(体)が消える尺。既存 `lichWarp.ts` の `LICH_WARP_VANISH_MS` と同じ値=同じ動きに揃える(C-3-c14)。 */
export const LICH_BLINK_VANISH_MS = 260;
/** 着地点の陣が体より先に灯る尺。既存 `lichWarp.ts` の `LICH_CIRCLE_LEAD_MS` と同じ値(C-3-c15)。 */
export const LICH_BLINK_CIRCLE_LEAD_MS = 160;

/**
 * 発火してよいか(=中心間140px以内・CD明け・何も構えていない)。
 * ★中心間で測る(社長変更2026-09-18。`BITE_CONTACT_DIST_PX`の測り方=体の半幅の和ではない。C-3-a4)。
 * 距離は呼び手が計算して渡す(この関数は幾何を持たない=純粋な条件判定)。
 */
export const lichBlinkShouldFire = (
  enemy: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase' | 'biteReadyAt'>,
  gameTime: number,
  distCenterPx: number,
): boolean => {
  if (enemy.type !== 'lich') return false;
  if (enemy.chaffMove !== undefined) return false;
  if (enemy.aiPhase !== undefined) return false;
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) return false;
  if (gameTime < (enemy.biteReadyAt ?? 0)) return false;
  return distCenterPx <= LICH_BLINK_TRIGGER_PX;
};

/**
 * 着地点(クランプ前・中心座標)。プレイヤーの中心から、いま敵が居る方角へ`LICH_BLINK_LAND_OFFSET_PX`
 * だけ寄せた点=「目の前」。★追尾しない(掟2と同じ作法): 呼び手はこれを**発火の瞬間に1度だけ**
 * 呼び、`clampRectToPlayableArea`を通した結果を焼いて以後は読むだけにする(C-3-a2/3)。
 */
export const lichBlinkTargetPoint = (
  pcx: number, pcy: number, ecx: number, ecy: number,
): { x: number; y: number } => {
  const dx = ecx - pcx, dy = ecy - pcy;
  const d = Math.max(0.001, Math.hypot(dx, dy));
  return { x: pcx + (dx / d) * LICH_BLINK_LAND_OFFSET_PX, y: pcy + (dy / d) * LICH_BLINK_LAND_OFFSET_PX };
};

const smooth01 = (u: number): number => {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
};

/**
 * ★既存 `lichWarp.ts` の `vanishPoseAt` と同じ式(等方に縮み、透明度は形より遅れて落ちる)。
 * `lichWarp.ts`は「触ってよいファイル」に含まれていないため、式をここへ複製する
 * (このプロジェクトの確立された作法=循環import回避のため小さい純関数を複製する。`enemyBite.ts`の
 * `ZOMBIE_RUSH_MS_MIRROR`等と同じ扱い)。B-5の消滅と**同じ動き**にするための意図的な複製。
 */
const vanishShrink = (v: number): { s: number; alpha: number } => {
  const shape = Math.pow(v, 1.8);
  const fade = Math.pow(v, 3.2);
  return { s: 1 - 0.88 * shape, alpha: 1 - fade };
};

/** ★既存 `lichWarp.ts` の `backOut` と同じ式(行き過ぎて収まる)。同上の理由で複製。 */
const backOut = (u: number): number => {
  const c1 = 4.2, c3 = c1 + 1;
  const p = u - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
};

export interface LichBlinkPose {
  /** 描く場所。'origin'=元の場所(消える側)/'dest'=着地点(現れる側)/'none'=何も描かない。 */
  where: 'origin' | 'dest' | 'none';
  scale: number;
  alpha: number;
  /** 陣色(`LICH_WARP_TINT`)へどれだけ寄せるか(0..1)。 */
  tintStrength: number;
}

/**
 * 体の姿(C-3-c14・16・19)。
 * - `[0, WINDUP-VANISH)`: 元の場所に立ったまま、詠唱でtintが少しずつ陣色に染まる(縮みはまだ)。
 * - `[WINDUP-VANISH, WINDUP)`: 元の場所で縮みながら消える(=赤が消え切る前に元の場所は空になる)。
 * - `[WINDUP, HOLD]`: 着地点で現れ、行き過ぎて収まる(=噛みつきの踏み込みとして見せる。
 *   行き過ぎの頂点(u→1)が命中の瞬間と一致する)。
 */
export const lichBlinkBodyPose = (
  enemy: Pick<Enemy, 'biteAt' | 'chaffMove'>, gameTime: number,
): LichBlinkPose => {
  const none: LichBlinkPose = { where: 'none', scale: 1, alpha: 1, tintStrength: 0 };
  if (enemy.chaffMove !== 'lich-blink' || enemy.biteAt === undefined || enemy.biteAt <= 0) return none;
  const t = gameTime - enemy.biteAt;
  if (t < 0 || t > LICH_BLINK_HOLD_MS) return none;
  const vanishStart = LICH_BLINK_WINDUP_MS - LICH_BLINK_VANISH_MS;
  if (t < vanishStart) {
    return { where: 'origin', scale: 1, alpha: 1, tintStrength: smooth01(t / LICH_BLINK_WINDUP_MS) };
  }
  if (t < LICH_BLINK_WINDUP_MS) {
    const v = (t - vanishStart) / LICH_BLINK_VANISH_MS;
    const p = vanishShrink(v);
    return { where: 'origin', scale: p.s, alpha: p.alpha, tintStrength: smooth01(t / LICH_BLINK_WINDUP_MS) };
  }
  const u = Math.max(0, Math.min(1, (t - LICH_BLINK_WINDUP_MS) / LICH_BLINK_BITE_MS));
  return { where: 'dest', scale: backOut(u), alpha: Math.min(1, u * 5), tintStrength: 1 - smooth01(u) };
};

/**
 * 着地陣(緑)の進み(0..1)。体より`LICH_BLINK_CIRCLE_LEAD_MS`だけ先に灯る(C-3-c15)。
 * null=描かない。総尺は「先行ぶん+噛みの200ms」=命中の瞬間ちょうどで満開(一拍残す余地は
 * `drawWarpCircle`側のappearカーブが担う=ここは進み0..1を渡すだけ)。
 */
export const lichBlinkDestCircleProgress = (
  enemy: Pick<Enemy, 'biteAt' | 'chaffMove'>, gameTime: number,
): number | null => {
  if (enemy.chaffMove !== 'lich-blink' || enemy.biteAt === undefined || enemy.biteAt <= 0) return null;
  const t = gameTime - enemy.biteAt;
  const openAt = LICH_BLINK_WINDUP_MS - LICH_BLINK_CIRCLE_LEAD_MS;
  const span = LICH_BLINK_CIRCLE_LEAD_MS + LICH_BLINK_BITE_MS;
  const u = (t - openAt) / span;
  return u >= 0 && u < 1 ? u : null;
};

/** ワープ元の陣(緑・消える)の進み(0..1)。体の消滅(vanish)と同じ窓。null=描かない。 */
export const lichBlinkOriginCircleProgress = (
  enemy: Pick<Enemy, 'biteAt' | 'chaffMove'>, gameTime: number,
): number | null => {
  if (enemy.chaffMove !== 'lich-blink' || enemy.biteAt === undefined || enemy.biteAt <= 0) return null;
  const t = gameTime - enemy.biteAt;
  const vanishStart = LICH_BLINK_WINDUP_MS - LICH_BLINK_VANISH_MS;
  if (t < vanishStart || t >= LICH_BLINK_WINDUP_MS) return null;
  return (t - vanishStart) / LICH_BLINK_VANISH_MS;
};

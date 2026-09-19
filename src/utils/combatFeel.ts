// 戦闘の手触り(社長指示2026-09-13「戦闘の快感をもっと強くしたい」→「では入れてみて」)。
// 3本の純関数テーブル: ①当たった敵だけ数フレーム止まる(ヒットストップの局所版)
// ②連続撃破の段(3/5/10) ③銃の反動(カメラキック+薬莢)。
// 実装精度の規律4: 配線(damageEnemy/近接3経路/knockbackEnemy/発射地点/pixiScene)から数値と判定を
// ここへ切り出してユニットテストする。描画・SE・カメラは読むだけ=判定/ダメージ/移動距離には触れない
// (①の「止まる」だけが移動に触れる=それが仕様)。
// v0.25.4269(監査反映): 強個体の「重さ」は撤去(強個体は v0.25.2607 裁定で元から弾・殴りでは押されない=
// canShoveEnemy。掛けても表示されない死にコードだった)。反動は武器データ(1発の威力・間隔)から出す。
import type { EnemyType, WeaponCategory } from '../types/game';
import { impactBase, impactRateMult, IMPACT_BASE_MAX } from './impactShake';
import { isBossType, isPumpkinTier } from './enemyUtils';

// ---- ① 当たった敵の局所ストップ(区分テンプレ: 雑魚/強個体/ボス級) ----
// 雑魚=60ms(約4フレーム)・強個体(パンプキン/削岩型/伐採人)=40ms・ボス級/終端=0(=止めない。
// ボスは体勢値・KB耐性(evaluateBossStopDr)が既にあり、殴るたびに止まると技の予告が崩れる)。
// ★v0.25.4377(社長指示2026-09-16「食らった時に多少動けるようになるのにディレイがお互いに必要」):
// 60→120 / 40→70 へ。**のけぞりの絵は280msあるのに実際に止まっているのは60ms**で、絵と実態が
// 4.7倍ズレていた(=大げさな絵のわりに手応えが無い、の正体)。倍にして絵の尺へ寄せる。
/**
 * ★銃の「押し」を「止め」へ振り替えた分の物差し(社長指示2026-09-17
 * 「**銃のノックバックやめてみよう、同等のストップのみにしてみよう**」)。
 *
 * 旧実装は当たった弾すべてが敵を押していた(`knockbackEnemy`。ショットガン×1.35 /
 * PHILL銃の胴体×2 / アタックシューター覚醒は近接と同じ満額)。押すのをやめ、
 * **同じ重みを止めの長さへ写す**——手応えの差(散弾は重い・覚醒は重い)は残る。
 *
 * 基準は旧ノックバックの尺(`KNOCKBACK_DURATION`=280ms)に合わせた=「同等のストップ」。
 */
export const GUN_STOP_BASE_MS = 280;
/** 押しの強さの上限(旧 `knockbackEnemy` の maxStrength=3 と同じ)。 */
export const GUN_STOP_MAX_MULT = 3;
/** アタックシューター覚醒(Lv3)=近接と同じ重み。旧実装も満額のKBだった。 */
export const GUN_STOP_AWAKEN_MULT = 3;
/**
 * ★止めの占有率の上限(社長指摘2026-09-17「**まだまだごり押しできるな**」の是正)。
 *
 * 旧ノックバックには `HIT_STUN_REARM_MS`(400ms)の再発火ガードがあり、**止めは30%しか効かなかった**。
 * 振り替えの時にそれを外したため、**撃ち続けると止めが効きっぱなし**になり、
 * 実測で bat は 200→60px に詰めるのが **3.8秒 → 28.0秒(7倍)**、skeleton は 3.3→26.0秒(8倍)になっていた。
 * **=撃つだけで敵が近づけない=ごり押しの正体。**
 *
 * ⇒ **止め1回ごとに、その長さに比例した「効かない時間」を置く**。占有率はこの値で決まる。
 * 0.30 = 旧実装と同じ30%。**1発ごとの手応え(280ms/840ms)は変えずに、頻度だけ抑える。**
 */
export const GUN_STOP_DUTY = 0.30;

/**
 * ★攻撃中スーパーアーマー(社長裁定2026-09-17「**攻撃中スーパーアーマーで採用してみよう**」)。
 *
 * **技を実行中の敵は、クリティカル以外では中断もノックバックもされない。**
 * ここまでの裁定(銃撃は何も止めない / 中断できるのはクリティカルだけ)を**近接・爆発・押し道具にも広げ**、
 * **武器ごとに分かれていた規則を1本にする**——プレイヤーが覚えることが減る。
 * エルデンリングの敵の攻撃モーションが体勢崩し以外では止まらないのと同じ。
 *
 * ★**述語は1つだけ**にする。同じ意味の式を2箇所に書くと必ずズレる(このプロジェクトの実績)。
 * `updateEnemies` の被弾硬直ガードと `knockbackEnemy` の両方がこれを読む。
 *
 * ★**気絶(クリティカル)中は false**=スーパーアーマーは切れる。クリで止めた敵は押せる。
 * ★`zpause`(ゾンビの紫の停止)は**含める**——あれは技の予告であって「何もしていない」ではない。
 */
export const isEnemyAttacking = (
  e: {
    aiPhase?: string; chaffMove?: string; biteAt?: number;
    stunUntil?: number; bossFullStunUntil?: number;
  },
  gameTime: number,
): boolean => {
  // クリティカルの気絶中はアーマー無し(=押せる・止められる)。
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return false;
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return false;
  if (e.chaffMove !== undefined) return true;              // §16の技を実行中
  if (e.biteAt !== undefined && e.biteAt > 0) return true;  // 噛みつきを構えている/振っている
  return e.aiPhase !== undefined;                           // 技の相にいる(予告を含む)
};

export const HIT_STUN_MS_MOB = 120;
export const HIT_STUN_MS_STRONG = 70;
// 再発火の間(ms)。連射銃(最速100ms間隔)で毎発止めると「時間の6割止まる=実質の減速」になるので、
// 前の止めの開始から REARM だけは新しい止めを書かない(最悪でも 60/260≒23%)。★社長判断待ちの暫定値。
// ★v0.25.4377: 止めを倍にしたので、**ガードも倍**にして連射時の拘束率を据え置く
// (止まっている割合 = 止めの長さ ÷ ガード = 120/400 = 30% で 60/200 と同じ)。
// ここを据え置くと連射で6割止まる=実質のハメになるため、**必ずセットで動かす**。
export const HIT_STUN_REARM_MS = 400;
export const hitStunMsFor = (type: EnemyType): number => {
  if (isPumpkinTier(type)) return HIT_STUN_MS_STRONG;
  if (isBossType(type)) return 0;
  return HIT_STUN_MS_MOB;
};
/**
 * 新しい hitStunUntil(書かないなら undefined)。prevUntil=その敵の今の値。
 * 再発火ガード: 前の止めの開始(prevUntil − その区分の長さ)から REARM 未満なら書かない。
 */
export const nextHitStunUntil = (
  type: EnemyType, prevUntil: number | undefined, nowMs: number,
  // ★被弾リアクションの強さ(`utils/hitFlinch.ts`)。社長指示2026-09-17「**停止時間もそれによって
  // 長く設けるなどしたい**」。**重い一発ほど画面が長く止まる**=手応えの本体。
  // 省略時は1(=従来どおり区分の固定値)。★再発火ガードは**区分の基準値**で測る(伸ばした側の
  // 長さで測ると、重い一発の後だけガードが利かなくなる)。
  reactionMul = 1,
): number | undefined => {
  const ms = hitStunMsFor(type);
  if (ms <= 0) return undefined;
  if (prevUntil !== undefined && nowMs < prevUntil - ms + HIT_STUN_REARM_MS) return undefined;
  return nowMs + Math.round(ms * reactionMul);
};

// ---- ② 連続撃破の段 ----
// 前のキルから KILL_CHAIN_WINDOW_MS 以内なら連鎖が続く。段は 3/5/10 体(数字は画面に出さない=
// 音の高さと画面端の色で伝える。10体でごく短いスロー)。
export const KILL_CHAIN_WINDOW_MS = 2500;
export const KILL_CHAIN_TIER_COUNTS = [3, 5, 10] as const;
export interface KillChainState { count: number; lastAt: number }
export const stepKillChain = (s: KillChainState, nowMs: number, kills = 1): KillChainState =>
  (nowMs - s.lastAt <= KILL_CHAIN_WINDOW_MS ? { count: s.count + kills, lastAt: nowMs } : { count: kills, lastAt: nowMs });
export const killChainTier = (count: number): 0 | 1 | 2 | 3 => {
  if (count >= KILL_CHAIN_TIER_COUNTS[2]) return 3;
  if (count >= KILL_CHAIN_TIER_COUNTS[1]) return 2;
  if (count >= KILL_CHAIN_TIER_COUNTS[0]) return 1;
  return 0;
};
// 撃破SE(zombie-1〜4)のピッチ倍率。段が上がるほど高く(1.0/1.06/1.12/1.19≒+1/+2/+3半音)。
// 1発ごとに ±KILL_CHAIN_SFX_JITTER で揺らす(同じ段でも同じ声にならない)。
// ★上げる/下げるの方向は社長へ戻している(監査: 断末魔を上げると軽く聞こえる懸念)。
export const KILL_CHAIN_SFX_RATE = [1, 1.06, 1.12, 1.19] as const;
export const KILL_CHAIN_SFX_JITTER = 0.03;
export const killChainSfxRate = (tier: number, rand = 0.5): number =>
  KILL_CHAIN_SFX_RATE[Math.max(0, Math.min(3, tier))] * (1 + (rand * 2 - 1) * KILL_CHAIN_SFX_JITTER);
// 段が上がった瞬間の画面端の脈(pixiScene が killChainEdge の alpha に乗せる)。
// 段1・2=一拍(立ち上がり12%→二次で引く)。段3(10体)=二拍(心音の語彙・setHeartbeatLoop と同じ形)。
export const KILL_CHAIN_EDGE_PULSE_MS = [0, 260, 340, 620] as const;
export const killChainEdgePulseMs = (tier: number): number => KILL_CHAIN_EDGE_PULSE_MS[Math.max(0, Math.min(3, tier))];
const beat = (t: number, len: number): number => {
  if (t < 0 || t >= len) return 0;
  const rise = Math.min(1, t / (len * 0.12));
  const k = 1 - t / len;
  return rise * k * k;
};
/** 画面端の強さ 0..1(段と経過msから)。段3は 0〜260ms の一拍目と 200ms〜 の二拍目(二拍目が強い)。 */
export const killChainEdgeEnvelope = (tier: number, elapsedMs: number): number => {
  const len = killChainEdgePulseMs(tier);
  if (len <= 0 || elapsedMs < 0 || elapsedMs >= len) return 0;
  if (tier >= 3) return Math.max(beat(elapsedMs, 260) * 0.7, beat(elapsedMs - 200, len - 200));
  return beat(elapsedMs, len) * (tier >= 2 ? 1.25 : 1);
};
// 10体到達のスロー(短く・浅く。KILL演出のフル版=0.2×1秒級とは別物の「息を呑む一瞬」)。
export const KILL_CHAIN_SLOW_SCALE = 0.55;
export const KILL_CHAIN_SLOW_MS = 240;
export const KILL_CHAIN_SLOW_HOLD_MS = 60;

// ---- ③ 銃の反動 ----
// カメラキック: 撃った瞬間に射線の逆へ画面がわずかに蹴られ、ease-outで戻る(pixiScene・描画のみ)。
// 大きさは**武器ごと**に「1発の威力(damage×count)」から出す(カテゴリ表で均質にしない)。散弾は
// 1発で全弾同時に出る重さ=×1.8。押し武器(knockbackMult)はその平方根を掛ける。長さは発射間隔の75%
// (=次弾が来る前に必ず戻り切る。連射銃ほど短い蹴り)。重い銃(kickPx≥5)だけ戻りがゼロを僅かに越える
// オーバーシュート=「体が立て直す」形で重さを分ける。
export interface RecoilSpec { kickPx: number; kickMs: number; overshoot: number }
export interface RecoilWeaponLike { category?: WeaponCategory; damage: number; count?: number; cooldown: number; knockbackMult?: number }
export const RECOIL_KICK_MAX_PX = IMPACT_BASE_MAX;
export const RECOIL_HEAVY_PX = 5;
// 重い銃の立て直し(反対側へ行き過ぎて戻る)の深さ。0.15 は −0.3px で目に見えなかった(v0.25.4285 クリエイティブ監査8)。
export const RECOIL_OVERSHOOT = 0.5;
// 揺れの整理(research/SHAKE_UNIFY.md §2-4・社長承認2026-09-14): 銃の1層目(純粋なダメージ)は発砲時のキックで出す。
// 振幅は impactBase(1発の総威力)×レート正規化(連射は 間隔/300 倍=1秒あたりの揺れ量の天井)。旧「基礎1.6+威力×0.055」
// と √減衰の別枠(rapidFireKickMult)は撤去=命中揺れと同じ曲線・同じ土台から出る。床は無し(弱い銃は小さいまま)。
export const recoilSpecForWeapon = (w: RecoilWeaponLike, damageMult = 1): RecoilSpec => {
  const shot = Math.max(0, w.damage) * Math.max(1, w.count ?? 1) * damageMult
    * (w.category === 'shotgun' ? 1.8 : 1) * Math.sqrt(Math.max(1, w.knockbackMult ?? 1));
  const kickPx = impactBase(shot) * impactRateMult(w.cooldown);
  const kickMs = Math.max(60, Math.min(190, Math.round(w.cooldown * 0.75)));
  return { kickPx, kickMs, overshoot: kickPx >= RECOIL_HEAVY_PX ? RECOIL_OVERSHOOT : 0 };
};
// キックのオフセット(px・射線の逆向きに掛ける大きさ)。t=残り/長さ(1→0)。
// 撃った瞬間が最大で二次のease-out(最初速く戻り、終わりでゆっくり止まる)=慣性MUST。
// overshoot>0 なら t≈0.2 付近でわずかに負(反対側へ行き過ぎて戻る)。
export const recoilKickOffset = (kickPx: number, remainingMs: number, kickMs: number, overshoot = 0): number => {
  if (remainingMs <= 0 || kickMs <= 0) return 0;
  const t = Math.min(1, remainingMs / kickMs);
  return kickPx * (t * t - overshoot * 4 * t * (1 - t) * (1 - t));
};
// キックの向き: 射線の逆(bx,by)に、垂直方向のぶれ(最大±25%)を1発ごとに混ぜる。rand=0..1。
export const RECOIL_LATERAL_JITTER = 0.25;
// v0.25.4285(クリエイティブ監査7): 横ぶれは左右対称の乱数ではなく**利き手側へ片寄る**(実銃は同じ側へ「上がって流れる」)。
// 大きさは 35〜100% の間で1発ごとに揺れる=散らばりではなく傾向。
export const RECOIL_LATERAL_BIAS_MIN = 0.35;
export const recoilKickDir = (bx: number, by: number, rand: number): { x: number; y: number } => {
  const l = Math.hypot(bx, by);
  if (l < 1e-6) return { x: 0, y: 0 };
  const ux = bx / l, uy = by / l;
  const j = (RECOIL_LATERAL_BIAS_MIN + (1 - RECOIL_LATERAL_BIAS_MIN) * rand) * RECOIL_LATERAL_JITTER;
  const x = ux + -uy * j, y = uy + ux * j;
  const n = Math.hypot(x, y);
  return { x: x / n, y: y / n };
};

// 薬莢: 射線に対して右手側(top-downでは射線を時計回りに90°回した向き)へ、上向きの初速をつけて
// 放り出し、重力で落ちて**床に着いて止まる**(particle の floorY)。レールガン/PHILL/ランチャー/
// 非投射は薬莢を出さない(実弾ではない/砲身式)。二丁は左右へ2つ。ショットガンは赤い散弾殻、他は真鍮。
// 色は数枚の中から1発ごとに選ぶ(全部同じ色にしない)。
export interface CasingSpec { colors: readonly string[]; size: number; sides: readonly number[] }
const BRASS = ['#d4a03a', '#c58f2c', '#e2b34b', '#b9862a'] as const;
const SHELL_RED = ['#b91c1c', '#a11616', '#c92a2a'] as const;
export const casingSpecFor = (w: { category?: WeaponCategory; key?: string; count?: number; nonProjectile?: boolean }): CasingSpec | null => {
  if (w.nonProjectile) return null;
  if (w.key === 'rifle-t3-railgun') return null;
  if (w.category === 'phill' || w.category === 'glauncher') return null;
  if (w.category === 'shotgun') return { colors: SHELL_RED, size: 3, sides: [1] };
  if (w.category === 'handgun' && (w.count ?? 1) >= 2) return { colors: BRASS, size: 2.2, sides: [1, -1] };
  return { colors: BRASS, size: 2.2, sides: [1] };
};
export const CASING_SIDE_SPEED = 70;   // 右手側へ(px/s)
export const CASING_UP_SPEED = 90;     // 画面上へ(px/s)=弧を描いて落ちる
export const CASING_BACK_SPEED = 25;   // 射線の逆へ少し
export const CASING_GRAVITY = 460;     // px/s²
export const CASING_DURATION_MS = 720; // 着地して一拍置いてから消える
export const CASING_FLOOR_DROP_PX = 14; // 発射点からこれだけ下が床(足元)
export const CASING_BOUNCE = 0.35;      // 1回だけ小さく跳ねる
export const CASING_SPIN_RAD_S = 18;    // 空中のタンブル
// 射線(dx,dy: 単位ベクトル)と側(+1=右手/−1=左手)から薬莢の初速を出す。rand は 0..1(散らし)。
export const casingVelocity = (dx: number, dy: number, side: number, rand: number): { vx: number; vy: number } => {
  const px = -dy * side, py = dx * side;
  const sp = CASING_SIDE_SPEED * (0.7 + rand * 0.6);
  return {
    vx: px * sp - dx * CASING_BACK_SPEED,
    vy: py * sp - dy * CASING_BACK_SPEED - CASING_UP_SPEED * (0.8 + rand * 0.4),
  };
};
/** 床つき粒の1歩(updateEffects から)。床に達したら1回跳ね、遅ければ止まる。 */
export const stepFloorParticle = (
  y: number, vx: number, vy: number, floorY: number,
): { y: number; vx: number; vy: number; rested: boolean } => {
  if (y < floorY || vy <= 0) return { y, vx, vy, rested: false };
  if (vy > 80) return { y: floorY, vx: vx * 0.55, vy: -vy * CASING_BOUNCE, rested: false };
  return { y: floorY, vx: 0, vy: 0, rested: true };
};

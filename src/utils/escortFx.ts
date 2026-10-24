// 進軍NPC(軍人)の被弾・倒れる・起き上がりの「血と音」(research/ESCORT_TARGETED.md §7 項10)。
// 発火は store の入口に置く: 被弾/倒れる=damageEscort(被弾1回=1回)、起き上がり=noteEscortScene('revived')
// (stepEscortLife の riseAt の立ち上がり=1回)。描画(Pixi)は store に書かないので、ここが「立ち上がりの検出点」。
// 体の見た目(滑り・沈み・影・体力の線・白フラッシュ)は描画側が store の値を読んで出す。
//
// 血・砂埃は派手さの絵(判定ゼロ)=大きく出す。音は既存素材だけ(新素材は作らない)。**既に意味を持つ音を別の意味に使わない**
// (クリエイティブ監査 DC-1 #17〜#19): プレイヤーの攻撃が当たった音(slash-damage)・ボスの大技の音(heavy-impact)・武器を拾った音(weapon-pickup)は避ける。
//  被弾=player-damage を低く小さく(肉の当たる鈍い音・本人の被弾より控えめ)/ 倒れる=jump-land を低く(体が地面に着く鈍い音。着地の瞬間に鳴らす)
//  / 起きる=reload の頭だけ(装具の短い金属音)。いずれも npcSfxDistGain の距離減衰を通す(画面外=無音)。自力で起きる時は音を小さく(§7)。
//  被弾音は4人が同時に噛まれても連打にならないよう共通の間引き(ESCORT_HIT_SFX_CD_MS)を通す。
// ★社長の素材待ち(叩き台): 倒れる音・起きる音は専用素材があれば差し替える(SFX_KEYS だけ直せばよい)。
import type { EscortSoldier } from '../types/game';
import { escortCenter } from './escortHealth';
import { npcSfxDistGain } from './npcSfx';

export type EscortSfxKey = 'player-damage' | 'jump-land' | 'reload';

/** 音の当て方(差し替え口)。 */
export const ESCORT_SFX_KEYS = { hit: 'player-damage', down: 'jump-land', rise: 'reload' } as const satisfies Record<string, EscortSfxKey>;
/** 音量の叩き台。被弾=本人の被弾より小さく / 倒れる=鈍い音は主張しすぎない / 自力の起き上がり=音を小さく。 */
export const ESCORT_SFX_GAIN = { hit: 0.6, down: 0.8, rise: 0.8, riseSelf: 0.28 } as const;
/** 再生速度(1未満=低く鈍く)と、長尺の音源を頭だけで切る長さ(ms)。 */
export const ESCORT_SFX_RATE = { hit: 0.82, down: 0.85, rise: 1 } as const;
export const ESCORT_RISE_SFX_CUT_MS = 300;
/** 被弾音の共通の間引き(ms・gameTime)。囲まれて4人が1秒以内に噛まれても連打にしない。 */
export const ESCORT_HIT_SFX_CD_MS = 250;
/** 倒れ込みの砂埃(土色・足元・判定ゼロの派手さの絵)。 */
export const ESCORT_LAND_DUST: readonly { color: string; count: number }[] = [{ color: '#8a7350', count: 24 }, { color: '#5a4a36', count: 14 }];
/** 血の勢い(spawnBlood の len=粒数 len/4・上限56粒)。判定ゼロの派手さの絵=大きく。 */
export const ESCORT_BLOOD_LEN = { hit: 200, down: 260 } as const;

export interface EscortFxApi {
  spawnBlood: (x: number, y: number, angle: number, len: number) => void;
  playSfx: (key: EscortSfxKey, gain: number, opts?: { rate?: number; ms?: number }) => void;
  spawnBurst: (x: number, y: number, color: string, count: number) => void;
}

export interface EscortFxView {
  playerX: number; playerY: number; // プレイヤーの中心(距離減衰の基準)
  camera: { x: number; y: number };
  gameBounds: { width: number; height: number };
  /** 被弾音の共通の間引きに使う時計(gameTime ms)。 */
  gameTime: number;
}

let lastHitSfxAt = -1e9;
/** 被弾音の間引きの時計を戻す(新しい出撃・テスト)。 */
export const resetEscortFxClock = (): void => { lastHitSfxAt = -1e9; };

const gainAt = (esc: Pick<EscortSoldier, 'x' | 'y'>, v: EscortFxView): number => {
  const c = escortCenter(esc);
  return npcSfxDistGain(c.x, c.y, v.playerX, v.playerY, v.camera, v.gameBounds);
};

/** 被弾した(damageEscort が dealt>0 を返した)直後。esc=被弾後の軍人(lastHitDir を持つ)。 */
export const escortHitFx = (api: EscortFxApi, esc: EscortSoldier, downedNow: boolean, v: EscortFxView): void => {
  const c = escortCenter(esc);
  const dx = esc.lastHitDirX ?? 0, dy = esc.lastHitDirY ?? 0;
  const hasDir = Math.hypot(dx, dy) > 0.001;
  // 血は被弾源から離れる向きへ飛ぶ(spawnMeleeBlood と同じ出し方=体の中心から外向き)。向きが無い時は真上。
  const angle = hasDir ? Math.atan2(dy, dx) : -Math.PI / 2;
  const off = hasDir ? 10 : 0;
  api.spawnBlood(c.x + (hasDir ? dx * off : 0), c.y + (hasDir ? dy * off : 0), angle, downedNow ? ESCORT_BLOOD_LEN.down : ESCORT_BLOOD_LEN.hit);
  // 倒れる音は着地の瞬間(escortLandFx)に鳴らす=体が地面に着くのと音を合わせる。ここは被弾の音だけ。
  const g = gainAt(esc, v);
  if (g <= 0) return;
  const sinceHit = v.gameTime - lastHitSfxAt;
  if (sinceHit >= 0 && sinceHit < ESCORT_HIT_SFX_CD_MS) return; // 負=新しい出撃で時計が巻き戻った(間引かない)
  lastHitSfxAt = v.gameTime;
  api.playSfx(ESCORT_SFX_KEYS.hit, g * ESCORT_SFX_GAIN.hit, { rate: ESCORT_SFX_RATE.hit });
};

/** 倒れ込みが地面に着いた瞬間(倒れる動きの尺が経った1回)。足元(x,y)に土の砂埃と、体が着く鈍い音。 */
export const escortLandFx = (api: EscortFxApi, x: number, y: number, v: EscortFxView): void => {
  for (const d of ESCORT_LAND_DUST) api.spawnBurst(x, y - 2, d.color, d.count);
  const g = gainAt({ x, y }, v);
  if (g > 0) api.playSfx(ESCORT_SFX_KEYS.down, g * ESCORT_SFX_GAIN.down, { rate: ESCORT_SFX_RATE.down });
};

/** 起き上がった(riseAt の立ち上がり)。self=自力(音を小さく)。 */
export const escortRiseFx = (api: EscortFxApi, esc: EscortSoldier, self: boolean, v: EscortFxView): void => {
  const g = gainAt(esc, v);
  if (g <= 0) return;
  api.playSfx(ESCORT_SFX_KEYS.rise, g * (self ? ESCORT_SFX_GAIN.riseSelf : ESCORT_SFX_GAIN.rise), { rate: ESCORT_SFX_RATE.rise, ms: ESCORT_RISE_SFX_CUT_MS });
};

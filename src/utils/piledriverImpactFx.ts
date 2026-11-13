// パイルドライバー(handgun-t3-piledriver)の弾が敵に刺さった瞬間の手応え(社長指示2026-11-13「もっとパイルドライバーっぽく」)。
// ★見た目と音だけ。判定・ダメージ・押し・体勢は呼び手(useGameLoop の弾の着弾処理)の既存のまま。
// 杭そのもの・火花・前へ偏った衝撃の楕円・背中へ抜ける破片・蒸気は pixi/pileDriverFx.ts が描く
// (杭と火花だけを刺さった瞬間に2〜3フレーム止めるため、描画側に持つ)。ここは store 経由のものだけ:
//   打撃の塊(既存の近接ヒットの実写VFX。鋼の灰紫に寄せ、杭の先を隠さないよう前へずらして撃った向きへ伸ばす)・
//   敵の足元の砂埃(押される向きへ流れる)・短く重い画面の揺れ(弾の向き)・金属が打ち込まれる音(ワイヤーアンカーの打ち込み音)。
// 2分類(CLAUDE.md): 全部「派手さの絵」(判定ゼロ)。
// 負荷: 着弾1回で VFX1+煙2(既存のプール経路)。撃つ間隔450ms。強glow(投影影)は使わない。
import { useGameStore } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import { notePileHit } from './pileHitLog';
import { MELEE_HIT_MS } from './meleeHitFrames';

const PILE_DUST_TINT = 0x8a7f9c; // 地面の土の灰に紫を少し混ぜる(塊弾の土埃と同じ色)
/** 打撃の塊の色(素材の水色を鋼の灰紫へ寄せる)。 */
const PILE_BURST_TINT = 0x9d93b4;
/** 打撃の塊を杭の先からどれだけ前(敵の奥)へずらすか・大きさ・撃った向きへの伸ばし。 */
const PILE_BURST_FWD_PX = 40;
const PILE_BURST_SIZE = 52;
const PILE_BURST_SX = 1.25;
/** 揺れ: 被弾(16)より小さく・銃の命中の揺れ(天井11)の内側。短く重く。 */
const PILE_SHAKE_MS = 130;
const PILE_SHAKE_MAG = 7;
const PILE_SFX_GAIN = 1.6;

/**
 * @param projectileId 刺さった弾の id(描画が杭を合わせる鍵)
 * @param tipX/tipY 杭の先(=弾の中心。宙の敵は呼び手が持ち上げた高さ)
 * @param dirX/dirY 弾の向き(正規化前でよい)
 * @param footX/footY 当たった敵の足元
 */
export const spawnPiledriverImpactFx = (
  projectileId: string, tipX: number, tipY: number, dirX: number, dirY: number, footX: number, footY: number,
): void => {
  const st = useGameStore.getState();
  const dl = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / dl, uy = dirY / dl;
  const now = Date.now();
  notePileHit({ id: projectileId, x: tipX, y: tipY, dirX: ux, dirY: uy, at: now }); // 杭・火花・衝撃は pixi/pileDriverFx がこれを読んで描く
  st.spawnEffect({
    kind: 'meleeHit', id: `pile-hit-${now}-${(Math.random() * 1e6) | 0}`,
    x: tipX + ux * PILE_BURST_FWD_PX, y: tipY + uy * PILE_BURST_FWD_PX,
    size: PILE_BURST_SIZE, tint: PILE_BURST_TINT, sx: PILE_BURST_SX, rot: Math.atan2(uy, ux),
    createdAt: now, duration: MELEE_HIT_MS,
  });
  // 敵の足元の砂埃: 押される向きへ大きく、逆へ小さく。
  st.spawnSmoke(footX + ux * 10, footY, 30, 130, PILE_DUST_TINT, { alpha: 0.55, duration: 700, hRatio: 0.3, driftX: ux * 70, driftY: uy * 20 });
  st.spawnSmoke(footX - ux * 8, footY, 20, 80, PILE_DUST_TINT, { alpha: 0.4, duration: 520, hRatio: 0.3, driftX: -ux * 30 });
  st.triggerShake(PILE_SHAKE_MS, PILE_SHAKE_MAG, ux, uy);
  playSfx('anchor-plant', PILE_SFX_GAIN);
};

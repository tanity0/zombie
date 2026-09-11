// 開発施設の棚(未解放のサブウェポン)に出す一言。「解放して装備可能に」が8行並ぶ均質さを崩すため
// (クリエイティブ監査2026-09-11 #17)。★各行は subWeaponUpgradeNotes.ts の根拠コメント
// (実コードを読んで書かれたもの)から起こした=推測で書かない。数値は書かない。
import type { SubWeaponKey } from '../types/game';

const BLURB: Partial<Record<SubWeaponKey, string>> = {
  dog: '落ちた物を拾いに走る相棒',
  katana: '踏み込んで斬る一閃',
  decoy: '弾を落とす囮。時間で消える',
  shield: '置く盾。耐えた分だけ削れる',
  whip: '長い間合いの一振り。当て続けると渦を起こす',
  alchemy: '仲間を一体呼び出す',
  turret: '置くと勝手に撃つ。時間で消える',
  'fire-knife': '投げて刺さり、爆ぜる',
  'drone-boomerang': '飛んで戻る回転刃。先端でしばらく留まる',
  'gold-ring': '光の線を伸ばして焼く',
};

/** 未解放の棚に出す一言。台帳に無い物は「未解放」だけを返す(嘘を書かない)。 */
export const subWeaponBlurb = (key: SubWeaponKey): string => BLURB[key] ?? '未解放';

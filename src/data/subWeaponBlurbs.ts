// 開発施設の棚(未解放のサブウェポン)に出す一言。「解放して装備可能に」が並ぶ均質さを崩すため
// (クリエイティブ監査2026-09-11 #17)。★各行は subWeaponUpgradeNotes.ts の根拠コメント(実コードを
// 読んで書かれたもの)と、当該サブの実装コメント(useGameLoop/gameStore/goldRing/summonUtils)から
// 起こした=推測で書かない。数値は書かない。棚に並ぶ全種(SUB_WEAPON_KEYS−クラス固有−退役+金環)を埋める。
import type { SubWeaponKey } from '../types/game';

const BLURB: Partial<Record<SubWeaponKey, string>> = {
  dog: '落ちた物を拾いに走る相棒',
  katana: '踏み込んで斬る一閃',
  decoy: '敵弾を撃ち落とす囮',
  shield: '据える盾。耐えた分だけ削れる',
  whip: '長い間合いの一振り。当て続けると渦を起こす',
  alchemy: '仲間を呼ぶ。三体まで居残る',
  turret: '据えれば勝手に撃つ。長くは持たない',
  'fire-knife': '投げて刺さり、爆ぜる',
  'drone-boomerang': '飛んで戻る回転刃。先端でしばらく留まる',
  'wire-anchor': '射って刺し、そこまで飛ぶ',
  homing: 'ロックした敵へ曲がって飛ぶ弾。まとめて撃つ',
  'shadow-clone': '分身が横で殴る。長くは居ない',
  molotov: '投げて床を燃やす瓶',
  'first-aid-kit': '開けると補給が出る鞄',
  'sensor-mine': '踏まれる前に感知して爆ぜる地雷',
  'support-sniper': '呼ぶと、遠くから一発入る',
  'flare-gun': '撃ち込んだ炎が敵の目を引く',
  'junk-weapon': 'スクラップを弾にして撃つ',
  'gold-ring': '敵の両脇に二基据え、線で挟んで焼く',
};

/** 未解放の棚に出す一言。台帳に無い物は「未解放」だけを返す(嘘を書かない)。 */
export const subWeaponBlurb = (key: SubWeaponKey): string => BLURB[key] ?? '未解放';

// UI正式採用。比較時だけ ?design=0 で旧版へ戻す。背景のプレビューフラグとは別管理。
export const COMMAND_UI_ENABLED = typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('design') !== '0';

export const REGION_ART: Readonly<Record<string, string>> = {
  'stage-tutorial': 'tutorial-far.jpg',
  'stage-1': 'distant-night-panorama.jpg',
  'stage-2': 'stage2-lab-far.jpg',
  'stage-3': 'stage3-distant-city-day.jpg',
  'stage-4': 'stage4-far.jpg',
  'stage-5': 'stage5-far.jpg',
  'stage-7': 'stage7-far.jpg',
};

/**
 * 同じ景色が左右に2回並んだ絵(=横に繋がる遠景の素材)。PC の横長では全幅を映すと繰り返しが見えるので、
 * 横長の時だけ幅を1.45周ぶんに広げて左へずらし、同じ目印(ランタン)が2度映らない範囲だけを映す(社長「はい」2026-10-02・research/PC_SUPPORT.md §8-2)。
 * 1周ちょうど(200%)は寄りすぎて岩の接写になり、目印がカードの右端=矢印の真下に来た(クリエイティブ監査 B-1〜B-3)。縦は天井の光の層(40%)で切る。
 * 判定は左右の差分の実測(tutorial-far だけが周期 836=幅の半分で一致。ほかの絵は周期を持たない)。
 */
export const REGION_ART_TWICE: ReadonlySet<string> = new Set(['tutorial-far.jpg']);
/** 横長で絵の1周ぶんだけを映すクラス(縦持ちは空=従来どおり)。 */
export const regionArtWideClass = (art: string | undefined): string =>
  art && REGION_ART_TWICE.has(art) ? 'landscape:!w-[145%] landscape:!max-w-none landscape:!left-[-12%] landscape:!object-[50%_40%]' : '';

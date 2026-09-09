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

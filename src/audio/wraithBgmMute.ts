// 亡霊戦の曲の消し方(iPhone/iPad 用・research/WRAITH_MUTANT.md §12-4)。純関数。
// iPhone/iPad のブラウザは音声要素の音量の書き込みを無視する=近さに比例した曲の下げが効かない。
// そこで近さ(mix)が半分を超えたら曲を消し、少し離れたら戻す(行き来の境目でパタつかないよう幅を持たせる)。

/** 近さがこれ以上で曲を消す(声が半分ほど聞こえる距離=花や墓石が生え始める辺り)。 */
export const WRAITH_BGM_MUTE_ON = 0.5;
/** 近さがこれ未満に戻ったら曲を戻す。 */
export const WRAITH_BGM_MUTE_OFF = 0.4;

export const wraithBgmMuteNext = (mutedNow: boolean, mix: number): boolean =>
  mutedNow ? mix >= WRAITH_BGM_MUTE_OFF : mix >= WRAITH_BGM_MUTE_ON;

/** 音量の書き込みが効かない端末か(iPhone/iPad。iPadOS は Mac と名乗るのでタッチの点数で見分ける)。 */
export const isVolumeLockedDevice = (ua: string, platform: string, maxTouchPoints: number): boolean =>
  /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);

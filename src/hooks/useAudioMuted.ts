import { useSyncExternalStore } from 'react';
import { isAudioMuted, subscribeAudioMuted } from '../audio/audioManager';

/**
 * 「音なし」(ミュート)の今の値。ミュートのボタン・オプションの「音なし」・ゲーム中の音のボタンが同じ値を見る
 * (どこで切り替えても全部が揃う)。値が変わった時だけ再描画する(毎フレームは起きない)。
 */
export const useAudioMuted = (): boolean => useSyncExternalStore(subscribeAudioMuted, isAudioMuted, isAudioMuted);

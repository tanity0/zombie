// 音声要素の「つまみ」(GainNode)まわりの純関数(audioManager の createAudioElement が使う)。
// マナーモード(消音スイッチ)で全部の音を黙らせるため、音声要素は WebAudio に通して鳴らす
// (社長方針2026-10-30「マナーモードで音が消えるは、むしろいい。他のゲームもそう」)。
// 通した要素の音量は element.volume ではなく、その要素専用のつまみで付ける。

/**
 * つまみに書く値。element.volume と同じ 0〜1 に収める(element.volume は範囲外で例外を投げるが、
 * つまみは投げない=範囲外の値は端へ寄せる)。数でない値は書かない(直前の値を保つ)。
 */
export const clampElementLevel = (value: number, prev: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return prev;
  return Math.max(0, Math.min(1, value));
};

/**
 * いま WebAudio に通してよいか。止まっている(suspended / interrupted)コンテキストに通すと、
 * 動き出すまで無音になる=通さず素のまま鳴らし、動き出した時に通す(オープニングを無音にしないため)。
 */
export const canRouteElementNow = (routingEnabled: boolean, ctxState: string | null): boolean =>
  routingEnabled && ctxState === 'running';

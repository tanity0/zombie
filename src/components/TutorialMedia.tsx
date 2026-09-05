// チュートリアルの手本(mp4/GIF/静止画)の表示。**ゲーム中のポップアップと資料室で共用**する
// (同じ表示規則を2箇所で管理しない=台帳が1つなのと同じ原則)。
//
// 社長指示v0.25.2298「各チュートリアルの映像、流れない時間があるので、その時はローディング中
// くるくるしたい」: 動画は読み込みが終わるまで最初のコマすら出ないので、**枠が真っ黒のまま数秒**に
// なることがある(初回・回線が細い時・キャッシュが冷えた直後)。その間はスピナーを重ねて
// 「読み込み中」だと分かるようにする。
//  - 動画: `canplay`(=再生を始められる)で消す。途中で詰まったら `waiting`/`stalled` で出し直す。
//  - 画像/GIF: `load` で消す。
//  - 読み込みに失敗した場合はスピナーを回し続けない(止まった表示にする)。
import React, { useState } from 'react';
import { assetUrl } from '../config/assetUrl';
import { isVideoAsset } from '../data/tutorials';

const Spinner: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
    {/* ローディング画面/タイトルと同じ見た目のスピナー(この作品の「読み込み中」の型)。 */}
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400/20 border-t-white/75" />
  </div>
);

interface TutorialMediaProps {
  /** public/ 相対パス(台帳の `img`)。 */
  src: string;
  /** 枠の中での配置。ポップアップは絶対配置、資料室は通常配置。 */
  className?: string;
}

const TutorialMedia: React.FC<TutorialMediaProps> = ({ src, className = 'h-full w-full object-cover' }) => {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const url = assetUrl(src);

  return (
    <>
      {isVideoAsset(src) ? (
        // iOSで確実にインライン自動再生させるための3点セット: muted / playsInline / autoPlay。
        <video
          src={url}
          className={className}
          autoPlay loop muted playsInline preload="auto"
          onCanPlay={() => setLoading(false)}
          onPlaying={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onStalled={() => setLoading(true)}
          onError={() => { setLoading(false); setFailed(true); }}
        />
      ) : (
        <img
          src={url}
          alt=""
          className={className}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
        />
      )}
      {loading && !failed && <Spinner />}
    </>
  );
};

export default TutorialMedia;

import React from 'react';
import { usePlayDevice } from '../utils/inputDevice';

// 画面の言葉を操作に合わせる(research/PC_SUPPORT.md §11-6)。スマホ=「タップ」、マウス=「クリック」、パッド=「ボタン」。
const TapWord: React.FC = () => {
  const d = usePlayDevice();
  return <>{d === 'mouse' ? 'クリック' : d === 'pad' ? 'ボタン' : 'タップ'}</>;
};
export default TapWord;

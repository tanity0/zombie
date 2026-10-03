import React from 'react';
import { usePointerKind } from '../utils/inputDevice';

// 画面の言葉を操作に合わせる(research/PC_SUPPORT.md §11-6)。スマホ=「タップ」、PC(マウス)=「クリック」。
const TapWord: React.FC = () => <>{usePointerKind() === 'mouse' ? 'クリック' : 'タップ'}</>;
export default TapWord;

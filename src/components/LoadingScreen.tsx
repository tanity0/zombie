import React from 'react';

interface LoadingScreenProps {
  benchmarkMode?: boolean;
  startup?: boolean; // 起動時の全素材ダウンロード用
  // 出撃時のレンダラ初期化など「タイトル直後の本ロード以外」の短い待ちで使う控えめ表示。
  // 大きな「ゾンビサバイバル」タイトルは出さず、スピナー＋小さな文言のみ(社長指示)。
  compact?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ benchmarkMode = false, startup = false, compact = false }) => {
  const title = 'ゾンビサバイバル';
  const subtitle = startup
    ? '素材をダウンロード中…'
    : benchmarkMode ? '描画負荷テストを準備中' : '装備とフィールドを準備中';

  // 控えめ表示: 暗幕＋スピナー＋小さな「準備中…」だけ。ゲームタイトルは出さない。
  if (compact) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#06070d]/92 text-white">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border border-cyan-200/20 bg-white/5 shadow-[0_0_24px_rgba(34,211,238,0.14)]">
            <div className="loading-sigil h-full w-full rounded-full" />
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.34em] text-cyan-100/45">Loading</div>
          <div className="mt-1 text-[11px] text-white/45">準備中…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#06070d] px-6 text-white"
      style={{
        backgroundImage: `linear-gradient(rgba(6,7,13,0.45), rgba(6,7,13,0.72)), url(${import.meta.env.BASE_URL}backgrounds/title-the-one.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.09),transparent_42%)]" />
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-slate-900/80 to-transparent" />
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full border border-cyan-200/20 bg-white/5 shadow-[0_0_30px_rgba(34,211,238,0.16)]">
          <div className="loading-sigil h-full w-full rounded-full" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-100/50">
          {benchmarkMode ? 'Benchmark Loading' : 'Loading'}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-white/50">
          {subtitle}
        </p>
        <div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="loading-bar h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-200 to-amber-200" />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;

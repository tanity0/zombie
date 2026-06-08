import React from 'react';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { CharacterClass } from '../types/game';

interface LoadingScreenProps {
  characterClass: CharacterClass;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ characterClass }) => {
  const profile = PLAYER_PROFILES[characterClass] ?? PLAYER_PROFILES.warrior;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#06070d] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(56,189,248,0.12),transparent_34%),radial-gradient(circle_at_50%_80%,rgba(16,185,129,0.09),transparent_42%)]" />
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-slate-900/80 to-transparent" />
      <div className="relative z-10 w-full max-w-sm text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full border border-cyan-200/20 bg-white/5 shadow-[0_0_30px_rgba(34,211,238,0.16)]">
          <div className="loading-sigil h-full w-full rounded-full" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-100/50">Loading</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="mt-2 text-[12px] leading-relaxed text-white/50">
          装備とフィールドを準備中
        </p>
        <div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="loading-bar h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-200 to-amber-200" />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;

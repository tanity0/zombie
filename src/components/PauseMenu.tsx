import React, { useEffect, useState } from 'react';
import { playSfx } from '../audio/audioManager';
import { Ff7rButton } from './ff7r';
import { useGameStore, subWeaponDisplayName } from '../store/gameStore';
import { CHARACTER_CLASSES, SKILLS, skillDescForLevel } from '../data/campaign';
import { subWeaponBlurb } from '../data/subWeaponBlurbs';
import { formatTime } from '../utils/renderUtils';

interface PauseMenuProps {
  onResume: () => void;
  onQuit: () => void;
}

// キーボード案内は、キーボードのある端末だけに出す(縦持ちスマホに「ESC / P」を出さない)。
const hasFinePointer = (): boolean => {
  try { return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; }
};

// クリエイティブ監査第2回・第2手A-6(research/CREATIVE_AUDIT_2026-09-11.md・社長裁定):
// 「戦況付きの全画面メニュー」。左=続ける/メニューに戻る(幅は文字幅)、右=経過時間・残りの敵・部隊。
// 値はポーズ中は進行が止まっているため、開いた時(マウント時)に useGameStore.getState() を1回だけ読む
// (購読しない=このコンポーネントは毎フレーム再描画されない)。
// 「残りの敵」の分母・分子は GameHUD 側(SubquestHud.tsx)の既存の出し方
// `${Math.min(r.progress, r.target)}/${r.target}` をそのまま再利用する(数字の意味を変えない)。
const readPauseSnapshot = () => {
  const s = useGameStore.getState();
  const classInfo = CHARACTER_CLASSES.find(c => c.id === s.player.characterClass);
  return {
    gameTimeSec: Math.floor(s.gameTime / 1000),
    subquests: s.subquests,
    playerName: classInfo?.name ?? 'プレイヤー',
    playerHealth: s.player.health,
    playerMaxHealth: Math.max(1, s.player.maxHealth),
    // 装備(社長指示v0.25.4236「護衛はいらない。代わりに装備とスキル一覧とサブウェポン情報」): 値は開いた時の1回読み。
    guns: s.player.weapons.filter(w => !w.isMelee).map(w => ({ id: w.id, name: w.name, active: w.id === s.player.activeWeaponId })),
    melee: s.player.weapons.find(w => w.isMelee)?.name ?? null,
    classSkillName: classInfo?.name ?? '',
    classSkillDesc: classInfo?.charSkillDesc ?? '',
    // スキル=この出撃で積んだ受動スキル(runBuild)と現在Lv。説明は現在Lvに即した既存の文(skillDescForLevel)。
    skills: s.runBuild.map(k => ({ key: k, name: SKILLS[k].name, level: s.player.skillLevels?.[k] ?? 1 })),
    // サブウェポン=HUDと同じ並び(村雨を持っていれば刀は出さない=同一系統)。
    subWeapons: s.player.subWeapons
      .filter(k => !(k === 'katana' && s.player.subWeapons.includes('murasame')))
      .map(k => {
        // 一言: 職の固有サブ(例: ヘビーガンナーの手榴弾)は職データの説明、それ以外は棚の台帳。台帳に無い物は説明を出さない
        // (台帳の既定値「未解放」は棚の空き枡用の語で、装備中の物には当たらない)。
        const b = subWeaponBlurb(k);
        const blurb = classInfo?.skillKey === k ? classInfo.skillDesc : (b === '未解放' ? '' : b);
        return { key: k, name: subWeaponDisplayName(k), level: s.player.subWeaponLevels[k] ?? 1, blurb };
      }),
  };
};

const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onQuit }) => {
  // 開いた時に1回だけ読む(state化はするがsetterは使わない=以後は不変のスナップショット)。
  const [snap] = useState(readPauseSnapshot);

  // Ensure pause menu handles events correctly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p') {
        onResume();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onResume]);

  // Stop any existing touch events from propagating to the game
  const preventTouchEvent = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const hpFrac = Math.max(0, Math.min(1, snap.playerHealth / snap.playerMaxHealth));

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(11, 11, 18, 0.6)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      onTouchStart={preventTouchEvent}
      onTouchMove={preventTouchEvent}
      onTouchEnd={preventTouchEvent}
    >
      <div className="glass-panel command-panel rounded-none w-full h-full overflow-hidden flex flex-col justify-center">
        <div className="px-5 pt-4 pb-2">
          <div className="text-[13px] font-semibold tracking-[0.14em] text-white/70 gt-emboss">一時停止</div>
        </div>
        <div className="px-5 pb-5 grid grid-cols-[auto_1px_minmax(0,1fr)] gap-x-5 gap-y-4">
          {/* 左: メニュー(幅は文字幅)。 */}
          <div className="flex flex-col items-start gap-2">
            <Ff7rButton onClick={() => { playSfx('ui-select'); onResume(); }} emphasis fade="both" paddingY="0.8rem">
              続ける
            </Ff7rButton>
            <Ff7rButton onClick={() => { playSfx('ui-back'); onQuit(); }} fade="both" paddingY="0.8rem">
              メニューに戻る
            </Ff7rButton>
            {hasFinePointer() && <p className="mt-1 text-[11px] text-white/50">
              ESC / P でも再開
            </p>}
          </div>

          <div className="block bg-white/10" />

          {/* 右: 戦況(開いた時点の値・1回読み)。 */}
          <div className="min-w-0 flex flex-col gap-3 text-[11px] max-h-[78vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between">
              <span className="tracking-[0.16em] text-white/35">経過時間</span>
              <span className="text-[20px] font-semibold tabular-nums text-white/90">{formatTime(snap.gameTimeSec)}</span>
            </div>

            {snap.subquests.length > 0 && (
              <div>
                <div className="mb-1 tracking-[0.16em] text-white/35">討伐</div>
                <div className="flex flex-col gap-1">
                  {snap.subquests.map(r => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className={r.done ? 'text-emerald-300/70' : 'text-white/70'}>{r.shortLabel}</span>
                      <span className="text-[13px] tabular-nums text-white/85">{Math.min(r.progress, r.target)}/{r.target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between text-white/75">
                <span>{snap.playerName}</span>
                <span className="text-[10px] tabular-nums text-white/45">{Math.round(snap.playerHealth)}/{Math.round(snap.playerMaxHealth)}</span>
              </div>
              <div className="mt-1 h-1 w-full bg-white/10">
                <div className="h-full bg-[var(--menu-accent,#ffb340)]" style={{ width: `${hpFrac * 100}%` }} />
              </div>
            </div>

            {/* 装備: 銃(●=いま手にしている)と近接。名前だけ・数値は出さない(HUDの弾数と二重にしない)。 */}
            <div>
              <div className="mb-1 tracking-[0.16em] text-white/35">装備</div>
              <div className="flex flex-col gap-0.5">
                {snap.guns.map(g => (
                  <div key={g.id} className={`flex items-center gap-1.5 ${g.active ? 'text-white/90' : 'text-white/50'}`}>
                    <span className={`inline-block h-1.5 w-1.5 ${g.active ? 'bg-[var(--menu-accent,#ffb340)]' : 'bg-white/15'}`} />
                    <span className="truncate">{g.name}</span>
                  </div>
                ))}
                {snap.melee && (
                  <div className="flex items-center gap-1.5 text-white/50">
                    <span className="inline-block h-1.5 w-1.5 bg-white/15" />
                    <span className="truncate">{snap.melee}</span>
                  </div>
                )}
              </div>
            </div>

            {/* スキル: キャラ固有(職名そのまま・常時有効)+この出撃で積んだ受動スキルと現在Lv。 */}
            <div>
              <div className="mb-1 tracking-[0.16em] text-white/35">スキル</div>
              <div className="flex flex-col gap-1.5">
                {snap.classSkillDesc && (
                  <div>
                    <div className="text-white/85">{snap.classSkillName}</div>
                    <div className="text-[10px] leading-snug text-white/45">{snap.classSkillDesc}</div>
                  </div>
                )}
                {snap.skills.map(sk => (
                  <div key={sk.key}>
                    <div className="flex items-center justify-between text-white/85">
                      <span className="truncate">{sk.name}</span>
                      <span className="text-[10px] tabular-nums text-white/45">Lv{sk.level}</span>
                    </div>
                    <div className="text-[10px] leading-snug text-white/45">{skillDescForLevel(sk.key, sk.level)}</div>
                  </div>
                ))}
                {snap.skills.length === 0 && !snap.classSkillDesc && <div className="text-white/40">なし</div>}
              </div>
            </div>

            {/* サブウェポン: 名前・Lv・一言(棚と同じ台帳 subWeaponBlurbs)。 */}
            <div>
              <div className="mb-1 tracking-[0.16em] text-white/35">サブウェポン</div>
              <div className="flex flex-col gap-1.5">
                {snap.subWeapons.map(sw => (
                  <div key={sw.key}>
                    <div className="flex items-center justify-between text-white/85">
                      <span className="truncate text-purple-200/90">{sw.name}</span>
                      <span className="text-[10px] tabular-nums text-white/45">Lv{sw.level}</span>
                    </div>
                    {sw.blurb && <div className="text-[10px] leading-snug text-white/45">{sw.blurb}</div>}
                  </div>
                ))}
                {snap.subWeapons.length === 0 && <div className="text-white/40">なし</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;

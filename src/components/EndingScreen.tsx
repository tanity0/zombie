import React, { useEffect, useRef, useState } from 'react';
import { ENDING_HEADER, ENDING_SCRIPT, ENDING_FINAL_WORD } from '../data/ending';
import { setEndingBgm } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';

// 通常エンディング(社長編集稿v0.25.2191): 軍の聴取記録→暗転で「成し得なかった」だけが残り
// フェードアウト→入れ替わりに「the ONE」フェードイン→メニューへ。
// - 台詞はタップで送り(オート送りもあり)。本文はサブ達成状況で変えない。
// - スタッフロールは文面未支給のため最小(タイトルロゴ相当のテキストのみ)=TODO。
// - scenic(社長指示2026-08-29「このシーンを、グレン撃破後のミラの事情聴取の後ろに流して」):
//   背後でエンディングステージ(戦場の観賞シーン)が動いている前提のオーバーレイモード。
//   薄い黒スクリム(「薄く黒を引いて文字を見やすく」)は**最後まで**掛かったまま(v4055・社長指示
//   「成し得なかった で暗転するのやめよう。最後まで戦場で」=wordの全黒化を廃止)。
//   the ONE の後は finale: 爆撃がフィルに直撃(store.triggerEndingFinaleBomb)→白フラッシュ→
//   暗転→終了(社長指示「theONEのあと、爆撃がフィルに直撃した?!でフラッシュ暗転して終わり」)。
//   z はSortieLoadingOverlay(z-[100])より上=レンダラ初期化中の黒繋ぎの上でも文字が読める。
// 負荷 1/10: 静的DOM+CSSトランジションのみ(scenic時の背後のゲーム描画はステージ側の負荷)。

type Phase = 'script' | 'word' | 'credits' | 'finale';

const LINE_AUTO_MS = 3200;      // オート送りの1行表示時間
// word相=最終行のその場残し(v0.25.4065・社長指示「成し得なかった だけのっこりつつ、英語も the と
// ONE だけが残って消える感じで。順番に残って消えていく感じ」):
// t=0 周囲の文字が消える(0.7s)→ 残るのは「成し得なかった」+ the + ONE(その場・大きさ不変)
// → 1.8s 成し得なかった消える → 2.7s the消える → 3.5s ONEが最後に消える(→ the ONEタイトルへ)。
const FINAL_WORD_MS = 4700;
const CREDITS_MS = 3800;        // the ONE フェードイン表示時間
const FINALE_SAFETY_MS = 6000;  // finaleの安全弁(直撃通知が来なくても終わる。通常は落下0.9s+フラッシュで終了)
const FINALE_FLASH_MS = 260;    // 直撃の白フラッシュ保持(この後500ms easeで黒へ)
const FINALE_END_MS = 1200;     // 直撃からonDoneまで(白260ms→黒へ500ms→黒で静止)

interface EndingScreenProps {
  onDone: () => void;
  /** 背後にエンディングステージを流すオーバーレイモード(上のコメント参照)。 */
  scenic?: boolean;
}

// scenic時のスクリム濃度(聴取記録中)。「薄く黒を引いて文字を見やすく」の叩き台。
const SCENIC_SCRIM_ALPHA = 0.45;

const EndingScreen: React.FC<EndingScreenProps> = ({ onDone, scenic = false }) => {
  // エンディングBGM(社長支給2026-08-20): この画面のマウント中だけ再生。通常BGMは gameState==='ending'
  // 中は App が setBgmScene('off') にしているので重ならない。
  useEffect(() => {
    setEndingBgm(true);
    return () => setEndingBgm(false);
  }, []);
  const [phase, setPhase] = useState<Phase>('script');
  const [lineIdx, setLineIdx] = useState(0); // 表示済みの行数-1(0=最初の1行のみ表示)
  // フィナーレ(v4055): the ONE の後、フィルへ直撃弾を1発発注(通常投下はstore側で止まる)。
  useEffect(() => {
    if (scenic && phase === 'finale') useGameStore.getState().triggerEndingFinaleBomb();
  }, [scenic, phase]);
  // 直撃の着弾通知(gameTime)。0=未着弾。scenic以外は購読しない(常に0)。
  const finaleHitAt = useGameStore(state => (scenic ? state.endingFinaleHitAt : 0));
  const [flashStage, setFlashStage] = useState<'none' | 'flash' | 'black'>('none');
  useEffect(() => {
    if (!scenic || phase !== 'finale' || finaleHitAt <= 0 || doneRef.current) return;
    setEndingBgm(false); // 直撃と同時に曲を断つ(爆発SEだけが残る)
    setFlashStage('flash');
    const t1 = window.setTimeout(() => setFlashStage('black'), FINALE_FLASH_MS);
    const t2 = window.setTimeout(() => finish(), FINALE_END_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenic, phase, finaleHitAt]);
  const timerRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimer();
    onDone();
  };

  // 次へ(タップ/オート共通)。script中=次の行、最終行→word(成し得なかった残留)→credits(the ONE)→
  // scenic: finale(直撃待ち。安全タイマー切れならfinish)/非scenic: onDone(旧来どおり)。
  const advance = () => {
    clearTimer();
    if (phase === 'script') {
      if (lineIdx < ENDING_SCRIPT.length - 1) setLineIdx(i => i + 1);
      else setPhase('word');
    } else if (phase === 'word') {
      setPhase('credits');
    } else if (phase === 'credits') {
      if (scenic) setPhase('finale');
      else finish();
    } else {
      finish(); // finaleの安全弁(通常は直撃のフラッシュ側がfinishする)
    }
  };

  // フェーズ/行ごとのオート送りタイマー。
  useEffect(() => {
    clearTimer();
    const delay =
      phase === 'script' ? LINE_AUTO_MS
      : phase === 'word' ? FINAL_WORD_MS
      : phase === 'credits' ? CREDITS_MS
      : FINALE_SAFETY_MS;
    timerRef.current = window.setTimeout(advance, delay);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lineIdx]);

  const onTap = () => { if (phase !== 'finale') advance(); }; // finale中のタップは無効(直撃を見せ切る)

  const visibleLines = ENDING_SCRIPT.slice(0, lineIdx + 1);

  return (
    <div
      className={scenic ? 'fixed inset-0 z-[110] select-none' : 'fixed inset-0 z-50 bg-black select-none'}
      onClick={onTap}
      style={{
        touchAction: 'manipulation',
        ...(scenic
          ? {
              // v4055(社長指示「最後まで戦場で」): スクリムは全フェーズ薄いまま。暗転は直撃の
              // フラッシュオーバーレイ(下)だけが行う。
              backgroundColor: `rgba(0,0,0,${SCENIC_SCRIM_ALPHA})`,
            }
          : {}),
      }}
    >
      {/* 中央揃え・高さ50vhの帯の中で会話をローリング表示(社長指示v0.25.2194): 新しい行は下から
          積まれ、古い行は上へ流れて上端でフェードアウト(マスク)。長文で下が切れないよう窓を固定高に。 */}
      {phase === 'script' && (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="flex w-full max-w-md flex-col" style={{ height: '50vh' }}>
            <p
              className="shrink-0 mb-4 text-center text-[13px] tracking-[0.2em] text-white/55"
              style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
            >
              {ENDING_HEADER}
            </p>
            <div
              className="relative min-h-0 flex-1"
              style={{
                overflow: 'hidden',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
              }}
            >
              <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end space-y-3">
                {visibleLines.map((l, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-relaxed text-white/90 screen-in"
                    style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                  >
                    <span className="mr-2 text-white/55">{l.speaker}</span>
                    「{l.text}」
                    {/* 英語ルビ(社長指示2026-08-29): 最終行だけ小さく添える。「the ONE」への橋。 */}
                    {l.en && (
                      <span className="block pl-8 pt-0.5 text-[10px] italic tracking-[0.06em] text-white/45">
                        {l.en}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </div>
            <p className="shrink-0 mt-4 text-center text-[10px] tracking-widest text-white/25">タップで進む</p>
          </div>
        </div>
      )}

      {/* word相(v0.25.4065・社長指示): 画面遷移せず**最終行がその場で削れていく**——周囲の文字が
          消えて「成し得なかった」+英語ルビの the / ONE だけが残り(大きさ不変)、その後
          成し得なかった→the→ONE の順で消えていく(ONEが最後=直後の the ONE タイトルへの橋)。
          レイアウトはscript相と同一構造=遷移の瞬間に何も動かない(慣性=ポップ禁止)。 */}
      {phase === 'word' && (
        <div className="flex h-full w-full items-center justify-center px-6">
          <style>{`@keyframes endSegOut{to{opacity:0}}`}</style>
          <div className="flex w-full max-w-md flex-col" style={{ height: '50vh' }}>
            <p
              className="shrink-0 mb-4 text-center text-[13px] tracking-[0.2em] text-white/55"
              style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif', animation: 'endSegOut .7s ease forwards' }}
            >
              {ENDING_HEADER}
            </p>
            <div
              className="relative min-h-0 flex-1"
              style={{
                overflow: 'hidden',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 100%)',
              }}
            >
              <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end space-y-3">
                {ENDING_SCRIPT.map((l, i) => {
                  const isLast = i === ENDING_SCRIPT.length - 1;
                  const fadeNow: React.CSSProperties = { animation: 'endSegOut .7s ease forwards' };
                  if (!isLast) {
                    return (
                      <p
                        key={i}
                        className="text-[15px] leading-relaxed text-white/90"
                        style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif', ...fadeNow }}
                      >
                        <span className="mr-2 text-white/55">{l.speaker}</span>
                        「{l.text}」
                      </p>
                    );
                  }
                  const [jpPre] = l.text.split(ENDING_FINAL_WORD);
                  const enSegs = (l.en ?? '').split(/(\bthe\b|\bONE\b)/);
                  return (
                    <p
                      key={i}
                      className="text-[15px] leading-relaxed text-white/90"
                      style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}
                    >
                      <span className="mr-2 text-white/55" style={fadeNow}>{l.speaker}</span>
                      <span style={fadeNow}>「{jpPre}</span>
                      <span style={{ animation: 'endSegOut .9s ease 1.8s forwards' }}>{ENDING_FINAL_WORD}</span>
                      <span style={fadeNow}>」</span>
                      {l.en && (
                        <span className="block pl-8 pt-0.5 text-[10px] italic tracking-[0.06em] text-white/45">
                          {enSegs.map((seg, si) =>
                            seg === 'the' ? <span key={si} style={{ animation: 'endSegOut .7s ease 2.7s forwards' }}>the</span>
                            : seg === 'ONE' ? <span key={si} style={{ animation: 'endSegOut .9s ease 3.5s forwards' }}>ONE</span>
                            : <span key={si} style={fadeNow}>{seg}</span>
                          )}
                        </span>
                      )}
                    </p>
                  );
                })}
              </div>
            </div>
            <p className="shrink-0 mt-4 text-center text-[10px] tracking-widest text-white/25" style={{ animation: 'endSegOut .7s ease forwards' }}>タップで進む</p>
          </div>
        </div>
      )}

      {phase === 'credits' && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
          <span
            className="screen-in text-2xl font-semibold tracking-[0.3em] text-white/90"
            style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif', paddingLeft: '0.3em' }}
          >
            the ONE
          </span>
          <span className="screen-in text-[11px] tracking-widest text-white/40">Thank you for playing</span>
        </div>
      )}

      {/* フィナーレの直撃フラッシュ→暗転(v4055)。白は爆発光=瞬間点灯、黒へは500msのease。 */}
      {flashStage !== 'none' && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: flashStage === 'flash' ? '#ffffff' : '#000000',
            transition: flashStage === 'black' ? 'background-color 500ms ease' : 'none',
          }}
        />
      )}
    </div>
  );
};

export default EndingScreen;

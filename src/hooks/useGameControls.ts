import { useEffect } from 'react';
import { useGameStore, isGameTimeStopped, isAttackLocked } from '../store/gameStore';
import { performFlickAction } from '../utils/inputActions';
import { pcPressDown, pcPressUp, markPcFlick } from '../utils/pcPress';
import { isMenuContext } from '../utils/menuNav';

// Keyboard fallback — the game is touch-first, but we keep a PC-optimized
// scheme so a laptop is fully playable.
//   移動(指移動): WASD / 矢印(同時押しで斜めOK)
//   指を置く/離す(タッチと同じ: 押している間ホーミングのロック、離すと近接・PHILL発砲。2度押しでスケボー): Space / J
//     (research/PC_SUPPORT.md §11-1。マウスの左ボタン・パッドの A と同じ utils/pcPress を呼ぶ)
//   フリック(一閃ダッシュ・ワイヤーアンカー): K … 押した瞬間に「今の移動方向」へ発動。
//   歩き: Shift(押している間だけ・社長指示2026-10-05。それまで Shift はフリックだった)。
//     斜めも出せる(WASD合成方向を使う)。二連打方式は廃止(斜めに行けないため)。
const isCounterKey = (key: string) => {
  const k = key.toLowerCase();
  return k === ' ' || k === 'spacebar' || k === 'space' || k === 'j';
};
// フリック発動キー(右手の定番ボタン想定 K。マウスは右クリック)。
const isFlickKey = (key: string) => key.toLowerCase() === 'k';
// 歩きキー(左手の小指。押している間だけ歩く=離せば走りへ戻る)。
const isWalkKey = (key: string) => key.toLowerCase() === 'shift';

// 物理キー(e.code)で判定する(research/PC_SUPPORT.md §11-3): 日本語入力オンや JIS/AZERTY 配列でも WASD/Space が効く。
// e.code が無い/知らないキーは e.key の小文字を使う(従来どおり)。返す値は従来の e.key 小文字と同じ綴り。
const CODE_TO_KEY: Record<string, string> = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyJ: 'j', KeyK: 'k', KeyP: 'p',
  ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright',
  Space: ' ', ShiftLeft: 'shift', ShiftRight: 'shift', Escape: 'escape',
};
export const keyIdOf = (e: { code?: string; key: string }): string =>
  (e.code && CODE_TO_KEY[e.code]) || e.key.toLowerCase();

type MoveDir = 'up' | 'down' | 'left' | 'right';
const DIR_VECTORS: Record<MoveDir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const moveDirFromKey = (key: string): MoveDir | null => {
  switch (key.toLowerCase()) {
    case 'w': case 'arrowup': return 'up';
    case 's': case 'arrowdown': return 'down';
    case 'a': case 'arrowleft': return 'left';
    case 'd': case 'arrowright': return 'right';
    default: return null;
  }
};

// いま押している移動キーの合成方向(斜めOK)を正規化して返す。何も押していなければ
// 直近の向き(player.lastDirection)、それも無ければ右。フリックの方向に使う。
const currentMoveVec = (): { x: number; y: number } => {
  const s = useGameStore.getState();
  const inp = s.inputState;
  let x = 0, y = 0;
  if (inp.up) y -= 1;
  if (inp.down) y += 1;
  if (inp.left) x -= 1;
  if (inp.right) x += 1;
  if (x === 0 && y === 0) {
    const ld = s.player.lastDirection;
    if (ld) { x = ld.x; y = ld.y; } else { x = 1; y = 0; }
  }
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

export const useGameControls = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // v0.25.2621(ボスメーカー): **入力欄にフォーカスがある間は移動/攻撃キーを食べない**。
      // 数値を直接打っている最中に自機が走り出すと調整にならない(社長補足「動きながら数字を変える」)。
      // フォーカスが外れれば即座に元どおり戦える。ボスメーカー以外でも同じ判定で無害。
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      const key = keyIdOf(e);

      // 四神舞リズムモード中(PC): 移動キー=フリック(移動しない)、Space=タップ、Escape=終了。
      // 攻撃実行/効果音は useGameLoop 側が担当。移動入力は出さない(立ち止まりを維持)。
      if (useGameStore.getState().rhythm.active) {
        if (key.toLowerCase() === 'escape') {
          useGameStore.getState().setRhythmActive(false);
          return;
        }
        if (isCounterKey(key)) {
          e.preventDefault();
          if (!e.repeat) pcPressDown('key'); // 離した時にリズムのタップ(pcPressUp)=タッチと同じ
          return;
        }
        const md = moveDirFromKey(key);
        if (md) {
          e.preventDefault();
          if (!e.repeat) { useGameStore.getState().rhythmInput('flick', DIR_VECTORS[md]); markPcFlick(); }
          return;
        }
        return; // その他のキーはリズム中は無視
      }

      // 一時停止・説明・レベルアップ・帰還確認などの窓が出ている間は、矢印/WASD/Space はメニューの操作(utils/menuNav・ボタンの標準動作)。
      // 移動・向き・指には何も書かない(窓の下でプレイヤーが振り向く/再開した瞬間に歩き出す、を防ぐ・検収 A-2/C-1)。
      if (isMenuContext()) return;

      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = true;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = true;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = true;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = true;
          break;
      }
      if (isWalkKey(key)) inputState.walk = true;

      // 移動キーで向きを更新(フリックを「止まってから」押した時に最新の向きを使えるように)。
      if (moveDirFromKey(key)) {
        let dx = 0, dy = 0;
        if (inputState.up) dy -= 1;
        if (inputState.down) dy += 1;
        if (inputState.left) dx -= 1;
        if (inputState.right) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const l = Math.hypot(dx, dy) || 1;
          useGameStore.getState().setLastDirection({ x: dx / l, y: dy / l });
        }
      }

      // フリック(一閃ダッシュ / ワイヤーアンカー): 今の移動方向(斜め可)へ発動。キーボードの予備操作
      // (PCの主操作はマウス右クリック)。装備していない方は store 側が false を返すので無害。
      if (isFlickKey(key)) {
        e.preventDefault();
        // 二人組クエストv2 §2-8(納品ロック・入口4): isGameTimeStopped()だけでは塞がらない
        // (この枝はisAttackLocked()を経由しない独自ゲート)ので deliveryLocked を1条件足す。
        // PC版対応の調査(2026-10-02): 一時停止中(ポーズ/説明画面/レベルアップ等)にも通っていた → タッチの指離しと同じ
        // 共通ゲート isAttackLocked(一時停止・死亡・時間停止・納品ロック・アテンション)で止める。
        if (!e.repeat && !isGameTimeStopped() && !useGameStore.getState().deliveryLocked && !isAttackLocked()) {
          const v = currentMoveVec();
          performFlickAction(v.x, v.y);
        }
        useGameStore.setState({ inputState });
        return;
      }

      if (isCounterKey(key)) {
        e.preventDefault();
        // First press only — auto-repeat shouldn't keep refiring the counter.
        // 会話/登場演出中(時間停止中)はカウンターを出さない。
        // 二人組クエストv2 §2-8(納品ロック・入口4): 同上。
        // 一時停止中(ポーズ/説明画面/レベルアップ等)に Space/J で攻撃が出ていた → タッチと同じ共通ゲートで止める(同上)。
        // §11-1: 押した=指を置く(受理の門はタッチ・マウス・パッドと同じ isInputLocked=pcPressDown の中・検収 C-3)。
        // 攻撃は離した時(pcPressUp が isAttackLocked で止める)。
        if (!e.repeat) pcPressDown('key');
      }

      useGameStore.setState({ inputState });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // v0.25.2621(ボスメーカー): **入力欄にフォーカスがある間は移動/攻撃キーを食べない**。
      // 数値を直接打っている最中に自機が走り出すと調整にならない(社長補足「動きながら数字を変える」)。
      // フォーカスが外れれば即座に元どおり戦える。ボスメーカー以外でも同じ判定で無害。
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      const key = keyIdOf(e);
      // 指を離す(§11-1)。ゲーム中は preventDefault=フォーカスの残ったボタンが Space で押されない(監査 B-4)。窓の中では Space でボタンを押せる(検収 C-1)。
      if (isCounterKey(key)) { if (!isMenuContext()) e.preventDefault(); pcPressUp('key', true); }
      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = false;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = false;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = false;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = false;
          break;
      }
      if (isWalkKey(key)) inputState.walk = false;

      useGameStore.setState({ inputState });
    };

    // 窓が裏へ行った/ページを離れた: 押しっぱなしのキーの keyup は来ない → 移動を全部離し、指も「撃たずに離す」(§11-1)。
    const handleBlur = () => {
      const s = useGameStore.getState();
      if (s.inputState.up || s.inputState.down || s.inputState.left || s.inputState.right || s.inputState.walk) {
        useGameStore.setState({ inputState: { ...s.inputState, up: false, down: false, left: false, right: false, walk: false } });
      }
      pcPressUp('key', false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
      pcPressUp('key', false); // ゲームを抜けた=押しっぱなしを撃たずに離す
    };
  }, []);
};

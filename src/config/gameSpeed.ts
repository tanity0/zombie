// ゲームスピード(テンポ)のURL調整用ノブ(社長指示)。
//   ?speed=1.0  … 原速 / ?speed=1.5 … 速い / ?speed=0.8 … 遅い
// 既定は 1.2(現状のテンポ)。プレイヤー/敵の移動速度(MOVE_SPEED_MULT)と、敵の攻撃テンポ
// (ENEMY_ATTACK_SPEED_MULT=発砲＋特殊攻撃の溜め/CD)の両方をこの1値でまとめて倍率調整する。
// モジュール読込時に1回だけ読む(セッション中に値がブレないように)。変更したらリロード。
// localStorage 'zombie:speed' にも保存=次回以降URL無しでも維持(?speed= 無しで原状に戻したい時は
//   ?speed=1.2 を一度開くか localStorage を消す)。

const STORAGE_KEY = 'zombie:speed';
const DEFAULT_SPEED = 1.2;

const read = (): number => {
  if (typeof window === 'undefined') return DEFAULT_SPEED;
  const clamp = (n: number) => Math.max(0.2, Math.min(5, n));
  try {
    const q = new URLSearchParams(window.location.search).get('speed');
    if (q !== null) {
      const n = parseFloat(q);
      if (Number.isFinite(n) && n > 0) {
        const v = clamp(n);
        try { window.localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
        return v;
      }
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const n = parseFloat(stored);
      if (Number.isFinite(n) && n > 0) return clamp(n);
    }
  } catch {
    // privacy mode 等で throw する場合は既定へ。
  }
  return DEFAULT_SPEED;
};

// ゲーム全体のテンポ倍率(移動＋敵攻撃)。
export const GAME_SPEED: number = read();

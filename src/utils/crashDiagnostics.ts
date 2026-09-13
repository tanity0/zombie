// クラッシュ診断(社長報告: スマホで数分プレイ後に真っ白→タイトルに戻る)。
// JS例外なら ?debug=1 の DebugOverlay で拾えるが、モバイルブラウザのメモリ逼迫によるタブ強制リロードは
// JS側で検知できない(例外を投げずにプロセスごと終了する)。そこで、生存中に低頻度で「今の状態」を
// localStorage へ上書き記録しておき、次回起動時に「前回はどこまで進み、何が多かったか」を読めるようにする。
// ★ゲームプレイには一切影響しない(読み書きのみ・数秒に1回・失敗しても無視)。

const KEY = 'zombie:lastHeartbeat';

export interface HeartbeatSnapshot {
  ts: number;            // 記録時刻(Date.now())
  elapsedSec: number;    // ページ読み込みからの経過秒
  gameTimeSec: number;   // 現在のランのゲーム内経過秒
  enemies: number;
  projectiles: number;
  effects: number;
  pickups: number;
  breakableProps: number;
  heapMB: number | null; // Chrome系のみ取得可(Safariはnull)
}

export const recordHeartbeat = (snap: Omit<HeartbeatSnapshot, 'ts'>) => {
  try {
    const full: HeartbeatSnapshot = { ts: Date.now(), ...snap };
    localStorage.setItem(KEY, JSON.stringify(full));
  } catch {
    // localStorage不可(プライベートモード等)は無視。
  }
};

export const getLastHeartbeat = (): HeartbeatSnapshot | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HeartbeatSnapshot;
  } catch {
    return null;
  }
};

// Chrome/Android系は performance.memory で概算ヒープ使用量が取れる(Safari/iOSは非対応=null)。
export const readHeapMB = (): number | null => {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
};

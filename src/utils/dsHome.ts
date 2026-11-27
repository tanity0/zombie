// 作戦室DS2化(UI_OVERHAUL.md §3-1/§3-2)の純関数層。
// - nextOperationStage: ホームの「出撃」行・DAY計器・等高線マップのシードが指す「次の作戦地域」。
// - contour*: 旧・等高線マップ(DsContourMap.tsx・v0.25.5096 で DsStoryMap に置き換えて撤去)の擬似地形。今は使っていない(テストだけ残る)。描画コンポーネントから数式だけを
//   切り出してユニットテスト対象にする(実装精度の規律4: 配線ロジックの純関数化)。
import type { Stage } from '../data/campaign';
import { isStageUnlocked, type StoryFlags } from '../data/progress';
import { canShowEx } from './storyProgress';

// 「次の作戦地域」(UI_OVERHAUL.md §3-1-2b)。規則:
//   ④ EXは canShowEx(薬使用済み) && 解放済み && 未クリア の時だけ最優先(renderStageSelectと同じ門)。
//   ① 候補 = kind==='main' && isTargetCandidate && isStageUnlocked のノード列(STAGESの並び順)。
//   ⑤ 任意のステージ(OPTIONAL_STAGE_IDS=洞窟のチュートリアル)は目標の候補にしない(社長 2026-11-27
//     「洞窟が目標になることは無い。任意のチュートリアルなので」)。地図で押せば選べる・出撃できる(目標ではないだけ)。
//   ② 未クリアの先頭(=次にやるべきノード。新規プレイヤーはステージ1=stage-1を指す)。
//   ③ 全クリア時は最終ノード。
// stage-ending / stage-ex2 等 hidden はどの状態でも返さない(テストで固定)。
/** 目標(次の出撃先)の候補にしない任意のステージ。 */
export const OPTIONAL_STAGE_IDS: ReadonlySet<string> = new Set(['stage-tutorial']);
/** 目標(次の出撃先)の候補になるか(hidden と任意のチュートリアルは候補にしない)。 */
export const isTargetCandidate = (s: Pick<Stage, 'id' | 'hidden'>): boolean => !s.hidden && !OPTIONAL_STAGE_IDS.has(s.id);
export const nextOperationStage = (
  stages: readonly Stage[],
  cleared: Set<string>,
  storyFlags: StoryFlags
): Stage | null => {
  const ex = stages.find(
    s => s.kind === 'ex' && isTargetCandidate(s) && canShowEx(storyFlags)
      && isStageUnlocked(s, cleared) && !cleared.has(s.id)
  );
  if (ex) return ex;
  const mains = stages.filter(s => s.kind === 'main' && isTargetCandidate(s) && isStageUnlocked(s, cleared));
  const next = mains.find(s => !cleared.has(s.id));
  if (next) return next;
  return mains[mains.length - 1] ?? null;
};

// 地図から直接出撃(research/UIUX_PROPOSAL.md P1): 作戦室の地図の NEXT の印・地図の下端の任務名・出撃の帯が指す任務。
// 決め方は地図の NEXT の印と1本(DsStoryMap も同じ関数で印を出す): 「次の作戦地域」が未クリアの時だけ、それ。
// 全部クリアした後など、次の作戦地域がクリア済み(=地図に NEXT が出ない)時は null
// =出撃の帯は作戦地域の一覧へ行く形に戻る(地図の下端の任務名も出さない)。
export const directSortieStage = (next: Stage | null, cleared: ReadonlySet<string>): Stage | null =>
  next && !cleared.has(next.id) ? next : null;

// 作戦室の出撃先(地図の琥珀の輪・地図の下端の場所名・出撃の帯の任務名が指す任務)。
// - 次の任務がある時はそれ(kind 'next'=NEXT の印。directSortieStage と同じ)。
// - 次が無い(全部クリアした後など)時は、最後に出撃した任務(kind 'last'=「前回」の印)。
//   記録は出撃時に書かれる progress の selectedStage(getSelectedStageId)をそのまま使う。
//   記録が無い・記録のステージが存在しない・一覧に出ない(hidden / 周回用)・まだ解放されていない時は null
//   =出撃の帯は作戦地域の一覧へ行く形のまま。EX は作戦地域の一覧と同じ門(canShowEx かつ解放済み)。
export type SortieTarget = { stage: Stage; kind: 'next' | 'last' };
export const sortieTarget = (
  stages: readonly Stage[],
  next: Stage | null,
  cleared: Set<string>,
  storyFlags: StoryFlags,
  lastStageId: string | null | undefined
): SortieTarget | null => {
  const d = directSortieStage(next, cleared);
  if (d) return { stage: d, kind: 'next' };
  if (!lastStageId) return null;
  const last = stages.find(s => s.id === lastStageId);
  if (!last || last.hidden) return null;
  if (last.kind === 'main') return isStageUnlocked(last, cleared) ? { stage: last, kind: 'last' } : null;
  if (last.kind === 'ex') return canShowEx(storyFlags) && isStageUnlocked(last, cleared) ? { stage: last, kind: 'last' } : null;
  return null;
};

// ==== 等高線マップの擬似地形(モック原典のアルゴリズム・UI_OVERHAUL.md §3-2) ====
// バッキングは632×300固定(監査A-5: モックの定数は632×300専用。箱に合わせて定数のまま縮めると
// 等高線が消える)。半径・しきい値・stepは原典定数のまま。丘の中心座標だけstage idハッシュでシード。
export const CONTOUR_W = 632;
export const CONTOUR_H = 300;
export const CONTOUR_STEP = 4;                 // サンプリング間隔(px)
export const CONTOUR_BAND_EPS = 0.012;         // しきい値との許容差(=線の太さの素)
export const CONTOUR_HILL_RADII = [150, 120, 90] as const; // 丘3つの半径(原典のまま)
// しきい値9本: t = 0.18 + i*0.1(原典のまま)。
export const CONTOUR_THRESHOLDS: readonly number[] = Array.from({ length: 9 }, (_, i) => 0.18 + i * 0.1);
// 丘中心の可動域=632×300の内側60%領域(監査B-4: 端に寄ると等高線が箱外へ落ちて本数が欠ける。
// 内側60%に制限して「どのシードでも9本すべてに塗りが出る」を担保・テストで固定)。
export const CONTOUR_HILL_INNER = 0.6;

export type ContourHill = [cx: number, cy: number, r: number];

// stage id → 決定的な乱数列(FNV-1aハッシュ + mulberry32)。同じidなら常に同じ地形。
const hashStageId = (id: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hillsForSeed = (seed: number): ContourHill[] => {
  const rnd = mulberry32(seed);
  const lo = (1 - CONTOUR_HILL_INNER) / 2; // 0.2
  return CONTOUR_HILL_RADII.map(r => [
    CONTOUR_W * (lo + CONTOUR_HILL_INNER * rnd()),
    CONTOUR_H * (lo + CONTOUR_HILL_INNER * rnd()),
    r,
  ]);
};

// スカラー場(丘のガウス和・原典のまま)。
export const contourField = (hills: readonly ContourHill[]) => (x: number, y: number): number =>
  hills.reduce((s, [hx, hy, r]) => s + Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r)), 0);

// 「9本すべてが**線として見える**か」を描画と同一のサンプリングで検査(描画コードの写し)。
// ★検収監査B-1(v0.25.4058): 合格を「1サンプル以上」→「各バンド≥40サンプル」へ引き上げ。
// 旧判定はstage-5の最下段が1.2pxの点7個(=見えない線)でも通っていた。40=モック原典の最小バンド
// (39)相当。全実在stage idがsalt 0..15の中で合格することは実測済み(stage-5→2/stage-ex1→2/stage-7→1)。
export const CONTOUR_BAND_MIN_SAMPLES = 40;
const allBandsVisible = (hills: readonly ContourHill[]): boolean => {
  const field = contourField(hills);
  const counts = new Array<number>(CONTOUR_THRESHOLDS.length).fill(0);
  let remaining = counts.length;
  for (let y = 0; y < CONTOUR_H; y += CONTOUR_STEP) {
    for (let x = 0; x < CONTOUR_W; x += CONTOUR_STEP) {
      const v = field(x, y);
      for (let li = 0; li < CONTOUR_THRESHOLDS.length; li++) {
        if (counts[li] < CONTOUR_BAND_MIN_SAMPLES && Math.abs(v - CONTOUR_THRESHOLDS[li]) < CONTOUR_BAND_EPS) {
          if (++counts[li] === CONTOUR_BAND_MIN_SAMPLES && --remaining === 0) return true;
        }
      }
    }
  }
  return false;
};

// 監査B-4の受け入れ条件が正: どのシードでも9本すべてに塗りが出ること。★内側60%制限だけでは
// 不足だった(実測: stage-7のハッシュは丘が広く散り、場の最小値0.238>最下段しきい値0.18で
// 最下段の線が存在しない)。そこで決定的な再シード(salt 0..15の先頭合格)で受け入れ条件を担保する。
// どのsaltも落ちる場合はモック原典の固定配置(既知の合格配置)へフォールバック=常に9本出る。
const CONTOUR_SALT_MAX = 16;
const MOCK_HILLS: ContourHill[] = [
  [CONTOUR_W * 0.3, CONTOUR_H * 0.62, 150],
  [CONTOUR_W * 0.72, CONTOUR_H * 0.3, 120],
  [CONTOUR_W * 0.55, CONTOUR_H * 0.85, 90],
];

// 丘3つの中心をstage idでシード(半径は原典固定)。中心は内側60%領域に必ず収まり、
// 9本すべての等高線が出る配置だけを返す(決定的=同じidなら常に同じ地形)。
export const contourHills = (stageId: string): ContourHill[] => {
  const base = hashStageId(stageId);
  for (let salt = 0; salt < CONTOUR_SALT_MAX; salt++) {
    const hills = hillsForSeed(base + salt);
    if (allBandsVisible(hills)) return hills;
  }
  return MOCK_HILLS;
};

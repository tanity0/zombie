// ★一時停止の地図に出す敵(research/THEONE_ROUND2.md §2-3・社長 2026-10-17)。
// 「パンプキンとか伐採人とかは出さない」「表示される敵は素直に位置情報でいい。そのプレイで出会ってたらね」。
// 出す=ボス級から強個体(パンプキン/削岩型/伐採人)・研究所の大型・ハンター・死神を除いた物+宿敵。
// 出会った=その出撃で一度でも画面(ズーム込みの可視域)に体の中心が入った個体(敵ID単位。裏ボスだけは型単位=下の sightKey)。一度出会えば今の位置を出す。
// 記録はこのモジュールの中だけ(store へは書かない=毎ティック呼んでも購読者を起こさない)。出撃ごとに resetMapSightings で空にする。
import type { Enemy } from '../types/game';
import { isBossType, isPumpkinTier, isHiddenBoss, isReaperFamily, isLabCrawlerProxyType } from './enemyUtils';
import { isPointInZoomedViewport } from './cameraZoom';

type Tracked = Pick<Enemy, 'type' | 'isNamed' | 'corpseUntil'>;

export const isMapTrackedEnemy = (e: Tracked): boolean => {
  if (e.corpseUntil !== undefined) return false;
  if (e.isNamed) return true;
  // 社長 2026-10-17「(ハンターは)外す 死神も外す」。
  if (e.type === 'hunter' || isReaperFamily(e.type)) return false;
  // ステージ2の変異塊の代理(攻撃を受ける窓口だけ・research/LAB_CRAWLER.md §4)は出さない(第1版の塊も地図に無かった=見え方を変えない)。
  if (isLabCrawlerProxyType(e.type)) return false;
  return isBossType(e.type) && !isPumpkinTier(e.type) && e.type !== 'lab-zombie-3';
};

const seen = new Set<string>();
/**
 * ★出会った後の最後の位置(社長指示2026-11-09「一度1プレイ内で出会ったボスはマップ上に表示し続けて(一時停止のマップの方ね)」)。
 * 一覧から消えた(巣へ帰った・遠くで片付けられた等)後も、最後に見えていた所に出し続ける。倒した物(最後に見た体力が0以下)は出さない。
 */
const lastPos = new Map<string, { x: number; y: number }>();
const defeated = new Set<string>();

// 裏ボスは巣へ帰ると一覧から消え、次は新しいIDで出直す(検収前の品質監査 C-2)。出直しても「出会った」ままにするため型で覚える。
const sightKey = (e: Pick<Enemy, 'id' | 'type'>): string => (isHiddenBoss(e.type) ? `type:${e.type}` : e.id);

export const resetMapSightings = (): void => { seen.clear(); lastPos.clear(); defeated.clear(); };

export const wasSeenThisRun = (e: Pick<Enemy, 'id' | 'type'>): boolean => seen.has(sightKey(e));

/** 画面に入っている対象の敵を「出会った」として記録する。新しく出会った数を返す(テスト用)。 */
type Sighted = Tracked & Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height'> & Partial<Pick<Enemy, 'health' | 'aiPhase'>>;

/** 出会った物の最後の位置・倒されたかを書き留める(城ボスの急降下の溜め=場外へ退避している間は位置を書かない)。 */
const noteSighted = (e: Sighted, k: string): void => {
  if (e.health !== undefined && e.health <= 0) { defeated.add(k); return; }
  if (e.aiPhase === 'g-dive-windup') return;
  defeated.delete(k); // 裏ボスは型で覚える=倒した後に出直した個体はまた出す
  lastPos.set(k, { x: e.x + e.width / 2, y: e.y + e.height / 2 });
};

export const recordMapSightings = (
  enemies: readonly Sighted[],
  camera: { x: number; y: number }, viewport: { width: number; height: number }, zoom: number,
): number => {
  let added = 0;
  for (const e of enemies) {
    const k = sightKey(e);
    if (seen.has(k)) { if (isMapTrackedEnemy(e) || (e.health !== undefined && e.health <= 0)) noteSighted(e, k); continue; }
    if (!isMapTrackedEnemy(e)) continue;
    if (!isPointInZoomedViewport(e.x + e.width / 2, e.y + e.height / 2, camera, viewport, zoom)) continue;
    seen.add(k);
    noteSighted(e, k);
    added++;
  }
  return added;
};

/**
 * 一時停止の地図に出す脅威の位置。この出撃で出会った物は、今も一覧に居れば今の位置、居なければ最後に見えていた位置
 * (社長指示2026-11-09「表示し続けて」)。倒した物は出さない。
 */
export const mapThreatPositions = (enemies: readonly Sighted[]): { x: number; y: number }[] => {
  const live = new Map<string, { x: number; y: number }>();
  for (const e of enemies) {
    const k = sightKey(e);
    if (!seen.has(k) || defeated.has(k) || !isMapTrackedEnemy(e) || e.aiPhase === 'g-dive-windup') continue;
    live.set(k, { x: e.x + e.width / 2, y: e.y + e.height / 2 });
  }
  const out: { x: number; y: number }[] = [];
  for (const k of seen) {
    if (defeated.has(k)) continue;
    const p = live.get(k) ?? lastPos.get(k);
    if (p) out.push(p);
  }
  return out;
};

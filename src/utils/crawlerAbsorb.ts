// ステージ2の「這う塊」(world/labCrawler.ts)が叩きつけで**取り込める敵**の述語(純関数・store非依存)。
//
// 設計チャットの判断(社長の言葉は「通常の敵も攻撃します」): 取り込めるのは**雑魚だけ**。ボス・強個体以上の区分
// (ボス級・ハンター・死神・名前付き・イベント湧き・護衛対象)は取り込まない(当たっても何も起きない)。
// 区分は既存の述語の合成で作る(CLAUDE.md「敵の仕様は区分で固める」)。
//   - ボス級(ハンター・死神・裏ボス・賞金首・英雄・旗手・パンプキン段・研究所の大型を含む)= isBossType
//   - 強個体(体勢値を持つ=削岩型・伐採人・赤の色つき 等)= usesPostureSystem
//   - 名前付き(宿敵 isNamed / クエスト対象 questTarget)・イベント湧き(fromEvent)・物語ボス(isStoryBoss)
//   - 固定配置(書類の見張り・休眠=fixed)・救助イベントの攻撃役(escortTarget)
//   - 倒れている(死体・HP0)
import type { Enemy } from '../types/game';
import { isBossType, isCorpse } from './enemyUtils';
import { usesPostureSystem } from './bossPosture';

export type CrawlerAbsorbSubject = Pick<Enemy,
  'type' | 'colorTier' | 'health' | 'corpseUntil' | 'fixed' | 'isNamed' | 'questTarget' | 'fromEvent' | 'isStoryBoss' | 'escortTarget'>;

export const isCrawlerAbsorbable = (e: CrawlerAbsorbSubject): boolean =>
  e.health > 0 && !isCorpse(e)
  && !isBossType(e.type) && !usesPostureSystem(e)
  && !e.fixed && !e.isNamed && !e.questTarget && !e.fromEvent && !e.isStoryBoss && !e.escortTarget;

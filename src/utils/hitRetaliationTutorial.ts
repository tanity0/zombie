/**
 * 「レッドカウンター」チュートリアル(tutorials.ts の 'hit-retaliation')の発火条件と、閉じた後の窓の開き直し。
 * 被弾反撃(research/HIT_RETALIATION.md)の受付窓が初めて開いた時に、端末で1度だけ出す(既読は loadSeenForGate)。
 * ここは計算だけ(gameStore を import しない)。表示は useGameLoop の showTutorialOnce。
 *
 * - **矢印が出ている時だけ**出す(反撃が出せない状態=妨げ中・相手が届かない等では、説明の矢印が画面に無いので出さない)。
 * - ポップアップ・メニュー・会話・アテンションの間は出さない(重ねない)。その間に窓が閉じたら、次に開いた窓で出す。
 * - 訓練(M0)では出さない(M0は台本の拍でポップアップを出す場=寄り道ガイドと同じ扱い)。
 */
import type { HitRetaliationWindow } from './hitRetaliation';
import { makeRetaliationWindow } from './hitRetaliation';

export interface RetaliationTutorialGate {
  /** いま反撃が出せる(=矢印が出ている。retaliationReadyTarget が非null)。 */
  arrowShown: boolean;
  /** 端末で既読か(loadSeenForGate 由来)。 */
  seen: boolean;
  /** 訓練(M0)ステージか。 */
  trainingStage: boolean;
  popupOpen: boolean;
  menuOpen: boolean;
  dialogueActive: boolean;
  /** アテンション(大型の登場演出等)の最中か。 */
  attention: boolean;
}

export const shouldShowRetaliationTutorial = (g: RetaliationTutorialGate): boolean =>
  g.arrowShown && !g.seen && !g.trainingStage &&
  !g.popupOpen && !g.menuOpen && !g.dialogueActive && !g.attention;

/**
 * チュートリアルを閉じた瞬間に、同じ相手の窓を開き直す(読んでいる間に実時間の窓が切れているため)。
 * 相手が居ない/倒れている(health<=0)なら null=開き直さない。
 * 開き直した窓は「今から RETALIATE_WINDOW_MS」。ヒットストップは掛け直さない(stopUntil=now)。
 * 向きは今の「プレイヤー→相手」(知らせの帯の方向。反撃の向き判定は入力の瞬間に測り直す)。
 */
export const reopenRetaliationWindowAfterTutorial = (
  fromId: string,
  now: number,
  source: { health: number } | undefined,
  dirX: number,
  dirY: number,
): HitRetaliationWindow | null => {
  if (!source || !(source.health > 0)) return null;
  return makeRetaliationWindow(fromId, now, now, dirX, dirY);
};

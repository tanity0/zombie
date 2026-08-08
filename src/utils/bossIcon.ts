// ボスの「顔アイコン」1枚のURLを解決する共通部品。タイトル画面の歴史年表(v0.25.1720〜)と、
// リザルトの撃破年表/討伐記録一覧(BOT_AND_GHOST.md §2.16 B・C)が**同じ1枚の表**を引く
// (§2.11補足「写すな、共通化しろ」: 表を2箇所に持つと片方だけ増える)。
//
// 掟: ここは**絵の場所を答えるだけ**の純関数。ゲーム挙動・判定には一切関与しない。
import { spritePath } from './spriteLoader';
import { getStage } from '../data/campaign';
import { bossCutinName } from '../data/bossCutin';

// 固有名を持つボス(天使6体・裏ボス4体)+城ボスの既定絵。キー=EnemyType。
const BOSS_ICON: Record<string, string> = {
  miguel: 'miguel', jibril: 'jibril', rafi: 'rafi',
  // PACING_PUZZLE.md §6.28-0★(バッチM52): 天使名ボス4〜6体目(ウリ/スリィエル/アクラシエル)。
  uri: 'uri', suriel: 'suriel', acrasiel: 'acrasiel',
  giantbat: 'atlas-px2/giantbat',
  mimir: 'mimir', jormungand: 'jormungand', skadi: 'skadi', thor: 'thor',
  idol: 'idol',
};

// 城ボス(giantbat)だけは**全ステージに出る同じ敵**で、絵はステージごとに差し替わる
// (pixiScene.ts の敵テクスチャ解決チェーン: 廃都/雪原/戦場のセット+stage-7のグレン)。
// ステージ→遠景(farBackdrop)は campaign.ts が唯一の出どころなので getStage() から引き、
// 遠景→絵の対応だけをここに持つ(pixiScene の chain と同じ内容)。定義の無いステージ(1/6/ex1)は素の絵。
const GIANTBAT_ICON_BY_BACKDROP: Record<string, string> = {
  city: 'stage3-enemies/giantbat',   // stage-3(廃都)
  snow: 'stage4-enemies/giantbat',   // stage-4(雪原)
  stage5: 'stage5-enemies/giantbat', // stage-5(紅き月の城塞)
  stage7: 'glen-boss',               // stage-7(グレン=物語ボスの専用アート)
};

/**
 * ボス型(+giantbatならステージID)からアイコンURLを返す。対応表に無い型は null
 * (呼び出し側は絵無しで文字だけ出す)。
 */
export const bossIconSrc = (bossType: string, stageId?: string | null, variant?: 'phase2'): string | null => {
  if (bossType === 'giantbat') {
    // v0.25.3041(社長指示「?のボスの絵も?にしておいて」): 名前台帳に無い城ボス(=一覧で「?」表示。
    // stage-2の城ボス不在枠 / stage-ex1の未確認変異体)は絵も出さない(null)。呼び出し側は
    // 「?」プレースホルダ(ボスモード)か絵なしで出す。名前と絵の出どころが同じ台帳に揃う。
    if (bossCutinName('giantbat', stageId) == null) return null;
    if (stageId === 'stage-7' && variant === 'phase2') return spritePath('glen-boss2');
    const backdrop = getStage(stageId ?? '')?.farBackdrop ?? '';
    return spritePath(GIANTBAT_ICON_BY_BACKDROP[backdrop] ?? BOSS_ICON.giantbat);
  }
  const base = BOSS_ICON[bossType];
  return base ? spritePath(base) : null;
};

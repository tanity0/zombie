// 資料室「特殊変異体」の孫悟空の欄(社長指示2026-11-27「孫悟空が倒したことになってるのか確認する術がない」→「孫悟空は倒した時の名前」)。
// 名前=倒した中で一番上のレベルの名前・その色(控えめ)・倒した相手と体得した技の短い記録・次に体得する技。純関数+読むだけの入口。
//
// ★倒したレベルの出どころは2つ(どちらも本編で格闘を装備して倒した時だけ書かれる=gameStore.noteKenkiDefeated の kenkiKillCounts):
//   ①孫悟空のレベル(utils/kenkiLevel の loadKenkiLevel=次に出るレベル)。L なら Lv1〜L-1 を倒している。
//   ②年表の討伐の行(kenkiChronicleKillDetail(lv)=`phantom-brawler-lv{n}`)。済(5)は倒してもレベルが上がらない(5で止まる)ので、
//     斗戦勝仏を倒したかは②でしか分からない。
//   この2つの和を「倒したレベル」とする。体得した技はレベルから決まる(brawlerArtLearnedAt)。
// ※data/progress は import しない(progress → bossStoryArchive → ここ の循環になる)。年表は呼び出し側が渡す。
import {
  BRAWLER_ART_NAME, brawlerArtLearnedAt, brawlerArtLearnedOnKill,
  kenkiChronicleKillDetail, kenkiLevelLook, loadKenkiLevel, type BrawlerArt, type KenkiLevel, type KenkiLook,
} from './kenkiLevel';

/** 名前の色(画面の文字色)。体の色(pixiScene の ENEMY_COLOR_TIER_BODY_TINT / 宿敵の金 NAMED_TINT)と同じ色相。Lv1 は色なし。 */
export const KENKI_TINT_RGB: Readonly<Record<NonNullable<KenkiLook['tint']>, string>> = {
  blue: '102, 170, 255',
  purple: '187, 102, 255',
  red: '255, 85, 68',
  gold: '255, 215, 0',
};

export interface KenkiArchiveRow {
  lv: KenkiLevel;
  name: string;
  tint: KenkiLook['tint'];
  /** このレベルを倒して体得した技(無ければ null)。 */
  art: string | null;
}

export interface KenkiArchiveView {
  /** 倒した中で一番上のレベル(一度も倒していなければ null=名前は台帳のまま)。 */
  topLevel: KenkiLevel | null;
  /** 倒した相手(低い順)。 */
  rows: KenkiArchiveRow[];
  /** 次に出る相手を倒すと体得する技の名前(無い・済まで終わった時は null)。 */
  nextArt: string | null;
}

const LEVELS: readonly KenkiLevel[] = [1, 2, 3, 4, 5];

/** 倒したレベル(低い順)。`saved`=loadKenkiLevel の値、`chronicleDetails`=年表の討伐の行の detail の集合。 */
export const kenkiDefeatedLevels = (saved: KenkiLevel, chronicleDetails: ReadonlySet<string>): KenkiLevel[] =>
  LEVELS.filter(lv => lv < saved || chronicleDetails.has(kenkiChronicleKillDetail(lv)));

export const buildKenkiArchive = (saved: KenkiLevel, chronicleDetails: ReadonlySet<string>): KenkiArchiveView => {
  const levels = kenkiDefeatedLevels(saved, chronicleDetails);
  const rows = levels.map(lv => {
    const look = kenkiLevelLook(lv);
    const art = brawlerArtLearnedOnKill(lv);
    // 体得の正はレベル(brawlerArtLearnedAt)に揃える(年表だけ残ってレベルが戻った時に「体得」と言わない)。
    return { lv, name: look.name, tint: look.tint, art: art && brawlerArtLearnedAt(saved, art) ? BRAWLER_ART_NAME[art] : null };
  });
  // 次に出る相手(=saved)を倒すと体得する技。済(5)を倒しても技は無い=済まで来たら出ない。
  const next: BrawlerArt | null = brawlerArtLearnedOnKill(saved);
  return {
    topLevel: levels.length ? levels[levels.length - 1] : null,
    rows,
    nextArt: next ? BRAWLER_ART_NAME[next] : null,
  };
};

/** 年表(data/progress の loadChronicle)から討伐の行(kind 'boss')の detail を集める(キー=`${stageId}::${kind}::${detail}`)。 */
export const chronicleBossDetails = (chronicle: readonly { key: string; kind: string }[]): Set<string> =>
  new Set(chronicle.filter(e => e.kind === 'boss').map(e => e.key.split('::').slice(2).join('::')));

/** 資料室を開いた時に1回読む(store の購読なし)。`chronicle`=loadChronicle() の結果。 */
export const loadKenkiArchive = (chronicle: readonly { key: string; kind: string }[]): KenkiArchiveView =>
  buildKenkiArchive(loadKenkiLevel(), chronicleBossDetails(chronicle));

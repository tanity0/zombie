// 特殊変異体(ボス)のバックストーリーの台帳(社長指示2026-11-16「ボス全種にバックストーリー」)。
// 資料室の「特殊変異体」の棚が読む。変異体図鑑(BESTIARY)とは別の棚=文章量が多いので顔アイコンだけで並べ、
// 倒した個体だけ開いて本文を読める。
//
// ★本文(body)はまだ書かれていない=全部空の配列。後でここへ流し込むだけでよい(1要素=1段落)。
// ★キー=倒した記録(utils/bossDefeated.ts)と同じ encounterSlotKey。並び=対策室の棚の順(PRACTICE_CATEGORY_ORDER)→枠の順。
// ★名前はゲームの表示名(対策室の一覧・死因・カットインと同じ)。食い違いは bossStoryArchive.test.ts が止める。
// 名前の欄は「読む人の目印」でもあるので写して持つ(表示も台帳の名前を使う)。

// ★汎用の幻影(guardian-phantom)は載せない(本編に居ない=倒した記録が付かず永久に開かない・クリエイティブ監査2026-11-16)。
//   除外の正は utils/bossStoryArchive.ts の BOSS_STORY_EXCLUDED_KEYS。
export type BossStoryGroup = '賞金首' | '徘徊' | '城ボス' | '関所' | '裏ボス';

export interface BossStoryEntry {
  /** 倒した記録のキー(encounterSlotKey)。 */
  key: string;
  /** 表示名(ゲームの表示名と同じ)。 */
  name: string;
  /** 資料室での小見出し。 */
  group: BossStoryGroup;
  /** 本文の段落。空なら「記録はまだない。」を出す。 */
  body: readonly string[];
}

export const BOSS_STORIES: readonly BossStoryEntry[] = [
  // 賞金首
  { key: 'bounty-ranged', name: 'バス停', group: '賞金首', body: [] },
  { key: 'bounty-melee', name: '馬乗り', group: '賞金首', body: [] },
  { key: 'bounty-balance', name: '鋏', group: '賞金首', body: [] },
  { key: 'bounty-maiko', name: '舞妓', group: '賞金首', body: [] },
  // 徘徊(野を巡る変異体)。拳鬼は対策室では「決闘」の棚だが、本編では徘徊の枠(亡霊・宇宙飛行群と3人から1人)で出るのでここ。
  { key: 'mutant-hero', name: '英雄', group: '徘徊', body: [] },
  { key: 'mutant-liberty', name: '解放群', group: '徘徊', body: [] },
  { key: 'mutant-astro', name: '宇宙飛行群', group: '徘徊', body: [] },
  { key: 'mutant-wraith', name: '亡霊', group: '徘徊', body: [] },
  { key: 'phantom-brawler', name: '孫悟空(幻影)', group: '徘徊', body: [] },
  // 城ボス(ステージのボス)
  { key: 'giantbat@stage-1', name: '搬送体', group: '城ボス', body: [] },
  { key: 'giantbat@stage-3', name: '樹木管理員', group: '城ボス', body: [] },
  { key: 'giantbat@stage-4', name: '衛生兵(変異体)', group: '城ボス', body: [] },
  { key: 'giantbat@stage-5', name: '軍隊', group: '城ボス', body: [] },
  { key: 'giantbat@stage-7', name: 'グレン(変異体)', group: '城ボス', body: [] },
  { key: 'phillboss@stage-ex1', name: 'フィル(変異体)', group: '城ボス', body: [] },
  // 関所
  { key: 'miguel', name: 'ミゲル', group: '関所', body: [] },
  { key: 'jibril', name: 'ジブリル', group: '関所', body: [] },
  { key: 'rafi', name: 'ラフィ', group: '関所', body: [] },
  { key: 'uri', name: 'ウリ', group: '関所', body: [] },
  { key: 'suriel', name: 'スリィエル', group: '関所', body: [] },
  // 裏ボス
  { key: 'mimir', name: 'ミーミル', group: '裏ボス', body: [] },
  { key: 'jormungand', name: 'ヨルムンガルド', group: '裏ボス', body: [] },
  { key: 'skadi', name: 'スカジ', group: '裏ボス', body: [] },
  { key: 'thor', name: 'トール', group: '裏ボス', body: [] },
  { key: 'idol', name: '偶像', group: '裏ボス', body: [] },
];

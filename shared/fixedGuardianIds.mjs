/** Client/Worker共通。固定守護霊の公開集計で受け付ける安定ID。 */
export const FIXED_GUARDIAN_IDS = Object.freeze([
  'kurogane', 'shishimaru', 'karasu', 'yuki', 'mikazuki',
  'nanashi', 'iwamoto', 'donko', 'chiyo', 'tohmi',
  'shizu', 'hatsune', 'hayase', 'bambi', 'chloe',
  'bansho', 'akane', 'ryoken', 'phill', 'mumei',
]);

const FIXED_GUARDIAN_ID_SET = new Set(FIXED_GUARDIAN_IDS);

export const isFixedGuardianId = (value) =>
  typeof value === 'string' && FIXED_GUARDIAN_ID_SET.has(value);

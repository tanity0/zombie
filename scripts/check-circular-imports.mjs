#!/usr/bin/env node
/**
 * 循環importの回帰ガード(社長承認 2026-08-31)。
 *
 * **なぜ要るか**: 循環importは **lint も typecheck も test も build も全部素通りする**。
 * 壊れるのは**本番バンドルの実行時の評価順**だけで、症状は「**起動直後に真っ暗**」
 * (TDZ = `ReferenceError: Cannot access 'X' before initialization`)。
 * つまり **「全部緑なのに起動しない」が循環importの典型症状**で、
 * これまで**起動確認だけが唯一の検知手段**だった。実際に2回起きている:
 *
 * | 版 | 何をした | 結果 |
 * |---|---|---|
 * | v0.25.3390 | `levelUpGate` が `bountyTick` から寸法をimport | 起動全損(真っ暗) |
 * | v0.25.4096 | `gameStore` が `bountyTick` から定数をimport | 起動全損(真っ暗)= **同型の再発** |
 *
 * 2回目の時、環は **1本 → 6本**に増えていたが、CIは全部緑だった。
 * **この網はその増分を機械的に捕まえる**。
 *
 * **やり方**: 既知の環を下の allowlist に固定し、**allowlist に無い環が1つでも出たら落とす**。
 * (本数だけを数えると「1本直して1本増えた」を見逃すため、**環の中身で照合する**。)
 *
 * **既知の環を減らせたら、この allowlist からも消すこと**(消さないと網が緩んだままになる)。
 */

import { execFileSync } from 'node:child_process';

/**
 * 既知の(この網を入れた時点で存在した)循環import。
 * **新しく足してはいけない。** 直したらここから消す。
 */
const ALLOWED = [
  // v0.25.3895 から存在。固定護衛の特性 → 敵の型 → ボスHP表 の輪。
  ['data/fixedGuardians.ts', 'utils/playerTraits.ts', 'utils/bossEngagement.ts', 'utils/enemyUtils.ts', 'config/bossHealth.ts'],
  // ENGINEERING_NOTES.md に「既知の無害な環」として記録されているもの。
  ['store/gameStore.ts', 'utils/ghostBuild.ts', 'utils/weaponUtils.ts'],
];

/** 環は開始点が違っても同じ輪なので、**回転を正規化**してから比較する。 */
const canonical = (cycle) => {
  if (cycle.length === 0) return '';
  let best = null;
  for (let i = 0; i < cycle.length; i++) {
    const rotated = [...cycle.slice(i), ...cycle.slice(0, i)].join(' > ');
    if (best === null || rotated < best) best = rotated;
  }
  return best;
};

// ★madge は「環が1本でもあれば exit 1」を返す(既知の環が在る限り必ず落ちる)。
// 終了コードは見ず、**標準出力のJSONだけ**を判定に使う。
let raw;
try {
  raw = execFileSync(
    'npx',
    ['--yes', 'madge@8.0.0', '--circular', '--extensions', 'ts,tsx', '--json', 'src'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
} catch (e) {
  raw = e.stdout ?? '';
  if (typeof raw !== 'string' || !raw.includes('[')) {
    console.error('✖ madge の実行に失敗しました(環の検査ができていません):');
    console.error(String(e.stderr ?? e.message).slice(0, 2000));
    process.exit(1);
  }
}

const found = JSON.parse(raw.slice(raw.indexOf('[')));
const allowed = new Set(ALLOWED.map(canonical));
const added = found.filter(c => !allowed.has(canonical(c)));
const goneCount = allowed.size - found.filter(c => allowed.has(canonical(c))).length;

if (added.length > 0) {
  console.error('✖ 新しい循環importが増えています(本番バンドルで「起動直後に真っ暗」を起こしうる):\n');
  for (const c of added) console.error('  ' + c.join(' > ') + ' > ' + c[0]);
  console.error(`
直し方(ENGINEERING_NOTES.md「循環importは…」):
  1. 共有したい値・型を **依存ゼロの葉モジュール**へ移す(手本: src/utils/bountyDims.ts)。
  2. 巨大ハブ(gameStore 等)がimportするファイルに、ハブをimportするファイルをimportさせない。
  3. 直したら \`node scripts/check-circular-imports.mjs\` が緑になることを確認する。
`);
  process.exit(1);
}

if (goneCount > 0) {
  console.log(`(既知の環が ${goneCount} 本減りました。scripts/check-circular-imports.mjs の ALLOWED からも消してください)`);
}
console.log(`✓ 循環import: 新規なし(既知 ${found.length} 本)`);

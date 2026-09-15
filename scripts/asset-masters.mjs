#!/usr/bin/env node
/**
 * 原盤(マスター素材)の保全ガード(社長指示2026-09-16「原盤確保の仕組み化」)。
 *
 * **なぜ要るか**: 起動時のテクスチャが 308MB あり(2Dゲームの相場は常駐50〜150MB)、
 * 端末のメモリ天井でタブごと落ちている。効く手は **①読まない ②寸法を下げる** の2つだけで、
 * ②をやる時に一番怖いのが「**縮小版で原盤を上書きしてしまい、二度と戻せなくなる**」事故。
 * 社長方針は「**別のもの(Steam等)として出す前提で元素材は取っておく**」。
 * つまり `public/` は**原盤**であり、配信用の縮小版は**出力側で作る**。
 *
 * この道具は、その約束を**口約束ではなく機械**にする:
 *   - `public/` 配下の画像の **寸法・バイト数・内容ハッシュ**を台帳に固定する。
 *   - **寸法が小さくなったら落とす**(=縮小版で原盤を潰した、の一次検知)。
 *   - **消えたら落とす**。
 *   - 中身が変わったが寸法が同じ = 通常の差し替え → **注意だけ**(止めない)。
 *   - 台帳に無い新顔 → **注意だけ**(台帳の更新を促す)。
 *
 * 使い方:
 *   npm run assets:check    … 台帳と突き合わせる(CIで回す)
 *   npm run assets:ledger   … 台帳を今の `public/` で作り直す(素材を足した/差し替えた時)
 *
 * ★依存を増やさないため、寸法はヘッダを直接読む(PNG=IHDR / JPEG=SOFn / GIF / WebP)。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PUBLIC_DIR = join(ROOT, 'public');
const LEDGER = join(ROOT, 'scripts', 'asset-masters.json');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** 画像のヘッダから寸法を読む。分からなければ null(寸法の検査だけ飛ばす)。 */
const dimsOf = (buf, ext) => {
  try {
    if (ext === '.png' && buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (ext === '.gif' && buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (ext === '.webp' && buf.length > 30 && buf.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
      if (fmt === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        // SOF0..SOF15(DHT=0xc4 / JPG=0xc8 / DAC=0xcc は除く)に寸法が入っている
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* 壊れたヘッダは寸法不明として扱う */ }
  return null;
};

const walk = async (dir, out = []) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (EXTS.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
};

const scan = async () => {
  const files = (await walk(PUBLIC_DIR)).sort();
  const out = {};
  for (const f of files) {
    const buf = readFileSync(f);
    const d = dimsOf(buf, extname(f).toLowerCase());
    out[relative(PUBLIC_DIR, f).split('\\').join('/')] = {
      w: d?.w ?? 0,
      h: d?.h ?? 0,
      bytes: buf.length,
      sha: createHash('sha256').update(buf).digest('hex').slice(0, 16),
    };
  }
  return out;
};

const mb = (w, h) => (w * h * 4) / (1024 * 1024);

const main = async () => {
  const write = process.argv.includes('--write');
  const now = await scan();

  if (write) {
    const total = Object.values(now).reduce((a, v) => a + mb(v.w, v.h), 0);
    writeFileSync(LEDGER, JSON.stringify({
      note: '原盤台帳(scripts/asset-masters.mjs が読み書きする)。手で編集しない。',
      generatedFor: `${Object.keys(now).length} files / 復号後 約${Math.round(total)}MB`,
      files: now,
    }, null, 1) + '\n');
    console.log(`[assets] 台帳を更新: ${Object.keys(now).length}枚 / 復号後 約${Math.round(total)}MB`);
    return;
  }

  if (!existsSync(LEDGER)) {
    console.error('[assets] 台帳がありません。`npm run assets:ledger` で作ってください。');
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(LEDGER, 'utf8')).files;

  const errors = [];
  const notes = [];
  for (const [name, o] of Object.entries(prev)) {
    const n = now[name];
    if (!n) { errors.push(`削除された: ${name}`); continue; }
    if (o.w && n.w && (n.w < o.w || n.h < o.h)) {
      errors.push(`★寸法が小さくなった(原盤の上書き?): ${name}  ${o.w}x${o.h} → ${n.w}x${n.h}`);
      continue;
    }
    if (n.sha !== o.sha) notes.push(`差し替え(寸法は維持): ${name}  ${o.w}x${o.h}`);
  }
  for (const name of Object.keys(now)) if (!prev[name]) notes.push(`新顔(台帳未登録): ${name}`);

  for (const n of notes.slice(0, 20)) console.log(`[assets] 注意 ${n}`);
  if (notes.length > 20) console.log(`[assets] 注意 …ほか ${notes.length - 20} 件`);
  if (notes.length) console.log('[assets] 差し替え/追加が正しいなら `npm run assets:ledger` で台帳を更新してください。');

  if (errors.length) {
    console.error('\n[assets] ★原盤が壊れています(このまま進めると元に戻せません)');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\n配信用の縮小版は public/ を上書きせず、出力側で作ってください。');
    process.exit(1);
  }
  console.log(`[assets] 原盤OK: ${Object.keys(prev).length}枚、寸法の縮みも削除もありません。`);
};

await main();

#!/usr/bin/env python3
# ドット保持ベイク: ×N拡大された元ドットシート(透過・少色)を ÷N NEAREST で元解像度へ戻し、
# 透明列でコマ分割→各コマを共通キャンバスへ足元下端・中央配置で焼く。LANCZOS縮小は使わない。
# 使い方: python3 bake_dot_walk.py <src.png> <out_dir> <name_prefix> [factor]
import sys, numpy as np
from PIL import Image
src, outdir, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
factor = int(sys.argv[4]) if len(sys.argv) > 4 else 4  # 論理拡大率(run分布の最小公倍=通常4)
im = Image.open(src).convert('RGBA')
nat = im.resize((im.size[0]//factor, im.size[1]//factor), Image.NEAREST)
a = np.array(nat); al = a[:, :, 3]; W, H = nat.size
colsum = (al >= 128).sum(axis=0); segs = []; inseg = False; s = 0
for x in range(W):
    if colsum[x] > 0 and not inseg: s = x; inseg = True
    elif colsum[x] == 0 and inseg: segs.append((s, x-1)); inseg = False
if inseg: segs.append((s, W-1))
frames = []
for (sx, ex) in segs:
    sub = a[:, sx:ex+1, 3]; ys, xs = np.where(sub >= 40)
    frames.append((sx+xs.min(), sx+xs.max(), ys.min(), ys.max()))
maxw = max(b-a0+1 for a0, b, _, _ in frames); maxh = max(d-c+1 for _, _, c, d in frames)
CW = round(maxw/0.837); CH = max(round(CW*73/86), maxh+2)
for i, (bx0, bx1, by0, by1) in enumerate(frames):
    crop = nat.crop((bx0, by0, bx1+1, by1+1))
    cv = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    cv.alpha_composite(crop, (round(CW/2 - crop.size[0]/2), CH - crop.size[1]))
    cv.save(f'{outdir}/{prefix}-walk-{i}.png')
print(f'baked {len(frames)} frames  canvas={CW}x{CH}  (idle=frameを別途コピー)')

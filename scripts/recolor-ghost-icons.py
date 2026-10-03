"""守護霊アイコンの色違いを作る(社長指示v0.25.3503「これは守護霊のを色違いで」)。

やること: 元絵の**明暗(V)・彩度(S)・形・透明度はそのまま**に、**色相だけを目標色へ揃える**。
- 彩度の低い(=ほぼ白い)画素は色相を回しても見た目が変わらないので、わずかに彩度を足して
  「色が付いている」と分かるようにする(ドット絵の白いハイライトが完全に無彩色のため)。
- アルファは一切触らない(縁のアンチエイリアスを壊さない)。
"""
import sys
import numpy as np
from PIL import Image

def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-8
    idx = nz & (mx == r); h[idx] = ((g - b)[idx] / d[idx]) % 6
    idx = nz & (mx == g); h[idx] = ((b - r)[idx] / d[idx]) + 2
    idx = nz & (mx == b); h[idx] = ((r - g)[idx] / d[idx]) + 4
    h = h / 6.0
    s = np.where(mx > 1e-8, d / np.maximum(mx, 1e-8), 0.0)
    return h, s, mx

def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    i = (i.astype(int) % 6)
    out = np.zeros(h.shape + (3,), dtype=np.float32)
    for k, (rr, gg, bb) in enumerate([(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)]):
        m = (i == k)
        out[m] = np.stack([rr, gg, bb], -1)[m]
    return out

def recolor(src, dst, target_hue_deg, sat_floor):
    im = Image.open(src).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3:]
    h, s, v = rgb_to_hsv(rgb)
    base = np.median(h[(al[..., 0] > 0.2) & (s > 0.12)]) if (s > 0.12).any() else 0.0
    # ★色相は「回す」のではなく「揃える」。元絵は青一色+白なので、回すと少数派の色相
    # (縁のアンチエイリアスで生じた紫/水色の画素)がバラバラの方向へ飛んで**斑点**になる。
    # 全画素を目標色相へ揃えれば、明暗(V)と彩度(S)だけで形が残り、きれいな色違いになる。
    h2 = np.full_like(h, target_hue_deg / 360.0)
    # 白いハイライトにも最低限の色を乗せる(色違いだと一目で分かるように)。
    s2 = np.where(al[..., 0] > 0.02, np.maximum(s, sat_floor), s)
    out = hsv_to_rgb(h2, s2, v)
    res = np.concatenate([out, al], -1)
    Image.fromarray((np.clip(res, 0, 1) * 255).round().astype(np.uint8), 'RGBA').save(dst)
    return base * 360

if __name__ == '__main__':
    src = 'public/sprites/skill/guardian-spirit.png'
    for dst, hue, sf in [
        ('public/sprites/skill/ghost-helper.png', 140.0, 0.30),  # 有志=緑(協力)
        ('public/sprites/skill/ghost-slayer.png', 38.0, 0.34),   # 猛者=金(精鋭)
    ]:
        b = recolor(src, dst, hue, sf)
        print(f'{dst}: base hue {b:.1f} -> {hue}')

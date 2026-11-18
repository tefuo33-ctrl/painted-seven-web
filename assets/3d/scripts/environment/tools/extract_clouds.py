# Вырезает облака с картинки-референса и сохраняет в папку source/:
#   clouds_map.png — «карта облаков»: пиксельная PNG (1 клетка = 3x3 пикселя картинки, прозрачное = небо).
#                    По ней parts/bg_clouds.py строит облака в 3D на тех же местах кадра.
#                    Карту можно дорисовать руками в любом пиксельном редакторе (Aseprite, LibreSprite, Paint.NET).
#   sky_ref.png    — небо картинки БЕЗ облаков, солнца, арок и земли (закрашено соседним небом): по нему
#                    красится небо в превью (bg_sky.make_sky_dome).
#
#   blender --background --python assets/3d/scripts/environment/tools/extract_clouds.py -- <картинка> <папка source> [проверка.png]
#
# Как ищем облака: небо плавно меняет цвет, а облако — пятно, которое заметно теплее/светлее/темнее соседнего неба.
#   * «соседнее небо» = медиана по строке (наверху) и по столбцу (у солнца — там небо меняется сверху вниз);
#   * сильные отличия — точно облако; слабые — только если касаются сильных (края облаков);
#   * земля, арки, листья, дворец, сияние солнца вырезаны рамками (доли кадра: x слева направо, y сверху вниз).
import os
import sys

import bpy
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT_DIR = argv[0], argv[1]
OUT = os.path.join(OUT_DIR, "clouds_map.png")
OUT_SKY = os.path.join(OUT_DIR, "sky_ref.png")
HORIZON = 0.523       # линия горизонта на картинке (доля высоты)
CHECK = argv[2] if len(argv) > 2 else None
K = 3                 # клетка = K x K пикселей картинки
TOP = 0.515           # ниже — горизонт, облаков не ищем
COLORS = 24           # сколько цветов оставить (пиксель-арт: ровные заливки)


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]      # верхняя строка первой


def save(a, p, scale=1):
    a = np.repeat(np.repeat(a, scale, 0), scale, 1)[::-1]
    h, w = a.shape[:2]
    o = bpy.data.images.new("out", w, h, alpha=True)
    o.pixels = a.astype(np.float32).ravel()
    o.filepath_raw = p
    o.file_format = 'PNG'
    o.save()


def dil(m):
    o = m.copy()
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o


def spread(img, known, steps):
    """Закрасить неизвестные клетки: цвет «растекается» от известных соседей (по шагу за проход)."""
    img, known = img.copy(), known.copy()
    for _ in range(steps):
        if known.all():
            break
        pk = np.pad(known, 1)
        pi = np.pad(img, ((1, 1), (1, 1), (0, 0)))
        acc = np.zeros_like(img); cnt = np.zeros(known.shape)
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            kk = pk[1 + di:1 + di + known.shape[0], 1 + dj:1 + dj + known.shape[1]]
            acc += pi[1 + di:1 + di + known.shape[0], 1 + dj:1 + dj + known.shape[1]] * kk[..., None]
            cnt += kk
        fill = ~known & (cnt > 0)
        img[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
    return img


b = load(SRC)[..., :3]
H, W = b.shape[:2]
h, w = H // K, W // K
c = b[:h * K, :w * K].reshape(h, K, w, K, 3).mean((1, 3))
Y, X = np.meshgrid((np.arange(h) + 0.5) / h, (np.arange(w) + 0.5) / w, indexing="ij")

# Листья лозы слева сверху (G > B, R не намного больше G, или очень тёмное) — закрашиваем соседним небом.
R_, G_, B_ = c[..., 0], c[..., 1], c[..., 2]
leaf_zone = (X > 0.13) & (X < 0.31) & (Y < 0.34)
leaf = leaf_zone & (((G_ > B_ * 0.92) & (R_ < 1.75 * G_)) | (c.sum(-1) < 0.75)
                    | ((G_ >= 0.9 * B_) & (c.sum(-1) < 1.35)))          # подсвеченные кончики листьев, ягоды
leaf |= leaf_zone & dil(leaf)
c = spread(c, ~leaf, 40)

sky = (Y < TOP) & (X > 0.05) & (X < 0.93)
sky &= ~(X < 0.14)                               # арка и фонарь слева
sky &= ~((X < 0.2) & (Y < 0.06))                 # верх арки
sky &= ~((X < 0.33) & (Y > 0.35))                # горы слева
sky &= ~((X > 0.655) & (Y > 0.24))               # мыс с городом справа
sky &= ~(X > 0.855 + 1.0 * Y)                    # арка справа
sky &= ~((np.abs(X - 0.5) < 0.1) & (Y > 0.43))   # сияние вокруг солнца (оно у солнца своё)
sky &= ~((X > 0.803) & (X < 0.87) & (Y > 0.035))  # купол дворца
sky &= ~((X > 0.76) & (Y > 0.19))                # холм за дворцом
sun = ((X - 0.5) * W / H) ** 2 + ((Y - 0.486) * 0.9) ** 2 < 0.045 ** 2


def med(axis, pad):
    out = np.zeros_like(c)
    for ch in range(3):
        a = np.where(sky, c[..., ch], np.nan)
        pw = ((0, 0), (pad, pad)) if axis == 1 else ((pad, pad), (0, 0))
        out[..., ch] = np.nanmedian(swv(np.pad(a, pw, constant_values=np.nan), 2 * pad + 1, axis=axis), axis=-1)
    return out


near_sun = (Y > 0.36) | ((np.abs(X - 0.5) < 0.09) & (Y > 0.18))
bg = np.where(near_sun[..., None], med(0, 7), med(1, 70))
d = c - bg
warm, lum = d[..., 0] - d[..., 2], d.sum(-1)
dL = c - med(0, 20)                    # вертикальное сияние над солнцем отличается от строки, но не от столбца
warmL, lumL = dL[..., 0] - dL[..., 2], dL.sum(-1)
up_strong = ((warm > 0.045) | (lum > 0.08)) & ((warmL > 0.03) | (lumL > 0.05))
strong = sky & ~sun & np.where(near_sun, (np.abs(lum) > 0.055) | (warm > 0.04), up_strong)
weak = sky & ~sun & np.where(near_sun, (np.abs(lum) > 0.035) | (warm > 0.025), (warm > 0.025) | (lum > 0.045))
mask = strong.copy()
for _ in range(5):                     # края облаков: слабые клетки рядом с сильными
    mask |= weak & dil(mask)
for _ in range(2):                     # заделать дырки
    cnt = np.zeros(mask.shape, int)
    cnt[1:] += mask[:-1]; cnt[:-1] += mask[1:]; cnt[:, 1:] += mask[:, :-1]; cnt[:, :-1] += mask[:, 1:]
    mask |= sky & ~sun & (cnt >= 3)
deep = leaf_zone & (Y < 0.27)          # за листьями — только продолжение облаков снаружи (до 5 клеток)
reach = mask & ~deep
for _ in range(5):
    reach = dil(reach)
mask &= ~deep | reach

# убрать мелочь (< 4 клеток)
lab = np.zeros(mask.shape, int); n = 0
for (i, j) in zip(*np.nonzero(mask)):
    if lab[i, j]:
        continue
    n += 1; st = [(i, j)]; lab[i, j] = n; cells = []
    while st:
        p, q = st.pop(); cells.append((p, q))
        for dp in (-1, 0, 1):
            for dq in (-1, 0, 1):
                a_, b_ = p + dp, q + dq
                if 0 <= a_ < h and 0 <= b_ < w and mask[a_, b_] and not lab[a_, b_]:
                    lab[a_, b_] = n; st.append((a_, b_))
    in_leaves = np.mean([leaf_zone[p, q] for p, q in cells])
    if len(cells) < 4 or (in_leaves > 0.5 and len(cells) < 40):      # мелочь и кончики листьев
        for p, q in cells:
            mask[p, q] = False

# пиксель-арт: COLORS ровных цветов (k-means по клеткам облаков)
px = c[mask]
rng = np.random.default_rng(0)
cent = px[rng.choice(len(px), COLORS, replace=False)]
for _ in range(30):
    lbl = ((px[:, None] - cent[None]) ** 2).sum(-1).argmin(1)
    for k in range(COLORS):
        if (lbl == k).any():
            cent[k] = px[lbl == k].mean(0)
cent = np.round(cent * 255) / 255
q = c.copy()
q[mask] = cent[lbl]
print("облачных клеток", int(mask.sum()), "цвета", ["#%02x%02x%02x" % tuple(int(v * 255) for v in cc) for cc in cent])

rows = int(np.ceil(TOP * h)) + 1
m = np.zeros((rows, w, 4), np.float32)
m[..., :3] = q[:rows] * mask[:rows, :, None]
m[..., 3] = mask[:rows]
save(m, OUT)
print("карта", w, "x", rows, "->", OUT)

# Небо без облаков: всё, что не чистое небо (облака + 1 клетка края, солнце, арки, листья, земля), закрашиваем
# соседним небом (растекание от краёв), потом слегка сглаживаем.
rows_s = int(np.ceil(HORIZON * h)) + 2
cloud_edge = dil(mask)
sun_big = ((X - 0.5) * W / H) ** 2 + ((Y - 0.486) * 0.9) ** 2 < 0.068 ** 2
clean = sky & ~cloud_edge & ~sun_big & ~leaf
outer = np.abs(X - 0.5) > 0.2               # по краям небо в строке ровное: всё, что заметно отличается, —
clean &= ~(outer & ((np.abs(warm) > 0.03) | (np.abs(lum) > 0.06)))   # остатки облаков/листьев
clean &= ~(X > 0.87)                         # правый край: между аркой и куполом почти одни облака
clean |=(Y > TOP) & (Y < HORIZON) & (X > 0.33) & (X < 0.655) & ~sun_big   # полоса над горизонтом у солнца
clean = clean[:rows_s]
s0 = b[:h * K, :w * K].reshape(h, K, w, K, 3).mean((1, 3))[:rows_s]          # без закраски листьев
s = spread(s0, clean, 400)            # у солнца и у облаков — от соседей
# Большие закрытые куски (арки, листья, земля по краям) — ровным небом этой высоты: медиана чистого неба
# в строке подальше от солнца (иначе от соседей тянутся полосы).
side = clean & (np.abs(X[:rows_s] - 0.5) > 0.12)
far_ = np.abs(X[:rows_s] - 0.5) > 0.12
for i in range(rows_s):
    if side[i].sum() >= 5:
        s[i, ~clean[i] & far_[i]] = np.median(s0[i][side[i]], 0)
for _ in range(2):                     # сгладить: 3x3
    p_ = np.pad(s, ((1, 1), (1, 1), (0, 0)), mode="edge")
    s = sum(p_[1 + di:1 + di + s.shape[0], 1 + dj:1 + dj + s.shape[1]] for di in (-1, 0, 1) for dj in (-1, 0, 1)) / 9
save(np.concatenate([s, np.ones(s.shape[:2] + (1,))], -1), OUT_SKY)
print("небо", w, "x", rows_s, "->", OUT_SKY)
if CHECK:                               # проверка: картинка / маска зелёным / облака на тёмном фоне
    over = c.copy(); over[mask] = over[mask] * 0.3 + np.array([0.0, 1.0, 0.0]) * 0.7
    flat = np.where(mask[..., None], q, np.array([0.12, 0.1, 0.2]))
    r0 = int(0.53 * h)
    img = np.concatenate([b[:h * K:K, :w * K:K][:r0], over[:r0], flat[:r0]], 0)
    save(np.concatenate([img, np.ones(img.shape[:2] + (1,))], -1), CHECK, 2)

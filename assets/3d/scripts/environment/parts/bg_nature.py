"""Деревья фона: кипарисы (высокие тёмные «свечки»), круглые деревья (оливы, пинии), кусты.
Кубик 1 м. Начало координат — у корня на уровне земли."""
import numpy as np

from bg_common import PAL
from voxel import Grid

MAT_FOLIAGE, MAT_BARK, MAT_TREE = 1, 2, 3
PALETTES = {MAT_FOLIAGE: PAL["cypress"], MAT_BARK: PAL["bark"], MAT_TREE: PAL["tree"]}

TREES = {
    "cypress_tall": dict(kind="cypress", h=18.4, r=1.6),     # хвоя на 15% выше (была 16)
    "cypress_small": dict(kind="cypress", h=12.7, r=1.3),    # хвоя на 15% выше (была 11)
    "tree_round": dict(kind="round", h=6, r=3.2),
    "tree_wide": dict(kind="round", h=5, r=4.2),
    "bush": dict(kind="bush", h=3, r=2.6),
}

PREVIEW_VIEW = (0.6, -1.4, 0.4)


def tree_grid(kind, h, r, seed=1):
    rng = np.random.default_rng(seed)
    v = 0.5 if kind == "cypress" else 1.0      # кипарис тонкий — ему нужны кубики помельче, чтобы сужался
    size = 2 * r + 4
    g = Grid(v, size_xy=size, height=h + 4, origin_z=-2)
    if kind == "cypress":
        base = 1.5                                                             # виден деревянный ствол
        g.put((g.R < 0.55) & g.zs(-2, base + 1), MAT_BARK)
        t = np.clip((g.Z - base) / (h - base), 0, 1)
        # Острый кипарис: шире всего на четверти высоты, к верху сходится в точку.
        prof = 1.3 * r * np.minimum(1.0, 0.5 + 2.2 * t) * (1 - t) ** 1.1
        g.put((g.R < prof + 0.15) & g.zs(base, h + 0.5), MAT_FOLIAGE)
        g.put((g.R < 0.3) & g.zs(h, h + 1.5), MAT_FOLIAGE)                     # тонкий шпиль на верхушке
        # Детали хвои: вертикальные полосы-пряди, светлая сторона к закату, тёмная глубина у ствола.
        ang = np.arctan2(g.Y, g.X)
        g.tint((g.mat == MAT_FOLIAGE) & (np.sin(ang * 3 + g.Z * 0.9) > 0.55), -1)
        g.tint((g.mat == MAT_FOLIAGE) & (g.X - g.Y > 0.3), +1)
        g.tint((g.mat == MAT_FOLIAGE) & (g.R < prof - 0.5), -1)
    elif kind == "round":
        top = h - r * 0.5
        g.put((g.R < 0.6) & g.zs(-2, top), MAT_BARK)                          # ствол виден под кроной
        g.put((np.abs(g.X - 0.8) < 0.5) & (np.abs(g.Y) < 0.5) & g.zs(top - 1.6, top - 0.2), MAT_BARK)  # ветка
        n = rng.random(g.mat.shape)
        cz = h - r * 0.05
        blob = np.zeros(g.mat.shape, dtype=bool)
        for ox, oy, oz, rr in ((0, 0, 0, r), (r * 0.5, r * 0.2, -r * 0.2, r * 0.65), (-r * 0.45, -r * 0.3, -r * 0.1, r * 0.6)):
            blob |= ((g.X - ox) ** 2 + (g.Y - oy) ** 2) / rr ** 2 + ((g.Z - cz - oz) / (rr * 0.62)) ** 2 < 1.0 - 0.25 * (n < 0.3)
        g.put(blob & (g.Z > top - 1.0), MAT_TREE)
        g.tint((g.mat == MAT_TREE) & (g.Z > cz + r * 0.2), +1)
        g.tint((g.mat == MAT_TREE) & (g.Z < cz - r * 0.25), -1)
    else:
        # Пышный куст: три наложенные «шапки» разного размера, светлые макушки.
        n = rng.random(g.mat.shape)
        blob = np.zeros(g.mat.shape, dtype=bool)
        for cx, cy, rr, hh in ((0, 0, r, h), (r * 0.45, r * 0.25, r * 0.7, h * 1.15), (-r * 0.4, -r * 0.2, r * 0.65, h * 0.9)):
            blob |= ((g.X - cx) ** 2 + (g.Y - cy) ** 2) / rr ** 2 + ((g.Z - 0.3) / (hh * 0.85)) ** 2 < 1.0 - 0.15 * (n < 0.25)
        g.put(blob & (g.Z > -1), MAT_TREE)
        g.tint((g.mat == MAT_TREE) & (g.Z > h * 0.45), +1)
        g.tint((g.mat == MAT_TREE) & (g.Z < 0.6), -1)
    g.noise(MAT_FOLIAGE, 0.15, 0.1, seed=seed + 3)
    g.noise(MAT_TREE, 0.15, 0.1, seed=seed + 4)
    return g


def make_tree(name, col, kind, h, r, seed=1):
    return tree_grid(kind, h, r, seed).build_mesh(name, PALETTES, col)


def build(col):
    objs, x = [], -20.0
    for i, (key, kw) in enumerate(TREES.items()):
        o = make_tree(key, col, seed=i + 1, **kw)
        o.location = (x, 0, 0)
        x += 2 * kw["r"] + 4
        objs.append(o)
        print(key, "faces", len(o.data.polygons))
    return objs


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=12, azimuth=15, fill=1.0, size=(1400, 600))

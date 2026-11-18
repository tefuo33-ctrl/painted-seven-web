"""Лоза с цветами на колонне — ВОКСЕЛЬНЫЙ стиль.

Как на картинке Тима (правая колонна): лоза РЕДКАЯ и ПЛОСКАЯ — лежит на камне, максимум в 2–3 слоя
кубиков. Тонкие тёмные стебли вьются по колонне, от них в стороны — плоские веточки с листьями,
внизу — красные цветы.

Кубики 4 см — как у колонны, и сетка совпадает с сеткой колонны: «пиксели» лозы и камня одного размера.
Лоза — отдельная деталь поверх колонны (parts/column.py): её можно снять или поставить на любую колонну.
Начало координат — как у колонны (центр низа базы).

Где растёт: вокруг угла колонны CORNER (по периметру: 0 — передний левый угол, 1 — передний правый,
2 — задний правый, 3 — задний левый), на SPREAD грани в обе стороны."""
import math

import numpy as np

from parts import column, urn
from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.04           # как у колонны
LAYERS = 3             # толщина лозы: не дальше 3 кубиков от камня
STEMS = 2              # сколько стеблей вьётся снизу вверх
SPREAD = 0.6           # насколько далеко от угла лоза расползается по граням (в долях грани)
TOP = 2.6              # до какой высоты лоза дорастает, м
TWIG_CHANCE = 0.30     # как часто от стебля отходит веточка с листьями (0…1)
FLOWER_ZONE = (0.2, 1.4)  # где цветы (по высоте, м): на картинке — в нижней части
FLOWER_CHANCE = 0.45   # как часто на конце веточки в зоне цветов — цветок (0…1)
SEED = 4

LEAF = urn.LEAF
FLOWER = urn.ROSE
STEM = Palette("VineStem", ["#140c06", "#21140a", "#30200f", "#432d16", "#5a3d1e"], base=2, roughness=0.9)
MAT_LEAF, MAT_FLOWER, MAT_STEM = 1, 2, 3


def half_at(z):
    """Половина ширины колонны на высоте z (база, ствол, капитель)."""
    for half, z0, z1, _ in column.BASE + column.CAPITAL:
        if z0 <= z < z1:
            return half
    if column.SHAFT_Z[0] <= z < column.SHAFT_Z[1]:
        return column.SHAFT_HALF
    return 0.0


def surface(u, z, layer):
    """Центр кубика лозы: u — по периметру колонны (0…4), z — высота, layer — слой от камня (1, 2, 3).
    Возвращает (точка, нормаль наружу, касательная вдоль периметра)."""
    hh = half_at(z)
    h = hh + (layer - 0.5) * VOXEL
    u = u % 4.0
    f = int(u)
    t = (u - f) * 2 - 1                      # -1…1 вдоль грани
    if f == 0:   # перед (-Y): слева направо
        return np.array([t * hh, -h, z]), np.array([0, -1.0, 0]), np.array([1.0, 0, 0])
    if f == 1:   # правая грань (+X): спереди назад
        return np.array([h, t * hh, z]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0])
    if f == 2:   # зад (+Y): справа налево
        return np.array([-t * hh, h, z]), np.array([0, 1.0, 0]), np.array([-1.0, 0, 0])
    return np.array([-h, -t * hh, z]), np.array([-1.0, 0, 0]), np.array([0, -1.0, 0])   # левая (-X)


def _set(g, p, mat, shade=0, overwrite=(0,)):
    i = int(np.floor((p[0] - g.origin[0]) / g.v))
    j = int(np.floor((p[1] - g.origin[1]) / g.v))
    k = int(np.floor((p[2] - g.origin[2]) / g.v))
    if not (0 <= i < g.nx and 0 <= j < g.ny and 0 <= k < g.nz):
        return
    # центр кубика: только снаружи камня и не дальше LAYERS кубиков от него
    c = np.array([g.X[i, j, k], g.Y[i, j, k], g.Z[i, j, k]])
    hz = half_at(c[2])
    out = max(abs(c[0]) - hz, abs(c[1]) - hz)
    if out < 0 or out > LAYERS * g.v:
        return
    if g.mat[i, j, k] in overwrite:
        g.mat[i, j, k] = mat
        g.shade[i, j, k] = shade


def add_twig(g, rng, u, z, side, flower):
    """Плоская веточка: уходит вбок и чуть вниз по камню (слой 1–2), листья по бокам и на конце."""
    v = g.v
    face_w = 2 * half_at(z) / v                       # ширина грани в кубиках
    length = int(rng.integers(2, 5))
    du = side / face_w                                # шаг вбок = 1 кубик
    for s in range(1, length + 1):
        uu, zz = u + du * s, z - v * (s // 2)         # вбок и понемногу вниз
        _set(g, surface(uu, zz, 1)[0], MAT_STEM, -1)
        # листья: над и под веточкой (плоско, в слое 1–2), кончик — лист в слое 2
        if rng.random() < 0.8:
            _set(g, surface(uu, zz + v, int(rng.integers(1, 3)))[0], MAT_LEAF, int(rng.integers(-1, 2)))
        if rng.random() < 0.6:
            _set(g, surface(uu, zz - v, int(rng.integers(1, 3)))[0], MAT_LEAF, int(rng.integers(-1, 1)))
    tip_u, tip_z = u + du * (length + 1), z - v * ((length + 1) // 2)
    if flower:
        # цветок: «плюсик» из кубиков, середина светлее и чуть выступает (слой 3)
        for a, b, sh in ((0, 0, 2), (1, 0, 0), (-1, 0, 0), (0, 1, 1), (0, -1, -1)):
            _set(g, surface(tip_u + a / face_w, tip_z + b * v, 2)[0], MAT_FLOWER, sh, overwrite=(0, MAT_LEAF))
        _set(g, surface(tip_u, tip_z, 3)[0], MAT_FLOWER, 3, overwrite=(0, MAT_LEAF))
    else:
        for a, b in ((0, 0), (1, 0), (0, -1)):
            _set(g, surface(tip_u + a * du, tip_z + b * v, 2 if (a, b) == (0, 0) else 1)[0], MAT_LEAF,
                 1 if (a, b) == (0, 0) else 0)


def make_grid(corner=0.0, seed=SEED, stems=STEMS, twig_chance=TWIG_CHANCE, flower_chance=FLOWER_CHANCE):
    rng = np.random.default_rng(seed)
    v = VOXEL
    # сетка совпадает с сеткой колонны (границы кубиков на тех же местах)
    g = Grid(v, size_xy=1.40, height=column.HEIGHT + 0.08)
    for _ in range(stems):
        u = corner + rng.uniform(-SPREAD, SPREAD) * 0.5
        du = 0.0
        z = column.BASE[-1][2]                        # от верха базы
        top = TOP - rng.uniform(0, 0.5)
        while z < top:
            du = 0.85 * du + rng.normal(0, 0.02)
            u += du
            if abs(u - corner) > SPREAD:
                u = corner + math.copysign(SPREAD, u - corner)
                du = -du
            _set(g, surface(u, z, 1)[0], MAT_STEM, int(rng.integers(-1, 1)))
            if rng.random() < twig_chance:
                side = rng.choice([-1, 1])
                fl = FLOWER_ZONE[0] <= z <= FLOWER_ZONE[1] and rng.random() < flower_chance
                add_twig(g, rng, u, z, side, fl)
            elif rng.random() < 0.35:                 # одиночный лист у стебля
                _set(g, surface(u + rng.choice([-1, 1]) * 0.07, z, 1)[0], MAT_LEAF, int(rng.integers(-1, 2)))
            z += v
    return g


def build(col, corner=0.0, seed=SEED, name="Vine", **kw):
    g = make_grid(corner, seed, **kw)
    obj = g.build_mesh(name, {MAT_LEAF: LEAF, MAT_FLOWER: FLOWER, MAT_STEM: STEM}, col)
    print(name, "faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    """Превью: лоза на колонне (колонна — только для вида, в .glb лозы её нет)."""
    import bpy
    import style_preview
    col = objects[0].users_collection[0]
    c = column.build(col)[0]
    allo = objects + [c]
    style_preview.render(allo, path, "studio", size=(760, 1100), elevation=10, azimuth=-45, fill=0.72)
    style_preview.render(allo, path[:-4] + "_sunset.png", "sunset", size=(760, 1100), elevation=8, azimuth=-30,
                         fill=0.72)
    bpy.data.objects.remove(c)

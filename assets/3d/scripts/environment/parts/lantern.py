"""Фонарь на тумбу балюстрады — ВОКСЕЛЬНЫЙ стиль (кубики 2 см, как стол и балюстрада).

Строение (снизу вверх, по референсу Тима):
  подставка — две ступени, короткая шейка, широкая нижняя рама
  клетка    — тёмные бронзовые стойки по углам, рамка вокруг стёкол, 4 светящихся стекла
  огонь     — свеча и пламя «крестиком» (как рисуют огонь в пиксель-арте)
  верх      — выступающая рама, ступенчатая крыша-пирамида, крестик-навершие

Начало координат — середина низа фонаря. Ставится на тумбу (верх тумбы — 1.08 м).
Свет в игре: точечный источник в LIGHT_POINT (тёплый, как LIGHT_COLOR)."""
import numpy as np

from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.02
CAGE_HALF = 0.12        # половина ширины клетки со стёклами, м
CAGE_BOTTOM, CAGE_TOP = 0.14, 0.40   # высота стёкол, м
GLASS_GLOW = 0.9        # насколько светятся стёкла
FLAME_GLOW = 1.6        # насколько светится пламя

# Пламя на стекле: ширина по рядам снизу вверх (в «половинках»: 1 → 2 кубика, 2 → 4, 3 → 6),
# "c" — свеча, 0 — пусто. Нарисуй своё пламя — фонарь поменяется.
FLAME_ROWS = [0, "c", "c", 1, 1, 2, 3, 2, 1, 1, 0]

LIGHT_POINT = (0.0, 0.0, 0.27)       # где огонь (для источника света в игре), м от низа фонаря
LIGHT_COLOR = "#ffb35a"

# Палитры сняты с референса.
IRON = Palette("LanternIron", ["#140b09", "#231310", "#3a1d14", "#4f2a1a", "#6b3a22", "#8a5230", "#a86c3e"],
               base=3, roughness=0.5, metallic=0.4)
GLASS = Palette("LanternGlass", ["#7a2a0a", "#a8400f", "#c9561a", "#e26722", "#ee8a35", "#f6a745"],
                base=2, roughness=0.2, emission="#d85a18", emission_strength=GLASS_GLOW)
FLAME = Palette("LanternFlame", ["#f6a745", "#fbd27a", "#fded9e", "#fff8d8"],
                base=2, roughness=0.5, emission="#ffc860", emission_strength=FLAME_GLOW)
CANDLE = Palette("Candle", ["#b8763a", "#d8944a", "#e8ae62", "#f4c87e"], base=2, roughness=0.7,
                 emission="#e08a3a", emission_strength=0.8)
MAT_IRON, MAT_GLASS, MAT_FLAME, MAT_CANDLE = 1, 2, 3, 4

PREVIEW_VIEW = (0.0, -1.5, 0.4)


def add_lantern(g, cx=0.0, cy=0.0, z=0.0):
    v = VOXEL
    h = CAGE_HALF
    S = lambda half, z0, z1, rounded=False: g.square_at(cx, cy, half, z + z0, z + z1, rounded)
    # --- Подставка.
    g.put(S(0.14, 0.00, 0.02), MAT_IRON)
    g.put(S(0.12, 0.02, 0.04), MAT_IRON)
    g.put(S(0.08, 0.04, 0.10), MAT_IRON)                 # шейка
    g.put(S(h, 0.10, 0.12), MAT_IRON)
    g.put(S(h + 0.02, 0.12, CAGE_BOTTOM), MAT_IRON)      # нижняя рама (шире клетки)
    # --- Клетка: стекло по внешнему слою, стойки по углам, рамка сверху и снизу каждого стекла.
    cage = S(h, CAGE_BOTTOM, CAGE_TOP)
    ax, ay = np.abs(g.X - cx), np.abs(g.Y - cy)
    shell = cage & ((ax > h - v) | (ay > h - v))
    corners = shell & (ax > h - 2 * v) & (ay > h - 2 * v)
    rims = shell & (g.zs(z + CAGE_BOTTOM, z + CAGE_BOTTOM + v) | g.zs(z + CAGE_TOP - v, z + CAGE_TOP))
    g.put(shell, MAT_GLASS)
    g.put(corners | rims, MAT_IRON)
    # --- Пламя: нарисовано пикселями прямо на каждом стекле (как в пиксель-арте референса).
    pane = shell & ~corners & ~rims
    across = np.where(ax > h - v, g.SJ, g.SI)               # номер кубика от середины стекла (0, 1, 2…)
    row = np.floor((g.Z - (z + CAGE_BOTTOM + v)) / v + 1e-6).astype(int)   # ряд стекла снизу (0…)
    for r, width in enumerate(FLAME_ROWS):
        if width == "c":                                     # свеча
            g.put(pane & (row == r) & (across < 1), MAT_CANDLE)
        elif width:
            g.put(pane & (row == r) & (across < width), MAT_FLAME)
    # --- Верх: выступающая рама, ступенчатая крыша, навершие-крестик.
    g.put(S(h + 0.02, CAGE_TOP, CAGE_TOP + 0.02), MAT_IRON)
    g.put(S(h + 0.04, CAGE_TOP + 0.02, CAGE_TOP + 0.04), MAT_IRON)
    g.put(S(h, CAGE_TOP + 0.04, CAGE_TOP + 0.08), MAT_IRON)
    g.put(S(0.08, CAGE_TOP + 0.08, CAGE_TOP + 0.12), MAT_IRON)
    g.put(S(0.06, CAGE_TOP + 0.12, CAGE_TOP + 0.14), MAT_IRON)
    g.put(S(0.04, CAGE_TOP + 0.14, CAGE_TOP + 0.18), MAT_IRON)
    g.put(S(0.02, CAGE_TOP + 0.18, CAGE_TOP + 0.26), MAT_IRON)              # стержень
    top = z + CAGE_TOP + 0.22
    cross = g.zs(top, top + 0.02) & (((ax < 0.04) & (ay < 0.02)) | ((ay < 0.04) & (ax < 0.02)))
    g.put(cross, MAT_IRON)
    return top + 0.04


def decorate(g, cx=0.0, cy=0.0, z=0.0):
    """Рисунок: стекло светлее к середине (там огонь), металл — блики на рамах, пламя — горячий центр."""
    v = VOXEL
    ax, ay = np.abs(g.X - cx), np.abs(g.Y - cy)
    glass = g.mat == MAT_GLASS
    flame = g.mat == MAT_FLAME
    across = np.where(ax > CAGE_HALF - v, g.SJ, g.SI)
    # Ореол: стекло рядом с пламенем светлее, к краям — темнее.
    near = np.zeros_like(flame)
    for dz in (-1, 0, 1):
        near |= np.roll(flame, dz, axis=2)
    near |= np.roll(flame, 1, axis=0) | np.roll(flame, -1, axis=0) | np.roll(flame, 1, axis=1) | np.roll(flame, -1, axis=1)
    g.tint(glass & near, +2)
    g.tint(glass & (across < 3) & ~near, +1)
    g.tint(glass & (across >= 3), -1)
    g.tint(glass & (g.Z < z + CAGE_BOTTOM + 0.06), -1)   # низ стекла — темнее (копоть)
    mid = z + CAGE_BOTTOM + 0.02 * 6.5
    g.tint(flame & (across < 1) & (np.abs(g.Z - mid) < 0.03), +1)   # самый горячий центр
    iron = g.mat == MAT_IRON
    g.tint(iron & ((ax > CAGE_HALF + 0.02) | (ay > CAGE_HALF + 0.02)), +1)       # кромки рам ловят свет
    g.noise(MAT_IRON, 0.12, 0.06, seed=31)


def make_grid():
    g = Grid(VOXEL, size_xy=0.40, height=0.72)
    add_lantern(g)
    decorate(g)
    return g


def build(col):
    g = make_grid()
    obj = g.build_mesh("Lantern", {MAT_IRON: IRON, MAT_GLASS: GLASS, MAT_FLAME: FLAME, MAT_CANDLE: CANDLE}, col)
    print("Lantern faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    """Фонарь на тумбе балюстрады + источник света внутри (как будет в игре)."""
    import bpy
    import style_preview
    from parts import balustrade
    import ps3d
    col = ps3d.collection("_PreviewPost")
    pg = Grid(VOXEL, size_xy=0.64, height=1.12)
    balustrade.add_post(pg, 0.0)
    balustrade.decorate(pg)
    post = pg.build_mesh("PreviewPost", {balustrade.MAT_STONE: balustrade.STONE}, col)
    post.location.z = -1.08
    light = bpy.data.lights.new("LanternLight", 'POINT')
    light.energy = 12
    light.color = [c for c in __import__("voxel").hex_srgb(LIGHT_COLOR)]
    light.shadow_soft_size = 0.03
    lo = bpy.data.objects.new("LanternLight", light)
    lo.location = LIGHT_POINT
    col.objects.link(lo)
    style_preview.render(objects, path, "studio", elevation=14, azimuth=30, fill=0.62)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=8, azimuth=12, fill=0.62)

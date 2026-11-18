"""Стул игрока — ВОКСЕЛЬНЫЙ стиль (кубики 2 см, как покерный стол).

Как на картинке Тима со столом: классический стул —
  спинка  — деревянная рамка (золотистое дерево) с красной бархатной вставкой; верх рамки — дугой
            (в середине выше, края ступеньками); под вставкой перекладина, ниже — просвет до сиденья;
            спинка чуть откинута назад
  сиденье — красная бархатная подушка (с кантом, середина чуть выпуклая) на деревянной царге
  ножки   — квадратные; задние продолжаются вверх стойками спинки

Начало координат — на полу под серединой сиденья. Стул смотрит на -Y (сидящий смотрит туда же);
в сцене его поворачивают лицом к столу. Стул зеркально симметричен слева-направо."""
import numpy as np

from parts import urn
from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ (метры)
# ---------------------------------------------------------------------------
VOXEL = 0.02
SEAT_HALF = 0.24          # половина ширины сиденья
SEAT_FRONT, SEAT_BACK = -0.22, 0.20   # сиденье спереди/сзади (по Y)
APRON = (0.36, 0.42)      # царга (деревянная рама под подушкой): низ, верх
SEAT_TOP = 0.48           # верх подушки (высота сиденья)
LEG_X = 0.21              # центр ножек по X
LEG_HALF = 0.03           # половина толщины ножки
BACK_Y = 0.19             # где стоит спинка (центр задних ножек по Y)
BACK_TILT = 0.10          # наклон спинки назад: на сколько метров уходит назад на метр высоты
CREST = (0.90, 0.06)      # верх рамки спинки у стоек и насколько он поднимается дугой к середине
BACK_RAIL = (0.56, 0.60)  # перекладина под вставкой
SEED = 3

# Дерево — золотистое (на картинке рамка светится тёплым), бархат — тёмно-красный.
WOOD = Palette("ChairWood", ["#2a1208", "#43200e", "#5e3015", "#7c441d", "#9a5a26", "#b87332", "#d18f42",
                             "#e6ad5a"], base=4, roughness=0.55)
VELVET = Palette("Velvet", ["#2a0606", "#3f0a0a", "#561010", "#6e1616", "#8a1e1c", "#a82824", "#c43a30"],
                 base=3, roughness=0.95)
MAT_WOOD, MAT_VELVET = 1, 2


def crest_top(x):
    return CREST[0] + CREST[1] * (1 - np.clip(np.abs(x) / SEAT_HALF, 0, 1) ** 2)


def make_grid(seed=SEED):
    rng = np.random.default_rng(seed)
    v = VOXEL
    g = Grid(v, size_xy=2 * SEAT_HALF + 0.08, size_y=0.64, height=CREST[0] + CREST[1] + 0.06)
    X, Y, Z = g.X, g.Y, g.Z
    ax = np.abs(X)
    yb = BACK_Y + BACK_TILT * np.clip(Z - SEAT_TOP, 0, None)     # плоскость спинки (откинута назад)
    ct = crest_top(X)
    # Ножки: передние — до царги, задние — до верха спинки (стойки).
    on_leg_x = np.abs(ax - LEG_X) < LEG_HALF
    front_legs = on_leg_x & (np.abs(Y - (SEAT_FRONT + LEG_HALF)) < LEG_HALF) & (Z < APRON[1])
    back_posts = on_leg_x & (np.abs(Y - yb) < LEG_HALF) & (Z < ct - v)
    g.put(front_legs | back_posts, MAT_WOOD)
    # Царга и подушка сиденья.
    g.put((ax < SEAT_HALF) & (Y > SEAT_FRONT) & (Y < SEAT_BACK) & g.zs(*APRON), MAT_WOOD)
    cushion = (ax < SEAT_HALF - v) & (Y > SEAT_FRONT - v) & (Y < SEAT_BACK - 2 * v) & g.zs(APRON[1], SEAT_TOP)
    g.put(cushion, MAT_VELVET)
    dome = cushion & (ax < SEAT_HALF - 5 * v) & (Y > SEAT_FRONT + 4 * v) & (Y < SEAT_BACK - 6 * v)   # середина
    # Спинка: верхняя рамка дугой, перекладина, бархатная вставка между ними.
    plane = np.abs(Y - yb) < 0.025
    crest = plane & (ax < SEAT_HALF) & (Z >= ct - 0.06) & (Z < ct)
    rail = plane & (ax < LEG_X) & g.zs(*BACK_RAIL)
    g.put(crest | rail, MAT_WOOD)
    panel = (np.abs(Y - yb) < 0.02) & (ax < LEG_X - LEG_HALF) & (Z >= BACK_RAIL[1]) & (Z < ct - 0.06)
    g.put(panel, MAT_VELVET)
    # --- узор ---------------------------------------------------------------------------------------
    wood = g.mat == MAT_WOOD
    vel = g.mat == MAT_VELVET
    # Резьба: светлая полоска по середине верхней рамки и по царге спереди.
    g.tint(crest & wood & (Z >= ct - 0.04) & (Z < ct - 0.02), +1)
    g.tint(wood & g.zs(APRON[0] + v, APRON[0] + 2 * v) & (Y < SEAT_FRONT + v), +1)
    # «Ушки» на концах верхней рамки — на кубик выше и светлее (как ступеньки на картинке).
    ears = plane & (np.abs(ax - (SEAT_HALF - 2 * v)) < 1.5 * v) & (Z >= ct) & (Z < ct + v)
    g.put(ears, MAT_WOOD)
    g.tint(ears, +1)
    # Бархат: кант по краю вставки и подушки темнее, середина светлее (выпуклость).
    edge_panel = vel & panel & ((ax > LEG_X - LEG_HALF - 2 * v) | (Z < BACK_RAIL[1] + v) | (Z > ct - 0.06 - 2 * v))
    g.tint(edge_panel, -1)
    g.tint(vel & panel & (ax < 0.08) & (Z > 0.66) & (Z < ct - 0.12), +1)
    g.tint(vel & cushion & ((ax > SEAT_HALF - 3 * v) | (Y < SEAT_FRONT + v)), -1)
    g.tint(vel & dome, +1)
    # Дерево: волокна (редкие тёмные/светлые крапинки), низ ножек темнее.
    g.noise(MAT_WOOD, 0.04, 0.03, seed=seed)
    g.noise(MAT_VELVET, 0.015, 0.01, seed=seed + 1)
    g.tint(wood & (Z < 0.04), -1)
    urn.mirror_x(g)                                         # зеркальная симметрия слева-направо
    return g


def build(col, seed=SEED, name="Chair"):
    g = make_grid(seed)
    obj = g.build_mesh(name, {MAT_WOOD: WOOD, MAT_VELVET: VELVET}, col)
    print(name, "faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", size=(900, 1100), elevation=14, azimuth=-30, fill=0.85)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", size=(900, 1100), elevation=14, azimuth=160,
                         fill=0.85)

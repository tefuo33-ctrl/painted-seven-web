# Фон: вид с террасы на море на закате — собирает все элементы фона, ставит свет и камеру,
# экспортирует КАЖДЫЙ элемент отдельным .glb и пишет схему расстановки для игры (JSON).
#
#   blender --background --python assets/3d/scripts/environment/background_scene.py
#
# Результат:
#   export/environment/background/*.glb        — элементы фона по отдельности
#   export/environment/background/layout.json  — где что стоит (для сборки сцены в игре)
#   previews/environment/background*.png       — вид с террасы + крупные планы
#   blend/environment/background.blend         — вся сцена в Blender
#
# Мир: пол террасы на высоте 0, балюстрада по линии y = 0, смотрим вдоль +Y. Море — на SEA_Z.
#
# РАССТАНОВКА ЗАМЕРЕНА ПО СЕТКЕ картинки Тима (доли кадра: x — слева направо, y — сверху вниз):
#   главное — ОКЕАН в центре; суша только по краям.
#   город справа: x 0.63…1.0; берег идёт прямо вдаль (≈125 м правее нас), поэтому в кадре он — диагональ
#   дворец: x 0.78…0.89, верх купола y 0.07, низ y 0.33  → ≈600 м от нас
#   замок на островке: x 0.10…0.17, низ на горизонте     → ≈900 м
#   горы слева — далеко (≈2.5 км) в дымке, вершина y≈0.37; ещё дальше низкий мыс у горизонта
#   дальние тёмные холмы справа вверху за дворцом
#   кораблик: x 0.31…0.34, y 0.48…0.61                   → ≈930 м
#   солнце: по центру, чуть выше горизонта

import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import ps3d  # noqa: E402
from bg_common import SEA_Z, Library, build_card, build_terrain, fbm, ground_under, raspberry  # noqa: E402
from voxel import hex_srgb  # noqa: E402
from parts import bg_buildings, bg_clouds, bg_nature, bg_sailboat, bg_sea, bg_sky  # noqa: E402

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
INCLUDE_TERRACE = True       # для превью поставить спереди нашу балюстраду, фонари, вазоны, колонны
# Балюстрада на превью: посередине 18 балясин между тумбами с фонарями, по бокам по 6 — до колонн
# (колонны встают у краёв кадра на линии балюстрады, перила входят прямо в них; над ними — арка).
MID_BALUSTERS = 18
SIDE_BALUSTERS = 6
TABLE_POS = (0.0, -2.3)      # покерный стол (только для вида «из-за стола»): 2.3 м перед балюстрадой
TABLE_CAM = dict(loc=(0.0, -4.7, 1.55), hfov=56.0, pitch=-9.6)   # вид как на картинке с игроками (подогнан по сетке)
SEED = 3
CAMERA = (0.0, -7.75, 1.7)               # глаза игрока на террасе
PITCH = 0.9                              # камера чуть смотрит вверх: горизонт ниже середины кадра
HFOV = 67.0
SUN_POS = (0.0, 3500.0, SEA_Z + 95.5)    # центр круга солнца; низ срезан у горизонта — «садится» (в игре оно ходит)
SUN_RADIUS = 83.0                        # размер и место замерены по картинке (шир. 0.036 кадра)
BOAT_POS = (-218.0, 931.0, SEA_Z)        # кораблик (в игре плывёт по траектории)
BOAT_SCALE = 3.8
SHORE_X = 125.0                          # берег справа: прямая вдаль на этом расстоянии вправо
TIP_Y = 760.0                            # где кончается мыс с городом (дальше — море)
PALACE_POS = (269.0, 600.0)
PALACE_SCALE = 2.3                       # дворец крупный, как на картинке
PALACE_BASE_Z = SEA_Z + 66.0             # его терраса: верх купола остаётся на ~0.07 высоты кадра
CASTLE_POS = (-438.0, 900.0)
CASTLE_SCALE = 2.2
HOUSE_SCALE = 2.0
OUT = os.path.join(ps3d.EXPORT_DIR, "background")

# Свет заката (для превью; в игре свет меняется по времени суток). Подобран по замерам цвета картинки.
LIGHT = dict(sun_energy=5.0, sun_color=(0.99, 0.73, 0.23),   # СОЛНЦЕ — главный источник: цвет как у солнца на картинке
             fill_energy=0.0, fill_color=(1.0, 0.46, 0.26),    # искусственной подсветки спереди нет
             ambient="#8a3a3c", ambient_strength=1.5, exposure=0.0)   # тёплый свет закатного неба (оно у горизонта оранжевое)

# Участки рельефа: центр в мире, размер, кубик, какие края уходят в воду.
RIGHT = dict(loc=(290.0, 520.0, 0.0), size=(360.0, 720.0), voxel=2.5, fade=("left", "back"))
ISLAND = dict(loc=(-415.0, 860.0, 0.0), size=(230.0, 190.0), voxel=2.0, fade=("left", "right", "front", "back"))
FAR_LEFT = dict(loc=(-1400.0, 2550.0, 0.0), size=(1500.0, 700.0), voxel=10.0, fade=("right", "front"))
FAR_CAPE = dict(loc=(-960.0, 3500.0, 0.0), size=(520.0, 220.0), voxel=12.0, fade=("left", "right", "front", "back"))
FAR_RIGHT = dict(loc=(820.0, 1450.0, 0.0), size=(900.0, 800.0), voxel=8.0, fade=("left", "front"))

HOUSE_ROWS = [16, 36, 58, 82, 108]      # ряды домов: расстояние от берега вглубь суши, м
HOUSES = 34
BUSHES = 140                             # кусты (пышные) — отдельно от деревьев

# ДЕРЕВЬЯ — по точкам кадра, как на картинке Тима: (x доли кадра, низ y, верх y, вид).
# Скрипт сам находит место на склоне, куда попадает низ, и подбирает высоту под верх.
TREE_SPOTS = [
    (0.725, 0.42, 0.26, "cypress_tall"),   # высокие кипарисы слева от дворца
    (0.762, 0.40, 0.26, "cypress_tall"),
    (0.705, 0.47, 0.38, "cypress_small"),
    (0.665, 0.51, 0.44, "cypress_small"),  # у начала города
    (0.890, 0.72, 0.45, "cypress_tall"),   # высокий внизу справа, у балюстрады
    (0.935, 0.62, 0.49, "cypress_small"),
    (0.690, 0.48, 0.36, "cypress_tall"),   # ещё несколько — как на картинке, между домами
    (0.815, 0.45, 0.33, "cypress_small"),
    (0.960, 0.50, 0.30, "cypress_tall"),
    (0.648, 0.53, 0.47, "cypress_small"),
]
# Группы круглых деревьев: (x, y низа в долях кадра, сколько деревьев, разброс, м).
TREE_GROUPS = [
    (0.745, 0.36, 5, 14.0), (0.915, 0.30, 7, 22.0), (0.97, 0.36, 5, 16.0),   # вокруг и за дворцом
    (0.80, 0.47, 3, 8.0), (0.86, 0.52, 3, 8.0), (0.70, 0.50, 3, 8.0),        # между домами
    (0.66, 0.52, 3, 8.0), (0.93, 0.44, 4, 10.0),
]
ISLAND_TREES = 22


ASPECT = 1838 / 627                      # пропорции кадра, как у картинки-референса


def project(x, y, z):
    """Куда точка мира попадает в кадре камеры с террасы: (x, y) в долях кадра (как сетка на картинке)."""
    p = math.radians(PITCH)
    dx, dy, dz = x - CAMERA[0], y - CAMERA[1], z - CAMERA[2]
    fwd = dy * math.cos(p) + dz * math.sin(p)
    up = -dy * math.sin(p) + dz * math.cos(p)
    th = math.tan(math.radians(HFOV / 2))
    return 0.5 + 0.5 * dx / (fwd * th), 0.5 - 0.5 * up / (fwd * th / ASPECT)


# ---------------------------------------------------------------------------
# Формы рельефа: функции получают координаты ВНУТРИ участка, возвращают высоту (мировую Z)
# ---------------------------------------------------------------------------
def right_s(wx, wy):
    """s — сколько метров от берега вглубь суши (мировые координаты). За мысом (TIP_Y) суша уходит вправо."""
    s = (wx - SHORE_X) + 12 * (fbm(wx, wy, 50, seed=11) - 0.5)
    return s - 3.0 * np.clip(wy - (TIP_Y - 60), 0, None)


def _right_raw(wx, wy):
    s = right_s(wx, wy)
    h = 6 * np.clip(s / 4, 0, 1) + 0.55 * np.clip(s, 0, None) + 10 * (fbm(wx, wy, 30, seed=12) - 0.5) * np.clip(s / 30, 0, 1)
    return np.where(s > 0, SEA_Z + np.minimum(h, 160), SEA_Z - 4)


def right_height(x, y):
    """Гора с городом: берег вдоль взгляда, склон поднимается вправо; под дворцом — ровная терраса."""
    wx, wy = x + RIGHT["loc"][0], y + RIGHT["loc"][1]
    h = _right_raw(wx, wy)
    px, py = PALACE_POS
    d = np.maximum(np.abs(wx - px) / (28 * PALACE_SCALE), np.abs(wy - py) / (18 * PALACE_SCALE))
    k = np.clip((d - 1.0) / 0.35, 0, 1)
    return PALACE_BASE_Z + (h - PALACE_BASE_Z) * k


def island_height(x, y):
    """Островок с замком: обрывы ~25 м, впереди — низкие скалы."""
    p = 1 - (x / 95) ** 2 - ((y - 10) / 62) ** 2 + 0.25 * (fbm(x, y, 22, seed=31) - 0.5)
    h = SEA_Z + 3 + 24 * np.clip(p * 2.2, 0, 1) ** 0.6
    rocks = 1 - (x / 80) ** 2 - ((y + 70) / 20) ** 2 + 0.4 * (fbm(x, y, 12, seed=33) - 0.5)
    h = np.maximum(h, np.where(rocks > 0, SEA_Z + 1 + 6 * np.clip(rocks, 0, 1) ** 0.5, SEA_Z - 3))
    return np.where((p > 0) | (rocks > 0), h, SEA_Z - 3)


def far_left_height(x, y):
    """Горы слева — далеко, в дымке: от левого края кадра опускаются к морю на ~0.27 ширины."""
    wx, wy = x + FAR_LEFT["loc"][0], y + FAR_LEFT["loc"][1]
    a = np.clip((-760 - wx) / 650, 0, 1)
    ridge = np.clip(1 - np.abs(wy - 2600) / 350, 0, 1)
    p = a ** 0.8 * (0.6 + 0.4 * ridge) + 0.12 * (fbm(wx, wy, 220, seed=21) - 0.5)
    return np.where(p > 0.03, SEA_Z + 210 * np.clip(p, 0, 1), SEA_Z - 8)


def far_cape_height(x, y):
    p = 1 - (x / 230) ** 2 - (y / 90) ** 2 + 0.3 * (fbm(x, y, 120, seed=71) - 0.5)
    return np.where(p > 0, SEA_Z + 60 * np.clip(p, 0, 1) ** 0.7, SEA_Z - 8)


def far_right_height(x, y):
    """Дальние тёмные холмы справа вверху, за дворцом."""
    u, w = (x + 450) / 900, (y + 400) / 800
    p = np.clip(0.15 + 0.5 * w + 0.45 * u + 0.25 * (fbm(x, y, 200, seed=51) - 0.5) - 0.2, 0, 1)
    return np.where(p > 0.05, SEA_Z + 240 * p ** 1.2, SEA_Z - 8)


def terrain(name, col, spec, z_top, fn, **kw):
    return build_terrain(name, col, spec["voxel"], *spec["size"], z_top, fn, spec["loc"], fade=spec["fade"], **kw)


# ---------------------------------------------------------------------------
def build_right(col, rng):
    """Город справа: рельеф + дворец на террасе в деревьях + ряды домов вдоль берега + зелень."""
    ter, H, foam = terrain("BgRight_Terrain", col, RIGHT, SEA_Z + 165, right_height, seed=1)
    objs = [ter] + ([foam] if foam else [])
    lib = Library(col)
    for key, kw in bg_buildings.HOUSES.items():
        lib.add(key, bg_buildings.make_house("BgRight_" + key, col, **kw))
    for key, kw in bg_nature.TREES.items():
        lib.add(key, bg_nature.make_tree("BgRight_" + key, col, **kw))
    px, py = PALACE_POS
    palace = bg_buildings.make_palace("BgRight_Palace", col, foundation=6)
    palace.scale = (PALACE_SCALE,) * 3
    palace.location = (px, py, PALACE_BASE_Z)        # стоит на своей ровной террасе
    objs.append(palace)
    pw, pd = 27 * PALACE_SCALE, 17 * PALACE_SCALE
    taken = []

    def free(x, y, r):
        if abs(x - px) < pw + r and abs(y - py) < pd + r:
            return False
        return all((x - a) ** 2 + (y - b) ** 2 > (r + c) ** 2 for a, b, c in taken)

    # Дома: ряды-террасы вдоль берега (на одинаковом расстоянии от воды), фасадом к морю или к нам.
    keys = list(bg_buildings.HOUSES)
    placed = 0
    for row in HOUSE_ROWS:
        y = 190.0 + rng.uniform(0, 15)
        in_row = 0
        while y < TIP_Y - 40 and placed < HOUSES and in_row < HOUSES // len(HOUSE_ROWS) + 1:
            key = keys[int(rng.integers(len(keys)))]
            kw = bg_buildings.HOUSES[key]
            rot = int(rng.choice([0, 3]))                  # 0 — фасад к нам, 3 — фасад к морю (влево)
            w, d = (kw["w"], kw["d"]) if rot == 0 else (kw["d"], kw["w"])
            w, d = w * HOUSE_SCALE, d * HOUSE_SCALE
            x = SHORE_X + row + w / 2 + rng.uniform(-3, 3)
            y += d / 2
            if free(x, y, max(w, d) / 2) and right_s(np.array(x), np.array(y)) > 6:
                o = lib.place(key, (x, y, ground_under(H, x, y, w / 2, d / 2) - 0.8), rot)   # чуть утоплен в землю
                o.scale = (HOUSE_SCALE,) * 3
                objs.append(o)
                taken.append((x, y, max(w, d) / 2 + 1))
                placed += 1
                in_row += 1
            y += d / 2 + rng.uniform(16, 50)          # дома ряда расходятся вдоль всего берега

    # Деревья по точкам кадра (как на картинке): ищем на склоне место, куда попадает низ дерева.
    lx0, ly0 = RIGHT["loc"][0], RIGHT["loc"][1]
    gx, gy = np.meshgrid(np.arange(SHORE_X + 4, lx0 + 180, 1.5), np.arange(ly0 - 340, TIP_Y, 1.5))
    gx, gy = gx.ravel(), gy.ravel()
    ok = right_s(gx, gy) > 4
    gx, gy = gx[ok], gy[ok]
    gz = H(gx, gy)
    fx, fy = project(gx, gy, gz)
    tops = {"cypress_tall": 17.0, "cypress_small": 12.0, "tree_round": 7.0, "tree_wide": 6.0}

    def spot(tx, ty):
        order = np.argsort(((fx - tx) * ASPECT) ** 2 + (fy - ty) ** 2)
        for i in order[:400]:
            if free(gx[i], gy[i], 2.0):
                return float(gx[i]), float(gy[i]), float(gz[i])
        return None

    def height_scale(x, y, z, top_frac, model_top):
        _, f0 = project(np.array([x]), np.array([y]), np.array([z]))
        _, f1 = project(np.array([x]), np.array([y]), np.array([z + 10.0]))
        per_m = (f0[0] - f1[0]) / 10.0
        return float(np.clip((f0[0] - top_frac) / per_m / model_top, 0.8, 8.0))

    for tx, tb, tt, key in TREE_SPOTS:
        p = spot(tx, tb)
        if p:
            x, y, z = p
            o = lib.place(key, (x, y, z - 0.5), int(rng.integers(4)))
            o.scale = (height_scale(x, y, z, tt, tops[key]),) * 3
            objs.append(o)
            taken.append((x, y, 3.0))
    for tx, tb, n, spread in TREE_GROUPS:
        p = spot(tx, tb)
        if not p:
            continue
        cx, cy, _ = p
        k, tries = 0, 0
        while k < n and tries < 200:
            tries += 1
            x, y = cx + rng.uniform(-spread, spread), cy + rng.uniform(-spread, spread)
            if right_s(np.array(x), np.array(y)) < 4 or not free(x, y, 2.5):
                continue
            key = ["tree_round", "tree_wide"][int(rng.integers(2))]
            o = lib.place(key, (x, y, float(H(x, y)) - 0.5), int(rng.integers(4)))
            o.scale = (rng.uniform(1.7, 2.4),) * 3
            objs.append(o)
            taken.append((x, y, 3.5))
            k += 1
    # Кусты (пышные, низкие) — по склону между домами.
    n, tries = 0, 0
    while n < BUSHES and tries < 20000:
        tries += 1
        x, y = rng.uniform(SHORE_X, lx0 + 180), rng.uniform(ly0 - 340, TIP_Y)
        s = float(right_s(np.array(x), np.array(y)))
        if s < 4 or rng.random() > 0.4 + s / 150 or not free(x, y, 1.5):
            continue
        o = lib.place("bush", (x, y, float(H(x, y)) - 0.4), int(rng.integers(4)))
        o.scale = (rng.uniform(1.4, 2.2),) * 3
        objs.append(o)
        taken.append((x, y, 1.8))
        n += 1
    lib.drop_unused()
    print("right: houses", placed)
    return objs


def build_left(col, rng):
    """Слева: островок с замком (средний план) — горы и мыс далеко, в дымке (build_far)."""
    isl, Hi, foam = terrain("BgLeft_Island", col, ISLAND, SEA_Z + 40, island_height, seed=3)
    objs = [isl] + ([foam] if foam else [])
    castle = bg_buildings.make_castle("BgLeft_Castle", col)
    castle.scale = (CASTLE_SCALE,) * 3
    cx, cy = CASTLE_POS
    castle.location = (cx, cy, ground_under(Hi, cx, cy, 14 * CASTLE_SCALE, 8 * CASTLE_SCALE) - 0.5)
    objs.append(castle)
    lib = Library(col)
    for key in ("tree_round", "tree_wide", "cypress_tall"):
        lib.add(key, bg_nature.make_tree("BgLeft_" + key, col, **bg_nature.TREES[key]))
    (lx, ly, _), (sx, sy) = ISLAND["loc"], ISLAND["size"]
    k, tries = 0, 0
    while k < ISLAND_TREES and tries < 6000:
        tries += 1
        x, y = rng.uniform(lx - sx / 2, lx + sx / 2), rng.uniform(ly - sy / 2, ly + sy / 2)
        z = float(Hi(x, y))
        if z < SEA_Z + 4 or (x - cx) ** 2 + (y - cy) ** 2 < 32 ** 2:
            continue
        o = lib.place(["tree_round", "tree_wide", "cypress_tall"][int(rng.integers(3))], (x, y, z - 0.5),
                      int(rng.integers(4)))
        o.scale = (rng.uniform(1.4, 2.0),) * 3
        objs.append(o)
        k += 1
    lib.drop_unused()
    return objs


def build_far(col):
    """Дальний план — плоские силуэты в дымке (как на картинке): горы слева, дальний мыс, холмы справа."""

    def left_top(X):
        a = np.clip((-760 - X) / 650, 0, 1)
        return SEA_Z + 190 * a ** 0.8 + 70 * (fbm(X, 0, 180, seed=21, octaves=4) - 0.5) * a - 6

    def cape_top(X):
        p = np.clip(1 - ((X + 960) / 240) ** 2, 0, 1)
        return SEA_Z + 55 * p ** 0.6 + 6 * (fbm(X, 0, 60, seed=71) - 0.5) * p - 3

    def right_top(X):
        a = np.clip((X - 330) / 800, 0, 1)
        return SEA_Z + 60 + 190 * a ** 0.7 + 22 * (fbm(X, 0, 140, seed=51) - 0.5)

    fl = build_card("BgFar_LeftMountains", col, 10.0, -2400, -640, 2550, left_top, "far")
    fc = build_card("BgFar_LeftCape", col, 12.0, -1240, -680, 3500, cape_top, "far2")
    fr = build_card("BgFar_RightHills", col, 8.0, 300, 1300, 1450, right_top, "hill")
    return [fl, fc, fr]


def build_terrace(col):
    """Передний план для превью: наши готовые детали, как на картинке с террасы.
    Балюстрада: посередине MID_BALUSTERS балясин между двумя тумбами с фонарями, по бокам — участки по
    SIDE_BALUSTERS балясин, которые без тумбы входят прямо в колонны. Колонны стоят на линии балюстрады
    у краёв кадра, на них — одна широкая арка. Вазоны с цветами — перед колоннами."""
    from parts import arch, balustrade, column, lantern, urn
    from voxel import Grid, hex_srgb
    sp = balustrade.SPACING
    post = 2 * balustrade.POST_HALF
    mid_run, side_run = MID_BALUSTERS * sp, SIDE_BALUSTERS * sp
    side_cx = mid_run / 2 + post + side_run / 2
    col_x = side_cx + side_run / 2 + column.SHAFT_HALF            # колонна сразу за последней балясиной
    total = 2 * (col_x + column.BASE[0][0])
    g = Grid(balustrade.VOXEL, size_xy=total + 0.16, size_y=balustrade.DEPTH + 0.28, height=1.12)
    balustrade.add_section(g, 0.0, balusters=MID_BALUSTERS)                       # с тумбами под фонари
    for s in (-1, 1):                                                             # перила заходят в колонну
        balustrade.add_section(g, s * side_cx, balusters=SIDE_BALUSTERS, posts=False, ext=0.06)
    balustrade.decorate(g)
    objs = [g.build_mesh("Terrace_Balustrade", {balustrade.MAT_STONE: balustrade.STONE}, col)]
    # Колонны и арка на них.
    co = column.build(col)[0]
    co.location = (-col_x, 0, 0)
    c2 = co.copy()
    col.objects.link(c2)
    c2.location = (col_x, 0, 0)
    ar = arch.build(col, span=2 * col_x)[0]
    ar.location = (0, 0, 0)
    objs += [co, c2, ar]
    # Лоза с цветами — только на правой колонне (как на картинке), на углу, который смотрит в кадр.
    from parts import vine
    vr = vine.build(col, corner=0.0, name="Vine_Right")[0]
    vr.location = (col_x, 0, 0)
    objs.append(vr)
    # Фонари — на тумбах (как были).
    lan = lantern.build(col)[0]
    lx = mid_run / 2 + balustrade.POST_HALF
    lan.location = (-lx, 0, 1.08)
    lan2 = lan.copy()
    col.objects.link(lan2)
    lan2.location = (lx, 0, 1.08)
    objs += [lan, lan2]
    for o in (lan, lan2):
        L = bpy.data.lights.new("TerraceLanternLight", 'POINT')
        L.energy = 25
        L.color = (1.0, 0.72, 0.42)
        lo = bpy.data.objects.new("TerraceLanternLight", L)
        lo.location = Vector(o.location) + Vector(lantern.LIGHT_POINT)
        col.objects.link(lo)
    # Вазоны — у колонн, перед концом балюстрады (как на картинке с террасы — у краёв кадра).
    ux = col_x - 0.40
    uy = -(balustrade.DEPTH / 2 + 0.04) - urn.PEDESTAL_HALF
    for o in urn.build(col):
        o.location = (-ux, uy, 0)
        c = o.copy()
        col.objects.link(c)
        c.location = (ux, uy, 0)
        objs += [o, c]
    verts, faces, cols = [], [], []
    tones = ["#b48c78", "#c49c86", "#a8826e"]
    frng = np.random.default_rng(9)
    for i in range(-10, 10):
        for j in range(-14, 0):
            b = len(verts)
            verts += [(i, j, 0), (i + 1, j, 0), (i + 1, j + 1, 0), (i, j + 1, 0)]
            faces.append((b, b + 1, b + 2, b + 3))
            cols.append(hex_srgb(tones[int(frng.integers(3))]) + [1.0])
    me = bpy.data.meshes.new("Terrace_Floor")
    me.from_pydata(verts, [], faces)
    a = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    a.data.foreach_set("color_srgb", [c for cc in cols for c in cc * 4])
    m = bpy.data.materials.new("TerraceFloor")
    m.use_nodes = True
    vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    m.node_tree.links.new(vc.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.15
    me.materials.append(m)
    floor = bpy.data.objects.new("Terrace_Floor", me)
    col.objects.link(floor)
    return objs + [floor]


def setup_lighting(col):
    """Закатный свет (один вариант; в игре свет меняется по времени суток)."""
    sun_dir = (Vector(SUN_POS) - Vector(CAMERA)).normalized()
    d = bpy.data.lights.new("SunLight", 'SUN')
    d.energy = LIGHT["sun_energy"]
    d.color = tuple(raspberry(LIGHT["sun_color"]))            # свет заката чуть малиновее (RASPBERRY)
    d.angle = math.radians(2)
    o = bpy.data.objects.new("SunLight", d)
    o.rotation_euler = (-sun_dir).to_track_quat('-Z', 'Y').to_euler()
    col.objects.link(o)
    f = bpy.data.lights.new("SunsetFill", 'SUN')
    f.energy = LIGHT["fill_energy"]
    f.color = LIGHT["fill_color"]
    fo = bpy.data.objects.new("SunsetFill", f)
    fo.rotation_euler = (math.radians(50), 0, math.radians(-35))
    col.objects.link(fo)
    amb = raspberry(hex_srgb(LIGHT["ambient"]))
    ps3d.world_color("#%02x%02x%02x" % tuple(int(round(v * 255)) for v in amb), LIGHT["ambient_strength"])
    return sun_dir


def camera(col, name="BgCam", loc=CAMERA, target=None, lens=None, pitch_deg=PITCH):
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = 'HORIZONTAL'
    cd.lens = lens if lens else 18.0 / math.tan(math.radians(HFOV / 2))
    cd.clip_end = 12000
    cd.clip_start = 0.1
    cam = bpy.data.objects.new(name, cd)
    col.objects.link(cam)
    cam.location = loc
    if target is None:
        cam.rotation_euler = (math.radians(90 + pitch_deg), 0, 0)
    else:
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return cam


def render(cam, path, size):
    s = bpy.context.scene
    s.camera = cam
    ps3d.setup_render(size[0], size[1], path)
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.render.filter_size = 0.8
    s.view_settings.exposure = LIGHT["exposure"]
    bpy.ops.render.render(write_still=True)


def export(objs, name):
    ps3d.export_glb(objs, os.path.join(OUT, name + ".glb"))
    return f"background/{name}.glb"


def main():
    ps3d.clear_scene()
    rng = np.random.default_rng(SEED)
    col = ps3d.collection
    c_right, c_left, c_far = col("BgRight"), col("BgLeft"), col("BgFar")
    c_sea, c_sky, c_boat, c_pre = col("BgSea"), col("BgSkyElements"), col("BgBoat"), col("Preview")
    right = build_right(c_right, rng)
    left = build_left(c_left, rng)
    far = build_far(c_far)
    sea = bg_sea.make_sea(c_sea, SEA_Z, camera=CAMERA[:2], sun_pos=SUN_POS[:2])
    sun = bg_sky.make_sun(c_sky, radius=SUN_RADIUS)
    sun.location = SUN_POS
    clouds = bg_clouds.make_clouds(c_sky, CAMERA, PITCH, HFOV, ASPECT)
    boat = bg_sailboat.build(c_boat)[0]
    boat.location = BOAT_POS
    boat.scale = (BOAT_SCALE,) * 3
    boat.rotation_euler = (0, 0, math.radians(8))
    sun_dir = setup_lighting(c_pre)
    bg_sky.make_sky_dome(c_pre, CAMERA, sun_dir=tuple(sun_dir), frame=(PITCH, HFOV, ASPECT))
    terrace = build_terrace(c_pre) if INCLUDE_TERRACE else []

    def faces(objs):
        return sum(len(o.data.polygons) for o in {o.data: o for o in objs}.values())

    print("FACES right", faces(right), "left", faces(left), "far", faces(far), "sea", len(sea.data.polygons),
          "clouds", faces(clouds), "objects right", len(right), "left", len(left))

    os.makedirs(OUT, exist_ok=True)
    for old in ("bg_left_coast.glb", "bg_far_mountains.glb"):
        p = os.path.join(OUT, old)
        if os.path.exists(p):
            os.remove(p)
    layout = {
        "units": "метры; пол террасы z=0, балюстрада по y=0, вид вдоль +Y",
        "sea_z": SEA_Z,
        "camera": {"position": CAMERA, "hfov_deg": HFOV, "pitch_deg": PITCH},
        "elements": [
            {"name": "right_town", "file": export(right, "bg_right_town"), "static": True},
            {"name": "left_island_castle", "file": export(left, "bg_left_island"), "static": True},
            {"name": "far_mountains", "file": export(far, "bg_far"), "static": True},
            {"name": "sea", "file": export([sea], "bg_sea"), "static": True,
             "note": "солнечная дорожка нарисована для солнца в SUN_POS; при движении солнца — пересчитать"},
            {"name": "sun", "file": export([sun], "bg_sun"), "moves": "по небу (день/ночь)", "position": SUN_POS,
             "billboard": True},
            {"name": "clouds", "file": export(clouds, "bg_clouds"), "moves": "медленно дрейфуют (вдоль X)",
             "note": "все облака на плоскости y = %.0f, форма и цвет — карта assets/3d/source/clouds_map.png"
                     % bg_clouds.CLOUD_Y,
             "positions": {o.name: tuple(o.location) for o in clouds}},
            {"name": "sailboat", "file": export([boat], "bg_sailboat"), "moves": "плывёт по траектории",
             "position": BOAT_POS, "scale": BOAT_SCALE, "forward": "+X"},
        ],
        "materials_note": "Vox_BgWindow — окна (днём выключать), Vox_SeaGlint — солнечная дорожка, "
                          "Vox_BgFoam — пена прибоя",
        "sky_sunset": bg_sky.SKY_SUNSET,
    }
    with open(os.path.join(OUT, "layout.json"), "w", encoding="utf-8") as f:
        json.dump(layout, f, ensure_ascii=False, indent=2)

    prev = ps3d.PREVIEW_DIR
    render(camera(c_pre), os.path.join(prev, "background.png"), (1838, 627))
    for o in terrace:
        o.hide_render = True
    render(camera(c_pre, "TownCam", lens=60, target=(220, 480, SEA_Z + 50)), os.path.join(prev, "background_town.png"), (1400, 800))
    render(camera(c_pre, "LeftCam", lens=60, target=(-430, 900, SEA_Z + 20)), os.path.join(prev, "background_left.png"), (1400, 700))
    if INCLUDE_TERRACE:
        # Вид «из-за стола» — как на картинке Тима с игроками: стол перед аркой, камера за спиной игрока.
        for o in terrace:
            o.hide_render = False
        from parts import poker_table
        for o in poker_table.build(c_pre):
            o.location = (TABLE_POS[0], TABLE_POS[1], 0)
        render(camera(c_pre, "TableCam", loc=TABLE_CAM["loc"], lens=18.0 / math.tan(math.radians(TABLE_CAM["hfov"] / 2)),
                      pitch_deg=TABLE_CAM["pitch"]),
               os.path.join(prev, "background_table.png"), (1448, 1086))
    ps3d.save_blend(os.path.join(ps3d.BLEND_DIR, "background.blend"))
    print("OK background")


main()

"""Колонна террасы (столб под арками) — ВОКСЕЛЬНЫЙ стиль, как балюстрада, фонарь и вазон.

Как на картинке Тима (правая колонна): квадратный каменный столб, сложенный из крупных блоков;
наверху ступенчатая капитель — пояс, ступень и толстая плита, на которую опираются арки;
внизу ступенчатая база (на картинке её закрывает вазон, который стоит перед колонной).

Строение (снизу вверх):
  база     — две ступени
  ствол    — крупные камни рядами по 28 см (один камень на грань), швы у углов «вразбежку»,
             у каждого камня свой оттенок, сколы на рёбрах
  капитель — полочка, пояс, ступень, плита (верх светлее)

Камень — тот же, что у балюстрады (balustrade.STONE). Кубики 4 см, как у камня вазона:
на крупной детали мелкие 2-см кубики выглядят слишком пёстро.
Чтобы всё было СИММЕТРИЧНЫМ: ширины — нечётное число кубиков (центральный кубик ровно на оси)."""
import numpy as np

from parts import balustrade
from voxel import Grid

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.04
HEIGHT = 3.08            # от пола до верха плиты капители (здесь начинаются арки), м
SHAFT_HALF = 0.30        # половина ширины ствола, м (ствол 60 см)
COURSE = 0.28            # высота ряда кладки, м (9 рядов на стволе)
CHIPS = 0.06             # доля «сколов» на рёбрах ствола (0 — без сколов)
SEED = 5                 # другое число — другой узор блоков

# Профиль снизу вверх: (половина ширины, низ, верх, скруглить углы). Половины — нечётное число полукубиков.
BASE = [
    (0.42, 0.00, 0.08, False),   # база, ступень 1
    (0.38, 0.08, 0.16, False),   # ступень 2
    (0.34, 0.16, 0.20, True),    # полочка
]
CAPITAL = [
    (0.34, 2.72, 2.76, True),    # полочка
    (0.38, 2.76, 2.88, False),   # пояс
    (0.42, 2.88, 2.92, False),   # ступень
    (0.46, 2.92, 3.08, False),   # плита — на неё опираются арки
]
SHAFT_Z = (0.20, 2.72)

STONE = balustrade.STONE
MAT_STONE = 1


def add_column(g):
    for half, z0, z1, rounded in BASE + CAPITAL:
        g.put(g.square_at(0, 0, half, z0, z1, round_corners=rounded), MAT_STONE)
    g.put(g.square_at(0, 0, SHAFT_HALF, *SHAFT_Z), MAT_STONE)


def _face_coord(g):
    """Для кубиков на поверхности ствола: номер от оси вдоль грани (SI для граней ±Y, SJ для граней ±X)."""
    v = g.v
    on_y = np.abs(np.abs(g.Y) - (SHAFT_HALF - v / 2)) < v / 2       # передняя/задняя грань
    on_x = np.abs(np.abs(g.X) - (SHAFT_HALF - v / 2)) < v / 2       # боковые грани
    return on_x, on_y


def decorate(g, rng):
    v = g.v
    s = g.mat == MAT_STONE
    shaft = s & g.zs(*SHAFT_Z)
    on_x, on_y = _face_coord(g)
    surface = shaft & (on_x | on_y)
    course = np.floor((g.Z - SHAFT_Z[0]) / COURSE + 1e-6).astype(int)
    k_in = np.round((g.Z - SHAFT_Z[0]) / v - 0.5).astype(int) % int(round(COURSE / v))
    # Горизонтальные швы между рядами, у камня светлая верхняя кромка (пиксельная «фаска»).
    g.tint(surface & (k_in == 0), -2)
    g.tint(surface & (k_in == int(round(COURSE / v)) - 1), +1)
    # Крупные камни: в каждом ряду на грани ОДИН камень, швы — у углов, «вразбежку» (как угловые камни
    # настоящей кладки): в чётных рядах передний камень заходит за угол, в нечётных — боковой.
    pos = np.where(on_y, g.SI, g.SJ)                       # 0 — центральный кубик грани, 7 — угол
    front = on_y & ~on_x
    joint = (pos == 6) & np.where(course % 2 == 0, on_x & ~on_y, front)
    g.tint(surface & joint & (k_in != 0), -1)
    # Каждый камень — свой оттенок (как блоки на листе ассетов): -1, 0 или +1.
    face = np.where(on_y, np.sign(g.Y) * 2, np.sign(g.X))  # какая из 4 граней
    key = np.clip(course, 0, None) * 8 + (face.astype(int) + 2)
    tones = rng.choice([-1, 0, 0, 1], size=key.max() + 2)
    g.shade[surface & s] += tones[key[surface & s]]
    # Капитель: тень под плитой, светлый верх плиты; база: шов между ступенями.
    g.tint(s & g.zs(2.80, 2.84) & ((np.abs(g.X) > 0.38 - v) | (np.abs(g.Y) > 0.38 - v)), -1)  # желобок пояса
    g.tint(s & g.zs(2.88, 2.92), -1)                        # тень под плитой
    g.tint(s & g.zs(3.04, 3.08), +1)                        # светлый верх плиты
    g.tint(s & g.zs(0.08, 0.12), -1)
    g.tint(s & (g.Z < 0.04), -1)                            # низ темнее (пыль, тень от пола)
    # Пятна и крапинка камня.
    g.noise(MAT_STONE, 0.10, 0.06, seed=31, blot=3)
    g.noise(MAT_STONE, 0.03, 0.02, seed=32)
    # Сколы: выбиваем угловые кубики на рёбрах ствола и плиты.
    if CHIPS:
        corner = shaft & on_x & on_y
        g.cut(corner & (rng.random(g.mat.shape) < CHIPS))
        slab_edge = s & g.zs(2.92, 3.08) & (np.abs(g.X) > 0.46 - v) & (np.abs(g.Y) > 0.46 - v)
        g.cut(slab_edge & (rng.random(g.mat.shape) < CHIPS * 2))


def make_grid(seed=SEED):
    rng = np.random.default_rng(seed)
    g = Grid(VOXEL, size_xy=1.00, height=HEIGHT + 0.04)        # 25 кубиков: центральный — ровно на оси
    add_column(g)
    decorate(g, rng)
    return g


def build(col, seed=SEED):
    g = make_grid(seed)
    obj = g.build_mesh("Column", {MAT_STONE: STONE}, col)
    print("Column faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", size=(720, 1100), elevation=10, azimuth=25, fill=0.72)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", size=(720, 1100), elevation=8, azimuth=-20,
                         fill=0.72)

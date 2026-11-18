"""Балюстрада террасы — ВОКСЕЛЬНЫЙ стиль (кубики 2 см, как стол).

Секция = тумба | ряд балясин | тумба. Секции ставятся в ряд вдоль края террасы;
на тумбы ставятся фонари.

Строение (снизу вверх):
  цоколь   — две ступени
  брус     — на нём стоят балясины
  балясины — квадратное сечение: основание, «пузо», тонкая шейка, колечко, расширение, шапка
  перила   — подрезка снизу, толстый брус, скруглённый верх; швы между каменными блоками
  тумбы    — база в две ступени, тело с утопленной рамкой-филёнкой, карниз в две ступени

Чтобы всё было СИММЕТРИЧНЫМ: размеры кратны 2 см, центры деталей — на границах кубиков."""
import numpy as np

from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.02
SPACING = 0.28         # шаг балясин, м (было 0.24, +17%). Кратно 0.04 — тогда форма строго симметрична

# ДЛИНА ЗАБОРА ЕЩЁ НЕ ОКОНЧАТЕЛЬНАЯ — подберём под террасу.
# Тумбы не меняются, растягивается только забор между ними:
RUN_LENGTH = 2.24      # длина забора между двумя тумбами, м (число балясин считается само)
SECTIONS = 1           # сколько таких участков подряд (тумбы встают между ними)

DEPTH = 0.32           # толщина перил, м
POST_HALF = 0.22       # половина ширины тумбы, м
WITH_POSTS = True      # False — забор без тумб
CHIPS = 0.012         # доля «сколов» на рёбрах перил и цоколя (0 — без сколов)

# Профиль балясины: (полуширина, низ, верх, скруглить углы) — в метрах. Меняй форму здесь.
BALUSTER = [
    (0.08, 0.16, 0.20, False),   # основание
    (0.06, 0.20, 0.24, True),
    (0.08, 0.24, 0.44, True),    # «пузо»
    (0.06, 0.44, 0.50, True),
    (0.04, 0.50, 0.58, False),   # шейка
    (0.06, 0.58, 0.60, True),    # колечко
    (0.04, 0.60, 0.64, False),
    (0.06, 0.64, 0.72, True),    # расширение кверху
    (0.08, 0.72, 0.80, True),    # шапка под перилами
]

# Камень: тёплый песчаник (при нейтральном свете — розоватый, как на листе; на закате — персиковый).
STONE = Palette("Stone", ["#3a2220", "#5a362f", "#7e5144", "#a06d5a", "#bf8b72", "#d6a68a", "#e8c0a2", "#f4d6ba"],
                base=5, roughness=0.8)
MAT_STONE = 1


def balusters_for(run_length):
    """Сколько балясин помещается на участке заданной длины (шаг SPACING)."""
    return max(1, int(round(run_length / SPACING)))


BALUSTERS = balusters_for(RUN_LENGTH)


def add_section(g, cx=0.0, balusters=BALUSTERS, posts=WITH_POSTS, ext=None):
    """Добавить секцию в сетку g. cx — центр секции по X. Возвращает высоту верха перил.
    ext — на сколько перила и цоколь заходят за крайние балясины (например, в колонну); по умолчанию — в тумбы."""
    v = VOXEL
    run = balusters * SPACING                 # длина ряда балясин
    hd = DEPTH / 2
    x0, x1 = cx - run / 2, cx + run / 2
    if ext is None:
        ext = POST_HALF if posts else 0.0     # перила и цоколь заходят в тумбы
    # Цоколь в две ступени и брус под балясинами.
    g.put(g.box(x0 - ext, x1 + ext, -hd - 0.02, hd + 0.02, 0.00, 0.06), MAT_STONE)
    g.put(g.box(x0 - ext, x1 + ext, -hd + 0.02, hd - 0.02, 0.06, 0.12), MAT_STONE)
    g.put(g.box(x0 - ext, x1 + ext, -hd + 0.04, hd - 0.04, 0.12, 0.16), MAT_STONE)
    # Балясины.
    for i in range(balusters):
        bx = x0 + SPACING * (i + 0.5)
        g.put(g.turned_square(bx, 0.0, BALUSTER), MAT_STONE)
    # Перила.
    g.put(g.box(x0 - ext, x1 + ext, -hd + 0.04, hd - 0.04, 0.80, 0.84), MAT_STONE)   # подрезка
    g.put(g.box(x0 - ext, x1 + ext, -hd, hd, 0.84, 0.94), MAT_STONE)                 # брус
    g.put(g.box(x0 - ext, x1 + ext, -hd + 0.02, hd - 0.02, 0.94, 0.96), MAT_STONE)   # скруглённый верх
    top = 0.96
    if posts:
        for side in (-1, 1):
            add_post(g, cx + side * (run / 2 + POST_HALF))
    return top


def add_post(g, px):
    """Тумба с центром px. Наверху — ровная площадка под фонарь (верх на 1.08 м)."""
    v = VOXEL
    h = POST_HALF
    g.put(g.square_at(px, 0, h + 0.04, 0.00, 0.08), MAT_STONE)              # база, ступень 1
    g.put(g.square_at(px, 0, h + 0.02, 0.08, 0.14), MAT_STONE)              # ступень 2
    g.put(g.square_at(px, 0, h, 0.14, 0.96), MAT_STONE)                     # тело
    # Филёнка: утопленная на 1 кубик панель на каждой из 4 сторон, вокруг — рамка.
    ax, ay = np.abs(g.X - px), np.abs(g.Y)
    panel_z = g.zs(0.26, 0.84)
    inset_x = (ax > h - v) & (ay < h - 0.08)
    inset_y = (ay > h - v) & (ax < h - 0.08)
    g.cut((inset_x | inset_y) & panel_z & (ax < h) & (ay < h))
    g.put(g.square_at(px, 0, h + 0.02, 0.96, 1.00), MAT_STONE)              # карниз, ступень 1
    g.put(g.square_at(px, 0, h + 0.04, 1.00, 1.06), MAT_STONE)              # ступень 2
    g.put(g.square_at(px, 0, h + 0.02, 1.06, 1.08, round_corners=True), MAT_STONE)


def decorate(g):
    """Рисунок камня: швы между блоками, светлые верхние плиты, тень внизу, сколы."""
    v = VOXEL
    s = g.mat == MAT_STONE
    # Швы перил и цоколя: каждые ~0.5 м, симметрично от центра.
    rail = s & (g.Z > 0.80)
    g.tint(rail & (g.SI % 24 == 23) & (np.abs(g.Y) < DEPTH / 2), -2)
    base = s & (g.Z < 0.16)
    g.tint(base & ((g.SI + 12) % 24 == 23), -2)
    g.tint(base & (g.K == 2), -1)                              # линия между ступенями цоколя
    # Тумбы: каменная кладка — ряды по 14 см и вертикальные швы вразбежку.
    course = (g.K // 7)
    g.tint(s & (g.K % 7 == 0) & (g.Z > 0.14) & (g.Z < 0.96) & (np.abs(g.Y) >= POST_HALF - v), -1)
    # Низ темнее (пыль, тень от пола), верх перил светлее (выгорел на солнце).
    g.tint(s & (g.Z < 0.06), -1)
    g.tint(s & (g.Z > 0.93), +1)
    # Немного «пятен» камня.
    g.noise(MAT_STONE, 0.12, 0.08, seed=11, blot=3)    # крупные мягкие пятна
    g.noise(MAT_STONE, 0.03, 0.02, seed=12)            # редкая мелкая крапинка
    # Сколы: случайно выбиваем угловые кубики на рёбрах перил и цоколя.
    if CHIPS:
        rng = np.random.default_rng(21)
        hd = DEPTH / 2
        edge = (np.abs(np.abs(g.Y) - (hd - v / 2)) < v / 2) & (g.zs(0.92, 0.94) | g.zs(0.84, 0.86))
        edge |= (np.abs(np.abs(g.Y) - (hd + 0.02 - v / 2)) < v / 2) & g.zs(0.04, 0.06)
        g.cut(edge & s & (rng.random(g.mat.shape) < CHIPS))


def make_grid(run_length=RUN_LENGTH, sections=SECTIONS, posts=WITH_POSTS):
    """Забор: sections участков по run_length метров; тумбы — по краям и между участками."""
    n = balusters_for(run_length)
    run = n * SPACING
    post_w = 2 * POST_HALF if posts else 0.0
    inner = sections * run + (sections + 1) * post_w           # длина забора от края до края тумб
    g = Grid(VOXEL, size_xy=inner + 0.16, size_y=DEPTH + 0.28, height=1.12)
    for i in range(sections):
        cx = -inner / 2 + post_w + i * (run + post_w) + run / 2
        add_section(g, cx, balusters=n, posts=posts)
    decorate(g)
    print(f"Balustrade: {sections} x {n} балясин, длина {inner:.2f} м")
    return g


def build(col, run_length=RUN_LENGTH, sections=SECTIONS):
    g = make_grid(run_length, sections)
    obj = g.build_mesh("Balustrade", {MAT_STONE: STONE}, col)
    print("Balustrade faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=16, azimuth=28)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=8, azimuth=0)

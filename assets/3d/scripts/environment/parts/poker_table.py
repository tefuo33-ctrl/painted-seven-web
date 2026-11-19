"""Покерный стол — ВОКСЕЛЬНЫЙ стиль (как на референсе Тима): собран из кубиков 2 см слой за слоем.

Строение (сверху вниз):
  борт   — широкое деревянное кольцо из досок, закруглено ступеньками наружу
  сукно  — утоплено на 2 см ниже борта
  юбка   — два ступенчатых пояса под бортом
  ножка  — квадратная колонна с пазами, «шапка» сверху, поясок посередине
  низ    — крестовина из 4 лап на круглом ступенчатом основании

Все размеры — в метрах; кратны размеру кубика VOXEL, чтобы ступеньки были ровными."""
import numpy as np

from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.01          # размер кубика, м (1 см — круг ровнее, пиксели мельче и однороднее, под стиль карт)
U = 0.02              # шаг деталей (размеры борта, юбки, ножки — как раньше, в «старых» кубиках 2 см)
RADIUS = 0.80         # радиус стола по борту, м
HEIGHT = 0.76         # высота стола (верх борта), м
RAIL_WIDTH = 0.105    # ширина деревянного борта, м (было 0.14, уменьшено на 25%)
PLANKS = 24           # сколько досок в борту по кругу
FLUTES_EVERY = 3      # пазы на колонне: каждый N-й кубик
COLUMN_HALF = 0.14    # половина ширины колонны, м

# Палитры сняты с референса (от самого тёмного к самому светлому).
WOOD = Palette("Wood", ["#2b0905", "#401008", "#581a0d", "#782514", "#99341b", "#bc4e2d", "#cc704a"],
               base=4, roughness=0.45)
WOOD_DARK = Palette("WoodDark", ["#1f0704", "#2b0905", "#401008", "#581a0d", "#782514", "#99341b", "#bc4e2d"],
                    base=3, roughness=0.55)
FELT = Palette("Felt", ["#1a2416", "#222f1c", "#2a3a22", "#2f4227", "#38502e", "#425c36"],
               base=3, roughness=1.0)

PREVIEW_VIEW = (0.0, -1.5, 0.75)
MAT_WOOD, MAT_DARK, MAT_FELT = 1, 2, 3


def make_grid():
    g = Grid(VOXEL, size_xy=2 * RADIUS + 4 * U, height=HEIGHT + 2 * U)
    v = U                                  # дальше размеры — в шагах по 2 см, кубики при этом 1 см
    top = HEIGHT
    inner = RADIUS - RAIL_WIDTH            # где кончается борт и начинается сукно
    felt_top = top - 2 * v

    # --- Борт: плавно скруглённый «валик» (профиль считается для каждого слоя в 1 см),
    #     снизу — тёмный паз.
    rail_h = 4 * v
    nl = int(round(rail_h / VOXEL))
    for k in range(nl):                    # ровная стенка, фаска в 1 кубик только сверху и снизу
        inset = VOXEL if k in (0, nl - 1) else 0.0
        g.put(g.ring(inner + (VOXEL if k == 0 else 0.0), RADIUS - inset, top - (k + 1) * VOXEL, top - k * VOXEL),
              MAT_WOOD)
    z = top - rail_h

    # --- Сукно и основа под ним.
    g.put(g.disk(inner, felt_top - 2 * v, felt_top), MAT_FELT)
    # --- Паз и юбка: тёмная полоса, затем пояс почти во всю ширину, затем подрезка.
    g.put(g.disk(RADIUS - 3 * v, z - v, z), MAT_DARK)                  # паз
    g.put(g.disk(RADIUS - 1.5 * v, z - 4 * v, z - v), MAT_DARK)        # юбка
    g.put(g.disk(RADIUS - 4 * v, z - 5 * v, z - 4 * v), MAT_DARK)      # подрезка снизу
    g.put(g.disk(inner, z, felt_top - 2 * v), MAT_DARK)                # тело столешницы под сукном
    under = z - 5 * v

    # --- Ножка: широкая «шапка» в две ступени, колонна с пазами, поясок.
    g.put(g.disk(0.30, under - v, under), MAT_DARK)
    g.put(g.square(0.24, under - 3 * v, under - v, chamfer=0.45), MAT_DARK)
    g.put(g.square(0.20, under - 5 * v, under - 3 * v, chamfer=0.45), MAT_DARK)
    col_top, col_bottom = under - 5 * v, 0.22
    half = COLUMN_HALF
    g.put(g.square(half, col_bottom, col_top, chamfer=0.35), MAT_DARK)
    # Пазы: на внешнем слое колонны вырезаем каждый N-й ряд кубиков.
    shell = (np.maximum(np.abs(g.X), np.abs(g.Y)) > half - v) & g.zs(col_bottom + 2 * v, col_top - v)
    along = np.where(np.abs(g.X) > np.abs(g.Y), g.SJ, g.SI) // 2  # номер «старого» кубика 2 см от середины грани
    g.cut(shell & (along % FLUTES_EVERY == 1))
    g.put(g.square(half + 2 * v, col_bottom - 2 * v, col_bottom, chamfer=0.4), MAT_DARK)
    # --- Низ: квадратный блок, крестовина из 4 лап (ступенькой), круглое основание в 3 ступени.
    g.put(g.square(0.19, 0.12, 0.20, chamfer=0.45), MAT_DARK)
    g.put(g.cross(0.07, 0.31, 0.06, 0.12), MAT_DARK)
    g.put(g.cross(0.05, 0.24, 0.12, 0.14), MAT_DARK)
    g.put(g.disk(0.36, 0.0, 0.02), MAT_DARK)
    g.put(g.disk(0.33, 0.02, 0.04), MAT_DARK)
    g.put(g.disk(0.29, 0.04, 0.06), MAT_DARK)

    # --- Узор (как рисует пиксель-артист).
    plank = np.floor((g.A + np.pi) / (2 * np.pi) * PLANKS).astype(int)
    seam = np.abs(((g.A + np.pi) / (2 * np.pi) * PLANKS) - np.round((g.A + np.pi) / (2 * np.pi) * PLANKS)) * \
        (2 * np.pi * g.R / PLANKS) < v * 0.6
    is_wood = g.mat == MAT_WOOD
    # Однородно, без пёстрого шума (как просил Тим): только тонкие швы между досками и тень снизу.
    g.tint(is_wood & seam, -1)                             # швы между досками
    g.tint(is_wood & (g.Z < top - 2.5 * v), -1)            # нижняя часть валика темнее
    # Тёмное дерево: редкие горизонтальные полоски на юбке, вертикальные доски на колонне.
    is_dark = g.mat == MAT_DARK
    g.tint(is_dark & ((g.K // 2) % 4 == 0) & (g.Z > under - 6 * v), -1)
    g.tint(is_dark & (((g.SI + g.SJ) // 6) % 4 == 0) & (g.Z < under - 6 * v), -1)
    # Сукно: ровное, однотонное (свет лампы игры даст пятно света сам).
    return g


def build(col):
    g = make_grid()
    obj = g.build_mesh("PokerTable", {MAT_WOOD: WOOD, MAT_DARK: WOOD_DARK, MAT_FELT: FELT}, col)
    print("PokerTable faces:", len(obj.data.polygons), "verts:", len(obj.data.vertices))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=17)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=17)

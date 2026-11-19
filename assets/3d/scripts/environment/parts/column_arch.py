"""Колонна и арка. Две колонны и арка образуют «раму» вида на море.
build() делает пример: две колонны и арку между ними."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
COLUMN_HEIGHT = 3.0   # от пола до верха капители (пята арки), м
SHAFT_RADIUS = 0.24   # радиус ствола колонны, м
ARCH_DEPTH = 0.7      # толщина арки вглубь, м
ARCH_BAND = 0.42      # ширина каменной ленты арки, м
WALL_TOP = 1.0        # стена над аркой выше её верха на столько, м
ARCH_SEGMENTS = 18    # камней в арке
SEGMENTS = 12

PREVIEW_VIEW = (0.35, -1.6, 0.3)


def add_column(m, loc=(0, 0, 0), height=COLUMN_HEIGHT):
    stone = mat("StoneWarm", "stone_warm", roughness=0.8)
    dark = mat("StoneDark", "stone_dark", roughness=0.85)
    x, y, z = loc
    r = SHAFT_RADIUS
    m.box((r * 3.0, r * 3.0, 0.28), loc=(x, y, z + 0.14), material=dark)                       # плинтус
    base = [(r * 1.35, 0.28), (r * 1.35, 0.36), (r * 1.15, 0.40), (r * 1.2, 0.46), (r * 1.02, 0.50)]
    m.lathe([(a, z + b) for a, b in base], segments=SEGMENTS, loc=(x, y, 0), material=stone)
    st = height - 0.42
    shaft = [(r, 0.50), (r * 1.03, 0.5 + (st - 0.5) * 0.33), (r * 0.98, 0.5 + (st - 0.5) * 0.7), (r * 0.9, st)]
    m.lathe([(a, z + b) for a, b in shaft], segments=SEGMENTS, loc=(x, y, 0), material=stone)  # ствол
    cap = [(r * 0.9, st), (r * 1.05, st + 0.05), (r * 0.95, st + 0.09), (r * 1.5, st + 0.28)]
    m.lathe([(a, z + b) for a, b in cap], segments=SEGMENTS, loc=(x, y, 0), material=stone)    # капитель
    m.box((r * 3.3, r * 3.3, 0.14), loc=(x, y, z + height - 0.07), material=dark)              # абака
    return z + height


def add_arch(m, left_x, right_x, y=0.0, spring_z=COLUMN_HEIGHT):
    """Полукруглая арка между колоннами и стена над ней (ступеньками, в стиле low-poly)."""
    stone = mat("StoneWarm", "stone_warm", roughness=0.8)
    wall = mat("StoneWall", "stone_warm", roughness=0.9, pattern="bricks")
    cx = (left_x + right_x) / 2
    radius = (right_x - left_x) / 2
    outer = radius + ARCH_BAND
    top = spring_z + outer + WALL_TOP
    n = ARCH_SEGMENTS
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        am = (a0 + a1) / 2
        rm = radius + ARCH_BAND / 2
        length = 2 * rm * math.sin((a1 - a0) / 2) * 1.03
        m.box((length, ARCH_DEPTH, ARCH_BAND), loc=(cx + rm * math.cos(am), y, spring_z + rm * math.sin(am)),
              rot=(0, -(am - math.pi / 2), 0), material=stone)
        x0, x1 = cx + outer * math.cos(a0), cx + outer * math.cos(a1)
        z_arch = spring_z + outer * min(math.sin(a0), math.sin(a1))
        h = top - z_arch
        if h > 0.02:
            m.box((abs(x1 - x0) + 0.01, ARCH_DEPTH - 0.06, h), loc=((x0 + x1) / 2, y, z_arch + h / 2), material=wall)
    for side in (-1, 1):  # стена над колоннами
        m.box((ARCH_BAND + 0.3, ARCH_DEPTH - 0.06, top - spring_z),
              loc=(cx + side * (outer + 0.15), y, spring_z + (top - spring_z) / 2), material=wall)
    m.box((right_x - left_x + 1.6, ARCH_DEPTH + 0.2, 0.22), loc=(cx, y, top + 0.11), material=stone)  # карниз
    return top + 0.22


def build(col):
    m = Mesh()
    add_column(m, (-2.2, 0, 0))
    add_column(m, (2.2, 0, 0))
    add_arch(m, -2.2, 2.2)
    return [m.finish("ColumnArch", col)]

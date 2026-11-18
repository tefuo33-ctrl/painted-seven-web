"""Арка террасы — ВОКСЕЛЬНЫЙ стиль, опирается на плиты капителей двух колонн (parts/column.py).

Как на картинке Тима: пологая арка, в кадре видны только её «плечи» у колонн — от капители кольцо из
клиновидных камней уходит вверх и внутрь, вершина — выше кадра.

Строение:
  кольцо        — клинья-камни (у каждого свой оттенок, тёмные швы), узор симметричный;
                  кольцо на 1 кубик выступает из стены спереди и сзади
  замковый камень — в вершине: шире, выступает вперёд и свисает вниз
  стена         — над кольцом, кладка как у колонны (ряды по 28 см, блоки вразбежку)
  карниз        — по верху стены, в две ступени

Деталь идёт от центра одной колонны до центра другой (SPAN): арки можно ставить подряд — аркада.
Начало координат — на полу посередине между колоннами (как у колонн: z = 0 — пол).
Чтобы всё было СИММЕТРИЧНЫМ: деталь строится строго от оси, цвета камней — зеркальные."""
import math

import numpy as np

from parts import balustrade, column
from voxel import Grid

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = column.VOXEL          # 4 см, как у колонны
SPAN = 11.6                   # между центрами колонн, м (в сцене колонны стоят на x = ±5.8)
SPRING_Z = column.HEIGHT      # арка начинается на верху плиты капители
SPRING_ANGLE = 55.0           # под каким углом кольцо уходит от капители (90 — полукруг, меньше — положе)
RING = 0.44                   # толщина кольца (длина клина), м
STONE = 0.40                  # ширина клина по середине кольца, м (число клиньев считается само)
DEPTH = 0.92                  # толщина арки вглубь — как плита капители, м
WALL_ABOVE = 0.36             # стена над замковым камнем, м
CORNICE = 0.24                # высота карниза, м
CHIPS = 0.03                  # доля сколов на рёбрах кольца
SEED = 9

STONE_PAL = balustrade.STONE
MAT_STONE = 1


def geometry(span=SPAN):
    """Окружность арки: радиус по низу кольца, центр по высоте, вершина и верх стены."""
    half = span / 2 - column.CAPITAL[-1][0]          # кольцо начинается у внутреннего края плиты капители
    a = math.radians(SPRING_ANGLE)
    r_in = half / math.sin(a)
    zc = SPRING_Z - r_in * math.cos(a)
    apex = zc + r_in + RING
    top = apex + WALL_ABOVE + CORNICE
    return half, r_in, zc, apex, top


def make_grid(span=SPAN, seed=SEED):
    rng = np.random.default_rng(seed)
    v = VOXEL
    half, r_in, zc, apex, top = geometry(span)
    r_out = r_in + RING
    g = Grid(v, size_xy=span, size_y=DEPTH + 4 * v, height=top - SPRING_Z + 2 * v, origin_z=SPRING_Z)
    ay = np.abs(g.Y)
    r = np.sqrt(g.X ** 2 + (g.Z - zc) ** 2)
    ang = np.degrees(np.arctan2(g.Z - zc, g.X))       # 90 — вершина
    above = g.Z >= SPRING_Z
    # Число клиньев: нечётное, чтобы посередине был замковый камень.
    sweep = 2 * SPRING_ANGLE
    n = int(round(math.radians(sweep) * (r_in + RING / 2) / STONE))
    n += 1 - n % 2
    step = sweep / n
    k = np.floor((ang - (90 - SPRING_ANGLE)) / step).astype(int)        # номер клина 0…n-1
    key_k = n // 2
    # Кольцо (во всю глубину) и стена над ним (на кубик тоньше с каждой стороны).
    ring = above & (r >= r_in) & (r < r_out) & (ay < DEPTH / 2)
    wall = above & (r >= r_out) & (g.Z < top - CORNICE) & (ay < DEPTH / 2 - v)
    # Замковый камень: шире кольца — свисает на 2 кубика вниз, выступает на кубик вперёд и вверх.
    keystone = above & (k == key_k) & (r >= r_in - 2 * v) & (r < r_out + v) & (ay < DEPTH / 2 + v)
    g.put(wall, MAT_STONE)
    g.put(ring | keystone, MAT_STONE)
    # Карниз в две ступени: нижняя — по кольцу, верхняя — выступает на 4 см.
    g.put(g.zs(top - CORNICE, top - CORNICE + 0.08) & (ay < DEPTH / 2), MAT_STONE)
    g.put(g.zs(top - CORNICE + 0.08, top) & (ay < DEPTH / 2 + v), MAT_STONE)
    decorate(g, rng, r, ang, k, n, key_k, r_in, r_out, zc, top, ring | keystone, wall)
    return g


def decorate(g, rng, r, ang, k, n, key_k, r_in, r_out, zc, top, ring, wall):
    v = g.v
    s = g.mat == MAT_STONE
    # Клинья: тёмные швы между ними и свой оттенок у каждого — зеркально (клин i и n-1-i одного цвета).
    step = 2 * SPRING_ANGLE / n
    pos = (ang - (90 - SPRING_ANGLE)) / step - k                     # 0…1 внутри клина
    width = v / (r * math.radians(step) + 1e-9)                      # доля клина в один кубик
    g.tint(ring & s & ((pos < width) | (pos > 1 - width)) & (k != key_k), -2)
    g.tint(ring & s & (k == key_k) & ((pos < width * 0.5) | (pos > 1 - width * 0.5)), -1)
    tones = rng.choice([-1, 0, 0, 1], size=n)
    tones = np.where(np.arange(n) < n // 2, tones, tones[::-1])     # симметрия
    tones[key_k] = 1                                                 # замковый камень светлее
    kk = np.clip(k, 0, n - 1)
    g.shade[ring & s] += tones[kk[ring & s]]
    # Кромки кольца: верх (экстрадос) светлее, низ (сводик) темнее — объём «пиксельно».
    g.tint(ring & s & (r >= r_out - v), +1)
    g.tint(ring & s & (r < r_in + v), -1)
    # Стена: кладка рядами по 28 см, блоки по 60 см вразбежку, зеркально от оси.
    course_h = column.COURSE
    zrel = g.Z - column.HEIGHT
    course = np.floor(zrel / course_h + 1e-6).astype(int)
    k_in = np.round(zrel / v - 0.5).astype(int) % int(round(course_h / v))
    block_len = 0.60
    shift = np.where(course % 2 == 0, 0.0, block_len / 2)
    xb = (np.abs(g.X) + shift) / block_len
    bi = np.floor(xb).astype(int)
    joint_v = (xb - bi) * block_len < v
    g.tint(wall & s & (k_in == 0), -2)
    g.tint(wall & s & joint_v & (k_in != 0), -1)
    btones = rng.choice([-1, 0, 0, 1], size=(course.max() + 2) * 64)
    bkey = np.clip(course, 0, None) * 64 + np.clip(bi, 0, 63)
    g.shade[wall & s] += btones[bkey[wall & s]]
    # Карниз: тень под верхней ступенью, светлый верх.
    g.tint(s & g.zs(top - CORNICE, top - CORNICE + 0.04), -1)
    g.tint(s & g.zs(top - 0.04, top), +1)
    g.noise(MAT_STONE, 0.08, 0.05, seed=51, blot=3)
    g.noise(MAT_STONE, 0.03, 0.02, seed=52)
    if CHIPS:
        edge = ring & (np.abs(np.abs(g.Y) - (DEPTH / 2 - v / 2)) < v / 2) & ((r < r_in + v) | (r >= r_out - v))
        g.cut(edge & (rng.random(g.mat.shape) < CHIPS))


def build(col, span=SPAN, seed=SEED):
    g = make_grid(span, seed)
    obj = g.build_mesh("Arch", {MAT_STONE: STONE_PAL}, col)
    half, r_in, zc, apex, top = geometry(span)
    print(f"Arch: пролёт {span:.2f} м, радиус {r_in:.2f} м, вершина кольца {apex:.2f} м, верх {top:.2f} м, "
          f"граней {len(obj.data.polygons)}")
    return [obj]


def preview(objects, path):
    """Превью: арка на двух колоннах (колонны — только для вида, в .glb арки их нет)."""
    import bpy
    import style_preview
    col = objects[0].users_collection[0]
    extra = []
    for sx in (-1, 1):
        c = column.build(col)[0]
        c.location = (sx * SPAN / 2, 0, 0)
        extra.append(c)
    allo = objects + extra
    style_preview.render(allo, path, "studio", size=(1400, 900), elevation=6, azimuth=0, fill=0.8)
    style_preview.render(allo, path[:-4] + "_sunset.png", "sunset", size=(1400, 900), elevation=14, azimuth=30,
                         fill=0.8)
    for o in extra:
        bpy.data.objects.remove(o)

"""Фонарь на тумбе: кованый каркас, светящееся стекло, крыша-пирамида.
Источник света создаёт lighting.py, здесь только сам фонарь (стекло светится материалом LanternGlass)."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
SIZE = 1.0          # общий масштаб (1.0 ≈ 0.68 м в высоту)
GLASS_GLOW = 1.4   # яркость стекла (lighting.py может переопределить)

# Где внутри фонаря «огонь» — относительно низа фонаря при SIZE=1 (для источника света).
LIGHT_OFFSET = (0.0, 0.0, 0.28)
PREVIEW_VIEW = (1.0, -1.6, 0.5)


def add_to(m, loc=(0, 0, 0), size=SIZE):
    iron = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    brass = mat("Brass", "brass", roughness=0.4, metallic=1.0)
    glass = mat("LanternGlass", "flame", roughness=0.2, emission=GLASS_GLOW)
    x, y, z = loc
    s = size
    q = math.radians(45)  # четырёхгранники поворачиваем гранью к нам
    m.box((0.22 * s, 0.22 * s, 0.04 * s), loc=(x, y, z + 0.02 * s), material=iron)                     # подставка
    m.cylinder(0.05 * s, 0.06 * s, loc=(x, y, z + 0.07 * s), segments=8, material=iron)                  # ножка
    m.cylinder(0.13 * s, 0.03 * s, loc=(x, y, z + 0.115 * s), rot=(0, 0, q), segments=4, material=iron)  # поддон
    m.cylinder(0.12 * s, 0.30 * s, loc=(x, y, z + 0.28 * s), rot=(0, 0, q), segments=4,
               r2=0.15 * s, material=glass)                                                             # стекло
    for sx in (-1, 1):                                                                                  # прутья
        for sy in (-1, 1):
            m.box((0.018 * s, 0.018 * s, 0.31 * s), loc=(x + sx * 0.096 * s, y + sy * 0.096 * s, z + 0.28 * s),
                  material=iron)
    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        m.box((0.012 * s, 0.012 * s, 0.30 * s), loc=(x + sx * 0.1 * s, y + sy * 0.1 * s, z + 0.28 * s), material=iron)
    m.cylinder(0.165 * s, 0.035 * s, loc=(x, y, z + 0.445 * s), rot=(0, 0, q), segments=4, material=iron)  # рама
    m.cylinder(0.20 * s, 0.13 * s, loc=(x, y, z + 0.525 * s), rot=(0, 0, q), segments=4, r2=0.03 * s,
               material=iron)                                                                           # крыша
    m.sphere(0.03 * s, loc=(x, y, z + 0.61 * s), detail=1, material=brass)
    m.cylinder(0.012 * s, 0.05 * s, loc=(x, y, z + 0.655 * s), segments=6, r2=0.0, material=brass)      # шпиль
    return 0.68 * s


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("PostLantern", col)]

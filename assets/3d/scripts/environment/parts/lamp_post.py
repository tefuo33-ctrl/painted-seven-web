"""Уличный фонарный столб: кованый столб на каменной базе, фонарь сверху.
Плюс отдельно — напольный фонарь (стоит на полу)."""
import math

from ps3d import Mesh, mat
from parts import post_lantern

# НАСТРОЙКИ
HEIGHT = 2.2         # высота столба до фонаря, м

PREVIEW_VIEW = (0.7, -1.6, 0.3)


def light_point(loc=(0, 0, 0)):
    x, y, z = loc
    return (x, y, z + HEIGHT + post_lantern.LIGHT_OFFSET[2] * 1.1)


def add_to(m, loc=(0, 0, 0)):
    iron = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    dark = mat("StoneDark", "stone_dark", roughness=0.85)
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    x, y, z = loc
    m.box((0.36, 0.36, 0.12), loc=(x, y, z + 0.06), material=dark)
    post = [(0.13, 0.12), (0.13, 0.2), (0.09, 0.26), (0.1, 0.4), (0.06, 0.5), (0.05, 0.7), (0.04, HEIGHT - 0.25),
            (0.07, HEIGHT - 0.2), (0.05, HEIGHT - 0.12), (0.09, HEIGHT - 0.04), (0.09, HEIGHT)]
    m.lathe([(r, z + h) for r, h in post], segments=8, loc=(x, y, 0), material=iron)
    m.lathe([(0.072, z + HEIGHT - 0.21), (0.072, z + HEIGHT - 0.19)], segments=8, loc=(x, y, 0), material=gold,
            caps=False)
    for i in range(4):  # завитки под фонарём
        a = math.pi / 2 * i
        m.box((0.16, 0.02, 0.02), loc=(x + 0.07 * math.cos(a), y + 0.07 * math.sin(a), z + HEIGHT - 0.1),
              rot=(0, -0.5, a), material=iron)
    post_lantern.add_to(m, loc=(x, y, z + HEIGHT), size=1.1)


def add_floor_lantern(m, loc=(0, 0, 0)):
    """Напольный фонарь: тот же фонарь, но крупнее и с кольцом-ручкой."""
    iron = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    x, y, z = loc
    post_lantern.add_to(m, loc=(x, y, z), size=0.9)
    m.cylinder(0.05, 0.012, loc=(x, y, z + 0.64), rot=(math.pi / 2, 0, 0), segments=8, material=iron)


def build(col):
    m = Mesh()
    add_to(m, (-0.4, 0, 0))
    add_floor_lantern(m, (0.45, 0, 0))
    return [m.finish("LampPost", col)]

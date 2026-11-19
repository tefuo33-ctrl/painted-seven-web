"""Круглый столик на точёной ножке с тремя лапами. Сверху лежит открытка/карта."""
import math

from ps3d import Mesh, mat
from parts import playing_card

# НАСТРОЙКИ
RADIUS = 0.36
HEIGHT = 0.62

PREVIEW_VIEW = (0.9, -1.4, 0.8)


def add_to(m, loc=(0, 0, 0), radius=RADIUS, height=HEIGHT, with_card=True):
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    dark = mat("WoodDark", "wood_dark", roughness=0.5, pattern="planks")
    x, y, z = loc
    top = z + height
    m.cylinder(radius, 0.04, loc=(x, y, top - 0.02), segments=16, material=wood)
    m.cylinder(radius - 0.02, 0.03, loc=(x, y, top - 0.055), segments=16, material=dark)
    leg = [(0.05, 0.12), (0.07, 0.16), (0.05, 0.22), (0.04, 0.35), (0.06, 0.42), (0.045, height - 0.12),
           (0.07, height - 0.07)]
    m.lathe([(r, z + h) for r, h in leg], segments=8, loc=(x, y, 0), material=dark)
    for i in range(3):                                                                # три гнутые лапы
        a = math.radians(90 + 120 * i)
        for k, (d, h, s) in enumerate(((0.08, 0.12, 0.05), (0.16, 0.07, 0.045), (0.22, 0.03, 0.04))):
            m.box((0.12, s, s), loc=(x + d * math.cos(a), y + d * math.sin(a), z + h), rot=(0, 0.5 - k * 0.35, a),
                  material=dark)
    if with_card:
        playing_card.add_card(m, (x + 0.05, y - 0.03, top), rot_z=0.4, suit="spade")
    return top


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("SideTable", col)]

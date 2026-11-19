"""Настольная лампа: золотая точёная ножка, светящийся тканевый абажур.
build() ставит её на маленький круглый столик, как на листе."""
from ps3d import Mesh, mat
from parts import side_table

# НАСТРОЙКИ
HEIGHT = 0.5         # высота лампы, м
SHADE_GLOW = 0.7     # насколько светится абажур (lighting.py может переопределить)

LIGHT_OFFSET = (0.0, 0.0, 0.36)   # где лампочка относительно низа лампы
PREVIEW_VIEW = (0.9, -1.5, 0.5)


def add_to(m, loc=(0, 0, 0), height=HEIGHT):
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    shade = mat("LampShade", "lampshade", roughness=0.9, emission=SHADE_GLOW)
    x, y, z = loc
    k = height / 0.5
    base = [(0.0, 0.0), (0.09, 0.0), (0.09, 0.02), (0.05, 0.05), (0.025, 0.07), (0.05, 0.12), (0.055, 0.16),
            (0.03, 0.2), (0.015, 0.26), (0.015, 0.3), (0.0, 0.3)]
    m.lathe([(r * k, z + h * k) for r, h in base], segments=10, loc=(x, y, 0), material=gold)
    m.cylinder(0.17 * k, 0.2 * k, loc=(x, y, z + 0.38 * k), segments=10, r2=0.1 * k, material=shade)
    m.lathe([(0.172 * k, z + 0.28 * k), (0.172 * k, z + 0.29 * k)], segments=10, loc=(x, y, 0), material=gold,
            caps=False)
    m.sphere(0.015 * k, loc=(x, y, z + 0.5 * k), detail=0, material=gold)


def build(col):
    m = Mesh()
    top = side_table.add_to(m, radius=0.25, height=0.55, with_card=False)
    add_to(m, (0, 0, top))
    return [m.finish("TableLamp", col)]

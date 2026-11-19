"""Каменная ваза на постаменте с кустом красных цветов."""
import math
import random

from ps3d import Mesh, mat

# НАСТРОЙКИ
PEDESTAL_HEIGHT = 0.85   # высота постамента, м
URN_SCALE = 1.0          # размер вазы
BUSH_SIZE = 0.7          # радиус куста, м
FLOWERS = 45             # сколько красных цветков
SEED = 3

PREVIEW_VIEW = (1.0, -1.5, 0.5)


def add_bush(m, center, radius, flowers, seed, trailing=True, flower_keys=("flower_red", "flower_pink")):
    """Куст: сплюснутые шары листвы + маленькие цветки. Используется и в других деталях."""
    rnd = random.Random(seed)
    greens = [mat("Leaf", "leaf", 0.85, pattern="leaves"), mat("LeafDark", "leaf_dark", 0.9, pattern="leaves"), mat("LeafLight", "leaf_light", 0.85, pattern="leaves")]
    reds = [mat("Flower_" + k, k, 0.8) for k in flower_keys]
    cx, cy, cz = center
    for _ in range(int(14 * radius / 0.75) + 6):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(0, radius * 0.7)
        r = rnd.uniform(0.18, 0.3) * radius / 0.75
        m.sphere(r, loc=(cx + d * math.cos(a), cy + d * math.sin(a), cz + rnd.uniform(0, radius * 0.6)),
                 rot=(rnd.random(), rnd.random(), rnd.random()), scale=(1, 1, 0.8), material=rnd.choice(greens))
    if trailing:
        for _ in range(6):
            a = rnd.uniform(0, 2 * math.pi)
            for k in range(3):
                d = radius * (0.75 + 0.08 * k)
                m.sphere(0.08 * radius / 0.7, loc=(cx + d * math.cos(a), cy + d * math.sin(a), cz - 0.12 * k - 0.04),
                         detail=0, material=rnd.choice(greens))
    for _ in range(flowers):
        a = rnd.uniform(0, 2 * math.pi)
        d = radius * rnd.uniform(0.5, 0.9)
        h = radius * 0.45 * rnd.uniform(-0.1, 1.3)
        m.sphere(rnd.uniform(0.04, 0.065) * radius / 0.7, loc=(cx + d * math.cos(a), cy + d * math.sin(a), cz + h),
                 rot=(rnd.random(), rnd.random(), 0), detail=0, material=rnd.choice(reds))


def add_pedestal(m, loc, height, width=0.8):
    stone = mat("Stone", "stone", roughness=0.75)
    dark = mat("StoneDark", "stone_dark", roughness=0.85)
    x, y, z = loc
    m.box((width + 0.15, width + 0.15, 0.16), loc=(x, y, z + 0.08), material=dark)
    m.box((width, width, height - 0.3), loc=(x, y, z + 0.16 + (height - 0.3) / 2), material=stone)
    m.box((width + 0.12, width + 0.12, 0.14), loc=(x, y, z + height - 0.07), material=dark)
    return z + height


def add_urn(m, loc, scale=1.0):
    stone = mat("Stone", "stone", roughness=0.75)
    soil = mat("Soil", "soil", 0.95)
    x, y, z = loc
    urn = [(0.16, 0.0), (0.26, 0.04), (0.26, 0.09), (0.12, 0.14), (0.11, 0.22), (0.30, 0.30),
           (0.44, 0.48), (0.48, 0.62), (0.52, 0.66), (0.52, 0.72), (0.44, 0.72)]
    m.lathe([(r * scale, z + zz * scale) for r, zz in urn], segments=14, loc=(x, y, 0), material=stone)
    m.cylinder(0.44 * scale, 0.02, loc=(x, y, z + 0.69 * scale), segments=14, material=soil)
    return z + 0.72 * scale


def add_to(m, loc=(0, 0, 0)):
    top = add_pedestal(m, loc, PEDESTAL_HEIGHT)
    soil_z = add_urn(m, (loc[0], loc[1], top), URN_SCALE)
    add_bush(m, (loc[0], loc[1], soil_z), BUSH_SIZE * URN_SCALE, FLOWERS, SEED)


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("FlowerUrn", col)]

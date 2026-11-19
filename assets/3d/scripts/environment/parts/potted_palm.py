"""Пальма в каменной кадке (раскидистые листья-перья)."""
import math
import random

from ps3d import Mesh, mat

# НАСТРОЙКИ
POT_HEIGHT = 0.45
FRONDS = 11          # сколько листьев
FROND_LENGTH = 0.85
SEED = 5

PREVIEW_VIEW = (0.9, -1.5, 0.5)


def add_pot(m, loc, height=POT_HEIGHT):
    stone = mat("Stone", "stone", roughness=0.8)
    dark = mat("StoneDark", "stone_dark", roughness=0.85)
    soil = mat("Soil", "soil", 0.95)
    x, y, z = loc
    k = height / 0.45
    m.box((0.32 * k, 0.32 * k, 0.05 * k), loc=(x, y, z + 0.025 * k), material=dark)
    m.cylinder(0.15 * k, 0.36 * k, loc=(x, y, z + 0.23 * k), segments=4, r2=0.22 * k, rot=(0, 0, math.pi / 4),
               material=stone)
    m.cylinder(0.24 * k, 0.05 * k, loc=(x, y, z + 0.43 * k), segments=4, rot=(0, 0, math.pi / 4), material=dark)
    m.cylinder(0.19 * k, 0.02, loc=(x, y, z + 0.45 * k), segments=4, rot=(0, 0, math.pi / 4), material=soil)
    return z + 0.45 * k


def add_frond(m, base, angle, tilt, length, material, rnd):
    """Лист-перо: ось из сегментов, по бокам — узкие «пёрышки»."""
    x, y, z = base
    steps = 6
    px, py, pz = x, y, z
    for i in range(steps):
        t = (i + 1) / steps
        el = tilt - t * t * 1.4          # лист изгибается вниз
        seg = length / steps
        nx = px + seg * math.cos(el) * math.cos(angle)
        ny = py + seg * math.cos(el) * math.sin(angle)
        nz = pz + seg * math.sin(el)
        cx, cy, cz = (px + nx) / 2, (py + ny) / 2, (pz + nz) / 2
        m.box((seg, 0.02, 0.015), loc=(cx, cy, cz), rot=(0, -el, angle), material=material)
        leaf = 0.16 * (1 - abs(t - 0.45)) * length
        for side in (-1, 1):
            m.box((0.05, leaf, 0.01), loc=(cx - side * 0.0, cy, cz - 0.01),
                  rot=(side * 0.5, -el, angle + side * 0.5 + rnd.uniform(-0.1, 0.1)), material=material)
        px, py, pz = nx, ny, nz


def add_palm(m, loc, fronds=FRONDS, length=FROND_LENGTH, seed=SEED, trunk=0.35):
    rnd = random.Random(seed)
    bark = mat("Bark", "bark", 0.9, pattern="planks")
    greens = [mat("Leaf", "leaf", 0.85, pattern="leaves"), mat("LeafLight", "leaf_light", 0.85, pattern="leaves"),
              mat("LeafDark", "leaf_dark", 0.9, pattern="leaves")]
    x, y, z = loc
    for i in range(3):
        m.cylinder(0.05 - i * 0.008, trunk / 3, loc=(x, y, z + trunk / 6 + i * trunk / 3), segments=6,
                   r2=0.045 - i * 0.008, rot=(0, 0, i * 0.5), material=bark)
    top = (x, y, z + trunk)
    for i in range(fronds):
        a = 2 * math.pi * i / fronds + rnd.uniform(-0.2, 0.2)
        add_frond(m, top, a, rnd.uniform(0.5, 1.3), length * rnd.uniform(0.8, 1.1), rnd.choice(greens), rnd)


def build(col):
    m = Mesh()
    top = add_pot(m, (0, 0, 0))
    add_palm(m, (0, 0, top))
    return [m.finish("PottedPalm", col)]

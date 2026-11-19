"""Фишки: стопки красных, синих и чёрных фишек с белыми полосками по краю."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
CHIP_RADIUS = 0.02      # м (настоящая фишка ≈ 4 см)
CHIP_HEIGHT = 0.0034
STRIPES = 6             # белых полосок по краю

PREVIEW_VIEW = (0.9, -1.5, 0.7)


def add_chip(m, loc, color_key, rot_z=0.0):
    body = mat("Chip_" + color_key, color_key, roughness=0.5, pattern=None)
    white = mat("ChipWhite", "chip_white", roughness=0.5, pattern=None)
    x, y, z = loc
    m.cylinder(CHIP_RADIUS, CHIP_HEIGHT, loc=(x, y, z + CHIP_HEIGHT / 2), segments=12, material=body)
    for i in range(STRIPES):
        a = rot_z + 2 * math.pi * i / STRIPES
        m.box((0.006, 0.004, CHIP_HEIGHT * 1.02),
              loc=(x + CHIP_RADIUS * 0.93 * math.cos(a), y + CHIP_RADIUS * 0.93 * math.sin(a), z + CHIP_HEIGHT / 2),
              rot=(0, 0, a + math.pi / 2), material=white)
    m.cylinder(CHIP_RADIUS * 0.55, CHIP_HEIGHT * 1.04, loc=(x, y, z + CHIP_HEIGHT / 2), segments=10, material=white)


def add_stack(m, loc, color_key, count):
    x, y, z = loc
    for i in range(count):
        add_chip(m, (x + 0.0015 * ((i * 7) % 3 - 1), y + 0.0015 * ((i * 5) % 3 - 1), z + i * CHIP_HEIGHT),
                 color_key, rot_z=i * 0.4)
    return z + count * CHIP_HEIGHT


def build(col):
    m = Mesh()
    add_stack(m, (-0.05, 0, 0), "chip_red", 6)
    add_stack(m, (0.0, 0.02, 0), "chip_blue", 9)
    add_stack(m, (0.05, 0, 0), "chip_black", 7)
    add_stack(m, (0.0, -0.045, 0), "chip_red", 3)
    return [m.finish("ChipStacks", col)]

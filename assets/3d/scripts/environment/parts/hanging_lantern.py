"""Подвесной фонарь на кованом кронштейне (крепится к колонне или стене).
Начало координат — точка крепления; фонарь висит по оси +X."""
import math

from ps3d import Mesh, mat
from parts import post_lantern

# НАСТРОЙКИ
ARM_LENGTH = 0.55   # вылет кронштейна, м
DROP = 0.40         # на сколько фонарь висит ниже кронштейна, м
SIZE = 0.85         # размер фонаря

PREVIEW_VIEW = (0.4, -1.6, 0.3)


def light_offset():
    """Где огонь относительно точки крепления (для lighting.py)."""
    lz = post_lantern.LIGHT_OFFSET[2]
    return (ARM_LENGTH, 0.0, -DROP - 0.68 * SIZE + lz * SIZE)


def add_to(m, loc=(0, 0, 0)):
    iron = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    x, y, z = loc
    m.box((0.06, 0.16, 0.26), loc=(x + 0.03, y, z), material=iron)                              # пластина
    m.box((ARM_LENGTH, 0.035, 0.035), loc=(x + ARM_LENGTH / 2, y, z + 0.08), material=iron)       # кронштейн
    m.box((ARM_LENGTH * 0.8, 0.025, 0.025), loc=(x + ARM_LENGTH * 0.4, y, z - 0.03),
          rot=(0, math.radians(-20), 0), material=iron)                                          # подкос
    m.cylinder(0.06, 0.02, loc=(x + ARM_LENGTH * 0.6, y, z + 0.02), rot=(math.pi / 2, 0, 0),
               segments=8, material=iron)                                                        # завиток
    top, bottom = z + 0.08, z - DROP
    links = 6
    for i in range(links):                                                                        # цепь
        lz = top - (top - bottom) * (i + 0.5) / links
        m.box((0.012, 0.03 if i % 2 else 0.012, (top - bottom) / links * 0.9),
              loc=(x + ARM_LENGTH, y, lz), material=iron)
    lantern_bottom = bottom - 0.68 * SIZE
    post_lantern.add_to(m, loc=(x + ARM_LENGTH, y, lantern_bottom), size=SIZE)
    m.cylinder(0.04, 0.07, loc=(x + ARM_LENGTH, y, lantern_bottom - 0.035), rot=(math.pi, 0, 0),
               segments=8, r2=0.0, material=iron)                                                # «капля» снизу


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("HangingLantern", col)]

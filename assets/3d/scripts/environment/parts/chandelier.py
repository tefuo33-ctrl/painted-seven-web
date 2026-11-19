"""Люстра: золотой стержень, два яруса рожков со свечами, хрустальные подвески.
Начало координат — точка на потолке."""
import math

from ps3d import Mesh, mat
from parts import wall_decor

# НАСТРОЙКИ
ARMS = 8             # рожков в нижнем ярусе
RADIUS = 0.45
DROP = 0.5           # длина цепи от потолка, м

PREVIEW_VIEW = (0.8, -1.5, 0.15)


def light_points(loc=(0, 0, 0)):
    """Где свечи (для lighting.py) — середина люстры."""
    x, y, z = loc
    return [(x, y, z - DROP - 0.35)]


def add_to(m, loc=(0, 0, 0)):
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    crystal = mat("Crystal", "#f5e2b0", roughness=0.1, emission=0.6)
    x, y, z = loc
    m.cylinder(0.08, 0.03, loc=(x, y, z - 0.015), segments=8, material=gold)
    for i in range(5):                                                                 # цепь
        m.box((0.015, 0.03 if i % 2 else 0.015, DROP / 5 * 0.9), loc=(x, y, z - DROP / 5 * (i + 0.5)), material=gold)
    top = z - DROP
    body = [(0.0, 0.0), (0.04, -0.03), (0.07, -0.12), (0.05, -0.2), (0.09, -0.3), (0.12, -0.36), (0.06, -0.42),
            (0.03, -0.5), (0.0, -0.56)]
    m.lathe([(r, top + h) for r, h in body], segments=8, loc=(x, y, 0), material=gold)
    for tier, (count, rad, dz, scale) in enumerate(((ARMS, RADIUS, -0.36, 1.0), (ARMS // 2, RADIUS * 0.55, -0.14, 0.8))):
        for i in range(count):
            a = 2 * math.pi * (i + 0.5 * tier) / count
            ex, ey = x + rad * math.cos(a), y + rad * math.sin(a)
            # Рожок: изогнутый вниз-вверх (три бруска).
            mx, my = x + rad * 0.55 * math.cos(a), y + rad * 0.55 * math.sin(a)
            m.box((rad * 0.6, 0.02, 0.02), loc=((x + mx) / 2, (y + my) / 2, top + dz - 0.04), rot=(0, 0.15, a),
                  material=gold)
            m.box((rad * 0.5, 0.02, 0.02), loc=((mx + ex) / 2, (my + ey) / 2, top + dz - 0.02), rot=(0, -0.25, a),
                  material=gold)
            m.cylinder(0.04 * scale, 0.02, loc=(ex, ey, top + dz + 0.01), segments=8, material=gold)
            wall_decor.add_candle(m, (ex, ey, top + dz + 0.02), height=0.1 * scale)
            # Хрустальная подвеска.
            m.sphere(0.022, loc=(ex, ey, top + dz - 0.07), scale=(1, 1, 1.8), detail=0, material=crystal)
    for i in range(ARMS):                                                              # «бусы» между рожками
        a = 2 * math.pi * i / ARMS
        m.sphere(0.015, loc=(x + RADIUS * 0.7 * math.cos(a), y + RADIUS * 0.7 * math.sin(a), top - 0.44), detail=0,
                 material=crystal)
    m.sphere(0.03, loc=(x, y, top - 0.6), scale=(1, 1, 1.8), detail=0, material=crystal)


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Chandelier", col)]

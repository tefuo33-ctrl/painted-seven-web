"""Глобус на деревянной подставке с золотым меридианом."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
RADIUS = 0.16
SEED = 2

PREVIEW_VIEW = (0.9, -1.5, 0.5)


def add_to(m, loc=(0, 0, 0)):
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    sea = mat("GlobeSea", "globe_sea", roughness=0.6, pattern="noise")
    land = mat("GlobeLand", "#b89a5a", roughness=0.7, pattern="noise")
    x, y, z = loc
    stand = [(0.0, 0.0), (0.13, 0.0), (0.13, 0.025), (0.08, 0.05), (0.03, 0.07), (0.025, 0.14), (0.04, 0.16),
             (0.0, 0.16)]
    m.lathe([(r, z + h) for r, h in stand], segments=8, loc=(x, y, 0), material=wood)
    cz = z + 0.16 + RADIUS + 0.03
    m.sphere(RADIUS, loc=(x, y, cz), detail=2, material=sea)
    # «Материки» — сплюснутые нашлёпки на поверхности.
    for lon, lat, s in ((0.3, 0.4, 0.09), (-0.9, 0.2, 0.07), (2.2, -0.3, 0.08), (1.2, 0.8, 0.05), (-2.0, -0.6, 0.06)):
        px = x + RADIUS * math.cos(lat) * math.cos(lon)
        py = y + RADIUS * math.cos(lat) * math.sin(lon)
        pz = cz + RADIUS * math.sin(lat)
        k = (RADIUS - s * 0.75) / RADIUS  # шар-пятно почти утоплен в глобус
        m.sphere(s, loc=(x + (px - x) * k, y + (py - y) * k, cz + (pz - cz) * k), detail=1, material=land)
    # Меридиан (наклонён на 23°) — кольцо из брусков.
    tilt = math.radians(23)
    n = 16
    rr = RADIUS + 0.02
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        lx, lz = rr * math.cos(a), rr * math.sin(a)
        rx = lx * math.cos(tilt) - lz * math.sin(tilt)
        rz = lx * math.sin(tilt) + lz * math.cos(tilt)
        m.box((0.015, 0.02, 2 * rr * math.sin(math.pi / n) * 1.05), loc=(x + rx, y, cz + rz),
              rot=(0, -(a + tilt), 0), material=gold)
    m.cylinder(0.008, 2 * rr, loc=(x, y, cz), rot=(0, -tilt, 0), segments=4, material=gold)    # ось


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Globe", col)]

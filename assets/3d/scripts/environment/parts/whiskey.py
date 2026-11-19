"""Мелочи: бутылка виски с этикеткой, стакан со льдом, ведёрко со льдом и бутылкой на подносе."""
from ps3d import Mesh, mat

# НАСТРОЙКИ
BOTTLE_HEIGHT = 0.3

PREVIEW_VIEW = (0.8, -1.5, 0.6)


def add_bottle(m, loc, glass_key="bottle", scale=1.0, label=True):
    glass = mat("Bottle_" + glass_key, glass_key, roughness=0.15, pattern=None)
    paper = mat("Label", "#e8d2a0", roughness=0.8)
    cap = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    x, y, z = loc
    s = scale * BOTTLE_HEIGHT / 0.3
    prof = [(0.0, 0.0), (0.045, 0.0), (0.048, 0.01), (0.048, 0.19), (0.04, 0.215), (0.018, 0.24), (0.016, 0.28),
            (0.0, 0.28)]
    m.lathe([(r * s, z + h * s) for r, h in prof], segments=8, loc=(x, y, 0), material=glass)
    m.cylinder(0.019 * s, 0.03 * s, loc=(x, y, z + 0.29 * s), segments=8, material=cap)
    if label:
        m.box((0.07 * s, 0.01, 0.08 * s), loc=(x, y - 0.046 * s, z + 0.1 * s), material=paper)
        m.box((0.05 * s, 0.012, 0.012 * s), loc=(x, y - 0.046 * s, z + 0.11 * s),
              material=mat("Ink", "#5a2a14", roughness=0.8, pattern=None))


def add_glass(m, loc, whiskey=True):
    glass = mat("GlassClear", "#cfd6d6", roughness=0.1, pattern=None)
    drink = mat("Whiskey", "whiskey", roughness=0.2, pattern=None)
    ice = mat("Ice", "#e6f0f2", roughness=0.1, pattern=None)
    x, y, z = loc
    m.cylinder(0.04, 0.012, loc=(x, y, z + 0.006), segments=8, material=glass)
    m.lathe([(0.04, z + 0.012), (0.042, z + 0.08), (0.038, z + 0.08), (0.036, z + 0.012)], segments=8,
            loc=(x, y, 0), material=glass, caps=False)
    if whiskey:
        m.cylinder(0.035, 0.04, loc=(x, y, z + 0.032), segments=8, material=drink)
        m.box((0.03, 0.03, 0.03), loc=(x + 0.005, y, z + 0.055), rot=(0.3, 0.2, 0.5), material=ice)


def add_ice_bucket(m, loc):
    silver = mat("Silver", "silver", roughness=0.3, metallic=1.0)
    ice = mat("Ice", "#e6f0f2", roughness=0.1, pattern=None)
    x, y, z = loc
    m.cylinder(0.24, 0.02, loc=(x, y, z + 0.01), segments=14, material=silver)                        # поднос
    prof = [(0.06, 0.02), (0.08, 0.04), (0.075, 0.06), (0.11, 0.1), (0.12, 0.26), (0.13, 0.27)]
    m.lathe([(r, z + h) for r, h in prof], segments=12, loc=(x, y, 0), material=silver)
    for sx in (-1, 1):
        m.cylinder(0.03, 0.012, loc=(x + sx * 0.135, y, z + 0.22), rot=(1.5708, 0, 0), segments=8, material=silver)
    m.cylinder(0.11, 0.02, loc=(x, y, z + 0.25), segments=12, material=ice)
    for i in range(5):
        m.box((0.035, 0.035, 0.035), loc=(x + 0.06 * ((i % 3) - 1), y + 0.05 * ((i // 2) - 1), z + 0.27),
              rot=(i * 0.4, i * 0.7, i), material=ice)
    add_bottle(m, (x + 0.02, y + 0.02, z + 0.08), "#2a3a24", scale=1.05, label=False)


def build(col):
    m = Mesh()
    add_bottle(m, (-0.3, 0, 0))
    add_glass(m, (-0.15, -0.1, 0))
    add_ice_bucket(m, (0.15, 0, 0))
    return [m.finish("WhiskeySet", col)]

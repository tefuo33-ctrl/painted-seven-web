"""Кресло к покерному столу: красный бархат, рама из красного дерева, гнутые ножки."""
from ps3d import Mesh, mat

# НАСТРОЙКИ
SEAT_HEIGHT = 0.47   # высота сиденья, м
WIDTH = 0.58
DEPTH = 0.55
BACK_HEIGHT = 0.55   # спинка над сиденьем, м

PREVIEW_VIEW = (1.0, -1.3, 0.5)


def add_to(m, loc=(0, 0, 0)):
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    velvet = mat("Velvet", "velvet", roughness=0.9, pattern="velvet")
    x, y, z = loc
    w, d, sh = WIDTH, DEPTH, SEAT_HEIGHT
    # Ножки: точёные, слегка сужаются.
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cylinder(0.028, sh - 0.08, loc=(x + sx * (w / 2 - 0.05), y + sy * (d / 2 - 0.05), z + (sh - 0.08) / 2),
                       segments=6, r2=0.02, material=wood, rot=(0, 0, 0))
            m.sphere(0.025, loc=(x + sx * (w / 2 - 0.05), y + sy * (d / 2 - 0.05), z + 0.015), detail=0, material=wood)
    m.box((w, d, 0.08), loc=(x, y, z + sh - 0.06), material=wood)                                 # царга
    m.box((w - 0.06, d - 0.04, 0.09), loc=(x, y - 0.01, z + sh + 0.02), material=velvet)          # подушка
    m.box((w - 0.1, 0.02, 0.02), loc=(x, y - d / 2 + 0.005, z + sh - 0.06), material=wood)
    # Спинка: рама + бархат.
    by = y + d / 2 - 0.04
    for sx in (-1, 1):
        m.box((0.05, 0.05, BACK_HEIGHT + 0.06), loc=(x + sx * (w / 2 - 0.04), by, z + sh + BACK_HEIGHT / 2),
              rot=(-0.12, 0, 0), material=wood)
        m.sphere(0.03, loc=(x + sx * (w / 2 - 0.04), by + 0.04, z + sh + BACK_HEIGHT + 0.03), detail=0, material=wood)
        # Подлокотники.
        m.box((0.06, d - 0.06, 0.04), loc=(x + sx * (w / 2 - 0.03), y, z + sh + 0.22), material=wood)
        m.box((0.05, 0.05, 0.22), loc=(x + sx * (w / 2 - 0.03), y - d / 2 + 0.06, z + sh + 0.11), material=wood)
        m.box((0.04, d - 0.14, 0.12), loc=(x + sx * (w / 2 - 0.035), y + 0.02, z + sh + 0.12), material=velvet)
    m.box((w - 0.08, 0.05, BACK_HEIGHT - 0.04), loc=(x, by + 0.01, z + sh + BACK_HEIGHT / 2 + 0.02),
          rot=(-0.12, 0, 0), material=velvet)
    m.box((w - 0.02, 0.06, 0.06), loc=(x, by + 0.07, z + sh + BACK_HEIGHT + 0.02), rot=(-0.12, 0, 0), material=wood)


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("PokerChair", col)]

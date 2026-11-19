"""Тумба балюстрады — квадратный столб между пролётами (на нём стоит фонарь)."""
from ps3d import Mesh, mat

# НАСТРОЙКИ
WIDTH = 0.52        # ширина, м
HEIGHT = 1.12       # высота до верха шапки, м (чуть выше перил)

PREVIEW_VIEW = (1.0, -1.5, 0.6)


def add_to(m, loc=(0, 0, 0), width=WIDTH, height=HEIGHT):
    stone = mat("Stone", "stone", roughness=0.75)
    dark = mat("StoneDark", "stone_dark", roughness=0.85)
    x, y, z = loc
    m.box((width + 0.1, width + 0.1, 0.2), loc=(x, y, z + 0.1), material=dark)          # база
    m.box((width + 0.04, width + 0.04, 0.05), loc=(x, y, z + 0.225), material=stone)
    body = height - 0.25 - 0.16
    m.box((width, width, body), loc=(x, y, z + 0.25 + body / 2), material=stone)         # тело
    m.box((width - 0.08, 0.02, body - 0.2), loc=(x, y - width / 2, z + 0.25 + body / 2), material=dark)  # филёнка
    top = z + 0.25 + body
    m.box((width + 0.06, width + 0.06, 0.05), loc=(x, y, top + 0.025), material=dark)    # карниз
    m.box((width + 0.12, width + 0.12, 0.11), loc=(x, y, top + 0.105), material=stone)
    return top + 0.16


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("BalustradePost", col)]

"""Балясина — короткая «пузатая» с узелком посередине (как на листе ассетов)."""
from ps3d import Mesh, mat

# НАСТРОЙКИ
HEIGHT = 0.52        # высота точёной части, м (без квадратных плиток снизу и сверху)
WIDTH = 0.19         # ширина квадратной плитки снизу/сверху, м
SEGMENTS = 8         # граней по кругу (мало — для пиксельно-рубленого вида)

# Профиль: (радиус в метрах, высота в долях HEIGHT), снизу вверх. Меняй форму здесь.
PROFILE = [
    (0.060, 0.00), (0.078, 0.05), (0.092, 0.14), (0.094, 0.24), (0.080, 0.33),
    (0.055, 0.40), (0.082, 0.43), (0.082, 0.50), (0.055, 0.53),   # узелок посередине
    (0.058, 0.62), (0.070, 0.76), (0.066, 0.86), (0.050, 0.91), (0.068, 0.95), (0.068, 1.00),
]

PREVIEW_VIEW = (1.0, -1.6, 0.45)


def add_to(m, loc=(0, 0, 0), height=HEIGHT):
    stone = mat("Stone", "stone", roughness=0.8)
    x, y, z = loc
    plate = 0.05
    m.box((WIDTH, WIDTH, plate), loc=(x, y, z + plate / 2), material=stone)
    m.lathe([(r, z + plate + h * height) for r, h in PROFILE], segments=SEGMENTS, loc=(x, y, 0), material=stone)
    m.box((WIDTH * 0.92, WIDTH * 0.92, plate), loc=(x, y, z + plate * 1.5 + height), material=stone)
    return 2 * plate + height  # полная высота


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Baluster", col)]

"""Диван: трёхместный, красный бархат, каретная стяжка, две тёмные подушки."""
from ps3d import Mesh, mat
from parts import armchair

# НАСТРОЙКИ
WIDTH = 2.1
DEPTH = 0.85
SEATS = 3

PREVIEW_VIEW = (0.6, -1.5, 0.55)


def add_to(m, loc=(0, 0, 0)):
    pillow = mat("Pillow", "#3a2a30", roughness=0.9, pattern="velvet")
    armchair.add_upholstered(m, loc, WIDTH, DEPTH, armchair.SEAT_HEIGHT, armchair.BACK_HEIGHT, seats=SEATS)
    x, y, z = loc
    for sx, tilt in ((-1, 0.25), (1, -0.25)):
        m.box((0.32, 0.12, 0.3), loc=(x + sx * (WIDTH / 2 - 0.36), y + DEPTH / 2 - 0.32, z + armchair.SEAT_HEIGHT + 0.22),
              rot=(-0.3, tilt, 0), material=pillow)


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Sofa", col)]

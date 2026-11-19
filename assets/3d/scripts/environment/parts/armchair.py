"""Мягкое кресло (красный бархат, деревянная рамка с золотой каймой, валики-подлокотники).
build() делает два, как на листе: большое и маленькое."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
WIDTH = 0.85
DEPTH = 0.80
SEAT_HEIGHT = 0.42
BACK_HEIGHT = 0.50   # спинка над сиденьем

PREVIEW_VIEW = (0.8, -1.5, 0.55)


def add_upholstered(m, loc, width, depth, seat_h, back_h, seats=1):
    """Общая «мягкая» основа для кресла и дивана (seats — сколько подушек)."""
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    velvet = mat("Velvet", "velvet", roughness=0.9, pattern="velvet")
    dark = mat("VelvetDark", "velvet_dark", roughness=0.9, pattern="velvet")
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    x, y, z = loc
    arm = 0.16
    # Короткие точёные ножки.
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.cylinder(0.035, 0.1, loc=(x + sx * (width / 2 - 0.07), y + sy * (depth / 2 - 0.07), z + 0.05),
                       segments=6, r2=0.025, material=wood)
    # Деревянная рама-цоколь с золотой полоской.
    m.box((width, depth, 0.1), loc=(x, y, z + 0.15), material=wood)
    m.box((width + 0.005, depth + 0.005, 0.015), loc=(x, y, z + 0.19), material=gold)
    # Основание сиденья и подушки.
    m.box((width - 2 * arm, depth - 0.12, seat_h - 0.28), loc=(x, y - 0.04, z + 0.2 + (seat_h - 0.28) / 2), material=dark)
    inner = width - 2 * arm
    for i in range(seats):
        cx = x - inner / 2 + inner * (i + 0.5) / seats
        m.box((inner / seats - 0.015, depth - 0.2, 0.12), loc=(cx, y - 0.06, z + seat_h + 0.02), material=velvet)
        # Подушки спинки.
        m.box((inner / seats - 0.02, 0.14, back_h * 0.75), loc=(cx, y + depth / 2 - 0.2, z + seat_h + back_h * 0.42),
              rot=(-0.15, 0, 0), material=velvet)
        # «Пуговки» — каретная стяжка.
        for bz in (0.3, 0.55):
            m.box((0.025, 0.02, 0.025), loc=(cx, y + depth / 2 - 0.28, z + seat_h + back_h * bz), material=dark)
    # Спинка.
    m.box((width, 0.16, back_h + seat_h - 0.2), loc=(x, y + depth / 2 - 0.08, z + 0.2 + (back_h + seat_h - 0.2) / 2),
          material=velvet)
    m.box((width + 0.02, 0.18, 0.05), loc=(x, y + depth / 2 - 0.08, z + seat_h + back_h + 0.02), material=wood)
    # Подлокотники-валики.
    for sx in (-1, 1):
        ax = x + sx * (width / 2 - arm / 2)
        m.box((arm, depth, seat_h - 0.05), loc=(ax, y, z + 0.2 + (seat_h - 0.05) / 2), material=velvet)
        m.cylinder(arm / 2 + 0.02, depth, loc=(ax + sx * 0.01, y, z + seat_h + 0.12), rot=(math.pi / 2, 0, 0),
                   segments=8, material=velvet)
        m.cylinder(arm / 2 - 0.01, 0.03, loc=(ax + sx * 0.01, y - depth / 2, z + seat_h + 0.12),
                   rot=(math.pi / 2, 0, 0), segments=8, material=wood)
        m.box((0.02, 0.02, seat_h - 0.1), loc=(ax + sx * 0.0, y - depth / 2 - 0.005, z + 0.2 + (seat_h - 0.1) / 2),
              material=gold)


def add_to(m, loc=(0, 0, 0), scale=1.0):
    add_upholstered(m, loc, WIDTH * scale, DEPTH * scale, SEAT_HEIGHT, BACK_HEIGHT * scale, seats=1)


def build(col):
    m = Mesh()
    add_to(m, (-0.55, 0, 0))
    add_to(m, (0.45, 0, 0), scale=0.8)
    return [m.finish("Armchairs", col)]

"""Книжный шкаф: рама из красного дерева, карниз сверху, полки с разноцветными книгами."""
import random

from ps3d import Mesh, mat

# НАСТРОЙКИ
WIDTH = 1.0
DEPTH = 0.38
HEIGHT = 2.0
SHELVES = 5
SEED = 7

PREVIEW_VIEW = (0.7, -1.6, 0.35)


def add_to(m, loc=(0, 0, 0), width=WIDTH, height=HEIGHT, shelves=SHELVES, seed=SEED):
    rnd = random.Random(seed)
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    dark = mat("WoodDark", "wood_dark", roughness=0.5, pattern="planks")
    back = mat("ShelfBack", "#2e1a10", roughness=0.9)
    x, y, z = loc
    side = 0.05
    m.box((width, 0.02, height), loc=(x, y + DEPTH / 2 - 0.01, z + height / 2), material=back)
    for sx in (-1, 1):
        m.box((side, DEPTH, height), loc=(x + sx * (width / 2 - side / 2), y, z + height / 2), material=wood)
    m.box((width + 0.04, DEPTH + 0.04, 0.1), loc=(x, y, z + 0.05), material=dark)                  # цоколь
    m.box((width + 0.1, DEPTH + 0.08, 0.06), loc=(x, y - 0.01, z + height + 0.03), material=dark)  # карниз
    m.box((width + 0.04, DEPTH + 0.04, 0.05), loc=(x, y, z + height - 0.025), material=wood)
    inner_w = width - 2 * side
    shelf_h = (height - 0.15) / shelves
    for s in range(shelves):
        sz = z + 0.1 + s * shelf_h
        m.box((inner_w, DEPTH - 0.02, 0.03), loc=(x, y, sz + 0.015), material=wood)
        # Книги: разной высоты и толщины, иногда наклонённые.
        bx = x - inner_w / 2 + 0.01
        while True:
            t = rnd.uniform(0.03, 0.06)
            if bx + t > x + inner_w / 2 - 0.02:
                break
            h = rnd.uniform(0.6, 0.85) * (shelf_h - 0.05)
            key = f"book_{rnd.randint(1, 5)}"
            cover = mat("Book_" + key, key, roughness=0.8)
            m.box((t, DEPTH * 0.75, h), loc=(bx + t / 2, y - 0.02, sz + 0.03 + h / 2), material=cover)
            m.box((t * 0.5, 0.01, 0.02), loc=(bx + t / 2, y - 0.02 - DEPTH * 0.375 - 0.003, sz + 0.03 + h * 0.75),
                  material=mat("Gold", "gold", roughness=0.35, metallic=1.0))           # золотая полоска на корешке
            bx += t + (0.002 if rnd.random() > 0.15 else 0.06)
    return z + height


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Bookcase", col)]

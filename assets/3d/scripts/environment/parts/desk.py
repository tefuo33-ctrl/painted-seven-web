"""Письменный стол из красного дерева: две тумбы с ящиками, золотые ручки, стопка книг и свеча."""
import random

from ps3d import Mesh, mat

# НАСТРОЙКИ
WIDTH = 1.5
DEPTH = 0.75
HEIGHT = 0.76
WITH_ITEMS = True    # книги и свеча на столе

PREVIEW_VIEW = (0.8, -1.5, 0.7)


def add_books(m, loc, count, seed=1, lying=True):
    rnd = random.Random(seed)
    x, y, z = loc
    for i in range(count):
        key = f"book_{rnd.randint(1, 5)}"
        cover = mat("Book_" + key, key, roughness=0.8)
        page = mat("CardPaper", "paper", roughness=0.9, pattern=None)
        w, d, t = rnd.uniform(0.2, 0.26), rnd.uniform(0.14, 0.18), rnd.uniform(0.03, 0.05)
        rot = rnd.uniform(-0.2, 0.2)
        m.box((w, d, t), loc=(x, y, z + t / 2), rot=(0, 0, rot), material=cover)
        m.box((w - 0.01, d - 0.012, t * 0.7), loc=(x + 0.006, y, z + t / 2), rot=(0, 0, rot), material=page)
        z += t
    return z


def add_candle_jar(m, loc):
    glass = mat("JarGlass", "#e8d7b0", roughness=0.2)
    flame = mat("Flame", "flame", emission=3.0)
    candle = mat("Candle", "candle", roughness=0.7, pattern=None)
    x, y, z = loc
    m.cylinder(0.05, 0.1, loc=(x, y, z + 0.05), segments=8, material=glass)
    m.cylinder(0.04, 0.06, loc=(x, y, z + 0.035), segments=8, material=candle)
    m.sphere(0.02, loc=(x, y, z + 0.09), scale=(1, 1, 1.6), detail=0, material=flame)


def add_to(m, loc=(0, 0, 0)):
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    dark = mat("WoodDark", "wood_dark", roughness=0.5, pattern="planks")
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    x, y, z = loc
    top = z + HEIGHT
    m.box((WIDTH + 0.06, DEPTH + 0.06, 0.05), loc=(x, y, top - 0.025), material=wood)          # столешница
    m.box((WIDTH + 0.02, DEPTH + 0.02, 0.03), loc=(x, y, top - 0.065), material=dark)
    ped_w = 0.42
    for sx in (-1, 1):
        px = x + sx * (WIDTH / 2 - ped_w / 2)
        m.box((ped_w, DEPTH, HEIGHT - 0.12), loc=(px, y, z + 0.04 + (HEIGHT - 0.12) / 2), material=wood)  # тумба
        m.box((ped_w + 0.04, DEPTH + 0.04, 0.06), loc=(px, y, z + 0.03), material=dark)                   # цоколь
        for k in range(3):                                                                               # ящики
            dz = z + 0.14 + k * 0.19
            m.box((ped_w - 0.06, 0.02, 0.16), loc=(px, y - DEPTH / 2 - 0.005, dz + 0.08), material=dark)
            m.box((0.08, 0.02, 0.02), loc=(px, y - DEPTH / 2 - 0.02, dz + 0.09), material=gold)
    # Средний ящик и «юбка».
    m.box((WIDTH - 2 * ped_w, 0.02, 0.12), loc=(x, y - DEPTH / 2 + 0.01, top - 0.15), material=dark)
    m.box((0.1, 0.02, 0.02), loc=(x, y - DEPTH / 2 - 0.005, top - 0.15), material=gold)
    m.box((WIDTH - 2 * ped_w, DEPTH - 0.04, 0.03), loc=(x, y + 0.0, top - 0.2), material=wood)
    if WITH_ITEMS:
        add_books(m, (x - 0.45, y + 0.05, top), 3, seed=4)
        add_candle_jar(m, (x - 0.15, y - 0.05, top))
    return top


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("Desk", col)]

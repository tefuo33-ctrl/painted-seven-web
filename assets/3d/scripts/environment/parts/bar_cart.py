"""Барная тележка: золотая рама, две деревянные полки, бутылки и бокалы, колёса."""
import math

from ps3d import Mesh, mat
from parts import whiskey

# НАСТРОЙКИ
WIDTH = 0.8
DEPTH = 0.45
HEIGHT = 0.8

PREVIEW_VIEW = (0.8, -1.5, 0.6)


def add_to(m, loc=(0, 0, 0)):
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    wood = mat("Wood", "wood", roughness=0.35, pattern="planks")
    iron = mat("Iron", "iron", roughness=0.55, metallic=0.6)
    x, y, z = loc
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = x + sx * (WIDTH / 2 - 0.03), y + sy * (DEPTH / 2 - 0.03)
            m.cylinder(0.012, HEIGHT - 0.06, loc=(px, py, z + 0.06 + (HEIGHT - 0.06) / 2), segments=6, material=gold)
            m.cylinder(0.04, 0.02, loc=(px, py, z + 0.04), rot=(0, math.pi / 2, 0), segments=8, material=iron)  # колесо
    for sz in (0.2, 0.62):
        m.box((WIDTH - 0.04, DEPTH - 0.04, 0.025), loc=(x, y, z + sz), material=wood)
        for sy in (-1, 1):
            m.box((WIDTH - 0.04, 0.012, 0.012), loc=(x, y + sy * (DEPTH / 2 - 0.03), z + sz + 0.04), material=gold)
    # Ручка сбоку.
    m.cylinder(0.012, DEPTH - 0.06, loc=(x + WIDTH / 2 + 0.05, y, z + HEIGHT), rot=(math.pi / 2, 0, 0), segments=6,
               material=gold)
    for sy in (-1, 1):
        m.box((0.06, 0.012, 0.012), loc=(x + WIDTH / 2 + 0.02, y + sy * (DEPTH / 2 - 0.03), z + HEIGHT), material=gold)
    # Бутылки и бокалы.
    whiskey.add_bottle(m, (x - 0.25, y + 0.05, z + 0.645), "bottle")
    whiskey.add_bottle(m, (x - 0.12, y + 0.08, z + 0.645), "#3a4a2a", scale=0.85)
    whiskey.add_glass(m, (x + 0.08, y - 0.05, z + 0.645))
    whiskey.add_glass(m, (x + 0.2, y + 0.03, z + 0.645))
    whiskey.add_bottle(m, (x + 0.15, y + 0.02, z + 0.225), "#4a1f2a", scale=0.9)
    whiskey.add_bottle(m, (x - 0.2, y, z + 0.225), "bottle", scale=0.9)


def build(col):
    m = Mesh()
    add_to(m)
    return [m.finish("BarCart", col)]

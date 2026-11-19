"""Настенный декор с листа: бра со свечами, картина в золотой раме, вымпел с пиковой мастью.
Каждая функция — отдельная вещь; build() показывает все три рядом."""
import math

from ps3d import Mesh, mat
from parts import playing_card

# НАСТРОЙКИ
CANDLE_GLOW = 4.0
PAINTING_SIZE = (0.7, 0.55)   # ширина, высота картины, м
BANNER_SIZE = (0.45, 0.9)

PREVIEW_VIEW = (0.35, -1.6, 0.25)


def add_candle(m, loc, height=0.12):
    candle = mat("Candle", "candle", roughness=0.7, pattern=None)
    flame = mat("Flame", "flame", emission=CANDLE_GLOW)
    x, y, z = loc
    m.cylinder(0.018, height, loc=(x, y, z + height / 2), segments=6, material=candle)
    m.sphere(0.014, loc=(x, y, z + height + 0.02), scale=(1, 1, 1.8), detail=0, material=flame)


def add_sconce(m, loc=(0, 0, 0)):
    """Бра: золотая пластина и три рожка со свечами. loc — точка на стене."""
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    x, y, z = loc
    m.box((0.08, 0.03, 0.22), loc=(x, y, z), material=gold)
    m.sphere(0.03, loc=(x, y - 0.03, z - 0.12), detail=0, material=gold)
    for dx in (-0.12, 0.0, 0.12):
        h = 0.06 if dx else 0.1
        m.box((abs(dx) + 0.02 if dx else 0.02, 0.02, 0.02), loc=(x + dx / 2, y - 0.08, z - 0.02), material=gold)
        m.box((0.02, 0.08, 0.02), loc=(x + dx, y - 0.04, z - 0.02), material=gold)
        m.cylinder(0.035, 0.02, loc=(x + dx, y - 0.08, z - 0.01 + h - 0.06), segments=8, material=gold)
        add_candle(m, (x + dx, y - 0.08, z + h - 0.06))


def add_painting(m, loc=(0, 0, 0), size=PAINTING_SIZE):
    """Картина: пейзаж «в пикселях» (небо, луна, тёмный берег) в золотой раме."""
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    sky = mat("PaintSky", "#2f3f58", roughness=0.9, pattern="noise")
    land = mat("PaintLand", "#1f2a24", roughness=0.9, pattern="noise")
    glow = mat("PaintGlow", "#d8a860", roughness=0.9, pattern=None)
    x, y, z = loc
    w, h = size
    f = 0.06
    m.box((w, 0.02, h), loc=(x, y, z), material=sky)
    m.box((w, 0.025, h * 0.35), loc=(x, y - 0.003, z - h * 0.32), material=land)
    m.box((w * 0.5, 0.026, h * 0.12), loc=(x + w * 0.15, y - 0.004, z - h * 0.12), rot=(0, 0.25, 0), material=land)
    m.box((0.06, 0.027, 0.06), loc=(x - w * 0.25, y - 0.005, z + h * 0.25), material=glow)               # луна
    for dz in (-1, 1):
        m.box((w + 2 * f, 0.06, f), loc=(x, y - 0.015, z + dz * (h / 2 + f / 2)), material=gold)
    for dx in (-1, 1):
        m.box((f, 0.06, h), loc=(x + dx * (w / 2 + f / 2), y - 0.015, z), material=gold)
    for dx in (-1, 1):  # уголки-завитки
        for dz in (-1, 1):
            m.box((0.08, 0.07, 0.08), loc=(x + dx * (w / 2 + f / 2), y - 0.02, z + dz * (h / 2 + f / 2)),
                  rot=(0, math.pi / 4, 0), material=gold)


def add_banner(m, loc=(0, 0, 0), size=BANNER_SIZE):
    """Вымпел: красное полотно с золотой пикой (пиксель-арт) и кистью."""
    gold = mat("Gold", "gold", roughness=0.35, metallic=1.0)
    velvet = mat("Velvet", "velvet", roughness=0.9, pattern="velvet")
    trim = mat("VelvetDark", "velvet_dark", roughness=0.9, pattern="velvet")
    x, y, z = loc
    w, h = size
    m.cylinder(0.015, w + 0.14, loc=(x, y, z), rot=(0, math.pi / 2, 0), segments=6, material=gold)   # штанга
    for dx in (-1, 1):
        m.sphere(0.025, loc=(x + dx * (w / 2 + 0.08), y, z), detail=0, material=gold)
    m.box((w, 0.02, h * 0.8), loc=(x, y, z - h * 0.4 - 0.02), material=velvet)
    # Нижний край — «ласточкин хвост» треугольником из двух повёрнутых брусков.
    for dx in (-1, 1):
        m.box((w * 0.72, 0.02, 0.06), loc=(x + dx * w * 0.22, y, z - h * 0.84), rot=(0, dx * 0.62, 0), material=velvet)
    m.box((w, 0.025, 0.03), loc=(x, y - 0.002, z - 0.04), material=gold)
    for dx in (-1, 1):
        m.box((0.02, 0.025, h * 0.78), loc=(x + dx * (w / 2 - 0.03), y - 0.002, z - h * 0.4 - 0.02), material=trim)
    px = 0.03
    bitmap = playing_card.SUITS["spade"]
    m.pixels(bitmap, (x - len(bitmap[0]) * px / 2, y - 0.015, z - h * 0.62), px, gold, depth=0.01)
    m.cylinder(0.006, 0.12, loc=(x, y - 0.01, z - h * 0.98), segments=4, material=gold)                # шнур
    m.cylinder(0.03, 0.08, loc=(x, y - 0.01, z - h * 1.08), segments=6, r2=0.012, rot=(math.pi, 0, 0), material=gold)


def build(col):
    m = Mesh()
    add_sconce(m, (-0.85, 0, 0.3))
    add_painting(m, (0.0, 0, 0.3))
    add_banner(m, (0.85, 0, 0.75))
    return [m.finish("WallDecor", col)]

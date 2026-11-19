"""Игральная карта с толщиной и пиксельной мастью (масть нарисована кубиками)."""
import math

from ps3d import Mesh, mat

# НАСТРОЙКИ
WIDTH, LENGTH, THICK = 0.063, 0.088, 0.0008

# Масти как пиксель-арт: '#' — пиксель. Нарисуй свою — карта поменяется.
SUITS = {
    "spade": [
        "...#...",
        "..###..",
        ".#####.",
        "#######",
        "#######",
        "##.#.##",
        "...#...",
        "..###..",
    ],
    "heart": [
        ".##.##.",
        "#######",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
    ],
    "diamond": ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
    "club": ["..###..", "..###..", "##.#.##", "#######", "##.#.##", "...#...", "..###.."],
}
RED = {"heart", "diamond"}

PREVIEW_VIEW = (0.3, -1.0, 1.3)


def add_card(m, loc, rot_z=0.0, suit="spade", face_up=True):
    paper = mat("CardPaper", "paper", roughness=0.9, pattern=None)
    back = mat("CardBack", "velvet", roughness=0.9, pattern="noise")
    ink = mat("InkRed" if suit in RED else "InkBlack", "chip_red" if suit in RED else "chip_black",
              roughness=0.8, pattern=None)
    x, y, z = loc
    m.box((WIDTH, LENGTH, THICK), loc=(x, y, z + THICK / 2), rot=(0, 0, rot_z), material=paper)
    m.box((WIDTH * 0.86, LENGTH * 0.88, 0.0002), loc=(x, y, z + 0.0001), rot=(0, 0, rot_z), material=back)
    if face_up:
        bitmap = SUITS[suit]
        px = 0.004
        w = len(bitmap[0]) * px
        h = len(bitmap) * px
        # Центр масти на карте (поворот учитываем приблизительно — для лежащей карты достаточно).
        c, s = math.cos(rot_z), math.sin(rot_z)
        for r, line in enumerate(bitmap):
            for k, ch in enumerate(line):
                if ch != "#":
                    continue
                u = -w / 2 + k * px + px / 2
                v = h / 2 - r * px - px / 2
                m.box((px, px, 0.0004), loc=(x + u * c - v * s, y + u * s + v * c, z + THICK + 0.0002),
                      rot=(0, 0, rot_z), material=ink)


def build(col):
    m = Mesh()
    for i, suit in enumerate(("spade", "heart", "diamond", "club")):
        add_card(m, (i * 0.075 - 0.11, 0, i * 0.0001), rot_z=0.0, suit=suit)
    return [m.finish("PlayingCards", col)]

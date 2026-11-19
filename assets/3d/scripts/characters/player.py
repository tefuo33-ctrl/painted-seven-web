"""Игровой персонаж (за него играет игрок) — ВОКСЕЛЬНЫЙ стиль, кубики 2 см.

Образец — 3D-модели с картинок Тима (мужчина в кремовом двубортном костюме, женщина в чёрном костюме с юбкой),
перенесённые в наш пиксельный стиль. Подробный лист персонажа — для костюмов, аксессуаров и эмоций.

ВСЁ СМЕННОЕ:
  тело+костюм — OUTFITS: тип тела (male / female), цвет и крой пиджака, брюки или юбка, рубашка/блузка,
                галстук, платок, обувь. Новый костюм = новая строчка в OUTFITS.
  причёска    — HAIRSTYLES: отдельный объект, крепится к голове.
  очки        — GLASSES: отдельный объект, крепится к голове; "none" — без очков (видны глаза).

ТЕЛО — «кукла» из частей на шарнирах (как в Minecraft): таз, торс, голова, плечо, предплечье, кисть,
бедро, голень, стопа (левые и правые). У каждой части начало координат — в её шарнире, части вложены
(таз → торс → голова/руки, таз → ноги), поэтому позу задают поворотами частей. Позы — POSES.

Мир персонажа: пол z = 0, смотрит на -Y, его правая рука — на -X (для зрителя слева)."""
import copy
import math

import bpy
import numpy as np
from mathutils import Matrix

from voxel import Grid, Palette

VOXEL = 0.02
GRID = dict(size_xy=0.60, size_y=0.46, height=1.78)    # общая сетка тела, волос и очков (кубики совпадают)

# ---------------------------------------------------------------------------
# ПАЛИТРЫ (от тёмного к светлому) — сняты с картинок Тима
# ---------------------------------------------------------------------------
SKIN = Palette("Skin", ["#7a4434", "#a8664c", "#cc8664", "#e6a47e", "#f6c09a", "#fdd4b4", "#ffe6d0"], base=4,
               roughness=0.8)
HAIR_COLORS = {
    "black": Palette("HairBlack", ["#100907", "#1c100c", "#2a1812", "#3a2219", "#4c2e22", "#62402e", "#7a5038"],
                     base=2, roughness=0.6),
    "brown": Palette("HairBrown", ["#120806", "#1e0e0a", "#2c1610", "#3c2018", "#502c20", "#683a2a", "#824a34"],
                     base=3, roughness=0.6),
}
WHITE = Palette("Shirt", ["#7c7872", "#a8a39c", "#cbc5bc", "#e4dfd6", "#f4f0ea", "#fdfbf7"], base=4, roughness=0.8)
BLOUSE_RED = Palette("BlouseRed", ["#2a060a", "#420c12", "#5c1219", "#781a22", "#94242c", "#ae3238"], base=3,
                     roughness=0.6)
TIES = {
    "black": Palette("TieBlack", ["#08070a", "#0f0d12", "#18151c", "#221e28", "#2e2934", "#3c3644"], base=2,
                     roughness=0.5),
}
SHOE = Palette("Shoe", ["#050405", "#0c0a0b", "#151113", "#201a1d", "#342a30", "#5a4c54", "#8a7a84"], base=2,
               roughness=0.25)
BUTTON = Palette("Button", ["#040304", "#0c0a0c", "#181418", "#262028"], base=1, roughness=0.4)
PEARL = Palette("Pearl", ["#a8a098", "#cfc8c0", "#ece6de", "#fffcf6"], base=2, roughness=0.3)
EYE = Palette("Eye", ["#0c0606", "#1e0e0a", "#3a1e14", "#7a5a48", "#f4eee6"], base=1, roughness=0.5)
LIPS = Palette("Lips", ["#6a2a2c", "#8a3a3c", "#a84a4c", "#c25c5c", "#d47070"], base=2, roughness=0.6)
TIGHTS = Palette("Tights", ["#1a0e0e", "#28181a", "#382422", "#4a302c", "#5c3c36", "#704a42"], base=2,
                 roughness=0.7)
FRAME = Palette("GlassesFrame", ["#030304", "#09080a", "#121014", "#1e1b20", "#2e2a32"], base=1, roughness=0.3)
LENS = Palette("GlassesLens", ["#0c0a0e", "#16141a", "#222028", "#302c36", "#e8e4ec"], base=1, roughness=0.1)
CLOTH = {   # ткани костюмов
    "cream": Palette("SuitCream", ["#6e5a52", "#94786e", "#b89a8e", "#d4b8aa", "#e8d0c2", "#f4e2d6", "#fcf0e8"],
                     base=4, roughness=0.85),
    "navy": Palette("SuitNavy", ["#05061a", "#0b0e26", "#121838", "#1b2249", "#252d5c", "#333c72", "#4a528e"],
                    base=3, roughness=0.85),
    "black": Palette("SuitBlack", ["#050407", "#0b090e", "#131017", "#1c1821", "#26212c", "#332c3a", "#443b4e"],
                     base=3, roughness=0.85),
    "beige": Palette("SuitBeige", ["#4e3e30", "#6e5a48", "#8e7660", "#aa9278", "#c2aa90", "#d6c0a6", "#e6d4bc"],
                     base=4, roughness=0.85),
    "brown": Palette("VestBrown", ["#140a08", "#21120c", "#301a12", "#42241a", "#563022", "#6c3e2c", "#844e38"],
                     base=3, roughness=0.85),
}

# Костюмы. body: male / female. style: double — двубортный, single — однобортный, open — распахнут + жилет,
# blazer — женский приталенный жакет на одну пуговицу. square — цвет платка (None — без платка).
OUTFITS = {
    "cream_double":    dict(body="male", jacket="cream", trousers="cream", style="double", tie="black",
                            square="black"),
    "navy_pinstripe":  dict(body="male", jacket="navy", trousers="navy", style="single", tie="black",
                            square="white", stripes=True),
    "black_suit":      dict(body="male", jacket="black", trousers="black", style="single", tie="black",
                            square="white"),
    "beige_vest":      dict(body="male", jacket="beige", trousers="beige", style="open", vest="brown", tie="black",
                            square="black"),
    "black_skirt":     dict(body="female", jacket="black", skirt="black", style="blazer", blouse="white"),
    "black_skirt_red": dict(body="female", jacket="black", skirt="black", style="blazer", blouse="red"),
}
HAIRSTYLES = {"pompadour": "black", "slick": "black", "wavy_long": "brown", "bun": "brown"}   # причёска: цвет
GLASSES = ("square", "none")

# Тела: где ноги, ширина плеч/талии/бёдер (по высоте), толщина рук и ног.
BODIES = {
    # мужчина: пиджак до 0.70, приталенный, широкие плечи
    "male": dict(leg_x=0.09, leg=(0.075, 0.08), hem=0.70,
                 hx=[(0.68, 0.18), (0.80, 0.172), (0.92, 0.17), (1.10, 0.19), (1.16, 0.20), (1.23, 0.13)],
                 hy=[(0.68, 0.105), (1.15, 0.11), (1.23, 0.095)],
                 arm=(0.056, 0.05), hand=(0.025, 0.035), shoulder_x=0.215),
    # женщина: узкие плечи, талия, бёдра, грудь; жакет до бёдер с баской
    "female": dict(leg_x=0.065, leg=(0.05, 0.055), hem=0.76, elbow_out=0.035,
                   hx=[(0.76, 0.165), (0.80, 0.155), (0.93, 0.12), (1.05, 0.135), (1.13, 0.15), (1.18, 0.155),
                       (1.23, 0.11)],
                   hy=[(0.76, 0.10), (0.93, 0.085), (1.01, 0.095), (1.08, 0.12), (1.14, 0.105), (1.23, 0.09)],
                   arm=(0.042, 0.038), hand=(0.022, 0.03), shoulder_x=0.172),
}

# Номера материалов в сетке тела.
(M_SKIN, M_JACKET, M_LOWER, M_SHIRT, M_TIE, M_SHOE, M_BUTTON, M_EYE, M_BROW, M_VEST, M_SQUARE, M_LIPS,
 M_PEARL) = range(1, 14)
M_HAIR, M_FRAME, M_LENS = 1, 1, 2


# ---------------------------------------------------------------------------
# СКЕЛЕТ: часть → (шарнир, кость от–до, «толщина», родитель, группа)
# Группа решает, к каким частям может относиться кубик (пиджак — только к тазу/торсу, рукав — к руке…)
# ---------------------------------------------------------------------------
def bones(body="male"):
    B = BODIES[body]
    lx, sx, eo = B["leg_x"], B["shoulder_x"], B.get("elbow_out", 0.02)
    b = {
        "pelvis": ((0, 0, 0.64), (0, 0, 0.58), (0, 0, 0.70), 0.16, None, "body"),
        "torso": ((0, 0, 0.70), (0, 0, 0.74), (0, 0, 1.18), 0.18, "pelvis", "body"),
        "head": ((0, 0, 1.22), (0, 0, 1.28), (0, 0, 1.60), 0.15, "torso", "head"),
    }
    for side, s in (("R", -1), ("L", 1)):
        b["upperarm_" + side] = ((s * sx, 0, 1.17), (s * sx, 0, 1.15), (s * (sx + eo), 0, 0.96), 0.05,
                                 "torso", "arm" + side)
        b["forearm_" + side] = ((s * (sx + eo), 0, 0.95), (s * (sx + eo), 0, 0.94),
                                (s * (sx + eo + 0.005), -0.01, 0.78), 0.05, "upperarm_" + side, "arm" + side)
        b["hand_" + side] = ((s * (sx + eo + 0.005), -0.012, 0.755), (s * (sx + eo + 0.005), -0.012, 0.74),
                             (s * (sx + eo + 0.005), -0.012, 0.66), 0.04, "forearm_" + side, "arm" + side)
        b["thigh_" + side] = ((s * lx, 0, 0.64), (s * lx, 0, 0.62), (s * lx, 0, 0.38), 0.075, "pelvis",
                              "leg" + side)
        b["shin_" + side] = ((s * lx, 0, 0.37), (s * lx, 0, 0.36), (s * lx, 0, 0.11), 0.07,
                             "thigh_" + side, "leg" + side)
        b["foot_" + side] = ((s * lx, 0, 0.09), (s * lx, 0.03, 0.04), (s * lx, -0.12, 0.04), 0.06,
                             "shin_" + side, "leg" + side)
    return b


BONES = bones("male")
GROUPS = ["body", "head", "armR", "armL", "legR", "legL"]

# Позы: поворот частей (градусы, X/Y/Z — в их шарнирах) и сдвиг всего персонажа.
POSES = {
    "stand": dict(rot={}, offset=(0, 0, 0)),
    "sit": dict(rot={"thigh_R": (-90, 0, 0), "thigh_L": (-90, 0, 0), "shin_R": (90, 0, 0), "shin_L": (90, 0, 0),
                     "upperarm_R": (-35, 0, 6), "upperarm_L": (-35, 0, -6), "forearm_R": (-55, 0, 0),
                     "forearm_L": (-55, 0, 0), "torso": (-3, 0, 0), "head": (4, 0, 0)},
                offset=(0, 0, -0.08)),
}


# ---------------------------------------------------------------------------
# Формы
# ---------------------------------------------------------------------------
def _interp(z, table):
    zs, vs = zip(*table)
    return np.interp(z, zs, vs)


def rbox(g, cx, cy, z0, z1, hx, hy, n=4.0):
    """Брус с закруглёнными углами (сечение — «суперэллипс»). hx/hy — числа или массивы по высоте."""
    return ((np.abs((g.X - cx) / hx) ** n + np.abs((g.Y - cy) / hy) ** n) < 1) & g.zs(z0, z1)


def ell(g, c, r, n=2.0):
    return (np.abs((g.X - c[0]) / r[0]) ** n + np.abs((g.Y - c[1]) / r[1]) ** n
            + np.abs((g.Z - c[2]) / r[2]) ** n) < 1


def limb(g, p0, p1, r, n=4.0):
    """«Квадратная колбаса» от p0 до p1 толщиной r (как рука или нога в пиксельной игре)."""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    d = p1 - p0
    px, py, pz = g.X - p0[0], g.Y - p0[1], g.Z - p0[2]
    t = np.clip((px * d[0] + py * d[1] + pz * d[2]) / (d @ d), 0, 1)
    dx, dy, dz = px - t * d[0], py - t * d[1], pz - t * d[2]
    return (np.abs(dx) ** n + np.abs(dy) ** n + np.abs(dz) ** n) < r ** n


def head_shape(g, inflate=0.0):
    """Голова: «пиксельный куб» со скруглёнными рёбрами и ровным лицом; подбородок уже — только в самом низу."""
    hx = _interp(g.Z, [(1.285, 0.10), (1.31, 0.115), (1.33, 0.125), (1.57, 0.125), (1.605, 0.105)]) + inflate
    hy = _interp(g.Z, [(1.285, 0.115), (1.31, 0.13), (1.57, 0.13), (1.605, 0.11)]) + inflate
    return rbox(g, 0, 0, 1.285 - inflate, 1.605 + inflate, hx, hy, n=4)


def front(mask, depth=1):
    """Кубики маски на передней поверхности (впереди, по -Y, пусто) — на глубину depth кубиков."""
    out = np.zeros_like(mask)
    rest = mask.copy()
    for _ in range(depth):
        ahead = np.zeros_like(mask)
        ahead[:, 1:, :] = rest[:, :-1, :]
        face = rest & ~ahead
        out |= face
        rest &= ~face
    return out


def back(mask):
    behind = np.zeros_like(mask)
    behind[:, :-1, :] = mask[:, 1:, :]
    return mask & ~behind


def ahead_of(mask):
    """Кубики прямо перед маской (на 1 ближе к зрителю) — для выступающих деталей."""
    out = np.zeros_like(mask)
    out[:, :-1, :] = mask[:, 1:, :]
    return out


def outer_surface(mask):
    pad = np.pad(mask, 1)
    n = np.zeros_like(mask)
    for ax in range(3):
        for sh in (-1, 1):
            n |= ~np.roll(pad, sh, ax)[1:-1, 1:-1, 1:-1]
    return mask & n


# ---------------------------------------------------------------------------
# Тело и костюм
# ---------------------------------------------------------------------------
def make_body(outfit):
    spec = OUTFITS[outfit]
    B = BODIES[spec["body"]]
    female = spec["body"] == "female"
    g = Grid(VOXEL, **GRID)
    v = g.v
    group = np.full(g.mat.shape, -1, dtype=np.int8)
    G = {name: i for i, name in enumerate(GROUPS)}

    def put(mask, mat, grp, shade=None):
        g.mat[mask] = mat
        group[mask] = G[grp]
        if shade is not None:
            g.shade[mask] = shade

    X, Y, Z = g.X, g.Y, g.Z
    lx = B["leg_x"]
    # --- Ноги ---
    for side, s in (("R", -1), ("L", 1)):
        grp = "leg" + side
        if not female:
            leg = rbox(g, s * lx, 0, 0.09, 0.66, *B["leg"])
            put(leg, M_LOWER, grp)
            cuff = rbox(g, s * lx, 0, 0.09, 0.15, B["leg"][0] + 0.004, B["leg"][1] + 0.004)   # отворот
            put(cuff, M_LOWER, grp)
            g.tint(cuff, +1)
            g.tint(leg & g.zs(0.15, 0.17), -1)
            g.tint(leg & (np.abs(X - s * lx) < v / 2) & front(leg) & (Z > 0.17), +1)        # стрелка
            # Туфли: массивные, на толстой подошве, носок вперёд, блестят.
            toe_drop = np.clip(-0.09 - Y, 0, None) * 0.5
            shoe = rbox(g, s * lx, -0.04, 0.0, 0.10, 0.078, 0.14, n=3) & (Z < 0.10 - toe_drop)
            put(shoe, M_SHOE, grp)
            g.tint(shoe & (Z < 0.025), -1)
            g.tint(shoe & g.zs(0.025, 0.035), -1)                                   # шов подошвы
            g.tint(shoe & (Y < -0.07) & (Z > 0.035), +2)                             # блик на носке
        else:
            leg = rbox(g, s * lx, 0, 0.05, 0.66, *B["leg"])                          # ноги в колготках
            put(leg, M_LOWER, grp)
            g.tint(leg & front(leg) & (np.abs(X - s * lx) < v), +1)                 # блик по голени
            g.tint(leg & front(leg) & g.zs(0.38, 0.42) & (np.abs(X - s * lx) < 2 * v), +1)   # колено
            # Туфли на каблуке: носок спереди, подъём к пятке, тонкий каблук.
            toe = rbox(g, s * lx, -0.065, 0.0, 0.045, 0.045, 0.055, n=3)
            vamp = rbox(g, s * lx, -0.015, 0.02, 0.10, 0.045, 0.05, n=3) & (Z < 0.03 + (Y + 0.075) * 0.9)
            heel = rbox(g, s * lx, 0.045, 0.0, 0.085, 0.018, 0.018, n=3)
            sole = rbox(g, s * lx, 0.02, 0.07, 0.09, 0.04, 0.04, n=3)
            shoe = toe | vamp | heel | sole
            put(shoe, M_SHOE, grp)
            g.tint(toe & (Y < -0.08) & (Z > 0.02), +2)
    # --- Таз / юбка ---
    if not female:
        put(rbox(g, 0, 0, 0.56, 0.74, 0.165, 0.10, n=5), M_LOWER, "body")
    else:
        sk = rbox(g, 0, 0, 0.62, 0.84, _interp(Z, [(0.62, 0.15), (0.75, 0.165), (0.84, 0.15)]), 0.10, n=4)
        put(sk, M_LOWER, "body")
        g.tint(sk & g.zs(0.62, 0.64), -1)                                            # кромка юбки
    # --- Пиджак / жакет ---
    hx = _interp(Z, B["hx"])
    hy = _interp(Z, B["hy"])
    jacket = rbox(g, 0, 0, B["hem"], 1.23, hx, hy, n=5)
    jacket &= ~((Z < B["hem"] + 0.04) & (np.abs(X) > 0.11) & (Y < -0.07))       # скруглённые полы спереди
    put(jacket, M_JACKET, "body")
    jf = front(jacket)
    style = spec["style"]
    v_bottom = {"double": 1.00, "single": 0.94, "open": 1.04, "blazer": 0.98}[style]
    t = np.clip((Z - v_bottom) / (1.23 - v_bottom), 0, 1)
    vw = (0.012 + t * 0.05) if not female else (0.01 + t * 0.035)                # полуширина выреза
    if style == "open":
        wo = 0.11 - np.clip((Z - 0.62) / (1.23 - 0.62), 0, 1) * 0.05
        opening = jf & (np.abs(X) < wo)
        put(opening, M_VEST, "body")
        vw = 0.012 + t * 0.045
        for zb in (0.70, 0.78, 0.86, 0.94):
            put(opening & (np.abs(X) < v) & g.zs(zb, zb + v), M_BUTTON, "body")
        g.tint(jf & (np.abs(np.abs(X) - wo) < v) & (np.abs(X) >= wo), -2)
    vee = jf & (np.abs(X) < vw) & (Z >= v_bottom)
    put(vee, M_SHIRT, "body")
    if not female:
        tie_w = np.where(Z > 1.18, 0.03, 0.02 + (1.18 - Z) * 0.07)
        put(vee & (np.abs(X) < tie_w) & (Z > v_bottom - 0.02), M_TIE, "body")
    else:
        # Блузка: воротник лежит поверх лацканов (белые уголки), пуговка посередине.
        collar_pts = jf & (np.abs(X) >= vw) & (np.abs(X) < vw + 0.02) & g.zs(1.17, 1.22)
        put(collar_pts, M_SHIRT, "body")
        put(vee & (np.abs(X) < v) & g.zs(1.08, 1.08 + v), M_PEARL, "body")
    # Лацканы: широкая светлая полоса вдоль выреза, тёмная кромка снаружи, насечка (острый лацкан).
    lap_w = 0.06 if not female else 0.045
    lap = jf & (np.abs(X) >= vw) & (np.abs(X) < vw + lap_w) & (Z >= v_bottom + 0.02) & (Z < 1.21)
    lap &= g.mat == M_JACKET
    g.tint(lap, +1)
    # тёмные кромки лацкана (как на картинке — лацканы читаются линиями): снаружи и по краю выреза
    g.tint(jf & (np.abs(X) >= vw + lap_w) & (np.abs(X) < vw + lap_w + v) & (Z >= v_bottom + 0.04) & (Z < 1.19), -2)
    g.tint(lap & (np.abs(X) < vw + v), -1)
    g.tint(lap & g.zs(1.12, 1.14) & (np.abs(X) > vw + lap_w * 0.5), -2)
    # Застёжка и пуговицы (крупные квадратные).
    fz = front(g.mat > 0)
    if style == "double":
        g.tint(jf & (np.abs(X - 0.03) < v / 2) & (Z < v_bottom) & (Z > B["hem"]), -2)
        for bx in (-0.06, 0.06):
            for bz in (0.80, 0.86, 0.92):
                put((np.abs(X - bx) < v) & g.zs(bz, bz + 2 * v) & fz & (g.mat == M_JACKET), M_BUTTON, "body")
    elif style == "single":
        g.tint(jf & (np.abs(X) < v / 2 + 0.001) & (Z < v_bottom) & (Z > B["hem"]), -2)
        for bz in (0.80, 0.88):
            put((np.abs(X) < v) & g.zs(bz, bz + 2 * v) & fz & (g.mat == M_JACKET), M_BUTTON, "body")
    elif style == "blazer":
        g.tint(jf & (np.abs(X) < v / 2 + 0.001) & (Z < v_bottom) & (Z > B["hem"]), -2)
        put((np.abs(X) < v) & g.zs(0.92, 0.96) & fz & (g.mat == M_JACKET), M_PEARL, "body")
    # Карманы с выступающими клапанами (на высоте нижних пуговиц).
    pz = 0.82 if not female else 0.82
    for s in (-1, 1):
        flap_zone = jf & (np.abs(X * s - 0.115) < 0.045) & g.zs(pz, pz + 0.04) & (g.mat == M_JACKET)
        put(ahead_of(flap_zone) & (g.mat == 0), M_JACKET, "body")
        g.tint(flap_zone | ahead_of(flap_zone), +1)
        g.tint(jf & (np.abs(X * s - 0.115) < 0.045) & g.zs(pz - v, pz) & (g.mat == M_JACKET), -2)
    # Нагрудный карман с платком (на левой стороне груди = +X).
    if spec.get("square"):
        g.tint(jf & (X > 0.08) & (X < 0.15) & g.zs(1.04, 1.06) & (g.mat == M_JACKET), -2)
        sq = (X > 0.085) & (X < 0.145) & g.zs(1.06, 1.10) & ~(g.zs(1.08, 1.10) & (X > 0.125))
        put(sq & jf & (g.mat == M_JACKET), M_SQUARE, "body")
    # Спина: шов, шлица.
    jb = back(jacket)
    g.tint(jb & (np.abs(X) < v) & (Z > B["hem"]), -1)
    g.tint(jb & (np.abs(X) < v) & (Z < B["hem"] + 0.08), -1)
    # --- Рукава, манжеты, кисти ---
    sx, eo = B["shoulder_x"], B.get("elbow_out", 0.02)
    for side, s in (("R", -1), ("L", 1)):
        arm = "arm" + side
        up = limb(g, (s * sx, 0, 1.17), (s * (sx + eo), 0, 0.95), B["arm"][0])
        fore = limb(g, (s * (sx + eo), 0, 0.95), (s * (sx + eo + 0.005), -0.01, 0.785), B["arm"][1])
        sleeve = (up | fore) & ((g.mat == 0) | ((group == G["body"]) & (np.abs(X) > sx - 0.02)))
        put(sleeve, M_JACKET, arm)
        cuff = limb(g, (s * (sx + eo + 0.005), -0.01, 0.785), (s * (sx + eo + 0.005), -0.012, 0.755), B["arm"][1] - 0.006)
        put(cuff, M_SHIRT, arm)
        hand = rbox(g, s * (sx + eo + 0.005), -0.012, 0.665, 0.755, *B["hand"], n=3)
        thumb = rbox(g, s * (sx + eo), -0.045, 0.70, 0.735, 0.018, 0.014, n=3)
        put(hand | thumb, M_SKIN, arm)
        g.tint(hand & (Z < 0.685), -1)
    # --- Шея, воротник, голова ---
    neck = (np.sqrt(X ** 2 + (Y - 0.005) ** 2) < 0.05) & g.zs(1.16, 1.30)
    put(neck & (g.mat == 0), M_SKIN, "head")
    if not female:
        collar = (np.sqrt(X ** 2 + Y ** 2) < 0.064) & g.zs(1.19, 1.27) & ~neck
        put(collar, M_SHIRT, "body")
    else:   # открытый ворот блузки: шея видна спереди
        collar = (np.sqrt(X ** 2 + Y ** 2) < 0.062) & g.zs(1.19, 1.25) & ~neck & ~((Y < -0.02) & (np.abs(X) < 0.03))
        put(collar, M_SHIRT, "body")
    head = head_shape(g)
    put(head, M_SKIN, "head")
    for s in (-1, 1):
        ear = rbox(g, s * 0.13, 0.01, 1.37, 1.45, 0.02, 0.03, n=3)
        put(ear, M_SKIN, "head")
        g.tint(ear & (np.abs(X) < 0.145) & g.zs(1.39, 1.43), -1)
        if female:                                                           # серьги-капли
            put((np.abs(X - s * 0.135) < v / 2 + 0.001) & (np.abs(Y - 0.01) < v / 2 + 0.001) & g.zs(1.31, 1.36),
                M_PEARL, "head")
    hf = front(head)
    nose_base = hf & (np.abs(X) < v) & g.zs(1.37, 1.40)
    put(ahead_of(nose_base) & (g.mat == 0), M_SKIN, "head")
    g.tint(ahead_of(nose_base) & g.zs(1.37, 1.38), -1)
    if female:
        put(hf & (np.abs(X) < 0.03) & g.zs(1.32, 1.34), M_LIPS, "head")
    else:
        g.tint(hf & (np.abs(X) < 0.025) & g.zs(1.32, 1.34), -2)
    for s in (-1, 1):
        ex = s * X
        eye = hf & (ex > 0.03) & (ex < 0.075) & g.zs(1.41, 1.45)
        put(eye, M_EYE, "head")
        g.shade[eye] = 0                                                     # ресницы
        g.shade[eye & g.zs(1.41, 1.43) & (ex < 0.06)] = -1                   # зрачок
        g.shade[eye & g.zs(1.41, 1.43) & (ex >= 0.06)] = 3                   # белок
        if female:                                                           # ресничка в уголке
            put(ahead_of(hf & (ex > 0.07) & (ex < 0.09) & g.zs(1.43, 1.45)) & (g.mat == 0), M_EYE, "head", shade=0)
        bw = 0.06 if female else 0.065
        put(hf & (ex > 0.025) & (ex < 0.025 + bw) & g.zs(1.47 if not female else 1.475, 1.49), M_BROW, "head")
    g.tint(hf & g.zs(1.50, 1.53), -1)
    g.tint(head & (Z < 1.30), -1)
    if spec.get("stripes"):
        stripe = ((g.SI % 3) == 0)
        cl = np.isin(g.mat, (M_JACKET, M_LOWER))
        g.tint(stripe & cl & front(g.mat > 0, 1), +2)
        g.tint(stripe & cl & ~front(g.mat > 0, 1), +1)
    hair_col = "brown" if female else "black"
    lower_pal = TIGHTS if female else CLOTH[spec["trousers"]]
    if female:
        lower_pal = None
    pal = {M_SKIN: SKIN, M_JACKET: CLOTH[spec["jacket"]], M_SHIRT: BLOUSE_RED if spec.get("blouse") == "red" else WHITE,
           M_TIE: TIES[spec.get("tie", "black")], M_SHOE: SHOE, M_BUTTON: BUTTON, M_EYE: EYE,
           M_BROW: HAIR_COLORS[hair_col], M_VEST: CLOTH[spec.get("vest", "brown")],
           M_SQUARE: TIES["black"] if spec.get("square") == "black" else WHITE, M_LIPS: LIPS, M_PEARL: PEARL}
    if female:
        # Ноги (колготки) и юбка — разные материалы: юбка в группе тела (таз) остаётся тканью.
        skirt = (g.mat == M_LOWER) & (group == G["body"])
        g.mat[skirt] = M_VEST
        pal[M_VEST] = CLOTH[spec["skirt"]]
        pal[M_LOWER] = TIGHTS
    else:
        pal[M_LOWER] = lower_pal
    return g, group, pal, spec["body"]


# ---------------------------------------------------------------------------
# Причёски и очки (свои сетки, кубики совпадают с телом)
# ---------------------------------------------------------------------------
def make_hair(style, seed=3):
    rng = np.random.default_rng(seed)
    g = Grid(VOXEL, **GRID)
    v = g.v
    X, Y, Z = g.X, g.Y, g.Z
    skull = head_shape(g)
    if style == "pompadour":
        # Как на картинке: компактный купол — широкий сверху, у висков по форме головы (уши видны),
        # сзади — круглый затылок; спереди кок до оправы очков (не нависает над лицом).
        shell = ell(g, (0, 0.02, 1.585), (0.165, 0.165, 0.125), n=2.2)             # круглый купол
        shell |= ell(g, (0, 0.06, 1.50), (0.15, 0.125, 0.13), n=2.4)              # затылок
        shell |= ell(g, (0.02, -0.06, 1.56), (0.12, 0.07, 0.06), n=2.4)            # кок надо лбом
        shell |= head_shape(g, inflate=0.016) & (Z > 1.47) & (Z < 1.58)
        low = np.where(Y < -0.07, 1.49, np.where(Y > 0.05, 1.36, 1.46))
        hair = shell & (Z >= low) & ~(skull & (Z < 1.49))
        # Слои-волны: каждые 3 кубика по высоте — тёмная линия, над ней светлый край.
        layer = np.floor((Z - 1.36 + 0.004 * np.sin(X * 40)) / v).astype(int) % 3
        surf = outer_surface(hair)
        g.put(hair, M_HAIR)
        g.tint(hair & surf & (layer == 0), -1)
        g.tint(hair & surf & (layer == 2), +1)
        g.tint(hair & (Z > 1.62), +1)
    elif style == "slick":
        shell = head_shape(g, inflate=0.022)
        shell |= rbox(g, 0.02, -0.06, 1.58, 1.65, 0.09, 0.07, n=3)
        low = np.where(Y < -0.06, 1.52, np.where(Y > 0.05, 1.34, 1.45))
        hair = shell & (Z >= low) & ~(skull & (Z < 1.52))
        g.put(hair, M_HAIR)
        g.tint(hair & (np.abs(X - 0.04) < 0.02) & (Z > 1.55), +2)
        g.tint(hair & (Z < 1.44), -1)
    elif style == "wavy_long":
        # Пышные волнистые до плеч: лицо ОТКРЫТО, по бокам — две пышные пряди, сзади — до плеч.
        shell = head_shape(g, inflate=0.02) & (Z > 1.48) & (Z < 1.59)
        shell |= ell(g, (0, 0.02, 1.56), (0.175, 0.17, 0.09), n=2.2)               # верх (не высоко)
        for s in (-1, 1):
            shell |= ell(g, (s * 0.16, 0.04, 1.38), (0.07, 0.10, 0.18), n=2.2)     # пряди по бокам (за ушами)
        shell |= ell(g, (0, 0.08, 1.38), (0.18, 0.11, 0.19), n=2.4)                # сзади
        for _ in range(8):                                                   # локоны
            a = rng.uniform(-0.3, math.pi + 0.3)
            c = (0.17 * math.cos(a), 0.04 + 0.07 * math.sin(a), rng.uniform(1.26, 1.48))
            shell |= ell(g, c, (0.045, 0.05, 0.055))
        face = (np.abs(X) < 0.125) & (Y < 0.0) & (Z < 1.49)                  # лицо и уши — без волос
        face |= (Y < -0.02) & (Z < 1.49)                                     # в профиль лицо открыто: пряди за ухом
        hair = shell & (Z >= 1.18) & ~face & ~skull
        g.put(hair, M_HAIR)
        wave = np.sin(Z * 55 + np.sign(X) * X * 18 + Y * 10)                 # волны поперёк прядей
        surf = outer_surface(hair)
        g.tint(hair & surf & (wave > 0.6), +1)
        g.tint(hair & surf & (wave < -0.7), -1)
        g.tint(hair & (np.abs(X - 0.03) < v / 2 + 0.001) & (Z > 1.58) & (Y < 0.0), -2)   # пробор
    elif style == "bun":
        shell = head_shape(g, inflate=0.022)
        shell |= ell(g, (0, 0.13, 1.58), (0.075, 0.07, 0.075))              # пучок на затылке
        shell |= ell(g, (-0.04, -0.09, 1.53), (0.10, 0.05, 0.05))           # чёлка набок
        low = np.where(Y < -0.06, 1.50, np.where(Y > 0.05, 1.33, 1.44))
        hair = shell & (Z >= low) & ~(skull & (Z < 1.50))
        g.put(hair, M_HAIR)
        surf = outer_surface(hair)
        g.tint(hair & surf & (np.sin(X * 50 + Z * 30) > 0.7), +1)
        g.tint(hair & (Z < 1.44), -1)
    return g, {M_HAIR: HAIR_COLORS[HAIRSTYLES[style]]}


def make_glasses(style):
    """Квадратные солнечные очки: две отдельные линзы в толстой чёрной оправе, перемычка сверху, блик."""
    if style == "none":
        return None, None
    g = Grid(VOXEL, **GRID)
    v = g.v
    X, Y, Z = g.X, g.Y, g.Z
    face_y = -0.13
    plate = (np.abs(Y - (face_y - v / 2)) < v / 2) & g.zs(1.38, 1.48)
    ax = np.abs(X)
    rim = plate & (ax > 0.012) & (ax < 0.13)
    lens = plate & (ax > 0.03) & (ax < 0.11) & g.zs(1.40, 1.46)
    bridge = plate & (ax <= 0.03) & g.zs(1.44, 1.46)
    frame = (rim & ~lens) | bridge
    temples = (np.abs(ax - 0.135) < v / 2 + 0.001) & (Y > face_y - v) & (Y < 0.03) & g.zs(1.44, 1.46)
    g.put(frame | temples, M_FRAME)
    g.put(lens, M_LENS)
    g.tint(lens & g.zs(1.44, 1.46) & (ax > 0.03) & (ax < 0.05), +3)          # блик в верхнем углу
    g.tint(lens & g.zs(1.40, 1.42), +1)
    return g, {M_FRAME: FRAME, M_LENS: LENS}


# ---------------------------------------------------------------------------
# Сборка: части-объекты с шарнирами
# ---------------------------------------------------------------------------
def _assign(g, group, bset):
    """Каждый кубик → ближайшая кость своей группы."""
    seg = np.full(g.mat.shape, -1, dtype=np.int16)
    names = list(bset)
    best = np.full(g.mat.shape, np.inf)
    for i, name in enumerate(names):
        pivot, p0, p1, r, parent, grp = bset[name]
        gi = GROUPS.index(grp)
        p0, p1 = np.array(p0, float), np.array(p1, float)
        d = p1 - p0
        px, py, pz = g.X - p0[0], g.Y - p0[1], g.Z - p0[2]
        t = np.clip((px * d[0] + py * d[1] + pz * d[2]) / max(d @ d, 1e-9), 0, 1)
        dist = np.sqrt((px - t * d[0]) ** 2 + (py - t * d[1]) ** 2 + (pz - t * d[2]) ** 2) - r
        m = (group == gi) & (dist < best)
        best[m] = dist[m]
        seg[m] = i
    return seg, names


def _object(g, mask, name, palettes, col, pivot):
    gg = copy.copy(g)
    gg.mat = np.where(mask, g.mat, 0)
    used = {m: p for m, p in palettes.items() if (gg.mat == m).any()}
    obj = gg.build_mesh(name, used, col)
    obj.data.transform(Matrix.Translation((-pivot[0], -pivot[1], -pivot[2])))
    obj.location = pivot
    return obj


def build(col, outfit="cream_double", hair="pompadour", glasses="square", pose="stand", name="Player"):
    """Собрать персонажа. Возвращает (корень, {часть: объект})."""
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    g, group, pal, body = make_body(outfit)
    bset = bones(body)
    seg, names = _assign(g, group, bset)
    parts = {}
    for i, part in enumerate(names):
        mask = (seg == i) & (g.mat > 0)
        if not mask.any():
            continue
        parts[part] = _object(g, mask, f"{name}_{part}", pal, col, bset[part][0])
    for part, obj in parts.items():
        parent = bset[part][4]
        obj.parent = parts.get(parent) if parent else root
        pp = bset[parent][0] if parent else (0, 0, 0)
        obj.matrix_parent_inverse = Matrix.Translation((-pp[0], -pp[1], -pp[2]))
    head = parts["head"]
    hp = bset["head"][0]
    for maker, arg, tag in ((make_hair, hair, "hair"), (make_glasses, glasses, "glasses")):
        hg, hpal = maker(arg)
        if hg is None:
            continue
        o = _object(hg, hg.mat > 0, f"{name}_{tag}", hpal, col, hp)
        o.parent = head
        o.matrix_parent_inverse = Matrix.Translation((-hp[0], -hp[1], -hp[2]))
        parts[tag] = o
    set_pose(root, parts, pose)
    print(f"{name}: {outfit}, {hair}, {glasses}, {pose}; граней",
          sum(len(o.data.polygons) for o in parts.values()))
    return root, parts


def set_pose(root, parts, pose):
    p = POSES[pose]
    for part, obj in parts.items():
        r = p["rot"].get(part, (0, 0, 0))
        obj.rotation_euler = tuple(math.radians(a) for a in r)
    root.location = p["offset"]
    bpy.context.view_layer.update()

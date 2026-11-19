"""Игровой персонаж — ВЫСОКОЕ КАЧЕСТВО (мужчина). Пробная версия: по ней Тим судит стиль.

По картинке Тима (3D-модель, карта нормалей): лицо с ЧЕЛЮСТЬЮ и подбородком, щёки, губы, нос, уши;
пышная причёска валиками (волна-чёлка набок); прямоугольные очки со скруглёнными углами и двойной
перемычкой; двубортный костюм с объёмными лацканами, пуговицами, клапанами карманов; брюки с отворотами.

Пиксельный стиль сохраняется: всё — кубики, но мельче (1 см вместо 2). Формы задаются гладкими
«поверхностями» (как в 3D) и раскладываются на кубики. Объём «запекается» в цвет кубиков по гладкой форме:
свет сверху-спереди, тени в складках — чистыми полосами оттенков, как в пиксель-арте.

Устройство (как в player.py): «кукла» из частей на шарнирах, причёска и очки — отдельные объекты на голове."""
import copy

import bpy
import numpy as np
from mathutils import Matrix

import player as base
from voxel import Grid, Palette

VOXEL = 0.01
GRID = dict(size_xy=0.62, size_y=0.48, height=1.76)
LIGHT = np.array([-0.40, -0.62, 0.68])          # откуда свет при «запекании»: спереди-сверху-слева
LIGHT = LIGHT / np.linalg.norm(LIGHT)

# Палитры с плавными переходами (от тени к блику).
SKIN = Palette("SkinHD", ["#4e2418", "#6c3424", "#8c4832", "#ab5e42", "#c77956", "#dc946c", "#ebad84", "#f5c49e",
                          "#fcd9b9"], base=6, roughness=0.75)
LIPS = Palette("LipsHD", ["#6a3426", "#86442f", "#a2563c", "#b8684a", "#ca7c5c", "#d88e6c", "#e4a07e"], base=4,
               roughness=0.6)
HAIR = Palette("HairHD", ["#0a0504", "#130a07", "#1d100b", "#28170f", "#341e14", "#43281a", "#543322", "#683f2a",
                          "#7e4e34", "#94603f"], base=4, roughness=0.55)
SUIT = Palette("SuitCreamHD", ["#56443c", "#705a50", "#8b7266", "#a48a7c", "#bba293", "#cfb8a8", "#e0cbbb",
                               "#eedccd", "#f8ebdf"], base=6, roughness=0.85)
SHIRT = Palette("ShirtHD", ["#5e5a56", "#7c7872", "#9a958e", "#b6b0a8", "#cec8c0", "#e2ddd5", "#f0ece6", "#f9f7f3",
                            "#fefdfb"], base=6, roughness=0.8)
TIE = Palette("TieHD", ["#040305", "#09070b", "#100d12", "#18141b", "#211c25", "#2b2530", "#37303d", "#463d4d"],
              base=3, roughness=0.45)
SHOE = Palette("ShoeHD", ["#030203", "#080607", "#0f0c0d", "#171315", "#211b1e", "#2e262a", "#40363b", "#5a4e54",
                          "#82767c"], base=3, roughness=0.2)
SOLE = Palette("SoleHD", ["#0a0806", "#14100c", "#1e1812", "#2a2219", "#382e22"], base=2, roughness=0.6)
BUTTON = Palette("ButtonHD", ["#030203", "#0a080a", "#141014", "#201a20", "#2e262e", "#40363f"], base=2,
                 roughness=0.35)
EYE = base.EYE
FRAME = Palette("FrameHD", ["#020203", "#070608", "#0e0c10", "#18151a", "#262228", "#3a343e", "#58505c"], base=2,
                roughness=0.25)
LENS = Palette("LensHD", ["#060507", "#0c0a0e", "#141118", "#1d1922", "#28232e", "#36303c", "#e8e2ee"], base=2,
               roughness=0.05)

(M_SKIN, M_JACKET, M_TROUSERS, M_SHIRT, M_TIE, M_SHOE, M_BUTTON, M_EYE, M_BROW, M_SQUARE, M_LIPS,
 M_SOLE) = range(1, 13)
M_HAIR, M_FRAME, M_LENS = 1, 1, 2


# ---------------------------------------------------------------------------
# «Гладкие поверхности» (расстояние до формы: < 0 — внутри)
# ---------------------------------------------------------------------------
def sd_ellipsoid(P, c, r):
    x, y, z = (P[0] - c[0]) / r[0], (P[1] - c[1]) / r[1], (P[2] - c[2]) / r[2]
    return (np.sqrt(x * x + y * y + z * z) - 1.0) * min(r)


def sd_capsule(P, a, b, r0, r1=None):
    r1 = r0 if r1 is None else r1
    pa = [P[i] - a[i] for i in range(3)]
    ba = [b[i] - a[i] for i in range(3)]
    h = np.clip(sum(pa[i] * ba[i] for i in range(3)) / sum(x * x for x in ba), 0, 1)
    d = np.sqrt(sum((pa[i] - ba[i] * h) ** 2 for i in range(3)))
    return d - (r0 + (r1 - r0) * h)


def sd_rbox(P, c, half, rad):
    q = [np.abs(P[i] - c[i]) - (half[i] - rad) for i in range(3)]
    out = np.sqrt(sum(np.maximum(x, 0) ** 2 for x in q))
    ins = np.minimum(np.maximum(q[0], np.maximum(q[1], q[2])), 0)
    return out + ins - rad


def sd_column(P, z0, z1, hx, hy, rad, cx=0.0, cy=0.0):
    """Вертикальный «столб» со скруглёнными рёбрами и сечением, меняющимся по высоте (hx, hy — массивы)."""
    qx = np.abs(P[0] - cx) - (hx - rad)
    qy = np.abs(P[1] - cy) - (hy - rad)
    d2 = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - rad
    return np.maximum(d2, np.maximum(z0 - P[2], P[2] - z1))


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def _interp(z, table):
    zs, vs = zip(*table)
    return np.interp(z, zs, vs)


def front(mask):
    ahead = np.zeros_like(mask)
    ahead[:, 1:, :] = mask[:, :-1, :]
    return mask & ~ahead


# ---------------------------------------------------------------------------
# Голова
# ---------------------------------------------------------------------------
FACE_Y = -0.112          # плоскость лица (спереди лицо ровное — как в пиксель-арте; объём даёт светотень)


def sd_head(P):
    """Голова: черепная коробка со скруглёнными рёбрами + ЧЕЛЮСТЬ: ниже скул лицо сужается к подбородку,
    скула от подбородка поднимается к уху. Нос, губы, надбровье — небольшие выступы на ровном лице."""
    X, Y, Z = P
    skull = sd_rbox(P, (0, 0.01, 1.475), (0.115, 0.122, 0.13), 0.045)
    # челюсть: ширина по высоте (к подбородку уже), спереди — заподлицо с лицом
    hx = _interp(Z, [(1.285, 0.028), (1.30, 0.05), (1.32, 0.075), (1.35, 0.097), (1.38, 0.108), (1.43, 0.113)])
    qx = np.abs(X) - (hx - 0.015)
    qy = np.abs(Y) - (-FACE_Y - 0.015)
    jaw = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - 0.015
    jaw = np.maximum(jaw, np.maximum((1.285 + (Y - FACE_Y) * 0.42) - Z, Z - 1.45))   # низ челюсти — к уху выше
    d = smin(skull, jaw, 0.012)
    d = smin(d, sd_ellipsoid(P, (0, FACE_Y + 0.002, 1.472), (0.088, 0.008, 0.011)), 0.004)  # надбровье
    nose = sd_capsule(P, (0, FACE_Y, 1.432), (0, FACE_Y - 0.014, 1.398), 0.007, 0.011)
    d = np.minimum(d, nose)
    d = np.minimum(d, sd_ellipsoid(P, (0, FACE_Y, 1.345), (0.026, 0.006, 0.009)))         # губы
    for s in (-1, 1):
        d = smin(d, sd_ellipsoid(P, (s * 0.117, 0.012, 1.42), (0.014, 0.028, 0.04)), 0.005)   # уши
    return d


# ---------------------------------------------------------------------------
# Тело и костюм
# ---------------------------------------------------------------------------
def make_body():
    g = Grid(VOXEL, **GRID)
    v = g.v
    P = (g.X, g.Y, g.Z)
    X, Y, Z = P
    group = np.full(g.mat.shape, -1, dtype=np.int8)
    G = {n: i for i, n in enumerate(base.GROUPS)}
    sd_all = np.full(g.mat.shape, 1.0, dtype=np.float32)          # общая гладкая форма — для светотени

    def put(mask, mat, grp, shade=None):
        g.mat[mask] = mat
        group[mask] = G[grp]
        if shade is not None:
            g.shade[mask] = shade

    def shape(d, mat, grp, only_empty=False):
        nonlocal sd_all
        m = d < 0
        if only_empty:
            m &= g.mat == 0
        put(m, mat, grp)
        sd_all = np.minimum(sd_all, d)
        return m

    def raised(d, region, mat, grp, h=0.011):
        """Деталь, наращённая поверх поверхности d на h (лацкан, клапан, пуговица): ровно один слой по форме."""
        nonlocal sd_all
        m = (d < h) & (d >= 0) & region & (g.mat == 0)
        put(m, mat, grp)
        sd_all = np.minimum(sd_all, np.where(region, d - h, 1.0))
        return m

    lx = 0.085
    # --- ноги: брюки с отворотами, туфли ---
    for side, s in (("R", -1), ("L", 1)):
        grp = "leg" + side
        # штанина — скруглённый «брусок» (в пиксельном стиле чище, чем круглая), чуть сужается книзу
        leg = sd_column(P, 0.10, 0.72, _interp(Z, [(0.10, 0.062), (0.40, 0.066), (0.72, 0.074)]),
                        _interp(Z, [(0.10, 0.064), (0.72, 0.076)]), 0.03, cx=s * lx)
        lm = shape(leg, M_TROUSERS, grp)
        cuff = sd_column(P, 0.088, 0.14, 0.067, 0.069, 0.03, cx=s * lx)
        cm = shape(cuff, M_TROUSERS, grp)
        g.tint(cm & (cuff > -v * 1.5), +1)
        g.tint(lm & (np.abs(Z - 0.146) < v * 0.6), -2)                              # шов над отворотом
        g.tint(lm & front(lm) & (np.abs(X - s * lx) < v / 2 + 1e-4) & (Z > 0.16) & (Z < 0.68), +1)   # стрелка
        for zf in (0.42, 0.20, 0.235):                                              # складки ткани
            g.tint(lm & (np.abs(Z - zf - 0.01 * np.sin(X * 90)) < v * 0.6) & (leg > -v * 1.5), -1)
        shoe = sd_rbox(P, (s * lx, -0.04, 0.05), (0.066, 0.135, 0.05), 0.035)
        shoe = np.maximum(shoe, Z - (0.098 - np.clip(-0.075 - Y, 0, None) * 0.55))
        sm = shape(shoe, M_SHOE, grp)
        shape(sd_rbox(P, (s * lx, -0.04, 0.011), (0.07, 0.14, 0.011), 0.006), M_SOLE, grp)
        g.tint(sm & (np.abs(Y + 0.02) < 0.035) & (Z > 0.075) & (np.abs(X - s * lx) < 0.03), -1)    # шнуровка
    shape(sd_rbox(P, (0, 0, 0.705), (0.158, 0.098, 0.07), 0.045), M_TROUSERS, "body")       # таз
    # --- пиджак ---
    hx = _interp(Z, [(0.70, 0.176), (0.84, 0.168), (0.95, 0.171), (1.08, 0.184), (1.15, 0.19), (1.21, 0.165)])
    hy = _interp(Z, [(0.70, 0.106), (0.95, 0.11), (1.19, 0.112), (1.215, 0.10)])     # перед ровный (лацканы)
    jacket = sd_column(P, 0.70, 1.215, hx, hy, 0.035)
    jacket = smin(jacket, sd_capsule(P, (-0.17, 0, 1.16), (0.17, 0, 1.16), 0.052), 0.03)    # плечи
    cut = (np.abs(X) - 0.105) * 1.2 + 0.73 - Z                     # скруглённые полы спереди
    jacket = np.maximum(jacket, np.where((Y < -0.07) & (np.abs(X) > 0.105), cut, -1))
    jm = shape(jacket, M_JACKET, "body")
    vb = 1.00
    t = np.clip((Z - vb) / (1.215 - vb), 0, 1)
    vw = 0.01 + t * 0.055
    front_half = Y < -0.02
    vee = jm & front_half & (np.abs(X) < vw) & (Z >= vb) & (jacket > -0.015)
    put(vee, M_SHIRT, "body")
    # галстук: чуть выпуклый
    tie_w = np.where(Z > 1.17, 0.017, 0.012 + (1.17 - Z) * 0.03)
    put(vee & (np.abs(X) < tie_w) & (Z > vb - 0.01), M_TIE, "body")                  # галстук на рубашке
    raised(jacket, front_half & (np.abs(X) < 0.018) & (Z > 1.165) & (Z < 1.205), M_TIE, "body", h=0.009)   # узел
    # лацканы: наращены на 1 см по поверхности пиджака, острый «пик» с насечкой
    lap_w = 0.062
    notch = (Z > 1.125) & (Z < 1.14) & (np.abs(X) > vw + lap_w * 0.45)
    lap_region = front_half & (np.abs(X) >= vw) & (np.abs(X) < vw + lap_w) & (Z >= vb + 0.015) & (Z < 1.20) & ~notch
    lap = raised(jacket, lap_region, M_JACKET, "body")
    g.tint(lap & (np.abs(X) > vw + lap_w - 0.012), -1)                     # кромка лацкана
    # край запаха, пуговицы 2×3
    g.tint(jm & front(jm) & (np.abs(X - 0.028) < v) & (Z < vb) & (Z > 0.71), -2)
    for bx in (-0.056, 0.056):
        for bz in (0.795, 0.86, 0.925):
            raised(jacket, front_half & (((X - bx) ** 2 + (Z - bz) ** 2) < 0.0165 ** 2), M_BUTTON, "body")
    # клапаны карманов и нагрудный карман с платком
    for s in (-1, 1):
        fl = raised(jacket, front_half & (np.abs(X * s - 0.125) < 0.042) & (Z > 0.79) & (Z < 0.828), M_JACKET, "body",
                    h=0.009)
        g.tint(fl & (Z < 0.80), -1)
    g.tint(jm & front(jm) & (X > 0.085) & (X < 0.15) & (np.abs(Z - 1.045) < v * 0.6), -2)
    raised(jacket, front_half & (X > 0.09) & (X < 0.145) & (Z > 1.05) & (Z < 1.085) & ~((Z > 1.07) & (X > 0.12)),
           M_SQUARE, "body", h=0.008)
    # спина: шов
    g.tint(jm & (Y > 0.08) & (np.abs(X) < v) & (jacket > -v * 1.5), -1)
    # --- рукава, манжеты, кисти ---
    for side, s in (("R", -1), ("L", 1)):
        arm = "arm" + side
        sl = smin(sd_capsule(P, (s * 0.205, 0, 1.15), (s * 0.224, 0, 0.93), 0.056, 0.05),
                  sd_capsule(P, (s * 0.224, 0, 0.93), (s * 0.232, -0.012, 0.775), 0.05, 0.047), 0.015)
        sleeve = (sl < 0) & ((g.mat == 0) | ((group == G["body"]) & (np.abs(X) > 0.19)))
        put(sleeve, M_JACKET, arm)
        sd_all = np.minimum(sd_all, sl)
        g.tint(sleeve & (np.abs(Z - 0.935 - 0.012 * np.sin(Y * 80)) < v * 0.7) & (X * s < 0.225), -1)   # складка у локтя
        shape(sd_capsule(P, (s * 0.232, -0.012, 0.78), (s * 0.233, -0.013, 0.752), 0.043), M_SHIRT, arm)
        palm = sd_rbox(P, (s * 0.234, -0.015, 0.705), (0.021, 0.034, 0.046), 0.016)
        thumb = sd_capsule(P, (s * 0.226, -0.042, 0.735), (s * 0.228, -0.05, 0.70), 0.0105)
        hm = shape(np.minimum(palm, thumb), M_SKIN, arm)
        for fy in (-0.032, -0.015, 0.002):                                       # щели между пальцами
            g.tint(hm & (np.abs(Y - fy) < v * 0.6) & (Z < 0.69), -1)
    # --- шея, воротник, голова ---
    shape(sd_capsule(P, (0, 0.006, 1.17), (0, 0.004, 1.31), 0.044), M_SKIN, "head", only_empty=True)
    neck = sd_capsule(P, (0, 0.006, 1.17), (0, 0.004, 1.31), 0.044)
    collar = np.maximum(sd_capsule(P, (0, 0.002, 1.185), (0, 0.002, 1.245), 0.057), -neck)
    collar = np.minimum(collar, np.maximum(sd_rbox(P, (0, -0.052, 1.21), (0.042, 0.014, 0.028), 0.008),
                                           0.012 - np.abs(X)))
    cm = (collar < 0) & (g.mat != M_TIE)
    put(cm, M_SHIRT, "body")
    sd_all = np.minimum(sd_all, collar)
    hd = sd_head(P)
    head = shape(hd, M_SKIN, "head")
    hf = front(head)
    lips = hf & (np.abs(X) < 0.026) & (np.abs(Z - 1.345) < 0.009)
    put(lips, M_LIPS, "head")
    g.tint(lips & (Z > 1.345), -1)                                         # верхняя губа темнее
    g.tint(hf & (np.abs(X) < 0.026) & (np.abs(Z - 1.345) < 0.0015), -1)   # линия рта
    for s in (-1, 1):
        ex = s * X
        eye = hf & (ex > 0.028) & (ex < 0.072) & (Z > 1.418) & (Z < 1.442)
        put(eye, M_EYE, "head", shade=0)
        g.shade[eye & (Z < 1.432) & (ex < 0.052)] = -1
        g.shade[eye & (Z < 1.432) & (ex >= 0.052)] = 3
        put(hf & (ex > 0.022) & (ex < 0.085) & (np.abs(Z - (1.468 + (ex - 0.05) * 0.12)) < 0.0075), M_BROW, "head")
        g.tint(head & (np.abs(X - s * 0.118) < 0.008) & (np.abs(Y - 0.006) < 0.012) & (np.abs(Z - 1.415) < 0.022), -2)
    pal = {M_SKIN: SKIN, M_JACKET: SUIT, M_TROUSERS: SUIT, M_SHIRT: SHIRT, M_TIE: TIE, M_SHOE: SHOE,
           M_BUTTON: BUTTON, M_EYE: EYE, M_BROW: HAIR, M_SQUARE: TIE, M_LIPS: LIPS, M_SOLE: SOLE}
    return g, group, pal, sd_all


# ---------------------------------------------------------------------------
# Причёска и очки
# ---------------------------------------------------------------------------
def make_hair():
    """Пышная причёска валиками: волна-чёлка, закрученная набок, валики сверху, по бокам и сзади."""
    g = Grid(VOXEL, **GRID)
    P = (g.X, g.Y, g.Z)
    X, Y, Z = P
    head = sd_head(P)
    d = np.where(Y > -0.07, head - 0.012, 1.0)                             # слой волос по голове (не на лбу)
    # Объём уходит ВВЕРХ (как на картинке), бока прижаты к голове — без «полей шляпы».
    rolls = [((-0.13, -0.082, 1.57), (0.08, -0.118, 1.615), 0.052),         # волна-чёлка (набок, вправо)
             ((0.08, -0.118, 1.615), (0.128, -0.095, 1.58), 0.042),         # завиток на конце волны
             ((-0.115, -0.03, 1.685), (0.115, -0.05, 1.705), 0.058),        # второй валик
             ((-0.10, 0.05, 1.715), (0.10, 0.052, 1.72), 0.055),             # макушка
             ((-0.11, 0.115, 1.66), (0.11, 0.12, 1.665), 0.052),            # затылок сверху
             ((-0.10, 0.14, 1.565), (0.10, 0.145, 1.565), 0.045)]           # затылок снизу
    for s in (-1, 1):
        rolls += [((s * 0.122, -0.05, 1.62), (s * 0.125, 0.09, 1.61), 0.045),     # бок сверху
                  ((s * 0.118, -0.01, 1.54), (s * 0.118, 0.11, 1.52), 0.03)]       # бок над ухом
    rng = np.random.default_rng(7)
    for a, b, r in rolls:
        d = smin(d, sd_capsule(P, a, b, r), 0.012)
        for tt in np.linspace(0.1, 0.9, 4):                                 # кудри — бугорки вдоль валика
            c = [a[i] + (b[i] - a[i]) * tt for i in range(3)]
            c[2] += r * 0.55
            c[0] += rng.uniform(-0.01, 0.01)
            d = smin(d, sd_ellipsoid(P, c, (r * 0.55, r * 0.5, r * 0.45)), 0.008)
    low = np.where(Y < -0.07, 1.515, np.where(Y > 0.05, 1.37, 1.47))
    hair = (d < 0) & (Z >= low) & (head >= -0.003)
    hair &= ~((Y < -0.04) & (Z < 1.52) & (np.abs(X) < 0.125))
    g.put(hair, M_HAIR)
    # пряди: тонкие тёмные линии вдоль валиков
    g.tint(hair & (np.abs(np.sin(X * 140 + Z * 60)) < 0.12) & (d > -0.006), -1)
    return g, d


def make_glasses():
    """Прямоугольные очки со скруглёнными углами, тонкая оправа, двойная перемычка, тёмные стёкла с бликом."""
    g = Grid(VOXEL, **GRID)
    v = g.v
    X, Y, Z = g.X, g.Y, g.Z
    plate_y = -0.137
    slab = np.abs(Y - plate_y) < v * 0.75
    lens_out = np.full(g.mat.shape, np.inf)
    for s in (-1, 1):
        q = (np.abs(X - s * 0.056) - 0.043, np.abs(Z - 1.428) - 0.027)
        dist = np.sqrt(np.maximum(q[0], 0) ** 2 + np.maximum(q[1], 0) ** 2) + np.minimum(np.maximum(*q), 0) - 0.012
        lens_out = np.minimum(lens_out, dist)
    frame = slab & (lens_out < 0) & (lens_out > -v * 1.2)
    lens = slab & (lens_out <= -v * 1.2)
    bridge = slab & (np.abs(X) < 0.02) & ((np.abs(Z - 1.452) < v * 0.6) | (np.abs(Z - 1.438) < v * 0.6))
    temples = (np.abs(np.abs(X) - 0.118) < v * 0.6) & (Y > plate_y) & (Y < 0.02) & (np.abs(Z - 1.448) < v * 0.6)
    hinge = slab & (np.abs(np.abs(X) - 0.11) < 0.008) & (np.abs(Z - 1.448) < v)
    g.put(frame | bridge | temples | hinge, M_FRAME)
    g.put(lens, M_LENS)
    g.shade[lens] = 0
    g.shade[lens & (Z > 1.44)] = -1                                           # сверху стекло темнее
    g.shade[lens & (Z < 1.415)] = 1
    for s in (-1, 1):
        g.shade[lens & (np.abs(X - s * 0.056 + 0.022) < 0.006) & (np.abs(Z - 1.442) < 0.006)] = 4   # блик
    g.tint(frame & (Z > 1.445), +2)                                            # блик на оправе сверху
    return g


# ---------------------------------------------------------------------------
# «Запекание» объёма: свет по ГЛАДКОЙ форме + тени в складках, полосами оттенков
# ---------------------------------------------------------------------------
def _blur(a, r):
    for ax in range(3):
        acc = np.zeros_like(a)
        for k in range(-r, r + 1):
            acc += np.roll(a, k, ax)
        a = acc / (2 * r + 1)
    return a


def bake(g, sdf, scene_solid, strength=1.5, ao_amount=1.6, skip=()):
    gx, gy, gz = np.gradient(sdf.astype(np.float32))
    n = np.stack([gx, gy, gz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
    diffuse = n @ LIGHT
    occ = _blur(scene_solid.astype(np.float32), 2)                       # «зажатость» — складки, щели
    ao = -np.clip((occ - 0.5) * 4.0, 0, 1) * ao_amount
    shade = np.round(diffuse * strength + ao).astype(np.int16)
    m = (g.mat > 0) & ~np.isin(g.mat, skip)
    g.shade[m] += shade[m]


# ---------------------------------------------------------------------------
# Сборка (как в player.py)
# ---------------------------------------------------------------------------
def _object(g, mask, name, palettes, col, pivot):
    gg = copy.copy(g)
    gg.mat = np.where(mask, g.mat, 0)
    used = {m: p for m, p in palettes.items() if (gg.mat == m).any()}
    obj = gg.build_mesh(name, used, col, face_light={"top": 0, "side": 0, "bottom": 0}, edge_light=False,
                        occlusion=False)
    obj.data.transform(Matrix.Translation((-pivot[0], -pivot[1], -pivot[2])))
    obj.location = pivot
    return obj


def build(col, glasses=True, pose="stand", name="PlayerHD"):
    root = bpy.data.objects.new(name, None)
    col.objects.link(root)
    g, group, pal, sd_body = make_body()
    hg, sd_hair = make_hair()
    gl = make_glasses() if glasses else None
    scene = (g.mat > 0) | (hg.mat > 0)
    bake(g, sd_body, scene, skip=(M_EYE,))
    bake(hg, sd_hair, scene, strength=1.8, ao_amount=2.0)
    if gl is not None:
        gl.shade[gl.mat == M_FRAME] += 0
    bset = base.bones("male")
    seg, names = base._assign(g, group, bset)
    parts = {}
    for i, part in enumerate(names):
        mask = (seg == i) & (g.mat > 0)
        if mask.any():
            parts[part] = _object(g, mask, f"{name}_{part}", pal, col, bset[part][0])
    for part, obj in parts.items():
        parent = bset[part][4]
        obj.parent = parts.get(parent) if parent else root
        pp = bset[parent][0] if parent else (0, 0, 0)
        obj.matrix_parent_inverse = Matrix.Translation((-pp[0], -pp[1], -pp[2]))
    hp = bset["head"][0]
    for gg, pl, tag in ((hg, {M_HAIR: HAIR}, "hair"), (gl, {M_FRAME: FRAME, M_LENS: LENS}, "glasses")):
        if gg is None:
            continue
        o = _object(gg, gg.mat > 0, f"{name}_{tag}", pl, col, hp)
        o.parent = parts["head"]
        o.matrix_parent_inverse = Matrix.Translation((-hp[0], -hp[1], -hp[2]))
        parts[tag] = o
    base.set_pose(root, parts, pose)
    print(f"{name}: граней", sum(len(o.data.polygons) for o in parts.values()))
    return root, parts

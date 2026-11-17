"""Вазон с розовым кустом — ВОКСЕЛЬНЫЙ стиль (кубики 2 см). Стоит по краям балюстрады.

Строение (снизу вверх, по референсам Тима):
  постамент — квадратный, две ступени из каменных блоков
  ваза      — круглая: ножка, стебель с колечком, чаша (низ в «дольках»), толстый венец
  куст      — РОЗОВЫЙ КУСТ (референс — роза в вазе с листа ассетов):
              форма «капля» (шире всего на трети высоты, кверху сужается);
              отдельные заострённые листья торчат наружу-вверх, внутри — тёмная глубина;
              крупные розы с лепестками и закрученной серединкой; роза на макушке.

Вазон зеркально симметричен слева-направо (MIRROR_X)."""
import numpy as np

from voxel import Grid, Palette
from parts import balustrade

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.02             # кубик куста и роз
STONE_VOXEL = 0.04       # кубик вазы и постамента — вдвое крупнее (спокойнее, «как стол»)
PEDESTAL_HALF = 0.42     # половина ширины постамента, м
PEDESTAL_TOP = 0.24      # высота постамента, м
URN_RADIUS = 0.36        # радиус чаши, м
LOBES = 16               # «долек» на низе чаши

BUSH_RADIUS = 0.40       # самый широкий радиус куста, м
BUSH_HEIGHT = 0.74       # высота куста над венцом, м (без розы на макушке)
LEAVES = 520            # сколько листьев на поверхности куста
ROSE_RADIUS = 0.075      # радиус розы, м (≈ 13 см в диаметре)
# Розы: (угол вокруг куста в градусах: 270 — спереди, 0 — справа; высота 0…1 по кусту).
# Слева-направо симметрия делается сама, поэтому достаточно задать розы спереди и справа.
ROSES = [
    (270, 0.16), (322, 0.24), (28, 0.18),     # нижний ряд (+ отражения слева = 5 роз)
    (298, 0.48), (42, 0.52),                  # средний ряд (+ отражения = 4)
    (330, 0.74),                              # верхний ряд (+ отражение = 2)
]                                             # и одна роза на макушке
MIRROR_X = True          # симметрия слева-направо
SEED = 7                 # другое число — другой узор листьев

STONE = balustrade.STONE
LEAF = Palette("Leaf", ["#0e1206", "#171f0a", "#222f10", "#2f4016", "#3f531c", "#556b24", "#70852e", "#8fa23a"],
               base=4, roughness=0.85)
LEAF_AUTUMN = Palette("LeafAutumn", ["#4a3a0c", "#6a5212", "#8c6c18", "#b08a22", "#cfa52e"], base=3, roughness=0.85)
ROSE = Palette("Rose", ["#2e0305", "#4f0609", "#74090d", "#9a1012", "#bf1b16", "#d92a1e", "#ee4430", "#ff7a52"],
               base=4, roughness=0.7)
SOIL = Palette("Soil", ["#1e120c", "#2c1c12", "#3a2618", "#4a321f"], base=2, roughness=1.0)
MAT_STONE, MAT_LEAF, MAT_ROSE, MAT_SOIL, MAT_AUTUMN = 1, 2, 3, 4, 5

# Профиль вазы: (радиус, низ, верх) — от верха постамента, в метрах. Высоты кратны 4 см (кубик вазы).
URN = [
    (0.26, 0.00, 0.04),   # ножка
    (0.22, 0.04, 0.08),
    (0.14, 0.08, 0.16),   # стебель
    (0.19, 0.16, 0.20),   # колечко
    (0.26, 0.20, 0.24),   # чаша расширяется
    (0.31, 0.24, 0.32),
    (0.35, 0.32, 0.60),
    (0.33, 0.60, 0.64),   # подрезка под венцом
    (0.39, 0.64, 0.72),   # толстый венец
]
URN_TOP = 0.72
INNER = 0.29             # внутренний радиус (земля внутри)


def add_pedestal(g):
    S = g.square_at
    g.put(S(0, 0, PEDESTAL_HALF, 0.00, 0.12), MAT_STONE)
    g.put(S(0, 0, PEDESTAL_HALF - 0.04, 0.12, 0.20), MAT_STONE)
    g.put(S(0, 0, PEDESTAL_HALF, 0.20, PEDESTAL_TOP), MAT_STONE)


def add_urn(g, z0=PEDESTAL_TOP):
    for r, a, b in URN:
        g.put(g.disk(r, z0 + a, z0 + b), MAT_STONE)
    g.cut(g.disk(INNER, z0 + 0.64, z0 + URN_TOP + 0.04))
    g.put(g.disk(INNER, z0 + 0.60, z0 + 0.68), MAT_SOIL)
    return z0 + URN_TOP


# --- куст -----------------------------------------------------------------------------
def bush_radius(t):
    """Радиус куста на высоте t (0 — у венца, 1 — макушка): форма «капля»."""
    t = np.clip(t, 0.0, 1.0)
    return BUSH_RADIUS * np.sin(np.pi * (0.25 + 0.75 * t)) ** 0.85


def _index(g, x, y, z):
    i = int(np.floor((x - g.origin[0]) / g.v))
    j = int(np.floor((y - g.origin[1]) / g.v))
    k = int(np.floor((z - g.origin[2]) / g.v))
    if 0 <= i < g.nx and 0 <= j < g.ny and 0 <= k < g.nz:
        return i, j, k
    return None


def _set(g, x, y, z, mat, shade=0, overwrite=(0,)):
    ijk = _index(g, x, y, z)
    if ijk and g.mat[ijk] in overwrite:
        g.mat[ijk] = mat
        g.shade[ijk] = shade


def add_bush(g, z_base, rng):
    v = VOXEL
    # Тёмная глубина куста: «капля» чуть меньше внешней формы.
    t = (g.Z - z_base) / BUSH_HEIGHT
    inside = (t >= 0) & (t <= 1) & (g.R < bush_radius(t) * 0.82)
    g.put(inside & (g.mat == 0), MAT_LEAF)
    g.shade[inside & (g.mat == MAT_LEAF)] = -2
    # Листья: заострённые «штрихи» из 3–5 кубиков, торчат наружу и вверх, посередине шире.
    for n in range(LEAVES):
        tt = rng.uniform(0.02, 0.98) ** 0.9
        a = rng.uniform(0, 2 * np.pi)
        r = bush_radius(tt) * rng.uniform(0.78, 0.95)
        x, y, z = r * np.cos(a), r * np.sin(a), z_base + tt * BUSH_HEIGHT
        out = np.array([np.cos(a), np.sin(a), 0.0])
        up = rng.uniform(0.35, 0.9)
        d = out * np.cos(up) + np.array([0, 0, np.sin(up)])
        d /= np.linalg.norm(d)
        side = np.array([-np.sin(a), np.cos(a), 0.0])
        length = int(rng.integers(4, 7))
        roll = rng.random()
        tone = 2 if roll < 0.15 else (1 if roll < 0.45 else (-1 if roll < 0.6 else 0))   # блики и тени листьев
        autumn = rng.random() < 0.025
        mat = MAT_AUTUMN if autumn else MAT_LEAF
        for s in range(length):
            p = np.array([x, y, z]) + d * v * s
            shade = tone + (1 if s == length - 1 else 0)          # кончик листа светлее
            _set(g, *p, mat, shade, overwrite=(0, MAT_LEAF))
            if 0 < s < length - 1:                                # середина листа шире
                for sgn in (-1, 1):
                    _set(g, *(p + side * v * sgn), mat, tone - 1 if sgn < 0 else tone, overwrite=(0,))
    # Стебелёк к розе на макушке.
    top = z_base + BUSH_HEIGHT
    for k in range(4):
        _set(g, 0.0, 0.0, top + k * v, MAT_LEAF, 0, overwrite=(0, MAT_LEAF))
    return top + 4 * v


def add_rose(g, center, normal, radius=ROSE_RADIUS):
    """Роза: «полушарие» из кубиков, смотрит по направлению normal.
    Цвет: край тёмный, к середине светлее; 5 лепестков (тёмные пазы между ними); закрученная серединка."""
    c = np.array(center)
    nrm = np.array(normal, dtype=float)
    nrm /= np.linalg.norm(nrm)
    ref = np.array([0, 0, 1.0]) if abs(nrm[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = np.cross(nrm, ref)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(nrm, e1)
    box = (np.abs(g.X - c[0]) <= radius + g.v) & (np.abs(g.Y - c[1]) <= radius + g.v) & (np.abs(g.Z - c[2]) <= radius + g.v)
    idx = np.argwhere(box)
    for i, j, k in idx:
        p = np.array([g.X[i, j, k], g.Y[i, j, k], g.Z[i, j, k]]) - c
        h = p @ nrm                                   # насколько «вперёд» от центра розы
        q = np.array([p @ e1, p @ e2])
        rr = np.linalg.norm(q)
        # Форма: сплюснутый купол (лепестки раскрыты к зрителю), сзади срезан.
        if h < -radius * 0.25:
            continue
        if (rr / radius) ** 2 + (h / (radius * 0.8)) ** 2 > 1.0:
            # Перед розой и вокруг неё убираем торчащие листья — чтобы роза была видна.
            if rr < radius * 1.25 and h > 0 and g.mat[i, j, k] in (MAT_LEAF, MAT_AUTUMN):
                g.mat[i, j, k] = 0
            continue
        ang = np.arctan2(q[1], q[0])
        shade = 0
        shade += int(round(2.5 * (1 - rr / radius))) - 1            # к середине светлее
        petal = (ang / (2 * np.pi) * 5 + rr / radius * 1.2) % 1.0   # лепестки «закручены»
        if petal < 0.18:
            shade -= 2                                              # паз между лепестками
        elif petal > 0.65:
            shade += 1                                              # край лепестка ловит свет
        if rr < radius * 0.28:
            shade -= 1 if (int(ang * 2) % 2) else 0                 # закрученная серединка
        shade += 1 if p[2] > radius * 0.3 else (-1 if p[2] < -radius * 0.3 else 0)   # верх светлее, низ темнее
        if g.mat[i, j, k] in (0, MAT_LEAF, MAT_AUTUMN):
            g.mat[i, j, k] = MAT_ROSE
            g.shade[i, j, k] = shade


def add_roses(g, z_base, z_top_stem):
    for deg, t in ROSES:
        a = np.radians(deg)
        r = bush_radius(t) * 1.0 + 0.01            # роза сидит на поверхности куста, чуть выступает
        center = (r * np.cos(a), r * np.sin(a), z_base + t * BUSH_HEIGHT)
        normal = (np.cos(a), np.sin(a), 0.45 + 0.4 * t)
        add_rose(g, center, normal)
    add_rose(g, (0.0, 0.0, z_top_stem + ROSE_RADIUS * 0.4), (0.0, -0.35, 1.0), ROSE_RADIUS * 0.9)   # роза на макушке


def decorate(g, z_rim):
    v = VOXEL
    s = g.mat == MAT_STONE
    # Сетка вазы крупная (4 см), поэтому узор тоже крупный и спокойный.
    ped = s & (g.Z < PEDESTAL_TOP)
    g.tint(ped & g.zs(0.12, 0.16), -1)                                  # шов между ступенями
    g.tint(ped & g.zs(0, 0.12) & (g.SI % 5 == 4) & (np.abs(g.Y) > PEDESTAL_HALF - v), -1)
    # «Дольки» на чаше: широкие полосы — светлая и тёмная.
    sector = (g.A + np.pi) / (2 * np.pi) * LOBES
    frac = sector - np.floor(sector)
    lobe_zone = s & g.zs(PEDESTAL_TOP + 0.20, PEDESTAL_TOP + 0.44) & (g.R > 0.2)
    g.tint(lobe_zone & (frac < 0.25), -1)
    g.tint(lobe_zone & (frac > 0.5) & (frac < 0.75), +1)
    g.tint(s & (g.Z > z_rim - 0.08), +1)                                # венец светлее
    g.tint(s & (g.Z < 0.04), -1)
    g.noise(MAT_STONE, 0.07, 0.05, seed=41)


def mirror_x(g):
    """Левая половина = зеркальное отражение правой (форма и цвет). Розы задаются справа и спереди."""
    h = g.nx // 2
    g.mat[:h] = g.mat[g.nx - h:][::-1]
    g.shade[:h] = g.shade[g.nx - h:][::-1]


def make_grids(seed=SEED):
    """Две сетки: ваза с постаментом (крупные кубики 4 см) и куст с розами (кубики 2 см)."""
    rng = np.random.default_rng(seed)
    stone = Grid(STONE_VOXEL, size_xy=2 * PEDESTAL_HALF + 0.08, height=PEDESTAL_TOP + URN_TOP + 0.04)
    add_pedestal(stone)
    z_rim = add_urn(stone)
    decorate(stone, z_rim)
    bush = Grid(VOXEL, size_xy=2 * (BUSH_RADIUS + 0.14), height=BUSH_HEIGHT + 0.36, origin_z=z_rim - 0.08)
    z_base = z_rim - 0.04
    stem_top = add_bush(bush, z_base, rng)
    add_roses(bush, z_base, stem_top)
    bush.cut((bush.Z < z_rim) & (bush.R < 0.40))       # куст начинается на земле внутри вазы, не в камне
    for g in (stone, bush):
        if MIRROR_X:
            mirror_x(g)
    return stone, bush


def build(col, seed=SEED):
    stone, bush = make_grids(seed)
    vase = stone.build_mesh("Urn_Vase", {MAT_STONE: STONE, MAT_SOIL: SOIL}, col)
    plant = bush.build_mesh("Urn_RoseBush", {MAT_LEAF: LEAF, MAT_ROSE: ROSE, MAT_AUTUMN: LEAF_AUTUMN}, col)
    print("Urn faces: vase", len(vase.data.polygons), "bush", len(plant.data.polygons))
    return [vase, plant]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=12, azimuth=0, fill=0.72)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=8, azimuth=0, fill=0.72)
    style_preview.render(objects, path[:-4] + "_side.png", "studio", elevation=18, azimuth=35, fill=0.72)

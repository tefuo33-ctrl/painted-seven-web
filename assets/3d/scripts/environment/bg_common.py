# bg_common — инструменты для ФОНА (вид с террасы на море).
#
# Главная идея: чем дальше предмет, тем КРУПНЕЕ его кубики. Тогда на экране все «пиксели»
# примерно одного размера (как у стола и вазона), а граней мало — фон лёгкий для веба.
#   дома, дворец, деревья  — 1 м      (≈ 300–600 м от террасы)
#   склон горы с городом   — 2 м
#   замок и мыс слева      — 1.5 м    (≈ 650 м)
#   хребет слева           — 4 м      (≈ 1200 м)
#   дальние горы           — 10–12 м  (2–3 км)
#
# Мир: терраса — пол на высоте 0, балюстрада по линии y = 0, смотрим вдоль +Y (на море).
# Уровень моря — SEA_Z (терраса на скале над морем).

import math

import bpy
import numpy as np

from voxel import Grid, Palette

SEA_Z = -30.0

# Тим: «свет заката — ещё в малиновый, на 10–20 %, даже больше, чем на картинке».
# 0 — цвета ровно как на картинке; 0.15 — на 15 % малиновее, 0.25 — на 25 %. Действует на небо, облака, воду, края солнечной
# дорожки и цвет солнечного света / неба-подсветки. Сам диск солнца и жёлтая середина дорожки не меняются.
RASPBERRY = 0.25         # было 0.15 — Тим: «ещё малиновее»


def raspberry(rgb, k=None):
    """Сдвиг цвета в малиновый: меньше зелёного, чуть больше синего (оранжевое → красное, фиолетовое → малиновое).
    rgb — список/массив значений 0…1 (последняя ось — R, G, B)."""
    k = RASPBERRY if k is None else k
    a = np.asarray(rgb, dtype=float)
    out = a * np.array([1.0, 1.0 - k, 1.0 + 0.5 * k])
    return np.clip(out, 0.0, 1.0)

# ---------------------------------------------------------------------------
# Палитры фона (от тёмного к светлому). Цвета — с картинки Тима, без закатной подсветки:
# закат добавит свет игры.
# ---------------------------------------------------------------------------
PAL = {
    "wall": Palette("BgWall", ["#5e4e4a", "#7e6c64", "#a08c80", "#c0ab9c", "#d8c6b6", "#e8dacb", "#f4ebe0"], base=4),
    "wall_warm": Palette("BgWallWarm", ["#5e4a3e", "#7e6450", "#a08268", "#c09e80", "#d8b898", "#e8ccae"], base=4),
    "roof": Palette("BgRoof", ["#3a120a", "#561c10", "#742814", "#92361c", "#ac4626", "#c25a32", "#d47040"], base=3),
    "window": Palette("BgWindow", ["#a04c14", "#c86a20", "#e88c30", "#ffb04a", "#ffcf78"], base=3,
                      roughness=0.4, emission="#ffa040", emission_strength=3.0),
    "door": Palette("BgDoor", ["#20140e", "#301e14", "#42291a", "#563622"], base=1),
    "dome": Palette("BgDome", ["#1a1a34", "#262848", "#33365c", "#424770", "#545a84", "#6a7298"], base=3, roughness=0.5),
    "gold": Palette("BgGold", ["#5a3a10", "#8a5c18", "#b88224", "#dcaa3c"], base=2, roughness=0.4, metallic=0.4),
    "rock": Palette("BgRock", ["#2e1c20", "#44282c", "#5c3836", "#764842", "#8e5a50", "#a66c5e", "#be826e"], base=3, roughness=0.95),
    "grass": Palette("BgGrass", ["#2c3a18", "#3a4a1e", "#4a5c26", "#5a6e2e", "#6c8238", "#7e9642", "#92aa4e"], base=2, roughness=0.95),
    "sand": Palette("BgSand", ["#6a5240", "#846a54", "#9e846a", "#b49c80"], base=2, roughness=1.0),
    "cypress": Palette("BgCypress", ["#121c10", "#1a2816", "#24361c", "#2e4424", "#3a542c", "#48663a"], base=2, roughness=0.95),
    "tree": Palette("BgTree", ["#1e2a12", "#2a3a18", "#384c20", "#486028", "#587432", "#6c8a3c", "#82a048"], base=3, roughness=0.95),
    "bark": Palette("BgBark", ["#20140e", "#2e1e14", "#3e2a1c"], base=1),
    "castle": Palette("BgCastle", ["#3e3432", "#564844", "#6e5e58", "#86746c", "#9e8a80", "#b6a294"], base=4),
    # Холмы и дальние горы: фиолетовые (дымка заката), как на картинке Тима.
    "hill": Palette("BgHill", ["#5a3654", "#683e60", "#76486c", "#845276", "#925c80", "#a0688a"], base=2, roughness=0.95),
    "hill_green": Palette("BgHillGreen", ["#3a3040", "#46384a", "#544256", "#624c60", "#70566a"], base=2, roughness=0.95),
    "far": Palette("BgFar", ["#2a1426", "#321a2e", "#3a2036", "#42263e", "#4a2c46"], base=1, roughness=1.0, emission="#5a2e4e", emission_strength=1.0),
    "far2": Palette("BgFar2", ["#32182c", "#3a1e34", "#42243c", "#4a2a44", "#52304c"], base=1, roughness=1.0, emission="#6a3a58", emission_strength=1.0),
}


# ---------------------------------------------------------------------------
# Шум (плавные случайные холмы)
# ---------------------------------------------------------------------------
def _hash(ix, iy, seed):
    v = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
    return v - np.floor(v)


def noise2(x, y, scale, seed=0):
    sx, sy = np.asarray(x) / scale, np.asarray(y) / scale
    ix, iy = np.floor(sx), np.floor(sy)
    fx, fy = sx - ix, sy - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def fbm(x, y, scale, seed=0, octaves=3):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total = total + noise2(x, y, scale / 2 ** o, seed + o * 17) * amp
        norm += amp
        amp *= 0.5
    return total / norm


# ---------------------------------------------------------------------------
# Рельеф из столбиков кубиков (как в Minecraft): верх — трава/песок, бока — скала со слоями
# ---------------------------------------------------------------------------
MAT_ROCK, MAT_GRASS, MAT_SAND = 1, 2, 3


def _edge_fade(x, y, size_x, size_y, sides):
    """1 внутри участка, плавно к 0 у тех краёв, которые видно из камеры (sides)."""
    e = np.ones_like(np.asarray(x, dtype=float))
    fx, fy = 0.12 * size_x, 0.12 * size_y
    if "left" in sides:
        e = np.minimum(e, (x + size_x / 2) / fx)
    if "right" in sides:
        e = np.minimum(e, (size_x / 2 - x) / fx)
    if "front" in sides:
        e = np.minimum(e, (y + size_y / 2) / fy)
    if "back" in sides:
        e = np.minimum(e, (size_y / 2 - y) / fy)
    return np.clip(e, 0, 1) ** 0.7


def _dilate(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:] |= out[:-1]
        o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


FOAM = Palette("BgFoam", ["#9a8cb4", "#b8aacc", "#d4c8e0", "#ece2f2", "#fbf4fa"], base=3, roughness=0.6,
               emission="#ffd0c0", emission_strength=0.35)


def build_terrain(name, col, voxel, size_x, size_y, z_top, height_fn, location,
                  rock="rock", grass="grass", sand="sand", seed=0, grass_slope=1.1, haze=0,
                  fade=("left", "right", "front", "back"), shore=True, flat=False):
    """height_fn(x, y) -> высота поверхности (мировая Z) в ЛОКАЛЬНЫХ координатах участка.
    location — где центр участка в мире. fade — какие края плавно уходят под воду (видимые из камеры).
    shore — у берега камушки из воды и пена прибоя (отдельный объект).
    Возвращает (рельеф, функция высоты в мировых координатах, пена или None)."""
    z_bottom = SEA_Z - 2 * voxel
    g = Grid(voxel, size_x, z_top - z_bottom, origin_z=z_bottom, size_y=size_y)
    X2, Y2 = g.X[:, :, 0], g.Y[:, :, 0]
    H = height_fn(X2, Y2)
    H = (SEA_Z - 4) + (H - (SEA_Z - 4)) * _edge_fade(X2, Y2, size_x, size_y, fade)
    rng = np.random.default_rng(seed + 50)
    foam_cells = None
    if shore:
        land2 = H >= SEA_Z
        near1 = ~land2 & _dilate(land2, 1)
        near2 = ~land2 & _dilate(land2, 2) & ~near1
        # Камушки: торчат из воды у самого берега (1–2 кубика над водой).
        rocks = near1 & (rng.random(H.shape) < 0.22) | near2 & (rng.random(H.shape) < 0.06)
        H = np.where(rocks, SEA_Z + voxel * np.where(rng.random(H.shape) < 0.3, 1.6, 0.6), H)
        land3 = H >= SEA_Z
        # Пена прибоя: полоса у берега и вокруг камней, с разрывами.
        f1 = ~land3 & _dilate(land3, 1) & (rng.random(H.shape) < 0.75)
        f2 = ~land3 & _dilate(land3, 2) & ~_dilate(land3, 1) & (rng.random(H.shape) < 0.3)
        foam_cells = (f1, f2)
    Hq = H[:, :, None]
    solid = g.Z < Hq
    g.put(solid, MAT_ROCK)
    gx, gy = np.gradient(H, voxel)
    slope = np.hypot(gx, gy)[:, :, None]
    top = solid & (g.Z >= Hq - voxel)
    land = Hq >= SEA_Z + 2.5
    g.put(top & ~land, MAT_SAND)
    if shore:
        g.put(solid & rocks[:, :, None], MAT_ROCK)          # камушки в воде — скала, не песок
    g.put(top & land & (slope < grass_slope), MAT_GRASS)
    g.put(solid & (g.Z >= Hq - 2 * voxel) & land & (slope < grass_slope * 0.6), MAT_GRASS)
    # Рисунок: слои скалы, пятна травы, у воды темнее.
    if rock not in ("hill", "far", "far2"):              # у далёких гор слоёв не видно — гладко
        g.tint((g.mat == MAT_ROCK) & (g.K % 3 == 0), -1)
    g.tint((g.mat == MAT_ROCK) & (g.Z < SEA_Z + 3 * voxel), -1)
    if rock not in ("far", "far2"):
        g.noise(MAT_ROCK, 0.14, 0.10, seed=seed + 1, blot=2)
    if not flat:
        g.noise(MAT_GRASS, 0.22, 0.14, seed=seed + 2, blot=2)
    if haze:
        g.shade += haze
    shading = dict(face_light={"top": 0, "side": 0, "bottom": 0}, edge_light=False, occlusion=False) if flat else {}
    obj = g.build_mesh(name, {MAT_ROCK: PAL[rock], MAT_GRASS: PAL[grass], MAT_SAND: PAL[sand]}, col, **shading)
    obj.location = location
    if flat:
        obj.visible_shadow = False       # далёкие горы: ступеньки не отбрасывают тени друг на друга
    lx, ly = location[0], location[1]

    def world_height(x, y):
        x, y = np.asarray(x) - lx, np.asarray(y) - ly
        return (SEA_Z - 4) + (height_fn(x, y) - (SEA_Z - 4)) * _edge_fade(x, y, size_x, size_y, fade)

    foam = None
    if foam_cells is not None:
        foam = _foam_mesh(name + "_Foam", col, X2, Y2, voxel, foam_cells, location)
    return obj, world_height, foam


def _foam_mesh(name, col, X2, Y2, voxel, cells, location):
    """Пена: плоские пиксели чуть над водой (ряды склеены в полоски)."""
    from voxel import hex_srgb, voxel_material
    f1, f2 = cells
    verts, faces, cols = [], [], []
    z = SEA_Z + 0.08
    for cells_, tone in ((f1, 3), (f2, 2)):
        for i, j in np.argwhere(cells_):
            x, y = X2[i, j], Y2[i, j]
            h = voxel / 2
            b = len(verts)
            verts += [(x - h, y - h, z), (x + h, y - h, z), (x + h, y + h, z), (x - h, y + h, z)]
            faces.append((b, b + 1, b + 2, b + 3))
            cols.append(hex_srgb(FOAM.colors[tone]) + [1.0])
    if not faces:
        return None
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    a = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    a.data.foreach_set("color_srgb", [c for cc in cols for c in cc * 4])
    me.materials.append(voxel_material(FOAM))
    obj = bpy.data.objects.new(name, me)
    obj.location = location
    col.objects.link(obj)
    return obj


def build_card(name, col, voxel, x0, x1, y, top_fn, palette, rim=1, base_shade=0):
    """Дальний план — плоский пиксельный СИЛУЭТ (кулиса), как на картинке: вершина ступеньками-пикселями,
    цвет ровный (дымка), светлая кромка по верху. top_fn(X) -> высота вершины (мировая Z) для мировой X.
    Стоит вертикально на расстоянии y и смотрит на зрителя."""
    cx = (x0 + x1) / 2
    xs = np.linspace(x0, x1, 400)
    zmax = float(np.max(top_fn(xs)))
    g = Grid(voxel, x1 - x0, zmax - SEA_Z + 2 * voxel, origin_z=SEA_Z - voxel, size_y=2 * voxel)
    top = top_fn(g.X[:, 0, 0] + cx)[:, None, None]
    m = (g.Z < top) & (g.Z > SEA_Z - voxel) & (np.abs(g.Y) < voxel * 0.6)
    g.put(m, 1)
    g.shade[:] = base_shade
    g.tint(m & (g.Z >= top - rim * voxel), +1)               # светлая кромка по верху
    g.tint(m & (g.Z < SEA_Z + (top - SEA_Z) * 0.35), -1)     # к подножию темнее
    obj = g.build_mesh(name, {1: PAL[palette]}, col, face_light={"top": 0, "side": 0, "bottom": 0},
                       edge_light=False, occlusion=False)
    obj.location = (cx, y, 0.0)
    obj.visible_shadow = False
    return obj


def ground_under(height_world, x, y, half_w, half_d):
    """Самая высокая точка земли под прямоугольником (чтобы дом стоял, а не висел)."""
    xs = np.linspace(x - half_w, x + half_w, 5)
    ys = np.linspace(y - half_d, y + half_d, 5)
    XX, YY = np.meshgrid(xs, ys)
    return float(np.max(height_world(XX, YY)))


# ---------------------------------------------------------------------------
# Копии моделей: одна сетка — много объектов (в .glb модель хранится один раз)
# ---------------------------------------------------------------------------
class Library:
    def __init__(self, col):
        self.col = col
        self.src = {}
        self.used = {}

    def add(self, key, obj):
        self.src[key] = obj
        self.used[key] = False

    def place(self, key, loc, rot_k=0, name=None):
        src = self.src[key]
        if not self.used[key]:
            o = src
            self.used[key] = True
        else:
            o = src.copy()
            self.col.objects.link(o)
        o.location = loc
        o.rotation_euler = (0.0, 0.0, rot_k * math.pi / 2)
        if name:
            o.name = name
        return o

    def drop_unused(self):
        for key, used in self.used.items():
            if not used:
                bpy.data.objects.remove(self.src[key])

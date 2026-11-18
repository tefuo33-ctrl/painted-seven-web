"""Пол террасы — ВОКСЕЛЬНЫЙ стиль: крупные полированные каменные плиты (как на картинках Тима).

ПОЛ РОВНЫЙ: верх ровно на высоте z = 0, без выступов — на него ставятся стол, стулья, игроки.
Плиты 56 см (= две балясины): швы попадают точно между балясинами. Шов — тёмная линия в 1 кубик
(не канавка, пол остаётся ровным), на пересечениях швов — щербинки. У каждой плиты свой оттенок,
на части плит — светлые «мраморные» прожилки. Камень полированный: блестит и отражает свет
(в Blender — отражения; в игре нужен блестящий материал/отражения).

Кубики 4 см — как у колонны. Число кубиков нечётное, поэтому швы стоят ровно по линиям через центр —
пол симметричен. Начало координат — центр пола на высоте 0; в сцене пол сдвинут так, что ряд швов
проходит по передней кромке балюстрады."""
import numpy as np

from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.04
TILE = 0.56              # сторона плиты, м (две балясины)
SIZE = (11.24, 9.56)     # размер пола, м (нечётное число кубиков: 281 × 239)
THICK = 0.08             # толщина, м (2 кубика)
VEINS = 0.35             # у какой доли плит есть прожилки
CHIPS = 0.35             # как часто щербинки на пересечениях швов
SEED = 6

# Полированный тёплый камень (чуть глубже по цвету, чем балюстрада, — пол в тени перил).
FLOOR = Palette("FloorStone", ["#4a2c28", "#6a4238", "#8a5a4a", "#a8735f", "#c28c76", "#d6a48c", "#e6bca4",
                               "#f2d2bc"], base=4, roughness=0.08)    # полированный: чёткие отражения
MAT_FLOOR = 1


def make_grid(size=SIZE, seed=SEED):
    rng = np.random.default_rng(seed)
    v = VOXEL
    g = Grid(v, size_xy=size[0], size_y=size[1], height=THICK, origin_z=-THICK)
    g.put(np.ones(g.mat.shape, dtype=bool), MAT_FLOOR)
    # Где швы: кубик, центр которого на линии кратной TILE (линии идут через центр пола).
    fx, fy = g.X / TILE, g.Y / TILE
    jx = np.abs(fx - np.round(fx)) * TILE < v / 2
    jy = np.abs(fy - np.round(fy)) * TILE < v / 2
    joint = jx | jy
    cross = jx & jy
    # Номер плиты и её оттенок.
    ti = np.floor(fx).astype(int)
    tj = np.floor(fy).astype(int)
    nti, ntj = ti - ti.min(), tj - tj.min()
    tones = rng.choice([-1, 0, 0, 0, 1], size=(nti.max() + 1, ntj.max() + 1))
    g.shade += np.where(joint, 0, tones[nti, ntj])
    # Пиксельная «фаска»: у шва с одной стороны плита светлее, с другой — темнее (камень чуть скруглён).
    lx = (g.X - np.floor(fx) * TILE) / v                   # номер кубика внутри плиты
    ly = (g.Y - np.floor(fy) * TILE) / v
    n = int(round(TILE / v))
    g.tint(~joint & ((np.round(ly - 0.5) == n - 1) | (np.round(lx - 0.5) == 1)), +1)
    # Прожилки: светлая диагональная линия через плиту (у части плит).
    vein = rng.random((nti.max() + 1, ntj.max() + 1)) < VEINS
    slope = rng.choice([-1, 1], size=vein.shape) * rng.uniform(0.4, 1.6, size=vein.shape)
    off = rng.uniform(2, n - 2, size=vein.shape)
    line = np.abs((lx - n / 2) * slope[nti, ntj] + n / 2 - ly - (off[nti, ntj] - n / 2)) < 0.6
    a0 = rng.uniform(1, 6, size=vein.shape)            # прожилка — не через всю плиту, а куском
    a1 = a0 + rng.uniform(4, 8, size=vein.shape)
    part = (lx >= a0[nti, ntj]) & (lx <= a1[nti, ntj])
    g.tint(~joint & vein[nti, ntj] & line & part, +1)
    # Швы и щербинки на пересечениях.
    g.tint(joint, -2)
    g.tint(cross, -1)
    near_cross = (np.abs(fx - np.round(fx)) * TILE < 1.5 * v) & (np.abs(fy - np.round(fy)) * TILE < 1.5 * v)
    g.tint(near_cross & ~joint & (rng.random(g.mat.shape) < CHIPS), -2)
    # Немного пятен камня.
    g.noise(MAT_FLOOR, 0.02, 0.015, seed=seed + 1, blot=2)
    return g


def build(col, size=SIZE, seed=SEED):
    g = make_grid(size, seed)
    obj = g.build_mesh("Floor", {MAT_FLOOR: FLOOR}, col, face_light={"top": 0, "side": -1, "bottom": -2})
    print("Floor faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", size=(1400, 900), elevation=35, azimuth=20, fill=1.6)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", size=(1400, 900), elevation=20, azimuth=0,
                         fill=1.6)

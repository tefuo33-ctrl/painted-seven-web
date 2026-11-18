"""Здания фона: средиземноморские домики (5 видов), дворец с куполом, замочек слева.

Кубик 1 м (дома, дворец) и 1.5 м (замок — он дальше). Окна — отдельный светящийся материал
Vox_BgWindow: в игре днём его можно «погасить», вечером — зажечь.
Начало координат каждого здания — середина низа фасада на уровне земли; ниже есть фундамент
(4 м), чтобы на склоне дом не висел в воздухе."""
import numpy as np

from bg_common import PAL
from voxel import Grid

MAT_WALL, MAT_ROOF, MAT_WINDOW, MAT_DOOR, MAT_DOME, MAT_GOLD, MAT_STONE, MAT_WALL2 = 1, 2, 3, 4, 5, 6, 7, 8
PALETTES = {MAT_WALL: PAL["wall"], MAT_ROOF: PAL["roof"], MAT_WINDOW: PAL["window"], MAT_DOOR: PAL["door"],
            MAT_DOME: PAL["dome"], MAT_GOLD: PAL["gold"], MAT_STONE: PAL["castle"], MAT_WALL2: PAL["wall_warm"]}

# Виды домиков: ширина, глубина (м), этажей, тёплая ли стена, труба, балкон.
HOUSES = {
    "house_a": dict(w=8, d=7, floors=2, warm=False, chimney=True, balcony=False),
    "house_b": dict(w=10, d=8, floors=3, warm=True, chimney=False, balcony=True),
    "house_c": dict(w=6, d=6, floors=2, warm=False, chimney=False, balcony=False),
    "house_d": dict(w=12, d=8, floors=2, warm=False, chimney=True, balcony=True),
    "house_e": dict(w=8, d=9, floors=3, warm=True, chimney=False, balcony=False),
}
FOUNDATION = 8.0       # глубокий фундамент: на склоне дом не висит

PREVIEW_VIEW = (0.6, -1.4, 0.5)


def hip_roof(g, hw, hd, z, mat=MAT_ROOF, step=2):
    """Пологая четырёхскатная крыша ступеньками: свес 1 кубик, каждый слой уже на step кубиков."""
    s = 0
    while True:
        hx, hy = hw + 1 - step * s, hd + 1 - step * s
        if hx <= 0.6 or hy <= 0.6:
            break
        g.put(g.box(-hx, hx, -hy, hy, z + s, z + s + 1), mat)
        s += 1
    return z + s


def house_grid(w, d, floors, warm=False, chimney=False, balcony=False):
    v = 1.0
    H = floors * 3
    g = Grid(v, size_xy=w + 4, size_y=d + 4, height=FOUNDATION + H + max(w, d) / 4 + 4, origin_z=-FOUNDATION)
    hw, hd = w / 2, d / 2
    wall = MAT_WALL2 if warm else MAT_WALL
    g.put(g.box(-hw, hw, -hd, hd, -FOUNDATION, H), wall)
    # Окна: по одному кубику в середине каждого этажа, через один кубик; дверь внизу спереди.
    rows = np.zeros(g.mat.shape, dtype=bool)
    for f in range(floors):
        rows |= g.zs(f * 3 + 1, f * 3 + 2)
    front_back = (np.abs(g.Y) > hd - 1) & (np.abs(g.X) < hw - 1) & (g.SI % 2 == 1)
    sides = (np.abs(g.X) > hw - 1) & (np.abs(g.Y) < hd - 1) & (g.SJ % 2 == 1)
    g.put((front_back | sides) & rows & (g.mat == wall), MAT_WINDOW)
    g.put((g.Y < -hd + 1) & (np.abs(g.X) < 1) & g.zs(0, 2) & (g.mat > 0), MAT_DOOR)
    if balcony:  # балкончик на втором этаже спереди
        g.put(g.box(-2, 2, -hd - 1, -hd, 3, 4), wall)
    # Карниз и крыша.
    top = hip_roof(g, hw, hd, H)
    if chimney:
        g.put(g.box(hw - 3, hw - 2, -1, 0, H, top + 1), wall)
    return g


def decorate_house(g):
    # Черепица рядами, фундамент темнее, лёгкие пятна штукатурки.
    g.tint((g.mat == MAT_ROOF) & (g.K % 2 == 0), -1)
    g.tint(((g.mat == MAT_WALL) | (g.mat == MAT_WALL2)) & (g.Z < 0.5), -1)
    g.noise(MAT_WALL, 0.08, 0.06, seed=3)
    g.noise(MAT_WALL2, 0.08, 0.06, seed=4)
    g.noise(MAT_ROOF, 0.12, 0.08, seed=5)


def make_house(name, col, **kw):
    g = house_grid(**kw)
    decorate_house(g)
    return g.build_mesh(name, PALETTES, col)


# --- Дворец ---------------------------------------------------------------------------
PALACE_W, PALACE_D = 30, 20   # главный корпус, м
PALACE_FOUNDATION = 18.0     # дворец на крутом склоне — глубокий фундамент-терраса


def palace_grid(foundation=None):
    """Дворец: терраса-платформа, главный корпус в 3 этажа с рядами окон, портик с колоннами,
    крылья пониже, барабан с окнами, большой сине-серый купол с рёбрами, фонарик и шпиль."""
    fnd = PALACE_FOUNDATION if foundation is None else foundation
    g = Grid(1.0, size_xy=56, size_y=40, height=fnd + 46, origin_z=-fnd)
    hw, hd = PALACE_W / 2, PALACE_D / 2
    S = MAT_WALL
    g.put(g.box(-26, 26, -16, 14, -fnd, 2), MAT_WALL2)                        # платформа-терраса (подпорная стена)
    g.put(g.box(-hw, hw, -hd, hd, 2, 15), S)                                  # главный корпус
    g.put(g.box(-hw - 1, hw + 1, -hd - 1, hd + 1, 15, 16), S)                 # карниз
    g.put(g.box(-hw, hw, -hd, hd, 16, 17), S)
    for side in (-1, 1):                                                      # крылья
        x0, x1 = sorted((side * hw, side * (hw + 10)))
        g.put(g.box(x0, x1, -hd + 2, hd - 2, 2, 11), S)
        g.put(g.box(x0 - (1 if side < 0 else 0), x1 + (1 if side > 0 else 0), -hd + 1, hd - 1, 11, 12), S)
    # Окна: ряды по этажам, через два кубика.
    rows = g.zs(4, 6) | g.zs(8, 10) | g.zs(12, 13)
    facade = ((np.abs(g.Y) > hd - 1) & (np.abs(g.X) < hw - 1)) | ((np.abs(g.Y) > hd - 3) & (np.abs(g.X) > hw) & (np.abs(g.X) < hw + 9))
    g.put(facade & rows & (g.SI % 3 == 1) & (g.mat == S), MAT_WINDOW)
    # Портик: колонны спереди посередине, над ними фронтон ступеньками.
    for x in range(-6, 7, 3):
        g.put(g.box(x - 0.5, x + 0.5, -hd - 3, -hd - 2, 2, 12), S)
    g.put(g.box(-8, 8, -hd - 3, -hd, 12, 13), S)
    for s in range(3):
        g.put(g.box(-7 + 2 * s, 7 - 2 * s, -hd - 3, -hd - 1, 13 + s, 14 + s), S)
    # Барабан с окнами, купол, фонарик, шпиль.
    g.put(g.disk(8, 17, 19), S)
    g.put(g.disk(7, 19, 24), S)
    drum_win = (g.R > 6) & g.zs(20, 22) & (((g.A + np.pi) / (2 * np.pi) * 16) % 1 < 0.35)
    g.put(drum_win & (g.mat == S), MAT_WINDOW)
    g.put(g.disk(8, 24, 25), S)
    dome = ((g.R ** 2 + (g.Z - 25) ** 2) < 7.6 ** 2) & (g.Z >= 25)
    g.put(dome, MAT_DOME)
    g.put(g.disk(2.2, 32, 35), S)
    g.put((g.R < 1.6) & g.zs(33, 34) & (g.mat == S) & (g.R > 1.0), MAT_WINDOW)
    small = ((g.R ** 2 + (g.Z - 35) ** 2) < 2.4 ** 2) & (g.Z >= 35)
    g.put(small, MAT_DOME)
    g.put((g.R < 0.8) & g.zs(37, 41), MAT_GOLD)
    g.put((np.abs(g.X) < 1.6) & (np.abs(g.Y) < 0.8) & g.zs(39, 40), MAT_GOLD)  # крестик
    return g


def decorate_palace(g):
    # Рёбра купола — светлые полосы; карнизы светлее; платформа темнее.
    sector = ((g.A + np.pi) / (2 * np.pi) * 12) % 1
    g.tint((g.mat == MAT_DOME) & (sector < 0.18), +1)
    g.tint((g.mat == MAT_DOME) & (g.Z > 30), +1)
    g.tint((g.mat == MAT_WALL) & (g.zs(15, 16) | g.zs(11, 12) | g.zs(24, 25)), +1)
    g.tint((g.mat == MAT_WALL2) & (g.K % 2 == 0), -1)
    g.noise(MAT_WALL, 0.06, 0.05, seed=6)


def make_palace(name, col, foundation=None):
    g = palace_grid(foundation)
    decorate_palace(g)
    return g.build_mesh(name, PALETTES, col)


# --- Замочек слева --------------------------------------------------------------------
def castle_grid():
    """Квадратная башня с зубцами, вторая башня пониже, стена с зубцами, дом с красной крышей."""
    v = 1.5
    g = Grid(v, size_xy=36, size_y=24, height=FOUNDATION * 2 + 30, origin_z=-FOUNDATION * 2)
    S = MAT_STONE

    def tower(cx, cy, half, h):
        g.put(g.square_at(cx, cy, half, -FOUNDATION * 2, h), S)
        rim = g.square_at(cx, cy, half, h, h + v) & ~g.square_at(cx, cy, half - v, h, h + v)
        g.put(rim & ((g.SI + g.SJ) % 2 == 0), S)                                    # зубцы
        win = (np.abs(g.Y - cy) > half - v) & (np.abs(g.X - cx) < v) & (g.zs(h * 0.45, h * 0.45 + v) | g.zs(h * 0.75, h * 0.75 + v))
        g.put(win & (g.mat == S), MAT_WINDOW)

    tower(-9, 0, 4.5, 22.5)                     # главная башня
    tower(10.5, 3, 3.0, 15)                     # вторая башня
    g.put(g.box(-6, 9, -1.5, 1.5, -FOUNDATION * 2, 9), S)                           # стена
    g.put(g.box(-6, 9, -1.5, 1.5, 9, 10.5) & (g.SI % 2 == 0), S)
    # Дом за стеной с красной крышей и окнами.
    g.put(g.box(-3, 7.5, 1.5, 9, -FOUNDATION * 2, 7.5), MAT_WALL2)
    g.put(g.box(-3, 7.5, 1.5, 9, 7.5, 9), MAT_ROOF)
    g.put(g.box(-1.5, 6, 3, 7.5, 9, 10.5), MAT_ROOF)
    g.put((g.Y < 3) & (g.Y > 1.4) & g.zs(3, 4.5) & (g.SI % 2 == 0) & (g.mat == MAT_WALL2) & (g.X > -2) & (g.X < 7), MAT_WINDOW)
    return g


def make_castle(name, col):
    g = castle_grid()
    g.tint((g.mat == MAT_STONE) & (g.K % 3 == 0), -1)
    g.noise(MAT_STONE, 0.14, 0.08, seed=8)
    return g.build_mesh(name, PALETTES, col)


def build(col):
    """Превью-набор: все виды домиков, дворец и замок рядом."""
    objs = []
    x = -40.0
    for key, kw in HOUSES.items():
        o = make_house(key, col, **kw)
        o.location = (x, 0, 0)
        x += kw["w"] + 5
        objs.append(o)
    p = make_palace("palace", col)
    p.location = (x + 30, 10, 0)
    c = make_castle("castle", col)
    c.location = (x + 85, 10, 0)
    objs += [p, c]
    for o in objs:
        print(o.name, "faces", len(o.data.polygons))
    return objs


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=18, azimuth=20, fill=1.1, size=(1600, 640))
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=10, azimuth=0, fill=1.1, size=(1600, 640))

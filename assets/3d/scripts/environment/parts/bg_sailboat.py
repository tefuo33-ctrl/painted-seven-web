"""Парусник — ОТДЕЛЬНЫЙ элемент: в игре он плавает по своей траектории.
Тёмный деревянный корпус с белой полосой, мачта, грот (большой парус) и стаксель (передний).
Кубик 0.25 м. Начало координат — середина корпуса на уровне воды; нос смотрит в +X."""
import numpy as np

from voxel import Grid, Palette

VOXEL = 0.25
LENGTH = 10.0       # длина корпуса, м
BEAM = 3.0          # ширина, м
MAST = 12.0         # высота мачты над палубой, м

HULL = Palette("BoatHull", ["#1e120c", "#2c1a10", "#3c2416", "#4e301e", "#623e26"], base=2, roughness=0.6)
STRIPE = Palette("BoatStripe", ["#a8988a", "#c8b8a8", "#e2d4c4", "#f2e8dc"], base=2)
SAIL = Palette("BoatSail", ["#a89a88", "#c4b6a2", "#ddd0bc", "#ece2d0", "#f8f0e2"], base=3, roughness=0.9)
MASTW = Palette("BoatMast", ["#2a1c12", "#3e2a1a", "#523822"], base=1)
FLAG = Palette("BoatFlag", ["#6a1010", "#9a1a16", "#c42a1e"], base=1)
MAT_HULL, MAT_STRIPE, MAT_SAIL, MAT_MAST, MAT_FLAG = 1, 2, 3, 4, 5

PREVIEW_VIEW = (0.3, -1.5, 0.4)


def make_grid():
    g = Grid(VOXEL, size_xy=LENGTH + 2, size_y=BEAM + 1, height=MAST + 4, origin_z=-1.0)
    half = LENGTH / 2
    # Корпус: ширина сужается к носу (+X) и чуть к корме, дно уже палубы.
    u = np.clip(g.X / half, -1, 1)
    beam = BEAM / 2 * np.where(u > 0, np.sqrt(np.clip(1 - u ** 2.2, 0, 1)), np.sqrt(np.clip(1 - (u * 0.9) ** 4, 0, 1)))
    depth = (g.Z + 0.9) / 2.2                                         # 0 у киля … 1 у палубы
    width_here = beam * np.clip(0.45 + 0.55 * depth, 0, 1)
    hull = (np.abs(g.Y) < width_here) & g.zs(-0.9, 1.3) & (np.abs(g.X) < half)
    g.put(hull, MAT_HULL)
    g.put(hull & g.zs(0.55, 0.8), MAT_STRIPE)                         # белая полоса
    g.cut(g.box(-half + 1.0, half - 2.0, -BEAM / 2 + 0.5, BEAM / 2 - 0.5, 1.05, 1.3))   # палуба внутри борта
    g.put(g.box(-2.5, 0.0, -0.75, 0.75, 1.0, 2.0), MAT_HULL)          # рубка
    # Мачта, гик, грот (треугольник за мачтой), стаксель (треугольник к носу), флажок.
    mx = 0.5
    g.put(g.box(mx - 0.125, mx + 0.125, -0.125, 0.125, 1.0, MAST + 1.5), MAT_MAST)
    g.put(g.box(mx - 4.0, mx, -0.125, 0.125, 2.0, 2.25), MAT_MAST)
    t = (g.Z - 2.25) / (MAST + 1.0 - 2.25)
    main = (g.X < mx - 0.125) & (g.X > mx - 4.0 + 3.7 * t) & g.zs(2.25, MAST + 1.0) & (g.Y > -0.2) & (g.Y < 0)
    g.put(main, MAT_SAIL)
    t2 = (g.Z - 1.6) / (MAST - 1.6)
    jib = (g.X > mx + 0.125) & (g.X < mx + 0.125 + (half - 0.6 - mx) * (1 - t2)) & g.zs(1.6, MAST) & (g.Y > -0.2) & (g.Y < 0)
    g.put(jib, MAT_SAIL)
    g.put(g.box(mx + 0.125, mx + 1.0, -0.125, 0.125, MAST + 1.0, MAST + 1.5), MAT_FLAG)
    # Рисунок: швы на парусах, корпус — доски.
    g.tint((g.mat == MAT_SAIL) & (g.K % 6 == 0), -1)
    g.tint((g.mat == MAT_SAIL) & (g.X > mx), -1)                       # стаксель чуть в тени
    g.tint((g.mat == MAT_HULL) & (g.K % 2 == 0), -1)
    return g


def build(col):
    g = make_grid()
    obj = g.build_mesh("Sailboat", {MAT_HULL: HULL, MAT_STRIPE: STRIPE, MAT_SAIL: SAIL, MAT_MAST: MASTW,
                                    MAT_FLAG: FLAG}, col)
    print("Sailboat faces:", len(obj.data.polygons))
    return [obj]


def preview(objects, path):
    import style_preview
    style_preview.render(objects, path, "studio", elevation=10, azimuth=-25, fill=0.9)
    style_preview.render(objects, path[:-4] + "_sunset.png", "sunset", elevation=6, azimuth=0, fill=0.9)

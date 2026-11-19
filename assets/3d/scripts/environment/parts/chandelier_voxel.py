"""Навесная люстра над покерным столом — ВОКСЕЛЬНЫЙ стиль (кубики 1 см, как стол), по референсу Тима (23.webp).

Строение (сверху вниз):
  розетка  — ступенчатая чаша на потолке
  цепь     — звенья, повёрнутые через одно
  стержень — бронзовая «ваза» с поясками, вокруг — венчик хрустальных капель
  чаша     — ступица под стержнем, от неё 6 завитков-S наружу со свечами\n  хрусталь — капли под свечами, с середины рожков, нитки бус между рожками\n  низ      — кольцо капель и большая капля-навершие

Начало координат — точка крепления на потолке (верх люстры), люстра висит вниз (z < 0).
Свет в игре: точечные тёплые источники у свечей (CANDLES) или один общий в LIGHT_POINT."""
import math

import numpy as np

from voxel import Grid, Palette

# ---------------------------------------------------------------------------
# НАСТРОЙКИ
# ---------------------------------------------------------------------------
VOXEL = 0.01
ARMS = 6                 # рожков со свечами по кругу
ARM_RADIUS = 0.30        # где стоят свечи, м от оси
CHAIN = 0.20             # длина цепи, м
HEIGHT = 0.80            # общая высота люстры, м
FLAME_GLOW = 2.0
LIGHT_COLOR = "#ffb35a"

BRONZE = Palette("ChandelierBronze", ["#3a200e", "#5e3616", "#86501e", "#a86a28", "#c88a38", "#e2aa52",
                                      "#f4cc7a"], base=4, roughness=0.35, metallic=0.5)
CRYSTAL = Palette("ChandelierCrystal", ["#7a6c64", "#a49486", "#ccbaa6", "#e8d8c4", "#f8eedf", "#fffaf2"],
                  base=3, roughness=0.1, emission="#f6dcb0", emission_strength=0.6)
WAX = Palette("ChandelierWax", ["#c0a888", "#dccab0", "#eee2cc", "#faf3e6"], base=2, roughness=0.7,
              emission="#f0c890", emission_strength=0.45)
FLAME = Palette("ChandelierFlame", ["#f6a745", "#fbd27a", "#fded9e", "#fff8d8"], base=2, roughness=0.5,
                emission="#ffc860", emission_strength=FLAME_GLOW)
MAT_BRONZE, MAT_CRYSTAL, MAT_WAX, MAT_FLAME = 1, 2, 3, 4

PREVIEW_VIEW = (0.0, -1.6, -0.5)
CANDLES = []             # заполняется при сборке: где огоньки свечей (м от точки крепления)
LIGHT_POINT = (0.0, 0.0, -0.86)       # под люстрой — свет на стол не перекрыт бронзой


def tube(g, pts, r):
    """Толстая линия по точкам (x, y, z) — рожки и завитки."""
    m = np.zeros(g.mat.shape, bool)
    for (x0, y0, z0), (x1, y1, z1) in zip(pts[:-1], pts[1:]):
        n = max(2, int(math.dist((x0, y0, z0), (x1, y1, z1)) / (VOXEL * 0.5)))
        for t in np.linspace(0, 1, n):
            px, py, pz = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t
            m |= (g.X - px) ** 2 + (g.Y - py) ** 2 + (g.Z - pz) ** 2 < r * r
    return m


def drop(g, cx, cy, z_top, length, w):
    """Хрустальная подвеска: огранённый «ромб» (сечение — ромбик), верх короче низа."""
    t = (z_top - g.Z) / length
    hw = np.where(t < 0.35, w * t / 0.35, w * (1 - t) / 0.65)
    return (t >= 0) & (t <= 1) & (np.abs(g.X - cx) + np.abs(g.Y - cy) < np.maximum(hw, VOXEL * 0.55))


def lathe(g, profile):
    """Тело вращения: profile — [(глубина от потолка, радиус)], радиус между точками — по прямой."""
    d = -g.Z
    ds = [p[0] for p in profile]
    rs = [p[1] for p in profile]
    r = np.interp(d, ds, rs, left=-1, right=-1)
    return (g.R < r) & (d >= ds[0]) & (d <= ds[-1])


def candle(g, x, y, d_base, height, cup):
    """Чашечка, свеча и пиксельное пламя «крестиком»; запоминает, где огонёк."""
    g.put((np.hypot(g.X - x, g.Y - y) < cup) & g.zs(-d_base - 0.02, -d_base), MAT_BRONZE)
    g.put((np.hypot(g.X - x, g.Y - y) < cup * 0.6) & g.zs(-d_base - 0.03, -d_base - 0.02), MAT_BRONZE)
    g.put((np.abs(g.X - x) < 0.011) & (np.abs(g.Y - y) < 0.011) & g.zs(-d_base, -d_base + height), MAT_WAX)
    top = -d_base + height
    ax, ay = np.abs(g.X - x), np.abs(g.Y - y)
    for k, half in enumerate((0.006, 0.011, 0.011, 0.006, 0.006)):        # пламя снизу вверх
        g.put((ax < half) & (ay < half) & g.zs(top + k * VOXEL, top + (k + 1) * VOXEL), MAT_FLAME)
    CANDLES.append((x, y, top + 0.025))


def make_grid():
    CANDLES.clear()
    g = Grid(VOXEL, size_xy=0.72, height=HEIGHT + 0.02, origin_z=-HEIGHT)
    # --- Розетка на потолке.
    g.put(lathe(g, [(0.0, 0.10), (0.02, 0.10), (0.02, 0.08), (0.04, 0.06), (0.05, 0.03)]), MAT_BRONZE)
    # --- Цепь: звенья по 4 см, через одно повёрнуты на 90°.
    d = 0.05
    i = 0
    while d < 0.05 + CHAIN - 0.01:
        a, b = (g.X, g.Y) if i % 2 == 0 else (g.Y, g.X)
        zc = -(d + 0.02)
        outer = (np.abs(a) < 0.016) & (np.abs(g.Z - zc) < 0.024) & (np.abs(b) < 0.006)
        inner = (np.abs(a) < 0.006) & (np.abs(g.Z - zc) < 0.014)
        g.put(outer & ~inner, MAT_BRONZE)
        d += 0.04
        i += 1
    top = 0.05 + CHAIN                                    # где кончается цепь (глубина)
    # --- Венчик сверху стержня (с него свисает хрусталь) и стержень-ваза с поясками.
    g.put(lathe(g, [(top, 0.02), (top + 0.02, 0.07), (top + 0.04, 0.07), (top + 0.05, 0.03)]), MAT_BRONZE)
    vase = [(top + 0.05, 0.025), (top + 0.08, 0.04), (top + 0.10, 0.03), (top + 0.16, 0.028), (top + 0.19, 0.045),
            (top + 0.21, 0.03), (top + 0.25, 0.03)]
    g.put(lathe(g, vase), MAT_BRONZE)
    # --- Чаша-ступица: от неё расходятся рожки, снизу — капля.
    hub = [(top + 0.25, 0.04), (top + 0.27, 0.085), (top + 0.31, 0.09), (top + 0.33, 0.07), (top + 0.36, 0.04),
           (top + 0.39, 0.015)]
    g.put(lathe(g, hub), MAT_BRONZE)
    # --- Рожки: S-завиток от чаши наружу, вниз и вверх к чашечке свечи.
    for k in range(ARMS):
        a = 2 * math.pi * (k + 0.5) / ARMS
        ca, sa = math.cos(a), math.sin(a)
        path = [(0.07, top + 0.29), (0.14, top + 0.33), (0.21, top + 0.345), (0.26, top + 0.33),
                (ARM_RADIUS - 0.01, top + 0.29), (ARM_RADIUS, top + 0.24)]
        g.put(tube(g, [(r * ca, r * sa, -dd) for r, dd in path], 0.015), MAT_BRONZE)
        g.put(tube(g, [(0.13 * ca, 0.13 * sa, -(top + 0.335)), (0.12 * ca, 0.12 * sa, -(top + 0.37)),
                       (0.09 * ca, 0.09 * sa, -(top + 0.37))], 0.007), MAT_BRONZE)          # завиток под рожком
        candle(g, ARM_RADIUS * ca, ARM_RADIUS * sa, top + 0.24, 0.09, 0.036)
        g.put(drop(g, ARM_RADIUS * ca, ARM_RADIUS * sa, -(top + 0.27), 0.11, 0.022), MAT_CRYSTAL)   # под чашечкой
        g.put(drop(g, 0.21 * ca, 0.21 * sa, -(top + 0.355), 0.12, 0.022), MAT_CRYSTAL)              # с середины рожка
        b2 = a + math.pi / ARMS                                                                      # между рожками
        g.put(drop(g, 0.20 * math.cos(b2), 0.20 * math.sin(b2), -(top + 0.31), 0.10, 0.02), MAT_CRYSTAL)
        g.put(tube(g, [(0.085 * math.cos(b2), 0.085 * math.sin(b2), -(top + 0.30)),
                       (0.20 * math.cos(b2), 0.20 * math.sin(b2), -(top + 0.31))], 0.004), MAT_CRYSTAL)  # нитка бус
    # --- Хрусталь: венчик вокруг стержня, кольцо капель под чашей и большая капля-навершие.
    for k in range(10):
        a = 2 * math.pi * k / 10
        g.put(drop(g, 0.07 * math.cos(a), 0.065 * math.sin(a), -(top + 0.045), 0.12, 0.018), MAT_CRYSTAL)
    for k in range(6):
        a = 2 * math.pi * k / 6
        g.put(drop(g, 0.06 * math.cos(a), 0.06 * math.sin(a), -(top + 0.34), 0.10, 0.018), MAT_CRYSTAL)
    g.put(drop(g, 0.0, 0.0, -(top + 0.38), HEIGHT - top - 0.385, 0.04), MAT_CRYSTAL)
    decorate(g, top)
    return g


def decorate(g, top):
    """Рисунок: бронза — блики на поясках и чаше, хрусталь — грани через одну и светлая серединка, пламя — горячий центр."""
    bronze = g.mat == MAT_BRONZE
    crystal = g.mat == MAT_CRYSTAL
    g.tint(bronze & (g.R > 0.08) & g.zs(-(top + 0.32), -(top + 0.27)), +1)        # кромка чаши ловит свет
    g.tint(bronze & (g.K % 4 == 0) & (g.R < 0.05), -1)                            # пояски на стержне
    g.tint(crystal & (((g.I + g.J + g.K) % 2) == 0), +1)                         # грани
    g.tint(crystal & (np.abs(g.X) + np.abs(g.Y) < 0.006), +1)                    # светлая серединка капли
    g.noise(MAT_BRONZE, 0.08, 0.06, seed=41)

def build(col):
    g = make_grid()
    obj = g.build_mesh("Chandelier", {MAT_BRONZE: BRONZE, MAT_CRYSTAL: CRYSTAL, MAT_WAX: WAX, MAT_FLAME: FLAME}, col)
    print("Chandelier faces:", len(obj.data.polygons), "candles:", len(CANDLES))
    return [obj]


def add_lights(col, offset=(0.0, 0.0, 0.0), energy=1.6):
    """Тёплые точечные источники у каждой свечи (для превью; в игре — как решит код игры)."""
    import bpy
    from voxel import hex_srgb
    ox, oy, oz = offset
    for i, (x, y, z) in enumerate(CANDLES):
        d = bpy.data.lights.new(f"Candle{i}", 'POINT')
        d.energy = energy
        d.color = hex_srgb(LIGHT_COLOR)
        d.shadow_soft_size = 0.02
        o = bpy.data.objects.new(f"Candle{i}", d)
        o.location = (ox + x, oy + y, oz + z)
        col.objects.link(o)


HANG_Z = 2.55            # в превью: точка крепления над полом, м (низ люстры ≈ 0.8 м над сукном)
TABLE_LIGHT = 140        # в превью: общий тёплый свет люстры на стол, Вт


def preview(objects, path):
    import bpy
    import style_preview
    from mathutils import Vector
    import ps3d
    from voxel import hex_srgb
    style_preview.render(objects, path, "studio", elevation=6, azimuth=20, fill=0.8)
    # Люстра над покерным столом, как в игре: свет свечей + общий тёплый свет вниз на сукно.
    ps3d.clear_scene()
    col = ps3d.collection("ChandelierTable")
    from parts import poker_table
    poker_table.build(col)
    for o in build(col):
        o.location.z = HANG_Z
    add_lights(col, (0, 0, HANG_Z))
    d = bpy.data.lights.new("TableLight", 'POINT')
    d.energy = TABLE_LIGHT
    d.color = hex_srgb(LIGHT_COLOR)
    d.shadow_soft_size = 0.3
    o = bpy.data.objects.new("TableLight", d)
    o.location = (0, 0, HANG_Z + LIGHT_POINT[2])
    col.objects.link(o)
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 22
    cam = bpy.data.objects.new("Cam", cd)
    col.objects.link(cam)
    cam.location = (0.0, -1.95, 1.50)
    cam.rotation_euler = (Vector((0, 0.15, 1.45)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    ps3d.world_color("#1c1620", 0.25)
    ps3d.setup_render(1600, 1000, path[:-4] + "_table.png")
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.filter_size = 0.7
    bpy.ops.render.render(write_still=True)

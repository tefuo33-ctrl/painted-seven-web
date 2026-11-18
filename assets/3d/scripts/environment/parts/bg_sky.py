"""Небо и солнце (облака — в bg_clouds.py).

СОЛНЦЕ — отдельный элемент: в игре оно ходит по небу (день/ночь).
НЕБО — купол с закатным градиентом только для превью: в игре небо рисует код (меняется по времени суток);
цвета заката лежат в SKY_SUNSET (их же можно взять в игру)."""
import math
import os

import bpy
import numpy as np

from bg_common import raspberry
from voxel import Grid, Palette, hex_srgb

# Закатное небо: (высота над горизонтом в градусах, цвет) — снизу вверх, с картинки Тима.
SKY_SUNSET = [(0, "#fc9a3a"), (1.5, "#f2743a"), (3, "#de5a48"), (5.5, "#c45052"), (8, "#9a4866"),
              (11, "#764672"), (14, "#5c4274"), (20, "#463866"), (40, "#362c56"), (90, "#262044")]

SUN_RADIUS = 78.0
# Солнце — КРУГ со срезанным низом (как на картинке: шир. 66 пикс., выс. 46 → низ срезан на 0.36 радиуса).
SUN_CUT = 0.56
# Цвета сняты пикселями с картинки: диск ровно #fdf298, кромка золотая #fdca42.
SUN = Palette("Sun", ["#fcbb3b", "#fdca42", "#fdd860", "#fdf298"], base=3, roughness=1.0)
# Сияние вокруг солнца: (ширина вдоль горизонта, высота) в градусах и цвета.
# Сразу у диска небо насыщенное золотое #ffc742, выше — грейпфрутовое #ffad35 (замер с картинки).
GLOW_WIDE = (15.0, 4.5)
GLOW_CORE = (5.0, 3.0)
GLOW_COLORS = ("#fb8a3a", "#ffc742")
SKY_DIM = 0.85             # небо чуть темнее (подобрано по картинке); на сияние не действует
# Небо картинки Тима без облаков (вырезано tools/extract_clouds.py): в превью небо в кадре берётся отсюда.
SKY_REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "source", "sky_ref.png")
SKY_REF_SIZE = (1838, 627)    # размер картинки, пикс.
SKY_REF_CELL = 3              # 1 клетка sky_ref.png = 3x3 пикселя картинки


def _dim_np(s, k):
    """Притушить цвета sRGB в k раз по яркости света (в линейном пространстве)."""
    lin = np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4) * k
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.maximum(lin, 0) ** (1 / 2.4) - 0.055)


def load_sky_ref(path=SKY_REF):
    im = bpy.data.images.load(os.path.normpath(path), check_existing=True)
    w, h = im.size
    return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]   # верхняя строка первой


def make_sky_dome(col, center, radius=7000.0, sun_dir=(0.0, 1.0, 0.0), frame=None):
    """Купол неба (только превью). Цвет по высоте + сияние вокруг солнца.
    frame = (pitch°, hfov°, aspect) камеры террасы: тогда в кадре небо берётся с картинки Тима
    (source/sky_ref.png — небо без облаков), а за кадром плавно переходит в градиент SKY_SUNSET."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=512, ring_count=256, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = "PreviewSky"
    obj.visible_shadow = False          # купол не должен отбрасывать тень (иначе солнце не светит)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    me = obj.data
    attr = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    d = co.reshape(-1, 3)
    d = d / np.linalg.norm(d, axis=1, keepdims=True)
    elev = np.degrees(np.arcsin(np.clip(d[:, 2], -1, 1)))
    # градиент по высоте
    pts = SKY_SUNSET
    e_ = [e for e, _ in pts]
    c_ = np.array([hex_srgb(h) for _, h in pts])
    cols = np.stack([np.interp(np.maximum(elev, 0), e_, c_[:, i]) for i in range(3)], 1)
    cols = _dim_np(cols, SKY_DIM)
    # Сияние солнца: широкое тёплое свечение, вытянутое вдоль горизонта, и яркое золотое ядро у диска.
    sd = np.array(sun_dir) / np.linalg.norm(sun_dir)
    daz = np.abs(np.degrees(np.arctan2(d[:, 0], d[:, 1])) - math.degrees(math.atan2(sd[0], sd[1])))
    delv = elev - math.degrees(math.asin(sd[2]))
    wide = np.exp(-((daz / GLOW_WIDE[0]) ** 2 + (delv / GLOW_WIDE[1]) ** 2))
    core = np.exp(-((daz / GLOW_CORE[0]) ** 2 + (delv / GLOW_CORE[1]) ** 2))
    for col_hex, k in ((GLOW_COLORS[0], 0.85 * wide), (GLOW_COLORS[1], core)):
        cols += (np.array(hex_srgb(col_hex)) - cols) * k[:, None]
    if frame is not None:
        # В кадре террасы — небо с картинки (ровно как нарисовано).
        pitch, hfov, aspect = frame
        p = math.radians(pitch)
        th = math.tan(math.radians(hfov / 2))
        fwd = d[:, 1] * math.cos(p) + d[:, 2] * math.sin(p)
        up = -d[:, 1] * math.sin(p) + d[:, 2] * math.cos(p)
        ok = fwd > 0.05
        f = np.where(ok, fwd, 1.0)
        u = 0.5 + 0.5 * d[:, 0] / (f * th)
        v = 0.5 - 0.5 * up / (f * th / aspect)
        lut = load_sky_ref()
        rows, ncol = lut.shape[:2]
        px = np.clip(u * SKY_REF_SIZE[0] / SKY_REF_CELL - 0.5, 0, ncol - 1.001)
        py = np.clip(v * SKY_REF_SIZE[1] / SKY_REF_CELL - 0.5, 0,       # ниже горизонта — цвет у горизонта
                     min(rows - 1.001, 0.52 * SKY_REF_SIZE[1] / SKY_REF_CELL - 0.5))
        x0, y0 = px.astype(int), py.astype(int)
        fx, fy = (px - x0)[:, None], (py - y0)[:, None]
        sample = (lut[y0, x0] * (1 - fx) * (1 - fy) + lut[y0, x0 + 1] * fx * (1 - fy)
                  + lut[y0 + 1, x0] * (1 - fx) * fy + lut[y0 + 1, x0 + 1] * fx * fy)
        # вес: 1 в кадре, плавно к 0 за его краями (по бокам и выше верха кадра)
        wgt = (np.clip(1 - np.maximum(-u, u - 1) / 0.15, 0, 1) * np.clip(1 + v / 0.3, 0, 1)) * ok
        cols += (sample - cols) * wgt[:, None]
    cols = raspberry(cols)                      # закат чуть малиновее картинки (просьба Тима, bg_common.RASPBERRY)
    li = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", li)
    rgba = np.concatenate([cols[li], np.ones((len(li), 1))], 1)
    attr.data.foreach_set("color_srgb", rgba.astype(np.float32).ravel())
    m = bpy.data.materials.new("PreviewSky")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0       # (небо притушено в цветах — SKY_DIM, сияние — нет)
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    me.materials.append(m)
    return obj


def make_sun(col, radius=SUN_RADIUS):
    """Пиксельное солнце: круг со срезанным низом (садится), ровный цвет #fdf298 и золотая кромка по кругу.
    Стоит в плоскости XZ и смотрит на -Y — в игре его поворачивают к камере. Начало координат — центр круга."""
    v = radius / 7.0
    g = Grid(v, size_xy=2 * radius + 2 * v, size_y=2 * v, height=2 * radius + 2 * v, origin_z=-radius - v)
    rr = np.sqrt(g.X ** 2 + g.Z ** 2)
    disc = (rr < radius) & (g.Z > -SUN_CUT * radius) & (np.abs(g.Y) < v * 0.6)
    g.put(disc, 1)
    g.tint(disc & (rr > radius - v), -2)                                     # золотая кромка по кругу
    obj = g.build_mesh("Sun", {1: SUN}, col, face_light={"top": 0, "side": 0, "bottom": 0}, edge_light=False,
                       occlusion=False)
    from parts.bg_sea import sea_material           # светится ровно своими цветами (как вода)
    sea_material(SUN).node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.0
    return obj


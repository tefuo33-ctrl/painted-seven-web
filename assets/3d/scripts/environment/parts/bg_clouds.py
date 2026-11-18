"""Облака — ровно как на картинке Тима, каждое отдельным объектом (в игре медленно плывут).

Откуда форма и цвет: карта облаков assets/3d/source/clouds_map.png (вырезана с картинки-референса скриптом
tools/extract_clouds.py; её можно дорисовать руками в пиксельном редакторе). Одна клетка карты = 3x3 пикселя
картинки = один «пиксель» облака.

Как ставим: каждую клетку переносим на далёкую вертикальную плоскость (CLOUD_Y метров от террасы) так, чтобы
с камеры террасы она легла ровно в ту же точку кадра, что и на картинке. Соседние клетки одного цвета в ряду
склеиваются в одну полоску (меньше граней). Облака светятся своим цветом (как солнце и вода): на закате они
такие, как нарисованы; в игре цвет облаков можно умножать на цвет времени суток."""
import math
import os

import bpy
import numpy as np

from bg_common import raspberry
from voxel import Palette

MAP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "source", "clouds_map.png")
REF_SIZE = (1838, 627)     # размер картинки-референса, пикс.
CELL = 3                   # клетка карты = 3x3 пикселя картинки
CLOUD_Y = 3300.0           # плоскость облаков: дальше гор слева (2550), ближе солнца (3500)
GROUP_GAP = 2              # кусочки ближе 2 клеток друг к другу — одно облако (плывут вместе)
CLOUD_PAL = Palette("Clouds", ["#7b4a78", "#c6535f", "#fe9038", "#fead38"], base=1, roughness=1.0, specular=0.0)


def load_map(path=MAP):
    im = bpy.data.images.load(os.path.normpath(path), check_existing=True)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]     # верхняя строка первой
    return a[..., :3], a[..., 3] > 0.5


def _groups(mask):
    """Облака: связные куски маски (с допуском GROUP_GAP клеток)."""
    near = mask.copy()
    for _ in range(GROUP_GAP):
        m = near.copy()
        m[1:] |= near[:-1]; m[:-1] |= near[1:]; m[:, 1:] |= near[:, :-1]; m[:, :-1] |= near[:, 1:]
        near = m
    h, w = mask.shape
    lab = np.zeros(mask.shape, int)
    n = 0
    for i, j in zip(*np.nonzero(near)):
        if lab[i, j]:
            continue
        n += 1
        st = [(i, j)]
        lab[i, j] = n
        while st:
            p, q = st.pop()
            for dp in (-1, 0, 1):
                for dq in (-1, 0, 1):
                    a, b = p + dp, q + dq
                    if 0 <= a < h and 0 <= b < w and near[a, b] and not lab[a, b]:
                        lab[a, b] = n
                        st.append((a, b))
    lab[~mask] = 0
    return lab, n


def make_clouds(col, camera, pitch_deg, hfov_deg, aspect, plane_y=CLOUD_Y, path=MAP):
    """Строит облака по карте. camera/pitch/hfov/aspect — камера террасы (как у картинки)."""
    from parts.bg_sea import sea_material
    rgb, mask = load_map(path)
    lab, n = _groups(mask)
    p = math.radians(pitch_deg)
    th = math.tan(math.radians(hfov_deg / 2))
    cx, cy, cz = camera

    def to_plane_x(u, t):                  # точка кадра (u — доля ширины) на плоскости, при данном t
        return cx + t * (u - 0.5) * 2 * th

    def row_line(v):                       # ряд кадра v (доля высоты сверху) -> (t, z) на плоскости облаков
        b = (0.5 - v) * 2 * th / aspect
        dy = math.cos(p) - b * math.sin(p)
        dz = math.sin(p) + b * math.cos(p)
        t = (plane_y - cy) / dy
        return t, cz + t * dz

    mat = sea_material(CLOUD_PAL)
    mat.use_backface_culling = False
    objs = []
    order = sorted(range(1, n + 1), key=lambda k: np.argwhere(lab == k)[:, 1].mean())   # слева направо
    for num, k in enumerate(order, 1):
        verts, faces, cols = [], [], []
        rows = np.nonzero((lab == k).any(1))[0]
        for i in rows:
            t0, z_top = row_line(i * CELL / REF_SIZE[1])
            t1, z_bot = row_line((i + 1) * CELL / REF_SIZE[1])
            js = np.nonzero(lab[i] == k)[0]
            start = 0
            for s in range(1, len(js) + 1):        # полоски одного цвета
                if s < len(js) and js[s] == js[s - 1] + 1 and (rgb[i, js[s]] == rgb[i, js[start]]).all():
                    continue
                u0 = js[start] * CELL / REF_SIZE[0]
                u1 = (js[s - 1] + 1) * CELL / REF_SIZE[0]
                bi = len(verts)
                verts += [(to_plane_x(u0, t1), plane_y, z_bot), (to_plane_x(u1, t1), plane_y, z_bot),
                          (to_plane_x(u1, t0), plane_y, z_top), (to_plane_x(u0, t0), plane_y, z_top)]
                faces.append((bi, bi + 1, bi + 2, bi + 3))
                cols.append(list(raspberry(rgb[i, js[start]])) + [1.0])    # в тон малиновому закату
                start = s
        v = np.array(verts)
        center = (v.min(0) + v.max(0)) / 2
        name = f"Cloud_{num:02d}"
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(x) for x in v - center], [], faces)
        attr = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
        attr.data.foreach_set("color_srgb", [c for cc in cols for c in cc * 4])
        me.materials.append(mat)
        me.update()
        obj = bpy.data.objects.new(name, me)
        obj.location = tuple(center)
        col.objects.link(obj)
        objs.append(obj)
    print("Clouds:", len(objs), "faces", sum(len(o.data.polygons) for o in objs))
    return objs

# voxel — «движок» воксельного стиля Painted Seven (пиксельно, но детально, как Minecraft/Terraria).
#
# Как это работает:
#   1. Деталь описывается ФОРМАМИ (кольца, квадраты, кресты) на сетке кубиков-вокселей.
#      Каждый воксель получает номер материала (1 — дерево, 2 — тёмное дерево, 3 — сукно...).
#   2. Каждый воксель получает ОТТЕНОК из палитры материала (доски, швы, шум — как рисует пиксель-артист).
#   3. Каждая видимая грань получает поправку: верх светлее, низ темнее, светлая кромка на рёбрах,
#      тень под нависанием. Это «нарисованный» объём — свет игры ложится поверх.
#   4. Соседние грани одного цвета склеиваются в прямоугольники (меньше полигонов для веба).
#
# Цвета хранятся в цветах вершин (Color Attribute "Col") — в .glb это COLOR_0, three.js и Godot их понимают.

import math
import os

import bpy
import numpy as np

# Направления граней: (ось, знак)
DIRS = [(0, 1), (0, -1), (1, 1), (1, -1), (2, 1), (2, -1)]


def hex_srgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


class Palette:
    """Палитра материала: оттенки от самого тёмного к самому светлому.
    base — индекс «обычного» оттенка; roughness — блеск в игре."""

    def __init__(self, name, colors, base, roughness=0.6):
        self.name = name
        self.colors = colors
        self.base = base
        self.roughness = roughness


class Grid:
    def __init__(self, voxel, size_xy, height, origin_z=0.0, size_y=None):
        """voxel — размер кубика, м; size_xy — ширина области по X (и по Y, если size_y не задан), м;
        height — высота, м. Область стоит по центру X/Y = 0, низ — origin_z."""
        self.v = voxel
        self.nx = int(round(size_xy / voxel))
        self.ny = int(round((size_y if size_y is not None else size_xy) / voxel))
        self.n = self.nx                       # (для совместимости с круглыми деталями)
        self.nz = int(round(height / voxel))
        nx, ny, nz = self.nx, self.ny, self.nz
        # Центры кубиков строго симметричны относительно 0 (иначе погрешность чисел ломает симметрию).
        cx = (np.arange(nx) - (nx - 1) / 2) * voxel
        cy = (np.arange(ny) - (ny - 1) / 2) * voxel
        cz = (np.arange(nz) + 0.5) * voxel + origin_z
        self.X, self.Y, self.Z = np.meshgrid(cx, cy, cz, indexing="ij")
        self.R = np.sqrt(self.X ** 2 + self.Y ** 2)
        self.A = np.arctan2(self.Y, self.X)
        self.I, self.J, self.K = np.meshgrid(np.arange(nx), np.arange(ny), np.arange(nz), indexing="ij")
        # Номер кубика от центра (0, 1, 2… в обе стороны) — для СИММЕТРИЧНЫХ узоров и пазов.
        self.SI = np.floor(np.abs(np.arange(nx) - (nx - 1) / 2)).astype(int)[self.I]
        self.SJ = np.floor(np.abs(np.arange(ny) - (ny - 1) / 2)).astype(int)[self.J]
        self.mat = np.zeros((nx, ny, nz), dtype=np.int16)
        self.shade = np.zeros((nx, ny, nz), dtype=np.int16)   # поправка оттенка у каждого вокселя
        self.origin = (-nx * voxel / 2, -ny * voxel / 2, origin_z)

    # --- формы (возвращают маску) ---------------------------------------------------
    def zs(self, z0, z1):
        return (self.Z >= z0) & (self.Z < z1)

    def ring(self, r0, r1, z0, z1):
        return (self.R >= r0) & (self.R < r1) & self.zs(z0, z1)

    def disk(self, r, z0, z1):
        return (self.R < r) & self.zs(z0, z1)

    def square(self, half, z0, z1, chamfer=0.35):
        """Квадрат со срезанными углами (chamfer — доля среза)."""
        ax, ay = np.abs(self.X), np.abs(self.Y)
        return (ax < half) & (ay < half) & (ax + ay < half * (2 - chamfer)) & self.zs(z0, z1)

    def box(self, x0, x1, y0, y1, z0, z1):
        """Прямоугольный брус (границы в метрах)."""
        return (self.X >= x0) & (self.X < x1) & (self.Y >= y0) & (self.Y < y1) & self.zs(z0, z1)

    def square_at(self, cx, cy, half, z0, z1, round_corners=False, half_y=None):
        """Прямоугольник с центром (cx, cy). round_corners — срезать угловой кубик (выглядит «круглее»).
        Чтобы деталь была симметричной, ставь центр на границу кубиков, а half делай кратным размеру кубика."""
        hy = half if half_y is None else half_y
        ax, ay = np.abs(self.X - cx), np.abs(self.Y - cy)
        m = (ax < half) & (ay < hy) & self.zs(z0, z1)
        if round_corners:
            m &= ~((ax > half - self.v) & (ay > hy - self.v))
        return m

    def turned_square(self, cx, cy, profile):
        """«Точёная» деталь с КВАДРАТНЫМ сечением (балясины в воксельном стиле).
        profile — список (полуширина, z0, z1, скруглить_углы) снизу вверх."""
        m = np.zeros(self.mat.shape, dtype=bool)
        for half, z0, z1, rounded in profile:
            m |= self.square_at(cx, cy, half, z0, z1, rounded)
        return m

    def cross(self, half_width, length, z0, z1):
        ax, ay = np.abs(self.X), np.abs(self.Y)
        return (((ax < half_width) & (ay < length)) | ((ay < half_width) & (ax < length))) & self.zs(z0, z1)

    def put(self, mask, material):
        self.mat[mask] = material

    def cut(self, mask):
        self.mat[mask] = 0

    def tint(self, mask, delta):
        """Сдвинуть оттенок вокселей (полосы, швы, узор)."""
        self.shade[mask & (self.mat > 0)] += delta

    def noise(self, material, chance_dark=0.18, chance_light=0.1, seed=1, blot=1):
        """Случайные пятна оттенка. blot — размер пятна в кубиках (1 — «крапинка», 3 — мягкие пятна камня)."""
        rng = np.random.default_rng(seed)
        if blot > 1:
            small = rng.random(tuple(s // blot + 1 for s in self.mat.shape))
            r = np.repeat(np.repeat(np.repeat(small, blot, 0), blot, 1), blot, 2)
            r = r[:self.mat.shape[0], :self.mat.shape[1], :self.mat.shape[2]]
        else:
            r = rng.random(self.mat.shape)
        sel = self.mat == material
        self.shade[sel & (r < chance_dark)] -= 1
        self.shade[sel & (r > 1 - chance_light)] += 1

    # --- сетка ------------------------------------------------------------------------
    def build_mesh(self, name, palettes, collection, face_light=None, edge_light=True, occlusion=True):
        """Собрать объект. palettes: {номер материала: Palette}.
        face_light — поправки оттенка для граней: верх / бок / низ."""
        face_light = face_light or {"top": 1, "side": 0, "bottom": -2}
        solid = self.mat > 0
        pad = np.pad(solid, 1)
        nx, ny, nz = self.nx, self.ny, self.nz

        def neighbor(dx, dy, dz):
            return pad[1 + dx:1 + dx + nx, 1 + dy:1 + dy + ny, 1 + dz:1 + dz + nz]

        above = neighbor(0, 0, 1)
        below = neighbor(0, 0, -1)
        side_open = ~neighbor(1, 0, 0) | ~neighbor(-1, 0, 0) | ~neighbor(0, 1, 0) | ~neighbor(0, -1, 0)

        mats = sorted(palettes)
        verts, faces, colors, mat_idx = [], [], [], []
        for axis, sign in DIRS:
            d = [0, 0, 0]
            d[axis] = sign
            exposed = solid & ~neighbor(*d)
            # Оттенок грани = оттенок вокселя + свет грани + кромки + тени.
            if axis == 2:
                fl = face_light["top"] if sign > 0 else face_light["bottom"]
            else:
                fl = face_light["side"]
            shade = self.shade + fl
            if edge_light and axis == 2 and sign > 0:
                shade = shade + (side_open & exposed).astype(np.int16)          # светлая кромка сверху
            if edge_light and axis != 2:
                shade = shade - ((~below) & solid).astype(np.int16)              # тёмная кромка снизу
                shade = shade + ((~above) & solid).astype(np.int16) * 0          # (бок сверху — без изменений)
            if occlusion:
                if axis == 2 and sign > 0:
                    # Верх, рядом с которым поднимается стена — в тени (сукно у борта).
                    wall = neighbor(1, 0, 1) | neighbor(-1, 0, 1) | neighbor(0, 1, 1) | neighbor(0, -1, 1)
                    shade = shade - wall.astype(np.int16)
                elif axis != 2:
                    # Бок под нависанием — в тени.
                    dd = [0, 0, 1]
                    dd[axis] = sign
                    shade = shade - neighbor(*dd).astype(np.int16)
            key = np.where(exposed, self.mat.astype(np.int32) * 1000 + (shade.astype(np.int32) + 500), -1)
            self._greedy(key, axis, sign, verts, faces, colors, mat_idx, palettes, mats)

        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        attr = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
        flat = []
        for f, c in zip(faces, colors):
            flat.extend(c * 4)
        attr.data.foreach_set("color_srgb", flat)   # цвета палитры заданы в sRGB (как в CSS)
        for m in mats:
            me.materials.append(voxel_material(palettes[m]))
        me.polygons.foreach_set("material_index", mat_idx)
        me.update()
        obj = bpy.data.objects.new(name, me)
        collection.objects.link(obj)
        return obj

    def _greedy(self, key, axis, sign, verts, faces, colors, mat_idx, palettes, mats):
        """Склеить соседние грани одного цвета в прямоугольники (по каждому слою)."""
        v = self.v
        ox, oy, oz = self.origin
        a1, a2 = [a for a in (0, 1, 2) if a != axis]
        k = np.moveaxis(key, (axis, a1, a2), (0, 1, 2))
        for s in range(k.shape[0]):
            sl = k[s]
            if (sl < 0).all():
                continue
            used = np.zeros(sl.shape, dtype=bool)
            for u, w in np.argwhere(sl >= 0):
                if used[u, w]:
                    continue
                kv = sl[u, w]
                w2 = w
                while w2 + 1 < sl.shape[1] and sl[u, w2 + 1] == kv and not used[u, w2 + 1]:
                    w2 += 1
                u2 = u
                while u2 + 1 < sl.shape[0] and (sl[u2 + 1, w:w2 + 1] == kv).all() and not used[u2 + 1, w:w2 + 1].any():
                    u2 += 1
                used[u:u2 + 1, w:w2 + 1] = True
                # Углы прямоугольника.
                plane = (s + (1 if sign > 0 else 0)) * v
                corners = [(u, w), (u2 + 1, w), (u2 + 1, w2 + 1), (u, w2 + 1)]
                pts = []
                for cu, cw in corners:
                    p = [0.0, 0.0, 0.0]
                    p[axis] = plane
                    p[a1] = cu * v
                    p[a2] = cw * v
                    pts.append((p[0] + ox, p[1] + oy, p[2] + oz))
                # Грань должна смотреть наружу: проверяем нормаль и при необходимости разворачиваем.
                e1 = [pts[1][i] - pts[0][i] for i in range(3)]
                e2 = [pts[2][i] - pts[0][i] for i in range(3)]
                normal = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
                if normal[axis] * sign < 0:
                    pts.reverse()
                base = len(verts)
                verts.extend(pts)
                faces.append((base, base + 1, base + 2, base + 3))
                material = kv // 1000
                shade = kv % 1000 - 500
                pal = palettes[material]
                idx = max(0, min(len(pal.colors) - 1, pal.base + shade))
                colors.append(hex_srgb(pal.colors[idx]) + [1.0])
                mat_idx.append(mats.index(material))


def voxel_material(pal):
    name = "Vox_" + pal.name
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = pal.roughness
    m.diffuse_color = hex_srgb(pal.colors[pal.base]) + [1.0]
    return m

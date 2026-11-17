# ps3d — общая «мастерская» для всех деталей окружения Painted Seven.
#
# Здесь нет моделей, только инструменты:
#   * COLORS          — палитра (все цвета окружения в одном месте)
#   * mat()           — материал по имени (один и тот же материал переиспользуется)
#   * Mesh            — «конструктор»: складывает кубы, цилиндры, тела вращения в ОДИН объект
#   * instance()      — копия объекта с общей сеткой (в .glb хранится один раз)
#   * export_glb(), render_preview() — экспорт и картинка-превью
#
# Единицы — метры. Ось Z — вверх, Y — «вперёд» (к морю), X — вправо.

import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT_DIR = os.path.join(ASSETS, "export", "environment")
PREVIEW_DIR = os.path.join(ASSETS, "previews", "environment")
BLEND_DIR = os.path.join(ASSETS, "blend", "environment")

# ---------------------------------------------------------------------------
# Палитра окружения (#RRGGBB). Поменяешь здесь — поменяется во всех деталях.
# ---------------------------------------------------------------------------
COLORS = {
    # камень террасы
    "stone": "#d39a80",        # тёпло-розовый камень (как балюстрада на листе ассетов)
    "stone_dark": "#a3644f",   # основание, тени, швы
    "stone_warm": "#d8a890",   # колонны, арки
    "marble_1": "#d9c3a8",     # плитки пола — три оттенка
    "marble_2": "#cdb293",
    "marble_3": "#e2cfb6",
    "grout": "#8e7a66",        # швы между плитками
    # металл и огонь
    "iron": "#2b2220",         # кованый металл фонарей
    "brass": "#b8862f",
    "flame": "#ff8a1f",        # стекло фонаря, светится (тёплый оранжевый)
    "fire": "#ff7a1f",
    "candle": "#efe2c4",
    # интерьер (по листу ассетов)
    "wood": "#7a4325",         # полированное красное дерево
    "wood_dark": "#4f2a18",
    "wood_light": "#9a5a30",
    "velvet": "#9e1c24",       # красный бархат
    "velvet_dark": "#6e1218",
    "gold": "#c9962e",
    "felt": "#1f5a3a",         # зелёное сукно
    "paper": "#efe7d6",
    "chip_red": "#b3242c",
    "chip_blue": "#2a4a9a",
    "chip_black": "#1c1c22",
    "chip_white": "#ece6da",
    "bottle": "#3a2a14",
    "whiskey": "#b8661e",
    "silver": "#b9b6b0",
    "lampshade": "#f0a050",
    "canvas": "#2c3a4a",
    "globe_sea": "#3b5f7a",
    "book_1": "#7a1f1f", "book_2": "#2c4a2e", "book_3": "#2a3a5e", "book_4": "#8a6a2a", "book_5": "#4a2a3a",
    "window_1": "#3a2f6e", "window_2": "#7a3f7e", "window_3": "#d0566a", "window_4": "#f59a4e",
    # растения
    "leaf": "#3e5a2a",
    "leaf_dark": "#2c4120",
    "leaf_light": "#5f7a34",
    "flower_red": "#b3242c",
    "flower_pink": "#d0435a",
    "bark": "#4a3326",
    "cypress": "#24361f",
    "soil": "#3d2a1f",
    # город
    "wall_white": "#eadbc6",
    "wall_cream": "#e4cba6",
    "wall_shadow": "#c9b49a",
    "roof": "#a8452d",
    "roof_dark": "#8a3624",
    "window": "#ffcf7a",       # светящиеся окна
    "dome": "#4b4f7a",         # купол собора (сине-фиолетовый)
    "rock": "#6b4a45",
    "rock_dark": "#4a3238",
    "hill": "#3c3a3c",
    "hill_green": "#34402c",
    # море и небо
    "sea": "#3a2f5e",
    "sea_deep": "#2a2448",
    "glitter": "#ffd27a",
    "sun": "#fff0b8",
    "sail": "#f2e6cf",
    "hull": "#5a3a2a",
    "mountain_far": "#5a4270",
    "mountain_near": "#46345a",
}


def hex_to_linear(h, alpha=1.0):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def color(key_or_hex):
    return hex_to_linear(COLORS.get(key_or_hex, key_or_hex))


# ---------------------------------------------------------------------------
# Материалы
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# ПИКСЕЛЬНЫЙ ВАЙБ
# Каждый материал получает маленькую текстуру с «жёсткими» пикселями (без сглаживания).
# TEXELS_PER_METER — сколько пикселей текстуры на 1 метр. Одинаково для ВСЕХ моделей,
# поэтому пиксель везде одного размера — как на пиксель-арт листе.
# ---------------------------------------------------------------------------
TEXELS_PER_METER = 40
TEXTURE_SIZE = 32


def _hex_rgb(h):
    h = COLORS.get(h, h).lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def _shade(rgb, k):
    return [min(1.0, max(0.0, c * k)) for c in rgb]


def pixel_texture(name, base, pattern="noise", size=TEXTURE_SIZE, seed=1):
    """Сгенерировать пиксельную текстуру. Узоры:
    noise   — лёгкий «дизеринг» в 3 оттенка (камень, ткань, металл)
    bricks  — каменная кладка блоками
    planks  — доски / волокна дерева
    velvet  — бархат: вертикальные складки
    leaves  — листва: пятна светлого и тёмного
    """
    import random
    key = f"px_{name}"
    if key in bpy.data.images:
        return bpy.data.images[key]
    rnd = random.Random(seed + sum(map(ord, name)))
    rgb = _hex_rgb(base)
    px = [None] * (size * size)
    for yy in range(size):
        for xx in range(size):
            n = rnd.random()
            k = 1.0
            if pattern == "noise":
                k = 0.93 if n < 0.25 else (1.07 if n > 0.8 else 1.0)
            elif pattern == "bricks":
                row_h = size // 4
                row = yy // row_h
                shift = (size // 4) if row % 2 else 0
                bx = (xx + shift) % (size // 2)
                if yy % row_h == 0 or bx == 0:
                    k = 0.72  # шов
                else:
                    block = (row * 7 + (xx + shift) // (size // 2) * 3) % 5
                    k = (0.94, 1.0, 1.05, 0.97, 1.02)[block] * (0.96 if n < 0.2 else 1.0)
            elif pattern == "planks":
                plank = xx // (size // 4)
                k = (0.95, 1.04, 0.98, 1.08)[plank % 4]
                if xx % (size // 4) == 0:
                    k = 0.7
                elif (yy + plank * 5) % 11 == 0 and n < 0.7:
                    k *= 0.85  # волокна
            elif pattern == "velvet":
                k = 0.88 + 0.16 * abs(((xx % 8) - 3.5) / 3.5)
                k *= 0.95 if n < 0.2 else 1.0
            elif pattern == "leaves":
                k = 0.75 if n < 0.3 else (1.2 if n > 0.82 else 1.0)
            px[yy * size + xx] = _shade(rgb, k) + [1.0]
    img = bpy.data.images.new(key, size, size, alpha=False)
    img.pixels = [c for p in px for c in p]
    img.pack()
    return img


def mat(name, base, roughness=0.8, metallic=0.0, emission=0.0, pattern="noise"):
    """Материал. base — ключ из COLORS или '#RRGGBB'.
    pattern — пиксельный узор (см. pixel_texture), None — чистый цвет.
    emission > 0 — материал светится (стекло фонаря, окна) — без текстуры.
    Если материал с таким именем уже есть — возвращает его."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color(base)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = min(metallic, 0.55)  # в пиксельном стиле металл читается светлее
    if emission:
        bsdf.inputs["Emission Color"].default_value = color(base)
        bsdf.inputs["Emission Strength"].default_value = emission
    elif pattern:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = pixel_texture(name, base, pattern)
        tex.interpolation = 'Closest'   # жёсткие пиксели (в .glb — фильтр NEAREST)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    m.diffuse_color = color(base)
    return m


def unlit_vertex_color_mat(name):
    """«Неосвещаемый» материал, цвет берётся из цветов вершин (небо, облака, солнце).
    В .glb экспортируется как KHR_materials_unlit — в игре свет на него не влияет."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bg = nt.nodes.new("ShaderNodeBackground")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return m


# ---------------------------------------------------------------------------
# Коллекции и объекты
# ---------------------------------------------------------------------------
def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if col.name not in parent.children:
        parent.children.link(col)
    return col


def to_collection(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def empty(name, col, location=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = location
    col.objects.link(e)
    return e


def instance(src, col, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1), name=None):
    """Копия объекта с ОБЩЕЙ сеткой. Поменял оригинал — поменялись все копии."""
    o = src.copy()
    o.name = name or src.name
    o.location = location
    o.rotation_euler = rotation
    o.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
    col.objects.link(o)
    return o


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _matrix(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if not hasattr(scale, "__len__"):
        scale = (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot).to_quaternion(), Vector(scale))


# ---------------------------------------------------------------------------
# Mesh — конструктор одной детали из простых фигур
# ---------------------------------------------------------------------------
class Mesh:
    """Пример:
        m = Mesh()
        m.box((1, 1, 0.2), loc=(0, 0, 0.1), material=mat("Stone", "stone"))
        obj = m.finish("Pedestal", col)
    Все фигуры попадают в один объект; у каждой свой материал."""

    def __init__(self):
        self.bm = bmesh.new()
        self.materials = []
        self.colors = {}  # face index -> RGBA (для неба/облаков)

    def _index(self, material):
        if material is None:
            return 0
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def _tag(self, verts, material, vcolor=None):
        idx = self._index(material)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
        if vcolor is not None:
            self.bm.faces.ensure_lookup_table()
            for f in faces:
                self.colors[f] = vcolor
        return faces

    # --- фигуры -----------------------------------------------------------
    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=_matrix(loc, rot, size))
        return self._tag(res["verts"], material)

    def cylinder(self, r, depth, loc=(0, 0, 0), rot=(0, 0, 0), segments=12, material=None, r2=None, cap=True):
        """Цилиндр (или усечённый конус, если задан r2). loc — центр."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=segments,
                                    radius1=r, radius2=r if r2 is None else r2, depth=depth,
                                    matrix=_matrix(loc, rot))
        return self._tag(res["verts"], material)

    def sphere(self, r, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), detail=1, material=None):
        """Низкополигональный шар (икосфера). scale — сплющить/вытянуть."""
        sx, sy, sz = scale if hasattr(scale, "__len__") else (scale,) * 3
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=detail, radius=r,
                                         matrix=_matrix(loc, rot, (sx, sy, sz)))
        return self._tag(res["verts"], material)

    def lathe(self, profile, segments=12, loc=(0, 0, 0), rot=(0, 0, 0), scale=1, material=None, angle=2 * math.pi,
              caps=True):
        """Тело вращения: profile — список (радиус, высота) снизу вверх.
        Так делаются балясины, вазы, колонны."""
        m = _matrix(loc, rot, scale)
        full = abs(angle - 2 * math.pi) < 1e-6
        steps = segments if full else segments + 1
        rings = []
        for r, z in profile:
            ring = []
            for i in range(steps):
                a = angle * i / segments
                ring.append(self.bm.verts.new(m @ Vector((r * math.cos(a), r * math.sin(a), z))))
            rings.append(ring)
        new_verts = [v for ring in rings for v in ring]
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % n
                quad = [a[i], a[j], b[j], b[i]]
                unique = list(dict.fromkeys(quad))
                if len(unique) >= 3:
                    try:
                        self.bm.faces.new(unique)
                    except ValueError:
                        pass
        if full and caps:
            for ring, (r, _), flip in ((rings[0], profile[0], True), (rings[-1], profile[-1], False)):
                if r > 1e-6:
                    try:
                        f = self.bm.faces.new(list(reversed(ring)) if flip else ring)
                    except ValueError:
                        pass
        bmesh.ops.remove_doubles(self.bm, verts=new_verts, dist=1e-5)
        alive = [v for v in new_verts if v.is_valid]
        return self._tag(alive, material)

    def polygon_prism(self, points2d, height, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
        """Призма из плоского многоугольника (points2d в плоскости XY), вытянутая вверх на height."""
        m = _matrix(loc, rot)
        bottom = [self.bm.verts.new(m @ Vector((x, y, 0))) for x, y in points2d]
        top = [self.bm.verts.new(m @ Vector((x, y, height))) for x, y in points2d]
        self.bm.faces.new(list(reversed(bottom)))
        self.bm.faces.new(top)
        k = len(points2d)
        for i in range(k):
            j = (i + 1) % k
            self.bm.faces.new([bottom[i], bottom[j], top[j], top[i]])
        return self._tag(bottom + top, material)

    def pyramid(self, base, height, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
        """Четырёхскатная пирамида: base=(ширина X, глубина Y), loc — центр основания."""
        return self._hip_roof(base, height, 0.0, loc, rot, material)

    def _hip_roof(self, base, height, ridge, loc, rot, material):
        w, d = base[0] / 2, base[1] / 2
        r = min(ridge, w) / 2
        m = _matrix(loc, rot)
        v = [self.bm.verts.new(m @ Vector(p)) for p in
             ((-w, -d, 0), (w, -d, 0), (w, d, 0), (-w, d, 0), (-r, 0, height), (r, 0, height))]
        F = self.bm.faces.new
        F([v[3], v[2], v[1], v[0]])
        if r > 1e-6:
            F([v[0], v[1], v[5], v[4]])
            F([v[2], v[3], v[4], v[5]])
            F([v[1], v[2], v[5]])
            F([v[3], v[0], v[4]])
        else:
            bmesh.ops.remove_doubles(self.bm, verts=[v[4], v[5]], dist=1e-6)
            top = v[4]
            for a, b in ((0, 1), (1, 2), (2, 3), (3, 0)):
                F([v[a], v[b], top])
        alive = [x for x in v if x.is_valid]
        return self._tag(alive, material)

    def hip_roof(self, base, height, ridge=0.0, loc=(0, 0, 0), rot=(0, 0, 0), material=None):
        """Вальмовая крыша (как у средиземноморских домов). ridge — длина конька по X."""
        return self._hip_roof(base, height, ridge, loc, rot, material)

    def grid(self, size_x, size_y, nx, ny, height_fn, loc=(0, 0, 0), material=None, color_fn=None):
        """Сетка-рельеф (холмы, море): height_fn(x, y) -> z. color_fn(x, y, z) -> RGBA (по желанию)."""
        verts = []
        for j in range(ny + 1):
            row = []
            for i in range(nx + 1):
                x = -size_x / 2 + size_x * i / nx
                y = -size_y / 2 + size_y * j / ny
                row.append(self.bm.verts.new((loc[0] + x, loc[1] + y, loc[2] + height_fn(x, y))))
            verts.append(row)
        faces = []
        for j in range(ny):
            for i in range(nx):
                q = [verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]]
                # Делим на два треугольника — так рельеф выглядит «граненым» (low-poly).
                faces.append(self.bm.faces.new(q[:3]))
                faces.append(self.bm.faces.new([q[0], q[2], q[3]]))
        idx = self._index(material)
        for f in faces:
            f.material_index = idx
            if color_fn:
                c = f.calc_center_median()
                self.colors[f] = color_fn(c.x - loc[0], c.y - loc[1], c.z - loc[2])
        return faces

    def pixels(self, bitmap, origin, pixel, material, depth=None, axis="xz"):
        """Нарисовать пиксель-арт кубиками. bitmap — список строк, '#' = пиксель (верхняя строка — сверху).
        origin — левый нижний угол, pixel — размер кубика, axis 'xz' (стоит) или 'xy' (лежит)."""
        depth = depth or pixel * 0.5
        rows = len(bitmap)
        for r, line in enumerate(bitmap):
            for c, ch in enumerate(line):
                if ch != "#":
                    continue
                u, v = c * pixel + pixel / 2, (rows - 1 - r) * pixel + pixel / 2
                if axis == "xz":
                    self.box((pixel, depth, pixel), loc=(origin[0] + u, origin[1], origin[2] + v), material=material)
                else:
                    self.box((pixel, pixel, depth), loc=(origin[0] + u, origin[1] + v, origin[2]), material=material)

    def paint(self, faces, rgba):
        """Задать цвет вершин граням (для unlit-материалов неба)."""
        for f in faces:
            self.colors[f] = rgba

    # --- готово ------------------------------------------------------------
    def finish(self, name, col, location=(0, 0, 0)):
        me = bpy.data.meshes.new(name)
        if self.colors:
            self.bm.faces.ensure_lookup_table()
            layer = self.bm.loops.layers.color.new("Col")
            for f, c in self.colors.items():
                if f.is_valid:
                    for loop in f.loops:
                        loop[layer] = c
        self.bm.normal_update()
        # UV «кубической проекцией»: каждая грань получает пиксели одного размера (TEXELS_PER_METER).
        uv = self.bm.loops.layers.uv.new("UVMap")
        k = TEXELS_PER_METER / TEXTURE_SIZE
        for f in self.bm.faces:
            n = f.normal
            ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
            for loop in f.loops:
                p = loop.vert.co
                if az >= ax and az >= ay:
                    u, v = p.x, p.y
                elif ax >= ay:
                    u, v = p.y, p.z
                else:
                    u, v = p.x, p.z
                loop[uv].uv = (u * k, v * k)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.materials:
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        obj.location = location
        col.objects.link(obj)
        return obj


# ---------------------------------------------------------------------------
# Экспорт, сохранение, превью
# ---------------------------------------------------------------------------
def export_glb(objects, path, lights=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
        for child in o.children_recursive:
            child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_lights=lights, export_yup=True,
                              export_vertex_color='MATERIAL')


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, check_existing=False)


def world_color(hex_color, strength=1.0):
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = color(hex_color)
    bg.inputs["Strength"].default_value = strength
    return world


def setup_render(width, height, path):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x = width
    s.render.resolution_y = height
    s.render.resolution_percentage = 100
    s.render.filepath = path
    s.view_settings.view_transform = 'AgX'
    try:
        s.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    ee = s.eevee
    for attr, value in (("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 32)):
        if hasattr(ee, attr):
            setattr(ee, attr, value)


def bounds(objects):
    pts = []
    for o in objects:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def render_preview(objects, path, size=(640, 640), view=(1.0, -1.4, 0.75)):
    """Студийное превью одной детали: серый фон, солнце, камера смотрит на центр детали."""
    col = collection("_Preview")
    lo, hi = bounds(objects)
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.05)
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50
    cam_data.clip_end = max(1000, radius * 20)
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    col.objects.link(cam)
    direction = Vector(view).normalized()
    cam.location = center + direction * radius * 2.9
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    sun_data = bpy.data.lights.new("PreviewSun", 'SUN')
    sun_data.energy = 4.5
    sun_data.color = (1.0, 0.86, 0.7)   # тёплый «ламповый» свет, как на листе
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new("PreviewSun", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    col.objects.link(sun)
    world_color("#2a2228", 0.8)   # тёмный фон, как на листе ассетов
    fill = bpy.data.lights.new("PreviewFill", 'SUN')
    fill.energy = 0.8
    fill.color = (0.7, 0.75, 1.0)
    fill_obj = bpy.data.objects.new("PreviewFill", fill)
    fill_obj.rotation_euler = (math.radians(60), 0, math.radians(-140))
    col.objects.link(fill_obj)
    render_pixelated(path, size)


PIXEL_SCALE = 5  # во сколько раз увеличить «пиксели» превью (больше — крупнее пиксели)


def render_pixelated(path, size, scale=PIXEL_SCALE):
    """Рендер в маленьком разрешении + увеличение «квадратиками» (пиксельный вид)."""
    import numpy as np
    w, h = size[0] // scale, size[1] // scale
    small = path[:-4] + "_small.png"
    setup_render(w, h, small)
    s = bpy.context.scene
    s.render.filter_size = 0.5   # меньше сглаживания краёв — чётче пиксели
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(small)
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    big = np.repeat(np.repeat(arr, scale, axis=0), scale, axis=1)
    out = bpy.data.images.new("preview_big", w * scale, h * scale, alpha=True)
    out.pixels = big.ravel()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    os.remove(small)

# Painted Seven — круглый игровой стол с лампой над ним (low-poly, тёплый свет).
#
# Запуск из корня репозитория (без окна Blender):
#   blender --background --python assets/3d/scripts/table_with_lamp.py
# Результат:
#   assets/3d/blend/table_with_lamp.blend    — файл Blender (можно открыть и править руками)
#   assets/3d/export/table_with_lamp.glb     — модель для игры (three.js и Godot)
#   assets/3d/previews/table_with_lamp.png   — картинка-превью
#
# Единицы — метры (как в Godot). Пол на высоте 0, ось Z смотрит вверх
# (при экспорте в .glb Blender сам повернёт так, чтобы вверх смотрела Y).

import bpy
import math
import os

# ---------------------------------------------------------------------------
# НАСТРОЙКИ — меняй здесь
# ---------------------------------------------------------------------------
TABLE_RADIUS = 0.60      # радиус столешницы, м
TABLE_HEIGHT = 0.75      # высота стола от пола, м
FELT_INSET = 0.07        # ширина деревянного борта вокруг сукна, м
SEGMENTS = 16            # сколько граней у круглых деталей (меньше = «угловатее»)

LAMP_HEIGHT = 1.45       # на какой высоте висит низ абажура, м
LAMP_RADIUS = 0.24       # радиус абажура, м
CEILING = 2.6            # где кончается шнур (потолок), м
LIGHT_POWER = 140        # яркость лампы, Вт (Blender-ватты)
LIGHT_KELVIN_COLOR = (1.0, 0.72, 0.42)  # тёплый жёлтый свет (~2700 K)

# Цвета — из палитры игры (src/three/gfx.ts, PALETTE), в формате #RRGGBB.
COLORS = {
    "felt":  "#1f3b2b",   # зелёное сукно
    "wood":  "#3a2a1c",   # дерево стола
    "wood_dark": "#2a1e14",
    "gold":  "#d9b44a",   # золотой кант
    "shade": "#1f3b2b",   # абажур снаружи (как сукно)
    "shade_in": "#e6d29a",  # абажур внутри — светлый, отражает свет
    "bulb":  "#f0c070",   # цвет лампочки (lantern)
    "cord":  "#1a1a22",
    "card":  "#ebe6d6",   # бумага карт
    "card_red": "#8a1c2b",  # красный акцент — рубашка «7♠»
    "floor": "#2a1e14",
}

ADD_CARDS = True         # положить на стол пару карт для масштаба

# ---------------------------------------------------------------------------
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NAME = "table_with_lamp"


def hex_to_linear(h):
    """#RRGGBB (как в CSS) -> линейный цвет для Blender."""
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def material(name, color, roughness=0.8, metallic=0.0, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_to_linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = hex_to_linear(color)
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def put(obj, mat, collection, name):
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for c in obj.users_collection:
        c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def cylinder(r, depth, z, mat, col, name, verts=SEGMENTS):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(0, 0, z))
    return put(bpy.context.object, mat, col, name)


# --- Чистая сцена -----------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
export_col = bpy.data.collections.new("Export")        # то, что попадёт в .glb
preview_col = bpy.data.collections.new("PreviewOnly")  # пол, камера — только для картинки
scene.collection.children.link(export_col)
scene.collection.children.link(preview_col)

M = {
    "felt": material("Felt", COLORS["felt"], roughness=1.0),
    "wood": material("Wood", COLORS["wood"], roughness=0.45),
    "wood_dark": material("WoodDark", COLORS["wood_dark"], roughness=0.6),
    "gold": material("Gold", COLORS["gold"], roughness=0.35, metallic=1.0),
    "shade": material("Shade", COLORS["shade"], roughness=0.7),
    "shade_in": material("ShadeInside", COLORS["shade_in"], roughness=0.9),
    "bulb": material("Bulb", COLORS["bulb"], emission=8.0),
    "cord": material("Cord", COLORS["cord"], roughness=0.9),
    "card": material("Card", COLORS["card"], roughness=0.9),
    "card_red": material("CardBack", COLORS["card_red"], roughness=0.9),
    "floor": material("Floor", COLORS["floor"], roughness=0.8),
}

# --- Стол -------------------------------------------------------------------
top_th = 0.045
top_z = TABLE_HEIGHT - top_th / 2
cylinder(TABLE_RADIUS, top_th, top_z, M["wood"], export_col, "Table_Top")
# Сукно чуть выше столешницы.
felt_r = TABLE_RADIUS - FELT_INSET
cylinder(felt_r, 0.006, TABLE_HEIGHT + 0.003, M["felt"], export_col, "Table_Felt")
# Золотой кант вокруг сукна — тонкий тор.
bpy.ops.mesh.primitive_torus_add(major_radius=felt_r + 0.004, minor_radius=0.006,
                                 major_segments=SEGMENTS * 2, minor_segments=4,
                                 location=(0, 0, TABLE_HEIGHT + 0.004))
put(bpy.context.object, M["gold"], export_col, "Table_GoldRim")
# Мягкий борт по краю — «бублик» из тёмного дерева.
bpy.ops.mesh.primitive_torus_add(major_radius=TABLE_RADIUS - 0.015, minor_radius=0.028,
                                 major_segments=SEGMENTS * 2, minor_segments=6,
                                 location=(0, 0, TABLE_HEIGHT))
put(bpy.context.object, M["wood_dark"], export_col, "Table_Rail")
# Царга под столешницей, ножка-тумба и основание.
cylinder(TABLE_RADIUS * 0.85, 0.08, TABLE_HEIGHT - top_th - 0.04, M["wood_dark"], export_col, "Table_Apron")
cylinder(0.08, TABLE_HEIGHT - 0.12, (TABLE_HEIGHT - 0.12) / 2 + 0.04, M["wood"], export_col, "Table_Leg", verts=8)
bpy.ops.mesh.primitive_cone_add(vertices=SEGMENTS, radius1=0.34, radius2=0.12, depth=0.08,
                                location=(0, 0, 0.04))
put(bpy.context.object, M["wood_dark"], export_col, "Table_Base")

# --- Лампа ------------------------------------------------------------------
# Абажур — конус без дна, с толщиной (модификатор Solidify).
shade_h = 0.17
bpy.ops.mesh.primitive_cone_add(vertices=SEGMENTS, radius1=LAMP_RADIUS, radius2=0.05,
                                depth=shade_h, end_fill_type='NOTHING',
                                location=(0, 0, LAMP_HEIGHT + shade_h / 2))
shade = put(bpy.context.object, M["shade"], export_col, "Lamp_Shade")
shade.data.materials.append(M["shade_in"])
for poly in shade.data.polygons:  # внутренняя сторона получит второй материал
    poly.material_index = 0
solid = shade.modifiers.new("Thickness", 'SOLIDIFY')
solid.thickness = 0.006
solid.material_offset = 1          # внутренняя оболочка — светлый материал
solid.use_even_offset = True
# Золотое колечко по нижнему краю абажура.
bpy.ops.mesh.primitive_torus_add(major_radius=LAMP_RADIUS, minor_radius=0.006,
                                 major_segments=SEGMENTS * 2, minor_segments=4,
                                 location=(0, 0, LAMP_HEIGHT))
put(bpy.context.object, M["gold"], export_col, "Lamp_Ring")
# Патрон, лампочка, шнур.
cylinder(0.035, 0.06, LAMP_HEIGHT + shade_h - 0.02, M["cord"], export_col, "Lamp_Socket", verts=8)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.045,
                                      location=(0, 0, LAMP_HEIGHT + shade_h - 0.07))
bulb = put(bpy.context.object, M["bulb"], export_col, "Lamp_Bulb")
bulb.visible_shadow = False  # лампочка не должна загораживать свет
cord_len = CEILING - (LAMP_HEIGHT + shade_h)
cylinder(0.006, cord_len, LAMP_HEIGHT + shade_h + cord_len / 2, M["cord"], export_col, "Lamp_Cord", verts=6)
# Сам источник света (в .glb попадает как KHR_lights_punctual; в игре можно заменить своим).
bpy.ops.object.light_add(type='SPOT', location=(0, 0, LAMP_HEIGHT + 0.01))
light = bpy.context.object
light.name = "Lamp_Light"
light.data.energy = LIGHT_POWER
light.data.color = LIGHT_KELVIN_COLOR
light.data.spot_size = math.radians(120)
light.data.spot_blend = 0.6
light.data.shadow_soft_size = 0.05
for c in light.users_collection:
    c.objects.unlink(light)
export_col.objects.link(light)

# --- Карты на столе ---------------------------------------------------------
if ADD_CARDS:
    card_w, card_h, card_t = 0.063, 0.088, 0.0008
    layout = [(-0.12, 0.05, 12, "card_red"), (0.0, -0.02, -8, "card"), (0.11, 0.06, 20, "card")]
    for i, (x, y, rot, mat_key) in enumerate(layout):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, TABLE_HEIGHT + 0.006 + card_t / 2 + i * 0.0002),
                                        rotation=(0, 0, math.radians(rot)))
        card = bpy.context.object
        card.scale = (card_w, card_h, card_t)
        bpy.ops.object.transform_apply(scale=True)
        put(card, M[mat_key], export_col, f"Card_{i + 1}")

# --- Только для превью: пол, «вечерний» мир, камера -----------------------------
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
put(bpy.context.object, M["floor"], preview_col, "Preview_Floor")

world = bpy.data.worlds.new("Evening")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = hex_to_linear("#3a2418")
bg.inputs["Strength"].default_value = 1.2
scene.world = world

bpy.ops.object.camera_add(location=(1.8, -2.0, 1.7))
cam = bpy.context.object
cam.name = "Preview_Camera"
cam.data.lens = 40
for c in cam.users_collection:
    c.objects.unlink(cam)
preview_col.objects.link(cam)
target = bpy.data.objects.new("Preview_Target", None)
target.location = (0, 0, 1.0)
preview_col.objects.link(target)
track = cam.constraints.new('TRACK_TO')
track.target = target
scene.camera = cam

scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 960
scene.render.resolution_y = 720
scene.render.film_transparent = False
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.filepath = os.path.join(ROOT, "previews", f"{NAME}.png")
bpy.ops.render.render(write_still=True)

# --- Сохранить .blend и экспортировать .glb ------------------------------------
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "blend", f"{NAME}.blend"))

bpy.ops.object.select_all(action='DESELECT')
for obj in export_col.objects:
    obj.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, "export", f"{NAME}.glb"),
    export_format='GLB',
    use_selection=True,
    export_apply=True,      # применить модификаторы (толщина абажура)
    export_lights=True,
    export_yup=True,
)
print("OK", NAME)

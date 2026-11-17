# Превью для отработки стиля: одна деталь при двух светах.
#   studio — тёмный фон, тёплый свет сверху-слева (как на листе ассетов)
#   sunset — как в игре: оранжевое закатное солнце сзади, фиолетовое небо, тёплая лампа сверху
# Кубики модели — уже «пиксели», поэтому рендер без пикселизации, только с минимальным сглаживанием.
import math
import os

import bpy
from mathutils import Vector

import ps3d


def _light(col, name, kind, energy, color, rot=None, loc=None, size=None):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if size is not None:
        if kind == 'SUN':
            d.angle = size
        else:
            d.shadow_soft_size = size
    o = bpy.data.objects.new(name, d)
    if rot:
        o.rotation_euler = rot
    if loc:
        o.location = loc
    col.objects.link(o)
    return o


def _camera(col, objects, elevation_deg, azimuth_deg, fill=1.0, lens=50):
    lo, hi = ps3d.bounds(objects)
    center = (lo + hi) / 2
    radius = (hi - lo).length / 2
    cam_data = bpy.data.cameras.new("StyleCam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("StyleCam", cam_data)
    col.objects.link(cam)
    el, az = math.radians(elevation_deg), math.radians(azimuth_deg)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam.location = center + direction * radius * 2.6 / fill
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


def render(objects, path, mode="studio", size=(1100, 720), elevation=24, azimuth=0, fill=1.0):
    scene = bpy.context.scene
    col = ps3d.collection("_StylePreview_" + mode)
    for o in list(col.objects):
        bpy.data.objects.remove(o)
    _camera(col, objects, elevation, azimuth, fill)
    if mode == "studio":
        ps3d.world_color("#2c2630", 1.3)            # тёмный фон + мягкий рассеянный свет
        _light(col, "Key", 'SUN', 2.4, (1.0, 0.9, 0.78), rot=(math.radians(50), 0, math.radians(-30)), size=math.radians(8))
        _light(col, "Fill", 'SUN', 0.8, (0.75, 0.75, 0.95), rot=(math.radians(80), 0, math.radians(40)))
    else:
        ps3d.world_color("#3a2a52", 1.4)            # фиолетовое закатное небо — мягкий заполняющий свет
        _light(col, "Sun", 'SUN', 2.6, (1.0, 0.55, 0.28), rot=(math.radians(80), 0, math.radians(180)), size=math.radians(3))
        lo, hi = ps3d.bounds(objects)
        c = (lo + hi) / 2
        _light(col, "Lamp", 'POINT', 90, (1.0, 0.72, 0.42), loc=(c.x, c.y, hi.z + 1.1), size=0.15)
    ps3d.setup_render(size[0], size[1], path)
    scene.view_settings.view_transform = 'Standard'   # цвета палитры без «плёночной» обработки
    scene.view_settings.look = 'None'
    scene.render.filter_size = 0.8
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)

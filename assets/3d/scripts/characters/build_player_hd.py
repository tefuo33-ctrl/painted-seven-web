# Пробный персонаж в высоком качестве (мужчина): превью с 4 сторон, голова крупно, сравнение с картинкой Тима.
#
#   blender --background --python assets/3d/scripts/characters/build_player_hd.py [-- <папка с картинками>]
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "environment"))

import player_hd  # noqa: E402
import ps3d  # noqa: E402
import style_preview  # noqa: E402

PREV = os.path.join(ps3d.ASSETS, "previews", "characters")
OUT = os.path.join(ps3d.ASSETS, "export", "characters", "player")
REFS = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None


def everything(root):
    bpy.context.view_layer.update()
    return [root] + list(root.children_recursive)


def render_char(objs, path, size, elevation=6, azimuth=0, fill=0.62):
    scene = bpy.context.scene
    col = ps3d.collection("_CharLights")
    for o in list(col.objects):
        bpy.data.objects.remove(o)
    style_preview._camera(col, objs, elevation, azimuth, fill)
    ps3d.world_color("#3a3a40", 1.0)
    for name, energy, color, rot in (("Key", 2.6, (1.0, 0.96, 0.9), (50, 0, -20)),
                                     ("Fill", 0.9, (0.85, 0.88, 1.0), (65, 0, 35)),
                                     ("Rim", 1.3, (1.0, 0.9, 0.8), (-55, 0, 0))):
        d = bpy.data.lights.new(name, 'SUN')
        d.energy = energy
        d.color = color
        o = bpy.data.objects.new(name, d)
        o.rotation_euler = tuple(math.radians(a) for a in rot)
        col.objects.link(o)
    ps3d.setup_render(size[0], size[1], path)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.filter_size = 0.7
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(PREV, exist_ok=True)
    # 4 стороны
    ps3d.clear_scene()
    col = ps3d.collection("HD")
    objs = []
    for i, rz in enumerate((0, -90, 180, 90)):
        root, parts = player_hd.build(col, name=f"HD{i}")
        root.location = (i * 0.62, 0, 0)
        root.rotation_euler = (0, 0, math.radians(rz))
        objs += everything(root)
    render_char(objs, os.path.join(PREV, "player_hd_turnaround.png"), (1800, 1100), fill=0.62)
    ps3d.export_glb(objs[:len(objs) // 4], os.path.join(OUT, "player_hd_preview.glb"))
    # голова крупно: с очками и без
    ps3d.clear_scene()
    col = ps3d.collection("HDHead")
    objs = []
    for i, gl in enumerate((True, False)):
        root, parts = player_hd.build(col, glasses=gl, name=f"HH{i}")
        root.location = (i * 0.45, 0, 0)
        root.rotation_euler = (0, 0, math.radians(-12))
        bpy.context.view_layer.update()
        objs += [parts[k] for k in ("head", "hair", "glasses", "torso") if k in parts]
    render_char(objs, os.path.join(PREV, "player_hd_head.png"), (1600, 900), elevation=4, fill=0.95)
    # как на картинке Тима: чуть повернут, вид спереди-сбоку
    ps3d.clear_scene()
    col = ps3d.collection("HDOne")
    root, parts = player_hd.build(col, name="One")
    root.rotation_euler = (0, 0, math.radians(-14))
    render_char(everything(root), os.path.join(PREV, "_cmp_hd.png"), (500, 900), elevation=4, fill=0.95)
    if REFS:
        compare()


def compare():
    def load(p):
        im = bpy.data.images.load(p)
        w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]

    def fit(a, y0, y1, x0, x1, H):
        crop = a[y0:y1 + 1, x0:x1 + 1]
        s = H / crop.shape[0]
        yy = (np.arange(H) / s).astype(int).clip(0, crop.shape[0] - 1)
        xx = (np.arange(int(crop.shape[1] * s)) / s).astype(int).clip(0, crop.shape[1] - 1)
        return crop[yy][:, xx]

    r = load(os.path.join(REFS, "19.png"))
    o = load(os.path.join(PREV, "_cmp_hd.png"))
    d = np.abs(o[..., :3] - o[2, 2, :3]).sum(-1) > 0.12
    ys, xs = np.nonzero(d)
    H = 800
    rr = fit(r, 42, 434, 20, 215, H)
    cx = (xs.min() + xs.max()) // 2
    hw = int((ys.max() - ys.min()) * (195 / 392) / 2)
    oo = fit(o, ys.min(), ys.max(), max(0, cx - hw), min(o.shape[1] - 1, cx + hw), H)
    img = np.concatenate([rr, np.ones((H, 8, 4), np.float32), oo], 1)
    out = bpy.data.images.new("cmp", img.shape[1], img.shape[0])
    out.pixels = img[::-1].ravel()
    out.filepath_raw = os.path.join(PREV, "player_hd_compare.png")
    out.file_format = 'PNG'
    out.save()


main()
print("OK hd")

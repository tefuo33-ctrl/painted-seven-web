"""Золотой слиток — игровая валюта Painted Seven. ВОКСЕЛЬНЫЙ стиль (кубики 0.5 см).

Форма: трапеция (низ шире верха), фаски по рёбрам, на верхней грани вдавлена цифра «7».
Цвет: насыщенное золото, светлые кромки, тёмные впадины гравировки; чуть светится (тёплый блик на сукне).
Начало координат — середина низа слитка. Размер ~ 8 × 3.6 × 2.2 см."""
import numpy as np

from voxel import Grid, Palette

VOXEL = 0.005
LEN, WID, HGT = 0.08, 0.034, 0.024      # как на картинке: брусок, длина втрое больше высоты, торец почти квадратный
TAPER = 0.008                           # насколько верх уже низа с каждой стороны
SEVEN = ["#####", "....#", "...#.", "..#..", ".#...", ".#..."]   # гравировка «7» (кубики)

GOLD = Palette("GoldBar", ["#5a3208", "#8a5410", "#b87a1c", "#d89a2a", "#f0bc44", "#ffe08a", "#fff4c8"],
               base=3, roughness=0.25, metallic=0.9, emission="#c8861c", emission_strength=0.15)
MAT_GOLD = 1
PREVIEW_VIEW = (0.0, -0.25, 0.12)


def build(col):
    """Low-poly трапеция с фасками + пиксельная текстура (золото мозаикой, «7» вдавлена на верхней грани)."""
    import os
    import sys
    import math
    import bmesh
    import bpy
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "characters"))
    import base_male as bm
    hx, hy, tx, ty = LEN / 2, WID / 2, LEN / 2 - TAPER, WID / 2 - TAPER
    me = bpy.data.meshes.new("GoldBar")
    b = bmesh.new()
    vs = [b.verts.new(v) for v in ((-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0),
                                   (-tx, -ty, HGT), (tx, -ty, HGT), (tx, ty, HGT), (-tx, ty, HGT))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        b.faces.new([vs[i] for i in f])
    bmesh.ops.bevel(b, geom=b.edges[:], offset=0.0035, segments=1, affect='EDGES')
    bmesh.ops.triangulate(b, faces=b.faces[:])
    b.to_mesh(me)
    b.free()
    obj = bpy.data.objects.new("GoldBar", me)
    col.objects.link(obj)
    for poly in me.polygons:
        poly.use_smooth = False
    bm.smart_uv(obj)
    C = bm.C
    TOP = [C("#c86a06"), C("#dc7606"), C("#ea9e1f"), C("#f5c24c")]
    SIDE = [C("#c26408"), C("#da7505"), C("#f0960e"), C("#f8ac2a")]
    END = [C("#5f2302"), C("#763206"), C("#a6520c")]
    EDGE = [C("#fdd152"), C("#feee8e"), C("#fff6c8")]
    DARK = C("#742c03")
    rng = np.random.default_rng(3)
    blot = rng.random((40, 12)) < 0.35                                # тёмная «надпись» на длинной грани

    def color(pos, nrm, noise):
        n = len(pos)
        c = np.zeros((n, 4), np.float32)
        ax, ay, az = np.abs(nrm[:, 0]), np.abs(nrm[:, 1]), nrm[:, 2]
        top = az > 0.9
        long_side = (ay > 0.9) & ~top
        end = (ax > 0.9) & ~top
        bevel = ~(top | long_side | end) & (az > -0.5)
        c[top] = bm.tone(TOP, np.full(top.sum(), 0.45), noise[top] * 2.2)
        c[long_side] = bm.tone(SIDE, np.full(long_side.sum(), 0.6), noise[long_side] * 1.6)
        c[end] = bm.tone(END, np.full(end.sum(), 0.5), noise[end] * 1.4)
        c[bevel] = bm.tone(EDGE, np.full(bevel.sum(), 0.5), noise[bevel] * 1.5)      # светящиеся рёбра
        c[az <= -0.5] = DARK
        low = long_side | end
        c[low & (pos[:, 2] < 0.004)] = DARK                                           # тёмный низ
        ins = long_side & (np.abs(pos[:, 0]) < LEN * 0.3) & (pos[:, 2] > HGT * 0.3) & (pos[:, 2] < HGT * 0.75)
        ix = ((pos[:, 0] + LEN * 0.3) / 0.004).astype(int).clip(0, 39)
        iz = ((pos[:, 2] - HGT * 0.3) / 0.004).astype(int).clip(0, 11)
        mark = ins & blot[ix, iz]
        c[mark] = C("#c05a06")
        return c
    size = bm.texture_size_for(obj, 0.004)
    tex = bm.paint_uv(obj, size, color, seed=7)
    m =bm.tex_material("GoldBarMat", bm.image("GoldBarTex", tex[::-1]))
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.25
    bsdf.inputs["Roughness"].default_value = 0.4
    tx = m.node_tree.nodes["Image Texture"]                         # золото чуть светится, как на картинке
    m.node_tree.links.new(tx.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.35
    me.materials.append(m)
    print("GoldBar faces:", len(me.polygons), "texture", size)
    return [obj]

def preview(objects, path):
    """Слиток на сукне стола под тёплым светом (как на картинке)."""
    import math
    import bpy
    import ps3d
    from mathutils import Vector
    col = ps3d.collection("_GoldPreview")
    felt = bpy.data.materials.new("Felt")
    felt.diffuse_color = (0.06, 0.12, 0.06, 1)
    felt.use_nodes = True
    felt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.022, 0.04, 0.018, 1)
    felt.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    bpy.ops.mesh.primitive_plane_add(size=1.0)
    pl = bpy.context.object
    pl.data.materials.append(felt)
    for c in list(pl.users_collection):
        c.objects.unlink(pl)
    col.objects.link(pl)
    o = objects[0]
    o.rotation_euler = (0, 0, math.radians(22))       # виден тёмный торец слева, как на картинке
    for name, kind, energy, colr, loc in (("Lamp", 'POINT', 18, (1.0, 0.7, 0.4), (-0.1, 0.25, 0.35)),
                                          ("Fill", 'POINT', 4, (1.0, 0.55, 0.3), (0.2, -0.2, 0.2))):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = colr
        d.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(name, d)
        lo.location = loc
        col.objects.link(lo)
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 50
    cam = bpy.data.objects.new("Cam", cd)
    col.objects.link(cam)
    cam.location = (-0.02, -0.25, 0.11)
    cam.rotation_euler = (Vector((0.0, 0.0, 0.012)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    ps3d.world_color("#1a0e08", 0.4)
    ps3d.setup_render(1400, 800, path)
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    bpy.ops.render.render(write_still=True)

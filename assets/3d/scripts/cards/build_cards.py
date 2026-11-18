# Собирает колоду: пиксельные атласы карт (на каждый язык игры), 3D-модель карты и превью.
#
#   blender --background --python assets/3d/scripts/cards/build_cards.py
#
# Результат:
#   export/cards/cards.png             — атлас 1280×960 (ячейка 128×192), раскладка как в игре (cardAtlas.ts);
#                                        карты на английском (J, Q, K, A)
#   export/cards/cards@2x.png          — то же вдвое крупнее (2560×1920 — как сейчас рисует игра: 4× от 64×96)
#   export/cards/cards.glb             — 36 карт (тонкие, со скруглёнными углами), лицо/рубашка/торец из атласа
#   previews/cards/*.png               — атлас, джокер крупно, карты на столе
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "environment"))

import cards  # noqa: E402
import ps3d  # noqa: E402

OUT = os.path.join(ps3d.ASSETS, "export", "cards")
PREV = os.path.join(ps3d.ASSETS, "previews", "cards")
CARD_W, CARD_H, CARD_T = 0.064, 0.096, 0.0006     # 1 пиксель ячейки = 0.5 мм; толщина 0.6 мм
CORNER = 7 * 0.0005                                # скругление угла — как на рисунке (7 пикселей)


def save_png(a, path, scale=1):
    if scale > 1:
        a = np.repeat(np.repeat(a, scale, 0), scale, 1)
    h, w = a.shape[:2]
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    im.pixels = np.ascontiguousarray(a[::-1]).ravel()
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    return im


def cell_rect(cell):
    r, c = divmod(cell, cards.COLS)
    return c / cards.COLS, 1 - (r + 1) / cards.ROWS, (c + 1) / cards.COLS, 1 - r / cards.ROWS   # u0, v0, u1, v1


def outline_pts(n=4):
    hw, hh, r = CARD_W / 2, CARD_H / 2, CORNER
    pts = []
    for cx, cy, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def card_mesh(name, front_cell, material):
    """Карта лежит в плоскости XY лицом вверх (+Z), верх картинки — к +Y."""
    pts = outline_pts()
    n = len(pts)
    t = CARD_T / 2
    verts = [(x, y, t) for x, y in pts] + [(x, y, -t) for x, y in pts]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    fu0, fv0, fu1, fv1 = cell_rect(front_cell)
    bu0, bv0, bu1, bv1 = cell_rect(cards.CELL_BACK)
    eu0, ev0, eu1, ev1 = cell_rect(cards.CELL_EDGE)
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            x, y, z = verts[vi]
            fx, fy = x / CARD_W + 0.5, y / CARD_H + 0.5
            if poly.index == 0:
                uv.data[li].uv = (fu0 + fx * (fu1 - fu0), fv0 + fy * (fv1 - fv0))
            elif poly.index == 1:                                   # рубашка (зеркально по X)
                uv.data[li].uv = (bu0 + (1 - fx) * (bu1 - bu0), bv0 + fy * (bv1 - bv0))
            else:
                uv.data[li].uv = ((eu0 + eu1) / 2, (ev0 + ev1) / 2)
    me.materials.append(material)
    me.update()
    return me


def atlas_material(image):
    m = bpy.data.materials.new("CardAtlas")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = 'Closest'                                  # пиксели остаются чёткими
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    return m


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    ps3d.clear_scene()
    for old in ("cards_ru.png", "cards_ru@2x.png", "cards_de.png", "cards_de@2x.png", "cards_en.png",
                "cards_en@2x.png"):
        if os.path.exists(os.path.join(OUT, old)):
            os.remove(os.path.join(OUT, old))
    a = cards.atlas()
    image = save_png(a, os.path.join(OUT, "cards.png"))
    save_png(a, os.path.join(OUT, "cards@2x.png"), 2)
    dark = (0.09, 0.07, 0.07, 1.0)

    def on_dark(img):
        q = img.copy()
        q[q[..., 3] < 0.5] = dark
        return q

    # Превью как лист на референсе: 4 ряда мастей (червы, бубны, трефы, пики) + рубашка.
    gap = 10
    rows = []
    for suit in ("hearts", "diamonds", "clubs", "spades"):
        row = []
        for rank in cards.RANKS:
            row += [on_dark(cards.card(rank, suit)), np.full((cards.H, gap, 4), dark, np.float32)]
        rows += [np.concatenate(row, 1), np.full((gap, (cards.W + gap) * 9, 4), dark, np.float32)]
    sheet = np.concatenate(rows, 0)
    back = np.full((cards.H, sheet.shape[1], 4), dark, np.float32)
    back[:, :cards.W] = on_dark(cards.back_card())
    save_png(np.concatenate([sheet, back], 0), os.path.join(PREV, "cards_sheet.png"), 1)
    picks = [cards.card(7, "spades"), cards.card(14, "hearts"), cards.card(11, "hearts"), cards.card(12, "diamonds"),
             cards.card(13, "clubs"), cards.card(9, "hearts"), cards.back_card()]
    row = []
    for p in picks:
        row += [on_dark(p), np.full((cards.H, 8, 4), dark, np.float32)]
    save_png(np.concatenate(row, 1), os.path.join(PREV, "cards_closeup.png"), 3)
    faces = []                                                              # все 12 фигур: 4 масти × J, Q, K
    for suit in ("hearts", "diamonds", "clubs", "spades"):
        r = []
        for rank in (11, 12, 13):
            r += [on_dark(cards.card(rank, suit)), np.full((cards.H, 8, 4), dark, np.float32)]
        faces += [np.concatenate(r, 1), np.full((8, (cards.W + 8) * 3, 4), dark, np.float32)]
    save_png(np.concatenate(faces, 0), os.path.join(PREV, "cards_faces.png"), 2)
    # 3D-карты: 36 лиц + рубашка у каждой; атлас внутри .glb.
    mat = atlas_material(image)
    col = ps3d.collection("Cards")
    objs = []
    for si, suit in enumerate(cards.SUITS):
        for ri, rank in enumerate(cards.RANKS):
            name = f"card_{suit}_{rank}"
            o = bpy.data.objects.new(name, card_mesh(name, si * len(cards.RANKS) + ri, mat))
            col.objects.link(o)
            o.location = (ri * 0.07, -si * 0.10, 0)
            objs.append(o)
    ps3d.export_glb(objs, os.path.join(OUT, "cards.glb"))
    ps3d.save_blend(os.path.join(ps3d.ASSETS, "blend", "cards", "cards.blend"))
    preview_table(os.path.join(OUT, "cards.png"))
    print("OK cards")


def preview_table(atlas_path):
    """Карты на нашем покерном столе: веер в руке игрока, колода, козырь, взятка."""
    ps3d.clear_scene()
    mat = atlas_material(bpy.data.images.load(atlas_path))
    col = ps3d.collection("Preview")
    from parts import poker_table
    table = poker_table.build(col)[0]
    felt = 0.72 + CARD_T / 2 + 0.0002
    cards_idx = {(s, r): si * 9 + ri for si, s in enumerate(cards.SUITS) for ri, r in enumerate(cards.RANKS)}
    layout = []
    hand = [("hearts", 6), ("clubs", 9), ("diamonds", 12), ("spades", 13), ("hearts", 14), ("spades", 7)]
    for i, (s, r) in enumerate(hand):                                       # веер ближе к нам
        a = (i - 2.5) * 9
        layout.append(((s, r), (-0.02 + (i - 2.5) * 0.035, -0.50 + abs(i - 2.5) * 0.006, felt + i * 0.0007), a))
    trick = [("hearts", 10), ("hearts", 11), ("clubs", 14)]
    for i, (s, r) in enumerate(trick):                                      # взятка в центре
        layout.append(((s, r), (-0.10 + i * 0.09, -0.08 + (i % 2) * 0.02, felt), (i - 1) * 14))
    objs = [table]
    for i, ((s, r), loc, ang) in enumerate(layout):
        o = bpy.data.objects.new(f"c{i}", card_mesh(f"c{i}", cards_idx[(s, r)], mat))
        col.objects.link(o)
        o.location = loc
        o.rotation_euler = (0, 0, math.radians(ang))
        objs.append(o)
    for k in range(8):                                                      # колода рубашкой вверх и козырь
        o = bpy.data.objects.new(f"d{k}", card_mesh(f"d{k}", cards_idx[("spades", 6)], mat))
        col.objects.link(o)
        o.location = (0.22, 0.18, felt + 0.0008 + k * CARD_T * 1.2)
        o.rotation_euler = (math.pi, 0, math.radians(8 + k * 0.6))
        objs.append(o)
    trump = bpy.data.objects.new("trump", card_mesh("trump", cards_idx[("diamonds", 8)], mat))
    col.objects.link(trump)
    trump.location = (0.22, 0.12, felt)
    trump.rotation_euler = (0, 0, math.radians(90))
    objs.append(trump)
    # камера игрока над столом, тёплый свет лампы
    cd = bpy.data.cameras.new("Cam")
    cd.lens = 32
    cam = bpy.data.objects.new("Cam", cd)
    col.objects.link(cam)
    cam.location = (0.0, -1.05, 1.32)
    from mathutils import Vector
    cam.rotation_euler = (Vector((0, -0.12, 0.72)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    ps3d.world_color("#2a2230", 0.6)
    for name, kind, energy, colr, loc in (("Lamp", 'POINT', 60, (1.0, 0.78, 0.5), (0.0, 0.1, 1.6)),
                                          ("Fill", 'POINT', 12, (0.7, 0.6, 0.9), (-0.8, -0.8, 1.4))):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = colr
        d.shadow_soft_size = 0.1
        o = bpy.data.objects.new(name, d)
        o.location = loc
        col.objects.link(o)
    ps3d.setup_render(1600, 1000, os.path.join(PREV, "cards_table.png"))
    sc = bpy.context.scene
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.filter_size = 0.7
    bpy.ops.render.render(write_still=True)


main()

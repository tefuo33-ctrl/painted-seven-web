# Собирает игрового персонажа: все сменные части (.glb), схему для игры (JSON) и превью.
#
#   blender --background --python assets/3d/scripts/characters/build_player.py [-- <папка с картинками для сравнения>]
#
# Результат:
#   export/characters/player/body_<костюм>.glb   — тело в костюме: части-«куклы» с шарнирами (Player → таз → …)
#   export/characters/player/hair_<причёска>.glb — причёска (крепится к части head)
#   export/characters/player/glasses_<очки>.glb  — очки (крепятся к части head)
#   export/characters/player/player.json         — части, шарниры, кто к чему крепится, позы
#   previews/characters/player_*.png             — вид с 4 сторон (мужчина/женщина), варианты, головы, «сидит»
import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "environment"))

import ps3d  # noqa: E402
import player  # noqa: E402
import style_preview  # noqa: E402

OUT = os.path.join(ps3d.ASSETS, "export", "characters", "player")
PREV = os.path.join(ps3d.ASSETS, "previews", "characters")
BLEND = os.path.join(ps3d.ASSETS, "blend", "characters")
REFS = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None


def everything(root):
    bpy.context.view_layer.update()                 # пересчитать положения вложенных частей
    return [root] + list(root.children_recursive)


def export_parts():
    os.makedirs(OUT, exist_ok=True)
    for outfit in player.OUTFITS:
        ps3d.clear_scene()
        col = ps3d.collection("Player")
        root, parts = player.build(col, outfit=outfit, hair="slick", glasses="none")
        bpy.data.objects.remove(parts.pop("hair"))
        ps3d.export_glb(everything(root), os.path.join(OUT, f"body_{outfit}.glb"))
    head_pivot = player.BONES["head"][0]
    for style in player.HAIRSTYLES:
        ps3d.clear_scene()
        g, pal = player.make_hair(style)
        o = player._object(g, g.mat > 0, f"hair_{style}", pal, ps3d.collection("Hair"), head_pivot)
        o.location = (0, 0, 0)                      # в игре: ребёнок части head, без сдвига
        ps3d.export_glb([o], os.path.join(OUT, f"hair_{style}.glb"))
    for style in player.GLASSES:
        if style == "none":
            continue
        ps3d.clear_scene()
        g, pal = player.make_glasses(style)
        o = player._object(g, g.mat > 0, f"glasses_{style}", pal, ps3d.collection("Glasses"), head_pivot)
        o.location = (0, 0, 0)
        ps3d.export_glb([o], os.path.join(OUT, f"glasses_{style}.glb"))
    info = {
        "units": "метры; пол z = 0 (glTF: Y вверх), персонаж смотрит на -Y (в glTF — на +Z)",
        "voxel": player.VOXEL,
        "bodies": {b: {name: {"pivot": v[0], "parent": v[4]} for name, v in player.bones(b).items()}
                   for b in player.BODIES},
        "outfits": {k: v["body"] for k, v in player.OUTFITS.items()},
        "attach": {"hair": "head", "glasses": "head"},
        "hairstyles": list(player.HAIRSTYLES), "glasses": list(player.GLASSES),
        "poses": {k: {"rot_deg": v["rot"], "offset": v["offset"]} for k, v in player.POSES.items()},
        "note": "позу задают поворотами частей вокруг их шарниров (начало координат каждой части — в шарнире)",
    }
    with open(os.path.join(OUT, "player.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)


def render_char(objs, path, size, elevation=6, azimuth=0, fill=0.62):
    """Свет для персонажа (как на картинках Тима): ключевой спереди-сверху, заполняющий, контровой сзади."""
    scene = bpy.context.scene
    col = ps3d.collection("_CharLights")
    for o in list(col.objects):
        bpy.data.objects.remove(o)
    style_preview._camera(col, objs, elevation, azimuth, fill)
    ps3d.world_color("#3a3a40", 1.2)
    for name, energy, color, rot in (("Key", 3.0, (1.0, 0.95, 0.88), (50, 0, -20)),
                                     ("Fill", 1.2, (0.85, 0.88, 1.0), (65, 0, 35)),
                                     ("Rim", 1.5, (1.0, 0.9, 0.8), (-55, 0, 0))):
        d = bpy.data.lights.new(name, 'SUN')
        d.energy = energy
        d.color = color
        o = bpy.data.objects.new(name, d)
        o.rotation_euler = tuple(math.radians(a) for a in rot)
        col.objects.link(o)
    ps3d.setup_render(size[0], size[1], path)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.filter_size = 0.8
    bpy.ops.render.render(write_still=True)


def lineup(name, combos, rots, path, size=(1600, 1000), fill=0.62):
    ps3d.clear_scene()
    col = ps3d.collection(name)
    objs = []
    for i, ((o, h, gl), rz) in enumerate(zip(combos, rots)):
        root, parts = player.build(col, outfit=o, hair=h, glasses=gl, name=f"{name}{i}")
        root.location = (i * 0.62, 0, 0)
        root.rotation_euler = (0, 0, math.radians(rz))
        objs += everything(root)
    render_char(objs, path, size, fill=fill)


def single(combo, rz, path, size=(500, 640)):
    ps3d.clear_scene()
    col = ps3d.collection("Single")
    root, parts = player.build(col, outfit=combo[0], hair=combo[1], glasses=combo[2], name="One")
    root.rotation_euler = (0, 0, math.radians(rz))
    render_char(everything(root), path, size, fill=0.95)


def previews():
    os.makedirs(PREV, exist_ok=True)
    man = ("cream_double", "pompadour", "square")
    woman = ("black_skirt", "wavy_long", "square")
    lineup("M", [man] * 4, (0, -90, 180, 90), os.path.join(PREV, "player_turnaround.png"))
    lineup("F", [woman] * 4, (0, -90, 180, 90), os.path.join(PREV, "player_turnaround_female.png"))
    lineup("V", [man, ("navy_pinstripe", "slick", "square"), ("black_suit", "pompadour", "none"),
                 ("beige_vest", "slick", "none"), woman, ("black_skirt_red", "bun", "none")], [0] * 6,
           os.path.join(PREV, "player_variants.png"), size=(1900, 1000), fill=0.5)
    # Головы крупно: с очками и без.
    ps3d.clear_scene()
    col = ps3d.collection("Head")
    objs = []
    for i, combo in enumerate((man, (man[0], man[1], "none"), woman, (woman[0], woman[1], "none"))):
        root, parts = player.build(col, outfit=combo[0], hair=combo[1], glasses=combo[2], name=f"H{i}")
        root.location = (i * 0.5, 0, 0)
        bpy.context.view_layer.update()
        objs += [parts[k] for k in ("head", "hair", "glasses", "torso") if k in parts]
    render_char(objs, os.path.join(PREV, "player_heads.png"), (1800, 800), elevation=4, fill=0.9)
    # Для сравнения с картинками Тима: по одному виду.
    single(man, 0, os.path.join(PREV, "_cmp_man_front.png"))
    single(man, -90, os.path.join(PREV, "_cmp_man_side.png"))
    single(woman, 0, os.path.join(PREV, "_cmp_woman_front.png"))
    single(woman, 90, os.path.join(PREV, "_cmp_woman_side.png"))
    # Сидит на стуле (наш стул).
    ps3d.clear_scene()
    col = ps3d.collection("Sit")
    from parts import chair
    ch = chair.build(col)[0]
    root, parts = player.build(col, pose="sit", name="S")
    root.location = (root.location[0], 0.06, root.location[2] + chair.SEAT_TOP - 0.48)
    render_char(everything(root) + [ch], os.path.join(PREV, "player_sit.png"), (1000, 1100), elevation=10,
                azimuth=-35, fill=0.9)
    os.makedirs(BLEND, exist_ok=True)
    ps3d.save_blend(os.path.join(BLEND, "player.blend"))


def compare():
    """Картинка Тима и наш рендер рядом, одной высоты (по рамке фигуры)."""
    if not REFS:
        return

    def load(p):
        im = bpy.data.images.load(p)
        w, h = im.size
        return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]

    def bbox(a, bgc):
        d = np.abs(a[..., :3] - bgc).sum(-1) > 0.15
        ys, xs = np.nonzero(d)
        return ys.min(), ys.max(), xs.min(), xs.max()

    def fit(a, y0, y1, x0, x1, H):
        crop = a[y0:y1 + 1, x0:x1 + 1]
        s = H / crop.shape[0]
        yy = (np.arange(H) / s).astype(int).clip(0, crop.shape[0] - 1)
        W = int(crop.shape[1] * s)
        xx = (np.arange(W) / s).astype(int).clip(0, crop.shape[1] - 1)
        return crop[yy][:, xx]

    rows = []
    for ref, ours, (ry0, ry1) in (("16.png", "_cmp_man_front.png", (21, 591)), ("15.png", "_cmp_man_side.png", (12, 563)),
                                  ("17.png", "_cmp_woman_front.png", (52, 555)), ("18.png", "_cmp_woman_side.png", (66, 630))):
        r = load(os.path.join(REFS, ref))
        o = load(os.path.join(PREV, ours))
        H = 600
        cx = r.shape[1] // 2
        rr = fit(r, ry0, ry1, max(0, cx - 160), min(r.shape[1] - 1, cx + 160), H)
        y0, y1, x0, x1 = bbox(o, o[2, 2, :3])
        pad = int((y1 - y0) * 0.02)
        oo = fit(o, max(0, y0 - pad), min(o.shape[0] - 1, y1 + pad), max(0, (x0 + x1) // 2 - 170),
                 min(o.shape[1] - 1, (x0 + x1) // 2 + 170), H)
        gap = np.ones((H, 6, 4), np.float32)
        rows += [rr, gap, oo, np.ones((H, 30, 4), np.float32) * 0.15]
    img = np.concatenate(rows, 1)
    out = bpy.data.images.new("cmp", img.shape[1], img.shape[0])
    out.pixels = img[::-1].ravel()
    out.filepath_raw = os.path.join(PREV, "player_compare.png")
    out.file_format = 'PNG'
    out.save()


export_parts()
previews()
compare()
print("OK player")

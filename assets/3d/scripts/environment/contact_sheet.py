# Склеивает превью деталей в один лист (как лист ассетов) — чтобы смотреть всё сразу.
#   blender --background --python assets/3d/scripts/environment/contact_sheet.py -- имя_листа деталь1 деталь2 ...
# Без списка деталей — берёт все превью из previews/environment/.
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ps3d  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
sheet_name = args[0] if args else "_sheet_all"
names = args[1:] or sorted(f[:-4] for f in os.listdir(ps3d.PREVIEW_DIR)
                           if f.endswith(".png") and not f.startswith("_") and f != "terrace_scene.png")
CELL = 320
COLS = min(5, len(names))
rows = (len(names) + COLS - 1) // COLS
sheet = np.zeros((rows * CELL, COLS * CELL, 4), dtype=np.float32)
sheet[..., :3] = (0.13, 0.11, 0.14)
sheet[..., 3] = 1
for i, name in enumerate(names):
    img = bpy.data.images.load(os.path.join(ps3d.PREVIEW_DIR, name + ".png"))
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    step = max(1, w // CELL)
    a = a[::step, ::step][:CELL, :CELL]
    r, c = rows - 1 - i // COLS, i % COLS
    sheet[r * CELL:r * CELL + a.shape[0], c * CELL:c * CELL + a.shape[1]] = a
    bpy.data.images.remove(img)
out = bpy.data.images.new("sheet", COLS * CELL, rows * CELL, alpha=True)
out.pixels = sheet.ravel()
out.filepath_raw = os.path.join(ps3d.PREVIEW_DIR, sheet_name + ".png")
out.file_format = 'PNG'
out.save()
print("OK sheet", out.filepath_raw)

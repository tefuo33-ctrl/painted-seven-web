# Собирает детали окружения ПО ОДНОЙ: для каждой — свой .glb, .blend и превью.
#
# Все детали:
#   blender --background --python assets/3d/scripts/environment/build_parts.py
# Только некоторые (имена файлов из папки parts/ без .py):
#   blender --background --python assets/3d/scripts/environment/build_parts.py -- baluster floor_tiles
#
# Результат: export/environment/<деталь>.glb, blend/environment/parts/<деталь>.blend,
#            previews/environment/<деталь>.png

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import ps3d  # noqa: E402

PARTS = [
    "floor_tiles", "baluster", "balustrade", "balustrade_post", "post_lantern",
    "column_arch", "hanging_lantern", "flower_urn", "vines", "tree_branch",
    "house", "church", "cypress", "town_hill", "island_fort", "sailboat",
    "mountains", "sea", "sky", "sun",
]


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    names = args or PARTS
    for name in names:
        ps3d.clear_scene()
        module = importlib.import_module("parts." + name)
        importlib.reload(module)
        col = ps3d.collection(name)
        objects = module.build(col)
        ps3d.export_glb(objects, os.path.join(ps3d.EXPORT_DIR, name + ".glb"))
        path = os.path.join(ps3d.PREVIEW_DIR, name + ".png")
        if hasattr(module, "preview"):        # у детали своё превью (например, воксельный стиль)
            module.preview(objects, path)
        else:
            ps3d.render_preview(objects, path, view=getattr(module, "PREVIEW_VIEW", (1.0, -1.4, 0.75)))
        ps3d.save_blend(os.path.join(ps3d.BLEND_DIR, "parts", name + ".blend"))
        print("OK part", name)


main()

# Проверка связи с Blender: куб -> .blend + PNG-превью.
# Запуск: blender --background --python assets/3d/scripts/test_cube.py
import bpy, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1)
bpy.ops.object.light_add(type='SUN', location=(3, -3, 5))
bpy.ops.object.camera_add(location=(3, -3, 2.5), rotation=(1.1, 0, 0.785))
s = bpy.context.scene
s.camera = bpy.context.object
s.render.engine = 'BLENDER_EEVEE'
s.render.resolution_x = s.render.resolution_y = 256
s.render.filepath = os.path.join(ROOT, "previews", "test_cube.png")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "blend", "test_cube.blend"))
print("OK test_cube")

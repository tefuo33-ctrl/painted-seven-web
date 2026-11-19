"""Пол террасы: мраморные плиты трёх оттенков со швами, слегка блестят (отражают закат)."""
import random

from ps3d import Mesh, mat

# НАСТРОЙКИ
SIZE_X = 20.0       # ширина пола, м
SIZE_Y = 10.0       # глубина пола, м
TILE = 0.9          # размер плиты, м
GAP = 0.025         # ширина шва, м
GLOSS = 0.18        # шероховатость плит: меньше — сильнее отражения
SEED = 12           # другое число — другой узор оттенков

PREVIEW_VIEW = (0.4, -1.0, 0.8)


def build(col):
    rnd = random.Random(SEED)
    tones = [mat(f"Marble{i}", f"marble_{i}", roughness=GLOSS) for i in (1, 2, 3)]
    grout = mat("Grout", "grout", roughness=0.9)
    m = Mesh()
    m.box((SIZE_X, SIZE_Y, 0.04), loc=(0, -SIZE_Y / 2, -0.03), material=grout)
    nx, ny = int(SIZE_X / TILE), int(SIZE_Y / TILE)
    for j in range(ny):
        for i in range(nx):
            x = -SIZE_X / 2 + TILE * (i + 0.5)
            y = -TILE * (j + 0.5)
            m.box((TILE - GAP, TILE - GAP, 0.03), loc=(x, y, -0.015), material=rnd.choice(tones))
    return [m.finish("Floor", col)]

"""Море: волны и солнечная дорожка, нарисованные пикселями (как на картинке Тима).

Клетки крупнеют с расстоянием (вблизи 3 м, у горизонта ~150 м); одинаковые соседние клетки в ряду
склеиваются в одну полоску (меньше граней).
  * волны — короткие светлые «гребни» и тёмные «ложбинки» вдоль горизонта;
  * солнечная дорожка — как на настоящем фото заката: НЕ сплошная полоса, а столб из отдельных коротких
    бликов на гребнях волн с тёмными промежутками (впадины). У горизонта узкая и плотная, к нам — шире и
    реже, блики крупнее; по краям редкие оранжево-красные искры.
    Это отдельный светящийся материал SeaGlint. Дорожка строится от положения солнца (sun_pos):
    в игре её пересчитывают, когда солнце двигается."""
import math

import bpy
import numpy as np

from bg_common import raspberry
from voxel import Palette, hex_srgb, voxel_material

# Тона воды сняты с картинки Тима: тёмный, основной, светлее, розоватый блик гребня.
SEA = Palette("Sea", ["#2a1428", "#3c2036", "#4a2c4c", "#583458", "#693b5f", "#7a4058", "#843f57", "#9a4a5a"],
              base=3, roughness=0.6, specular=0.0)   # цвет мазков светит сам (без отражения неба — иначе вода серая)
# Солнечная дорожка — цвета сняты пикселями с картинки: середина насыщенная жёлто-золотая
# (#ffdc57…#ffe963), края оранжевые (#fca332), вокруг — красно-оранжевые отблески.
GLINT = Palette("SeaGlint", ["#c8442e", "#e05a2c", "#f07a30", "#fca332", "#ffc848", "#ffdc57", "#ffe963"],
                base=4, roughness=0.6, specular=0.0)
DETAIL = 2.0               # детальность воды: во сколько раз мельче «пиксели» (1 — как было)
WAVE_STROKE = (2, 9)       # длина мазка волны, клеток
# Солнечная дорожка (замерено по фото Тима): полуширина в градусах = GLINT_HW0 + GLINT_HW_GROW * (на сколько
# градусов ряд ниже горизонта). У горизонта ≈ 0.75 ширины солнца, внизу кадра ≈ 2 ширины солнца.
GLINT_HW0 = 0.95
GLINT_HW_GROW = 0.12
GLINT_DENSITY = 0.85       # сколько клеток в середине дорожки — блики (остальное — тёмные промежутки)
GLINT_SHEEN = 3.0          # до скольких полуширин долетают редкие оранжевые искры
WAVE_LEN = 9.0             # длина волны, м: гребни (много бликов) и впадины (мало) чередуются
FAR = 7000.0


def make_sea(col, sea_z, camera=(0.0, -6.0), sun_pos=(0.0, 3500.0), seed=5):
    rng = np.random.default_rng(seed)
    sun_az = math.degrees(math.atan2(sun_pos[0] - camera[0], sun_pos[1] - camera[1]))
    # Клетки подогнаны под экран: каждая — примерно одинаковый «пиксель» в кадре.
    # Ряды в глубину (dy) растут как y², клетки вдоль горизонта (dx) — как y.
    eye = 31.7
    rows = []
    y = 4.0
    while y < FAR:
        dy = max(2.0 / DETAIL, 0.00009 / DETAIL * y * y)
        rows.append((y, min(FAR, y + dy), max(2.5 / DETAIL, y * 0.011 / DETAIL)))
        y += dy
    verts, faces, cols, mats = [], [], [], []
    for row_i, (y0, y1, step) in enumerate(rows):
        crest_row = row_i % 3 == 0              # каждый третий ряд — «линия гребней» (волны идут полосами)
        ym = (y0 + y1) / 2
        ext = min(FAR, ym * 1.0 + 300)
        n = int(math.ceil(2 * ext / step))
        xs = np.linspace(-ext, ext, n + 1)
        xc = (xs[:-1] + xs[1:]) / 2
        # Солнечная дорожка: отдельные блики на гребнях волн (как на фото), между ними — тёмная вода.
        az = np.degrees(np.arctan2(xc - camera[0], ym - camera[1]))
        off = np.abs(az - sun_az)
        dep = math.degrees(math.atan2(eye, ym))              # на сколько градусов ряд ниже горизонта
        hw = GLINT_HW0 + GLINT_HW_GROW * dep                 # полуширина дорожки, градусы
        prof = np.exp(-0.7 * (off / hw) ** 4)                # яркость поперёк: ровная середина, рваные края
        # Волны поперёк дорожки: гребень (много бликов) — впадина (мало). Вдали ряд шире волны — случайно.
        if y1 - y0 < 0.7 * WAVE_LEN:
            amp = 0.5 + 0.5 * math.sin(2 * math.pi * ym / WAVE_LEN + 1.3 * math.sin(ym * 0.37)) + rng.normal(0, 0.15)
        else:
            amp = rng.random()
        amp = float(np.clip(amp, 0.0, 1.0))
        near_sun = math.exp(-dep / 1.5)                      # у самого горизонта под солнцем — плотно и ярко
        kind = np.zeros(n, dtype=int)      # 0 — вода, 1 — солнечная дорожка
        tone = np.full(n, SEA.base)
        haze = 0                                # у горизонта вода тёмная, как на картинке
        lit = prof > 0.3                        # вода внутри дорожки — чуть светлее (подсвечена)
        cand = np.nonzero(off < GLINT_SHEEN * hw)[0]
        j_ = 0
        while j_ < len(cand):
            j = cand[j_]
            p = GLINT_DENSITY * prof[j] * (0.25 + 0.75 * max(amp, near_sun)) \
                + 0.05 * math.exp(-(off[j] / (GLINT_SHEEN * hw)) ** 2) * (1 + 2 * near_sun)
            if rng.random() < p:
                # блик: короткий штрих (в середине длиннее), яркость — от середины дорожки и гребня
                length = 1 + int(rng.integers(0, 1 + int(3 * prof[j] + 2 * near_sun)))
                inten = prof[j] * (0.55 + 0.45 * max(amp, near_sun)) * rng.uniform(0.75, 1.15)
                t_ = 6 if inten > 0.62 else 5 if inten > 0.48 else 4 if inten > 0.36 else 3 if inten > 0.24 \
                    else 2 if inten > 0.14 else 1 if inten > 0.06 else 0
                for jj in range(j, min(n, j + length)):
                    kind[jj] = 1
                    tone[jj] = t_
                dense = prof[j] > 0.85 and rng.random() < 0.4 + 0.6 * near_sun   # у горизонта — почти без промежутков
                j_ += length if dense else length + int(rng.integers(1, 3))
            else:
                j_ += 1
        i = 0
        while i < n:
            if kind[i]:
                i += 1
                continue
            length = int(rng.integers(*WAVE_STROKE))
            stop = i
            while stop < min(n, i + length) and not kind[stop]:          # мазок воды не заходит на дорожку
                stop += 1
            length = stop - i
            # Волны: мазки соседних тонов (без резких тёмных провалов), гребни идут полосами.
            t = rng.random()
            light = 0.12 if crest_row else 0.0
            if t < 0.24 - light:
                tone[i:i + length] = SEA.base - 1 + haze
            elif t < 0.27 - light:
                tone[i:i + length] = SEA.base - 2 + haze               # редкая тёмная ложбинка
            elif t < 0.55:
                tone[i:i + length] = SEA.base + 1 + haze
            elif t < 0.61 + light / 2:
                tone[i:i + length] = SEA.base + 2 + haze               # светлый гребень
            elif t < 0.63 + light / 2:
                tone[i:i + length] = SEA.base + 3 + haze               # розоватый блик гребня (редко)
            else:
                tone[i:i + length] = SEA.base + haze
            if lit[i] and tone[i] < SEA.base + 1 and rng.random() < 0.6:
                tone[i:i + length] = SEA.base + 1                         # подсвеченная вода между бликами
            i += length
        # Склеиваем одинаковые соседние клетки в полоски.
        start = 0
        for i in range(1, n + 1):
            if i == n or kind[i] != kind[start] or tone[i] != tone[start]:
                b = len(verts)
                verts += [(xs[start], y0, sea_z), (xs[i], y0, sea_z), (xs[i], y1, sea_z), (xs[start], y1, sea_z)]
                faces.append((b, b + 1, b + 2, b + 3))
                pal = GLINT if kind[start] else SEA
                t_ = int(np.clip(tone[start], 0, len(pal.colors) - 1))
                c_ = hex_srgb(pal.colors[t_])
                if not (kind[start] and t_ >= 4):                  # жёлтая середина дорожки — как есть
                    c_ = list(raspberry(c_))
                cols.append(c_ + [1.0])
                mats.append(int(kind[start]))
                start = i
    me = bpy.data.meshes.new("Sea")
    me.from_pydata(verts, [], faces)
    attr = me.color_attributes.new("Col", 'BYTE_COLOR', 'CORNER')
    attr.data.foreach_set("color_srgb", [c for cc in cols for c in cc * 4])
    me.materials.append(sea_material(SEA))
    me.materials.append(sea_material(GLINT))
    me.polygons.foreach_set("material_index", mats)
    me.update()
    obj = bpy.data.objects.new("Sea", me)
    col.objects.link(obj)
    print("Sea faces:", len(faces))
    return obj


def sea_material(pal):
    """Вода: цвет мазков (цвет вершин) светится сам — волны всегда видны такими, как нарисованы,
    а настоящее солнце даёт поверх узкий золотой блик (дорожка двигается вместе с солнцем).
    В игре воде всё равно нужен свой шейдер (волны, дорожка от солнца) — это превью и основа для него."""
    m = voxel_material(pal)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    vc = next(n for n in nt.nodes if n.type == 'VERTEX_COLOR')
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    for link in list(nt.links):                     # свет на воду не влияет — только её собственный цвет
        if link.to_socket == bsdf.inputs["Base Color"]:
            nt.links.remove(link)
    bsdf.inputs["Base Color"].default_value = (0.01, 0.005, 0.01, 1.0)
    return m

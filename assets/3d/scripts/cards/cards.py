"""Колода «Painted Seven» — ПИКСЕЛЬНЫЙ АРТ, нарисованный кодом (numpy). Карты на английском (J, Q, K, A).

Близко к референсам Тима (лист колоды и 7♠-шут):
  бумага   — тёплый персиково-розовый пергамент, ровный, к краям темнее, углы скруглены
  рамка    — тонкая приглушённая коричнево-красная линия, завитки в углах
  индексы  — крупный шрифт с засечками (как в старой печати) + масть под буквой; перевёрнутый — в углу напротив
  масти    — крупные, с тёмной обводкой и бликом; туз — одна большая масть
  фигуры   — поясной портрет в тонкой чёрной рамке: шапка с золотой лентой, длинные волосы, лицо вполоборота,
             камзол с ремнями крест-накрест и пряжкой, пышные белые рукава, руки скрещены; снизу — перевёрнутая
             копия. Червы/бубны — багровый, пики/трефы — тёмно-синий
  7♠       — ДЖОКЕР-шут (в игре семёрка пик — джокер): колпак с бубенцами, маска, жабо, золотой ромб с пикой
  рубашка  — тёмно-красное поле, широкая золотистая рамка, «веера» в углах, ромб с узором-крестом в центре

Колода игры — 36 карт (6…туз). Атлас — в раскладке игры (src/three/cardAtlas.ts): ячейка = масть × 9 + ранг
(масти: пики, трефы, бубны, червы; ранги 6…14), 36 — рубашка, 37 — торец, 38…41 — значки мастей.
10 столбцов × 5 рядов, ячейка 128×192 пикселей."""
import numpy as np

W, H = 128, 192
COLS, ROWS = 10, 5
SUITS = ["spades", "clubs", "diamonds", "hearts"]
RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14]
LETTERS = {11: "J", 12: "Q", 13: "K", 14: "A"}
CELL_BACK, CELL_EDGE, CELL_ICON = 36, 37, 38


def C(h):
    return np.array([int(h[1:3], 16) / 255, int(h[3:5], 16) / 255, int(h[5:7], 16) / 255, 1.0], np.float32)


# Палитра — снята с референсов.
PAPER = [C("#b8806a"), C("#c89076"), C("#d8a084"), C("#e2ae92"), C("#e8b898"), C("#efc2a4"), C("#f4ccb0")]
JOKER_PAPER = [C("#b8865e"), C("#cc9a72"), C("#dcae86"), C("#e6ba94"), C("#ecc29e"), C("#f0c9a6"), C("#f4d2b2")]
LINE = C("#a86a58")
FLOURISH, FLOURISH_L = C("#a8704e"), C("#c89070")
RED = {"base": C("#9e1d29"), "dark": C("#6a0e18"), "light": C("#c43e3c"), "hl": C("#e07a68")}
BLACK = {"base": C("#1e1418"), "dark": C("#0a0608"), "light": C("#3e3036"), "hl": C("#6a5a62")}
CLOTH = {   # камзол на фигурах
    "red": {"base": C("#8a1c26"), "dark": C("#5a1018"), "light": C("#a83236"), "hl": C("#c8504a")},
    "navy": {"base": C("#2c3256"), "dark": C("#171a32"), "light": C("#40487a"), "hl": C("#5a6496")},
}
STRAP, STRAP_D, STRAP_L = C("#b88250"), C("#7a5030"), C("#e0b070")
SKIN, SKIN_D, SKIN_L = C("#e2a684"), C("#b87a5c"), C("#f0bea0")
HAIR, HAIR_D, HAIR_L = C("#6a3a22"), C("#3e2014"), C("#8a5232")
SLEEVE, SLEEVE_D = C("#e8dccc"), C("#b4a494")
FRAME_INK = C("#4a2c26")
GOLD, GOLD_L, GOLD_D = C("#c2855f"), C("#e0a878"), C("#8a5a3a")
JOKER = {"black": C("#211212"), "black_l": C("#3e2a2a"), "red": C("#8c2a26"), "red_l": C("#b24a3c"),
         "red_d": C("#5e1d1e"), "cream": C("#ece0cc"), "cream_d": C("#b8a690"), "gold": C("#b07a48"),
         "gold_l": C("#d8a464")}
TRANSPARENT = np.zeros(4, np.float32)


def ink(suit):
    return RED if suit in ("hearts", "diamonds") else BLACK


# ---------------------------------------------------------------------------
# Холст, фигуры
# ---------------------------------------------------------------------------
def canvas(w=W, h=H):
    return np.zeros((h, w, 4), np.float32)


def grid(w, h):
    yy, xx = np.mgrid[0:h, 0:w]
    return xx + 0.5, yy + 0.5


def paste(dst, src, x, y):
    h, w = src.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    m = s[..., 3] > 0.5
    dst[y0:y1, x0:x1][m] = s[m]


def rot180(a):
    return a[::-1, ::-1].copy()


def outline(mask):
    p = np.pad(mask, 1)
    return mask & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])


def poly(w, h, pts):
    """Заливка многоугольника (правило чёт-нечет) на сетке w×h."""
    x, y = grid(w, h)
    inside = np.zeros((h, w), bool)
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cond = (y1 > y) != (y2 > y)
        xi = (x2 - x1) * (y - y1) / ((y2 - y1) + 1e-9) + x1
        inside ^= cond & (x < xi)
    return inside


def bezier_band(w, h, p0, p1, p2, r0, r1, steps=48):
    """Толстая кривая (Безье) с меняющейся толщиной — рога колпака, ленты, завитки."""
    x, y = grid(w, h)
    m = np.zeros((h, w), bool)
    p0, p1, p2 = map(np.array, (p0, p1, p2))
    for t in np.linspace(0, 1, steps):
        p = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
        r = r0 + (r1 - r0) * t
        m |= (x - p[0]) ** 2 + (y - p[1]) ** 2 < r * r
    return m


# ---------------------------------------------------------------------------
# Масти
# ---------------------------------------------------------------------------
def heart_shape(u, v, c=0.47, cy=-0.38, r=0.52, tip=0.96):
    """Сердце без «углов»: две доли-круга и касательные к ним линии до острия (строго симметрично)."""
    ks = np.linspace(0.3, 3.0, 2000)                                 # наклон касательной: |c - k(tip-cy)| = r√(1+k²)
    err = np.abs(np.abs(c - ks * (tip - cy)) - r * np.sqrt(1 + ks * ks))
    k = ks[np.argmin(np.where(c - ks * (tip - cy) < 0, err, 9))]
    v_t = cy + r * k / np.sqrt(1 + k * k)                            # где линия касается доли
    au = np.abs(u)
    m = (au - c) ** 2 + (v - cy) ** 2 < r * r
    m |= (au < c) & (v > cy) & (v < v_t)                              # между долями ниже ложбинки
    m |= (v >= v_t) & (au < k * (tip - v))
    return m


def suit_mask(suit, S):
    x, y = grid(S, S)
    u, v = (x / S) * 2 - 1, (y / S) * 2 - 1
    if suit == "hearts":
        m = heart_shape(u, v)
        m &= ~((np.abs(u) < 0.12) & (v < -0.55))                       # выемка сверху
    elif suit == "diamonds":
        m = np.abs(u) / 0.8 + np.abs(v) < 1
    elif suit == "spades":
        m = heart_shape(u, -1.265 * v - 0.267)                                                # перевёрнутое сердце
        m |= (v > 0.25) & (v < 0.98) & (np.abs(u) < 0.08 + ((v - 0.25) / 0.73) ** 2 * 0.36)   # ножка с расширением
    else:
        m = (u ** 2 + (v + 0.42) ** 2 < 0.16) | ((u - 0.45) ** 2 + (v - 0.14) ** 2 < 0.16)
        m |= ((u + 0.45) ** 2 + (v - 0.14) ** 2 < 0.16) | ((np.abs(u) < 0.22) & (np.abs(v) < 0.22))
        m |= (v > 0.1) & (v < 0.98) & (np.abs(u) < 0.08 + (v - 0.1) * 0.45)
    return m


def suit_sprite(suit, S, colors=None):
    c = colors or ink(suit)
    m = suit_mask(suit, S)
    s = np.zeros((S, S, 4), np.float32)
    s[m] = c["base"]
    x, y = grid(S, S)
    d = max(2, S // 7)
    below = np.zeros_like(m)
    below[:-d] = m[d:]
    s[m & ~below] = c["dark"]                                          # тень вдоль нижнего края (симметрично)
    s[outline(m)] = c["dark"]
    hl = m & ~outline(m) & ((x - S * 0.3) ** 2 + (y - S * 0.28) ** 2 < (S * 0.13) ** 2)
    s[hl] = c["light"]
    s[m & ~outline(m) & ((x - S * 0.27) ** 2 + (y - S * 0.25) ** 2 < (S * 0.05) ** 2)] = c["hl"]
    return s


# ---------------------------------------------------------------------------
# Шрифт с засечками (8×10, рисуется ×2, вертикальные штрихи толще)
# ---------------------------------------------------------------------------
FONT = {
    "A": ["...##...", "...##...", "..#..#..", "..#..#..", ".#....#.", ".######.", ".#....#.", "#......#",
          "#......#", "###..###"],
    "J": ["...#####", ".....#..", ".....#..", ".....#..", ".....#..", ".....#..", "#....#..", "#....#..",
          ".#..#...", "..##...."],
    "Q": ["..####..", ".#....#.", "#......#", "#......#", "#......#", "#......#", "#...#..#", ".#...##.",
          "..####.#", ".......#"],
    "K": ["###..###", ".#...#..", ".#..#...", ".#.#....", ".##.....", ".#.#....", ".#..#...", ".#...#..",
          ".#....#.", "###..###"],
    "1": ["..#..", ".##..", "#.#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "0": [".####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."],
    "6": [".####.", "#....#", "#.....", "#.....", "#####.", "#....#", "#....#", "#....#", "#....#", ".####."],
    "7": ["######", "#....#", ".....#", "....#.", "....#.", "...#..", "...#..", "..#...", "..#...", ".###.."],
    "8": [".####.", "#....#", "#....#", "#....#", ".####.", "#....#", "#....#", "#....#", "#....#", ".####."],
    "9": [".####.", "#....#", "#....#", "#....#", "#....#", ".#####", ".....#", ".....#", "#....#", ".####."],
}


def text_sprite(txt, color, scale=2, gap=1, bold=False):
    """Шрифт с засечками: вертикальные штрихи толще горизонтальных (как в старой печати).
    bold — жирнее на пиксель во все стороны (крупная «7» джокера на референсе)."""
    glyphs = [np.array([[ch == "#" for ch in row] for row in FONT[c]]) for c in txt]
    w = sum(g.shape[1] for g in glyphs) + gap * (len(glyphs) - 1)
    m = np.zeros((10, w), bool)
    x = 0
    for g in glyphs:
        m[:, x:x + g.shape[1]] = g
        x += g.shape[1] + gap
    up = np.zeros_like(m)
    up[1:] = m[:-1]
    down = np.zeros_like(m)
    down[:-1] = m[1:]
    stem = m & (up | down)                                             # вертикальные штрихи в исходном рисунке
    M = np.kron(m, np.ones((scale, scale), bool))
    S = np.kron(stem, np.ones((scale, scale), bool))
    M = np.pad(M, ((0, 0), (0, 1)))
    S = np.pad(S, ((0, 0), (0, 1)))
    M |= np.roll(S, 1, 1)                                              # стебель на пиксель толще
    Hz = np.pad(np.kron(m & ~stem, np.ones((scale, scale), bool)), ((0, 1), (0, 2)))
    M = np.pad(M, ((0, 1), (0, 1)))
    M |= np.roll(M, 1, 1)                                              # в 1,5 раза жирнее: все штрихи шире
    M |= np.roll(Hz, 1, 0)                                             # и горизонтальные толще
    if bold:
        M = np.pad(M, ((0, 1), (0, 1)))
        M |= np.roll(M, 1, 1)
        M |= np.roll(M, 1, 0)
    m = M
    s = np.zeros(m.shape + (4,), np.float32)
    s[m] = color
    return s


def rank_text(rank):
    return str(rank) if rank <= 10 else LETTERS[rank]


# ---------------------------------------------------------------------------
# Бумага, рамка, индексы
# ---------------------------------------------------------------------------
def card_shape(w=W, h=H, r=6):
    x, y = grid(w, h)
    cx, cy = np.clip(x, r, w - r), np.clip(y, r, h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def smooth_noise(w, h, cell, rng):
    small = rng.random((h // cell + 3, w // cell + 3))
    big = np.kron(small, np.ones((cell, cell)))
    k = cell
    acc = np.zeros((h, w))
    for dy in range(0, k, 2):
        for dx in range(0, k, 2):
            acc += big[dy:dy + h, dx:dx + w]
    return acc / ((k // 2) ** 2)


def paper(seed, tones=PAPER):
    rng = np.random.default_rng(seed)
    img = canvas()
    x, y = grid(W, H)
    n = smooth_noise(W, H, 24, rng)
    edge = np.minimum(np.minimum(x, W - x), np.minimum(y, H - y))
    level = 4.6 + (n - 0.5) * 0.9 - np.clip((9 - edge) / 9, 0, 1) ** 1.5 * 3.0      # ровнее, как на референсе
    sx, sy = rng.uniform(20, W - 20), rng.uniform(30, H - 30)
    level -= 0.5 * np.exp(-((x - sx) ** 2 + (y - sy) ** 2) / (2 * 18 ** 2))       # лёгкое пятно
    idx = np.clip(np.round(level), 0, len(tones) - 1).astype(int)
    img[...] = np.array(tones)[idx]
    img[~card_shape()] = TRANSPARENT
    return img


def flourish():
    """Завиток в угол: дуга-спираль и усики (12×12)."""
    s = canvas(12, 12)
    m = bezier_band(12, 12, (1, 11), (1, 1), (11, 1), 0.6, 0.6)
    m |= bezier_band(12, 12, (3, 7), (3, 3), (7, 3), 0.55, 0.55)
    s[m] = FLOURISH
    s[(np.abs(grid(12, 12)[0] - 5.5) < 1) & (np.abs(grid(12, 12)[1] - 5.5) < 1)] = FLOURISH_L
    return s


def frame(img):
    x, y = grid(W, H)
    inset = 6
    m = ((np.abs(x - inset - 0.5) < 0.5) | (np.abs(x - (W - inset - 0.5)) < 0.5)) & (y > inset + 8) & (y < H - inset - 8)
    m |= ((np.abs(y - inset - 0.5) < 0.5) | (np.abs(y - (H - inset - 0.5)) < 0.5)) & (x > inset + 8) & (x < W - inset - 8)
    img[m] = LINE
    f = flourish()
    paste(img, f, 3, 3)
    paste(img, f[:, ::-1], W - 15, 3)
    paste(img, f[::-1, :], 3, H - 15)
    paste(img, f[::-1, ::-1], W - 15, H - 15)


def index(img, rank, suit, color=None, pip_size=17, with_suit=True, bold=False):
    """Индекс в углу: буква/число, под ним масть (на числовых картах — только число, как на референсе)."""
    c = color if color is not None else ink(suit)["base"]
    t = text_sprite(rank_text(rank), c, bold=bold)
    block = t
    if with_suit:
        pip = suit_sprite(suit, pip_size)
        bw = max(t.shape[1], pip_size)
        block = canvas(bw, t.shape[0] + pip_size + 2)
        paste(block, t, (bw - t.shape[1]) // 2, 0)
        paste(block, pip, (bw - pip_size) // 2, t.shape[0] + 2)
    paste(img, block, 10, 11)
    paste(img, rot180(block), W - 10 - block.shape[1], H - 11 - block.shape[0])


# ---------------------------------------------------------------------------
# Очки и туз
# ---------------------------------------------------------------------------
PIPS = {
    6: [(-1, 0), (1, 0), (-1, 0.5), (1, 0.5), (-1, 1), (1, 1)],
    7: [(-1, 0), (1, 0), (0, 0.25), (-1, 0.5), (1, 0.5), (-1, 1), (1, 1)],
    8: [(-1, 0), (1, 0), (0, 0.25), (-1, 0.5), (1, 0.5), (0, 0.75), (-1, 1), (1, 1)],
    9: [(-1, 0), (1, 0), (-1, 1 / 3), (1, 1 / 3), (0, 0.5), (-1, 2 / 3), (1, 2 / 3), (-1, 1), (1, 1)],
    10: [(-1, 0), (1, 0), (0, 1 / 6), (-1, 1 / 3), (1, 1 / 3), (-1, 2 / 3), (1, 2 / 3), (0, 5 / 6), (-1, 1), (1, 1)],
}


def pip_card(img, rank, suit):
    S = 26                                                         # крупные масти, как на референсе
    pip = suit_sprite(suit, S)
    top, bottom = 50, 142
    for col, row in PIPS[rank]:
        cx, cy = W / 2 + col * 28, top + row * (bottom - top)
        paste(img, pip if row <= 0.5 else rot180(pip), int(round(cx - S / 2)), int(round(cy - S / 2)))


def ace_card(img, suit):
    S = 52
    paste(img, suit_sprite(suit, S), (W - S) // 2, (H - S) // 2)


# ---------------------------------------------------------------------------
# Фигуры: поясной портрет (верх) + перевёрнутая копия (низ)
# ---------------------------------------------------------------------------
SKIN_T = [C("#8e5440"), C("#b07258"), C("#cc8c6c"), C("#e0a482"), C("#f0bea0")]
HAIR_T = [C("#2a150c"), C("#3e2014"), C("#5a3020"), C("#74422a"), C("#965c38")]
SLEEVE_T = [C("#8e7e72"), C("#b4a494"), C("#d4c8b8"), C("#ece2d4")]
STRAP_T = [C("#5a3820"), C("#8a5a34"), C("#b88250"), C("#e0b070")]
CLOTH_T = {"red": [C("#3a0a10"), C("#5a1018"), C("#7a1820"), C("#921f28"), C("#ae3438"), C("#c8504a")],
           "navy": [C("#0c0e20"), C("#171a32"), C("#232848"), C("#2e3458"), C("#424a7c"), C("#5c6698")]}
EYE_WHITE, LIP_D, LIP, LIP_L = C("#f2e4d4"), C("#7a2e2a"), C("#b05448"), C("#c87a66")
OUTLINE_INK = C("#2e1612")
FACE_BOX = (31, 28, 107, 174)          # линии рамки портрета: x0, y0, x1, y1
FIG_TOP = 95                           # сколько строк рамки занимает верхняя фигура (остальное — перевёрнутая голова)
FIG_OVER = 4                           # шапка заходит на рамку сверху


def paint(s, mask, tones, f):
    """Залить область несколькими тонами по «освещённости» f (0…1) — живописная пиксельная заливка."""
    idx = np.clip((np.asarray(f) * len(tones)).astype(int), 0, len(tones) - 1)
    s[mask] = np.asarray(tones)[np.broadcast_to(idx, mask.shape)][mask]


def strap_line(w, h, a, b, r):
    """Прямая лента от a до b: маска и знаковое расстояние от оси (для светлой/тёмной кромки)."""
    x, y = grid(w, h)
    d = np.array(b, float) - np.array(a, float)
    L = np.hypot(*d)
    d /= L
    t = (x - a[0]) * d[0] + (y - a[1]) * d[1]
    n = (x - a[0]) * d[1] - (y - a[1]) * d[0]
    return (t > 0) & (t < L) & (np.abs(n) < r), n


def ramp(hexc, factors=(0.42, 0.62, 0.82, 1.0, 1.2, 1.42)):
    """Палитра оттенков из одного цвета: от глубокой тени до блика."""
    b = C(hexc)
    out = []
    for f in factors:
        c = b.copy()
        c[:3] = np.clip(b[:3] * f + (0.06 * (f - 1.2) if f > 1.2 else 0), 0, 1)
        out.append(c)
    return out


# Каждая масть — свой цвет одежды, у каждой фигуры — свои волосы, перо, камень.
SUIT_STYLE = {
    "hearts":   dict(cloth="#9a2028", accent="#ece2d4", gem="#3a6ac8",
                     hair={11: "#6a3a22", 12: "#8e3a1c", 13: "#6e5e54"}, plume="#ece2d4"),
    "diamonds": dict(cloth="#7a1a46", accent="#e8cc8a", gem="#2e9a5a",
                     hair={11: "#b08a44", 12: "#caa054", 13: "#9a5a2a"}, plume="#e8cc8a"),
    "clubs":    dict(cloth="#2e3a6a", accent="#d8dce8", gem="#c83a3a",
                     hair={11: "#2c201a", 12: "#4e2c1a", 13: "#3c3638"}, plume="#c8402e"),
    "spades":   dict(cloth="#2a4a34", accent="#e4dcc8", gem="#c89a3a",
                     hair={11: "#8a3a1e", 12: "#1e1614", 13: "#c4bcb2"}, plume="#2a2420"),
}
JACK_IRIS = {"hearts": "#7a4a2a", "diamonds": "#4a7a3a", "clubs": "#3a5c9a", "spades": "#9a6a28"}   # цвет глаз валетов
ERMINE, ERMINE_D =C("#f2ece2"), C("#c8c0b4")
LIPS_Q = C("#b03440")


def figure(rank, suit, w, h):
    """Поясной портрет. Масть задаёт цвета, ранг — образ:
    J — берет с пером, волосы до плеч, камзол с ремнями крест-накрест, скрещённые руки;
    Q — диадема, длинные волосы, платье с вырезом, жемчуг, шнуровка, роза в руках;
    K — корона, борода и усы, горностаевая накидка, цепь с медальоном, руки на мече."""
    st = SUIT_STYLE[suit]
    cloth = ramp(st["cloth"])
    hair_t = ramp(st["hair"][rank], (0.45, 0.65, 0.85, 1.0, 1.22))
    accent = ramp(st["accent"], (0.6, 0.78, 0.9, 1.0))
    gem = C(st["gem"])
    rng = np.random.default_rng(SUITS.index(suit) * 10 + rank)
    s = canvas(w, h)
    x, y = grid(w, h)
    n = smooth_noise(w, h, 6, rng) - 0.5
    cx = w / 2 + 1.5

    def light(x0, y0, rx, ry):                                     # свет сверху-справа
        return (x - x0) / rx * 0.35 - (y - y0) / ry * 0.25

    strands = np.sin((x - cx) * 0.8 + np.sin(y * 0.22) * 1.2)

    def hair_paint(mask):
        paint(s, mask, hair_t, 0.5 + light(cx, 30, 20, 30) + 0.2 * strands + n * 0.15)

    def curls(mask):
        """Фактура кудрей: колечки в шахматном порядке, блик сверху-справа, тень снизу-слева."""
        paint(s, mask, hair_t, 0.42 + light(cx, 28, 18, 16) * 0.8)
        for gy in range(0, h, 5):
            for gx in range(-2 + (gy // 5 % 2) * 2, w, 5):
                d = np.hypot(x - gx - 0.5, y - gy - 0.5)
                ang = np.arctan2(y - gy - 0.5, x - gx - 0.5)
                ring = mask & (d > 1.0) & (d < 2.3)
                s[ring & (ang < -0.3) & (ang > -2.4)] = hair_t[4]
                s[ring & (ang > 0.6) & (ang < 2.8)] = hair_t[1]
        s[mask & outline(mask)] = hair_t[0]

    # --- волосы позади головы ---
    if rank == 12:
        back = poly(w, h, [(cx - 15, 9), (cx + 13, 9), (cx + 19, 24), (cx + 20, 46), (cx + 18, 66), (cx + 8, 72),
                           (cx - 12, 74), (cx - 24, 70), (cx - 26, 46), (cx - 22, 18)])
    elif rank == 11:                                                # валет: пышные кудри до мочек ушей
        hx, hy = cx + 1, 27.0
        back = (((x - hx) / 16) ** 2 + ((y - hy) / 13) ** 2 < 1) & (y < 41)
        for a in np.radians(np.arange(150, 395, 22)):               # кудрявый край — «бусины» по контуру
            px, py = hx + 15 * np.cos(a), hy + 12.5 * np.sin(a)
            if py < 42:
                back |= (x - px) ** 2 + (y - py) ** 2 < 3.4 ** 2
        back &= y < 43
    else:
        back = poly(w, h, [(cx - 21, 15), (cx + 17, 15), (cx + 18, 34), (cx + 14, 54), (cx - 6, 58),
                           (cx - 21, 56), (cx - 23, 30)])
    hair_paint(back)
    if rank == 11:
        curls(back)

    # --- одежда ---
    body = poly(w, h, [(0, h + 1), (0, 66), (5, 61), (cx - 12, 56), (cx + 12, 56), (w - 5, 61), (w, 66), (w, h + 1)])
    paint(s, body, cloth, 0.55 + light(cx, 70, 40, 40) + n * 0.12)
    for side in (-1, 1):                                            # пышные рукава с разрезами
        sx = 7 if side < 0 else w - 7
        puff = (((x - sx) / 9.5) ** 2 + ((y - 71) / 12) ** 2 < 1) & body
        paint(s, puff, accent, 0.75 + light(sx, 64, 9, 12) * 0.8)
        slash = puff & (np.abs(((x - sx + 1) % 4) - 2) < 0.7)
        paint(s, slash, cloth, 0.5 + light(sx, 64, 9, 12))
        s[puff & outline(puff) & (y > 61)] = cloth[1]
    neck = (np.abs(x - (cx + 1.5)) < (7.5 if rank == 11 else 6)) & (y > 48) & (y < 60)
    s[neck] = SKIN_T[3]
    s[neck & (x < cx - 1)] = SKIN_T[2]
    s[neck & (y < 54)] = SKIN_T[1]

    if rank == 11:                                                  # валет: воротник, ремни, пряжка
        collar = poly(w, h, [(cx - 10, 55), (cx + 11, 55), (cx + 13, 61), (cx + 3, 63), (cx - 12, 61)])
        s[collar] = accent[3]
        s[collar & (y > 60.5)] = accent[1]
        s[bezier_band(w, h, (cx - 14, 60), (cx, 71), (cx + 15, 60), 0.9, 0.9) & body & ~collar] = STRAP_T[2]
        for a, b in (((cx - 23, 60), (cx + 27, h + 2)), ((cx + 23, 60), (cx - 27, h + 2))):
            m, d = strap_line(w, h, a, b, 2.0)
            m &= body & ~collar
            sg = d * np.sign(b[0] - a[0])
            s[m] = STRAP_T[2]
            s[m & (sg < -0.9)] = STRAP_T[3]
            s[m & (sg > 0.9)] = STRAP_T[1]
        buckle = (np.abs(x - cx) < 4.2) & (np.abs(y - 78.5) < 3.2)
        s[buckle] = STRAP_T[3]
        s[buckle & outline(buckle)] = STRAP_T[0]
        s[(np.abs(x - cx) < 1.6) & (np.abs(y - 78.5) < 0.9)] = cloth[0]
    elif rank == 12:                                                # дама: вырез, кружево, жемчуг, шнуровка
        chest = poly(w, h, [(cx - 11, 56), (cx + 12, 56), (cx + 12, 65), (cx - 11, 65)])
        s[chest] = SKIN_T[3]
        s[chest & (x < cx - 5)] = SKIN_T[2]
        lace = (y >= 65) & (y < 67.5) & (np.abs(x - cx - 0.5) < 13)
        s[lace] = accent[3]
        s[lace & (np.abs(((x - cx) % 3) - 1.5) < 0.5) & (y > 66.3)] = accent[1]
        pearls = (np.abs(y - (59.5 + ((x - cx) / 10) ** 2 * 2)) < 0.8) & (np.abs(x - cx) < 9) & (((x - cx) % 2) < 1)
        s[pearls] = C("#f4f0ea")
        s[(np.abs(x - cx) < 1.4) & (np.abs(y - 62.5) < 1.4)] = gem
        lacing = (np.abs(x - cx) < 0.7) & (y > 67) & (y < 84)
        s[lacing] = STRAP_T[2]
        s[(np.abs(np.abs(x - cx) - ((y - 67) % 4) * 0.9) < 0.6) & (y > 67) & (y < 84) & (np.abs(x - cx) < 4)] = STRAP_T[3]
    else:                                                           # король: горностай, цепь, медальон
        cape = poly(w, h, [(0, 66), (5, 60), (cx - 12, 55), (cx + 12, 55), (w - 5, 60), (w, 66), (w, 72),
                           (cx + 14, 70), (cx, 66), (cx - 14, 70), (0, 72)])
        s[cape] = ERMINE
        s[cape & (x < cx - 14)] = ERMINE_D
        tails = cape & (((x - cx) % 7) < 1.2) & (((y + (x - cx) // 7 * 2) % 6) < 2)
        s[tails] = C("#1e1614")
        s[cape & outline(cape) & (y > 62)] = ERMINE_D
        chain = (np.abs(y - (70 + ((x - cx) / 14) ** 2 * -6 + 6)) < 0.8) & (np.abs(x - cx) < 14) & (((x - cx) % 3) < 2) & body & ~cape
        s[chain] = STRAP_T[3]
        med = (x - cx) ** 2 + (y - 77) ** 2 < 10
        s[med] = STRAP_T[2]
        s[med & outline(med)] = STRAP_T[0]
        s[(x - cx) ** 2 + (y - 77) ** 2 < 2.5] = gem

    # руки: предплечья поперёк, манжеты, кисти (у дамы — роза, у короля — меч)
    arms = poly(w, h, [(3, 84), (w - 3, 82.5), (w - 2, 93.5), (3, 95)])
    paint(s, arms, cloth, 0.62 + light(cx, 86, 40, 6) + n * 0.1)
    s[arms & outline(arms) & (y < 86)] = cloth[1]
    s[arms & (y > 93)] = cloth[1]
    for cxx in (cx - 13, cx + 12):
        s[arms & (np.abs(x - cxx) < 1.6)] = accent[2]
    if rank == 13:                                                  # меч: рукоять, гарда, навершие
        grip = (np.abs(x - cx) < 1.6) & (y > 74) & (y < h)
        s[grip] = C("#5a3a24")
        s[(np.abs(x - cx) < 9) & (np.abs(y - 82) < 1.2)] = STRAP_T[2]
        s[(np.abs(x - cx) < 9) & (np.abs(y - 82) < 1.2) & (y > 82)] = STRAP_T[1]
        s[(x - cx) ** 2 + (y - 74) ** 2 < 5] = STRAP_T[3]
    hands = ((cx - 6, 88.5), (cx + 5, 88)) if rank != 13 else ((cx - 0.5, 87), (cx + 0.5, 93))
    for hx, hy in hands:
        hand = ((x - hx) / 5.5) ** 2 + ((y - hy) / (4.6 if rank != 13 else 3.4)) ** 2 < 1
        s[hand] = SKIN_T[3]
        s[hand & (x < hx - 1.5)] = SKIN_T[2]
        s[hand & (x > hx + 1) & (y < hy - 1)] = SKIN_T[4]
        s[hand & outline(hand)] = SKIN_T[1]
    if rank == 12:                                                  # роза в руках
        rose = (x - cx) ** 2 + (y - 84) ** 2 < 12
        s[rose] = C("#b8283a")
        s[rose & (np.abs(np.hypot(x - cx, y - 84) - 2) < 0.6)] = C("#7a1424")
        s[rose & ((x - cx - 1) ** 2 + (y - 83) ** 2 < 1.2)] = C("#e05a66")
        for lx in (cx - 4.5, cx + 4.5):
            s[(np.abs(x - lx) < 1.5) & (np.abs(y - 86.5) < 1)] = C("#3a6a2a")

    # --- лицо: объёмный овал с мягким светом, черты вполоборота вправо ---
    male = rank != 12
    fx, fy, rx, ry = cx + 2, 35.0, {11: 11.8, 12: 11.5, 13: 12.5}[rank], 15.5
    taper = {11: 0.13, 12: 0.24, 13: 0.12}[rank]                    # у мужчин челюсть шире
    jaw = np.where(y > fy, 1 - taper * ((y - fy) / ry), 1.0)
    nx, ny = (x - fx) / (rx * jaw), (y - fy) / ry
    power = {11: 3.0, 12: 2.0, 13: 3.4}[rank]                       # чем больше — тем квадратнее подбородок
    rr = nx ** 2 + np.where(ny > 0, np.abs(ny) ** power, ny ** 2)
    face = rr < 1
    nz = np.sqrt(np.clip(1 - rr, 0, 1))
    lum = nx * (0.22 if rank == 11 else 0.42) - ny * 0.4 + nz * 0.85    # свет спереди-сверху-справа (валет — ровнее)
    if rank == 12:                                                  # серьга под ухом
        s[(np.abs(x - (fx - rx + 0.5)) < 1) & (y > fy + 5) & (y < fy + 9)] = STRAP_T[3]
    else:                                                           # ухо
        ear = (((x - (fx - rx + 0.5)) / 2.2) ** 2 + ((y - (fy + 1.5)) / 3.5) ** 2 < 1) & ~face
        s[ear] = SKIN_T[2]
        s[ear & (x > fx - rx)] = SKIN_T[1]
    paint(s, face, SKIN_T, 0.12 + 0.88 * lum)
    c = fx + 3                                                     # средняя линия лица (голова повёрнута вправо)
    ey = fy - 3
    row = lambda yy: (y > yy) & (y < yy + 1)                       # noqa: E731
    span = lambda a, b: (x > a) & (x < b)                          # noqa: E731
    if male:                                                        # скулы и челюсть — резче, без румянца
        s[face & (((x - (c + 7)) / 2.8) ** 2 + ((y - (fy + 6.5)) / 1.2) ** 2 < 1)] = SKIN_T[2]
        s[face & (((x - (c - 8.5)) / 2.2) ** 2 + ((y - (fy + 5.5)) / 1.6) ** 2 < 1)] = SKIN_T[1 if rank == 13 else 2]
        if rank == 13:
            s[face & (ny > 0.62) & ((x < c - 4) | (x > c + 7))] = SKIN_T[1]
    else:
        s[face & (((x - (c + 6)) / 2.6) ** 2 + ((y - (fy + 4.5)) / 1.4) ** 2 < 1)] = C("#e08c78")
        s[face & (((x - (c - 7.5)) / 2.2) ** 2 + ((y - (fy + 4.5)) / 1.3) ** 2 < 1)] = SKIN_T[2]
    grey = st["hair"][rank] == "#c4bcb2"
    brow = (hair_t[2] if grey else hair_t[0]) if male else hair_t[1]
    lash, iris = C("#2a1610"), C("#4a2c1c")
    for e0, e1, side in ((c - 9, c - 4, -1), (c + 2, c + 7, 1)):
        s[row(ey) & span(e0 - (side < 0) - (rank == 12) * (side < 0), e1 + (side > 0) + (rank == 12) * (side > 0))] = lash
        s[(row(ey + 1) | row(ey + 2)) & span(e0, e1)] = EYE_WHITE
        ix = (e0 + e1) / 2 + (0.1 if rank == 11 else 0.6)          # взгляд чуть вправо (валет — прямо)
        s[(row(ey + 1) | row(ey + 2)) & (np.abs(x - ix) < 1.05)] = iris
        s[row(ey + 1) & (np.abs(x - (ix + 0.5)) < 0.5)] = C("#1a0e0a")
        if rank != 11:
            s[row(ey + 3) & span(e0 + 1, e1 - 1)] = SKIN_T[2]        # нижнее веко
        if rank == 11:                                              # валет: миндалевидные глаза с цветной радужкой
            s[(row(ey) | row(ey + 1) | row(ey + 2)) & span(e0 - 1, e1 + 1)] = SKIN_T[3]
            s[row(ey - 1) & span(e0 + 0.5, e1 - 0.5)] = SKIN_T[2]       # складка века
            s[row(ey) & span(e0, e1)] = lash                             # верхнее веко
            s[row(ey + 1) & (span(e0 - 1, e0) | span(e1, e1 + 1))] = lash  # уголки глаза
            s[row(ey + 1) & span(e0, e1)] = EYE_WHITE
            s[row(ey + 2) & span(e0 + 1, e1 - 1)] = EYE_WHITE
            jx = (e0 + e1) / 2 + 0.5
            s[(row(ey + 1) | row(ey + 2)) & (np.abs(x - jx) < 1.0)] = C(JACK_IRIS[suit])
            s[row(ey + 1) & (np.abs(x - (jx + 0.5)) < 0.5)] = C("#140a08")   # зрачок
            s[row(ey + 1) & (np.abs(x - (jx - 0.5)) < 0.5)] = C("#fff6ea")   # блик
            s[row(ey + 3) & span(e0 + 1, e1 - 1)] = SKIN_T[2]           # нижнее веко
        elif male:                                                  # мужской разрез: веко тяжелее, глаз уже
            s[row(ey) & span(e0 - 1, e1 + 1)] = lash
            s[row(ey + 2) & span(e0, e1)] = SKIN_T[2]
            s[row(ey + 1) & span(e0, e1) & ~(np.abs(x - ix) < 1.05)] = EYE_WHITE
        if rank == 11:                                              # валет: ровные брови мягкой дугой
            s[row(ey - 3) & span(e0 - 0.5, e1 + 0.5)] = brow           # брови: ровные, уверенные, с лёгким изгибом
            s[row(ey - 4) & span(e0 + 1.5, e1 - 0.5 if side < 0 else e1 - 1.5)] = brow
        elif male:                                                  # густые прямые брови, внутренний край ниже
            s[(row(ey - 3) | row(ey - 2)) & span(e0 - 0.5 - (2 if side < 0 else 0), e1 + 0.5 + (2 if side > 0 else 0))] = brow
            s[row(ey - 1) & (np.abs(x - (e1 - 0.5 if side < 0 else e0 + 0.5)) < 1)] = brow
            s[row(ey - 3) & (np.abs(x - (e1 - 0.5 if side < 0 else e0 + 0.5)) < 1)] = SKIN_T[3]
        else:                                                       # тонкая бровь дугой
            s[row(ey - 3) & span(e0, e1)] = brow
            s[row(ey - 2) & (np.abs(x - (e0 - 0.5 if side < 0 else e1 + 0.5)) < 1)] = brow
    nose = fy + (6 if male else 5)                                 # у мужчин нос длиннее и крупнее
    s[(y > ey + 1) & (y < nose) & span(c - 1.5, c - 0.5)] = SKIN_T[2]   # нос: тень сбоку
    s[(y > ey + 2) & (y < nose - 1) & span(c - 0.5, c + 0.5)] = SKIN_T[4]  # спинка носа
    s[row(nose) & span(c - 2.5 - male, c + 2.5 + male)] = SKIN_T[2]
    s[row(nose) & (span(c - 2.5 - male, c - 1.5) | span(c + 1.5, c + 2.5 + male))] = SKIN_T[1]
    s[row(nose - 1) & span(c - 0.5, c + 1.5)] = SKIN_T[4]
    if male:
        s[row(nose - 1) & (span(c - 2.5, c - 1.5) | span(c + 2.5, c + 3.5))] = SKIN_T[2]
    if rank == 11:                                                  # валет: чёткий нос — контур, крылья, ноздри
        k = c + 0.5                                                 # центр пикселя (иначе линии в 1 px пропадают)
        s[(y > ey + 1) & (y < nose - 1) & span(k - 1.5, k - 0.5)] = SKIN_T[1]
        s[(y > ey + 2) & (y < nose - 1) & span(k - 0.5, k + 0.5)] = SKIN_T[4]
        s[row(nose - 1) & span(k - 2.5, k - 1.5)] = SKIN_T[1]
        s[row(nose - 1) & span(k + 2.5, k + 3.5)] = SKIN_T[2]
        s[row(nose - 1) & span(k - 0.5, k + 2.5)] = SKIN_T[4]
        s[(y > ey + 3) & (y < nose - 1) & span(k - 1.5, k - 0.5)] = C("#9a5c46")   # резкий контур
        s[row(nose - 2) & span(k - 2.5, k - 1.5)] = SKIN_T[2]
        s[row(nose) & span(k - 1.5, k + 2.5)] = C("#9a5c46")
        s[row(nose) & (span(k - 1.5, k - 0.5) | span(k + 1.5, k + 2.5))] = SKIN_T[0]
        s[row(nose - 1) & span(k - 2.5, k - 1.5)] = C("#9a5c46")
        s[row(nose) & (span(k - 2.5, k - 1.5) | span(k + 2.5, k + 3.5))] = SKIN_T[2]
        s[row(nose + 1) & span(k - 0.5, k + 1.5)] = SKIN_T[2]
    lip, lip_l = (LIPS_Q, C("#d0606a")) if rank == 12 else (C("#a8604e"), C("#c48068"))
    my = fy + (10 if male else 9)
    if rank == 13:                                                  # борода
        beard = (((x - fx) / (rx + 0.5)) ** 2 + ((y - (fy + 5)) / (ry * 0.8)) ** 2 < 1) & (y > fy + 4)
        beard |= ((x - (c - 1)) / 9) ** 2 + ((y - (fy + 15)) / 7) ** 2 < 1
        beard &= ~((y < fy + 7.5) & (np.abs(x - fx) < rx - 3))
        hair_paint(beard)
        s[beard & outline(beard) & (y > fy + 12)] = hair_t[0]
    if rank == 11:                                                  # валет: без усов, спокойная дружелюбная улыбка
        s[row(my - 1) & span(c - 1.5, c + 1.5)] = lip                    # верхняя губа
        s[row(my) & span(c - 3.5, c + 3.5)] = LIP_D                     # широкая закрытая улыбка
        s[row(my - 1) & (span(c - 4.5, c - 3.5) | span(c + 3.5, c + 4.5))] = LIP_D   # уголки вверх
        s[row(my + 1) & span(c - 2.5, c + 2.5)] = lip_l
        s[row(my + 2) & span(c - 1.5, c + 1.5)] = SKIN_T[2]
        s[row(my - 2) & (span(c - 5.5, c - 4.5) | span(c + 4.5, c + 5.5))] = SKIN_T[2]  # ямочки
        for bx in (c + 6, c - 7.5):                                  # лёгкий румянец
            s[face & (((x - bx) / 2.2) ** 2 + ((y - (fy + 4)) / 1.0) ** 2 < 1)] = C("#dc9a82")
        s[row(my + 5) & span(c - 2.5, c + 2.5) & face] = SKIN_T[4]      # блик на подбородке
    else:
        s[row(my - 1) & span(c - 2.5 + male, c + 2.5 - male)] = lip
        s[row(my) & span(c - 3.5, c + 3.5)] = LIP_D
        s[row(my + 1) & span(c - 2.5, c + 2.5)] = lip_l
    if rank == 12:
        s[row(my) & (span(c - 4.5, c - 3.5) | span(c + 3.5, c + 4.5))] = SKIN_T[2]
        s[row(my + 2) & span(c - 1.5, c + 1.5)] = SKIN_T[2]
    elif rank == 13:                                                # усы над губой
        s[row(my - 1) & span(c - 5.5, c + 5.5)] = hair_t[2]
        s[row(my - 2) & span(c - 3.5, c + 3.5)] = hair_t[3]
        s[row(my) & (span(c - 5.5, c - 3.5) | span(c + 3.5, c + 5.5))] = hair_t[2]
        s[row(my + 1) & (span(c - 5.5, c - 4.5) | span(c + 4.5, c + 5.5))] = hair_t[1]
    # линия роста волос: дуга над лбом
    if rank == 11:                                                  # кудрявая чёлка, зачёсанная набок
        hairline = face & (y < 23.5 - (x - fx) * 0.22 + 5.5 * ((x - (fx - 2)) / rx) ** 2)
        hairline |= face & (x < fx - rx + 2.5) & (y < fy + 2)              # кудри у висков
        curls(hairline)
    else:
        hairline = face & (y < 21 + 6.5 * ((x - (fx - 1)) / rx) ** 2)
        hair_paint(hairline)
    if rank == 12:                                                  # длинные пряди спереди по плечам
        front = poly(w, h, [(fx - rx - 4, fy - 6), (fx - rx + 1.5, fy - 6), (fx - rx + 2, fy + 9), (fx - rx - 1, 70),
                            (fx - rx - 7, 72), (fx - rx - 6, fy + 6)])
        front |= poly(w, h, [(fx + rx - 1.5, fy - 6), (fx + rx + 4, fy - 6), (fx + rx + 6, fy + 8), (fx + rx + 3, 66),
                             (fx + rx - 1, 64), (fx + rx + 0.5, fy + 8)])
        hair_paint(front)
        s[front & outline(front)] = hair_t[0]

    # --- головной убор ---
    if rank == 11:                                                  # берет с пером
        beret = (((x - cx - 2) / 22) ** 2 + ((y - 10) / 8.5) ** 2 < 1) & (y < 17)
        paint(s, beret, cloth, 0.55 + light(cx, 6, 22, 9) + n * 0.1)
        s[beret & (np.abs(((x - cx + 2) % 8) - 4) < 0.5) & (y > 4) & (y < 14)] = cloth[2]
        band = (y >= 15) & (y < 19) & (np.abs(x - cx) < 18.5)
        s[band] = cloth[2]
        s[band & (y < 16)] = STRAP_T[3]
        s[band & (y >= 18)] = cloth[0]
        plume_c = ramp(st["plume"], (0.6, 0.8, 1.0, 1.15))
        plume = bezier_band(w, h, (cx + 14, 15), (cx + 27, 10), (cx + 29, 1), 3.0, 1.0)
        paint(s, plume, plume_c, 0.5 + light(cx + 24, 8, 6, 8))
        s[bezier_band(w, h, (cx + 14, 15), (cx + 26, 11), (cx + 28.5, 2), 0.5, 0.5) & plume] = STRAP_T[1]
        s[(x - (cx + 14)) ** 2 + (y - 15.5) ** 2 < 4] = gem
    elif rank == 12:                                                # диадема с камнем и жемчугом
        band = (y >= 15) & (y < 17.5) & (np.abs(x - cx) < 14)
        s[band] = STRAP_T[2]
        s[band & (y < 16)] = STRAP_T[3]
        for k, ht in ((-8, 4), (0, 7), (8, 4)):
            tri = poly(w, h, [(cx + k - 3, 15.5), (cx + k, 15.5 - ht), (cx + k + 3, 15.5)])
            s[tri] = STRAP_T[2]
            s[tri & (x < cx + k)] = STRAP_T[3]
            s[(x - cx - k) ** 2 + (y - (15 - ht)) ** 2 < 1.6] = C("#f4f0ea")
        s[(x - cx) ** 2 + (y - 14) ** 2 < 3] = gem
    else:                                                           # корона на бархатной шапке
        cap = (((x - cx) / 16) ** 2 + ((y - 9) / 8) ** 2 < 1) & (y < 15)
        s[cap] = cloth[2]
        s[cap & (x > cx + 3)] = cloth[3]
        band = (y >= 13) & (y < 19.5) & (np.abs(x - cx) < 18.5)
        s[band] = STRAP_T[2]
        s[band & (y < 14)] = STRAP_T[3]
        s[band & (y >= 18.5)] = STRAP_T[0]
        for k in range(5):
            tx = cx - 16 + k * 8
            tooth = poly(w, h, [(tx - 3.2, 14), (tx, 2.5), (tx + 3.2, 14)])
            s[tooth] = STRAP_T[2]
            s[tooth & (x < tx)] = STRAP_T[3]
            s[(x - tx) ** 2 + (y - 2.8) ** 2 < 2.6] = STRAP_T[3]
        for gx in (cx - 9, cx, cx + 9):
            s[(np.abs(x - gx) + np.abs(y - 16.2)) < 2] = gem

    # тёмный контур силуэта, кроме краёв рамки
    m = s[..., 3] > 0.5
    s[outline(m) & (x > 1) & (x < w - 1) & (y < h - 1)] = OUTLINE_INK
    return s


def face_card(img, rank, suit):
    base = img.copy()
    x0, y0, x1, y1 = FACE_BOX
    x, y = grid(W, H)
    border = (((np.abs(x - x0 - 0.5) < 0.5) | (np.abs(x - x1 - 0.5) < 0.5)) & (y >= y0) & (y < y1 + 1))
    border |= (((np.abs(y - y0 - 0.5) < 0.5) | (np.abs(y - y1 - 0.5) < 0.5)) & (x >= x0) & (x < x1 + 1))
    img[border] = FRAME_INK
    fw, inner = x1 - x0 - 1, y1 - y0 - 1
    fig = figure(rank, suit, fw, FIG_TOP + FIG_OVER)
    paste(img, fig, x0 + 1, y0 + 1 - FIG_OVER)
    bottom = rot180(fig[FIG_OVER:FIG_OVER + inner - FIG_TOP])               # снизу — перевёрнутая голова
    paste(img, bottom, x0 + 1, y0 + 1 + FIG_TOP)
    # нижний индекс лежит поверх угла рамки — под ним чистая бумага (как на референсе)
    img[139:184, 98:121] = base[139:184, 98:121]


# ---------------------------------------------------------------------------
# 7♠ — джокер-шут (по референсу)
# ---------------------------------------------------------------------------
def jester_half(w=100, h=78):
    """Верхняя половина шута по референсу 21: три рога колпака с бубенцами, маска с ухмылкой и «слезой»,
    зубчатое кремовое жабо, тёмный камзол с красными ромбами и золотой каймой, завитки по бокам."""
    J = JOKER
    s = canvas(w, h)
    x, y = grid(w, h)
    n = smooth_noise(w, h, 6, np.random.default_rng(7)) - 0.5
    cx = w / 2
    REDS = [C("#3e1012"), J["red_d"], J["red"], J["red_l"]]
    BLKS = [C("#120808"), J["black"], C("#2e1c1c"), J["black_l"]]
    CREAM = [C("#9a8a76"), J["cream_d"], C("#d8cab4"), J["cream"]]
    GOLDS = [GOLD_D, J["gold"], J["gold_l"]]

    def light(x0, y0, rx, ry):                                     # свет сверху-слева, как на референсе
        return -(x - x0) / rx * 0.3 - (y - y0) / ry * 0.3

    # боковые рога: левый красный, правый чёрный — вверх и дугой вниз к бубенцам
    left = bezier_band(w, h, (cx - 7, 27), (cx - 36, 0), (cx - 29, 39), 8.5, 2.5)
    right = bezier_band(w, h, (cx + 7, 27), (cx + 36, 0), (cx + 29, 39), 8.5, 2.5)
    paint(s, left, REDS, 0.6 + light(cx - 22, 14, 14, 14) + n * 0.5)
    paint(s, right, BLKS, 0.45 + light(cx + 22, 14, 14, 14) + n * 0.5)
    s[right & bezier_band(w, h, (cx + 11, 27), (cx + 31, 9), (cx + 28, 34), 2.2, 0.8)] = REDS[1]   # красная изнанка
    # средний рог — высокий колпак: красный с чёрной серединой, золотая кайма
    mid = poly(w, h, [(cx + 2, 0), (cx + 14, 28), (cx - 14, 28)])
    paint(s, mid, REDS, 0.6 + light(cx, 10, 10, 20) + n * 0.4)
    s[poly(w, h, [(cx + 2, 6), (cx + 7, 27), (cx - 4, 27)])] = BLKS[1]
    s[mid & outline(mid) & (y > 3)] = GOLDS[1]
    # чёрные волосы вокруг маски
    hair = poly(w, h, [(cx - 15, 26), (cx + 15, 26), (cx + 16, 42), (cx + 9, 52), (cx - 9, 52), (cx - 16, 42)])
    paint(s, hair, BLKS, 0.3 + light(cx, 30, 15, 20) + n * 0.4)
    # камзол: тёмный, с красными ромбами и золотой каймой к центральному ромбу
    body = poly(w, h, [(cx - 27, h + 1), (cx - 22, 60), (cx + 22, 60), (cx + 27, h + 1)])
    paint(s, body, BLKS, 0.4 + light(cx, 64, 25, 15) + n * 0.4)
    dia = body & ((np.abs((x - cx) % 12 - 6) + np.abs((y - 60) % 12 - 6)) < 4.5)
    paint(s, dia, REDS, 0.55 + light(cx, 64, 25, 15) + n * 0.3)
    for a, b in (((cx - 24, 62), (cx - 3, h + 1)), ((cx + 24, 62), (cx + 3, h + 1))):
        m, _ = strap_line(w, h, a, b, 1.1)
        s[m & body] = GOLDS[1]
    # завитки рукавов по бокам (чёрные, с красной серединой и ромбиком)
    for side in (-1, 1):
        scroll = bezier_band(w, h, (cx + side * 22, 62), (cx + side * 46, 62), (cx + side * 38, 77), 5, 3)
        paint(s, scroll, BLKS, 0.45 + light(cx + side * 36, 62, 8, 8) + n * 0.4)
        s[bezier_band(w, h, (cx + side * 26, 63), (cx + side * 42, 63.5), (cx + side * 37, 73), 1.6, 1.0)] = REDS[2]
        s[(np.abs(x - (cx + side * 34)) + np.abs(y - 71)) < 2.5] = BLKS[0]
        s[(np.abs(x - (cx + side * 34)) + np.abs(y - 71)) < 1.2] = GOLDS[1]
    # жабо: веер кремовых складок с зубчатым нижним краем
    fx = x - cx
    ruff = poly(w, h, [(cx - 31, 59), (cx - 23, 46), (cx - 9, 49), (cx, 51), (cx + 9, 49), (cx + 23, 46), (cx + 31, 59),
                       (cx + 27, 67), (cx - 27, 67)])
    ruff &= y < 61 + 5 * (1 - np.abs((fx % 8) - 4) / 4)                # зубцы
    ang = np.degrees(np.arctan2(y - 48, fx))
    pleat = (ang / 11) % 1
    paint(s, ruff, CREAM, 0.75 - 0.6 * np.abs(pleat - 0.5) + light(cx, 50, 30, 15) * 0.5 + n * 0.2)
    s[ruff & (pleat < 0.12)] = CREAM[0]
    s[ruff & outline(ruff) & (y > 55)] = BLKS[1]
    # маска: белая, глаза-щёлки, «слеза», ухмылка
    face = poly(w, h, [(cx - 11, 28), (cx + 11, 28), (cx + 11.5, 38), (cx + 7, 47), (cx + 2, 52), (cx - 2, 52),
                       (cx - 7, 47), (cx - 11.5, 38)])
    paint(s, face, CREAM, 0.75 + light(cx, 34, 12, 14) + n * 0.2)
    s[face & outline(face)] = CREAM[0]
    for side in (-1, 1):
        eye, _ = strap_line(w, h, (cx + side * 9, 34.5), (cx + side * 2.5, 37), 0.9)
        s[eye] = BLKS[0]
        brow, _ = strap_line(w, h, (cx + side * 10, 31.5), (cx + side * 3, 33.5), 0.6)
        s[brow & face] = CREAM[1]
    s[(np.abs(x - (cx - 6.2 + (y - 38) * 0.08)) < 0.6) & (y > 38) & (y < 47)] = REDS[2]       # слеза
    s[(x - (cx - 5.4)) ** 2 + (y - 47.5) ** 2 < 1.3] = REDS[2]
    s[bezier_band(w, h, (cx - 7, 41.5), (cx, 47.5), (cx + 7, 41.5), 0.7, 0.7)] = BLKS[0]        # ухмылка
    s[bezier_band(w, h, (cx - 5, 43.5), (cx, 48.2), (cx + 5, 43.5), 0.55, 0.55) & face] = REDS[2]
    s[(np.abs(x - cx) < 0.6) & (y > 48) & (y < 52)] = REDS[1]
    # бубенцы
    for bx, by, r in ((cx - 29, 41, 3.4), (cx + 29, 41, 3.4), (cx + 13, 25, 2.6)):
        bell = (x - bx) ** 2 + (y - by) ** 2 < r * r
        paint(s, bell, GOLDS, 0.6 + light(bx, by, r, r) * 1.5)
        s[bell & outline(bell)] = GOLD_D
        s[(np.abs(x - bx) < 1) & (np.abs(y - by + r * 0.3) < 0.6)] = C("#fff0c8")
    # тёмный контур силуэта
    m = s[..., 3] > 0.5
    s[outline(m) & (y < h - 1)] = BLKS[0]
    return s


def joker_card(img):
    x, y = grid(W, H)
    half = jester_half()
    paste(img, half, (W - 100) // 2, 18)
    paste(img, rot180(half), (W - 100) // 2, H - 18 - 78)
    cx, cy = W / 2, H / 2
    d = np.abs(x - cx) / 15 + np.abs(y - cy) / 16
    img[d < 1.08] = C("#120808")
    img[d < 1] = JOKER["gold_l"]
    img[d < 0.9] = JOKER["gold"]
    img[d < 0.8] = JOKER_PAPER[5]
    img[(d < 0.74) & (d > 0.68)] = GOLD_D
    paste(img, suit_sprite("spades", 15), int(cx - 7.5), int(cy - 7.5))
    # боковые линии со звёздочкой (как на референсе)
    for lx in (14, W - 15):
        img[(np.abs(x - lx - 0.5) < 0.5) & (np.abs(y - cy) < 26)] = JOKER["gold"]
        img[(np.abs(x - lx - 0.5) + np.abs(y - cy) * 0.6) < 3] = JOKER["gold_l"]


def joker_frame(img):
    x, y = grid(W, H)
    for inset, col in ((5, JOKER["gold"]), (8, GOLD_D)):
        m = ((np.abs(x - inset - 0.5) < 0.5) | (np.abs(x - (W - inset - 0.5)) < 0.5)) & (y > inset) & (y < H - inset)
        m |= ((np.abs(y - inset - 0.5) < 0.5) | (np.abs(y - (H - inset - 0.5)) < 0.5)) & (x > inset) & (x < W - inset)
        img[m] = col
    for px, py in ((W / 2, 6), (W / 2, H - 6), (5.5, H / 2), (W - 5.5, H / 2)):            # звёздочки на рамке
        st = (np.abs(x - px) + np.abs(y - py) * 0.55 < 3.5) | (np.abs(x - px) * 0.55 + np.abs(y - py) < 3.5)
        img[st] = JOKER["gold"]
        img[(np.abs(x - px) < 1) & (np.abs(y - py) < 1)] = JOKER["gold_l"]
    f = flourish()
    f[f[..., 3] > 0.5] = JOKER["gold"]
    paste(img, f[:, ::-1], W - 17, 4)
    paste(img, f[::-1, :], 4, H - 17)


# ---------------------------------------------------------------------------
# Рубашка, торец, значки мастей
# ---------------------------------------------------------------------------
def back_card(seed=99):
    rng = np.random.default_rng(seed)
    img = canvas()
    x, y = grid(W, H)
    shape = card_shape()
    img[shape] = C("#e0ac92")                                           # поля — бумага (шире, как на референсе)
    field = shape & (x > 7) & (x < W - 7) & (y > 7) & (y < H - 7)
    n = smooth_noise(W, H, 20, rng)
    reds = [C("#3e0b0a"), C("#511316"), C("#631521"), C("#6e1c26")]
    idx = np.clip(np.round(2 + (n - 0.5) * 2), 0, 3).astype(int)
    img[field] = np.array(reds)[idx][field]
    # золотая рамка: толстая линия и тонкая внутренняя
    for inset, col in ((9, GOLD), (10, GOLD_L), (13, GOLD_D)):
        m = ((np.abs(x - inset - 0.5) < 0.5) | (np.abs(x - (W - inset - 0.5)) < 0.5)) & (y > inset) & (y < H - inset)
        m |= ((np.abs(y - inset - 0.5) < 0.5) | (np.abs(y - (H - inset - 0.5)) < 0.5)) & (x > inset) & (x < W - inset)
        img[m] = col
    # угловые орнаменты как на референсе: ступенчатый треугольник — диагональ-«хребет»,
    # над ней горизонтальные штрихи, под ней вертикальные, ступенчатая кромка и ромбик на конце
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        ox, oy = (15 if sx > 0 else W - 15), (15 if sy > 0 else H - 15)
        u, v = (x - ox) * sx, (y - oy) * sy
        q = (u >= 0) & (v >= 0)
        tri = q & (u + v < 34)
        img[tri & (v < u - 2) & ((v % 4) < 1.6) & (u > 3)] = GOLD
        img[tri & (u < v - 2) & ((u % 4) < 1.6) & (v > 3)] = GOLD
        img[q & (np.abs(u + v - 34.5) < 1.2) & (np.abs(u - v) < 26)] = GOLD_D             # кромка
        spine = q & (np.abs(u - v) < 1.2) & (u + v < 44)
        img[spine] = GOLD_L
        tip = np.abs(u - 23) + np.abs(v - 23) < 4
        img[tip] = GOLD
        img[np.abs(u - 23) + np.abs(v - 23) < 1.8] = GOLD_L
        img[q & (u < 5) & (v < 5)] = GOLD_L
    # ромбики посередине сторон (на рамке) и звёздочки сверху/снизу
    for px, py in ((10.5, H / 2), (W - 10.5, H / 2), (W / 2, 10.5), (W / 2, H - 10.5)):
        img[np.abs(x - px) + np.abs(y - py) < 4] = GOLD
        img[np.abs(x - px) + np.abs(y - py) < 1.8] = GOLD_L
    for px, py in ((W / 2, 25), (W / 2, H - 25)):
        st = (np.abs(x - px) + np.abs(y - py) * 0.5 < 3) | (np.abs(x - px) * 0.5 + np.abs(y - py) < 3)
        img[st] = GOLD
        img[(np.abs(x - px) < 1) & (np.abs(y - py) < 1)] = GOLD_L
    # центральный ромб: двойной контур, крест, лепестки, «листья» в четвертях
    cx, cy = W / 2, H / 2
    d = np.abs(x - cx) / 38 + np.abs(y - cy) / 54
    img[(d < 1) & (d > 0.92)] = GOLD
    img[(d < 0.95) & (d > 0.93)] = GOLD_L
    img[(d < 0.88) & (d > 0.84)] = GOLD_D
    inner = d < 0.82
    cross = inner & ((np.abs(x - cx) < 2) | (np.abs(y - cy) < 2))
    img[cross] = GOLD
    petals = inner & (np.abs(np.abs(x - cx) / 14 + np.abs(y - cy) / 20 - 1) < 0.16)
    img[petals] = GOLD_L
    for lx, ly in ((cx - 12, cy - 17), (cx + 12, cy - 17), (cx - 12, cy + 17), (cx + 12, cy + 17)):
        leaf = np.abs(x - lx) / 5 + np.abs(y - ly) / 7 < 1
        img[leaf] = GOLD_D
        img[np.abs(x - lx) / 2.5 + np.abs(y - ly) / 3.5 < 1] = GOLD
    img[inner & (np.abs(np.abs(x - cx) / 25 + np.abs(y - cy) / 36 - 1) < 0.07)] = GOLD
    ax, ay = np.abs(x - cx), np.abs(y - cy)                              # «ёлочка» вдоль креста — гуще, как на референсе
    img[inner & (ay > 8) & ((ay % 5) < 1.2) & (ax < 6 - ay * 0.09) & (ax > 2)] = GOLD_D
    img[inner & (ax > 7) & ((ax % 5) < 1.2) & (ay < 6 - ax * 0.12) & (ay > 2)] = GOLD_D
    ring = np.abs(np.hypot(x - cx, y - cy) - 6) < 1.2
    img[ring] = GOLD_L
    img[np.hypot(x - cx, y - cy) < 3] = GOLD
    img[~shape] = TRANSPARENT
    return img


def edge_cell():
    img = canvas()
    img[...] = C("#e2b496")
    return img


def icon_cell(suit):
    img = canvas()
    S = 96
    paste(img, suit_sprite(suit, S), (W - S) // 2, (H - S) // 2)
    return img


# ---------------------------------------------------------------------------
# Карта и атлас
# ---------------------------------------------------------------------------
def card(rank, suit):
    seed = SUITS.index(suit) * 20 + rank
    joker = suit == "spades" and rank == 7
    img = paper(seed, JOKER_PAPER if joker else PAPER)
    if joker:
        joker_frame(img)
        joker_card(img)
        index(img, rank, suit, color=JOKER["black"], pip_size=17, bold=True)
    else:
        frame(img)
        if rank == 14:
            ace_card(img, suit)
        elif rank >= 11:
            face_card(img, rank, suit)
        else:
            pip_card(img, rank, suit)
        index(img, rank, suit, with_suit=rank >= 11)
    img[~card_shape()] = TRANSPARENT
    return img


def atlas():
    a = np.zeros((ROWS * H, COLS * W, 4), np.float32)

    def put(cell, img):
        r, c = divmod(cell, COLS)
        a[r * H:(r + 1) * H, c * W:(c + 1) * W] = img

    for si, suit in enumerate(SUITS):
        for ri, rank in enumerate(RANKS):
            put(si * len(RANKS) + ri, card(rank, suit))
    put(CELL_BACK, back_card())
    put(CELL_EDGE, edge_cell())
    for i, suit in enumerate(SUITS):
        put(CELL_ICON + i, icon_cell(suit))
    return a

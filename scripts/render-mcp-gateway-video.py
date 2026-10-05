# Terminal-style ASCII explainer of Uber's MCP Gateway for LinkedIn: one plain idea per screen.
# python3 scripts/render-mcp-gateway-video.py [--preview]
# Requires ffmpeg, Pillow, numpy and pyfiglet. Writes to out/mcp-gateway/.
import math, os, random, subprocess, sys
import numpy as np
import pyfiglet
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'out/mcp-gateway')
os.makedirs(OUT, exist_ok=True)
PREVIEW = '--preview' in sys.argv

W = H = 1080
FPS = 30
COLS, ROWS = 46, 19
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
BOLD_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'

BG = (9, 13, 10)
FG = (196, 236, 204)
GREEN = (61, 255, 122)
DIM = (74, 120, 88)
AMBER = (255, 181, 71)
RED = (255, 95, 86)
CYAN = (94, 230, 255)
WHITE = (236, 244, 238)

# Window geometry
WX, WY, WW, WH = 36, 36, W - 72, H - 72
BAR = 46
PAD = 26
font = ImageFont.truetype(FONT_PATH, 32)
CW = font.getlength('M')
LH = 46
GX = WX + (WW - CW * COLS) / 2
GY = WY + BAR + PAD + 8


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


class Scr:
    def __init__(self):
        self.ch = [[' '] * COLS for _ in range(ROWS)]
        self.co = [[FG] * COLS for _ in range(ROWS)]

    def put(self, r, c, text, color=FG):
        if not 0 <= r < ROWS:
            return
        for i, x in enumerate(text):
            cc = c + i
            if 0 <= cc < COLS:
                self.ch[r][cc] = x
                self.co[r][cc] = color

    def center(self, r, text, color=FG):
        self.put(r, (COLS - len(text)) // 2, text, color)

    def typed(self, r, c, text, lt, start, cps=45, color=FG, cursor=True):
        n = int(max(0.0, lt - start) * cps)
        if n <= 0:
            return False
        self.put(r, c, text[:n], color)
        if n < len(text) and cursor:
            self.put(r, c + n, '█', GREEN)
        return n >= len(text)

    def prompt(self, r, cmd, lt, start, cps=28, cursor_after=True):
        self.put(r, 0, '~', CYAN)
        self.put(r, 2, '$', GREEN)
        done = self.typed(r, 4, cmd, lt, start, cps, WHITE)
        if lt < start:
            if int(lt * 2.2) % 2 == 0:
                self.put(r, 4, '█', GREEN)
        elif done and cursor_after and int(lt * 2.2) % 2 == 0:
            self.put(r, 4 + len(cmd), '█', GREEN)
        return done

    def box(self, r, c, h, w, color=DIM, title=None, tcolor=None):
        self.put(r, c, '┌' + '─' * (w - 2) + '┐', color)
        for i in range(1, h - 1):
            self.put(r + i, c, '│', color)
            self.put(r + i, c + w - 1, '│', color)
        self.put(r + h - 1, c, '└' + '─' * (w - 2) + '┘', color)
        if title:
            self.put(r, c + 2, f' {title} ', tcolor or color)

    def header(self, num, title, lt):
        self.put(0, 0, f'## {num}', AMBER)
        self.typed(0, 6, title, lt, 0.05, 60, WHITE, cursor=False)
        n = int(min(1, lt / 0.5) * COLS)
        self.put(1, 0, '─' * n, DIM)


def spinner(t):
    return '|/-\\'[int(t * 10) % 4]


# ── Scenes: one idea per screen, everyday words ─────────────────────────────


def line_pts(r0, c0, r1, c1):
    pts = []
    dr, dc = abs(r1 - r0), abs(c1 - c0)
    sr, sc = (1 if r1 > r0 else -1), (1 if c1 > c0 else -1)
    err = dc - dr
    r, c = r0, c0
    while True:
        pts.append((r, c))
        if r == r1 and c == c1:
            break
        e2 = 2 * err
        if e2 > -dr:
            err -= dr
            c += sc
        if e2 < dc:
            err += dc
            r += sr
    return pts


def ctyped(s, r, text, lt, start, cps=30, color=WHITE):
    s.typed(r, (COLS - len(text)) // 2, text, lt, start, cps, color, cursor=False)


def title(s, lines, lt, start=0.2, color=WHITE, row=2):
    t = start
    for i, text in enumerate(lines):
        ctyped(s, row + i, text, lt, t, 32, color)
        t += len(text) / 32 + 0.15


BLOCKS = [(r, c) for r in range(7, 15, 2) for c in range(20, 41, 3)]
rng = random.Random(3)
CHAOS = [(rng.choice([8, 10, 12]), rng.choice(BLOCKS)) for _ in range(22)]


def blocks(s, lt, start, color=DIM, lit=()):
    for k, (r, c) in enumerate(BLOCKS):
        if lt > start + k * 0.03:
            s.put(r, c, '■' if (r, c) in lit else '▪', GREEN if (r, c) in lit else color)


def s_intro(s, lt):
    s.prompt(0, 'cat uber-y-la-ia.txt', lt, 0.4, cursor_after=False)
    title(s, ['¿Cómo deja Uber que la IA', 'use sus sistemas internos', 'sin perder el control?'], lt, 1.6, WHITE, row=7)
    if lt > 5.0:
        s.center(12, 'Uber Engineering · oct 2026', DIM)


def s_many(s, lt):
    title(s, ['Uber tiene miles de', 'sistemas internos.'], lt)
    blocks(s, lt, 1.2)
    if lt > 3.4:
        s.center(17, 'viajes · pagos · mapas · pedidos…', DIM)


LIT = [BLOCKS[i] for i in (2, 9, 15, 20, 26)]


def s_want(s, lt):
    title(s, ['Quiere que la IA', 'pueda usarlos.'], lt)
    blocks(s, lt, 0, lit=LIT if lt > 2.2 else ())
    if lt > 1.4:
        s.put(10, 3, '[ IA ]', CYAN)
    if lt > 2.2:
        for k, (r, c) in enumerate(LIT):
            pts = line_pts(10, 9, r, c - 1)
            grow = ease((lt - 2.2 - k * 0.2) / 0.6)
            for (pr, pc) in pts[1:int(len(pts) * grow)]:
                if s.ch[pr][pc] == ' ':
                    s.put(pr, pc, '·', GREEN)
    if lt > 4.2:
        s.center(17, 'para ayudar con datos reales', DIM)


def s_mess(s, lt):
    title(s, ['Pero si cada equipo la', 'conecta a su manera…'], lt)
    blocks(s, lt, 0)
    s.put(10, 3, '[ IA ]', CYAN)
    n = int(max(0, lt - 1.8) * 10)
    for k, (ar, (r, c)) in enumerate(CHAOS[:n]):
        for (pr, pc) in line_pts(ar, 9, r, c - 1)[1:]:
            if s.ch[pr][pc] == ' ':
                s.put(pr, pc, '·', RED if k % 2 else AMBER)
        s.put(r, c, '■', AMBER)
    if lt > 4.4:
        s.center(17, 'nadie sabe qué puede tocar.', RED)


def s_door(s, lt):
    title(s, ['La idea de Uber:', 'una sola puerta.'], lt)
    if lt > 1.6:
        s.put(10, 1, '[ IA ]', CYAN)
        s.put(10, 8, '───▶', DIM)
    if lt > 2.0:
        s.box(7, 13, 7, 14, GREEN)
        s.put(9, 16, 'PUERTA', WHITE)
        s.put(11, 15, '(gateway)', DIM)
        s.put(10, 28, '───▶', DIM)
    if lt > 2.4:
        for r in range(7, 15, 2):
            for c in (34, 37, 40, 43):
                s.put(r, c, '▪', DIM)
    if lt > 2.8:
        for k in range(3):
            p = (lt * 0.5 + k / 3) % 1.0
            path = [(10, c) for c in range(8, 12)] + [(10, c) for c in range(28, 32)]
            r, c = path[int(p * (len(path) - 1))]
            s.put(r, c, '●', GREEN)
    if lt > 4.2:
        s.center(17, 'toda la IA entra por el mismo sitio', DIM)


def s_checks(s, lt):
    title(s, ['En la puerta se', 'revisa cada petición:'], lt)
    checks = ['¿quién eres?', '¿tienes permiso?', '¿hay datos privados?']
    for i, text in enumerate(checks):
        t = 1.8 + i * 1.0
        if lt > t:
            s.put(7 + i * 2, 9, text, FG)
            s.put(7 + i * 2, 35, '✓' if lt > t + 0.5 else '·', GREEN)
    if lt > 5.0:
        s.put(14, 9, 'teléfono:', DIM)
        p = ease((lt - 5.4) / 0.8)
        s.put(14, 19, '612 345 678'[:max(0, int(11 * (1 - p)))].ljust(11)
              if p < 1 else '███ ███ ███', RED if p >= 1 else FG)
        if p > 0 and p < 1:
            s.put(14, 19, '█' * int(11 * p), RED)
    if lt > 6.2:
        s.center(17, 'lo privado se tapa antes de salir', DIM)


def s_closed(s, lt):
    title(s, ['Todo lo nuevo', 'empieza cerrado.'], lt)
    items = ['ver un pedido', 'consultar un viaje', 'buscar un pago']
    for i, text in enumerate(items):
        if lt > 1.6 + i * 0.3:
            s.put(7 + i * 2, 6, text, FG)
            opened = i == 0 and lt > 4.8
            s.put(7 + i * 2, 27, '[ abierto ]' if opened else '[ cerrado ]', GREEN if opened else RED)
    if lt > 3.4:
        s.put(13, 6, '…hasta que su equipo lo aprueba', AMBER if lt < 4.8 else DIM)
    if lt > 5.6:
        s.center(17, 'nada se abre solo', WHITE)


def s_context(s, lt):
    title(s, ['La IA no lo carga', 'todo de golpe.'], lt)
    BW = 30
    if lt > 1.6:
        n = int(min(5000, (lt - 1.6) * 3500))
        fill = min(BW, int(n / 3000 * BW))
        s.put(7, 6, 'todo', DIM)
        s.put(7, 13, '█' * fill + '░' * (BW - fill), RED if n > 3000 else AMBER)
        s.put(8, 13, f'{n:,} opciones'.replace(',', '.'), FG)
        if n > 3000:
            s.put(8, 31, 'no cabe', RED)
    if lt > 3.8:
        s.center(11, 'pregunta solo lo que necesita:', WHITE)
    if lt > 4.8:
        s.put(13, 6, 'justo', DIM)
        s.put(13, 13, '██' + '░' * (BW - 2), GREEN)
        s.put(14, 13, '3 opciones', FG)
    if lt > 5.8:
        s.center(17, 'más rápido y más barato', DIM)


def count(lt, t0, target, dur=1.2):
    return int(ease((lt - t0) / dur) * target)


def big(s, row, value):
    lines = pyfiglet.figlet_format(f'{value:,}'.replace(',', '.'), font='ansi_regular').rstrip('\n').split('\n')[:5]
    w = max(len(l) for l in lines)
    for k, line in enumerate(lines):
        s.put(row + k, (COLS - w) // 2, line, GREEN)


def s_numbers(s, lt):
    if lt > 0.3:
        big(s, 1, count(lt, 0.3, 800))
        s.center(7, 'conexiones', WHITE)
    if lt > 1.5:
        big(s, 9, count(lt, 1.5, 5000))
        s.center(15, 'acciones', WHITE)
    if lt > 3.2:
        s.center(17, 'y una sola puerta', AMBER)


def s_outro(s, lt):
    title(s, ['Una puerta.', 'Reglas claras.'], lt, 0.2, WHITE, row=5)
    if lt > 1.8:
        s.center(10, 'artículo de Uber Engineering:', DIM)
        s.center(11, 'uber.com/blog/designing-mcp-gateway', FG)
    s.prompt(15, 'exit', lt, 3.0)


SCENES = [
    (6.5, s_intro),
    (5.0, s_many),
    (6.0, s_want),
    (6.0, s_mess),
    (6.5, s_door),
    (7.5, s_checks),
    (7.0, s_closed),
    (7.5, s_context),
    (5.5, s_numbers),
    (6.0, s_outro),
]
TOTAL = sum(d for d, _ in SCENES)

# ── Rendering ───────────────────────────────────────────────────────────────


def base_image():
    img = Image.new('RGB', (W, H), (4, 6, 5))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([WX, WY, WX + WW, WY + WH], 18, fill=BG, outline=(34, 46, 38), width=2)
    d.rounded_rectangle([WX, WY, WX + WW, WY + BAR], 18, fill=(20, 27, 22))
    d.rectangle([WX, WY + BAR - 18, WX + WW, WY + BAR], fill=(20, 27, 22))
    d.line([WX, WY + BAR, WX + WW, WY + BAR], fill=(34, 46, 38), width=2)
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx, cy = WX + 26 + i * 24, WY + BAR // 2
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=col)
    small = ImageFont.truetype(FONT_PATH, 17)
    title = 'uber-y-la-ia — zsh'
    d.text((WX + WW / 2 - small.getlength(title) / 2, WY + BAR / 2 - 10), title, font=small, fill=(120, 140, 126))
    return np.asarray(img).astype(np.float32)


BASE = base_image()
yy = np.arange(H)[:, None]
SCAN = (1.0 - 0.10 * ((yy % 3) == 0)).astype(np.float32)[..., None]
cx, cy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
VIG = (1.0 - 0.22 * np.clip(cx ** 2 + cy ** 2 - 0.35, 0, None)).astype(np.float32)[..., None]


# Box and block characters are drawn as geometry so they join across rows.
SINGLE = {'─': 'LR', '│': 'UD', '┌': 'RD', '┐': 'LD', '└': 'UR', '┘': 'UL', '├': 'UDR',
          '┤': 'UDL', '┬': 'LRD', '┴': 'LRU', '┼': 'UDLR'}
DOUBLE = {'═': 'LR', '║': 'UD', '╔': 'RD', '╗': 'LD', '╚': 'UR', '╝': 'UL'}


def glyph(d, r, c, chx, col):
    x0, y0 = GX + c * CW, GY + r * LH - 5
    x1, y1 = x0 + CW, y0 + LH
    mx, my = x0 + CW / 2, y0 + LH / 2
    if chx == '█':
        d.rectangle([x0, y0, x1, y1], fill=col)
    elif chx == '░':
        d.rectangle([x0 + 1, y0 + 10, x1 - 1, y1 - 10], fill=tuple(int(v * 0.22) for v in col))
    elif chx in SINGLE:
        for k in SINGLE[chx]:
            end = {'L': (x0, my), 'R': (x1, my), 'U': (mx, y0), 'D': (mx, y1)}[k]
            d.line([(mx, my), end], fill=col, width=2)
    elif chx in DOUBLE:
        for k in DOUBLE[chx]:
            for o in (-2.5, 2.5):
                if k in 'LR':
                    d.line([(mx, my + o), (x0 if k == 'L' else x1, my + o)], fill=col, width=1)
                else:
                    d.line([(mx + o, my), (mx + o, y0 if k == 'U' else y1)], fill=col, width=1)
    else:
        d.text((x0, y0 + 5), chx, font=font, fill=col)


def render(scr, flicker=0.0):
    layer = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r in range(ROWS):
        row, cols = scr.ch[r], scr.co[r]
        c = 0
        while c < COLS:
            col = cols[c]
            e = c
            while e < COLS and cols[e] == col:
                e += 1
            run = ''.join(row[c:e])
            if run.strip():
                # draw char-by-char at exact grid positions so block and box glyphs line up
                for k, chx in enumerate(run):
                    if chx != ' ':
                        glyph(d, r, c + k, chx, col)
            c = e
    txt = np.asarray(layer).astype(np.float32)
    glow = np.asarray(layer.filter(ImageFilter.GaussianBlur(9))).astype(np.float32)
    out = BASE + txt + glow * 0.55
    out = out * SCAN * VIG * (1.0 - flicker)
    return np.clip(out, 0, 255).astype(np.uint8)


def frame_at(t):
    acc = 0.0
    for i, (dur, fn) in enumerate(SCENES):
        if t < acc + dur or i == len(SCENES) - 1:
            lt = t - acc
            s = Scr()
            fn(s, lt)
            flick = 0.0
            # brief clear-screen glitch between scenes
            if lt < 0.12 and i > 0:
                flick = 0.5
            if i == len(SCENES) - 1 and lt > dur - 0.8:
                flick = ease((lt - (dur - 0.8)) / 0.8)
            return s, flick
        acc += dur


def main():
    if PREVIEW:
        times = [5, 10, 16, 22, 28.5, 36.5, 43.5, 51, 56.5, 62.5]
        for k, t in enumerate(times):
            s, f = frame_at(t)
            Image.fromarray(render(s, f)).save(os.path.join(OUT, f'preview-{k:02d}.png'))
        print('preview frames written to', OUT)
        return
    n = int(TOTAL * FPS)
    dst = os.path.join(OUT, 'mcp-gateway-ascii.mp4')
    ff = subprocess.Popen([
        'ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
        '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', dst,
    ], stdin=subprocess.PIPE)
    for i in range(n):
        s, f = frame_at(i / FPS)
        ff.stdin.write(render(s, f).tobytes())
        if i % 300 == 0:
            print(f'{i}/{n}', flush=True)
    ff.stdin.close()
    ff.wait()
    s, f = frame_at(SCENES[0][0] - 0.5)
    Image.fromarray(render(s, f)).save(os.path.join(OUT, 'cover.png'))
    print('wrote', dst, f'({TOTAL:.1f}s, {n} frames)')


if __name__ == '__main__':
    main()

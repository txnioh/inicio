# Terminal-style ASCII explainer of Uber's MCP Gateway, for LinkedIn.
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
COLS, ROWS = 72, 31
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
font = ImageFont.truetype(FONT_PATH, 22)
CW = font.getlength('M')
LH = 30
GX = WX + (WW - CW * COLS) / 2
GY = WY + BAR + PAD


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
        self.put(r, 0, 'txnio@inicio', GREEN)
        self.put(r, 12, ':', FG)
        self.put(r, 13, '~', CYAN)
        self.put(r, 14, '$ ', FG)
        done = self.typed(r, 16, cmd, lt, start, cps, WHITE)
        if lt < start:
            if int(lt * 2.2) % 2 == 0:
                self.put(r, 16, '█', GREEN)
        elif done and cursor_after and int(lt * 2.2) % 2 == 0:
            self.put(r, 16 + len(cmd), '█', GREEN)
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


# ── Scenes ──────────────────────────────────────────────────────────────────

BANNER_A = pyfiglet.figlet_format('MCP', font='ansi_shadow').rstrip('\n').split('\n')
BANNER_B = pyfiglet.figlet_format('GATEWAY', font='ansi_shadow').rstrip('\n').split('\n')


def s_intro(s, lt):
    done_at = 0.4 + len('curl -s uber.com/blog/designing-mcp-gateway') / 28
    s.prompt(0, 'curl -s uber.com/blog/designing-mcp-gateway', lt, 0.4, cursor_after=False)
    if lt > done_at + 0.2:
        if lt < done_at + 1.0:
            s.put(1, 0, f'{spinner(lt)} fetching…', DIM)
        else:
            s.put(1, 0, 'HTTP/2 200 · Uber Engineering · 1 oct 2026', DIM)
    t0 = done_at + 1.1
    if lt > t0:
        reveal = int(ease((lt - t0) / 1.0) * COLS)
        for i, line in enumerate(BANNER_A):
            c = (COLS - len(BANNER_A[0])) // 2
            s.put(4 + i, c, line[:max(0, reveal - c)], GREEN)
        for i, line in enumerate(BANNER_B):
            c = (COLS - len(BANNER_B[0])) // 2
            s.put(11 + i, c, line[:max(0, reveal - c)], GREEN)
    if lt > t0 + 1.2:
        s.center(19, '─' * 40, DIM)
        msg = 'cómo Uber conecta sus agentes de IA'
        s.typed(21, (COLS - len(msg)) // 2, msg, lt, t0 + 1.3, 40, WHITE, cursor=False)
        msg2 = 'con más de 10.000 servicios internos'
        s.typed(22, (COLS - len(msg2)) // 2, msg2, lt, t0 + 2.2, 40, WHITE, cursor=False)
    if lt > t0 + 3.4:
        s.center(25, 'resumen en terminal · 80 segundos', DIM)


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


rng = random.Random(7)
SVC = [(r, c) for r in range(9, 22, 2) for c in range(40, 70, 4)]
AGENTS = [10, 13, 16, 19]
CHAOS = [(rng.choice(AGENTS), rng.choice(SVC)) for _ in range(26)]


def s_problem(s, lt):
    s.header('01', 'el problema', lt)
    lines = [
        ('Uber vive en microservicios: +10.000 servicios internos', FG),
        ('que hablan HTTP, gRPC y TChannel.', FG),
        ('Los agentes mejoran mucho con contexto vivo del negocio…', FG),
    ]
    for i, (text, col) in enumerate(lines):
        s.put(3 + i, 0, '>', GREEN if lt > 0.3 + i * 1.2 else BG)
        s.typed(3 + i, 2, text, lt, 0.3 + i * 1.2, 55, col, cursor=False)
    if lt > 3.8:
        for k, r in enumerate(AGENTS):
            if lt > 3.8 + k * 0.15:
                s.put(r, 1, '[agente]', CYAN)
        for k, (r, c) in enumerate(SVC):
            if lt > 4.0 + k * 0.012:
                s.put(r, c, '▪', DIM)
        n = int(max(0, lt - 4.8) * 9)
        for k, (ar, (sr, sc)) in enumerate(CHAOS[:n]):
            pts = line_pts(ar, 10, sr, sc - 1)
            grow = min(1, (lt - 4.8 - k / 9) * 3)
            for (r, c) in pts[:int(len(pts) * grow)]:
                if s.ch[r][c] == ' ':
                    s.put(r, c, '·', RED if k % 3 == 0 else AMBER)
            s.put(sr, sc, '■', AMBER)
    if lt > 7.0:
        s.put(24, 0, '…así que cada equipo monta su propio servidor MCP.', WHITE)
    if lt > 8.0:
        s.put(26, 0, '⚠ "shadow MCP": agentes tocando producción sin', RED)
        s.put(27, 2, 'auth común, sin límites, sin trazas, sin dueño claro.', RED)


DROPS = [8, 27, 45, 63]
DROP_LABELS = [('HTTP', 'servicios'), ('gRPC', 'servicios'), ('TChannel', 'servicios'),
               ('MCP nativos', 'Jira · Google')]


def s_arch(s, lt):
    s.header('02', 'la solución: un gateway para todo MCP', lt)
    a = lambda t: lt > t
    if a(0.4):
        s.box(4, 0, 7, 12, CYAN)
        for i, x in enumerate(['agentes', 'IDEs', 'aifx CLI', 'chat']):
            s.put(5 + i, 2, x, FG)
    if a(1.0):
        gc = CYAN if lt > 1.0 else DIM
        s.box(3, 19, 10, 53, GREEN, 'MCP GATEWAY', WHITE)
        for r in range(4, 12):
            s.put(r, 45, '│', DIM)
        left = [('REGISTRY', WHITE), ('control plane', AMBER), ('· catálogo de servers', FG),
                ('· tools y equipo dueño', FG), ('· enable / disable', FG)]
        right = [('PROXY GATEWAY', WHITE), ('data plane', AMBER), ('· authz · rate limit', FG),
                 ('· redacción de datos', FG), ('· MCP → HTTP/gRPC/TCh', FG)]
        for i, (x, col) in enumerate(left):
            if a(1.4 + i * 0.25):
                s.put(4 + i + (1 if i > 1 else 0), 21, x, col)
        for i, (x, col) in enumerate(right):
            if a(2.6 + i * 0.25):
                s.put(4 + i + (1 if i > 1 else 0), 47, x, col)
    if a(0.8):
        s.put(7, 12, '──────▶', DIM)
    if a(4.0):
        for r in (13, 14, 15):
            s.put(r, 45, '│', DIM)
        s.put(14, 47, 'Muttley · service mesh', AMBER)
        s.put(16, DROPS[0], '┌' + '─' * (DROPS[-1] - DROPS[0] - 1) + '┐', DIM)
        for d in DROPS[1:-1]:
            s.put(16, d, '┼' if d == 45 else '┬', DIM)
        for d, (lab, sub) in zip(DROPS, DROP_LABELS):
            s.put(17, d, '│', DIM)
            s.put(18, d, '▼', DIM)
            s.put(19, d - len(lab) // 2, lab, WHITE)
            s.put(20, d - len(sub) // 2, sub, DIM)
    # packets
    if a(4.5):
        for k in range(4):
            p = (lt * 0.55 + k * 0.25) % 1.0
            path = [(7, c) for c in range(12, 19)] + [(r, 45) for r in range(13, 16)]
            d = DROPS[k]
            step = 1 if d > 45 else -1
            path += [(16, c) for c in range(45, d + step, step)] + [(17, d), (18, d)]
            r, c = path[int(p * (len(path) - 1))]
            s.put(r, c, '●', GREEN)
    if a(6.2):
        s.typed(23, 0, '→ los servicios de abajo no cambian ni una línea.', lt, 6.2, 50, WHITE, cursor=False)
    if a(7.6):
        s.typed(24, 0, '→ el gateway traduce MCP al protocolo nativo de cada uno.', lt, 7.6, 50, WHITE, cursor=False)
    if a(9.0):
        s.typed(26, 0, 'registry decide QUÉ existe · proxy decide CÓMO se llama', lt, 9.0, 50, AMBER, cursor=False)


CRAWL = [
    ('rides/pricing.proto', 'pricing.estimate_fare'),
    ('eats/orders.thrift', 'eats.get_order_status'),
    ('maps/eta.proto', 'maps.get_eta'),
    ('payments/refunds.proto', 'payments.list_refunds'),
]


def s_crawl(s, lt):
    s.header('03', 'AutoCrawler: de IDL a tool sin escribir un servidor', lt)
    s.put(3, 0, 'workflow en Cadence que escanea el registro de IDLs (proto/thrift)', DIM)
    row = 5
    for i, (idl, tool) in enumerate(CRAWL):
        t = 0.5 + i * 1.25
        if lt < t:
            break
        steps = [
            ('[scan] ', CYAN, f'idl-registry ▸ {idl}'),
            ('[parse]', CYAN, 'métodos · schemas req/resp · comentarios'),
            ('[llm]  ', AMBER, 'descripción pensada para agentes'),
            ('[mcp]  ', GREEN, f'{tool:<24} DISABLED'),
        ]
        if i < 2:
            for j, (tag, col, msg) in enumerate(steps):
                if lt > t + j * 0.28:
                    s.put(row, 0, tag, col)
                    busy = lt < t + (j + 1) * 0.28 and j < 3
                    s.put(row, 8, msg + (f' {spinner(lt)}' if busy else ''), FG if j < 3 else WHITE)
                    if j == 3:
                        s.put(row, 8 + 25, 'DISABLED', RED)
                    row += 1
            row += 1 if lt > t + 1.1 else 0
        else:
            s.put(row, 0, '[mcp]  ', GREEN)
            s.put(row, 8, f'{tool:<24} ', WHITE)
            s.put(row, 33, 'DISABLED', RED)
            row += 1
    if lt > 5.6:
        s.put(17, 0, '(nombres de tools ilustrativos)', DIM)
    if lt > 6.2:
        s.box(19, 0, 6, 44, DIM, 'mcp/eats.yaml · revisado por el equipo dueño', FG)
        s.put(20, 2, 'tools:', FG)
        s.put(21, 4, '- name: eats.get_order_status', FG)
        if lt > 7.2:
            s.put(22, 4, '-  enabled: false', RED)
            s.put(23, 4, '+  enabled: true', GREEN)
        else:
            s.put(22, 4, '   enabled: false', FG)
    if lt > 7.6:
        s.put(20, 47, '✔ revisado', GREEN)
        s.put(21, 47, '✔ commit como código', GREEN)
        s.put(22, 47, '✔ eats.get_order_status', GREEN)
        s.put(23, 49, 'ahora ENABLED', GREEN)
    if lt > 8.6:
        s.center(27, '  descubrir ≠ exponer  ', WHITE)
        s.center(28, 'todo nace desactivado hasta que su dueño lo aprueba', AMBER)


STAGES = [
    ('authn', 'token del usuario viaja aguas abajo'),
    ('authz', 'política a nivel de tool'),
    ('rate ', 'rate limiting por llamada'),
    ('xlate', 'JSON → bytes Protobuf · gRPC vía Muttley'),
    ('svc  ', 'eats-orders responde'),
    ('redac', 'datos sensibles fuera de la respuesta'),
]


def scramble(text, p, seed):
    r = random.Random(seed)
    out = []
    for i, ch in enumerate(text):
        if ch in '" ,:{}':
            out.append(ch)
        elif r.random() < p:
            out.append(r.choice('#%&*@$01'))
        else:
            out.append(ch)
    return ''.join(out)


def s_call(s, lt):
    s.header('04', 'la vida de una llamada', lt)
    s.put(3, 0, 'agente', CYAN)
    s.typed(3, 7, '→ tools/call eats.get_order_status {"order_id":"8f2c…"}', lt, 0.3, 55, WHITE, cursor=False)
    for i, (tag, msg) in enumerate(STAGES):
        t = 1.6 + i * 0.75
        r = 5 + i * 2
        s.put(r - 1, 2, '│', DIM)
        if lt < t - 0.4:
            continue
        last = i == len(STAGES) - 1
        s.put(r, 2, '└─' if last else '├─', DIM)
        s.put(r, 5, f'[{tag}]', AMBER)
        s.put(r, 13, msg, FG)
        if lt > t:
            s.put(r, 66, '✓', GREEN)
        else:
            s.put(r, 66, spinner(lt), DIM)
            s.put(r - 1, 2, '●', GREEN)
    if lt > 6.6:
        s.box(18, 0, 9, 56, DIM, 'respuesta al agente', FG)
        s.put(19, 2, '{', FG)
        s.put(20, 4, '"status": "en camino",', FG)
        s.put(21, 4, '"eta_min": 12,', FG)
        p = ease((lt - 7.4) / 1.4)
        real = ['"phone":   "+34 612 345 678",', '"address": "C/ Mayor 14, 3ºB",']
        red = ['"phone":   "[REDACTED]",', '"address": "[REDACTED]",']
        for k in range(2):
            if lt < 7.4:
                s.put(22 + k, 4, real[k], FG)
            elif p < 1:
                s.put(22 + k, 4, scramble(real[k], p, int(lt * 20) + k), RED)
            else:
                s.put(22 + k, 4, red[k], RED)
        s.put(24, 4, '"items": 3', FG)
        s.put(25, 2, '}', FG)
    if lt > 9.2:
        s.put(28, 0, 'un solo sitio para auth, límites, redacción y trazas.', WHITE)


def s_omni(s, lt):
    s.header('05', '5.000 tools no caben en un prompt', lt)
    s.put(3, 0, 'cargar todos los schemas de golpe:', FG)
    n = int(min(5000, max(0, lt - 0.6) * 2600))
    BARW = 56
    fill = min(BARW, int(n / 3200 * BARW))
    over = n > 3200
    s.put(5, 0, 'contexto [', DIM)
    s.put(5, 10, '█' * fill + '░' * (BARW - fill), RED if over else AMBER)
    s.put(5, 10 + BARW, ']', DIM)
    s.put(6, 10, f'{n:>5} tools cargadas', FG)
    if over and int(lt * 4) % 2 == 0:
        s.put(6, 36, '✗ context window agotada', RED)
    if lt > 3.2:
        s.put(9, 0, 'Omni MCP: un único proxy con 4 tools, descubrimiento paso a paso', WHITE)
    steps = [
        ('discover_server', '("¿dónde está mi pedido?")', '→ eats-orders'),
        ('discover_tools ', '("eats-orders")', '→ 9 tools'),
        ('get_tool_schema', '("get_order_status")', '→ 1 schema'),
        ('invoke_tool    ', '("get_order_status", {…})', '→ ✓'),
    ]
    for i, (fn, arg, res) in enumerate(steps):
        t = 4.0 + i * 0.9
        if lt > t:
            s.put(11 + i, 2, f'{i + 1}.', DIM)
            s.put(11 + i, 5, fn, CYAN)
            s.typed(11 + i, 20, arg, lt, t, 60, FG, cursor=False)
            if lt > t + 0.55:
                s.put(11 + i, 20 + len(arg) + 1, res, GREEN)
    if lt > 7.8:
        s.put(17, 0, 'contexto [', DIM)
        s.put(17, 10, '███' + '░' * (BARW - 3), GREEN)
        s.put(17, 10 + BARW, ']', DIM)
        s.put(18, 10, 'solo lo que la tarea necesita', FG)
    if lt > 9.0:
        s.put(21, 0, 'Response Projection: estilo GraphQL para respuestas MCP', WHITE)
        s.put(22, 0, 'el agente pide campos concretos y el gateway recorta el resto:', DIM)
    if lt > 9.8:
        s.put(24, 2, '"_fields": ["status", "eta_min"]', AMBER)
        fields = ['"order_id"', '"status"', '"eta_min"', '"courier"', '"items"', '"history"', '"fees"']
        keep = {'"status"', '"eta_min"'}
        p = ease((lt - 10.6) / 1.0)
        c = 2
        for f in fields:
            k = f in keep
            if not k and p >= 1:
                continue
            col = GREEN if k else (RED if lt > 10.6 else FG)
            txt = f if k or p < 0.5 else '·' * len(f)
            s.put(26, c, txt, col)
            c += len(txt) + 1
        if lt > 11.8:
            s.put(27, 2, 'menos tokens de vuelta, misma respuesta útil', FG)


def count(lt, t0, target, dur=1.4):
    return int(ease((lt - t0) / dur) * target)


def s_numbers(s, lt):
    s.header('06', 'en producción', lt)
    stats = [(800, 'servidores MCP'), (5000, 'tools'), (10000, 'servicios detrás')]
    for i, (target, label) in enumerate(stats):
        t0 = 0.4 + i * 0.6
        if lt < t0:
            continue
        v = count(lt, t0, target)
        big = pyfiglet.figlet_format(f'{v:,}'.replace(',', '.'), font='ansi_regular').rstrip('\n').split('\n')
        for k, line in enumerate(big[:5]):
            s.put(3 + i * 6 + k, 1, line, GREEN)
        s.put(5 + i * 6, 46, '+ ' + label, WHITE)
    if lt > 4.2:
        s.put(21, 0, 'lo que me llevo:', AMBER)
    takeaways = [
        '1. centraliza: un gateway, no 800 implementaciones de auth',
        '2. seguro por defecto: lo descubierto nace apagado',
        '3. el contexto es escaso: descubre poco a poco, recorta',
        '4. genera tools desde los contratos (IDL) que ya tienes',
    ]
    for i, tk in enumerate(takeaways):
        s.typed(23 + i, 2, tk, lt, 4.6 + i * 1.0, 60, FG, cursor=False)


def s_outro(s, lt):
    s.center(10, 'fuente', DIM)
    s.center(12, 'uber.com/blog/designing-mcp-gateway', WHITE)
    s.center(14, 'Designing MCP Gateway: Uber\'s MCP Management Platform', DIM)
    s.center(15, 'Uber Engineering · 1 oct 2026', DIM)
    s.prompt(19, 'exit', lt, 1.6)
    if lt > 2.6:
        s.put(20, 0, '[proceso completado]', DIM)


SCENES = [
    (8.5, s_intro),
    (10.5, s_problem),
    (11.5, s_arch),
    (10.5, s_crawl),
    (10.8, s_call),
    (13.5, s_omni),
    (10.0, s_numbers),
    (4.5, s_outro),
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
    title = 'txnio@inicio: ~/uber-mcp-gateway — zsh — 72×31'
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
    x0, y0 = GX + c * CW, GY + r * LH - 3
    x1, y1 = x0 + CW, y0 + LH
    mx, my = x0 + CW / 2, y0 + LH / 2
    if chx == '█':
        d.rectangle([x0, y0, x1, y1], fill=col)
    elif chx == '░':
        d.rectangle([x0 + 1, y0 + 6, x1 - 1, y1 - 6], fill=tuple(int(v * 0.22) for v in col))
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
        d.text((x0, y0 + 3), chx, font=font, fill=col)


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
    glow = np.asarray(layer.filter(ImageFilter.GaussianBlur(7))).astype(np.float32)
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
        times = [7.5, 18.5, 30, 40, 50.5, 62, 74, 78.5, 3]
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

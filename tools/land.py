#!/usr/bin/env python3
"""Rasteriza os polígonos de terra do Natural Earth e amostra a esfera em anéis de latitude.
Saída: bitset em base64 onde bit i == 1 significa que a amostra i cai em terra firme.
uso: land.py <geojson> <R aneis> [W] [H] [saida.json]
O JS reconstrói as posições pelo mesmo algoritmo (R anéis, pontos por anel = int(2π·cos(lat)/ds + .5)).
"""
import json, math, base64, sys, time

src = sys.argv[1]
R = int(sys.argv[2]) if len(sys.argv) > 2 else 180
W = int(sys.argv[3]) if len(sys.argv) > 3 else 2880
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1440
out = sys.argv[5] if len(sys.argv) > 5 else 'land.json'

t0 = time.time()
d = json.load(open(src))
grid = bytearray(W * H)

def polys(geom):
    if geom['type'] == 'Polygon':
        yield geom['coordinates']
    elif geom['type'] == 'MultiPolygon':
        yield from geom['coordinates']

for f in d['features']:
    for poly in polys(f['geometry']):
        rows = {}
        for ring in poly:                      # preenchimento par-ímpar: trata buracos
            n = len(ring)
            for k in range(n):
                x0, y0 = ring[k]; x1, y1 = ring[(k + 1) % n]
                if y0 == y1: continue
                if y0 > y1: x0, y0, x1, y1 = x1, y1, x0, y0
                jmin = max(0, math.ceil((90 - y1) * H / 180 - 0.5))
                jmax = min(H - 1, math.floor((90 - y0) * H / 180 - 0.5))
                for j in range(jmin, jmax + 1):
                    lat = 90 - (j + 0.5) * 180 / H
                    if not (y0 <= lat < y1): continue
                    rows.setdefault(j, []).append(x0 + (x1 - x0) * (lat - y0) / (y1 - y0))
        for j, xs in rows.items():
            xs.sort()
            for a, b in zip(xs[0::2], xs[1::2]):
                ia = max(0, math.ceil((a + 180) * W / 360 - 0.5)); ib = min(W - 1, math.floor((b + 180) * W / 360 - 0.5))
                if ib >= ia: grid[j * W + ia: j * W + ib + 1] = b'\x01' * (ib - ia + 1)

# anéis de latitude, espaçamento ds igual em latitude e longitude; anéis ímpares deslocados meio passo
ds = math.pi / R
counts = [max(1, int(2 * math.pi * math.cos(-math.pi / 2 + (j + 0.5) * math.pi / R) / ds + 0.5)) for j in range(R)]
N = sum(counts)
bits = bytearray((N + 7) // 8)
i = land = 0
for j in range(R):
    lat = -math.pi / 2 + (j + 0.5) * math.pi / R
    n = counts[j]; off = 0.5 if j % 2 else 0.0
    gj = min(H - 1, max(0, int((90 - math.degrees(lat)) * H / 180)))
    for k in range(n):
        lon = (k + off) * 2 * math.pi / n - math.pi
        gk = min(W - 1, max(0, int((math.degrees(lon) + 180) * W / 360)))
        if grid[gj * W + gk]:
            bits[i >> 3] |= 1 << (i & 7); land += 1
        i += 1
b64 = base64.b64encode(bytes(bits)).decode()
sys.stderr.write(f"R={R} N={N} terra={land} ({100*land/N:.1f}%) base64={len(b64)} chars em {time.time()-t0:.2f}s\n")
json.dump({'mode': 'rings', 'R': R, 'N': N, 'land': land, 'bits': b64}, open(out, 'w'))

#!/usr/bin/env python3
"""
Generates the site icons from the brand mark.

The repository shipped with create-next-app's default favicon — the Vercel
triangle — which is what browser tabs showed in production. There is no image
library available on this machine (no Pillow, no ImageMagick, no rsvg), so the
icon is drawn here directly into a pixel buffer and encoded with zlib, which is
in the standard library.

Colours are sampled from public/logo.jpg rather than guessed: #EA5F2E for the
arc, #3A3A3C for the wordmark.

The glyph is an "A" built from two diagonal strokes and a crossbar, drawn with
distance-to-segment tests and 4x supersampling for the anti-aliasing. A
letterform beats the full wordmark here: "ANADYON RENTALS" is 295x108 and
becomes unreadable mush at the 16px a browser tab actually renders.

Run:  python3 scripts/make-favicon.py
"""
import struct, zlib, math, os

ORANGE   = (0xEA, 0x5F, 0x2E)
WHITE    = (0xFF, 0xFF, 0xFF)
SS       = 4          # supersampling factor
CORNER   = 0.18       # corner radius as a fraction of the icon size


def dist_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)


def coverage(size):
    """Alpha + colour for every pixel, resolved at SS x SS then averaged."""
    N = size * SS
    r = CORNER * N
    # Geometry of the A, in supersampled pixel units.
    m       = N * 0.20          # margin
    apex_x  = N / 2.0
    apex_y  = m
    foot_y  = N - m
    foot_dx = N * 0.275         # half the distance between the feet
    stroke  = N * 0.092         # half stroke width
    # The crossbar sits low. Placed halfway up, the strokes have converged so
    # far that the counter — the triangular hole — closes to a speck and the
    # glyph reads as a solid blob at tab size.
    bar_y   = foot_y - (foot_y - apex_y) * 0.20
    bar_hw  = N * 0.150
    bar_hh  = stroke * 0.80

    out = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px * SS + sx + 0.5
                    y = py * SS + sy + 0.5
                    # rounded-square mask
                    cx = min(max(x, r), N - r)
                    cy = min(max(y, r), N - r)
                    if math.hypot(x - cx, y - cy) > r:
                        continue
                    # the glyph: left stroke, right stroke, crossbar
                    inA = (
                        dist_to_segment(x, y, apex_x, apex_y, apex_x - foot_dx, foot_y) <= stroke
                        or dist_to_segment(x, y, apex_x, apex_y, apex_x + foot_dx, foot_y) <= stroke
                        or (abs(x - apex_x) <= bar_hw and abs(y - bar_y) <= bar_hh)
                    )
                    hits += 2 if inA else 1      # 2 = glyph, 1 = plate
            if hits == 0:
                continue
            total = SS * SS
            # Split the tally back into plate and glyph coverage.
            plate = min(1.0, hits / total)
            glyph = max(0.0, (hits - total) / total) if hits > total else 0.0
            glyph = min(glyph, 1.0)
            col = tuple(round(ORANGE[i] * (1 - glyph) + WHITE[i] * glyph) for i in range(3))
            i = (py * size + px) * 4
            out[i:i+4] = bytes((col[0], col[1], col[2], round(255 * plate)))
    return bytes(out)


def png(size, rgba):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + rgba[y*size*4:(y+1)*size*4] for y in range(size))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def ico(images):
    """images: [(size, png_bytes)] — ICO stores 256 as 0."""
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for size, blob in images:
        d = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", d, d, 0, 0, 1, 32, len(blob), offset)
        blobs += blob
        offset += len(blob)
    return head + entries + blobs


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pngs = {s: png(s, coverage(s)) for s in (16, 32, 48, 64, 128, 180, 256)}

    with open(os.path.join(root, "app", "favicon.ico"), "wb") as f:
        f.write(ico([(s, pngs[s]) for s in (16, 32, 48, 64, 128, 256)]))
    with open(os.path.join(root, "app", "apple-icon.png"), "wb") as f:
        f.write(pngs[180])          # iOS home-screen tile
    with open(os.path.join(root, "app", "icon.png"), "wb") as f:
        f.write(pngs[256])

    for name in ("app/favicon.ico", "app/apple-icon.png", "app/icon.png"):
        p = os.path.join(root, name)
        print(f"  {name:<24} {os.path.getsize(p):>7} bytes")

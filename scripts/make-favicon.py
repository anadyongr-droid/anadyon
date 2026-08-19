#!/usr/bin/env python3
"""
Builds the site icons from public/logo.jpg.

The repository shipped with create-next-app's Vercel triangle, so browser tabs
showed another company's mark. This renders the real wordmark instead.

There is no image library on this machine — no Pillow, no ImageMagick, no rsvg
— so the pipeline is: sips converts the JPEG to an uncompressed BMP (trivial to
parse), this script trims, resamples and composites, and zlib from the standard
library encodes the PNGs. The ICO container is assembled by hand.

A caveat recorded deliberately, because it is a real trade-off the owner
accepted rather than an oversight: the wordmark is about 3:1, and a browser tab
renders its icon at 16x16. Fitted to a square by width, "ANADYON RENTALS"
occupies roughly five pixels of height, which is under two pixels per letter —
at that size it reads as a smudge rather than as text. It is legible from 48px
up, which covers bookmarks bars, history entries, the iOS home screen and
hi-DPI tab strips on some platforms.

Two things are done to give it the best chance:

  * The source is trimmed to its ink bounds first. logo.jpg carries 61px of
    horizontal and 40px of vertical white margin, and rendering that margin
    wastes roughly a quarter of the pixels available at tab size.
  * Every size is box-resampled from the full-resolution original rather than
    from a smaller intermediate, so no size compounds another's blur.

Run:  python3 scripts/make-favicon.py
"""
import os
import struct
import subprocess
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "public", "logo.jpg")

# Anything at least this bright on every channel counts as the logo's ground.
WHITE_CUTOFF = 242
GROUND = (255, 255, 255)

SIZES = (16, 32, 48, 64, 128, 180, 256)
ICO_SIZES = (16, 32, 48, 64, 128, 256)


def load_bmp(path):
    """Returns (width, height, rows) with rows[y][x] = (r, g, b)."""
    d = open(path, "rb").read()
    offset = struct.unpack_from("<I", d, 10)[0]
    w, h = struct.unpack_from("<ii", d, 18)
    bpp = struct.unpack_from("<H", d, 28)[0]
    if bpp not in (24, 32):
        sys.exit(f"unexpected BMP depth: {bpp}bpp")
    top_down = h < 0
    h = abs(h)
    stride = (w * bpp // 8 + 3) // 4 * 4
    step = bpp // 8
    rows = []
    for y in range(h):
        src_y = y if top_down else h - 1 - y
        base = offset + src_y * stride
        rows.append([
            (d[base + x * step + 2], d[base + x * step + 1], d[base + x * step])
            for x in range(w)
        ])
    return w, h, rows


def trim(w, h, rows):
    """Crops the surrounding white margin so the mark fills the frame."""
    def ink(c):
        return not (c[0] > WHITE_CUTOFF and c[1] > WHITE_CUTOFF and c[2] > WHITE_CUTOFF)

    xs = [x for x in range(w) if any(ink(rows[y][x]) for y in range(h))]
    ys = [y for y in range(h) if any(ink(rows[y][x]) for x in range(w))]
    if not xs or not ys:
        return w, h, rows
    x0, x1, y0, y1 = xs[0], xs[-1], ys[0], ys[-1]
    cropped = [row[x0:x1 + 1] for row in rows[y0:y1 + 1]]
    return x1 - x0 + 1, y1 - y0 + 1, cropped


def box_resize(rows, sw, sh, tw, th):
    """Area-average downscale. Every target pixel averages the source pixels it
    covers, which is what keeps small sizes from turning to noise."""
    out = []
    for ty in range(th):
        y0, y1 = ty * sh // th, max(ty * sh // th + 1, (ty + 1) * sh // th)
        line = []
        for tx in range(tw):
            x0, x1 = tx * sw // tw, max(tx * sw // tw + 1, (tx + 1) * sw // tw)
            r = g = b = n = 0
            for y in range(y0, y1):
                for x in range(x0, x1):
                    c = rows[y][x]
                    r += c[0]; g += c[1]; b += c[2]; n += 1
            line.append((r // n, g // n, b // n))
        out.append(line)
    return out


def square(size, sw, sh, rows):
    """Fits the mark by width and centres it vertically on the logo's ground."""
    tw = size
    th = max(1, round(size * sh / sw))
    if th > size:                      # taller than wide: fit by height instead
        th = size
        tw = max(1, round(size * sw / sh))
    small = box_resize(rows, sw, sh, tw, th)
    canvas = [[GROUND] * size for _ in range(size)]
    top = (size - th) // 2
    left = (size - tw) // 2
    for y in range(th):
        for x in range(tw):
            canvas[top + y][left + x] = small[y][x]
    return canvas


def png(size, canvas):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    raw = b"".join(
        b"\x00" + bytes(v for p in canvas[y] for v in (p[0], p[1], p[2], 255))
        for y in range(size)
    )
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def ico(images):
    """images: [(size, png_bytes)]. ICO records 256 as 0."""
    head = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = blobs = b""
    for size, blob in images:
        d = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", d, d, 0, 0, 1, 32, len(blob), offset)
        blobs += blob
        offset += len(blob)
    return head + entries + blobs


def main():
    if not os.path.exists(SOURCE):
        sys.exit(f"missing {SOURCE}")

    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, "logo.bmp")
        subprocess.run(["sips", "-s", "format", "bmp", SOURCE, "--out", bmp],
                       capture_output=True, check=True)
        w, h, rows = load_bmp(bmp)

    tw, th, trimmed = trim(w, h, rows)
    print(f"  source {w}x{h} → trimmed {tw}x{th} (aspect {tw / th:.2f}:1)")

    pngs = {s: png(s, square(s, tw, th, trimmed)) for s in SIZES}

    with open(os.path.join(ROOT, "app", "favicon.ico"), "wb") as f:
        f.write(ico([(s, pngs[s]) for s in ICO_SIZES]))
    with open(os.path.join(ROOT, "app", "apple-icon.png"), "wb") as f:
        f.write(pngs[180])

    # Deliberately no app/icon.png. Next.js emits a <link> for it declaring a
    # single 256x256 size, and a browser that prefers PNG would take that and
    # downscale it to 16 or 32 itself — throwing away the entries in the ICO
    # that were resampled for exactly those sizes. With only favicon.ico
    # present, the browser picks from the six sizes inside it. That matters
    # more than usual here: the mark is a 3:1 wordmark, and at tab size every
    # pixel of sharpness is the difference between a logo and a smudge.

    for name in ("app/favicon.ico", "app/apple-icon.png"):
        p = os.path.join(ROOT, name)
        print(f"  {name:<24} {os.path.getsize(p):>7} bytes")


if __name__ == "__main__":
    main()

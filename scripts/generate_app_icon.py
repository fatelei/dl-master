from pathlib import Path
import math
import struct
import zlib


SIZE = 1024
OUT = Path(__file__).resolve().parents[1] / "app-icon.png"


def clamp(value: float) -> int:
    return max(0, min(255, round(value)))


def rgba_at(x: int, y: int) -> tuple[int, int, int, int]:
    cx = x - SIZE / 2
    cy = y - SIZE / 2
    radius = math.hypot(cx, cy) / (SIZE / 2)

    # macOS-style rounded squircle mask.
    nx = abs(cx) / (SIZE / 2)
    ny = abs(cy) / (SIZE / 2)
    squircle = (nx**4 + ny**4) ** 0.25
    if squircle > 0.93:
        return 0, 0, 0, 0

    t = (x * 0.65 + y * 0.35) / SIZE
    r = 0 + 25 * t
    g = 74 + 72 * t
    b = 198 + 38 * (1 - t)

    # Subtle inner glow.
    glow = max(0.0, 1.0 - radius) * 48
    r += glow
    g += glow
    b += glow

    # White download arrow and tray.
    stem = 462 <= x <= 562 and 250 <= y <= 560
    arrow = 360 <= x <= 664 and 520 <= y <= 710 and abs(x - 512) <= (y - 500) * 0.78
    tray = 300 <= x <= 724 and 724 <= y <= 798
    tray_cutout = 350 <= x <= 674 and 724 <= y <= 746

    # Two small segmented "queue" bars make the mark specific to a download manager.
    bar_one = 280 <= x <= 394 and 318 <= y <= 370
    bar_two = 630 <= x <= 744 and 318 <= y <= 370
    if stem or arrow or tray or bar_one or bar_two:
        if tray_cutout and not (stem or arrow):
            return clamp(r), clamp(g), clamp(b), 255
        return 255, 255, 255, 255

    # Darker lower edge for depth.
    if y > 770 and squircle < 0.88:
        r *= 0.86
        g *= 0.86
        b *= 0.9

    return clamp(r), clamp(g), clamp(b), 255


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_png(path: Path) -> None:
    rows = []
    for y in range(SIZE):
        row = bytearray([0])
        for x in range(SIZE):
            row.extend(rgba_at(x, y))
        rows.append(bytes(row))

    raw = b"".join(rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


if __name__ == "__main__":
    write_png(OUT)
    print(OUT)
